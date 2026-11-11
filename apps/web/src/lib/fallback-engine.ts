import { getStoredCompany } from './storage-company';
import { getEntityList, saveEntityItem } from './local-store';

/**
 * Pure Synchronous Financial, Costing, Accounting, Governance & Cryptographic Engine
 * Aligns browser offline/GitHub Pages mode with all 33 sections of Business_Process (1).docx.
 */

let auditSeq = 1;

// ---------------------------------------------------------------------------
// 1. Pure-JS Synchronous SHA-256 (works in Browser HTTP/HTTPS & Node)
// ---------------------------------------------------------------------------
export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);

  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return Array.from(H).map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------------------------------------------------------------------------
// 2. Audit Trail Logger (Business Process Section 30)
// ---------------------------------------------------------------------------
export interface AuditEntryInput {
  action: string;
  tableName: string;
  schemaName?: string;
  entityId?: string;
  recordId?: string;
  reason?: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  changedFields?: string[];
}

export function recordAudit(input: AuditEntryInput): any {
  const now = new Date().toISOString();
  const id = `aud-${Date.now()}-${auditSeq++}`;
  const recId = input.entityId || input.recordId || id;
  const changed = input.changedFields || (() => {
    if (!input.newValues) return [];
    const keys = new Set([...Object.keys(input.oldValues || {}), ...Object.keys(input.newValues || {})]);
    return Array.from(keys).filter((k) => JSON.stringify(input.oldValues?.[k]) !== JSON.stringify(input.newValues?.[k]));
  })();
  const entry: any = {
    id,
    occurredAt: now,
    createdAt: now,
    userName: 'المدير التنفيذي',
    actor: 'المدير التنفيذي',
    action: input.action,
    schemaName: input.schemaName || 'core',
    tableName: input.tableName,
    entityId: recId,
    recordId: recId,
    changedFields: changed,
    reason: input.reason || null,
    oldValues: input.oldValues ?? null,
    newValues: input.newValues ?? null,
    requestId: `req-${Date.now().toString(36)}-${auditSeq}`,
    device: 'IDHAM ERP Web Client',
    ip: '127.0.0.1',
  };
  entry.rowHash = sha256Hex(JSON.stringify({
    occurredAt: entry.occurredAt,
    action: entry.action,
    tableName: entry.tableName,
    entityId: entry.entityId,
    reason: entry.reason,
    newValues: entry.newValues,
  }));
  return saveEntityItem('audit_log', entry);
}

