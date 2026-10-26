-- =============================================================================
-- 0005  Accounting Engine: chart of accounts, treasury, posting rules,
--       journal entries/lines, period balances, integrity triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Chart of Accounts
-- ---------------------------------------------------------------------------
CREATE TABLE acc.accounts (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id       uuid NOT NULL REFERENCES core.companies(id),
  parent_id        uuid NULL,
  code             text NOT NULL CHECK (code ~ '^[0-9A-Za-z._-]{1,30}$'),
  name_ar          text NOT NULL,
  name_en          text NULL,
  account_class    text NOT NULL CHECK (account_class IN ('ASSET','LIABILITY','EQUITY','REVENUE',
                     'DIRECT_COST','OPERATING_EXPENSE','OTHER_INCOME','OTHER_EXPENSE')),
  subtype          text NULL CHECK (subtype IN ('CASH','BANK','RECEIVABLE','PAYABLE','EMPLOYEE_RECEIVABLE',
                     'PAYROLL_LIABILITY','TAX','FIXED_ASSET','ACCUMULATED_DEPRECIATION','RETAINED_EARNINGS',
                     'OPENING_BALANCE','FX_GAIN_LOSS','ROUNDING','OVERHEAD_APPLIED','OVERHEAD_ABSORBED',
                     'PREPAID','ACCRUED','OTHER')),
  normal_balance   text NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
  is_contra        boolean NOT NULL DEFAULT false,
  currency_code    char(3) NULL REFERENCES core.currencies(code),   -- NULL = any currency
  is_posting       boolean NOT NULL DEFAULT true,
  is_control       boolean NOT NULL DEFAULT false,   -- only sub-ledgers may post (no manual JEs)
  is_active        boolean NOT NULL DEFAULT true,
  cash_flow_category text NULL CHECK (cash_flow_category IN ('CASH','OPERATING','INVESTING','FINANCING','NON_CASH')),
  requires_cost_center boolean NOT NULL DEFAULT false,
  requires_project     boolean NOT NULL DEFAULT false,
  requires_employee    boolean NOT NULL DEFAULT false,
  path             ltree NULL,
  level            int NOT NULL DEFAULT 1,
  description      text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (parent_id, company_id) REFERENCES acc.accounts(id, company_id),
  CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX ix_accounts_path ON acc.accounts USING gist (path);
CREATE INDEX ix_accounts_parent ON acc.accounts (parent_id);

-- Tree integrity: parent must be a header (non-posting) account of the same class;
-- maintain ltree path (id based, so code renames never break the tree).
CREATE OR REPLACE FUNCTION acc.trg_account_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p acc.accounts%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT * INTO p FROM acc.accounts WHERE id = NEW.parent_id;
    IF p.is_posting THEN
      RAISE EXCEPTION 'ACCOUNT_PARENT_MUST_BE_HEADER' USING ERRCODE = 'P0001';
    END IF;
    IF p.account_class <> NEW.account_class THEN
      RAISE EXCEPTION 'ACCOUNT_CLASS_MISMATCH_WITH_PARENT' USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND p.path <@ OLD.path THEN
      RAISE EXCEPTION 'ACCOUNT_TREE_CYCLE' USING ERRCODE = 'P0001';
    END IF;
    NEW.path := p.path || text2ltree(replace(NEW.id::text, '-', '_'));
  ELSE
    NEW.path := text2ltree(replace(NEW.id::text, '-', '_'));
  END IF;
  NEW.level := nlevel(NEW.path);

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_posting AND NOT NEW.is_posting
       AND EXISTS (SELECT 1 FROM acc.journal_lines WHERE account_id = NEW.id) THEN
      RAISE EXCEPTION 'ACCOUNT_HAS_TRANSACTIONS' USING ERRCODE = 'P0001';
    END IF;
    IF NOT OLD.is_posting AND NEW.is_posting
       AND EXISTS (SELECT 1 FROM acc.accounts WHERE parent_id = NEW.id) THEN
      RAISE EXCEPTION 'ACCOUNT_HAS_CHILDREN' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.account_class <> NEW.account_class
       AND (EXISTS (SELECT 1 FROM acc.journal_lines WHERE account_id = NEW.id)
            OR EXISTS (SELECT 1 FROM acc.accounts WHERE parent_id = NEW.id)) THEN
      RAISE EXCEPTION 'ACCOUNT_CLASS_LOCKED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION acc.trg_account_subtree() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE acc.accounts
       SET path = NEW.path || subpath(path, nlevel(OLD.path)),
           level = nlevel(NEW.path || subpath(path, nlevel(OLD.path)))
     WHERE path <@ OLD.path AND id <> NEW.id;
  END IF;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Treasury
-- ---------------------------------------------------------------------------
CREATE TABLE acc.bank_accounts (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL REFERENCES core.companies(id),
  code           text NOT NULL,
  name           text NOT NULL,
  kind           text NOT NULL DEFAULT 'BANK' CHECK (kind IN ('BANK','CASH')),
  bank_name      text NULL,
  account_number text NULL,
  iban           text NULL,
  currency_code  char(3) NOT NULL REFERENCES core.currencies(code),
  gl_account_id  uuid NOT NULL,
  branch_id      uuid NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  FOREIGN KEY (gl_account_id, company_id) REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (branch_id, company_id) REFERENCES core.branches(id, company_id)
);

ALTER TABLE core.tax_codes
  ADD CONSTRAINT fk_tax_account FOREIGN KEY (account_id, company_id) REFERENCES acc.accounts(id, company_id);

-- ---------------------------------------------------------------------------
-- Posting rules (account determination is configuration, never code)
-- ---------------------------------------------------------------------------
CREATE TABLE acc.posting_events (
  code           text PRIMARY KEY CHECK (code ~ '^[A-Z_]+\.[A-Z_]+$'),
  module         text NOT NULL,
  description_ar text NOT NULL,
  description_en text NOT NULL,
  amount_keys    text[] NOT NULL,          -- keys the source module provides in the payload
  account_sources text[] NOT NULL          -- allowed non-FIXED account sources for this event
);

CREATE TABLE acc.posting_rules (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id     uuid NOT NULL REFERENCES core.companies(id),
  event_code     text NOT NULL REFERENCES acc.posting_events(code),
  name           text NOT NULL,
  ledger         text NOT NULL DEFAULT 'FINANCIAL' CHECK (ledger IN ('FINANCIAL','MANAGEMENT')),
  conditions     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  priority       int NOT NULL DEFAULT 100,
  effective_from date NOT NULL,
  effective_to   date NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ix_posting_rules_event ON acc.posting_rules (company_id, event_code, is_active);

CREATE TABLE acc.posting_rule_lines (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  rule_id              uuid NOT NULL REFERENCES acc.posting_rules(id) ON DELETE CASCADE,
  company_id           uuid NOT NULL,
  line_no              int NOT NULL,
  side                 text NOT NULL CHECK (side IN ('DEBIT','CREDIT')),
  account_source       text NOT NULL CHECK (account_source IN ('FIXED','FROM_COMPONENT_EXPENSE',
                         'FROM_COMPONENT_LIABILITY','FROM_VARIABLE_TYPE','FROM_ASSET_CATEGORY_ASSET',
                         'FROM_ASSET_CATEGORY_ACCUM','FROM_ASSET_CATEGORY_EXPENSE','FROM_CLIENT',
                         'FROM_SUPPLIER','FROM_BANK','FROM_TAX_CODE','FROM_PAYLOAD')),
  account_id           uuid NULL,
  amount_key           text NOT NULL,
  dimension_policy     text NOT NULL DEFAULT 'INHERIT_ALL' CHECK (dimension_policy IN
                         ('INHERIT_ALL','SPLIT_BY_ALLOCATION','EMPLOYEE_ONLY','PARTY_ONLY','NONE')),
  description_template text NULL,
  UNIQUE (rule_id, line_no),
  FOREIGN KEY (rule_id, company_id) REFERENCES acc.posting_rules(id, company_id),
  FOREIGN KEY (account_id, company_id) REFERENCES acc.accounts(id, company_id),
  CHECK (account_source <> 'FIXED' OR account_id IS NOT NULL)
);

-- ---------------------------------------------------------------------------
-- Journal entries
-- ---------------------------------------------------------------------------
CREATE TABLE acc.journal_entries (
  id                 uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id         uuid NOT NULL REFERENCES core.companies(id),
  entry_no           text NULL,
  ledger             text NOT NULL DEFAULT 'FINANCIAL' CHECK (ledger IN ('FINANCIAL','MANAGEMENT')),
  journal_type       text NOT NULL CHECK (journal_type IN ('GENERAL','PAYROLL','REVENUE','DEPRECIATION',
                       'OVERHEAD','ACCRUAL','COLLECTION','PAYMENT','LOAN','ASSET','EXPENSE','ADJUSTMENT',
                       'REVERSAL','FX_REVALUATION','OPENING','CLOSING')),
  entry_date         date NOT NULL,
  fiscal_period_id   uuid NOT NULL,
  status             text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  source_module      text NOT NULL,
  source_type        text NOT NULL,
  source_id          uuid NULL,
  posting_event      text NULL REFERENCES acc.posting_events(code),
  posting_rule_id    uuid NULL REFERENCES acc.posting_rules(id),
  reference          text NULL,
  description        text NOT NULL,
  currency_code      char(3) NULL REFERENCES core.currencies(code),   -- header (document) currency, informative
  reversal_of_id     uuid NULL REFERENCES acc.journal_entries(id),
  reversed_by_id     uuid NULL REFERENCES acc.journal_entries(id),
  original_period_id uuid NULL,
  total_debit_base   numeric(20,4) NOT NULL DEFAULT 0,
  total_credit_base  numeric(20,4) NOT NULL DEFAULT 0,
  posted_at          timestamptz NULL,
  posted_by          uuid NULL,
  cancelled_at       timestamptz NULL,
  cancelled_by       uuid NULL,
  cancel_reason      text NULL,
  idempotency_key    text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id),
  UNIQUE (company_id, entry_no),
  UNIQUE (company_id, idempotency_key),
  FOREIGN KEY (fiscal_period_id, company_id) REFERENCES core.fiscal_periods(id, company_id),
  FOREIGN KEY (original_period_id, company_id) REFERENCES core.fiscal_periods(id, company_id),
  CHECK (status <> 'POSTED' OR (entry_no IS NOT NULL AND posted_at IS NOT NULL
                                AND total_debit_base = total_credit_base AND total_debit_base > 0)),
  CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
  CHECK ((journal_type = 'REVERSAL') = (reversal_of_id IS NOT NULL))
);
CREATE INDEX ix_je_period ON acc.journal_entries (company_id, fiscal_period_id, status, ledger);
CREATE INDEX ix_je_date   ON acc.journal_entries (company_id, entry_date);
CREATE INDEX ix_je_source ON acc.journal_entries (source_type, source_id);
-- a source document may be posted once per event (unless reversed or cancelled)
CREATE UNIQUE INDEX ux_je_source_once ON acc.journal_entries (company_id, source_type, source_id, posting_event)
  WHERE status <> 'CANCELLED' AND reversed_by_id IS NULL AND reversal_of_id IS NULL
        AND source_id IS NOT NULL AND posting_event IS NOT NULL;
-- an entry can be reversed only once
CREATE UNIQUE INDEX ux_je_reversal_once ON acc.journal_entries (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL AND status <> 'CANCELLED';

CREATE TABLE acc.journal_lines (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id        uuid NOT NULL,
  company_id      uuid NOT NULL,
  line_no         int NOT NULL CHECK (line_no > 0),
  account_id      uuid NOT NULL,
  debit_tx        numeric(20,4) NOT NULL DEFAULT 0 CHECK (debit_tx  >= 0),
  credit_tx       numeric(20,4) NOT NULL DEFAULT 0 CHECK (credit_tx >= 0),
  currency_code   char(3) NOT NULL REFERENCES core.currencies(code),
  exchange_rate   numeric(20,10) NOT NULL CHECK (exchange_rate > 0),
  debit_base      numeric(20,4) NOT NULL DEFAULT 0 CHECK (debit_base  >= 0),
  credit_base     numeric(20,4) NOT NULL DEFAULT 0 CHECK (credit_base >= 0),
  branch_id       uuid NULL,
  cost_center_id  uuid NULL,
  department_id   uuid NULL,
  project_id      uuid NULL,      -- FK added by projects migration (with client consistency)
  client_id       uuid NULL,
  supplier_id     uuid NULL,
  employee_id     uuid NULL,      -- FK added by HR migration
  asset_id        uuid NULL,      -- FK added by assets migration
  tax_code_id     uuid NULL REFERENCES core.tax_codes(id),
  tax_base_amount numeric(20,4) NULL,
  allocation_bucket text NOT NULL DEFAULT 'NONE' CHECK (allocation_bucket IN ('PROJECT','UNUTILIZED','NONE')),
  revenue_type    text NULL CHECK (revenue_type IN ('NORMAL','RETRO','ADJUSTMENT')),
  description     text NULL,
  source_line_ref text NULL,      -- reference to the sub-ledger line that produced this line
  UNIQUE (entry_id, line_no),
  FOREIGN KEY (entry_id, company_id)       REFERENCES acc.journal_entries(id, company_id),
  FOREIGN KEY (account_id, company_id)     REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (branch_id, company_id)      REFERENCES core.branches(id, company_id),
  FOREIGN KEY (cost_center_id, company_id) REFERENCES core.cost_centers(id, company_id),
  FOREIGN KEY (department_id, company_id)  REFERENCES core.departments(id, company_id),
  CHECK ((debit_tx > 0) <> (credit_tx > 0)),          -- exactly one side per line
  CHECK ((debit_base > 0) = (debit_tx > 0)),
  CHECK ((credit_base > 0) = (credit_tx > 0)),
  CHECK (allocation_bucket <> 'PROJECT' OR project_id IS NOT NULL),
  CHECK (allocation_bucket <> 'UNUTILIZED' OR (project_id IS NULL AND employee_id IS NOT NULL))
);
CREATE INDEX ix_jl_entry    ON acc.journal_lines (entry_id);
CREATE INDEX ix_jl_account  ON acc.journal_lines (account_id, entry_id);
CREATE INDEX ix_jl_project  ON acc.journal_lines (project_id)  WHERE project_id  IS NOT NULL;
CREATE INDEX ix_jl_employee ON acc.journal_lines (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX ix_jl_client   ON acc.journal_lines (client_id)   WHERE client_id   IS NOT NULL;
CREATE INDEX ix_jl_cc       ON acc.journal_lines (cost_center_id) WHERE cost_center_id IS NOT NULL;

-- Summary of posted movements per account and period (maintained by trigger at posting time)
CREATE TABLE acc.account_period_balances (
  company_id   uuid NOT NULL,
  ledger       text NOT NULL,
  period_id    uuid NOT NULL,
  account_id   uuid NOT NULL,
  debit_base   numeric(20,4) NOT NULL DEFAULT 0,
  credit_base  numeric(20,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, ledger, period_id, account_id),
  FOREIGN KEY (period_id, company_id)  REFERENCES core.fiscal_periods(id, company_id),
  FOREIGN KEY (account_id, company_id) REFERENCES acc.accounts(id, company_id)
);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acc.trg_je_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_period core.fiscal_periods%ROWTYPE;
  v_dr numeric; v_cr numeric; v_cnt int;
  v_base char(3); v_tol numeric;
  v_bad text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'JE_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  -- Posted entries are immutable: the only permitted change is linking the reversing entry
  IF TG_OP = 'UPDATE' AND OLD.status = 'POSTED' THEN
    IF (to_jsonb(NEW) - ARRAY['reversed_by_id','updated_at','updated_by','row_version'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['reversed_by_id','updated_at','updated_by','row_version'])
       OR OLD.reversed_by_id IS NOT NULL OR NEW.reversed_by_id IS NULL THEN
      RAISE EXCEPTION 'POSTED_JE_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CANCELLED_JE_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'JE_MUST_START_AS_DRAFT' USING ERRCODE = 'P0001';
  END IF;

  -- Period must be open and contain the entry date
  SELECT * INTO v_period FROM core.fiscal_periods WHERE id = NEW.fiscal_period_id;
  IF v_period.status <> 'OPEN' AND NOT (TG_OP = 'UPDATE' AND NEW.status = 'CANCELLED') THEN
    RAISE EXCEPTION 'PERIOD_NOT_OPEN' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.entry_date < v_period.start_date OR NEW.entry_date > v_period.end_date THEN
    RAISE EXCEPTION 'ENTRY_DATE_OUTSIDE_PERIOD' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'POSTED' THEN
    SELECT base_currency_code INTO v_base FROM core.companies WHERE id = NEW.company_id;
    SELECT power(10::numeric, -decimal_places) INTO v_tol FROM core.currencies WHERE code = v_base;

    SELECT COALESCE(SUM(debit_base),0), COALESCE(SUM(credit_base),0), COUNT(*)
      INTO v_dr, v_cr, v_cnt FROM acc.journal_lines WHERE entry_id = NEW.id;
    IF v_cnt < 2 THEN
      RAISE EXCEPTION 'JE_TOO_FEW_LINES' USING ERRCODE = 'P0001';
    END IF;
    IF v_dr <> v_cr OR v_dr = 0 THEN
      RAISE EXCEPTION 'JE_UNBALANCED debit=% credit=%', v_dr, v_cr USING ERRCODE = 'P0001';
    END IF;

    SELECT a.code INTO v_bad FROM acc.journal_lines l JOIN acc.accounts a ON a.id = l.account_id
     WHERE l.entry_id = NEW.id AND (NOT a.is_posting OR NOT a.is_active) LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'NON_POSTING_ACCOUNT %', v_bad USING ERRCODE = 'P0001';
    END IF;

    IF NEW.source_module = 'GL' THEN
      SELECT a.code INTO v_bad FROM acc.journal_lines l JOIN acc.accounts a ON a.id = l.account_id
       WHERE l.entry_id = NEW.id AND a.is_control LIMIT 1;
      IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'CONTROL_ACCOUNT_MANUAL_POSTING %', v_bad USING ERRCODE = 'P0001';
      END IF;
    END IF;

    SELECT a.code INTO v_bad FROM acc.journal_lines l JOIN acc.accounts a ON a.id = l.account_id
     WHERE l.entry_id = NEW.id AND a.currency_code IS NOT NULL AND a.currency_code <> l.currency_code LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'ACCOUNT_CURRENCY_MISMATCH %', v_bad USING ERRCODE = 'P0001';
    END IF;

    SELECT a.code INTO v_bad FROM acc.journal_lines l JOIN acc.accounts a ON a.id = l.account_id
     WHERE l.entry_id = NEW.id
       AND ((a.requires_project AND l.project_id IS NULL)
         OR (a.requires_employee AND l.employee_id IS NULL)
         OR (a.requires_cost_center AND l.cost_center_id IS NULL)) LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'REQUIRED_DIMENSION_MISSING %', v_bad USING ERRCODE = 'P0001';
    END IF;

    -- base amounts must equal tx * rate (within one minor unit); base-currency lines use rate 1
    IF EXISTS (SELECT 1 FROM acc.journal_lines l WHERE l.entry_id = NEW.id AND (
                 (l.currency_code = v_base AND (l.exchange_rate <> 1 OR l.debit_tx <> l.debit_base OR l.credit_tx <> l.credit_base))
              OR abs(l.debit_tx * l.exchange_rate - l.debit_base) > v_tol
              OR abs(l.credit_tx * l.exchange_rate - l.credit_base) > v_tol)) THEN
      RAISE EXCEPTION 'FX_CONVERSION_INCONSISTENT' USING ERRCODE = 'P0001';
    END IF;

    NEW.total_debit_base := v_dr;
    NEW.total_credit_base := v_cr;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER a_je_guard BEFORE INSERT OR UPDATE OR DELETE ON acc.journal_entries
  FOR EACH ROW EXECUTE FUNCTION acc.trg_je_guard();
CREATE TRIGGER touch BEFORE UPDATE ON acc.journal_entries FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();

-- Lines may change only while the entry is a draft
CREATE OR REPLACE FUNCTION acc.trg_jl_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM acc.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'JE_LINES_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER a_jl_guard BEFORE INSERT OR UPDATE OR DELETE ON acc.journal_lines
  FOR EACH ROW EXECUTE FUNCTION acc.trg_jl_guard();

-- Maintain account_period_balances atomically at posting time
CREATE OR REPLACE FUNCTION acc.trg_je_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'POSTED' AND OLD.status = 'DRAFT' THEN
    INSERT INTO acc.account_period_balances AS b (company_id, ledger, period_id, account_id, debit_base, credit_base)
    SELECT NEW.company_id, NEW.ledger, NEW.fiscal_period_id, l.account_id, SUM(l.debit_base), SUM(l.credit_base)
      FROM acc.journal_lines l WHERE l.entry_id = NEW.id
     GROUP BY l.account_id
    ON CONFLICT (company_id, ledger, period_id, account_id)
    DO UPDATE SET debit_base = b.debit_base + EXCLUDED.debit_base,
                  credit_base = b.credit_base + EXCLUDED.credit_base;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER b_je_balances AFTER UPDATE ON acc.journal_entries
  FOR EACH ROW EXECUTE FUNCTION acc.trg_je_balances();

-- Balances are written only by the posting trigger
CREATE OR REPLACE FUNCTION acc.trg_balances_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'BALANCES_MAINTAINED_BY_POSTING_ONLY' USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER a_balances_guard BEFORE INSERT OR UPDATE OR DELETE ON acc.account_period_balances
  FOR EACH ROW EXECUTE FUNCTION acc.trg_balances_guard();

-- Account tree triggers (need journal_lines to exist)
CREATE TRIGGER a_account_tree BEFORE INSERT OR UPDATE OF parent_id, is_posting, account_class ON acc.accounts
  FOR EACH ROW EXECUTE FUNCTION acc.trg_account_tree();
CREATE TRIGGER b_account_subtree AFTER UPDATE OF parent_id ON acc.accounts
  FOR EACH ROW EXECUTE FUNCTION acc.trg_account_subtree();
CREATE TRIGGER touch BEFORE UPDATE ON acc.accounts FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();
CREATE TRIGGER touch BEFORE UPDATE ON acc.bank_accounts FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();
CREATE TRIGGER touch BEFORE UPDATE ON acc.posting_rules FOR EACH ROW EXECUTE FUNCTION sys.trg_touch();

-- Base currency is immutable once the company has journal entries
CREATE OR REPLACE FUNCTION core.trg_company_base_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.base_currency_code <> OLD.base_currency_code
     AND EXISTS (SELECT 1 FROM acc.journal_entries WHERE company_id = NEW.id) THEN
    RAISE EXCEPTION 'BASE_CURRENCY_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_base_currency BEFORE UPDATE OF base_currency_code ON core.companies
  FOR EACH ROW EXECUTE FUNCTION core.trg_company_base_currency();

-- A period cannot be closed while it still contains draft entries
CREATE OR REPLACE FUNCTION core.trg_period_close_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('CLOSED','LOCKED') AND OLD.status NOT IN ('CLOSED','LOCKED')
     AND EXISTS (SELECT 1 FROM acc.journal_entries WHERE fiscal_period_id = NEW.id AND status = 'DRAFT') THEN
    RAISE EXCEPTION 'PERIOD_HAS_DRAFT_ENTRIES' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_period_close_guard BEFORE UPDATE OF status ON core.fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION core.trg_period_close_guard();

SELECT audit.enable('acc.accounts');
SELECT audit.enable('acc.bank_accounts', 'iban', 'account_number');
SELECT audit.enable('acc.posting_rules');
SELECT audit.enable('acc.posting_rule_lines');
SELECT audit.enable('acc.journal_entries');
-- journal_lines are covered by the entry audit + immutability (high volume, never updated after posting)
