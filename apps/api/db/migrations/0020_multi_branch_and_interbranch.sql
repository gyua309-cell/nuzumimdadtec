-- =============================================================================
-- 0020  Multi-Branch (Saudi Arabia HQ + Egypt Branch), Inter-Branch Reciprocal Accounts,
--       Cumulative Translation Adjustment (CTA), Custody Transfers & Settlements Workflow
-- =============================================================================

-- 1. Enhance core.branches for Multi-Country & Multi-Currency Operations
ALTER TABLE core.branches ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'SA';
ALTER TABLE core.branches ADD COLUMN IF NOT EXISTS functional_currency char(3) NOT NULL DEFAULT 'SAR' REFERENCES core.currencies(code);
ALTER TABLE core.branches ADD COLUMN IF NOT EXISTS tax_number text;
ALTER TABLE core.branches ADD COLUMN IF NOT EXISTS document_sequence_prefix text;
ALTER TABLE core.branches ADD COLUMN IF NOT EXISTS interbranch_account_id uuid;

ALTER TABLE core.branches DROP CONSTRAINT IF EXISTS chk_branch_country;
ALTER TABLE core.branches ADD CONSTRAINT chk_branch_country CHECK (country_code IN ('SA', 'EG', 'AE', 'US', 'OTHER'));

-- 2. Expand Subtype Check Constraint on acc.accounts to support INTERBRANCH and CTA
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'acc.accounts'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%subtype%'
  LOOP
    EXECUTE 'ALTER TABLE acc.accounts DROP CONSTRAINT IF EXISTS ' || quote_ident(c_name);
  END LOOP;
END $$;

ALTER TABLE acc.accounts ADD CONSTRAINT accounts_subtype_check CHECK (subtype IS NULL OR subtype IN (
  'CASH','BANK','RECEIVABLE','PAYABLE','EMPLOYEE_RECEIVABLE',
  'PAYROLL_LIABILITY','TAX','FIXED_ASSET','ACCUMULATED_DEPRECIATION',
  'RETAINED_EARNINGS','OPENING_BALANCE','FX_GAIN_LOSS','ROUNDING',
  'OVERHEAD_APPLIED','OVERHEAD_ABSORBED','PREPAID','ACCRUED',
  'INTERBRANCH','CTA','OTHER'
));

