const { Client } = require('pg');

async function check() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const cols = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'exchange_rates'");
  console.log('exchange_rates columns:', cols.rows.map(r => r.column_name));

  await client.end();
}

check().catch(console.error);
