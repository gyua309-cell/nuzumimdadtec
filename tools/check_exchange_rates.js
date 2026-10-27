const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function check() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query('SELECT rate_date, from_currency, to_currency, rate_type, rate, source FROM core.exchange_rates ORDER BY rate_date DESC LIMIT 10');
  console.table(r.rows);
  await c.end();
}

check().catch(console.error);
