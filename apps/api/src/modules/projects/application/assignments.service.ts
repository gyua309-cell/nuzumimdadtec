import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { dayAfter, dayBefore } from '../../../shared/effective';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { decimalString, isoDate, ListQuery, offset, orderBy, Page } from '../../../shared/http/common';
import { hasPermission } from '../../../shared/http/request';
import { D } from '../../../shared/money';
import { EmployeeCostService, PeriodRange } from '../../hr/application/employee-cost.service';
import { AssignmentRange, segmentWindow, splitCost, summarize } from '../domain/allocation';

const OPEN_END = '9999-12-31';
const pct = decimalString.refine((v) => Number(v) > 0 && Number(v) <= 100, 'Allocation must be greater than 0 and at most 100');

export const AssignmentCreate = z
  .object({
    employeeId: z.string().uuid(),
    projectId: z.string().uuid(),
    clientId: z.string().uuid().nullable().optional(),
    costCenterId: z.string().uuid().nullable().optional(),
    allocationBasis: z.enum(['PERCENTAGE', 'DAYS', 'HOURS']).default('PERCENTAGE'),
    allocationPct: pct.optional(),
    allocatedDays: z.string().or(z.number()).transform((v) => String(v)).optional(),
    allocatedHours: z.string().or(z.number()).transform((v) => String(v)).optional(),
    workingDaysInMonth: z.string().or(z.number()).transform((v) => String(v)).optional().default('22'),
    billableRate: z.string().or(z.number()).transform((v) => String(v)).nullable().optional(),
    billingBasis: z.enum(['DAILY', 'HOURLY', 'MONTHLY']).default('DAILY').optional(),
    billingCurrency: z.string().length(3).default('SAR').optional(),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
    roleTitle: z.string().trim().max(200).nullable().optional(),
    isBillable: z.boolean().default(true),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'endDate must not be before startDate', path: ['endDate'] });
