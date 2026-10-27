const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function check() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query('SELECT id, username, email, full_name, status, is_system_admin FROM iam.users');
  console.table(r.rows);
  await c.end();
}

check().catch(console.error);
