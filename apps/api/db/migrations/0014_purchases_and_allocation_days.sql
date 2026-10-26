-- =============================================================================
-- 0014  Purchases Module (Vendors, Purchase Invoices, Debit Notes) & Allocation Days
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS pur;

-- 1. Add Default Accounts for Purchases & Input VAT into acc.accounts if not present
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    -- 1250: Input VAT on Purchases (Asset, normal_balance = DEBIT)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '1250') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, is_posting)
      VALUES (comp.id, '1250', 'ضريبة القيمة المضافة على المدخلات (المشتريات)', 'Input VAT on Purchases', 'ASSET', 'DEBIT', true);
    END IF;

    -- 2400: Output VAT on Sales (Liability, normal_balance = CREDIT)
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '2400') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, is_posting)
      VALUES (comp.id, '2400', 'ضريبة القيمة المضافة المستحقة (المبيعات)', 'Output VAT on Sales', 'LIABILITY', 'CREDIT', true);
    END IF;

    -- 5500: Software, Cloud & Hosting Expenses
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5500') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, is_posting)
      VALUES (comp.id, '5500', 'مصروفات البرمجيات وتراخيص السحابة والاستضافة', 'Software, Cloud & Hosting Expenses', 'OPERATING_EXPENSE', 'DEBIT', true);
    END IF;

    -- 5600: Direct Project Subcontractor & External Tech Costs
    IF NOT EXISTS (SELECT 1 FROM acc.accounts WHERE company_id = comp.id AND code = '5600') THEN
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, normal_balance, is_posting)
      VALUES (comp.id, '5600', 'تكاليف الاستشارات التقنية ومقاولي الباطن للمشاريع', 'Project Technical Subcontractor Costs', 'OPERATING_EXPENSE', 'DEBIT', true);
    END IF;
  END LOOP;
END $$;

-- 2. Enhanced Employee Allocation: Support Allocation by Days or Hours in addition to Percentage
ALTER TABLE prj.assignments ADD COLUMN IF NOT EXISTS allocation_basis text NOT NULL DEFAULT 'PERCENTAGE' CHECK (allocation_basis IN ('PERCENTAGE', 'DAYS', 'HOURS'));
ALTER TABLE prj.assignments ADD COLUMN IF NOT EXISTS allocated_days numeric(6,2);
ALTER TABLE prj.assignments ADD COLUMN IF NOT EXISTS allocated_hours numeric(8,2);
ALTER TABLE prj.assignments ADD COLUMN IF NOT EXISTS working_days_in_month numeric(6,2) DEFAULT 22;

