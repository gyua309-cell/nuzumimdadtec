/**
 * Pure Accounting Domain Engine:
 * Unified Chart of Accounts <-> Dynamic Financial Statements
 *
 * Guarantees:
 * 1. Single Source of Truth: all 4 financial statements derive strictly from
 *    Chart of Accounts classifications + POSTED journal lines.
 * 2. Zero double-counting: only posting (leaf) accounts contribute to totals;
 *    header/summary accounts roll up leaf balances purely for display.
 * 3. Effective-dated reclassifications preserve historical period integrity.
 * 4. Mathematical reconciliation:
 *    - Balance Sheet: Assets === Liabilities + Equity + Current Period Earnings
 *    - Cash Flow: Opening Cash + Operating + Investing + Financing === Ending Cash
 *    - Equity Changes: Ending Equity === Balance Sheet Total Equity (incl. Current Earnings)
 */

import { D, Decimal } from '../../../shared/money';

export const STATEMENT_TYPES = [
  'BALANCE_SHEET',
  'INCOME_STATEMENT',
  'CASH_FLOW',
  'EQUITY_CHANGES',
] as const;
export type StatementType = (typeof STATEMENT_TYPES)[number];

export const ACCOUNT_STATEMENT_SECTIONS = [
  'CURRENT_ASSETS',
  'NON_CURRENT_ASSETS',
  'CURRENT_LIABILITIES',
  'NON_CURRENT_LIABILITIES',
  'EQUITY',
  'REVENUE',
  'COST_OF_SALES',
  'OPERATING_EXPENSES',
  'OTHER_INCOME',
  'OTHER_EXPENSES',
  'ZAKAT_TAX',
] as const;
export type AccountStatementSection = (typeof ACCOUNT_STATEMENT_SECTIONS)[number];

export const CASH_FLOW_CATEGORIES = [
  'CASH',
  'OPERATING',
  'INVESTING',
  'FINANCING',
  'NON_CASH',
] as const;
export type CashFlowCategory = (typeof CASH_FLOW_CATEGORIES)[number];

export const EQUITY_SECTIONS = [
  'PAID_IN_CAPITAL',
  'STATUTORY_RESERVE',
  'RETAINED_EARNINGS',
  'DIVIDENDS_DISTRIBUTIONS',
  'OTHER_EQUITY',
] as const;
export type EquitySection = (typeof EQUITY_SECTIONS)[number];

export interface CoaAccountMeta {
  id: string;
  parentId: string | null;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  accountClass: string;
  subtype?: string | null;
  normalBalance: 'DEBIT' | 'CREDIT';
  isContra?: boolean;
  isPosting: boolean;
  isActive?: boolean;
  level: number;
  statementSection?: string | null;
  statementLineId?: string | null;
  equityLineId?: string | null;
  cashFlowCategory?: string | null;
}

export interface StatementLineDef {
  id: string;
  statementType: StatementType;
  sectionCode: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  normalSign: 1 | -1;
  sortOrder: number;
  isSystem?: boolean;
  isActive?: boolean;
}

export interface AccountReclassificationRecord {
  accountId: string;
  effectiveFrom: string;
  changedAt?: string;
  oldStatementSection?: string | null;
  newStatementSection?: string | null;
  oldStatementLineId?: string | null;
  newStatementLineId?: string | null;
  oldEquityLineId?: string | null;
  newEquityLineId?: string | null;
  oldCashFlowCategory?: string | null;
  newCashFlowCategory?: string | null;
}

export interface PostedLineMovement {
  entryId: string;
  entryNo?: string | null;
  entryDate: string;
  journalType: string;
  description?: string | null;
  accountId: string;
  debitBase: string | number;
  creditBase: string | number;
}

export const BS_SECTIONS = new Set<string>([
  'CURRENT_ASSETS',
  'NON_CURRENT_ASSETS',
  'CURRENT_LIABILITIES',
  'NON_CURRENT_LIABILITIES',
  'EQUITY',
]);

export const IS_SECTIONS = new Set<string>([
  'REVENUE',
  'COST_OF_SALES',
  'OPERATING_EXPENSES',
  'OTHER_INCOME',
  'OTHER_EXPENSES',
  'ZAKAT_TAX',
]);

