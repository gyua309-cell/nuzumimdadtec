-- =============================================================================
-- 0015  Multi-Currency Petty Cash / Custodies & Multi-Currency Payroll Enhancement
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS fin;

-- 1. Insert New Chart of Accounts for Multi-Currency Cash, Banks, Custodies, and FX Gains/Losses
DO $$
DECLARE
  comp RECORD;
  parent_asset_id uuid;
  parent_rev_id uuid;
  parent_exp_id uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    -- Get Parent IDs
    SELECT id INTO parent_asset_id FROM acc.accounts WHERE company_id = comp.id AND code = '1';
    SELECT id INTO parent_rev_id   FROM acc.accounts WHERE company_id = comp.id AND code = '4';
    SELECT id INTO parent_exp_id   FROM acc.accounts WHERE company_id = comp.id AND code = '5';

    -- 1110: SAR Bank Account (Al-Rajhi / Riyad Bank)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '1110') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '1110', 'النقدية بالبنوك - حساب مصرف الراجحي / الرياض (SAR)', 'Banks - SAR Account (Riyad/Rajhi)', 'ASSET', 'DEBIT', parent_asset_id, true);
    END IF;

    -- 1120: EGP Bank Account (CIB / NBE)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '1120') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '1120', 'النقدية بالبنوك - حساب البنك التجاري الدولي CIB / الأهلي (EGP)', 'Banks - EGP Account (CIB/NBE)', 'ASSET', 'DEBIT', parent_asset_id, true);
    END IF;

    -- 1310: Employee Custody - Egypt Branch (EGP)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '1310') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '1310', 'عهد نقدية ومصروفات تشغيلية - فرع مصر (EGP)', 'Employee Custodies - Egypt Branch (EGP)', 'ASSET', 'DEBIT', parent_asset_id, true);
    END IF;

    -- 1320: Employee Custody - Saudi HQ (SAR)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '1320') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '1320', 'عهد نقدية ومصروفات تشغيلية - المركز الرئيسي (SAR)', 'Employee Custodies - Saudi HQ (SAR)', 'ASSET', 'DEBIT', parent_asset_id, true);
    END IF;

    -- 4300: Realized FX Gains (Credit)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '4300') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '4300', 'أرباح فروق وتقلبات أسعار صرف العملات الأجنبية', 'Realized Foreign Exchange Gains', 'REVENUE', 'CREDIT', parent_rev_id, true);
    END IF;

    -- 5700: Realized FX Losses (Debit)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5700') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5700', 'خسائر فروق وتقلبات أسعار صرف العملات الأجنبية', 'Realized Foreign Exchange Losses', 'OPERATING_EXPENSE', 'DEBIT', parent_exp_id, true);
    END IF;

    -- 5150: Branch Office Utilities, Hospitality & Petty Expenses
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5150') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5150', 'مصروفات تشغيلية وضيافة وانتقالات المقر والفرع', 'Branch Office Operations, Travel & Hospitality', 'OPERATING_EXPENSE', 'DEBIT', parent_exp_id, true);
    END IF;

    -- 5160: Branch Office Rent & Premises Facilities
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5160') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5160', 'إيجارات ومرافق مقر الفرع ومساحات العمل', 'Branch Rent & Premises Facilities', 'OPERATING_EXPENSE', 'DEBIT', parent_exp_id, true);
    END IF;

  END LOOP;
END $$;

-- 2. Multi-Currency Custodies / Petty Cash Master Table
CREATE TABLE IF NOT EXISTS fin.custodies (
  id                              uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id                      uuid NOT NULL REFERENCES core.companies(id),
  custody_no                      text NOT NULL,
  employee_id                     uuid NOT NULL,
  title_ar                        text NOT NULL,
  title_en                        text NULL,
  purpose                         text NULL,
  source_currency                 char(3) NOT NULL REFERENCES core.currencies(code) DEFAULT 'SAR',
  requested_amount                numeric(20,4) NOT NULL DEFAULT 0 CHECK (requested_amount >= 0),
  disbursed_amount                numeric(20,4) NOT NULL DEFAULT 0 CHECK (disbursed_amount >= 0),
  disbursed_amount_base           numeric(20,4) NOT NULL DEFAULT 0,
  disbursed_at                    timestamptz NULL,
  disbursed_from_account_id       uuid NULL,
  disbursement_journal_entry_id   uuid NULL REFERENCES acc.journal_entries(id),

  -- FX Conversion Tracking (تحويل العملة من الريال إلى الجنيه أو غيرها)
  target_currency                 char(3) NOT NULL REFERENCES core.currencies(code) DEFAULT 'EGP',
  conversion_rate                 numeric(20,6) NOT NULL DEFAULT 1 CHECK (conversion_rate > 0),
  converted_amount_source         numeric(20,4) NOT NULL DEFAULT 0 CHECK (converted_amount_source >= 0),
  converted_amount_target         numeric(20,4) NOT NULL DEFAULT 0 CHECK (converted_amount_target >= 0),
  converted_at                    timestamptz NULL,
  conversion_receipt_no           text NULL,
  conversion_notes                text NULL,

  -- Settlement & Balance Tracking
  total_settled_amount_target     numeric(20,4) NOT NULL DEFAULT 0 CHECK (total_settled_amount_target >= 0),
  remaining_balance_target        numeric(20,4) NOT NULL DEFAULT 0,
  status                          text NOT NULL DEFAULT 'DRAFT'
                                  CHECK (status IN ('DRAFT', 'DISBURSED', 'CONVERTED', 'PARTIALLY_SETTLED', 'SETTLED', 'CLOSED', 'CANCELLED')),
  closure_date                    date NULL,
  closure_notes                   text NULL,
  closure_journal_entry_id        uuid NULL REFERENCES acc.journal_entries(id),

  notes                           text NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by                      uuid NULL,
  row_version                     int NOT NULL DEFAULT 1,
  UNIQUE (company_id, custody_no),
  UNIQUE (id, company_id),
  FOREIGN KEY (employee_id, company_id) REFERENCES hr.employees(id, company_id),
  FOREIGN KEY (disbursed_from_account_id, company_id) REFERENCES acc.accounts(id, company_id)
);

