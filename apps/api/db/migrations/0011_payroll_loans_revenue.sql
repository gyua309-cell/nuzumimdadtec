-- ============================================================
-- 0011_payroll_loans_revenue.sql
-- Payroll variables, loans, overtime, revenue engine
-- ============================================================

BEGIN;

-- ============================================================
-- PAYROLL / MONTHLY VARIABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS pay.variable_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES core.companies(id),
  code            text NOT NULL,
  name_ar         text NOT NULL,
  name_en         text,
  category        text NOT NULL CHECK (category IN ('BONUS','OVERTIME','REWARD','ALLOWANCE','DEDUCTION','ADVANCE','OTHER')),
  calc_method     text NOT NULL CHECK (calc_method IN ('FIXED','HOURS_RATE','DAYS_RATE','PCT_BASIC')),
  default_amount  numeric(18,4),
  default_rate    numeric(18,4),
  default_multiplier numeric(8,4),
  is_taxable      boolean NOT NULL DEFAULT false,
  affects_profitability boolean NOT NULL DEFAULT true,
  debit_account_id  uuid REFERENCES acc.accounts(id),
  credit_account_id uuid REFERENCES acc.accounts(id),
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES iam.users(id),
  updated_by      uuid REFERENCES iam.users(id),
  row_version     integer NOT NULL DEFAULT 1,
  UNIQUE (company_id, code)
);

-- Monthly variable lines (one row per employee per month per variable type)
CREATE TABLE IF NOT EXISTS pay.monthly_variables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES core.companies(id),
  fiscal_period_id uuid NOT NULL REFERENCES core.fiscal_periods(id),
  employee_id     uuid NOT NULL REFERENCES hr.employees(id),
  variable_type_id uuid NOT NULL REFERENCES pay.variable_types(id),
  project_id      uuid REFERENCES prj.projects(id),   -- NULL = general, NOT NULL = project-linked
  amount          numeric(18,4),                       -- for FIXED / result storage
  hours           numeric(10,4),                       -- for HOURS_RATE
  days            numeric(10,4),                       -- for DAYS_RATE
  rate            numeric(18,4),                       -- override rate
  multiplier      numeric(8,4),                        -- override multiplier
  computed_amount numeric(18,4) NOT NULL,              -- final computed base-currency amount
  currency_code   char(3) NOT NULL DEFAULT 'SAR',
  exchange_rate   numeric(20,10) NOT NULL DEFAULT 1,
  notes           text,
  status          text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','POSTED','CANCELLED')),
  approved_by     uuid REFERENCES iam.users(id),
  approved_at     timestamptz,
  journal_entry_id uuid REFERENCES acc.journal_entries(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES iam.users(id),
  updated_by      uuid REFERENCES iam.users(id),
  row_version     integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_mv_company_period ON pay.monthly_variables(company_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_mv_employee ON pay.monthly_variables(employee_id);

-- ============================================================
-- EMPLOYEE LOANS / SALARY ADVANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS pay.loans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES core.companies(id),
  employee_id       uuid NOT NULL REFERENCES hr.employees(id),
  loan_no           text NOT NULL,
  reason            text NOT NULL,
  principal_amount  numeric(18,4) NOT NULL CHECK (principal_amount > 0),
  currency_code     char(3) NOT NULL,
  exchange_rate     numeric(20,10) NOT NULL DEFAULT 1,
  principal_base    numeric(18,4) NOT NULL,
  installments      integer NOT NULL CHECK (installments > 0),
  installment_amount numeric(18,4) NOT NULL,
  start_period_id   uuid NOT NULL REFERENCES core.fiscal_periods(id),
  status            text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SETTLED','CANCELLED')),
  settled_at        timestamptz,
  cancelled_at      timestamptz,
  cancel_reason     text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES iam.users(id),
  updated_by        uuid REFERENCES iam.users(id),
  row_version       integer NOT NULL DEFAULT 1,
  UNIQUE (company_id, loan_no)
);

CREATE TABLE IF NOT EXISTS pay.loan_installments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id         uuid NOT NULL REFERENCES pay.loans(id) ON DELETE CASCADE,
  installment_no  integer NOT NULL,
  fiscal_period_id uuid NOT NULL REFERENCES core.fiscal_periods(id),
  due_amount      numeric(18,4) NOT NULL,
  paid_amount     numeric(18,4) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DEDUCTED','POSTPONED','WAIVED')),
  deducted_at     timestamptz,
  postponed_to_period_id uuid REFERENCES core.fiscal_periods(id),
  postpone_reason text,
  postponed_by    uuid REFERENCES iam.users(id),
  postponed_at    timestamptz,
  journal_entry_id uuid REFERENCES acc.journal_entries(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, installment_no)
);
CREATE INDEX IF NOT EXISTS idx_loan_inst_period ON pay.loan_installments(fiscal_period_id);

