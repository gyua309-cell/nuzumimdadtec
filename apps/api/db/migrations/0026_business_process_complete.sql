-- Business Process Completeness: Project-linked Additional Pay category & Section 29 Direct Result Adjustments
-- 1. Extend pay.variable_types.category CHECK constraint to include ADDITIONAL_PAY
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'pay.variable_types'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%category%';
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pay.variable_types DROP CONSTRAINT %I', v_con);
  END IF;
  ALTER TABLE pay.variable_types
    ADD CONSTRAINT variable_types_category_check
    CHECK (category IN ('BONUS','OVERTIME','ADDITIONAL_PAY','REWARD','ALLOWANCE','DEDUCTION','ADVANCE','OTHER'));
END $$;

-- 2. Extend rev.revenue_lines for Section 29 Direct Result Adjustments (REVENUE | DIRECT_COST | OVERHEAD)
ALTER TABLE rev.revenue_lines ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE rev.revenue_lines ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE rev.revenue_lines
  ADD COLUMN IF NOT EXISTS adjustment_kind text NOT NULL DEFAULT 'RETROACTIVE_REVENUE'
  CHECK (adjustment_kind IN ('RETROACTIVE_REVENUE','REVENUE','DIRECT_COST','OVERHEAD'));
