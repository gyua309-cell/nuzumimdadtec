const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function check() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query("SELECT id, code, name_ar, subtype FROM acc.accounts WHERE code LIKE '11%' OR subtype IN ('BANK', 'CASH')");
  console.table(r.rows);
  await c.end();
}

check().catch(console.error);
