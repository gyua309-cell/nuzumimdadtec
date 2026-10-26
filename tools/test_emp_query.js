const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const emps = await client.query('SELECT id, code, full_name_ar FROM hr.employees ORDER BY code');
  for (const e of emps.rows) {
    const asgns = await client.query(`
      SELECT a.allocation_pct, a.allocated_days, p.code, p.name_ar 
      FROM prj.assignments a 
      JOIN prj.projects p ON p.id = a.project_id 
      WHERE a.employee_id = $1
    `, [e.id]);
    console.log(e.code, e.full_name_ar, '-> Assignments count:', asgns.rowCount);
    for (const a of asgns.rows) {
      console.log('   *', a.code, a.name_ar, a.allocation_pct + '%', a.allocated_days + 'd');
    }
  }

  await client.end();
}

main().catch(console.error);
