-- =============================================================================
-- 0006  Reference / system metadata (NOT business or demo data)
--   * ISO currencies
--   * Permission catalogue (contract between API guards and roles)
--   * Posting event catalogue (business events the engine understands)
-- =============================================================================

INSERT INTO core.currencies (code, name_ar, name_en, symbol, decimal_places) VALUES
 ('EGP','جنيه مصري','Egyptian Pound','ج.م',2),
 ('SAR','ريال سعودي','Saudi Riyal','ر.س',2),
 ('AED','درهم إماراتي','UAE Dirham','د.إ',2),
 ('KWD','دينار كويتي','Kuwaiti Dinar','د.ك',3),
 ('QAR','ريال قطري','Qatari Riyal','ر.ق',2),
 ('BHD','دينار بحريني','Bahraini Dinar','د.ب',3),
 ('OMR','ريال عماني','Omani Rial','ر.ع',3),
 ('JOD','دينار أردني','Jordanian Dinar','د.أ',3),
 ('LYD','دينار ليبي','Libyan Dinar','د.ل',3),
 ('IQD','دينار عراقي','Iraqi Dinar','د.ع',3),
 ('MAD','درهم مغربي','Moroccan Dirham','د.م',2),
 ('TND','دينار تونسي','Tunisian Dinar','د.ت',3),
 ('DZD','دينار جزائري','Algerian Dinar','د.ج',2),
 ('SDG','جنيه سوداني','Sudanese Pound','ج.س',2),
 ('LBP','ليرة لبنانية','Lebanese Pound','ل.ل',2),
 ('USD','دولار أمريكي','US Dollar','$',2),
 ('EUR','يورو','Euro','€',2),
 ('GBP','جنيه إسترليني','Pound Sterling','£',2),
 ('CHF','فرنك سويسري','Swiss Franc','CHF',2),
 ('CAD','دولار كندي','Canadian Dollar','C$',2),
 ('AUD','دولار أسترالي','Australian Dollar','A$',2),
 ('JPY','ين ياباني','Japanese Yen','¥',0),
 ('CNY','يوان صيني','Chinese Yuan','¥',2),
 ('INR','روبية هندية','Indian Rupee','₹',2),
 ('TRY','ليرة تركية','Turkish Lira','₺',2),
 ('PKR','روبية باكستانية','Pakistani Rupee','₨',2)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Permission catalogue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION iam.def_perms(p_module text, p_resource text, p_actions text[],
                                         p_ar text, p_en text, p_sensitive_actions text[] DEFAULT ARRAY['view_sensitive'])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE a text;
BEGIN
  FOREACH a IN ARRAY p_actions LOOP
    INSERT INTO iam.permissions(code, module, resource, action, is_sensitive, description_ar, description_en)
    VALUES (p_module || '.' || p_resource || '.' || a, p_module, p_resource, a, a = ANY(p_sensitive_actions),
            p_ar || ' — ' || a, p_en || ' - ' || a)
    ON CONFLICT (code) DO UPDATE SET description_ar = EXCLUDED.description_ar,
                                     description_en = EXCLUDED.description_en,
                                     is_sensitive = EXCLUDED.is_sensitive;
  END LOOP;
END $$;

SELECT iam.def_perms('core','company',      ARRAY['view','create','edit','delete','export'], 'الشركات','Companies');
SELECT iam.def_perms('core','branch',       ARRAY['view','create','edit','delete','export'], 'الفروع','Branches');
SELECT iam.def_perms('core','department',   ARRAY['view','create','edit','delete','export'], 'الأقسام','Departments');
SELECT iam.def_perms('core','cost_center',  ARRAY['view','create','edit','delete','export'], 'مراكز التكلفة','Cost centers');
SELECT iam.def_perms('core','fiscal',       ARRAY['view','create','edit','export'], 'السنوات والفترات المالية','Fiscal years and periods');
SELECT iam.def_perms('core','fx',           ARRAY['view','create','edit','delete','export'], 'العملات وأسعار الصرف','Currencies and exchange rates');
SELECT iam.def_perms('core','calendar',     ARRAY['view','create','edit','delete'], 'تقويم العمل','Work calendars');
SELECT iam.def_perms('core','tax',          ARRAY['view','create','edit','delete'], 'الضرائب','Taxes');

