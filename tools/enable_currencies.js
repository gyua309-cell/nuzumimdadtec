const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function run() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`
    INSERT INTO core.company_currencies (company_id, currency_code)
    SELECT id, 'EGP' FROM core.companies ON CONFLICT DO NOTHING;
    INSERT INTO core.company_currencies (company_id, currency_code)
    SELECT id, 'USD' FROM core.companies ON CONFLICT DO NOTHING;
  `);
  const r = await c.query('SELECT * FROM core.company_currencies');
  console.log('Company Currencies:', r.rows);
  await c.end();
}

run().catch(console.error);
