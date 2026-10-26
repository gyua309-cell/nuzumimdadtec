import { D, Decimal } from '../../../shared/money';

/**
 * Employee cost engine (pure). Computes the monthly cost of one employee for one
 * period from effective-dated inputs, prorating by CALENDAR DAYS whenever
 * employment, salary, profile or component validity changes inside the month.
 * Nothing is hard-coded: every component, rate and method comes from configuration.
 */

export type Nature = 'EARNING' | 'EMPLOYER_CONTRIB' | 'EMPLOYEE_DEDUCTION' | 'ACCRUAL' | 'DEPRECIATION' | 'NOTIONAL' | 'TAX';
export type CalcMethod = 'BASIC_SALARY' | 'FIXED' | 'PCT_BASIC' | 'PCT_INSURANCE' | 'PCT_GROSS' | 'FROM_ASSETS';

export interface CompensationSegment {
  id: string;
  from: string;
  to: string | null;
  basicSalary: string;
  salaryCurrency: string;
  insuranceSalary: string;
  insuranceCurrency: string;
}

export interface ComponentRule {
  componentId: string;
  code: string;
  nameAr: string;
  componentType: string;
  nature: Nature;
  calcMethod: CalcMethod;
  costBehavior: 'FIXED' | 'VARIABLE';
  profitabilityTreatment: 'DISTRIBUTE' | 'EXCLUDE';
  postingTreatment: 'PAYROLL' | 'ACCRUAL' | 'DEPRECIATION_SOURCE' | 'NOTIONAL' | 'NONE';
  affectsNetPay: boolean;
  sortOrder: number;
  ratePct: string | null;
  amount: string | null;
  currencyCode: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  excluded?: boolean;
  /** validity of the (profile line ∩ component ∩ profile assignment ∩ override) */
  from: string;
  to: string | null;
  source: 'PROFILE' | 'OVERRIDE';
}

export interface CustodyDepreciation {
  assetId: string;
  assetNo: string;
  /** asset depreciation for the whole month in base currency */
  monthlyAmountBase: string;
  custodyFrom: string;
  custodyTo: string | null;
}

export interface CostInput {
  periodStart: string;
  periodEnd: string;
  employmentFrom: string;
  employmentTo: string | null;
  compensations: CompensationSegment[];
  components: ComponentRule[];
  custodies: CustodyDepreciation[];
  baseCurrency: string;
  decimalsOf: (currency: string) => number;
}

export interface CostLine {
  componentId: string;
  code: string;
  nameAr: string;
  componentType: string;
  nature: Nature;
  calcMethod: CalcMethod;
  costBehavior: 'FIXED' | 'VARIABLE';
  profitabilityTreatment: 'DISTRIBUTE' | 'EXCLUDE';
  postingTreatment: ComponentRule['postingTreatment'];
  affectsNetPay: boolean;
  currencyCode: string;
  amount: string;
  activeDays: number;
  /** compensation versions used (traceability of historical salary) */
  compensationIds: string[];
  details?: unknown;
}

export interface CostResult {
  periodDays: number;
  employedDays: number;
  lines: CostLine[];
}

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY) + 1;

/** Intersection of closed date ranges (null end = open). Returns null when empty. */
export function intersect(ranges: Array<{ from: string; to: string | null }>): { from: string; to: string } | null {
  let from = ranges[0].from;
  let to = ranges[0].to ?? '9999-12-31';
  for (const r of ranges.slice(1)) {
    if (r.from > from) from = r.from;
    const rt = r.to ?? '9999-12-31';
    if (rt < to) to = rt;
  }
  return from <= to ? { from, to } : null;
}

function cap(v: Decimal, min: string | null, max: string | null): Decimal {
  let r = v;
  if (min != null && r.lessThan(min)) r = D(min);
  if (max != null && r.greaterThan(max)) r = D(max);
  return r;
}

