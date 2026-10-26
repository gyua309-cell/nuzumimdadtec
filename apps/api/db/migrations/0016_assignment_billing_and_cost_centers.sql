-- =============================================================================
-- 0016  Assignment Client Billing Rates, Multi-Cost Center Linkage & Auto Journals
-- =============================================================================

-- 1. Add Billing Rates, Client and Cost Center to prj.assignments
ALTER TABLE prj.assignments 
  ADD COLUMN IF NOT EXISTS billable_rate numeric(20,4),
  ADD COLUMN IF NOT EXISTS billing_basis text DEFAULT 'DAILY' CHECK (billing_basis IN ('DAILY', 'HOURLY', 'MONTHLY')),
  ADD COLUMN IF NOT EXISTS billing_currency char(3) DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES prj.clients(id),
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES core.cost_centers(id);

CREATE INDEX IF NOT EXISTS ix_assignments_client ON prj.assignments (company_id, client_id);
CREATE INDEX IF NOT EXISTS ix_assignments_cost_center ON prj.assignments (company_id, cost_center_id);

-- 2. Populate client_id and cost_center_id from parent project for existing assignments
UPDATE prj.assignments a
SET client_id = p.client_id,
    cost_center_id = p.cost_center_id
FROM prj.projects p
WHERE p.id = a.project_id
  AND (a.client_id IS NULL OR a.cost_center_id IS NULL);

-- 3. Ensure Chart of Accounts has Project Cost Absorption, Revenue and Bench Accounts
DO $$
DECLARE
  comp RECORD;
  parent_exp_id uuid;
  parent_rev_id uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    SELECT id INTO parent_exp_id FROM acc.accounts WHERE company_id = comp.id AND code = '5';
    SELECT id INTO parent_rev_id FROM acc.accounts WHERE company_id = comp.id AND code = '4';

    -- 4110: Project Services Revenue
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '4110') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '4110', 'إيرادات خدمات البرمجيات وتطوير الحلول الرقمية', 'Software & Digital Solutions Revenue', 'REVENUE', 'CREDIT', parent_rev_id, true);
    END IF;

    -- 5150: Direct Project Staffing Costs (WIP)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5150') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5150', 'تكاليف مشاريع مباشرة - تشغيل كوادر ومطورين', 'Direct Project Staffing Costs', 'OPERATING_EXPENSE', 'DEBIT', parent_exp_id, true);
    END IF;

    -- 5159: Salary Cost Absorption
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5159') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5159', 'استيعاب تكاليف رواتب المشاريع (حساب مقابل)', 'Salary Cost Absorption', 'OPERATING_EXPENSE', 'CREDIT', parent_exp_id, true);
    END IF;

    -- 5180: Bench Idle Capacity Cost
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5180') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5180', 'تكلفة طاقات المطورين غير المستغلة (Bench Waste)', 'Bench Idle Capacity Waste', 'OPERATING_EXPENSE', 'DEBIT', parent_exp_id, true);
    END IF;
  END LOOP;
END $$;
