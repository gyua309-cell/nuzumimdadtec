const { Client } = require('pg');

async function seedRates(dbUrl) {
  const client = new Client(dbUrl);
  await client.connect();

  const companies = await client.query('SELECT id, base_currency_code FROM core.companies');
  for (const c of companies.rows) {
    await client.query(`
      INSERT INTO core.exchange_rates (company_id, from_currency, to_currency, rate_type, rate_date, rate, source)
      VALUES
        ($1, 'SAR', 'EGP', 'SPOT', '2026-01-01', 13.150000, 'CENTRAL_BANK'),
        ($1, 'USD', 'EGP', 'SPOT', '2026-01-01', 49.250000, 'CENTRAL_BANK'),
        ($1, 'EUR', 'EGP', 'SPOT', '2026-01-01', 53.500000, 'CENTRAL_BANK')
      ON CONFLICT DO NOTHING
    `, [c.id]);
  }

  await client.end();
}

Promise.all([
  seedRates('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham'),
  seedRates('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham_test')
]).then(() => console.log('Successfully seeded exchange rates!')).catch(console.error);
