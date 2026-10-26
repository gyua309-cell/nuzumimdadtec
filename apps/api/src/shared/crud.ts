import { DbService } from '../infrastructure/db/db.service';
import { ConflictError, NotFoundError } from './errors';
import { ListQuery, offset, orderBy, Page } from './http/common';

/**
 * Small, whitelist-driven repository for simple master-data tables
 * (branches, cost centers, departments, ...). Identifiers come ONLY from the
 * static config – user input is always passed as bound parameters.
 */
export interface CrudConfig {
  entity: string;
  table: string;
  /** camelCase field -> snake_case column (all selectable fields) */
  columns: Record<string, string>;
  /** fields that may be written through create/update */
  writable: string[];
  searchColumns: string[];
  sortable: Record<string, string>;
  defaultSort: string;
  /** filters allowed via filter[field]=value (exact match) */
  filterable?: string[];
}

export class CrudRepository {
  constructor(
    protected readonly db: DbService,
    protected readonly cfg: CrudConfig,
  ) {}

  protected selectList(alias = 't'): string {
    return Object.entries(this.cfg.columns)
      .map(([field, col]) => `${alias}.${col} AS "${field}"`)
      .join(', ');
  }

  async list(companyId: string, q: ListQuery, filters: Record<string, unknown> = {}): Promise<Page<any>> {
    const where: string[] = ['t.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.q && this.cfg.searchColumns.length) {
      params.push(`%${q.q}%`);
      where.push(`(${this.cfg.searchColumns.map((c) => `t.${c} ILIKE $${params.length}`).join(' OR ')})`);
    }
    for (const f of this.cfg.filterable ?? []) {
      const v = filters[f];
      if (v === undefined || v === null || v === '') continue;
      params.push(v === 'true' ? true : v === 'false' ? false : v);
      where.push(`t.${this.cfg.columns[f]} = $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM ${this.cfg.table} t WHERE ${whereSql}`, params);
    const rows = await this.db.query(
      `SELECT ${this.selectList()} FROM ${this.cfg.table} t WHERE ${whereSql}
        ORDER BY ${orderBy(q.sort, this.cfg.sortable, this.cfg.defaultSort)}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string): Promise<any> {
    const row = await this.db.one(`SELECT ${this.selectList()} FROM ${this.cfg.table} t WHERE t.company_id = $1 AND t.id = $2`, [
      companyId,
      id,
    ]);
    if (!row) throw new NotFoundError(this.cfg.entity, id);
    return row;
  }

  async create(companyId: string, data: Record<string, unknown>): Promise<any> {
    return this.db.tx(async () => {
      const fields = this.cfg.writable.filter((f) => data[f] !== undefined);
      const cols = ['company_id', ...fields.map((f) => this.cfg.columns[f])];
      const params = [companyId, ...fields.map((f) => data[f])];
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO ${this.cfg.table} (${cols.join(', ')}, created_by, updated_by)
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        params,
      );
      return this.get(companyId, row!.id);
    });
  }

  async update(companyId: string, id: string, data: Record<string, unknown>, rowVersion?: number): Promise<any> {
    return this.db.tx(async () => {
      const fields = this.cfg.writable.filter((f) => data[f] !== undefined);
      if (fields.length === 0) return this.get(companyId, id);
      const params: unknown[] = [companyId, id];
      const sets = fields.map((f) => {
        params.push(data[f]);
        return `${this.cfg.columns[f]} = $${params.length}`;
      });
      let versionSql = '';
      if (rowVersion !== undefined) {
        params.push(rowVersion);
        versionSql = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(
        `UPDATE ${this.cfg.table} SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2${versionSql} RETURNING id`,
        params,
      );
      if (r.length === 0) {
        await this.get(companyId, id); // throws NotFound if missing
        throw new ConflictError('VERSION_CONFLICT');
      }
      return this.get(companyId, id);
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.db.tx(async () => {
      const r = await this.db.query(`DELETE FROM ${this.cfg.table} WHERE company_id = $1 AND id = $2 RETURNING id`, [companyId, id]);
      if (r.length === 0) throw new NotFoundError(this.cfg.entity, id);
    });
  }
}
