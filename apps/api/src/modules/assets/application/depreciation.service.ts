import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { ListQuery, offset, Page } from '../../../shared/http/common';
import { D } from '../../../shared/money';
import { JournalService } from '../../accounting/application/journal.service';
import { PostingEngine, PostingItem } from '../../accounting/application/posting-engine';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';
import { FiscalService, PeriodRow } from '../../core/application/fiscal.service';
import { CustodyRange, depreciationSchedule, splitByCustody } from '../domain/depreciation';

export interface PlannedLine {
  assetId: string;
  assetNo: string;
  assetName: string;
  categoryId: string;
  branchId: string | null;
  costCenterId: string | null;
  employeeId: string | null;
  month: string;
  days: number;
  amountBase: string;
  accumulatedBase: string;
  netBookValueBase: string;
  isFinalMonth: boolean;
}

/**
 * Monthly depreciation run. For the selected period it posts every scheduled
 * month (<= period) that has not been posted yet (catch-up), split by custody
 * days into the employee dimension, through the posting engine (ASSET.DEPRECIATION).
 */
@Injectable()
export class DepreciationService {
  constructor(
    private readonly db: DbService,
    private readonly fx: ExchangeRateService,
    private readonly fiscal: FiscalService,
    private readonly posting: PostingEngine,
    private readonly journal: JournalService,
  ) {}

  private async regularPeriod(companyId: string, periodId: string): Promise<PeriodRow> {
    const p = await this.fiscal.getPeriod(companyId, periodId);
    if (p.isAdjustmentPeriod) throw new DomainError('ADJUSTMENT_PERIOD_NOT_ALLOWED');
    return p;
  }

  /** Lines due up to the period end that are not yet posted. */
  async plan(companyId: string, p: Pick<PeriodRow, 'startDate' | 'endDate'>): Promise<PlannedLine[]> {
    const base = await this.fx.baseCurrency(companyId);
    const periodMonth = `${p.startDate.slice(0, 7)}-01`;
    const assets = await this.db.query<any>(
      `SELECT id, asset_no, name, category_id, branch_id, cost_center_id, cost_base, residual_value_base, useful_life_months,
              depreciation_method, declining_rate_pct, depreciation_start::text AS depreciation_start
         FROM ast.assets WHERE company_id = $1 AND status = 'ACTIVE' AND depreciation_start <= $2::date ORDER BY asset_no`,
      [companyId, p.endDate],
    );
    const out: PlannedLine[] = [];
    for (const a of assets) {
      const posted = await this.db.query<{ month: string }>(
        `SELECT DISTINCT l.month FROM ast.depreciation_lines l JOIN ast.depreciation_runs r ON r.id = l.run_id AND r.status = 'POSTED' WHERE l.asset_id = $1`,
        [a.id],
      );
      const done = new Set(posted.map((x) => x.month));
      const schedule = depreciationSchedule(
        {
          costBase: a.cost_base, residualValueBase: a.residual_value_base, usefulLifeMonths: Number(a.useful_life_months), method: a.depreciation_method,
          decliningRatePct: a.declining_rate_pct, depreciationStart: a.depreciation_start,
        },
        base.decimals,
      );
      const due = schedule.filter((r) => r.month <= periodMonth && !done.has(r.month) && !D(r.amount).isZero());
      if (!due.length) continue;
      const custodies = await this.db.query<CustodyRange>(
        `SELECT employee_id AS "employeeId", effective_from::text AS "from", effective_to::text AS "to"
           FROM ast.asset_custodies WHERE asset_id = $1 ORDER BY effective_from`,
        [a.id],
      );
      const last = schedule[schedule.length - 1]?.month;
      for (const r of due) {
        for (const s of splitByCustody(r.month, r.amount, custodies, base.decimals)) {
          out.push({
            assetId: a.id, assetNo: a.asset_no, assetName: a.name, categoryId: a.category_id, branchId: a.branch_id, costCenterId: a.cost_center_id,
            employeeId: s.employeeId, month: r.month, days: s.days, amountBase: s.amount, accumulatedBase: r.accumulated, netBookValueBase: r.netBookValue,
            isFinalMonth: r.month === last,
          });
        }
      }
    }
    return out;
  }

