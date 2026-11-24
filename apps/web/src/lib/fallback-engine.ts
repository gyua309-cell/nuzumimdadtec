import { getStoredCompany } from './storage-company';
import { defaultFiscalPeriodsList, getEntityList, saveEntityItem, uid } from './local-store';
import {
  buildEnrichedAccountsTree,
  computeDynamicAccountStatement,
  computeDynamicBalanceSheet,
  computeDynamicCashFlowStatement,
  computeDynamicEquityChangesStatement,
  computeDynamicIncomeStatement,
  computeDynamicTrialBalance,
  createLineDimResolver,
  type DimensionFilterParams,
} from './coa-statements-engine';
import {
  computeDynamicCostCentersReport,
  computeDynamicMultiLevelReportsOverview,
  type CostCenterReportParams,
} from './reports-analytics-engine';

export { defaultFiscalPeriodsList };

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

export const defaultVariableTypesList = [
  { id: 'vt-bonus', code: 'VAR-BON', nameAr: 'بونص أداء استثنائي', category: 'BONUS', calcMethod: 'FIXED', defaultMultiplier: '1.0', affectsCost: true, isProjectLinked: false, isActive: true },
  { id: 'vt-overtime', code: 'VAR-OT', nameAr: 'ساعات عمل إضافي (Overtime)', category: 'OVERTIME', calcMethod: 'HOURS_RATE', defaultMultiplier: '1.5', affectsCost: true, isProjectLinked: true, isActive: true },
  { id: 'vt-additional', code: 'VAR-ADD', nameAr: 'أجر إضافي خاص بمشروع (Additional Pay)', category: 'ADDITIONAL_PAY', calcMethod: 'DAYS_RATE', defaultMultiplier: '1.0', affectsCost: true, isProjectLinked: true, isActive: true },
  { id: 'vt-reward', code: 'VAR-REW', nameAr: 'مكافأة نسبة من الأساسي', category: 'REWARD', calcMethod: 'PCT_BASIC', defaultMultiplier: '1.0', affectsCost: true, isProjectLinked: false, isActive: true },
  { id: 'vt-allowance', code: 'VAR-ALW', nameAr: 'بدل انتقالات ومهام خاصة', category: 'ALLOWANCE', calcMethod: 'FIXED', defaultMultiplier: '1.0', affectsCost: true, isProjectLinked: false, isActive: true },
  { id: 'vt-deduction', code: 'VAR-DED', nameAr: 'خصم غياب أو جزاء إداري', category: 'DEDUCTION', calcMethod: 'DAYS_RATE', defaultMultiplier: '1.0', affectsCost: false, isProjectLinked: false, isActive: true },
];