-- ============================================================
-- PAYROLL RUN (monthly close for payroll)
-- ============================================================
CREATE TABLE IF NOT EXISTS pay.payroll_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES core.companies(id),
  run_no            serial,
  fiscal_period_id  uuid NOT NULL REFERENCES core.fiscal_periods(id),
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PROCESSING','POSTED','CANCELLED')),
  total_salary_base numeric(18,4),
  total_variables_base numeric(18,4),
  total_deductions_base numeric(18,4),
  total_loan_deductions_base numeric(18,4),
  net_payable_base  numeric(18,4),
  journal_entry_id  uuid REFERENCES acc.journal_entries(id),
  posted_at         timestamptz,
  cancel_reason     text,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES iam.users(id),
  updated_by        uuid REFERENCES iam.users(id),
  row_version       integer NOT NULL DEFAULT 1,
  UNIQUE (company_id, fiscal_period_id)  -- one run per period
);

CREATE TABLE IF NOT EXISTS pay.payroll_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES pay.payroll_runs(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL REFERENCES hr.employees(id),
  -- base salary this period (prorated if partial)
  salary_base       numeric(18,4) NOT NULL DEFAULT 0,
  insurance_base    numeric(18,4) NOT NULL DEFAULT 0,
  -- variables
  bonuses_base      numeric(18,4) NOT NULL DEFAULT 0,
  overtime_base     numeric(18,4) NOT NULL DEFAULT 0,
  allowances_base   numeric(18,4) NOT NULL DEFAULT 0,
  deductions_base   numeric(18,4) NOT NULL DEFAULT 0,
  loan_deductions_base numeric(18,4) NOT NULL DEFAULT 0,
  -- totals
  gross_base        numeric(18,4) NOT NULL DEFAULT 0,
  net_payable_base  numeric(18,4) NOT NULL DEFAULT 0,
  notes             text,
  UNIQUE (run_id, employee_id)
);

-- ============================================================
-- REVENUE ENGINE
-- ============================================================
CREATE TABLE IF NOT EXISTS rev.revenue_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES core.companies(id),
  fiscal_period_id  uuid NOT NULL REFERENCES core.fiscal_periods(id),
  employee_id       uuid NOT NULL REFERENCES hr.employees(id),
  project_id        uuid NOT NULL REFERENCES prj.projects(id),
  assignment_id     uuid REFERENCES prj.assignments(id),
  service_price_id  uuid REFERENCES prj.service_prices(id),
  -- what was the price used
  pricing_basis     text NOT NULL CHECK (pricing_basis IN ('MONTHLY','DAILY','HOURLY')),
  unit_price        numeric(18,4) NOT NULL,
  currency_code     char(3) NOT NULL,
  exchange_rate     numeric(20,10) NOT NULL DEFAULT 1,
  -- quantity
  units             numeric(12,4) NOT NULL,     -- months/days/hours
  allocation_pct    numeric(8,4) NOT NULL,       -- effective % used
  -- results
  gross_revenue     numeric(18,4) NOT NULL,      -- in original currency
  gross_revenue_base numeric(18,4) NOT NULL,     -- in base currency
  -- classification
  revenue_type      text NOT NULL DEFAULT 'NORMAL' CHECK (revenue_type IN ('NORMAL','RETROACTIVE','ADJUSTMENT')),
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','REVERSED','CANCELLED')),
  journal_entry_id  uuid REFERENCES acc.journal_entries(id),
  reversal_id       uuid REFERENCES rev.revenue_lines(id),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES iam.users(id),
  updated_by        uuid REFERENCES iam.users(id)
);
CREATE INDEX IF NOT EXISTS idx_rev_company_period ON rev.revenue_lines(company_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_rev_project ON rev.revenue_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_rev_employee ON rev.revenue_lines(employee_id);

-- Revenue run (monthly posting of all revenue lines)
CREATE TABLE IF NOT EXISTS rev.revenue_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES core.companies(id),
  run_no            serial,
  fiscal_period_id  uuid NOT NULL REFERENCES core.fiscal_periods(id),
  status            text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  total_revenue_base numeric(18,4),
  journal_entry_id  uuid REFERENCES acc.journal_entries(id),
  posted_at         timestamptz,
  cancel_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES iam.users(id),
  updated_by        uuid REFERENCES iam.users(id),
  UNIQUE (company_id, fiscal_period_id)
);