  async preview(companyId: string, periodId: string) {
    const p = await this.regularPeriod(companyId, periodId);
    const lines = await this.plan(companyId, p);
    const existing = await this.db.one<{ id: string }>(`SELECT id FROM ast.depreciation_runs WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'`, [
      companyId,
      periodId,
    ]);
    return {
      period: p,
      existingRunId: existing?.id ?? null,
      lines,
      assetCount: new Set(lines.map((l) => l.assetId)).size,
      totalAmountBase: lines.reduce((s, l) => s.plus(l.amountBase), D(0)).toFixed(4),
    };
  }

  async run(companyId: string, periodId: string) {
    return this.db.tx(async () => {
      const p = await this.regularPeriod(companyId, periodId);
      if (p.status !== 'OPEN') throw new DomainError('PERIOD_NOT_OPEN');
      // serialize runs per company/period
      await this.db.query(`SELECT pg_advisory_xact_lock(hashtext('dep-run:' || $1::text))`, [companyId]);
      const existing = await this.db.one(`SELECT 1 FROM ast.depreciation_runs WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'`, [companyId, periodId]);
      if (existing) throw new DomainError('DEPRECIATION_RUN_EXISTS', undefined, 409);
      const lines = await this.plan(companyId, p);
      if (!lines.length) throw new DomainError('NOTHING_TO_DEPRECIATE');
      const base = await this.fx.baseCurrency(companyId);
      const total = lines.reduce((s, l) => s.plus(l.amountBase), D(0));
      const assetIds = [...new Set(lines.map((l) => l.assetId))];
      const run = await this.db.one<{ id: string; run_no: string }>(
        `INSERT INTO ast.depreciation_runs (company_id, fiscal_period_id, period_start, period_end, status, asset_count, total_amount_base, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'POSTED', $5, $6, sys.current_user_id(), sys.current_user_id()) RETURNING id, run_no`,
        [companyId, periodId, p.startDate, p.endDate, assetIds.length, total.toFixed(4)],
      );
      const items: PostingItem[] = lines.map((l, i) => ({
        key: 'AMOUNT',
        amount: l.amountBase,
        dims: { assetId: l.assetId, employeeId: l.employeeId, branchId: l.branchId, costCenterId: l.costCenterId },
        refs: { assetCategoryId: l.categoryId },
        description: `إهلاك ${l.assetNo} عن ${l.month.slice(0, 7)}`,
        sourceLineRef: String(i + 1),
      }));
      const entryId = await this.posting.post(companyId, {
        eventCode: 'ASSET.DEPRECIATION',
        entryDate: p.endDate,
        fiscalPeriodId: p.id,
        journalType: 'DEPRECIATION',
        description: `إهلاك الأصول - ${p.name}`,
        reference: `DEP-${run!.run_no}`,
        sourceModule: 'assets',
        sourceType: 'DEPRECIATION_RUN',
        sourceId: run!.id,
        currencyCode: base.code,
        exchangeRate: '1',
        items,
      });
      await this.db.query('UPDATE ast.depreciation_runs SET journal_entry_id = $2 WHERE id = $1', [run!.id, entryId]);
      for (const l of lines) {
        await this.db.query(
          `INSERT INTO ast.depreciation_lines (company_id, run_id, asset_id, employee_id, month, days, amount_base, accumulated_base, net_book_value_base)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [companyId, run!.id, l.assetId, l.employeeId, l.month, l.days, l.amountBase, l.accumulatedBase, l.netBookValueBase],
        );
      }
      const finished = [...new Set(lines.filter((l) => l.isFinalMonth).map((l) => l.assetId))];
      if (finished.length) {
        await this.db.query(`UPDATE ast.assets SET status = 'FULLY_DEPRECIATED' WHERE company_id = $1 AND id = ANY($2::uuid[])`, [companyId, finished]);
      }
      return this.get(companyId, run!.id);
    });
  }

  async cancel(companyId: string, runId: string, reason: string) {
    return this.db.tx(
      async () => {
        const run = await this.db.one<{ id: string; status: string; journal_entry_id: string; period_start: string }>(
          'SELECT id, status, journal_entry_id, period_start FROM ast.depreciation_runs WHERE company_id = $1 AND id = $2 FOR UPDATE',
          [companyId, runId],
        );
        if (!run) throw new NotFoundError('DepreciationRun', runId);
        if (run.status !== 'POSTED') throw new DomainError('DEPRECIATION_RUN_IMMUTABLE', 'Run is already cancelled');
        const later = await this.db.one(
          `SELECT 1 FROM ast.depreciation_runs WHERE company_id = $1 AND status = 'POSTED' AND period_start > $2::date LIMIT 1`,
          [companyId, run.period_start],
        );
        if (later) throw new DomainError('NOT_LATEST_RUN');
        const disposed = await this.db.one(
          `SELECT 1 FROM ast.depreciation_lines l JOIN ast.assets a ON a.id = l.asset_id WHERE l.run_id = $1 AND a.status = 'DISPOSED' LIMIT 1`,
          [runId],
        );
        if (disposed) throw new DomainError('VALIDATION_FAILED', 'The run contains disposed assets');
        const reversal = await this.journal.reverse(companyId, run.journal_entry_id, reason);
        await this.db.query(
          `UPDATE ast.depreciation_runs SET status = 'CANCELLED', reversal_entry_id = $2, cancel_reason = $3, cancelled_at = now(), cancelled_by = sys.current_user_id()
            WHERE id = $1`,
          [runId, reversal, reason],
        );
        await this.db.query(
          `UPDATE ast.assets SET status = 'ACTIVE' WHERE company_id = $1 AND status = 'FULLY_DEPRECIATED'
              AND id IN (SELECT asset_id FROM ast.depreciation_lines WHERE run_id = $2)`,
          [companyId, runId],
        );
        return this.get(companyId, runId);
      },
      { reason },
    );
  }

  async list(companyId: string, q: ListQuery): Promise<Page<any>> {
    const total = await this.db.one<{ n: string }>('SELECT count(*) AS n FROM ast.depreciation_runs WHERE company_id = $1', [companyId]);
    const rows = await this.db.query(
      `SELECT r.id, r.run_no AS "runNo", r.fiscal_period_id AS "fiscalPeriodId", p.name AS "periodName", r.period_start AS "periodStart",
              r.period_end AS "periodEnd", r.status, r.asset_count AS "assetCount", r.total_amount_base AS "totalAmountBase",
              r.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo", r.reversal_entry_id AS "reversalEntryId",
              r.cancel_reason AS "cancelReason", r.created_at AS "createdAt", u.full_name AS "createdBy"
         FROM ast.depreciation_runs r JOIN core.fiscal_periods p ON p.id = r.fiscal_period_id
         LEFT JOIN acc.journal_entries je ON je.id = r.journal_entry_id LEFT JOIN iam.users u ON u.id = r.created_by
        WHERE r.company_id = $1 ORDER BY r.period_start DESC, r.run_no DESC LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      [companyId],
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const r = await this.db.one(
      `SELECT r.id, r.run_no AS "runNo", r.fiscal_period_id AS "fiscalPeriodId", p.name AS "periodName", r.period_start AS "periodStart",
              r.period_end AS "periodEnd", r.status, r.asset_count AS "assetCount", r.total_amount_base AS "totalAmountBase",
              r.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo", r.reversal_entry_id AS "reversalEntryId",
              r.cancel_reason AS "cancelReason", r.cancelled_at AS "cancelledAt", r.created_at AS "createdAt"
         FROM ast.depreciation_runs r JOIN core.fiscal_periods p ON p.id = r.fiscal_period_id
         LEFT JOIN acc.journal_entries je ON je.id = r.journal_entry_id
        WHERE r.company_id = $1 AND r.id = $2`,
      [companyId, id],
    );
    if (!r) throw new NotFoundError('DepreciationRun', id);
    const lines = await this.db.query(
      `SELECT l.id, l.asset_id AS "assetId", a.asset_no AS "assetNo", a.name AS "assetName", l.employee_id AS "employeeId",
              e.full_name_ar AS "employeeName", l.month, l.days, l.amount_base AS "amountBase", l.accumulated_base AS "accumulatedBase",
              l.net_book_value_base AS "netBookValueBase"
         FROM ast.depreciation_lines l JOIN ast.assets a ON a.id = l.asset_id LEFT JOIN hr.employees e ON e.id = l.employee_id
        WHERE l.run_id = $1 ORDER BY a.asset_no, l.month, e.full_name_ar NULLS LAST`,
      [id],
    );
    return { ...r, lines };
  }
}
