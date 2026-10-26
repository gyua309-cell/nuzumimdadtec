-- =============================================================================
-- 0008  HR (employees, history, compensation), configurable cost components &
--       cost profiles, assets & employee custody
-- =============================================================================

-- Guard used by effective-dated financial master data: rows whose validity
-- overlaps a CLOSED/LOCKED period cannot be changed or deleted (history is frozen).
CREATE OR REPLACE FUNCTION core.assert_dates_open(p_company uuid, p_from date, p_to date) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM core.fiscal_periods
              WHERE company_id = p_company AND status IN ('CLOSED','LOCKED') AND NOT is_adjustment_period
                AND daterange(start_date, end_date, '[]') && daterange(p_from, COALESCE(p_to, 'infinity'::date), '[]')) THEN
    RAISE EXCEPTION 'HISTORY_LOCKED_BY_CLOSED_PERIOD' USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Generic trigger: effective-dated rows touching closed periods are frozen.
-- Allowed: closing an open-ended row (setting effective_to) when the new end date is in an open period.
CREATE OR REPLACE FUNCTION core.trg_effective_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM core.assert_dates_open(NEW.company_id, NEW.effective_from, NEW.effective_to);
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM core.assert_dates_open(OLD.company_id, OLD.effective_from, OLD.effective_to);
    RETURN OLD;
  END IF;
  -- UPDATE: only effective_to may move, and only within open periods
  IF (to_jsonb(NEW) - ARRAY['effective_to','updated_at','updated_by','row_version'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['effective_to','updated_at','updated_by','row_version']) THEN
    PERFORM core.assert_dates_open(OLD.company_id, OLD.effective_from, OLD.effective_to);
  ELSIF NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
    PERFORM core.assert_dates_open(NEW.company_id,
      LEAST(COALESCE(NEW.effective_to, 'infinity'::date), COALESCE(OLD.effective_to, 'infinity'::date)) + 1,
      GREATEST(COALESCE(NEW.effective_to, 'infinity'::date), COALESCE(OLD.effective_to, 'infinity'::date)));
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Positions & employees
-- ---------------------------------------------------------------------------
CREATE TABLE hr.positions (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  code        text NOT NULL,
  title_ar    text NOT NULL,
  title_en    text NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id)
);

CREATE TABLE hr.employees (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL REFERENCES core.companies(id),
  code                 text NOT NULL,
  full_name_ar         text NOT NULL,
  full_name_en         text NULL,
  national_id          text NULL,
  email                citext NULL,
  phone                text NULL,
  birth_date           date NULL,
  gender               text NULL CHECK (gender IN ('MALE','FEMALE')),
  hire_date            date NOT NULL,
  termination_date     date NULL,
  status               text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_LEAVE','SUSPENDED','TERMINATED')),
  employment_type      text NOT NULL DEFAULT 'FULL_TIME' CHECK (employment_type IN ('FULL_TIME','PART_TIME','CONTRACTOR')),
  is_billable_resource boolean NOT NULL DEFAULT true,
  required_margin_pct  numeric(9,4) NULL CHECK (required_margin_pct IS NULL OR required_margin_pct BETWEEN -100 AND 1000),
  work_calendar_id     uuid NULL REFERENCES core.work_calendars(id),
  bank_name            text NULL,
  bank_account_no      text NULL,
  iban                 text NULL,
  notes                text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  CHECK (termination_date IS NULL OR termination_date >= hire_date),
  CHECK ((status = 'TERMINATED') = (termination_date IS NOT NULL))
);
CREATE INDEX ix_employees_name ON hr.employees USING gin (full_name_ar gin_trgm_ops);
CREATE INDEX ix_employees_status ON hr.employees (company_id, status);

CREATE TABLE hr.employee_status_history (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  employee_id    uuid NOT NULL,
  old_status     text NULL,
  new_status     text NOT NULL,
  effective_date date NOT NULL,
  reason         text NOT NULL,
  changed_by     uuid NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id)
);
CREATE OR REPLACE FUNCTION hr.trg_status_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- allowed only while purging a mistaken employee record (service checks: no financial footprint)
  IF TG_OP = 'DELETE' AND current_setting('app.purge_employee', true) = OLD.employee_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'HISTORY_IMMUTABLE' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER a_status_history_immutable BEFORE UPDATE OR DELETE ON hr.employee_status_history
  FOR EACH ROW EXECUTE FUNCTION hr.trg_status_history_guard();

