import { D, Decimal } from '../../../shared/money';

export interface DepreciableAsset {
  costBase: string;
  residualValueBase: string;
  usefulLifeMonths: number;
  method: 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
  decliningRatePct?: string | null;
  depreciationStart: string; // any day; depreciation starts in that month (full-month convention)
  disposalDate?: string | null;
}

export interface ScheduleRow {
  month: string; // YYYY-MM-01
  amount: string;
  accumulated: string;
  netBookValue: string;
}

const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** Last day covered by depreciation (inclusive). */
export function depreciationEnd(start: string, lifeMonths: number): string {
  const end = new Date(Date.parse(`${addMonths(monthStart(start), lifeMonths)}T00:00:00Z`) - 86_400_000);
  return end.toISOString().slice(0, 10);
}

/**
 * Monthly depreciation schedule in base currency. Full-month convention (the
 * month of depreciation start is a full month). The last month absorbs rounding
 * so that total depreciation equals cost - residual exactly. Months after a
 * disposal are not depreciated.
 */
export function depreciationSchedule(a: DepreciableAsset, decimals: number): ScheduleRow[] {
  const depreciable = D(a.costBase).minus(a.residualValueBase);
  const rows: ScheduleRow[] = [];
  let accumulated = D(0);
  const first = monthStart(a.depreciationStart);
  for (let i = 0; i < a.usefulLifeMonths; i++) {
    const month = addMonths(first, i);
    if (a.disposalDate && month > monthStart(a.disposalDate)) break;
    const remaining = depreciable.minus(accumulated);
    let amount: Decimal;
    if (i === a.usefulLifeMonths - 1) {
      amount = remaining;
    } else if (a.method === 'STRAIGHT_LINE') {
      amount = depreciable.div(a.usefulLifeMonths).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
    } else {
      const nbv = D(a.costBase).minus(accumulated);
      amount = nbv.times(D(a.decliningRatePct ?? 0).div(100)).div(12).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
      // never depreciate below residual value
      if (amount.greaterThan(remaining)) amount = remaining;
    }
    if (amount.isNegative()) amount = D(0);
    accumulated = accumulated.plus(amount);
    rows.push({
      month,
      amount: amount.toFixed(4),
      accumulated: accumulated.toFixed(4),
      netBookValue: D(a.costBase).minus(accumulated).toFixed(4),
    });
  }
  return rows;
}

export function depreciationForMonth(a: DepreciableAsset, periodStart: string, decimals: number): string {
  const row = depreciationSchedule(a, decimals).find((r) => r.month === monthStart(periodStart));
  return row?.amount ?? '0.0000';
}

export interface CustodyRange {
  employeeId: string;
  from: string;
  to: string | null;
}
export interface CustodyShare {
  employeeId: string | null;
  days: number;
  amount: string;
}

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Last day of the month that starts at `month` (YYYY-MM-01). */
export function monthEnd(month: string): string {
  return iso(t(addMonths(month, 1)) - DAY);
}

/**
 * Splits one month of depreciation between the employees who held the asset,
 * by calendar days of custody inside the month. Days without custody stay
 * un-assigned (employeeId null). Largest-remainder rounding keeps the total exact.
 */
export function splitByCustody(month: string, amount: string, custodies: CustodyRange[], decimals: number): CustodyShare[] {
  const start = month;
  const end = monthEnd(month);
  const totalDays = Math.round((t(end) - t(start)) / DAY) + 1;
  const parts: Array<{ employeeId: string | null; days: number }> = [];
  let covered = 0;
  for (const c of custodies) {
    const from = c.from > start ? c.from : start;
    const to = c.to && c.to < end ? c.to : end;
    if (from > to) continue;
    const days = Math.round((t(to) - t(from)) / DAY) + 1;
    covered += days;
    const existing = parts.find((p) => p.employeeId === c.employeeId);
    if (existing) existing.days += days;
    else parts.push({ employeeId: c.employeeId, days });
  }
  if (covered < totalDays) parts.push({ employeeId: null, days: totalDays - covered });
  const total = D(amount);
  const shares: Decimal[] = [];
  let allocated = D(0);
  // largest remainder
  const raw = parts.map((p) => total.times(p.days).div(totalDays));
  const floors = raw.map((r) => r.toDecimalPlaces(decimals, Decimal.ROUND_DOWN));
  floors.forEach((f) => (allocated = allocated.plus(f)));
  const unit = D(1).div(D(10).pow(decimals));
  let remaining = total.minus(allocated).div(unit).round().toNumber();
  const order = raw.map((r, i) => ({ i, rem: r.minus(floors[i]) })).sort((a, b) => b.rem.comparedTo(a.rem) || a.i - b.i);
  floors.forEach((f) => shares.push(f));
  for (const o of order) {
    if (remaining <= 0) break;
    shares[o.i] = shares[o.i].plus(unit);
    remaining--;
  }
  return parts.map((p, i) => ({ employeeId: p.employeeId, days: p.days, amount: shares[i].toFixed(4) })).filter((s) => !D(s.amount).isZero());
}
