/** Arabic labels for API enums (UI text only). */
export const ACCOUNT_CLASS: Record<string, string> = {
  ASSET: 'أصول', LIABILITY: 'التزامات', EQUITY: 'حقوق ملكية', REVENUE: 'إيرادات', DIRECT_COST: 'تكاليف مباشرة',
  OPERATING_EXPENSE: 'مصروفات تشغيلية', OTHER_INCOME: 'إيرادات أخرى', OTHER_EXPENSE: 'مصروفات أخرى',
};
export const ACCOUNT_SUBTYPE: Record<string, string> = {
  CASH: 'نقدية', BANK: 'بنك', RECEIVABLE: 'ذمم مدينة', PAYABLE: 'ذمم دائنة', EMPLOYEE_RECEIVABLE: 'ذمم موظفين (سلف)',
  PAYROLL_LIABILITY: 'التزامات رواتب', TAX: 'ضرائب', FIXED_ASSET: 'أصول ثابتة', ACCUMULATED_DEPRECIATION: 'مجمع إهلاك',
  RETAINED_EARNINGS: 'أرباح مرحلة', OPENING_BALANCE: 'أرصدة افتتاحية', FX_GAIN_LOSS: 'فروق عملة', ROUNDING: 'فروق تقريب',
  OVERHEAD_APPLIED: 'مصروفات عامة محمّلة', OVERHEAD_ABSORBED: 'مصروفات عامة مستوعبة', PREPAID: 'مقدمات', ACCRUED: 'مستحقات', OTHER: 'أخرى',
};
export const CASH_FLOW: Record<string, string> = { CASH: 'نقدية وما في حكمها', OPERATING: 'أنشطة تشغيلية', INVESTING: 'أنشطة استثمارية', FINANCING: 'أنشطة تمويلية', NON_CASH: 'بنود غير نقدية' };

export const STATEMENT_TYPE_LABELS: Record<string, string> = {
  BALANCE_SHEET: 'قائمة المركز المالي (الميزانية)',
  INCOME_STATEMENT: 'قائمة الدخل (الأرباح والخسائر)',
  CASH_FLOW: 'قائمة التدفقات النقدية',
  EQUITY_CHANGES: 'قائمة التغيرات في حقوق الملكية',
};

export const STATEMENT_SECTION_LABELS: Record<string, string> = {
  CURRENT_ASSETS: 'الأصول المتداولة',
  NON_CURRENT_ASSETS: 'الأصول غير المتداولة',
  CURRENT_LIABILITIES: 'الالتزامات المتداولة',
  NON_CURRENT_LIABILITIES: 'الالتزامات طويلة الأجل',
  EQUITY: 'حقوق الملكية',
  REVENUE: 'الإيرادات التشغيلية',
  COST_OF_SALES: 'تكلفة المبيعات والخدمات المباشرة',
  OPERATING_EXPENSES: 'المصروفات التشغيلية والإدارية',
  OTHER_INCOME: 'الإيرادات الأخرى',
  OTHER_EXPENSES: 'المصروفات الأخرى',
  ZAKAT_TAX: 'مصروف الزكاة والضريبة',
};

