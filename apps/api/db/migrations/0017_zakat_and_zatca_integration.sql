-- =============================================================================
-- 0017  Zakat & Income Tax module + ZATCA integration settings / submission queue
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zakat / income-tax settings (one row per company)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acc.zakat_settings (
  company_id          uuid PRIMARY KEY REFERENCES core.companies(id),
  saudi_gulf_pct      numeric(7,4) NOT NULL DEFAULT 100 CHECK (saudi_gulf_pct BETWEEN 0 AND 100),
  foreign_pct         numeric(7,4) NOT NULL DEFAULT 0   CHECK (foreign_pct   BETWEEN 0 AND 100),
  zakat_rate_pct      numeric(7,4) NOT NULL DEFAULT 2.5 CHECK (zakat_rate_pct > 0),
  income_tax_rate_pct numeric(7,4) NOT NULL DEFAULT 20  CHECK (income_tax_rate_pct >= 0),
  hijri_year_days     int          NOT NULL DEFAULT 354 CHECK (hijri_year_days BETWEEN 350 AND 356),
  zakat_tin           text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  CHECK (saudi_gulf_pct + foreign_pct = 100)
);

-- -----------------------------------------------------------------------------
-- 2. Zakat / income-tax returns (calculation worksheets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acc.zakat_returns (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id          uuid NOT NULL REFERENCES core.companies(id),
  return_no           text NOT NULL,
  period_from         date NOT NULL,
  period_to           date NOT NULL,
  saudi_gulf_pct      numeric(7,4) NOT NULL,
  foreign_pct         numeric(7,4) NOT NULL,
  inputs              jsonb NOT NULL DEFAULT '{}'::jsonb,   -- manual adjustments entered by the accountant
  computed            jsonb NOT NULL DEFAULT '{}'::jsonb,   -- full worksheet (every line, for audit)
  adjusted_net_profit numeric(20,4) NOT NULL DEFAULT 0,
  zakat_base          numeric(20,4) NOT NULL DEFAULT 0,
  zakat_due           numeric(20,4) NOT NULL DEFAULT 0,
  income_tax_due      numeric(20,4) NOT NULL DEFAULT 0,
  total_due           numeric(20,4) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  journal_entry_id    uuid NULL REFERENCES acc.journal_entries(id),
  notes               text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1,
  UNIQUE (company_id, return_no),
  CHECK (period_to >= period_from),
  CHECK (saudi_gulf_pct + foreign_pct = 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_zakat_returns_period
  ON acc.zakat_returns (company_id, period_from, period_to) WHERE status <> 'CANCELLED';

-- -----------------------------------------------------------------------------
-- 3. ZATCA (Fatoora) integration settings: NO secrets are stored here.
--    CSID certificates / private keys must live in a secret store, never in
--    ordinary tables. This table only records onboarding state.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.zatca_settings (
  company_id      uuid PRIMARY KEY REFERENCES core.companies(id),
  environment     text NOT NULL DEFAULT 'SANDBOX' CHECK (environment IN ('SANDBOX','SIMULATION','PRODUCTION')),
  vat_number      text NULL,
  cr_number       text NULL,
  egs_unit_name   text NULL,
  egs_serial_no   text NULL,
  csid_status     text NOT NULL DEFAULT 'NOT_ONBOARDED'
                  CHECK (csid_status IN ('NOT_ONBOARDED','COMPLIANCE','PRODUCTION','EXPIRED')),
  csid_expires_at timestamptz NULL,
  auto_submit     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NULL,
  row_version int NOT NULL DEFAULT 1
);

-- Append-only log of every attempt to clear/report an invoice with ZATCA.
CREATE TABLE IF NOT EXISTS sal.zatca_submissions (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id    uuid NOT NULL REFERENCES core.companies(id),
  invoice_id    uuid NOT NULL REFERENCES sal.invoices(id),
  attempt_no    int  NOT NULL DEFAULT 1,
  environment   text NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('CLEARANCE','REPORTING')),
  status        text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','SENT','CLEARED','REPORTED','REJECTED','ERROR')),
  request_hash  text NULL,
  response      jsonb NULL,
  error_message text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(), created_by uuid NULL,
  UNIQUE (invoice_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS ix_zatca_sub_invoice ON sal.zatca_submissions (company_id, invoice_id);

-- -----------------------------------------------------------------------------
-- 4. Existing invoices were marked CLEARED at local posting although nothing was
--    ever sent to ZATCA. Correct the record so reports never claim clearance
--    that did not happen.
-- -----------------------------------------------------------------------------
UPDATE sal.invoices
   SET zatca_status = 'NOT_SUBMITTED', zatca_submitted_at = NULL
 WHERE zatca_status = 'CLEARED'
   AND NOT EXISTS (SELECT 1 FROM sal.zatca_submissions s WHERE s.invoice_id = sal.invoices.id AND s.status IN ('CLEARED','REPORTED'));

-- -----------------------------------------------------------------------------
-- 5. Chart of accounts: zakat payable + zakat/income-tax expense
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  comp RECORD;
  parent_liab_id uuid;
  parent_exp_id  uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    SELECT id INTO parent_liab_id FROM acc.accounts WHERE company_id = comp.id AND code = '2';

    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '2450') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '2450', 'الزكاة وضريبة الدخل المستحقة', 'Zakat & Income Tax Payable', 'LIABILITY', 'TAX', 'CREDIT', parent_liab_id, true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '6') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, is_posting)
      VALUES (comp.id, '6', 'مصروفات أخرى والزكاة والضرائب', 'Other Expenses, Zakat & Taxes', 'OTHER_EXPENSE', 'DEBIT', false);
    END IF;
    SELECT id INTO parent_exp_id FROM acc.accounts WHERE company_id = comp.id AND code = '6';

    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '6100') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '6100', 'مصروف الزكاة وضريبة الدخل', 'Zakat & Income Tax Expense', 'OTHER_EXPENSE', 'DEBIT', parent_exp_id, true);
    END IF;

    INSERT INTO acc.zakat_settings (company_id) VALUES (comp.id) ON CONFLICT (company_id) DO NOTHING;
    INSERT INTO sal.zatca_settings (company_id) VALUES (comp.id) ON CONFLICT (company_id) DO NOTHING;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. Audit & triggers
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc.zakat_settings','acc.zakat_returns','sal.zatca_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch ON %s', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('acc.zakat_settings');
SELECT audit.enable('acc.zakat_returns');
SELECT audit.enable('sal.zatca_settings');
SELECT audit.enable('sal.zatca_submissions');

-- -----------------------------------------------------------------------------
-- 7. Permissions
-- -----------------------------------------------------------------------------
SELECT iam.def_perms('acc','zakat',  ARRAY['view','create','edit','post','cancel','export'], 'الزكاة وضريبة الدخل', 'Zakat & Income Tax');
SELECT iam.def_perms('sal','zatca',  ARRAY['view','edit','approve'], 'الربط مع هيئة الزكاة والضريبة والجمارك', 'ZATCA Integration');
