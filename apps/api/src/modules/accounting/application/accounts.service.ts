import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/errors';

export const ACCOUNT_CLASSES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'DIRECT_COST', 'OPERATING_EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE'] as const;
export const ACCOUNT_SUBTYPES = ['CASH', 'BANK', 'RECEIVABLE', 'PAYABLE', 'EMPLOYEE_RECEIVABLE', 'PAYROLL_LIABILITY', 'TAX', 'FIXED_ASSET',
  'ACCUMULATED_DEPRECIATION', 'RETAINED_EARNINGS', 'OPENING_BALANCE', 'FX_GAIN_LOSS', 'ROUNDING', 'OVERHEAD_APPLIED', 'OVERHEAD_ABSORBED',
  'PREPAID', 'ACCRUED', 'OTHER'] as const;

/** Natural balance side per class (contra accounts invert it). */
export const NORMAL_BALANCE: Record<(typeof ACCOUNT_CLASSES)[number], 'DEBIT' | 'CREDIT'> = {
  ASSET: 'DEBIT', DIRECT_COST: 'DEBIT', OPERATING_EXPENSE: 'DEBIT', OTHER_EXPENSE: 'DEBIT',
  LIABILITY: 'CREDIT', EQUITY: 'CREDIT', REVENUE: 'CREDIT', OTHER_INCOME: 'CREDIT',
};

export const AccountCreate = z.object({
  parentId: z.string().uuid().nullable().optional(),
  code: z.string().trim().regex(/^[0-9A-Za-z._-]{1,30}$/),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  accountClass: z.enum(ACCOUNT_CLASSES),
  subtype: z.enum(ACCOUNT_SUBTYPES).nullable().optional(),
  isContra: z.boolean().default(false),
  currencyCode: z.string().trim().length(3).toUpperCase().nullable().optional(),
  isPosting: z.boolean().default(true),
  isControl: z.boolean().default(false),
  isActive: z.boolean().default(true),
  cashFlowCategory: z.enum(['CASH', 'OPERATING', 'INVESTING', 'FINANCING', 'NON_CASH']).nullable().optional(),
  requiresCostCenter: z.boolean().default(false),
  requiresProject: z.boolean().default(false),
  requiresEmployee: z.boolean().default(false),
  description: z.string().trim().max(1000).nullable().optional(),
});
export const AccountUpdate = AccountCreate.partial().extend({ rowVersion: z.number().int().optional() });
export type AccountCreateInput = z.infer<typeof AccountCreate>;

const FIELDS: Record<string, string> = {
  parentId: 'parent_id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', accountClass: 'account_class', subtype: 'subtype',
  isContra: 'is_contra', currencyCode: 'currency_code', isPosting: 'is_posting', isControl: 'is_control', isActive: 'is_active',
  cashFlowCategory: 'cash_flow_category', requiresCostCenter: 'requires_cost_center', requiresProject: 'requires_project',
  requiresEmployee: 'requires_employee', description: 'description',
};

const COLS = `a.id, a.parent_id AS "parentId", a.code, a.name_ar AS "nameAr", a.name_en AS "nameEn", a.account_class AS "accountClass",
  a.subtype, a.normal_balance AS "normalBalance", a.is_contra AS "isContra", a.currency_code AS "currencyCode",
  a.is_posting AS "isPosting", a.is_control AS "isControl", a.is_active AS "isActive", a.cash_flow_category AS "cashFlowCategory",
  a.requires_cost_center AS "requiresCostCenter", a.requires_project AS "requiresProject", a.requires_employee AS "requiresEmployee",
  a.level, a.description, a.row_version AS "rowVersion"`;

/** Chart of accounts (tree integrity enforced by DB triggers). */
@Injectable()
export class AccountsService {
  constructor(private readonly db: DbService) {}

  private normalBalance(cls: (typeof ACCOUNT_CLASSES)[number], contra: boolean): 'DEBIT' | 'CREDIT' {
    const n = NORMAL_BALANCE[cls];
    return contra ? (n === 'DEBIT' ? 'CREDIT' : 'DEBIT') : n;
  }

  /** Flat list ordered as a tree (depth-first by code), with posted-movement flag. */
  async tree(companyId: string, opts: { q?: string; activeOnly?: boolean; postingOnly?: boolean } = {}) {
    const params: unknown[] = [companyId];
    const where = ['a.company_id = $1'];
    if (opts.activeOnly) where.push('a.is_active');
    if (opts.postingOnly) where.push('a.is_posting');
    if (opts.q) {
      params.push(`%${opts.q}%`);
      where.push(`(a.code ILIKE $${params.length} OR a.name_ar ILIKE $${params.length} OR a.name_en ILIKE $${params.length})`);
    }
    return this.db.query(
      `WITH RECURSIVE ordered AS (
         SELECT a.id, ARRAY[a.code] AS sort_key FROM acc.accounts a WHERE a.company_id = $1 AND a.parent_id IS NULL
         UNION ALL
         SELECT c.id, o.sort_key || c.code FROM acc.accounts c JOIN ordered o ON c.parent_id = o.id
       )
       SELECT ${COLS},
              EXISTS (SELECT 1 FROM acc.journal_lines l WHERE l.account_id = a.id) AS "hasTransactions",
              EXISTS (SELECT 1 FROM acc.accounts ch WHERE ch.parent_id = a.id) AS "hasChildren"
         FROM acc.accounts a JOIN ordered o ON o.id = a.id
        WHERE ${where.join(' AND ')}
        ORDER BY o.sort_key`,
      params,
    );
  }

