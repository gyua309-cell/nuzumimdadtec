const { Client } = require('pg');
const crypto = require('crypto');

function uuidv7() {
  const timestamp = Date.now();
  const hex = timestamp.toString(16).padStart(12, '0');
  const rand = crypto.randomBytes(10).toString('hex');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-7' + rand.slice(0, 3) + '-a' + rand.slice(3, 6) + '-' + rand.slice(6, 18);
}

async function setup() {
  const client = new Client('postgresql://idham_owner:idham_dev_only_password@127.0.0.1:54329/idham');
  await client.connect();

  const compId = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';

  // 1. Update company to Saudi Arabia & SAR
  await client.query('ALTER TABLE core.companies DISABLE TRIGGER a_base_currency');
  await client.query(`
    UPDATE core.companies
    SET name_ar = 'شركة عزم للتكنولوجيا والحلول الرقمية',
        legal_name = 'شركة عزم للتكنولوجيا والحلول الرقمية (شركة شخص واحد ش.م.م)',
        country_code = 'SA',
        timezone = 'Asia/Riyadh',
        base_currency_code = 'SAR',
        commercial_reg = '1010789456',
        tax_number = '310123456700003',
        address = 'طريق الملك فهد، حي العليا، الرياض، المملكة العربية السعودية'
    WHERE id = $1
  `, [compId]);
  await client.query('ALTER TABLE core.companies ENABLE TRIGGER a_base_currency');
  console.log('1. Updated company to Saudi Arabia & SAR base currency');

  // 2. Add or update Riyadh HQ branch, and Cairo/Alex branches
  let ruhBranch = await client.query('SELECT id FROM core.branches WHERE company_id = $1 AND code = $2', [compId, 'BR-RUH']);
  let ruhBranchId;
  if (ruhBranch.rowCount === 0) {
    ruhBranchId = uuidv7();
    await client.query(`
      INSERT INTO core.branches (id, company_id, code, name_ar, name_en, address, is_active, created_at, row_version)
      VALUES ($1, $2, 'BR-RUH', 'المركز الرئيسي - الرياض (المملكة العربية السعودية)', 'Riyadh HQ Branch', 'برج المملكة، طريق الملك فهد، العليا، الرياض', true, now(), 1)
    `, [ruhBranchId, compId]);
    console.log('2a. Created Riyadh HQ branch:', ruhBranchId);
  } else {
    ruhBranchId = ruhBranch.rows[0].id;
    await client.query(`
      UPDATE core.branches SET name_ar = 'المركز الرئيسي - الرياض (المملكة العربية السعودية)', address = 'برج المملكة، طريق الملك فهد، العليا، الرياض' WHERE id = $1
    `, [ruhBranchId]);
    console.log('2a. Updated Riyadh HQ branch');
  }

  // Update Cairo & Alex branches
  await client.query(`
    UPDATE core.branches SET name_ar = 'فرع مصر - القاهرة (مركز التطوير البرمجي)', address = 'المعادي التكنولوجية، القاهرة' WHERE company_id = $1 AND code = 'BR-CAI'
  `, [compId]);
  await client.query(`
    UPDATE core.branches SET name_ar = 'فرع مصر - الإسكندرية (مركز الدعم التقني)', address = 'سموحة، الإسكندرية' WHERE company_id = $1 AND code = 'BR-ALX'
  `, [compId]);

  const caiBranch = await client.query('SELECT id FROM core.branches WHERE company_id = $1 AND code = $2', [compId, 'BR-CAI']);
  const caiBranchId = caiBranch.rows[0]?.id;

  // 3. Link existing Egyptian employees to Cairo branch
  const itDept = await client.query('SELECT id FROM core.departments WHERE company_id = $1 AND code = $2', [compId, 'IT-DEV']);
  const itDeptId = itDept.rows[0]?.id;

  if (caiBranchId) {
    await client.query(`
      UPDATE hr.employee_job_assignments
      SET branch_id = $1, department_id = $2
      WHERE company_id = $3 AND (branch_id IS NULL OR branch_id != $4)
    `, [caiBranchId, itDeptId, compId, ruhBranchId]);
    console.log('3. Linked Egyptian employees to Cairo branch and IT department');
  }

  // 4. Create positions in hr.positions if not exist
  async function ensurePosition(code, titleAr, titleEn) {
    const existing = await client.query('SELECT id FROM hr.positions WHERE company_id = $1 AND code = $2', [compId, code]);
    if (existing.rowCount > 0) return existing.rows[0].id;
    const id = uuidv7();
    await client.query(`
      INSERT INTO hr.positions (id, company_id, code, title_ar, title_en, is_active, created_at, row_version)
      VALUES ($1, $2, $3, $4, $5, true, now(), 1)
    `, [id, compId, code, titleAr, titleEn]);
    return id;
  }

  const posLeadArch = await ensurePosition('POS-ARCH', 'كبير مهندسي الحلول الرقمية (Solutions Architect)', 'Solutions Architect');
  const posAccountDir = await ensurePosition('POS-ACC-DIR', 'مدير حسابات العملاء وعقود التقنية', 'Enterprise Account Director');
  const posDevLead = await ensurePosition('POS-DEV-SR', 'كبير مطوري Full-Stack', 'Senior Full-Stack Developer');
  const posUxLead = await ensurePosition('POS-UX', 'مهندس تجربة المستخدم UI/UX', 'UI/UX Architect');
  const posScrumMaster = await ensurePosition('POS-SCRUM', 'مدير مشاريع رشيقة Scrum Master', 'Scrum Master');
  const posQaLead = await ensurePosition('POS-QA', 'مهندس جودة وأتمتة اختبارات QA', 'QA Automation Engineer');

  // Assign positions to existing Egyptian employees
  await client.query(`UPDATE hr.employee_job_assignments SET position_id = $1 WHERE employee_id IN (SELECT id FROM hr.employees WHERE code = 'EMP-101')`, [posDevLead]);
  await client.query(`UPDATE hr.employee_job_assignments SET position_id = $1 WHERE employee_id IN (SELECT id FROM hr.employees WHERE code = 'EMP-102')`, [posUxLead]);
  await client.query(`UPDATE hr.employee_job_assignments SET position_id = $1 WHERE employee_id IN (SELECT id FROM hr.employees WHERE code = 'EMP-103')`, [posScrumMaster]);
  await client.query(`UPDATE hr.employee_job_assignments SET position_id = $1 WHERE employee_id IN (SELECT id FROM hr.employees WHERE code = 'EMP-104')`, [posQaLead]);

  // 5. Add Saudi employees in Riyadh HQ
  async function ensureEmployee(code, nameAr, nameEn, phone, email, posId, branchId, salary, currency) {
    const existing = await client.query('SELECT id FROM hr.employees WHERE company_id = $1 AND code = $2', [compId, code]);
    let empId;
    if (existing.rowCount === 0) {
      empId = uuidv7();
      await client.query(`
        INSERT INTO hr.employees (id, company_id, code, full_name_ar, full_name_en, phone, email, hire_date, status, employment_type, is_billable_resource, created_at, row_version)
        VALUES ($1, $2, $3, $4, $5, $6, $7, '2025-01-01', 'ACTIVE', 'FULL_TIME', true, now(), 1)
      `, [empId, compId, code, nameAr, nameEn, phone, email]);

      // Job assignment
      const jobAssignId = uuidv7();
      await client.query(`
        INSERT INTO hr.employee_job_assignments (id, company_id, employee_id, branch_id, department_id, position_id, effective_from, change_reason, created_at, row_version)
        VALUES ($1, $2, $3, $4, $5, $6, '2025-01-01', 'HIRED', now(), 1)
      `, [jobAssignId, compId, empId, branchId, itDeptId, posId]);

      // Compensation
      const compAssignId = uuidv7();
      await client.query(`
        INSERT INTO hr.employee_compensations (id, company_id, employee_id, basic_salary, salary_currency, insurance_salary, insurance_currency, effective_from, change_reason, created_at, row_version)
        VALUES ($1, $2, $3, $4, $5, $4, $5, '2025-01-01', 'HIRED', now(), 1)
      `, [compAssignId, compId, empId, salary, currency]);

      console.log('5. Added employee:', code, nameAr, salary, currency);
    } else {
      empId = existing.rows[0].id;
      console.log('5. Employee already exists:', code);
    }
    return empId;
  }

  const empFahadId = await ensureEmployee(
    'EMP-001',
    'م. فهد بن عبد العزيز السبيعي',
    'Fahad Al-Subaie',
    '+966501234567',
    'fahad.subaie@azm.sa',
    posLeadArch,
    ruhBranchId,
    18500,
    'SAR'
  );

  const empRayanId = await ensureEmployee(
    'EMP-002',
    'أ. ريان بن محمد القحطاني',
    'Rayan Al-Qahtani',
    '+966559876543',
    'rayan.qahtani@azm.sa',
    posAccountDir,
    ruhBranchId,
    15000,
    'SAR'
  );

  // 6. Ensure project assignments for Saudi team
  const projEcom = await client.query(`SELECT id FROM prj.projects WHERE company_id = $1 AND code = 'PRJ-ECOM'`, [compId]);
  const projScm = await client.query(`SELECT id FROM prj.projects WHERE company_id = $1 AND code = 'PRJ-SCM'`, [compId]);

  const pEcomId = projEcom.rows[0]?.id;
  const pScmId = projScm.rows[0]?.id;

  if (pEcomId && empFahadId) {
    const existing = await client.query('SELECT id FROM prj.assignments WHERE employee_id = $1', [empFahadId]);
    if (existing.rowCount === 0) {
      await client.query(`
        INSERT INTO prj.assignments (id, company_id, employee_id, project_id, allocation_basis, allocation_pct, allocated_days, working_days_in_month, role_title, is_billable, effective_from, notes, created_at, row_version)
        VALUES ($1, $2, $3, $4, 'PERCENTAGE', 100, 22, 22, 'Lead Solutions Architect', true, '2026-01-01', 'الإشراف الهندسي العام على المنصة السحابية B2B', now(), 1)
      `, [uuidv7(), compId, empFahadId, pEcomId]);
      console.log('6a. Assigned Fahad Al-Subaie to PRJ-ECOM (100%)');
    }
  }

  if (pScmId && pEcomId && empRayanId) {
    const existing = await client.query('SELECT id FROM prj.assignments WHERE employee_id = $1', [empRayanId]);
    if (existing.rowCount === 0) {
      await client.query(`
        INSERT INTO prj.assignments (id, company_id, employee_id, project_id, allocation_basis, allocation_pct, allocated_days, working_days_in_month, role_title, is_billable, effective_from, notes, created_at, row_version)
        VALUES ($1, $2, $3, $4, 'PERCENTAGE', 50, 11, 22, 'Enterprise Account Director', true, '2026-01-01', 'إدارة العلاقات والتعاقدات لمشروع سلاسل الإمداد', now(), 1)
      `, [uuidv7(), compId, empRayanId, pScmId]);
      await client.query(`
        INSERT INTO prj.assignments (id, company_id, employee_id, project_id, allocation_basis, allocation_pct, allocated_days, working_days_in_month, role_title, is_billable, effective_from, notes, created_at, row_version)
        VALUES ($1, $2, $3, $4, 'PERCENTAGE', 50, 11, 22, 'Enterprise Account Director', true, '2026-01-01', 'إدارة حسابات منصة التجارة', now(), 1)
      `, [uuidv7(), compId, empRayanId, pEcomId]);
      console.log('6b. Assigned Rayan Al-Qahtani to PRJ-SCM & PRJ-ECOM (50% / 50%)');
    }
  }

  // 7. Add exchange rates SAR -> EGP and EGP -> SAR
  const egpToSar = await client.query(`SELECT id FROM core.exchange_rates WHERE company_id = $1 AND from_currency = 'EGP' AND to_currency = 'SAR'`, [compId]);
  if (egpToSar.rowCount === 0) {
    await client.query(`
      INSERT INTO core.exchange_rates (id, company_id, from_currency, to_currency, rate_type, rate_date, rate, source, created_at, row_version)
      VALUES ($1, $2, 'EGP', 'SAR', 'SPOT', '2026-01-01', 0.0760456274, 'CENTRAL_BANK', now(), 1)
    `, [uuidv7(), compId]);
    console.log('7a. Added exchange rate EGP -> SAR (0.0760456)');
  }

  const sarToEgp = await client.query(`SELECT id FROM core.exchange_rates WHERE company_id = $1 AND from_currency = 'SAR' AND to_currency = 'EGP'`, [compId]);
  if (sarToEgp.rowCount === 0) {
    await client.query(`
      INSERT INTO core.exchange_rates (id, company_id, from_currency, to_currency, rate_type, rate_date, rate, source, created_at, row_version)
      VALUES ($1, $2, 'SAR', 'EGP', 'SPOT', '2026-01-01', 13.1500000000, 'CENTRAL_BANK', now(), 1)
    `, [uuidv7(), compId]);
    console.log('7b. Added exchange rate SAR -> EGP (13.15)');
  }

  console.log('ALL DONE! Saudi Arabia HQ + Multi-Currency setup complete!');
  await client.end();
}

setup().catch(console.error);
