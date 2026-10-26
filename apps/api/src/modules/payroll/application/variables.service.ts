import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, toDbAmount } from '../../../shared/money';
import { decimalString, isoDate, ListQuery, nonNegativeDecimal, offset, orderBy, Page, positiveDecimal } from '../../../shared/http/common';

const optText = z.string().trim().max(2000).nullable().optional();
const optUuid = z.string().uuid().nullable().optional();

// ------------------------------------------------------------------ schemas

export const VariableTypeCreate = z.object({
  code: z.string().trim().min(1).max(30),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  category: z.enum(['BONUS', 'OVERTIME', 'REWARD', 'ALLOWANCE', 'DEDUCTION', 'ADVANCE', 'OTHER']),
  calcMethod: z.enum(['FIXED', 'HOURS_RATE', 'DAYS_RATE', 'PCT_BASIC']),
  defaultAmount: nonNegativeDecimal.nullable().optional(),
  defaultRate: nonNegativeDecimal.nullable().optional(),
  defaultMultiplier: nonNegativeDecimal.nullable().optional(),
  isTaxable: z.boolean().default(false),
  affectsProfitability: z.boolean().default(true),
  debitAccountId: optUuid,
  creditAccountId: optUuid,
  isActive: z.boolean().default(true),
  notes: optText,
});
export const VariableTypeUpdate = VariableTypeCreate.partial();

export const MonthlyVariableCreate = z.object({
  fiscalPeriodId: z.string().uuid(),
  employeeId: z.string().uuid(),
  variableTypeId: z.string().uuid(),
  projectId: optUuid,
  amount: decimalString.nullable().optional(),
  hours: nonNegativeDecimal.nullable().optional(),
  days: nonNegativeDecimal.nullable().optional(),
  rate: nonNegativeDecimal.nullable().optional(),
  multiplier: nonNegativeDecimal.nullable().optional(),
  currencyCode: z.string().trim().length(3).toUpperCase().default('SAR'),
  exchangeRate: positiveDecimal.default('1'),
  notes: optText,
});
export const MonthlyVariableUpdate = MonthlyVariableCreate.partial().omit({ fiscalPeriodId: true, employeeId: true, variableTypeId: true });

/**
 * Variable types and monthly variable lines for payroll.
 * Computes amounts based on calc_method (FIXED, HOURS_RATE, DAYS_RATE, PCT_BASIC).
 */
@Injectable()
export class VariablesService {
  constructor(private readonly db: DbService) {}

  // ---------------------------------------------------------------- variable types

  async listVariableTypes(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['vt.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(vt.code ILIKE $${params.length} OR vt.name_ar ILIKE $${params.length})`);
    }
    if (q['isActive'] !== undefined) {
      params.push(q['isActive']);
      where.push(`vt.is_active = $${params.length}`);
    }
    if (q['category']) {
      params.push(q['category']);
      where.push(`vt.category = $${params.length}`);
    }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM pay.variable_types vt WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT vt.id, vt.code, vt.name_ar AS "nameAr", vt.name_en AS "nameEn", vt.category, vt.calc_method AS "calcMethod",
              vt.default_amount AS "defaultAmount", vt.default_rate AS "defaultRate", vt.default_multiplier AS "defaultMultiplier",
              vt.is_taxable AS "isTaxable", vt.affects_profitability AS "affectsProfitability",
              vt.debit_account_id AS "debitAccountId", vt.credit_account_id AS "creditAccountId",
              vt.is_active AS "isActive", vt.notes, vt.created_at AS "createdAt", vt.row_version AS "rowVersion"
         FROM pay.variable_types vt WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { code: 'vt.code', nameAr: 'vt.name_ar', category: 'vt.category' }, 'vt.code ASC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async getVariableType(companyId: string, id: string) {
    const vt = await this.db.one(
      `SELECT vt.id, vt.code, vt.name_ar AS "nameAr", vt.name_en AS "nameEn", vt.category, vt.calc_method AS "calcMethod",
              vt.default_amount AS "defaultAmount", vt.default_rate AS "defaultRate", vt.default_multiplier AS "defaultMultiplier",
              vt.is_taxable AS "isTaxable", vt.affects_profitability AS "affectsProfitability",
              vt.debit_account_id AS "debitAccountId", vt.credit_account_id AS "creditAccountId",
              vt.is_active AS "isActive", vt.notes, vt.created_at AS "createdAt", vt.updated_at AS "updatedAt", vt.row_version AS "rowVersion"
         FROM pay.variable_types vt WHERE vt.company_id = $1 AND vt.id = $2`,
      [companyId, id],
    );
    if (!vt) throw new NotFoundError('VariableType', id);
    return vt;
  }

