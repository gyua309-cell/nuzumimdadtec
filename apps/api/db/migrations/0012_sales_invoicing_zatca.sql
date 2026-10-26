-- =============================================================================
-- 0012  Sales Invoicing, Credit Notes (Returns), and ZATCA E-Invoicing Engine
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS sal;

-- -----------------------------------------------------------------------------
-- Sales Invoices (Standard B2B Tax Invoices, Simplified B2C, Credit/Debit Notes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.invoices (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES core.companies(id),
  invoice_no              text NOT NULL,
  invoice_type            text NOT NULL DEFAULT 'TAX_INVOICE'
                          CHECK (invoice_type IN ('TAX_INVOICE', 'SIMPLIFIED', 'CREDIT_NOTE', 'DEBIT_NOTE')),
  invoice_sub_type        text NOT NULL DEFAULT 'STANDARD'
                          CHECK (invoice_sub_type IN ('STANDARD', 'THIRD_PARTY', 'NOMINAL', 'EXPORTS', 'SUMMARY')),
  client_id               uuid NOT NULL REFERENCES prj.clients(id),
  project_id              uuid REFERENCES prj.projects(id),
  fiscal_period_id        uuid NOT NULL REFERENCES core.fiscal_periods(id),
  issue_date              date NOT NULL DEFAULT current_date,
  issue_time              timestamptz NOT NULL DEFAULT now(),
  due_date                date,
  currency_code           char(3) NOT NULL DEFAULT 'SAR',
  exchange_rate           numeric(20,10) NOT NULL DEFAULT 1,
  original_invoice_id     uuid REFERENCES sal.invoices(id),
  return_reason           text,
  
  -- Financial totals (in transaction currency)
  subtotal                numeric(18,4) NOT NULL DEFAULT 0,
  discount_amount         numeric(18,4) NOT NULL DEFAULT 0,
  taxable_amount          numeric(18,4) NOT NULL DEFAULT 0,
  vat_rate                numeric(8,4) NOT NULL DEFAULT 15.00,
  vat_amount              numeric(18,4) NOT NULL DEFAULT 0,
  total_amount            numeric(18,4) NOT NULL DEFAULT 0,
  
  -- Financial totals (in company base currency)
  subtotal_base           numeric(18,4) NOT NULL DEFAULT 0,
  vat_amount_base         numeric(18,4) NOT NULL DEFAULT 0,
  total_amount_base       numeric(18,4) NOT NULL DEFAULT 0,
  
  status                  text NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED', 'PAID', 'PARTIALLY_PAID')),
  payment_status          text NOT NULL DEFAULT 'UNPAID'
                          CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID')),
  paid_amount             numeric(18,4) NOT NULL DEFAULT 0,
  journal_entry_id        uuid REFERENCES acc.journal_entries(id),
  notes                   text,
  
  -- ZATCA (Fatoora Phase 1 & 2) E-Invoicing Metadata
  zatca_uuid              uuid NOT NULL DEFAULT gen_random_uuid(),
  zatca_icv               serial,
  zatca_pih               text NOT NULL DEFAULT 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjBmZTQ3NDhhNzk3NmU1NQ==',
  zatca_hash              text,
  zatca_qr_code           text,
  zatca_status            text NOT NULL DEFAULT 'NOT_SUBMITTED'
                          CHECK (zatca_status IN ('NOT_SUBMITTED', 'CLEARED', 'REPORTED', 'REJECTED', 'WARNING')),
  zatca_compliance_status text NOT NULL DEFAULT 'PASS'
                          CHECK (zatca_compliance_status IN ('PASS', 'WARNING', 'FAIL')),
  zatca_response          jsonb,
  zatca_submitted_at      timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES iam.users(id),
  updated_by              uuid REFERENCES iam.users(id),
  row_version             integer NOT NULL DEFAULT 1,
  UNIQUE (company_id, invoice_no)
);

CREATE INDEX IF NOT EXISTS idx_sal_inv_company ON sal.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_sal_inv_client ON sal.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_sal_inv_project ON sal.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_sal_inv_period ON sal.invoices(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_sal_inv_status ON sal.invoices(status);

-- -----------------------------------------------------------------------------
-- Sales Invoice Lines
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.invoice_lines (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id              uuid NOT NULL REFERENCES sal.invoices(id) ON DELETE CASCADE,
  line_no                 integer NOT NULL,
  revenue_line_id         uuid REFERENCES rev.revenue_lines(id),
  employee_id             uuid REFERENCES hr.employees(id),
  description             text NOT NULL,
  quantity                numeric(12,4) NOT NULL DEFAULT 1,
  unit_price              numeric(18,4) NOT NULL,
  discount_pct            numeric(8,4) NOT NULL DEFAULT 0,
  subtotal                numeric(18,4) NOT NULL,
  vat_rate                numeric(8,4) NOT NULL DEFAULT 15.00,
  vat_amount              numeric(18,4) NOT NULL,
  total                   numeric(18,4) NOT NULL,
  vat_category            text NOT NULL DEFAULT 'S' CHECK (vat_category IN ('S', 'Z', 'E', 'O')),
  vat_exemption_reason    text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_sal_lines_inv ON sal.invoice_lines(invoice_id);

-- -----------------------------------------------------------------------------
-- Register Accounting Posting Events for Sales and Returns
-- -----------------------------------------------------------------------------
INSERT INTO acc.posting_events (code, module, description_ar, description_en, amount_keys, account_sources)
VALUES
  ('SAL.INVOICE',     'sal', 'فاتورة مبيعات وخدمات مشاريع',   'Sales & Project Invoice', ARRAY['total','subtotal','vat'], ARRAY['FROM_CLIENT', 'FIXED', 'FROM_TAX_CODE']::text[]),
  ('SAL.CREDIT_NOTE', 'sal', 'إشعار دائن ومردودات مبيعات',    'Sales Return / Credit Note', ARRAY['total','subtotal','vat'], ARRAY['FROM_CLIENT', 'FIXED', 'FROM_TAX_CODE']::text[])
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Client Tax and ZATCA Profile columns if not existing
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='prj' AND table_name='clients' AND column_name='vat_number') THEN
    ALTER TABLE prj.clients ADD COLUMN vat_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='prj' AND table_name='clients' AND column_name='cr_number') THEN
    ALTER TABLE prj.clients ADD COLUMN cr_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='prj' AND table_name='clients' AND column_name='street_address') THEN
    ALTER TABLE prj.clients ADD COLUMN street_address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='prj' AND table_name='clients' AND column_name='district') THEN
    ALTER TABLE prj.clients ADD COLUMN district text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='prj' AND table_name='clients' AND column_name='city') THEN
    ALTER TABLE prj.clients ADD COLUMN city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='prj' AND table_name='clients' AND column_name='postal_code') THEN
    ALTER TABLE prj.clients ADD COLUMN postal_code text;
  END IF;
END $$;

SELECT iam.def_perms('sal','invoice', ARRAY['view','create','edit','delete','approve','post','cancel','export','print'], 'فواتير ومردودات المبيعات والزكاة','Sales Invoices and ZATCA');