-- 3. Vendors / Suppliers
CREATE TABLE IF NOT EXISTS pur.vendors (
  id                          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id                  uuid NOT NULL REFERENCES core.companies(id),
  code                        text NOT NULL,
  name_ar                     text NOT NULL,
  name_en                     text NULL,
  tax_registration_no         text NULL,
  cr_number                   text NULL,
  contact_person              text NULL,
  email                       citext NULL,
  phone                       text NULL,
  address                     text NULL,
  currency_code               char(3) NOT NULL REFERENCES core.currencies(code) DEFAULT 'SAR',
  payment_terms_days          int NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  payable_account_id          uuid NULL,
  default_expense_account_id  uuid NULL,
  is_active                   boolean NOT NULL DEFAULT true,
  notes                       text NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid NULL,
  row_version                 int NOT NULL DEFAULT 1,
  UNIQUE (company_id, code),
  UNIQUE (id, company_id),
  FOREIGN KEY (payable_account_id, company_id) REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (default_expense_account_id, company_id) REFERENCES acc.accounts(id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_vendors_name ON pur.vendors USING gin (name_ar gin_trgm_ops);

-- 4. Purchase Invoices & Debit Notes (Bills)
CREATE TABLE IF NOT EXISTS pur.purchase_invoices (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL REFERENCES core.companies(id),
  invoice_no           text NOT NULL,
  vendor_invoice_no    text NULL,
  invoice_type         text NOT NULL DEFAULT 'STANDARD_BILL' CHECK (invoice_type IN ('STANDARD_BILL', 'EXPENSE_BILL', 'DEBIT_NOTE')),
  vendor_id            uuid NOT NULL,
  project_id           uuid NULL,
  fiscal_period_id     uuid NOT NULL REFERENCES core.fiscal_periods(id),
  issue_date           date NOT NULL,
  due_date             date NULL,
  currency_code        char(3) NOT NULL REFERENCES core.currencies(code) DEFAULT 'SAR',
  exchange_rate        numeric(20,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  subtotal             numeric(20,4) NOT NULL DEFAULT 0,
  vat_amount           numeric(20,4) NOT NULL DEFAULT 0,
  total_amount         numeric(20,4) NOT NULL DEFAULT 0,
  subtotal_base        numeric(20,4) NOT NULL DEFAULT 0,
  vat_amount_base      numeric(20,4) NOT NULL DEFAULT 0,
  total_amount_base    numeric(20,4) NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  payment_status       text NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
  original_invoice_id  uuid NULL REFERENCES pur.purchase_invoices(id),
  journal_entry_id     uuid NULL REFERENCES acc.journal_entries(id),
  return_reason        text NULL,
  notes                text NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid NULL,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid NULL,
  row_version          int NOT NULL DEFAULT 1,
  UNIQUE (company_id, invoice_no),
  UNIQUE (id, company_id),
  FOREIGN KEY (vendor_id, company_id) REFERENCES pur.vendors(id, company_id),
  FOREIGN KEY (project_id, company_id) REFERENCES prj.projects(id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_pur_invoices_vendor ON pur.purchase_invoices (company_id, vendor_id);
CREATE INDEX IF NOT EXISTS ix_pur_invoices_project ON pur.purchase_invoices (company_id, project_id);
CREATE INDEX IF NOT EXISTS ix_pur_invoices_period ON pur.purchase_invoices (company_id, fiscal_period_id);

-- 5. Purchase Invoice Lines
CREATE TABLE IF NOT EXISTS pur.purchase_invoice_lines (
  id                   uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id           uuid NOT NULL,
  purchase_invoice_id  uuid NOT NULL,
  line_no              int NOT NULL DEFAULT 1,
  item_type            text NOT NULL DEFAULT 'EXPENSE' CHECK (item_type IN ('EXPENSE', 'SERVICE', 'GOODS', 'SOFTWARE_LICENSE', 'SERVER_HOSTING', 'EQUIPMENT', 'SUBCONTRACTOR')),
  description          text NOT NULL,
  expense_account_id   uuid NOT NULL,
  project_id           uuid NULL,
  cost_center_id       uuid NULL,
  quantity             numeric(12,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price           numeric(20,4) NOT NULL DEFAULT 0,
  discount_amount      numeric(20,4) NOT NULL DEFAULT 0,
  vat_rate             numeric(5,2) NOT NULL DEFAULT 15.00,
  subtotal             numeric(20,4) NOT NULL DEFAULT 0,
  vat_amount           numeric(20,4) NOT NULL DEFAULT 0,
  total_amount         numeric(20,4) NOT NULL DEFAULT 0,
  subtotal_base        numeric(20,4) NOT NULL DEFAULT 0,
  vat_amount_base      numeric(20,4) NOT NULL DEFAULT 0,
  total_amount_base    numeric(20,4) NOT NULL DEFAULT 0,
  FOREIGN KEY (purchase_invoice_id, company_id) REFERENCES pur.purchase_invoices(id, company_id) ON DELETE CASCADE,
  FOREIGN KEY (expense_account_id, company_id)  REFERENCES acc.accounts(id, company_id),
  FOREIGN KEY (project_id, company_id)          REFERENCES prj.projects(id, company_id),
  FOREIGN KEY (cost_center_id, company_id)      REFERENCES core.cost_centers(id, company_id)
);
CREATE INDEX IF NOT EXISTS ix_pur_lines_invoice ON pur.purchase_invoice_lines (purchase_invoice_id);

-- 6. Audit & Triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pur.vendors','pur.purchase_invoices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch ON %s', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('pur.vendors');
SELECT audit.enable('pur.purchase_invoices');
SELECT audit.enable('pur.purchase_invoice_lines');

-- 7. Define IAM Permissions for Purchases
SELECT iam.def_perms('pur', 'vendor', ARRAY['view', 'create', 'edit', 'delete'], 'الموردين', 'Vendors');
SELECT iam.def_perms('pur', 'invoice', ARRAY['view', 'create', 'edit', 'post', 'cancel'], 'فواتير المشتريات والمصروفات', 'Purchase Invoices');
SELECT iam.def_perms('pur', 'debit_note', ARRAY['view', 'create', 'post'], 'إشعارات مدينة (مردودات مشتريات)', 'Debit Notes');

-- 8. Assign all new permissions to CFO, Accountant, and Executive roles
INSERT INTO iam.role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM iam.roles r
 CROSS JOIN iam.permissions p
 WHERE r.code IN ('CFO', 'ACCOUNTANT', 'EXECUTIVE') AND p.module = 'pur'
ON CONFLICT DO NOTHING;