-- Placement history (branch / department / position / cost center), effective dated
CREATE TABLE hr.employee_job_assignments (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  employee_id    uuid NOT NULL,
  branch_id      uuid NULL,
  department_id  uuid NULL,
  position_id    uuid NULL,
  cost_center_id uuid NULL,
  manager_employee_id uuid NULL,
  effective_from date NOT NULL,
  effective_to   date NULL,
  change_reason  text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (employee_id, company_id)    REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (branch_id, company_id)      REFERENCES core.branches(id, company_id),
  FOREIGN KEY (department_id, company_id)  REFERENCES core.departments(id, company_id),
  FOREIGN KEY (position_id, company_id)    REFERENCES hr.positions(id, company_id),
  FOREIGN KEY (cost_center_id, company_id) REFERENCES core.cost_centers(id, company_id),
  FOREIGN KEY (manager_employee_id, company_id) REFERENCES hr.employees(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

-- Salary history: a change is a NEW row; historical rows never change (closed periods)
CREATE TABLE hr.employee_compensations (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id         uuid NOT NULL,
  employee_id        uuid NOT NULL,
  basic_salary       numeric(20,4) NOT NULL CHECK (basic_salary >= 0),
  salary_currency    char(3) NOT NULL REFERENCES core.currencies(code),
  insurance_salary   numeric(20,4) NOT NULL DEFAULT 0 CHECK (insurance_salary >= 0),
  insurance_currency char(3) NOT NULL REFERENCES core.currencies(code),
  effective_from     date NOT NULL,
  effective_to       date NULL,
  change_reason      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

CREATE TABLE hr.employee_documents (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id   uuid NOT NULL,
  employee_id  uuid NOT NULL,
  doc_type     text NOT NULL CHECK (doc_type IN ('ID','PASSPORT','CONTRACT','CERTIFICATE','INSURANCE','MEDICAL','OTHER')),
  title        text NOT NULL,
  doc_number   text NULL,
  issue_date   date NULL,
  expiry_date  date NULL,
  file_name    text NULL,
  mime_type    text NULL,
  size_bytes   int  NULL CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 10485760),
  sha256       text NULL,
  notes        text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date)
);
CREATE TABLE hr.employee_document_files (
  document_id uuid PRIMARY KEY REFERENCES hr.employee_documents(id) ON DELETE CASCADE,
  content     bytea NOT NULL
);

-- ---------------------------------------------------------------------------
-- Configurable cost components (nothing hard-coded)
-- ---------------------------------------------------------------------------
CREATE TABLE hr.cost_components (
  id                      uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id              uuid NOT NULL REFERENCES core.companies(id),
  code                    text NOT NULL,
  name_ar                 text NOT NULL,
  name_en                 text NULL,
  component_type          text NOT NULL CHECK (component_type IN ('SALARY','INSURANCE','MEDICAL','DEPRECIATION','COMPANY_COST',
                            'BENEFIT','ALLOWANCE','TAX','OTHER')),
  nature                  text NOT NULL CHECK (nature IN ('EARNING','EMPLOYER_CONTRIB','EMPLOYEE_DEDUCTION','ACCRUAL',
                            'DEPRECIATION','NOTIONAL','TAX')),
  calc_method             text NOT NULL CHECK (calc_method IN ('BASIC_SALARY','FIXED','PCT_BASIC','PCT_INSURANCE','PCT_GROSS','FROM_ASSETS')),
  cost_behavior           text NOT NULL DEFAULT 'FIXED' CHECK (cost_behavior IN ('FIXED','VARIABLE')),
  profitability_treatment text NOT NULL DEFAULT 'DISTRIBUTE' CHECK (profitability_treatment IN ('DISTRIBUTE','EXCLUDE')),
  posting_treatment       text NOT NULL CHECK (posting_treatment IN ('PAYROLL','ACCRUAL','DEPRECIATION_SOURCE','NOTIONAL','NONE')),
  tax_treatment           text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (tax_treatment IN ('TAXABLE','EXEMPT','PARTIAL','NOT_APPLICABLE')),
  taxable_pct             numeric(9,4) NULL CHECK (taxable_pct IS NULL OR taxable_pct BETWEEN 0 AND 100),
  affects_net_pay         boolean NOT NULL DEFAULT false,
  expense_account_id      uuid NULL,
  liability_account_id    uuid NULL,
  sort_order              int NOT NULL DEFAULT 100,
  effective_from          date NOT NULL,
  effective_to            date NULL,
  is_active               boolean NOT NULL DEFAULT true,
  description             text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (expense_account_id, company_id)   REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (liability_account_id, company_id) REFERENCES acc.accounts(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (tax_treatment <> 'PARTIAL' OR taxable_pct IS NOT NULL),
  -- a component that produces profitability cost must say where it is expensed
  CHECK (posting_treatment = 'NONE' OR nature = 'EMPLOYEE_DEDUCTION' OR expense_account_id IS NOT NULL OR nature = 'TAX')
);

CREATE TABLE hr.cost_profiles (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  code        text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text NULL,
  description text NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id)
);

CREATE TABLE hr.cost_profile_components (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  profile_id     uuid NOT NULL,
  component_id   uuid NOT NULL,
  rate_pct       numeric(9,4) NULL CHECK (rate_pct IS NULL OR rate_pct >= 0),
  amount         numeric(20,4) NULL CHECK (amount IS NULL OR amount >= 0),
  currency_code  char(3) NULL REFERENCES core.currencies(code),
  min_amount     numeric(20,4) NULL,
  max_amount     numeric(20,4) NULL,
  effective_from date NOT NULL,
  effective_to   date NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (profile_id, company_id)   REFERENCES hr.cost_profiles(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (component_id, company_id) REFERENCES hr.cost_components(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (amount IS NULL OR currency_code IS NOT NULL),
  CHECK (min_amount IS NULL OR max_amount IS NULL OR max_amount >= min_amount),
  EXCLUDE USING gist (profile_id WITH =, component_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

CREATE TABLE hr.employee_cost_profiles (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  employee_id    uuid NOT NULL,
  profile_id     uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to   date NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (profile_id, company_id)  REFERENCES hr.cost_profiles(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

CREATE TABLE hr.employee_component_overrides (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL,
  employee_id    uuid NOT NULL,
  component_id   uuid NOT NULL,
  rate_pct       numeric(9,4) NULL CHECK (rate_pct IS NULL OR rate_pct >= 0),
  amount         numeric(20,4) NULL CHECK (amount IS NULL OR amount >= 0),
  currency_code  char(3) NULL REFERENCES core.currencies(code),
  is_excluded    boolean NOT NULL DEFAULT false,
  reason         text NOT NULL,
  effective_from date NOT NULL,
  effective_to   date NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (employee_id, company_id)  REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (component_id, company_id) REFERENCES hr.cost_components(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (amount IS NULL OR currency_code IS NOT NULL),
  EXCLUDE USING gist (employee_id WITH =, component_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

-- ---------------------------------------------------------------------------
-- Assets & custody
-- ---------------------------------------------------------------------------
CREATE TABLE ast.asset_categories (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL REFERENCES core.companies(id),
  code                 text NOT NULL,
  name_ar              text NOT NULL,
  name_en              text NULL,
  asset_account_id     uuid NOT NULL,
  accum_account_id     uuid NOT NULL,
  expense_account_id   uuid NOT NULL,
  default_useful_life_months int NULL CHECK (default_useful_life_months IS NULL OR default_useful_life_months > 0),
  default_method       text NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (default_method IN ('STRAIGHT_LINE','DECLINING_BALANCE')),
  include_in_employee_cost boolean NOT NULL DEFAULT true,
  is_active            boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (asset_account_id, company_id)   REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (accum_account_id, company_id)   REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (expense_account_id, company_id) REFERENCES acc.accounts(id, company_id)
);

CREATE TABLE ast.assets (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id          uuid NOT NULL REFERENCES core.companies(id),
  asset_no            text NOT NULL,
  name                text NOT NULL,
  category_id         uuid NOT NULL,
  asset_kind          text NOT NULL DEFAULT 'EQUIPMENT' CHECK (asset_kind IN ('LAPTOP','DEVICE','EQUIPMENT','VEHICLE','FURNITURE','OTHER')),
  serial_no           text NULL,
  purchase_date       date NOT NULL,
  acquisition_cost    numeric(20,4) NOT NULL CHECK (acquisition_cost > 0),
  currency_code       char(3) NOT NULL REFERENCES core.currencies(code),
  exchange_rate       numeric(20,10) NOT NULL CHECK (exchange_rate > 0),
  cost_base           numeric(20,4) NOT NULL CHECK (cost_base > 0),
  residual_value_base numeric(20,4) NOT NULL DEFAULT 0 CHECK (residual_value_base >= 0),
  useful_life_months  int NOT NULL CHECK (useful_life_months > 0),
  depreciation_method text NOT NULL DEFAULT 'STRAIGHT_LINE' CHECK (depreciation_method IN ('STRAIGHT_LINE','DECLINING_BALANCE')),
  declining_rate_pct  numeric(9,4) NULL,
  depreciation_start  date NOT NULL,
  depreciation_end    date NOT NULL,
  status              text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','FULLY_DEPRECIATED','DISPOSED')),
  disposal_date       date NULL,
  branch_id           uuid NULL,
  cost_center_id      uuid NULL,
  acquisition_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  notes               text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, asset_no),
  UNIQUE (id, company_id),
  FOREIGN KEY (category_id, company_id)    REFERENCES ast.asset_categories(id, company_id),
  FOREIGN KEY (branch_id, company_id)      REFERENCES core.branches(id, company_id),
  FOREIGN KEY (cost_center_id, company_id) REFERENCES core.cost_centers(id, company_id),
  CHECK (residual_value_base < cost_base),
  CHECK (depreciation_end > depreciation_start),
  CHECK (depreciation_start >= purchase_date),
  CHECK (depreciation_method <> 'DECLINING_BALANCE' OR declining_rate_pct > 0),
  CHECK (status <> 'DISPOSED' OR disposal_date IS NOT NULL)
);

-- Financial attributes are frozen once the asset is active (corrections via adjustment)
CREATE OR REPLACE FUNCTION ast.trg_asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'ASSET_NOT_DRAFT' USING ERRCODE = 'P0001'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (
       NEW.acquisition_cost IS DISTINCT FROM OLD.acquisition_cost OR NEW.cost_base IS DISTINCT FROM OLD.cost_base
    OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate OR NEW.residual_value_base IS DISTINCT FROM OLD.residual_value_base
    OR NEW.useful_life_months IS DISTINCT FROM OLD.useful_life_months OR NEW.depreciation_method IS DISTINCT FROM OLD.depreciation_method
    OR NEW.depreciation_start IS DISTINCT FROM OLD.depreciation_start OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.currency_code IS DISTINCT FROM OLD.currency_code) THEN
    RAISE EXCEPTION 'ASSET_FINANCIALS_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_asset_guard BEFORE UPDATE OR DELETE ON ast.assets FOR EACH ROW EXECUTE FUNCTION ast.trg_asset_guard();

-- Employee custody of assets (laptops, devices...), never overlapping per asset
CREATE TABLE ast.asset_custodies (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id   uuid NOT NULL,
  asset_id     uuid NOT NULL,
  employee_id  uuid NOT NULL,
  effective_from date NOT NULL,
  effective_to   date NULL,
  notes        text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (asset_id, company_id)    REFERENCES ast.assets(id, company_id),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (asset_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

-- ---------------------------------------------------------------------------
-- Pending cross-module foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE acc.journal_lines
  ADD CONSTRAINT fk_jl_employee FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  ADD CONSTRAINT fk_jl_asset    FOREIGN KEY (asset_id, company_id)    REFERENCES ast.assets(id, company_id);
ALTER TABLE core.departments
  ADD CONSTRAINT fk_dept_manager FOREIGN KEY (manager_employee_id, company_id) REFERENCES hr.employees(id, company_id);
ALTER TABLE iam.users ADD CONSTRAINT fk_user_employee FOREIGN KEY (employee_id) REFERENCES hr.employees(id);

-- ---------------------------------------------------------------------------
-- Triggers: touch, history freeze, audit (sensitive columns masked)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hr.positions','hr.employees','hr.employee_job_assignments','hr.employee_compensations',
                           'hr.employee_documents','hr.cost_components','hr.cost_profiles','hr.cost_profile_components',
                           'hr.employee_cost_profiles','hr.employee_component_overrides','ast.asset_categories',
                           'ast.assets','ast.asset_custodies'] LOOP
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hr.employee_job_assignments','hr.employee_compensations','hr.cost_profile_components',
                           'hr.employee_cost_profiles','hr.employee_component_overrides','ast.asset_custodies'] LOOP
    EXECUTE format('CREATE TRIGGER b_history_guard BEFORE INSERT OR UPDATE OR DELETE ON %s
                    FOR EACH ROW EXECUTE FUNCTION core.trg_effective_history_guard()', t);
  END LOOP;
END $$;

SELECT audit.enable('hr.positions');
SELECT audit.enable('hr.employees', 'national_id', 'bank_account_no', 'iban');
SELECT audit.enable('hr.employee_status_history');
SELECT audit.enable('hr.employee_job_assignments');
SELECT audit.enable('hr.employee_compensations');
SELECT audit.enable('hr.employee_documents');
SELECT audit.enable('hr.cost_components');
SELECT audit.enable('hr.cost_profiles');
SELECT audit.enable('hr.cost_profile_components');
SELECT audit.enable('hr.employee_cost_profiles');
SELECT audit.enable('hr.employee_component_overrides');
SELECT audit.enable('ast.asset_categories');
SELECT audit.enable('ast.assets');
SELECT audit.enable('ast.asset_custodies');
