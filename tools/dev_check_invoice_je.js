const { Client } = require('pg');
(async () => {
  const c = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await c.connect();
  const q = async (l, s, p = []) => { try { console.log(l, JSON.stringify((await c.query(s, p)).rows)); } catch (e) { console.log(l, 'ERR', e.message); } };
  await q('invoices', 'SELECT invoice_no, status, total_amount_base, journal_entry_id IS NOT NULL AS has_je FROM sal.invoices');
  await q('SAL events rules', "SELECT event_code, name, is_active FROM acc.posting_rules WHERE event_code LIKE 'SAL.%'");
  await q('all rules by event', 'SELECT event_code, COUNT(*) FROM acc.posting_rules GROUP BY 1 ORDER BY 1');
  await q('posted JE count', "SELECT source_module, COUNT(*) FROM acc.journal_entries WHERE status='POSTED' GROUP BY 1");
  await c.end();
})();
