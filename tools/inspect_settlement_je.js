const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function check() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const lines = await c.query(`
    SELECT l.line_no, a.code, a.name_ar, l.currency_code, l.exchange_rate, l.debit_tx, l.credit_tx, l.debit_base, l.credit_base, l.description
      FROM acc.journal_lines l
      JOIN acc.accounts a ON a.id = l.account_id
      JOIN acc.journal_entries e ON e.id = l.entry_id
     WHERE e.entry_no = 'JE-2026-000004'
     ORDER BY l.line_no
  `);
  console.log('Lines for JE-2026-000004 (Custody Settlement):');
  console.table(lines.rows);

  await c.end();
}

check().catch(console.error);
