import { HttpStatus, Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { FiscalService, PeriodRow } from '../../core/application/fiscal.service';
import { LedgerService } from './ledger.service';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';
export interface CheckResult {
  code: string;
  titleAr: string;
  status: CheckStatus;
  message?: string;
  details?: unknown;
}
export interface CloseCheck {
  code: string;
  titleAr: string;
  /** lower runs first */
  order: number;
  run(companyId: string, period: PeriodRow): Promise<Omit<CheckResult, 'code' | 'titleAr'>>;
}

/**
 * Registry of period-close validations. Each business module registers its own
 * checks (payroll posted, revenue run, depreciation, allocation reconciliation…).
 */
@Injectable()
export class CloseCheckRegistry {
  private readonly checks: CloseCheck[] = [];
  register(check: CloseCheck) {
    if (!this.checks.some((c) => c.code === check.code)) this.checks.push(check);
  }
  all(): CloseCheck[] {
    return [...this.checks].sort((a, b) => a.order - b.order);
  }
}

/**
 * Monthly closing: validations -> immutable hashed snapshot -> CLOSED.
 * Reopen requires permission + reason, only for the latest closed period.
 */
@Injectable()
export class ClosingService {
  constructor(
    private readonly db: DbService,
    private readonly fiscal: FiscalService,
    private readonly ledger: LedgerService,
    private readonly registry: CloseCheckRegistry,
  ) {
    registry.register({
      code: 'CV-01', titleAr: 'إقفال جميع الفترات السابقة', order: 10,
      run: async (companyId, p) => {
        const open = await this.db.query<{ name: string }>(
          `SELECT name FROM core.fiscal_periods WHERE company_id = $1 AND status NOT IN ('CLOSED','LOCKED')
              AND (start_date, period_no) < ($2::date, $3::smallint) ORDER BY start_date, period_no`,
          [companyId, p.startDate, p.periodNo],
        );
        return open.length ? { status: 'FAIL', message: 'توجد فترات سابقة غير مقفلة', details: open.map((o) => o.name) } : { status: 'PASS' };
      },
    });
    registry.register({
      code: 'CV-02', titleAr: 'لا توجد قيود مسودة', order: 20,
      run: async (companyId, p) => {
        const r = await this.db.one<{ n: string }>(
          `SELECT count(*) n FROM acc.journal_entries WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'DRAFT'`,
          [companyId, p.id],
        );
        return Number(r?.n) > 0 ? { status: 'FAIL', message: `يوجد ${r?.n} قيد مسودة`, details: { drafts: Number(r?.n) } } : { status: 'PASS' };
      },
    });
    registry.register({
      code: 'CV-03', titleAr: 'توازن ميزان المراجعة للفترة', order: 30,
      run: async (companyId, p) => {
        const r = await this.db.one<{ dr: string; cr: string }>(
          `SELECT COALESCE(SUM(debit_base),0) dr, COALESCE(SUM(credit_base),0) cr FROM acc.account_period_balances
            WHERE company_id = $1 AND period_id = $2`,
          [companyId, p.id],
        );
        return r?.dr === r?.cr ? { status: 'PASS', details: r } : { status: 'FAIL', message: 'ميزان المراجعة غير متوازن', details: r };
      },
    });
    registry.register({
      code: 'CV-04', titleAr: 'تطابق أرصدة الفترات مع سطور القيود', order: 40,
      run: async (companyId, p) => {
        const diffs = await this.ledger.reconcilePeriodBalances(companyId, p.id);
        return diffs.length ? { status: 'FAIL', message: 'اختلاف بين الأرصدة المجمعة والقيود', details: diffs } : { status: 'PASS' };
      },
    });
  }

  async runChecks(companyId: string, periodId: string): Promise<{ period: PeriodRow; results: CheckResult[]; canClose: boolean }> {
    const period = await this.fiscal.getPeriod(companyId, periodId);
    const results: CheckResult[] = [];
    for (const c of this.registry.all()) {
      try {
        const r = await c.run(companyId, period);
        results.push({ code: c.code, titleAr: c.titleAr, ...r });
      } catch (e) {
        results.push({ code: c.code, titleAr: c.titleAr, status: 'FAIL', message: (e as Error).message });
      }
    }
    return { period, results, canClose: results.every((r) => r.status !== 'FAIL') };
  }

  async close(companyId: string, periodId: string, reason?: string) {
    const why = reason?.trim() || 'إقفال الفترة';
    return this.db.tx(async () => {
      const locked = await this.db.one<{ status: string }>(
        'SELECT status FROM core.fiscal_periods WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, periodId],
      );
      if (!locked) throw new NotFoundError('FiscalPeriod', periodId);
      if (locked.status !== 'OPEN') throw new DomainError('PERIOD_NOT_OPEN', `Period is ${locked.status}`, HttpStatus.CONFLICT);
      const { period, results, canClose } = await this.runChecks(companyId, periodId);
      if (!canClose) {
        throw new DomainError('PERIOD_CLOSE_VALIDATION_FAILED', 'Close validation failed', HttpStatus.UNPROCESSABLE_ENTITY, results);
      }
      const snapshot = await this.buildSnapshot(companyId, period, results);
      const ver = await this.db.one<{ v: number }>(
        'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM rpt.period_snapshots WHERE period_id = $1',
        [periodId],
      );
      const snap = await this.db.one<{ id: string; data_hash: string; version: number }>(
        `INSERT INTO rpt.period_snapshots(company_id, period_id, version, kind, data, data_hash, reason, created_by)
         VALUES ($1,$2,$3,'PERIOD_CLOSE',$4,'',$5, sys.current_user_id()) RETURNING id, data_hash, version`,
        [companyId, periodId, ver!.v, JSON.stringify(snapshot), why],
      );
      const updated = await this.fiscal.changeStatus(companyId, periodId, 'CLOSED', why);
      await this.db.query(`SELECT audit.log_action('core','fiscal_periods',$1,'CLOSE',NULL,$2::jsonb,$3,$4)`, [
        periodId,
        JSON.stringify({ snapshotId: snap!.id, version: snap!.version, hash: snap!.data_hash }),
        why,
        period.name,
      ]);
      return { period: updated, snapshot: { id: snap!.id, version: snap!.version, hash: snap!.data_hash }, checks: results };
    }, { reason: why });
  }

  async reopen(companyId: string, periodId: string, reason: string) {
    if (!reason || reason.trim().length < 3) throw new DomainError('REASON_REQUIRED');
    return this.db.tx(async () => {
      const p = await this.db.one<{ status: string; start_date: string; period_no: number; name: string }>(
        'SELECT status, start_date, period_no, name FROM core.fiscal_periods WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, periodId],
      );
      if (!p) throw new NotFoundError('FiscalPeriod', periodId);
      if (p.status !== 'CLOSED') throw new DomainError('PERIOD_NOT_CLOSED', `Period is ${p.status}`, HttpStatus.CONFLICT);
      const later = await this.db.one<{ name: string }>(
        `SELECT name FROM core.fiscal_periods WHERE company_id = $1 AND status IN ('CLOSED','LOCKED')
            AND (start_date, period_no) > ($2::date, $3::smallint) LIMIT 1`,
        [companyId, p.start_date, p.period_no],
      );
      if (later) throw new DomainError('LATER_PERIOD_CLOSED', `Reopen ${later.name} first`, HttpStatus.CONFLICT);
      const year = await this.db.one<{ status: string }>(
        `SELECT y.status FROM core.fiscal_years y JOIN core.fiscal_periods fp ON fp.fiscal_year_id = y.id WHERE fp.id = $1`,
        [periodId],
      );
      if (year?.status === 'CLOSED') throw new DomainError('FISCAL_YEAR_CLOSED', 'Reopen the fiscal year first', HttpStatus.CONFLICT);
      const updated = await this.fiscal.changeStatus(companyId, periodId, 'OPEN', reason);
      await this.db.query(`SELECT audit.log_action('core','fiscal_periods',$1,'REOPEN',NULL,NULL,$2,$3)`, [periodId, reason, p.name]);
      return updated;
    }, { reason });
  }

  private async buildSnapshot(companyId: string, period: PeriodRow, checks: CheckResult[]) {
    const yearStart = await this.db.one<{ start_date: string }>('SELECT start_date FROM core.fiscal_years WHERE id = $1', [period.fiscalYearId]);
    const tbFin = await this.ledger.trialBalance(companyId, { from: period.startDate, to: period.endDate, ledger: 'FINANCIAL' });
    const tbMgmt = await this.ledger.trialBalance(companyId, { from: period.startDate, to: period.endDate, ledger: 'MANAGEMENT' });
    const isPeriod = await this.ledger.incomeStatement(companyId, { from: period.startDate, to: period.endDate });
    const isYtd = await this.ledger.incomeStatement(companyId, { from: yearStart!.start_date, to: period.endDate });
    const bs = await this.ledger.balanceSheet(companyId, period.endDate);
    const counts = await this.db.one(
      `SELECT count(*) FILTER (WHERE status = 'POSTED') AS posted, count(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
              COALESCE(SUM(total_debit_base) FILTER (WHERE status = 'POSTED'), 0) AS "postedTotal"
         FROM acc.journal_entries WHERE company_id = $1 AND fiscal_period_id = $2`,
      [companyId, period.id],
    );
    return {
      schemaVersion: 1,
      period: { id: period.id, name: period.name, startDate: period.startDate, endDate: period.endDate, periodNo: period.periodNo },
      takenAt: new Date().toISOString(),
      checks,
      journal: counts,
      trialBalance: { financial: tbFin, management: tbMgmt },
      incomeStatement: { period: isPeriod, yearToDate: isYtd },
      balanceSheet: bs,
    };
  }

  listSnapshots(companyId: string, periodId?: string) {
    const params: unknown[] = [companyId];
    let w = 's.company_id = $1';
    if (periodId) {
      params.push(periodId);
      w += ' AND s.period_id = $2';
    }
    return this.db.query(
      `SELECT s.id, s.period_id AS "periodId", p.name AS "periodName", s.version, s.kind, s.data_hash AS "dataHash", s.reason,
              s.created_at AS "createdAt", u.full_name AS "createdBy"
         FROM rpt.period_snapshots s JOIN core.fiscal_periods p ON p.id = s.period_id LEFT JOIN iam.users u ON u.id = s.created_by
        WHERE ${w} ORDER BY p.start_date DESC, s.version DESC`,
      params,
    );
  }

  async getSnapshot(companyId: string, id: string) {
    const s = await this.db.one(
      `SELECT s.id, s.period_id AS "periodId", s.version, s.kind, s.data, s.data_hash AS "dataHash", s.reason, s.created_at AS "createdAt",
              (encode(digest(s.data::text, 'sha256'), 'hex') = s.data_hash) AS "hashValid"
         FROM rpt.period_snapshots s WHERE s.company_id = $1 AND s.id = $2`,
      [companyId, id],
    );
    if (!s) throw new NotFoundError('Snapshot', id);
    return s;
  }
}
