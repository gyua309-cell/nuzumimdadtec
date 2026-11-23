import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import {
  ACCOUNT_STATEMENT_SECTIONS,
  computeHierarchicalBalances,
  inferCashFlowCategory,
  inferStatementSection,
  STATEMENT_TYPES,
  suggestNextAccountCode,
} from '../domain/financial-statements';

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
  statementSection: z.enum(ACCOUNT_STATEMENT_SECTIONS).nullable().optional(),
  statementLineId: z.string().uuid().nullable().optional(),
  equityLineId: z.string().uuid().nullable().optional(),
  requiresCostCenter: z.boolean().default(false),
  requiresProject: z.boolean().default(false),
  requiresEmployee: z.boolean().default(false),
  description: z.string().trim().max(1000).nullable().optional(),
});
export const AccountUpdate = AccountCreate.partial().extend({ rowVersion: z.number().int().optional() });
export type AccountCreateInput = z.infer<typeof AccountCreate>;

export const AccountMoveSchema = z.object({
  newParentId: z.string().uuid().nullable(),
  newCode: z.string().trim().regex(/^[0-9A-Za-z._-]{1,30}$/).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const AccountReclassifySchema = z.object({
  statementSection: z.enum(ACCOUNT_STATEMENT_SECTIONS).nullable().optional(),
  statementLineId: z.string().uuid().nullable().optional(),
  equityLineId: z.string().uuid().nullable().optional(),
  cashFlowCategory: z.enum(['CASH', 'OPERATING', 'INVESTING', 'FINANCING', 'NON_CASH']).nullable().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().trim().min(3).max(500),
});

export const StatementLineCreate = z.object({
  statementType: z.enum(STATEMENT_TYPES),
  sectionCode: z.string().trim().min(2).max(50),
  code: z.string().trim().regex(/^[0-9A-Za-z._-]{2,40}$/),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  normalSign: z.union([z.literal(1), z.literal(-1)]).default(1),
  sortOrder: z.number().int().min(1).max(9999).default(100),
  isActive: z.boolean().default(true),
  description: z.string().trim().max(1000).nullable().optional(),
});
export const StatementLineUpdate = StatementLineCreate.partial();

const FIELDS: Record<string, string> = {
  parentId: 'parent_id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', accountClass: 'account_class', subtype: 'subtype',
  isContra: 'is_contra', currencyCode: 'currency_code', isPosting: 'is_posting', isControl: 'is_control', isActive: 'is_active',
  cashFlowCategory: 'cash_flow_category', statementSection: 'statement_section', statementLineId: 'statement_line_id',
  equityLineId: 'equity_line_id', requiresCostCenter: 'requires_cost_center', requiresProject: 'requires_project',
  requiresEmployee: 'requires_employee', description: 'description',
};

const COLS = `a.id, a.parent_id AS "parentId", a.code, a.name_ar AS "nameAr", a.name_en AS "nameEn", a.account_class AS "accountClass",
  a.subtype, a.normal_balance AS "normalBalance", a.is_contra AS "isContra", a.currency_code AS "currencyCode",
  a.is_posting AS "isPosting", a.is_control AS "isControl", a.is_active AS "isActive", a.cash_flow_category AS "cashFlowCategory",
  a.statement_section AS "statementSection", a.statement_line_id AS "statementLineId", a.equity_line_id AS "equityLineId",
  sl.code AS "statementLineCode", sl.name_ar AS "statementLineNameAr",
  el.code AS "equityLineCode", el.name_ar AS "equityLineNameAr",
  pa.code AS "parentCode", pa.name_ar AS "parentNameAr",
  a.requires_cost_center AS "requiresCostCenter", a.requires_project AS "requiresProject", a.requires_employee AS "requiresEmployee",
  a.level, a.description, a.row_version AS "rowVersion"`;

const BASE_JOINS = `
  LEFT JOIN acc.statement_lines sl ON sl.id = a.statement_line_id AND sl.company_id = a.company_id
  LEFT JOIN acc.statement_lines el ON el.id = a.equity_line_id AND el.company_id = a.company_id
  LEFT JOIN acc.accounts pa ON pa.id = a.parent_id AND pa.company_id = a.company_id
`;

/** Chart of accounts + Dynamic Financial Statement Mapping (tree integrity enforced by DB triggers). */
@Injectable()
export class AccountsService {
  constructor(private readonly db: DbService) {}

  private normalBalance(cls: (typeof ACCOUNT_CLASSES)[number], contra: boolean): 'DEBIT' | 'CREDIT' {
    const n = NORMAL_BALANCE[cls];
    return contra ? (n === 'DEBIT' ? 'CREDIT' : 'DEBIT') : n;
  }

  async ensureStatementLines(companyId: string) {
    await this.db.query('SELECT acc.seed_default_statement_lines($1)', [companyId]);
  }

  private async resolveDefaultStatementLineId(companyId: string, sectionCode: string): Promise<string | null> {
    await this.ensureStatementLines(companyId);
    const r = await this.db.one<{ id: string }>(
      `SELECT id FROM acc.statement_lines
        WHERE company_id = $1 AND section_code = $2 AND statement_type IN ('BALANCE_SHEET', 'INCOME_STATEMENT') AND is_active
        ORDER BY sort_order ASC LIMIT 1`,
      [companyId, sectionCode],
    );
    return r?.id ?? null;
  }

  /** Hierarchical list ordered depth-first by code, enriched with rolled-up posted balances & statement mapping. */
  async tree(
    companyId: string,
    opts: {
      q?: string;
      accountClass?: string;
      statementSection?: string;
      cashFlowCategory?: string;
      activeOnly?: boolean;
      postingOnly?: boolean;
      headerOnly?: boolean;
      asOf?: string;
    } = {},
  ) {
    const allRows = await this.db.query<any>(
      `WITH RECURSIVE ordered AS (
         SELECT a.id, ARRAY[a.code] AS sort_key FROM acc.accounts a WHERE a.company_id = $1 AND a.parent_id IS NULL
         UNION ALL
         SELECT c.id, o.sort_key || c.code FROM acc.accounts c JOIN ordered o ON c.parent_id = o.id
       )
       SELECT ${COLS},
              EXISTS (SELECT 1 FROM acc.journal_lines l WHERE l.account_id = a.id) AS "hasTransactions",
              EXISTS (SELECT 1 FROM acc.accounts ch WHERE ch.parent_id = a.id) AS "hasChildren",
              (SELECT count(*)::int FROM acc.accounts ch WHERE ch.parent_id = a.id) AS "childrenCount"
         FROM acc.accounts a
         JOIN ordered o ON o.id = a.id
         ${BASE_JOINS}
        WHERE a.company_id = $1
        ORDER BY o.sort_key`,
      [companyId],
    );

    // Fetch posted leaf balances and roll them up cleanly (no double-counting)
    const balParams: unknown[] = [companyId];
    let dateCond = '';
    if (opts.asOf) {
      balParams.push(opts.asOf);
      dateCond = ` AND e.entry_date <= $2::date`;
    }
    const sums = await this.db.query<{ account_id: string; dr: string; cr: string }>(
      `SELECT l.account_id, COALESCE(SUM(l.debit_base), 0) AS dr, COALESCE(SUM(l.credit_base), 0) AS cr
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = 'FINANCIAL'${dateCond}
        GROUP BY l.account_id`,
      balParams,
    );
    const leafMap = new Map(sums.map((s) => [s.account_id, { debit: D(s.dr), credit: D(s.cr) }]));
    const rolled = computeHierarchicalBalances(allRows, leafMap);

    let enriched = allRows.map((a) => {
      const b = rolled.get(a.id) ?? { debit: D(0), credit: D(0), net: D(0) };
      const effectiveSection = inferStatementSection(a);
      const effectiveCf = inferCashFlowCategory(a);
      return {
        ...a,
        statementSection: a.statementSection ?? effectiveSection,
        cashFlowCategory: a.cashFlowCategory ?? effectiveCf,
        debitBase: b.debit.toFixed(2),
        creditBase: b.credit.toFixed(2),
        currentBalance: b.net.toFixed(2),
        currentBalanceBase: b.net.toFixed(2),
      };
    });

    if (opts.activeOnly) enriched = enriched.filter((a) => a.isActive);
    if (opts.postingOnly) enriched = enriched.filter((a) => a.isPosting);
    if (opts.headerOnly) enriched = enriched.filter((a) => !a.isPosting);
    if (opts.accountClass) enriched = enriched.filter((a) => a.accountClass === opts.accountClass);
    if (opts.statementSection) enriched = enriched.filter((a) => a.statementSection === opts.statementSection);
    if (opts.cashFlowCategory) enriched = enriched.filter((a) => a.cashFlowCategory === opts.cashFlowCategory);
    if (opts.q) {
      const term = opts.q.trim().toLowerCase();
      enriched = enriched.filter(
        (a) =>
          String(a.code || '').toLowerCase().includes(term) ||
          String(a.nameAr || '').toLowerCase().includes(term) ||
          String(a.nameEn || '').toLowerCase().includes(term),
      );
    }
    return enriched;
  }

  async get(companyId: string, id: string) {
    const a = await this.db.one(
      `SELECT ${COLS},
              EXISTS (SELECT 1 FROM acc.journal_lines l WHERE l.account_id = a.id) AS "hasTransactions",
              EXISTS (SELECT 1 FROM acc.accounts ch WHERE ch.parent_id = a.id) AS "hasChildren"
         FROM acc.accounts a
         ${BASE_JOINS}
        WHERE a.company_id = $1 AND a.id = $2`,
      [companyId, id],
    );
    if (!a) throw new NotFoundError('Account', id);
    return a;
  }

  async getByCode(companyId: string, code: string) {
    const a = await this.db.one(
      `SELECT ${COLS} FROM acc.accounts a ${BASE_JOINS} WHERE a.company_id = $1 AND a.code = $2`,
      [companyId, code],
    );
    if (!a) throw new NotFoundError('Account', code);
    return a;
  }

  async suggestCode(companyId: string, parentId?: string | null, accountClass?: string) {
    let parentCode: string | null = null;
    let level = 1;
    let inheritedClass = accountClass || 'ASSET';
    let inheritedSection: string | null = null;

    if (parentId) {
      const p = await this.db.one<{ code: string; level: number; account_class: string; statement_section: string | null; is_posting: boolean }>(
        'SELECT code, level, account_class, statement_section, is_posting FROM acc.accounts WHERE company_id = $1 AND id = $2',
        [companyId, parentId],
      );
      if (!p) throw new NotFoundError('Account', parentId);
      if (p.is_posting) throw new DomainError('ACCOUNT_PARENT_MUST_BE_HEADER', 'لا يمكن إضافة فرعي تحت حساب تفصيلي قابل للترحيل');
      parentCode = p.code;
      level = Number(p.level) + 1;
      inheritedClass = p.account_class;
      inheritedSection = p.statement_section;
    }

    const siblings = await this.db.query<{ code: string }>(
      parentId
        ? 'SELECT code FROM acc.accounts WHERE company_id = $1 AND parent_id = $2'
        : 'SELECT code FROM acc.accounts WHERE company_id = $1 AND parent_id IS NULL',
      parentId ? [companyId, parentId] : [companyId],
    );

    const suggestedCode = suggestNextAccountCode(
      parentCode,
      siblings.map((s) => s.code),
      inheritedClass,
    );

    return {
      suggestedCode,
      level,
      parentCode,
      accountClass: inheritedClass,
      statementSection: inheritedSection,
    };
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

      const statementSection = input.statementSection ?? inferStatementSection(input);
      const statementLineId = input.statementLineId ?? (await this.resolveDefaultStatementLineId(companyId, statementSection));
      const cashFlowCategory = input.cashFlowCategory ?? inferCashFlowCategory({ ...input, statementSection });

      const row = await this.db.one<{ id: string }>(
        `INSERT INTO acc.accounts(
            company_id, parent_id, code, name_ar, name_en, account_class, subtype, normal_balance, is_contra,
            currency_code, is_posting, is_control, is_active, cash_flow_category,
            statement_section, statement_line_id, equity_line_id,
            requires_cost_center, requires_project, requires_employee, description, created_by, updated_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, sys.current_user_id(), sys.current_user_id())
         RETURNING id`,
        [
          companyId, input.parentId ?? null, input.code, input.nameAr, input.nameEn ?? null, input.accountClass, input.subtype ?? null,
          this.normalBalance(input.accountClass, input.isContra), input.isContra, input.currencyCode ?? null, input.isPosting,
          input.isControl, input.isActive, cashFlowCategory, statementSection, statementLineId, input.equityLineId ?? null,
          input.requiresCostCenter, input.requiresProject, input.requiresEmployee, input.description ?? null,
        ],
      );
      return this.get(companyId, row!.id);
    });
  }

  async update(companyId: string, id: string, input: z.infer<typeof AccountUpdate>) {
    return this.db.tx(async () => {
      const current = await this.db.one<{
        account_class: (typeof ACCOUNT_CLASSES)[number];
        is_contra: boolean;
        currency_code: string | null;
        statement_section: string | null;
        statement_line_id: string | null;
        equity_line_id: string | null;
        cash_flow_category: string | null;
      }>(
        `SELECT account_class, is_contra, currency_code, statement_section, statement_line_id, equity_line_id, cash_flow_category
           FROM acc.accounts WHERE company_id = $1 AND id = $2 FOR UPDATE`,
        [companyId, id],
      );
      if (!current) throw new NotFoundError('Account', id);
      if (input.currencyCode !== undefined && input.currencyCode !== current.currency_code) {
        await this.validateCurrency(companyId, input.currencyCode);
        const used = await this.db.one('SELECT 1 FROM acc.journal_lines WHERE account_id = $1 LIMIT 1', [id]);
        if (used) throw new DomainError('ACCOUNT_HAS_TRANSACTIONS', 'لا يمكن تغيير عملة الحساب بعد تسجيل حركات عليه', HttpStatus.CONFLICT);
      }

      // If statementSection changed without explicit statementLineId, resolve the matching statement line automatically
      const patch: Record<string, unknown> = { ...input };
      if (input.statementSection !== undefined && input.statementSection !== null && input.statementLineId === undefined) {
        patch.statementLineId = await this.resolveDefaultStatementLineId(companyId, input.statementSection);
      }

      const params: unknown[] = [companyId, id];
      const sets: string[] = [];
      for (const [f, c] of Object.entries(FIELDS)) {
        const v = patch[f];
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

  /** Safe hierarchical relocation with strict accounting integrity guards. */
  async moveAccount(companyId: string, id: string, input: z.infer<typeof AccountMoveSchema>) {
    return this.db.tx(async () => {
      const acc = await this.db.one<{ id: string; code: string; parent_id: string | null; account_class: string; path: string }>(
        'SELECT id, code, parent_id, account_class, path::text AS path FROM acc.accounts WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!acc) throw new NotFoundError('Account', id);

      if (input.newParentId === id) {
        throw new DomainError('ACCOUNT_TREE_CYCLE', 'لا يمكن جعل الحساب أباً لنفسه', HttpStatus.UNPROCESSABLE_ENTITY);
      }

      if (input.newParentId) {
        const target = await this.db.one<{ id: string; code: string; is_posting: boolean; account_class: string; path: string }>(
          'SELECT id, code, is_posting, account_class, path::text AS path FROM acc.accounts WHERE company_id = $1 AND id = $2',
          [companyId, input.newParentId],
        );
        if (!target) throw new NotFoundError('Account', input.newParentId);
        if (target.is_posting) {
          throw new DomainError('ACCOUNT_PARENT_MUST_BE_HEADER', 'الحساب الأب المستهدف يجب أن يكون حساباً رئيسياً (تجميعياً) وليس فرعياً قابلاً للترحيل', HttpStatus.CONFLICT);
        }
        if (target.account_class !== acc.account_class) {
          throw new DomainError('ACCOUNT_CLASS_MISMATCH_WITH_PARENT', 'لا يمكن نقل الحساب إلى فئة محاسبية مختلفة عن فئته الأصلية حفاظاً على سلامة القوائم المالية', HttpStatus.CONFLICT);
        }
        if (target.path === acc.path || target.path.startsWith(`${acc.path}.`)) {
          throw new DomainError('ACCOUNT_TREE_CYCLE', 'لا يمكن نقل حساب رئيسي تحت أحد فروعه التابعة', HttpStatus.CONFLICT);
        }
      }

      const params: unknown[] = [companyId, id, input.newParentId];
      let codeSet = '';
      if (input.newCode && input.newCode !== acc.code) {
        params.push(input.newCode);
        codeSet = `, code = $${params.length}`;
      }

      await this.db.query(
        `UPDATE acc.accounts SET parent_id = $3${codeSet}, updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $2`,
        params,
      );

      await this.db.query(
        `SELECT audit.log_action('acc','accounts',$1,'UPDATE',$2::jsonb,$3::jsonb,$4,$5)`,
        [
          id,
          JSON.stringify({ parentId: acc.parent_id, code: acc.code }),
          JSON.stringify({ parentId: input.newParentId, code: input.newCode ?? acc.code }),
          input.reason || 'نقل الحساب داخل هيكل شجرة الحسابات',
          acc.code,
        ],
      );

      return this.get(companyId, id);
    });
  }

  /** Effective-dated documented reclassification linking an account to financial statement lines. */
  async reclassifyAccount(companyId: string, id: string, input: z.infer<typeof AccountReclassifySchema>) {
    return this.db.tx(async () => {
      const current = await this.db.one<{
        id: string;
        code: string;
        statement_section: string | null;
        statement_line_id: string | null;
        equity_line_id: string | null;
        cash_flow_category: string | null;
      }>(
        `SELECT id, code, statement_section, statement_line_id, equity_line_id, cash_flow_category
           FROM acc.accounts WHERE company_id = $1 AND id = $2 FOR UPDATE`,
        [companyId, id],
      );
      if (!current) throw new NotFoundError('Account', id);

      let nextSection = input.statementSection !== undefined ? input.statementSection : current.statement_section;
      let nextLineId = input.statementLineId !== undefined ? input.statementLineId : current.statement_line_id;

      // Sync section <-> line
      if (input.statementLineId && input.statementSection === undefined) {
        const line = await this.db.one<{ section_code: string }>(
          'SELECT section_code FROM acc.statement_lines WHERE company_id = $1 AND id = $2',
          [companyId, input.statementLineId],
        );
        if (!line) throw new NotFoundError('StatementLine', input.statementLineId);
        nextSection = line.section_code;
      } else if (input.statementSection && input.statementLineId === undefined) {
        nextLineId = await this.resolveDefaultStatementLineId(companyId, input.statementSection);
      }

      const nextEquityLineId = input.equityLineId !== undefined ? input.equityLineId : current.equity_line_id;
      const nextCf = input.cashFlowCategory !== undefined ? input.cashFlowCategory : current.cash_flow_category;
      const effectiveFrom = input.effectiveFrom || new Date().toISOString().slice(0, 10);

      await this.db.query(
        `INSERT INTO acc.account_reclassifications (
           company_id, account_id, effective_from,
           old_statement_section, new_statement_section,
           old_statement_line_id, new_statement_line_id,
           old_equity_line_id, new_equity_line_id,
           old_cash_flow_category, new_cash_flow_category,
           reason, changed_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, sys.current_user_id())`,
        [
          companyId, id, effectiveFrom,
          current.statement_section, nextSection,
          current.statement_line_id, nextLineId,
          current.equity_line_id, nextEquityLineId,
          current.cash_flow_category, nextCf,
          input.reason,
        ],
      );

      await this.db.query(
        `UPDATE acc.accounts
            SET statement_section = $3,
                statement_line_id = $4,
                equity_line_id = $5,
                cash_flow_category = $6,
                updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $2`,
        [companyId, id, nextSection, nextLineId, nextEquityLineId, nextCf],
      );

      return this.get(companyId, id);
    });
  }

  async listReclassifications(companyId: string, accountId?: string) {
    const params: unknown[] = [companyId];
    let w = 'r.company_id = $1';
    if (accountId) {
      params.push(accountId);
      w += ' AND r.account_id = $2';
    }
    return this.db.query(
      `SELECT r.id, r.account_id AS "accountId", a.code AS "accountCode", a.name_ar AS "accountNameAr",
              r.effective_from AS "effectiveFrom",
              r.old_statement_section AS "oldStatementSection", r.new_statement_section AS "newStatementSection",
              r.old_statement_line_id AS "oldStatementLineId", r.new_statement_line_id AS "newStatementLineId",
              r.old_cash_flow_category AS "oldCashFlowCategory", r.new_cash_flow_category AS "newCashFlowCategory",
              r.reason, r.changed_at AS "changedAt"
         FROM acc.account_reclassifications r
         JOIN acc.accounts a ON a.id = r.account_id
        WHERE ${w}
        ORDER BY r.changed_at DESC
        LIMIT 200`,
      params,
    );
  }

  // ------------------------------------------------------------------ statement lines CRUD
  async listStatementLines(companyId: string, statementType?: string) {
    await this.ensureStatementLines(companyId);
    const params: unknown[] = [companyId];
    let w = 'sl.company_id = $1';
    if (statementType) {
      params.push(statementType);
      w += ' AND sl.statement_type = $2';
    }
    return this.db.query(
      `SELECT sl.id, sl.statement_type AS "statementType", sl.section_code AS "sectionCode",
              sl.code, sl.name_ar AS "nameAr", sl.name_en AS "nameEn",
              sl.normal_sign AS "normalSign", sl.sort_order AS "sortOrder",
              sl.is_system AS "isSystem", sl.is_active AS "isActive", sl.description,
              (SELECT count(*)::int FROM acc.accounts a
                WHERE a.company_id = sl.company_id
                  AND a.is_posting = true
                  AND (a.statement_line_id = sl.id OR a.equity_line_id = sl.id)) AS "mappedAccountsCount"
         FROM acc.statement_lines sl
        WHERE ${w}
        ORDER BY sl.statement_type, sl.sort_order, sl.code`,
      params,
    );
  }

  async createStatementLine(companyId: string, input: z.infer<typeof StatementLineCreate>) {
    await this.ensureStatementLines(companyId);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO acc.statement_lines
         (company_id, statement_type, section_code, code, name_ar, name_en, normal_sign, sort_order, is_system, is_active, description, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10, sys.current_user_id(), sys.current_user_id())
       RETURNING id`,
      [companyId, input.statementType, input.sectionCode, input.code, input.nameAr, input.nameEn ?? null, input.normalSign, input.sortOrder, input.isActive, input.description ?? null],
    );
    return this.db.one(
      `SELECT id, statement_type AS "statementType", section_code AS "sectionCode", code, name_ar AS "nameAr", name_en AS "nameEn",
              normal_sign AS "normalSign", sort_order AS "sortOrder", is_system AS "isSystem", is_active AS "isActive", description
         FROM acc.statement_lines WHERE company_id = $1 AND id = $2`,
      [companyId, row!.id],
    );
  }

  async updateStatementLine(companyId: string, id: string, input: z.infer<typeof StatementLineUpdate>) {
    const map: Record<string, string> = {
      nameAr: 'name_ar', nameEn: 'name_en', sectionCode: 'section_code', sortOrder: 'sort_order',
      normalSign: 'normal_sign', isActive: 'is_active', description: 'description',
    };
    const params: unknown[] = [companyId, id];
    const sets: string[] = [];
    for (const [k, col] of Object.entries(map)) {
      const v = (input as Record<string, unknown>)[k];
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    }
    if (!sets.length) {
      return this.db.one('SELECT * FROM acc.statement_lines WHERE company_id = $1 AND id = $2', [companyId, id]);
    }
    const r = await this.db.one(
      `UPDATE acc.statement_lines SET ${sets.join(', ')}, updated_by = sys.current_user_id()
        WHERE company_id = $1 AND id = $2
        RETURNING id, statement_type AS "statementType", section_code AS "sectionCode", code, name_ar AS "nameAr", name_en AS "nameEn",
                  normal_sign AS "normalSign", sort_order AS "sortOrder", is_system AS "isSystem", is_active AS "isActive", description`,
      params,
    );
    if (!r) throw new NotFoundError('StatementLine', id);
    return r;
  }

  async removeStatementLine(companyId: string, id: string) {
    const sl = await this.db.one<{ is_system: boolean }>(
      'SELECT is_system FROM acc.statement_lines WHERE company_id = $1 AND id = $2',
      [companyId, id],
    );
    if (!sl) throw new NotFoundError('StatementLine', id);
    if (sl.is_system) throw new DomainError('SYSTEM_STATEMENT_LINE_LOCKED', 'لا يمكن حذف بند نظامي أساسي في القوائم المالية', HttpStatus.CONFLICT);
    const used = await this.db.one(
      'SELECT 1 FROM acc.accounts WHERE company_id = $1 AND (statement_line_id = $2 OR equity_line_id = $2) LIMIT 1',
      [companyId, id],
    );
    if (used) throw new DomainError('STATEMENT_LINE_IN_USE', 'لا يمكن حذف بند مرتبط بحسابات في الشجرة — أعد تصنيف الحسابات أولاً', HttpStatus.CONFLICT);
    await this.db.query('DELETE FROM acc.statement_lines WHERE company_id = $1 AND id = $2', [companyId, id]);
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      await this.get(companyId, id);
      if (await this.db.one('SELECT 1 FROM acc.journal_lines WHERE account_id = $1 LIMIT 1', [id])) {
        throw new DomainError('ACCOUNT_HAS_TRANSACTIONS', 'لا يمكن حذف حساب مرتبط بقيود أو حركات محاسبية — يمكنك تعطيله بدلاً من الحذف', HttpStatus.CONFLICT);
      }
      if (await this.db.one('SELECT 1 FROM acc.accounts WHERE parent_id = $1 LIMIT 1', [id])) {
        throw new DomainError('ACCOUNT_HAS_CHILDREN', 'لا يمكن حذف حساب رئيسي يحتوي على حسابات فرعية تابعة', HttpStatus.CONFLICT);
      }
      if (await this.db.one('SELECT 1 FROM acc.bank_accounts WHERE company_id = $1 AND gl_account_id = $2 LIMIT 1', [companyId, id])) {
        throw new DomainError('ACCOUNT_LINKED_TO_BANK', 'لا يمكن حذف حساب مرتبط بحساب بنكي أو صندوق', HttpStatus.CONFLICT);
      }
      if (await this.db.one('SELECT 1 FROM acc.posting_rule_lines WHERE company_id = $1 AND account_id = $2 LIMIT 1', [companyId, id])) {
        throw new DomainError('ACCOUNT_LINKED_TO_POSTING_RULE', 'لا يمكن حذف حساب مرتبط بقاعدة ترحيل آلي', HttpStatus.CONFLICT);
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
