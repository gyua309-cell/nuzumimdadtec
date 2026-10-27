const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function check() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query('SELECT code, name_ar, account_class, subtype, is_posting FROM acc.accounts ORDER BY code');
  console.table(r.rows);
  await c.end();
}

check().catch(console.error);
