-- =============================================================================
-- 0023  Dynamic Chart of Accounts <-> Financial Statements Mapping Engine
--       - acc.statement_lines: configurable lines for BS, IS, CF, Equity Changes
--       - acc.accounts extensions: statement_section, statement_line_id, equity_line_id
--       - acc.account_reclassifications: effective-dated audited reclassification history
--       - Safe idempotent seed & backfill for all existing companies/accounts
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Configurable Financial Statement Lines (Single Source of Presentation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acc.statement_lines (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  statement_type text NOT NULL CHECK (statement_type IN (
                   'BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'EQUITY_CHANGES'
                 )),
  section_code   text NOT NULL CHECK (section_code IN (
                   -- Balance Sheet
                   'CURRENT_ASSETS', 'NON_CURRENT_ASSETS',
                   'CURRENT_LIABILITIES', 'NON_CURRENT_LIABILITIES', 'EQUITY',
                   -- Income Statement
                   'REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSES',
                   'OTHER_INCOME', 'OTHER_EXPENSES', 'ZAKAT_TAX',
                   -- Cash Flow
                   'OPERATING_ACTIVITIES', 'INVESTING_ACTIVITIES',
                   'FINANCING_ACTIVITIES', 'CASH_EQUIVALENTS',
                   -- Statement of Changes in Equity
                   'PAID_IN_CAPITAL', 'STATUTORY_RESERVE',
                   'RETAINED_EARNINGS', 'DIVIDENDS_DISTRIBUTIONS', 'OTHER_EQUITY'
                 )),
  code           text NOT NULL CHECK (code ~ '^[0-9A-Za-z._-]{2,40}$'),
  name_ar        text NOT NULL,
  name_en        text NULL,
  normal_sign    smallint NOT NULL DEFAULT 1 CHECK (normal_sign IN (1, -1)),
  sort_order     int NOT NULL DEFAULT 100,
  is_system      boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  description    text NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid NULL,
  row_version    int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id)
);

CREATE INDEX IF NOT EXISTS ix_statement_lines_company_type
  ON acc.statement_lines (company_id, statement_type, sort_order)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS touch ON acc.statement_lines;
CREATE TRIGGER touch BEFORE UPDATE ON acc.statement_lines
  FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();