export const defaultAccountsList = [
  { id: 'acc-101', code: '10101', nameAr: 'الصندوق والعهد النقدية', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-102', code: '10201', nameAr: 'النقدية بالبنوك (ريال سعودي)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-103', code: '10202', nameAr: 'النقدية بالبنوك (جنيه مصري)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'EGP', isActive: true },
  { id: 'acc-104', code: '10301', nameAr: 'العملاء وحسابات القبض التجارية (A/R)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-105', code: '110301', nameAr: 'إيرادات مستحقة غير مفوترة (Unbilled Revenue)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-106', code: '10401', nameAr: 'العهد النقدية وسلف الموظفين (Loans)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-125', code: '1250', nameAr: 'ضريبة القيمة المضافة للمدخلات (Input VAT)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-131', code: '1310', nameAr: 'عهد نقدية ومصروفات تشغيلية — فرع مصر', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'EGP', isActive: true },
  { id: 'acc-132', code: '1320', nameAr: 'عهد نقدية ومصروفات تشغيلية — الإدارة', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-107', code: '10501', nameAr: 'الأصول الثابتة (أجهزة ومعدات تقنية)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-108', code: '10502', nameAr: 'مجمع إهلاك الأصول الثابتة', accountClass: 'ASSET', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-201', code: '20101', nameAr: 'الموردون وحسابات الدفع (A/P)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-202', code: '20201', nameAr: 'ضريبة القيمة المضافة المستحقة (ZATCA VAT)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-203', code: '20301', nameAr: 'مستحقات التأمينات الاجتماعية (GOSI)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-204', code: '20401', nameAr: 'رواتب وأجور مستحقة الدفع (Payroll Payable)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-2042', code: '20402', nameAr: 'مخصص مكافأة نهاية الخدمة للكوادر (EOSB Provision)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-205', code: '20501', nameAr: 'مخصص الزكاة وضريبة الدخل المستحقة', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-301', code: '30101', nameAr: 'رأس المال المدفوع', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-302', code: '30201', nameAr: 'الأرباح المبقاة', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-401', code: '40101', nameAr: 'إيرادات عقود ومشاريع الكوادر التقنية', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-402', code: '410101', nameAr: 'إيرادات عقود ومشاريع البرمجيات والخدمات', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-430', code: '4300', nameAr: 'أرباح فروق أسعار صرف العملات المحققة (FX Gains)', accountClass: 'OTHER_INCOME', normalBalance: 'CREDIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-501', code: '50101', nameAr: 'تكلفة المطورين والرواتب المباشرة للمشاريع', accountClass: 'DIRECT_COST', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-5012', code: '50102', nameAr: 'تكلفة الرواتب غير المستغلة على قوة الشركة (Bench Cost)', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-5013', code: '50103', nameAr: 'مصروف مخصص مكافأة نهاية الخدمة والإجازات (EOSB)', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-502', code: '50201', nameAr: 'تكلفة التأمينات والبدلات والمزايا المباشرة', accountClass: 'DIRECT_COST', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-503', code: '50301', nameAr: 'مصروف إهلاك الأصول والمعدات التشغيلية', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-504', code: '50401', nameAr: 'مصروفات تشغيلية ومشتريات واستضافة سحابية', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-5042', code: '50402', nameAr: 'عمولات ومصروفات تحويلات بنكية (Bank Fees)', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-505', code: '50501', nameAr: 'مصروف الزكاة الشرعية وضريبة الدخل', accountClass: 'OPERATING_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
  { id: 'acc-570', code: '5700', nameAr: 'خسائر فروق أسعار صرف العملات المحققة (FX Losses)', accountClass: 'OTHER_EXPENSE', normalBalance: 'DEBIT', isPosting: true, level: 2, currentBalance: '0.00', currency: 'SAR', isActive: true },
];

export const defaultBankAccountsList = [
  {
    id: 'bnk-sar-01',
    code: 'BNK-KSA-01',
    name: 'حساب البنك الرئيسي — الرياض (SAR)',
    kind: 'BANK',
    bankName: 'مصرف الراجحي / البنك الأهلي التجاري',
    accountNumber: 'SA00-1020-1000-01',
    iban: null,
    currencyCode: 'SAR',
    glAccountId: 'acc-102',
    glAccountCode: '10201',
    glAccountNameAr: 'النقدية بالبنوك (ريال سعودي)',
    isActive: true,
  },
  {
    id: 'bnk-egp-01',
    code: 'BNK-EGY-01',
    name: 'حساب البنك التشغيلي — القاهرة (EGP)',
    kind: 'BANK',
    bankName: 'بنك مصر / البنك التجاري الدولي (CIB)',
    accountNumber: 'EG00-1020-2000-02',
    iban: null,
    currencyCode: 'EGP',
    glAccountId: 'acc-103',
    glAccountCode: '10202',
    glAccountNameAr: 'النقدية بالبنوك (جنيه مصري)',
    isActive: true,
  },
  {
    id: 'bnk-cash-01',
    code: 'CSH-HQ-01',
    name: 'الصندوق النقدي المركزي (SAR)',
    kind: 'CASH',
    bankName: 'الخزينة النقدية المركزية',
    accountNumber: 'CASH-10101',
    iban: null,
    currencyCode: 'SAR',
    glAccountId: 'acc-101',
    glAccountCode: '10101',
    glAccountNameAr: 'الصندوق والعهد النقدية',
    isActive: true,
  },
];

export const defaultAssetCategoriesList = [
  {
    id: 'acat-it',
    code: 'IT-EQUIP',
    nameAr: 'أجهزة حاسب ومعدات تقنية',
    nameEn: 'IT & Technical Equipment',
    assetAccountId: 'acc-107',
    accumAccountId: 'acc-108',
    expenseAccountId: 'acc-503',
    defaultUsefulLifeMonths: 36,
    defaultMethod: 'STRAIGHT_LINE',
    includeInEmployeeCost: true,
    isActive: true,
  },
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
export function getNormalizedAccounts(opts: { asOf?: string } = {}): any[] {
  const raw = getEntityList<any>('accounts', defaultAccountsList);
  const byCode = new Map(raw.map((a) => [a.code, a]));
  const merged = [...raw];
  for (const d of defaultAccountsList) {
    if (!byCode.has(d.code)) merged.push(d);
  }
  const jes = getEntityList<any>('journal_entries', []).filter((j) => j.status === 'POSTED');
  return buildEnrichedAccountsTree(merged, jes, opts);
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
  const empAssets = assets.filter((a: any) => (a.custodianEmployeeId === emp.id || a.employeeId === emp.id) && a.status === 'ACTIVE' && a.includeInEmployeeCost !== false);
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
  const resolveDims = createLineDimResolver();
  const normLines = (Array.isArray(raw.lines) ? raw.lines : []).map((l: any, idx: number) => {
    const acc = (l.accountId && byId.get(l.accountId)) || (l.accountCode && byCode.get(l.accountCode)) || null;
    const cur = l.currencyCode || acc?.currency || getBaseCurrencyCode();
    const fx = Number(l.exchangeRate || getExchangeRate(cur, undefined, raw.entryDate)) || 1;
    const dTx = Number(l.debitTx ?? l.debit ?? 0);
    const cTx = Number(l.creditTx ?? l.credit ?? 0);
    const dBase = l.debitBase != null ? Number(l.debitBase) : Math.round(dTx * fx * 100) / 100;
    const cBase = l.creditBase != null ? Number(l.creditBase) : Math.round(cTx * fx * 100) / 100;
    const inferred = (l.projectId || l.employeeId || l.departmentId) ? resolveDims(l) : null;
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
      costCenterId: l.costCenterId ?? inferred?.costCenterId ?? null,
      clientId: l.clientId ?? inferred?.clientId ?? null,
      branchId: l.branchId ?? inferred?.branchId ?? null,
      departmentId: l.departmentId ?? inferred?.departmentId ?? null,
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
  lines: Array<{
    accountCode: string;
    debit: number;
    credit: number;
    description?: string;
    employeeId?: string;
    projectId?: string;
    clientId?: string;
    costCenterId?: string;
    branchId?: string;
    departmentId?: string;
    currencyCode?: string;
  }>;
}): any {
  const accounts = getNormalizedAccounts();
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const existing = getEntityList<any>('journal_entries', []);
  const seq = existing.filter((x) => x.status === 'POSTED').length + 1;
  const entryDate = (opts.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const p = resolvePeriodByIdOrDate(opts.fiscalPeriodId, entryDate);
  const year = (p?.startDate || entryDate).slice(0, 4);
  const resolveDims = createLineDimResolver();

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
      const inferred = (l.projectId || l.employeeId || l.departmentId) ? resolveDims(l) : null;
      return {
        id: uid('jl'),
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
        clientId: l.clientId ?? inferred?.clientId ?? null,
        costCenterId: l.costCenterId ?? inferred?.costCenterId ?? null,
        branchId: l.branchId ?? inferred?.branchId ?? null,
        departmentId: l.departmentId ?? inferred?.departmentId ?? null,
        description: l.description || opts.description,
      };
    });

  const totDr = builtLines.reduce((s, l) => s + Number(l.debitBase), 0);
  const totCr = builtLines.reduce((s, l) => s + Number(l.creditBase), 0);
  const now = new Date().toISOString();

  const je = {
    id: uid('je'),
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
  const revId = uid('je-rev');
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

export function computeTrialBalance(params: { from?: string; to?: string; ledger?: string; includeZero?: boolean } & DimensionFilterParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicTrialBalance(accounts, jes, params);
}

export function computeIncomeStatement(params: { from?: string; to?: string; compareFrom?: string; compareTo?: string } & DimensionFilterParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicIncomeStatement(accounts, jes, params);
}

export function computeBalanceSheet(params: { asOf?: string; compareAsOf?: string } & DimensionFilterParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicBalanceSheet(accounts, jes, params);
}

export function computeCashFlowStatement(params: { from?: string; to?: string; compareFrom?: string; compareTo?: string } & DimensionFilterParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicCashFlowStatement(accounts, jes, params);
}

export function computeEquityChangesStatement(params: { from?: string; to?: string; compareFrom?: string; compareTo?: string } & DimensionFilterParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicEquityChangesStatement(accounts, jes, params);
}

export function computeAccountStatement(params: { accountId?: string; from?: string; to?: string } & DimensionFilterParams): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicAccountStatement(accounts, jes, params);
}

export function computeCostCentersReport(params: CostCenterReportParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicCostCentersReport(accounts, jes, params);
}

export function computeMultiLevelReportsOverview(params: CostCenterReportParams = {}): any {
  const accounts = getNormalizedAccounts();
  const jes = getEntityList<any>('journal_entries', [])
    .map((j) => normalizeJournalEntry(j, accounts))
    .filter((j) => j.status === 'POSTED');
  return computeDynamicMultiLevelReportsOverview(accounts, jes, params);
}

// ---------------------------------------------------------------------------
// 7. Live Period Closing Checks (Section 27 — 9 Operational Areas)
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

  // CHK-04: Employees & Payroll Run check (Sec 27: الموظفين + التكاليف)
  const emps = getEntityList<any>('employees', []).filter((e) => e.status === 'ACTIVE');
  const payRuns = getEntityList<any>('payroll_runs', []).filter((r) => r.fiscalPeriodId === target?.id && r.status === 'POSTED');

  // CHK-05: Unapproved monthly variables in period (Sec 27: المتغيرات)
  const draftVars = getEntityList<any>('monthly_variables', []).filter((v) => v.status === 'DRAFT' && (!target || v.fiscalPeriodId === target.id));

  // CHK-06: Project Allocations & Unutilized Bench Time (Sec 27: التخصيصات + الوقت غير المستغل)
  const assignments = getEntityList<any>('assignments', []);
  const unutilizedEmps = emps.filter((e) => {
    const tot = assignments
      .filter((a) => matchesEmployee(a, e) && isAssignmentActiveInPeriod(a, target))
      .reduce((s, a) => s + Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100)), 0);
    return tot < 100;
  });

  // CHK-07: Service Prices & Revenues check (Sec 27: الإيرادات)
  const servicePrices = getEntityList<any>('service_prices', []);
  const activeAssignsWithoutPrice = assignments.filter((a) => {
    if (!isAssignmentActiveInPeriod(a, target)) return false;
    const hasSp = servicePrices.some((sp) => matchesEmployee(sp, a) && (!sp.projectId || matchesProject(sp, a)) && (!sp.effectiveTo || !target?.startDate || sp.effectiveTo >= target.startDate));
    const emp = emps.find((e) => matchesEmployee(a, e));
    return !hasSp && !(Number(emp?.defaultBillingRate || 0) > 0) && !(Number(a.billableRate || 0) > 0);
  });

  // CHK-08: Overhead Policy & 3-Level Profitability check (Sec 27: الأوفر هيد + الربحية)
  const overheadPol = getOverheadPolicy();

  // CHK-09: Pending Retroactive Adjustments check (Sec 27 & 29: التسويات)
  const pendingAdjustments = getEntityList<any>('revenue_adjustments', []).filter(
    (adj) => (adj.status === 'DRAFT' || adj.status === 'PENDING_APPROVAL') && (!target || adj.adjustmentPeriodId === target.id || adj.originalPeriodId === target.id),
  );

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
      titleAr: 'مراجعة الموظفين والتكاليف ومسير الرواتب الشهري',
      status: emps.length > 0 && payRuns.length === 0 ? 'WARN' : 'PASS',
      message: emps.length > 0 && payRuns.length === 0 ? `تنبيه: يوجد ${emps.length} موظفون نشطون ولم يُرحّل مسير رواتب لهذه الفترة بعد` : `ملفات التكلفة ومسير الرواتب لعدد (${emps.length}) موظفين مستوفاة`,
    },
    {
      code: 'CHK-05',
      titleAr: 'مراجعة المتغيرات الشهرية المسودة وغير المعتمدة',
      status: draftVars.length > 0 ? 'WARN' : 'PASS',
      message: draftVars.length > 0 ? `يوجد عدد ${draftVars.length} متغيرات شهرية مسودة لم تُعتمد بعد` : 'جميع المتغيرات الشهرية لهذه الفترة معتمدة',
    },
    {
      code: 'CHK-06',
      titleAr: 'مراجعة التخصيصات والوقت غير المستغل (Bench Time)',
      status: unutilizedEmps.length > 0 ? 'WARN' : 'PASS',
      message: unutilizedEmps.length > 0 ? `يوجد ${unutilizedEmps.length} موظف بنسبة تخصيص أقل من 100% (وقت غير مستغل يُحمّل على ربحية الشركة)` : 'جميع الكوادر النشطة مخصصة بالكامل على المشاريع (100%)',
    },
    {
      code: 'CHK-07',
      titleAr: 'مراجعة أسعار الخدمات واحتساب الإيرادات الشهرية',
      status: activeAssignsWithoutPrice.length > 0 ? 'WARN' : 'PASS',
      message: activeAssignsWithoutPrice.length > 0 ? `تنبيه: يوجد ${activeAssignsWithoutPrice.length} تخصيص نشط بدون سعر خدمة محدد` : 'أسعار الخدمات ومعادلات احتساب الإيرادات مكتملة لجميع التخصيصات',
    },
    {
      code: 'CHK-08',
      titleAr: 'مراجعة سياسة الأوفر هيد والربحية (3 مستويات)',
      status: 'PASS',
      message: `سياسة الأوفر هيد المعتمدة (${overheadPol.method} — ${overheadPol.rate}) مفعّلة في احتساب ربحية الموظف والمشروع والشركة`,
    },
    {
      code: 'CHK-09',
      titleAr: 'مراجعة التسويات المعلقة بانتظار الاعتماد (Adjustments Workflow)',
      status: pendingAdjustments.length > 0 ? 'WARN' : 'PASS',
      message: pendingAdjustments.length > 0 ? `يوجد عدد ${pendingAdjustments.length} تسويات في حالة مسودة أو بانتظار الاعتماد` : 'لا توجد تسويات معلقة بدون اعتماد في هذه الفترة',
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

/**
 * Determines whether an assignment is active within a given fiscal period, or as of a reference date.
 * Uses standard interval overlap: [asgStart, asgEnd] overlaps [period.startDate, period.endDate].
 * If period has no dates, falls back to reference date or current date.
 */
export function isAssignmentActiveInPeriod(
  a: any,
  period?: { startDate?: string; endDate?: string } | null,
  referenceDate?: string
): boolean {
  if (!a) return false;
  const asgStart = a.startDate || a.effectiveFrom || '1970-01-01';
  const asgEnd = a.endDate || a.effectiveTo || '2099-12-31';

  if (period && period.startDate && period.endDate) {
    return asgStart <= period.endDate && asgEnd >= period.startDate;
  }

  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  return asgStart <= ref && asgEnd >= ref;
}

/**
 * Matches an assignment/entity to an employee across multiple identifier variants:
 * id, code, full name in Arabic, and common name variations.
 */
export function matchesEmployee(a: any, emp: any): boolean {
  if (!a || !emp) return false;
  const aEmpId = String(a.employeeId || a.employee_id || '').trim();
  const aEmpCode = String(a.employeeCode || a.employee_code || '').trim();
  const aEmpName = String(a.employeeName || a.employeeNameAr || a.employee_name || '').trim().toLowerCase();

  const eId = String(emp.id || '').trim();
  const eCode = String(emp.code || '').trim();
  const eName = String(emp.fullNameAr || emp.full_name_ar || emp.nameAr || emp.name || '').trim().toLowerCase();

  if (aEmpId && (aEmpId === eId || aEmpId === eCode)) return true;
  if (aEmpCode && (aEmpCode === eCode || aEmpCode === eId)) return true;
  if (eId && (aEmpCode === eId || aEmpId === eId)) return true;
  if (eCode && (aEmpId === eCode || aEmpCode === eCode)) return true;
  if (eName && aEmpName && (aEmpName === eName || aEmpName.includes(eName) || eName.includes(aEmpName))) return true;
  return false;
}

/**
 * Matches an assignment/entity to a project across multiple identifier variants:
 * id, code, and project name in Arabic.
 */
export function matchesProject(a: any, prj: any): boolean {
  if (!a || !prj) return false;
  const aPrjId = String(a.projectId || a.project_id || '').trim();
  const aPrjCode = String(a.projectCode || a.project_code || '').trim();
  const aPrjName = String(a.projectName || a.projectNameAr || a.project_name || '').trim().toLowerCase();

  const pId = String(prj.id || '').trim();
  const pCode = String(prj.code || '').trim();
  const pName = String(prj.nameAr || prj.name_ar || prj.name || '').trim().toLowerCase();

  if (aPrjId && (aPrjId === pId || aPrjId === pCode)) return true;
  if (aPrjCode && (aPrjCode === pCode || aPrjCode === pId)) return true;
  if (pId && (aPrjCode === pId || aPrjId === pId)) return true;
  if (pCode && (aPrjId === pCode || aPrjCode === pCode)) return true;
  if (pName && aPrjName && (aPrjName === pName || aPrjName.includes(pName) || pName.includes(aPrjName))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 8. Canonical Assignment & Project Economics Engine (Single Source of Truth)
// ---------------------------------------------------------------------------
export function normalizePricingBasis(...candidates: Array<string | null | undefined>): 'DAILY' | 'MONTHLY' | 'HOURLY' {
  for (const raw of candidates) {
    if (!raw) continue;
    const u = String(raw).trim().toUpperCase();
    if (u === 'MONTHLY' || u === 'MONTH') return 'MONTHLY';
    if (u === 'HOURLY' || u === 'HOURS' || u === 'HOUR') return 'HOURLY';
    if (u === 'DAILY' || u === 'DAYS' || u === 'DAY') return 'DAILY';
    // Note: 'PERCENTAGE' is an allocationBasis, never a pricingBasis — skip it!
  }
  return 'DAILY';
}

export interface AssignmentEconomicsResult {
  workingDays: number;
  allocationBasis: 'DAYS' | 'PERCENTAGE';
  allocationPct: number;
  allocatedDays: number;
  allocatedHours: number;
  pricingBasis: 'DAILY' | 'MONTHLY' | 'HOURLY';
  rawUnitPrice: number;
  rateCurrency: string;
  unitPriceBase: number;
  billingUnits: number;
  revenueBase: number;
  employeeDirectCostBase: number;
  directCostShareBase: number;
  overheadShareBase: number;
  totalCostShareBase: number;
  grossProfitBase: number;
  netProfitBase: number;
  grossMarginPct: number;
  netMarginPct: number;
  priceSource: 'PROJECT_OVERRIDE' | 'ASSIGNMENT_RATE' | 'EMPLOYEE_SERVICE_PRICE' | 'EMPLOYEE_DEFAULT';
}

export function computeAssignmentEconomics(params: {
  assignment: any;
  employee?: any | null;
  project?: any | null;
  servicePrices?: any[];
  period?: { id?: string; startDate?: string; endDate?: string } | null;
  totalEmployeeAllocPct?: number;
  overheadPolicy?: { method: string; rate: string };
}): AssignmentEconomicsResult {
  const a = params.assignment || {};
  const emp = params.employee || null;
  const prj = params.project || null;
  const spList = (params.servicePrices || []).filter((sp: any) => !sp.effectiveTo || !params.period?.startDate || sp.effectiveTo >= params.period.startDate);

  const workingDays = Math.max(1, Number(a.workingDaysInMonth || a.working_days_in_month || 22));
  const isDaysBasis = String(a.allocationBasis || '').toUpperCase() === 'DAYS';

  let allocatedDays = workingDays;
  let allocationPct = 100;
  if (isDaysBasis) {
    allocatedDays = a.allocatedDays != null && a.allocatedDays !== '' ? Number(a.allocatedDays) : workingDays;
    allocationPct = Number(((allocatedDays / workingDays) * 100).toFixed(2));
  } else {
    allocationPct = a.allocationPct != null && a.allocationPct !== ''
      ? Number(a.allocationPct)
      : (a.allocatedDays != null && a.allocatedDays !== '' ? Number(((Number(a.allocatedDays) / workingDays) * 100).toFixed(2)) : 100);
    allocatedDays = Number(((allocationPct / 100) * workingDays).toFixed(2));
  }
  const allocatedHours = Number(a.allocatedHours || (allocatedDays * 8));

  // 4-Tier Price Resolution:
  // 1) Project-specific Service Price Override (sp.projectId matches project)
  // 2) Explicit Assignment Contractual Rate (a.billableRate > 0)
  // 3) Global Employee Service Price (sp.projectId == null)
  // 4) Employee Master defaultBillingRate
  const targetForEmp = emp || a;
  const targetForPrj = prj || a;
  const projectOverride = spList.find((sp: any) => Boolean(sp.projectId) && matchesEmployee(sp, targetForEmp) && matchesProject(sp, targetForPrj));
  const globalSp = spList.find((sp: any) => !sp.projectId && matchesEmployee(sp, targetForEmp));
  const explicitAsgRate = Number(a.billableRate ?? a.dailyRate ?? a.unitPrice ?? 0);
  const empDefaultRate = Number(emp?.defaultBillingRate ?? 0);

  let rawUnitPrice = 0;
  let rateCurrency = a.billingCurrency || prj?.currencyCode || 'SAR';
  let pricingBasis: 'DAILY' | 'MONTHLY' | 'HOURLY' = 'DAILY';
  let priceSource: AssignmentEconomicsResult['priceSource'] = 'EMPLOYEE_DEFAULT';

  if (projectOverride && Number(projectOverride.price || 0) > 0) {
    rawUnitPrice = Number(projectOverride.price);
    rateCurrency = projectOverride.currencyCode || rateCurrency;
    pricingBasis = normalizePricingBasis(projectOverride.pricingBasis, a.billingBasis, emp?.defaultBillingBasis);
    priceSource = 'PROJECT_OVERRIDE';
  } else if (explicitAsgRate > 0) {
    rawUnitPrice = explicitAsgRate;
    rateCurrency = a.billingCurrency || rateCurrency;
    pricingBasis = normalizePricingBasis(a.billingBasis, a.pricingBasis, globalSp?.pricingBasis, emp?.defaultBillingBasis);
    priceSource = 'ASSIGNMENT_RATE';
  } else if (globalSp && Number(globalSp.price || 0) > 0) {
    rawUnitPrice = Number(globalSp.price);
    rateCurrency = globalSp.currencyCode || rateCurrency;
    pricingBasis = normalizePricingBasis(globalSp.pricingBasis, a.billingBasis, emp?.defaultBillingBasis);
    priceSource = 'EMPLOYEE_SERVICE_PRICE';
  } else {
    rawUnitPrice = empDefaultRate;
    rateCurrency = emp?.salaryCurrency || rateCurrency;
    pricingBasis = normalizePricingBasis(a.billingBasis, emp?.defaultBillingBasis);
    priceSource = 'EMPLOYEE_DEFAULT';
  }

  const unitPriceBase = convertToBase(rawUnitPrice, rateCurrency, params.period?.endDate).amountBase;

  let billingUnits = allocatedDays;
  let revenueBase = 0;
  if (pricingBasis === 'DAILY') {
    billingUnits = allocatedDays;
    revenueBase = Math.round(allocatedDays * unitPriceBase * 100) / 100;
  } else if (pricingBasis === 'HOURLY') {
    billingUnits = allocatedHours;
    revenueBase = Math.round(allocatedHours * unitPriceBase * 100) / 100;
  } else {
    billingUnits = Number((allocationPct / 100).toFixed(4));
    revenueBase = Math.round((allocationPct / 100) * unitPriceBase * 100) / 100;
  }

  const policy = params.overheadPolicy || getOverheadPolicy();
  const empDirectCostBase = emp
    ? computeEmployeeCostBreakdown(emp, params.period, policy).distributableCostBase
    : Number(a.employeeMonthlyCost || a.allocatedCost || 0);

  const totalEmpPct = params.totalEmployeeAllocPct != null ? params.totalEmployeeAllocPct : allocationPct;
  const normRatio = totalEmpPct > 100 ? (100 / totalEmpPct) : 1;
  const directCostShareBase = Math.round(empDirectCostBase * (allocationPct / 100) * normRatio * 100) / 100;

  let overheadShareBase = 0;
  if (policy.method === 'PERCENTAGE') {
    overheadShareBase = Math.round(directCostShareBase * (Number(policy.rate || 0) / 100) * 100) / 100;
  } else if (policy.method === 'FIXED_PER_EMPLOYEE') {
    overheadShareBase = Math.round(Number(policy.rate || 0) * (allocationPct / 100) * normRatio * 100) / 100;
  }

  const totalCostShareBase = Math.round((directCostShareBase + overheadShareBase) * 100) / 100;
  const grossProfitBase = Math.round((revenueBase - directCostShareBase) * 100) / 100;
  const netProfitBase = Math.round((revenueBase - totalCostShareBase) * 100) / 100;
  const grossMarginPct = revenueBase > 0 ? Number(((grossProfitBase / revenueBase) * 100).toFixed(1)) : 0;
  const netMarginPct = revenueBase > 0 ? Number(((netProfitBase / revenueBase) * 100).toFixed(1)) : 0;

  return {
    workingDays,
    allocationBasis: isDaysBasis ? 'DAYS' : 'PERCENTAGE',
    allocationPct,
    allocatedDays,
    allocatedHours,
    pricingBasis,
    rawUnitPrice,
    rateCurrency,
    unitPriceBase,
    billingUnits,
    revenueBase,
    employeeDirectCostBase: empDirectCostBase,
    directCostShareBase,
    overheadShareBase,
    totalCostShareBase,
    grossProfitBase,
    netProfitBase,
    grossMarginPct,
    netMarginPct,
    priceSource,
  };
}