  async get(companyId: string, id: string) {
    const a = await this.db.one(`SELECT ${COLS} FROM acc.accounts a WHERE a.company_id = $1 AND a.id = $2`, [companyId, id]);
    if (!a) throw new NotFoundError('Account', id);
    return a;
  }

  async getByCode(companyId: string, code: string) {
    const a = await this.db.one(`SELECT ${COLS} FROM acc.accounts a WHERE a.company_id = $1 AND a.code = $2`, [companyId, code]);
    if (!a) throw new NotFoundError('Account', code);
    return a;
  }

  private async validateCurrency(companyId: string, code: string | null | undefined) {
    if (!code) return;
    const r = await this.db.one('SELECT 1 FROM core.company_currencies WHERE company_id = $1 AND currency_code = $2', [companyId, code]);
    if (!r) throw new DomainError('CURRENCY_NOT_ENABLED', `Currency ${code} is not enabled for this company`);
  }

  async create(companyId: string, input: AccountCreateInput) {
    return this.db.tx(async () => {
      await this.validateCurrency(companyId, input.currencyCode);
      if (input.isControl && !input.isPosting) throw new DomainError('CONTROL_ACCOUNT_MUST_BE_POSTING');
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO acc.accounts(company_id, parent_id, code, name_ar, name_en, account_class, subtype, normal_balance, is_contra,
                                  currency_code, is_posting, is_control, is_active, cash_flow_category, requires_cost_center,
                                  requires_project, requires_employee, description, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, sys.current_user_id(), sys.current_user_id())
         RETURNING id`,
        [companyId, input.parentId ?? null, input.code, input.nameAr, input.nameEn ?? null, input.accountClass, input.subtype ?? null,
          this.normalBalance(input.accountClass, input.isContra), input.isContra, input.currencyCode ?? null, input.isPosting,
          input.isControl, input.isActive, input.cashFlowCategory ?? null, input.requiresCostCenter, input.requiresProject,
          input.requiresEmployee, input.description ?? null],
      );
      return this.get(companyId, row!.id);
    });
  }

  async update(companyId: string, id: string, input: z.infer<typeof AccountUpdate>) {
    return this.db.tx(async () => {
      const current = await this.db.one<{ account_class: (typeof ACCOUNT_CLASSES)[number]; is_contra: boolean; currency_code: string | null }>(
        'SELECT account_class, is_contra, currency_code FROM acc.accounts WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!current) throw new NotFoundError('Account', id);
      if (input.currencyCode !== undefined && input.currencyCode !== current.currency_code) {
        await this.validateCurrency(companyId, input.currencyCode);
        const used = await this.db.one('SELECT 1 FROM acc.journal_lines WHERE account_id = $1 LIMIT 1', [id]);
        if (used) throw new DomainError('ACCOUNT_HAS_TRANSACTIONS', 'Currency cannot change after transactions', HttpStatus.CONFLICT);
      }
      const params: unknown[] = [companyId, id];
      const sets: string[] = [];
      for (const [f, c] of Object.entries(FIELDS)) {
        const v = (input as Record<string, unknown>)[f];
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${c} = $${params.length}`);
      }
      if (input.accountClass !== undefined || input.isContra !== undefined) {
        params.push(this.normalBalance(input.accountClass ?? current.account_class, input.isContra ?? current.is_contra));
        sets.push(`normal_balance = $${params.length}`);
      }
      if (!sets.length) return this.get(companyId, id);
      let ver = '';
      if (input.rowVersion !== undefined) {
        params.push(input.rowVersion);
        ver = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(`UPDATE acc.accounts SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2${ver} RETURNING id`, params);
      if (!r.length) throw new ConflictError('VERSION_CONFLICT');
      return this.get(companyId, id);
    });
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      await this.get(companyId, id);
      if (await this.db.one('SELECT 1 FROM acc.journal_lines WHERE account_id = $1 LIMIT 1', [id])) {
        throw new DomainError('ACCOUNT_HAS_TRANSACTIONS', undefined, HttpStatus.CONFLICT);
      }
      if (await this.db.one('SELECT 1 FROM acc.accounts WHERE parent_id = $1 LIMIT 1', [id])) {
        throw new DomainError('ACCOUNT_HAS_CHILDREN', undefined, HttpStatus.CONFLICT);
      }
      await this.db.query('DELETE FROM acc.accounts WHERE company_id = $1 AND id = $2', [companyId, id]);
    });
  }

  /**
   * Optional structure-only template used by the setup wizard (no balances, no
   * amounts). Accounts are created as ordinary editable records.
   */
  async importTemplate(companyId: string, rows: Array<AccountCreateInput & { parentCode?: string | null }>) {
    return this.db.tx(async () => {
      const existing = await this.db.one<{ n: string }>('SELECT count(*) n FROM acc.accounts WHERE company_id = $1', [companyId]);
      if (Number(existing?.n) > 0) throw new DomainError('COA_NOT_EMPTY', 'Chart of accounts already contains accounts', HttpStatus.CONFLICT);
      const ids = new Map<string, string>();
      for (const r of rows) {
        const parentId = r.parentCode ? ids.get(r.parentCode) : null;
        if (r.parentCode && !parentId) throw new DomainError('COA_TEMPLATE_INVALID', `Parent ${r.parentCode} must precede ${r.code}`);
        const created = await this.create(companyId, { ...AccountCreate.parse({ ...r, parentId }) });
        ids.set(r.code, (created as { id: string }).id);
      }
      return { created: ids.size };
    });
  }
}
