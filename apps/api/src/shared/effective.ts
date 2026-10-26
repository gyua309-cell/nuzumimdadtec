import { HttpStatus } from '@nestjs/common';
import { DbService } from '../infrastructure/db/db.service';
import { DomainError, NotFoundError } from './errors';

/**
 * Generic effective-dated "version series" operations.
 *
 * A series is identified by a set of key columns (e.g. employee_id, or
 * employee_id + component_id). Rows in a series never overlap (EXCLUDE
 * constraints) and history inside CLOSED periods is frozen by the DB trigger
 * core.trg_effective_history_guard – this helper never edits history, it only:
 *   - supersedes: ends the current version the day before and inserts a new one
 *   - ends: sets effective_to on the open/current version
 *   - removes the latest version (correction) and re-opens the previous one
 * Identifiers (table/columns) always come from code, values are bound params.
 */
export interface SeriesRef {
  table: string;
  companyId: string;
  keys: Record<string, unknown>;
}

function where(ref: SeriesRef, startAt = 1): { sql: string; params: unknown[] } {
  const params: unknown[] = [ref.companyId];
  const parts = [`company_id = $${startAt}`];
  for (const [col, val] of Object.entries(ref.keys)) {
    if (val === null) {
      parts.push(`${col} IS NULL`);
      continue;
    }
    params.push(val);
    parts.push(`${col} = $${startAt + params.length - 1}`);
  }
  return { sql: parts.join(' AND '), params };
}

export const dayBefore = (iso: string): string => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
export const dayAfter = (iso: string): string => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export async function supersede(
  db: DbService,
  ref: SeriesRef,
  effectiveFrom: string,
  values: Record<string, unknown>,
  effectiveTo: string | null = null,
): Promise<string> {
  return db.tx(async () => {
    const w = where(ref);
    const latest = await db.one<{ max: string | null }>(`SELECT max(effective_from)::text AS max FROM ${ref.table} WHERE ${w.sql}`, w.params);
    if (latest?.max && latest.max >= effectiveFrom) {
      throw new DomainError(
        'EFFECTIVE_DATE_NOT_AFTER_CURRENT',
        `New version must start after the latest version (${latest.max})`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { latestEffectiveFrom: latest.max },
      );
    }
    if (effectiveTo && effectiveTo < effectiveFrom) throw new DomainError('INVALID_DATE_RANGE', 'effectiveTo before effectiveFrom');
    // end the version that is still valid on/after the new start
    const w2 = where(ref, 2);
    await db.query(
      `UPDATE ${ref.table} SET effective_to = $1::date - 1, updated_by = sys.current_user_id()
        WHERE ${w2.sql} AND (effective_to IS NULL OR effective_to >= $1::date)`,
      [effectiveFrom, ...w2.params],
    );
    const cols = ['company_id', ...Object.keys(ref.keys), ...Object.keys(values), 'effective_from', 'effective_to'];
    const params = [ref.companyId, ...Object.values(ref.keys), ...Object.values(values), effectiveFrom, effectiveTo];
    const row = await db.one<{ id: string }>(
      `INSERT INTO ${ref.table} (${cols.join(', ')}, created_by, updated_by)
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
      params,
    );
    return row!.id;
  });
}

/** Ends the version valid on `effectiveTo` (inclusive last day). Later versions must not exist. */
export async function endSeries(db: DbService, ref: SeriesRef, effectiveTo: string): Promise<void> {
  await db.tx(async () => {
    const w = where(ref, 2);
    const future = await db.one(`SELECT 1 FROM ${ref.table} WHERE ${w.sql} AND effective_from > $1::date LIMIT 1`, [effectiveTo, ...w.params]);
    if (future) throw new DomainError('FUTURE_VERSION_EXISTS', 'A later version exists; remove it first');
    const r = await db.query(
      `UPDATE ${ref.table} SET effective_to = $1::date, updated_by = sys.current_user_id()
        WHERE ${w.sql} AND effective_from <= $1::date AND (effective_to IS NULL OR effective_to > $1::date) RETURNING id`,
      [effectiveTo, ...w.params],
    );
    if (r.length === 0) throw new DomainError('NO_OPEN_VERSION', 'No version is valid on this date');
  });
}

/** Removes the latest version (correction) and re-opens the previous one when contiguous. */
export async function removeLatest(db: DbService, ref: SeriesRef, id: string): Promise<void> {
  await db.tx(async () => {
    const w = where(ref, 2);
    const row = await db.one<{ effective_from: string; is_latest: boolean }>(
      `SELECT effective_from,
              effective_from = (SELECT max(effective_from) FROM ${ref.table} WHERE ${w.sql}) AS is_latest
         FROM ${ref.table} WHERE id = $1 AND ${w.sql}`,
      [id, ...w.params],
    );
    if (!row) throw new NotFoundError('Version', id);
    if (!row.is_latest) throw new DomainError('ONLY_LATEST_VERSION_REMOVABLE', 'Only the latest version can be removed');
    await db.query(`DELETE FROM ${ref.table} WHERE id = $1`, [id]);
    await db.query(
      `UPDATE ${ref.table} SET effective_to = NULL, updated_by = sys.current_user_id()
        WHERE ${w.sql} AND effective_to = $1::date - 1`,
      [row.effective_from, ...w.params],
    );
  });
}
