const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function check() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const entries = await c.query("SELECT id, entry_no, entry_date, journal_type, description, total_debit_base FROM acc.journal_entries WHERE entry_no IN ('JE-2026-000002', 'JE-2026-000003')");
  console.log('--- JOURNAL ENTRIES ---');
  console.table(entries.rows);

  for (const e of entries.rows) {
    const lines = await c.query(`
      SELECT l.line_no, a.code, a.name_ar, l.currency_code, l.exchange_rate, l.debit_tx, l.credit_tx, l.debit_base, l.credit_base, l.description
        FROM acc.journal_lines l
        JOIN acc.accounts a ON a.id = l.account_id
       WHERE l.entry_id = $1
       ORDER BY l.line_no
    `, [e.id]);
    console.log(`\nLines for ${e.entry_no} (${e.description}):`);
    console.table(lines.rows);
  }

  await c.end();
}

check().catch(console.error);
