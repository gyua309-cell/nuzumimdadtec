import Decimal from 'decimal.js';

/**
 * Money & decimal helpers. All financial math uses decimal.js – never JS floats.
 * Amounts travel through the API as decimal strings.
 */
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalLike = Decimal | string | number;

export const D = (v: DecimalLike | null | undefined): Decimal => new Decimal(v ?? 0);

export function roundTo(v: DecimalLike, decimals: number): Decimal {
  return D(v).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/** Fixed 4-decimal string as stored in numeric(20,4) columns. */
export function toDbAmount(v: DecimalLike): string {
  return D(v).toFixed(4);
}

/**
 * Largest Remainder allocation: splits `total` by `weights` so that the parts,
 * rounded to `decimals`, sum EXACTLY to `total` (rounded). Guarantees that
 * distributing a cost never creates or loses a minor unit.
 */
export function allocateLargestRemainder(total: DecimalLike, weights: DecimalLike[], decimals: number): Decimal[] {
  const t = roundTo(total, decimals);
  if (weights.length === 0) return [];
  const w = weights.map((x) => D(x));
  if (w.some((x) => x.isNegative())) throw new Error('Allocation weights must be non-negative');
  const sumW = w.reduce((a, b) => a.plus(b), D(0));
  if (sumW.isZero()) throw new Error('Allocation weights sum to zero');

  const unit = D(10).pow(-decimals);
  const sign = t.isNegative() ? -1 : 1;
  const abs = t.abs();
  const raw = w.map((x) => abs.times(x).div(sumW));
  const floors = raw.map((r) => r.toDecimalPlaces(decimals, Decimal.ROUND_DOWN));
  let remainder = abs.minus(floors.reduce((a, b) => a.plus(b), D(0)));
  const order = raw
    .map((r, i) => ({ i, frac: r.minus(floors[i]) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  const parts = [...floors];
  let k = 0;
  while (remainder.greaterThanOrEqualTo(unit) && order.length > 0) {
    const idx = order[k % order.length].i;
    parts[idx] = parts[idx].plus(unit);
    remainder = remainder.minus(unit);
    k++;
  }
  return parts.map((p) => (sign < 0 ? p.negated() : p));
}
