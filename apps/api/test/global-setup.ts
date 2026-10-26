import { Client } from 'pg';
import { env } from '../src/config/env';
import { migrate } from '../src/infrastructure/db/migrator';

/**
 * Integration tests run against a REAL PostgreSQL database (idham_test).
 * The schema is dropped and rebuilt from the migrations before every run.
 */
export default async function globalSetup(): Promise<void> {
  const url = env().TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not configured');
  if (!/idham_test/.test(url)) throw new Error('Refusing to reset a database whose name does not contain "idham_test"');
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`DO $$ DECLARE s text; BEGIN
      FOREACH s IN ARRAY ARRAY['sys','audit','core','iam','acc','hr','prj','pay','ast','rev','exp','cst','wf','rpt'] LOOP
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', s);
      END LOOP; END $$`);
    await c.query('DROP TABLE IF EXISTS public.schema_migrations');
  } finally {
    await c.end();
  }
  await migrate(url, () => undefined);
}
