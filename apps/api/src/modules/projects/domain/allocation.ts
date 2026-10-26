import { dayAfter, dayBefore } from '../../../shared/effective';
import { allocateLargestRemainder, D, Decimal } from '../../../shared/money';

/**
 * Allocation & utilization maths (pure, no I/O).
 *
 * For one employee over a window of days, the active assignments are cut into
 * SEGMENTS in which the set of assignments does not change. In each segment:
 *
 *   total      = sum of raw allocation %
 *   allocated  = min(total, 100)
 *   unutilized = max(100 - total, 0)
 *   over       = max(total - 100, 0)           (warning only, never blocks)
 *
 * NORMALIZATION: when total > 100 every assignment is scaled by 100/total so the
 * employee's cost is distributed exactly once:
 *
 *   effective_i = raw_i * min(1, 100 / total)
 *   sum(effective_i) + unutilized = 100       (for every segment)
 */
export interface AssignmentRange {
  id: string;
  projectId: string;
  allocationPct: string;
  from: string;
  to: string | null;
}

export interface SegmentPart {
  assignmentId: string;
  projectId: string;
  rawPct: Decimal;
  effectivePct: Decimal;
}

export interface Segment {
  from: string;
  to: string;
  days: number;
  totalPct: Decimal;
  allocatedPct: Decimal;
  unutilizedPct: Decimal;
  overAllocatedPct: Decimal;
  parts: SegmentPart[];
}

export const daysBetweenInclusive = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

const maxDate = (a: string, b: string) => (a > b ? a : b);
const minDate = (a: string, b: string) => (a < b ? a : b);

export function segmentWindow(window: { from: string; to: string }, assignments: AssignmentRange[]): Segment[] {
  if (window.to < window.from) return [];
  const active = assignments.filter((a) => a.from <= window.to && (a.to === null || a.to >= window.from));
  const points = new Set<string>([window.from]);
  for (const a of active) {
    if (a.from > window.from) points.add(a.from);
    if (a.to !== null && a.to < window.to) points.add(dayAfter(a.to));
  }
  const sorted = [...points].sort();
  const segments: Segment[] = [];
  sorted.forEach((start, i) => {
    const end = i + 1 < sorted.length ? dayBefore(sorted[i + 1]) : window.to;
    const inSeg = active.filter((a) => a.from <= start && (a.to === null || a.to >= end));
    const total = inSeg.reduce((s, a) => s.plus(a.allocationPct), D(0));
    const scale = total.greaterThan(100) ? D(100).div(total) : D(1);
    segments.push({
      from: start,
      to: end,
      days: daysBetweenInclusive(start, end),
      totalPct: total,
      allocatedPct: Decimal.min(total, D(100)),
      unutilizedPct: Decimal.max(D(100).minus(total), D(0)),
      overAllocatedPct: Decimal.max(total.minus(100), D(0)),
      parts: inSeg.map((a) => ({
        assignmentId: a.id,
        projectId: a.projectId,
        rawPct: D(a.allocationPct),
        effectivePct: D(a.allocationPct).times(scale),
      })),
    });
  });
  return segments;
}

export interface UtilizationSummary {
  days: number;
  /** time-weighted averages over the window (percent of one full-time employee) */
  allocatedPct: string;
  unutilizedPct: string;
  overAllocatedPct: string;
  peakTotalPct: string;
  isOverAllocated: boolean;
  byProject: Array<{ projectId: string; rawPct: string; effectivePct: string }>;
}

export function summarize(segments: Segment[]): UtilizationSummary {
  const days = segments.reduce((s, x) => s + x.days, 0);
  const wavg = (f: (s: Segment) => Decimal) =>
    days === 0 ? D(0) : segments.reduce((s, x) => s.plus(f(x).times(x.days)), D(0)).div(days);
  const raw = new Map<string, Decimal>();
  const eff = new Map<string, Decimal>();
  for (const s of segments) {
    for (const p of s.parts) {
      raw.set(p.projectId, (raw.get(p.projectId) ?? D(0)).plus(p.rawPct.times(s.days)));
      eff.set(p.projectId, (eff.get(p.projectId) ?? D(0)).plus(p.effectivePct.times(s.days)));
    }
  }
  return {
    days,
    allocatedPct: wavg((s) => s.allocatedPct).toDecimalPlaces(4).toFixed(4),
    unutilizedPct: wavg((s) => s.unutilizedPct).toDecimalPlaces(4).toFixed(4),
    overAllocatedPct: wavg((s) => s.overAllocatedPct).toDecimalPlaces(4).toFixed(4),
    peakTotalPct: segments.reduce((m, s) => Decimal.max(m, s.totalPct), D(0)).toFixed(4),
    isOverAllocated: segments.some((s) => s.overAllocatedPct.greaterThan(0)),
    byProject: [...raw.keys()].map((projectId) => ({
      projectId,
      rawPct: (days ? raw.get(projectId)!.div(days) : D(0)).toDecimalPlaces(4).toFixed(4),
      effectivePct: (days ? eff.get(projectId)!.div(days) : D(0)).toDecimalPlaces(4).toFixed(4),
    })),
  };
}

export interface CostSplit {
  /** project cost parts (project id -> amount) */
  byProject: Array<{ projectId: string; amount: Decimal; effectivePct: Decimal }>;
  unutilized: Decimal;
}

/**
 * Splits an employee's period cost into per-project parts and an unutilized
 * remainder. Parts are weighted by effective-percent-days, so the result sums
 * EXACTLY to the cost (largest-remainder rounding) – nothing is loaded twice
 * and nothing is lost.
 */
export function splitCost(cost: string, segments: Segment[], decimals = 2): CostSplit {
  const days = segments.reduce((s, x) => s + x.days, 0);
  const weights = new Map<string, Decimal>();
  let unutilizedW = D(0);
  for (const s of segments) {
    for (const p of s.parts) weights.set(p.projectId, (weights.get(p.projectId) ?? D(0)).plus(p.effectivePct.times(s.days)));
    unutilizedW = unutilizedW.plus(s.unutilizedPct.times(s.days));
  }
  const keys = [...weights.keys()];
  if (days === 0 || D(cost).isZero()) {
    return { byProject: keys.map((projectId) => ({ projectId, amount: D(0), effectivePct: D(0) })), unutilized: D(cost) };
  }
  const all = allocateLargestRemainder(cost, [...keys.map((k) => weights.get(k)!), unutilizedW], decimals);
  return {
    byProject: keys.map((projectId, i) => ({ projectId, amount: all[i], effectivePct: weights.get(projectId)!.div(days) })),
    unutilized: all[all.length - 1],
  };
}

export { maxDate, minDate };
