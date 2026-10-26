import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { CrudConfig, CrudRepository } from '../../../shared/crud';
import { endSeries, removeLatest, supersede } from '../../../shared/effective';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { isoDate, nonNegativeDecimal } from '../../../shared/http/common';

const optUuid = z.string().uuid().nullable().optional();
const currency = z.string().trim().length(3).toUpperCase();

export const POSITIONS: CrudConfig = {
  entity: 'Position',
  table: 'hr.positions',
  columns: { id: 'id', code: 'code', titleAr: 'title_ar', titleEn: 'title_en', isActive: 'is_active', createdAt: 'created_at', rowVersion: 'row_version' },
  writable: ['code', 'titleAr', 'titleEn', 'isActive'],
  searchColumns: ['code', 'title_ar', 'title_en'],
  sortable: { code: 't.code', titleAr: 't.title_ar' },
  defaultSort: 't.code ASC',
  filterable: ['isActive'],
};
export const PositionCreate = z.object({
  code: z.string().trim().min(1).max(30),
  titleAr: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const COST_COMPONENTS: CrudConfig = {
  entity: 'CostComponent',
  table: 'hr.cost_components',
  columns: {
    id: 'id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', componentType: 'component_type', nature: 'nature',
    calcMethod: 'calc_method', costBehavior: 'cost_behavior', profitabilityTreatment: 'profitability_treatment',
    postingTreatment: 'posting_treatment', taxTreatment: 'tax_treatment', taxablePct: 'taxable_pct', affectsNetPay: 'affects_net_pay',
    expenseAccountId: 'expense_account_id', liabilityAccountId: 'liability_account_id', sortOrder: 'sort_order',
    effectiveFrom: 'effective_from', effectiveTo: 'effective_to', isActive: 'is_active', description: 'description',
    createdAt: 'created_at', rowVersion: 'row_version',
  },
  writable: [
    'code', 'nameAr', 'nameEn', 'componentType', 'nature', 'calcMethod', 'costBehavior', 'profitabilityTreatment', 'postingTreatment',
    'taxTreatment', 'taxablePct', 'affectsNetPay', 'expenseAccountId', 'liabilityAccountId', 'sortOrder', 'effectiveFrom', 'effectiveTo',
    'isActive', 'description',
  ],
  searchColumns: ['code', 'name_ar', 'name_en'],
  sortable: { code: 't.code', nameAr: 't.name_ar', sortOrder: 't.sort_order' },
  defaultSort: 't.sort_order ASC, t.code ASC',
  filterable: ['isActive', 'componentType', 'nature', 'calcMethod'],
};

const componentBase = z.object({
  code: z.string().trim().min(1).max(30),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  componentType: z.enum(['SALARY', 'INSURANCE', 'MEDICAL', 'DEPRECIATION', 'COMPANY_COST', 'BENEFIT', 'ALLOWANCE', 'TAX', 'OTHER']),
  nature: z.enum(['EARNING', 'EMPLOYER_CONTRIB', 'EMPLOYEE_DEDUCTION', 'ACCRUAL', 'DEPRECIATION', 'NOTIONAL', 'TAX']),
  calcMethod: z.enum(['BASIC_SALARY', 'FIXED', 'PCT_BASIC', 'PCT_INSURANCE', 'PCT_GROSS', 'FROM_ASSETS']),
  costBehavior: z.enum(['FIXED', 'VARIABLE']).default('FIXED'),
  profitabilityTreatment: z.enum(['DISTRIBUTE', 'EXCLUDE']).default('DISTRIBUTE'),
  postingTreatment: z.enum(['PAYROLL', 'ACCRUAL', 'DEPRECIATION_SOURCE', 'NOTIONAL', 'NONE']),
  taxTreatment: z.enum(['TAXABLE', 'EXEMPT', 'PARTIAL', 'NOT_APPLICABLE']).default('NOT_APPLICABLE'),
  taxablePct: nonNegativeDecimal.nullable().optional(),
  affectsNetPay: z.boolean().default(false),
  expenseAccountId: optUuid,
  liabilityAccountId: optUuid,
  sortOrder: z.number().int().min(0).max(10000).default(100),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable().optional(),
  isActive: z.boolean().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});

/** Business consistency of a component definition (beyond DB checks). */
function validateComponent(c: Partial<z.infer<typeof componentBase>>) {
  const errors: Array<{ path: string; message: string }> = [];
  if (c.calcMethod === 'FROM_ASSETS' && c.nature !== 'DEPRECIATION') errors.push({ path: 'nature', message: 'FROM_ASSETS requires nature DEPRECIATION' });
  if (c.nature === 'DEPRECIATION' && c.calcMethod !== 'FROM_ASSETS') errors.push({ path: 'calcMethod', message: 'DEPRECIATION nature requires FROM_ASSETS' });
  if (c.nature === 'DEPRECIATION' && c.postingTreatment && !['DEPRECIATION_SOURCE', 'NONE'].includes(c.postingTreatment)) {
    errors.push({ path: 'postingTreatment', message: 'Depreciation is posted by the depreciation run (DEPRECIATION_SOURCE)' });
  }
  if (c.nature === 'NOTIONAL' && c.postingTreatment && !['NOTIONAL', 'NONE'].includes(c.postingTreatment)) {
    errors.push({ path: 'postingTreatment', message: 'Notional cost must use NOTIONAL posting' });
  }
  if (c.nature === 'EMPLOYEE_DEDUCTION' && c.profitabilityTreatment === 'DISTRIBUTE') {
    errors.push({ path: 'profitabilityTreatment', message: 'Employee deductions are not a company cost' });
  }
  if (c.nature === 'EARNING' && c.affectsNetPay === false && c.postingTreatment === 'PAYROLL') {
    errors.push({ path: 'affectsNetPay', message: 'Payroll earnings must affect net pay' });
  }
  if (['EMPLOYER_CONTRIB', 'ACCRUAL', 'EMPLOYEE_DEDUCTION', 'TAX'].includes(c.nature ?? '') && c.postingTreatment !== 'NONE' && c.liabilityAccountId === null) {
    errors.push({ path: 'liabilityAccountId', message: 'A liability account is required' });
  }
  if (c.taxTreatment === 'PARTIAL' && c.taxablePct == null) errors.push({ path: 'taxablePct', message: 'Taxable % is required' });
  if (
    c.postingTreatment && c.postingTreatment !== 'NONE' && c.nature && !['EMPLOYEE_DEDUCTION', 'TAX'].includes(c.nature) &&
    c.expenseAccountId == null
  ) {
    errors.push({ path: 'expenseAccountId', message: 'An expense account is required' });
  }
  if (c.effectiveTo && c.effectiveFrom && c.effectiveTo < c.effectiveFrom) errors.push({ path: 'effectiveTo', message: 'Must be after effectiveFrom' });
  if (errors.length) throw new DomainError('VALIDATION_FAILED', 'Invalid cost component', 422, errors);
}

export const ComponentCreate = componentBase.superRefine((v, ctx) => {
  try {
    validateComponent(v);
  } catch (e) {
    for (const err of ((e as DomainError).details as Array<{ path: string; message: string }>) ?? []) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [err.path], message: err.message });
    }
  }
});
export const ComponentUpdate = componentBase.partial();

