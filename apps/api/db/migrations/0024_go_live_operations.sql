-- =============================================================================
-- 0024  Go-Live Operations Parity & Production Readiness Schema
--       - sal.services (Services Catalog table used by ServicesCatalogService)
--       - acc.bank_transfers (Inter-bank & FX treasury transfers)
--       - pay.payroll_runs payment tracking columns
--       - pay.eosb_settlements (EOSB provisions & final payout tracking)
--       - acc.vat_settlements (VAT period closing & payment tracking)
--       - rev.revenue_lines approval workflow support for retroactive lines
-- =============================================================================

-- 1. Services Catalog
CREATE TABLE IF NOT EXISTS sal.services (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id          uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  code                text NOT NULL,
  name_ar             text NOT NULL,
  name_en             text NULL,
  category            text NOT NULL DEFAULT 'other',
  billing_basis       text NOT NULL DEFAULT 'monthly',
  standard_unit_price numeric(18,4) NOT NULL DEFAULT 0,
  currency_code       char(3) NOT NULL DEFAULT 'SAR' REFERENCES core.currencies(code),
  vat_rate            numeric(5,2) NOT NULL DEFAULT 15.00,
  gl_account_id       uuid NULL,
  description         text NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  FOREIGN KEY (gl_account_id, company_id) REFERENCES acc.accounts(id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_sal_services_company ON sal.services(company_id, is_active);

-- 2. Inter-Bank & Multi-Currency Transfers
CREATE TABLE IF NOT EXISTS acc.bank_transfers (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id       uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  transfer_date    date NOT NULL,
  source_bank_id   uuid NOT NULL REFERENCES acc.bank_accounts(id),
  target_bank_id   uuid NOT NULL REFERENCES acc.bank_accounts(id),
  source_currency  char(3) NOT NULL REFERENCES core.currencies(code),
  source_amount    numeric(20,4) NOT NULL CHECK (source_amount > 0),
  target_currency  char(3) NOT NULL REFERENCES core.currencies(code),
  target_amount    numeric(20,4) NOT NULL CHECK (target_amount > 0),
  exchange_rate    numeric(20,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  bank_fee         numeric(20,4) NOT NULL DEFAULT 0 CHECK (bank_fee >= 0),
  reference        text NULL,
  notes            text NULL,
  journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NULL REFERENCES iam.users(id),
  CHECK (source_bank_id <> target_bank_id)
);
CREATE INDEX IF NOT EXISTS ix_acc_bank_transfers_company ON acc.bank_transfers(company_id, transfer_date DESC);

-- 3. Payroll Run Payment Status & Disbursement Journal Link
ALTER TABLE pay.payroll_runs
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID')),
  ADD COLUMN IF NOT EXISTS payment_date date NULL,
  ADD COLUMN IF NOT EXISTS payment_journal_entry_id uuid NULL REFERENCES acc.journal_entries(id);

-- 4. End-of-Service Benefits (EOSB) Settlements
CREATE TABLE IF NOT EXISTS pay.eosb_settlements (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id       uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  employee_id      uuid NULL REFERENCES hr.employees(id),
  termination_date date NOT NULL,
  total_years      numeric(10,4) NOT NULL DEFAULT 0,
  net_eosb         numeric(20,4) NOT NULL DEFAULT 0,
  vac_pay          numeric(20,4) NOT NULL DEFAULT 0,
  total_settlement numeric(20,4) NOT NULL CHECK (total_settlement > 0),
  mode             text NOT NULL DEFAULT 'PROVISION' CHECK (mode IN ('PROVISION', 'PAY_NOW')),
  bank_account_id  uuid NULL REFERENCES acc.bank_accounts(id),
  journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  notes            text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NULL REFERENCES iam.users(id)
);
CREATE INDEX IF NOT EXISTS ix_pay_eosb_settlements_company ON pay.eosb_settlements(company_id, created_at DESC);

-- 5. VAT Return Settlements
CREATE TABLE IF NOT EXISTS acc.vat_settlements (
  id               uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id       uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  fiscal_period_id uuid NOT NULL REFERENCES core.fiscal_periods(id),
  settlement_date  date NOT NULL,
  output_vat       numeric(20,4) NOT NULL DEFAULT 0,
  input_vat        numeric(20,4) NOT NULL DEFAULT 0,
  net_vat          numeric(20,4) NOT NULL DEFAULT 0,
  pay_now          boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'CANCELLED')),
  bank_account_id  uuid NULL REFERENCES acc.bank_accounts(id),
  journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  notes            text NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NULL REFERENCES iam.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_acc_vat_settlements_period
  ON acc.vat_settlements(company_id, fiscal_period_id)
  WHERE status = 'POSTED';

-- 6. Extend rev.revenue_lines status CHECK constraint for approval workflow
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'rev.revenue_lines'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE rev.revenue_lines DROP CONSTRAINT IF EXISTS ' || quote_ident(c_name);
  END LOOP;
END $$;

ALTER TABLE rev.revenue_lines
  ADD CONSTRAINT revenue_lines_status_check
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED', 'REVERSED', 'CANCELLED')),
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL REFERENCES iam.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text NULL;

-- 7. Seed default EOSB / Salary Payable / Bank Fee helper posting accounts if parent headers exist
DO $$
DECLARE
  comp          RECORD;
  p_liab_id     uuid;
  p_exp_id      uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    SELECT id INTO p_liab_id FROM acc.accounts WHERE company_id = comp.id AND code = '2' LIMIT 1;
    SELECT id INTO p_exp_id  FROM acc.accounts WHERE company_id = comp.id AND code = '5' LIMIT 1;

    IF p_liab_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '20401') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '20401', 'رواتب وأجور مستحقة الدفع', 'Salaries & Wages Payable', 'LIABILITY', 'PAYROLL_LIABILITY', 'CREDIT', p_liab_id, true);
    END IF;

    IF p_liab_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '20402') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '20402', 'مخصص مكافأة نهاية الخدمة', 'End of Service Benefits Provision', 'LIABILITY', 'PAYROLL_LIABILITY', 'CREDIT', p_liab_id, true);
    END IF;

    IF p_exp_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '50103') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '50103', 'مصروف مكافأة نهاية الخدمة والإجازات', 'End of Service & Leave Expense', 'OPERATING_EXPENSE', 'DEBIT', p_exp_id, true);
    END IF;
  END LOOP;
END $$;
