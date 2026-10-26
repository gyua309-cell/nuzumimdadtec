import { D, Decimal } from '../../../shared/money';

/**
 * Zakat & income-tax worksheet (simplified ZATCA model).
 *
 * IMPORTANT: this is a calculation aid. The rules for what is added to or
 * deducted from the zakat base are statutory and change; an accountant must
 * review every worksheet before it is filed with ZATCA.
 */
export interface ZakatSettings {
  saudiGulfPct: string;
  foreignPct: string;
  zakatRatePct: string;
  incomeTaxRatePct: string;
  hijriYearDays: number;
}

/** Figures taken from the ledger (not editable on the worksheet). */
export interface ZakatLedgerFigures {
  openingEquity: string;
  netProfitBeforeZakat: string;
  netFixedAssets: string;
}

/** Adjustments entered by the accountant (all default to zero). */
export interface ZakatManualInputs {
  provisionsAddBack: string;
  nonDeductibleExpenses: string;
  otherDeductionsFromProfit: string;
  longTermLiabilities: string;
  otherAdditionsToBase: string;
  investmentsDeduction: string;
  otherNonCurrentAssetsDeduction: string;
  carriedForwardLossesDeduction: string;
  dividendsDeduction: string;
}

export const EMPTY_MANUAL_INPUTS: ZakatManualInputs = {
  provisionsAddBack: '0', nonDeductibleExpenses: '0', otherDeductionsFromProfit: '0', longTermLiabilities: '0',
  otherAdditionsToBase: '0', investmentsDeduction: '0', otherNonCurrentAssetsDeduction: '0',
  carriedForwardLossesDeduction: '0', dividendsDeduction: '0',
};

export interface ZakatWorksheetLine {
  key: string;
  labelAr: string;
  amount: string;
  kind: 'ledger' | 'manual' | 'subtotal' | 'result';
}

export interface ZakatWorksheet {
  periodFrom: string;
  periodTo: string;
  days: number;
  saudiGulfPct: string;
  foreignPct: string;
  effectiveZakatRatePct: string;
  adjustedNetProfit: string;
  baseBeforeDeductions: string;
  totalDeductions: string;
  zakatBaseRaw: string;
  zakatBase: string;
  baseFlooredToProfit: boolean;
  zakatableBase: string;
  zakatDue: string;
  incomeTaxableProfit: string;
  incomeTaxDue: string;
  totalDue: string;
  lines: ZakatWorksheetLine[];
}

const MS_PER_DAY = 86_400_000;

/** Inclusive number of days between two ISO dates (YYYY-MM-DD). */
export function inclusiveDays(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / MS_PER_DAY) + 1;
}

