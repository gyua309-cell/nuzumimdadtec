-- 0013_business_process_enhancements.sql
-- Enhancements for Business Process compliance:
-- 1. Retroactive revenue adjustments (original period tracking + reason)
-- 2. Company Overhead policies (Percentage or Fixed for 3-tier profitability)
-- 3. Expanded permissions for adjustments and overhead management

ALTER TABLE rev.revenue_lines ADD COLUMN IF NOT EXISTS original_period_id uuid REFERENCES core.fiscal_periods(id);
ALTER TABLE rev.revenue_lines ADD COLUMN IF NOT EXISTS adjustment_reason text;

CREATE INDEX IF NOT EXISTS idx_rev_orig_period ON rev.revenue_lines(original_period_id);

-- Company-wide Overhead Policy for Profitability calculations
CREATE TABLE IF NOT EXISTS rev.overhead_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES core.companies(id) UNIQUE,
  method text NOT NULL DEFAULT 'PERCENTAGE' CHECK (method IN ('PERCENTAGE', 'FIXED_PER_EMPLOYEE', 'FIXED_PER_PROJECT')),
  rate numeric(10,4) NOT NULL DEFAULT 15.00,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES iam.users(id),
  updated_by uuid REFERENCES iam.users(id)
);

-- Register Permissions using iam.def_perms
SELECT iam.def_perms('rev', 'adjustment', ARRAY['view', 'create', 'approve', 'cancel'], 'تسويات الإيرادات بأثر رجعي', 'Retroactive Revenue Adjustments');
SELECT iam.def_perms('rev', 'overhead', ARRAY['view', 'create', 'edit'], 'سياسة المصروفات العمومية', 'Overhead Policy');
