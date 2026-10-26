-- =============================================================================
-- 0003  Core: currencies, companies, branches, departments, cost centers,
--       fiscal years & periods, exchange rates, work calendars, taxes
-- =============================================================================

-- Standard audit columns are repeated explicitly per table (clear DDL, no magic).

CREATE TABLE core.currencies (
  code           char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name_ar        text NOT NULL,
  name_en        text NOT NULL,
  symbol         text NULL,
  decimal_places smallint NOT NULL DEFAULT 2 CHECK (decimal_places BETWEEN 0 AND 4),
  is_active      boolean NOT NULL DEFAULT true
);

CREATE TABLE core.companies (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{2,20}$'),
  name_ar            text NOT NULL,
  name_en            text NULL,
  legal_name         text NULL,
  tax_number         text NULL,
  commercial_reg     text NULL,
  address            text NULL,
  country_code       char(2) NULL,
  timezone           text NOT NULL DEFAULT 'Africa/Cairo',
  base_currency_code char(3) NOT NULL REFERENCES core.currencies(code),
  fiscal_year_start_month smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  is_active          boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1
);

CREATE TABLE core.company_currencies (
  company_id    uuid NOT NULL REFERENCES core.companies(id),
  currency_code char(3) NOT NULL REFERENCES core.currencies(code),
  PRIMARY KEY (company_id, currency_code)
);

CREATE TABLE core.branches (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  code        text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text NULL,
  address     text NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id)
);

