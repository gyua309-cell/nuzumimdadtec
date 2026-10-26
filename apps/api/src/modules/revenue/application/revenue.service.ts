import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { ListQuery, Page, offset, orderBy } from '../../../shared/http/common';
import { EmployeeCostService } from '../../hr/application/employee-cost.service';
import { AssignmentsService } from '../../projects/application/assignments.service';
import { PricingService } from '../../projects/application/pricing.service';

export const RevenueRunCreate = z.object({
  fiscalPeriodId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const RevenueRunCancel = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const OverheadPolicyUpdate = z.object({
  method: z.enum(['PERCENTAGE', 'FIXED_PER_EMPLOYEE', 'FIXED_PER_PROJECT']).default('PERCENTAGE'),
  rate: z.string().or(z.number()).transform((v) => String(v)),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const RetroactiveAdjustmentCreate = z.object({
  employeeId: z.string().uuid(),
  projectId: z.string().uuid(),
  originalPeriodId: z.string().uuid(),
  fiscalPeriodId: z.string().uuid(),
  pricingBasis: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).default('DAILY'),
  units: z.string().or(z.number()).transform((v) => String(v)),
  unitPrice: z.string().or(z.number()).transform((v) => String(v)),
  currencyCode: z.string().trim().length(3).default('SAR'),
  exchangeRate: z.string().or(z.number()).transform((v) => String(v)).optional().default('1'),
  adjustmentReason: z.string().trim().min(3).max(1000),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Revenue Engine: computes and posts revenue lines from assignments + service prices. */
@Injectable()
export class RevenueService {
  constructor(
    private readonly db: DbService,
    private readonly cost: EmployeeCostService,
    private readonly assignments: AssignmentsService,
    private readonly pricing: PricingService,
  ) {}

  async list(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['r.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.periodId) { params.push(q.periodId); where.push(`r.fiscal_period_id = $${params.length}`); }
    if (q.projectId) { params.push(q.projectId); where.push(`r.project_id = $${params.length}`); }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM rev.revenue_lines r WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT r.id, r.employee_id AS "employeeId", e.full_name_ar AS "employeeName",
              r.project_id AS "projectId", p.name_ar AS "projectName", p.code AS "projectCode",
              c.name_ar AS "clientName",
              r.pricing_basis AS "pricingBasis", r.unit_price::text AS "unitPrice",
              r.currency_code AS "currencyCode", r.units::text, r.allocation_pct::text AS "allocationPct",
              r.gross_revenue::text AS "grossRevenue", r.gross_revenue_base::text AS "grossRevenueBase",
              r.revenue_type AS "revenueType", r.status, r.created_at AS "createdAt",
              r.original_period_id AS "originalPeriodId", ofp.name AS "originalPeriodName",
              r.adjustment_reason AS "adjustmentReason"
       FROM rev.revenue_lines r
       JOIN hr.employees e ON e.id = r.employee_id
       JOIN prj.projects p ON p.id = r.project_id
       JOIN prj.clients c ON c.id = p.client_id
       LEFT JOIN core.fiscal_periods ofp ON ofp.id = r.original_period_id
       WHERE ${sql}
       ORDER BY ${orderBy(q.sort, { projectName: 'p.name_ar', employeeName: 'e.full_name_ar' }, 'r.created_at DESC')}
       LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async listRuns(companyId: string, q: ListQuery): Promise<Page<any>> {
    const total = await this.db.one<{ n: string }>(
      'SELECT count(*) AS n FROM rev.revenue_runs WHERE company_id = $1', [companyId]);
    const rows = await this.db.query(
      `SELECT r.id, r.run_no AS "runNo", fp.name AS "periodName", r.status,
              r.total_revenue_base::text AS "totalRevenueBase",
              r.journal_entry_id AS "journalEntryId",
              je.entry_no AS "journalEntryNo",
              r.posted_at AS "postedAt", r.cancel_reason AS "cancelReason"
       FROM rev.revenue_runs r
       JOIN core.fiscal_periods fp ON fp.id = r.fiscal_period_id
       LEFT JOIN acc.journal_entries je ON je.id = r.journal_entry_id
       WHERE r.company_id = $1
       ORDER BY r.run_no DESC LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      [companyId],
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async getRun(companyId: string, id: string) {
    const run = await this.db.one(
      `SELECT r.id, r.company_id AS "companyId", r.run_no AS "runNo",
              r.fiscal_period_id AS "fiscalPeriodId", r.status,
              r.total_revenue_base::text AS "totalRevenueBase",
              r.journal_entry_id AS "journalEntryId",
              r.posted_at AS "postedAt", r.cancel_reason AS "cancelReason",
              r.created_at AS "createdAt", r.updated_at AS "updatedAt",
              r.created_by AS "createdBy", r.updated_by AS "updatedBy",
              fp.name AS "periodName"
       FROM rev.revenue_runs r
       JOIN core.fiscal_periods fp ON fp.id = r.fiscal_period_id
       WHERE r.company_id = $1 AND r.id = $2`, [companyId, id]);
    if (!run) throw new NotFoundError('RevenueRun', id);
    const lines = await this.db.query(
      `SELECT rl.id, rl.fiscal_period_id AS "fiscalPeriodId", rl.employee_id AS "employeeId",
              rl.project_id AS "projectId", rl.assignment_id AS "assignmentId",
              rl.service_price_id AS "servicePriceId", rl.pricing_basis AS "pricingBasis",
              rl.unit_price::text AS "unitPrice", rl.currency_code AS "currencyCode",
              rl.exchange_rate::text AS "exchangeRate", rl.units::text AS "units",
              rl.allocation_pct::text AS "allocationPct", rl.gross_revenue::text AS "grossRevenue",
              rl.gross_revenue_base::text AS "grossRevenueBase", rl.revenue_type AS "revenueType",
              rl.status,
              e.full_name_ar AS "employeeName", p.name_ar AS "projectName",
              p.code AS "projectCode", c.name_ar AS "clientName"
       FROM rev.revenue_lines rl
       JOIN hr.employees e ON e.id = rl.employee_id
       JOIN prj.projects p ON p.id = rl.project_id
       JOIN prj.clients c ON c.id = p.client_id
       WHERE rl.company_id = $1 AND rl.fiscal_period_id = (SELECT fiscal_period_id FROM rev.revenue_runs WHERE id = $2)
         AND rl.status IN ('POSTED', 'REVERSED')`, [companyId, id]);
    return { ...run, lines };
  }

  async preview(companyId: string, periodId: string, full = false) {
    const existing = await this.db.one<{ id: string }>(
      'SELECT id FROM rev.revenue_runs WHERE company_id = $1 AND fiscal_period_id = $2', [companyId, periodId]);

    const period = await this.cost.periodRange(companyId, periodId);

    // Get all active billable assignments in this period
    const assignments = await this.db.query<{
      id: string; employee_id: string; project_id: string;
      allocation_pct: string; effective_from: string; effective_to: string | null;
    }>(
      `SELECT a.id, a.employee_id, a.project_id, a.allocation_pct,
              a.effective_from::text, a.effective_to::text
       FROM prj.assignments a
       JOIN prj.projects p ON p.id = a.project_id
       WHERE a.company_id = $1
         AND a.effective_from <= $3::date
         AND (a.effective_to IS NULL OR a.effective_to >= $2::date)
         AND p.status IN ('ACTIVE','COMPLETED')
         AND a.is_billable = true`,
      [companyId, period.start, period.end],
    );

    const lines: any[] = [];

    for (const asgn of assignments) {
      const win = {
        from: period.start > asgn.effective_from ? period.start : asgn.effective_from,
        to: !asgn.effective_to || asgn.effective_to > period.end ? period.end : asgn.effective_to,
      };

      const priceRow = await this.db.one<{
        id: string; basis: string; price: string; currency_code: string; exchange_rate: string;
      }>(
        `SELECT sp.id, sp.pricing_basis AS basis, sp.price::text, sp.currency_code,
                COALESCE(
                  (SELECT rate FROM core.exchange_rates WHERE company_id = $1 AND from_currency = sp.currency_code
                   ORDER BY rate_date DESC LIMIT 1), 1
                )::text AS exchange_rate
         FROM prj.service_prices sp
         WHERE sp.company_id = $1 AND sp.employee_id = $2
           AND (sp.project_id = $3 OR sp.project_id IS NULL)
           AND sp.effective_from <= $4::date
           AND (sp.effective_to IS NULL OR sp.effective_to >= $4::date)
         ORDER BY (sp.project_id IS NOT NULL) DESC, sp.effective_from DESC LIMIT 1`,
        [companyId, asgn.employee_id, asgn.project_id, period.end],
      );

      if (!priceRow) continue; // no price configured → skip

      // days in period overlap
      const from = new Date(win.from);
      const to = new Date(win.to);
      const totalDaysInPeriod = (new Date(period.end).getTime() - new Date(period.start).getTime()) / 86400000 + 1;
      const assignedDays = (to.getTime() - from.getTime()) / 86400000 + 1;
      const allocationPct = D(asgn.allocation_pct).div(100);

      let units: import('decimal.js').Decimal;
      if (priceRow.basis === 'MONTHLY') units = D(assignedDays).div(totalDaysInPeriod).times(allocationPct);
      else if (priceRow.basis === 'DAILY') units = D(assignedDays).times(allocationPct);
      else units = D(assignedDays).times(8).times(allocationPct); // HOURLY: 8h/day

      const grossRevenue = D(priceRow.price).times(units);
      const grossRevenueBase = grossRevenue.times(D(priceRow.exchange_rate));

      lines.push({
        employeeId: asgn.employee_id,
        projectId: asgn.project_id,
        assignmentId: asgn.id,
        servicePriceId: priceRow.id,
        pricingBasis: priceRow.basis,
        unitPrice: priceRow.price,
        currencyCode: priceRow.currency_code,
        exchangeRate: priceRow.exchange_rate,
        units: units.toFixed(4),
        allocationPct: D(asgn.allocation_pct).toFixed(4),
        grossRevenue: grossRevenue.toFixed(4),
        grossRevenueBase: grossRevenueBase.toFixed(4),
      });
    }

    const totalRevenue = lines.reduce((s, l) => s.plus(D(l.grossRevenueBase)), D(0));
    const projectIds = [...new Set(lines.map((l) => l.projectId))];
    const employeeIds = [...new Set(lines.map((l) => l.employeeId))];

    return {
      existingRunId: existing?.id ?? null,
      periodId,
      lineCount: lines.length,
      projectCount: projectIds.length,
      employeeCount: employeeIds.length,
      totalRevenueBase: totalRevenue.toFixed(2),
      lines: full ? lines : lines.slice(0, 50),
    };
  }

  async executeRun(companyId: string, body: z.infer<typeof RevenueRunCreate>) {
    return this.db.tx(async () => {
      const existing = await this.db.one<{ id: string }>(
        'SELECT id FROM rev.revenue_runs WHERE company_id = $1 AND fiscal_period_id = $2',
        [companyId, body.fiscalPeriodId],
      );
      if (existing) throw new DomainError('RUN_ALREADY_EXISTS', 'تم ترحيل إيرادات هذه الفترة مسبقًا — ألغِ التشغيل السابق أولاً');

      const period = await this.db.one<{ status: string; start_date: string; end_date: string }>(
        'SELECT status, start_date::text, end_date::text FROM core.fiscal_periods WHERE company_id = $1 AND id = $2',
        [companyId, body.fiscalPeriodId],
      );
      if (!period) throw new NotFoundError('FiscalPeriod', body.fiscalPeriodId);
      if (period.status === 'CLOSED') throw new DomainError('PERIOD_CLOSED', 'الفترة مغلقة');

      const fullPreview = await this.preview(companyId, body.fiscalPeriodId, true);
      if (fullPreview.lineCount === 0) throw new DomainError('NO_REVENUE_LINES', 'لا توجد تخصيصات مدفوعة بأسعار محددة في هذه الفترة');

      // Insert revenue_run
      const run = await this.db.one<{ id: string }>(
        `INSERT INTO rev.revenue_runs (company_id, fiscal_period_id, status, total_revenue_base, created_by, updated_by)
         VALUES ($1,$2,'DRAFT',$3, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [companyId, body.fiscalPeriodId, fullPreview.totalRevenueBase],
      );

      // Insert all revenue lines
      for (const line of fullPreview.lines) {
        await this.db.query(
          `INSERT INTO rev.revenue_lines
             (company_id, fiscal_period_id, employee_id, project_id, assignment_id, service_price_id,
              pricing_basis, unit_price, currency_code, exchange_rate, units, allocation_pct,
              gross_revenue, gross_revenue_base, revenue_type, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'NORMAL','POSTED')`,
          [companyId, body.fiscalPeriodId, line.employeeId, line.projectId, line.assignmentId, line.servicePriceId,
           line.pricingBasis, line.unitPrice, line.currencyCode, line.exchangeRate,
           line.units, line.allocationPct, line.grossRevenue, line.grossRevenueBase],
        );
      }

      // Update run status to POSTED
      await this.db.query(
        `UPDATE rev.revenue_runs SET status='POSTED', posted_at=now(), updated_by=sys.current_user_id() WHERE id=$1`,
        [run!.id],
      );

      return this.getRun(companyId, run!.id);
    });
  }

  async cancelRun(companyId: string, id: string, body: z.infer<typeof RevenueRunCancel>) {
    const run = await this.db.one<{ status: string; fiscal_period_id: string }>(
      'SELECT status, fiscal_period_id FROM rev.revenue_runs WHERE company_id = $1 AND id = $2', [companyId, id]);
    if (!run) throw new NotFoundError('RevenueRun', id);
    if (run.status !== 'POSTED') throw new DomainError('RUN_NOT_POSTED', 'يمكن إلغاء التشغيلات المرحّلة فقط');

    await this.db.tx(async () => {
      await this.db.query(
        `UPDATE rev.revenue_lines SET status='REVERSED'
         WHERE company_id=$1 AND fiscal_period_id=$2 AND status='POSTED'`,
        [companyId, run.fiscal_period_id],
      );
      await this.db.query(
        `UPDATE rev.revenue_runs SET status='CANCELLED', cancel_reason=$1, updated_by=sys.current_user_id()
         WHERE id=$2`,
        [body.reason, id],
      );
    });
    return this.getRun(companyId, id);
  }

  // ==========================================================================
  // Overhead Policy Management (Section 19)
  // ==========================================================================
  async getOverheadPolicy(companyId: string) {
    const row = await this.db.one<{ method: string; rate: string; notes: string | null }>(
      `SELECT method, rate::text, notes FROM rev.overhead_policies WHERE company_id = $1`,
      [companyId],
    );
    return row ?? { method: 'PERCENTAGE', rate: '15.00', notes: 'النسبة الافتراضية للمصروفات الإدارية والعمومية (15%)' };
  }

  async updateOverheadPolicy(companyId: string, body: z.infer<typeof OverheadPolicyUpdate>) {
    await this.db.query(
      `INSERT INTO rev.overhead_policies (company_id, method, rate, notes, updated_at, updated_by)
       VALUES ($1, $2, $3, $4, now(), sys.current_user_id())
       ON CONFLICT (company_id) DO UPDATE SET
         method = EXCLUDED.method,
         rate = EXCLUDED.rate,
         notes = EXCLUDED.notes,
         updated_at = now(),
         updated_by = sys.current_user_id()`,
      [companyId, body.method, body.rate, body.notes ?? null],
    );
    return this.getOverheadPolicy(companyId);
  }

  // ==========================================================================
  // Retroactive Revenue Adjustments (Section 18)
  // ==========================================================================
  async createRetroactiveAdjustment(companyId: string, body: z.infer<typeof RetroactiveAdjustmentCreate>) {
    return this.db.tx(async () => {
      const period = await this.db.one<{ status: string; name: string }>(
        'SELECT status, name FROM core.fiscal_periods WHERE company_id = $1 AND id = $2',
        [companyId, body.fiscalPeriodId],
      );
      if (!period) throw new NotFoundError('FiscalPeriod', body.fiscalPeriodId);
      if (period.status === 'CLOSED') throw new DomainError('PERIOD_CLOSED', 'الفترة المالية مغلقة ولا يمكن تسجيل تسويات فيها');

      const originalPeriod = await this.db.one<{ name: string }>(
        'SELECT name FROM core.fiscal_periods WHERE company_id = $1 AND id = $2',
        [companyId, body.originalPeriodId],
      );
      if (!originalPeriod) throw new NotFoundError('OriginalFiscalPeriod', body.originalPeriodId);

      const grossRevenue = D(body.units).times(D(body.unitPrice));
      const grossRevenueBase = grossRevenue.times(D(body.exchangeRate));

      const row = await this.db.one<{ id: string }>(
        `INSERT INTO rev.revenue_lines
           (company_id, fiscal_period_id, original_period_id, employee_id, project_id,
            pricing_basis, unit_price, currency_code, exchange_rate, units, allocation_pct,
            gross_revenue, gross_revenue_base, revenue_type, status, adjustment_reason, notes,
            created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 100, $11, $12, 'RETROACTIVE', 'POSTED', $13, $14,
                 sys.current_user_id(), sys.current_user_id())
         RETURNING id`,
        [
          companyId, body.fiscalPeriodId, body.originalPeriodId, body.employeeId, body.projectId,
          body.pricingBasis, body.unitPrice, body.currencyCode, body.exchangeRate, body.units,
          grossRevenue.toFixed(4), grossRevenueBase.toFixed(4), body.adjustmentReason, body.notes ?? null,
        ],
      );

      return this.db.one(
        `SELECT rl.id, rl.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
                rl.original_period_id AS "originalPeriodId", ofp.name AS "originalPeriodName",
                rl.employee_id AS "employeeId", e.full_name_ar AS "employeeName",
                rl.project_id AS "projectId", p.name_ar AS "projectName", p.code AS "projectCode",
                c.name_ar AS "clientName",
                rl.pricing_basis AS "pricingBasis", rl.unit_price::text AS "unitPrice",
                rl.currency_code AS "currencyCode", rl.units::text, rl.gross_revenue::text AS "grossRevenue",
                rl.gross_revenue_base::text AS "grossRevenueBase", rl.revenue_type AS "revenueType",
                rl.adjustment_reason AS "adjustmentReason", rl.notes, rl.status, rl.created_at AS "createdAt"
         FROM rev.revenue_lines rl
         JOIN hr.employees e ON e.id = rl.employee_id
         JOIN prj.projects p ON p.id = rl.project_id
         JOIN prj.clients c ON c.id = p.client_id
         JOIN core.fiscal_periods fp ON fp.id = rl.fiscal_period_id
         JOIN core.fiscal_periods ofp ON ofp.id = rl.original_period_id
         WHERE rl.company_id = $1 AND rl.id = $2`,
        [companyId, row!.id],
      );
    });
  }

  async listRetroactiveAdjustments(companyId: string, periodId?: string) {
    const where = ['rl.company_id = $1', "rl.revenue_type = 'RETROACTIVE'"];
    const params: unknown[] = [companyId];
    if (periodId) {
      params.push(periodId);
      where.push(`rl.fiscal_period_id = $${params.length}`);
    }
    return this.db.query(
      `SELECT rl.id, rl.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              rl.original_period_id AS "originalPeriodId", ofp.name AS "originalPeriodName",
              rl.employee_id AS "employeeId", e.full_name_ar AS "employeeName", e.code AS "employeeCode",
              rl.project_id AS "projectId", p.name_ar AS "projectName", p.code AS "projectCode",
              c.name_ar AS "clientName",
              rl.pricing_basis AS "pricingBasis", rl.unit_price::text AS "unitPrice",
              rl.currency_code AS "currencyCode", rl.units::text, rl.gross_revenue::text AS "grossRevenue",
              rl.gross_revenue_base::text AS "grossRevenueBase", rl.revenue_type AS "revenueType",
              rl.adjustment_reason AS "adjustmentReason", rl.notes, rl.status, rl.created_at AS "createdAt"
       FROM rev.revenue_lines rl
       JOIN hr.employees e ON e.id = rl.employee_id
       JOIN prj.projects p ON p.id = rl.project_id
       JOIN prj.clients c ON c.id = p.client_id
       JOIN core.fiscal_periods fp ON fp.id = rl.fiscal_period_id
       LEFT JOIN core.fiscal_periods ofp ON ofp.id = rl.original_period_id
       WHERE ${where.join(' AND ')}
       ORDER BY rl.created_at DESC`,
      params,
    );
  }

  // ==========================================================================
  // 3-Tier Profitability Engine (Sections 20, 21, 22)
  // ==========================================================================

  /**
   * Level 1: Employee Profitability (Section 20)
   * Includes revenue generated, total cost, overhead, unutilized time %, and unutilized cost.
   */
  async getEmployeeProfitability(companyId: string, periodId: string) {
    const period = await this.cost.periodRange(companyId, periodId);
    const overheadPolicy = await this.getOverheadPolicy(companyId);
    const overheadRate = D(overheadPolicy.rate || 15);

    // 1. All employees active in this period
    const emps = await this.db.query<{
      id: string; code: string; full_name_ar: string; department_name: string | null; position_title: string | null;
    }>(
      `SELECT e.id, e.code, e.full_name_ar, d.name_ar AS department_name, pos.title_ar AS position_title
       FROM hr.employees e
       LEFT JOIN LATERAL (
         SELECT ja.department_id, ja.position_id
         FROM hr.employee_job_assignments ja
         WHERE ja.company_id = e.company_id AND ja.employee_id = e.id
           AND ja.effective_from <= $3::date AND (ja.effective_to IS NULL OR ja.effective_to >= $2::date)
         ORDER BY ja.effective_from DESC LIMIT 1
       ) cur_ja ON true
       LEFT JOIN core.departments d ON d.id = cur_ja.department_id
       LEFT JOIN hr.positions pos ON pos.id = cur_ja.position_id
       WHERE e.company_id = $1
         AND e.hire_date <= $3::date
         AND (e.termination_date IS NULL OR e.termination_date >= $2::date)
       ORDER BY e.code ASC`,
      [companyId, period.start, period.end],
    );

    // 2. Revenue lines grouped by employee and project
    const revLines = await this.db.query<{
      employeeId: string; projectId: string; projectCode: string; projectName: string;
      revBase: string;
    }>(
      `SELECT rl.employee_id AS "employeeId", rl.project_id AS "projectId",
              p.code AS "projectCode", p.name_ar AS "projectName",
              COALESCE(SUM(rl.gross_revenue_base), 0)::text AS "revBase"
       FROM rev.revenue_lines rl
       JOIN prj.projects p ON p.id = rl.project_id
       WHERE rl.company_id = $1 AND rl.fiscal_period_id = $2 AND rl.status = 'POSTED'
       GROUP BY rl.employee_id, rl.project_id, p.code, p.name_ar`,
      [companyId, periodId],
    );

    const empRevMap = new Map<string, { total: import('decimal.js').Decimal; byProject: Map<string, { projectCode: string; projectName: string; rev: import('decimal.js').Decimal }> }>();
    for (const r of revLines) {
      if (!empRevMap.has(r.employeeId)) {
        empRevMap.set(r.employeeId, { total: D(0), byProject: new Map() });
      }
      const entry = empRevMap.get(r.employeeId)!;
      const revVal = D(r.revBase);
      entry.total = entry.total.plus(revVal);
      if (!entry.byProject.has(r.projectId)) {
        entry.byProject.set(r.projectId, { projectCode: r.projectCode, projectName: r.projectName, rev: D(0) });
      }
      const pEntry = entry.byProject.get(r.projectId)!;
      pEntry.rev = pEntry.rev.plus(revVal);
    }

    const rows = [];
    let grandRevenue = D(0);
    let grandCost = D(0);
    let grandUnutilizedCost = D(0);
    let grandProfit = D(0);

    for (const emp of emps) {
      let directCost = D(0);
      try {
        const c = await this.cost.compute(companyId, emp.id, period);
        directCost = D(c.distributableCostBase);
      } catch {
        // default 0
      }

      let allocatedPct = '0.00';
      let unutilizedPct = '100.00';
      let overAllocatedPct = '0.00';
      let unutilizedCost = directCost;
      let projectAssignments: any[] = [];

      try {
        const u: any = await this.assignments.employeeUtilization(companyId, emp.id, periodId);
        allocatedPct = Number(u.summary?.allocatedPct ?? 0).toFixed(2);
        unutilizedPct = Number(u.summary?.unutilizedPct ?? 100).toFixed(2);
        overAllocatedPct = Number(u.summary?.overAllocatedPct ?? 0).toFixed(2);
        if (u.cost && (u.cost as any).unutilizedCostBase) {
          unutilizedCost = D((u.cost as any).unutilizedCostBase);
        } else {
          unutilizedCost = directCost.times(D(unutilizedPct).div(100));
        }

        if (u.cost && (u.cost as any).byProject) {
          projectAssignments = (u.cost as any).byProject;
        }
      } catch {
        // default
      }

      const revInfo = empRevMap.get(emp.id);
      const revenue = revInfo ? revInfo.total : D(0);

      // Overhead
      let overhead = D(0);
      if (overheadPolicy.method === 'PERCENTAGE') {
        overhead = directCost.times(overheadRate.div(100));
      } else if (overheadPolicy.method === 'FIXED_PER_EMPLOYEE') {
        overhead = overheadRate;
      }

      const totalCost = directCost.plus(overhead);
      const profit = revenue.minus(totalCost);
      const marginPct = revenue.gt(0) ? profit.div(revenue).times(100) : null;

      // Project breakdown
      const projectsList = [];
      const projectIds = new Set<string>();
      for (const pa of projectAssignments) projectIds.add(pa.projectId);
      if (revInfo) {
        for (const pid of revInfo.byProject.keys()) projectIds.add(pid);
      }

      for (const pid of projectIds) {
        const asgnPart = projectAssignments.find((x: any) => x.projectId === pid);
        const revPart = revInfo?.byProject.get(pid);
        const pRev = revPart ? revPart.rev : D(0);
        const pCost = asgnPart ? D(asgnPart.amountBase) : D(0);
        const pProfit = pRev.minus(pCost);
        projectsList.push({
          projectId: pid,
          projectCode: asgnPart?.projectCode || revPart?.projectCode || '',
          projectName: asgnPart?.projectNameAr || revPart?.projectName || '',
          effectiveAllocationPct: asgnPart?.effectivePct ? Number(asgnPart.effectivePct).toFixed(2) : '0.00',
          costBase: pCost.toFixed(2),
          revenueBase: pRev.toFixed(2),
          profitBase: pProfit.toFixed(2),
        });
      }

      grandRevenue = grandRevenue.plus(revenue);
      grandCost = grandCost.plus(totalCost);
      grandUnutilizedCost = grandUnutilizedCost.plus(unutilizedCost);
      grandProfit = grandProfit.plus(profit);

      rows.push({
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.full_name_ar,
        departmentName: emp.department_name,
        positionTitle: emp.position_title,
        revenueBase: revenue.toFixed(2),
        directCostBase: directCost.toFixed(2),
        overheadBase: overhead.toFixed(2),
        totalCostBase: totalCost.toFixed(2),
        grossProfitBase: profit.toFixed(2),
        grossMarginPct: marginPct ? marginPct.toFixed(2) : null,
        allocatedPct,
        unutilizedPct,
        unutilizedCostBase: unutilizedCost.toFixed(2),
        overAllocatedPct,
        projectCount: projectsList.length,
        projects: projectsList,
      });
    }

    const grandMarginPct = grandRevenue.gt(0) ? grandProfit.div(grandRevenue).times(100) : null;

    return {
      periodId,
      summary: {
        employeeCount: rows.length,
        totalRevenueBase: grandRevenue.toFixed(2),
        totalCostBase: grandCost.toFixed(2),
        totalUnutilizedCostBase: grandUnutilizedCost.toFixed(2),
        totalProfitBase: grandProfit.toFixed(2),
        averageMarginPct: grandMarginPct ? grandMarginPct.toFixed(2) : null,
      },
      employees: rows,
    };
  }

  /**
   * Level 2: Project Profitability (Section 21)
   * With team members breakdown and project-specific variable costs.
   */
  async getProjectProfitability(companyId: string, periodId: string) {
    const period = await this.cost.periodRange(companyId, periodId);
    const overheadPolicy = await this.getOverheadPolicy(companyId);
    const overheadRate = D(overheadPolicy.rate || 15);

    // 1. Posted revenue by project (including normal and retroactive)
    const revRows = await this.db.query<{ projectId: string; rev: string }>(
      `SELECT project_id AS "projectId", COALESCE(SUM(gross_revenue_base), 0)::text AS rev
       FROM rev.revenue_lines
       WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'
       GROUP BY project_id`,
      [companyId, periodId],
    );
    const revMap = new Map(revRows.map(r => [r.projectId, D(r.rev)]));

    // 2. Project-linked variables (Section 14 & 15: bonuses, overtime, additional pay for a project)
    const varRows = await this.db.query<{ projectId: string; totalVar: string }>(
      `SELECT project_id AS "projectId", COALESCE(SUM(computed_amount), 0)::text AS "totalVar"
       FROM pay.monthly_variables
       WHERE company_id = $1 AND fiscal_period_id = $2 AND project_id IS NOT NULL AND status IN ('APPROVED','POSTED')
       GROUP BY project_id`,
      [companyId, periodId],
    );
    const varMap = new Map(varRows.map(r => [r.projectId, D(r.totalVar)]));

    // 3. Direct costs from employee assignments for this period
    const emps = await this.db.query<{ id: string; code: string; full_name_ar: string }>(
      `SELECT DISTINCT e.id, e.code, e.full_name_ar
       FROM prj.assignments a
       JOIN hr.employees e ON e.id = a.employee_id
       WHERE a.company_id = $1 AND a.effective_from <= $3::date AND (a.effective_to IS NULL OR a.effective_to >= $2::date)`,
      [companyId, period.start, period.end],
    );

    const projectCostMap = new Map<string, import('decimal.js').Decimal>();
    const projectTeamMap = new Map<string, Array<{ employeeId: string; employeeCode: string; employeeName: string; costBase: string; effectivePct: string }>>();

    for (const emp of emps) {
      try {
        const u = await this.assignments.employeeUtilization(companyId, emp.id, periodId);
        if (u.cost && (u.cost as any).byProject) {
          for (const bp of (u.cost as any).byProject) {
            const costVal = D(bp.amountBase);
            projectCostMap.set(bp.projectId, (projectCostMap.get(bp.projectId) ?? D(0)).plus(costVal));

            if (!projectTeamMap.has(bp.projectId)) projectTeamMap.set(bp.projectId, []);
            projectTeamMap.get(bp.projectId)!.push({
              employeeId: emp.id,
              employeeCode: emp.code,
              employeeName: emp.full_name_ar,
              costBase: costVal.toFixed(2),
              effectivePct: Number(bp.effectivePct || 0).toFixed(2),
            });
          }
        }
      } catch {
        // employee without full cost setup is skipped
      }
    }

    const allProjectIds = Array.from(new Set([...revMap.keys(), ...projectCostMap.keys(), ...varMap.keys()]));
    if (allProjectIds.length === 0) return [];

    // 4. Projects list with details and client info
    const projects = await this.db.query<{
      id: string; code: string; name_ar: string; client_id: string; client_code: string; client_name: string; required_margin_pct: string | null;
    }>(
      `SELECT p.id, p.code, p.name_ar, p.client_id, c.code AS client_code, c.name_ar AS client_name, p.required_margin_pct::text
       FROM prj.projects p
       JOIN prj.clients c ON c.id = p.client_id
       WHERE p.company_id = $1 AND p.id = ANY($2::uuid[])`,
      [companyId, allProjectIds],
    );

    return projects.map((p) => {
      const revenue = revMap.get(p.id) ?? D(0);
      const employeeCost = projectCostMap.get(p.id) ?? D(0);
      const projectVars = varMap.get(p.id) ?? D(0);
      const directCost = employeeCost.plus(projectVars);

      let overhead = D(0);
      if (overheadPolicy.method === 'PERCENTAGE') {
        overhead = directCost.times(overheadRate.div(100));
      } else if (overheadPolicy.method === 'FIXED_PER_PROJECT' && allProjectIds.length > 0) {
        overhead = overheadRate.div(allProjectIds.length);
      }

      const totalCost = directCost.plus(overhead);
      const profit = revenue.minus(totalCost);
      const marginPct = revenue.gt(0) ? profit.div(revenue).times(100) : null;
      const targetPct = p.required_margin_pct ? D(p.required_margin_pct) : null;
      const gapPct = marginPct && targetPct ? marginPct.minus(targetPct) : null;
      const meetsTarget = marginPct && targetPct ? marginPct.gte(targetPct) : null;
      const team = projectTeamMap.get(p.id) ?? [];

      return {
        id: p.id,
        projectId: p.id,
        projectCode: p.code,
        projectName: p.name_ar,
        clientId: p.client_id,
        clientCode: p.client_code,
        clientName: p.client_name,
        requiredMarginPct: targetPct ? targetPct.toFixed(2) : null,
        revenueBase: revenue.toFixed(2),
        employeeCostBase: employeeCost.toFixed(2),
        projectVariablesBase: projectVars.toFixed(2),
        directCostBase: directCost.toFixed(2),
        overheadBase: overhead.toFixed(2),
        totalCostBase: totalCost.toFixed(2),
        grossProfitBase: profit.toFixed(2),
        grossMarginPct: marginPct ? marginPct.toFixed(2) : null,
        marginGapPct: gapPct ? gapPct.toFixed(2) : null,
        meetsTarget,
        teamCount: team.length,
        teamMembers: team,
      };
    });
  }

  /**
   * Alias for backward compatibility
   */
  async getProfitability(companyId: string, periodId: string) {
    return this.getProjectProfitability(companyId, periodId);
  }

  /**
   * Level 3: Client Profitability (Section 22)
   * Aggregates project metrics per client.
   */
  async getClientProfitability(companyId: string, periodId: string) {
    const projects = await this.getProjectProfitability(companyId, periodId);
    const clientMap = new Map<string, {
      clientId: string; clientCode: string; clientName: string;
      revenue: import('decimal.js').Decimal;
      directCost: import('decimal.js').Decimal;
      overhead: import('decimal.js').Decimal;
      totalCost: import('decimal.js').Decimal;
      profit: import('decimal.js').Decimal;
      projects: any[];
    }>();

    for (const prj of projects) {
      if (!clientMap.has(prj.clientId)) {
        clientMap.set(prj.clientId, {
          clientId: prj.clientId,
          clientCode: prj.clientCode,
          clientName: prj.clientName,
          revenue: D(0),
          directCost: D(0),
          overhead: D(0),
          totalCost: D(0),
          profit: D(0),
          projects: [],
        });
      }
      const c = clientMap.get(prj.clientId)!;
      c.revenue = c.revenue.plus(D(prj.revenueBase));
      c.directCost = c.directCost.plus(D(prj.directCostBase));
      c.overhead = c.overhead.plus(D(prj.overheadBase));
      c.totalCost = c.totalCost.plus(D(prj.totalCostBase));
      c.profit = c.profit.plus(D(prj.grossProfitBase));
      c.projects.push(prj);
    }

    return Array.from(clientMap.values()).map((c) => {
      const marginPct = c.revenue.gt(0) ? c.profit.div(c.revenue).times(100) : null;
      return {
        clientId: c.clientId,
        clientCode: c.clientCode,
        clientName: c.clientName,
        projectCount: c.projects.length,
        revenueBase: c.revenue.toFixed(2),
        directCostBase: c.directCost.toFixed(2),
        overheadBase: c.overhead.toFixed(2),
        totalCostBase: c.totalCost.toFixed(2),
        grossProfitBase: c.profit.toFixed(2),
        grossMarginPct: marginPct ? marginPct.toFixed(2) : null,
        projects: c.projects,
      };
    });
  }
}