-- 3. Seed Chart of Accounts for Inter-Branch Reciprocal Accounts, CTA, and Unrealized FX
DO $$
DECLARE
  comp RECORD;
  parent_asset_id uuid;
  parent_liab_id  uuid;
  parent_eq_id    uuid;
  parent_rev_id   uuid;
  parent_exp_id   uuid;
  acc_1390_id     uuid;
  acc_2390_id     uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    -- Fetch Parent Accounts
    SELECT id INTO parent_asset_id FROM acc.accounts WHERE company_id = comp.id AND code = '1';
    SELECT id INTO parent_liab_id  FROM acc.accounts WHERE company_id = comp.id AND code = '2';
    SELECT id INTO parent_eq_id    FROM acc.accounts WHERE company_id = comp.id AND code = '3';
    SELECT id INTO parent_rev_id   FROM acc.accounts WHERE company_id = comp.id AND code = '4';
    SELECT id INTO parent_exp_id   FROM acc.accounts WHERE company_id = comp.id AND code = '5';

    -- 1390: Inter-branch Current Account - Egypt Branch (Asset in Saudi Books - SAR)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '1390') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, currency_code)
      VALUES (comp.id, '1390', 'جاري فرع جمهورية مصر العربية - القاهرة (SAR)', 'Inter-branch Current Account - Egypt Branch (SAR)', 'ASSET', 'INTERBRANCH', 'DEBIT', parent_asset_id, true, 'SAR')
      RETURNING id INTO acc_1390_id;
    ELSE
      SELECT id INTO acc_1390_id FROM acc.accounts WHERE company_id = comp.id AND code = '1390';
    END IF;

    -- 2390: Inter-branch Current Account - Saudi HQ (Liability in Egypt Books - EGP)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '2390') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, currency_code)
      VALUES (comp.id, '2390', 'جاري المركز الرئيسي - الرياض (EGP)', 'Inter-branch Current Account - Saudi HQ (EGP)', 'LIABILITY', 'INTERBRANCH', 'CREDIT', parent_liab_id, true, 'EGP')
      RETURNING id INTO acc_2390_id;
    ELSE
      SELECT id INTO acc_2390_id FROM acc.accounts WHERE company_id = comp.id AND code = '2390';
    END IF;

    -- 3300: Cumulative Translation Adjustment (CTA) in Equity (SAR)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '3300') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, currency_code)
      VALUES (comp.id, '3300', 'احتياطي فروق ترجمة عملات أجنبية (CTA)', 'Cumulative Translation Adjustment (CTA)', 'EQUITY', 'CTA', 'CREDIT', parent_eq_id, true, 'SAR');
    END IF;

    -- 4310: Unrealized FX Revaluation Gains (Period-End)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '4310') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '4310', 'أرباح فروق إعادة تقييم عملات أجنبية غير محققة', 'Unrealized Foreign Exchange Revaluation Gains', 'REVENUE', 'FX_GAIN_LOSS', 'CREDIT', parent_rev_id, true);
    END IF;

    -- 5710: Unrealized FX Revaluation Losses (Period-End)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5710') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES (comp.id, '5710', 'خسائر فروق إعادة تقييم عملات أجنبية غير محققة', 'Unrealized Foreign Exchange Revaluation Losses', 'OPERATING_EXPENSE', 'FX_GAIN_LOSS', 'DEBIT', parent_exp_id, true);
    END IF;

    -- 4. Update / Configure Branches for AZM
    -- Update Riyadh HQ Branch
    UPDATE core.branches
       SET code = 'HQ-RUH',
           name_ar = 'شركة عزم للتكنولوجيا - المقر الرئيسي (الرياض)',
           name_en = 'AZM Tech HQ - Riyadh',
           country_code = 'SA',
           functional_currency = 'SAR',
           tax_number = '300000000000003',
           document_sequence_prefix = 'RUH-',
           interbranch_account_id = acc_1390_id
     WHERE company_id = comp.id AND (code = 'BR-ALX' OR code = 'HQ-RUH');

    -- If Riyadh HQ was not updated, insert it
    IF NOT EXISTS (SELECT 1 FROM core.branches WHERE company_id = comp.id AND code = 'HQ-RUH') THEN
      INSERT INTO core.branches (company_id, code, name_ar, name_en, country_code, functional_currency, tax_number, document_sequence_prefix, interbranch_account_id)
      VALUES (comp.id, 'HQ-RUH', 'شركة عزم للتكنولوجيا - المقر الرئيسي (الرياض)', 'AZM Tech HQ - Riyadh', 'SA', 'SAR', '300000000000003', 'RUH-', acc_1390_id);
    END IF;

    -- Update Cairo Egypt Branch
    UPDATE core.branches
       SET code = 'BR-CAI',
           name_ar = 'شركة عزم للتكنولوجيا - فرع جمهورية مصر العربية (القاهرة)',
           name_en = 'AZM Tech - Egypt Branch (Cairo)',
           country_code = 'EG',
           functional_currency = 'EGP',
           tax_number = '100-200-300',
           document_sequence_prefix = 'CAI-',
           interbranch_account_id = acc_2390_id
     WHERE company_id = comp.id AND code = 'BR-CAI';

    -- If Cairo branch did not exist, insert it
    IF NOT EXISTS (SELECT 1 FROM core.branches WHERE company_id = comp.id AND code = 'BR-CAI') THEN
      INSERT INTO core.branches (company_id, code, name_ar, name_en, country_code, functional_currency, tax_number, document_sequence_prefix, interbranch_account_id)
      VALUES (comp.id, 'BR-CAI', 'شركة عزم للتكنولوجيا - فرع جمهورية مصر العربية (القاهرة)', 'AZM Tech - Egypt Branch (Cairo)', 'EG', 'EGP', '100-200-300', 'CAI-', acc_2390_id);
    END IF;

  END LOOP;
