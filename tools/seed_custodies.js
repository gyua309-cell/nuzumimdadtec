const { Client } = require('pg');

async function seedCustodies() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const comp = await client.query('SELECT id FROM core.companies LIMIT 1');
  const companyId = comp.rows[0].id;

  const emp = await client.query("SELECT id FROM hr.employees WHERE code = 'EMP-101'");
  const empId = emp.rows[0].id;

  const bankSar = await client.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1110'", [companyId]);
  const bankSarId = bankSar.rows[0].id;

  const exp5150 = await client.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '5150'", [companyId]);
  const exp5150Id = exp5150.rows[0].id;

  const exp5500 = await client.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '5500'", [companyId]);
  const exp5500Id = exp5500.rows[0].id;

  // Check if custody exists
  const existing = await client.query("SELECT id FROM fin.custodies WHERE company_id = $1 AND custody_no = 'CUST-2026-0001'", [companyId]);
  if (existing.rowCount === 0) {
    // 1. Create Custody 1: 50,000 SAR -> 657,500 EGP (Partially Settled with 2 vouchers)
    const cust1 = await client.query(
      `INSERT INTO fin.custodies (
         company_id, custody_no, employee_id, title_ar, title_en, purpose,
         source_currency, requested_amount, disbursed_amount, disbursed_amount_base,
         disbursed_at, disbursed_from_account_id,
         target_currency, conversion_rate, converted_amount_source, converted_amount_target,
         converted_at, conversion_receipt_no, conversion_notes,
         total_settled_amount_target, remaining_balance_target, status, notes
       ) VALUES (
         $1, 'CUST-2026-0001', $2, 'عهدة المصروفات التشغيلية لفرع القاهرة - الربع الأول',
         'Cairo Branch Operations Custody Q1', 'تغطية إيجار مقر التجمع الخامس والإنترنت والضيافة وتراخيص العمل',
         'SAR', 50000, 50000, 657500,
         '2026-01-10 10:00:00+03', $3,
         'EGP', 13.15, 50000, 657500,
         '2026-01-12 12:30:00+03', 'CIB-FX-2026-8891', 'تحويل وصرف بالبنك التجاري الدولي فرع التسعين',
         42500, 615000, 'PARTIALLY_SETTLED', 'تم صرف العهدة بالريال وتحويلها للجنيه للمصاريف المحلية'
       ) RETURNING id`,
      [companyId, empId, bankSarId]
    );

    const cust1Id = cust1.rows[0].id;

    // Vouchers for Custody 1
    await client.query(
      `INSERT INTO fin.custody_settlement_lines (
         company_id, custody_id, line_no, expense_date, receipt_no,
         expense_account_id, vendor_name, description,
         currency_code, exchange_rate, subtotal, vat_rate, vat_amount, total_amount,
         subtotal_base, vat_amount_base, total_amount_base, status, notes
       ) VALUES
       ($1, $2, 1, '2026-01-15', 'INV-WE-0912', $3, 'شركة المصرية للاتصالات WE', 'اشتراك فايبر إنترنت عالي السرعة لمقر فرع مصر 500 ميجا', 'EGP', 1, 2500, 14, 350, 2850, 2500, 350, 2850, 'APPROVED', 'فاتورة ضريبية رسمية'),
       ($1, $2, 2, '2026-01-20', 'REC-RENT-JAN', $4, 'شركة الأمل لإدارة المقرات والمباني الإدارية', 'دفعة إيجار شهر يناير 2026 لمقر الفرع بالتجمع الخامس', 'EGP', 1, 35000, 14, 4650, 39650, 35000, 4650, 39650, 'APPROVED', 'إيصال سداد إيجار رسمي')`,
      [companyId, cust1Id, exp5150Id, exp5500Id]
    );

    // 2. Create Custody 2: 15,000 SAR -> 197,250 EGP (Fully Disbursed and Converted)
    await client.query(
      `INSERT INTO fin.custodies (
         company_id, custody_no, employee_id, title_ar, title_en, purpose,
         source_currency, requested_amount, disbursed_amount, disbursed_amount_base,
         disbursed_at, disbursed_from_account_id,
         target_currency, conversion_rate, converted_amount_source, converted_amount_target,
         converted_at, conversion_receipt_no, conversion_notes,
         total_settled_amount_target, remaining_balance_target, status, notes
       ) VALUES (
         $1, 'CUST-2026-0002', $2, 'عهدة مؤتمر ومعرض Cairo ICT وتجهيزات جناح الشركة',
         'Cairo ICT Expo & Event Custody', 'مصاريف تجهيز البوث وتصميمات المعرض وطباعة البروشورات والضيافة',
         'SAR', 15000, 15000, 197250,
         '2026-02-01 11:00:00+03', $3,
         'EGP', 13.15, 15000, 197250,
         '2026-02-02 14:00:00+03', 'NBE-FX-10492', 'صرف من البنك الأهلي المصري',
         0, 197250, 'CONVERTED', 'العهدة جاهزة للصرف وبانتظار تقديم الإيصالات'
       )`,
      [companyId, empId, bankSarId]
    );

    console.log('Seeded demo custodies in idham!');
  } else {
    console.log('Custodies already present in idham.');
  }

  await client.end();
}

seedCustodies().catch(console.error);
