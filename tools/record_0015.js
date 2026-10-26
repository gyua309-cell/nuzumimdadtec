const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('pg');

const fileContent = fs.readFileSync('e:/برنامج الموارد البشرية الجديد/apps/api/db/migrations/0015_custody_petty_cash_and_fx.sql', 'utf8');
const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');

async function recordMigration(dbUrl) {
  const client = new Client(dbUrl);
  await client.connect();
  const exists = await client.query('SELECT 1 FROM public.schema_migrations WHERE filename = $1', ['0015_custody_petty_cash_and_fx.sql']);
  if (exists.rowCount === 0) {
    await client.query('INSERT INTO public.schema_migrations (filename, checksum, applied_at) VALUES ($1, $2, now())', ['0015_custody_petty_cash_and_fx.sql', checksum]);
  } else {
    await client.query('UPDATE public.schema_migrations SET checksum = $2 WHERE filename = $1', ['0015_custody_petty_cash_and_fx.sql', checksum]);
  }
  await client.end();
}

Promise.all([
  recordMigration('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham'),
  recordMigration('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham_test')
]).then(() => {
  console.log('Successfully recorded 0015 in schema_migrations in both DBs!');
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
