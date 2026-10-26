import { computeZakat, EMPTY_MANUAL_INPUTS, inclusiveDays, ZakatSettings } from './zakat';

const SETTINGS_SAUDI: ZakatSettings = {
  saudiGulfPct: '100', foreignPct: '0', zakatRatePct: '2.5', incomeTaxRatePct: '20', hijriYearDays: 354,
};

describe('zakat worksheet', () => {
  it('counts days inclusively', () => {
    expect(inclusiveDays('2026-01-01', '2026-12-31')).toBe(365);
    expect(inclusiveDays('2026-10-01', '2026-10-01')).toBe(1);
  });

  it('applies 2.5% on a Hijri-length period', () => {
    // 354 days => exactly 2.5%
    const w = computeZakat('2026-01-01', '2026-12-20', SETTINGS_SAUDI, { openingEquity: '1000000', netProfitBeforeZakat: '0', netFixedAssets: '0' }, EMPTY_MANUAL_INPUTS);
    expect(w.days).toBe(354);
    expect(w.zakatDue).toBe('25000.00');
  });

  it('scales a 365-day Gregorian year by 365/354', () => {
    const w = computeZakat('2026-01-01', '2026-12-31', SETTINGS_SAUDI, { openingEquity: '1000000', netProfitBeforeZakat: '0', netFixedAssets: '0' }, EMPTY_MANUAL_INPUTS);
    // 1,000,000 x 2.5% x 365/354 = 25,776.836... -> 25,776.84
    expect(w.zakatDue).toBe('25776.84');
  });

  it('deducts net fixed assets and floors the base at adjusted profit', () => {
    const w = computeZakat('2026-01-01', '2026-12-20', SETTINGS_SAUDI, { openingEquity: '100000', netProfitBeforeZakat: '500000', netFixedAssets: '900000' }, EMPTY_MANUAL_INPUTS);
    expect(w.zakatBaseRaw).toBe('-300000.00');
    expect(w.zakatBase).toBe('500000.00');
    expect(w.baseFlooredToProfit).toBe(true);
    expect(w.zakatDue).toBe('12500.00');
  });

  it('never produces negative zakat when there is a loss', () => {
    const w = computeZakat('2026-01-01', '2026-12-20', SETTINGS_SAUDI, { openingEquity: '10000', netProfitBeforeZakat: '-50000', netFixedAssets: '0' }, EMPTY_MANUAL_INPUTS);
    expect(Number(w.zakatDue)).toBe(0);
    expect(Number(w.incomeTaxDue)).toBe(0);
  });

  it('splits zakat and income tax by ownership', () => {
    const s: ZakatSettings = { ...SETTINGS_SAUDI, saudiGulfPct: '60', foreignPct: '40' };
    const w = computeZakat('2026-01-01', '2026-12-20', s, { openingEquity: '1000000', netProfitBeforeZakat: '200000', netFixedAssets: '0' }, EMPTY_MANUAL_INPUTS);
    // base = 1,200,000 ; zakatable 60% = 720,000 -> 2.5% = 18,000 ; tax = 200,000 * 40% * 20% = 16,000
    expect(w.zakatDue).toBe('18000.00');
    expect(w.incomeTaxDue).toBe('16000.00');
    expect(w.totalDue).toBe('34000.00');
  });
});
