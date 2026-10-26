const { Client } = require('pg');

async function check() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham_test');
  await client.connect();

  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'hr' AND table_name = 'employees'");
  console.log('hr.employees cols in idham_test:', cols.rows.map(c => c.column_name));

  await client.end();
}

check().catch(console.error);
