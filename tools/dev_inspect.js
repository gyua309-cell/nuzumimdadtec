const { Client } = require('pg');
const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
client.connect().then(async () => {
  const roles = await client.query("SELECT id, code, name_ar FROM iam.roles");
  console.log('Roles:', roles.rows);
  await client.end();
}).catch(console.error);
