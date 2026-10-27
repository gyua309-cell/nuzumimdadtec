const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function seed() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const compRes = await c.query('SELECT id FROM core.companies');
  const today = new Date().toISOString().slice(0, 10);
  const startOfYear = `${new Date().getFullYear()}-01-01`;

  for (const comp of compRes.rows) {
    const rates = [
      // SAR -> EGP (1 SAR = 13 EGP)
      { from: 'SAR', to: 'EGP', type: 'SPOT', date: today, rate: '13.0000000000', source: 'CENTRAL_BANK' },
      { from: 'SAR', to: 'EGP', type: 'SPOT', date: startOfYear, rate: '12.8000000000', source: 'CENTRAL_BANK' },
      { from: 'SAR', to: 'EGP', type: 'MONTHLY_AVG', date: today, rate: '12.9500000000', source: 'ERP_CALCULATED' },
      { from: 'SAR', to: 'EGP', type: 'CLOSING', date: today, rate: '13.0500000000', source: 'PERIOD_END' },

      // USD -> SAR (1 USD = 3.75 SAR)
      { from: 'USD', to: 'SAR', type: 'SPOT', date: today, rate: '3.7500000000', source: 'SAMA_OFFICIAL' },
      { from: 'USD', to: 'SAR', type: 'SPOT', date: startOfYear, rate: '3.7500000000', source: 'SAMA_OFFICIAL' },
      { from: 'USD', to: 'SAR', type: 'MONTHLY_AVG', date: today, rate: '3.7500000000', source: 'SAMA_OFFICIAL' },
      { from: 'USD', to: 'SAR', type: 'CLOSING', date: today, rate: '3.7500000000', source: 'SAMA_OFFICIAL' },

      // USD -> EGP (1 USD = 48.75 EGP)
      { from: 'USD', to: 'EGP', type: 'SPOT', date: today, rate: '48.7500000000', source: 'CBE_OFFICIAL' },
      { from: 'USD', to: 'EGP', type: 'MONTHLY_AVG', date: today, rate: '48.5000000000', source: 'CBE_OFFICIAL' },
      { from: 'USD', to: 'EGP', type: 'CLOSING', date: today, rate: '48.9000000000', source: 'CBE_OFFICIAL' },
    ];

    for (const r of rates) {
      await c.query(`
        INSERT INTO core.exchange_rates (company_id, from_currency, to_currency, rate_type, rate_date, rate, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (company_id, from_currency, to_currency, rate_type, rate_date)
        DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
      `, [comp.id, r.from, r.to, r.type, r.date, r.rate, r.source]);
    }
  }

  const count = await c.query('SELECT count(*) FROM core.exchange_rates');
  console.log(`Seeded exchange rates. Total count: ${count.rows[0].count}`);
  await c.end();
}

seed().catch(console.error);