SELECT iam.def_perms('hr','employee',       ARRAY['view','create','edit','delete','export','print','view_sensitive'], 'الموظفون','Employees');
SELECT iam.def_perms('hr','compensation',   ARRAY['view','create','edit','approve','export','view_sensitive'], 'الرواتب','Compensation');
SELECT iam.def_perms('hr','position',       ARRAY['view','create','edit','delete'], 'الوظائف','Positions');
SELECT iam.def_perms('hr','document',       ARRAY['view','create','edit','delete'], 'مستندات الموظفين','Employee documents');

SELECT iam.def_perms('cost','profile',      ARRAY['view','create','edit','delete','export'], 'ملفات ومكونات التكلفة','Cost profiles and components');
SELECT iam.def_perms('cost','allocation',   ARRAY['view','create','post','export'], 'تشغيل التخصيص','Allocation runs');
SELECT iam.def_perms('cost','overhead',     ARRAY['view','create','edit','delete','approve','post','cancel','export'], 'المصروفات العامة','Overhead');
SELECT iam.def_perms('cost','profitability',ARRAY['view','export','print','view_sensitive'], 'الربحية','Profitability');

SELECT iam.def_perms('prj','client',        ARRAY['view','create','edit','delete','export','print'], 'العملاء','Clients');
SELECT iam.def_perms('prj','project',       ARRAY['view','create','edit','delete','export','print'], 'المشاريع','Projects');
SELECT iam.def_perms('prj','assignment',    ARRAY['view','create','edit','delete','export'], 'التخصيصات','Assignments');
SELECT iam.def_perms('prj','price',         ARRAY['view','create','edit','delete','approve','export','view_sensitive'], 'أسعار الخدمات','Service prices');

SELECT iam.def_perms('pay','config',        ARRAY['view','create','edit','delete'], 'إعدادات الرواتب','Payroll configuration');
SELECT iam.def_perms('pay','variable',      ARRAY['view','create','edit','delete','approve','cancel','export'], 'المتغيرات والإضافي','Variables and overtime');
SELECT iam.def_perms('pay','run',           ARRAY['view','create','approve','post','cancel','export','print','view_sensitive'], 'تشغيل الرواتب','Payroll runs');
SELECT iam.def_perms('pay','payment',       ARRAY['view','create','post','cancel'], 'صرف الرواتب','Salary payments');
SELECT iam.def_perms('pay','loan',          ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'السلف','Loans');

SELECT iam.def_perms('ast','asset',         ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'الأصول','Assets');
SELECT iam.def_perms('ast','depreciation',  ARRAY['view','create','post','cancel','export'], 'الإهلاك','Depreciation');

SELECT iam.def_perms('rev','run',           ARRAY['view','create','edit','approve','post','cancel','export'], 'تشغيل الإيراد','Revenue runs');
SELECT iam.def_perms('rev','retro',         ARRAY['view','create','edit','approve','post','cancel','export'], 'الإيراد بأثر رجعي','Retroactive revenue');
SELECT iam.def_perms('rev','invoice',       ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'فواتير العملاء','Invoices');
SELECT iam.def_perms('rev','receipt',       ARRAY['view','create','edit','delete','post','cancel','export','print'], 'التحصيلات','Receipts');

SELECT iam.def_perms('exp','supplier',      ARRAY['view','create','edit','delete','export'], 'الموردون','Suppliers');
SELECT iam.def_perms('exp','bill',          ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'فواتير المصروفات','Bills');
SELECT iam.def_perms('exp','payment',       ARRAY['view','create','edit','delete','post','cancel','export','print'], 'المدفوعات','Payments');

SELECT iam.def_perms('acc','coa',           ARRAY['view','create','edit','delete','export','print'], 'شجرة الحسابات','Chart of accounts');
SELECT iam.def_perms('acc','rules',         ARRAY['view','create','edit','delete','approve','export'], 'قواعد الترحيل','Posting rules');
SELECT iam.def_perms('acc','journal',       ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'القيود اليومية','Journal entries');
SELECT iam.def_perms('acc','ledger',        ARRAY['view','export','print'], 'الأستاذ العام','General ledger');
SELECT iam.def_perms('acc','bank',          ARRAY['view','create','edit','delete'], 'البنوك والصناديق','Bank and cash accounts');