CREATE INDEX IF NOT EXISTS ix_fin_custodies_employee ON fin.custodies (company_id, employee_id);
CREATE INDEX IF NOT EXISTS ix_fin_custodies_status ON fin.custodies (company_id, status);

-- 3. Custody Settlement Lines (إيصالات وفواتير تسوية مصروفات العهدة)
CREATE TABLE IF NOT EXISTS fin.custody_settlement_lines (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL,
  custody_id           uuid NOT NULL,
  line_no              int NOT NULL DEFAULT 1,
  expense_date         date NOT NULL,
  receipt_no           text NULL,
  expense_account_id   uuid NOT NULL,
  project_id           uuid NULL,
  cost_center_id       uuid NULL,
  vendor_name          text NULL,
  description          text NOT NULL,
  currency_code        char(3) NOT NULL REFERENCES core.currencies(code) DEFAULT 'EGP',
  exchange_rate        numeric(20,6) NOT NULL DEFAULT 1,
  subtotal             numeric(20,4) NOT NULL DEFAULT 0,
  vat_rate             numeric(5,2) NOT NULL DEFAULT 0,
  vat_amount           numeric(20,4) NOT NULL DEFAULT 0,
  total_amount         numeric(20,4) NOT NULL DEFAULT 0,
  subtotal_base        numeric(20,4) NOT NULL DEFAULT 0,
  vat_amount_base      numeric(20,4) NOT NULL DEFAULT 0,
  total_amount_base    numeric(20,4) NOT NULL DEFAULT 0,
  journal_entry_id     uuid NULL REFERENCES acc.journal_entries(id),
  status               text NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('DRAFT', 'APPROVED', 'REJECTED')),
  receipt_file_url     text NULL,
  notes                text NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NULL,
  row_version          int NOT NULL DEFAULT 1,
  FOREIGN KEY (custody_id, company_id)         REFERENCES fin.custodies(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (expense_account_id, company_id) REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (project_id, company_id)         REFERENCES prj.projects(id, company_id),
  FOREIGN KEY (cost_center_id, company_id)     REFERENCES core.cost_centers(id, company_id)
);

CREATE INDEX IF NOT EXISTS ix_fin_custody_lines ON fin.custody_settlement_lines (custody_id);

-- 4. Multi-Currency Payroll Lines & Runs Enhancement
ALTER TABLE pay.payroll_lines ADD COLUMN IF NOT EXISTS contract_currency char(3) DEFAULT 'EGP';
ALTER TABLE pay.payroll_lines ADD COLUMN IF NOT EXISTS contract_amount numeric(20,4) DEFAULT 0;
ALTER TABLE pay.payroll_lines ADD COLUMN IF NOT EXISTS payout_currency char(3) DEFAULT 'EGP';
ALTER TABLE pay.payroll_lines ADD COLUMN IF NOT EXISTS payout_exchange_rate numeric(20,6) DEFAULT 1;
ALTER TABLE pay.payroll_lines ADD COLUMN IF NOT EXISTS payout_amount numeric(20,4) DEFAULT 0;

ALTER TABLE pay.payroll_runs ADD COLUMN IF NOT EXISTS total_payout_sar numeric(20,4) DEFAULT 0;
ALTER TABLE pay.payroll_runs ADD COLUMN IF NOT EXISTS total_payout_egp numeric(20,4) DEFAULT 0;

-- 5. Audit & Triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin.custodies','fin.custody_settlement_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch ON %s', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('fin.custodies');
SELECT audit.enable('fin.custody_settlement_lines');

-- 6. Define IAM Permissions for Custodies
SELECT iam.def_perms('fin', 'custody', ARRAY['view', 'create', 'edit', 'approve', 'post', 'close', 'cancel'], 'العهد النقدية ومصروفات الفروع', 'Branch Petty Cash & Custodies');

-- 7. Assign permissions to CFO, Accountant, and Executive roles
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM iam.roles r
 CROSS JOIN iam.permissions p
 WHERE r.code IN ('CFO', 'ACCOUNTANT', 'EXECUTIVE') AND p.module = 'fin'
ON CONFLICT DO NOTHING;
