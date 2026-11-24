import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, Decimal } from '../../../shared/money';
import { Dimensions } from '../domain/journal';
import {
  AccountReclassificationRecord,
  calcVariance,
  CoaAccountMeta,
  inferEquitySection,
  IS_SECTIONS,
  resolveEffectiveClassification,
  SECTION_LABELS_AR,
  StatementLineDef,
} from '../domain/financial-statements';
import { CostCenterMeta, expandCostCenterTreeIds } from '../domain/cost-center-rollup';

export type Ledger = 'FINANCIAL' | 'MANAGEMENT';

export interface TrialBalanceRow {
  accountId: string;
  parentId: string | null;
  code: string;
  nameAr: string;
  nameEn: string | null;
  accountClass: string;
  statementSection: string | null;
  normalBalance: string;
  level: number;
  isPosting: boolean;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
}

interface DimFilter extends Dimensions {
  costCenterIds?: string[];
}

const DIM_COLUMNS: Record<keyof Dimensions, string> = {
  branchId: 'l.branch_id', costCenterId: 'l.cost_center_id', departmentId: 'l.department_id', projectId: 'l.project_id',
  clientId: 'l.client_id', supplierId: 'l.supplier_id', employeeId: 'l.employee_id', assetId: 'l.asset_id',
};