SELECT iam.def_perms('close','period',      ARRAY['view','close','reopen','export','print'], 'إقفال الفترات','Period closing');
SELECT iam.def_perms('close','year',        ARRAY['view','close','reopen'], 'إقفال السنة','Year closing');
SELECT iam.def_perms('close','snapshot',    ARRAY['view','export'], 'لقطات الإقفال','Snapshots');

SELECT iam.def_perms('wf','approval',       ARRAY['view','create','edit','delete','approve'], 'الموافقات','Approvals');
SELECT iam.def_perms('wf','adjustment',     ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'التسويات','Adjustments');

SELECT iam.def_perms('rpt','financial',     ARRAY['view','export','print'], 'التقارير المالية','Financial reports');
SELECT iam.def_perms('rpt','hr',            ARRAY['view','export','print','view_sensitive'], 'تقارير الموارد البشرية','HR reports');
SELECT iam.def_perms('rpt','cost',          ARRAY['view','export','print','view_sensitive'], 'تقارير التكلفة','Cost reports');
SELECT iam.def_perms('rpt','projects',      ARRAY['view','export','print'], 'تقارير المشاريع','Project reports');
SELECT iam.def_perms('rpt','receivables',   ARRAY['view','export','print'], 'تقارير الذمم المدينة','Receivables reports');
SELECT iam.def_perms('rpt','payables',      ARRAY['view','export','print'], 'تقارير الذمم الدائنة','Payables reports');
SELECT iam.def_perms('rpt','assets',        ARRAY['view','export','print'], 'تقارير الأصول','Asset reports');
SELECT iam.def_perms('rpt','tax',           ARRAY['view','export','print'], 'التقارير الضريبية','Tax reports');

SELECT iam.def_perms('dash','dashboard',    ARRAY['view','export','view_sensitive'], 'لوحة التحكم','Dashboard');
SELECT iam.def_perms('audit','log',         ARRAY['view','export','print'], 'سجل التدقيق','Audit log');
SELECT iam.def_perms('iam','user',          ARRAY['view','create','edit','delete','export'], 'المستخدمون','Users');
SELECT iam.def_perms('iam','role',          ARRAY['view','create','edit','delete','export'], 'الأدوار والصلاحيات','Roles and permissions');
SELECT iam.def_perms('sys','settings',      ARRAY['view','edit'], 'الإعدادات','Settings');

