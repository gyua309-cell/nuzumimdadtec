-- =============================================================================
-- 0022  ZATCA Fatoora Phase 2 (Integration Phase) Enterprise Schema
--       100% Additive — Preserves ALL historical invoices & posted GL entries.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend sal.zatca_settings with Full Saudi National Address & API Config
-- -----------------------------------------------------------------------------
ALTER TABLE sal.zatca_settings
  ADD COLUMN IF NOT EXISTS organization_name_ar     text NULL,
  ADD COLUMN IF NOT EXISTS organization_name_en     text NULL,
  ADD COLUMN IF NOT EXISTS building_number          text NULL,
  ADD COLUMN IF NOT EXISTS street_name              text NULL,
  ADD COLUMN IF NOT EXISTS district                 text NULL,
  ADD COLUMN IF NOT EXISTS city                     text NULL,
  ADD COLUMN IF NOT EXISTS postal_code              text NULL,
  ADD COLUMN IF NOT EXISTS additional_number        text NULL,
  ADD COLUMN IF NOT EXISTS country_code             char(2) NOT NULL DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS entity_type              text NOT NULL DEFAULT 'LLC',
  ADD COLUMN IF NOT EXISTS business_category        text NOT NULL DEFAULT 'Information Technology & Consulting',
  ADD COLUMN IF NOT EXISTS default_branch_id        uuid NULL REFERENCES core.branches(id),
  ADD COLUMN IF NOT EXISTS currency_code            char(3) NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS invoicing_type           text NOT NULL DEFAULT 'BOTH'
    CHECK (invoicing_type IN ('STANDARD', 'SIMPLIFIED', 'BOTH')),
  ADD COLUMN IF NOT EXISTS zatca_effective_date     date NULL,
  ADD COLUMN IF NOT EXISTS contact_email            text NULL,
  ADD COLUMN IF NOT EXISTS contact_phone            text NULL,
  ADD COLUMN IF NOT EXISTS sandbox_base_url         text NOT NULL DEFAULT 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  ADD COLUMN IF NOT EXISTS simulation_base_url      text NOT NULL DEFAULT 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  ADD COLUMN IF NOT EXISTS production_base_url      text NOT NULL DEFAULT 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
  ADD COLUMN IF NOT EXISTS api_version              text NOT NULL DEFAULT 'V2',
  ADD COLUMN IF NOT EXISTS connection_status        text NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (connection_status IN ('DISCONNECTED', 'CONNECTED', 'WARNING', 'ERROR')),
  ADD COLUMN IF NOT EXISTS last_connection_test_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_connection_message  text NULL,
  ADD COLUMN IF NOT EXISTS retry_max_attempts       int NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS retry_backoff_seconds    int NOT NULL DEFAULT 60;

-- -----------------------------------------------------------------------------
-- 2. Extend prj.clients for Structured Buyer National Address & B2B/B2C Type
-- -----------------------------------------------------------------------------
ALTER TABLE prj.clients
  ADD COLUMN IF NOT EXISTS building_number          text NULL,
  ADD COLUMN IF NOT EXISTS additional_number        text NULL,
  ADD COLUMN IF NOT EXISTS country_code             char(2) NOT NULL DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS buyer_type               text NOT NULL DEFAULT 'B2B'
    CHECK (buyer_type IN ('B2B', 'B2C')),
  ADD COLUMN IF NOT EXISTS id_scheme                text NOT NULL DEFAULT 'CRN'
    CHECK (id_scheme IN ('CRN', 'TIN', 'NAT', 'IQA', 'MOM', 'MLS', 'SAG', 'OTH'));

