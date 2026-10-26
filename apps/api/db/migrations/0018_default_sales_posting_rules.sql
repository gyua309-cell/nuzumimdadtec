-- =============================================================================
-- 0018  Default posting rules for sales invoices and credit notes
--
-- Sales invoices were being marked POSTED without a journal entry because no
-- SAL.INVOICE / SAL.CREDIT_NOTE rule existed (the error was silently swallowed).
-- Revenue and output VAT therefore never reached the ledger.
--
-- Accounts are FIXED (no FROM_CLIENT resolver is registered):
--   1200 receivables   4110 services revenue   2400 output VAT
-- A company is only seeded when all three accounts exist; otherwise its
-- accountant must create the rules from the posting-rules screen.
-- =============================================================================
DO $$
DECLARE
  comp      RECORD;
  ar_id     uuid;
  rev_id    uuid;
  vat_id    uuid;
  rule_id   uuid;
BEGIN
  FOR comp IN SELECT id FROM core.companies LOOP
    SELECT id INTO ar_id  FROM acc.accounts WHERE company_id = comp.id AND code = '1200' AND is_active;
    SELECT id INTO rev_id FROM acc.accounts WHERE company_id = comp.id AND code = '4110' AND is_active;
    SELECT id INTO vat_id FROM acc.accounts WHERE company_id = comp.id AND code = '2400' AND is_active;
    CONTINUE WHEN ar_id IS NULL OR rev_id IS NULL OR vat_id IS NULL;

    -- Sales invoice: Dr receivables (total) / Cr revenue (subtotal) / Cr output VAT (vat)
    IF NOT EXISTS (SELECT 1 FROM acc.posting_rules WHERE company_id = comp.id AND event_code = 'SAL.INVOICE' AND is_active) THEN
      INSERT INTO acc.posting_rules (company_id, event_code, name, ledger, effective_from)
      VALUES (comp.id, 'SAL.INVOICE', 'فاتورة مبيعات: ذمم العملاء / إيراد الخدمات / ضريبة المخرجات', 'FINANCIAL', DATE '2000-01-01')
      RETURNING id INTO rule_id;

      INSERT INTO acc.posting_rule_lines (rule_id, company_id, line_no, side, account_source, account_id, amount_key, dimension_policy)
      VALUES
        (rule_id, comp.id, 1, 'DEBIT',  'FIXED', ar_id,  'total',    'INHERIT_ALL'),
        (rule_id, comp.id, 2, 'CREDIT', 'FIXED', rev_id, 'subtotal', 'INHERIT_ALL'),
        (rule_id, comp.id, 3, 'CREDIT', 'FIXED', vat_id, 'vat',      'PARTY_ONLY');
    END IF;

    -- Credit note: Dr revenue (subtotal) / Dr output VAT (vat) / Cr receivables (total)
    IF NOT EXISTS (SELECT 1 FROM acc.posting_rules WHERE company_id = comp.id AND event_code = 'SAL.CREDIT_NOTE' AND is_active) THEN
      INSERT INTO acc.posting_rules (company_id, event_code, name, ledger, effective_from)
      VALUES (comp.id, 'SAL.CREDIT_NOTE', 'إشعار دائن: مردودات الإيراد / ضريبة المخرجات / ذمم العملاء', 'FINANCIAL', DATE '2000-01-01')
      RETURNING id INTO rule_id;

      INSERT INTO acc.posting_rule_lines (rule_id, company_id, line_no, side, account_source, account_id, amount_key, dimension_policy)
      VALUES
        (rule_id, comp.id, 1, 'DEBIT',  'FIXED', rev_id, 'subtotal', 'INHERIT_ALL'),
        (rule_id, comp.id, 2, 'DEBIT',  'FIXED', vat_id, 'vat',      'PARTY_ONLY'),
        (rule_id, comp.id, 3, 'CREDIT', 'FIXED', ar_id,  'total',    'INHERIT_ALL');
    END IF;
  END LOOP;
END $$;
