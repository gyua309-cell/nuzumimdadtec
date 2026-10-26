import { D } from '../../../shared/money';
import { AssignmentRange, segmentWindow, splitCost, summarize } from './allocation';

const A = (id: string, projectId: string, pct: string, from: string, to: string | null = null): AssignmentRange => ({
  id, projectId, allocationPct: pct, from, to,
});
const jan = { from: '2026-01-01', to: '2026-01-31' };

describe('allocation & utilization', () => {
  it('under-allocation yields unutilized time', () => {
    const seg = segmentWindow(jan, [A('1', 'P1', '60', '2026-01-01')]);
    expect(seg).toHaveLength(1);
    const s = summarize(seg);
    expect(s.allocatedPct).toBe('60.0000');
    expect(s.unutilizedPct).toBe('40.0000');
    expect(s.overAllocatedPct).toBe('0.0000');
    expect(s.isOverAllocated).toBe(false);
  });

  it('no assignment means 100% unutilized', () => {
    const s = summarize(segmentWindow(jan, []));
    expect(s.unutilizedPct).toBe('100.0000');
    expect(s.days).toBe(31);
  });

  it('over-allocation is reported (not rejected) and normalized to 100%', () => {
    const seg = segmentWindow(jan, [A('1', 'P1', '80', '2026-01-01'), A('2', 'P2', '70', '2026-01-01')]);
    const s = summarize(seg);
    expect(s.isOverAllocated).toBe(true);
    expect(s.overAllocatedPct).toBe('50.0000');
    expect(s.peakTotalPct).toBe('150.0000');
    expect(s.allocatedPct).toBe('100.0000');
    // effective: 80*100/150 = 53.3333 and 70*100/150 = 46.6667 -> total 100
    const eff = s.byProject.map((p) => D(p.effectivePct)).reduce((a, b) => a.plus(b), D(0));
    expect(eff.toDecimalPlaces(3).toString()).toBe('100');
  });

  it('cost is never loaded twice: parts + unutilized equal the cost exactly', () => {
    const seg = segmentWindow(jan, [A('1', 'P1', '80', '2026-01-01'), A('2', 'P2', '70', '2026-01-01', '2026-01-15'), A('3', 'P3', '10', '2026-01-10')]);
    const split = splitCost('10000.01', seg);
    const sum = split.byProject.reduce((a, p) => a.plus(p.amount), split.unutilized);
    expect(sum.toFixed(2)).toBe('10000.01');
    expect(split.unutilized.greaterThanOrEqualTo(0)).toBe(true);
  });

  it('mid-month changes split into time-weighted segments', () => {
    const seg = segmentWindow(jan, [A('1', 'P1', '100', '2026-01-01', '2026-01-15'), A('2', 'P2', '50', '2026-01-16')]);
    expect(seg.map((s) => [s.from, s.to, s.days])).toEqual([['2026-01-01', '2026-01-15', 15], ['2026-01-16', '2026-01-31', 16]]);
    const split = splitCost('3100', seg);
    const p1 = split.byProject.find((p) => p.projectId === 'P1')!;
    const p2 = split.byProject.find((p) => p.projectId === 'P2')!;
    expect(p1.amount.toFixed(2)).toBe('1500.00'); // 15/31 * 100% * 3100
    expect(p2.amount.toFixed(2)).toBe('800.00'); // 16/31 * 50% * 3100
    expect(split.unutilized.toFixed(2)).toBe('800.00');
  });

  it('assignments outside the window are ignored', () => {
    const seg = segmentWindow(jan, [A('1', 'P1', '100', '2025-01-01', '2025-12-31'), A('2', 'P2', '100', '2026-02-01')]);
    expect(summarize(seg).unutilizedPct).toBe('100.0000');
  });
});
