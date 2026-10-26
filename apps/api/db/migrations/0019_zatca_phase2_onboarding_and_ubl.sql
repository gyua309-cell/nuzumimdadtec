-- =============================================================================
-- 0019  ZATCA Phase 2 EGS Onboarding, CSID Certificates & UBL 2.1 Storage
-- =============================================================================

ALTER TABLE sal.zatca_settings
  ADD COLUMN IF NOT EXISTS csid_token text NULL,
  ADD COLUMN IF NOT EXISTS csid_secret text NULL,
  ADD COLUMN IF NOT EXISTS private_key text NULL,
  ADD COLUMN IF NOT EXISTS public_key text NULL,
  ADD COLUMN IF NOT EXISTS certificate_csr text NULL,
  ADD COLUMN IF NOT EXISTS compliance_request_id text NULL,
  ADD COLUMN IF NOT EXISTS last_onboarded_at timestamptz NULL;

ALTER TABLE sal.invoices
  ADD COLUMN IF NOT EXISTS zatca_ubl_xml text NULL;

-- Ensure default values for company settings if missing
UPDATE sal.zatca_settings
   SET egs_unit_name = COALESCE(egs_unit_name, 'EGS-AZM-01'),
       egs_serial_no = COALESCE(egs_serial_no, 'AZM-KSA-2026-EGS-001'),
       vat_number = COALESCE(vat_number, '310123456700003'),
       cr_number = COALESCE(cr_number, '1010123456')
 WHERE egs_unit_name IS NULL OR egs_serial_no IS NULL;
