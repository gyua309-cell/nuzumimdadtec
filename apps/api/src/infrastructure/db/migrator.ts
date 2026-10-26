import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../db/migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies ordered SQL migrations. Each file runs in its own transaction and is
 * recorded with a checksum; editing an applied migration is rejected (create a
 * new migration instead). A session advisory lock prevents concurrent runs.
 */
export async function migrate(databaseUrl: string, log: (m: string) => void = console.log): Promise<MigrationResult> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await client.query('SELECT pg_advisory_lock(727274001)');
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename   text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now())`);

    const appliedRows = await client.query<{ filename: string; checksum: string }>(
      'SELECT filename, checksum FROM public.schema_migrations',
    );
    const applied = new Map(appliedRows.rows.map((r) => [r.filename, r.checksum]));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const existing = applied.get(file);
      if (existing) {
        if (existing !== checksum) {
          throw new Error(`Migration ${file} was modified after being applied (checksum mismatch).`);
        }
        result.skipped.push(file);
        continue;
      }
      log(`[migrate] applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migrations(filename, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        result.applied.push(file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274001)').catch(() => undefined);
    await client.end();
  }
}
