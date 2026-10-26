import { HttpStatus, Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';

export interface PeriodRow {
  id: string;
  companyId: string;
  fiscalYearId: string;
  periodNo: number;
  name: string;
  startDate: string;
  endDate: string;
  isAdjustmentPeriod: boolean;
  status: 'OPEN' | 'CLOSING' | 'CLOSED' | 'LOCKED';
}

const PERIOD_COLS = `p.id, p.company_id AS "companyId", p.fiscal_year_id AS "fiscalYearId", p.period_no AS "periodNo",
  p.name, p.start_date AS "startDate", p.end_date AS "endDate", p.is_adjustment_period AS "isAdjustmentPeriod",
  p.status, p.closed_at AS "closedAt", p.reopen_count AS "reopenCount"`;

function addMonths(isoDate: string, months: number): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class FiscalService {
  constructor(private readonly db: DbService) {}

  /** Creates a fiscal year with 12 monthly periods + adjustment period 13. */
  async createYear(companyId: string, code: string, startDate: string) {
    if (!/^\d{4}-\d{2}-01$/.test(startDate)) {
      throw new DomainError('FISCAL_YEAR_MUST_START_ON_FIRST_DAY', 'Fiscal year must start on the 1st day of a month');
    }
    return this.db.tx(async () => {
      const end = iso(new Date(addMonths(startDate, 12).getTime() - 86400_000));
      const overlap = await this.db.one(
        `SELECT 1 FROM core.fiscal_years WHERE company_id = $1 AND daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')`,
        [companyId, startDate, end],
      );
      if (overlap) throw new DomainError('FISCAL_YEAR_OVERLAP', undefined, HttpStatus.CONFLICT);

      const year = await this.db.one<{ id: string }>(
        `INSERT INTO core.fiscal_years(company_id, code, start_date, end_date, created_by, updated_by)
         VALUES ($1, $2, $3, $4, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [companyId, code, startDate, end],
      );
      for (let i = 0; i < 12; i++) {
        const ps = addMonths(startDate, i);
        const pe = new Date(addMonths(startDate, i + 1).getTime() - 86400_000);
        await this.db.query(
          `INSERT INTO core.fiscal_periods(company_id, fiscal_year_id, period_no, name, start_date, end_date,
                                           is_adjustment_period, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, false, sys.current_user_id(), sys.current_user_id())`,
          [companyId, year!.id, i + 1, `${code}-${String(i + 1).padStart(2, '0')}`, iso(ps), iso(pe)],
        );
      }
      await this.db.query(
        `INSERT INTO core.fiscal_periods(company_id, fiscal_year_id, period_no, name, start_date, end_date,
                                         is_adjustment_period, created_by, updated_by)
         VALUES ($1, $2, 13, $3, $4, $4, true, sys.current_user_id(), sys.current_user_id())`,
        [companyId, year!.id, `${code}-ADJ`, end],
      );
      return this.getYear(companyId, year!.id);
    });
  }

  async listYears(companyId: string) {
    return this.db.query(
      `SELECT id, code, start_date AS "startDate", end_date AS "endDate", status, closed_at AS "closedAt"
         FROM core.fiscal_years WHERE company_id = $1 ORDER BY start_date DESC`,
      [companyId],
    );
  }

  async getYear(companyId: string, id: string) {
    const y = await this.db.one(
      `SELECT id, code, start_date AS "startDate", end_date AS "endDate", status FROM core.fiscal_years
        WHERE company_id = $1 AND id = $2`,
      [companyId, id],
    );
    if (!y) throw new NotFoundError('FiscalYear', id);
    const periods = await this.db.query(
      `SELECT ${PERIOD_COLS} FROM core.fiscal_periods p WHERE p.company_id = $1 AND p.fiscal_year_id = $2 ORDER BY p.period_no`,
      [companyId, id],
    );
    return { ...y, periods };
  }

  async listPeriods(companyId: string, opts: { status?: string; fiscalYearId?: string } = {}): Promise<PeriodRow[]> {
    const params: unknown[] = [companyId];
    let where = 'p.company_id = $1';
    if (opts.status) {
      params.push(opts.status);
      where += ` AND p.status = $${params.length}`;
    }
    if (opts.fiscalYearId) {
      params.push(opts.fiscalYearId);
      where += ` AND p.fiscal_year_id = $${params.length}`;
    }
    return this.db.query(`SELECT ${PERIOD_COLS} FROM core.fiscal_periods p WHERE ${where} ORDER BY p.start_date, p.period_no`, params);
  }

  async getPeriod(companyId: string, id: string): Promise<PeriodRow> {
    const p = await this.db.one<PeriodRow>(`SELECT ${PERIOD_COLS} FROM core.fiscal_periods p WHERE p.company_id = $1 AND p.id = $2`, [
      companyId,
      id,
    ]);
    if (!p) throw new NotFoundError('FiscalPeriod', id);
    return p;
  }

  /** Regular (non-adjustment) period containing the date. */
  async periodForDate(companyId: string, date: string): Promise<PeriodRow> {
    const p = await this.db.one<PeriodRow>(
      `SELECT ${PERIOD_COLS} FROM core.fiscal_periods p
        WHERE p.company_id = $1 AND NOT p.is_adjustment_period AND $2::date BETWEEN p.start_date AND p.end_date`,
      [companyId, date],
    );
    if (!p) throw new DomainError('PERIOD_NOT_FOUND_FOR_DATE', `No fiscal period covers ${date}`);
    return p;
  }

  /** Status transition with history + audit (used by the closing module). */
  async changeStatus(companyId: string, periodId: string, newStatus: PeriodRow['status'], reason: string): Promise<PeriodRow> {
    return this.db.tx(async () => {
      const p = await this.db.one<PeriodRow>(
        `SELECT ${PERIOD_COLS} FROM core.fiscal_periods p WHERE p.company_id = $1 AND p.id = $2 FOR UPDATE`,
        [companyId, periodId],
      );
      if (!p) throw new NotFoundError('FiscalPeriod', periodId);
      await this.db.query(
        `UPDATE core.fiscal_periods SET status = $3,
                closed_at = CASE WHEN $3 IN ('CLOSED','LOCKED') THEN COALESCE(closed_at, now()) WHEN $3 = 'OPEN' THEN NULL ELSE closed_at END,
                closed_by = CASE WHEN $3 IN ('CLOSED','LOCKED') THEN sys.current_user_id() WHEN $3 = 'OPEN' THEN NULL ELSE closed_by END,
                reopen_count = reopen_count + CASE WHEN $3 = 'OPEN' AND $4 IN ('CLOSED','LOCKED') THEN 1 ELSE 0 END
          WHERE company_id = $1 AND id = $2`,
        [companyId, periodId, newStatus, p.status],
      );
      await this.db.query(
        `INSERT INTO core.period_status_history(period_id, old_status, new_status, reason, changed_by)
         VALUES ($1, $2, $3, $4, sys.current_user_id())`,
        [periodId, p.status, newStatus, reason],
      );
      return this.getPeriod(companyId, periodId);
    });
  }

  async statusHistory(companyId: string, periodId: string) {
    await this.getPeriod(companyId, periodId);
    return this.db.query(
      `SELECT h.id, h.old_status AS "oldStatus", h.new_status AS "newStatus", h.reason, h.changed_at AS "changedAt",
              u.full_name AS "changedBy"
         FROM core.period_status_history h LEFT JOIN iam.users u ON u.id = h.changed_by
        WHERE h.period_id = $1 ORDER BY h.changed_at DESC`,
      [periodId],
    );
  }
}