-- ---------------------------------------------------------------------------
-- 2. Extend acc.accounts with Dynamic Financial Statement Classification
-- ---------------------------------------------------------------------------
ALTER TABLE acc.accounts
  ADD COLUMN IF NOT EXISTS statement_section text NULL
    CHECK (statement_section IN (
      'CURRENT_ASSETS', 'NON_CURRENT_ASSETS',
      'CURRENT_LIABILITIES', 'NON_CURRENT_LIABILITIES', 'EQUITY',
      'REVENUE', 'COST_OF_SALES', 'OPERATING_EXPENSES',
      'OTHER_INCOME', 'OTHER_EXPENSES', 'ZAKAT_TAX'
    )),
  ADD COLUMN IF NOT EXISTS statement_line_id uuid NULL,
  ADD COLUMN IF NOT EXISTS equity_line_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_accounts_statement_line'
  ) THEN
    ALTER TABLE acc.accounts
      ADD CONSTRAINT fk_accounts_statement_line
      FOREIGN KEY (statement_line_id, company_id)
      REFERENCES acc.statement_lines(id, company_id)
      ON DELETE SET NULL (statement_line_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_accounts_equity_line'
  ) THEN
    ALTER TABLE acc.accounts
      ADD CONSTRAINT fk_accounts_equity_line
      FOREIGN KEY (equity_line_id, company_id)
      REFERENCES acc.statement_lines(id, company_id)
      ON DELETE SET NULL (equity_line_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_accounts_statement_line
  ON acc.accounts (company_id, statement_line_id)
  WHERE statement_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_accounts_statement_section
  ON acc.accounts (company_id, statement_section)
  WHERE statement_section IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_accounts_equity_line
  ON acc.accounts (company_id, equity_line_id)
  WHERE equity_line_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Effective-Dated Reclassification Audit History
--    Preserves historical financial statement integrity across periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acc.account_reclassifications (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id              uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  account_id              uuid NOT NULL,
  effective_from          date NOT NULL DEFAULT CURRENT_DATE,
  old_statement_section   text NULL,
  new_statement_section   text NULL,
  old_statement_line_id   uuid NULL,
  new_statement_line_id   uuid NULL,
  old_equity_line_id      uuid NULL,
  new_equity_line_id      uuid NULL,
  old_cash_flow_category  text NULL,
  new_cash_flow_category  text NULL,
  reason                  text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  changed_by              uuid NULL,
  changed_at              timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, company_id) REFERENCES acc.accounts(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_account_reclass_lookup
  ON acc.account_reclassifications (company_id, account_id, effective_from DESC, changed_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Helper Function: Seed Default IFRS / SOCPA Statement Lines per Company
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acc.seed_default_statement_lines(p_company_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO acc.statement_lines
    (company_id, statement_type, section_code, code, name_ar, name_en, normal_sign, sort_order, is_system, description)
  VALUES
    -- Balance Sheet (قائمة المركز المالي)
    (p_company_id, 'BALANCE_SHEET', 'CURRENT_ASSETS', 'BS-CA', 'الأصول المتداولة', 'Current Assets', 1, 10, true, 'النقدية والبنوك والذمم المدينة والعهد والضرائب المدينة والمقدمات'),
    (p_company_id, 'BALANCE_SHEET', 'NON_CURRENT_ASSETS', 'BS-NCA', 'الأصول غير المتداولة', 'Non-Current Assets', 1, 20, true, 'الممتلكات والمعدات والأصول الثابتة بالصافي بعد مجمع الإهلاك'),
    (p_company_id, 'BALANCE_SHEET', 'CURRENT_LIABILITIES', 'BS-CL', 'الالتزامات المتداولة', 'Current Liabilities', -1, 30, true, 'الموردون والذمم الدائنة وضريبة القيمة المضافة والرواتب والزكاة المستحقة'),
    (p_company_id, 'BALANCE_SHEET', 'NON_CURRENT_LIABILITIES', 'BS-NCL', 'الالتزامات طويلة الأجل', 'Non-Current Liabilities', -1, 40, true, 'مخصص مكافأة نهاية الخدمة والقروض والالتزامات طويلة الأجل'),
    (p_company_id, 'BALANCE_SHEET', 'EQUITY', 'BS-EQ', 'حقوق الملكية', 'Shareholders Equity', -1, 50, true, 'رأس المال المدفوع والاحتياطيات والأرباح المبقاة'),

    -- Income Statement (قائمة الدخل)
    (p_company_id, 'INCOME_STATEMENT', 'REVENUE', 'IS-REV', 'الإيرادات التشغيلية', 'Operating Revenue', -1, 10, true, 'إيرادات العقود والمبيعات والخدمات الأساسية'),
    (p_company_id, 'INCOME_STATEMENT', 'COST_OF_SALES', 'IS-COS', 'تكلفة المبيعات والخدمات المباشرة', 'Cost of Sales / Direct Costs', 1, 20, true, 'الرواتب والتكاليف المباشرة المرتبطة بتقديم الخدمات والمشاريع'),
    (p_company_id, 'INCOME_STATEMENT', 'OPERATING_EXPENSES', 'IS-OPEX', 'المصروفات التشغيلية والإدارية', 'Operating & Administrative Expenses', 1, 30, true, 'المصروفات العمومية والإدارية والإهلاك وتكلفة الوقت غير المستغل'),
    (p_company_id, 'INCOME_STATEMENT', 'OTHER_INCOME', 'IS-OINC', 'الإيرادات الأخرى', 'Other Income', -1, 40, true, 'أرباح فروق العملات والإيرادات غير التشغيلية'),
    (p_company_id, 'INCOME_STATEMENT', 'OTHER_EXPENSES', 'IS-OEXP', 'المصروفات الأخرى', 'Other Expenses', 1, 50, true, 'خسائر فروق العملات والمصروفات غير التشغيلية'),
    (p_company_id, 'INCOME_STATEMENT', 'ZAKAT_TAX', 'IS-TAX', 'مصروف الزكاة الشرعية وضريبة الدخل', 'Zakat & Income Tax Expense', 1, 60, true, 'مخصص الزكاة الشرعية وضريبة الدخل للفترة'),

    -- Cash Flow Statement (قائمة التدفقات النقدية)
    (p_company_id, 'CASH_FLOW', 'OPERATING_ACTIVITIES', 'CF-OP', 'التدفقات النقدية من الأنشطة التشغيلية', 'Cash Flows from Operating Activities', 1, 10, true, 'التحصيلات من العملاء والمدفوعات للموردين والموظفين والمصروفات والضرائب'),
    (p_company_id, 'CASH_FLOW', 'INVESTING_ACTIVITIES', 'CF-INV', 'التدفقات النقدية من الأنشطة الاستثمارية', 'Cash Flows from Investing Activities', 1, 20, true, 'شراء وبيع الأصول الثابتة والمعدات والاستثمارات'),
    (p_company_id, 'CASH_FLOW', 'FINANCING_ACTIVITIES', 'CF-FIN', 'التدفقات النقدية من الأنشطة التمويلية', 'Cash Flows from Financing Activities', 1, 30, true, 'زيادة رأس المال والتوزيعات والقروض التمويلية'),
    (p_company_id, 'CASH_FLOW', 'CASH_EQUIVALENTS', 'CF-CASH', 'النقدية وما في حكمها', 'Cash & Cash Equivalents', 1, 40, true, 'الصناديق النقدية والحسابات البنكية الجارية'),

    -- Statement of Changes in Equity (قائمة التغيرات في حقوق الملكية)
    (p_company_id, 'EQUITY_CHANGES', 'PAID_IN_CAPITAL', 'EQ-CAP', 'رأس المال المدفوع', 'Paid-in Share Capital', -1, 10, true, 'رأس المال المصرح والمدفوع'),
    (p_company_id, 'EQUITY_CHANGES', 'STATUTORY_RESERVE', 'EQ-RES', 'الاحتياطي النظامي والاحتياطيات', 'Statutory & Other Reserves', -1, 20, true, 'الاحتياطي النظامي المقتطع من الأرباح'),
    (p_company_id, 'EQUITY_CHANGES', 'RETAINED_EARNINGS', 'EQ-RE', 'الأرباح المبقاة (المرحّلة)', 'Retained Earnings', -1, 30, true, 'الأرباح المتراكمة المرحلة من السنوات السابقة'),
    (p_company_id, 'EQUITY_CHANGES', 'DIVIDENDS_DISTRIBUTIONS', 'EQ-DIV', 'توزيعات الأرباح وجاري الشركاء', 'Dividends & Partner Drawings', -1, 40, true, 'التوزيعات المعتمدة والمسحوبات'),
    (p_company_id, 'EQUITY_CHANGES', 'OTHER_EQUITY', 'EQ-OTH', 'بنود حقوق ملكية أخرى', 'Other Equity Components', -1, 50, true, 'أي احتياطيات أو بنود حقوق ملكية أخرى')
  ON CONFLICT (company_id, code) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Idempotent Seed + Backfill Existing Companies & Accounts
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_comp RECORD;
BEGIN
  FOR v_comp IN SELECT id FROM core.companies LOOP
    PERFORM acc.seed_default_statement_lines(v_comp.id);

    -- Infer statement_section from account_class + subtype for existing accounts
    UPDATE acc.accounts a
       SET statement_section = CASE
             WHEN a.account_class = 'ASSET' AND a.subtype IN ('FIXED_ASSET', 'ACCUMULATED_DEPRECIATION') THEN 'NON_CURRENT_ASSETS'
             WHEN a.account_class = 'ASSET' THEN 'CURRENT_ASSETS'
             WHEN a.account_class = 'LIABILITY' AND (a.name_ar ILIKE '%نهاية الخدمة%' OR a.name_ar ILIKE '%طويلة الأجل%' OR a.code LIKE '22%' OR a.code = '20402') THEN 'NON_CURRENT_LIABILITIES'
             WHEN a.account_class = 'LIABILITY' THEN 'CURRENT_LIABILITIES'
             WHEN a.account_class = 'EQUITY' THEN 'EQUITY'
             WHEN a.account_class = 'REVENUE' THEN 'REVENUE'
             WHEN a.account_class = 'DIRECT_COST' THEN 'COST_OF_SALES'
             WHEN a.account_class = 'OPERATING_EXPENSE' AND (a.name_ar ILIKE '%زكاة%' OR a.code = '50501') THEN 'ZAKAT_TAX'
             WHEN a.account_class = 'OPERATING_EXPENSE' THEN 'OPERATING_EXPENSES'
             WHEN a.account_class = 'OTHER_INCOME' THEN 'OTHER_INCOME'
             WHEN a.account_class = 'OTHER_EXPENSE' THEN 'OTHER_EXPENSES'
             ELSE 'OPERATING_EXPENSES'
           END
     WHERE a.company_id = v_comp.id AND a.statement_section IS NULL;

    -- Link statement_line_id matching inferred statement_section
    UPDATE acc.accounts a
       SET statement_line_id = sl.id
      FROM acc.statement_lines sl
     WHERE a.company_id = v_comp.id
       AND sl.company_id = v_comp.id
       AND a.statement_line_id IS NULL
       AND sl.section_code = a.statement_section
       AND sl.statement_type IN ('BALANCE_SHEET', 'INCOME_STATEMENT');

    -- Link equity_line_id for EQUITY accounts
    UPDATE acc.accounts a
       SET equity_line_id = sl.id
      FROM acc.statement_lines sl
     WHERE a.company_id = v_comp.id
       AND sl.company_id = v_comp.id
       AND a.account_class = 'EQUITY'
       AND a.equity_line_id IS NULL
       AND sl.statement_type = 'EQUITY_CHANGES'
       AND sl.section_code = CASE
             WHEN a.subtype = 'RETAINED_EARNINGS' OR a.name_ar ILIKE '%أرباح مبقاة%' OR a.name_ar ILIKE '%مرحلة%' THEN 'RETAINED_EARNINGS'
             WHEN a.name_ar ILIKE '%احتياطي%' THEN 'STATUTORY_RESERVE'
             WHEN a.name_ar ILIKE '%توزيع%' OR a.name_ar ILIKE '%جاري%' THEN 'DIVIDENDS_DISTRIBUTIONS'
             WHEN a.name_ar ILIKE '%رأس المال%' OR a.code LIKE '301%' THEN 'PAID_IN_CAPITAL'
             ELSE 'OTHER_EQUITY'
           END;

    -- Infer cash_flow_category where NULL
    UPDATE acc.accounts a
       SET cash_flow_category = CASE
             WHEN a.subtype IN ('CASH', 'BANK') THEN 'CASH'
             WHEN a.subtype = 'ACCUMULATED_DEPRECIATION' THEN 'NON_CASH'
             WHEN a.subtype = 'FIXED_ASSET' THEN 'INVESTING'
             WHEN a.account_class = 'EQUITY' THEN 'FINANCING'
             WHEN a.statement_section = 'NON_CURRENT_LIABILITIES' AND a.name_ar ILIKE '%قرض%' THEN 'FINANCING'
             ELSE 'OPERATING'
           END
     WHERE a.company_id = v_comp.id AND a.cash_flow_category IS NULL;
  END LOOP;
END $$;