export const EQUITY_SECTION_LABELS: Record<string, string> = {
  PAID_IN_CAPITAL: 'رأس المال المدفوع',
  STATUTORY_RESERVE: 'الاحتياطي النظامي',
  RETAINED_EARNINGS: 'الأرباح المبقاة',
  DIVIDENDS_DISTRIBUTIONS: 'التوزيعات وجاري الشركاء',
  OTHER_EQUITY: 'بنود حقوق ملكية أخرى',
};
export const JE_STATUS: Record<string, { label: string; color: 'green' | 'red' | 'amber' | 'slate' | 'blue' }> = {
  DRAFT: { label: 'مسودة', color: 'amber' },
  POSTED: { label: 'مرحّل', color: 'green' },
  CANCELLED: { label: 'ملغى', color: 'slate' },
};
export const JOURNAL_TYPE: Record<string, string> = {
  GENERAL: 'قيد عام',
  ADJUSTMENT: 'قيد تسوية',
  ACCRUAL: 'قيد استحقاق',
  OPENING: 'قيد افتتاحي',
  REVERSAL: 'قيد عكسي',
  CLOSING: 'قيد إقفال',
  PAYROLL: 'مسيّر رواتب',
  REVENUE: 'استحقاق إيرادات',
  DEPRECIATION: 'إهلاك أصول',
  OVERHEAD: 'مصروفات عامة',
  SYSTEM: 'تلقائي نظامي',
  SALES: 'مبيعات وفوترة',
  PURCHASE: 'مشتريات وموردين',
  RECEIPT: 'سند قبض وتحصيل',
  PAYMENT: 'سند صرف وسداد',
  ASSET: 'أصول ثابتة',
  EXPENSE: 'تسوية مصروفات وعهد',
  TRANSFER: 'تحويل وصرافة بنكية',
  LOAN: 'سلف وقروض موظفين',
  EOSB: 'نهاية خدمة ومخصصات',
  TAX: 'ضريبة وزكاة',
};
export const SOURCE_MODULE_LABELS: Record<string, string> = {
  ACC: 'المحاسبة العامة',
  SALES: 'المبيعات والفوترة',
  PURCHASES: 'المشتريات والموردين',
  TREASURY: 'الخزينة والبنوك والعهد',
  ASSETS: 'الأصول الثابتة',
  PAY: 'الرواتب والسلف',
  REV: 'محرك الإيرادات',
  TAX: 'الزكاة والضريبة',
  HR: 'الموارد البشرية',
};
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  MANUAL: 'سند يدوي',
  SALES_INVOICE: 'فاتورة مبيعات',
  CREDIT_NOTE: 'إشعار دائن مبيعات',
  CUSTOMER_RECEIPT: 'تحصيل عميل',
  PURCHASE_INVOICE: 'فاتورة مشتريات',
  DEBIT_NOTE: 'إشعار مدين مشتريات',
  VENDOR_PAYMENT: 'سداد مورد',
  ASSET_ACTIVATION: 'رسملة وتفعيل أصل',
  ASSET_DISPOSAL: 'استبعاد أصل ثابت',
  DEPRECIATION_RUN: 'مسيّر إهلاك شهري',
  CUSTODY_DISBURSEMENT: 'صرف عهدة نقدية',
  CUSTODY_CONVERSION: 'تحويل عملة عهدة',
  CUSTODY_SETTLEMENT: 'تسوية إيصالات عهدة',
  CUSTODY_CLOSURE: 'إقفال واسترداد عهدة',
  PAYROLL_RUN: 'استحقاق مسيّر رواتب',
  PAYROLL_PAYMENT: 'صرف رواتب من البنك',
  LOAN_DISBURSEMENT: 'صرف سلفة موظف',
  LOAN_CANCELLATION: 'إلغاء وتسوية سلفة',
  EOSB_SETTLEMENT: 'تصفية نهاية خدمة',
  REVENUE_RUN: 'تشغيل إيرادات مشاريع',
  REVENUE_ADJUSTMENT: 'تسوية إيراد بأثر رجعي',
  BANK_TRANSFER: 'تحويل بنكي وصرافة',
  VAT_SETTLEMENT: 'تسوية إقرار ضريبي',
  ZAKAT_RETURN: 'ربط إقرار زكوي',
};
export const LEDGER: Record<string, string> = { FINANCIAL: 'مالي', MANAGEMENT: 'إداري' };
export const ACCOUNT_SOURCE: Record<string, string> = {
  FIXED: 'حساب ثابت', FROM_COMPONENT_EXPENSE: 'حساب مصروف مكون التكلفة', FROM_COMPONENT_LIABILITY: 'حساب التزام مكون التكلفة',
  FROM_VARIABLE_TYPE: 'حساب نوع المتغير', FROM_ASSET_CATEGORY_ASSET: 'حساب الأصل (فئة الأصل)', FROM_ASSET_CATEGORY_ACCUM: 'مجمع الإهلاك (فئة الأصل)',
  FROM_ASSET_CATEGORY_EXPENSE: 'مصروف الإهلاك (فئة الأصل)', FROM_CLIENT: 'حساب العميل', FROM_SUPPLIER: 'حساب المورد', FROM_BANK: 'حساب البنك/الصندوق',
  FROM_TAX_CODE: 'حساب الرمز الضريبي', FROM_PAYLOAD: 'من المستند',
};
export const DIMENSION_POLICY: Record<string, string> = {
  INHERIT_ALL: 'كل الأبعاد', SPLIT_BY_ALLOCATION: 'توزيع حسب التخصيص', EMPLOYEE_ONLY: 'الموظف فقط', PARTY_ONLY: 'الطرف فقط', NONE: 'بدون أبعاد',
};
export const CHECK_STATUS: Record<string, { label: string; color: 'green' | 'red' | 'amber' }> = {
  PASS: { label: 'ناجح', color: 'green' },
  FAIL: { label: 'فشل', color: 'red' },
  WARN: { label: 'تحذير', color: 'amber' },
};
export const AUDIT_ACTION: Record<string, string> = {
  INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف', POST: 'ترحيل', REVERSE: 'عكس', CLOSE: 'إقفال', REOPEN: 'إعادة فتح', CANCEL: 'إلغاء',
  LOGIN: 'دخول', APPROVE: 'اعتماد',
};

