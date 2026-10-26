import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { env } from '../../config/env';
import { currentContext, txContext } from '../../shared/context';
import { mapPgError } from './pg-errors';

// numeric / bigint arrive as strings: never let money become a JS float
types.setTypeParser(types.builtins.NUMERIC, (v) => v);
types.setTypeParser(types.builtins.INT8, (v) => v);
// DATE as plain 'YYYY-MM-DD' string (no timezone shifting)
types.setTypeParser(types.builtins.DATE, (v) => v);

export type Queryable = Pick<PoolClient, 'query'>;

/**
 * Database access + Unit of Work.
 *
 * - `query()` uses the active transaction client when called inside `tx()`.
 * - `tx()` opens a transaction, sets the audit context (app.user_id, ip, device,
 *   request id, reason) as transaction-local settings consumed by DB triggers,
 *   and guarantees COMMIT or full ROLLBACK (Transaction Integrity).
 * - Nested `tx()` calls join the outer transaction.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.IDHAM_DB_URL_OVERRIDE ?? env().DATABASE_URL,
      max: env().DB_POOL_MAX,
      application_name: 'idham-api',
    });
    this.pool.on('error', (e) => this.logger.error(`pool error: ${e.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client: Queryable = txContext.getStore()?.client ?? this.pool;
    try {
      const r = await client.query<T>(sql, params as any[]);
      return r.rows;
    } catch (e) {
      throw mapPgError(e);
    }
  }

  async one<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  inTransaction(): boolean {
    return !!txContext.getStore();
  }

  /** Attach a reason to the current transaction (stored in the audit trail). */
  async setReason(reason: string): Promise<void> {
    const tx = txContext.getStore();
    if (!tx) throw new Error('setReason must be called inside a transaction');
    tx.reason = reason;
    await tx.client.query(`SELECT set_config('app.reason', $1, true)`, [reason]);
  }

  /** Register a callback that runs only after a successful COMMIT (e.g. cache invalidation). */
  afterCommit(fn: () => Promise<void> | void): void {
    const tx = txContext.getStore();
    if (!tx) {
      void fn();
      return;
    }
    tx.afterCommit.push(fn);
  }

  async tx<T>(work: () => Promise<T>, opts: { reason?: string; companyId?: string } = {}): Promise<T> {
    const existing = txContext.getStore();
    if (existing) {
      if (opts.reason) await this.setReason(opts.reason);
      return work();
    }
    const client = await this.pool.connect();
    const state = { client, reason: opts.reason, afterCommit: [] as Array<() => Promise<void> | void> };
    try {
      await client.query('BEGIN');
      const ctx = currentContext();
      await client.query(
        `SELECT set_config('app.user_id', $1, true), set_config('app.company_id', $2, true),
                set_config('app.ip', $3, true), set_config('app.device', $4, true),
                set_config('app.request_id', $5, true), set_config('app.reason', $6, true)`,
        [
          ctx?.userId ?? '',
          opts.companyId ?? ctx?.companyId ?? '',
          ctx?.ip ?? '',
          (ctx?.device ?? '').slice(0, 300),
          ctx?.requestId ?? '',
          opts.reason ?? '',
        ],
      );
      const result = await txContext.run(state, work);
      await client.query('COMMIT');
      for (const fn of state.afterCommit) {
        try {
          await fn();
        } catch (e) {
          this.logger.error(`afterCommit hook failed: ${(e as Error).message}`);
        }
      }
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw mapPgError(e);
    } finally {
      client.release();
    }
  }
}