END $$;

-- 5. Multi-Currency Custody Transfers Table (حوالات وتغذية العهد من الشركة الأم للفرع)
CREATE TABLE IF NOT EXISTS fin.custody_transfers (
  id                              uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id                      uuid NOT NULL REFERENCES core.companies(id),
  custody_id                      uuid NOT NULL REFERENCES fin.custodies(id) ON DELETE CASCADE,
  transfer_number                 text NOT NULL,
  transfer_date                   date NOT NULL DEFAULT current_date,
  source_branch_id                uuid NULL REFERENCES core.branches(id),
  source_bank_account_id          uuid NULL,
  target_branch_id                uuid NULL REFERENCES core.branches(id),
  
  -- Financials
  amount_sar                      numeric(20,4) NOT NULL CHECK (amount_sar > 0),
  exchange_rate                   numeric(20,6) NOT NULL CHECK (exchange_rate > 0),
  amount_egp                      numeric(20,4) NOT NULL CHECK (amount_egp > 0),
  bank_fees_sar                   numeric(20,4) NOT NULL DEFAULT 0 CHECK (bank_fees_sar >= 0),
  bank_reference                  text NULL,
  
  status                          text NOT NULL DEFAULT 'COMPLETED'
                                  CHECK (status IN ('DRAFT', 'APPROVED', 'SENT', 'COMPLETED', 'CANCELLED')),
  journal_entry_sa_id             uuid NULL REFERENCES acc.journal_entries(id),
  journal_entry_eg_id             uuid NULL REFERENCES acc.journal_entries(id),
  receipt_url                     text NULL,
  notes                           text NULL,
  
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by                      uuid NULL,
  row_version                     int NOT NULL DEFAULT 1,
  UNIQUE (company_id, transfer_number),
  FOREIGN KEY (source_bank_account_id, company_id) REFERENCES acc.accounts(id, company_id)
);

CREATE INDEX IF NOT EXISTS ix_custody_transfers_custody ON fin.custody_transfers (company_id, custody_id);
CREATE INDEX IF NOT EXISTS ix_custody_transfers_date ON fin.custody_transfers (company_id, transfer_date);

-- 6. Custody Settlements Table (تسويات العهد الدورية وإقفال الأرصدة)
CREATE TABLE IF NOT EXISTS fin.custody_settlements (
  id                              uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id                      uuid NOT NULL REFERENCES core.companies(id),
  custody_id                      uuid NOT NULL REFERENCES fin.custodies(id) ON DELETE CASCADE,
  settlement_number               text NOT NULL,
  settlement_date                 date NOT NULL DEFAULT current_date,
  period_start                    date NULL,
  period_end                      date NULL,
  
  total_expenses_egp              numeric(20,4) NOT NULL DEFAULT 0 CHECK (total_expenses_egp >= 0),
  total_expenses_sar              numeric(20,4) NOT NULL DEFAULT 0 CHECK (total_expenses_sar >= 0),
  returned_amount_egp             numeric(20,4) NOT NULL DEFAULT 0 CHECK (returned_amount_egp >= 0),
  returned_amount_sar             numeric(20,4) NOT NULL DEFAULT 0 CHECK (returned_amount_sar >= 0),
  remaining_balance_egp           numeric(20,4) NOT NULL DEFAULT 0,
  remaining_balance_sar           numeric(20,4) NOT NULL DEFAULT 0,
  
  fx_gain_loss_sar                numeric(20,4) NOT NULL DEFAULT 0,
  settlement_rate                 numeric(20,6) NOT NULL DEFAULT 1 CHECK (settlement_rate > 0),
  original_average_rate           numeric(20,6) NOT NULL DEFAULT 1 CHECK (original_average_rate > 0),
  
  status                          text NOT NULL DEFAULT 'DRAFT'
                                  CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REJECTED')),
  journal_entry_id                uuid NULL REFERENCES acc.journal_entries(id),
  approved_by                     uuid NULL,
  approved_at                     timestamptz NULL,
  notes                           text NULL,
  
  created_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by                      uuid NULL,
  row_version                     int NOT NULL DEFAULT 1,
  UNIQUE (company_id, settlement_number)
);

