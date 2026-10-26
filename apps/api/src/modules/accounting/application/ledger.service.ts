import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, Decimal } from '../../../shared/money';
import { Dimensions } from '../domain/journal';

export type Ledger = 'FINANCIAL' | 'MANAGEMENT';
const PNL_CLASSES = ['REVENUE', 'DIRECT_COST', 'OPERATING_EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE'];
const CREDIT_NATURE = new Set(['LIABILITY', 'EQUITY', 'REVENUE', 'OTHER_INCOME']);

export interface TrialBalanceRow {
  accountId: string;
  parentId: string | null;
  code: string;
  nameAr: string;
  nameEn: string | null;
  accountClass: string;
  level: number;
  isPosting: boolean;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
  closingDebit: string;
  closingCredit: string;
}

interface DimFilter extends Dimensions {}

const DIM_COLUMNS: Record<keyof Dimensions, string> = {
  branchId: 'l.branch_id', costCenterId: 'l.cost_center_id', departmentId: 'l.department_id', projectId: 'l.project_id',
  clientId: 'l.client_id', supplierId: 'l.supplier_id', employeeId: 'l.employee_id', assetId: 'l.asset_id',
};

function dimWhere(f: DimFilter, params: unknown[]): string {
  const parts: string[] = [];
  for (const [k, col] of Object.entries(DIM_COLUMNS)) {
    const v = f[k as keyof Dimensions];
    if (!v) continue;
    params.push(v);
    parts.push(`${col} = $${params.length}`);
  }
  return parts.length ? ` AND ${parts.join(' AND ')}` : '';
}

const split = (net: Decimal) => ({ debit: net.greaterThan(0) ? net.toFixed(4) : '0.0000', credit: net.lessThan(0) ? net.negated().toFixed(4) : '0.0000' });