-- -----------------------------------------------------------------------------
-- 3. Multi-Branch, Environment-Isolated EGS Devices & Encrypted Certificates
--    NOTE: private_key & csid_secret are ALWAYS stored AES-256-GCM encrypted
--    by ZatcaCryptoVaultService and NEVER returned to frontend API responses.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.zatca_egs_devices (
  id                          uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id                  uuid NOT NULL REFERENCES core.companies(id),
  branch_id                   uuid NULL REFERENCES core.branches(id),
  branch_code                 text NULL,
  device_code                 text NOT NULL,
  device_name                 text NOT NULL,
  device_type                 text NOT NULL DEFAULT 'ERP_CLOUD'
    CHECK (device_type IN ('ERP_CLOUD', 'POS', 'BRANCH_TERMINAL', 'API_GATEWAY')),
  environment                 text NOT NULL DEFAULT 'SANDBOX'
    CHECK (environment IN ('SANDBOX', 'SIMULATION', 'PRODUCTION')),
  vat_number                  text NOT NULL,
  cr_number                   text NULL,
  serial_number               text NOT NULL,
  invoicing_type_code         text NOT NULL DEFAULT '1100'
    CHECK (invoicing_type_code IN ('1100', '1000', '0100')),
  csr_pem                     text NULL,
  csr_base64                  text NULL,
  encrypted_private_key       text NULL,
  public_key_pem              text NULL,
  compliance_request_id       text NULL,
  compliance_csid_token       text NULL,
  encrypted_compliance_secret text NULL,
  compliance_checks_passed    jsonb NOT NULL DEFAULT '{}'::jsonb,
  production_request_id       text NULL,
  production_csid_token       text NULL,
  encrypted_production_secret text NULL,
  certificate_status          text NOT NULL DEFAULT 'NOT_ONBOARDED'
    CHECK (certificate_status IN ('NOT_ONBOARDED', 'CSR_GENERATED', 'COMPLIANCE', 'PRODUCTION', 'EXPIRED', 'REVOKED')),
  connection_status           text NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (connection_status IN ('DISCONNECTED', 'CONNECTED', 'WARNING', 'ERROR')),
  device_status               text NOT NULL DEFAULT 'ACTIVE'
    CHECK (device_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  icv_counter                 bigint NOT NULL DEFAULT 0,
  last_pih                    text NOT NULL DEFAULT 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjBmZTQ3NDhhNzk3NmU1NQ==',
  registered_at               timestamptz NOT NULL DEFAULT now(),
  csid_issued_at              timestamptz NULL,
  csid_expires_at             timestamptz NULL,
  last_tested_at              timestamptz NULL,
  last_test_result            jsonb NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NULL,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid NULL,
  row_version                 int NOT NULL DEFAULT 1,
  UNIQUE (company_id, environment, device_code),
  UNIQUE (company_id, environment, serial_number)
);
CREATE INDEX IF NOT EXISTS ix_zatca_egs_company_env ON sal.zatca_egs_devices (company_id, environment, device_status);
CREATE INDEX IF NOT EXISTS ix_zatca_egs_branch ON sal.zatca_egs_devices (company_id, branch_id);

-- -----------------------------------------------------------------------------
-- 4. Expand sal.invoices ZATCA Status Engine (15 Unified States) & Protection
--    Does NOT alter existing amounts, invoice_no, or journal_entry_id!
-- -----------------------------------------------------------------------------
ALTER TABLE sal.invoices DROP CONSTRAINT IF EXISTS invoices_zatca_status_check;
ALTER TABLE sal.invoices
  ADD CONSTRAINT invoices_zatca_status_check CHECK (
    zatca_status IN (
      'NOT_SUBMITTED', 'WARNING',
      'DRAFT', 'READY', 'VALIDATION_FAILED', 'PENDING_SUBMISSION',
      'SUBMITTED', 'PROCESSING', 'REPORTED', 'CLEARED', 'ACCEPTED',
      'REJECTED', 'FAILED', 'RETRY_PENDING', 'CANCELLED',
      'CREDIT_NOTE_ISSUED', 'DEBIT_NOTE_ISSUED'
    )
  );

ALTER TABLE sal.invoices
  ADD COLUMN IF NOT EXISTS egs_device_id          uuid NULL REFERENCES sal.zatca_egs_devices(id),
  ADD COLUMN IF NOT EXISTS branch_id              uuid NULL REFERENCES core.branches(id),
  ADD COLUMN IF NOT EXISTS zatca_environment      text NULL CHECK (zatca_environment IN ('SANDBOX', 'SIMULATION', 'PRODUCTION')),
  ADD COLUMN IF NOT EXISTS zatca_submission_type  text NULL CHECK (zatca_submission_type IN ('CLEARANCE', 'REPORTING')),
  ADD COLUMN IF NOT EXISTS zatca_response_code    text NULL,
  ADD COLUMN IF NOT EXISTS zatca_response_message text NULL,
  ADD COLUMN IF NOT EXISTS zatca_signed_xml       text NULL,
  ADD COLUMN IF NOT EXISTS zatca_cleared_xml      text NULL,
  ADD COLUMN IF NOT EXISTS zatca_retry_count      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zatca_last_attempt_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS zatca_responded_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS zatca_request_id       text NULL,
  ADD COLUMN IF NOT EXISTS zatca_locked           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS zatca_is_historical    boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_sal_inv_zatca_status ON sal.invoices (company_id, zatca_status, issue_date DESC);
CREATE INDEX IF NOT EXISTS ix_sal_inv_zatca_uuid ON sal.invoices (company_id, zatca_uuid);

-- -----------------------------------------------------------------------------
-- 5. Expand sal.zatca_submissions (Append-Only Audit Operation Log)
-- -----------------------------------------------------------------------------
ALTER TABLE sal.zatca_submissions DROP CONSTRAINT IF EXISTS zatca_submissions_status_check;
ALTER TABLE sal.zatca_submissions
  ADD CONSTRAINT zatca_submissions_status_check CHECK (
    status IN (
      'PENDING', 'SENT', 'PROCESSING', 'CLEARED', 'REPORTED', 'ACCEPTED',
      'REJECTED', 'ERROR', 'FAILED', 'RETRY_PENDING', 'VALIDATION_FAILED', 'WARNING'
    )
  );

ALTER TABLE sal.zatca_submissions
  ADD COLUMN IF NOT EXISTS egs_device_id        uuid NULL REFERENCES sal.zatca_egs_devices(id),
  ADD COLUMN IF NOT EXISTS branch_id            uuid NULL REFERENCES core.branches(id),
  ADD COLUMN IF NOT EXISTS invoice_uuid         uuid NULL,
  ADD COLUMN IF NOT EXISTS operation            text NOT NULL DEFAULT 'TRANSMIT',
  ADD COLUMN IF NOT EXISTS http_status_code     int NULL,
  ADD COLUMN IF NOT EXISTS response_code        text NULL,
  ADD COLUMN IF NOT EXISTS response_message     text NULL,
  ADD COLUMN IF NOT EXISTS request_meta         jsonb NULL,
  ADD COLUMN IF NOT EXISTS responded_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key      text NULL,
  ADD COLUMN IF NOT EXISTS validation_warnings  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_errors    jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ix_zatca_sub_company_date ON sal.zatca_submissions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_zatca_sub_status ON sal.zatca_submissions (company_id, status);

-- -----------------------------------------------------------------------------
-- 6. Unified Status Transition History (Every State Change Recorded)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.zatca_status_history (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id    uuid NOT NULL REFERENCES core.companies(id),
  invoice_id    uuid NOT NULL REFERENCES sal.invoices(id),
  from_status   text NULL,
  to_status     text NOT NULL,
  response_code text NULL,
  message       text NULL,
  request_id    text NULL,
  details       jsonb NULL,
  changed_by    uuid NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_zatca_hist_invoice ON sal.zatca_status_history (company_id, invoice_id, occurred_at DESC);

-- -----------------------------------------------------------------------------
-- 7. Idempotent Retry Queue (Prevents Duplicate UUID / Duplicate Submission)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.zatca_retry_queue (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id          uuid NOT NULL REFERENCES core.companies(id),
  invoice_id          uuid NOT NULL REFERENCES sal.invoices(id),
  invoice_uuid        uuid NOT NULL,
  egs_device_id       uuid NULL REFERENCES sal.zatca_egs_devices(id),
  environment         text NOT NULL CHECK (environment IN ('SANDBOX', 'SIMULATION', 'PRODUCTION')),
  idempotency_key     text NOT NULL,
  attempt_count       int NOT NULL DEFAULT 1,
  max_attempts        int NOT NULL DEFAULT 5,
  next_retry_at       timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  last_error_code     text NULL,
  last_error_message  text NULL,
  status              text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS ix_zatca_retry_due ON sal.zatca_retry_queue (company_id, status, next_retry_at);

-- -----------------------------------------------------------------------------
-- 8. Protected Document Artifact Store (XML / Signed XML / Cleared XML / QR / PDF)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.zatca_documents (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id      uuid NOT NULL REFERENCES core.companies(id),
  invoice_id      uuid NOT NULL REFERENCES sal.invoices(id),
  doc_kind        text NOT NULL
    CHECK (doc_kind IN ('RAW_XML', 'SIGNED_XML', 'CLEARED_XML', 'QR_TLV', 'ZATCA_RESPONSE', 'PDF_SNAPSHOT')),
  sha256_checksum text NOT NULL,
  mime_type       text NOT NULL,
  content_text    text NULL,
  content_base64  text NULL,
  size_bytes      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NULL,
  UNIQUE (invoice_id, doc_kind)
);
CREATE INDEX IF NOT EXISTS ix_zatca_docs_invoice ON sal.zatca_documents (company_id, invoice_id);

-- -----------------------------------------------------------------------------
-- 9. ZATCA Notifications Engine Table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sal.zatca_notifications (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id    uuid NOT NULL REFERENCES core.companies(id),
  invoice_id    uuid NULL REFERENCES sal.invoices(id),
  egs_device_id uuid NULL REFERENCES sal.zatca_egs_devices(id),
  category      text NOT NULL
    CHECK (category IN ('SUBMISSION_OK', 'CLEARED', 'REPORTED', 'REJECTED', 'CONNECTION_FAILED', 'CERT_EXPIRY', 'PENDING_INVOICES', 'RETRY_NEEDED', 'SYSTEM')),
  severity      text NOT NULL DEFAULT 'INFO'
    CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL')),
  title_ar      text NOT NULL,
  message_ar    text NOT NULL,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_zatca_notif_company ON sal.zatca_notifications (company_id, is_read, created_at DESC);

-- -----------------------------------------------------------------------------
-- 10. Register SAL.DEBIT_NOTE Accounting Event (Matches SAL.INVOICE Rule)
-- -----------------------------------------------------------------------------
INSERT INTO acc.posting_events (code, module, description_ar, description_en, amount_keys, account_sources)
VALUES
  ('SAL.DEBIT_NOTE', 'sal', 'إشعار مدين مبيعات وخدمات', 'Sales Debit Note', ARRAY['total','subtotal','vat'], ARRAY['FROM_CLIENT', 'FIXED', 'FROM_TAX_CODE']::text[])
ON CONFLICT (code) DO NOTHING;

-- Audit triggers for new tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sal.zatca_egs_devices', 'sal.zatca_retry_queue'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch ON %s', t);
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION sys.trg_touch()', t);
  END LOOP;
END $$;

SELECT audit.enable('sal.zatca_egs_devices');
SELECT audit.enable('sal.zatca_status_history');
SELECT audit.enable('sal.zatca_retry_queue');
SELECT audit.enable('sal.zatca_documents');
