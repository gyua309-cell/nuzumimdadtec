import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';
import { depreciationForMonth } from '../../assets/domain/depreciation';
import { ComponentRule, computeEmployeeCost, COST_NATURES, CostResult, intersect } from '../domain/cost-engine';

export interface PeriodRange {
  start: string;
  end: string;
}

export interface EmployeeCostLineBase {
  componentId: string;
  code: string;
  nameAr: string;
  nature: string;
  calcMethod: string;
  postingTreatment: string;
  profitabilityTreatment: string;
  affectsNetPay: boolean;
  currencyCode: string;
  amount: string;
  exchangeRate: string;
  amountBase: string;
  activeDays: number;
  compensationIds: string[];
  details?: unknown;
}

export interface EmployeeCost {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  periodDays: number;
  employedDays: number;
  baseCurrency: string;
  lines: EmployeeCostLineBase[];
  totalCostBase: string;
  totalDeductionsBase: string;
  distributableCostBase: string;
}

const dec = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Loads effective-dated inputs for one employee and one period, runs the pure
 * cost engine and converts to base currency with the period-end rate (rate
 * stored with every line so history never depends on today's rate).
 */
@Injectable()
export class EmployeeCostService {
  constructor(
    private readonly db: DbService,
    private readonly fx: ExchangeRateService,
  ) {}

  async loadRules(companyId: string, employeeId: string, p: PeriodRange): Promise<ComponentRule[]> {
    const profileLines = await this.db.query(
      `SELECT c.id AS "componentId", c.code, c.name_ar AS "nameAr", c.component_type AS "componentType", c.nature, c.calc_method AS "calcMethod",
              c.cost_behavior AS "costBehavior", c.profitability_treatment AS "profitabilityTreatment", c.posting_treatment AS "postingTreatment",
              c.affects_net_pay AS "affectsNetPay", c.sort_order AS "sortOrder",
              l.rate_pct AS "ratePct", l.amount, l.currency_code AS "currencyCode", l.min_amount AS "minAmount", l.max_amount AS "maxAmount",
              GREATEST(ep.effective_from, l.effective_from, c.effective_from)::text AS "from",
              NULLIF(LEAST(COALESCE(ep.effective_to,'9999-12-31'), COALESCE(l.effective_to,'9999-12-31'), COALESCE(c.effective_to,'9999-12-31')), '9999-12-31')::text AS "to"
         FROM hr.employee_cost_profiles ep
         JOIN hr.cost_profile_components l ON l.profile_id = ep.profile_id
         JOIN hr.cost_components c ON c.id = l.component_id AND c.is_active
        WHERE ep.company_id = $1 AND ep.employee_id = $2
          AND daterange(ep.effective_from, ep.effective_to, '[]') && daterange($3::date, $4::date, '[]')
          AND daterange(l.effective_from, l.effective_to, '[]') && daterange($3::date, $4::date, '[]')
          AND daterange(c.effective_from, c.effective_to, '[]') && daterange($3::date, $4::date, '[]')`,
      [companyId, employeeId, p.start, p.end],
    );
    let rules: ComponentRule[] = profileLines
      .filter((r: any) => !r.to || r.from <= r.to)
      .map((r: any) => ({ ...r, sortOrder: Number(r.sortOrder), source: 'PROFILE' as const }));

    const overrides = await this.db.query(
      `SELECT o.component_id AS "componentId", c.code, c.name_ar AS "nameAr", c.component_type AS "componentType", c.nature, c.calc_method AS "calcMethod",
              c.cost_behavior AS "costBehavior", c.profitability_treatment AS "profitabilityTreatment", c.posting_treatment AS "postingTreatment",
              c.affects_net_pay AS "affectsNetPay", c.sort_order AS "sortOrder", o.rate_pct AS "ratePct", o.amount, o.currency_code AS "currencyCode",
              o.is_excluded AS "excluded",
              GREATEST(o.effective_from, c.effective_from)::text AS "from",
              NULLIF(LEAST(COALESCE(o.effective_to,'9999-12-31'), COALESCE(c.effective_to,'9999-12-31')), '9999-12-31')::text AS "to"
         FROM hr.employee_component_overrides o JOIN hr.cost_components c ON c.id = o.component_id AND c.is_active
        WHERE o.company_id = $1 AND o.employee_id = $2 AND daterange(o.effective_from, o.effective_to, '[]') && daterange($3::date, $4::date, '[]')`,
      [companyId, employeeId, p.start, p.end],
    );
    for (const o of overrides as any[]) {
      if (o.to && o.from > o.to) continue;
      const ov = { from: o.from as string, to: (o.to as string | null) ?? null };
      const next: ComponentRule[] = [];
      let matchedProfile = false;
      for (const r of rules) {
        if (r.componentId !== o.componentId || !intersect([r, ov])) {
          next.push(r);
          continue;
        }
        matchedProfile = true;
        // keep the profile rule outside the override window
        if (r.from < ov.from) next.push({ ...r, to: dec(ov.from, -1) });
        if (ov.to && (r.to ?? '9999-12-31') > ov.to) next.push({ ...r, from: dec(ov.to, 1) });
        const i = intersect([r, ov])!;
        next.push({
          ...r,
          ratePct: o.ratePct ?? r.ratePct,
          amount: o.amount ?? r.amount,
          currencyCode: o.currencyCode ?? r.currencyCode,
          excluded: o.excluded,
          from: i.from,
          to: i.to === '9999-12-31' ? null : i.to,
          source: 'OVERRIDE',
        });
      }
      // an override for a component that is not in the profile adds it for this employee
      if (!matchedProfile && !o.excluded) {
        next.push({ ...o, sortOrder: Number(o.sortOrder), minAmount: null, maxAmount: null, excluded: false, source: 'OVERRIDE' });
      }
      rules = next;
    }
    return rules;
  }

  async compute(companyId: string, employeeId: string, p: PeriodRange): Promise<EmployeeCost> {
    const emp = await this.db.one<{ hire_date: string; termination_date: string | null }>(
      'SELECT hire_date, termination_date FROM hr.employees WHERE company_id = $1 AND id = $2',
      [companyId, employeeId],
    );
    if (!emp) throw new NotFoundError('Employee', employeeId);
    const base = await this.fx.baseCurrency(companyId);
    const compensations = await this.db.query(
      `SELECT id, effective_from::text AS "from", effective_to::text AS "to", basic_salary AS "basicSalary", salary_currency AS "salaryCurrency",
              insurance_salary AS "insuranceSalary", insurance_currency AS "insuranceCurrency"
         FROM hr.employee_compensations
        WHERE company_id = $1 AND employee_id = $2 AND daterange(effective_from, effective_to, '[]') && daterange($3::date, $4::date, '[]')`,
      [companyId, employeeId, p.start, p.end],
    );
    const components = await this.loadRules(companyId, employeeId, p);
    const custodyRows = await this.db.query(
      `SELECT a.id, a.asset_no, a.cost_base, a.residual_value_base, a.useful_life_months, a.depreciation_method, a.declining_rate_pct,
              a.depreciation_start::text AS depreciation_start, a.disposal_date::text AS disposal_date,
              cu.effective_from::text AS custody_from, cu.effective_to::text AS custody_to
         FROM ast.asset_custodies cu JOIN ast.assets a ON a.id = cu.asset_id JOIN ast.asset_categories cat ON cat.id = a.category_id
        WHERE cu.company_id = $1 AND cu.employee_id = $2 AND a.status <> 'DRAFT' AND cat.include_in_employee_cost
          AND daterange(cu.effective_from, cu.effective_to, '[]') && daterange($3::date, $4::date, '[]')`,
      [companyId, employeeId, p.start, p.end],
    );
    const custodies = custodyRows.map((a: any) => ({
      assetId: a.id,
      assetNo: a.asset_no,
      monthlyAmountBase: depreciationForMonth(
        {
          costBase: a.cost_base, residualValueBase: a.residual_value_base, usefulLifeMonths: Number(a.useful_life_months),
          method: a.depreciation_method, decliningRatePct: a.declining_rate_pct, depreciationStart: a.depreciation_start, disposalDate: a.disposal_date,
        },
        p.start,
        base.decimals,
      ),
      custodyFrom: a.custody_from,
      custodyTo: a.custody_to,
    }));
    const decimalsCache = new Map<string, number>([[base.code, base.decimals]]);
    for (const c of [...compensations.flatMap((x: any) => [x.salaryCurrency, x.insuranceCurrency]), ...components.map((c) => c.currencyCode).filter(Boolean)]) {
      if (!decimalsCache.has(c)) decimalsCache.set(c, await this.fx.currencyDecimals(c));
    }
    const result: CostResult = computeEmployeeCost({
      periodStart: p.start,
      periodEnd: p.end,
      employmentFrom: emp.hire_date,
      employmentTo: emp.termination_date,
      compensations,
      components,
      custodies,
      baseCurrency: base.code,
      decimalsOf: (c) => decimalsCache.get(c) ?? 2,
    });
    const lines: EmployeeCostLineBase[] = [];
    for (const l of result.lines) {
      const rate = await this.fx.toBase(companyId, l.currencyCode, p.end, 'SPOT');
      lines.push({
        componentId: l.componentId, code: l.code, nameAr: l.nameAr, nature: l.nature, calcMethod: l.calcMethod, postingTreatment: l.postingTreatment,
        profitabilityTreatment: l.profitabilityTreatment, affectsNetPay: l.affectsNetPay, currencyCode: l.currencyCode, amount: l.amount,
        exchangeRate: rate.rate.toFixed(10), amountBase: D(l.amount).times(rate.rate).toDecimalPlaces(base.decimals).toFixed(base.decimals),
        activeDays: l.activeDays, compensationIds: l.compensationIds, details: l.details,
      });
    }
    const sum = (f: (l: EmployeeCostLineBase) => boolean) => lines.filter(f).reduce((s, l) => s.plus(l.amountBase), D(0)).toFixed(base.decimals);
    return {
      employeeId, periodStart: p.start, periodEnd: p.end, periodDays: result.periodDays, employedDays: result.employedDays, baseCurrency: base.code, lines,
      totalCostBase: sum((l) => COST_NATURES.includes(l.nature as any)),
      totalDeductionsBase: sum((l) => l.nature === 'EMPLOYEE_DEDUCTION' || l.nature === 'TAX'),
      distributableCostBase: sum((l) => COST_NATURES.includes(l.nature as any) && l.profitabilityTreatment === 'DISTRIBUTE'),
    };
  }

  async periodRange(companyId: string, periodId: string): Promise<PeriodRange & { id: string; name: string; status: string }> {
    const p = await this.db.one<{ id: string; name: string; start_date: string; end_date: string; status: string; is_adjustment_period: boolean }>(
      'SELECT id, name, start_date, end_date, status, is_adjustment_period FROM core.fiscal_periods WHERE company_id = $1 AND id = $2',
      [companyId, periodId],
    );
    if (!p) throw new NotFoundError('FiscalPeriod', periodId);
    if (p.is_adjustment_period) throw new DomainError('ADJUSTMENT_PERIOD_NOT_ALLOWED', 'Use a regular monthly period');
    return { id: p.id, name: p.name, start: p.start_date, end: p.end_date, status: p.status };
  }

  /** Company cost sheet: every employee employed during the period. */
  async costSheet(companyId: string, periodId: string) {
    const p = await this.periodRange(companyId, periodId);
    const emps = await this.db.query<{ id: string; code: string; full_name_ar: string }>(
      `SELECT id, code, full_name_ar FROM hr.employees
        WHERE company_id = $1 AND hire_date <= $3 AND (termination_date IS NULL OR termination_date >= $2) ORDER BY code`,
      [companyId, p.start, p.end],
    );
    const rows = [];
    const totals = { cost: D(0), deductions: D(0), distributable: D(0) };
    for (const e of emps) {
      try {
        const c = await this.compute(companyId, e.id, p);
        totals.cost = totals.cost.plus(c.totalCostBase);
        totals.deductions = totals.deductions.plus(c.totalDeductionsBase);
        totals.distributable = totals.distributable.plus(c.distributableCostBase);
        rows.push({ code: e.code, fullNameAr: e.full_name_ar, ...c, error: null });
      } catch (err) {
        rows.push({ employeeId: e.id, code: e.code, fullNameAr: e.full_name_ar, lines: [], error: { code: (err as DomainError).code ?? 'ERROR', message: (err as Error).message } });
      }
    }
    return {
      period: p,
      rows,
      totals: { totalCostBase: totals.cost.toFixed(4), totalDeductionsBase: totals.deductions.toFixed(4), distributableCostBase: totals.distributable.toFixed(4) },
    };
  }
}
