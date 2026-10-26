import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { dayAfter, dayBefore } from '../../../shared/effective';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { isoDate, ListQuery, nonNegativeDecimal, offset, orderBy, Page } from '../../../shared/http/common';

export const PricingBasis = z.enum(['MONTHLY', 'DAILY', 'HOURLY']);
export const PriceCreate = z
  .object({
    employeeId: z.string().uuid(),
    /** NULL = employee default price; set = project override price */
    projectId: z.string().uuid().nullable().optional(),
    pricingBasis: PricingBasis,
    price: nonNegativeDecimal,
    currencyCode: z.string().trim().length(3).toUpperCase(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, { message: 'effectiveTo must not be before effectiveFrom', path: ['effectiveTo'] });
export const PriceEnd = z.object({ effectiveTo: isoDate });

const SELECT = `
  s.id, s.employee_id AS "employeeId", e.code AS "employeeCode", e.full_name_ar AS "employeeNameAr",
  s.project_id AS "projectId", p.code AS "projectCode", p.name_ar AS "projectNameAr",
  CASE WHEN s.project_id IS NULL THEN 'DEFAULT' ELSE 'PROJECT_OVERRIDE' END AS "scope",
  s.pricing_basis AS "pricingBasis", s.price, s.currency_code AS "currencyCode",
  s.effective_from::text AS "effectiveFrom", s.effective_to::text AS "effectiveTo", s.reason,
  s.created_at AS "createdAt", s.row_version AS "rowVersion"`;
const FROM = `prj.service_prices s JOIN hr.employees e ON e.id = s.employee_id LEFT JOIN prj.projects p ON p.id = s.project_id`;

export interface ResolvedPrice {
  id: string;
  scope: 'DEFAULT' | 'PROJECT_OVERRIDE';
  pricingBasis: 'MONTHLY' | 'DAILY' | 'HOURLY';
  price: string;
  currencyCode: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Service pricing. Every employee has a default price (monthly / daily /
 * hourly, in a currency). A project override price, when valid on the date,
 * replaces the default for that project. Versions of a price never overlap
 * (database exclusion constraint); a new version ends the previous one, and a
 * back-dated version is allowed only where no other version exists (this is
 * what produces retroactive revenue later – posted history is never rewritten).
 */
@Injectable()
export class PricingService {
  constructor(private readonly db: DbService) {}

  async list(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['s.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(e.code ILIKE $${params.length} OR e.full_name_ar ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
    }
    if (q.employeeId) {
      params.push(q.employeeId);
      where.push(`s.employee_id = $${params.length}`);
    }
    if (q.projectId) {
      params.push(q.projectId);
      where.push(`s.project_id = $${params.length}`);
    }
    if (q.scope === 'DEFAULT') where.push('s.project_id IS NULL');
    if (q.scope === 'PROJECT_OVERRIDE') where.push('s.project_id IS NOT NULL');
    if (q.asOf) {
      params.push(q.asOf);
      where.push(`s.effective_from <= $${params.length}::date AND (s.effective_to IS NULL OR s.effective_to >= $${params.length}::date)`);
    }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM ${FROM} WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT ${SELECT} FROM ${FROM} WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { employeeCode: 'e.code', effectiveFrom: 's.effective_from' }, 'e.code ASC, s.project_id NULLS FIRST, s.effective_from DESC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const r = await this.db.one(`SELECT ${SELECT} FROM ${FROM} WHERE s.company_id = $1 AND s.id = $2`, [companyId, id]);
    if (!r) throw new NotFoundError('ServicePrice', id);
    return r;
  }

  async create(companyId: string, body: z.infer<typeof PriceCreate>) {
    return this.db.tx(async () => {
      const emp = await this.db.one('SELECT 1 FROM hr.employees WHERE company_id = $1 AND id = $2', [companyId, body.employeeId]);
      if (!emp) throw new NotFoundError('Employee', body.employeeId);
      const projectId = body.projectId ?? null;
      if (projectId) {
        const p = await this.db.one('SELECT 1 FROM prj.projects WHERE company_id = $1 AND id = $2', [companyId, projectId]);
        if (!p) throw new NotFoundError('Project', projectId);
      }
      const series = await this.db.query<{ id: string; f: string; t: string | null }>(
        `SELECT id, effective_from::text AS f, effective_to::text AS t FROM prj.service_prices
          WHERE company_id = $1 AND employee_id = $2 AND project_id IS NOT DISTINCT FROM $3::uuid ORDER BY effective_from FOR UPDATE`,
        [companyId, body.employeeId, projectId],
      );
      const from = body.effectiveFrom;
      let to = body.effectiveTo ?? null;
      const containing = series.filter((r) => r.f <= from && (r.t === null || r.t >= from));
      const next = series.find((r) => r.f > from);
      const overlap = () => new DomainError('PRICE_OVERLAP', 'Price versions must not overlap; end the current version first');
      if (to === null) {
        if (containing.length === 0) {
          if (next) to = dayBefore(next.f); // back-fill a gap before the next version
        } else if (containing.length === 1 && containing[0].f < from && !next) {
          await this.db.query('UPDATE prj.service_prices SET effective_to = $2::date, updated_by = sys.current_user_id() WHERE id = $1', [containing[0].id, dayBefore(from)]);
        } else {
          throw overlap();
        }
      } else if (containing.length > 0 || (next && next.f <= to)) {
        throw overlap();
      }
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO prj.service_prices (company_id, employee_id, project_id, pricing_basis, price, currency_code, effective_from, effective_to, reason, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [companyId, body.employeeId, projectId, body.pricingBasis, body.price, body.currencyCode, from, to, body.reason],
      );
      return this.get(companyId, row!.id);
    });
  }

  async end(companyId: string, id: string, input: z.infer<typeof PriceEnd>) {
    return this.db.tx(async () => {
      const r = await this.db.one<{ effective_from: string; effective_to: string | null }>(
        'SELECT effective_from::text, effective_to::text FROM prj.service_prices WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!r) throw new NotFoundError('ServicePrice', id);
      if (input.effectiveTo < r.effective_from) throw new DomainError('INVALID_DATE_RANGE', 'End date is before the start');
      if (r.effective_to && input.effectiveTo >= r.effective_to) throw new DomainError('INVALID_DATE_RANGE', 'End date must shorten the version');
      await this.db.query('SELECT core.assert_dates_open($1, $2::date, $3::date)', [companyId, dayAfter(input.effectiveTo), r.effective_to]);
      await this.db.query('UPDATE prj.service_prices SET effective_to = $2::date, updated_by = sys.current_user_id() WHERE id = $1', [id, input.effectiveTo]);
      return this.get(companyId, id);
    });
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      const r = await this.db.one<{ effective_from: string; effective_to: string | null }>(
        'SELECT effective_from::text, effective_to::text FROM prj.service_prices WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!r) throw new NotFoundError('ServicePrice', id);
      await this.db.query('SELECT core.assert_dates_open($1, $2::date, $3::date)', [companyId, r.effective_from, r.effective_to]);
      await this.db.query('DELETE FROM prj.service_prices WHERE id = $1', [id]);
    });
  }

  /** The price that applies on a date: project override first, otherwise the employee default. */
  async resolve(companyId: string, employeeId: string, projectId: string | null, onDate: string): Promise<ResolvedPrice | null> {
    const rows = await this.db.query<ResolvedPrice>(
      `SELECT id, CASE WHEN project_id IS NULL THEN 'DEFAULT' ELSE 'PROJECT_OVERRIDE' END AS scope, pricing_basis AS "pricingBasis",
              price, currency_code AS "currencyCode", effective_from::text AS "effectiveFrom", effective_to::text AS "effectiveTo"
         FROM prj.service_prices
        WHERE company_id = $1 AND employee_id = $2 AND (project_id IS NULL OR project_id = $3::uuid)
          AND effective_from <= $4::date AND (effective_to IS NULL OR effective_to >= $4::date)
        ORDER BY (project_id IS NULL) ASC LIMIT 1`,
      [companyId, employeeId, projectId, onDate],
    );
    return rows[0] ?? null;
  }
}