CREATE INDEX IF NOT EXISTS ix_custody_settlements_custody ON fin.custody_settlements (company_id, custody_id);
CREATE INDEX IF NOT EXISTS ix_custody_settlements_status ON fin.custody_settlements (company_id, status);

-- 7. Link Custody Settlement Lines to Settlement Master
ALTER TABLE fin.custody_settlement_lines
  ADD COLUMN IF NOT EXISTS settlement_id uuid NULL REFERENCES fin.custody_settlements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_custody_settlement_lines_settlement ON fin.custody_settlement_lines (settlement_id);

-- 8. Triggers & Audit Logging
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin.custody_transfers', 'fin.custody_settlements'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch ON %s', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('fin.custody_transfers');
SELECT audit.enable('fin.custody_settlements');

-- 9. Register Posting Events for Inter-Branch Custodies and Period-End Revaluations
INSERT INTO acc.posting_events (code, module, description_ar, description_en, amount_keys, account_sources)
VALUES
  ('CUSTODY.TRANSFER', 'fin', 'تحويل عهدة من المركز الرئيسي للفرع (SAR/EGP)', 'Custody Transfer from HQ to Branch (SAR/EGP)',
   ARRAY['amount_sar', 'amount_egp', 'bank_fees'],
   ARRAY['FROM_BANK', 'FIXED', 'FROM_PAYLOAD']),
  ('CUSTODY.EXPENSE', 'fin', 'مصروف عهدة نقدية بالعملة المحلية للفرع', 'Custody Petty Cash Expense in Local Currency',
   ARRAY['subtotal', 'vat', 'total'],
   ARRAY['FROM_TAX_CODE', 'FIXED', 'FROM_PAYLOAD']),
  ('CUSTODY.SETTLEMENT', 'fin', 'تسوية عهدة وفروق أسعار صرف العملات', 'Custody Settlement and Realized FX Gain/Loss',
   ARRAY['expense_total', 'returned_amount', 'fx_gain_loss'],
   ARRAY['FIXED', 'FROM_PAYLOAD']),
  ('REVALUATION.PERIOD_END', 'acc', 'إعادة تقييم فروق أسعار الصرف غير المحققة بنهاية الفترة', 'Period-End Unrealized Foreign Exchange Revaluation',
   ARRAY['gain_loss_amount'],
   ARRAY['FIXED', 'FROM_PAYLOAD'])
ON CONFLICT (code) DO UPDATE
  SET description_ar = EXCLUDED.description_ar,
      description_en = EXCLUDED.description_en,
      amount_keys    = EXCLUDED.amount_keys,
      account_sources = EXCLUDED.account_sources;

-- 10. IAM Permissions for Transfers & Settlements
SELECT iam.def_perms('fin', 'custody_transfer', ARRAY['view', 'create', 'edit', 'approve', 'post', 'cancel'], 'تحويلات العهد النقدية بين الفروع', 'Branch Custody Transfers');
SELECT iam.def_perms('fin', 'custody_settlement', ARRAY['view', 'create', 'edit', 'approve', 'post', 'cancel', 'close'], 'تسويات العهد النقدية', 'Custody Settlements');

INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM iam.roles r
 CROSS JOIN iam.permissions p
 WHERE r.code IN ('CFO', 'ACCOUNTANT', 'EXECUTIVE', 'ADMIN') AND p.module = 'fin'
ON CONFLICT DO NOTHING;
