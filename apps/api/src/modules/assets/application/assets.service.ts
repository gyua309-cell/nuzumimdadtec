import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { CrudConfig, CrudRepository } from '../../../shared/crud';
import { endSeries, supersede } from '../../../shared/effective';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { decimalString, isoDate, ListQuery, nonNegativeDecimal, offset, orderBy, Page, positiveDecimal } from '../../../shared/http/common';
import { D } from '../../../shared/money';
import { PostingEngine } from '../../accounting/application/posting-engine';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';
import { depreciationEnd, depreciationSchedule } from '../domain/depreciation';

const optUuid = z.string().uuid().nullable().optional();

// ------------------------------------------------------------------ categories
export const ASSET_CATEGORIES: CrudConfig = {
  entity: 'AssetCategory',
  table: 'ast.asset_categories',
  columns: {
    id: 'id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', assetAccountId: 'asset_account_id', accumAccountId: 'accum_account_id',
    expenseAccountId: 'expense_account_id', defaultUsefulLifeMonths: 'default_useful_life_months', defaultMethod: 'default_method',
    includeInEmployeeCost: 'include_in_employee_cost', isActive: 'is_active', rowVersion: 'row_version',
  },
  writable: ['code', 'nameAr', 'nameEn', 'assetAccountId', 'accumAccountId', 'expenseAccountId', 'defaultUsefulLifeMonths', 'defaultMethod', 'includeInEmployeeCost', 'isActive'],
  searchColumns: ['code', 'name_ar', 'name_en'],
  sortable: { code: 't.code', nameAr: 't.name_ar' },
  defaultSort: 't.code ASC',
  filterable: ['isActive'],
};
export const CategoryCreate = z.object({
  code: z.string().trim().min(1).max(30),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  assetAccountId: z.string().uuid(),
  accumAccountId: z.string().uuid(),
  expenseAccountId: z.string().uuid(),
  defaultUsefulLifeMonths: z.number().int().positive().max(1200).nullable().optional(),
  defaultMethod: z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE']).optional(),
  includeInEmployeeCost: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ------------------------------------------------------------------ assets
const assetFields = {
  assetNo: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  categoryId: z.string().uuid(),
  assetKind: z.enum(['LAPTOP', 'DEVICE', 'EQUIPMENT', 'VEHICLE', 'FURNITURE', 'OTHER']).default('EQUIPMENT'),
  serialNo: z.string().trim().max(100).nullable().optional(),
  purchaseDate: isoDate,
  acquisitionCost: positiveDecimal,
  currencyCode: z.string().trim().length(3).toUpperCase(),
  /** fixed by the purchase document; resolved from the rate table when omitted */
  exchangeRate: positiveDecimal.nullable().optional(),
  residualValueBase: nonNegativeDecimal.default('0'),
  usefulLifeMonths: z.number().int().positive().max(1200).nullable().optional(),
  depreciationMethod: z.enum(['STRAIGHT_LINE', 'DECLINING_BALANCE']).nullable().optional(),
  decliningRatePct: decimalString.nullable().optional(),
  depreciationStart: isoDate.nullable().optional(),
  branchId: optUuid,
  costCenterId: optUuid,
  notes: z.string().trim().max(2000).nullable().optional(),
};
export const AssetCreate = z.object(assetFields);
export const AssetUpdate = z
  .object({ ...assetFields, assetKind: assetFields.assetKind.optional(), residualValueBase: nonNegativeDecimal.optional() })
  .partial()
  .extend({ rowVersion: z.number().int().positive().optional() });
export const AssetActivate = z
  .object({
    /** BANK = paid from a bank/cash account; NONE = already capitalised (opening balance / supplier bill) */
    funding: z.enum(['BANK', 'NONE']),
    bankAccountId: optUuid,
    entryDate: isoDate.nullable().optional(),
    reason: z.string().trim().min(3).max(1000).nullable().optional(),
  })
  .refine((v) => v.funding !== 'BANK' || !!v.bankAccountId, { path: ['bankAccountId'], message: 'Bank account is required' })
  .refine((v) => v.funding !== 'NONE' || !!v.reason, { path: ['reason'], message: 'Reason is required' });
export const CustodyAssign = z.object({ employeeId: z.string().uuid(), effectiveFrom: isoDate, notes: z.string().trim().max(1000).nullable().optional() });
export const CustodyReturn = z.object({ effectiveTo: isoDate });
export const AssetDispose = z.object({
  disposalDate: isoDate,
  proceedsBase: nonNegativeDecimal.default('0'),
  bankAccountId: optUuid,
  reason: z.string().trim().min(3).max(1000),
});

const COLS: Record<string, string> = {
  assetNo: 'asset_no', name: 'name', categoryId: 'category_id', assetKind: 'asset_kind', serialNo: 'serial_no', purchaseDate: 'purchase_date',
  acquisitionCost: 'acquisition_cost', currencyCode: 'currency_code', exchangeRate: 'exchange_rate', costBase: 'cost_base',
  residualValueBase: 'residual_value_base', usefulLifeMonths: 'useful_life_months', depreciationMethod: 'depreciation_method',
  decliningRatePct: 'declining_rate_pct', depreciationStart: 'depreciation_start', depreciationEnd: 'depreciation_end', branchId: 'branch_id',
  costCenterId: 'cost_center_id', notes: 'notes',
};
const SELECT = `a.id, ${Object.entries(COLS).map(([k, c]) => `a.${c} AS "${k}"`).join(', ')}, a.status, a.disposal_date AS "disposalDate",
  a.disposal_proceeds_base AS "disposalProceedsBase", a.disposal_reason AS "disposalReason", a.acquisition_entry_id AS "acquisitionEntryId",
  a.disposal_entry_id AS "disposalEntryId", a.row_version AS "rowVersion", cat.code AS "categoryCode", cat.name_ar AS "categoryName",
  cat.include_in_employee_cost AS "includeInEmployeeCost"`;

/**
 * Fixed assets: categories (account configuration), draft -> active
 * (acquisition journal), custody history (feeds employee cost), schedule,
 * disposal (disposal journal with gain / loss).
 */
@Injectable()
export class AssetsService {
  readonly categories: CrudRepository;

  constructor(
    private readonly db: DbService,
    private readonly fx: ExchangeRateService,
    private readonly posting: PostingEngine,
  ) {
    this.categories = new CrudRepository(db, ASSET_CATEGORIES);
  }

  // ------------------------------------------------------------ categories
  private async assertAccounts(companyId: string, ids: Array<[string, string | null | undefined]>) {
    for (const [field, id] of ids) {
      if (!id) continue;
      const a = await this.db.one<{ is_posting: boolean; is_active: boolean }>('SELECT is_posting, is_active FROM acc.accounts WHERE company_id = $1 AND id = $2', [
        companyId,
        id,
      ]);
      if (!a) throw new DomainError('VALIDATION_FAILED', 'Account not found', 422, [{ path: field, message: 'Account not found' }]);
      if (!a.is_posting || !a.is_active) throw new DomainError('NON_POSTING_ACCOUNT', undefined, 422, [{ path: field, message: 'Posting, active account required' }]);
    }
  }

  async createCategory(companyId: string, input: z.infer<typeof CategoryCreate>) {
    await this.assertAccounts(companyId, [['assetAccountId', input.assetAccountId], ['accumAccountId', input.accumAccountId], ['expenseAccountId', input.expenseAccountId]]);
    return this.categories.create(companyId, input);
  }

  async updateCategory(companyId: string, id: string, input: Partial<z.infer<typeof CategoryCreate>>, rowVersion?: number) {
    await this.assertAccounts(companyId, [['assetAccountId', input.assetAccountId], ['accumAccountId', input.accumAccountId], ['expenseAccountId', input.expenseAccountId]]);
    return this.categories.update(companyId, id, input, rowVersion);
  }

  // ------------------------------------------------------------ reads
  async list(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const params: unknown[] = [companyId];
    const where = ['a.company_id = $1'];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(a.asset_no ILIKE $${params.length} OR a.name ILIKE $${params.length} OR a.serial_no ILIKE $${params.length})`);
    }
    for (const [key, col] of [['status', 'a.status'], ['categoryId', 'a.category_id'], ['assetKind', 'a.asset_kind']] as const) {
      if (q[key]) {
        params.push(q[key]);
        where.push(`${col} = $${params.length}`);
      }
    }
    if (q.employeeId) {
      params.push(q.employeeId);
      where.push(`cu.employee_id = $${params.length}`);
    }
    const from = `FROM ast.assets a JOIN ast.asset_categories cat ON cat.id = a.category_id
      LEFT JOIN LATERAL (SELECT c.employee_id, c.effective_from FROM ast.asset_custodies c WHERE c.asset_id = a.id AND c.effective_from <= current_date
                          AND (c.effective_to IS NULL OR c.effective_to >= current_date) LIMIT 1) cu ON true
      LEFT JOIN hr.employees e ON e.id = cu.employee_id
      LEFT JOIN LATERAL (SELECT COALESCE(sum(l.amount_base), 0) AS accumulated FROM ast.depreciation_lines l
                           JOIN ast.depreciation_runs r ON r.id = l.run_id AND r.status = 'POSTED' WHERE l.asset_id = a.id) dep ON true
      WHERE ${where.join(' AND ')}`;
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n ${from}`, params);
    const rows = await this.db.query(
      `SELECT ${SELECT}, cu.employee_id AS "custodianId", e.full_name_ar AS "custodianName", e.code AS "custodianCode",
              dep.accumulated AS "accumulatedBase", (a.cost_base - dep.accumulated) AS "netBookValueBase"
         ${from}
        ORDER BY ${orderBy(q.sort, { assetNo: 'a.asset_no', name: 'a.name', purchaseDate: 'a.purchase_date', status: 'a.status' }, 'a.asset_no ASC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string): Promise<any> {
    const a = await this.db.one(`SELECT ${SELECT} FROM ast.assets a JOIN ast.asset_categories cat ON cat.id = a.category_id WHERE a.company_id = $1 AND a.id = $2`, [
      companyId,
      id,
    ]);
    if (!a) throw new NotFoundError('Asset', id);
    const custodies = await this.db.query(
      `SELECT c.id, c.employee_id AS "employeeId", e.code AS "employeeCode", e.full_name_ar AS "employeeName",
              c.effective_from AS "effectiveFrom", c.effective_to AS "effectiveTo", c.notes
         FROM ast.asset_custodies c JOIN hr.employees e ON e.id = c.employee_id
        WHERE c.company_id = $1 AND c.asset_id = $2 ORDER BY c.effective_from DESC`,
      [companyId, id],
    );
    const schedule = await this.schedule(companyId, id, a);
    return { ...a, custodies, ...schedule };
  }

  /** Planned schedule merged with what has actually been posted. */
  async schedule(
    companyId: string,
    id: string,
    asset?: any,
  ): Promise<{ schedule: Array<Record<string, unknown>>; accumulatedBase: string; netBookValueBase: string; baseCurrency: string }> {
    const a: any = asset ?? (await this.get(companyId, id));
    const base = await this.fx.baseCurrency(companyId);
    const posted = await this.db.query<{ month: string; amount: string; run_id: string; run_no: string }>(
      `SELECT l.month, sum(l.amount_base) AS amount, l.run_id, r.run_no FROM ast.depreciation_lines l
         JOIN ast.depreciation_runs r ON r.id = l.run_id AND r.status = 'POSTED'
        WHERE l.company_id = $1 AND l.asset_id = $2 GROUP BY l.month, l.run_id, r.run_no ORDER BY l.month`,
      [companyId, id],
    );
    const byMonth = new Map(posted.map((p) => [p.month, p]));
    const rows = depreciationSchedule(
      {
        costBase: a.costBase, residualValueBase: a.residualValueBase, usefulLifeMonths: Number(a.usefulLifeMonths), method: a.depreciationMethod,
        decliningRatePct: a.decliningRatePct, depreciationStart: a.depreciationStart, disposalDate: a.disposalDate,
      },
      base.decimals,
    ).map((r) => ({ ...r, posted: byMonth.has(r.month), runId: byMonth.get(r.month)?.run_id ?? null, runNo: byMonth.get(r.month)?.run_no ?? null }));
    const accumulated = posted.reduce((s, p) => s.plus(p.amount), D(0));
    return {
      schedule: rows,
      accumulatedBase: accumulated.toFixed(4),
      netBookValueBase: D(a.costBase).minus(accumulated).toFixed(4),
      baseCurrency: base.code,
    };
  }

  // ------------------------------------------------------------ draft maintenance
  private async derive(companyId: string, input: Record<string, any>): Promise<Record<string, any>> {
    const cat = await this.db.one<{ default_useful_life_months: number | null; default_method: string; is_active: boolean }>(
      'SELECT default_useful_life_months, default_method, is_active FROM ast.asset_categories WHERE company_id = $1 AND id = $2',
      [companyId, input.categoryId],
    );
    if (!cat) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'categoryId', message: 'Category not found' }]);
    if (!cat.is_active) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'categoryId', message: 'Category is inactive' }]);
    const life = input.usefulLifeMonths ?? cat.default_useful_life_months;
    if (!life) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'usefulLifeMonths', message: 'Useful life is required' }]);
    const method = input.depreciationMethod ?? cat.default_method;
    if (method === 'DECLINING_BALANCE' && !(Number(input.decliningRatePct) > 0)) {
      throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'decliningRatePct', message: 'Declining rate is required' }]);
    }
    const base = await this.fx.baseCurrency(companyId);
    const rate = input.exchangeRate ? D(input.exchangeRate) : (await this.fx.toBase(companyId, input.currencyCode, input.purchaseDate, 'SPOT')).rate;
    const costBase = D(input.acquisitionCost).times(rate).toDecimalPlaces(base.decimals);
    if (D(input.residualValueBase ?? 0).greaterThanOrEqualTo(costBase)) {
      throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'residualValueBase', message: 'Residual value must be less than cost' }]);
    }
    const start = input.depreciationStart ?? input.purchaseDate;
    if (start < input.purchaseDate) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'depreciationStart', message: 'Must be on/after purchase date' }]);
    return {
      ...input,
      usefulLifeMonths: life,
      depreciationMethod: method,
      decliningRatePct: method === 'DECLINING_BALANCE' ? input.decliningRatePct : null,
      exchangeRate: rate.toFixed(10),
      costBase: costBase.toFixed(4),
      depreciationStart: start,
      depreciationEnd: depreciationEnd(start, life),
    };
  }

  async create(companyId: string, input: z.infer<typeof AssetCreate>) {
    return this.db.tx(async () => {
      const v = await this.derive(companyId, input);
      const fields = Object.keys(COLS).filter((k) => v[k] !== undefined);
      const cols = ['company_id', 'status', ...fields.map((f) => COLS[f])];
      const params = [companyId, 'DRAFT', ...fields.map((f) => v[f])];
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO ast.assets (${cols.join(', ')}, created_by, updated_by)
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        params,
      );
      return this.get(companyId, row!.id);
    });
  }

  private async lock(companyId: string, id: string) {
    const a = await this.db.one<any>(
      `SELECT id, status, category_id, asset_no, name, asset_kind, purchase_date, acquisition_cost, currency_code, exchange_rate, cost_base, residual_value_base,
              useful_life_months, depreciation_method, declining_rate_pct, depreciation_start, branch_id, cost_center_id, disposal_date
         FROM ast.assets WHERE company_id = $1 AND id = $2 FOR UPDATE`,
      [companyId, id],
    );
    if (!a) throw new NotFoundError('Asset', id);
    return a;
  }

  async update(companyId: string, id: string, input: z.infer<typeof AssetUpdate>) {
    return this.db.tx(async () => {
      const { rowVersion, ...data } = input;
      const cur = await this.lock(companyId, id);
      const financial = ['categoryId', 'purchaseDate', 'acquisitionCost', 'currencyCode', 'exchangeRate', 'residualValueBase', 'usefulLifeMonths', 'depreciationMethod', 'decliningRatePct', 'depreciationStart'];
      const touchesFinancials = financial.some((f) => (data as any)[f] !== undefined);
      if (cur.status !== 'DRAFT' && touchesFinancials) throw new DomainError('ASSET_FINANCIALS_LOCKED');
      let v: Record<string, any> = { ...data };
      if (touchesFinancials) {
        const merged = {
          categoryId: cur.category_id, purchaseDate: cur.purchase_date, acquisitionCost: cur.acquisition_cost, currencyCode: cur.currency_code,
          residualValueBase: cur.residual_value_base, usefulLifeMonths: cur.useful_life_months, depreciationMethod: cur.depreciation_method,
          decliningRatePct: cur.declining_rate_pct, depreciationStart: cur.depreciation_start,
          // keep a manually fixed rate unless currency/date changes
          exchangeRate: data.currencyCode || data.purchaseDate ? undefined : cur.exchange_rate,
          ...data,
        };
        v = { ...data, ...(await this.derive(companyId, merged)) };
      }
      const fields = Object.keys(COLS).filter((k) => v[k] !== undefined);
      if (fields.length === 0) return this.get(companyId, id);
      const params: unknown[] = [companyId, id];
      const sets = fields.map((f) => {
        params.push(v[f]);
        return `${COLS[f]} = $${params.length}`;
      });
      let ver = '';
      if (rowVersion !== undefined) {
        params.push(rowVersion);
        ver = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(`UPDATE ast.assets SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2${ver} RETURNING id`, params);
      if (r.length === 0) throw new DomainError('VERSION_CONFLICT', undefined, 409);
      return this.get(companyId, id);
    });
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      const a = await this.lock(companyId, id);
      if (a.status !== 'DRAFT') throw new DomainError('ASSET_NOT_DRAFT');
      await this.db.query('DELETE FROM ast.asset_custodies WHERE company_id = $1 AND asset_id = $2', [companyId, id]);
      await this.db.query('DELETE FROM ast.assets WHERE company_id = $1 AND id = $2', [companyId, id]);
    });
  }

  // ------------------------------------------------------------ lifecycle
  async activate(companyId: string, id: string, input: z.infer<typeof AssetActivate>) {
    return this.db.tx(
      async () => {
        const a = await this.lock(companyId, id);
        if (a.status !== 'DRAFT') throw new DomainError('ASSET_NOT_DRAFT');
        let entryId: string | null = null;
        if (input.funding === 'BANK') {
          entryId = await this.posting.post(companyId, {
            eventCode: 'ASSET.ACQUISITION',
            entryDate: input.entryDate ?? a.purchase_date,
            journalType: 'ASSET',
            description: `اقتناء أصل ${a.asset_no} - ${a.name}`,
            reference: a.asset_no,
            sourceModule: 'assets',
            sourceType: 'ASSET_ACQUISITION',
            sourceId: a.id,
            currencyCode: a.currency_code,
            exchangeRate: a.exchange_rate,
            context: { assetKind: a.asset_kind },
            items: [
              {
                key: 'COST',
                amount: a.acquisition_cost,
                dims: { assetId: a.id, branchId: a.branch_id, costCenterId: a.cost_center_id },
                refs: { assetCategoryId: a.category_id, bankAccountId: input.bankAccountId },
              },
            ],
          });
        }
        await this.db.query(`UPDATE ast.assets SET status = 'ACTIVE', acquisition_entry_id = $3 WHERE company_id = $1 AND id = $2`, [companyId, id, entryId]);
        return this.get(companyId, id);
      },
      { reason: input.reason ?? undefined },
    );
  }

  async assignCustody(companyId: string, id: string, input: z.infer<typeof CustodyAssign>) {
    return this.db.tx(async () => {
      const a = await this.lock(companyId, id);
      if (a.status === 'DISPOSED') throw new DomainError('ASSET_NOT_ACTIVE', 'Asset is disposed');
      const e = await this.db.one<{ hire_date: string; termination_date: string | null; status: string }>(
        'SELECT hire_date, termination_date, status FROM hr.employees WHERE company_id = $1 AND id = $2',
        [companyId, input.employeeId],
      );
      if (!e) throw new NotFoundError('Employee', input.employeeId);
      if (input.effectiveFrom < e.hire_date || (e.termination_date && input.effectiveFrom > e.termination_date)) throw new DomainError('EMPLOYEE_NOT_ACTIVE');
      if (input.effectiveFrom < a.purchase_date) throw new DomainError('VALIDATION_FAILED', 'Custody cannot start before purchase date');
      await supersede(this.db, { table: 'ast.asset_custodies', companyId, keys: { asset_id: id } }, input.effectiveFrom, {
        employee_id: input.employeeId,
        notes: input.notes ?? null,
      }, e.termination_date ?? null);
      return this.get(companyId, id);
    });
  }

  async returnCustody(companyId: string, id: string, effectiveTo: string) {
    await endSeries(this.db, { table: 'ast.asset_custodies', companyId, keys: { asset_id: id } }, effectiveTo);
    return this.get(companyId, id);
  }

  async removeCustody(companyId: string, id: string, custodyId: string) {
    await this.db.tx(async () => {
      const row = await this.db.one<{ is_latest: boolean }>(
        `SELECT c.effective_from = (SELECT max(effective_from) FROM ast.asset_custodies WHERE asset_id = $2) AS is_latest
           FROM ast.asset_custodies c WHERE c.company_id = $1 AND c.asset_id = $2 AND c.id = $3`,
        [companyId, id, custodyId],
      );
      if (!row) throw new NotFoundError('Custody', custodyId);
      if (!row.is_latest) throw new DomainError('ONLY_LATEST_VERSION_REMOVABLE');
      // custody corrections never re-open the previous holder automatically
      await this.db.query('DELETE FROM ast.asset_custodies WHERE id = $1', [custodyId]);
    });
    return this.get(companyId, id);
  }

  async dispose(companyId: string, id: string, input: z.infer<typeof AssetDispose>) {
    return this.db.tx(
      async () => {
        const a = await this.lock(companyId, id);
        if (!['ACTIVE', 'FULLY_DEPRECIATED'].includes(a.status)) throw new DomainError('ASSET_NOT_ACTIVE');
        if (input.disposalDate < a.purchase_date) throw new DomainError('VALIDATION_FAILED', 'Disposal before purchase date');
        const base = await this.fx.baseCurrency(companyId);
        const month = `${input.disposalDate.slice(0, 7)}-01`;
        const sched = depreciationSchedule(
          {
            costBase: a.cost_base, residualValueBase: a.residual_value_base, usefulLifeMonths: Number(a.useful_life_months), method: a.depreciation_method,
            decliningRatePct: a.declining_rate_pct, depreciationStart: a.depreciation_start,
          },
          base.decimals,
        );
        const posted = await this.db.query<{ month: string; amount: string }>(
          `SELECT l.month, sum(l.amount_base) AS amount FROM ast.depreciation_lines l JOIN ast.depreciation_runs r ON r.id = l.run_id AND r.status = 'POSTED'
            WHERE l.asset_id = $1 GROUP BY l.month`,
          [id],
        );
        const postedMonths = new Set(posted.map((p) => p.month));
        const missing = sched.filter((r) => r.month < month && !postedMonths.has(r.month)).map((r) => r.month);
        if (missing.length) throw new DomainError('DEPRECIATION_NOT_UP_TO_DATE', undefined, 422, { missingMonths: missing });
        if (posted.some((p) => p.month > month)) throw new DomainError('VALIDATION_FAILED', 'Depreciation is posted after the disposal month; cancel those runs first');
        const accumulated = posted.reduce((s, p) => s.plus(p.amount), D(0));
        const cost = D(a.cost_base);
        const nbv = cost.minus(accumulated);
        const proceeds = D(input.proceedsBase);
        if (proceeds.greaterThan(0) && !input.bankAccountId) throw new DomainError('VALIDATION_FAILED', undefined, 422, [{ path: 'bankAccountId', message: 'Bank account is required for proceeds' }]);
        const diff = proceeds.minus(nbv);
        const refs = { assetCategoryId: a.category_id, bankAccountId: input.bankAccountId ?? null };
        const dims = { assetId: a.id, branchId: a.branch_id, costCenterId: a.cost_center_id };
        const entryId = await this.posting.post(companyId, {
          eventCode: 'ASSET.DISPOSAL',
          entryDate: input.disposalDate,
          journalType: 'ASSET',
          description: `استبعاد أصل ${a.asset_no} - ${a.name}`,
          reference: a.asset_no,
          sourceModule: 'assets',
          sourceType: 'ASSET_DISPOSAL',
          sourceId: a.id,
          currencyCode: base.code,
          exchangeRate: '1',
          items: [
            { key: 'COST', amount: cost.toFixed(4), dims, refs },
            { key: 'ACCUMULATED', amount: accumulated.toFixed(4), dims, refs },
            { key: 'PROCEEDS', amount: proceeds.toFixed(4), dims, refs },
            { key: 'GAIN', amount: diff.greaterThan(0) ? diff.toFixed(4) : '0', dims, refs },
            { key: 'LOSS', amount: diff.lessThan(0) ? diff.abs().toFixed(4) : '0', dims, refs },
          ],
        });
        await this.db.query(
          `UPDATE ast.asset_custodies SET effective_to = $3, updated_by = sys.current_user_id()
            WHERE company_id = $1 AND asset_id = $2 AND (effective_to IS NULL OR effective_to > $3::date)`,
          [companyId, id, input.disposalDate],
        );
        await this.db.query(
          `UPDATE ast.assets SET status = 'DISPOSED', disposal_date = $3, disposal_proceeds_base = $4, disposal_reason = $5, disposal_entry_id = $6
            WHERE company_id = $1 AND id = $2`,
          [companyId, id, input.disposalDate, proceeds.toFixed(4), input.reason, entryId],
        );
        return this.get(companyId, id);
      },
      { reason: input.reason },
    );
  }
}
