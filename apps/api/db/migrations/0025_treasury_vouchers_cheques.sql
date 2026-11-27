-- =============================================================================
-- 0025  Integrated Treasury Module: Banks, Cashboxes, Receipt & Payment Vouchers,
--       Cheques (Receivable & Payable), Bank Reconciliations & Employee Cost Centers
-- =============================================================================

-- 1. Enhance acc.bank_accounts (Banks & Cashboxes unified ledger support)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'acc.bank_accounts'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) LIKE '%(id, company_id)%'
  ) THEN
    ALTER TABLE acc.bank_accounts ADD CONSTRAINT ux_bank_accounts_id_company UNIQUE (id, company_id);
  END IF;
END $$;

ALTER TABLE acc.bank_accounts
  ADD COLUMN IF NOT EXISTS bank_branch text NULL,
  ADD COLUMN IF NOT EXISTS opening_balance numeric(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS treasurer_employee_id uuid NULL REFERENCES hr.employees(id),
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text NULL;

-- 2. Extend acc.journal_entries journal_type constraint safely if needed
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'acc.journal_entries'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%journal_type%'
  LOOP
    EXECUTE 'ALTER TABLE acc.journal_entries DROP CONSTRAINT IF EXISTS ' || quote_ident(c_name);
  END LOOP;
END $$;

ALTER TABLE acc.journal_entries
  ADD CONSTRAINT journal_entries_journal_type_check
    CHECK (journal_type IN (
      'GENERAL','PAYROLL','REVENUE','DEPRECIATION','OVERHEAD','ACCRUAL',
      'COLLECTION','PAYMENT','LOAN','ASSET','EXPENSE','ADJUSTMENT',
      'REVERSAL','FX_REVALUATION','OPENING','CLOSING','TRANSFER','RECEIPT','CHEQUE','EOSB','TAX'
    ));

-- 3. Seed standard Treasury & Cheques COA accounts + Posting Events per company
DO $$
DECLARE
  comp RECORD;
  p_cash_bank_id uuid;
  p_ar_id uuid;
  p_ap_id uuid;
  sl_ca_id uuid;
  sl_cl_id uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    SELECT id INTO p_cash_bank_id FROM acc.accounts WHERE company_id = comp.id AND code IN ('1101','11','1') ORDER BY length(code) DESC LIMIT 1;
    SELECT id INTO p_ar_id        FROM acc.accounts WHERE company_id = comp.id AND code IN ('1102','11','1') ORDER BY length(code) DESC LIMIT 1;
    SELECT id INTO p_ap_id        FROM acc.accounts WHERE company_id = comp.id AND code IN ('2101','21','2') ORDER BY length(code) DESC LIMIT 1;
    SELECT id INTO sl_ca_id       FROM acc.statement_lines WHERE company_id = comp.id AND section_code = 'CURRENT_ASSETS' LIMIT 1;
    SELECT id INTO sl_cl_id       FROM acc.statement_lines WHERE company_id = comp.id AND section_code = 'CURRENT_LIABILITIES' LIMIT 1;

    IF p_cash_bank_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '10102') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, statement_section, statement_line_id, cash_flow_category)
      VALUES (comp.id, '10102', 'صندوق المصروفات النثرية والفرعية', 'Petty Cash & Branch Safes', 'ASSET', 'CASH', 'DEBIT', p_cash_bank_id, true, 'CURRENT_ASSETS', sl_ca_id, 'CASH');
    END IF;

    IF p_ar_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '10305') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, statement_section, statement_line_id, cash_flow_category)
      VALUES (comp.id, '10305', 'أوراق القبض وشيكات برسم التحصيل', 'Notes & Cheques Receivable', 'ASSET', 'RECEIVABLE', 'DEBIT', p_ar_id, true, 'CURRENT_ASSETS', sl_ca_id, 'OPERATING');
    END IF;

    IF p_ap_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '20105') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, statement_section, statement_line_id, cash_flow_category)
      VALUES (comp.id, '20105', 'أوراق الدفع والشيكات الصادرة المؤجلة', 'Notes & Cheques Payable', 'LIABILITY', 'PAYABLE', 'CREDIT', p_ap_id, true, 'CURRENT_LIABILITIES', sl_cl_id, 'OPERATING');
    END IF;
  END LOOP;