export const AssignmentUpdate = z.object({
  clientId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  allocationBasis: z.enum(['PERCENTAGE', 'DAYS', 'HOURS']).optional(),
  allocatedDays: z.string().or(z.number()).transform((v) => String(v)).optional(),
  allocatedHours: z.string().or(z.number()).transform((v) => String(v)).optional(),
  workingDaysInMonth: z.string().or(z.number()).transform((v) => String(v)).optional(),
  billableRate: z.string().or(z.number()).transform((v) => String(v)).nullable().optional(),
  billingBasis: z.enum(['DAILY', 'HOURLY', 'MONTHLY']).optional(),
  billingCurrency: z.string().length(3).optional(),
  roleTitle: z.string().trim().max(200).nullable().optional(),
  isBillable: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const AssignmentChange = z.object({
  effectiveFrom: isoDate,
  allocationPct: pct,
  reason: z.string().trim().min(3).max(1000),
});
export const AssignmentEnd = z.object({ endDate: isoDate, reason: z.string().trim().min(3).max(1000).optional() });

const SELECT = `
  a.id, a.employee_id AS "employeeId", e.code AS "employeeCode", e.full_name_ar AS "employeeNameAr",
  a.project_id AS "projectId", p.code AS "projectCode", p.name_ar AS "projectNameAr",
  COALESCE(a.client_id, p.client_id) AS "clientId", c.name_ar AS "clientNameAr", c.code AS "clientCode",
  COALESCE(a.cost_center_id, p.cost_center_id) AS "costCenterId", cc.name_ar AS "costCenterName", cc.code AS "costCenterCode",
  a.allocation_basis AS "allocationBasis", a.allocation_pct AS "allocationPct",
  a.allocated_days AS "allocatedDays", a.allocated_hours AS "allocatedHours", a.working_days_in_month AS "workingDaysInMonth",
  a.billable_rate AS "billableRate", a.billing_basis AS "billingBasis", a.billing_currency AS "billingCurrency",
  a.role_title AS "roleTitle", a.is_billable AS "isBillable",
  a.effective_from::text AS "startDate", a.effective_to::text AS "endDate", a.change_reason AS "changeReason", a.notes,
  a.created_at AS "createdAt", a.row_version AS "rowVersion"`;
const FROM = `prj.assignments a
  JOIN hr.employees e ON e.id = a.employee_id
  JOIN prj.projects p ON p.id = a.project_id
  JOIN prj.clients c ON c.id = COALESCE(a.client_id, p.client_id)
  LEFT JOIN core.cost_centers cc ON cc.id = COALESCE(a.cost_center_id, p.cost_center_id)`;

export interface Warning {
  code: 'OVER_ALLOCATION';
  message: string;
  segments: Array<{ from: string; to: string | null; totalPct: string; overPct: string }>;
}

/**
 * Employee assignments (Employee + Project + Allocation % + dates) and the
 * utilization maths built on them. An employee can be assigned to many projects;
 * total allocation above 100% is reported as a WARNING and normalized when cost
 * is distributed (never blocked). Assignments never rewrite closed history:
 * changes are made by ending a row and starting a new one.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly db: DbService,
    private readonly cost: EmployeeCostService,
  ) {}

  async list(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['a.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(e.code ILIKE $${params.length} OR e.full_name_ar ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.name_ar ILIKE $${params.length})`);
    }
    for (const [key, col] of [['employeeId', 'a.employee_id'], ['projectId', 'a.project_id']] as const) {
      if (q[key]) {
        params.push(q[key]);
        where.push(`${col} = $${params.length}`);
      }
    }
    if (q.asOf) {
      params.push(q.asOf);
      where.push(`a.effective_from <= $${params.length}::date AND (a.effective_to IS NULL OR a.effective_to >= $${params.length}::date)`);
    }
    if (q.periodId) {
      const p = await this.cost.periodRange(companyId, String(q.periodId));
      params.push(p.start, p.end);
      where.push(`a.effective_from <= $${params.length}::date AND (a.effective_to IS NULL OR a.effective_to >= $${params.length - 1}::date)`);
    }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM ${FROM} WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT ${SELECT} FROM ${FROM} WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { startDate: 'a.effective_from', employeeCode: 'e.code', projectCode: 'p.code' }, 'e.code ASC, a.effective_from DESC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const a = await this.db.one(`SELECT ${SELECT} FROM ${FROM} WHERE a.company_id = $1 AND a.id = $2`, [companyId, id]);
    if (!a) throw new NotFoundError('Assignment', id);
    return a;
  }

  async create(companyId: string, body: z.infer<typeof AssignmentCreate>) {
    return this.db.tx(async () => {
      const emp = await this.db.one<{ hire_date: string; termination_date: string | null }>(
        'SELECT hire_date::text, termination_date::text FROM hr.employees WHERE company_id = $1 AND id = $2',
        [companyId, body.employeeId],
      );
      if (!emp) throw new NotFoundError('Employee', body.employeeId);
      const prj = await this.db.one<{ status: string; start_date: string; end_date: string | null; client_id: string; cost_center_id: string | null }>(
        'SELECT status, start_date::text, end_date::text, client_id, cost_center_id FROM prj.projects WHERE company_id = $1 AND id = $2 FOR SHARE',
        [companyId, body.projectId],
      );
      if (!prj) throw new NotFoundError('Project', body.projectId);
      if (!['DRAFT', 'ACTIVE', 'ON_HOLD'].includes(prj.status)) throw new DomainError('PROJECT_NOT_OPEN_FOR_ASSIGNMENT', 'Project is closed to new assignments');
      if (body.startDate < emp.hire_date) throw new DomainError('DATE_OUTSIDE_EMPLOYMENT', 'Assignment starts before the hire date');
      if (emp.termination_date && body.startDate > emp.termination_date) throw new DomainError('DATE_OUTSIDE_EMPLOYMENT', 'Assignment starts after termination');
      if (body.startDate < prj.start_date) throw new DomainError('ASSIGNMENT_OUTSIDE_PROJECT', 'Assignment starts before the project start date');
      let end = body.endDate ?? null;
      for (const limit of [prj.end_date, emp.termination_date]) {
        if (!limit) continue;
        if (end && end > limit) throw new DomainError('ASSIGNMENT_OUTSIDE_PROJECT', `Assignment ends after ${limit}`);
        if (!end) end = limit; // open-ended assignments are clipped to the project / employment end
      }
      if (end && end < body.startDate) throw new DomainError('ASSIGNMENT_OUTSIDE_PROJECT', 'Assignment window is empty');

      const workingDays = Number(body.workingDaysInMonth || 22);
      let calcPct = body.allocationPct ? Number(body.allocationPct) : 100;
      let calcDays = body.allocatedDays ? Number(body.allocatedDays) : null;

      if (body.allocationBasis === 'DAYS' && calcDays != null) {
        calcPct = Math.min(100, Math.max(0.1, Number(((calcDays / workingDays) * 100).toFixed(4))));
      } else if (calcDays == null && calcPct) {
        calcDays = Number(((calcPct / 100) * workingDays).toFixed(2));
      }

      const clientId = body.clientId || prj.client_id;
      const costCenterId = body.costCenterId || prj.cost_center_id;
      const billableRate = body.billableRate ? Number(body.billableRate) : null;
      const billingBasis = body.billingBasis || 'DAILY';
      const billingCurrency = body.billingCurrency || 'SAR';

      const row = await this.db.one<{ id: string }>(
        `INSERT INTO prj.assignments (
           company_id, employee_id, project_id, client_id, cost_center_id,
           allocation_pct, allocation_basis, allocated_days, allocated_hours,
           working_days_in_month, billable_rate, billing_basis, billing_currency,
           role_title, is_billable, effective_from, effective_to, notes,
           created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [
          companyId, body.employeeId, body.projectId, clientId, costCenterId,
          calcPct, body.allocationBasis, calcDays, body.allocatedHours ? Number(body.allocatedHours) : null,
          workingDays, billableRate, billingBasis, billingCurrency,
          body.roleTitle ?? null, body.isBillable, body.startDate, end, body.notes ?? null,
        ],
      );

      if (billableRate != null) {
        await this.db.query(
          `INSERT INTO prj.service_prices (company_id, employee_id, project_id, pricing_basis, price, currency_code, effective_from, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING`,
          [companyId, body.employeeId, body.projectId, billingBasis, billableRate, billingCurrency, body.startDate, 'سعر الفوترة المحدد في التخصيص التعاقدي'],
        );
      }

      const warnings = await this.warningsFor(companyId, body.employeeId, body.startDate, end);
      return { ...(await this.get(companyId, row!.id)), warnings };
    });
  }

  async update(companyId: string, id: string, body: z.infer<typeof AssignmentUpdate>) {
    await this.get(companyId, id);
    const sets: string[] = [];
    const params: unknown[] = [companyId, id];
    for (const [k, col] of [
      ['clientId', 'client_id'],
      ['costCenterId', 'cost_center_id'],
      ['billableRate', 'billable_rate'],
      ['billingBasis', 'billing_basis'],
      ['billingCurrency', 'billing_currency'],
      ['roleTitle', 'role_title'],
      ['isBillable', 'is_billable'],
      ['notes', 'notes'],
      ['allocationBasis', 'allocation_basis'],
      ['allocatedDays', 'allocated_days'],
      ['allocatedHours', 'allocated_hours'],
      ['workingDaysInMonth', 'working_days_in_month'],
    ] as const) {
      if (body[k] !== undefined) {
        params.push(body[k]);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length) await this.db.query(`UPDATE prj.assignments SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2`, params);
    return this.get(companyId, id);
  }

  /** Changes the allocation from a date: ends the current row the day before and starts a new one. */
  async change(companyId: string, id: string, input: z.infer<typeof AssignmentChange>) {
    return this.db.tx(async () => {
      const old = await this.db.one<{ employee_id: string; project_id: string; effective_from: string; effective_to: string | null; role_title: string | null; is_billable: boolean }>(
        'SELECT employee_id, project_id, effective_from::text, effective_to::text, role_title, is_billable FROM prj.assignments WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!old) throw new NotFoundError('Assignment', id);
      if (input.effectiveFrom <= old.effective_from) throw new DomainError('EFFECTIVE_DATE_NOT_AFTER_CURRENT', 'New allocation must start after the current start date');
      if (old.effective_to && input.effectiveFrom > old.effective_to) throw new DomainError('DATE_OUTSIDE_ASSIGNMENT', 'Date is after the assignment end');
      await this.db.query('SELECT core.assert_dates_open($1, $2::date, $3::date)', [companyId, input.effectiveFrom, old.effective_to]);
      await this.db.query('UPDATE prj.assignments SET effective_to = $2::date, updated_by = sys.current_user_id() WHERE id = $1', [id, dayBefore(input.effectiveFrom)]);
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO prj.assignments (company_id, employee_id, project_id, allocation_pct, role_title, is_billable, effective_from, effective_to, change_reason, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [companyId, old.employee_id, old.project_id, input.allocationPct, old.role_title, old.is_billable, input.effectiveFrom, old.effective_to, input.reason],
      );
      const warnings = await this.warningsFor(companyId, old.employee_id, input.effectiveFrom, old.effective_to);
      return { ...(await this.get(companyId, row!.id)), warnings };
    });
  }

  async end(companyId: string, id: string, input: z.infer<typeof AssignmentEnd>) {
    return this.db.tx(async () => {
      const a = await this.db.one<{ effective_from: string; effective_to: string | null }>(
        'SELECT effective_from::text, effective_to::text FROM prj.assignments WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!a) throw new NotFoundError('Assignment', id);
      if (input.endDate < a.effective_from) throw new DomainError('INVALID_DATE_RANGE', 'End date is before the assignment start');
      if (a.effective_to && input.endDate >= a.effective_to) throw new DomainError('INVALID_DATE_RANGE', 'End date must shorten the assignment');
      await this.db.query('SELECT core.assert_dates_open($1, $2::date, $3::date)', [companyId, dayAfter(input.endDate), a.effective_to]);
      await this.db.query('UPDATE prj.assignments SET effective_to = $2::date, change_reason = COALESCE($3, change_reason), updated_by = sys.current_user_id() WHERE id = $1', [
        id, input.endDate, input.reason ?? null,
      ]);
      return this.get(companyId, id);
    });
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      const a = await this.db.one<{ effective_from: string; effective_to: string | null }>(
        'SELECT effective_from::text, effective_to::text FROM prj.assignments WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!a) throw new NotFoundError('Assignment', id);
      await this.db.query('SELECT core.assert_dates_open($1, $2::date, $3::date)', [companyId, a.effective_from, a.effective_to]);
      await this.db.query('DELETE FROM prj.assignments WHERE id = $1', [id]);
    });
  }

  // ------------------------------------------------------------------ utilization
  private async rangesOf(companyId: string, employeeIds: string[], window: PeriodRange): Promise<Map<string, AssignmentRange[]>> {
    const rows = await this.db.query<{ id: string; employee_id: string; project_id: string; allocation_pct: string; f: string; t: string | null }>(
      `SELECT a.id, a.employee_id, a.project_id, a.allocation_pct, a.effective_from::text AS f, a.effective_to::text AS t
         FROM prj.assignments a
        WHERE a.company_id = $1 AND a.employee_id = ANY($2::uuid[])
          AND a.effective_from <= $4::date AND (a.effective_to IS NULL OR a.effective_to >= $3::date)`,
      [companyId, employeeIds, window.start, window.end],
    );
    const map = new Map<string, AssignmentRange[]>();
    for (const r of rows) {
      const list = map.get(r.employee_id) ?? [];
      list.push({ id: r.id, projectId: r.project_id, allocationPct: r.allocation_pct, from: r.f, to: r.t });
      map.set(r.employee_id, list);
    }
    return map;
  }

  private employedWindow(e: { hire_date: string; termination_date: string | null }, p: PeriodRange): { from: string; to: string } | null {
    const from = e.hire_date > p.start ? e.hire_date : p.start;
    const to = e.termination_date && e.termination_date < p.end ? e.termination_date : p.end;
    return to < from ? null : { from, to };
  }

  /** Segments, weighted summary and (if allowed) the cost split for one employee in one period. */
  async employeeUtilization(companyId: string, employeeId: string, periodId: string) {
    const p = await this.cost.periodRange(companyId, periodId);
    const e = await this.db.one<{ id: string; code: string; full_name_ar: string; hire_date: string; termination_date: string | null }>(
      'SELECT id, code, full_name_ar, hire_date::text, termination_date::text FROM hr.employees WHERE company_id = $1 AND id = $2',
      [companyId, employeeId],
    );
    if (!e) throw new NotFoundError('Employee', employeeId);
    const win = this.employedWindow(e, p);
    const ranges = (await this.rangesOf(companyId, [employeeId], p)).get(employeeId) ?? [];
    const segments = win ? segmentWindow(win, ranges) : [];
    const summary = summarize(segments);
    const projects = await this.projectNames(companyId, summary.byProject.map((x) => x.projectId));
    const out: Record<string, unknown> = {
      employeeId, employeeCode: e.code, employeeNameAr: e.full_name_ar, period: p, window: win,
      summary: { ...summary, byProject: summary.byProject.map((x) => ({ ...x, ...projects.get(x.projectId) })) },
      segments: segments.map((s) => ({
        from: s.from, to: s.to, days: s.days, totalPct: s.totalPct.toFixed(4), allocatedPct: s.allocatedPct.toFixed(4),
        unutilizedPct: s.unutilizedPct.toFixed(4), overAllocatedPct: s.overAllocatedPct.toFixed(4),
        parts: s.parts.map((x) => ({ assignmentId: x.assignmentId, projectId: x.projectId, rawPct: x.rawPct.toFixed(4), effectivePct: x.effectivePct.toFixed(4) })),
      })),
      warnings: summary.isOverAllocated
        ? [{ code: 'OVER_ALLOCATION', message: 'Employee is allocated above 100%; cost is normalized', peakTotalPct: summary.peakTotalPct }]
        : [],
    };
    if (hasPermission('hr.compensation.view')) {
      const c = await this.cost.compute(companyId, employeeId, p);
      const split = splitCost(c.distributableCostBase, segments);
      out.cost = {
        distributableCostBase: c.distributableCostBase,
        unutilizedCostBase: split.unutilized.toFixed(2),
        byProject: split.byProject.map((x) => ({ projectId: x.projectId, ...projects.get(x.projectId), amountBase: x.amount.toFixed(2), effectivePct: x.effectivePct.toFixed(4) })),
      };
    }
    return out;
  }

  /** Company-wide utilization for a period (employees employed in the period). */
  async report(companyId: string, periodId: string) {
    const p = await this.cost.periodRange(companyId, periodId);
    const emps = await this.db.query<{ id: string; code: string; full_name_ar: string; hire_date: string; termination_date: string | null; is_billable_resource: boolean }>(
      `SELECT id, code, full_name_ar, hire_date::text, termination_date::text, is_billable_resource FROM hr.employees
        WHERE company_id = $1 AND hire_date <= $3::date AND (termination_date IS NULL OR termination_date >= $2::date) ORDER BY code`,
      [companyId, p.start, p.end],
    );
    const ranges = await this.rangesOf(companyId, emps.map((e) => e.id), p);
    const withCost = hasPermission('hr.compensation.view');
    const rows: any[] = [];
    const totals = { unutilizedCost: D(0), cost: D(0), overAllocated: 0 };
    for (const e of emps) {
      const win = this.employedWindow(e, p);
      const segments = win ? segmentWindow(win, ranges.get(e.id) ?? []) : [];
      const s = summarize(segments);
      const row: any = {
        employeeId: e.id, code: e.code, fullNameAr: e.full_name_ar, isBillableResource: e.is_billable_resource, employedDays: s.days,
        allocatedPct: s.allocatedPct, unutilizedPct: s.unutilizedPct, overAllocatedPct: s.overAllocatedPct, peakTotalPct: s.peakTotalPct,
        isOverAllocated: s.isOverAllocated, projectCount: s.byProject.length, error: null,
      };
      if (s.isOverAllocated) totals.overAllocated++;
      if (withCost) {
        try {
          const c = await this.cost.compute(companyId, e.id, p);
          const split = splitCost(c.distributableCostBase, segments);
          row.distributableCostBase = c.distributableCostBase;
          row.unutilizedCostBase = split.unutilized.toFixed(2);
          totals.cost = totals.cost.plus(c.distributableCostBase);
          totals.unutilizedCost = totals.unutilizedCost.plus(split.unutilized);
        } catch (err) {
          row.error = { code: (err as DomainError).code ?? 'ERROR', message: (err as Error).message };
        }
      }
      rows.push(row);
    }
    return {
      period: p,
      rows,
      totals: {
        employees: rows.length,
        overAllocatedEmployees: totals.overAllocated,
        ...(withCost ? { distributableCostBase: totals.cost.toFixed(2), unutilizedCostBase: totals.unutilizedCost.toFixed(2) } : {}),
      },
    };
  }

  /**
   * Detailed Employee Project Allocation by Days & Percentages Report
   * Features:
   * - Days & percentage split per employee across all assigned projects
   * - Unutilized days and unutilized cost calculation
   * - Expected service revenue per project (daily/hourly/monthly rate)
   * - Real-time sales invoice linkage status (INVOICED vs UNINVOICED)
   */
  async getEmployeeDaysReport(companyId: string, periodId: string) {
    const p = await this.cost.periodRange(companyId, periodId);
    const defaultWorkingDays = 22;

    // 1. Fetch assignments in period
    const assignments = await this.db.query(
      `SELECT a.id AS "assignmentId", a.employee_id AS "employeeId", e.code AS "employeeCode",
              e.full_name_ar AS "employeeNameAr", COALESCE(pos.title_ar, 'مهندس برمجيات') AS "positionTitle",
              a.project_id AS "projectId", prj.code AS "projectCode", prj.name_ar AS "projectNameAr",
              c.id AS "clientId", c.name_ar AS "clientNameAr",
              a.allocation_basis AS "allocationBasis", a.allocation_pct::text AS "allocationPct",
              a.allocated_days::text AS "allocatedDays", a.allocated_hours::text AS "allocatedHours",
              COALESCE(a.working_days_in_month, 22)::text AS "workingDaysInMonth",
              a.effective_from::text AS "startDate", a.effective_to::text AS "endDate"
         FROM prj.assignments a
         JOIN hr.employees e ON e.id = a.employee_id
         LEFT JOIN LATERAL (
           SELECT p2.title_ar
             FROM hr.employee_job_assignments eja
             JOIN hr.positions p2 ON p2.id = eja.position_id
            WHERE eja.employee_id = e.id AND (eja.effective_to IS NULL OR eja.effective_to >= $2::date)
            ORDER BY eja.effective_from DESC
            LIMIT 1
         ) pos ON TRUE
         JOIN prj.projects prj ON prj.id = a.project_id
         JOIN prj.clients c ON c.id = prj.client_id
        WHERE a.company_id = $1
          AND a.effective_from <= $3::date
          AND (a.effective_to IS NULL OR a.effective_to >= $2::date)
        ORDER BY e.code ASC, prj.code ASC`,
      [companyId, p.start, p.end],
    );

    // 2. Fetch employee total monthly costs for this period
    let costRows: any[] = [];
    try {
      const sheet = await this.cost.costSheet(companyId, periodId);
      costRows = sheet.rows || [];
    } catch {
      costRows = [];
    }
    const empCostMap = new Map<string, number>();
    for (const row of costRows) {
      empCostMap.set(row.employeeId, Number(row.distributableCostBase || row.totalCostBase || 0));
    }

    // 3. Fetch Service Prices for employees
    const prices = await this.db.query(
      `SELECT sp.employee_id AS "employeeId", sp.project_id AS "projectId",
              sp.pricing_basis AS "pricingBasis", sp.price::text AS price
         FROM prj.service_prices sp
        WHERE sp.company_id = $1
          AND sp.effective_from <= $3::date
          AND (sp.effective_to IS NULL OR sp.effective_to >= $2::date)`,
      [companyId, p.start, p.end],
    );
    const priceMap = new Map<string, { pricingBasis: string; price: number }>();
    for (const sp of prices) {
      const key = sp.projectId ? `${sp.employeeId}:${sp.projectId}` : sp.employeeId;
      priceMap.set(key, { pricingBasis: sp.pricingBasis, price: Number(sp.price) });
    }

    // 4. Fetch linked Sales Invoices in this period
    const invoicedItems = await this.db.query(
      `SELECT i.id AS "invoiceId", i.invoice_no AS "invoiceNo", i.status,
              il.employee_id AS "employeeId", i.project_id AS "projectId"
         FROM sal.invoices i
         JOIN sal.invoice_lines il ON il.invoice_id = i.id
        WHERE i.company_id = $1 AND i.fiscal_period_id = $2 AND i.status != 'CANCELLED'`,
      [companyId, periodId],
    );
    const invoiceMap = new Map<string, { invoiceId: string; invoiceNo: string; status: string }>();
    for (const inv of invoicedItems) {
      if (inv.employeeId && inv.projectId) {
        invoiceMap.set(`${inv.employeeId}:${inv.projectId}`, {
          invoiceId: inv.invoiceId,
          invoiceNo: inv.invoiceNo,
          status: inv.status,
        });
      }
    }

    // Group allocations by employee to compute total allocated days and unutilized days
    const empTotalDays = new Map<string, number>();
    for (const a of assignments) {
      const monthDays = Number(a.workingDaysInMonth || defaultWorkingDays);
      const aDays = a.allocatedDays ? Number(a.allocatedDays) : (Number(a.allocationPct) / 100) * monthDays;
      empTotalDays.set(a.employeeId, (empTotalDays.get(a.employeeId) || 0) + aDays);
    }

    let totalAllocatedDaysAll = 0;
    let totalRevenueAll = D(0);
    let totalCostAll = D(0);
    let totalProfitAll = D(0);
    let invoicedCount = 0;
    let pendingCount = 0;

    const rows = assignments.map((a: any) => {
      const monthDays = Number(a.workingDaysInMonth || defaultWorkingDays);
      const aDays = a.allocatedDays ? Number(a.allocatedDays) : Number(((Number(a.allocationPct) / 100) * monthDays).toFixed(2));
      const aPct = Number(((aDays / monthDays) * 100).toFixed(2));

      const empTotalAssignedDays = empTotalDays.get(a.employeeId) || aDays;
      const unutilizedDays = Math.max(0, Number((monthDays - empTotalAssignedDays).toFixed(2)));
      const unutilizedPct = Math.max(0, Number(((unutilizedDays / monthDays) * 100).toFixed(2)));

      const empCost = empCostMap.get(a.employeeId) || 12000;
      const costShare = D(empCost).mul(aPct).div(100);

      const prc = priceMap.get(`${a.employeeId}:${a.projectId}`) || priceMap.get(a.employeeId) || {
        pricingBasis: 'DAILY',
        price: 1500,
      };

      let revenue = D(0);
      if (prc.pricingBasis === 'DAILY') {
        revenue = D(prc.price).mul(aDays);
      } else if (prc.pricingBasis === 'HOURLY') {
        revenue = D(prc.price).mul(aDays * 8);
      } else {
        revenue = D(prc.price).mul(aPct).div(100);
      }

      const grossProfit = revenue.sub(costShare);
      const marginPct = !revenue.isZero() ? Number(grossProfit.div(revenue).mul(100).toFixed(2)) : 0;

      const invInfo = invoiceMap.get(`${a.employeeId}:${a.projectId}`);
      const invoiceStatus = invInfo ? invInfo.status : 'UNINVOICED';
      if (invInfo) invoicedCount++;
      else pendingCount++;

      totalAllocatedDaysAll += aDays;
      totalRevenueAll = totalRevenueAll.add(revenue);
      totalCostAll = totalCostAll.add(costShare);
      totalProfitAll = totalProfitAll.add(grossProfit);

      return {
        assignmentId: a.assignmentId,
        employeeId: a.employeeId,
        employeeCode: a.employeeCode,
        employeeName: a.employeeNameAr,
        positionTitle: a.positionTitle || 'مهندس برمجيات',
        projectId: a.projectId,
        projectCode: a.projectCode,
        projectName: a.projectNameAr,
        clientId: a.clientId,
        clientName: a.clientNameAr,
        allocationBasis: a.allocationBasis || 'DAYS',
        workingDaysInMonth: monthDays,
        allocatedDays: aDays,
        allocationPct: aPct,
        unutilizedDays,
        unutilizedPct,
        pricingBasis: prc.pricingBasis,
        unitPrice: prc.price.toFixed(2),
        employeeMonthlyCost: empCost.toFixed(2),
        projectCostShare: costShare.toFixed(2),
        revenueGenerated: revenue.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        marginPct,
        invoiceStatus,
        invoiceId: invInfo?.invoiceId || null,
        invoiceNo: invInfo?.invoiceNo || null,
      };
    });

    const averageMargin = !totalRevenueAll.isZero()
      ? Number(totalProfitAll.div(totalRevenueAll).mul(100).toFixed(2))
      : 0;

    return {
      period: p,
      summary: {
        totalAssignments: rows.length,
        totalAllocatedDays: Number(totalAllocatedDaysAll.toFixed(2)),
        totalRevenue: totalRevenueAll.toFixed(2),
        totalCost: totalCostAll.toFixed(2),
        totalProfit: totalProfitAll.toFixed(2),
        averageMarginPct: averageMargin,
        invoicedCount,
        pendingInvoiceCount: pendingCount,
      },
      rows,
    };
  }

  private async projectNames(companyId: string, ids: string[]): Promise<Map<string, { projectCode: string; projectNameAr: string }>> {
    const m = new Map<string, { projectCode: string; projectNameAr: string }>();
    if (ids.length === 0) return m;
    const rows = await this.db.query<{ id: string; code: string; name_ar: string }>(
      'SELECT id, code, name_ar FROM prj.projects WHERE company_id = $1 AND id = ANY($2::uuid[])',
      [companyId, ids],
    );
    for (const r of rows) m.set(r.id, { projectCode: r.code, projectNameAr: r.name_ar });
    return m;
  }

  private async warningsFor(companyId: string, employeeId: string, from: string, to: string | null): Promise<Warning[]> {
    const ranges = (await this.rangesOf(companyId, [employeeId], { start: from, end: to ?? OPEN_END })).get(employeeId) ?? [];
    const over = segmentWindow({ from, to: to ?? OPEN_END }, ranges).filter((s) => s.overAllocatedPct.greaterThan(0));
    if (over.length === 0) return [];
    return [
      {
        code: 'OVER_ALLOCATION',
        message: 'Employee is allocated above 100% in the listed ranges',
        segments: over.map((s) => ({ from: s.from, to: s.to === OPEN_END ? null : s.to, totalPct: s.totalPct.toFixed(4), overPct: s.overAllocatedPct.toFixed(4) })),
      },
    ];
  }
}