export const ProfileCreate = z.object({
  code: z.string().trim().min(1).max(30),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});
export const PROFILES: CrudConfig = {
  entity: 'CostProfile',
  table: 'hr.cost_profiles',
  columns: { id: 'id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', description: 'description', isActive: 'is_active', rowVersion: 'row_version' },
  writable: ['code', 'nameAr', 'nameEn', 'description', 'isActive'],
  searchColumns: ['code', 'name_ar', 'name_en'],
  sortable: { code: 't.code', nameAr: 't.name_ar' },
  defaultSort: 't.code ASC',
  filterable: ['isActive'],
};

export const ProfileLineCreate = z
  .object({
    componentId: z.string().uuid(),
    ratePct: nonNegativeDecimal.nullable().optional(),
    amount: nonNegativeDecimal.nullable().optional(),
    currencyCode: currency.nullable().optional(),
    minAmount: nonNegativeDecimal.nullable().optional(),
    maxAmount: nonNegativeDecimal.nullable().optional(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().optional(),
  })
  .refine((v) => v.amount == null || !!v.currencyCode, { message: 'currencyCode is required with amount', path: ['currencyCode'] });

/**
 * Cost configuration: positions, cost components (fully configurable – no
 * component is hard-coded), cost profiles and their effective-dated lines.
 */
@Injectable()
export class CostConfigService {
  readonly components: CrudRepository;
  readonly profiles: CrudRepository;
  readonly positions: CrudRepository;

  constructor(private readonly db: DbService) {
    this.components = new CrudRepository(db, COST_COMPONENTS);
    this.profiles = new CrudRepository(db, PROFILES);
    this.positions = new CrudRepository(db, POSITIONS);
  }

  private async assertAccount(companyId: string, accountId: string | null | undefined, field: string) {
    if (!accountId) return;
    const a = await this.db.one<{ is_posting: boolean; is_active: boolean }>(
      'SELECT is_posting, is_active FROM acc.accounts WHERE company_id = $1 AND id = $2',
      [companyId, accountId],
    );
    if (!a) throw new DomainError('VALIDATION_FAILED', 'Account not found', 422, [{ path: field, message: 'Account not found' }]);
    if (!a.is_posting || !a.is_active) throw new DomainError('NON_POSTING_ACCOUNT', undefined, 422, [{ path: field, message: 'Posting, active account required' }]);
  }

  async createComponent(companyId: string, input: z.infer<typeof componentBase>) {
    await this.assertAccount(companyId, input.expenseAccountId, 'expenseAccountId');
    await this.assertAccount(companyId, input.liabilityAccountId, 'liabilityAccountId');
    return this.components.create(companyId, input);
  }

  async updateComponent(companyId: string, id: string, input: Partial<z.infer<typeof componentBase>>, rowVersion?: number) {
    const current = await this.components.get(companyId, id);
    const merged = { ...current, ...input };
    validateComponent(merged);
    await this.assertAccount(companyId, input.expenseAccountId, 'expenseAccountId');
    await this.assertAccount(companyId, input.liabilityAccountId, 'liabilityAccountId');
    // the calculation semantics of a component that already produced posted payroll cannot change
    if (input.calcMethod || input.nature) {
      const used = await this.db.one(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'pay' AND table_name = 'payroll_run_lines'`,
      );
      if (used) {
        const posted = await this.db.one(
          `SELECT 1 FROM pay.payroll_run_lines l JOIN pay.payroll_runs r ON r.id = l.run_id
            WHERE l.company_id = $1 AND l.component_id = $2 AND r.status = 'POSTED' LIMIT 1`,
          [companyId, id],
        );
        if (posted && (input.calcMethod !== current.calcMethod || input.nature !== current.nature)) {
          throw new DomainError('COMPONENT_IN_USE', 'Component used in posted payroll; create a new component instead');
        }
      }
    }
    return this.components.update(companyId, id, input, rowVersion);
  }

  // ------------------------------------------------------------- profiles
  async getProfile(companyId: string, id: string) {
    const profile = await this.profiles.get(companyId, id);
    const lines = await this.db.query(
      `SELECT l.id, l.component_id AS "componentId", c.code AS "componentCode", c.name_ar AS "componentName", c.nature, c.calc_method AS "calcMethod",
              l.rate_pct AS "ratePct", l.amount, l.currency_code AS "currencyCode", l.min_amount AS "minAmount", l.max_amount AS "maxAmount",
              l.effective_from AS "effectiveFrom", l.effective_to AS "effectiveTo"
         FROM hr.cost_profile_components l JOIN hr.cost_components c ON c.id = l.component_id
        WHERE l.company_id = $1 AND l.profile_id = $2 ORDER BY c.sort_order, c.code, l.effective_from DESC`,
      [companyId, id],
    );
    const employees = await this.db.one<{ n: string }>(
      `SELECT count(DISTINCT employee_id) AS n FROM hr.employee_cost_profiles WHERE company_id = $1 AND profile_id = $2
          AND (effective_to IS NULL OR effective_to >= current_date)`,
      [companyId, id],
    );
    return { ...profile, lines, activeEmployees: Number(employees?.n ?? 0) };
  }

  async addProfileLine(companyId: string, profileId: string, input: z.infer<typeof ProfileLineCreate>) {
    return this.db.tx(async () => {
      await this.profiles.get(companyId, profileId);
      const comp = await this.db.one<{ calc_method: string }>('SELECT calc_method FROM hr.cost_components WHERE company_id = $1 AND id = $2', [
        companyId,
        input.componentId,
      ]);
      if (!comp) throw new NotFoundError('CostComponent', input.componentId);
      const needsRate = ['PCT_BASIC', 'PCT_INSURANCE', 'PCT_GROSS'].includes(comp.calc_method);
      if (needsRate && input.ratePct == null) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'ratePct', message: 'Rate % is required' }]);
      if (comp.calc_method === 'FIXED' && input.amount == null) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'amount', message: 'Amount is required' }]);
      await supersede(
        this.db,
        { table: 'hr.cost_profile_components', companyId, keys: { profile_id: profileId, component_id: input.componentId } },
        input.effectiveFrom,
        {
          rate_pct: input.ratePct ?? null,
          amount: input.amount ?? null,
          currency_code: input.currencyCode ?? null,
          min_amount: input.minAmount ?? null,
          max_amount: input.maxAmount ?? null,
        },
        input.effectiveTo ?? null,
      );
      return this.getProfile(companyId, profileId);
    });
  }

  private async lineRef(companyId: string, profileId: string, lineId: string) {
    const l = await this.db.one<{ component_id: string }>(
      'SELECT component_id FROM hr.cost_profile_components WHERE company_id = $1 AND profile_id = $2 AND id = $3',
      [companyId, profileId, lineId],
    );
    if (!l) throw new NotFoundError('ProfileLine', lineId);
    return { table: 'hr.cost_profile_components', companyId, keys: { profile_id: profileId, component_id: l.component_id } };
  }

  async endProfileLine(companyId: string, profileId: string, lineId: string, effectiveTo: string) {
    await endSeries(this.db, await this.lineRef(companyId, profileId, lineId), effectiveTo);
    return this.getProfile(companyId, profileId);
  }

  async removeProfileLine(companyId: string, profileId: string, lineId: string) {
    await removeLatest(this.db, await this.lineRef(companyId, profileId, lineId), lineId);
    return this.getProfile(companyId, profileId);
  }
}
