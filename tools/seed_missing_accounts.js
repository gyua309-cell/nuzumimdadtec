const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function seed() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const compRes = await c.query('SELECT id FROM core.companies');
  for (const comp of compRes.rows) {
    const pAsset = await c.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1'", [comp.id]);
    const pRev = await c.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '4'", [comp.id]);
    const pExp = await c.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '5'", [comp.id]);

    const accounts = [
      { code: '1110', nameAr: 'النقدية بالبنوك - حساب مصرف الراجحي / الرياض (SAR)', nameEn: 'Banks - SAR Account (Riyad/Rajhi)', class: 'ASSET', subtype: 'BANK', balance: 'DEBIT', parent: pAsset.rows[0]?.id, cur: 'SAR' },
      { code: '1120', nameAr: 'النقدية بالبنوك - حساب البنك التجاري الدولي CIB / الأهلي (EGP)', nameEn: 'Banks - EGP Account (CIB/NBE)', class: 'ASSET', subtype: 'BANK', balance: 'DEBIT', parent: pAsset.rows[0]?.id, cur: 'EGP' },
      { code: '1310', nameAr: 'عهد نقدية ومصروفات تشغيلية - فرع مصر (EGP)', nameEn: 'Employee Custodies - Egypt Branch (EGP)', class: 'ASSET', subtype: 'EMPLOYEE_RECEIVABLE', balance: 'DEBIT', parent: pAsset.rows[0]?.id, cur: 'EGP' },
      { code: '1320', nameAr: 'عهد نقدية ومصروفات تشغيلية - المركز الرئيسي (SAR)', nameEn: 'Employee Custodies - Saudi HQ (SAR)', class: 'ASSET', subtype: 'EMPLOYEE_RECEIVABLE', balance: 'DEBIT', parent: pAsset.rows[0]?.id, cur: 'SAR' },
      { code: '4300', nameAr: 'أرباح فروق وتقلبات أسعار صرف العملات المحققة', nameEn: 'Realized Foreign Exchange Gains', class: 'REVENUE', subtype: 'FX_GAIN_LOSS', balance: 'CREDIT', parent: pRev.rows[0]?.id, cur: 'SAR' },
      { code: '5700', nameAr: 'خسائر فروق وتقلبات أسعار صرف العملات المحققة', nameEn: 'Realized Foreign Exchange Losses', class: 'OPERATING_EXPENSE', subtype: 'FX_GAIN_LOSS', balance: 'DEBIT', parent: pExp.rows[0]?.id, cur: 'SAR' },
      { code: '5150', nameAr: 'مصروفات تشغيلية وضيافة وعمولات بنكية', nameEn: 'Operating Expenses & Bank Charges', class: 'OPERATING_EXPENSE', subtype: 'OTHER', balance: 'DEBIT', parent: pExp.rows[0]?.id, cur: null },
      { code: '5160', nameAr: 'إيجارات ومرافق مقر الفرع ومساحات العمل', nameEn: 'Branch Rent & Premises Facilities', class: 'OPERATING_EXPENSE', subtype: 'OTHER', balance: 'DEBIT', parent: pExp.rows[0]?.id, cur: null },
    ];

    for (const a of accounts) {
      await c.query(`
        INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, currency_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
        ON CONFLICT (company_id, code) DO UPDATE
          SET name_ar = EXCLUDED.name_ar,
              name_en = EXCLUDED.name_en,
              subtype = EXCLUDED.subtype,
              currency_code = EXCLUDED.currency_code
      `, [comp.id, a.code, a.nameAr, a.nameEn, a.class, a.subtype, a.balance, a.parent, a.cur]);
    }
  }

  console.log('Successfully seeded missing accounts!');
  await c.end();
}

seed().catch(console.error);