function dimWhere(f: DimFilter, params: unknown[]): string {
  const parts: string[] = [];
  for (const [k, col] of Object.entries(DIM_COLUMNS)) {
    if (k === 'costCenterId' && f.costCenterIds?.length) {
      params.push(f.costCenterIds);
      parts.push(`l.cost_center_id = ANY($${params.length}::uuid[])`);
      continue;
    }
    const v = f[k as keyof Dimensions];
    if (!v) continue;
    params.push(v);
    parts.push(`${col} = $${params.length}`);
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

const split = (net: Decimal) => ({
  debit: net.greaterThan(0) ? net.toFixed(4) : '0.0000',
  credit: net.lessThan(0) ? net.negated().toFixed(4) : '0.0000',
});

/**
 * Read side of the general ledger & Unified Dynamic Financial Statements Engine.
 * Every figure is computed strictly from Chart of Accounts classifications +
 * POSTED journal lines (single source of truth), with effective-dated reclassification
 * history, 2-period comparison, and complete drill-down to accounts & journal entries.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly db: DbService) {}

  private async resolveDimFilter<T extends DimFilter>(companyId: string, f: T): Promise<T> {
    if (!f.costCenterId) return f;
    const centers = await this.db.query<CostCenterMeta>(
      `SELECT id, parent_id AS "parentId", code, name_ar AS "nameAr", cc_type AS "ccType", is_posting AS "isPosting", is_active AS "isActive"
         FROM core.cost_centers WHERE company_id = $1`,
      [companyId],
    );
    const ids = expandCostCenterTreeIds(f.costCenterId, centers);
    return { ...f, costCenterIds: ids.length ? ids : [f.costCenterId] };
  }

  private async loadAccountsAndMapping(companyId: string): Promise<{
    accounts: CoaAccountMeta[];
    statementLines: StatementLineDef[];
    reclassifications: AccountReclassificationRecord[];
  }> {
    await this.db.query('SELECT acc.seed_default_statement_lines($1)', [companyId]).catch(() => undefined);
    const [accounts, statementLines, reclassifications] = await Promise.all([
      this.db.query<CoaAccountMeta>(
        `SELECT id, parent_id AS "parentId", code, name_ar AS "nameAr", name_en AS "nameEn",
                account_class AS "accountClass", subtype, normal_balance AS "normalBalance",
                is_contra AS "isContra", is_posting AS "isPosting", is_active AS "isActive", level,
                statement_section AS "statementSection", statement_line_id AS "statementLineId",
                equity_line_id AS "equityLineId", cash_flow_category AS "cashFlowCategory"
           FROM acc.accounts WHERE company_id = $1 ORDER BY code`,
        [companyId],
      ),
      this.db.query<StatementLineDef>(
        `SELECT id, statement_type AS "statementType", section_code AS "sectionCode", code,
                name_ar AS "nameAr", name_en AS "nameEn", normal_sign AS "normalSign",
                sort_order AS "sortOrder", is_system AS "isSystem", is_active AS "isActive"
           FROM acc.statement_lines WHERE company_id = $1 AND is_active = true
          ORDER BY statement_type, sort_order, code`,
        [companyId],
      ),
      this.db.query<AccountReclassificationRecord>(
        `SELECT account_id AS "accountId", effective_from::text AS "effectiveFrom", changed_at::text AS "changedAt",
                old_statement_section AS "oldStatementSection", new_statement_section AS "newStatementSection",
                old_statement_line_id AS "oldStatementLineId", new_statement_line_id AS "newStatementLineId",
                old_equity_line_id AS "oldEquityLineId", new_equity_line_id AS "newEquityLineId",
                old_cash_flow_category AS "oldCashFlowCategory", new_cash_flow_category AS "newCashFlowCategory"
           FROM acc.account_reclassifications WHERE company_id = $1
          ORDER BY effective_from DESC, changed_at DESC`,
        [companyId],
      ),
    ]);
    return { accounts, statementLines, reclassifications };
  }

  async trialBalance(
    companyId: string,
    opts: { from: string; to: string; ledger?: Ledger; includeZero?: boolean } & DimFilter,
  ): Promise<{ rows: TrialBalanceRow[]; totals: Record<string, string>; balanced: boolean }> {
    if (opts.from > opts.to) throw new DomainError('INVALID_DATE_RANGE');
    const resolvedOpts = await this.resolveDimFilter(companyId, opts);
    const params: unknown[] = [companyId, resolvedOpts.from, resolvedOpts.to, resolvedOpts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(resolvedOpts, params);
    const sums = await this.db.query<{ account_id: string; opening: string; pd: string; pc: string }>(
      `SELECT l.account_id,
              COALESCE(SUM(CASE WHEN e.entry_date < $2 THEN l.debit_base - l.credit_base END), 0) AS opening,
              COALESCE(SUM(CASE WHEN e.entry_date >= $2 THEN l.debit_base END), 0) AS pd,
              COALESCE(SUM(CASE WHEN e.entry_date >= $2 THEN l.credit_base END), 0) AS pc
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $4 AND e.entry_date <= $3${dims}
        GROUP BY l.account_id`,
      params,
    );
    const accounts = await this.db.query<{
      id: string; parent_id: string | null; code: string; name_ar: string; name_en: string | null; account_class: string;
      statement_section: string | null; normal_balance: string; level: number; is_posting: boolean; path: string;
    }>(
      `SELECT id, parent_id, code, name_ar, name_en, account_class, statement_section, normal_balance, level, is_posting, path::text AS path
         FROM acc.accounts WHERE company_id = $1 ORDER BY path`,
      [companyId],
    );
    const agg = new Map<string, { opening: Decimal; pd: Decimal; pc: Decimal }>();
    for (const a of accounts) agg.set(a.id, { opening: D(0), pd: D(0), pc: D(0) });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const s of sums) {
      let cur: string | null = s.account_id;
      const visited = new Set<string>();
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        const t = agg.get(cur);
        if (t) {
          t.opening = t.opening.plus(s.opening);
          t.pd = t.pd.plus(s.pd);
          t.pc = t.pc.plus(s.pc);
        }
        cur = byId.get(cur)?.parent_id ?? null;
      }
    }

    const children = new Map<string | null, typeof accounts>();
    for (const a of accounts) {
      const list = children.get(a.parent_id) ?? [];
      list.push(a);
      children.set(a.parent_id, list);
    }
    const ordered: typeof accounts = [];
    const walk = (pid: string | null) => {
      for (const a of (children.get(pid) ?? []).sort((x, y) => x.code.localeCompare(y.code))) {
        ordered.push(a);
        walk(a.id);
      }
    };
    walk(null);

    const totals = { openingDebit: D(0), openingCredit: D(0), periodDebit: D(0), periodCredit: D(0), closingDebit: D(0), closingCredit: D(0) };
    const rows: TrialBalanceRow[] = [];
    for (const a of ordered) {
      const t = agg.get(a.id)!;
      const closing = t.opening.plus(t.pd).minus(t.pc);
      if (!opts.includeZero && t.opening.isZero() && t.pd.isZero() && t.pc.isZero()) continue;
      const o = split(t.opening);
      const c = split(closing);
      if (a.is_posting) {
        totals.openingDebit = totals.openingDebit.plus(o.debit);
        totals.openingCredit = totals.openingCredit.plus(o.credit);
        totals.periodDebit = totals.periodDebit.plus(t.pd);
        totals.periodCredit = totals.periodCredit.plus(t.pc);
        totals.closingDebit = totals.closingDebit.plus(c.debit);
        totals.closingCredit = totals.closingCredit.plus(c.credit);
      }
      rows.push({
        accountId: a.id, parentId: a.parent_id, code: a.code, nameAr: a.name_ar, nameEn: a.name_en, accountClass: a.account_class,
        statementSection: a.statement_section, normalBalance: a.normal_balance,
        level: a.level, isPosting: a.is_posting, openingDebit: o.debit, openingCredit: o.credit, periodDebit: t.pd.toFixed(4),
        periodCredit: t.pc.toFixed(4), closingDebit: c.debit, closingCredit: c.credit,
      });
    }
    const out = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(4)]));
    const balanced = totals.periodDebit.equals(totals.periodCredit) && totals.closingDebit.equals(totals.closingCredit)
      && totals.openingDebit.equals(totals.openingCredit);
    return { rows, totals: out, balanced };
  }

  /** Account statement with opening balance and running balance (header accounts roll up all descendants). */
  async accountStatement(
    companyId: string,
    opts: { accountId: string; from: string; to: string; ledger?: Ledger; page: number; pageSize: number } & DimFilter,
  ) {
    const acct = await this.db.one<{ id: string; code: string; name_ar: string; normal_balance: string; account_class: string; path: string }>(
      'SELECT id, code, name_ar, normal_balance, account_class, path::text AS path FROM acc.accounts WHERE company_id = $1 AND id = $2',
      [companyId, opts.accountId],
    );
    if (!acct) throw new NotFoundError('Account', opts.accountId);
    const resolvedOpts = await this.resolveDimFilter(companyId, opts);
    const params: unknown[] = [companyId, acct.path, resolvedOpts.from, resolvedOpts.to, resolvedOpts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(resolvedOpts, params);
    const base = `FROM acc.journal_lines l
        JOIN acc.journal_entries e ON e.id = l.entry_id
        JOIN acc.accounts a ON a.id = l.account_id
        LEFT JOIN core.cost_centers cc ON cc.id = l.cost_center_id
        LEFT JOIN prj.projects p ON p.id = l.project_id
        LEFT JOIN prj.clients cl ON cl.id = COALESCE(l.client_id, p.client_id)
        LEFT JOIN hr.employees emp ON emp.id = l.employee_id
       WHERE l.company_id = $1 AND a.path <@ $2::ltree AND e.status = 'POSTED' AND e.ledger = $5
         AND e.entry_date <= $4::date AND $3::date IS NOT NULL${dims}`;
    const opening = await this.db.one<{ v: string }>(
      `SELECT COALESCE(SUM(l.debit_base - l.credit_base), 0) AS v ${base} AND e.entry_date < $3`,
      params,
    );
    const agg = await this.db.one<{ n: string; dr: string; cr: string }>(
      `SELECT count(*) n, COALESCE(SUM(l.debit_base),0) dr, COALESCE(SUM(l.credit_base),0) cr ${base} AND e.entry_date BETWEEN $3 AND $4`,
      params,
    );
    const lines = await this.db.query(
      `SELECT * FROM (
         SELECT e.id AS "entryId", e.entry_no AS "entryNo", e.entry_date AS "entryDate", e.journal_type AS "journalType",
                e.source_module AS "sourceModule", e.source_type AS "sourceType", e.source_id AS "sourceId",
                COALESCE(l.description, e.description) AS description, e.reference, a.code AS "accountCode", a.name_ar AS "accountNameAr",
                l.line_no AS "lineNo", l.currency_code AS "currencyCode", l.exchange_rate AS "exchangeRate", l.debit_tx AS "debitTx",
                l.credit_tx AS "creditTx", l.debit_base AS "debitBase", l.credit_base AS "creditBase",
                l.project_id AS "projectId", p.name_ar AS "projectName",
                l.employee_id AS "employeeId", emp.full_name_ar AS "employeeName",
                l.cost_center_id AS "costCenterId", cc.code AS "costCenterCode", cc.name_ar AS "costCenterName",
                l.client_id AS "clientId", cl.name_ar AS "clientName",
                ($${params.length + 1}::numeric + SUM(l.debit_base - l.credit_base)
                   OVER (ORDER BY e.entry_date, e.entry_no, l.line_no ROWS UNBOUNDED PRECEDING)) AS "runningBalance",
                ROW_NUMBER() OVER (ORDER BY e.entry_date, e.entry_no, l.line_no) AS rn
           ${base} AND e.entry_date BETWEEN $3 AND $4
       ) x WHERE rn > ${(opts.page - 1) * opts.pageSize} AND rn <= ${opts.page * opts.pageSize} ORDER BY rn`,
      [...params, opening?.v ?? '0'],
    );
    const closing = D(opening?.v).plus(agg?.dr ?? 0).minus(agg?.cr ?? 0);
    return {
      account: { id: acct.id, code: acct.code, nameAr: acct.name_ar, normalBalance: acct.normal_balance, accountClass: acct.account_class },
      openingBalance: D(opening?.v).toFixed(4),
      periodDebit: D(agg?.dr).toFixed(4),
      periodCredit: D(agg?.cr).toFixed(4),
      closingBalance: closing.toFixed(4),
      data: lines,
      meta: { page: opts.page, pageSize: opts.pageSize, total: Number(agg?.n ?? 0) },
    };
  }

  // ------------------------------------------------------------------ 1. DYNAMIC INCOME STATEMENT
  private async computeSingleIncomeStatement(
    companyId: string,
    opts: { from: string; to: string; ledger?: Ledger } & DimFilter,
    ctx: { accounts: CoaAccountMeta[]; statementLines: StatementLineDef[]; reclassifications: AccountReclassificationRecord[] },
  ) {
    const params: unknown[] = [companyId, opts.from, opts.to, opts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(opts, params);
    const sums = await this.db.query<{ account_id: string; dr: string; cr: string }>(
      `SELECT l.account_id, COALESCE(SUM(l.debit_base), 0) AS dr, COALESCE(SUM(l.credit_base), 0) AS cr
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $4 AND e.journal_type <> 'CLOSING'
          AND e.entry_date BETWEEN $2 AND $3${dims}
        GROUP BY l.account_id`,
      params,
    );

    const accById = new Map(ctx.accounts.map((a) => [a.id, a]));
    const slById = new Map(ctx.statementLines.map((s) => [s.id, s]));

    const sectionBuckets = new Map<string, {
      sectionCode: string;
      statementLineId: string | null;
      code: string;
      nameAr: string;
      nameEn: string;
      sortOrder: number;
      total: Decimal;
      accounts: Array<{
        accountId: string; code: string; nameAr: string; accountClass: string;
        statementSection: string; statementLineId: string | null;
        debitBase: string; creditBase: string; amount: string;
      }>;
    }>();

    // Pre-register configured Income Statement lines so even zero-balance custom lines are discoverable
    for (const sl of ctx.statementLines.filter((s) => s.statementType === 'INCOME_STATEMENT')) {
      sectionBuckets.set(sl.id, {
        sectionCode: sl.sectionCode,
        statementLineId: sl.id,
        code: sl.code,
        nameAr: sl.nameAr,
        nameEn: sl.nameEn || sl.sectionCode,
        sortOrder: sl.sortOrder,
        total: D(0),
        accounts: [],
      });
    }

    const flatLines: Array<{
      accountId: string; code: string; nameAr: string; accountClass: string;
      statementSection: string; statementLineId: string | null; statementLineNameAr: string;
      debitBase: string; creditBase: string; amount: string;
    }> = [];

    const sectionTotals: Record<string, Decimal> = {
      REVENUE: D(0),
      COST_OF_SALES: D(0),
      OPERATING_EXPENSES: D(0),
      OTHER_INCOME: D(0),
      OTHER_EXPENSES: D(0),
      ZAKAT_TAX: D(0),
    };

    for (const s of sums) {
      const acc = accById.get(s.account_id);
      if (!acc || !acc.isPosting) continue;
      const eff = resolveEffectiveClassification(acc, opts.to, ctx.reclassifications);
      if (!IS_SECTIONS.has(eff.statementSection)) continue;

      const isCreditSection = eff.statementSection === 'REVENUE' || eff.statementSection === 'OTHER_INCOME';
      const amt = isCreditSection ? D(s.cr).minus(s.dr) : D(s.dr).minus(s.cr);
      if (amt.isZero()) continue;

      sectionTotals[eff.statementSection] = (sectionTotals[eff.statementSection] ?? D(0)).plus(amt);

      // Find matching statement line bucket
      let bucket = eff.statementLineId ? sectionBuckets.get(eff.statementLineId) : undefined;
      if (!bucket) {
        bucket = Array.from(sectionBuckets.values()).find((b) => b.sectionCode === eff.statementSection);
      }
      if (!bucket) {
        const meta = SECTION_LABELS_AR[eff.statementSection] || { nameAr: eff.statementSection, nameEn: eff.statementSection, sortOrder: 99 };
        bucket = {
          sectionCode: eff.statementSection,
          statementLineId: null,
          code: eff.statementSection,
          nameAr: meta.nameAr,
          nameEn: meta.nameEn,
          sortOrder: meta.sortOrder,
          total: D(0),
          accounts: [],
        };
        sectionBuckets.set(eff.statementSection, bucket);
      }

      const lineObj = {
        accountId: acc.id,
        code: acc.code,
        nameAr: acc.nameAr,
        accountClass: acc.accountClass,
        statementSection: eff.statementSection,
        statementLineId: bucket.statementLineId,
        statementLineNameAr: (bucket.statementLineId ? slById.get(bucket.statementLineId)?.nameAr : bucket.nameAr) || bucket.nameAr,
        debitBase: D(s.dr).toFixed(4),
        creditBase: D(s.cr).toFixed(4),
        amount: amt.toFixed(4),
      };
      bucket.total = bucket.total.plus(amt);
      bucket.accounts.push(lineObj);
      flatLines.push(lineObj);
    }

    flatLines.sort((a, b) => a.code.localeCompare(b.code));
    const sections = Array.from(sectionBuckets.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((b) => ({
        ...b,
        accounts: b.accounts.sort((x, y) => x.code.localeCompare(y.code)),
        total: b.total.toFixed(4),
      }));

    const revenue = sectionTotals.REVENUE;
    const directCost = sectionTotals.COST_OF_SALES;
    const opex = sectionTotals.OPERATING_EXPENSES;
    const otherIncome = sectionTotals.OTHER_INCOME;
    const otherExpense = sectionTotals.OTHER_EXPENSES;
    const zakatTax = sectionTotals.ZAKAT_TAX;

    const grossProfit = revenue.minus(directCost);
    const operatingProfit = grossProfit.minus(opex);
    const profitBeforeTax = operatingProfit.plus(otherIncome).minus(otherExpense);
    const netProfit = profitBeforeTax.minus(zakatTax);

    return {
      from: opts.from,
      to: opts.to,
      lines: flatLines,
      sections,
      revenue: revenue.toFixed(4),
      directCost: directCost.toFixed(4),
      grossProfit: grossProfit.toFixed(4),
      operatingExpenses: opex.toFixed(4),
      operatingProfit: operatingProfit.toFixed(4),
      otherIncome: otherIncome.toFixed(4),
      otherExpenses: otherExpense.toFixed(4),
      profitBeforeTax: profitBeforeTax.toFixed(4),
      zakatTax: zakatTax.toFixed(4),
      netProfit: netProfit.toFixed(4),
    };
  }

  async incomeStatement(
    companyId: string,
    opts: { from: string; to: string; compareFrom?: string; compareTo?: string; ledger?: Ledger } & DimFilter,
  ) {
    if (opts.from > opts.to) throw new DomainError('INVALID_DATE_RANGE');
    const resolvedOpts = await this.resolveDimFilter(companyId, opts);
    const ctx = await this.loadAccountsAndMapping(companyId);
    const current = await this.computeSingleIncomeStatement(companyId, resolvedOpts, ctx);

    if (opts.compareFrom && opts.compareTo) {
      const prev = await this.computeSingleIncomeStatement(
        companyId,
        { ...resolvedOpts, from: opts.compareFrom, to: opts.compareTo },
        ctx,
      );
      const prevAccMap = new Map(prev.lines.map((l) => [l.accountId, D(l.amount)]));
      const prevSecMap = new Map(prev.sections.map((s) => [s.statementLineId || s.sectionCode, D(s.total)]));
      return {
        ...current,
        sections: current.sections.map((s) => {
          const pTot = prevSecMap.get(s.statementLineId || s.sectionCode) ?? D(0);
          return {
            ...s,
            ...calcVariance(D(s.total), pTot),
            accounts: s.accounts.map((a) => ({
              ...a,
              ...calcVariance(D(a.amount), prevAccMap.get(a.accountId) ?? D(0)),
            })),
          };
        }),
        comparative: {
          from: opts.compareFrom,
          to: opts.compareTo,
          revenue: { ...calcVariance(D(current.revenue), D(prev.revenue)) },
          directCost: { ...calcVariance(D(current.directCost), D(prev.directCost)) },
          grossProfit: { ...calcVariance(D(current.grossProfit), D(prev.grossProfit)) },
          operatingExpenses: { ...calcVariance(D(current.operatingExpenses), D(prev.operatingExpenses)) },
          operatingProfit: { ...calcVariance(D(current.operatingProfit), D(prev.operatingProfit)) },
          otherIncome: { ...calcVariance(D(current.otherIncome), D(prev.otherIncome)) },
          otherExpenses: { ...calcVariance(D(current.otherExpenses), D(prev.otherExpenses)) },
          zakatTax: { ...calcVariance(D(current.zakatTax), D(prev.zakatTax)) },
          netProfit: { ...calcVariance(D(current.netProfit), D(prev.netProfit)) },
        },
      };
    }

    return current;
  }

  // ------------------------------------------------------------------ 2. DYNAMIC BALANCE SHEET
  private async computeSingleBalanceSheet(
    companyId: string,
    opts: { asOf: string; ledger?: Ledger } & DimFilter,
    ctx: { accounts: CoaAccountMeta[]; statementLines: StatementLineDef[]; reclassifications: AccountReclassificationRecord[] },
  ) {
    const params: unknown[] = [companyId, opts.asOf, opts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(opts, params);
    const sums = await this.db.query<{ account_id: string; dr: string; cr: string }>(
      `SELECT l.account_id, COALESCE(SUM(l.debit_base), 0) AS dr, COALESCE(SUM(l.credit_base), 0) AS cr
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $3 AND e.entry_date <= $2${dims}
        GROUP BY l.account_id`,
      params,
    );

    const accById = new Map(ctx.accounts.map((a) => [a.id, a]));

    const buckets = new Map<string, {
      sectionCode: string;
      statementLineId: string | null;
      code: string;
      nameAr: string;
      nameEn: string;
      sortOrder: number;
      total: Decimal;
      accounts: Array<{
        accountId: string; code: string; nameAr: string; accountClass: string; subtype: string | null;
        statementSection: string; statementLineId: string | null; isContra: boolean;
        debitBase: string; creditBase: string; amount: string;
      }>;
    }>();

    for (const sl of ctx.statementLines.filter((s) => s.statementType === 'BALANCE_SHEET')) {
      buckets.set(sl.id, {
        sectionCode: sl.sectionCode,
        statementLineId: sl.id,
        code: sl.code,
        nameAr: sl.nameAr,
        nameEn: sl.nameEn || sl.sectionCode,
        sortOrder: sl.sortOrder,
        total: D(0),
        accounts: [],
      });
    }

    let currentAssetsTotal = D(0);
    let nonCurrentAssetsTotal = D(0);
    let currentLiabTotal = D(0);
    let nonCurrentLiabTotal = D(0);
    let equityTotal = D(0);
    let currentEarnings = D(0);

    const allAssetLines: any[] = [];
    const allLiabLines: any[] = [];
    const allEquityLines: any[] = [];

    for (const s of sums) {
      const acc = accById.get(s.account_id);
      if (!acc || !acc.isPosting) continue;
      const eff = resolveEffectiveClassification(acc, opts.asOf, ctx.reclassifications);

      if (IS_SECTIONS.has(eff.statementSection)) {
        // Unclosed P&L contributes to Current Period Earnings (Credit - Debit)
        currentEarnings = currentEarnings.plus(D(s.cr).minus(s.dr));
        continue;
      }

      const isAsset = eff.statementSection === 'CURRENT_ASSETS' || eff.statementSection === 'NON_CURRENT_ASSETS';
      const amt = isAsset ? D(s.dr).minus(s.cr) : D(s.cr).minus(s.dr);
      if (amt.isZero()) continue;

      if (eff.statementSection === 'CURRENT_ASSETS') currentAssetsTotal = currentAssetsTotal.plus(amt);
      else if (eff.statementSection === 'NON_CURRENT_ASSETS') nonCurrentAssetsTotal = nonCurrentAssetsTotal.plus(amt);
      else if (eff.statementSection === 'CURRENT_LIABILITIES') currentLiabTotal = currentLiabTotal.plus(amt);
      else if (eff.statementSection === 'NON_CURRENT_LIABILITIES') nonCurrentLiabTotal = nonCurrentLiabTotal.plus(amt);
      else if (eff.statementSection === 'EQUITY') equityTotal = equityTotal.plus(amt);

      let bucket = eff.statementLineId ? buckets.get(eff.statementLineId) : undefined;
      if (!bucket) bucket = Array.from(buckets.values()).find((b) => b.sectionCode === eff.statementSection);
      if (!bucket) {
        const meta = SECTION_LABELS_AR[eff.statementSection] || { nameAr: eff.statementSection, nameEn: eff.statementSection, sortOrder: 99 };
        bucket = {
          sectionCode: eff.statementSection,
          statementLineId: null,
          code: eff.statementSection,
          nameAr: meta.nameAr,
          nameEn: meta.nameEn,
          sortOrder: meta.sortOrder,
          total: D(0),
          accounts: [],
        };
        buckets.set(eff.statementSection, bucket);
      }

      const item = {
        accountId: acc.id,
        code: acc.code,
        nameAr: acc.nameAr,
        accountClass: acc.accountClass,
        subtype: acc.subtype ?? null,
        statementSection: eff.statementSection,
        statementLineId: bucket.statementLineId,
        isContra: Boolean(acc.isContra),
        debitBase: D(s.dr).toFixed(4),
        creditBase: D(s.cr).toFixed(4),
        amount: amt.toFixed(4),
      };
      bucket.total = bucket.total.plus(amt);
      bucket.accounts.push(item);

      if (isAsset) allAssetLines.push(item);
      else if (eff.statementSection === 'EQUITY') allEquityLines.push(item);
      else allLiabLines.push(item);
    }

    const totalAssets = currentAssetsTotal.plus(nonCurrentAssetsTotal);
    const totalLiabilities = currentLiabTotal.plus(nonCurrentLiabTotal);
    const totalEquityWithEarnings = equityTotal.plus(currentEarnings);
    const liabilitiesAndEquity = totalLiabilities.plus(totalEquityWithEarnings);
    const difference = totalAssets.minus(liabilitiesAndEquity);

    const sections = Array.from(buckets.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((b) => ({
        ...b,
        accounts: b.accounts.sort((x, y) => x.code.localeCompare(y.code)),
        total: b.total.toFixed(4),
      }));

    const pickSecLines = (secCode: string) =>
      sections.filter((s) => s.sectionCode === secCode).flatMap((s) => s.accounts);

    return {
      asOf: opts.asOf,
      sections,
      currentAssets: { total: currentAssetsTotal.toFixed(4), lines: pickSecLines('CURRENT_ASSETS') },
      nonCurrentAssets: { total: nonCurrentAssetsTotal.toFixed(4), lines: pickSecLines('NON_CURRENT_ASSETS') },
      currentLiabilities: { total: currentLiabTotal.toFixed(4), lines: pickSecLines('CURRENT_LIABILITIES') },
      nonCurrentLiabilities: { total: nonCurrentLiabTotal.toFixed(4), lines: pickSecLines('NON_CURRENT_LIABILITIES') },
      assets: {
        total: totalAssets.toFixed(4),
        current: currentAssetsTotal.toFixed(4),
        nonCurrent: nonCurrentAssetsTotal.toFixed(4),
        lines: allAssetLines.sort((a, b) => a.code.localeCompare(b.code)),
      },
      liabilities: {
        total: totalLiabilities.toFixed(4),
        current: currentLiabTotal.toFixed(4),
        nonCurrent: nonCurrentLiabTotal.toFixed(4),
        lines: allLiabLines.sort((a, b) => a.code.localeCompare(b.code)),
      },
      equity: {
        total: equityTotal.toFixed(4),
        totalWithEarnings: totalEquityWithEarnings.toFixed(4),
        lines: allEquityLines.sort((a, b) => a.code.localeCompare(b.code)),
      },
      currentEarnings: currentEarnings.toFixed(4),
      liabilitiesAndEquity: liabilitiesAndEquity.toFixed(4),
      difference: difference.toFixed(4),
      balanced: difference.abs().lessThan(0.01),
    };
  }

  async balanceSheet(
    companyId: string,
    asOfOrOpts: string | ({ asOf: string; compareAsOf?: string; ledger?: Ledger } & DimFilter),
    ledgerArg: Ledger = 'FINANCIAL',
  ) {
    const baseOpts = typeof asOfOrOpts === 'string'
      ? { asOf: asOfOrOpts, ledger: ledgerArg }
      : { ledger: ledgerArg, ...asOfOrOpts };
    const opts = await this.resolveDimFilter(companyId, baseOpts);
    const ctx = await this.loadAccountsAndMapping(companyId);
    const current = await this.computeSingleBalanceSheet(companyId, opts, ctx);

    if (opts.compareAsOf) {
      const prev = await this.computeSingleBalanceSheet(companyId, { ...opts, asOf: opts.compareAsOf }, ctx);
      const prevAccMap = new Map<string, Decimal>();
      for (const s of prev.sections) {
        for (const a of s.accounts) prevAccMap.set(a.accountId, D(a.amount));
      }
      const prevSecMap = new Map(prev.sections.map((s) => [s.statementLineId || s.sectionCode, D(s.total)]));
      return {
        ...current,
        sections: current.sections.map((s) => {
          const pTot = prevSecMap.get(s.statementLineId || s.sectionCode) ?? D(0);
          return {
            ...s,
            ...calcVariance(D(s.total), pTot),
            accounts: s.accounts.map((a) => ({
              ...a,
              ...calcVariance(D(a.amount), prevAccMap.get(a.accountId) ?? D(0)),
            })),
          };
        }),
        comparative: {
          asOf: opts.compareAsOf,
          totalAssets: calcVariance(D(current.assets.total), D(prev.assets.total)),
          currentAssets: calcVariance(D(current.currentAssets.total), D(prev.currentAssets.total)),
          nonCurrentAssets: calcVariance(D(current.nonCurrentAssets.total), D(prev.nonCurrentAssets.total)),
          totalLiabilities: calcVariance(D(current.liabilities.total), D(prev.liabilities.total)),
          currentLiabilities: calcVariance(D(current.currentLiabilities.total), D(prev.currentLiabilities.total)),
          nonCurrentLiabilities: calcVariance(D(current.nonCurrentLiabilities.total), D(prev.nonCurrentLiabilities.total)),
          totalEquity: calcVariance(D(current.equity.totalWithEarnings), D(prev.equity.totalWithEarnings)),
          currentEarnings: calcVariance(D(current.currentEarnings), D(prev.currentEarnings)),
        },
      };
    }

    return current;
  }

  // ------------------------------------------------------------------ 3. DYNAMIC CASH FLOW STATEMENT (IAS 7)
  private async computeSingleCashFlow(
    companyId: string,
    opts: { from: string; to: string; ledger?: Ledger } & DimFilter,
    ctx: { accounts: CoaAccountMeta[]; statementLines: StatementLineDef[]; reclassifications: AccountReclassificationRecord[] },
  ) {
    const accById = new Map(ctx.accounts.map((a) => [a.id, a]));
    const cashIds = new Set<string>();
    const accCfCat = new Map<string, string>();
    for (const a of ctx.accounts) {
      const eff = resolveEffectiveClassification(a, opts.to, ctx.reclassifications);
      accCfCat.set(a.id, eff.cashFlowCategory);
      if (a.isPosting && eff.cashFlowCategory === 'CASH') cashIds.add(a.id);
    }

    const params: unknown[] = [companyId, opts.from, opts.to, opts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(opts, params);

    const lines = await this.db.query<{
      entry_id: string; entry_no: string; entry_date: string; journal_type: string; description: string;
      account_id: string; debit_base: string; credit_base: string;
    }>(
      `SELECT e.id AS entry_id, e.entry_no, e.entry_date::text AS entry_date, e.journal_type,
              COALESCE(l.description, e.description) AS description,
              l.account_id, l.debit_base, l.credit_base
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $4 AND e.entry_date <= $3${dims}
        ORDER BY e.entry_date, e.entry_no, l.line_no`,
      params,
    );

    const cashOpeningByAcc = new Map<string, Decimal>();
    const cashEndingByAcc = new Map<string, Decimal>();
    const entriesInPeriod = new Map<string, typeof lines>();
    const nonCashByAcc = new Map<string, Decimal>();

    for (const l of lines) {
      const dr = D(l.debit_base);
      const cr = D(l.credit_base);
      const netCash = dr.minus(cr);
      if (cashIds.has(l.account_id)) {
        cashEndingByAcc.set(l.account_id, (cashEndingByAcc.get(l.account_id) ?? D(0)).plus(netCash));
        if (l.entry_date < opts.from) {
          cashOpeningByAcc.set(l.account_id, (cashOpeningByAcc.get(l.account_id) ?? D(0)).plus(netCash));
        }
      }
      if (l.entry_date >= opts.from && l.entry_date <= opts.to) {
        const list = entriesInPeriod.get(l.entry_id) ?? [];
        list.push(l);
        entriesInPeriod.set(l.entry_id, list);
        if (accCfCat.get(l.account_id) === 'NON_CASH') {
          nonCashByAcc.set(l.account_id, (nonCashByAcc.get(l.account_id) ?? D(0)).plus(dr.minus(cr).abs()));
        }
      }
    }

    // Allocate cash movements per entry by counterparty accounts' cashFlowCategory
    const activityMap: Record<'OPERATING' | 'INVESTING' | 'FINANCING', Map<string, { accountId: string; code: string; nameAr: string; inflow: Decimal; outflow: Decimal; net: Decimal; txCount: number }>> = {
      OPERATING: new Map(),
      INVESTING: new Map(),
      FINANCING: new Map(),
    };

    for (const [, eLines] of entriesInPeriod) {
      const cashLines = eLines.filter((l) => cashIds.has(l.account_id));
      if (!cashLines.length) continue;
      const nonCashLines = eLines.filter((l) => !cashIds.has(l.account_id));
      const netCashDelta = cashLines.reduce((s, l) => s.plus(D(l.debit_base).minus(l.credit_base)), D(0));
      if (netCashDelta.isZero() || !nonCashLines.length) {
        // Pure inter-bank/cash transfer (net zero cash impact across consolidated cash pool)
        continue;
      }

      // Compute proportional weights of non-cash counterparty lines
      const totalWeight = nonCashLines.reduce((s, l) => s.plus(D(l.debit_base).plus(l.credit_base)), D(0));
      if (totalWeight.isZero()) continue;

      let allocated = D(0);
      nonCashLines.forEach((nl, idx) => {
        const isLast = idx === nonCashLines.length - 1;
        const w = D(nl.debit_base).plus(nl.credit_base);
        const share = isLast ? netCashDelta.minus(allocated) : netCashDelta.times(w).div(totalWeight).toDecimalPlaces(4);
        allocated = allocated.plus(share);

        const rawCat = accCfCat.get(nl.account_id) || 'OPERATING';
        const bucketKey: 'OPERATING' | 'INVESTING' | 'FINANCING' =
          rawCat === 'INVESTING' ? 'INVESTING' : rawCat === 'FINANCING' ? 'FINANCING' : 'OPERATING';

        const acc = accById.get(nl.account_id);
        const prev = activityMap[bucketKey].get(nl.account_id) ?? {
          accountId: nl.account_id,
          code: acc?.code || '—',
          nameAr: acc?.nameAr || 'حساب',
          inflow: D(0),
          outflow: D(0),
          net: D(0),
          txCount: 0,
        };
        if (share.greaterThan(0)) prev.inflow = prev.inflow.plus(share);
        else prev.outflow = prev.outflow.plus(share.abs());
        prev.net = prev.net.plus(share);
        prev.txCount += 1;
        activityMap[bucketKey].set(nl.account_id, prev);
      });
    }

    const buildSection = (key: 'OPERATING' | 'INVESTING' | 'FINANCING', sectionCode: string, nameAr: string, nameEn: string) => {
      const items = Array.from(activityMap[key].values())
        .filter((x) => !x.net.isZero())
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((x) => ({
          accountId: x.accountId,
          code: x.code,
          nameAr: x.nameAr,
          inflow: x.inflow.toFixed(2),
          outflow: x.outflow.toFixed(2),
          amount: x.net.toFixed(2),
          txCount: x.txCount,
        }));
      const total = items.reduce((s, x) => s.plus(x.amount), D(0));
      return { sectionCode, nameAr, nameEn, total: total.toFixed(2), accounts: items };
    };

    const operating = buildSection('OPERATING', 'OPERATING_ACTIVITIES', 'التدفقات النقدية من الأنشطة التشغيلية', 'Operating Activities');
    const investing = buildSection('INVESTING', 'INVESTING_ACTIVITIES', 'التدفقات النقدية من الأنشطة الاستثمارية', 'Investing Activities');
    const financing = buildSection('FINANCING', 'FINANCING_ACTIVITIES', 'التدفقات النقدية من الأنشطة التمويلية', 'Financing Activities');

    const openingCash = Array.from(cashOpeningByAcc.values()).reduce((s, v) => s.plus(v), D(0));
    const endingCash = Array.from(cashEndingByAcc.values()).reduce((s, v) => s.plus(v), D(0));
    const netCashChange = D(operating.total).plus(investing.total).plus(financing.total);
    const expectedEnding = openingCash.plus(netCashChange);
    const reconciliationDiff = endingCash.minus(expectedEnding);

    const cashAccounts = Array.from(cashIds)
      .map((cid) => {
        const a = accById.get(cid)!;
        const op = cashOpeningByAcc.get(cid) ?? D(0);
        const en = cashEndingByAcc.get(cid) ?? D(0);
        return {
          accountId: a.id,
          code: a.code,
          nameAr: a.nameAr,
          openingBalance: op.toFixed(2),
          periodChange: en.minus(op).toFixed(2),
          endingBalance: en.toFixed(2),
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));

    const nonCashAdjustments = Array.from(nonCashByAcc.entries()).map(([aid, val]) => {
      const a = accById.get(aid);
      return { accountId: aid, code: a?.code || '—', nameAr: a?.nameAr || 'بند غير نقدي', amount: val.toFixed(2) };
    });

    return {
      from: opts.from,
      to: opts.to,
      sections: [operating, investing, financing],
      operating,
      investing,
      financing,
      openingCash: openingCash.toFixed(2),
      netCashChange: netCashChange.toFixed(2),
      endingCash: endingCash.toFixed(2),
      reconciliationDiff: reconciliationDiff.toFixed(2),
      reconciled: reconciliationDiff.abs().lessThan(0.05),
      cashAccounts,
      nonCashAdjustments,
    };
  }

  async cashFlowStatement(
    companyId: string,
    opts: { from: string; to: string; compareFrom?: string; compareTo?: string; ledger?: Ledger } & DimFilter,
  ) {
    if (opts.from > opts.to) throw new DomainError('INVALID_DATE_RANGE');
    const resolvedOpts = await this.resolveDimFilter(companyId, opts);
    const ctx = await this.loadAccountsAndMapping(companyId);
    const current = await this.computeSingleCashFlow(companyId, resolvedOpts, ctx);

    if (opts.compareFrom && opts.compareTo) {
      const prev = await this.computeSingleCashFlow(companyId, { ...resolvedOpts, from: opts.compareFrom, to: opts.compareTo }, ctx);
      return {
        ...current,
        comparative: {
          from: opts.compareFrom,
          to: opts.compareTo,
          operating: calcVariance(D(current.operating.total), D(prev.operating.total)),
          investing: calcVariance(D(current.investing.total), D(prev.investing.total)),
          financing: calcVariance(D(current.financing.total), D(prev.financing.total)),
          netCashChange: calcVariance(D(current.netCashChange), D(prev.netCashChange)),
          endingCash: calcVariance(D(current.endingCash), D(prev.endingCash)),
        },
      };
    }

    return current;
  }

  // ------------------------------------------------------------------ 4. STATEMENT OF CHANGES IN EQUITY
  private async computeSingleEquityChanges(
    companyId: string,
    opts: { from: string; to: string; ledger?: Ledger } & DimFilter,
    ctx: { accounts: CoaAccountMeta[]; statementLines: StatementLineDef[]; reclassifications: AccountReclassificationRecord[] },
  ) {
    const accById = new Map(ctx.accounts.map((a) => [a.id, a]));
    const equityAccounts = ctx.accounts.filter((a) => a.isPosting && resolveEffectiveClassification(a, opts.to, ctx.reclassifications).statementSection === 'EQUITY');
    const eqIds = new Set(equityAccounts.map((a) => a.id));

    const params: unknown[] = [companyId, opts.to, opts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(opts, params);
    const lines = await this.db.query<{
      entry_id: string; entry_no: string; entry_date: string; journal_type: string; description: string;
      account_id: string; debit_base: string; credit_base: string;
    }>(
      `SELECT e.id AS entry_id, e.entry_no, e.entry_date::text AS entry_date, e.journal_type,
              COALESCE(l.description, e.description) AS description,
              l.account_id, l.debit_base, l.credit_base
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $3 AND e.entry_date <= $2${dims}
        ORDER BY e.entry_date, e.entry_no, l.line_no`,
      params,
    );

    // Per equity account breakdown
    const accCols = new Map<string, {
      accountId: string; code: string; nameAr: string; equitySection: string;
      opening: Decimal; additions: Decimal; reductions: Decimal; closingTransfers: Decimal; ending: Decimal;
    }>();
    for (const ea of equityAccounts) {
      accCols.set(ea.id, {
        accountId: ea.id,
        code: ea.code,
        nameAr: ea.nameAr,
        equitySection: inferEquitySection(ea),
        opening: D(0),
        additions: D(0),
        reductions: D(0),
        closingTransfers: D(0),
        ending: D(0),
      });
    }

    let openingUnclosedEarnings = D(0);
    let periodNetProfit = D(0);
    let periodClosingPnlTransfer = D(0);
    const movements: Array<{
      entryId: string; entryNo: string; entryDate: string; journalType: string;
      accountId: string; code: string; nameAr: string; description: string; amount: string;
    }> = [];

    for (const l of lines) {
      const acc = accById.get(l.account_id);
      if (!acc || !acc.isPosting) continue;
      const eff = resolveEffectiveClassification(acc, opts.to, ctx.reclassifications);
      const netCr = D(l.credit_base).minus(l.debit_base);

      if (eqIds.has(l.account_id)) {
        const col = accCols.get(l.account_id)!;
        if (l.entry_date < opts.from) {
          col.opening = col.opening.plus(netCr);
        } else {
          if (l.journal_type === 'CLOSING') {
            col.closingTransfers = col.closingTransfers.plus(netCr);
          } else if (netCr.greaterThan(0)) {
            col.additions = col.additions.plus(netCr);
          } else {
            col.reductions = col.reductions.plus(netCr); // negative
          }
          movements.push({
            entryId: l.entry_id,
            entryNo: l.entry_no,
            entryDate: l.entry_date,
            journalType: l.journal_type,
            accountId: acc.id,
            code: acc.code,
            nameAr: acc.nameAr,
            description: l.description || 'حركة حقوق ملكية',
            amount: netCr.toFixed(2),
          });
        }
      } else if (IS_SECTIONS.has(eff.statementSection)) {
        if (l.entry_date < opts.from) {
          openingUnclosedEarnings = openingUnclosedEarnings.plus(netCr);
        } else if (l.journal_type === 'CLOSING') {
          periodClosingPnlTransfer = periodClosingPnlTransfer.plus(netCr);
        } else {
          periodNetProfit = periodNetProfit.plus(netCr);
        }
      }
    }

    const components = Array.from(accCols.values()).map((c) => {
      const ending = c.opening.plus(c.additions).plus(c.reductions).plus(c.closingTransfers);
      return {
        accountId: c.accountId,
        code: c.code,
        nameAr: c.nameAr,
        equitySection: c.equitySection,
        opening: c.opening.toFixed(2),
        additions: c.additions.toFixed(2),
        reductions: c.reductions.toFixed(2),
        closingTransfers: c.closingTransfers.toFixed(2),
        ending: ending.toFixed(2),
      };
    });

    const endingUnclosedEarnings = openingUnclosedEarnings.plus(periodNetProfit).plus(periodClosingPnlTransfer);
    const totalOpening = components.reduce((s, c) => s.plus(c.opening), openingUnclosedEarnings);
    const totalAdditions = components.reduce((s, c) => s.plus(c.additions), D(0));
    const totalReductions = components.reduce((s, c) => s.plus(c.reductions), D(0));
    const totalClosingNet = components.reduce((s, c) => s.plus(c.closingTransfers), periodClosingPnlTransfer);
    const totalEnding = totalOpening.plus(periodNetProfit).plus(totalAdditions).plus(totalReductions).plus(totalClosingNet);

    return {
      from: opts.from,
      to: opts.to,
      components,
      unclosedEarnings: {
        opening: openingUnclosedEarnings.toFixed(2),
        periodNetProfit: periodNetProfit.toFixed(2),
        closingTransfers: periodClosingPnlTransfer.toFixed(2),
        ending: endingUnclosedEarnings.toFixed(2),
      },
      summary: {
        openingEquity: totalOpening.toFixed(2),
        netProfit: periodNetProfit.toFixed(2),
        capitalAdditions: totalAdditions.toFixed(2),
        distributionsAndReductions: totalReductions.toFixed(2),
        closingAdjustments: totalClosingNet.toFixed(2),
        endingEquity: totalEnding.toFixed(2),
      },
      movements,
    };
  }

  async equityChangesStatement(
    companyId: string,
    opts: { from: string; to: string; compareFrom?: string; compareTo?: string; ledger?: Ledger } & DimFilter,
  ) {
    if (opts.from > opts.to) throw new DomainError('INVALID_DATE_RANGE');
    const resolvedOpts = await this.resolveDimFilter(companyId, opts);
    const ctx = await this.loadAccountsAndMapping(companyId);
    const current = await this.computeSingleEquityChanges(companyId, resolvedOpts, ctx);

    if (opts.compareFrom && opts.compareTo) {
      const prev = await this.computeSingleEquityChanges(companyId, { ...resolvedOpts, from: opts.compareFrom, to: opts.compareTo }, ctx);
      return {
        ...current,
        comparative: {
          from: opts.compareFrom,
          to: opts.compareTo,
          openingEquity: calcVariance(D(current.summary.openingEquity), D(prev.summary.openingEquity)),
          netProfit: calcVariance(D(current.summary.netProfit), D(prev.summary.netProfit)),
          endingEquity: calcVariance(D(current.summary.endingEquity), D(prev.summary.endingEquity)),
        },
      };
    }

    return current;
  }

  /** Integrity: period balances table must equal the sum of posted lines. */
  async reconcilePeriodBalances(companyId: string, periodId?: string) {
    const params: unknown[] = [companyId];
    let pf = '';
    if (periodId) {
      params.push(periodId);
      pf = ' AND x.period_id = $2';
    }
    return this.db.query(
      `WITH lines AS (
         SELECT e.ledger, e.fiscal_period_id AS period_id, l.account_id, SUM(l.debit_base) dr, SUM(l.credit_base) cr
           FROM acc.journal_lines l JOIN acc.journal_entries e ON e.id = l.entry_id
          WHERE e.company_id = $1 AND e.status = 'POSTED' GROUP BY 1,2,3
       ), bal AS (
         SELECT ledger, period_id, account_id, debit_base dr, credit_base cr FROM acc.account_period_balances WHERE company_id = $1
       )
       SELECT * FROM (
         SELECT COALESCE(l.ledger, b.ledger) ledger, COALESCE(l.period_id, b.period_id) period_id,
                COALESCE(l.account_id, b.account_id) account_id, COALESCE(l.dr,0) AS "linesDebit", COALESCE(b.dr,0) AS "balanceDebit",
                COALESCE(l.cr,0) AS "linesCredit", COALESCE(b.cr,0) AS "balanceCredit"
           FROM lines l FULL JOIN bal b ON b.ledger = l.ledger AND b.period_id = l.period_id AND b.account_id = l.account_id
       ) x WHERE ("linesDebit" <> "balanceDebit" OR "linesCredit" <> "balanceCredit")${pf}`,
      params,
    );
  }
}
