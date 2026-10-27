const { Client } = require('pg');

const c = new Client({
  connectionString: 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();
  console.log('Creating public.digest wrappers...');
  await c.query(`
    CREATE OR REPLACE FUNCTION public.digest(text, text) RETURNS bytea AS $$
      SELECT extensions.digest($1::bytea, $2);
    $$ LANGUAGE sql IMMUTABLE;

    CREATE OR REPLACE FUNCTION public.digest(bytea, text) RETURNS bytea AS $$
      SELECT extensions.digest($1, $2);
    $$ LANGUAGE sql IMMUTABLE;
  `);

  const res = await c.query("SELECT encode(digest('audit_test_string', 'sha256'), 'hex') as h;");
  console.log('SUCCESS: public.digest returned:', res.rows[0].h);
  await c.end();
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
