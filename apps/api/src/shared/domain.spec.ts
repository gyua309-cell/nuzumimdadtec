import { allocateLargestRemainder, D } from './money';
import { buildLines, mirrorLines, roundingLine, totals } from '../modules/accounting/domain/journal';
import { conditionsMatch } from '../modules/accounting/application/posting-rules.service';

describe('allocateLargestRemainder', () => {
  it('always sums exactly to the rounded total (property test)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rnd() * 8);
      const weights = Array.from({ length: n }, () => (rnd() * 100).toFixed(3));
      if (weights.every((w) => Number(w) === 0)) continue;
      const total = (rnd() * 100000 - 20000).toFixed(4);
      const parts = allocateLargestRemainder(total, weights, 2);
      const sum = parts.reduce((s, p) => s.plus(p), D(0));
      expect(sum.toFixed(2)).toBe(D(total).toDecimalPlaces(2).toFixed(2));
      parts.forEach((p) => expect(p.decimalPlaces()).toBeLessThanOrEqual(2));
    }
  });

  it('distributes the remainder to the largest fractions', () => {
    expect(allocateLargestRemainder('100.01', ['60', '40'], 2).map((d) => d.toFixed(2))).toEqual(['60.01', '40.00']);
    expect(allocateLargestRemainder('100', ['1', '1', '1'], 2).map((d) => d.toFixed(2))).toEqual(['33.34', '33.33', '33.33']);
  });

  it('rejects invalid weights', () => {
    expect(() => allocateLargestRemainder('10', ['0', '0'], 2)).toThrow();
    expect(() => allocateLargestRemainder('10', ['-1', '2'], 2)).toThrow();
  });
});

describe('journal domain', () => {
  const base = { code: 'EGP', decimals: 2 };
  const dec = () => 2;

  it('converts to base with HALF-UP rounding and keeps Debit = Credit for base lines', () => {
    const lines = buildLines(
      [
        { accountId: 'a', debit: '100', currencyCode: 'USD', exchangeRate: '50.1234' },
        { accountId: 'b', credit: '5012.34', currencyCode: 'EGP', exchangeRate: '1' },
      ],
      base,
      dec,
    );
    expect(lines[0].debitBase).toBe('5012.3400');
    expect(totals(lines).diff.isZero()).toBe(true);
  });

  it('rejects two-sided, zero, negative and over-precise lines', () => {
    const mk = (l: any) => () => buildLines([l, { accountId: 'b', credit: '1', currencyCode: 'EGP', exchangeRate: '1' }], base, dec);
    expect(mk({ accountId: 'a', debit: '1', credit: '1', currencyCode: 'EGP', exchangeRate: '1' })).toThrow(/exactly one/);
    expect(mk({ accountId: 'a', currencyCode: 'EGP', exchangeRate: '1' })).toThrow();
    expect(mk({ accountId: 'a', debit: '-1', currencyCode: 'EGP', exchangeRate: '1' })).toThrow();
    expect(mk({ accountId: 'a', debit: '1.001', currencyCode: 'EGP', exchangeRate: '1' })).toThrow(/decimal/);
  });

  it('creates a rounding line only within tolerance', () => {
    const lines = buildLines(
      [
        { accountId: 'a', debit: '1.00', currencyCode: 'USD', exchangeRate: '3.3333' },
        { accountId: 'b', credit: '0.50', currencyCode: 'USD', exchangeRate: '3.3333' },
        { accountId: 'c', credit: '0.50', currencyCode: 'USD', exchangeRate: '3.3333' },
      ],
      base,
      dec,
    );
    const r = roundingLine(lines, base, 'round')!;
    expect(r.debitBase).toBe('0.0100');
    expect(totals([...lines, r]).diff.isZero()).toBe(true);

    const unbalanced = buildLines(
      [
        { accountId: 'a', debit: '10', currencyCode: 'EGP', exchangeRate: '1' },
        { accountId: 'b', credit: '9', currencyCode: 'EGP', exchangeRate: '1' },
      ],
      base,
      dec,
    );
    expect(roundingLine(unbalanced, base, 'round')).toBeNull();
  });

  it('mirrors lines exactly for reversals', () => {
    const lines = buildLines(
      [
        { accountId: 'a', debit: '100', currencyCode: 'USD', exchangeRate: '50.1234' },
        { accountId: 'b', credit: '5012.34', currencyCode: 'EGP', exchangeRate: '1' },
      ],
      base,
      dec,
    );
    const m = buildLines(mirrorLines(lines) as any, base, dec);
    expect(m[0].creditBase).toBe(lines[0].debitBase);
    expect(m[1].debitBase).toBe(lines[1].creditBase);
    expect(m[0].exchangeRate).toBe(lines[0].exchangeRate);
  });
});

describe('posting rule conditions', () => {
  it('matches all keys and supports IN lists', () => {
    expect(conditionsMatch({}, { a: 1 })).toBe(true);
    expect(conditionsMatch({ type: 'SALARY' }, { type: 'SALARY' })).toBe(true);
    expect(conditionsMatch({ type: ['BONUS', 'OVERTIME'] }, { type: 'OVERTIME' })).toBe(true);
    expect(conditionsMatch({ type: 'SALARY', dept: 'X' }, { type: 'SALARY' })).toBe(false);
  });
});