-- ============================================================
-- PROFITABILITY SNAPSHOT (per project per period)
-- ============================================================
CREATE TABLE IF NOT EXISTS rpt.project_profitability (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES core.companies(id),
  fiscal_period_id      uuid NOT NULL REFERENCES core.fiscal_periods(id),
  project_id            uuid NOT NULL REFERENCES prj.projects(id),
  -- revenue
  revenue_base          numeric(18,4) NOT NULL DEFAULT 0,
  -- costs
  direct_cost_base      numeric(18,4) NOT NULL DEFAULT 0,   -- employee salaries + assets + variables
  overhead_base         numeric(18,4) NOT NULL DEFAULT 0,    -- allocated overhead
  total_cost_base       numeric(18,4) NOT NULL DEFAULT 0,
  -- margin
  gross_profit_base     numeric(18,4) NOT NULL DEFAULT 0,
  gross_margin_pct      numeric(10,4),                        -- null if revenue=0
  required_margin_pct   numeric(10,4),                        -- from project
  margin_gap_pct        numeric(10,4),                        -- gross_margin - required_margin
  meets_target          boolean,
  -- metadata
  computed_at           timestamptz NOT NULL DEFAULT now(),
  is_final              boolean NOT NULL DEFAULT false,         -- true after period close
  created_by            uuid REFERENCES iam.users(id),
  UNIQUE (company_id, fiscal_period_id, project_id)
);

-- ============================================================
-- POSTING RULE EVENTS for new modules
-- ============================================================
INSERT INTO acc.posting_events (code, module, description_ar, description_en, amount_keys, account_sources)
VALUES
  ('PAY.SALARY',      'pay', 'صرف الرواتب الشهرية',     'Monthly Salary Payment',       ARRAY['gross','net','insurance'], ARRAY[]::text[]),
  ('PAY.VARIABLE',    'pay', 'متغيرات الرواتب',          'Payroll Variables',             ARRAY['amount'],                   ARRAY[]::text[]),
  ('PAY.LOAN_ISSUE',  'pay', 'منح قرض أو سلفة',          'Employee Loan Issuance',        ARRAY['principal'],                ARRAY[]::text[]),
  ('PAY.LOAN_DEDUCT', 'pay', 'خصم قسط القرض',            'Loan Installment Deduction',    ARRAY['amount'],                   ARRAY[]::text[]),
  ('REV.RECOGNIZE',   'rev', 'الاعتراف بإيراد الخدمات', 'Revenue Recognition',           ARRAY['revenue'],                  ARRAY[]::text[]),
  ('OVH.ALLOCATE',    'cst', 'توزيع المصاريف العامة',    'Overhead Allocation',           ARRAY['amount'],                   ARRAY[]::text[])
ON CONFLICT (code) DO NOTHING;

COMMIT;
