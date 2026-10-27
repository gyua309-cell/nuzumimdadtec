/**
/**
 * Seeds a rich, interconnected, realistic Arabic business dataset for IDHAM HR Accounting ERP.
 * Covers: Branches, Departments, Cost Centers, Chart of Accounts, Posting Rules,
 * Cost Components, Cost Profiles, Employees with Compensations, Clients, Projects,
 * Assignments, Service Prices, Variable Types, Monthly Variables, Loans, and Assets.
 */
const BASE_URL = 'http://localhost:3000/api/v1';
const COMPANY_ID = process.env.COMPANY_ID || '01a17cb2-9afa-7ef5-91f6-b47561899afb';

async function req(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (COMPANY_ID) headers['x-company-id'] = COMPANY_ID;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('Logging in as admin...');
  const loginRes = await req('/auth/login', 'POST', { username: 'admin', password: 'AdminPass12345!' });
  const token = loginRes.accessToken;
  console.log('Logged in successfully!');

  // 1. Fetch current company & fiscal periods
  const currentCompany = await req('/companies/current', 'GET', null, token);
  const companyId = currentCompany.id;
  console.log(`Company: ${currentCompany.nameAr} (${currentCompany.code}), Base Currency: ${currentCompany.baseCurrencyCode}`);

  const fiscalYears = await req('/fiscal-years', 'GET', null, token);
  const fyHeader = fiscalYears[0];
  const fy = await req(`/fiscal-years/${fyHeader.id}`, 'GET', null, token);
  const periods = (fy.periods || []).sort((a, b) => a.periodNo - b.periodNo);
  const janPeriod = periods[0];
  const febPeriod = periods[1];
  console.log(`Fiscal Year: ${fy.code}, Period 1: ${janPeriod?.name} (${janPeriod?.startDate} - ${janPeriod?.endDate})`);

  // 2. Branches
  console.log('Creating branches...');
  const brCai = await req('/branches', 'POST', {
    code: 'BR-CAI',
    nameAr: 'المقر الرئيسي - القاهرة',
    nameEn: 'Cairo HQ',
    address: 'التجمع الخامس - القاهرة الجديدة',
    isActive: true,
  }, token).catch(e => console.log('Branch exists or error:', e.message));

  const brAlx = await req('/branches', 'POST', {
    code: 'BR-ALX',
    nameAr: 'فرع الإسكندرية',
    nameEn: 'Alexandria Branch',
    address: 'سموحة - الإسكندرية',
    isActive: true,
  }, token).catch(e => console.log('Branch exists or error:', e.message));

  // 3. Cost Centers
  console.log('Creating cost centers...');
  const ccPrj = await req('/cost-centers', 'POST', {
    code: 'CC-PRJ',
    nameAr: 'مركز تكلفة مشاريع تقنية المعلومات',
    nameEn: 'IT Projects CC',
    ccType: 'DIRECT',
    isPosting: true,
  }, token).catch(e => console.log('Cost center exists or error:', e.message));

  const ccAdm = await req('/cost-centers', 'POST', {
    code: 'CC-ADM',
    nameAr: 'مركز تكلفة الإدارة العامة والخدمات المشتركة',
    nameEn: 'General & Admin CC',
    ccType: 'ADMIN',
    isPosting: true,
  }, token).catch(e => console.log('Cost center exists or error:', e.message));

  // 4. Departments
  console.log('Creating departments...');
  const deptIt = await req('/departments', 'POST', {
    code: 'IT-DEV',
    nameAr: 'إدارة هندسة البرمجيات والحلول الرقمية',
    nameEn: 'Software Engineering Department',
    isActive: true,
  }, token).catch(e => console.log('Department exists or error:', e.message));

  const deptHr = await req('/departments', 'POST', {
    code: 'HR-OPS',
    nameAr: 'إدارة الموارد البشرية والعمليات',
    nameEn: 'Human Resources & Operations',
    isActive: true,
  }, token).catch(e => console.log('Department exists or error:', e.message));

  const deptFin = await req('/departments', 'POST', {
    code: 'FIN-ACC',
    nameAr: 'الإدارة المالية والمحاسبة',
    nameEn: 'Finance & Accounting',
    isActive: true,
  }, token).catch(e => console.log('Department exists or error:', e.message));

  // 5. Chart of Accounts
  console.log('Creating Chart of Accounts...');
  const accountsMap = {};
  async function addAccount(code, nameAr, accountClass, parentCode = null, subtype = null, isPosting = true) {
    try {
      const res = await req('/accounts', 'POST', {
        code,
        nameAr,
        accountClass,
        parentId: parentCode ? accountsMap[parentCode] : null,
        subtype,
        isPosting,
      }, token);
      accountsMap[code] = res.id;
      return res.id;
    } catch (e) {
      console.log(`Account ${code} exists or error:`, e.message);
      // Fetch existing
      const list = await req(`/accounts?search=${code}`, 'GET', null, token);
      const found = list.data?.find(a => a.code === code);
      if (found) accountsMap[code] = found.id;
      return found?.id;
    }
  }

  // 1: Assets
  await addAccount('1', 'الأصول', 'ASSET', null, null, false);
  await addAccount('1100', 'النقدية بالبنوك والخزينة', 'ASSET', '1', 'CASH');
  await addAccount('1200', 'العملاء وحسابات القبض', 'ASSET', '1', 'RECEIVABLE');
  await addAccount('1300', 'سلف وعهد الموظفين', 'ASSET', '1', null);
  await addAccount('1500', 'الأصول الثابتة', 'ASSET', '1', 'FIXED_ASSET');
  await addAccount('1590', 'مجمع إهلاك الأصول الثابتة', 'ASSET', '1', null);

  // 2: Liabilities
  await addAccount('2', 'الالتزامات', 'LIABILITY', null, null, false);
  await addAccount('2100', 'مستحقات الرواتب والأجور', 'LIABILITY', '2', 'PAYROLL_LIABILITY');
  await addAccount('2200', 'التأمينات الاجتماعية المستحقة', 'LIABILITY', '2', null);
  await addAccount('2300', 'مستحقات الموردين والجهات الخارجية', 'LIABILITY', '2', 'PAYABLE');

  // 3: Equity
  await addAccount('3', 'حقوق الملكية', 'EQUITY', null, null, false);
  await addAccount('3100', 'رأس المال المدفوع', 'EQUITY', '3', null);
  await addAccount('3200', 'الأرباح المبقاة', 'EQUITY', '3', null);

  // 4: Revenue
  await addAccount('4', 'الإيرادات', 'REVENUE', null, null, false);
  await addAccount('4100', 'إيرادات عقود المشاريع والخدمات الاستشارية', 'REVENUE', '4', null);

  // 5: Expenses
  await addAccount('5', 'المصروفات التشغيلية', 'OPERATING_EXPENSE', null, null, false);
  await addAccount('5100', 'مصروفات الرواتب الأساسية', 'OPERATING_EXPENSE', '5', null);
  await addAccount('5200', 'مصروفات البدلات والمكافآت الإضافية', 'OPERATING_EXPENSE', '5', null);
  await addAccount('5300', 'تأمينات اجتماعية - حصة الشركة', 'OPERATING_EXPENSE', '5', null);
  await addAccount('5400', 'مصروف إهلاك أجهزة وعهد الموظفين', 'OPERATING_EXPENSE', '5', null);
  await addAccount('5800', 'مصروفات تشغيلية وعمومية أخرى', 'OPERATING_EXPENSE', '5', null);

  // Initial Capital Opening Entry
  try {
    const je = await req('/journal-entries', 'POST', {
      entryDate: '2026-01-01',
      description: 'قيد إيداع رأس المال الافتتاحي في الحساب البنكي',
      lines: [
        { accountId: accountsMap['1100'], debit: '1000000', credit: null },
        { accountId: accountsMap['3100'], debit: null, credit: '1000000' }
      ]
    }, token);
    await req(`/journal-entries/${je.id}/post`, 'POST', {}, token);
    console.log('Capital opening entry posted successfully!');
  } catch (e) {
    console.log('Capital opening entry skipped:', e.message);
  }

  // 6. Posting Rules
  console.log('Creating posting rules...');
  try {
    await req('/posting-rules', 'POST', {
      eventCode: 'PAY.SALARY',
      name: 'قيد مسير الرواتب الشهري التلقائي',
      effectiveFrom: '2026-01-01',
      lines: [
        { lineNo: 1, side: 'DEBIT', accountSource: 'FIXED', accountId: accountsMap['5100'], amountKey: 'net' },
        { lineNo: 2, side: 'CREDIT', accountSource: 'FIXED', accountId: accountsMap['2100'], amountKey: 'net' },
      ],
    }, token);
    console.log('PAY.SALARY posting rule created!');
  } catch (e) {
    console.log('Posting rule exists or error:', e.message);
  }

  // 7. Cost Components & Profile
  console.log('Creating cost components & profile...');
  let salComp, houComp, insComp;
  try {
    salComp = await req('/cost-components', 'POST', {
      code: 'SAL-BASIC',
      nameAr: 'الراتب الأساسي',
      componentType: 'SALARY',
      nature: 'EARNING',
      calcMethod: 'BASIC_SALARY',
      postingTreatment: 'PAYROLL',
      affectsNetPay: true,
      expenseAccountId: accountsMap['5100'],
      liabilityAccountId: accountsMap['2100'],
      sortOrder: 1,
      effectiveFrom: '2026-01-01',
    }, token);
  } catch (e) {
    const list = await req('/cost-components', 'GET', null, token);
    salComp = list.data?.find(c => c.code === 'SAL-BASIC') || list.data?.[0];
  }

  try {
    houComp = await req('/cost-components', 'POST', {
      code: 'ALW-HOUSE',
      nameAr: 'بدل السكن',
      componentType: 'ALLOWANCE',
      nature: 'EARNING',
      calcMethod: 'PCT_BASIC',
      postingTreatment: 'PAYROLL',
      affectsNetPay: true,
      expenseAccountId: accountsMap['5200'],
      liabilityAccountId: accountsMap['2100'],
      sortOrder: 2,
      effectiveFrom: '2026-01-01',
    }, token);
  } catch (e) {
    const list = await req('/cost-components', 'GET', null, token);
    houComp = list.data?.find(c => c.code === 'ALW-HOUSE');
  }

  try {
    insComp = await req('/cost-components', 'POST', {
      code: 'INS-COMP',
      nameAr: 'تأمينات اجتماعية - حصة الشركة',
      componentType: 'INSURANCE',
      nature: 'EMPLOYER_CONTRIB',
      calcMethod: 'PCT_INSURANCE',
      postingTreatment: 'PAYROLL',
      affectsNetPay: false,
      expenseAccountId: accountsMap['5300'],
      liabilityAccountId: accountsMap['2200'],
      sortOrder: 3,
      effectiveFrom: '2026-01-01',
    }, token);
  } catch (e) {
    const list = await req('/cost-components', 'GET', null, token);
    insComp = list.data?.find(c => c.code === 'INS-COMP');
  }

  let techProfile;
  try {
    techProfile = await req('/cost-profiles', 'POST', {
      code: 'PRF-TECH',
      nameAr: 'ملف تكلفة الكوادر التقنية والهندسية',
      description: 'حساب الراتب الأساسي + 25% بدل سكن + 18.75% تأمينات الشركة',
    }, token);
    if (salComp) await req(`/cost-profiles/${techProfile.id}/lines`, 'POST', { componentId: salComp.id, effectiveFrom: '2026-01-01' }, token);
    if (houComp) await req(`/cost-profiles/${techProfile.id}/lines`, 'POST', { componentId: houComp.id, ratePct: '25.00', effectiveFrom: '2026-01-01' }, token);
    if (insComp) await req(`/cost-profiles/${techProfile.id}/lines`, 'POST', { componentId: insComp.id, ratePct: '18.75', effectiveFrom: '2026-01-01' }, token);
    console.log('Cost profile PRF-TECH configured with components!');
  } catch (e) {
    const list = await req('/cost-profiles', 'GET', null, token);
    techProfile = list.data?.find(p => p.code === 'PRF-TECH') || list.data?.[0];
  }

  // 8. Employees
  console.log('Creating employees...');
  const employeesData = [
    {
      code: 'EMP-101',
      fullNameAr: 'م. أحمد إبراهيم الدسوقي',
      fullNameEn: 'Ahmed Ibrahim El-Dessouky',
      email: 'ahmed.dessouky@idham.com',
      phone: '+201001234567',
      employmentType: 'FULL_TIME',
      isBillableResource: true,
      hireDate: '2026-01-01',
      costProfileId: techProfile?.id,
      compensation: { basicSalary: '32000', salaryCurrency: 'EGP', insuranceSalary: '8000' },
    },
    {
      code: 'EMP-102',
      fullNameAr: 'م. سارة محمود الشناوي',
      fullNameEn: 'Sarah Mahmoud El-Shennawy',
      email: 'sarah.shennawy@idham.com',
      phone: '+201009876543',
      employmentType: 'FULL_TIME',
      isBillableResource: true,
      hireDate: '2026-01-01',
      costProfileId: techProfile?.id,
      compensation: { basicSalary: '24000', salaryCurrency: 'EGP', insuranceSalary: '7000' },
    },
    {
      code: 'EMP-103',
      fullNameAr: 'أ. عمر عبد العزيز الفاروق',
      fullNameEn: 'Omar Abdelaziz El-Farouk',
      email: 'omar.farouk@idham.com',
      phone: '+201005554321',
      employmentType: 'FULL_TIME',
      isBillableResource: true,
      hireDate: '2026-01-01',
      costProfileId: techProfile?.id,
      compensation: { basicSalary: '38000', salaryCurrency: 'EGP', insuranceSalary: '9000' },
    },
    {
      code: 'EMP-104',
      fullNameAr: 'أ. ميادة طارق عبد الرحمن',
      fullNameEn: 'Mayada Tarek Abdelrahman',
      email: 'mayada.tarek@idham.com',
      phone: '+201007778899',
      employmentType: 'FULL_TIME',
      isBillableResource: false,
      hireDate: '2026-01-01',
      costProfileId: techProfile?.id,
      compensation: { basicSalary: '20000', salaryCurrency: 'EGP', insuranceSalary: '6000' },
    },
  ];

  const createdEmployees = [];
  for (const emp of employeesData) {
    try {
      const res = await req('/employees', 'POST', emp, token);
      createdEmployees.push(res);
      console.log(`Created employee: ${emp.fullNameAr} (${res.code})`);
    } catch (e) {
      console.log(`Employee ${emp.code} exists or error:`, e.message);
      const list = await req(`/employees?search=${emp.code}`, 'GET', null, token);
      const found = list.data?.find(x => x.code === emp.code);
      if (found) createdEmployees.push(found);
    }
  }

  // 9. Clients & Projects
  console.log('Creating clients & projects...');
  let clientDelta, clientRowad;
  try {
    clientDelta = await req('/clients', 'POST', {
      code: 'CL-DELTA',
      nameAr: 'شركة الدلتا للاستثمارات الرقمية',
      nameEn: 'Delta Digital Investments',
      currencyCode: 'EGP',
    }, token);
  } catch (e) {
    const list = await req('/clients', 'GET', null, token);
    clientDelta = list.data?.find(c => c.code === 'CL-DELTA') || list.data?.[0];
  }

  try {
    clientRowad = await req('/clients', 'POST', {
      code: 'CL-ROWAD',
      nameAr: 'مجموعة الرواد للحلول التقنية',
      nameEn: 'Al-Rowad Tech Solutions',
      currencyCode: 'EGP',
    }, token);
  } catch (e) {
    const list = await req('/clients', 'GET', null, token);
    clientRowad = list.data?.find(c => c.code === 'CL-ROWAD') || list.data?.[1] || clientDelta;
  }

  let prjCommerce, prjSupply;
  try {
    prjCommerce = await req('/projects', 'POST', {
      clientId: clientDelta.id,
      code: 'PRJ-ECOM',
      nameAr: 'مشروع بناء منصة التجارة والتوزيع B2B',
      nameEn: 'B2B E-Commerce Platform',
      startDate: '2026-01-01',
      currencyCode: 'EGP',
      status: 'ACTIVE',
      contractValue: '650000',
      requiredMarginPct: '30.00',
    }, token);
  } catch (e) {
    const list = await req('/projects', 'GET', null, token);
    prjCommerce = list.data?.find(p => p.code === 'PRJ-ECOM') || list.data?.[0];
  }

  try {
    prjSupply = await req('/projects', 'POST', {
      clientId: clientRowad.id,
      code: 'PRJ-SCM',
      nameAr: 'مشروع أتمتة سلاسل الإمداد والخدمات اللوجستية',
      nameEn: 'Supply Chain Automation',
      startDate: '2026-01-01',
      currencyCode: 'EGP',
      status: 'ACTIVE',
      contractValue: '520000',
      requiredMarginPct: '25.00',
    }, token);
  } catch (e) {
    const list = await req('/projects', 'GET', null, token);
    prjSupply = list.data?.find(p => p.code === 'PRJ-SCM') || list.data?.[1] || prjCommerce;
  }

  // 10. Assignments
  console.log('Assigning team to projects...');
  const empDessouky = createdEmployees.find(e => e.code === 'EMP-101');
  const empShennawy = createdEmployees.find(e => e.code === 'EMP-102');
  const empFarouk = createdEmployees.find(e => e.code === 'EMP-103');

  if (empDessouky && prjCommerce) {
    await req('/assignments', 'POST', {
      employeeId: empDessouky.id,
      projectId: prjCommerce.id,
      allocationPct: '100.00',
      startDate: '2026-01-01',
      isBillable: true,
      notes: 'كبير مهندسي المنصة - قيادة معمارية البرمجيات',
    }, token).catch(e => console.log('Assignment exists:', e.message));

    await req('/service-prices', 'POST', {
      employeeId: empDessouky.id,
      projectId: prjCommerce.id,
      pricingBasis: 'MONTHLY',
      price: '58000',
      currencyCode: 'EGP',
      effectiveFrom: '2026-01-01',
      reason: 'سعر تعاقد كبير المهندسين للمشروع',
    }, token).catch(e => console.log('Service price exists:', e.message));
  }

  if (empShennawy && prjCommerce && prjSupply) {
    await req('/assignments', 'POST', {
      employeeId: empShennawy.id,
      projectId: prjCommerce.id,
      allocationPct: '50.00',
      startDate: '2026-01-01',
      isBillable: true,
      notes: 'تصميم تجربة المستخدم للمنصة التجارية',
    }, token).catch(e => console.log('Assignment exists:', e.message));

    await req('/service-prices', 'POST', {
      employeeId: empShennawy.id,
      projectId: prjCommerce.id,
      pricingBasis: 'MONTHLY',
      price: '22000',
      currencyCode: 'EGP',
      effectiveFrom: '2026-01-01',
      reason: 'سعر تعاقد واجهات المستخدم للمنصة',
    }, token).catch(e => console.log('Service price exists:', e.message));

    await req('/assignments', 'POST', {
      employeeId: empShennawy.id,
      projectId: prjSupply.id,
      allocationPct: '50.00',
      startDate: '2026-01-01',
      isBillable: true,
      notes: 'تصميم لوحات تحكم سلاسل الإمداد',
    }, token).catch(e => console.log('Assignment exists:', e.message));

    await req('/service-prices', 'POST', {
      employeeId: empShennawy.id,
      projectId: prjSupply.id,
      pricingBasis: 'MONTHLY',
      price: '22000',
      currencyCode: 'EGP',
      effectiveFrom: '2026-01-01',
      reason: 'سعر تعاقد واجهات سلاسل الإمداد',
    }, token).catch(e => console.log('Service price exists:', e.message));
  }

  if (empFarouk && prjSupply) {
    await req('/assignments', 'POST', {
      employeeId: empFarouk.id,
      projectId: prjSupply.id,
      allocationPct: '100.00',
      startDate: '2026-01-01',
      isBillable: true,
      notes: 'مدير برنامج التحول الرقمي',
    }, token).catch(e => console.log('Assignment exists:', e.message));

    await req('/service-prices', 'POST', {
      employeeId: empFarouk.id,
      projectId: prjSupply.id,
      pricingBasis: 'MONTHLY',
      price: '65000',
      currencyCode: 'EGP',
      effectiveFrom: '2026-01-01',
      reason: 'سعر تعاقد إدارة المشروع الاستشاري',
    }, token).catch(e => console.log('Service price exists:', e.message));
  }

  // 11. Variable Types
  console.log('Configuring payroll variable types...');
  let vtBonus, vtOt, vtDed;
  try {
    vtBonus = await req('/variable-types', 'POST', {
      code: 'BONUS-PERF',
      nameAr: 'مكافأة أداء وتميز استثنائي',
      category: 'BONUS',
      calcMethod: 'FIXED',
      defaultAmount: '3000',
      description: 'مكافأة تصرف بقرار الإدارة بناء على تقييم الأداء والمخرجات',
    }, token);
  } catch (e) {
    const list = await req('/variable-types', 'GET', null, token);
    vtBonus = list.data?.find(v => v.code === 'BONUS-PERF');
  }

  try {
    vtOt = await req('/variable-types', 'POST', {
      code: 'OT-RATE',
      nameAr: 'ساعات عمل إضافية معتمدة',
      category: 'OVERTIME',
      calcMethod: 'HOURS_RATE',
      defaultRate: '150',
      defaultMultiplier: '1.5',
      description: 'تعويض ساعات العمل الإضافية وفق لائحة العمل',
    }, token);
  } catch (e) {
    const list = await req('/variable-types', 'GET', null, token);
    vtOt = list.data?.find(v => v.code === 'OT-RATE');
  }

  try {
    vtDed = await req('/variable-types', 'POST', {
      code: 'DED-ABS',
      nameAr: 'خصم غياب أو جزاء إداري',
      category: 'DEDUCTION',
      calcMethod: 'DAYS_RATE',
      description: 'خصم استقطاع الغياب بدون إذن أو الجزاءات المعتمدة',
    }, token);
  } catch (e) {
    const list = await req('/variable-types', 'GET', null, token);
    vtDed = list.data?.find(v => v.code === 'DED-ABS');
  }

  // 12. Monthly Variables for Period 1
  console.log('Adding monthly variables...');
  if (empDessouky && vtBonus) {
    try {
      const mv = await req('/monthly-variables', 'POST', {
        fiscalPeriodId: janPeriod.id,
        employeeId: empDessouky.id,
        variableTypeId: vtBonus.id,
        amount: '3500',
        notes: 'مكافأة تسليم المرحلة الأولى قبل الموعد المحدد',
      }, token);
      await req(`/monthly-variables/${mv.id}/approve`, 'POST', {}, token);
      console.log('Approved bonus variable for Ahmed Dessouky!');
    } catch (e) {
      console.log('Monthly variable exists or error:', e.message);
    }
  }

  if (empShennawy && vtOt) {
    try {
      const mv = await req('/monthly-variables', 'POST', {
        fiscalPeriodId: janPeriod.id,
        employeeId: empShennawy.id,
        variableTypeId: vtOt.id,
        hours: '12',
        rate: '150',
        multiplier: '1.5',
        notes: 'إضافي ورش عمل واجهات المستخدم المكثفة مع العميل',
      }, token);
      await req(`/monthly-variables/${mv.id}/approve`, 'POST', {}, token);
      console.log('Approved overtime variable for Sarah Shennawy!');
    } catch (e) {
      console.log('Monthly variable exists or error:', e.message);
    }
  }

  // 13. Loans
  console.log('Creating employee loan...');
  if (empFarouk) {
    try {
      const loan = await req('/loans', 'POST', {
        employeeId: empFarouk.id,
        reason: 'سلفة سكنية عاجلة',
        principalAmount: '18000',
        currencyCode: 'EGP',
        installments: 6,
        startPeriodId: janPeriod.id,
      }, token);
      console.log(`Loan created: ${loan.loanNo} (6 installments of ${loan.installments_list?.[0]?.dueAmount} EGP)`);
    } catch (e) {
      console.log('Loan exists or error:', e.message);
    }
  }

  console.log('\n======================================================');
  console.log('IDHAM HR ACCOUNTING ERP - COMPLETE DATASET POPULATED!');
  console.log('======================================================');
  console.log('Admin login: admin / AdminPass12345');
  console.log('Frontend URL: http://localhost:5173');
}

main().catch(console.error);
