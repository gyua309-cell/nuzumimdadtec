const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const res = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_schema = 'prj' AND table_name = 'assignments'
    ORDER BY ordinal_position
  `);
  console.log('Columns of prj.assignments:');
  for (const c of res.rows) {
    console.log(` - ${c.column_name} (${c.data_type}) [nullable: ${c.is_nullable}, default: ${c.column_default}]`);
  }

  await client.end();
}

main().catch(console.error);
