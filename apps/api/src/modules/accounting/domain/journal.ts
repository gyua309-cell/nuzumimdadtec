import { D, Decimal, roundTo } from '../../../shared/money';
import { DomainError } from '../../../shared/errors';

/** Analytical dimensions carried by every journal line. */
export interface Dimensions {
  branchId?: string | null;
  costCenterId?: string | null;
  departmentId?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  assetId?: string | null;
}

export const DIMENSION_KEYS: (keyof Dimensions)[] = [
  'branchId', 'costCenterId', 'departmentId', 'projectId', 'clientId', 'supplierId', 'employeeId', 'assetId',
];

export interface JournalLineInput extends Dimensions {
  accountId: string;
  debit?: string | null;
  credit?: string | null;
  currencyCode?: string | null;
  exchangeRate?: string | null;
  /**
   * Internal only (never accepted from API clients): exact base amount to use,
   * e.g. when a reversal mirrors the original entry or a source document already
   * fixed its base amount at transaction time.
   */
  baseAmountOverride?: string | null;
  taxCodeId?: string | null;
  taxBaseAmount?: string | null;
  allocationBucket?: 'PROJECT' | 'UNUTILIZED' | 'NONE';
  revenueType?: 'NORMAL' | 'RETRO' | 'ADJUSTMENT' | null;
  description?: string | null;
  sourceLineRef?: string | null;
}

export interface BuiltLine extends JournalLineInput {
  lineNo: number;
  currencyCode: string;
  exchangeRate: string;
  debitTx: string;
  creditTx: string;
  debitBase: string;
  creditBase: string;
}

export interface CurrencyInfo {
  code: string;
  decimals: number;
}

/**
 * Converts input lines to persisted lines: validates one-sided positive amounts
 * and currency precision, converts to base currency with the line rate and
 * rounds HALF-UP to the base currency's minor unit.
 */
export function buildLines(
  lines: (JournalLineInput & { currencyCode: string; exchangeRate: string })[],
  base: CurrencyInfo,
  decimalsOf: (code: string) => number,
): BuiltLine[] {
  if (lines.length < 2) throw new DomainError('JE_TOO_FEW_LINES');
  return lines.map((l, i) => {
    const dr = D(l.debit || 0);
    const cr = D(l.credit || 0);
    if (dr.isNegative() || cr.isNegative()) throw new DomainError('JE_NEGATIVE_AMOUNT', `Line ${i + 1}: amounts must be positive`);
    if (dr.isZero() === cr.isZero()) {
      throw new DomainError('JE_LINE_ONE_SIDE', `Line ${i + 1}: exactly one of debit or credit must be greater than zero`);
    }
    const dec = decimalsOf(l.currencyCode);
    const amount = dr.isZero() ? cr : dr;
    if (amount.decimalPlaces() > dec) {
      throw new DomainError('AMOUNT_PRECISION', `Line ${i + 1}: ${l.currencyCode} allows ${dec} decimal places`);
    }
    const rate = l.currencyCode === base.code ? D(1) : D(l.exchangeRate);
    if (!rate.greaterThan(0)) throw new DomainError('EXCHANGE_RATE_MISSING', `Line ${i + 1}: exchange rate required`);
    const baseAmt = l.baseAmountOverride != null ? D(l.baseAmountOverride) : roundTo(amount.times(rate), base.decimals);
    if (baseAmt.lessThanOrEqualTo(0)) throw new DomainError('JE_BASE_AMOUNT_ZERO', `Line ${i + 1}: base amount rounds to zero`);
    return {
      ...l,
      lineNo: i + 1,
      exchangeRate: rate.toString(),
      debitTx: dr.toFixed(4),
      creditTx: cr.toFixed(4),
      debitBase: dr.isZero() ? '0.0000' : baseAmt.toFixed(4),
      creditBase: cr.isZero() ? '0.0000' : baseAmt.toFixed(4),
    };
  });
}

export function totals(lines: Pick<BuiltLine, 'debitBase' | 'creditBase'>[]): { debit: Decimal; credit: Decimal; diff: Decimal } {
  const debit = lines.reduce((s, l) => s.plus(l.debitBase), D(0));
  const credit = lines.reduce((s, l) => s.plus(l.creditBase), D(0));
  return { debit, credit, diff: debit.minus(credit) };
}

/**
 * FX rounding: when foreign-currency lines are individually rounded, debit and
 * credit base totals may differ by a few minor units. If the difference is within
 * tolerance (one minor unit per foreign line) a rounding line on the configured
 * ROUNDING account restores the balance. Larger differences are real imbalances
 * and are left for the posting validation to reject.
 */
export function roundingLine(lines: BuiltLine[], base: CurrencyInfo, roundingAccountId: string | null): BuiltLine | null {
  const { diff } = totals(lines);
  if (diff.isZero()) return null;
  const foreign = lines.filter((l) => l.currencyCode !== base.code).length;
  const unit = D(10).pow(-base.decimals);
  if (foreign === 0 || diff.abs().greaterThan(unit.times(foreign))) return null;
  if (!roundingAccountId) throw new DomainError('ROUNDING_ACCOUNT_MISSING', 'Configure an active posting account with subtype ROUNDING');
  const amt = diff.abs().toFixed(4);
  const debitSide = diff.isNegative();
  return {
    accountId: roundingAccountId,
    lineNo: lines.length + 1,
    currencyCode: base.code,
    exchangeRate: '1',
    debitTx: debitSide ? amt : '0.0000',
    creditTx: debitSide ? '0.0000' : amt,
    debitBase: debitSide ? amt : '0.0000',
    creditBase: debitSide ? '0.0000' : amt,
    description: 'FX rounding',
    allocationBucket: 'NONE',
  };
}

/** Mirror lines for a reversal: swap sides, keep currency, rate and exact base amounts. */
export function mirrorLines<T extends Omit<BuiltLine, 'lineNo'>>(lines: T[]): JournalLineInput[] {
  return lines.map((l) => {
    const isDebit = D(l.debitTx).greaterThan(0);
    return {
      ...pickDims(l),
      accountId: l.accountId,
      debit: isDebit ? null : l.creditTx,
      credit: isDebit ? l.debitTx : null,
      currencyCode: l.currencyCode,
      exchangeRate: l.exchangeRate,
      baseAmountOverride: isDebit ? l.debitBase : l.creditBase,
      taxCodeId: l.taxCodeId ?? null,
      taxBaseAmount: l.taxBaseAmount != null ? D(l.taxBaseAmount).negated().toFixed(4) : null,
      allocationBucket: l.allocationBucket ?? 'NONE',
      revenueType: l.revenueType ?? null,
      description: l.description ?? null,
      sourceLineRef: l.sourceLineRef ?? null,
    };
  });
}

export function pickDims(d: Dimensions): Dimensions {
  const out: Dimensions = {};
  for (const k of DIMENSION_KEYS) out[k] = d[k] ?? null;
  return out;
}