type Tone = 'green' | 'red' | 'amber' | 'slate' | 'blue';
export const EMPLOYEE_STATUS: Record<string, { label: string; color: Tone }> = {
  ACTIVE: { label: 'نشط', color: 'green' },
  ON_LEAVE: { label: 'في إجازة', color: 'blue' },
  SUSPENDED: { label: 'موقوف', color: 'amber' },
  TERMINATED: { label: 'منتهية خدمته', color: 'slate' },
};
export const EMPLOYMENT_TYPE: Record<string, string> = { FULL_TIME: 'دوام كامل', PART_TIME: 'دوام جزئي', CONTRACTOR: 'متعاقد' };
export const DOC_TYPE: Record<string, string> = {
  ID: 'بطاقة هوية', PASSPORT: 'جواز سفر', CONTRACT: 'عقد عمل', CERTIFICATE: 'شهادة', INSURANCE: 'تأمينات', MEDICAL: 'طبي', OTHER: 'أخرى',
};
export const COMPONENT_TYPE: Record<string, string> = {
  SALARY: 'راتب', INSURANCE: 'تأمينات', MEDICAL: 'تأمين طبي', DEPRECIATION: 'إهلاك', COMPANY_COST: 'تكلفة شركة', BENEFIT: 'مزايا',
  ALLOWANCE: 'بدل', TAX: 'ضريبة', OTHER: 'أخرى',
};
export const COMPONENT_NATURE: Record<string, string> = {
  EARNING: 'استحقاق للموظف', EMPLOYER_CONTRIB: 'حصة صاحب العمل', EMPLOYEE_DEDUCTION: 'استقطاع من الموظف', ACCRUAL: 'مستحق لطرف ثالث',
  DEPRECIATION: 'إهلاك عهد', NOTIONAL: 'تكلفة إدارية محمّلة', TAX: 'ضريبة',
};
export const CALC_METHOD: Record<string, string> = {
  BASIC_SALARY: 'الراتب الأساسي', FIXED: 'مبلغ ثابت', PCT_BASIC: 'نسبة من الأساسي', PCT_INSURANCE: 'نسبة من التأميني', PCT_GROSS: 'نسبة من الإجمالي',
  FROM_ASSETS: 'من إهلاك العهد',
};
export const POSTING_TREATMENT: Record<string, string> = {
  PAYROLL: 'يُرحّل مع الرواتب', ACCRUAL: 'استحقاق', DEPRECIATION_SOURCE: 'يُرحّل من تشغيل الإهلاك', NOTIONAL: 'تحميل إداري', NONE: 'لا يُرحّل',
};
export const COST_BEHAVIOR: Record<string, string> = { FIXED: 'ثابتة', VARIABLE: 'متغيرة' };
export const PROFITABILITY_TREATMENT: Record<string, string> = { DISTRIBUTE: 'تُوزع على المشاريع', EXCLUDE: 'مستبعدة من الربحية' };
export const TAX_TREATMENT: Record<string, string> = { TAXABLE: 'خاضع', EXEMPT: 'معفى', PARTIAL: 'خاضع جزئيًا', NOT_APPLICABLE: 'لا ينطبق' };
export const ASSET_STATUS: Record<string, { label: string; color: Tone }> = {
  DRAFT: { label: 'مسودة', color: 'amber' },
  ACTIVE: { label: 'نشط', color: 'green' },
  FULLY_DEPRECIATED: { label: 'مهلك بالكامل', color: 'blue' },
  DISPOSED: { label: 'مستبعد', color: 'slate' },
};
export const ASSET_KIND: Record<string, string> = { LAPTOP: 'لابتوب', DEVICE: 'جهاز', EQUIPMENT: 'معدات', VEHICLE: 'سيارة', FURNITURE: 'أثاث', OTHER: 'أخرى' };
export const DEP_METHOD: Record<string, string> = { STRAIGHT_LINE: 'القسط الثابت', DECLINING_BALANCE: 'القسط المتناقص' };
export const RUN_STATUS: Record<string, { label: string; color: Tone }> = {
  POSTED: { label: 'مرحّل', color: 'green' },
  CANCELLED: { label: 'ملغى', color: 'slate' },
};
export const opts = (m: Record<string, string | { label: string }>) =>
  Object.entries(m).map(([value, l]) => ({ value, label: typeof l === 'string' ? l : l.label }));

export const PROJECT_STATUS: Record<string, { label: string; color: Tone }> = {
  DRAFT: { label: 'مسودة', color: 'slate' },
  ACTIVE: { label: 'نشط', color: 'green' },
  ON_HOLD: { label: 'متوقف مؤقتًا', color: 'amber' },
  COMPLETED: { label: 'مكتمل', color: 'blue' },
  CANCELLED: { label: 'ملغى', color: 'red' },
};
export const PRICING_BASIS: Record<string, string> = { MONTHLY: 'شهري', DAILY: 'يومي', HOURLY: 'بالساعة' };
