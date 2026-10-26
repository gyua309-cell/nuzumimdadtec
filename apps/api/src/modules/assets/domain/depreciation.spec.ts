import { D } from '../../../shared/money';
import { depreciationEnd, depreciationSchedule, monthEnd, splitByCustody } from './depreciation';

describe('depreciation domain', () => {
  const laptop = { costBase: '36000', residualValueBase: '0', usefulLifeMonths: 36, method: 'STRAIGHT_LINE' as const, depreciationStart: '2026-01-16' };

  it('computes the end date and a straight-line schedule that totals cost - residual exactly', () => {
    expect(depreciationEnd('2026-01-16', 36)).toBe('2028-12-31');
    const s = depreciationSchedule({ ...laptop, costBase: '1000', usefulLifeMonths: 3 }, 2);
    expect(s.map((r) => r.amount)).toEqual(['333.3300', '333.3300', '333.3400']);
    expect(s[2].netBookValue).toBe('0.0000');
  });

  it('never depreciates below the residual value (declining balance)', () => {
    const s = depreciationSchedule({ costBase: '1000', residualValueBase: '100', usefulLifeMonths: 24, method: 'DECLINING_BALANCE', decliningRatePct: '60', depreciationStart: '2026-01-01' }, 2);
    const total = s.reduce((t, r) => t.plus(r.amount), D(0));
    expect(total.toFixed(2)).toBe('900.00');
    expect(s.every((r) => D(r.amount).greaterThanOrEqualTo(0))).toBe(true);
  });

  it('stops after the disposal month', () => {
    const s = depreciationSchedule({ ...laptop, disposalDate: '2026-03-10' }, 2);
    expect(s.map((r) => r.month)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('splits one month by custody days with exact totals and unassigned days', () => {
    expect(monthEnd('2026-02-01')).toBe('2026-02-28');
    const parts = splitByCustody('2026-02-01', '1000.00', [{ employeeId: 'A', from: '2026-02-15', to: null }], 2);
    expect(parts).toEqual([
      { employeeId: 'A', days: 14, amount: '500.0000' },
      { employeeId: null, days: 14, amount: '500.0000' },
    ]);
    const three = splitByCustody(
      '2026-01-01',
      '100.00',
      [
        { employeeId: 'A', from: '2025-12-01', to: '2026-01-10' },
        { employeeId: 'B', from: '2026-01-11', to: '2026-01-20' },
        { employeeId: 'C', from: '2026-01-21', to: null },
      ],
      2,
    );
    expect(three.reduce((t, p) => t.plus(p.amount), D(0)).toFixed(2)).toBe('100.00');
    expect(three.map((p) => p.days)).toEqual([10, 10, 11]);
  });
});
