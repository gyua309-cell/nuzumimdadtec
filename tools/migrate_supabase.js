const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';
const migrationsDir = path.join(__dirname, '..', 'apps', 'api', 'db', 'migrations');

async function run() {
  console.log('Connecting to Supabase PostgreSQL...');
  const client = new Client({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected successfully!');

  try {
    // 1. Ensure schema_migrations table and uuidv7 function exist
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid AS $$
      DECLARE
        unix_time_ms bytea;
        uuid_bytes bytea;
      BEGIN
        unix_time_ms := substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3 for 6);
        uuid_bytes := unix_time_ms || gen_random_bytes(10);
        uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
        uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
        RETURN encode(uuid_bytes, 'hex')::uuid;
      END;
      $$ LANGUAGE plpgsql VOLATILE;

      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 2. Fetch applied migrations
    const appliedRes = await client.query('SELECT filename, checksum FROM public.schema_migrations');
    const appliedMap = new Map(appliedRes.rows.map(r => [r.filename, r.checksum]));

    // 3. Read all migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    console.log(`Found ${files.length} migrations to check.`);

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');

      if (appliedMap.has(file)) {
        console.log(`[SKIPPED] ${file} (already applied)`);
        continue;
      }

      console.log(`[APPLYING] ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
        await client.query('COMMIT');
        console.log(`[SUCCESS]  ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[ERROR] Failed to apply ${file}:`, err.message);
        throw err;
      }
    }

    console.log('==============================================');
    console.log('ALL MIGRATIONS APPLIED SUCCESSFULLY TO SUPABASE!');
    console.log('==============================================');
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('Migration aborted:', err);
  process.exit(1);
});