CREATE TABLE core.cost_centers (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  parent_id   uuid NULL REFERENCES core.cost_centers(id),
  code        text NOT NULL,
  name_ar     text NOT NULL,
  name_en     text NULL,
  cc_type     text NOT NULL DEFAULT 'DIRECT' CHECK (cc_type IN ('DIRECT','INDIRECT','ADMIN')),
  is_posting  boolean NOT NULL DEFAULT true,
  is_active   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE core.departments (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id         uuid NOT NULL REFERENCES core.companies(id),
  branch_id          uuid NULL,
  parent_id          uuid NULL REFERENCES core.departments(id),
  code               text NOT NULL,
  name_ar            text NOT NULL,
  name_en            text NULL,
  manager_employee_id uuid NULL,             -- FK added by HR migration
  default_cost_center_id uuid NULL,
  is_active          boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (branch_id, company_id) REFERENCES core.branches(id, company_id),
  FOREIGN KEY (default_cost_center_id, company_id) REFERENCES core.cost_centers(id, company_id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

-- ---------------------------------------------------------------------------
-- Fiscal calendar
-- ---------------------------------------------------------------------------
CREATE TABLE core.fiscal_years (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  code        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED')),
  closed_at   timestamptz NULL,
  closed_by   uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  CHECK (end_date > start_date),
  EXCLUDE USING gist (company_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);

CREATE TABLE core.fiscal_periods (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL,
  fiscal_year_id       uuid NOT NULL,
  period_no            smallint NOT NULL CHECK (period_no BETWEEN 1 AND 13),
  name                 text NOT NULL,
  start_date           date NOT NULL,
  end_date             date NOT NULL,
  is_adjustment_period boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED','LOCKED')),
  closed_at            timestamptz NULL,
  closed_by            uuid NULL,
  reopen_count         int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  FOREIGN KEY (fiscal_year_id, company_id) REFERENCES core.fiscal_years(id, company_id),
  UNIQUE (fiscal_year_id, period_no),
  UNIQUE (id, company_id),
  CHECK (end_date >= start_date),
  CHECK (is_adjustment_period = (period_no = 13)),
  -- regular periods of a company never overlap (adjustment period shares the year-end date)
  EXCLUDE USING gist (company_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
    WHERE (NOT is_adjustment_period)
);
CREATE INDEX ix_periods_company_dates ON core.fiscal_periods (company_id, start_date, end_date);

CREATE TABLE core.period_status_history (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  period_id   uuid NOT NULL REFERENCES core.fiscal_periods(id),
  old_status  text NOT NULL,
  new_status  text NOT NULL,
  reason      text NOT NULL,
  changed_by  uuid NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

-- Resolve the regular (non-adjustment) period that contains a date
CREATE OR REPLACE FUNCTION core.period_for_date(p_company uuid, p_date date) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM core.fiscal_periods
   WHERE company_id = p_company AND NOT is_adjustment_period
     AND p_date BETWEEN start_date AND end_date
$$;

-- ---------------------------------------------------------------------------
-- Exchange rates (rate = units of to_currency per 1 unit of from_currency)
-- ---------------------------------------------------------------------------
CREATE TABLE core.exchange_rates (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id    uuid NOT NULL REFERENCES core.companies(id),
  from_currency char(3) NOT NULL REFERENCES core.currencies(code),
  to_currency   char(3) NOT NULL REFERENCES core.currencies(code),
  rate_type     text NOT NULL DEFAULT 'SPOT' CHECK (rate_type IN ('SPOT','MONTHLY_AVG','CLOSING')),
  rate_date     date NOT NULL,
  rate          numeric(20,10) NOT NULL CHECK (rate > 0),
  source        text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  CHECK (from_currency <> to_currency),
  UNIQUE (company_id, from_currency, to_currency, rate_type, rate_date)
);
CREATE INDEX ix_fx_lookup ON core.exchange_rates (company_id, from_currency, to_currency, rate_type, rate_date DESC);

-- ---------------------------------------------------------------------------
-- Work calendars (used for Daily / Hourly revenue quantities)
-- ---------------------------------------------------------------------------
CREATE TABLE core.work_calendars (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id         uuid NOT NULL REFERENCES core.companies(id),
  code               text NOT NULL,
  name               text NOT NULL,
  weekend_days       smallint[] NOT NULL,          -- ISO day numbers 1=Mon..7=Sun
  std_hours_per_day  numeric(5,2) NOT NULL CHECK (std_hours_per_day > 0 AND std_hours_per_day <= 24),
  is_default         boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  CHECK (weekend_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[])
);
CREATE UNIQUE INDEX ux_calendar_default ON core.work_calendars (company_id) WHERE is_default;

CREATE TABLE core.holidays (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  calendar_id  uuid NOT NULL REFERENCES core.work_calendars(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name         text NOT NULL,
  UNIQUE (calendar_id, holiday_date)
);

-- ---------------------------------------------------------------------------
-- Taxes
-- ---------------------------------------------------------------------------
CREATE TABLE core.tax_codes (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id  uuid NOT NULL REFERENCES core.companies(id),
  code        text NOT NULL,
  name        text NOT NULL,
  tax_type    text NOT NULL CHECK (tax_type IN ('VAT_OUTPUT','VAT_INPUT','WITHHOLDING','PAYROLL_TAX')),
  account_id  uuid NULL,                         -- FK added by accounting migration
  is_active   boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code)
);

CREATE TABLE core.tax_rates (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  tax_code_id    uuid NOT NULL REFERENCES core.tax_codes(id),
  rate_pct       numeric(9,6) NOT NULL CHECK (rate_pct >= 0 AND rate_pct <= 100),
  effective_from date NOT NULL,
  effective_to   date NULL,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  EXCLUDE USING gist (tax_code_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
);

-- touch + audit
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['core.companies','core.branches','core.cost_centers','core.departments',
                           'core.fiscal_years','core.fiscal_periods','core.exchange_rates',
                           'core.work_calendars','core.tax_codes'] LOOP
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
    PERFORM audit.enable(t::regclass);
  END LOOP;
  PERFORM audit.enable('core.tax_rates'::regclass);
  PERFORM audit.enable('core.holidays'::regclass);
  PERFORM audit.enable('core.company_currencies'::regclass);
END $$;

-- Base currency is immutable once the company has any journal entry (enforced in 0005).
