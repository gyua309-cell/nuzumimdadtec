/**
 * Comprehensive Demo Fallback Engine for Cloud Previews
 * (GitHub Pages, Vercel, Netlify) when the backend API is unhosted.
 * 
 * Provides rich, realistic Saudi & Egyptian ERP data for all 161+ system endpoints.
 */

const DEMO_COMPANY_ID = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';

export function makeList(items: any[]) {
  const result: any = {
    data: items,
    meta: { page: 1, pageSize: 50, total: items.length },
    items,
    length: items.length,
    map: (fn: any) => items.map(fn),
    filter: (fn: any) => items.filter(fn),
    find: (fn: any) => items.find(fn),
    forEach: (fn: any) => items.forEach(fn),
    slice: (start?: number, end?: number) => items.slice(start, end),
    [Symbol.iterator]: () => items[Symbol.iterator](),
  };
  // Also attach data and meta directly to the underlying array
  try {
    (items as any).data = items;
    (items as any).meta = result.meta;
  } catch {}
  return result;
}

export function getDemoFallback(path: string, method = 'GET', body?: any): any {
  // Handle mutations (POST/PATCH/PUT/DELETE) smoothly
  if (method !== 'GET') {
    return {
      id: (body && body.id) || `demo-id-${Date.now()}`,
      success: true,
      rowVersion: 1,
      message: 'تمت العملية بنجاح',
      ...(typeof body === 'object' && body !== null ? body : {}),
    };
  }

  // 1. Auth & Current Setup
  if (path.includes('/auth/login') || path.includes('/auth/refresh')) {
    return {
      accessToken: 'demo-jwt-token-idham-2026',
      expiresIn: 86400,
      tokenType: 'Bearer',
    };
  }

  if (path.includes('/auth/me')) {
    return {
      user: {
        id: 'user-admin-01',
        username: 'admin',
        email: 'admin@idham.net',
        fullName: 'المدير التنفيذي (شركة عزم للتكنولوجيا)',
        isSystemAdmin: true,
        preferredLocale: 'ar',
        mustChangePassword: false,
      },
      companies: [
        {
          id: DEMO_COMPANY_ID,
          code: 'AZM',
          nameAr: 'شركة عزم للتكنولوجيا والحلول الرقمية',
          nameEn: 'Azm Tech Co.',
          baseCurrency: 'SAR',
        },
      ],
    };
  }

  if (path.includes('/setup/status') || path.includes('/setup/initialize')) {
    return { initialized: true };
  }

  if (path.includes('/companies/current')) {
    return {
      id: DEMO_COMPANY_ID,
      code: 'AZM',
      nameAr: 'شركة عزم للتكنولوجيا والحلول الرقمية',
      nameEn: 'Azm Tech Co.',
      baseCurrency: 'SAR',
      vatNumber: '310123456700003',
      crNumber: '1010123456',
      city: 'الرياض',
      country: 'SA',
    };
  }

  // 2. Positions (الوظائف والهيكل الوظيفي)
  if (path.includes('/positions')) {
    return makeList([
      { id: 'pos-1', code: 'POS-001', titleAr: 'كبير مهندسي البرمجيات (Lead Architect)', titleEn: 'Lead Software Architect', isActive: true },
      { id: 'pos-2', code: 'POS-002', titleAr: 'مطور تطبيقات سحابية أول (Senior Full Stack)', titleEn: 'Senior Full Stack Developer', isActive: true },
      { id: 'pos-3', code: 'POS-003', titleAr: 'مهندس جودة واختبارات النظم (QA Engineer)', titleEn: 'QA Automation Engineer', isActive: true },
      { id: 'pos-4', code: 'POS-004', titleAr: 'مهندس بنية تحتية وعمليات (DevOps Engineer)', titleEn: 'DevOps & Cloud Engineer', isActive: true },
      { id: 'pos-5', code: 'POS-005', titleAr: 'مصمم واجهات وتجربة المستخدم (UI/UX Designer)', titleEn: 'UI/UX Product Designer', isActive: true },
      { id: 'pos-6', code: 'POS-006', titleAr: 'مدير مشاريع تقنية معتمد (Technical Project Manager)', titleEn: 'Technical Project Manager', isActive: true },
      { id: 'pos-7', code: 'POS-007', titleAr: 'محاسب مالي واستشاري تكاليف (Senior Financial Accountant)', titleEn: 'Senior Accountant', isActive: true },
    ]);
  }

  // 3. Employees (الموظفون والكوادر البشرية)
  if (path.includes('/employees')) {
    const emps = [
      {
        id: 'emp-01',
        code: 'EMP-001',
        empNo: 'EMP-001',
        fullNameAr: 'م. أحمد عبد الرحمن الفايد',
        fullNameEn: 'Ahmed El-Fayad',
        positionTitle: 'كبير مهندسي البرمجيات (Lead Architect)',
        positionId: 'pos-1',
        departmentName: 'قطاع التطوير والتكنولوجيا',
        departmentId: 'dept-1',
        branchName: 'الفرع الرئيسي - الرياض',
        branchId: 'br-1',
        country: 'SA',
        locationType: 'KSA_ON_SITE',
        currency: 'SAR',
        basicSalary: '18000.00',
        totalCost: '22500.00',
        billableRate: '350.00',
        requiredMarginPct: '35.00',
        employmentType: 'FULL_TIME',
        isBillableResource: true,
        status: 'ACTIVE',
        hireDate: '2024-01-15',
        nationalId: '1098765432',
        email: 'ahmed.fayad@azmtech.sa',
        phone: '+966501112233',
        costProfileName: 'ملف تكلفة مبرمج موقع (KSA On-Site)',
        costProfileId: 'cp-01',
      },
      {
        id: 'emp-02',
        code: 'EMP-002',
        empNo: 'EMP-002',
        fullNameAr: 'م. إسلام حسن عبد العليم',
        fullNameEn: 'Islam Hassan',
        positionTitle: 'مطور تطبيقات سحابية أول (Senior Full Stack)',
        positionId: 'pos-2',
        departmentName: 'قطاع التطوير والتكنولوجيا',
        departmentId: 'dept-1',
        branchName: 'فرع التطوير الإقليمي - القاهرة',
        branchId: 'br-2',
        country: 'EG',
        locationType: 'EG_REMOTE',
        currency: 'EGP',
        basicSalary: '45000.00',
        totalCost: '52000.00',
        billableRate: '180.00',
        requiredMarginPct: '40.00',
        employmentType: 'FULL_TIME',
        isBillableResource: true,
        status: 'ACTIVE',
        hireDate: '2024-03-01',
        nationalId: '29304121234567',
        email: 'islam.hassan@azmtech.sa',
        phone: '+201012345678',
        costProfileName: 'ملف تكلفة مطور مصر (EGP Remote)',
        costProfileId: 'cp-02',
      },
      {
        id: 'emp-03',
        code: 'EMP-003',
        empNo: 'EMP-003',
        fullNameAr: 'سارة محمد المنصور',
        fullNameEn: 'Sarah Al-Mansoor',
        positionTitle: 'مديرة مشاريع تقنية (Technical Project Manager)',
        positionId: 'pos-6',
        departmentName: 'إدارة المشاريع الرقمية',
        departmentId: 'dept-2',
        branchName: 'الفرع الرئيسي - الرياض',
        branchId: 'br-1',
        country: 'SA',
        locationType: 'KSA_ON_SITE',
        currency: 'SAR',
        basicSalary: '16000.00',
        totalCost: '20000.00',
        billableRate: '300.00',
        requiredMarginPct: '30.00',
        employmentType: 'FULL_TIME',
        isBillableResource: true,
        status: 'ACTIVE',
        hireDate: '2024-05-10',
        nationalId: '1087654321',
        email: 'sarah.mansoor@azmtech.sa',
        phone: '+966552233445',
        costProfileName: 'ملف تكلفة استشاري تقني',
        costProfileId: 'cp-01',
      },
      {
        id: 'emp-04',
        code: 'EMP-004',
        empNo: 'EMP-004',
        fullNameAr: 'مريم خالد العتيبي',
        fullNameEn: 'Mariam Al-Otaibi',
        positionTitle: 'محاسب مالي أول (Senior Accountant)',
        positionId: 'pos-7',
        departmentName: 'الإدارة المالية والمحاسبة',
        departmentId: 'dept-3',
        branchName: 'الفرع الرئيسي - الرياض',
        branchId: 'br-1',
        country: 'SA',
        locationType: 'KSA_ON_SITE',
        currency: 'SAR',
        basicSalary: '12000.00',
        totalCost: '15000.00',
        billableRate: '0.00',
        requiredMarginPct: '0.00',
        employmentType: 'FULL_TIME',
        isBillableResource: false,
        status: 'ACTIVE',
        hireDate: '2023-11-01',
        nationalId: '1076543210',
        email: 'mariam.otaibi@azmtech.sa',
        phone: '+966563344556',
        costProfileName: 'ملف تكلفة كوادر إدارية',
        costProfileId: 'cp-03',
      },
    ];

    if (path.includes('/cost')) {
      return {
        employedDays: 22,
        periodDays: 22,
        totalCostBase: '22500.00',
        distributableCostBase: '22500.00',
        totalDeductionsBase: '0.00',
        dailyDirectCost: '1022.73',
        dailyOverheadCost: '250.00',
        dailyTotalCost: '1272.73',
        currency: 'SAR',
        breakdown: [
          { component: 'الراتب الأساسي وبدل السكن والنقل', amount: '818.18', currency: 'SAR' },
          { component: 'التأمينات الاجتماعية (GOSI المنشأة)', amount: '181.82', currency: 'SAR' },
          { component: 'التأمين الطبي السنوي الموزع', amount: '22.73', currency: 'SAR' },
          { component: 'حصة مصاريف المقر والبرمجيات (Overhead)', amount: '250.00', currency: 'SAR' },
        ],
        lines: [
          { componentNameAr: 'الراتب الأساسي وبدل السكن', componentCode: 'BASIC', kind: 'DIRECT', amountBase: '18000.00', currencyCode: 'SAR', originalAmount: '18000.00' },
          { componentNameAr: 'التأمينات الاجتماعية (GOSI)', componentCode: 'GOSI', kind: 'BENEFIT', amountBase: '4000.00', currencyCode: 'SAR', originalAmount: '4000.00' },
          { componentNameAr: 'تأمين طبي سنوي موزع', componentCode: 'MED', kind: 'BENEFIT', amountBase: '500.00', currencyCode: 'SAR', originalAmount: '500.00' },
        ],
      };
    }
    if (path.includes('/documents')) {
      return [
        { id: 'doc-1', docType: 'NATIONAL_ID', fileName: 'national_id_copy.pdf', uploadedAt: '2024-01-15' },
        { id: 'doc-2', docType: 'CONTRACT', fileName: 'employment_contract_stamped.pdf', uploadedAt: '2024-01-15' },
      ];
    }
    const singleEmp = emps.find((e) => path.endsWith(`/${e.id}`) || path.endsWith(`/${e.code}`));
    if (singleEmp) {
      return {
        ...singleEmp,
        placement: {
          departmentId: singleEmp.departmentId,
          branchId: singleEmp.branchId,
          positionId: singleEmp.positionId,
          costCenterId: 'cc-1',
          managerEmployeeId: null,
        },
        compensation: {
          basicSalary: singleEmp.basicSalary,
          salaryCurrency: singleEmp.currency,
          insuranceSalary: '4000.00',
          insuranceCurrency: singleEmp.currency,
        },
      };
    }
    return makeList(emps);
  }

  // 4. Projects (المشاريع والعقود)
  if (path.includes('/projects')) {
    const projects = [
      {
        id: 'prj-01',
        code: 'PRJ-2026-001',
        nameAr: 'مشروع التحول الرقمي والفوترة الإلكترونية (ZATCA)',
        nameEn: 'ZATCA Digital Transformation',
        clientId: 'cli-01',
        clientName: 'شركة التقنية المتقدمة',
        status: 'ACTIVE',
        billingType: 'TIME_AND_MATERIALS',
        currencyCode: 'SAR',
        totalRevenue: '350000.00',
        totalCost: '185000.00',
        marginPct: '47.14',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        progressPct: 75,
      },
      {
        id: 'prj-02',
        code: 'PRJ-2026-002',
        nameAr: 'تطوير منصة التجارة والتوزيع السحابية',
        nameEn: 'E-Commerce Cloud Platform',
        clientId: 'cli-02',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        status: 'ACTIVE',
        billingType: 'FIXED_PRICE',
        currencyCode: 'SAR',
        totalRevenue: '220000.00',
        totalCost: '110000.00',
        marginPct: '50.00',
        startDate: '2026-02-01',
        endDate: '2026-10-31',
        progressPct: 90,
      },
      {
        id: 'prj-03',
        code: 'PRJ-2026-003',
        nameAr: 'تطبيقات الذكاء الاصطناعي للموارد البشرية',
        nameEn: 'AI HR Intelligence Suite',
        clientId: 'cli-01',
        clientName: 'شركة التقنية المتقدمة',
        status: 'PENDING',
        billingType: 'RETAINER',
        currencyCode: 'SAR',
        totalRevenue: '180000.00',
        totalCost: '95000.00',
        marginPct: '47.22',
        startDate: '2026-03-01',
        endDate: '2026-12-31',
        progressPct: 20,
      },
    ];

    if (path.includes('/profitability')) {
      return {
        revenue: '350000.00',
        directCost: '150000.00',
        overheadCost: '35000.00',
        totalCost: '185000.00',
        grossProfit: '165000.00',
        marginPct: '47.14',
        targetMarginPct: '35.00',
        status: 'HEALTHY',
      };
    }
    const singleProj = projects.find((p) => path.endsWith(`/${p.id}`) || path.endsWith(`/${p.code}`));
    if (singleProj) return singleProj;
    return makeList(projects);
  }

  // 5. Clients (العملاء)
  if (path.includes('/clients')) {
    const clients = [
      { id: 'cli-01', code: 'CLI-001', nameAr: 'شركة التقنية المتقدمة المحدودة', nameEn: 'Advanced Tech Co.', vatNumber: '300012345600003', crNumber: '1010999991', phone: '+966501234567', email: 'info@advtech.sa', city: 'الرياض', isActive: true },
      { id: 'cli-02', code: 'CLI-002', nameAr: 'مؤسسة الحلول الرقمية الكبرى', nameEn: 'Mega Digital Solutions', vatNumber: '300098765400003', crNumber: '1010888882', phone: '+966509876543', email: 'contact@megadigital.sa', city: 'جدة', isActive: true },
      { id: 'cli-03', code: 'CLI-003', nameAr: 'مجموعة الأفق للاستشارات', nameEn: 'Horizon Consulting Group', vatNumber: '300055555500003', crNumber: '1010777773', phone: '+966551122334', email: 'sales@horizon.sa', city: 'الرياض', isActive: true },
    ];
    const singleCli = clients.find((c) => path.endsWith(`/${c.id}`));
    if (singleCli) return singleCli;
    return makeList(clients);
  }

  // 6. Assignments & Workload (توزيع المطورين على المشاريع)
  if (path.includes('/assignments')) {
    const rows = [
      { id: 'as-1', employeeName: 'م. أحمد عبد الرحمن الفايد', employeeId: 'emp-01', projectName: 'مشروع التحول الرقمي ZATCA', projectId: 'prj-01', days: 22, billableAmount: 85000, costAmount: 22500, utilizationPct: 100, roleName: 'Lead Architect', billingRate: 350 },
      { id: 'as-2', employeeName: 'م. إسلام حسن عبد العليم', employeeId: 'emp-02', projectName: 'تطوير منصة التجارة والتوزيع', projectId: 'prj-02', days: 22, billableAmount: 67000, costAmount: 18000, utilizationPct: 100, roleName: 'Full Stack Dev', billingRate: 180 },
      { id: 'as-3', employeeName: 'سارة محمد المنصور', employeeId: 'emp-03', projectName: 'مشروع التحول الرقمي ZATCA', projectId: 'prj-01', days: 20, billableAmount: 60000, costAmount: 20000, utilizationPct: 91, roleName: 'Project Manager', billingRate: 300 },
    ];
    return {
      summary: { totalDays: 64, totalRevenue: 212000, totalCost: 60500, margin: 151500 },
      rows,
      data: rows,
      meta: { page: 1, pageSize: 50, total: rows.length },
    };
  }

  // 7. Organization Structure (الفروع، الأقسام، مراكز التكلفة)
  if (path.includes('/branches')) {
    return makeList([
      { id: 'br-1', code: 'BR-RUH', nameAr: 'الفرع الرئيسي - الرياض', nameEn: 'Riyadh HQ', city: 'الرياض', country: 'SA', isMain: true, isActive: true },
      { id: 'br-2', code: 'BR-CAI', nameAr: 'فرع التطوير والبرمجيات - القاهرة', nameEn: 'Cairo Tech Hub', city: 'القاهرة', country: 'EG', isMain: false, isActive: true },
    ]);
  }

  if (path.includes('/departments')) {
    return makeList([
      { id: 'dept-1', code: 'DEV', nameAr: 'قطاع التطوير والتكنولوجيا', nameEn: 'Software Engineering', branchId: 'br-1', isActive: true },
      { id: 'dept-2', code: 'PMO', nameAr: 'إدارة المشاريع الرقمية', nameEn: 'Project Management Office', branchId: 'br-1', isActive: true },
      { id: 'dept-3', code: 'FIN', nameAr: 'الإدارة المالية والمحاسبة', nameEn: 'Finance & Accounting', branchId: 'br-1', isActive: true },
      { id: 'dept-4', code: 'HR', nameAr: 'الموارد البشرية والشؤون الإدارية', nameEn: 'Human Resources', branchId: 'br-1', isActive: true },
    ]);
  }

  if (path.includes('/cost-centers')) {
    return makeList([
      { id: 'cc-1', code: 'CC-DEV-KSA', nameAr: 'مركز تكلفة مطوري السعودية', nameEn: 'KSA Dev Cost Center', isActive: true },
      { id: 'cc-2', code: 'CC-DEV-EGY', nameAr: 'مركز تكلفة مطوري مصر (عن بعد)', nameEn: 'EGY Dev Cost Center', isActive: true },
      { id: 'cc-3', code: 'CC-OVERHEAD', nameAr: 'مركز المصاريف العمومية والإدارية', nameEn: 'General & Admin Overhead', isActive: true },
    ]);
  }

  if (path.includes('/company-currencies') || path.includes('/currencies')) {
    return makeList([
      { id: 'cur-1', code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', isBase: true, exchangeRate: '1.0000', isActive: true },
      { id: 'cur-2', code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', isBase: false, exchangeRate: '0.0780', isActive: true },
      { id: 'cur-3', code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', isBase: false, exchangeRate: '3.7500', isActive: true },
      { id: 'cur-4', code: 'EUR', nameAr: 'يورو أوروبي', symbol: '€', isBase: false, exchangeRate: '4.0500', isActive: true },
    ]);
  }

  if (path.includes('/exchange-rates')) {
    return makeList([
      { id: 'er-1', fromCurrency: 'USD', toCurrency: 'SAR', rate: '3.7500', effectiveDate: '2026-10-01', isLocked: true },
      { id: 'er-2', fromCurrency: 'EGP', toCurrency: 'SAR', rate: '0.0780', effectiveDate: '2026-10-01', isLocked: true },
      { id: 'er-3', fromCurrency: 'EUR', toCurrency: 'SAR', rate: '4.0500', effectiveDate: '2026-10-01', isLocked: true },
    ]);
  }

  if (path.includes('/fiscal-years')) {
    const years = [
      {
        id: 'fy-2026',
        code: '2026',
        nameAr: 'السنة المالية 2026',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        isClosed: false,
        periods: [
          { id: 'fp-2026-10', code: '2026-10', nameAr: 'أكتوبر 2026', status: 'OPEN', startDate: '2026-10-01', endDate: '2026-10-31' },
          { id: 'fp-2026-09', code: '2026-09', nameAr: 'سبتمبر 2026', status: 'CLOSED', startDate: '2026-09-01', endDate: '2026-09-30' },
        ],
      },
    ];
    return makeList(years);
  }

  if (path.includes('/fiscal-periods')) {
    return makeList([
      { id: 'fp-2026-10', code: '2026-10', name: 'أكتوبر 2026', nameAr: 'أكتوبر 2026', periodNumber: 10, startDate: '2026-10-01', endDate: '2026-10-31', isClosed: false, isCurrent: true, status: 'OPEN', isAdjustmentPeriod: false },
      { id: 'fp-2026-09', code: '2026-09', name: 'سبتمبر 2026', nameAr: 'سبتمبر 2026', periodNumber: 9, startDate: '2026-09-01', endDate: '2026-09-30', isClosed: true, isCurrent: false, status: 'CLOSED', isAdjustmentPeriod: false },
    ]);
  }

  if (path.includes('/work-calendars')) {
    return makeList([
      { id: 'cal-1', code: 'CAL-SA-STD', nameAr: 'تقويم العمل الرسمي في السعودية (أحد - خميس)', weeklyWorkingDays: 5, dailyWorkingHours: 8, isDefault: true, isActive: true },
    ]);
  }

  if (path.includes('/tax-codes') || path.includes('/taxes')) {
    return makeList([
      { id: 'tx-1', code: 'VAT15', nameAr: 'ضريبة القيمة المضافة 15%', rate: '15.00', isDefault: true, vatType: 'STANDARD', isActive: true },
      { id: 'tx-2', code: 'VAT0', nameAr: 'توريدات خاضعة للنسبة الصفرية 0%', rate: '0.00', isDefault: false, vatType: 'ZERO_RATED', isActive: true },
      { id: 'tx-3', code: 'VAT-EXEMPT', nameAr: 'معفاة من الضريبة', rate: '0.00', isDefault: false, vatType: 'EXEMPT', isActive: true },
    ]);
  }

  // 8. Accounting & Ledgers (شجرة الحسابات، قيود اليومية، القوائم)
  if (path.includes('/accounts')) {
    const accs = [
      { id: 'acc-1', code: '1110', nameAr: 'النقدية بالصندوق والبنوك', nameEn: 'Cash & Banks', type: 'ASSET', balance: '542000.00', normalBalance: 'DEBIT', isActive: true },
      { id: 'acc-2', code: '1200', nameAr: 'العملاء وحسابات القبض (A/R)', nameEn: 'Accounts Receivable', type: 'ASSET', balance: '174800.00', normalBalance: 'DEBIT', isActive: true },
      { id: 'acc-3', code: '1300', nameAr: 'عهد الموظفين المستديمة والمؤقتة', nameEn: 'Employee Custodies', type: 'ASSET', balance: '25000.00', normalBalance: 'DEBIT', isActive: true },
      { id: 'acc-4', code: '1500', nameAr: 'الأصول الثابتة وأجهزة الحاسب', nameEn: 'Fixed Assets & Hardware', type: 'ASSET', balance: '185000.00', normalBalance: 'DEBIT', isActive: true },
      { id: 'acc-5', code: '1590', nameAr: 'مجمع إهلاك الأصول الثابتة', nameEn: 'Accumulated Depreciation', type: 'ASSET', balance: '-35000.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-6', code: '2100', nameAr: 'الموردون وحسابات الدفع (A/P)', nameEn: 'Accounts Payable', type: 'LIABILITY', balance: '48200.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-7', code: '2200', nameAr: 'أمانات ومستحقات الرواتب', nameEn: 'Salaries Payable', type: 'LIABILITY', balance: '65000.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-8', code: '2400', nameAr: 'مخرجات ضريبة القيمة المضافة (هيئة الزكاة)', nameEn: 'VAT Output Liability (ZATCA)', type: 'LIABILITY', balance: '22800.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-9', code: '2450', nameAr: 'مدخلات ضريبة القيمة المضافة القابلة للخصم', nameEn: 'VAT Input Tax', type: 'ASSET', balance: '6200.00', normalBalance: 'DEBIT', isActive: true },
      { id: 'acc-10', code: '3100', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', type: 'EQUITY', balance: '500000.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-11', code: '3200', nameAr: 'الأرباح المبقاة', nameEn: 'Retained Earnings', type: 'EQUITY', balance: '150000.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-12', code: '4110', nameAr: 'إيرادات مشاريع البرمجيات والاستشارات', nameEn: 'Software Development Revenue', type: 'REVENUE', balance: '302000.00', normalBalance: 'CREDIT', isActive: true },
      { id: 'acc-13', code: '5100', nameAr: 'تكلفة المطورين والكوادر المباشرة', nameEn: 'Direct Technical Labor Cost', type: 'EXPENSE', balance: '125000.00', normalBalance: 'DEBIT', isActive: true },
      { id: 'acc-14', code: '6100', nameAr: 'مصاريف عمومية وإدارية وخوادم سحابية', nameEn: 'General & Cloud Overhead', type: 'EXPENSE', balance: '41000.00', normalBalance: 'DEBIT', isActive: true },
    ];
    return makeList(accs);
  }

  if (path.includes('/bank-accounts')) {
    return makeList([
      { id: 'ba-1', accountNameAr: 'مصرف الراجحي - الحساب الجاري للشركات', bankName: 'Al Rajhi Bank', iban: 'SA4480000123608010123456', currency: 'SAR', currentBalance: '385000.00', isActive: true },
      { id: 'ba-2', accountNameAr: 'البنك الأهلي السعودي (SNB) - حساب العمليات', bankName: 'Saudi National Bank', iban: 'SA1210000001234567890123', currency: 'SAR', currentBalance: '157000.00', isActive: true },
      { id: 'ba-3', accountNameAr: 'بنك مصر - حساب مطوري القاهرة', bankName: 'Banque Misr', iban: 'EG380002000100000012345678901', currency: 'EGP', currentBalance: '480000.00', isActive: true },
    ]);
  }

  if (path.includes('/journal-entries') || path.includes('/journals')) {
    const entries = [
      { id: 'je-1', entryNo: 'JV-2026-0001', entryDate: '2026-10-22', descriptionAr: 'إثبات فاتورة مبيعات INV-2026-0002 وربط ضريبة ZATCA', totalDebit: '87400.00', totalCredit: '87400.00', status: 'POSTED' },
      { id: 'je-2', entryNo: 'JV-2026-0002', entryDate: '2026-10-20', descriptionAr: 'إثبات فاتورة مبيعات INV-2026-0001 لشركة التقنية المتقدمة', totalDebit: '87400.00', totalCredit: '87400.00', status: 'POSTED' },
      { id: 'je-3', entryNo: 'JV-2026-0003', entryDate: '2026-10-01', descriptionAr: 'قيد استحقاق رواتب المطورين لشهر سبتمبر 2026 وتوزيع مراكز التكلفة', totalDebit: '65000.00', totalCredit: '65000.00', status: 'POSTED' },
      { id: 'je-4', entryNo: 'JV-2026-0004', entryDate: '2026-10-15', descriptionAr: 'سداد فاتورة استضافة خوادم AWS لشهر سبتمبر', totalDebit: '8500.00', totalCredit: '8500.00', status: 'POSTED' },
    ];
    const singleJe = entries.find((e) => path.endsWith(`/${e.id}`));
    if (singleJe) {
      return {
        ...singleJe,
        lines: [
          { id: 'line-1', accountCode: '1200', accountNameAr: 'العملاء وحسابات القبض', debit: '87400.00', credit: '0.00', memoAr: 'استحقاق الفاتورة' },
          { id: 'line-2', accountCode: '4110', accountNameAr: 'إيرادات مشاريع البرمجيات', debit: '0.00', credit: '76000.00', memoAr: 'صافي الإيراد' },
          { id: 'line-3', accountCode: '2400', accountNameAr: 'مخرجات ضريبة القيمة المضافة (ZATCA)', debit: '0.00', credit: '11400.00', memoAr: 'ضريبة 15%' },
        ],
      };
    }
    return makeList(entries);
  }

  if (path.includes('/ledger/trial')) {
    return {
      period: '2026-10',
      totalDebit: 1350000,
      totalCredit: 1350000,
      isBalanced: true,
      lines: [
        { code: '1110', nameAr: 'النقدية بالصندوق والبنوك', debit: 542000, credit: 0 },
        { code: '1200', nameAr: 'العملاء وحسابات القبض', debit: 174800, credit: 0 },
        { code: '1300', nameAr: 'عهد الموظفين', debit: 25000, credit: 0 },
        { code: '1500', nameAr: 'الأصول الثابتة', debit: 185000, credit: 0 },
        { code: '1590', nameAr: 'مجمع إهلاك الأصول', debit: 0, credit: 35000 },
        { code: '2100', nameAr: 'الموردون وحسابات الدفع', debit: 0, credit: 48200 },
        { code: '2200', nameAr: 'أمانات الرواتب', debit: 0, credit: 65000 },
        { code: '2400', nameAr: 'مخرجات ضريبة القيمة المضافة', debit: 0, credit: 22800 },
        { code: '2450', nameAr: 'مدخلات ضريبة القيمة المضافة', debit: 6200, credit: 0 },
        { code: '3100', nameAr: 'رأس المال المدفوع', debit: 0, credit: 500000 },
        { code: '3200', nameAr: 'الأرباح المبقاة', debit: 0, credit: 150000 },
        { code: '4110', nameAr: 'إيرادات مشاريع البرمجيات', debit: 0, credit: 302000 },
        { code: '5100', nameAr: 'تكلفة المطورين المباشرة', debit: 125000, credit: 0 },
        { code: '6100', nameAr: 'مصاريف عمومية وإدارية', debit: 41000, credit: 0 },
      ],
    };
  }

  if (path.includes('/ledger/income')) {
    const lines = [
      { accountId: 'acc-12', code: '4110', nameAr: 'إيرادات مشاريع البرمجيات والاستشارات', amount: '302000.00', accountClass: 'REVENUE' },
      { accountId: 'acc-13', code: '5100', nameAr: 'تكلفة المطورين والكوادر المباشرة', amount: '125000.00', accountClass: 'DIRECT_COST' },
      { accountId: 'acc-14', code: '6100', nameAr: 'مصاريف عمومية وإدارية وخوادم سحابية', amount: '41000.00', accountClass: 'EXPENSE' },
    ];
    return {
      lines,
      totals: {
        revenue: '302000.00',
        directCost: '125000.00',
        grossProfit: '177000.00',
        operatingExpense: '41000.00',
        netIncome: '136000.00',
        netMarginPct: '45.03',
      },
      period: '2026-10',
      grossRevenue: 302000,
      directCost: 125000,
      grossProfit: 177000,
      grossMarginPct: 58.6,
      overheadCost: 41000,
      netProfit: '136000.00',
      netMarginPct: 45.03,
    };
  }

  if (path.includes('/ledger/balance')) {
    return {
      assets: {
        lines: [
          { code: '1110', nameAr: 'النقدية بالصندوق والبنوك', amount: '542000.00' },
          { code: '1200', nameAr: 'العملاء وحسابات القبض', amount: '174800.00' },
          { code: '1300', nameAr: 'عهد الموظفين', amount: '25000.00' },
          { code: '1500', nameAr: 'الأصول الثابتة', amount: '185000.00' },
          { code: '1590', nameAr: 'مجمع الإهلاك', amount: '-28800.00' },
        ],
        total: '898000.00',
      },
      liabilities: {
        lines: [
          { code: '2100', nameAr: 'الموردون وحسابات الدفع', amount: '48200.00' },
          { code: '2200', nameAr: 'أمانات ومستحقات الرواتب', amount: '65000.00' },
          { code: '2400', nameAr: 'مخرجات ضريبة القيمة المضافة', amount: '22800.00' },
        ],
        total: '136000.00',
      },
      equity: {
        lines: [
          { code: '3100', nameAr: 'رأس المال المدفوع', amount: '500000.00' },
          { code: '3200', nameAr: 'الأرباح المبقاة', amount: '150000.00' },
        ],
        total: '650000.00',
      },
      currentEarnings: '112000.00',
      liabilitiesAndEquity: '898000.00',
      period: '2026-10',
      totalAssets: 898000,
      totalLiabilities: 136000,
      totalEquity: 762000,
      isBalanced: true,
    };
  }

  if (path.includes('/ledger/account-statement')) {
    const txs = [
      { entryId: 'je-1', entryDate: '2026-10-05', entryNo: 'JV-2026-0001', lineDescription: 'تحصيل دفعة مشروع ZATCA', currencyCode: 'SAR', debitTx: '100000.00', creditTx: '0.00', debitBase: '100000.00', creditBase: '0.00', runningBalance: '550000.00' },
      { entryId: 'je-4', entryDate: '2026-10-15', entryNo: 'JV-2026-0004', lineDescription: 'سداد فواتير استضافة سحابية AWS', currencyCode: 'SAR', debitTx: '0.00', creditTx: '8000.00', debitBase: '0.00', creditBase: '8000.00', runningBalance: '542000.00' },
    ];
    return {
      account: { id: 'acc-1', code: '1110', nameAr: 'النقدية بالصندوق والبنوك', normalBalance: 'DEBIT' },
      openingBalance: '450000.00',
      periodDebit: '100000.00',
      periodCredit: '8000.00',
      closingBalance: '542000.00',
      data: txs,
      meta: { page: 1, pageSize: 100, total: txs.length },
    };
  }

  if (path.includes('/posting-rules') || path.includes('/posting-events')) {
    return makeList([
      { id: 'pr-1', eventCode: 'INVOICE_POSTED', nameAr: 'قاعدة ترحيل فواتير المبيعات الضريبية', debitAccount: '1200', creditAccount: '4110', vatAccount: '2400', isActive: true },
      { id: 'pr-2', eventCode: 'PAYROLL_ACCRUED', nameAr: 'قاعدة استحقاق رواتب الموظفين الشهرية', debitAccount: '5100', creditAccount: '2200', vatAccount: null, isActive: true },
      { id: 'pr-3', eventCode: 'DEPRECIATION_RUN', nameAr: 'قاعدة قيد إهلاك الأصول الثابتة', debitAccount: '6100', creditAccount: '1590', vatAccount: null, isActive: true },
    ]);
  }

  // 9. Sales Invoices & Credit Notes
  if (path.includes('/credit-notes')) {
    return makeList([
      { id: 'cn-1', noteNo: 'CN-2026-0001', issueDate: '2026-10-10', clientName: 'شركة التقنية المتقدمة', amount: '5000.00', vatAmount: '750.00', totalAmount: '5750.00', reasonAr: 'خصم أداء متفق عليه', zatcaStatus: 'CLEARED' },
    ]);
  }

  if (path.includes('/invoices') || path.includes('/sal/invoices') || path.includes('/zatca/invoices')) {
    const invs = [
      {
        id: 'inv-01',
        invoiceNo: 'INV-2026-0002',
        invoiceNumber: 'INV-2026-0002',
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-22',
        clientName: 'شركة التقنية المتقدمة المحدودة',
        clientVat: '300012345600003',
        currencyCode: 'SAR',
        totalAmount: '87400.00',
        subtotal: '76000.00',
        vatAmount: '11400.00',
        status: 'POSTED',
        zatcaStatus: 'CLEARED',
        complianceStatus: 'PASS',
        hasQr: true,
        hash: '95f57f9b242e1c98492048590382901a',
        submittedAt: '2026-10-22T14:30:00Z',
      },
      {
        id: 'inv-02',
        invoiceNo: 'INV-2026-0001',
        invoiceNumber: 'INV-2026-0001',
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-20',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        clientVat: '300098765400003',
        currencyCode: 'SAR',
        totalAmount: '87400.00',
        subtotal: '76000.00',
        vatAmount: '11400.00',
        status: 'POSTED',
        zatcaStatus: 'CLEARED',
        complianceStatus: 'PASS',
        hasQr: true,
        hash: '34393532393931386439343930356439',
        submittedAt: '2026-10-20T11:15:00Z',
      },
    ];
    const singleInv = invs.find((i) => path.endsWith(`/${i.id}`));
    if (singleInv) {
      return {
        ...singleInv,
        lines: [
          { id: 'line-1', descriptionAr: 'خدمات تطوير واجهات وتكامل منصة ZATCA - دفعة مرحلية', quantity: 1, unitPrice: '76000.00', taxRate: 15, vatAmount: '11400.00', lineTotal: '87400.00' },
        ],
      };
    }
    return makeList(invs);
  }

  // 10. ZATCA Hub & Compliance
  if (path.includes('/zatca/status')) {
    return {
      environment: 'SIMULATION',
      phase: 2,
      csidStatus: 'PRODUCTION',
      csidExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      readyToTransmit: true,
      transmissionAvailable: true,
      transmissionNoteAr: 'منظومة الفوترة الإلكترونية (المرحلة الثانية - الربط والتكامل) متصلة وجاهزة بنسبة 100%. التشفير والأختام الرقمية معتمدة.',
      checklist: [
        { key: 'vat', labelAr: 'الرقم الضريبي للمنشأة (15 رقماً)', ok: true, hintAr: '310123456700003' },
        { key: 'cr', labelAr: 'رقم السجل التجاري', ok: true, hintAr: '1010123456' },
        { key: 'egs', labelAr: 'تعريف وحدة الفوترة الإلكترونية (EGS)', ok: true, hintAr: 'EGS-AZM-01' },
        { key: 'csid', labelAr: 'شهادة CSID من هيئة الزكاة والضريبة والجمارك', ok: true, hintAr: 'معتمدة' },
        { key: 'prod', labelAr: 'شهادة الإنتاج المعتمدة (Production CSID)', ok: true, hintAr: 'صالحة حتى 2027' },
        { key: 'clientVat', labelAr: 'الرقم الضريبي لعملاء الفواتير الضريبية (B2B)', ok: true, hintAr: 'مطابق' },
        { key: 'ublEngine', labelAr: 'محرك توليد مستندات UBL 2.1 XML والتجزئة SHA-256', ok: true, hintAr: 'مدمج ومطابق' },
      ],
      submittedCount: 2,
      pendingCount: 0,
      clearedTotal: 1420,
      reportedTotal: 850,
      rejectedTotal: 0,
      invoicesByStatus: {
        CLEARED: { count: 2, total: '174800.00' },
        REPORTED: { count: 0, total: '0.00' },
        NOT_SUBMITTED: { count: 0, total: '0.00' },
      },
      nonCompliant: [],
    };
  }

  if (path.includes('/zatca/settings')) {
    return {
      environment: 'SIMULATION',
      vatNumber: '310123456700003',
      crNumber: '1010123456',
      egsUnitName: 'EGS-AZM-01',
      egsSerialNo: 'AZM-KSA-2026-EGS-001',
      csidStatus: 'PRODUCTION',
      csidExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      hasCryptoKeys: true,
    };
  }

  if (path.includes('/zatca/submissions')) {
    return makeList([
      { id: 'sub-01', invoiceNo: 'INV-2026-0002', attemptNo: 1, environment: 'SIMULATION', mode: 'CLEARANCE', status: 'CLEARED', requestHash: '95f57f9b242e1c98492048590382901a', createdAt: '2026-10-22T14:31:00Z' },
      { id: 'sub-02', invoiceNo: 'INV-2026-0001', attemptNo: 1, environment: 'SIMULATION', mode: 'CLEARANCE', status: 'CLEARED', requestHash: '34393532393931386439343930356439', createdAt: '2026-10-20T11:16:00Z' },
    ]);
  }

  if (path.includes('/zatca/decode-qr')) {
    return {
      sellerName: 'شركة عزم للتكنولوجيا والحلول الرقمية',
      vatNumber: '310123456700003',
      timestamp: '2026-10-22T14:30:00Z',
      totalAmount: '87400.00',
      vatAmount: '11400.00',
      hashValid: true,
      signatureValid: true,
    };
  }

  // 11. Purchases & Vendors (المشتريات والموردون)
  if (path.includes('/vendors')) {
    return makeList([
      { id: 'ven-1', code: 'VEN-001', nameAr: 'شركة الاتصالات السعودية (STC)', nameEn: 'STC Telecom', vatNumber: '300000000000003', phone: '900', email: 'business@stc.com.sa', city: 'الرياض', isActive: true },
      { id: 'ven-2', code: 'VEN-002', nameAr: 'خدمات أمازون ويب سيرفيسز السحابية (AWS)', nameEn: 'Amazon Web Services', vatNumber: '310000000000003', phone: '+12062661000', email: 'billing@aws.amazon.com', city: 'الرياض', isActive: true },
      { id: 'ven-3', code: 'VEN-003', nameAr: 'شركة الدار لتجهيزات المكاتب والحاسبات', nameEn: 'Al Dar Office Supplies', vatNumber: '300055555500003', phone: '+966114445555', email: 'sales@aldar.sa', city: 'الرياض', isActive: true },
    ]);
  }

  if (path.includes('/purchase-invoices') || path.includes('/pur/invoices')) {
    const pinvs = [
      { id: 'pinv-1', invoiceNo: 'PINV-2026-008', vendorName: 'خدمات أمازون ويب سيرفيسز السحابية (AWS)', issueDate: '2026-10-15', totalAmount: '9775.00', vatAmount: '1275.00', subtotal: '8500.00', status: 'POSTED', currencyCode: 'SAR' },
      { id: 'pinv-2', invoiceNo: 'PINV-2026-009', vendorName: 'شركة الاتصالات السعودية (STC)', issueDate: '2026-10-10', totalAmount: '2300.00', vatAmount: '300.00', subtotal: '2000.00', status: 'POSTED', currencyCode: 'SAR' },
    ];
    const singlePinv = pinvs.find((p) => path.endsWith(`/${p.id}`));
    if (singlePinv) return singlePinv;
    return makeList(pinvs);
  }

  if (path.includes('/debit-notes')) {
    return makeList([
      { id: 'dn-1', noteNo: 'DN-2026-0001', issueDate: '2026-10-12', vendorName: 'شركة الدار لتجهيزات المكاتب والحاسبات', amount: '1150.00', reasonAr: 'إرجاع جهاز معيب', status: 'POSTED' },
    ]);
  }

  // 12. Payroll, Variables & Loans (الرواتب، السلف، المتغيرات)
  if (path.includes('/payroll-runs')) {
    const runs = [
      { id: 'pr-2026-10', code: 'PR-2026-10', periodId: 'fp-2026-10', periodNameAr: 'أكتوبر 2026', totalGross: '91000.00', totalDeductions: '5500.00', totalNet: '85500.00', status: 'POSTED', approvedAt: '2026-10-25' },
      { id: 'pr-2026-09', code: 'PR-2026-09', periodId: 'fp-2026-09', periodNameAr: 'سبتمبر 2026', totalGross: '88000.00', totalDeductions: '4800.00', totalNet: '83200.00', status: 'POSTED', approvedAt: '2026-09-25' },
    ];
    const singleRun = runs.find((r) => path.endsWith(`/${r.id}`));
    if (singleRun) {
      return {
        ...singleRun,
        lines: [
          { employeeName: 'م. أحمد عبد الرحمن الفايد', basicSalary: '18000.00', allowances: '4500.00', deductions: '900.00', netSalary: '21600.00', currency: 'SAR' },
          { employeeName: 'م. إسلام حسن عبد العليم', basicSalary: '45000.00', allowances: '7000.00', deductions: '0.00', netSalary: '52000.00', currency: 'EGP' },
        ],
      };
    }
    return makeList(runs);
  }

  if (path.includes('/monthly-variables')) {
    return makeList([
      { id: 'mv-1', employeeName: 'م. أحمد عبد الرحمن الفايد', typeNameAr: 'مكافأة إنجاز مشروع تسليم ZATCA', amount: '3500.00', currency: 'SAR', status: 'APPROVED', effectiveDate: '2026-10-20' },
      { id: 'mv-2', employeeName: 'م. إسلام حسن عبد العليم', typeNameAr: 'بدل عمل إضافي (عطلة نهاية الأسبوع)', amount: '6000.00', currency: 'EGP', status: 'APPROVED', effectiveDate: '2026-10-18' },
    ]);
  }

  if (path.includes('/variable-types')) {
    return makeList([
      { id: 'vt-1', code: 'BONUS', nameAr: 'مكافأة أداء وتميز', isAddition: true, taxable: false, isActive: true },
      { id: 'vt-2', code: 'OVERTIME', nameAr: 'أجر عمل إضافي', isAddition: true, taxable: true, isActive: true },
      { id: 'vt-3', code: 'DEDUCTION', nameAr: 'خصم غياب أو تأخير', isAddition: false, taxable: false, isActive: true },
    ]);
  }

  if (path.includes('/loans')) {
    return makeList([
      { id: 'ln-1', loanNo: 'LN-2026-01', employeeName: 'م. أحمد عبد الرحمن الفايد', principalAmount: '30000.00', installmentAmount: '2500.00', totalPaid: '15000.00', remainingAmount: '15000.00', status: 'ACTIVE', currency: 'SAR' },
    ]);
  }

  // 13. Assets & Custodies (الأصول والعهد)
  if (path.includes('/asset-categories')) {
    return makeList([
      { id: 'ac-1', code: 'HW-SRV', nameAr: 'خوادم وبنية تحتية سحابية', depreciationMethod: 'STRAIGHT_LINE', usefulLifeYears: 4, salvageValuePct: '5.00', isActive: true },
      { id: 'ac-2', code: 'HW-LAPTOP', nameAr: 'أجهزة حاسب آلي ومحمول للمطورين', depreciationMethod: 'STRAIGHT_LINE', usefulLifeYears: 3, salvageValuePct: '0.00', isActive: true },
      { id: 'ac-3', code: 'OFFICE-FUR', nameAr: 'أثاث ومعدات مكتبية', depreciationMethod: 'STRAIGHT_LINE', usefulLifeYears: 5, salvageValuePct: '10.00', isActive: true },
    ]);
  }

  if (path.includes('/assets')) {
    const assets = [
      { id: 'ast-1', code: 'AST-2026-001', nameAr: 'خادم معالجة مركزي Dell PowerEdge R750', categoryName: 'خوادم وبنية تحتية سحابية', purchaseDate: '2025-01-10', cost: '65000.00', bookValue: '48750.00', status: 'ACTIVE' },
      { id: 'ast-2', code: 'AST-2026-002', nameAr: 'أجهزة MacBook Pro M3 Max للمطورين (عدد 4)', categoryName: 'أجهزة حاسب آلي ومحمول للمطورين', purchaseDate: '2025-06-01', cost: '48000.00', bookValue: '38000.00', status: 'ACTIVE' },
    ];
    const singleAst = assets.find((a) => path.endsWith(`/${a.id}`));
    if (singleAst) return singleAst;
    return makeList(assets);
  }

  if (path.includes('/depreciation-runs')) {
    if (path.includes('/preview')) {
      return {
        lines: [
          { assetNo: 'AST-2026-001', assetName: 'خادم معالجة مركزي Dell PowerEdge', month: '2026-10', employeeName: 'م. أحمد الفايد', days: 30, amountBase: '1354.17' },
          { assetNo: 'AST-2026-002', assetName: 'أجهزة MacBook Pro M3 Max للمطورين', month: '2026-10', employeeName: 'م. إسلام حسن', days: 30, amountBase: '1333.33' },
        ],
      };
    }
    const runs = [
      { id: 'dr-2026-09', runNumber: 'DEP-2026-09', period: '2026-09', totalDepreciation: '3150.00', status: 'POSTED', runDate: '2026-09-30' },
    ];
    const singleDr = runs.find((r) => path.endsWith(`/${r.id}`));
    if (singleDr) {
      return {
        ...singleDr,
        lines: [
          { assetNo: 'AST-2026-001', assetName: 'خادم معالجة مركزي Dell PowerEdge', month: '2026-09', employeeName: 'م. أحمد الفايد', days: 30, amountBase: '1354.17' },
        ],
      };
    }
    return makeList(runs);
  }

  if (path.includes('/custodies')) {
    const custs = [
      { id: 'cst-1', custodyNo: 'CST-2026-01', employeeName: 'م. أحمد عبد الرحمن الفايد', purposeAr: 'عهدة تشغيل وشراء تراخيص ومستلزمات تقنية', totalAmount: '15000.00', settledAmount: '8500.00', remainingAmount: '6500.00', status: 'OPEN', currency: 'SAR' },
      { id: 'cst-2', custodyNo: 'CST-2026-02', employeeName: 'مريم خالد العتيبي', purposeAr: 'عهدة مصروفات إدارية وضيافة الفرع', totalAmount: '10000.00', settledAmount: '6200.00', remainingAmount: '3800.00', status: 'OPEN', currency: 'SAR' },
    ];
    if (path.includes('/report')) {
      return {
        summary: { totalDisbursed: 25000, totalSettled: 14700, totalRemaining: 10300 },
        items: custs,
      };
    }
    const singleCst = custs.find((c) => path.endsWith(`/${c.id}`));
    if (singleCst) return singleCst;
    return makeList(custs);
  }

  // 14. Cost Profiles & Components (ملفات التكلفة وسياسة الـ Overhead)
  if (path.includes('/cost-components')) {
    return makeList([
      { id: 'ccp-1', code: 'BASIC_SALARY', nameAr: 'الراتب الأساسي الشهري', type: 'DIRECT_LABOR', isActive: true },
      { id: 'ccp-2', code: 'GOSI_EMPLOYER', nameAr: 'التأمينات الاجتماعية (حصة المنشأة)', type: 'DIRECT_BENEFITS', isActive: true },
      { id: 'ccp-3', code: 'MEDICAL_INSURANCE', nameAr: 'التأمين الطبي السنوي', type: 'DIRECT_BENEFITS', isActive: true },
      { id: 'ccp-4', code: 'CLOUD_LICENSES', nameAr: 'تراخيص السحابة وأدوات التطوير (IDE/GitHub)', type: 'OVERHEAD', isActive: true },
    ]);
  }

  if (path.includes('/cost-profiles')) {
    const profiles = [
      { id: 'cp-01', code: 'CP-KSA-DEV', nameAr: 'ملف تكلفة مبرمج موقع (KSA On-Site)', dailyRate: '1272.73', currency: 'SAR', isActive: true },
      { id: 'cp-02', code: 'CP-EGY-DEV', nameAr: 'ملف تكلفة مطور مصر (EGP Remote)', dailyRate: '2363.64', currency: 'EGP', isActive: true },
      { id: 'cp-03', code: 'CP-ADMIN', nameAr: 'ملف تكلفة كوادر إدارية', dailyRate: '681.82', currency: 'SAR', isActive: true },
    ];
    const singleCp = profiles.find((p) => path.endsWith(`/${p.id}`));
    if (singleCp) return singleCp;
    return makeList(profiles);
  }

  if (path.includes('/cost-sheet')) {
    return {
      period: { id: 'fp-2026-10', name: 'أكتوبر 2026' },
      totals: {
        totalCostBase: '60500.00',
        distributableCostBase: '52000.00',
        totalDeductionsBase: '0.00',
      },
      rows: [
        {
          employeeId: 'emp-01',
          code: 'EMP-001',
          fullNameAr: 'م. أحمد عبد الرحمن الفايد',
          employedDays: 22,
          periodDays: 22,
          totalCostBase: '22500.00',
          distributableCostBase: '22500.00',
          totalDeductionsBase: '0.00',
          lines: [
            { componentNameAr: 'الراتب الأساسي وبدل السكن', amountBase: '18000.00' },
            { componentNameAr: 'التأمينات الاجتماعية GOSI', amountBase: '4000.00' },
            { componentNameAr: 'تأمين طبي سنوي موزع', amountBase: '500.00' },
          ],
        },
        {
          employeeId: 'emp-02',
          code: 'EMP-002',
          fullNameAr: 'م. إسلام حسن عبد العليم',
          employedDays: 22,
          periodDays: 22,
          totalCostBase: '18000.00',
          distributableCostBase: '18000.00',
          totalDeductionsBase: '0.00',
          lines: [
            { componentNameAr: 'الراتب الأساسي (45,000 ج.م)', amountBase: '15500.00' },
            { componentNameAr: 'بدل عمل إقليمي وتطوير', amountBase: '2500.00' },
          ],
        },
        {
          employeeId: 'emp-03',
          code: 'EMP-003',
          fullNameAr: 'سارة محمد المنصور',
          employedDays: 20,
          periodDays: 22,
          totalCostBase: '20000.00',
          distributableCostBase: '20000.00',
          totalDeductionsBase: '0.00',
          lines: [
            { componentNameAr: 'الراتب والبدلات الإدارية', amountBase: '20000.00' },
          ],
        },
      ],
      dailyWorkingHours: 8,
      annualWorkingDays: 240,
      monthlyWorkingDays: 22,
      components: [
        { nameAr: 'الأجور المباشرة والبدلات', weightPct: '72.00', currency: 'SAR' },
        { nameAr: 'التأمينات والمزايا الوظيفية', weightPct: '16.00', currency: 'SAR' },
        { nameAr: 'حصة التكاليف غير المباشرة (Overhead)', weightPct: '12.00', currency: 'SAR' },
      ],
    };
  }

  if (path.includes('/overhead-policy')) {
    return {
      allocationMethod: 'DIRECT_LABOR_HOURS',
      overheadRatePerHour: '31.25',
      currency: 'SAR',
      effectiveYear: 2026,
    };
  }

  if (path.includes('/service-prices')) {
    return makeList([
      { id: 'sp-1', roleTitleAr: 'كبير مهندسي البرمجيات (Lead Architect)', dailyPrice: '2800.00', hourlyPrice: '350.00', currency: 'SAR', isActive: true },
      { id: 'sp-2', roleTitleAr: 'مطور Full Stack (Senior)', dailyPrice: '1440.00', hourlyPrice: '180.00', currency: 'SAR', isActive: true },
      { id: 'sp-3', roleTitleAr: 'مدير مشاريع تقنية معتمد', dailyPrice: '2400.00', hourlyPrice: '300.00', currency: 'SAR', isActive: true },
    ]);
  }

  // 15. Revenue Recognition & Runs (استحقاق الإيرادات)
  if (path.includes('/revenue-runs')) {
    if (path.includes('/preview')) {
      return {
        lines: [
          { employeeName: 'م. أحمد عبد الرحمن الفايد', projectName: 'مشروع التحول الرقمي ZATCA', pricingBasis: 'DAYS', units: 22, allocationPct: 100, grossRevenueBase: '85000.00' },
          { employeeName: 'م. إسلام حسن عبد العليم', projectName: 'تطوير منصة التجارة والتوزيع', pricingBasis: 'DAYS', units: 22, allocationPct: 100, grossRevenueBase: '67000.00' },
        ],
      };
    }
    return makeList([
      { id: 'rr-2026-10', runCode: 'REV-2026-10', period: '2026-10', recognizedRevenue: '302000.00', totalDirectCost: '125000.00', grossProfit: '177000.00', status: 'POSTED', runDate: '2026-10-25' },
    ]);
  }

  if (path.includes('/profitability/employees') || path.includes('/reports/employee-profitability')) {
    const employees = [
      { employeeId: 'emp-01', employeeCode: 'EMP-001', employeeName: 'م. أحمد عبد الرحمن الفايد', departmentName: 'تطوير البرمجيات', billableDays: 22, totalDays: 22, utilizationPct: 100, revenueBase: '85000.00', costBase: '22500.00', profitBase: '62500.00', marginPct: '73.53' },
      { employeeId: 'emp-02', employeeCode: 'EMP-002', employeeName: 'م. إسلام حسن عبد العليم', departmentName: 'تطوير البرمجيات', billableDays: 22, totalDays: 22, utilizationPct: 100, revenueBase: '67000.00', costBase: '18000.00', profitBase: '49000.00', marginPct: '73.13' },
      { employeeId: 'emp-03', employeeCode: 'EMP-003', employeeName: 'سارة محمد المنصور', departmentName: 'إدارة المشاريع', billableDays: 20, totalDays: 22, utilizationPct: 91, revenueBase: '60000.00', costBase: '20000.00', profitBase: '40000.00', marginPct: '66.67' },
    ];
    return {
      summary: {
        employeeCount: 3,
        totalRevenueBase: '212000.00',
        totalCostBase: '60500.00',
        totalUnutilizedCostBase: '0.00',
        totalProfitBase: '151500.00',
        averageMarginPct: '71.46',
      },
      employees,
      data: employees,
    };
  }

  if (path.includes('/profitability/clients')) {
    return [
      { clientId: 'cli-01', clientCode: 'CLI-001', clientName: 'شركة التقنية المتقدمة', revenueBase: '1450000.00', costBase: '750000.00', profitBase: '700000.00', marginPct: '48.28' },
      { clientId: 'cli-02', clientCode: 'CLI-002', clientName: 'مؤسسة الحلول الرقمية الكبرى', revenueBase: '1000000.00', costBase: '520000.00', profitBase: '480000.00', marginPct: '48.00' },
    ];
  }

  // 16. Reports & Financial Intelligence (الذكاء المالي والتقارير)
  if (path.includes('/reports/executive-intelligence')) {
    return {
      kpis: {
        ytdRevenue: '2450000.00',
        ytdNetProfit: '1120000.00',
        netMarginPct: '45.71',
        utilizationRate: '94.20',
        activeProjects: 3,
        totalDevelopers: 4,
      },
      topClients: [
        { clientName: 'شركة التقنية المتقدمة المحدودة', revenue: '1450000.00', sharePct: '59.18' },
        { clientName: 'مؤسسة الحلول الرقمية الكبرى', revenue: '1000000.00', sharePct: '40.82' },
      ],
    };
  }

  if (path.includes('/reports/cash-flow')) {
    return {
      operatingInflow: '650000.00',
      operatingOutflow: '215000.00',
      netOperatingCash: '435000.00',
      investingOutflow: '48000.00',
      financingFlow: '0.00',
      netCashIncrease: '387000.00',
      openingCash: '155000.00',
      closingCash: '542000.00',
    };
  }

  if (path.includes('/reports/vat-return') || path.includes('/vat-report')) {
    return {
      period: 'Q3-2026',
      standardRatedSales: '350000.00',
      vatOnSales: '52500.00',
      zeroRatedSales: '0.00',
      standardRatedPurchases: '85000.00',
      vatOnPurchases: '12750.00',
      netVatPayable: '39750.00',
      status: 'SUBMITTED_AND_PAID',
    };
  }

  if (path.includes('/zakat')) {
    return {
      zakatBase: '762000.00',
      ratePct: '2.577', // Hijri/Gregorian proportion
      calculatedZakat: '19636.74',
      year: 2026,
      status: 'CALCULATED',
    };
  }

  if (path.includes('/snapshots')) {
    return makeList([
      { id: 'snap-2026-09', period: '2026-09', snapshotDate: '2026-09-30', totalAssets: '850000.00', netIncome: '125000.00', isLocked: true },
    ]);
  }

  // 17. Users, Roles & Security (المستخدمين والأدوار وسجل الرقابة)
  if (path.includes('/users')) {
    return makeList([
      { id: 'u-1', username: 'admin', fullName: 'المدير التنفيذي (شركة عزم للتكنولوجيا)', email: 'admin@idham.net', isSystemAdmin: true, roleTitleAr: 'مدير نظام كامل الصلاحيات', isActive: true },
      { id: 'u-2', username: 'accountant', fullName: 'مريم خالد العتيبي', email: 'mariam.otaibi@azmtech.sa', isSystemAdmin: false, roleTitleAr: 'رئيس الحسابات والمالية', isActive: true },
      { id: 'u-3', username: 'pmo', fullName: 'سارة محمد المنصور', email: 'sarah.mansoor@azmtech.sa', isSystemAdmin: false, roleTitleAr: 'مدير عمليات المشاريع', isActive: true },
    ]);
  }

  if (path.includes('/roles') || path.includes('/permissions')) {
    return makeList([
      { id: 'role-1', code: 'ADMIN', nameAr: 'مدير النظام التنفيذي', descriptionAr: 'كامل الصلاحيات المالية والإدارية والتقنية', userCount: 1, isSystem: true },
      { id: 'role-2', code: 'FIN_MANAGER', nameAr: 'مدير مالي ومحاسب قانوني', descriptionAr: 'إدارة القيود، الحسابات، الضرائب وهيئة الزكاة', userCount: 1, isSystem: false },
      { id: 'role-3', code: 'HR_PMO', nameAr: 'مدير المشاريع والموارد البشرية', descriptionAr: 'إدارة الموظفين وتوزيع الكوادر ونسب الإنجاز', userCount: 1, isSystem: false },
    ]);
  }

  if (path.includes('/audit/log') || path.includes('/audit/security')) {
    return makeList([
      { id: 'aud-1', action: 'INVOICE_CLEARANCE', entity: 'ZATCA', username: 'admin', ipAddress: '192.168.1.100', timestamp: '2026-10-22T14:31:00Z', detailsAr: 'اعتماد الفاتورة الضريبية INV-2026-0002 بنجاح لدى ZATCA' },
      { id: 'aud-2', action: 'PAYROLL_POST', entity: 'PAYROLL', username: 'admin', ipAddress: '192.168.1.100', timestamp: '2026-10-20T10:15:00Z', detailsAr: 'ترحيل مسير رواتب شهر أكتوبر 2026 وإنشاء القيد المحاسبي' },
      { id: 'aud-3', action: 'LOGIN_SUCCESS', entity: 'AUTH', username: 'admin', ipAddress: '192.168.1.100', timestamp: '2026-10-26T09:00:00Z', detailsAr: 'تسجيل دخول ناجح للمدير التنفيذي' },
    ]);
  }

  if (path.includes('/auth/logout') || path.includes('/auth/password/change')) {
    return { success: true, message: 'تم بنجاح' };
  }

  if (path.includes('/closing/periods')) {
    return {
      canClose: true,
      isClosed: false,
      warnings: [],
      results: [
        { code: 'CHK-01', titleAr: 'فحص ميزان المراجعة وتوازن القيود المحاسبية', status: 'OK', message: 'ميزان المراجعة متزن تماماً (المدين = الدائن)' },
        { code: 'CHK-02', titleAr: 'فحص ترحيل مسير رواتب الشهر', status: 'OK', message: 'تم ترحيل مسير الرواتب بنجاح' },
        { code: 'CHK-03', titleAr: 'فحص إهلاك الأصول الثابتة للفترة', status: 'OK', message: 'تم ترحيل قيود الإهلاك' },
        { code: 'CHK-04', titleAr: 'فحص مطابقة إقرارات ضريبة القيمة المضافة ZATCA', status: 'OK', message: 'جميع الفواتير معتمدة ومطابقة' },
      ],
    };
  }

  if (path.includes('/revenue-adjustments')) {
    return { success: true, adjustments: [] };
  }

  if (path.includes('/zatca/onboard')) {
    return { onboarded: true, csidStatus: 'PRODUCTION', message: 'تم الربط مع هيئة الزكاة والضريبة والجمارك بنجاح' };
  }

  // 18. Default fallback for any unspecified endpoint
  return makeList([]);
}
