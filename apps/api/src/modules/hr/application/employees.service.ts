import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { dayBefore, endSeries, removeLatest, supersede } from '../../../shared/effective';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { decimalString, isoDate, ListQuery, nonNegativeDecimal, offset, orderBy, Page } from '../../../shared/http/common';
import { hasPermission } from '../../../shared/http/request';

// ------------------------------------------------------------------ schemas
const optText = z.string().trim().max(500).nullable().optional();
const optUuid = z.string().uuid().nullable().optional();
const currency = z.string().trim().length(3).toUpperCase();

export const PlacementInput = z.object({
  branchId: optUuid,
  departmentId: optUuid,
  positionId: optUuid,
  costCenterId: optUuid,
  managerEmployeeId: optUuid,
});
export const CompensationInput = z.object({
  basicSalary: nonNegativeDecimal,
  salaryCurrency: currency,
  insuranceSalary: nonNegativeDecimal.default('0'),
  insuranceCurrency: currency.optional(),
});

const employeeFields = {
  code: z.string().trim().min(1).max(30),
  fullNameAr: z.string().trim().min(2).max(200),
  fullNameEn: optText,
  nationalId: z.string().trim().max(50).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  birthDate: isoDate.nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR']).optional(),
  isBillableResource: z.boolean().optional(),
  requiredMarginPct: decimalString.nullable().optional(),
  workCalendarId: optUuid,
  bankName: optText,
  bankAccountNo: z.string().trim().max(60).nullable().optional(),
  iban: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
};

export const EmployeeCreate = z.object({
  ...employeeFields,
  hireDate: isoDate,
  placement: PlacementInput.default({}),
  compensation: CompensationInput.optional(),
  costProfileId: optUuid,
});
export const EmployeeUpdate = z.object(employeeFields).partial().extend({ rowVersion: z.number().int().positive().optional() });

export const StatusChange = z.object({
  newStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']),
  effectiveDate: isoDate,
  reason: z.string().trim().min(3).max(1000),
});
export const SalaryChange = CompensationInput.extend({ effectiveFrom: isoDate, reason: z.string().trim().min(3).max(1000) });
export const PlacementChange = PlacementInput.extend({ effectiveFrom: isoDate, reason: z.string().trim().min(3).max(1000) });
export const ProfileAssign = z.object({ profileId: z.string().uuid(), effectiveFrom: isoDate });
export const EndVersion = z.object({ effectiveTo: isoDate });
export const OverrideCreate = z
  .object({
    componentId: z.string().uuid(),
    ratePct: nonNegativeDecimal.nullable().optional(),
    amount: nonNegativeDecimal.nullable().optional(),
    currencyCode: currency.nullable().optional(),
    isExcluded: z.boolean().default(false),
    reason: z.string().trim().min(3).max(1000),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().optional(),
  })
  .refine((v) => v.isExcluded || v.ratePct != null || v.amount != null, { message: 'ratePct or amount is required', path: ['amount'] })
  .refine((v) => v.amount == null || !!v.currencyCode, { message: 'currencyCode is required with amount', path: ['currencyCode'] });
