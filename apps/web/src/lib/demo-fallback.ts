/**
 * Comprehensive Demo Fallback Engine for Cloud Previews
 * (GitHub Pages, Vercel, Netlify) when the backend API is unhosted.
 * 
 * Provides rich, realistic Saudi & Egyptian ERP data for all 161+ system endpoints.
 */

const DEMO_COMPANY_ID = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';

export function makeList<T = any>(items: T[]): T[] & { data: T[]; meta: { page: number; pageSize: number; total: number }; items: T[]; success: boolean } {
  const arr = (Array.isArray(items) ? [...items] : []) as any;
  arr.data = arr;
  arr.meta = { page: 1, pageSize: 50, total: arr.length };
  arr.items = arr;
  arr.success = true;
  return arr;
}

export function getDemoFallback(path: string, method = 'GET', body?: any): any {
  // Handle mutations (POST/PATCH/PUT/DELETE) smoothly
  if (method !== 'GET') {
    return {
      id: (body && body.id) || `demo-id-${Date.now()}`,
      success: true,
      rowVersion: 1,
      message: 'تمت العملية بنجاح',
      returnNo: 'ZKT-2026-001',
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
      { id: 'pos-6', code: 'POS-006', titleAr: 'مدير مشاريع تقنية (Scrum Master)', titleEn: 'Technical Project Manager', isActive: true },
      { id: 'pos-7', code: 'POS-007', titleAr: 'محاسب مالي رئيسي (Senior Accountant)', titleEn: 'Senior Financial Accountant', isActive: true },
    ]);
  }

  // 3. Profitability Modules (Must precede general /projects and /clients!)
  if (path.includes('/profitability/projects')) {
    return makeList([
      {
        projectId: 'prj-01',
        projectCode: 'PRJ-2026-001',
        projectName: 'مشروع التحول الرقمي والفوترة الإلكترونية (ZATCA)',
        clientId: 'cli-01',
        clientCode: 'CLI-001',
        clientName: 'شركة التقنية المتقدمة',
        revenueBase: '350000.00',
        directCostBase: '150000.00',
        overheadCostBase: '35000.00',
        overheadBase: '35000.00',
        totalCostBase: '185000.00',
        grossProfitBase: '165000.00',
        grossMarginPct: '47.14',
        marginPct: '47.14',
        requiredMarginPct: '35.00',
        targetMarginPct: '35.00',
        meetsTarget: true,
        status: 'HEALTHY',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
      {
        projectId: 'prj-02',
        projectCode: 'PRJ-2026-002',
        projectName: 'تطوير منصة التجارة والتوزيع السحابية',
        clientId: 'cli-02',
        clientCode: 'CLI-002',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        revenueBase: '220000.00',
        directCostBase: '90000.00',
        overheadCostBase: '20000.00',
        overheadBase: '20000.00',
        totalCostBase: '110000.00',
        grossProfitBase: '110000.00',
        grossMarginPct: '50.00',
        marginPct: '50.00',
        requiredMarginPct: '40.00',
        targetMarginPct: '40.00',
        meetsTarget: true,
        status: 'HEALTHY',
        startDate: '2026-02-01',
        endDate: '2026-10-31',
      },
      {
        projectId: 'prj-03',
        projectCode: 'PRJ-2026-003',
        projectName: 'تطبيقات الذكاء الاصطناعي للموارد البشرية',
        clientId: 'cli-01',
        clientCode: 'CLI-001',
        clientName: 'شركة التقنية المتقدمة',
        revenueBase: '180000.00',
        directCostBase: '75000.00',
        overheadCostBase: '20000.00',
        overheadBase: '20000.00',
        totalCostBase: '95000.00',
        grossProfitBase: '85000.00',
        grossMarginPct: '47.22',
        marginPct: '47.22',
        requiredMarginPct: '40.00',
        targetMarginPct: '40.00',
        meetsTarget: true,
        status: 'HEALTHY',
        startDate: '2026-03-01',
        endDate: '2026-12-31',
      },
    ]);
  }

  if (path.includes('/profitability/clients')) {
    return makeList([
      {
        clientId: 'cli-01',
        clientCode: 'CLI-001',
        clientName: 'شركة التقنية المتقدمة',
        projectCount: 2,
        revenueBase: '530000.00',
        directCostBase: '225000.00',
        overheadBase: '55000.00',
        totalCostBase: '280000.00',
        grossProfitBase: '250000.00',
        grossMarginPct: '47.17',
        marginPct: '47.17',
      },
      {
        clientId: 'cli-02',
        clientCode: 'CLI-002',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        projectCount: 1,
        revenueBase: '220000.00',
        directCostBase: '90000.00',
        overheadBase: '20000.00',
        totalCostBase: '110000.00',
        grossProfitBase: '110000.00',
        grossMarginPct: '50.00',
        marginPct: '50.00',
      },
    ]);
  }

  if (path.includes('/profitability/employees') || path.includes('/reports/employee-profitability')) {
    const employees = [
      {
        employeeId: 'emp-01',
        employeeCode: 'EMP-001',
        employeeName: 'م. أحمد عبد الرحمن الفايد',
        positionTitle: 'كبير مهندسي البرمجيات (Lead Architect)',
        departmentName: 'تطوير البرمجيات والأنظمة',
        billableDays: 22,
        totalDays: 22,
        allocatedPct: 100,
        unutilizedDays: 0,
        unutilizedPct: 0,
        unutilizedCostBase: '0.00',
        directCostBase: '22500.00',
        revenueBase: '85000.00',
        profitBase: '62500.00',
        marginPct: '73.53',
        projects: [{ projectId: 'prj-01', projectName: 'مشروع التحول الرقمي ZATCA', days: 22, billableAmount: 85000 }],
      },
      {
        employeeId: 'emp-02',
        employeeCode: 'EMP-002',
        employeeName: 'م. إسلام حسن عبد العليم',
        positionTitle: 'مطور تطبيقات سحابية أول (Senior Full Stack)',
        departmentName: 'تطوير البرمجيات والأنظمة',
        billableDays: 22,
        totalDays: 22,
        allocatedPct: 100,
        unutilizedDays: 0,
        unutilizedPct: 0,
        unutilizedCostBase: '0.00',
        directCostBase: '18000.00',
        revenueBase: '67000.00',
        profitBase: '49000.00',
        marginPct: '73.13',
        projects: [{ projectId: 'prj-02', projectName: 'تطوير منصة التجارة والتوزيع', days: 22, billableAmount: 67000 }],
      },
      {
        employeeId: 'emp-03',
        employeeCode: 'EMP-003',
        employeeName: 'سارة محمد المنصور',
        positionTitle: 'مدير مشاريع تقنية (Scrum Master)',
        departmentName: 'إدارة المشاريع والتحول الرقمي',
        billableDays: 20,
        totalDays: 22,
        allocatedPct: 91,
        unutilizedDays: 2,
        unutilizedPct: 9.1,
        unutilizedCostBase: '1818.18',
        directCostBase: '20000.00',
        revenueBase: '60000.00',
        profitBase: '40000.00',
        marginPct: '66.67',
        projects: [{ projectId: 'prj-01', projectName: 'مشروع التحول الرقمي ZATCA', days: 20, billableAmount: 60000 }],
      },
      {
        employeeId: 'emp-04',
        employeeCode: 'EMP-004',
        employeeName: 'مريم عبد الله العتيبي',
        positionTitle: 'مصمم واجهات وتجربة المستخدم (UI/UX Designer)',
        departmentName: 'تطوير البرمجيات والأنظمة',
        billableDays: 18,
        totalDays: 22,
        allocatedPct: 82,
        unutilizedDays: 4,
        unutilizedPct: 18.2,
        unutilizedCostBase: '2681.82',
        directCostBase: '8000.00',
        revenueBase: '30000.00',
        profitBase: '22000.00',
        marginPct: '73.33',
        projects: [{ projectId: 'prj-03', projectName: 'تطبيقات الذكاء الاصطناعي للموارد البشرية', days: 18, billableAmount: 30000 }],
      },
    ];
    return {
      summary: {
        employeeCount: 4,
        totalRevenueBase: '242000.00',
        totalCostBase: '68500.00',
        totalUnutilizedCostBase: '4500.00',
        totalProfitBase: '173500.00',
        averageMarginPct: '71.69',
      },
      employees,
      data: employees,
    };
  }

  // 4. Assignments Reports (Must precede general /assignments!)
  if (path.includes('/assignments/employee-days-report')) {
    const rows = [
      {
        assignmentId: 'as-1',
        employeeId: 'emp-01',
        employeeCode: 'EMP-001',
        employeeName: 'م. أحمد عبد الرحمن الفايد',
        positionTitle: 'كبير مهندسي البرمجيات (Lead Architect)',
        projectId: 'prj-01',
        projectCode: 'PRJ-2026-001',
        projectName: 'مشروع التحول الرقمي والفوترة الإلكترونية (ZATCA)',
        clientId: 'cli-01',
        clientName: 'شركة التقنية المتقدمة',
        allocationBasis: 'DAYS',
        workingDaysInMonth: 22,
        allocatedDays: 22,
        allocationPct: 100,
        unutilizedDays: 0,
        unutilizedPct: 0,
        pricingBasis: 'DAILY',
        unitPrice: '3863.64',
        employeeMonthlyCost: '22500.00',
        projectCostShare: '22500.00',
        revenueGenerated: '85000.00',
        grossProfit: '62500.00',
        marginPct: 73.5,
        invoiceStatus: 'POSTED',
        invoiceId: 'inv-01',
        invoiceNo: 'INV-2026-0001',
      },
      {
        assignmentId: 'as-2',
        employeeId: 'emp-02',
        employeeCode: 'EMP-002',
        employeeName: 'م. إسلام حسن عبد العليم',
        positionTitle: 'مطور تطبيقات سحابية أول (Senior Full Stack)',
        projectId: 'prj-02',
        projectCode: 'PRJ-2026-002',
        projectName: 'تطوير منصة التجارة والتوزيع السحابية',
        clientId: 'cli-02',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        allocationBasis: 'DAYS',
        workingDaysInMonth: 22,
        allocatedDays: 22,
        allocationPct: 100,
        unutilizedDays: 0,
        unutilizedPct: 0,
        pricingBasis: 'MONTHLY',
        unitPrice: '67000.00',
        employeeMonthlyCost: '18000.00',
        projectCostShare: '18000.00',
        revenueGenerated: '67000.00',
        grossProfit: '49000.00',
        marginPct: 73.1,
        invoiceStatus: 'POSTED',
        invoiceId: 'inv-02',
        invoiceNo: 'INV-2026-0002',
      },
      {
        assignmentId: 'as-3',
        employeeId: 'emp-03',
        employeeCode: 'EMP-003',
        employeeName: 'سارة محمد المنصور',
        positionTitle: 'مدير مشاريع تقنية (Scrum Master)',
        projectId: 'prj-01',
        projectCode: 'PRJ-2026-001',
        projectName: 'مشروع التحول الرقمي والفوترة الإلكترونية (ZATCA)',
        clientId: 'cli-01',
        clientName: 'شركة التقنية المتقدمة',
        allocationBasis: 'DAYS',
        workingDaysInMonth: 22,
        allocatedDays: 20,
        allocationPct: 91,
        unutilizedDays: 2,
        unutilizedPct: 9,
        pricingBasis: 'DAILY',
        unitPrice: '3000.00',
        employeeMonthlyCost: '20000.00',
        projectCostShare: '18181.82',
        revenueGenerated: '60000.00',
        grossProfit: '41818.18',
        marginPct: 69.7,
        invoiceStatus: 'UNINVOICED',
        invoiceId: null,
        invoiceNo: null,
      },
    ];
    return {
      period: { id: 'fp-2026-10', name: 'أكتوبر 2026', start: '2026-10-01', end: '2026-10-31' },
      summary: {
        totalAssignments: 3,
        totalAllocatedDays: 64,
        totalRevenue: '212000.00',
        totalCost: '60500.00',
        totalProfit: '151500.00',
        averageMarginPct: 71.5,
        invoicedCount: 2,
        pendingInvoiceCount: 1,
      },
      rows,
      data: rows,
      meta: { page: 1, pageSize: 50, total: rows.length },
    };
  }

  if (path.includes('/assignments/utilization')) {
    return makeList([
      {
        employeeId: 'emp-01',
        employeeCode: 'EMP-001',
        employeeName: 'م. أحمد عبد الرحمن الفايد',
        allocatedPct: 100,
        unutilizedPct: 0,
        overAllocatedPct: 0,
        isOverAllocated: false,
        projectNames: ['مشروع التحول الرقمي ZATCA'],
      },
      {
        employeeId: 'emp-02',
        employeeCode: 'EMP-002',
        employeeName: 'م. إسلام حسن عبد العليم',
        allocatedPct: 100,
        unutilizedPct: 0,
        overAllocatedPct: 0,
        isOverAllocated: false,
        projectNames: ['تطوير منصة التجارة والتوزيع'],
      },
      {
        employeeId: 'emp-03',
        employeeCode: 'EMP-003',
        employeeName: 'سارة محمد المنصور',
        allocatedPct: 91,
        unutilizedPct: 9,
        overAllocatedPct: 0,
        isOverAllocated: false,
        projectNames: ['مشروع التحول الرقمي ZATCA'],
      },
      {
        employeeId: 'emp-04',
        employeeCode: 'EMP-004',
        employeeName: 'مريم عبد الله العتيبي',
        allocatedPct: 82,
        unutilizedPct: 18,
        overAllocatedPct: 0,
        isOverAllocated: false,
        projectNames: ['تطبيقات الذكاء الاصطناعي للموارد البشرية'],
      },
    ]);
  }

  // 5. Employees & Placement
  if (path.includes('/employees')) {
    const emps = [
      {
        id: 'emp-01',
        code: 'EMP-001',
        fullNameAr: 'م. أحمد عبد الرحمن الفايد',
        fullNameEn: 'Ahmed Al-Fayed',
        nationalId: '1088776655',
        departmentId: 'dept-01',
        departmentName: 'تطوير البرمجيات والأنظمة',
        positionId: 'pos-1',
        positionTitle: 'كبير مهندسي البرمجيات (Lead Architect)',
        branchId: 'br-01',
        branchName: 'المقر الرئيسي - الرياض',
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        hireDate: '2024-01-15',
        currency: 'SAR',
        basicSalary: '18000.00',
        totalCost: '22500.00',
        isBillableResource: true,
        requiredMarginPct: '35.00',
        email: 'ahmed.fayed@azmtech.sa',
        phone: '+966501122334',
        costProfileName: 'ملف تكلفة مهندسين أول',
        costProfileId: 'cp-01',
      },
      {
        id: 'emp-02',
        code: 'EMP-002',
        fullNameAr: 'م. إسلام حسن عبد العليم',
        fullNameEn: 'Eslam Hassan',
        nationalId: '29201011234567',
        departmentId: 'dept-01',
        departmentName: 'تطوير البرمجيات والأنظمة',
        positionId: 'pos-2',
        positionTitle: 'مطور تطبيقات سحابية أول (Senior Full Stack)',
        branchId: 'br-02',
        branchName: 'فرع جمهورية مصر العربية - القاهرة',
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        hireDate: '2024-03-01',
        currency: 'EGP',
        basicSalary: '45000.00',
        totalCost: '18000.00',
        isBillableResource: true,
        requiredMarginPct: '40.00',
        email: 'eslam.hassan@azmtech.sa',
        phone: '+201012345678',
        costProfileName: 'ملف تكلفة كوادر إقليمية (EGP)',
        costProfileId: 'cp-02',
      },
      {
        id: 'emp-03',
        code: 'EMP-003',
        fullNameAr: 'سارة محمد المنصور',
        fullNameEn: 'Sarah Al-Mansoor',
        nationalId: '1099887766',
        departmentId: 'dept-02',
        departmentName: 'إدارة المشاريع والتحول الرقمي',
        positionId: 'pos-6',
        positionTitle: 'مدير مشاريع تقنية (Scrum Master)',
        branchId: 'br-01',
        branchName: 'المقر الرئيسي - الرياض',
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        hireDate: '2024-06-01',
        currency: 'SAR',
        basicSalary: '16000.00',
        totalCost: '20000.00',
        isBillableResource: true,
        requiredMarginPct: '30.00',
        email: 'sarah.mansoor@azmtech.sa',
        phone: '+966552233445',
        costProfileName: 'ملف تكلفة مدراء المشاريع',
        costProfileId: 'cp-01',
      },
      {
        id: 'emp-04',
        code: 'EMP-004',
        fullNameAr: 'مريم عبد الله العتيبي',
        fullNameEn: 'Mariam Al-Otaibi',
        nationalId: '1077665544',
        departmentId: 'dept-01',
        departmentName: 'تطوير البرمجيات والأنظمة',
        positionId: 'pos-5',
        positionTitle: 'مصمم واجهات وتجربة المستخدم (UI/UX Designer)',
        branchId: 'br-01',
        branchName: 'المقر الرئيسي - الرياض',
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        hireDate: '2025-01-01',
        currency: 'SAR',
        basicSalary: '12000.00',
        totalCost: '15000.00',
        isBillableResource: true,
        requiredMarginPct: '35.00',
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
      return makeList([
        { id: 'doc-01', docType: 'NATIONAL_ID', documentNo: '1088776655', issueDate: '2020-01-01', expiryDate: '2030-01-01', isVerified: true },
        { id: 'doc-02', docType: 'PASSPORT', documentNo: 'P0199282', issueDate: '2022-05-10', expiryDate: '2027-05-10', isVerified: true },
        { id: 'doc-03', docType: 'CONTRACT', documentNo: 'CNT-2024-001', issueDate: '2024-01-15', expiryDate: '2026-01-14', isVerified: true },
      ]);
    }

    const singleEmp = emps.find((e) => path.endsWith(`/${e.id}`) || path.endsWith(`/${e.code}`));
    if (singleEmp) {
      return {
        ...singleEmp,
        placement: {
          departmentId: singleEmp.departmentId,
          branchId: singleEmp.branchId,
          positionId: singleEmp.positionId,
          costCenterId: 'cc-01',
          managerEmployeeId: null,
        },
        salary: {
          basicSalary: singleEmp.basicSalary,
          salaryCurrency: singleEmp.currency,
          insuranceSalary: '4000.00',
          insuranceCurrency: singleEmp.currency,
        },
      };
    }
    return makeList(emps);
  }

  // 6. Projects (المشاريع والعقود)
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

    const singleProj = projects.find((p) => path.endsWith(`/${p.id}`) || path.endsWith(`/${p.code}`));
    if (singleProj) return singleProj;
    return makeList(projects);
  }

  // 7. Clients (العملاء)
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

  // 8. Assignments & Workload (توزيع المطورين على المشاريع)
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

  // 9. Organization Structures (الفروع، الأقسام، مراكز التكلفة)
  if (path.includes('/branches')) {
    return makeList([
      { id: 'br-01', code: 'HQ-RUH', nameAr: 'المقر الرئيسي - الرياض', nameEn: 'Riyadh HQ', city: 'الرياض', country: 'SA', countryCode: 'SA', functionalCurrency: 'SAR', documentSequencePrefix: 'RUH-', taxNumber: '300000000000003', isHeadquarters: true, isActive: true },
      { id: 'br-02', code: 'BR-CAI', nameAr: 'فرع جمهورية مصر العربية - القاهرة', nameEn: 'Cairo Branch', city: 'القاهرة', country: 'EG', countryCode: 'EG', functionalCurrency: 'EGP', documentSequencePrefix: 'CAI-', taxNumber: '100-200-300', isHeadquarters: false, isActive: true },
      { id: 'br-03', code: 'JED', nameAr: 'فرع المنطقة الغربية - جدة', nameEn: 'Jeddah Branch', city: 'جدة', country: 'SA', countryCode: 'SA', functionalCurrency: 'SAR', documentSequencePrefix: 'JED-', taxNumber: '300000000000003', isHeadquarters: false, isActive: true },
    ]);
  }

  if (path.includes('/departments')) {
    return makeList([
      { id: 'dept-01', code: 'TECH', nameAr: 'تطوير البرمجيات والأنظمة', nameEn: 'Software Engineering', managerName: 'م. أحمد عبد الرحمن الفايد', isActive: true },
      { id: 'dept-02', code: 'PMO', nameAr: 'إدارة المشاريع والتحول الرقمي', nameEn: 'PMO & Digital Delivery', managerName: 'سارة محمد المنصور', isActive: true },
      { id: 'dept-03', code: 'FIN', nameAr: 'الشؤون المالية والمحاسبية', nameEn: 'Finance & Accounting', managerName: 'مريم خالد العتيبي', isActive: true },
      { id: 'dept-04', code: 'OPS', nameAr: 'العمليات والتشغيل السحابي', nameEn: 'Cloud Operations & DevOps', managerName: 'م. إسلام حسن', isActive: true },
    ]);
  }

  if (path.includes('/cost-centers')) {
    return makeList([
      { id: 'cc-01', code: 'CC-DELIVERY', nameAr: 'مركز تكلفة تنفيذ المشاريع التعاقدية', type: 'DIRECT', isActive: true },
      { id: 'cc-02', code: 'CC-RND', nameAr: 'مركز تكلفة البحوث والذكاء الاصطناعي', type: 'INVESTMENT', isActive: true },
      { id: 'cc-03', code: 'CC-ADMIN', nameAr: 'مركز تكلفة المصروفات العمومية والإدارية', type: 'OVERHEAD', isActive: true },
    ]);
  }

  if (path.includes('/company-currencies') || path.includes('/currencies')) {
    return makeList([
      { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', isBase: true, exchangeRate: 1.0, decimalPlaces: 2, isActive: true },
      { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', isBase: false, exchangeRate: 0.076, decimalPlaces: 2, isActive: true },
      { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', isBase: false, exchangeRate: 3.75, decimalPlaces: 2, isActive: true },
      { code: 'EUR', nameAr: 'يورو أوروبي', symbol: '€', isBase: false, exchangeRate: 4.10, decimalPlaces: 2, isActive: true },
    ]);
  }

  if (path.includes('/exchange-rates')) {
    return makeList([
      { id: 'xr-01', fromCurrency: 'EGP', toCurrency: 'SAR', rate: '0.076000', effectiveDate: '2026-10-01' },
      { id: 'xr-02', fromCurrency: 'USD', toCurrency: 'SAR', rate: '3.750000', effectiveDate: '2026-10-01' },
      { id: 'xr-03', fromCurrency: 'EUR', toCurrency: 'SAR', rate: '4.100000', effectiveDate: '2026-10-01' },
    ]);
  }

  // 10. Accounting & Ledgers (دليل الحسابات ودفتر الأستاذ)
  if (path.includes('/fiscal-years')) {
    return makeList([
      { id: 'fy-2026', code: 'FY-2026', nameAr: 'السنة المالية 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'OPEN', isClosed: false },
      { id: 'fy-2025', code: 'FY-2025', nameAr: 'السنة المالية 2025', startDate: '2025-01-01', endDate: '2025-12-31', status: 'CLOSED', isClosed: true },
    ]);
  }

  if (path.includes('/fiscal-periods')) {
    return makeList([
      { id: 'fp-2026-10', name: 'أكتوبر 2026', startDate: '2026-10-01', endDate: '2026-10-31', status: 'OPEN', isAdjustmentPeriod: false },
      { id: 'fp-2026-09', name: 'سبتمبر 2026', startDate: '2026-09-01', endDate: '2026-09-30', status: 'CLOSED', isAdjustmentPeriod: false },
      { id: 'fp-2026-08', name: 'أغسطس 2026', startDate: '2026-08-01', endDate: '2026-08-31', status: 'CLOSED', isAdjustmentPeriod: false },
    ]);
  }

  if (path.includes('/work-calendars')) {
    return makeList([
      { id: 'cal-sa', code: 'CAL-SA', nameAr: 'تقويم العمل السعودي (الأحد - الخميس)', weekendDays: [5, 6], standardHoursPerDay: 8, isActive: true },
      { id: 'cal-eg', code: 'CAL-EG', nameAr: 'تقويم العمل المصري (الأحد - الخميس)', weekendDays: [5, 6], standardHoursPerDay: 8, isActive: true },
    ]);
  }

  if (path.includes('/tax-codes') || path.includes('/taxes')) {
    return makeList([
      { id: 'tax-15', code: 'VAT15', nameAr: 'ضريبة القيمة المضافة القياسية 15%', ratePct: '15.00', taxType: 'VAT', isRecoverable: true, isActive: true },
      { id: 'tax-0', code: 'VAT0', nameAr: 'ضريبة بنسبة الصفر %0', ratePct: '0.00', taxType: 'VAT', isRecoverable: true, isActive: true },
      { id: 'tax-ex', code: 'VATEX', nameAr: 'معفى من الضريبة', ratePct: '0.00', taxType: 'EXEMPT', isRecoverable: false, isActive: true },
    ]);
  }

  if (path.includes('/accounts')) {
    return makeList([
      { id: 'acc-101', code: '10101', nameAr: 'الصندوق والعهد النقدية', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '150000.00', currency: 'SAR', isActive: true },
      { id: 'acc-102', code: '10201', nameAr: 'مصرف الراجحي - الحساب الجاري التجاري', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '4850000.00', currency: 'SAR', isActive: true },
      { id: 'acc-103', code: '10202', nameAr: 'البنك الأهلي السعودي (SNB) - حساب الرواتب', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '1200000.00', currency: 'SAR', isActive: true },
      { id: 'acc-104', code: '10301', nameAr: 'العملاء وحسابات القبض التجارية (A/R)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '750000.00', currency: 'SAR', isActive: true },
      { id: 'acc-105', code: '10401', nameAr: 'العهد المؤقتة للموظفين', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '25000.00', currency: 'SAR', isActive: true },
      { id: 'acc-201', code: '20101', nameAr: 'الموردون وحسابات الدفع (A/P)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '320000.00', currency: 'SAR', isActive: true },
      { id: 'acc-202', code: '20201', nameAr: 'ضريبة القيمة المضافة المستحقة (ZATCA VAT)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '95000.00', currency: 'SAR', isActive: true },
      { id: 'acc-203', code: '20301', nameAr: 'مستحقات التأمينات الاجتماعية (GOSI)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '28000.00', currency: 'SAR', isActive: true },
      { id: 'acc-301', code: '30101', nameAr: 'رأس المال المدفوع', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '5000000.00', currency: 'SAR', isActive: true },
      { id: 'acc-302', code: '30201', nameAr: 'الأرباح المبقاة', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '1250000.00', currency: 'SAR', isActive: true },
      { id: 'acc-401', code: '40101', nameAr: 'إيرادات عقود وتطوير البرمجيات والمشاريع', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: true, currentBalance: '2450000.00', currency: 'SAR', isActive: true },
      { id: 'acc-501', code: '50101', nameAr: 'تكلفة المطورين والرواتب المباشرة للمشاريع', accountClass: 'EXPENSE', normalBalance: 'DEBIT', isPosting: true, currentBalance: '820000.00', currency: 'SAR', isActive: true },
      { id: 'acc-502', code: '50201', nameAr: 'تكاليف السحابة والبنية التحتية (AWS/GCP)', accountClass: 'EXPENSE', normalBalance: 'DEBIT', isPosting: true, currentBalance: '145000.00', currency: 'SAR', isActive: true },
    ]);
  }

  if (path.includes('/bank-accounts')) {
    return makeList([
      { id: 'ba-01', bankNameAr: 'مصرف الراجحي', bankNameEn: 'Al Rajhi Bank', accountNumber: '20401827491001', iban: 'SA038000020401827491001', currency: 'SAR', currentBalance: '4850000.00', glAccountId: 'acc-102', isActive: true },
      { id: 'ba-02', bankNameAr: 'البنك الأهلي السعودي (SNB)', bankNameEn: 'Saudi National Bank', accountNumber: '10029384756002', iban: 'SA4410000010029384756002', currency: 'SAR', currentBalance: '1200000.00', glAccountId: 'acc-103', isActive: true },
      { id: 'ba-03', bankNameAr: 'البنك التجاري الدولي (CIB مصر)', bankNameEn: 'Commercial International Bank', accountNumber: '100029384711', iban: 'EG3800100000000100029384711', currency: 'EGP', currentBalance: '3500000.00', glAccountId: 'acc-101', isActive: true },
    ]);
  }

  if (path.includes('/journal-entries') || path.includes('/journals')) {
    return makeList([
      {
        id: 'je-2026-001',
        entryNumber: 'JV-2026-0001',
        entryDate: '2026-10-01',
        descriptionAr: 'قيد إثبات رأس المال التأسيسي في الحساب البنكي',
        status: 'POSTED',
        totalDebit: '5000000.00',
        totalCredit: '5000000.00',
        lines: [
          { accountCode: '10201', accountName: 'مصرف الراجحي - الحساب الجاري', debit: '5000000.00', credit: '0.00' },
          { accountCode: '30101', accountName: 'رأس المال المدفوع', debit: '0.00', credit: '5000000.00' },
        ],
      },
      {
        id: 'je-2026-002',
        entryNumber: 'JV-2026-0002',
        entryDate: '2026-10-15',
        descriptionAr: 'قيد استحقاق إيرادات المرحلة الأولى - مشروع التحول الرقمي ZATCA',
        status: 'POSTED',
        totalDebit: '172500.00',
        totalCredit: '172500.00',
        lines: [
          { accountCode: '10301', accountName: 'العملاء (شركة التقنية المتقدمة)', debit: '172500.00', credit: '0.00' },
          { accountCode: '40101', accountName: 'إيرادات عقود وتطوير البرمجيات', debit: '0.00', credit: '150000.00' },
          { accountCode: '20201', accountName: 'ضريبة القيمة المضافة المستحقة (15%)', debit: '0.00', credit: '22500.00' },
        ],
      },
      {
        id: 'je-2026-003',
        entryNumber: 'JV-2026-0003',
        entryDate: '2026-10-25',
        descriptionAr: 'قيد ترحيل مسير رواتب المطورين والمهندسين لشهر أكتوبر',
        status: 'POSTED',
        totalDebit: '60500.00',
        totalCredit: '60500.00',
        lines: [
          { accountCode: '50101', accountName: 'تكلفة المطورين والرواتب المباشرة للمشاريع', debit: '60500.00', credit: '0.00' },
          { accountCode: '10202', accountName: 'البنك الأهلي السعودي - حساب الرواتب', debit: '0.00', credit: '60500.00' },
        ],
      },
    ]);
  }

  // 11. Financial Reports & Statements
  if (path.includes('/ledger/trial')) {
    return {
      period: 'أكتوبر 2026',
      totalDebit: '8243000.00',
      totalCredit: '8243000.00',
      isBalanced: true,
      rows: [
        { code: '10101', nameAr: 'الصندوق والعهد النقدية', openingDebit: 10000, openingCredit: 0, periodDebit: 140000, periodCredit: 0, closingDebit: 150000, closingCredit: 0, isPosting: true },
        { code: '10201', nameAr: 'مصرف الراجحي - الحساب الجاري', openingDebit: 0, openingCredit: 0, periodDebit: 5000000, periodCredit: 150000, closingDebit: 4850000, closingCredit: 0, isPosting: true },
        { code: '10202', nameAr: 'البنك الأهلي السعودي - حساب الرواتب', openingDebit: 1260500, openingCredit: 0, periodDebit: 0, periodCredit: 60500, closingDebit: 1200000, closingCredit: 0, isPosting: true },
        { code: '10301', nameAr: 'العملاء وحسابات القبض (A/R)', openingDebit: 577500, openingCredit: 0, periodDebit: 172500, periodCredit: 0, closingDebit: 750000, closingCredit: 0, isPosting: true },
        { code: '20101', nameAr: 'الموردون وحسابات الدفع (A/P)', openingDebit: 0, openingCredit: 320000, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 320000, isPosting: true },
        { code: '20201', nameAr: 'ضريبة القيمة المضافة المستحقة (ZATCA)', openingDebit: 0, openingCredit: 72500, periodDebit: 0, periodCredit: 22500, closingDebit: 0, closingCredit: 95000, isPosting: true },
        { code: '30101', nameAr: 'رأس المال المدفوع', openingDebit: 0, openingCredit: 5000000, periodDebit: 0, periodCredit: 0, closingDebit: 0, closingCredit: 5000000, isPosting: true },
        { code: '40101', nameAr: 'إيرادات عقود وتطوير البرمجيات', openingDebit: 0, openingCredit: 2300000, periodDebit: 0, periodCredit: 150000, closingDebit: 0, closingCredit: 2450000, isPosting: true },
        { code: '50101', nameAr: 'تكلفة المطورين والرواتب المباشرة', openingDebit: 759500, openingCredit: 0, periodDebit: 60500, periodCredit: 0, closingDebit: 820000, closingCredit: 0, isPosting: true },
        { code: '50201', nameAr: 'تكاليف السحابة والبنية التحتية', openingDebit: 145000, openingCredit: 0, periodDebit: 0, periodCredit: 0, closingDebit: 145000, closingCredit: 0, isPosting: true },
      ],
      lines: [
        { code: '10101', nameAr: 'الصندوق والعهد النقدية', openingDebit: '10000.00', openingCredit: '0.00', periodDebit: '140000.00', periodCredit: '0.00', closingDebit: '150000.00', closingCredit: '0.00', isPosting: true },
        { code: '10201', nameAr: 'مصرف الراجحي - الحساب الجاري', openingDebit: '0.00', openingCredit: '0.00', periodDebit: '5000000.00', periodCredit: '150000.00', closingDebit: '4850000.00', closingCredit: '0.00', isPosting: true },
        { code: '10202', nameAr: 'البنك الأهلي السعودي - حساب الرواتب', openingDebit: '1260500.00', openingCredit: '0.00', periodDebit: '0.00', periodCredit: '60500.00', closingDebit: '1200000.00', closingCredit: '0.00', isPosting: true },
        { code: '10301', nameAr: 'العملاء وحسابات القبض (A/R)', openingDebit: '577500.00', openingCredit: '0.00', periodDebit: '172500.00', periodCredit: '0.00', closingDebit: '750000.00', closingCredit: '0.00', isPosting: true },
        { code: '20101', nameAr: 'الموردون وحسابات الدفع (A/P)', openingDebit: '0.00', openingCredit: '320000.00', periodDebit: '0.00', periodCredit: '0.00', closingDebit: '0.00', closingCredit: '320000.00', isPosting: true },
        { code: '20201', nameAr: 'ضريبة القيمة المضافة المستحقة (ZATCA)', openingDebit: '0.00', openingCredit: '72500.00', periodDebit: '0.00', periodCredit: '22500.00', closingDebit: '0.00', closingCredit: '95000.00', isPosting: true },
        { code: '30101', nameAr: 'رأس المال المدفوع', openingDebit: '0.00', openingCredit: '5000000.00', periodDebit: '0.00', periodCredit: '0.00', closingDebit: '0.00', closingCredit: '5000000.00', isPosting: true },
        { code: '40101', nameAr: 'إيرادات عقود وتطوير البرمجيات', openingDebit: '0.00', openingCredit: '2300000.00', periodDebit: '0.00', periodCredit: '150000.00', closingDebit: '0.00', closingCredit: '2450000.00', isPosting: true },
        { code: '50101', nameAr: 'تكلفة المطورين والرواتب المباشرة', openingDebit: '759500.00', openingCredit: '0.00', periodDebit: '60500.00', periodCredit: '0.00', closingDebit: '820000.00', closingCredit: '0.00', isPosting: true },
        { code: '50201', nameAr: 'تكاليف السحابة والبنية التحتية', openingDebit: '145000.00', openingCredit: '0.00', periodDebit: '0.00', periodCredit: '0.00', closingDebit: '145000.00', closingCredit: '0.00', isPosting: true },
      ],
    };
  }

  if (path.includes('/ledger/income')) {
    return {
      revenue: '2450000.00',
      directCost: '820000.00',
      grossProfit: '1630000.00',
      operatingExpenses: '145000.00',
      netProfit: '1485000.00',
      marginPct: '60.61',
      lines: [
        { accountCode: '40101', accountName: 'إيرادات عقود وتطوير البرمجيات والمشاريع', accountClass: 'REVENUE', amount: '2450000.00' },
        { accountCode: '50101', accountName: 'تكلفة المطورين والرواتب المباشرة للمشاريع', accountClass: 'EXPENSE', amount: '820000.00' },
        { accountCode: '50201', accountName: 'تكاليف السحابة والبنية التحتية والمصروفات التشغيلية', accountClass: 'EXPENSE', amount: '145000.00' },
      ],
    };
  }

  if (path.includes('/ledger/balance')) {
    return {
      asOfDate: '2026-10-31',
      assets: {
        total: '6950000.00',
        current: '6950000.00',
        nonCurrent: '0.00',
        lines: [
          { code: '10101', name: 'الصندوق والعهد النقدية', amount: '150000.00' },
          { code: '10201', name: 'مصرف الراجحي - الحساب الجاري التجاري', amount: '4850000.00' },
          { code: '10202', name: 'البنك الأهلي السعودي - حساب الرواتب', amount: '1200000.00' },
          { code: '10301', name: 'العملاء وحسابات القبض التجارية (A/R)', amount: '750000.00' },
        ],
      },
      liabilities: {
        total: '443000.00',
        lines: [
          { code: '20101', name: 'الموردون وحسابات الدفع (A/P)', amount: '320000.00' },
          { code: '20201', name: 'ضريبة القيمة المضافة المستحقة (ZATCA)', amount: '95000.00' },
          { code: '20301', name: 'مستحقات التأمينات الاجتماعية (GOSI)', amount: '28000.00' },
        ],
      },
      equity: {
        total: '6507000.00',
        lines: [
          { code: '30101', name: 'رأس المال المدفوع', amount: '5000000.00' },
          { code: '30201', name: 'أرباح الفترة الحالية والأرباح المبقاة', amount: '1507000.00' },
        ],
      },
      isBalanced: true,
    };
  }

  if (path.includes('/ledger/account-statement')) {
    return {
      account: { code: '10201', nameAr: 'مصرف الراجحي - الحساب الجاري التجاري', currency: 'SAR' },
      openingBalance: '0.00',
      closingBalance: '4850000.00',
      totalDebit: '5000000.00',
      totalCredit: '150000.00',
      lines: [
        { id: 'l-1', entryDate: '2026-10-01', entryNumber: 'JV-2026-0001', description: 'إيداع رأس المال التأسيسي', debit: '5000000.00', credit: '0.00', balance: '5000000.00' },
        { id: 'l-2', entryDate: '2026-10-15', entryNumber: 'JV-2026-0004', description: 'سداد دفعة للموردين والبنية التحتية', debit: '0.00', credit: '150000.00', balance: '4850000.00' },
      ],
    };
  }

  if (path.includes('/posting-rules') || path.includes('/posting-events')) {
    return makeList([
      { id: 'pr-01', eventCode: 'INVOICE_POSTED', nameAr: 'ترحيل فاتورة مبيعات', debitAccountCode: '10301', creditAccountCode: '40101', taxAccountCode: '20201', isActive: true },
      { id: 'pr-02', eventCode: 'PAYROLL_POSTED', nameAr: 'ترحيل مسير الرواتب الشهري', debitAccountCode: '50101', creditAccountCode: '10202', isActive: true },
      { id: 'pr-03', eventCode: 'DEPRECIATION_POSTED', nameAr: 'ترحيل قيد الإهلاك الدوري', debitAccountCode: '50301', creditAccountCode: '10502', isActive: true },
    ]);
  }

  // 12. Invoicing, ZATCA & Sales
  if (path.includes('/credit-notes')) {
    return makeList([
      { id: 'cn-01', noteNumber: 'CN-2026-0001', invoiceNumber: 'INV-2026-0001', clientName: 'شركة التقنية المتقدمة', amount: '5750.00', vatAmount: '750.00', totalWithVat: '5750.00', reason: 'خصم حسن أداء للمرحلة الأولى', status: 'CLEARED', issueDate: '2026-10-22' },
    ]);
  }

  if (path.includes('/invoices') || path.includes('/sal/invoices') || path.includes('/zatca/invoices')) {
    const invs = [
      {
        id: 'inv-01',
        invoiceNumber: 'INV-2026-0001',
        issueDate: '2026-10-20',
        dueDate: '2026-11-20',
        clientName: 'شركة التقنية المتقدمة المحدودة',
        clientVatNumber: '300012345600003',
        clientAddress: 'طريق الملك فهد، الرياض، المملكة العربية السعودية',
        projectName: 'مشروع التحول الرقمي والفوترة الإلكترونية (ZATCA)',
        status: 'CLEARED',
        zatcaStatus: 'CLEARED',
        paymentStatus: 'PAID',
        currencyCode: 'SAR',
        exchangeRate: '1.0000',
        subtotal: '76000.00',
        vatAmount: '11400.00',
        totalWithVat: '87400.00',
        type: 'STANDARD',
        qrCodeBase64: 'AQ9DYWlybyBDb25zdWx0aW5nAg8zMTAxMjM0NTY3MDAwMDMDFTIwMjYtMTAtMjBUMTE6MTU6MDBaBAY4NzQwLjAwBQUxMTQwLjAw',
        ublXmlHash: '95f57f9b242e1c98492048590382901a5e12f6b8',
        lines: [
          { id: 'l1', description: 'خدمات استشارية معمارية وهندسة برمجيات (م. أحمد الفايد - 22 يوم عمل)', quantity: 22, unitPrice: '2500.00', vatPct: 15, vatAmount: '8250.00', lineTotal: '63250.00' },
          { id: 'l2', description: 'إدارة وتوجيه مشاريع تقنية سحابية (سارة المنصور - 10 أيام عمل)', quantity: 10, unitPrice: '2100.00', vatPct: 15, vatAmount: '3150.00', lineTotal: '24150.00' },
        ],
      },
      {
        id: 'inv-02',
        invoiceNumber: 'INV-2026-0002',
        issueDate: '2026-10-22',
        dueDate: '2026-11-22',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        clientVatNumber: '300098765400003',
        clientAddress: 'طريق الأندلس، جدة، المملكة العربية السعودية',
        projectName: 'تطوير منصة التجارة والتوزيع السحابية',
        status: 'CLEARED',
        zatcaStatus: 'CLEARED',
        paymentStatus: 'UNPAID',
        currencyCode: 'SAR',
        exchangeRate: '1.0000',
        subtotal: '76000.00',
        vatAmount: '11400.00',
        totalWithVat: '87400.00',
        type: 'STANDARD',
        qrCodeBase64: 'AQ9DYWlybyBDb25zdWx0aW5nAg8zMTAxMjM0NTY3MDAwMDMDFTIwMjYtMTAtMjJUMTQ6MzA6MDBaBAY4NzQwLjAwBQUxMTQwLjAw',
        ublXmlHash: '34393532393931386439343930356439',
        lines: [
          { id: 'l3', description: 'تطوير واجهات وبرمجة خلفية سحابية (م. إسلام حسن - 22 يوم عمل)', quantity: 22, unitPrice: '3000.00', vatPct: 15, vatAmount: '9900.00', lineTotal: '75900.00' },
          { id: 'l4', description: 'تصميم تجربة وواجهة المستخدم للوحات التحكم (مريم العتيبي - 5 أيام)', quantity: 5, unitPrice: '2000.00', vatPct: 15, vatAmount: '1500.00', lineTotal: '11500.00' },
        ],
      },
    ];

    if (path.includes('/ubl-xml')) {
      return {
        ublXml: `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>INV-2026-0001</cbc:ID>
  <cbc:UUID>34393532-3939-3138-6439-343930356439</cbc:UUID>
  <cbc:IssueDate>2026-10-20</cbc:IssueDate>
  <cbc:IssueTime>11:15:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
</Invoice>`,
        hash: '95f57f9b242e1c98492048590382901a5e12f6b8',
      };
    }

    const singleInv = invs.find((i) => path.endsWith(`/${i.id}`) || path.endsWith(`/${i.invoiceNumber}`));
    if (singleInv) return singleInv;
    return makeList(invs);
  }

  // 13. ZATCA Compliance Hub
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
      tags: {
        sellerName: 'شركة عزم للتكنولوجيا والحلول الرقمية',
        vatNumber: '310123456700003',
        timestamp: '2026-10-22T14:30:00Z',
        totalAmount: '87400.00',
        vatAmount: '11400.00',
      },
    };
  }

  // 14. Purchases & Vendors
  if (path.includes('/vendors')) {
    return makeList([
      { id: 'ven-01', code: 'VEN-001', nameAr: 'أمازون ويب سيرفيسز (AWS EMEA)', nameEn: 'Amazon Web Services EMEA', vatNumber: '300077889900003', city: 'دبلن', country: 'IE', paymentTermsDays: 30, isActive: true },
      { id: 'ven-02', code: 'VEN-002', nameAr: 'مايكروسوفت العربية المحدودة', nameEn: 'Microsoft Arabia', vatNumber: '300066554400003', city: 'الرياض', country: 'SA', paymentTermsDays: 45, isActive: true },
      { id: 'ven-03', code: 'VEN-003', nameAr: 'شركة الاتصالات السعودية (STC)', nameEn: 'Saudi Telecom Co.', vatNumber: '300011223300003', city: 'الرياض', country: 'SA', paymentTermsDays: 30, isActive: true },
    ]);
  }

  if (path.includes('/purchase-invoices') || path.includes('/pur/invoices')) {
    const pinvs = [
      { id: 'pinv-01', invoiceNumber: 'PINV-2026-001', vendorName: 'أمازون ويب سيرفيسز (AWS EMEA)', issueDate: '2026-10-05', totalWithVat: '14500.00', vatAmount: '0.00', currencyCode: 'USD', status: 'POSTED' },
      { id: 'pinv-02', invoiceNumber: 'PINV-2026-002', vendorName: 'شركة الاتصالات السعودية (STC)', issueDate: '2026-10-10', totalWithVat: '3450.00', vatAmount: '450.00', currencyCode: 'SAR', status: 'POSTED' },
    ];
    const singlePinv = pinvs.find((p) => path.endsWith(`/${p.id}`));
    if (singlePinv) return singlePinv;
    return makeList(pinvs);
  }

  if (path.includes('/debit-notes')) {
    return makeList([
      { id: 'dn-01', noteNumber: 'DN-2026-0001', invoiceNumber: 'PINV-2026-001', vendorName: 'أمازون ويب سيرفيسز (AWS EMEA)', amount: '1200.00', reason: 'خصم رصيد استهلاك مجاني', status: 'POSTED' },
    ]);
  }

  // 15. Payroll, Variables, Loans
  if (path.includes('/payroll-runs')) {
    if (path.includes('/preview')) {
      return {
        runCode: 'PAY-2026-10-PREV',
        periodName: 'أكتوبر 2026',
        employeeCount: 4,
        totalBasic: '50500.00',
        totalAllowances: '12000.00',
        totalDeductions: '2000.00',
        netPayableBase: '60500.00',
        currencyCode: 'SAR',
      };
    }
    const runs = [
      { id: 'pr-2026-10', runCode: 'PAY-2026-10', periodId: 'fp-2026-10', periodName: 'أكتوبر 2026', employeeCount: 4, totalGross: '62500.00', totalDeductions: '2000.00', netPayableBase: '60500.00', status: 'POSTED', runDate: '2026-10-25' },
      { id: 'pr-2026-09', runCode: 'PAY-2026-09', periodId: 'fp-2026-09', periodName: 'سبتمبر 2026', employeeCount: 4, totalGross: '62500.00', totalDeductions: '2000.00', netPayableBase: '60500.00', status: 'POSTED', runDate: '2026-09-25' },
    ];
    const singleRun = runs.find((r) => path.endsWith(`/${r.id}`));
    if (singleRun) return singleRun;
    return makeList(runs);
  }

  if (path.includes('/monthly-variables')) {
    return makeList([
      { id: 'mv-01', employeeCode: 'EMP-001', employeeName: 'م. أحمد عبد الرحمن الفايد', typeName: 'مكافأة أداء استثنائي', amount: '3500.00', currency: 'SAR', action: 'EARNING', periodName: 'أكتوبر 2026' },
      { id: 'mv-02', employeeCode: 'EMP-002', employeeName: 'م. إسلام حسن عبد العليم', typeName: 'بدل عمل إقليمي وتطوير', amount: '2500.00', currency: 'SAR', action: 'EARNING', periodName: 'أكتوبر 2026' },
    ]);
  }

  if (path.includes('/variable-types')) {
    return makeList([
      { id: 'vt-01', code: 'BONUS', nameAr: 'مكافأة إنجاز مشروع', action: 'EARNING', isTaxable: true, isActive: true },
      { id: 'vt-02', code: 'DEDUCT', nameAr: 'خصم غياب أو تأخير', action: 'DEDUCTION', isTaxable: false, isActive: true },
      { id: 'vt-03', code: 'OVERTIME', nameAr: 'بدل عمل إضافي معتمد', action: 'EARNING', isTaxable: true, isActive: true },
    ]);
  }

  if (path.includes('/loans')) {
    const loans = [
      { id: 'ln-01', employeeCode: 'EMP-001', employeeName: 'م. أحمد عبد الرحمن الفايد', principalAmount: '20000.00', monthlyInstallment: '2000.00', remainingAmount: '12000.00', status: 'ACTIVE', startDate: '2026-01-01', currency: 'SAR' },
      { id: 'ln-02', employeeCode: 'EMP-002', employeeName: 'م. إسلام حسن عبد العليم', principalAmount: '15000.00', monthlyInstallment: '1500.00', remainingAmount: '6000.00', status: 'ACTIVE', startDate: '2026-02-01', currency: 'SAR' },
    ];
    const singleLoan = loans.find((l) => path.endsWith(`/${l.id}`));
    if (singleLoan) return singleLoan;
    return makeList(loans);
  }

  // 16. Fixed Assets & Custodies
  if (path.includes('/asset-categories')) {
    return makeList([
      { id: 'ac-01', code: 'AC-SERVERS', nameAr: 'أجهزة الخوادم والشبكات', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 36, annualDepreciationPct: '33.33', isActive: true },
      { id: 'ac-02', code: 'AC-LAPTOPS', nameAr: 'أجهزة الحواسيب المحمولة للمطورين', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 24, annualDepreciationPct: '50.00', isActive: true },
    ]);
  }

  if (path.includes('/assets')) {
    const assets = [
      { id: 'ast-01', code: 'AST-2026-001', nameAr: 'مجموعة أجهزة MacBook Pro M3 للمطورين', categoryName: 'أجهزة الحواسيب المحمولة للمطورين', purchaseDate: '2026-01-10', purchaseCost: '48000.00', currentBookValue: '36000.00', accumulatedDepreciation: '12000.00', status: 'ACTIVE' },
      { id: 'ast-02', code: 'AST-2026-002', nameAr: 'خوادم اختبار وبنية داخلية Dell PowerEdge', categoryName: 'أجهزة الخوادم والشبكات', purchaseDate: '2026-02-15', purchaseCost: '65000.00', currentBookValue: '51500.00', accumulatedDepreciation: '13500.00', status: 'ACTIVE' },
    ];
    const singleAst = assets.find((a) => path.endsWith(`/${a.id}`));
    if (singleAst) return singleAst;
    return makeList(assets);
  }

  if (path.includes('/depreciation-runs')) {
    if (path.includes('/preview')) {
      return {
        runCode: 'DEP-2026-10-PREV',
        periodName: 'أكتوبر 2026',
        assetCount: 2,
        totalDepreciation: '3250.00',
        currency: 'SAR',
      };
    }
    return makeList([
      { id: 'dr-2026-10', runCode: 'DEP-2026-10', period: '2026-10', totalDepreciation: '3250.00', assetCount: 2, status: 'POSTED', runDate: '2026-10-25' },
    ]);
  }

  if (path.includes('/custodies')) {
    const custodies = [
      {
        id: 'cst-01',
        company_id: DEMO_COMPANY_ID,
        custody_no: 'CST-2026-0001',
        employee_id: 'emp-01',
        employeeCode: 'EMP-001',
        employeeNameAr: 'م. أحمد عبد الرحمن الفايد',
        title_ar: 'عهدة المصروفات التشغيلية لفرع القاهرة - يناير 2026',
        purpose: 'تغطية إيجار مقر التجمع الخامس، فواتير الاتصالات، وضيافة العملاء',
        source_currency: 'SAR',
        requested_amount: '10000.00',
        disbursed_amount: '10000.00',
        disbursed_amount_base: '10000.00',
        disbursed_at: '2026-10-01',
        disbursementEntryNo: 'JE-2026-000002',
        target_currency: 'EGP',
        conversion_rate: '13.00',
        converted_amount_source: '10000.00',
        converted_amount_target: '130000.00',
        converted_at: '2026-10-02',
        total_settled_amount_target: '115000.00',
        remaining_balance_target: '15000.00',
        status: 'PARTIALLY_SETTLED',
        isLowBalance: true,
        balanceRatio: 0.115,
        lowBalanceMessage: 'تنبيه سيولة: الرصيد المتبقي (15000.00 EGP) يمثل 11.5% فقط من إجمالي العهدة (أقل من حد الأمان 20%). يرجى تعزيز العهدة أو إقفالها.',
        created_at: '2026-10-01',
        lines: [
          {
            id: 'line-01',
            line_no: 1,
            expense_date: '2026-10-05',
            receipt_no: 'REC-EG-101',
            expense_account_id: 'acc-rent',
            expenseAccountCode: '6100',
            expenseAccountNameAr: 'إيجار المقرات والفروع',
            projectNameAr: 'تشغيل فرع مصر',
            vendor_name: 'شركة ميفيدا العقارية',
            description: 'إيجار مقر فرع التجمع الخامس',
            currency_code: 'EGP',
            subtotal: '70000.00',
            vat_rate: '14.00',
            vat_amount: '9800.00',
            total_amount: '79800.00',
            journalEntryNo: 'JE-2026-000004',
            status: 'APPROVED',
          },
          {
            id: 'line-02',
            line_no: 2,
            expense_date: '2026-10-10',
            receipt_no: 'REC-EG-102',
            expense_account_id: 'acc-telecom',
            expenseAccountCode: '6300',
            expenseAccountNameAr: 'مصروفات الاتصالات والإنترنت',
            projectNameAr: 'البنية التحتية',
            vendor_name: 'الشركة المصرية للاتصالات WE',
            description: 'فاتورة فايبر الأعمال والخطوط الصوتية',
            currency_code: 'EGP',
            subtotal: '30877.19',
            vat_rate: '14.00',
            vat_amount: '4322.81',
            total_amount: '35200.00',
            journalEntryNo: 'JE-2026-000004',
            status: 'APPROVED',
          },
        ],
        transfers: [
          {
            id: 'trf-01',
            transfer_no: 'TRF-2026-0001',
            transfer_date: '2026-10-02',
            amount_sar: '10000.00',
            exchange_rate: '13.000000',
            amount_target: '130000.00',
            bank_fee_sar: '25.00',
            bank_reference: 'SWIFT-RUH-CAI-001',
            saJournalEntryNo: 'JE-2026-000002',
            egJournalEntryNo: 'JE-2026-000003',
            status: 'RECEIVED',
            notes: 'تحويل عهدة التأسيس والمصاريف التشغيلية من مصرف الراجحي',
          },
        ],
        settlements: [
          {
            id: 'stl-01',
            settlement_no: 'STL-2026-0001',
            settlement_date: '2026-10-25',
            total_amount_egp: '115000.00',
            total_amount_sar_base: '8846.15',
            returned_cash_egp: '0.00',
            realized_fx_gain_loss: '153.85',
            journalEntryNo: 'JE-2026-000004',
            status: 'POSTED',
            notes: 'تسوية دورية معتمدة لمصروفات النصف الأول من شهر أكتوبر',
          },
        ],
      },
    ];
    if (path.includes('/report')) {
      return {
        kpis: {
          totalDisbursedSar: '10000.00',
          totalConvertedToEgp: '130000.00',
          totalSettledEgp: '115000.00',
          totalRemainingBalanceEgp: '15000.00',
        },
        rows: custodies,
      };
    }
    const singleCst = custodies.find((c) => path.endsWith(`/${c.id}`));
    if (singleCst) return singleCst;
    return makeList(custodies);
  }

  // 17. Cost Engine, Profiles & Components
  if (path.includes('/cost-components')) {
    return makeList([
      { id: 'cc-1', code: 'BASIC', nameAr: 'الراتب الأساسي وبدل السكن', kind: 'DIRECT', defaultAmount: '15000.00', isRecoverable: true, isActive: true },
      { id: 'cc-2', code: 'GOSI', nameAr: 'تأمينات اجتماعية (حصة صاحب العمل)', kind: 'BENEFIT', defaultAmount: '2000.00', isRecoverable: true, isActive: true },
      { id: 'cc-3', code: 'MED', nameAr: 'التأمين الطبي السنوي', kind: 'BENEFIT', defaultAmount: '500.00', isRecoverable: true, isActive: true },
      { id: 'cc-4', code: 'OVERHEAD', nameAr: 'نصيب الفرد من المصروفات العامة', kind: 'OVERHEAD', defaultAmount: '1500.00', isRecoverable: true, isActive: true },
    ]);
  }

  if (path.includes('/cost-profiles')) {
    const profiles = [
      { id: 'cp-01', code: 'CP-SR-ENG', nameAr: 'ملف تكلفة مهندسين أول', currency: 'SAR', monthlyWorkingDays: 22, annualWorkingDays: 240, dailyWorkingHours: 8, isActive: true },
      { id: 'cp-02', code: 'CP-EGP-ENG', nameAr: 'ملف تكلفة كوادر إقليمية (EGP)', currency: 'EGP', monthlyWorkingDays: 22, annualWorkingDays: 240, dailyWorkingHours: 8, isActive: true },
      { id: 'cp-03', code: 'CP-ADMIN', nameAr: 'ملف تكلفة كوادر إدارية', currency: 'SAR', monthlyWorkingDays: 22, annualWorkingDays: 240, dailyWorkingHours: 8, isActive: true },
    ];
    const singleCp = profiles.find((p) => path.endsWith(`/${p.id}`));
    if (singleCp) {
      return {
        ...singleCp,
        components: [
          { componentId: 'cc-1', componentCode: 'BASIC', componentNameAr: 'الراتب الأساسي وبدل السكن', amount: '18000.00' },
          { componentId: 'cc-2', componentCode: 'GOSI', componentNameAr: 'تأمينات اجتماعية GOSI', amount: '4000.00' },
          { componentId: 'cc-3', componentCode: 'MED', componentNameAr: 'تأمين طبي سنوي', amount: '500.00' },
        ],
      };
    }
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

  // 18. Overhead Policy & Service Prices
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
      {
        id: 'sp-1',
        employeeId: 'emp-01',
        employeeName: 'م. أحمد عبد الرحمن الفايد',
        positionId: 'pos-1',
        positionCode: 'POS-001',
        roleCode: 'POS-001',
        roleTitleAr: 'كبير مهندسي البرمجيات (Lead Architect)',
        pricingBasis: 'DAILY',
        basis: 'DAILY',
        price: '3863.64',
        dailyPrice: '3863.64',
        hourlyPrice: '482.95',
        currencyCode: 'SAR',
        currency: 'SAR',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isActive: true,
      },
      {
        id: 'sp-2',
        employeeId: 'emp-02',
        employeeName: 'م. إسلام حسن عبد العليم',
        positionId: 'pos-2',
        positionCode: 'POS-002',
        roleCode: 'POS-002',
        roleTitleAr: 'مطور Full Stack (Senior)',
        pricingBasis: 'MONTHLY',
        basis: 'MONTHLY',
        price: '67000.00',
        dailyPrice: '3045.45',
        hourlyPrice: '380.68',
        currencyCode: 'SAR',
        currency: 'SAR',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isActive: true,
      },
      {
        id: 'sp-3',
        employeeId: 'emp-03',
        employeeName: 'سارة محمد المنصور',
        positionId: 'pos-6',
        positionCode: 'POS-006',
        roleCode: 'POS-006',
        roleTitleAr: 'مدير مشاريع تقنية معتمد',
        pricingBasis: 'DAILY',
        basis: 'DAILY',
        price: '3000.00',
        dailyPrice: '3000.00',
        hourlyPrice: '375.00',
        currencyCode: 'SAR',
        currency: 'SAR',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isActive: true,
      },
      {
        id: 'sp-4',
        employeeId: 'emp-04',
        employeeName: 'مريم عبد الله العتيبي',
        positionId: 'pos-5',
        positionCode: 'POS-005',
        roleCode: 'POS-005',
        roleTitleAr: 'مصمم واجهات وتجربة المستخدم',
        pricingBasis: 'DAILY',
        basis: 'DAILY',
        price: '1666.67',
        dailyPrice: '1666.67',
        hourlyPrice: '208.33',
        currencyCode: 'SAR',
        currency: 'SAR',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        isActive: true,
      },
    ]);
  }

  // 19. Revenue Recognition & Runs (استحقاق الإيرادات والتسويات)
  if (path.includes('/revenue-adjustments')) {
    return makeList([
      {
        id: 'adj-01',
        employeeId: 'emp-01',
        employeeName: 'م. أحمد عبد الرحمن الفايد',
        projectId: 'prj-01',
        projectName: 'مشروع التحول الرقمي والفوترة الإلكترونية (ZATCA)',
        clientId: 'cli-01',
        clientName: 'شركة التقنية المتقدمة',
        originalPeriodName: 'سبتمبر 2026',
        periodName: 'أكتوبر 2026',
        pricingBasis: 'DAILY',
        units: '3.00',
        unitPrice: '3863.64',
        grossRevenueBase: '11590.92',
        adjustmentReason: 'تسوية 3 أيام عمل استشارية إضافية لترحيل المرحلة الأولى',
      },
    ]);
  }

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

  // 20. Reports & Financial Intelligence (الذكاء المالي والتقارير)
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
      netOperating: '435000.00',
      investingInflow: '0.00',
      investingOutflow: '45000.00',
      netInvesting: '-45000.00',
      financingInflow: '5000000.00',
      financingOutflow: '0.00',
      netFinancing: '5000000.00',
      netChangeInCash: '5390000.00',
      beginningCash: '660000.00',
      endingCash: '6050000.00',
    };
  }

  if (path.includes('/reports/vat-return') || path.includes('/vat-report')) {
    return {
      period: 'Q3-2026',
      standardRatedSales: '570000.00',
      outputVat: '85500.00',
      standardRatedPurchases: '120000.00',
      inputVat: '18000.00',
      netVatDue: '67500.00',
      status: 'SUBMITTED_AND_PAID',
    };
  }

  // 21. Zakat Declarations & Settings
  if (path.includes('/zakat/returns')) {
    return makeList([
      {
        id: 'zk-return-01',
        returnNo: 'ZKT-2025-001',
        periodFrom: '2025-01-01',
        periodTo: '2025-12-31',
        zakatBase: '762000.00',
        zakatDue: '19636.74',
        incomeTaxDue: '0.00',
        totalDue: '19636.74',
        status: 'POSTED',
      },
    ]);
  }

  if (path.includes('/zakat/settings')) {
    return {
      calculationMethod: 'CAPITAL_BASE',
      foreignOwnershipPct: '0.00',
      hijriYearRatio: '2.577',
    };
  }

  if (path.includes('/zakat/calculate') || path.includes('/zakat')) {
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

  // 22. Users, Roles & Permissions
  if (path.includes('/permissions')) {
    return makeList([
      { id: 'perm-1', code: 'org.companies.read', module: 'org', resource: 'companies', action: 'read', descriptionAr: 'بيانات الشركة — قراءة وعرض بيانات المنشأة' },
      { id: 'perm-2', code: 'org.companies.write', module: 'org', resource: 'companies', action: 'write', descriptionAr: 'بيانات الشركة — تعديل بيانات المنشأة' },
      { id: 'perm-3', code: 'hr.employees.read', module: 'hr', resource: 'employees', action: 'read', descriptionAr: 'سجل الموظفين — قراءة وعرض بيانات الكوادر' },
      { id: 'perm-4', code: 'hr.employees.write', module: 'hr', resource: 'employees', action: 'write', descriptionAr: 'سجل الموظفين — إضافة وتعديل ملفات الكوادر' },
      { id: 'perm-5', code: 'prj.projects.read', module: 'prj', resource: 'projects', action: 'read', descriptionAr: 'سجل المشاريع — متابعة العقود وتكاليف المشاريع' },
      { id: 'perm-6', code: 'prj.projects.write', module: 'prj', resource: 'projects', action: 'write', descriptionAr: 'سجل المشاريع — إنشاء واعتماد المشاريع' },
      { id: 'perm-7', code: 'pay.runs.read', module: 'pay', resource: 'runs', action: 'read', descriptionAr: 'مسير الرواتب — استعراض مسيرات الأجور' },
      { id: 'perm-8', code: 'pay.runs.write', module: 'pay', resource: 'runs', action: 'write', descriptionAr: 'مسير الرواتب — اعتماد وترحيل مسيرات الأجور' },
      { id: 'perm-9', code: 'acc.journals.read', module: 'acc', resource: 'journals', action: 'read', descriptionAr: 'القيود المحاسبية — استعراض دفتر اليومية' },
      { id: 'perm-10', code: 'acc.journals.write', module: 'acc', resource: 'journals', action: 'write', descriptionAr: 'القيود المحاسبية — إنشاء وترحيل القيود' },
      { id: 'perm-11', code: 'sal.zatca.read', module: 'sal', resource: 'zatca', action: 'read', descriptionAr: 'هيئة الزكاة ZATCA — استعراض الفواتير والربط' },
      { id: 'perm-12', code: 'sal.zatca.write', module: 'sal', resource: 'zatca', action: 'write', descriptionAr: 'هيئة الزكاة ZATCA — إرسال واعتماد الفواتير' },
    ]);
  }

  if (path.includes('/roles')) {
    const roles = [
      { id: 'role-1', code: 'ADMIN', nameAr: 'مدير النظام التنفيذي', description: 'كامل الصلاحيات المالية والإدارية والتقنية', userCount: 1, permissionCount: 12, isTemplate: false, isSystem: true, permissions: ['org.companies.read', 'org.companies.write', 'hr.employees.read', 'hr.employees.write', 'prj.projects.read', 'prj.projects.write', 'pay.runs.read', 'pay.runs.write', 'acc.journals.read', 'acc.journals.write', 'sal.zatca.read', 'sal.zatca.write'], rowVersion: 1 },
      { id: 'role-2', code: 'FIN_MANAGER', nameAr: 'مدير مالي ومحاسب قانوني', description: 'إدارة القيود، الحسابات، الضرائب وهيئة الزكاة', userCount: 1, permissionCount: 6, isTemplate: false, isSystem: false, permissions: ['acc.journals.read', 'acc.journals.write', 'sal.zatca.read', 'sal.zatca.write', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-3', code: 'HR_PMO', nameAr: 'مدير المشاريع والموارد البشرية', description: 'إدارة الموظفين وتوزيع الكوادر ونسب الإنجاز', userCount: 1, permissionCount: 4, isTemplate: false, isSystem: false, permissions: ['hr.employees.read', 'hr.employees.write', 'prj.projects.read', 'prj.projects.write'], rowVersion: 1 },
    ];
    const singleRole = roles.find((r) => path.endsWith(`/${r.id}`));
    if (singleRole) return singleRole;
    return makeList(roles);
  }

  if (path.includes('/users')) {
    return makeList([
      {
        id: 'u-1',
        username: 'admin',
        fullName: 'المدير التنفيذي (شركة عزم للتكنولوجيا)',
        email: 'admin@idham.net',
        isSystemAdmin: true,
        status: 'ACTIVE',
        roles: [{ assignmentId: 'ra-1', roleName: 'مدير النظام التنفيذي' }],
        lastLoginAt: '2026-10-27T09:00:00Z',
      },
      {
        id: 'u-2',
        username: 'accountant',
        fullName: 'مريم خالد العتيبي',
        email: 'mariam.otaibi@azmtech.sa',
        isSystemAdmin: false,
        status: 'ACTIVE',
        roles: [{ assignmentId: 'ra-2', roleName: 'مدير مالي ومحاسب قانوني' }],
        lastLoginAt: '2026-10-26T14:30:00Z',
      },
      {
        id: 'u-3',
        username: 'pmo',
        fullName: 'سارة محمد المنصور',
        email: 'sarah.mansoor@azmtech.sa',
        isSystemAdmin: false,
        status: 'ACTIVE',
        roles: [{ assignmentId: 'ra-3', roleName: 'مدير المشاريع والموارد البشرية' }],
        lastLoginAt: '2026-10-26T11:20:00Z',
      },
    ]);
  }

  // 23. Security & Audit Logs
  if (path.includes('/audit-log') || path.includes('/audit/log')) {
    return makeList([
      {
        id: 'aud-1',
        occurredAt: '2026-10-27T10:30:00Z',
        userName: 'admin',
        action: 'INSERT',
        schemaName: 'billing',
        tableName: 'invoices',
        entityId: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
        changedFields: ['invoiceNumber', 'subtotal', 'vatAmount', 'status'],
        reason: 'اعتماد الفاتورة الضريبية INV-2026-0002 وترحيلها',
        ip: '192.168.1.100',
        requestId: 'req-zatca-clearance-01',
        device: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        rowHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        oldValues: null,
        newValues: { invoiceNumber: 'INV-2026-0002', status: 'CLEARED' },
      },
      {
        id: 'aud-2',
        occurredAt: '2026-10-25T11:15:00Z',
        userName: 'admin',
        action: 'POST',
        schemaName: 'payroll',
        tableName: 'payroll_runs',
        entityId: '01a17cb2-9afa-7ef5-91f6-b47561899afc',
        changedFields: ['status', 'journalEntryId'],
        reason: 'ترحيل مسير رواتب شهر أكتوبر 2026 وإنشاء القيد المحاسبي',
        ip: '192.168.1.100',
        requestId: 'req-payroll-post-01',
        device: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        rowHash: 'c2e2e7178f5f67b41624c7a6e76812be218c64d8a14b0b16866f80928a385f02',
        oldValues: { status: 'DRAFT' },
        newValues: { status: 'POSTED' },
      },
      {
        id: 'aud-3',
        occurredAt: '2026-10-20T09:00:00Z',
        userName: 'admin',
        action: 'UPDATE',
        schemaName: 'core',
        tableName: 'companies',
        entityId: '01a17cb2-9afa-7ef5-91f6-b47561899afd',
        changedFields: ['vatNumber'],
        reason: 'تحديث الرقم الضريبي للمنشأة للاعتماد مع ZATCA',
        ip: '192.168.1.100',
        requestId: 'req-company-update-01',
        device: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        rowHash: '9f83c605ced76048e0fe01700f6342710974b3b1579020e801b647792be4c88e',
        oldValues: { vatNumber: null },
        newValues: { vatNumber: '310123456700003' },
      },
    ]);
  }

  if (path.includes('/security-events') || path.includes('/audit/security')) {
    return makeList([
      {
        id: 'sec-1',
        occurredAt: '2026-10-27T08:59:12Z',
        username: 'admin',
        eventType: 'LOGIN_SUCCESS',
        ip: '192.168.1.100',
        details: { userAgent: 'Chrome/129.0 Windows', method: 'PASSWORD' },
      },
      {
        id: 'sec-2',
        occurredAt: '2026-10-26T14:28:44Z',
        username: 'accountant',
        eventType: 'LOGIN_SUCCESS',
        ip: '192.168.1.105',
        details: { userAgent: 'Chrome/129.0 Windows', method: 'PASSWORD' },
      },
      {
        id: 'sec-3',
        occurredAt: '2026-10-25T19:12:01Z',
        username: 'guest_user',
        eventType: 'LOGIN_FAILURE',
        ip: '185.220.101.5',
        details: { reason: 'INVALID_CREDENTIALS', attempts: 1 },
      },
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

  if (path.includes('/zatca/onboard')) {
    return { onboarded: true, csidStatus: 'PRODUCTION', message: 'تم الربط مع هيئة الزكاة والضريبة والجمارك بنجاح' };
  }

  // 24. Default fallback for any unspecified endpoint
  return makeList([]);
}