-- ---------------------------------------------------------------------------
-- Posting event catalogue (see design doc 03 §4.5)
-- ---------------------------------------------------------------------------
INSERT INTO acc.posting_events (code, module, description_ar, description_en, amount_keys, account_sources) VALUES
 ('PAYROLL.EARNING','payroll','استحقاق الرواتب والمكونات المكتسبة','Payroll earnings accrual', ARRAY['AMOUNT'], ARRAY['FROM_COMPONENT_EXPENSE','FROM_COMPONENT_LIABILITY','FROM_VARIABLE_TYPE']),
 ('PAYROLL.EMPLOYER_CONTRIBUTION','payroll','حصة صاحب العمل في التأمينات','Employer contributions', ARRAY['AMOUNT'], ARRAY['FROM_COMPONENT_EXPENSE','FROM_COMPONENT_LIABILITY']),
 ('PAYROLL.ACCRUAL','payroll','استحقاق مزايا لطرف ثالث','Benefit accruals', ARRAY['AMOUNT'], ARRAY['FROM_COMPONENT_EXPENSE','FROM_COMPONENT_LIABILITY']),
 ('PAYROLL.NOTIONAL','payroll','تكلفة إدارية محمّلة','Notional cost absorption', ARRAY['AMOUNT'], ARRAY['FROM_COMPONENT_EXPENSE','FROM_COMPONENT_LIABILITY']),
 ('PAYROLL.COST_REDUCTION','payroll','خصم يخفض التكلفة','Cost-reducing deduction', ARRAY['AMOUNT'], ARRAY['FROM_VARIABLE_TYPE']),
 ('PAYROLL.EMPLOYEE_DEDUCTION','payroll','استقطاع حصة الموظف','Employee deductions', ARRAY['AMOUNT'], ARRAY['FROM_COMPONENT_LIABILITY']),
 ('PAYROLL.TAX_WITHHOLDING','payroll','ضريبة كسب العمل','Payroll tax withholding', ARRAY['AMOUNT'], ARRAY['FROM_TAX_CODE','FROM_COMPONENT_LIABILITY']),
 ('PAYROLL.LOAN_DEDUCTION','payroll','خصم قسط سلفة','Loan installment deduction', ARRAY['AMOUNT'], ARRAY[]::text[]),
 ('PAYROLL.PAYMENT','payroll','صرف الرواتب','Salary payment', ARRAY['AMOUNT'], ARRAY['FROM_BANK']),
 ('LIABILITY.SETTLEMENT','payroll','سداد التزامات الرواتب','Payroll liability settlement', ARRAY['AMOUNT'], ARRAY['FROM_BANK','FROM_PAYLOAD']),
 ('LOAN.DISBURSEMENT','loans','صرف سلفة','Loan disbursement', ARRAY['AMOUNT'], ARRAY['FROM_BANK']),
 ('LOAN.WRITE_OFF','loans','شطب سلفة','Loan write-off', ARRAY['AMOUNT'], ARRAY[]::text[]),
 ('ASSET.ACQUISITION','assets','اقتناء أصل','Asset acquisition', ARRAY['COST'], ARRAY['FROM_ASSET_CATEGORY_ASSET','FROM_BANK','FROM_SUPPLIER']),
 ('ASSET.DEPRECIATION','assets','إهلاك الأصول','Depreciation', ARRAY['AMOUNT'], ARRAY['FROM_ASSET_CATEGORY_EXPENSE','FROM_ASSET_CATEGORY_ACCUM']),
 ('ASSET.DISPOSAL','assets','استبعاد أصل','Asset disposal', ARRAY['COST','ACCUMULATED','PROCEEDS','GAIN','LOSS'], ARRAY['FROM_ASSET_CATEGORY_ASSET','FROM_ASSET_CATEGORY_ACCUM','FROM_BANK']),
 ('REVENUE.INVOICE','revenue','إيراد فاتورة عميل','Customer invoice revenue', ARRAY['NET','TAX','GROSS'], ARRAY['FROM_CLIENT','FROM_TAX_CODE']),
 ('REVENUE.RETRO','revenue','إيراد بأثر رجعي','Retroactive revenue', ARRAY['NET','TAX','GROSS'], ARRAY['FROM_CLIENT','FROM_TAX_CODE']),
 ('REVENUE.ADJUSTMENT','revenue','تسوية إيراد','Revenue adjustment', ARRAY['NET','TAX','GROSS'], ARRAY['FROM_CLIENT','FROM_TAX_CODE']),
 ('REVENUE.CREDIT_NOTE','revenue','إشعار دائن','Credit note', ARRAY['NET','TAX','GROSS'], ARRAY['FROM_CLIENT','FROM_TAX_CODE']),
 ('AR.RECEIPT','receivables','تحصيل من عميل','Customer receipt', ARRAY['AMOUNT','FX_GAIN','FX_LOSS'], ARRAY['FROM_BANK','FROM_CLIENT']),
 ('AP.BILL','payables','فاتورة مورد / مصروف','Supplier bill / expense', ARRAY['NET','TAX','GROSS'], ARRAY['FROM_PAYLOAD','FROM_SUPPLIER','FROM_TAX_CODE','FROM_BANK']),
 ('AP.PAYMENT','payables','سداد مورد','Supplier payment', ARRAY['AMOUNT','FX_GAIN','FX_LOSS'], ARRAY['FROM_BANK','FROM_SUPPLIER']),
 ('OVERHEAD.APPLY','overhead','تحميل المصروفات العامة','Overhead application', ARRAY['AMOUNT'], ARRAY[]::text[]),
 ('FX.REVALUATION','accounting','إعادة تقييم العملات','FX revaluation', ARRAY['GAIN','LOSS'], ARRAY['FROM_PAYLOAD']),
 ('GL.MANUAL','accounting','قيد يدوي','Manual journal', ARRAY[]::text[], ARRAY['FROM_PAYLOAD']),
 ('GL.ADJUSTMENT','accounting','قيد تسوية معتمد','Approved adjustment', ARRAY[]::text[], ARRAY['FROM_PAYLOAD']),
 ('OPENING.BALANCE','accounting','أرصدة افتتاحية','Opening balances', ARRAY[]::text[], ARRAY['FROM_PAYLOAD']),
 ('PERIOD.YEAR_CLOSE','accounting','إقفال السنة المالية','Year-end closing', ARRAY[]::text[], ARRAY['FROM_PAYLOAD'])
ON CONFLICT (code) DO NOTHING;