export const DocumentMeta = z.object({
  docType: z.enum(['ID', 'PASSPORT', 'CONTRACT', 'CERTIFICATE', 'INSURANCE', 'MEDICAL', 'OTHER']),
  title: z.string().trim().min(1).max(200),
  docNumber: z.string().trim().max(100).nullable().optional(),
  issueDate: isoDate.nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const COLS: Record<string, string> = {
  code: 'code', fullNameAr: 'full_name_ar', fullNameEn: 'full_name_en', nationalId: 'national_id', email: 'email', phone: 'phone',
  birthDate: 'birth_date', gender: 'gender', employmentType: 'employment_type', isBillableResource: 'is_billable_resource',
  requiredMarginPct: 'required_margin_pct', workCalendarId: 'work_calendar_id', bankName: 'bank_name', bankAccountNo: 'bank_account_no',
  iban: 'iban', notes: 'notes',
};
const SENSITIVE = ['nationalId', 'bankAccountNo', 'iban'] as const;

const mask = (v: string | null) => (v == null ? null : v.length <= 4 ? '****' : `${'*'.repeat(Math.min(v.length - 4, 8))}${v.slice(-4)}`);

/**
 * Employees: master data + effective-dated history (status, placement,
 * compensation, cost profile, overrides). Historical rows are never edited –
 * every change is a new version, and versions inside closed periods are frozen
 * by the database. Sensitive data requires explicit permissions.
 */
@Injectable()
export class EmployeesService {
  constructor(private readonly db: DbService) {}

  private present(row: Record<string, any>) {
    if (!hasPermission('hr.employee.view_sensitive')) for (const f of SENSITIVE) if (f in row) row[f] = mask(row[f]);
    if (!hasPermission('hr.compensation.view')) {
      delete row.basicSalary;
      delete row.insuranceSalary;
      delete row.salaryCurrency;
      delete row.insuranceCurrency;
    }
    return row;
  }

  async list(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const params: unknown[] = [companyId, (q.asOf as string) ?? new Date().toISOString().slice(0, 10)];
    const where = ['e.company_id = $1'];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(e.code ILIKE $${params.length} OR e.full_name_ar ILIKE $${params.length} OR e.full_name_en ILIKE $${params.length})`);
    }
    for (const [key, col] of [['status', 'e.status'], ['departmentId', 'ja.department_id'], ['branchId', 'ja.branch_id'], ['positionId', 'ja.position_id']] as const) {
      if (q[key]) {
        params.push(q[key]);
        where.push(`${col} = $${params.length}`);
      }
    }
    const from = `FROM hr.employees e
      LEFT JOIN LATERAL (SELECT * FROM hr.employee_job_assignments j WHERE j.employee_id = e.id AND j.effective_from <= $2::date
                          AND (j.effective_to IS NULL OR j.effective_to >= $2::date) LIMIT 1) ja ON true
      LEFT JOIN LATERAL (SELECT * FROM hr.employee_compensations c WHERE c.employee_id = e.id AND c.effective_from <= $2::date
                          AND (c.effective_to IS NULL OR c.effective_to >= $2::date) LIMIT 1) comp ON true
      LEFT JOIN LATERAL (SELECT p.id, p.code, p.name_ar FROM hr.employee_cost_profiles ep JOIN hr.cost_profiles p ON p.id = ep.profile_id
                          WHERE ep.employee_id = e.id AND ep.effective_from <= $2::date
                          AND (ep.effective_to IS NULL OR ep.effective_to >= $2::date) LIMIT 1) prof ON true
      LEFT JOIN core.departments d ON d.id = ja.department_id
      LEFT JOIN core.branches b ON b.id = ja.branch_id
      LEFT JOIN hr.positions pos ON pos.id = ja.position_id
      WHERE ${where.join(' AND ')}`;
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n ${from}`, params);
    const rows = await this.db.query(
      `SELECT e.id, e.code, e.full_name_ar AS "fullNameAr", e.full_name_en AS "fullNameEn", e.email, e.phone, e.status,
              e.hire_date AS "hireDate", e.termination_date AS "terminationDate", e.employment_type AS "employmentType",
              e.is_billable_resource AS "isBillableResource", e.national_id AS "nationalId",
              ja.branch_id AS "branchId", b.name_ar AS "branchName", ja.department_id AS "departmentId", d.name_ar AS "departmentName",
              ja.position_id AS "positionId", pos.title_ar AS "positionTitle", ja.cost_center_id AS "costCenterId",
              comp.basic_salary AS "basicSalary", comp.salary_currency AS "salaryCurrency",
              comp.insurance_salary AS "insuranceSalary", comp.insurance_currency AS "insuranceCurrency",
              prof.id AS "costProfileId", prof.name_ar AS "costProfileName", e.row_version AS "rowVersion"
         ${from}
        ORDER BY ${orderBy(q.sort, { code: 'e.code', fullNameAr: 'e.full_name_ar', hireDate: 'e.hire_date', status: 'e.status' }, 'e.code ASC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows.map((r) => this.present(r)), meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const e = await this.db.one(
      `SELECT e.id, e.code, ${Object.entries(COLS).filter(([k]) => k !== 'code').map(([k, c]) => `e.${c} AS "${k}"`).join(', ')},
              e.hire_date AS "hireDate", e.termination_date AS "terminationDate", e.status, e.created_at AS "createdAt",
              e.updated_at AS "updatedAt", e.row_version AS "rowVersion"
         FROM hr.employees e WHERE e.company_id = $1 AND e.id = $2`,
      [companyId, id],
    );
    if (!e) throw new NotFoundError('Employee', id);
    const p = [companyId, id];
    const placements = await this.db.query(
      `SELECT j.id, j.branch_id AS "branchId", b.name_ar AS "branchName", j.department_id AS "departmentId", d.name_ar AS "departmentName",
              j.position_id AS "positionId", pos.title_ar AS "positionTitle", j.cost_center_id AS "costCenterId", cc.name_ar AS "costCenterName",
              j.manager_employee_id AS "managerEmployeeId", m.full_name_ar AS "managerName",
              j.effective_from AS "effectiveFrom", j.effective_to AS "effectiveTo", j.change_reason AS "changeReason"
         FROM hr.employee_job_assignments j
         LEFT JOIN core.branches b ON b.id = j.branch_id LEFT JOIN core.departments d ON d.id = j.department_id
         LEFT JOIN hr.positions pos ON pos.id = j.position_id LEFT JOIN core.cost_centers cc ON cc.id = j.cost_center_id
         LEFT JOIN hr.employees m ON m.id = j.manager_employee_id
        WHERE j.company_id = $1 AND j.employee_id = $2 ORDER BY j.effective_from DESC`,
      p,
    );
    const statusHistory = await this.db.query(
      `SELECT h.id, h.old_status AS "oldStatus", h.new_status AS "newStatus", h.effective_date AS "effectiveDate", h.reason,
              h.changed_at AS "changedAt", u.full_name AS "changedBy"
         FROM hr.employee_status_history h LEFT JOIN iam.users u ON u.id = h.changed_by
        WHERE h.company_id = $1 AND h.employee_id = $2 ORDER BY h.changed_at DESC`,
      p,
    );
    const costProfiles = await this.db.query(
      `SELECT ep.id, ep.profile_id AS "profileId", cp.code AS "profileCode", cp.name_ar AS "profileName",
              ep.effective_from AS "effectiveFrom", ep.effective_to AS "effectiveTo"
         FROM hr.employee_cost_profiles ep JOIN hr.cost_profiles cp ON cp.id = ep.profile_id
        WHERE ep.company_id = $1 AND ep.employee_id = $2 ORDER BY ep.effective_from DESC`,
      p,
    );
    const overrides = await this.db.query(
      `SELECT o.id, o.component_id AS "componentId", c.code AS "componentCode", c.name_ar AS "componentName", o.rate_pct AS "ratePct",
              o.amount, o.currency_code AS "currencyCode", o.is_excluded AS "isExcluded", o.reason,
              o.effective_from AS "effectiveFrom", o.effective_to AS "effectiveTo"
         FROM hr.employee_component_overrides o JOIN hr.cost_components c ON c.id = o.component_id
        WHERE o.company_id = $1 AND o.employee_id = $2 ORDER BY c.sort_order, o.effective_from DESC`,
      p,
    );
    const custodies = await this.db.query(
      `SELECT cu.id, cu.asset_id AS "assetId", a.asset_no AS "assetNo", a.name AS "assetName", a.asset_kind AS "assetKind",
              cu.effective_from AS "effectiveFrom", cu.effective_to AS "effectiveTo", cu.notes
         FROM ast.asset_custodies cu JOIN ast.assets a ON a.id = cu.asset_id
        WHERE cu.company_id = $1 AND cu.employee_id = $2 ORDER BY cu.effective_from DESC`,
      p,
    );
    const documents = await this.listDocuments(companyId, id);
    const compensations = hasPermission('hr.compensation.view')
      ? await this.db.query(
          `SELECT c.id, c.basic_salary AS "basicSalary", c.salary_currency AS "salaryCurrency", c.insurance_salary AS "insuranceSalary",
                  c.insurance_currency AS "insuranceCurrency", c.effective_from AS "effectiveFrom", c.effective_to AS "effectiveTo",
                  c.change_reason AS "changeReason", c.created_at AS "createdAt", u.full_name AS "createdBy"
             FROM hr.employee_compensations c LEFT JOIN iam.users u ON u.id = c.created_by
            WHERE c.company_id = $1 AND c.employee_id = $2 ORDER BY c.effective_from DESC`,
          p,
        )
      : null;
    return { ...this.present(e), placements, compensations, statusHistory, costProfiles, overrides, custodies, documents };
  }

  async create(companyId: string, input: z.infer<typeof EmployeeCreate>) {
    return this.db.tx(async () => {
      const fields = Object.keys(COLS).filter((k) => (input as any)[k] !== undefined);
      const cols = ['company_id', 'hire_date', 'status', ...fields.map((f) => COLS[f])];
      const params = [companyId, input.hireDate, 'ACTIVE', ...fields.map((f) => (input as any)[f])];
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO hr.employees (${cols.join(', ')}, created_by, updated_by)
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        params,
      );
      const id = row!.id;
      await this.db.query(
        `INSERT INTO hr.employee_status_history (company_id, employee_id, old_status, new_status, effective_date, reason, changed_by)
         VALUES ($1, $2, NULL, 'ACTIVE', $3, 'HIRED', sys.current_user_id())`,
        [companyId, id, input.hireDate],
      );
      await this.insertPlacement(companyId, id, input.placement, input.hireDate, 'HIRED');
      if (input.compensation) await this.insertCompensation(companyId, id, input.compensation, input.hireDate, 'HIRED');
      if (input.costProfileId) {
        await supersede(this.db, { table: 'hr.employee_cost_profiles', companyId, keys: { employee_id: id } }, input.hireDate, {
          profile_id: input.costProfileId,
        });
      }
      return this.get(companyId, id);
    });
  }

  private async insertPlacement(companyId: string, employeeId: string, p: z.infer<typeof PlacementInput>, from: string, reason: string) {
    await supersede(this.db, { table: 'hr.employee_job_assignments', companyId, keys: { employee_id: employeeId } }, from, {
      branch_id: p.branchId ?? null,
      department_id: p.departmentId ?? null,
      position_id: p.positionId ?? null,
      cost_center_id: p.costCenterId ?? null,
      manager_employee_id: p.managerEmployeeId ?? null,
      change_reason: reason,
    });
  }

  private async insertCompensation(companyId: string, employeeId: string, c: z.infer<typeof CompensationInput>, from: string, reason: string) {
    await supersede(this.db, { table: 'hr.employee_compensations', companyId, keys: { employee_id: employeeId } }, from, {
      basic_salary: c.basicSalary,
      salary_currency: c.salaryCurrency,
      insurance_salary: c.insuranceSalary ?? '0',
      insurance_currency: c.insuranceCurrency ?? c.salaryCurrency,
      change_reason: reason,
    });
  }

  private async assertEmployee(companyId: string, id: string) {
    const e = await this.db.one<{ status: string; hire_date: string; termination_date: string | null }>(
      'SELECT status, hire_date, termination_date FROM hr.employees WHERE company_id = $1 AND id = $2 FOR UPDATE',
      [companyId, id],
    );
    if (!e) throw new NotFoundError('Employee', id);
    return e;
  }

  private assertWithinEmployment(e: { hire_date: string; termination_date: string | null }, date: string) {
    if (date < e.hire_date || (e.termination_date && date > e.termination_date)) {
      throw new DomainError('DATE_OUTSIDE_EMPLOYMENT', 'Date is outside the employment period');
    }
  }

  async update(companyId: string, id: string, input: z.infer<typeof EmployeeUpdate>) {
    return this.db.tx(async () => {
      const { rowVersion, ...data } = input;
      const fields = Object.keys(COLS).filter((k) => (data as any)[k] !== undefined);
      if (fields.length === 0) return this.get(companyId, id);
      const params: unknown[] = [companyId, id];
      const sets = fields.map((f) => {
        params.push((data as any)[f]);
        return `${COLS[f]} = $${params.length}`;
      });
      let ver = '';
      if (rowVersion !== undefined) {
        params.push(rowVersion);
        ver = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(`UPDATE hr.employees SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2${ver} RETURNING id`, params);
      if (r.length === 0) {
        await this.assertEmployee(companyId, id);
        throw new DomainError('VERSION_CONFLICT', undefined, 409);
      }
      return this.get(companyId, id);
    });
  }

  async changeStatus(companyId: string, id: string, input: z.infer<typeof StatusChange>) {
    return this.db.tx(
      async () => {
        const e = await this.assertEmployee(companyId, id);
        if (e.status === input.newStatus) throw new DomainError('STATUS_UNCHANGED', 'Employee already has this status');
        if (input.effectiveDate < e.hire_date) throw new DomainError('DATE_OUTSIDE_EMPLOYMENT', 'Date is before the hire date');
        if (input.newStatus === 'TERMINATED') {
          const d = input.effectiveDate;
          // later versions are removed, open versions end on the termination date (closed history is protected by the DB)
          for (const t of ['hr.employee_job_assignments', 'hr.employee_compensations', 'hr.employee_cost_profiles', 'hr.employee_component_overrides', 'ast.asset_custodies']) {
            await this.db.query(`DELETE FROM ${t} WHERE company_id = $1 AND employee_id = $2 AND effective_from > $3::date`, [companyId, id, d]);
            await this.db.query(
              `UPDATE ${t} SET effective_to = $3::date, updated_by = sys.current_user_id()
                WHERE company_id = $1 AND employee_id = $2 AND (effective_to IS NULL OR effective_to > $3::date)`,
              [companyId, id, d],
            );
          }
          await this.db.query(`UPDATE hr.employees SET status = 'TERMINATED', termination_date = $3 WHERE company_id = $1 AND id = $2`, [
            companyId,
            id,
            d,
          ]);
        } else {
          await this.db.query(`UPDATE hr.employees SET status = $3, termination_date = NULL WHERE company_id = $1 AND id = $2`, [
            companyId,
            id,
            input.newStatus,
          ]);
        }
        await this.db.query(
          `INSERT INTO hr.employee_status_history (company_id, employee_id, old_status, new_status, effective_date, reason, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6, sys.current_user_id())`,
          [companyId, id, e.status, input.newStatus, input.effectiveDate, input.reason],
        );
        return this.get(companyId, id);
      },
      { reason: input.reason },
    );
  }

  async changeSalary(companyId: string, id: string, input: z.infer<typeof SalaryChange>) {
    return this.db.tx(
      async () => {
        const e = await this.assertEmployee(companyId, id);
        this.assertWithinEmployment(e, input.effectiveFrom);
        await this.insertCompensation(companyId, id, input, input.effectiveFrom, input.reason);
        if (e.termination_date) await this.capAtTermination('hr.employee_compensations', companyId, id, e.termination_date);
        return this.get(companyId, id);
      },
      { reason: input.reason },
    );
  }

  async changePlacement(companyId: string, id: string, input: z.infer<typeof PlacementChange>) {
    return this.db.tx(
      async () => {
        const e = await this.assertEmployee(companyId, id);
        this.assertWithinEmployment(e, input.effectiveFrom);
        await this.insertPlacement(companyId, id, input, input.effectiveFrom, input.reason);
        if (e.termination_date) await this.capAtTermination('hr.employee_job_assignments', companyId, id, e.termination_date);
        return this.get(companyId, id);
      },
      { reason: input.reason },
    );
  }

  private async capAtTermination(table: string, companyId: string, id: string, termination: string) {
    await this.db.query(`UPDATE ${table} SET effective_to = $3 WHERE company_id = $1 AND employee_id = $2 AND effective_to IS NULL`, [
      companyId,
      id,
      termination,
    ]);
  }

  async assignProfile(companyId: string, id: string, input: z.infer<typeof ProfileAssign>) {
    return this.db.tx(async () => {
      const e = await this.assertEmployee(companyId, id);
      this.assertWithinEmployment(e, input.effectiveFrom);
      await supersede(this.db, { table: 'hr.employee_cost_profiles', companyId, keys: { employee_id: id } }, input.effectiveFrom, {
        profile_id: input.profileId,
      });
      if (e.termination_date) await this.capAtTermination('hr.employee_cost_profiles', companyId, id, e.termination_date);
      return this.get(companyId, id);
    });
  }

  async endProfile(companyId: string, id: string, effectiveTo: string) {
    await endSeries(this.db, { table: 'hr.employee_cost_profiles', companyId, keys: { employee_id: id } }, effectiveTo);
    return this.get(companyId, id);
  }

  async removeVersion(companyId: string, id: string, kind: 'compensations' | 'placements' | 'cost-profiles', versionId: string) {
    const table = { compensations: 'hr.employee_compensations', placements: 'hr.employee_job_assignments', 'cost-profiles': 'hr.employee_cost_profiles' }[kind];
    return this.db.tx(async () => {
      const count = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE company_id = $1 AND employee_id = $2`, [companyId, id]);
      if (kind !== 'cost-profiles' && Number(count?.n ?? 0) <= 1) throw new DomainError('LAST_VERSION_REQUIRED', 'The first version cannot be removed');
      await removeLatest(this.db, { table, companyId, keys: { employee_id: id } }, versionId);
      return this.get(companyId, id);
    });
  }

  async addOverride(companyId: string, id: string, input: z.infer<typeof OverrideCreate>) {
    return this.db.tx(
      async () => {
        const e = await this.assertEmployee(companyId, id);
        this.assertWithinEmployment(e, input.effectiveFrom);
        const comp = await this.db.one('SELECT 1 FROM hr.cost_components WHERE company_id = $1 AND id = $2', [companyId, input.componentId]);
        if (!comp) throw new NotFoundError('CostComponent', input.componentId);
        await supersede(
          this.db,
          { table: 'hr.employee_component_overrides', companyId, keys: { employee_id: id, component_id: input.componentId } },
          input.effectiveFrom,
          {
            rate_pct: input.ratePct ?? null,
            amount: input.amount ?? null,
            currency_code: input.currencyCode ?? null,
            is_excluded: input.isExcluded,
            reason: input.reason,
          },
          input.effectiveTo ?? null,
        );
        return this.get(companyId, id);
      },
      { reason: input.reason },
    );
  }

  async endOverride(companyId: string, id: string, overrideId: string, effectiveTo: string) {
    const o = await this.db.one<{ component_id: string }>(
      'SELECT component_id FROM hr.employee_component_overrides WHERE company_id = $1 AND employee_id = $2 AND id = $3',
      [companyId, id, overrideId],
    );
    if (!o) throw new NotFoundError('Override', overrideId);
    await endSeries(this.db, { table: 'hr.employee_component_overrides', companyId, keys: { employee_id: id, component_id: o.component_id } }, effectiveTo);
    return this.get(companyId, id);
  }

  async removeOverride(companyId: string, id: string, overrideId: string) {
    const o = await this.db.one<{ component_id: string }>(
      'SELECT component_id FROM hr.employee_component_overrides WHERE company_id = $1 AND employee_id = $2 AND id = $3',
      [companyId, id, overrideId],
    );
    if (!o) throw new NotFoundError('Override', overrideId);
    await removeLatest(this.db, { table: 'hr.employee_component_overrides', companyId, keys: { employee_id: id, component_id: o.component_id } }, overrideId);
    return this.get(companyId, id);
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      // only an employee without any financial footprint can be deleted
      const used = await this.db.one(
        `SELECT 1 FROM acc.journal_lines WHERE company_id = $1 AND employee_id = $2
         UNION ALL SELECT 1 FROM ast.asset_custodies WHERE company_id = $1 AND employee_id = $2 LIMIT 1`,
        [companyId, id],
      );
      if (used) throw new DomainError('REFERENCED', 'Employee has transactions', 409);
      for (const t of ['hr.employee_component_overrides', 'hr.employee_cost_profiles', 'hr.employee_compensations', 'hr.employee_job_assignments']) {
        await this.db.query(`DELETE FROM ${t} WHERE company_id = $1 AND employee_id = $2`, [companyId, id]);
      }
      await this.db.query(`DELETE FROM hr.employee_documents WHERE company_id = $1 AND employee_id = $2`, [companyId, id]);
      await this.db.query(`SELECT set_config('app.purge_employee', $1, true)`, [id]);
      await this.db.query(`DELETE FROM hr.employee_status_history WHERE company_id = $1 AND employee_id = $2`, [companyId, id]);
      const r = await this.db.query('DELETE FROM hr.employees WHERE company_id = $1 AND id = $2 RETURNING id', [companyId, id]);
      if (r.length === 0) throw new NotFoundError('Employee', id);
    });
  }

  // ------------------------------------------------------------- documents
  async listDocuments(companyId: string, employeeId: string) {
    return this.db.query(
      `SELECT id, doc_type AS "docType", title, doc_number AS "docNumber", issue_date AS "issueDate", expiry_date AS "expiryDate",
              file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes", sha256, notes, created_at AS "createdAt"
         FROM hr.employee_documents WHERE company_id = $1 AND employee_id = $2 ORDER BY created_at DESC`,
      [companyId, employeeId],
    );
  }

  async addDocument(
    companyId: string,
    employeeId: string,
    meta: z.infer<typeof DocumentMeta>,
    file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    return this.db.tx(async () => {
      await this.assertEmployee(companyId, employeeId);
      const sha = file ? createHash('sha256').update(file.buffer).digest('hex') : null;
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO hr.employee_documents (company_id, employee_id, doc_type, title, doc_number, issue_date, expiry_date, file_name,
                                            mime_type, size_bytes, sha256, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [
          companyId, employeeId, meta.docType, meta.title, meta.docNumber ?? null, meta.issueDate ?? null, meta.expiryDate ?? null,
          file?.originalname ?? null, file?.mimetype ?? null, file?.size ?? null, sha, meta.notes ?? null,
        ],
      );
      if (file) await this.db.query('INSERT INTO hr.employee_document_files (document_id, content) VALUES ($1, $2)', [row!.id, file.buffer]);
      return (await this.listDocuments(companyId, employeeId)).find((d: any) => d.id === row!.id);
    });
  }

  async downloadDocument(companyId: string, employeeId: string, docId: string) {
    const r = await this.db.one<{ file_name: string; mime_type: string; content: Buffer }>(
      `SELECT d.file_name, d.mime_type, f.content FROM hr.employee_documents d JOIN hr.employee_document_files f ON f.document_id = d.id
        WHERE d.company_id = $1 AND d.employee_id = $2 AND d.id = $3`,
      [companyId, employeeId, docId],
    );
    if (!r) throw new NotFoundError('Document', docId);
    return r;
  }

  async removeDocument(companyId: string, employeeId: string, docId: string) {
    await this.db.tx(async () => {
      const r = await this.db.query('DELETE FROM hr.employee_documents WHERE company_id = $1 AND employee_id = $2 AND id = $3 RETURNING id', [
        companyId,
        employeeId,
        docId,
      ]);
      if (r.length === 0) throw new NotFoundError('Document', docId);
    });
  }
}

export { dayBefore };