  async createVariableType(companyId: string, input: z.infer<typeof VariableTypeCreate>) {
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO pay.variable_types
         (company_id, code, name_ar, name_en, category, calc_method,
          default_amount, default_rate, default_multiplier,
          is_taxable, affects_profitability, debit_account_id, credit_account_id,
          is_active, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,sys.current_user_id(),sys.current_user_id())
       RETURNING id`,
      [
        companyId, input.code, input.nameAr, input.nameEn ?? null, input.category, input.calcMethod,
        input.defaultAmount ?? null, input.defaultRate ?? null, input.defaultMultiplier ?? null,
        input.isTaxable, input.affectsProfitability, input.debitAccountId ?? null, input.creditAccountId ?? null,
        input.isActive, input.notes ?? null,
      ],
    );
    return this.getVariableType(companyId, row!.id);
  }

  async updateVariableType(companyId: string, id: string, input: z.infer<typeof VariableTypeUpdate>, rowVersion?: number) {
    const COLS: Record<string, string> = {
      code: 'code', nameAr: 'name_ar', nameEn: 'name_en', category: 'category', calcMethod: 'calc_method',
      defaultAmount: 'default_amount', defaultRate: 'default_rate', defaultMultiplier: 'default_multiplier',
      isTaxable: 'is_taxable', affectsProfitability: 'affects_profitability',
      debitAccountId: 'debit_account_id', creditAccountId: 'credit_account_id', isActive: 'is_active', notes: 'notes',
    };
    const fields = Object.keys(COLS).filter((k) => (input as any)[k] !== undefined);
    if (!fields.length) return this.getVariableType(companyId, id);
    const params: unknown[] = [companyId, id];
    const sets = fields.map((f) => { params.push((input as any)[f]); return `${COLS[f]} = $${params.length}`; });
    let verSql = '';
    if (rowVersion !== undefined) { params.push(rowVersion); verSql = ` AND row_version = $${params.length}`; }
    const r = await this.db.query(
      `UPDATE pay.variable_types SET ${sets.join(', ')}, updated_by = sys.current_user_id(), row_version = row_version + 1
        WHERE company_id = $1 AND id = $2${verSql} RETURNING id`,
      params,
    );
    if (!r.length) { await this.getVariableType(companyId, id); throw new DomainError('VERSION_CONFLICT', undefined, 409); }
    return this.getVariableType(companyId, id);
  }

  async deleteVariableType(companyId: string, id: string) {
    const used = await this.db.one(
      `SELECT 1 FROM pay.monthly_variables WHERE company_id = $1 AND variable_type_id = $2 LIMIT 1`,
      [companyId, id],
    );
    if (used) throw new DomainError('REFERENCED', 'نوع المتغير مستخدم في سطور متغيرات شهرية', 409);
    const r = await this.db.query('DELETE FROM pay.variable_types WHERE company_id = $1 AND id = $2 RETURNING id', [companyId, id]);
    if (!r.length) throw new NotFoundError('VariableType', id);
  }

  // ---------------------------------------------------------------- monthly variables

  private async computeAmount(
    companyId: string,
    input: z.infer<typeof MonthlyVariableCreate>,
    vt: { calc_method: string; default_amount: string | null; default_rate: string | null; default_multiplier: string | null },
  ): Promise<string> {
    const rate = input.rate ?? vt.default_rate ?? '0';
    const multiplier = input.multiplier ?? vt.default_multiplier ?? '1';
    switch (vt.calc_method) {
      case 'FIXED':
        return toDbAmount(D(input.amount ?? vt.default_amount ?? '0'));
      case 'HOURS_RATE':
        return toDbAmount(D(input.hours ?? '0').times(D(rate)).times(D(multiplier)));
      case 'DAYS_RATE':
        return toDbAmount(D(input.days ?? '0').times(D(rate)).times(D(multiplier)));
      case 'PCT_BASIC': {
        // fetch current basic salary
        const sal = await this.db.one<{ basic_salary: string }>(
          `SELECT c.basic_salary FROM hr.employee_compensations c
            WHERE c.company_id = $1 AND c.employee_id = $2
              AND c.effective_from <= now()::date AND (c.effective_to IS NULL OR c.effective_to >= now()::date)
           ORDER BY c.effective_from DESC LIMIT 1`,
          [companyId, input.employeeId],
        );
        if (!sal) throw new DomainError('EMPLOYEE_SALARY_NOT_FOUND', 'لا يوجد راتب أساسي للموظف في هذه الفترة');
        const pct = D(input.amount ?? vt.default_amount ?? '0'); // amount field holds the percentage
        return toDbAmount(D(sal.basic_salary).times(pct).div(100).times(D(multiplier)));
      }
      default:
        return toDbAmount(D(input.amount ?? '0'));
    }
  }

  async listMonthlyVariables(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['mv.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q['periodId']) { params.push(q['periodId']); where.push(`mv.fiscal_period_id = $${params.length}`); }
    if (q['employeeId']) { params.push(q['employeeId']); where.push(`mv.employee_id = $${params.length}`); }
    if (q['status']) { params.push(q['status']); where.push(`mv.status = $${params.length}`); }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM pay.monthly_variables mv WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT mv.id, mv.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              mv.employee_id AS "employeeId", e.full_name_ar AS "employeeName",
              mv.variable_type_id AS "variableTypeId", vt.name_ar AS "variableTypeName", vt.category,
              mv.project_id AS "projectId", p.name_ar AS "projectName",
              mv.amount, mv.hours, mv.days, mv.rate, mv.multiplier,
              mv.computed_amount AS "computedAmount", mv.currency_code AS "currencyCode",
              mv.exchange_rate AS "exchangeRate", mv.notes, mv.status,
              mv.approved_by AS "approvedBy", mv.approved_at AS "approvedAt",
              mv.created_at AS "createdAt", mv.row_version AS "rowVersion"
         FROM pay.monthly_variables mv
         JOIN core.fiscal_periods fp ON fp.id = mv.fiscal_period_id
         JOIN hr.employees e ON e.id = mv.employee_id
         JOIN pay.variable_types vt ON vt.id = mv.variable_type_id
         LEFT JOIN prj.projects p ON p.id = mv.project_id
        WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { createdAt: 'mv.created_at', employeeName: 'e.full_name_ar' }, 'mv.created_at DESC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async getMonthlyVariable(companyId: string, id: string) {
    const mv = await this.db.one(
      `SELECT mv.id, mv.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              mv.employee_id AS "employeeId", e.full_name_ar AS "employeeName",
              mv.variable_type_id AS "variableTypeId", vt.name_ar AS "variableTypeName", vt.category, vt.calc_method AS "calcMethod",
              mv.project_id AS "projectId",
              mv.amount, mv.hours, mv.days, mv.rate, mv.multiplier,
              mv.computed_amount AS "computedAmount", mv.currency_code AS "currencyCode",
              mv.exchange_rate AS "exchangeRate", mv.notes, mv.status,
              mv.approved_by AS "approvedBy", mv.approved_at AS "approvedAt",
              mv.journal_entry_id AS "journalEntryId",
              mv.created_at AS "createdAt", mv.updated_at AS "updatedAt", mv.row_version AS "rowVersion"
         FROM pay.monthly_variables mv
         JOIN core.fiscal_periods fp ON fp.id = mv.fiscal_period_id
         JOIN hr.employees e ON e.id = mv.employee_id
         JOIN pay.variable_types vt ON vt.id = mv.variable_type_id
        WHERE mv.company_id = $1 AND mv.id = $2`,
      [companyId, id],
    );
    if (!mv) throw new NotFoundError('MonthlyVariable', id);
    return mv;
  }

  async createMonthlyVariable(companyId: string, input: z.infer<typeof MonthlyVariableCreate>) {
    return this.db.tx(async () => {
      // validate employee and period exist
      const emp = await this.db.one<{ id: string }>('SELECT id FROM hr.employees WHERE company_id = $1 AND id = $2', [companyId, input.employeeId]);
      if (!emp) throw new NotFoundError('Employee', input.employeeId);
      const period = await this.db.one<{ id: string; status: string }>('SELECT id, status FROM core.fiscal_periods WHERE company_id = $1 AND id = $2', [companyId, input.fiscalPeriodId]);
      if (!period) throw new NotFoundError('FiscalPeriod', input.fiscalPeriodId);
      if (period.status !== 'OPEN') throw new DomainError('PERIOD_NOT_OPEN', 'الفترة المالية غير مفتوحة');
      const vt = await this.db.one<{ id: string; calc_method: string; default_amount: string | null; default_rate: string | null; default_multiplier: string | null; is_active: boolean }>(
        'SELECT id, calc_method, default_amount, default_rate, default_multiplier, is_active FROM pay.variable_types WHERE company_id = $1 AND id = $2',
        [companyId, input.variableTypeId],
      );
      if (!vt) throw new NotFoundError('VariableType', input.variableTypeId);
      if (!vt.is_active) throw new DomainError('VARIABLE_TYPE_INACTIVE', 'نوع المتغير غير نشط');
      const computedAmount = await this.computeAmount(companyId, input, vt);
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO pay.monthly_variables
           (company_id, fiscal_period_id, employee_id, variable_type_id, project_id,
            amount, hours, days, rate, multiplier, computed_amount,
            currency_code, exchange_rate, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,sys.current_user_id(),sys.current_user_id())
         RETURNING id`,
        [
          companyId, input.fiscalPeriodId, input.employeeId, input.variableTypeId, input.projectId ?? null,
          input.amount ?? null, input.hours ?? null, input.days ?? null, input.rate ?? null, input.multiplier ?? null,
          computedAmount, input.currencyCode, input.exchangeRate, input.notes ?? null,
        ],
      );
      return this.getMonthlyVariable(companyId, row!.id);
    });
  }

  async updateMonthlyVariable(companyId: string, id: string, input: z.infer<typeof MonthlyVariableUpdate>) {
    return this.db.tx(async () => {
      const existing = await this.db.one<{ status: string; variable_type_id: string; employee_id: string; calc_method: string; default_amount: string | null; default_rate: string | null; default_multiplier: string | null }>(
        `SELECT mv.status, mv.variable_type_id, mv.employee_id,
                vt.calc_method, vt.default_amount, vt.default_rate, vt.default_multiplier
           FROM pay.monthly_variables mv
           JOIN pay.variable_types vt ON vt.id = mv.variable_type_id
          WHERE mv.company_id = $1 AND mv.id = $2 FOR UPDATE`,
        [companyId, id],
      );
      if (!existing) throw new NotFoundError('MonthlyVariable', id);
      if (existing.status !== 'DRAFT') throw new DomainError('VARIABLE_NOT_DRAFT', 'يمكن التعديل على المتغيرات المسودة فقط');
      // recompute if any quantity-affecting field changed
      const mergedInput = { ...input, employeeId: existing.employee_id };
      const newAmount = await this.computeAmount(companyId, mergedInput as any, existing);
      const COLS: Record<string, string> = {
        amount: 'amount', hours: 'hours', days: 'days', rate: 'rate', multiplier: 'multiplier',
        projectId: 'project_id', currencyCode: 'currency_code', exchangeRate: 'exchange_rate', notes: 'notes',
      };
      const fields = Object.keys(COLS).filter((k) => (input as any)[k] !== undefined);
      const params: unknown[] = [companyId, id, newAmount];
      const sets = [`computed_amount = $3`, ...fields.map((f) => { params.push((input as any)[f]); return `${COLS[f]} = $${params.length}`; })];
      await this.db.query(`UPDATE pay.monthly_variables SET ${sets.join(', ')}, updated_by = sys.current_user_id() WHERE company_id = $1 AND id = $2`, params);
      return this.getMonthlyVariable(companyId, id);
    });
  }

  async approveMonthlyVariable(companyId: string, id: string) {
    return this.db.tx(async () => {
      const mv = await this.db.one<{ status: string }>('SELECT status FROM pay.monthly_variables WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
      if (!mv) throw new NotFoundError('MonthlyVariable', id);
      if (mv.status !== 'DRAFT') throw new DomainError('VARIABLE_NOT_DRAFT', 'يمكن اعتماد المتغيرات المسودة فقط');
      await this.db.query(
        `UPDATE pay.monthly_variables SET status = 'APPROVED', approved_by = sys.current_user_id(), approved_at = now(), updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $2`,
        [companyId, id],
      );
      return this.getMonthlyVariable(companyId, id);
    });
  }

  async deleteMonthlyVariable(companyId: string, id: string) {
    const mv = await this.db.one<{ status: string }>('SELECT status FROM pay.monthly_variables WHERE company_id = $1 AND id = $2', [companyId, id]);
    if (!mv) throw new NotFoundError('MonthlyVariable', id);
    if (mv.status !== 'DRAFT') throw new DomainError('VARIABLE_NOT_DRAFT', 'يمكن حذف المتغيرات المسودة فقط');
    await this.db.query('DELETE FROM pay.monthly_variables WHERE company_id = $1 AND id = $2', [companyId, id]);
  }
}