const r2 = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function computeZakat(
  periodFrom: string,
  periodTo: string,
  settings: ZakatSettings,
  ledger: ZakatLedgerFigures,
  manual: ZakatManualInputs,
): ZakatWorksheet {
  const days = inclusiveDays(periodFrom, periodTo);
  const saudiShare = D(settings.saudiGulfPct).div(100);
  const foreignShare = D(settings.foreignPct).div(100);

  // Zakat is levied at 2.5% of a Hijri year (354 days). A Gregorian-length period
  // is scaled by days / 354 so a 365-day year yields ~2.5773%.
  const effectiveRate = D(settings.zakatRatePct).times(days).div(settings.hijriYearDays);

  const adjustedNetProfit = D(ledger.netProfitBeforeZakat)
    .plus(manual.provisionsAddBack)
    .plus(manual.nonDeductibleExpenses)
    .minus(manual.otherDeductionsFromProfit);

  const fixedAssetsDeduction = Decimal.max(D(ledger.netFixedAssets), 0);

  const baseBeforeDeductions = D(ledger.openingEquity)
    .plus(adjustedNetProfit)
    .plus(manual.longTermLiabilities)
    .plus(manual.otherAdditionsToBase);

  const totalDeductions = fixedAssetsDeduction
    .plus(manual.investmentsDeduction)
    .plus(manual.otherNonCurrentAssetsDeduction)
    .plus(manual.carriedForwardLossesDeduction)
    .plus(manual.dividendsDeduction);

  const zakatBaseRaw = baseBeforeDeductions.minus(totalDeductions);

  // The base can never be lower than the adjusted net profit (when positive).
  const profitFloor = Decimal.max(adjustedNetProfit, 0);
  const zakatBase = Decimal.max(zakatBaseRaw, profitFloor);
  const baseFlooredToProfit = zakatBase.greaterThan(zakatBaseRaw) && profitFloor.greaterThan(0);

  const zakatableBase = zakatBase.times(saudiShare);
  const zakatDue = Decimal.max(zakatableBase, 0).times(effectiveRate).div(100);

  const incomeTaxableProfit = profitFloor.times(foreignShare);
  const incomeTaxDue = incomeTaxableProfit.times(D(settings.incomeTaxRatePct)).div(100);

  const lines: ZakatWorksheetLine[] = [
    { key: 'openingEquity', labelAr: 'حقوق الملكية في بداية الفترة (رأس المال والأرباح المبقاة)', amount: r2(D(ledger.openingEquity)).toFixed(2), kind: 'ledger' },
    { key: 'netProfitBeforeZakat', labelAr: 'صافي الربح للفترة قبل الزكاة (من دفتر الأستاذ)', amount: r2(D(ledger.netProfitBeforeZakat)).toFixed(2), kind: 'ledger' },
    { key: 'provisionsAddBack', labelAr: 'يضاف: المخصصات المكوّنة خلال الفترة', amount: r2(D(manual.provisionsAddBack)).toFixed(2), kind: 'manual' },
    { key: 'nonDeductibleExpenses', labelAr: 'يضاف: مصروفات غير قابلة للحسم', amount: r2(D(manual.nonDeductibleExpenses)).toFixed(2), kind: 'manual' },
    { key: 'otherDeductionsFromProfit', labelAr: 'يخصم: إيرادات/بنود معفاة من الربح', amount: r2(D(manual.otherDeductionsFromProfit)).toFixed(2), kind: 'manual' },
    { key: 'adjustedNetProfit', labelAr: 'صافي الربح المعدّل', amount: r2(adjustedNetProfit).toFixed(2), kind: 'subtotal' },
    { key: 'longTermLiabilities', labelAr: 'يضاف: قروض والتزامات طويلة الأجل', amount: r2(D(manual.longTermLiabilities)).toFixed(2), kind: 'manual' },
    { key: 'otherAdditionsToBase', labelAr: 'يضاف: بنود أخرى إلى الوعاء', amount: r2(D(manual.otherAdditionsToBase)).toFixed(2), kind: 'manual' },
    { key: 'baseBeforeDeductions', labelAr: 'الوعاء قبل الحسميات', amount: r2(baseBeforeDeductions).toFixed(2), kind: 'subtotal' },
    { key: 'netFixedAssets', labelAr: 'يخصم: صافي الأصول الثابتة (من دفتر الأستاذ)', amount: r2(fixedAssetsDeduction).toFixed(2), kind: 'ledger' },
    { key: 'investmentsDeduction', labelAr: 'يخصم: استثمارات', amount: r2(D(manual.investmentsDeduction)).toFixed(2), kind: 'manual' },
    { key: 'otherNonCurrentAssetsDeduction', labelAr: 'يخصم: أصول غير متداولة أخرى', amount: r2(D(manual.otherNonCurrentAssetsDeduction)).toFixed(2), kind: 'manual' },
    { key: 'carriedForwardLossesDeduction', labelAr: 'يخصم: خسائر مدورة', amount: r2(D(manual.carriedForwardLossesDeduction)).toFixed(2), kind: 'manual' },
    { key: 'dividendsDeduction', labelAr: 'يخصم: توزيعات أرباح', amount: r2(D(manual.dividendsDeduction)).toFixed(2), kind: 'manual' },
    { key: 'zakatBase', labelAr: 'الوعاء الزكوي (لا يقل عن صافي الربح المعدّل)', amount: r2(zakatBase).toFixed(2), kind: 'subtotal' },
    { key: 'zakatableBase', labelAr: 'حصة الشركاء السعوديين/الخليجيين من الوعاء', amount: r2(zakatableBase).toFixed(2), kind: 'subtotal' },
    { key: 'zakatDue', labelAr: 'الزكاة المستحقة', amount: r2(zakatDue).toFixed(2), kind: 'result' },
    { key: 'incomeTaxableProfit', labelAr: 'حصة الشريك الأجنبي من الربح الخاضع للضريبة', amount: r2(incomeTaxableProfit).toFixed(2), kind: 'subtotal' },
    { key: 'incomeTaxDue', labelAr: 'ضريبة الدخل المستحقة', amount: r2(incomeTaxDue).toFixed(2), kind: 'result' },
    { key: 'totalDue', labelAr: 'إجمالي المستحق (زكاة + ضريبة دخل)', amount: r2(zakatDue.plus(incomeTaxDue)).toFixed(2), kind: 'result' },
  ];

  return {
    periodFrom,
    periodTo,
    days,
    saudiGulfPct: settings.saudiGulfPct,
    foreignPct: settings.foreignPct,
    effectiveZakatRatePct: effectiveRate.toFixed(4),
    adjustedNetProfit: r2(adjustedNetProfit).toFixed(2),
    baseBeforeDeductions: r2(baseBeforeDeductions).toFixed(2),
    totalDeductions: r2(totalDeductions).toFixed(2),
    zakatBaseRaw: r2(zakatBaseRaw).toFixed(2),
    zakatBase: r2(zakatBase).toFixed(2),
    baseFlooredToProfit,
    zakatableBase: r2(zakatableBase).toFixed(2),
    zakatDue: r2(zakatDue).toFixed(2),
    incomeTaxableProfit: r2(incomeTaxableProfit).toFixed(2),
    incomeTaxDue: r2(incomeTaxDue).toFixed(2),
    totalDue: r2(zakatDue.plus(incomeTaxDue)).toFixed(2),
    lines,
  };
}
