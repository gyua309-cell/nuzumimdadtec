const { Client } = require('pg');
const SUPABASE_URL = 'postgresql://postgres:FWUXtrOzbzYscCSz@db.gybgninvybdddpmyszlw.supabase.co:5432/postgres';

async function seed() {
  const c = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const compRes = await c.query('SELECT id FROM core.companies LIMIT 1');
  const companyId = compRes.rows[0].id;

  const empRes = await c.query('SELECT id, full_name_ar FROM hr.employees WHERE company_id = $1 LIMIT 2', [companyId]);
  const emp1 = empRes.rows[0];
  const emp2 = empRes.rows[1] || empRes.rows[0];

  const bankSar = await c.query("SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1110'", [companyId]);
  const bankSarId = bankSar.rows[0]?.id;

  const expAccounts = await c.query("SELECT id, code, name_ar FROM acc.accounts WHERE company_id = $1 AND account_class IN ('OPERATING_EXPENSE', 'DIRECT_COST') AND is_posting = true ORDER BY code LIMIT 5", [companyId]);
  console.log('Available expense accounts:', expAccounts.rows);

  const exp1Id = expAccounts.rows[0]?.id;
  const exp2Id = expAccounts.rows[1]?.id || exp1Id;

  const branchSa = await c.query("SELECT id FROM core.branches WHERE company_id = $1 AND (code = 'HQ-RUH' OR country_code = 'SA') LIMIT 1", [companyId]);
  const branchEg = await c.query("SELECT id FROM core.branches WHERE company_id = $1 AND (code = 'BR-CAI' OR country_code = 'EG') LIMIT 1", [companyId]);

  console.log('Cleaning existing demo custodies...');
  await c.query("DELETE FROM fin.custodies WHERE company_id = $1 AND custody_no IN ('CUST-2026-0001', 'CUST-2026-0002')", [companyId]);

  // Custody 1
  console.log('Inserting Custody 1...');
  const cust1 = await c.query(
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
       'SAR', 50000, 50000, 50000,
       '2026-01-10 10:00:00+03', $3,
       'EGP', 13.04, 50000, 652000,
       '2026-01-12 12:30:00+03', 'CIB-FX-2026-8891', 'تحويل وصرف بالبنك التجاري الدولي فرع التسعين',
       66290, 585710, 'PARTIALLY_SETTLED', 'تم صرف العهدة بالريال وتغذيتها على دفعتين للمصاريف التشغيلية'
     ) RETURNING id`,
    [companyId, emp1.id, bankSarId]
  );
  const cust1Id = cust1.rows[0].id;

  // Transfers for Custody 1
  await c.query(
    `INSERT INTO fin.custody_transfers (
       company_id, custody_id, transfer_number, transfer_date,
       source_branch_id, source_bank_account_id, target_branch_id,
       amount_sar, exchange_rate, amount_egp, bank_fees_sar,
       bank_reference, status, notes
     ) VALUES
     ($1, $2, 'TRF-2026-0001', '2026-01-10', $3, $4, $5, 30000, 13.00, 390000, 50, 'SAMA-REF-9901', 'COMPLETED', 'الدفعة الأولى: إيجار المقر وتأسيس المرافق'),
     ($1, $2, 'TRF-2026-0002', '2026-02-05', $3, $4, $5, 20000, 13.10, 262000, 50, 'SAMA-REF-9945', 'COMPLETED', 'الدفعة الثانية: مصروفات التشغيل والإنترنت')`,
    [companyId, cust1Id, branchSa.rows[0]?.id, bankSarId, branchEg.rows[0]?.id]
  );

  // Vouchers for Custody 1
  await c.query(
    `INSERT INTO fin.custody_settlement_lines (
       company_id, custody_id, line_no, expense_date, receipt_no,
       expense_account_id, vendor_name, description,
       currency_code, exchange_rate, subtotal, vat_rate, vat_amount, total_amount,
       subtotal_base, vat_amount_base, total_amount_base, status, notes
     ) VALUES
     ($1, $2, 1, '2026-01-15', 'INV-WE-0912', $3, 'شركة المصرية للاتصالات WE', 'اشتراك فايبر إنترنت عالي السرعة لمقر فرع مصر 500 ميجا', 'EGP', 0.0769, 3500, 14, 490, 3990, 269.15, 37.68, 306.83, 'APPROVED', 'فاتورة ضريبية رسمية'),
     ($1, $2, 2, '2026-01-20', 'REC-RENT-JAN', $4, 'شركة الأمل لإدارة المقرات والمباني الإدارية', 'دفعة إيجار شهر يناير 2026 لمقر الفرع بالتجمع الخامس', 'EGP', 0.0769, 45000, 0, 0, 45000, 3460.50, 0, 3460.50, 'APPROVED', 'إيصال سداد إيجار رسمي'),
     ($1, $2, 3, '2026-01-28', 'INV-ELEC-441', $3, 'شركة جنوب القاهرة لتوزيع الكهرباء', 'فاتورة استهلاك الكهرباء والتكييف المركزي لشهر يناير', 'EGP', 0.0769, 4800, 0, 0, 4800, 369.12, 0, 369.12, 'APPROVED', 'سداد فوري إلكتروني'),
     ($1, $2, 4, '2026-02-02', 'INV-TECH-881', $4, 'شركة تكنو ستور لمستلزمات الحاسب', 'كابلات شبكة ومحولات شاشات ومستلزمات محطات عمل للمطورين', 'EGP', 0.0769, 10965, 14, 1535, 12500, 843.21, 118.04, 961.25, 'APPROVED', 'فاتورة معتمدة')`,
    [companyId, cust1Id, exp1Id, exp2Id]
  );

  // Custody 2: Low-Balance Warning Demonstration (Remaining balance <= 20%)
  console.log('Inserting Custody 2 (Low Balance Warning)...');
  const cust2 = await c.query(
    `INSERT INTO fin.custodies (
       company_id, custody_no, employee_id, title_ar, title_en, purpose,
       source_currency, requested_amount, disbursed_amount, disbursed_amount_base,
       disbursed_at, disbursed_from_account_id,
       target_currency, conversion_rate, converted_amount_source, converted_amount_target,
       converted_at, conversion_receipt_no, conversion_notes,
       total_settled_amount_target, remaining_balance_target, status, notes
     ) VALUES (
       $1, 'CUST-2026-0002', $2, 'عهدة التوظيف والانتقالات الميدانية - فرع مصر',
       'Cairo Branch Recruitment & Field Visits', 'مقابلات المبرمجين وانتقالات واختبارات الكوادر التقنية',
       'SAR', 10000, 10000, 10000,
       '2026-01-05 09:00:00+03', $3,
       'EGP', 13.00, 10000, 130000,
       '2026-01-07 11:00:00+03', 'CIB-FX-2026-7712', 'تحويل وصرف بالبنك التجاري الدولي',
       112000, 18000, 'PARTIALLY_SETTLED', 'رصيد العهدة انخفض إلى 13.8% ويحتاج إلى تعزيز أو تسوية عاجلة'
     ) RETURNING id`,
    [companyId, emp2.id, bankSarId]
  );
  const cust2Id = cust2.rows[0].id;

  await c.query(
    `INSERT INTO fin.custody_transfers (
       company_id, custody_id, transfer_number, transfer_date,
       source_branch_id, source_bank_account_id, target_branch_id,
       amount_sar, exchange_rate, amount_egp, bank_fees_sar,
       bank_reference, status, notes
     ) VALUES
     ($1, $2, 'TRF-2026-0003', '2026-01-05', $3, $4, $5, 10000, 13.00, 130000, 50, 'SAMA-REF-8812', 'COMPLETED', 'تحويل عهدة التوظيف وانتقالات لجان المقابلات')`,
    [companyId, cust2Id, branchSa.rows[0]?.id, bankSarId, branchEg.rows[0]?.id]
  );

  console.log('Successfully seeded custodies and transfers in Supabase!');
  await c.end();
}

seed().catch(console.error);