// ---------------------------------------------------------------------------
// 3. Structural Catalog Defaults (Zero Mock Transactions / Employees)
// ---------------------------------------------------------------------------
export const defaultCurrenciesList = [
  { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', isBase: true, exchangeRate: 1, decimalPlaces: 2, isActive: true },
  { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', isBase: false, exchangeRate: 0.076, decimalPlaces: 2, isActive: true },
  { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', isBase: false, exchangeRate: 3.75, decimalPlaces: 2, isActive: true },
  { code: 'AED', nameAr: 'درهم إماراتي', symbol: 'د.إ', isBase: false, exchangeRate: 1.021, decimalPlaces: 2, isActive: true },
];

export const defaultExchangeRatesList = [
  { id: 'fx-usd-sar', fromCurrency: 'USD', toCurrency: 'SAR', rateType: 'SPOT', rateDate: '2026-01-01', rate: '3.7500', source: 'SAMA Fixed Peg' },
  { id: 'fx-egp-sar', fromCurrency: 'EGP', toCurrency: 'SAR', rateType: 'SPOT', rateDate: '2026-01-01', rate: '0.0760', source: 'CBE Market Spot' },
  { id: 'fx-aed-sar', fromCurrency: 'AED', toCurrency: 'SAR', rateType: 'SPOT', rateDate: '2026-01-01', rate: '1.0210', source: 'Fixed Peg' },
];

export const defaultCostComponentsList = [
  { id: 'ccmp-basic', code: 'BASIC', nameAr: 'الراتب الأساسي', componentType: 'EARNING', nature: 'EMPLOYER_COST', defaultMethod: 'FIXED', profitabilityTreatment: 'DISTRIBUTE', isActive: true },
  { id: 'ccmp-gosi', code: 'GOSI', nameAr: 'التأمينات الاجتماعية (حصة الشركة)', componentType: 'STATUTORY', nature: 'EMPLOYER_COST', defaultMethod: 'PERCENT_INSURANCE', defaultRatePct: '12.00', profitabilityTreatment: 'DISTRIBUTE', isActive: true },
  { id: 'ccmp-med', code: 'MED', nameAr: 'التأمين الطبي وبدل التشغيل', componentType: 'BENEFIT', nature: 'EMPLOYER_COST', defaultMethod: 'PERCENT_BASIC', defaultRatePct: '5.00', profitabilityTreatment: 'DISTRIBUTE', isActive: true },
  { id: 'ccmp-depr', code: 'DEPR', nameAr: 'إهلاك العهد والأصول التشغيلية', componentType: 'COST', nature: 'EMPLOYER_COST', defaultMethod: 'FIXED', profitabilityTreatment: 'DISTRIBUTE', isActive: true },
  { id: 'ccmp-tax', code: 'EMP-DED', nameAr: 'استقطاعات وضرائب الموظف', componentType: 'DEDUCTION', nature: 'EMPLOYEE_DEDUCTION', defaultMethod: 'FIXED', profitabilityTreatment: 'EXCLUDE', isActive: true },
];

export const defaultCostProfilesList = [
  {
    id: 'cp-tech',
    code: 'CP-TECH',
    nameAr: 'ملف الكوادر التقنية القياسي (تأمينات + بدلات)',
    currencyCode: 'SAR',
    isActive: true,
    lines: [
      {
        id: 'cpl-tech-gosi',
        componentId: 'ccmp-gosi',
        componentCode: 'GOSI',
        componentName: 'التأمينات الاجتماعية (حصة الشركة)',
        calcMethod: 'PERCENT_INSURANCE',
        nature: 'EMPLOYER_COST',
        ratePct: '12.00',
        amount: null,
        currencyCode: 'SAR',
        minAmount: null,
        maxAmount: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      {
        id: 'cpl-tech-med',
        componentId: 'ccmp-med',
        componentCode: 'MED',
        componentName: 'التأمين الطبي وبدل التشغيل',
        calcMethod: 'PERCENT_BASIC',
        nature: 'EMPLOYER_COST',
        ratePct: '5.00',
        amount: null,
        currencyCode: 'SAR',
        minAmount: null,
        maxAmount: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
    ],
  },
];

export const defaultAccountsList = [
  { id: 'acc-101', code: '10101', nameAr: 'الصندوق والعهد النقدية', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-102', code: '10201', nameAr: 'النقدية بالبنوك (ريال سعودي)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-103', code: '10202', nameAr: 'النقدية بالبنوك (جنيه مصري)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'EGP', isActive: true },
  { id: 'acc-104', code: '10301', nameAr: 'العملاء وحسابات القبض التجارية (A/R)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-105', code: '110301', nameAr: 'إيرادات مستحقة غير مفوترة (Unbilled Revenue)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-106', code: '10401', nameAr: 'العهد النقدية وسلف الموظفين (Loans)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-107', code: '10501', nameAr: 'الأصول الثابتة (أجهزة ومعدات تقنية)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-108', code: '10502', nameAr: 'مجمع إهلاك الأصول الثابتة', accountClass: 'ASSET', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-201', code: '20101', nameAr: 'الموردون وحسابات الدفع (A/P)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-202', code: '20201', nameAr: 'ضريبة القيمة المضافة المستحقة (ZATCA VAT)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-203', code: '20301', nameAr: 'مستحقات التأمينات الاجتماعية (GOSI)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-204', code: '20401', nameAr: 'رواتب وأجور مستحقة الدفع (Payroll Payable)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-301', code: '30101', nameAr: 'رأس المال المدفوع', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-302', code: '30201', nameAr: 'الأرباح المبقاة', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-401', code: '40101', nameAr: 'إيرادات عقود ومشاريع الكوادر التقنية', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-402', code: '410101', nameAr: 'إيرادات عقود ومشاريع البرمجيات والخدمات', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-430', code: '4300', nameAr: 'أرباح فروق أسعار صرف العملات المحققة (FX Gains)', accountClass: 'OTHER_INCOME', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-501', code: '50101', nameAr: 'تكلفة المطورين والرواتب المباشرة للمشاريع', accountClass: 'DIRECT_COST', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-502', code: '50201', nameAr: 'تكلفة التأمينات والبدلات والمزايا المباشرة', accountClass: 'DIRECT_COST', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-503', code: '50301', nameAr: 'مصروف إهلاك الأصول والمعدات التشغيلية', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-570', code: '5700', nameAr: 'خسائر فروق أسعار صرف العملات المحققة (FX Losses)', accountClass: 'OTHER_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
];

export const defaultFiscalPeriodsList = [
  { id: 'fp-2026-01', name: 'يناير 2026', startDate: '2026-01-01', endDate: '2026-01-31', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-02', name: 'فبراير 2026', startDate: '2026-02-01', endDate: '2026-02-28', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-03', name: 'مارس 2026', startDate: '2026-03-01', endDate: '2026-03-31', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-04', name: 'أبريل 2026', startDate: '2026-04-01', endDate: '2026-04-30', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-05', name: 'مايو 2026', startDate: '2026-05-01', endDate: '2026-05-31', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-06', name: 'يونيو 2026', startDate: '2026-06-01', endDate: '2026-06-30', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-07', name: 'يوليو 2026', startDate: '2026-07-01', endDate: '2026-07-31', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-08', name: 'أغسطس 2026', startDate: '2026-08-01', endDate: '2026-08-31', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-09', name: 'سبتمبر 2026', startDate: '2026-09-01', endDate: '2026-09-30', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-10', name: 'أكتوبر 2026', startDate: '2026-10-01', endDate: '2026-10-31', status: 'CLOSED', isAdjustmentPeriod: false },
  { id: 'fp-2026-11', name: 'نوفمبر 2026', startDate: '2026-11-01', endDate: '2026-11-30', status: 'OPEN', isAdjustmentPeriod: false },
  { id: 'fp-2026-12', name: 'ديسمبر 2026', startDate: '2026-12-01', endDate: '2026-12-31', status: 'OPEN', isAdjustmentPeriod: false },
];

export const defaultOverheadPolicy = {
  method: 'PERCENTAGE',
  rate: '10',
  notes: 'النسبة المعيارية للمصاريف العمومية والإدارية (10% من التكلفة المباشرة)',
};

const OVERHEAD_KEY = 'idham_prod_overhead_policy';

export function getOverheadPolicy(): { method: string; rate: string; notes: string } {
  try {
    const raw = localStorage.getItem(OVERHEAD_KEY);
    if (raw) return { ...defaultOverheadPolicy, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultOverheadPolicy };
}

export function saveOverheadPolicy(patch: { method?: string; rate?: string | number; notes?: string }): any {
  const prev = getOverheadPolicy();
  const next = {
    method: patch.method || prev.method || 'PERCENTAGE',
    rate: String(patch.rate ?? prev.rate ?? '10'),
    notes: patch.notes !== undefined ? patch.notes : prev.notes,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(OVERHEAD_KEY, JSON.stringify(next));
  recordAudit({
    action: 'UPDATE',
    schemaName: 'revenue',
    tableName: 'overhead_policy',
    entityId: 'overhead-policy',
    oldValues: prev,
    newValues: next,
    reason: `تحديث سياسة المصروفات غير المباشرة (${next.method}: ${next.rate})`,
  });
  return next;
}

// ---------------------------------------------------------------------------
// 4. Normalized Accounts, Exchange Rates & Period Guards
// ---------------------------------------------------------------------------
export function getNormalizedAccounts(): any[] {
  const raw = getEntityList<any>('accounts', defaultAccountsList);
  const byCode = new Map(raw.map((a) => [a.code, a]));
  const merged = [...raw];
  for (const d of defaultAccountsList) {
    if (!byCode.has(d.code)) merged.push(d);
  }
  return merged.map((a) => {
    if (a.accountClass === 'EXPENSE') {
      if (a.code === '50101' || a.code === '50201') return { ...a, accountClass: 'DIRECT_COST' };
      if (a.code === '5700') return { ...a, accountClass: 'OTHER_EXPENSE' };
      return { ...a, accountClass: 'OPERATING_EXPENSE' };
    }
    return a;
  });
}

export function getBaseCurrencyCode(): string {
  return getStoredCompany().baseCurrency || 'SAR';
}

export function getExchangeRate(fromCurrency?: string, toCurrency?: string, asOfDate?: string): number {
  const base = toCurrency || getBaseCurrencyCode();
  const from = (fromCurrency || base).toUpperCase();
  if (from === base) return 1;

  const rates = getEntityList<any>('exchange_rates', defaultExchangeRatesList);
  const direct = rates
    .filter((r) => r.fromCurrency === from && r.toCurrency === base && (!asOfDate || !r.rateDate || r.rateDate <= asOfDate))
    .sort((a, b) => String(b.rateDate || '').localeCompare(String(a.rateDate || '')));
  if (direct.length > 0) return Number(direct[0].rate) || 1;

  const inverse = rates
    .filter((r) => r.fromCurrency === base && r.toCurrency === from && (!asOfDate || !r.rateDate || r.rateDate <= asOfDate))
    .sort((a, b) => String(b.rateDate || '').localeCompare(String(a.rateDate || '')));
  if (inverse.length > 0 && Number(inverse[0].rate) > 0) return 1 / Number(inverse[0].rate);

  const curs = getEntityList<any>('currencies', defaultCurrenciesList);
  const c = curs.find((x) => x.code === from);
  return Number(c?.exchangeRate || 1) || 1;
}

export function convertToBase(amount: number | string, fromCurrency?: string, asOfDate?: string): { amountBase: number; rate: number } {
  const rate = getExchangeRate(fromCurrency, undefined, asOfDate);
  const amountBase = Math.round(Number(amount || 0) * rate * 100) / 100;
  return { amountBase, rate };
}

export function resolvePeriodByIdOrDate(periodId?: string | null, dateStr?: string | null): any | null {
  const periods = getEntityList<any>('fiscal_periods', defaultFiscalPeriodsList);
  if (periodId) {
    const p = periods.find((x) => x.id === periodId);
    if (p) return p;
  }
  if (dateStr) {
    const d = dateStr.slice(0, 10);
    return periods.find((x) => !x.isAdjustmentPeriod && x.startDate <= d && x.endDate >= d) || null;
  }
  return periods.find((x) => x.status === 'OPEN' && !x.isAdjustmentPeriod) || periods[periods.length - 1] || null;
}

export function assertPeriodOpen(periodIdOrDate: string | null | undefined, operationLabel: string): any | null {
  if (!periodIdOrDate) return null;
  const isDate = /^\d{4}-\d{2}-\d{2}/.test(periodIdOrDate);
  const p = isDate ? resolvePeriodByIdOrDate(null, periodIdOrDate) : resolvePeriodByIdOrDate(periodIdOrDate, null);
  if (p && p.status === 'CLOSED') {
    throw new Error(`الفترة المالية (${p.name}) مقفلة تاريخياً؛ لا يمكن تنفيذ "${operationLabel}" فيها إلا بعد إعادة فتحها رسمياً مع توثيق السبب أو استخدام التسويات بأثر رجعي.`);
  }
  return p;
}

// ---------------------------------------------------------------------------
// 5. Employee Cost Engine (Sections 4, 5, 14, 16, 17, 20)
// ---------------------------------------------------------------------------
export interface EmployeeCostBreakdownResult {
  employedDays: number;
  periodDays: number;
  directCostBase: number;
  totalCostBase: number;
  distributableCostBase: number;
  totalDeductionsBase: number;
  assetDepreciationBase: number;
  generalVariablesBase: number;
  dailyDirectCost: string;
  dailyOverheadCost: string;
  dailyTotalCost: string;
  currency: string;
  baseCurrency: string;
  lines: any[];
  breakdown: any[];
}

export function computeEmployeeCostBreakdown(
  emp: any,
  period?: any,
  policyOverride?: { method: string; rate: string },
): EmployeeCostBreakdownResult {
  const baseCur = getBaseCurrencyCode();
  const profiles = getEntityList<any>('cost_profiles', defaultCostProfilesList);
  const assets = getEntityList<any>('assets', []);
  const monthlyVars = getEntityList<any>('monthly_variables', []);
  const periodDays = 22;
  const employedDays = emp.status === 'TERMINATED' || emp.status === 'SUSPENDED' ? 0 : 22;
  const asOfDate = period?.endDate;

  const salCur = emp.salaryCurrency || emp.salary?.salaryCurrency || 'SAR';
  const insCur = emp.insuranceCurrency || salCur;
  const rawBasic = Number(emp.basicSalary || emp.basic_salary || emp.salary?.basicSalary || emp.salary || 0);
  const rawIns = Number(emp.insuranceSalary || emp.insurance_salary || emp.salary?.insuranceSalary || 0);
  const { amountBase: basicBase, rate: basicFx } = convertToBase(rawBasic, salCur, asOfDate);
  const { amountBase: insBase } = convertToBase(rawIns, insCur, asOfDate);

  const lines: any[] = [];
  let distributable = 0;
  let deductions = 0;

  // 1) Basic Salary Component
  lines.push({
    componentId: 'ccmp-basic',
    code: 'BASIC',
    nameAr: 'الراتب الأساسي',
    componentNameAr: 'الراتب الأساسي',
    nature: 'EMPLOYER_COST',
    activeDays: employedDays,
    amount: rawBasic.toFixed(2),
    currencyCode: salCur,
    exchangeRate: basicFx.toFixed(4),
    amountBase: basicBase.toFixed(2),
    profitabilityTreatment: 'DISTRIBUTE',
  });
  distributable += basicBase;

  // 2) Active Cost Profile Lines + Overrides
  const overrides = Array.isArray(emp.overrides) ? emp.overrides : [];
  const activeOvr = (componentId: string) =>
    overrides.find((o: any) => o.componentId === componentId && (!o.effectiveTo || !period?.startDate || o.effectiveTo >= period.startDate));

  const assignedProfileId = emp.costProfileId || (Array.isArray(emp.costProfiles) ? emp.costProfiles.find((p: any) => !p.effectiveTo)?.profileId : null);
  const profile = assignedProfileId ? profiles.find((p) => p.id === assignedProfileId) : null;

  if (profile && Array.isArray(profile.lines) && profile.lines.length > 0) {
    for (const pl of profile.lines) {
      if (pl.effectiveTo && period?.startDate && pl.effectiveTo < period.startDate) continue;
      if (pl.effectiveFrom && period?.endDate && pl.effectiveFrom > period.endDate) continue;

      const ovr = activeOvr(pl.componentId);
      if (ovr?.isExcluded) continue;

      let compCur = ovr?.currencyCode || pl.currencyCode || 'SAR';
      let rawComp = 0;
      const effRatePct = Number(ovr?.ratePct ?? pl.ratePct ?? 0);
      if (ovr?.amount != null && ovr.amount !== '') {
        rawComp = Number(ovr.amount);
        compCur = ovr.currencyCode || pl.currencyCode || 'SAR';
      } else if (pl.calcMethod === 'FIXED') {
        rawComp = Number(pl.amount || 0);
      } else if (pl.calcMethod === 'PERCENT_INSURANCE') {
        rawComp = (rawIns > 0 ? rawIns : rawBasic) * (effRatePct / 100);
        compCur = rawIns > 0 ? insCur : salCur;
      } else {
        rawComp = rawBasic * (effRatePct / 100);
        compCur = salCur;
      }

      if (pl.minAmount != null && pl.minAmount !== '' && rawComp < Number(pl.minAmount)) rawComp = Number(pl.minAmount);
      if (pl.maxAmount != null && pl.maxAmount !== '' && rawComp > Number(pl.maxAmount)) rawComp = Number(pl.maxAmount);

      const { amountBase: compBase, rate: compFx } = convertToBase(rawComp, compCur, asOfDate);
      const isDed = pl.nature === 'EMPLOYEE_DEDUCTION' || pl.nature === 'TAX';
      const treat = isDed ? 'EXCLUDE' : 'DISTRIBUTE';

      if (isDed) deductions += compBase;
      else distributable += compBase;

      lines.push({
        componentId: pl.componentId,
        code: pl.componentCode || 'CMP',
        nameAr: pl.componentName || 'مكون تكلفة',
        componentNameAr: pl.componentName || 'مكون تكلفة',
        nature: pl.nature || 'EMPLOYER_COST',
        activeDays: employedDays,
        amount: rawComp.toFixed(2),
        currencyCode: compCur,
        exchangeRate: compFx.toFixed(4),
        amountBase: compBase.toFixed(2),
        profitabilityTreatment: treat,
      });
    }
  } else {
    // Baseline statutory / benefit cost when employee uses company standard baseline
    const gosiOvr = activeOvr('ccmp-gosi');
    if (!gosiOvr?.isExcluded) {
      const statutoryBase = rawIns > 0
        ? (gosiOvr?.amount != null ? convertToBase(gosiOvr.amount, gosiOvr.currencyCode || insCur, asOfDate).amountBase : insBase * (Number(gosiOvr?.ratePct ?? 12) / 100))
        : (gosiOvr?.amount != null ? convertToBase(gosiOvr.amount, gosiOvr.currencyCode || salCur, asOfDate).amountBase : basicBase * (Number(gosiOvr?.ratePct ?? 5) / 100));
      const statAmt = Math.round(statutoryBase * 100) / 100;
      if (statAmt > 0) {
        distributable += statAmt;
        lines.push({
          componentId: rawIns > 0 ? 'ccmp-gosi' : 'ccmp-med',
          code: rawIns > 0 ? 'GOSI' : 'MED',
          nameAr: rawIns > 0 ? 'التأمينات الاجتماعية (حصة الشركة)' : 'التأمين الطبي وبدل التشغيل',
          componentNameAr: rawIns > 0 ? 'التأمينات الاجتماعية' : 'التأمين الطبي',
          nature: 'EMPLOYER_COST',
          activeDays: employedDays,
          amount: statAmt.toFixed(2),
          currencyCode: baseCur,
          exchangeRate: '1.0000',
          amountBase: statAmt.toFixed(2),
          profitabilityTreatment: 'DISTRIBUTE',
        });
      }
    }
  }

  // 3) Section 17: Active Fixed Assets Assigned to Employee (Monthly Depreciation)
  const empAssets = assets.filter((a: any) => (a.custodianEmployeeId === emp.id || a.employeeId === emp.id) && a.status === 'ACTIVE');
  const assetDeprCost = empAssets.reduce((sum: number, a: any) => {
    const cost = Number(a.costBase || a.cost || 0);
    const salvage = Number(a.salvageValueBase || 0);
    const months = Number(a.usefulLifeMonths) || 36;
    return sum + Math.round((cost - salvage) / months);
  }, 0);
  if (assetDeprCost > 0) {
    distributable += assetDeprCost;
    lines.push({
      componentId: 'ccmp-depr',
      code: 'DEPR',
      nameAr: 'إهلاك العهد والأصول التشغيلية',
      componentNameAr: 'إهلاك العهد والأصول',
      nature: 'EMPLOYER_COST',
      activeDays: employedDays,
      amount: assetDeprCost.toFixed(2),
      currencyCode: baseCur,
      exchangeRate: '1.0000',
      amountBase: assetDeprCost.toFixed(2),
      profitabilityTreatment: 'DISTRIBUTE',
    });
  }

  // 4) Section 14: Approved General Monthly Variables (non-project-linked)
  const matchingGeneralVars = monthlyVars.filter((v: any) =>
    (v.employeeId === emp.id || v.employeeCode === emp.code) &&
    v.status === 'APPROVED' &&
    !v.projectId &&
    (!period?.id || !v.fiscalPeriodId || v.fiscalPeriodId === period.id),
  );
  let generalVarsCost = 0;
  for (const v of matchingGeneralVars) {
    const { amountBase: varBase, rate: varFx } = convertToBase(v.computedAmount || v.amount || 0, v.currencyCode || 'SAR', asOfDate);
    const isDed = v.category === 'DEDUCTION';
    if (isDed) {
      deductions += varBase;
    } else {
      distributable += varBase;
      generalVarsCost += varBase;
    }
    lines.push({
      componentId: v.variableTypeId || v.id,
      code: v.category === 'DEDUCTION' ? 'DED' : 'VAR',
      nameAr: v.variableTypeName || 'متغير شهري معتمد',
      componentNameAr: v.variableTypeName || 'متغير شهري معتمد',
      nature: isDed ? 'EMPLOYEE_DEDUCTION' : 'EMPLOYER_COST',
      activeDays: employedDays,
      amount: Number(v.computedAmount || v.amount || 0).toFixed(2),
      currencyCode: v.currencyCode || 'SAR',
      exchangeRate: varFx.toFixed(4),
      amountBase: varBase.toFixed(2),
      profitabilityTreatment: isDed ? 'EXCLUDE' : 'DISTRIBUTE',
    });
  }

  const directCostBase = Math.round(distributable * 100) / 100;
  const totalDeductionsBase = Math.round(deductions * 100) / 100;
  const policy = policyOverride || getOverheadPolicy();
  let overheadAmt = 0;
  if (policy.method === 'PERCENTAGE') {
    overheadAmt = Math.round(directCostBase * (Number(policy.rate || 0) / 100));
  } else if (policy.method === 'FIXED_PER_EMPLOYEE') {
    overheadAmt = Math.round(Number(policy.rate || 0));
  } else {
    overheadAmt = 0;
  }

  const dailyDirect = directCostBase / 22;
  const dailyOverhead = overheadAmt / 22;

  return {
    employedDays,
    periodDays,
    directCostBase,
    totalCostBase: directCostBase,
    distributableCostBase: directCostBase,
    totalDeductionsBase,
    assetDepreciationBase: assetDeprCost,
    generalVariablesBase: generalVarsCost,
    dailyDirectCost: dailyDirect.toFixed(2),
    dailyOverheadCost: dailyOverhead.toFixed(2),
    dailyTotalCost: (dailyDirect + dailyOverhead).toFixed(2),
    currency: baseCur,
    baseCurrency: baseCur,
    lines,
    breakdown: lines,
  };
}

// ---------------------------------------------------------------------------
// 6. Real Double-Entry Journal Helpers & Live Financial Statements
// ---------------------------------------------------------------------------
export function normalizeJournalEntry(raw: any, accounts: any[]): any {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const normLines = (Array.isArray(raw.lines) ? raw.lines : []).map((l: any, idx: number) => {
    const acc = (l.accountId && byId.get(l.accountId)) || (l.accountCode && byCode.get(l.accountCode)) || null;
    const cur = l.currencyCode || acc?.currency || getBaseCurrencyCode();
    const fx = Number(l.exchangeRate || getExchangeRate(cur, undefined, raw.entryDate)) || 1;
    const dTx = Number(l.debitTx ?? l.debit ?? 0);
    const cTx = Number(l.creditTx ?? l.credit ?? 0);
    const dBase = l.debitBase != null ? Number(l.debitBase) : Math.round(dTx * fx * 100) / 100;
    const cBase = l.creditBase != null ? Number(l.creditBase) : Math.round(cTx * fx * 100) / 100;
    return {
      ...l,
      id: l.id || `jl-${idx + 1}`,
      lineNo: l.lineNo || idx + 1,
      accountId: acc?.id || l.accountId || '',
      accountCode: acc?.code || l.accountCode || '',
      accountNameAr: acc?.nameAr || l.accountNameAr || l.accountName || 'حساب مالي',
      currencyCode: cur,
      exchangeRate: String(fx.toFixed(4)),
      debitTx: dTx.toFixed(2),
      creditTx: cTx.toFixed(2),
      debitBase: dBase.toFixed(2),
      creditBase: cBase.toFixed(2),
    };
  });

  const totDr = normLines.reduce((s: number, l: any) => s + Number(l.debitBase), 0);
  const totCr = normLines.reduce((s: number, l: any) => s + Number(l.creditBase), 0);
  const p = resolvePeriodByIdOrDate(raw.fiscalPeriodId || raw.periodId, raw.entryDate);

  return {
    ...raw,
    entryNo: raw.entryNo ?? (raw.status === 'POSTED' ? `JE-${new Date().getFullYear()}-0001` : null),
    entryDate: raw.entryDate || new Date().toISOString().slice(0, 10),
    periodId: raw.periodId || p?.id || 'fp-2026-11',
    periodName: raw.periodName || p?.name || 'نوفمبر 2026',
    journalType: raw.journalType || 'GENERAL',
    ledger: raw.ledger || 'FINANCIAL',
    sourceModule: raw.sourceModule || 'ACC',
    sourceType: raw.sourceType || 'MANUAL',
    postingEvent: raw.postingEvent || null,
    status: raw.status || 'DRAFT',
    totalDebitBase: totDr.toFixed(2),
    totalCreditBase: totCr.toFixed(2),
    rowVersion: raw.rowVersion || 1,
    createdAt: raw.createdAt || new Date().toISOString(),
    lines: normLines,
  };
}

export function createAutoPostedJournalEntry(opts: {
  entryDate?: string;
  fiscalPeriodId?: string;
  journalType: string;
  sourceModule: string;
  sourceType: string;
  postingEvent: string;
  reference?: string;
  description: string;
  lines: Array<{ accountCode: string; debit: number; credit: number; description?: string; employeeId?: string; projectId?: string; currencyCode?: string }>;
}): any {
  const accounts = getNormalizedAccounts();
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const existing = getEntityList<any>('journal_entries', []);
  const seq = existing.filter((x) => x.status === 'POSTED').length + 1;
  const entryDate = (opts.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const p = resolvePeriodByIdOrDate(opts.fiscalPeriodId, entryDate);
  const year = (p?.startDate || entryDate).slice(0, 4);

  const builtLines = opts.lines
    .filter((l) => l.debit > 0 || l.credit > 0)
    .map((l, idx) => {
      const acc = byCode.get(l.accountCode) || accounts[0];
      const cur = l.currencyCode || getBaseCurrencyCode();
      const fx = getExchangeRate(cur, undefined, entryDate);
      const dTx = Math.round(l.debit * 100) / 100;
      const cTx = Math.round(l.credit * 100) / 100;
      const dBase = Math.round(dTx * fx * 100) / 100;
      const cBase = Math.round(cTx * fx * 100) / 100;
      return {
        id: `jl-${Date.now()}-${idx + 1}`,
        lineNo: idx + 1,
        accountId: acc?.id || l.accountCode,
        accountCode: acc?.code || l.accountCode,
        accountNameAr: acc?.nameAr || l.accountCode,
        currencyCode: cur,
        exchangeRate: fx.toFixed(4),
        debitTx: dTx.toFixed(2),
        creditTx: cTx.toFixed(2),
        debitBase: dBase.toFixed(2),
        creditBase: cBase.toFixed(2),
        employeeId: l.employeeId || null,
        projectId: l.projectId || null,
        description: l.description || opts.description,
      };
    });

  const totDr = builtLines.reduce((s, l) => s + Number(l.debitBase), 0);
  const totCr = builtLines.reduce((s, l) => s + Number(l.creditBase), 0);
  const now = new Date().toISOString();

  const je = {
    id: `je-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    entryNo: `JE-${year}-${String(seq).padStart(4, '0')}`,
    entryDate,
    periodId: p?.id || 'fp-2026-11',
    periodName: p?.name || 'نوفمبر 2026',
    journalType: opts.journalType,
    ledger: 'FINANCIAL',
    reference: opts.reference || null,
    sourceModule: opts.sourceModule,
    sourceType: opts.sourceType,
    postingEvent: opts.postingEvent,
    status: 'POSTED',
    description: opts.description,
    totalDebitBase: totDr.toFixed(2),
    totalCreditBase: totCr.toFixed(2),
    postedAt: now,
    createdAt: now,
    rowVersion: 1,
    lines: builtLines,
  };
  return saveEntityItem('journal_entries', je);
}

export function createReversalJournalEntry(origId: string, reason: string, reversalDate?: string | null): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', []);
  const idx = jes.findIndex((x) => x.id === origId || x.entryNo === origId);
  if (idx < 0) throw new Error('القيد المطلوب عكسه غير موجود');
  const orig = normalizeJournalEntry(jes[idx], accounts);
  if (orig.status !== 'POSTED') throw new Error('لا يمكن عكس قيد غير مرحّل');
  if (orig.reversedById) throw new Error('تم عكس هذا القيد مسبقاً');

  const revDate = (reversalDate || orig.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  assertPeriodOpen(revDate, 'إنشاء قيد عكسي');

  const seq = jes.filter((x) => x.status === 'POSTED').length + 1;
  const p = resolvePeriodByIdOrDate(null, revDate);
  const now = new Date().toISOString();
  const revId = `je-rev-${Date.now()}`;
  const revLines = orig.lines.map((l: any, i: number) => ({
    ...l,
    id: `jl-rev-${i + 1}`,
    debitTx: l.creditTx,
    creditTx: l.debitTx,
    debitBase: l.creditBase,
    creditBase: l.debitBase,
    description: `عكس: ${l.description || orig.description}`,
  }));

  const revEntry = {
    id: revId,
    entryNo: `JE-REV-${String(seq).padStart(4, '0')}`,
    entryDate: revDate,
    periodId: p?.id || orig.periodId,
    periodName: p?.name || orig.periodName,
    journalType: 'REVERSAL',
    ledger: orig.ledger || 'FINANCIAL',
    reference: orig.entryNo,
    sourceModule: orig.sourceModule,
    sourceType: 'REVERSAL',
    postingEvent: 'JOURNAL_REVERSED',
    status: 'POSTED',
    description: `عكس القيد ${orig.entryNo} — ${reason}`,
    totalDebitBase: orig.totalCreditBase,
    totalCreditBase: orig.totalDebitBase,
    postedAt: now,
    createdAt: now,
    reversalOfId: orig.id,
    rowVersion: 1,
    lines: revLines,
  };

  orig.reversedById = revId;
  saveEntityItem('journal_entries', orig);
  saveEntityItem('journal_entries', revEntry);
  recordAudit({
    action: 'REVERSE',
    schemaName: 'acc',
    tableName: 'journal_entries',
    entityId: revId,
    reason,
    oldValues: { originalId: orig.id, entryNo: orig.entryNo },
    newValues: { reversalId: revId, reversalNo: revEntry.entryNo },
  });
  return revEntry;
}

export function computeTrialBalance(params: { from?: string; to?: string; ledger?: string; branchId?: string } = {}): any {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const ledger = params.ledger || 'FINANCIAL';
  const branchId = params.branchId || '';

  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED' && (!ledger || j.ledger === ledger));

  const map = new Map<string, any>();
  for (const a of accounts) {
    map.set(a.id, {
      accountId: a.id,
      code: a.code,
      nameAr: a.nameAr,
      accountClass: a.accountClass,
      normalBalance: a.normalBalance,
      isPosting: a.isPosting !== false,
      level: a.level || 2,
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
    });
  }

  for (const je of jes) {
    if (je.entryDate > to) continue;
    const isOpening = je.entryDate < from;
    for (const l of je.lines) {
      if (branchId && l.branchId !== branchId) continue;
      const row = map.get(l.accountId) || accounts.find((a) => a.code === l.accountCode && map.get(a.id)) && map.get(accounts.find((a) => a.code === l.accountCode)!.id);
      if (!row) continue;
      if (isOpening) {
        row.openingDebit += Number(l.debitBase || 0);
        row.openingCredit += Number(l.creditBase || 0);
      } else {
        row.periodDebit += Number(l.debitBase || 0);
        row.periodCredit += Number(l.creditBase || 0);
      }
    }
  }

  const rows: any[] = [];
  const totals = { openingDebit: 0, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 0 };

  for (const r of map.values()) {
    const net = (r.openingDebit + r.periodDebit) - (r.openingCredit + r.periodCredit);
    if (r.openingDebit === 0 && r.openingCredit === 0 && r.periodDebit === 0 && r.periodCredit === 0) continue;
    const opNet = r.openingDebit - r.openingCredit;
    const oDr = opNet >= 0 ? opNet : 0;
    const oCr = opNet < 0 ? -opNet : 0;
    const cDr = net >= 0 ? net : 0;
    const cCr = net < 0 ? -net : 0;

    totals.openingDebit += oDr;
    totals.openingCredit += oCr;
    totals.periodDebit += r.periodDebit;
    totals.periodCredit += r.periodCredit;
    totals.closingDebit += cDr;
    totals.closingCredit += cCr;

    rows.push({
      ...r,
      openingDebit: oDr.toFixed(2),
      openingCredit: oCr.toFixed(2),
      periodDebit: r.periodDebit.toFixed(2),
      periodCredit: r.periodCredit.toFixed(2),
      closingDebit: cDr.toFixed(2),
      closingCredit: cCr.toFixed(2),
    });
  }

  rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const balanced = Math.abs(totals.closingDebit - totals.closingCredit) < 0.01 && Math.abs(totals.periodDebit - totals.periodCredit) < 0.01;
  const formattedTotals = {
    openingDebit: totals.openingDebit.toFixed(2),
    openingCredit: totals.openingCredit.toFixed(2),
    periodDebit: totals.periodDebit.toFixed(2),
    periodCredit: totals.periodCredit.toFixed(2),
    closingDebit: totals.closingDebit.toFixed(2),
    closingCredit: totals.closingCredit.toFixed(2),
  };

  return {
    period: `${from} — ${to}`,
    totalDebit: formattedTotals.closingDebit,
    totalCredit: formattedTotals.closingCredit,
    balanced,
    isBalanced: balanced,
    rows,
    lines: rows,
    totals: formattedTotals,
  };
}

export function computeIncomeStatement(params: { from?: string; to?: string; branchId?: string } = {}): any {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const branchId = params.branchId || '';

  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED' && j.entryDate >= from && j.entryDate <= to);

  const incomeClasses = new Set(['REVENUE', 'DIRECT_COST', 'OPERATING_EXPENSE', 'OTHER_INCOME', 'OTHER_EXPENSE']);
  const byAcc = new Map<string, any>();

  for (const je of jes) {
    for (const l of je.lines) {
      if (branchId && l.branchId !== branchId) continue;
      const acc = accounts.find((a) => a.id === l.accountId || a.code === l.accountCode);
      if (!acc || !incomeClasses.has(acc.accountClass)) continue;
      const prev = byAcc.get(acc.id) || { accountId: acc.id, code: acc.code, nameAr: acc.nameAr, accountClass: acc.accountClass, amount: 0 };
      const isCr = acc.accountClass === 'REVENUE' || acc.accountClass === 'OTHER_INCOME';
      prev.amount += isCr ? (Number(l.creditBase || 0) - Number(l.debitBase || 0)) : (Number(l.debitBase || 0) - Number(l.creditBase || 0));
      byAcc.set(acc.id, prev);
    }
  }

  let revenue = 0;
  let directCost = 0;
  let operatingExpenses = 0;
  let otherIncome = 0;
  let otherExpenses = 0;
  const lines: any[] = [];

  for (const r of byAcc.values()) {
    if (Math.abs(r.amount) < 0.005) continue;
    if (r.accountClass === 'REVENUE') revenue += r.amount;
    else if (r.accountClass === 'DIRECT_COST') directCost += r.amount;
    else if (r.accountClass === 'OPERATING_EXPENSE') operatingExpenses += r.amount;
    else if (r.accountClass === 'OTHER_INCOME') otherIncome += r.amount;
    else if (r.accountClass === 'OTHER_EXPENSE') otherExpenses += r.amount;
    lines.push({ ...r, amount: r.amount.toFixed(2) });
  }

  lines.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const grossProfit = revenue - directCost;
  const operatingProfit = grossProfit - operatingExpenses;
  const netProfit = operatingProfit + otherIncome - otherExpenses;
  const marginPct = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0';

  return {
    revenue: revenue.toFixed(2),
    directCost: directCost.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    operatingExpenses: operatingExpenses.toFixed(2),
    operatingProfit: operatingProfit.toFixed(2),
    otherIncome: otherIncome.toFixed(2),
    otherExpenses: otherExpenses.toFixed(2),
    netProfit: netProfit.toFixed(2),
    marginPct,
    lines,
  };
}

export function computeBalanceSheet(params: { asOf?: string; branchId?: string } = {}): any {
  const asOf = params.asOf || new Date().toISOString().slice(0, 10);
  const branchId = params.branchId || '';
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED' && j.entryDate <= asOf);

  const sums = new Map<string, number>();
  let netEarnings = 0;

  for (const je of jes) {
    for (const l of je.lines) {
      if (branchId && l.branchId !== branchId) continue;
      const acc = accounts.find((a) => a.id === l.accountId || a.code === l.accountCode);
      if (!acc) continue;
      const dr = Number(l.debitBase || 0);
      const cr = Number(l.creditBase || 0);
      if (acc.accountClass === 'ASSET') {
        sums.set(acc.id, (sums.get(acc.id) || 0) + (dr - cr));
      } else if (acc.accountClass === 'LIABILITY' || acc.accountClass === 'EQUITY') {
        sums.set(acc.id, (sums.get(acc.id) || 0) + (cr - dr));
      } else {
        netEarnings += (cr - dr);
      }
    }
  }

  const pickSection = (cls: string) => {
    const lines: any[] = [];
    let total = 0;
    for (const acc of accounts) {
      if (acc.accountClass !== cls) continue;
      const amt = sums.get(acc.id) || 0;
      if (Math.abs(amt) < 0.005) continue;
      total += amt;
      lines.push({ accountId: acc.id, code: acc.code, nameAr: acc.nameAr, amount: amt.toFixed(2) });
    }
    return { total: total.toFixed(2), numericTotal: total, lines };
  };

  const assets = pickSection('ASSET');
  const liabilities = pickSection('LIABILITY');
  const equity = pickSection('EQUITY');
  const liabilitiesAndEquityNum = liabilities.numericTotal + equity.numericTotal + netEarnings;
  const diffNum = assets.numericTotal - liabilitiesAndEquityNum;
  const balanced = Math.abs(diffNum) < 0.01;

  return {
    asOfDate: asOf,
    balanced,
    isBalanced: balanced,
    difference: diffNum.toFixed(2),
    currentEarnings: netEarnings.toFixed(2),
    liabilitiesAndEquity: liabilitiesAndEquityNum.toFixed(2),
    assets: { total: assets.total, current: assets.total, nonCurrent: '0.00', lines: assets.lines },
    liabilities: { total: liabilities.total, lines: liabilities.lines },
    equity: { total: equity.total, lines: equity.lines },
  };
}

export function computeAccountStatement(params: { accountId?: string; from?: string; to?: string; branchId?: string }): any {
  const from = params.from || `${new Date().getFullYear()}-01-01`;
  const to = params.to || new Date().toISOString().slice(0, 10);
  const accounts = getNormalizedAccounts();
  const acc = accounts.find((a) => a.id === params.accountId || a.code === params.accountId) || accounts[0];
  const isDebitNormal = acc?.normalBalance !== 'CREDIT';

  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED')
    .sort((a, b) => String(a.entryDate).localeCompare(String(b.entryDate)) || String(a.createdAt).localeCompare(String(b.createdAt)));

  let opening = 0;
  let periodDebit = 0;
  let periodCredit = 0;
  const statementLines: any[] = [];

  for (const je of jes) {
    if (je.entryDate > to) continue;
    for (const l of je.lines) {
      if (params.branchId && l.branchId !== params.branchId) continue;
      if (l.accountId !== acc?.id && l.accountCode !== acc?.code) continue;
      const dr = Number(l.debitBase || 0);
      const cr = Number(l.creditBase || 0);
      const delta = isDebitNormal ? (dr - cr) : (cr - dr);
      if (je.entryDate < from) {
        opening += delta;
      } else {
        periodDebit += dr;
        periodCredit += cr;
        const running = opening + (isDebitNormal ? (periodDebit - periodCredit) : (periodCredit - periodDebit));
        statementLines.push({
          entryId: je.id,
          entryNo: je.entryNo,
          entryDate: je.entryDate,
          lineDescription: l.description || je.description,
          description: je.description,
          currencyCode: l.currencyCode || acc.currency || getBaseCurrencyCode(),
          debitTx: l.debitTx,
          creditTx: l.creditTx,
          debitBase: l.debitBase,
          creditBase: l.creditBase,
          runningBalance: running.toFixed(2),
        });
      }
    }
  }

  const closing = opening + (isDebitNormal ? (periodDebit - periodCredit) : (periodCredit - periodDebit));
  return {
    account: acc,
    openingBalance: opening.toFixed(2),
    closingBalance: closing.toFixed(2),
    periodDebit: periodDebit.toFixed(2),
    periodCredit: periodCredit.toFixed(2),
    totalDebit: periodDebit.toFixed(2),
    totalCredit: periodCredit.toFixed(2),
    lines: statementLines,
    data: statementLines,
    meta: { page: 1, pageSize: 100, total: statementLines.length },
  };
}

// ---------------------------------------------------------------------------
// 7. Live Period Closing Checks (Section 27)
// ---------------------------------------------------------------------------
export function evaluatePeriodClosingChecks(periodId: string): any {
  const periods = getEntityList<any>('fiscal_periods', defaultFiscalPeriodsList);
  const target = periods.find((p) => p.id === periodId) || periods[0];
  const isClosed = target?.status === 'CLOSED';
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', []).map((j) => normalizeJournalEntry(j, accounts));

  // CHK-01: Sequential prior period closed
  const idx = periods.findIndex((p) => p.id === target?.id);
  const unclosedPrior = periods.slice(0, Math.max(0, idx)).find((p) => !p.isAdjustmentPeriod && p.status !== 'CLOSED');

  // CHK-02: Draft journal entries in period
  const draftsInPeriod = jes.filter((j) => j.status === 'DRAFT' && (!target || j.periodId === target.id || (j.entryDate >= target.startDate && j.entryDate <= target.endDate)));

  // CHK-03: Trial balance check
  const tb = computeTrialBalance({ from: target?.startDate, to: target?.endDate });

  // CHK-04: Payroll run check in period (advisory warning if active employees exist without posted payroll run)
  const emps = getEntityList<any>('employees', []).filter((e) => e.status === 'ACTIVE');
  const payRuns = getEntityList<any>('payroll_runs', []).filter((r) => r.fiscalPeriodId === target?.id && r.status === 'POSTED');

  // CHK-05: Unapproved monthly variables in period
  const draftVars = getEntityList<any>('monthly_variables', []).filter((v) => v.status === 'DRAFT' && (!target || v.fiscalPeriodId === target.id));

  const results = [
    {
      code: 'CHK-01',
      titleAr: 'فحص تسلسل إقفال الفترات المالية السابقة',
      status: unclosedPrior ? 'FAIL' : 'PASS',
      message: unclosedPrior ? `يجب إقفال الفترة السابقة (${unclosedPrior.name}) أولاً قبل إقفال ${target?.name}` : 'جميع الفترات السابقة مقفلة بالتسلسل الصحيح',
    },
    {
      code: 'CHK-02',
      titleAr: 'فحص القيود اليومية المسودة غير المرحّلة في الفترة',
      status: draftsInPeriod.length > 0 ? 'FAIL' : 'PASS',
      message: draftsInPeriod.length > 0 ? `يوجد عدد ${draftsInPeriod.length} قيود مسودة غير مرحّلة يجب ترحيلها أو إلغاؤها أولاً` : 'لا توجد قيود مسودة معلقة في هذه الفترة',
    },
    {
      code: 'CHK-03',
      titleAr: 'فحص توازن ميزان المراجعة (المدين = الدائن)',
      status: tb.balanced ? 'PASS' : 'FAIL',
      message: tb.balanced ? 'ميزان المراجعة متوازن بالكامل' : 'يوجد فرق عدم توازن في ميزان المراجعة',
    },
    {
      code: 'CHK-04',
      titleAr: 'فحص اعتماد وترحيل مسير الرواتب الشهري',
      status: emps.length > 0 && payRuns.length === 0 ? 'WARN' : 'PASS',
      message: emps.length > 0 && payRuns.length === 0 ? 'تنبيه: يوجد موظفون نشطون ولم يُنفذ مسير رواتب لهذه الفترة بعد' : 'مسير الرواتب مستوفى أو لا توجد التزامات معلقة',
    },
    {
      code: 'CHK-05',
      titleAr: 'فحص المتغيرات الشهرية المسودة وغير المعتمدة',
      status: draftVars.length > 0 ? 'WARN' : 'PASS',
      message: draftVars.length > 0 ? `يوجد عدد ${draftVars.length} متغيرات شهرية مسودة لم تُعتمد بعد` : 'جميع المتغيرات الشهرية لهذه الفترة معتمدة',
    },
  ];

  const canClose = !isClosed && results.every((r) => r.status !== 'FAIL');
  const warnings = results.filter((r) => r.status === 'WARN').map((r) => r.message);

  return {
    canClose,
    isClosed,
    warnings,
    results,
  };
}