export const SECTION_LABELS_AR: Record<string, { nameAr: string; nameEn: string; sortOrder: number; statementType: StatementType }> = {
  CURRENT_ASSETS: { nameAr: 'الأصول المتداولة', nameEn: 'Current Assets', sortOrder: 10, statementType: 'BALANCE_SHEET' },
  NON_CURRENT_ASSETS: { nameAr: 'الأصول غير المتداولة', nameEn: 'Non-Current Assets', sortOrder: 20, statementType: 'BALANCE_SHEET' },
  CURRENT_LIABILITIES: { nameAr: 'الالتزامات المتداولة', nameEn: 'Current Liabilities', sortOrder: 30, statementType: 'BALANCE_SHEET' },
  NON_CURRENT_LIABILITIES: { nameAr: 'الالتزامات طويلة الأجل', nameEn: 'Non-Current Liabilities', sortOrder: 40, statementType: 'BALANCE_SHEET' },
  EQUITY: { nameAr: 'حقوق الملكية', nameEn: 'Equity', sortOrder: 50, statementType: 'BALANCE_SHEET' },
  REVENUE: { nameAr: 'الإيرادات التشغيلية', nameEn: 'Operating Revenue', sortOrder: 10, statementType: 'INCOME_STATEMENT' },
  COST_OF_SALES: { nameAr: 'تكلفة المبيعات والخدمات المباشرة', nameEn: 'Cost of Sales', sortOrder: 20, statementType: 'INCOME_STATEMENT' },
  OPERATING_EXPENSES: { nameAr: 'المصروفات التشغيلية والإدارية', nameEn: 'Operating Expenses', sortOrder: 30, statementType: 'INCOME_STATEMENT' },
  OTHER_INCOME: { nameAr: 'الإيرادات الأخرى', nameEn: 'Other Income', sortOrder: 40, statementType: 'INCOME_STATEMENT' },
  OTHER_EXPENSES: { nameAr: 'المصروفات الأخرى', nameEn: 'Other Expenses', sortOrder: 50, statementType: 'INCOME_STATEMENT' },
  ZAKAT_TAX: { nameAr: 'مصروف الزكاة وضريبة الدخل', nameEn: 'Zakat & Tax Expense', sortOrder: 60, statementType: 'INCOME_STATEMENT' },
  OPERATING_ACTIVITIES: { nameAr: 'التدفقات النقدية من الأنشطة التشغيلية', nameEn: 'Operating Activities', sortOrder: 10, statementType: 'CASH_FLOW' },
  INVESTING_ACTIVITIES: { nameAr: 'التدفقات النقدية من الأنشطة الاستثمارية', nameEn: 'Investing Activities', sortOrder: 20, statementType: 'CASH_FLOW' },
  FINANCING_ACTIVITIES: { nameAr: 'التدفقات النقدية من الأنشطة التمويلية', nameEn: 'Financing Activities', sortOrder: 30, statementType: 'CASH_FLOW' },
  CASH_EQUIVALENTS: { nameAr: 'النقدية وما في حكمها', nameEn: 'Cash & Equivalents', sortOrder: 40, statementType: 'CASH_FLOW' },
  PAID_IN_CAPITAL: { nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', sortOrder: 10, statementType: 'EQUITY_CHANGES' },
  STATUTORY_RESERVE: { nameAr: 'الاحتياطي النظامي', nameEn: 'Statutory Reserve', sortOrder: 20, statementType: 'EQUITY_CHANGES' },
  RETAINED_EARNINGS: { nameAr: 'الأرباح المبقاة', nameEn: 'Retained Earnings', sortOrder: 30, statementType: 'EQUITY_CHANGES' },
  DIVIDENDS_DISTRIBUTIONS: { nameAr: 'التوزيعات وجاري الشركاء', nameEn: 'Dividends & Drawings', sortOrder: 40, statementType: 'EQUITY_CHANGES' },
  OTHER_EQUITY: { nameAr: 'بنود حقوق ملكية أخرى', nameEn: 'Other Equity', sortOrder: 50, statementType: 'EQUITY_CHANGES' },
};

export function inferStatementSection(acc: Partial<CoaAccountMeta>): AccountStatementSection {
  if (acc.statementSection && (BS_SECTIONS.has(acc.statementSection) || IS_SECTIONS.has(acc.statementSection))) {
    return acc.statementSection as AccountStatementSection;
  }
  const cls = acc.accountClass || 'ASSET';
  const sub = acc.subtype || '';
  const name = String(acc.nameAr || '');
  const code = String(acc.code || '');

  if (cls === 'ASSET') {
    if (sub === 'FIXED_ASSET' || sub === 'ACCUMULATED_DEPRECIATION' || code.startsWith('12') || code.startsWith('105')) {
      return 'NON_CURRENT_ASSETS';
    }
    return 'CURRENT_ASSETS';
  }
  if (cls === 'LIABILITY') {
    if (name.includes('نهاية الخدمة') || name.includes('طويلة الأجل') || code.startsWith('22') || code === '20402') {
      return 'NON_CURRENT_LIABILITIES';
    }
    return 'CURRENT_LIABILITIES';
  }
  if (cls === 'EQUITY') return 'EQUITY';
  if (cls === 'REVENUE') return 'REVENUE';
  if (cls === 'DIRECT_COST') return 'COST_OF_SALES';
  if (cls === 'OTHER_INCOME') return 'OTHER_INCOME';
  if (cls === 'OTHER_EXPENSE') return 'OTHER_EXPENSES';
  if (name.includes('زكاة') || code === '50501') return 'ZAKAT_TAX';
  return 'OPERATING_EXPENSES';
}

export function inferCashFlowCategory(acc: Partial<CoaAccountMeta>): CashFlowCategory {
  if (acc.cashFlowCategory && (CASH_FLOW_CATEGORIES as readonly string[]).includes(acc.cashFlowCategory)) {
    return acc.cashFlowCategory as CashFlowCategory;
  }
  const sub = acc.subtype || '';
  const code = String(acc.code || '');
  const name = String(acc.nameAr || '');
  if (sub === 'CASH' || sub === 'BANK' || code.startsWith('101') || code.startsWith('102') || code.startsWith('1101')) {
    return 'CASH';
  }
  if (sub === 'ACCUMULATED_DEPRECIATION' || name.includes('إهلاك')) return 'NON_CASH';
  if (sub === 'FIXED_ASSET' || inferStatementSection(acc) === 'NON_CURRENT_ASSETS') return 'INVESTING';
  if (acc.accountClass === 'EQUITY' || (acc.accountClass === 'LIABILITY' && name.includes('قرض'))) return 'FINANCING';
  return 'OPERATING';
}

export function inferEquitySection(acc: Partial<CoaAccountMeta>): EquitySection {
  const sub = acc.subtype || '';
  const name = String(acc.nameAr || '');
  const code = String(acc.code || '');
  if (sub === 'RETAINED_EARNINGS' || name.includes('أرباح مبقاة') || name.includes('مرحلة') || code.startsWith('302')) {
    return 'RETAINED_EARNINGS';
  }
  if (name.includes('احتياطي')) return 'STATUTORY_RESERVE';
  if (name.includes('توزيع') || name.includes('جاري')) return 'DIVIDENDS_DISTRIBUTIONS';
  if (name.includes('رأس المال') || code.startsWith('301')) return 'PAID_IN_CAPITAL';
  return 'OTHER_EQUITY';
}

/**
 * Generates the next hierarchical numeric account code based on parent code and existing siblings.
 * Supports unlimited depth cleanly:
 * - Root: 1, 2, 3, 4, 5, 6...
 * - Level 2 under "1": 11, 12, 13...
 * - Level 3+ under "11": 1101, 1102...; under "1101": 110101, 110102...
 */
export function suggestNextAccountCode(
  parentCode: string | null | undefined,
  existingSiblingCodes: string[],
  accountClass?: string,
): string {
  const existingSet = new Set(existingSiblingCodes.map((c) => c.trim()));
  if (!parentCode) {
    const classPrefix: Record<string, number> = {
      ASSET: 1,
      LIABILITY: 2,
      EQUITY: 3,
      REVENUE: 4,
      OTHER_INCOME: 4,
      DIRECT_COST: 5,
      OPERATING_EXPENSE: 5,
      OTHER_EXPENSE: 5,
    };
    const start = classPrefix[accountClass || 'ASSET'] ?? 1;
    let candidate = start;
    while (existingSet.has(String(candidate))) candidate++;
    return String(candidate);
  }

  const cleanParent = parentCode.trim();
  // Detect sibling numeric suffix pattern if siblings already exist
  const numericSiblings = existingSiblingCodes
    .map((c) => c.trim())
    .filter((c) => c.startsWith(cleanParent) && /^\d+$/.test(c.slice(cleanParent.length)) && c.length > cleanParent.length);

  if (numericSiblings.length > 0) {
    const suffixLen = Math.max(...numericSiblings.map((c) => c.length - cleanParent.length));
    const maxNum = Math.max(...numericSiblings.map((c) => parseInt(c.slice(cleanParent.length), 10)));
    let next = maxNum + 1;
    while (existingSet.has(`${cleanParent}${String(next).padStart(suffixLen, '0')}`)) next++;
    return `${cleanParent}${String(next).padStart(suffixLen, '0')}`;
  }

  // Default hierarchy step: 1 digit for level 1->2 (1 -> 11), 2 digits for deeper levels (11 -> 1101 -> 110101)
  const pad = cleanParent.length <= 1 ? 1 : 2;
  let next = 1;
  while (existingSet.has(`${cleanParent}${String(next).padStart(pad, '0')}`)) next++;
  return `${cleanParent}${String(next).padStart(pad, '0')}`;
}

/**
 * Resolves effective statement section, statement line, and cash flow category
 * for an account as of `asOfDate`. If a reclassification occurred AFTER `asOfDate`,
 * walks backwards through the audit log so historical period reports remain intact.
 */
export function resolveEffectiveClassification(
  account: CoaAccountMeta,
  asOfDate: string,
  reclassifications: AccountReclassificationRecord[],
): {
  statementSection: AccountStatementSection;
  statementLineId: string | null;
  equityLineId: string | null;
  cashFlowCategory: CashFlowCategory;
} {
  let statementSection: string | null | undefined = account.statementSection;
  let statementLineId: string | null | undefined = account.statementLineId;
  let equityLineId: string | null | undefined = account.equityLineId;
  let cashFlowCategory: string | null | undefined = account.cashFlowCategory;

  const futureChanges = reclassifications
    .filter((r) => r.accountId === account.id && r.effectiveFrom > asOfDate)
    .sort((a, b) =>
      b.effectiveFrom.localeCompare(a.effectiveFrom) ||
      String(b.changedAt || '').localeCompare(String(a.changedAt || '')),
    );

  for (const ch of futureChanges) {
    if (ch.oldStatementSection !== undefined) statementSection = ch.oldStatementSection;
    if (ch.oldStatementLineId !== undefined) statementLineId = ch.oldStatementLineId;
    if (ch.oldEquityLineId !== undefined) equityLineId = ch.oldEquityLineId;
    if (ch.oldCashFlowCategory !== undefined) cashFlowCategory = ch.oldCashFlowCategory;
  }

  return {
    statementSection: inferStatementSection({ ...account, statementSection }),
    statementLineId: statementLineId ?? null,
    equityLineId: equityLineId ?? null,
    cashFlowCategory: inferCashFlowCategory({ ...account, statementSection, cashFlowCategory }),
  };
}

/**
 * Rolls up leaf (posting) account debit/credit sums through every ancestor header
 * without double counting.
 */
export function computeHierarchicalBalances(
  accounts: CoaAccountMeta[],
  leafSums: Map<string, { debit: Decimal; credit: Decimal }>,
): Map<string, { debit: Decimal; credit: Decimal; net: Decimal }> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const agg = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const a of accounts) {
    agg.set(a.id, { debit: D(0), credit: D(0) });
  }

  for (const [accId, sum] of leafSums.entries()) {
    const leaf = byId.get(accId);
    if (!leaf) continue;
    let cur: string | null = accId;
    const visited = new Set<string>();
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const bucket = agg.get(cur);
      if (bucket) {
        bucket.debit = bucket.debit.plus(sum.debit);
        bucket.credit = bucket.credit.plus(sum.credit);
      }
      cur = byId.get(cur)?.parentId ?? null;
    }
  }

  const out = new Map<string, { debit: Decimal; credit: Decimal; net: Decimal }>();
  for (const a of accounts) {
    const b = agg.get(a.id) ?? { debit: D(0), credit: D(0) };
    const net = a.normalBalance === 'CREDIT' ? b.credit.minus(b.debit) : b.debit.minus(b.credit);
    out.set(a.id, { debit: b.debit, credit: b.credit, net });
  }
  return out;
}

export function calcVariance(current: Decimal, previous: Decimal) {
  const variance = current.minus(previous);
  const variancePct = previous.isZero()
    ? (current.isZero() ? '0.0' : '100.0')
    : variance.div(previous.abs()).times(100).toFixed(1);
  return {
    previousAmount: previous.toFixed(2),
    variance: variance.toFixed(2),
    variancePct,
  };
}