/**
 * Read side of the general ledger. Every figure is computed from posted journal
 * lines (single source of truth), so any report can be drilled down to the
 * entry and the source document.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly db: DbService) {}

  async trialBalance(
    companyId: string,
    opts: { from: string; to: string; ledger?: Ledger; includeZero?: boolean } & DimFilter,
  ): Promise<{ rows: TrialBalanceRow[]; totals: Record<string, string>; balanced: boolean }> {
    if (opts.from > opts.to) throw new DomainError('INVALID_DATE_RANGE');
    const params: unknown[] = [companyId, opts.from, opts.to, opts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(opts, params);
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
      level: number; is_posting: boolean; path: string;
    }>(
      `SELECT id, parent_id, code, name_ar, name_en, account_class, level, is_posting, path::text AS path
         FROM acc.accounts WHERE company_id = $1 ORDER BY path`,
      [companyId],
    );
    const agg = new Map<string, { opening: Decimal; pd: Decimal; pc: Decimal }>();
    for (const a of accounts) agg.set(a.id, { opening: D(0), pd: D(0), pc: D(0) });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const s of sums) {
      // roll each posting account's movement up through all its ancestors
      let cur: string | null = s.account_id;
      while (cur) {
        const t = agg.get(cur)!;
        t.opening = t.opening.plus(s.opening);
        t.pd = t.pd.plus(s.pd);
        t.pc = t.pc.plus(s.pc);
        cur = byId.get(cur)?.parent_id ?? null;
      }
    }
    // depth-first order by code
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
        level: a.level, isPosting: a.is_posting, openingDebit: o.debit, openingCredit: o.credit, periodDebit: t.pd.toFixed(4),
        periodCredit: t.pc.toFixed(4), closingDebit: c.debit, closingCredit: c.credit,
      });
    }
    const out = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toFixed(4)]));
    const balanced = totals.periodDebit.equals(totals.periodCredit) && totals.closingDebit.equals(totals.closingCredit)
      && totals.openingDebit.equals(totals.openingCredit);
    return { rows, totals: out, balanced };
  }

  /** Account statement with opening balance and running balance (server-side window function). */
  async accountStatement(
    companyId: string,
    opts: { accountId: string; from: string; to: string; ledger?: Ledger; page: number; pageSize: number } & DimFilter,
  ) {
    const acct = await this.db.one<{ id: string; code: string; name_ar: string; normal_balance: string; account_class: string; path: string }>(
      'SELECT id, code, name_ar, normal_balance, account_class, path::text AS path FROM acc.accounts WHERE company_id = $1 AND id = $2',
      [companyId, opts.accountId],
    );
    if (!acct) throw new NotFoundError('Account', opts.accountId);
    // header accounts include all descendant posting accounts
    const params: unknown[] = [companyId, acct.path, opts.from, opts.to, opts.ledger ?? 'FINANCIAL'];
    const dims = dimWhere(opts, params);
    const base = `FROM acc.journal_lines l
        JOIN acc.journal_entries e ON e.id = l.entry_id
        JOIN acc.accounts a ON a.id = l.account_id
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
                l.project_id AS "projectId", l.employee_id AS "employeeId", l.cost_center_id AS "costCenterId", l.client_id AS "clientId",
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

  /** Income statement for a date range (year-end CLOSING entries are excluded). */
  async incomeStatement(companyId: string, opts: { from: string; to: string; ledger?: Ledger } & DimFilter) {
    const params: unknown[] = [companyId, opts.from, opts.to, opts.ledger ?? 'FINANCIAL', PNL_CLASSES];
    const dims = dimWhere(opts, params);
    const rows = await this.db.query<{ id: string; code: string; name_ar: string; account_class: string; net: string }>(
      `SELECT a.id, a.code, a.name_ar, a.account_class, SUM(l.credit_base - l.debit_base) AS net
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
         JOIN acc.accounts a ON a.id = l.account_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $4 AND e.journal_type <> 'CLOSING'
          AND e.entry_date BETWEEN $2 AND $3 AND a.account_class = ANY($5::text[])${dims}
        GROUP BY a.id, a.code, a.name_ar, a.account_class ORDER BY a.code`,
      params,
    );
    const sum = (cls: string[]) => rows.filter((r) => cls.includes(r.account_class)).reduce((s, r) => s.plus(r.net), D(0));
    const revenue = sum(['REVENUE']);
    const directCost = sum(['DIRECT_COST']).negated();
    const opex = sum(['OPERATING_EXPENSE']).negated();
    const otherIncome = sum(['OTHER_INCOME']);
    const otherExpense = sum(['OTHER_EXPENSE']).negated();
    const grossProfit = revenue.minus(directCost);
    const operatingProfit = grossProfit.minus(opex);
    const netProfit = operatingProfit.plus(otherIncome).minus(otherExpense);
    return {
      lines: rows.map((r) => ({
        accountId: r.id, code: r.code, nameAr: r.name_ar, accountClass: r.account_class,
        amount: (CREDIT_NATURE.has(r.account_class) ? D(r.net) : D(r.net).negated()).toFixed(4),
      })),
      revenue: revenue.toFixed(4), directCost: directCost.toFixed(4), grossProfit: grossProfit.toFixed(4), operatingExpenses: opex.toFixed(4),
      operatingProfit: operatingProfit.toFixed(4), otherIncome: otherIncome.toFixed(4), otherExpenses: otherExpense.toFixed(4),
      netProfit: netProfit.toFixed(4),
    };
  }

  /** Balance sheet as of a date; unclosed P&L is shown as current-period earnings. */
  async balanceSheet(companyId: string, asOf: string, ledger: Ledger = 'FINANCIAL') {
    const rows = await this.db.query<{ id: string; code: string; name_ar: string; account_class: string; net: string }>(
      `SELECT a.id, a.code, a.name_ar, a.account_class, SUM(l.debit_base - l.credit_base) AS net
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
         JOIN acc.accounts a ON a.id = l.account_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = $3 AND e.entry_date <= $2
        GROUP BY a.id, a.code, a.name_ar, a.account_class ORDER BY a.code`,
      [companyId, asOf, ledger],
    );
    const sumNet = (cls: string[]) => rows.filter((r) => cls.includes(r.account_class)).reduce((s, r) => s.plus(r.net), D(0));
    const assets = sumNet(['ASSET']);
    const liabilities = sumNet(['LIABILITY']).negated();
    const equity = sumNet(['EQUITY']).negated();
    const earnings = sumNet(PNL_CLASSES).negated();
    const difference = assets.minus(liabilities).minus(equity).minus(earnings);
    const section = (cls: string, sign: 1 | -1) =>
      rows
        .filter((r) => r.account_class === cls && !D(r.net).isZero())
        .map((r) => ({ accountId: r.id, code: r.code, nameAr: r.name_ar, amount: D(r.net).times(sign).toFixed(4) }));
    return {
      asOf,
      assets: { total: assets.toFixed(4), lines: section('ASSET', 1) },
      liabilities: { total: liabilities.toFixed(4), lines: section('LIABILITY', -1) },
      equity: { total: equity.toFixed(4), lines: section('EQUITY', -1) },
      currentEarnings: earnings.toFixed(4),
      liabilitiesAndEquity: liabilities.plus(equity).plus(earnings).toFixed(4),
      difference: difference.toFixed(4),
      balanced: difference.isZero(),
    };
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
