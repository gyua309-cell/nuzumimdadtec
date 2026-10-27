const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function seed() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const compRes = await c.query('SELECT id FROM core.companies');
  for (const comp of compRes.rows) {
    const pAsset = await c.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1'", [comp.id]);
    const pLiab = await c.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '2'", [comp.id]);

    // 1250: Input VAT (Asset / Debit)
    await c.query(`
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES ($1, '1250', 'ضريبة القيمة المضافة على المدخلات (مشتريات ومصروفات)', 'Input VAT (Recoverable)', 'ASSET', 'TAX', 'DEBIT', $2, true)
      ON CONFLICT (company_id, code) DO UPDATE SET name_ar = EXCLUDED.name_ar, subtype = 'TAX'
    `, [comp.id, pAsset.rows[0]?.id]);

    // 2400: Output VAT (Liability / Credit)
    await c.query(`
      INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting)
      VALUES ($1, '2400', 'ضريبة القيمة المضافة على المخرجات (المبيعات)', 'Output VAT (Payable)', 'LIABILITY', 'TAX', 'CREDIT', $2, true)
      ON CONFLICT (company_id, code) DO UPDATE SET name_ar = EXCLUDED.name_ar, subtype = 'TAX'
    `, [comp.id, pLiab.rows[0]?.id]);
  }

  console.log('Successfully seeded VAT accounts 1250 and 2400!');
  await c.end();
}

seed().catch(console.error);
