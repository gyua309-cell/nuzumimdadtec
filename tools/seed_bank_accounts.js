const { Client } = require('pg');

async function run() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const compId = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';

  const accounts = await client.query(
    `SELECT id, code, name_ar, currency_code FROM acc.accounts WHERE company_id = $1 AND code IN ('1100', '1110', '1120', '1121', '1310', '1320', '4300', '5700', '5150') ORDER BY code`,
    [compId]
  );
  console.log('Found accounts:', accounts.rows);

  const accMap = {};
  for (const a of accounts.rows) {
    accMap[a.code] = a.id;
  }

  // Check existing bank_accounts
  const existing = await client.query(`SELECT code FROM acc.bank_accounts WHERE company_id = $1`, [compId]);
  console.log('Existing bank accounts:', existing.rows);

  if (existing.rows.length === 0) {
    console.log('Seeding bank accounts...');
    // 1. Al Rajhi Bank (SAR)
    await client.query(`
      INSERT INTO acc.bank_accounts (
        company_id, code, name, kind, bank_name, account_number, iban, currency_code, gl_account_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    `, [
      compId,
      'BNK-RAJHI-SAR',
      'حساب مصرف الراجحي الرئيسي - الرياض',
      'BANK',
      'مصرف الراجحي - المملكة العربية السعودية',
      '800004566080100',
      'SA4480000456608010099887',
      'SAR',
      accMap['1110'] || null
    ]);

    // 2. CIB Bank (EGP)
    await client.query(`
      INSERT INTO acc.bank_accounts (
        company_id, code, name, kind, bank_name, account_number, iban, currency_code, gl_account_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    `, [
      compId,
      'BNK-CIB-EGP',
      'حساب البنك التجاري الدولي CIB - القاهرة',
      'BANK',
      'البنك التجاري الدولي (مصر) CIB',
      '1000200000012345',
      'EG380010002000000123456789',
      'EGP',
      accMap['1120'] || null
    ]);

    // 3. National Bank of Egypt (EGP)
    await client.query(`
      INSERT INTO acc.bank_accounts (
        company_id, code, name, kind, bank_name, account_number, iban, currency_code, gl_account_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    `, [
      compId,
      'BNK-NBE-EGP',
      'حساب البنك الأهلي المصري - فرع مصر',
      'BANK',
      'البنك الأهلي المصري NBE',
      '1900300000088992',
      'EG760003001900000088992110',
      'EGP',
      accMap['1120'] || null
    ]);

    // 4. Main Cash Drawer & Safes
    await client.query(`
      INSERT INTO acc.bank_accounts (
        company_id, code, name, kind, bank_name, account_number, iban, currency_code, gl_account_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
    `, [
      compId,
      'CSH-MAIN-SAFE',
      'خزينة النقدية الرئيسية وصندوق العهد',
      'CASH',
      'الخزينة المركزية',
      'CSH-001',
      null,
      'EGP',
      accMap['1100'] || null
    ]);

    console.log('Seeded 4 bank accounts successfully!');
  } else {
    console.log('Bank accounts already seeded.');
  }

  await client.end();
}

run().catch(console.error);
