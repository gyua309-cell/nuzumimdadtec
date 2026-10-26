const { Client } = require('pg');

async function main() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const compId = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';

  const emps = await client.query('SELECT id, code, full_name_ar FROM hr.employees WHERE company_id = $1', [compId]);
  const rates = {
    'EMP-001': 2200,
    'EMP-002': 1800,
    'EMP-101': 1400,
    'EMP-102': 1200,
    'EMP-103': 1500,
    'EMP-104': 950,
  };

  for (const emp of emps.rows) {
    const rate = rates[emp.code] || 1200;
    await client.query(`
      UPDATE prj.assignments
      SET billable_rate = $1, billing_basis = 'DAILY', billing_currency = 'SAR'
      WHERE company_id = $2 AND employee_id = $3
    `, [rate, compId, emp.id]);

    // Also populate prj.service_prices
    const existing = await client.query('SELECT id FROM prj.service_prices WHERE company_id = $1 AND employee_id = $2', [compId, emp.id]);
    if (existing.rowCount === 0) {
      await client.query(`
        INSERT INTO prj.service_prices (company_id, employee_id, pricing_basis, price, currency_code, effective_from, reason)
        VALUES ($1, $2, 'DAILY', $3, 'SAR', '2026-01-01', 'سعر البيع المعتمد للعميل في تعاقدات التقنية')
      `, [compId, emp.id, rate]);
    } else {
      await client.query(`
        UPDATE prj.service_prices SET price = $3 WHERE company_id = $1 AND employee_id = $2
      `, [compId, emp.id, rate]);
    }
    console.log(`Updated rate for ${emp.code} (${emp.full_name_ar}) -> ${rate} SAR/day`);
  }

  await client.end();
}

main().catch(console.error);