export function computeEmployeeCost(input: CostInput): CostResult {
  const period = { from: input.periodStart, to: input.periodEnd };
  const periodDays = daysBetween(input.periodStart, input.periodEnd);
  const employed = intersect([period, { from: input.employmentFrom, to: input.employmentTo }]);
  if (!employed) return { periodDays, employedDays: 0, lines: [] };

  // breakpoints split the month into homogeneous day-slices
  const points = new Set<number>([toTime(employed.from), toTime(employed.to) + DAY]);
  const addRange = (r: { from: string; to: string | null }) => {
    const i = intersect([employed, r]);
    if (!i) return;
    points.add(toTime(i.from));
    points.add(toTime(i.to) + DAY);
  };
  input.compensations.forEach(addRange);
  input.components.forEach(addRange);
  const sorted = [...points].sort((a, b) => a - b);

  type Acc = { amount: Decimal; days: number; comps: Set<string>; rule: ComponentRule; currency: string };
  const acc = new Map<string, Acc>();
  const add = (rule: ComponentRule, currency: string, amount: Decimal, days: number, compId?: string) => {
    const key = `${rule.componentId}|${currency}`;
    const cur = acc.get(key) ?? { amount: D(0), days: 0, comps: new Set<string>(), rule, currency };
    cur.amount = cur.amount.plus(amount);
    cur.days += days;
    if (compId) cur.comps.add(compId);
    acc.set(key, cur);
  };

  for (let i = 0; i < sorted.length - 1; i++) {
    const sFrom = toIso(sorted[i]);
    const sTo = toIso(sorted[i + 1] - DAY);
    if (sFrom < employed.from || sTo > employed.to) continue;
    const days = daysBetween(sFrom, sTo);
    const factor = D(days).div(periodDays);
    const comp = input.compensations.find((c) => intersect([{ from: sFrom, to: sTo }, c]) && c.from <= sFrom && (c.to ?? '9999-12-31') >= sTo);
    const active = input.components
      .filter((c) => !c.excluded && c.from <= sFrom && (c.to ?? '9999-12-31') >= sTo)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // monthly (unprorated) earnings in salary currency, used by PCT_GROSS
    let grossMonthly = D(0);
    const monthly = (c: ComponentRule): { amount: Decimal; currency: string } | null => {
      switch (c.calcMethod) {
        case 'BASIC_SALARY':
          return comp ? { amount: D(comp.basicSalary), currency: comp.salaryCurrency } : null;
        case 'FIXED':
          return c.amount != null && c.currencyCode ? { amount: D(c.amount), currency: c.currencyCode } : null;
        case 'PCT_BASIC':
          return comp && c.ratePct != null ? { amount: D(comp.basicSalary).times(c.ratePct).div(100), currency: comp.salaryCurrency } : null;
        case 'PCT_INSURANCE':
          return comp && c.ratePct != null
            ? { amount: D(comp.insuranceSalary).times(c.ratePct).div(100), currency: comp.insuranceCurrency }
            : null;
        case 'PCT_GROSS':
          return comp && c.ratePct != null ? { amount: grossMonthly.times(c.ratePct).div(100), currency: comp.salaryCurrency } : null;
        default:
          return null;
      }
    };
    // earnings first (so PCT_GROSS sees them), then the rest
    const ordered = [...active.filter((c) => c.nature === 'EARNING' && c.calcMethod !== 'PCT_GROSS'), ...active.filter((c) => !(c.nature === 'EARNING' && c.calcMethod !== 'PCT_GROSS'))];
    for (const c of ordered) {
      if (c.calcMethod === 'FROM_ASSETS') continue;
      const m = monthly(c);
      if (!m) continue;
      const capped = cap(m.amount, c.minAmount, c.maxAmount);
      if (c.nature === 'EARNING' && comp && m.currency === comp.salaryCurrency) grossMonthly = grossMonthly.plus(capped);
      add(c, m.currency, capped.times(factor), days, comp?.id);
    }
  }

  // depreciation of assets in the employee's custody, prorated by custody days
  for (const rule of input.components.filter((c) => c.calcMethod === 'FROM_ASSETS' && !c.excluded)) {
    const ruleRange = intersect([employed, rule]);
    if (!ruleRange) continue;
    const details: Array<{ assetId: string; assetNo: string; days: number; amount: string }> = [];
    let total = D(0);
    for (const cu of input.custodies) {
      const r = intersect([ruleRange, { from: cu.custodyFrom, to: cu.custodyTo }]);
      if (!r) continue;
      const days = daysBetween(r.from, r.to);
      const amt = D(cu.monthlyAmountBase).times(days).div(periodDays);
      total = total.plus(amt);
      details.push({ assetId: cu.assetId, assetNo: cu.assetNo, days, amount: amt.toFixed(4) });
    }
    if (!total.isZero()) {
      const key = `${rule.componentId}|${input.baseCurrency}`;
      acc.set(key, { amount: total, days: daysBetween(ruleRange.from, ruleRange.to), comps: new Set(), rule, currency: input.baseCurrency });
      (acc.get(key) as Acc & { details?: unknown }).details = details;
    }
  }

  const lines: CostLine[] = [...acc.values()]
    .map((a) => ({
      componentId: a.rule.componentId,
      code: a.rule.code,
      nameAr: a.rule.nameAr,
      componentType: a.rule.componentType,
      nature: a.rule.nature,
      calcMethod: a.rule.calcMethod,
      costBehavior: a.rule.costBehavior,
      profitabilityTreatment: a.rule.profitabilityTreatment,
      postingTreatment: a.rule.postingTreatment,
      affectsNetPay: a.rule.affectsNetPay,
      currencyCode: a.currency,
      amount: a.amount.toDecimalPlaces(input.decimalsOf(a.currency), Decimal.ROUND_HALF_UP).toFixed(input.decimalsOf(a.currency)),
      activeDays: a.days,
      compensationIds: [...a.comps],
      details: (a as Acc & { details?: unknown }).details,
    }))
    .filter((l) => !D(l.amount).isZero())
    .sort((x, y) => {
      const sx = input.components.find((c) => c.componentId === x.componentId)?.sortOrder ?? 0;
      const sy = input.components.find((c) => c.componentId === y.componentId)?.sortOrder ?? 0;
      return sx - sy || x.code.localeCompare(y.code);
    });

  return { periodDays, employedDays: daysBetween(employed.from, employed.to), lines };
}

/** Natures that are a cost to the company (feed profitability). */
export const COST_NATURES: Nature[] = ['EARNING', 'EMPLOYER_CONTRIB', 'ACCRUAL', 'DEPRECIATION', 'NOTIONAL'];
