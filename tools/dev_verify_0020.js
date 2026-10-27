const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function verify() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('--- BRANCHES ---');
  const b = await c.query('SELECT code, name_ar, country_code, functional_currency, document_sequence_prefix, interbranch_account_id FROM core.branches');
  console.table(b.rows);

  console.log('--- ACCOUNTS ---');
  const a = await c.query("SELECT code, name_ar, account_class, subtype, currency_code FROM acc.accounts WHERE code IN ('1390','2390','3300','4310','5710') ORDER BY code");
  console.table(a.rows);

  console.log('--- NEW TABLES CHECK ---');
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'fin' AND table_name IN ('custody_transfers', 'custody_settlements')");
  console.table(t.rows);

  await c.end();
}

verify().catch(console.error);