END $$;

INSERT INTO acc.posting_events(code, module, description_ar, description_en) VALUES
  ('TREASURY.RECEIPT_POSTED', 'treasury', 'ترحيل سند قبض', 'Treasury Receipt Voucher Posted'),
  ('TREASURY.PAYMENT_POSTED', 'treasury', 'ترحيل سند صرف', 'Treasury Payment Voucher Posted'),
  ('TREASURY.CHEQUE_RECEIVED', 'treasury', 'استلام شيك وارد', 'Incoming Cheque Received'),
  ('TREASURY.CHEQUE_CLEARED', 'treasury', 'تحصيل/صرف شيك بالبنك', 'Cheque Cleared at Bank'),
  ('TREASURY.CHEQUE_BOUNCED', 'treasury', 'ارتداد/إلغاء شيك', 'Cheque Bounced or Cancelled')
ON CONFLICT (code) DO NOTHING;

-- 4. Cheques Registry (Receivable & Payable Lifecycle)
CREATE TABLE IF NOT EXISTS fin.cheques (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id               uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  cheque_no                text NOT NULL,
  direction                text NOT NULL CHECK (direction IN ('INCOMING','OUTGOING')),
  cheque_type              text NOT NULL CHECK (cheque_type IN ('RECEIVABLE','PAYABLE')),
  issue_date               date NOT NULL,
  due_date                 date NOT NULL,
  bank_name                text NOT NULL,
  drawer_name              text NULL,
  bank_account_id          uuid NULL REFERENCES acc.bank_accounts(id),
  currency_code            char(3) NOT NULL DEFAULT 'SAR' REFERENCES core.currencies(code),
  exchange_rate            numeric(20,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount_tx                numeric(20,4) NOT NULL CHECK (amount_tx > 0),
  amount_base              numeric(20,4) NOT NULL CHECK (amount_base > 0),
  party_type               text NOT NULL CHECK (party_type IN ('CLIENT','VENDOR','EMPLOYEE','ACCOUNT','PROJECT')),
  client_id                uuid NULL,
  vendor_id                uuid NULL,
  employee_id              uuid NULL REFERENCES hr.employees(id),
  invoice_id               uuid NULL,
  purchase_invoice_id      uuid NULL,
  project_id               uuid NULL,
  cost_center_id           uuid NULL,
  branch_id                uuid NULL,
  counter_account_id       uuid NULL,
  status                   text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
                             'RECEIVED','UNDER_COLLECTION','COLLECTED','ISSUED','PAID','BOUNCED','CANCELLED'
                           )),
  voucher_id               uuid NULL,
  initial_journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  clearing_journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  bounce_journal_entry_id  uuid NULL REFERENCES acc.journal_entries(id),
  deposited_at             date NULL,
  collected_at             date NULL,
  bounced_at               date NULL,
  bounce_reason            text NULL,
  notes                    text NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NULL REFERENCES iam.users(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NULL REFERENCES iam.users(id),
  row_version              int NOT NULL DEFAULT 1,
  UNIQUE (id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_fin_cheques_company_dir ON fin.cheques(company_id, direction, status, due_date);
CREATE INDEX IF NOT EXISTS ix_fin_cheques_emp ON fin.cheques(company_id, employee_id) WHERE employee_id IS NOT NULL;

-- 5. Treasury Receipt & Payment Vouchers
CREATE TABLE IF NOT EXISTS fin.treasury_vouchers (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id               uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  voucher_no               text NOT NULL,
  voucher_type             text NOT NULL CHECK (voucher_type IN ('RECEIPT','PAYMENT')),
  voucher_date             date NOT NULL,
  fiscal_period_id         uuid NOT NULL REFERENCES core.fiscal_periods(id),
  payment_method           text NOT NULL CHECK (payment_method IN ('CASH','BANK_TRANSFER','CHEQUE','CARD')),
  treasury_account_id      uuid NOT NULL REFERENCES acc.bank_accounts(id),
  currency_code            char(3) NOT NULL DEFAULT 'SAR' REFERENCES core.currencies(code),
  exchange_rate            numeric(20,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount_tx                numeric(20,4) NOT NULL CHECK (amount_tx > 0),
  amount_base              numeric(20,4) NOT NULL CHECK (amount_base > 0),
  party_type               text NOT NULL CHECK (party_type IN ('CLIENT','VENDOR','EMPLOYEE','ACCOUNT','PROJECT')),
  party_sub_type           text NULL,
  client_id                uuid NULL,
  vendor_id                uuid NULL,
  invoice_id               uuid NULL,
  purchase_invoice_id      uuid NULL,
  employee_id              uuid NULL REFERENCES hr.employees(id),
  project_id               uuid NULL,
  cost_center_id           uuid NULL,
  department_id            uuid NULL,
  branch_id                uuid NULL,
  counter_account_id       uuid NOT NULL,
  beneficiary_name         text NULL,
  reference                text NULL,
  description              text NOT NULL,
  cheque_id                uuid NULL REFERENCES fin.cheques(id),
  status                   text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','CANCELLED')),
  journal_entry_id         uuid NULL REFERENCES acc.journal_entries(id),
  reversal_journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  cancel_reason            text NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NULL REFERENCES iam.users(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  updated_by               uuid NULL REFERENCES iam.users(id),
  row_version              int NOT NULL DEFAULT 1,
  UNIQUE (company_id, voucher_no),
  UNIQUE (id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_fin_vouchers_company_type ON fin.treasury_vouchers(company_id, voucher_type, voucher_date DESC);
CREATE INDEX IF NOT EXISTS ix_fin_vouchers_emp ON fin.treasury_vouchers(company_id, employee_id) WHERE employee_id IS NOT NULL;

-- 6. Bank Reconciliations
CREATE TABLE IF NOT EXISTS acc.bank_reconciliations (
  id                       uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id               uuid NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  bank_account_id          uuid NOT NULL REFERENCES acc.bank_accounts(id),
  statement_date           date NOT NULL,
  statement_balance        numeric(20,4) NOT NULL,
  book_balance             numeric(20,4) NOT NULL,
  cleared_balance          numeric(20,4) NOT NULL,
  difference               numeric(20,4) NOT NULL DEFAULT 0,
  cleared_line_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
  bank_charges             numeric(20,4) NOT NULL DEFAULT 0,
  adjustment_journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  status                   text NOT NULL DEFAULT 'RECONCILED' CHECK (status IN ('DRAFT','RECONCILED')),
  notes                    text NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid NULL REFERENCES iam.users(id)
);
CREATE INDEX IF NOT EXISTS ix_acc_bank_reconciliations_bank ON acc.bank_reconciliations(company_id, bank_account_id, statement_date DESC);

ALTER TABLE acc.bank_transfers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED','CANCELLED')),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid NULL REFERENCES acc.journal_entries(id),
  ADD COLUMN IF NOT EXISTS cancel_reason text NULL;

-- 7. Triggers & Audit
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin.cheques','fin.treasury_vouchers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch ON %s', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('fin.cheques');
SELECT audit.enable('fin.treasury_vouchers');
SELECT audit.enable('acc.bank_reconciliations');

-- 8. IAM Permissions + Automatic Grant to Financial/Admin Roles
SELECT iam.def_perms('fin', 'treasury', ARRAY['view', 'create', 'edit', 'post', 'cancel', 'reconcile'], 'الخزينة والبنوك والسندات والشيكات', 'Treasury, Cashboxes, Vouchers & Cheques');

INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT DISTINCT rp.role_id, p.code
  FROM iam.role_permissions rp
  JOIN iam.permissions p ON p.code LIKE 'fin.treasury.%'
 WHERE rp.permission_code IN ('acc.bank.view', 'acc.journal.view')
ON CONFLICT DO NOTHING;
