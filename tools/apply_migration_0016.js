const fs = require('fs');
const crypto = require('crypto');
const { Client } = require('pg');

const fileContent = fs.readFileSync('e:/برنامج الموارد البشرية الجديد/apps/api/db/migrations/0016_assignment_billing_and_cost_centers.sql', 'utf8');
const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');

async function migrate(dbUrl, name) {
  const client = new Client(dbUrl);
  await client.connect();
  console.log(`Applying 0016 to ${name}...`);
  await client.query(fileContent);

  const exists = await client.query('SELECT 1 FROM public.schema_migrations WHERE filename = $1', ['0016_assignment_billing_and_cost_centers.sql']);
  if (exists.rowCount === 0) {
    await client.query('INSERT INTO public.schema_migrations (filename, checksum, applied_at) VALUES ($1, $2, now())', ['0016_assignment_billing_and_cost_centers.sql', checksum]);
  } else {
    await client.query('UPDATE public.schema_migrations SET checksum = $2 WHERE filename = $1', ['0016_assignment_billing_and_cost_centers.sql', checksum]);
  }

  console.log(`Successfully migrated and recorded 0016 in ${name}!`);
  await client.end();
}

Promise.all([
  migrate('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham', 'idham'),
  migrate('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham_test', 'idham_test')
]).then(() => {
  console.log('ALL DONE migrating 0016!');
}).catch(console.error);
