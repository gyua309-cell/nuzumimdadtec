const { Client } = require('pg');
const CO = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';
(async () => {
  const c = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await c.connect();
  const q = async (label, sql, p = []) => {
    try { const r = await c.query(sql, p); console.log(label, JSON.stringify(r.rows)); }
    catch (e) { console.log(label, 'ERROR:', e.message); }
  };
  await q('accounts', "SELECT code,name_ar,account_class,is_posting FROM acc.accounts WHERE company_id=$1 AND code IN ('6','6100','2450') ORDER BY code", [CO]);
  await q('zakat_settings', 'SELECT saudi_gulf_pct,foreign_pct,zakat_rate_pct,income_tax_rate_pct FROM acc.zakat_settings WHERE company_id=$1', [CO]);
  await q('zatca_settings', 'SELECT environment,csid_status FROM sal.zatca_settings WHERE company_id=$1', [CO]);
  await q('perms', "SELECT code FROM iam.permissions WHERE code LIKE 'acc.zakat.%' OR code LIKE 'sal.zatca.%' ORDER BY code");
  await q('fixed-assets sql', `SELECT SUM(l.debit_base - l.credit_base) AS amt FROM acc.journal_lines l JOIN acc.journal_entries e ON e.id=l.entry_id JOIN acc.accounts a ON a.id=l.account_id WHERE l.company_id=$1 AND e.status='POSTED' AND e.ledger='FINANCIAL' AND e.entry_date <= $2 AND a.subtype IN ('FIXED_ASSET','ACCUMULATED_DEPRECIATION')`, [CO, '2026-12-31']);
  await q('zakat-expense sql', `SELECT SUM(l.debit_base - l.credit_base) AS amt FROM acc.journal_lines l JOIN acc.journal_entries e ON e.id=l.entry_id JOIN acc.accounts a ON a.id=l.account_id WHERE l.company_id=$1 AND e.status='POSTED' AND e.ledger='FINANCIAL' AND e.entry_date BETWEEN $2 AND $3 AND a.code='6100'`, [CO, '2026-01-01', '2026-12-31']);
  await q('zatca status board sql', `SELECT zatca_status AS status, COUNT(*)::text AS n, COALESCE(SUM(total_amount_base),0)::text AS total FROM sal.invoices WHERE company_id=$1 AND status='POSTED' GROUP BY zatca_status`, [CO]);
  await q('invoice statuses (all)', 'SELECT status, zatca_status, COUNT(*) FROM sal.invoices GROUP BY 1,2');
  await q('no-client-vat sql', `SELECT COUNT(DISTINCT i.client_id)::text AS n FROM sal.invoices i JOIN prj.clients c ON c.id=i.client_id WHERE i.company_id=$1 AND i.invoice_type='TAX_INVOICE' AND (c.vat_number IS NULL OR c.vat_number='')`, [CO]);
  await q('company tax_number', 'SELECT tax_number FROM core.companies WHERE id=$1', [CO]);
  await c.end();
})();
