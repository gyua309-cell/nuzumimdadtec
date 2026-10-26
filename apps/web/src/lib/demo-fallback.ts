/**
 * Comprehensive Demo Fallback Engine for Cloud Previews
 * (GitHub Pages, Vercel, Netlify) when the backend API is unhosted.
 */

const DEMO_COMPANY_ID = '01a105ec-6a9a-74cd-b663-0ef527c4cfde';

export function getDemoFallback(path: string): any {
  // Auth
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

  if (path.includes('/setup/status')) {
    return { initialized: true };
  }

  // Journal entries
  if (path.includes('/journal-entries') || path.includes('/journals')) {
    const entries = [
      { id: 'je-1', entryNo: 'JV-2026-0001', entryDate: '2026-10-22', descriptionAr: 'إثبات فاتورة مبيعات INV-2026-0002 وربط ضريبة ZATCA', totalDebit: '87400.00', totalCredit: '87400.00', status: 'POSTED' },
      { id: 'je-2', entryNo: 'JV-2026-0002', entryDate: '2026-10-20', descriptionAr: 'إثبات فاتورة مبيعات INV-2026-0001', totalDebit: '87400.00', totalCredit: '87400.00', status: 'POSTED' },
      { id: 'je-3', entryNo: 'JV-2026-0003', entryDate: '2026-10-01', descriptionAr: 'قيد استحقاق رواتب المطورين لشهر سبتمبر 2026', totalDebit: '65000.00', totalCredit: '65000.00', status: 'POSTED' },
    ];
    return { data: entries, meta: { page: 1, pageSize: 50, total: entries.length } };
  }

  // Assignments & Employee Days Report
  if (path.includes('/assignments')) {
    return {
      summary: { totalDays: 44, totalRevenue: 152000, totalCost: 65000, margin: 87000 },
      rows: [
        { id: 'as-1', employeeName: 'م. أحمد عبد الرحمن الفايد', projectName: 'مشروع التحول الرقمي ZATCA', days: 22, billableAmount: 85000, costAmount: 22500, utilizationPct: 100 },
        { id: 'as-2', employeeName: 'م. إسلام حسن عبد العليم', projectName: 'تطوير منصة التجارة والتوزيع', days: 22, billableAmount: 67000, costAmount: 18000, utilizationPct: 100 },
      ],
      data: [
        { id: 'as-1', employeeName: 'م. أحمد عبد الرحمن الفايد', projectName: 'مشروع التحول الرقمي ZATCA', allocatedPct: 100, roleName: 'Lead Architect', billingRate: 350 },
        { id: 'as-2', employeeName: 'م. إسلام حسن عبد العليم', projectName: 'تطوير منصة التجارة والتوزيع', allocatedPct: 100, roleName: 'Full Stack Dev', billingRate: 180 },
      ],
      meta: { page: 1, pageSize: 50, total: 2 },
    };
  }

  // Projects
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
      },
      {
        id: 'prj-02',
        code: 'PRJ-2026-002',
        nameAr: 'تطوير منصة التجارة والتوزيع السحابية',
        nameEn: 'E-Commerce Cloud Platform',
        clientId: 'cli-02',
        clientName: 'مؤسسة الحلول الكبرى',
        status: 'ACTIVE',
        billingType: 'FIXED_PRICE',
        currencyCode: 'SAR',
        totalRevenue: '220000.00',
        totalCost: '110000.00',
        marginPct: '50.00',
        startDate: '2026-02-01',
        endDate: '2026-10-31',
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
      },
    ];
    return { data: projects, meta: { page: 1, pageSize: 50, total: projects.length } };
  }

  // Clients
  if (path.includes('/clients')) {
    const clients = [
      { id: 'cli-01', code: 'CLI-001', nameAr: 'شركة التقنية المتقدمة', nameEn: 'Advanced Tech Co.', vatNumber: '300012345600003', crNumber: '1010999991', phone: '+966501234567', email: 'info@advtech.sa', city: 'الرياض', isActive: true },
      { id: 'cli-02', code: 'CLI-002', nameAr: 'مؤسسة الحلول الرقمية الكبرى', nameEn: 'Mega Digital Solutions', vatNumber: '300098765400003', crNumber: '1010888882', phone: '+966509876543', email: 'contact@megadigital.sa', city: 'جدة', isActive: true },
      { id: 'cli-03', code: 'CLI-003', nameAr: 'مجموعة الأفق للاستشارات', nameEn: 'Horizon Consulting Group', vatNumber: '300055555500003', crNumber: '1010777773', phone: '+966551122334', email: 'sales@horizon.sa', city: 'الرياض', isActive: true },
    ];
    return { data: clients, meta: { page: 1, pageSize: 50, total: clients.length } };
  }

  // Employees (Developers in KSA and Egypt)
  if (path.includes('/employees')) {
    const emps = [
      {
        id: 'emp-01',
        empNo: 'EMP-001',
        nameAr: 'م. أحمد عبد الرحمن الفايد',
        nameEn: 'Ahmed El-Fayad',
        positionTitle: 'كبير مهندسي البرمجيات (Lead Architect)',
        departmentName: 'قطاع التطوير والتكنولوجيا',
        country: 'SA',
        locationType: 'KSA_ON_SITE',
        currency: 'SAR',
        basicSalary: '18000.00',
        totalCost: '22500.00',
        billableRate: '350.00',
        status: 'ACTIVE',
        hireDate: '2024-01-15',
      },
      {
        id: 'emp-02',
        empNo: 'EMP-002',
        nameAr: 'م. إسلام حسن عبد العليم',
        nameEn: 'Islam Hassan',
        positionTitle: 'مطور Full Stack أول (مصر - Remote)',
        departmentName: 'قطاع التطوير والتكنولوجيا',
        country: 'EG',
        locationType: 'REMOTE_EGYPT',
        currency: 'EGP',
        basicSalary: '65000.00',
        totalCost: '72000.00',
        billableRate: '180.00',
        status: 'ACTIVE',
        hireDate: '2024-03-01',
      },
      {
        id: 'emp-03',
        empNo: 'EMP-003',
        nameAr: 'م. سارة خالد العتيبي',
        nameEn: 'Sara Al-Otaibi',
        positionTitle: 'أخصائية أمن سيبراني واختبار جودة QA',
        departmentName: 'قطاع الجودة والأمن',
        country: 'SA',
        locationType: 'KSA_ON_SITE',
        currency: 'SAR',
        basicSalary: '14000.00',
        totalCost: '16800.00',
        billableRate: '280.00',
        status: 'ACTIVE',
        hireDate: '2024-06-01',
      },
      {
        id: 'emp-04',
        empNo: 'EMP-004',
        nameAr: 'م. محمود إبراهيم الشناوي',
        nameEn: 'Mahmoud El-Shenawy',
        positionTitle: 'مطور واجهات أمامية React (مصر - Remote)',
        departmentName: 'قطاع التطوير والتكنولوجيا',
        country: 'EG',
        locationType: 'REMOTE_EGYPT',
        currency: 'EGP',
        basicSalary: '55000.00',
        totalCost: '60000.00',
        billableRate: '160.00',
        status: 'ACTIVE',
        hireDate: '2024-07-15',
      },
    ];
    return { data: emps, meta: { page: 1, pageSize: 50, total: emps.length } };
  }

  // Fiscal Periods
  if (path.includes('/fiscal-periods') || path.includes('/fiscal')) {
    return [
      { id: 'fp-10', year: 2026, periodNo: 10, nameAr: 'أكتوبر 2026', startDate: '2026-10-01', endDate: '2026-10-31', status: 'OPEN', isClosed: false },
      { id: 'fp-09', year: 2026, periodNo: 9, nameAr: 'سبتمبر 2026', startDate: '2026-09-01', endDate: '2026-09-30', status: 'CLOSED', isClosed: true },
      { id: 'fp-08', year: 2026, periodNo: 8, nameAr: 'أغسطس 2026', startDate: '2026-08-01', endDate: '2026-08-31', status: 'CLOSED', isClosed: true },
    ];
  }

  // Accounts (Chart of Accounts)
  if (path.includes('/accounts')) {
    const accs = [
      { id: 'acc-1', code: '1', nameAr: 'الأصول', nameEn: 'Assets', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false },
      { id: 'acc-11', code: '11', nameAr: 'الأصول المتداولة', nameEn: 'Current Assets', accountClass: 'ASSET', normalBalance: 'DEBIT', parentCode: '1', isPosting: false },
      { id: 'acc-1110', code: '1110', nameAr: 'الصندوق والبنوك', nameEn: 'Cash & Banks', accountClass: 'ASSET', normalBalance: 'DEBIT', parentCode: '11', isPosting: true },
      { id: 'acc-1200', code: '1200', nameAr: 'العملاء والمدينون التجاريون', nameEn: 'Accounts Receivable', accountClass: 'ASSET', normalBalance: 'DEBIT', parentCode: '11', isPosting: true },
      { id: 'acc-2', code: '2', nameAr: 'الالتزامات', nameEn: 'Liabilities', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: false },
      { id: 'acc-2100', code: '2100', nameAr: 'الموردون والدائنون', nameEn: 'Accounts Payable', accountClass: 'LIABILITY', normalBalance: 'CREDIT', parentCode: '2', isPosting: true },
      { id: 'acc-2400', code: '2400', nameAr: 'ضريبة القيمة المضافة المحصلة (مخرجات)', nameEn: 'Output VAT (ZATCA)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', parentCode: '2', isPosting: true },
      { id: 'acc-2450', code: '2450', nameAr: 'الزكاة وضريبة الدخل المستحقة', nameEn: 'Zakat & Tax Payable', accountClass: 'LIABILITY', normalBalance: 'CREDIT', parentCode: '2', isPosting: true },
      { id: 'acc-3', code: '3', nameAr: 'حقوق الملكية', nameEn: 'Equity', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: false },
      { id: 'acc-3100', code: '3100', nameAr: 'رأس المال المدفوع', nameEn: 'Paid-in Capital', accountClass: 'EQUITY', normalBalance: 'CREDIT', parentCode: '3', isPosting: true },
      { id: 'acc-4', code: '4', nameAr: 'الإيرادات', nameEn: 'Revenue', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: false },
      { id: 'acc-4110', code: '4110', nameAr: 'إيرادات خدمات برمجية واستشارية', nameEn: 'Software & Dev Services Revenue', accountClass: 'REVENUE', normalBalance: 'CREDIT', parentCode: '4', isPosting: true },
      { id: 'acc-5', code: '5', nameAr: 'مصروفات التشغيل وتكلفة الكوادر', nameEn: 'Operating & Staff Expenses', accountClass: 'EXPENSE', normalBalance: 'DEBIT', isPosting: false },
      { id: 'acc-5100', code: '5100', nameAr: 'رواتب وأجور المطورين والكوادر', nameEn: 'Developers Salaries & Wages', accountClass: 'EXPENSE', normalBalance: 'DEBIT', parentCode: '5', isPosting: true },
      { id: 'acc-6100', code: '6100', nameAr: 'مصروف الزكاة الشرعية وضريبة الدخل', nameEn: 'Zakat & Income Tax Expense', accountClass: 'EXPENSE', normalBalance: 'DEBIT', parentCode: '5', isPosting: true },
    ];
    return { data: accs, meta: { page: 1, pageSize: 1000, total: accs.length } };
  }

  // Trial Balance
  if (path.includes('/ledger/trial') || path.includes('/trial-balance')) {
    return [
      { accountCode: '1110', accountNameAr: 'الصندوق والبنوك', debit: '450000.00', credit: '0.00', netBalance: '450000.00' },
      { accountCode: '1200', accountNameAr: 'العملاء والمدينون', debit: '174800.00', credit: '0.00', netBalance: '174800.00' },
      { accountCode: '2100', accountNameAr: 'الموردون والدائنون', debit: '0.00', credit: '85000.00', netBalance: '-85000.00' },
      { accountCode: '2400', accountNameAr: 'ضريبة القيمة المضافة (ZATCA)', debit: '0.00', credit: '22800.00', netBalance: '-22800.00' },
      { accountCode: '3100', accountNameAr: 'رأس المال', debit: '0.00', credit: '400000.00', netBalance: '-400000.00' },
      { accountCode: '4110', accountNameAr: 'إيرادات تطوير البرمجيات', debit: '0.00', credit: '152000.00', netBalance: '-152000.00' },
      { accountCode: '5100', accountNameAr: 'رواتب وتكلفة المطورين', debit: '35000.00', credit: '0.00', netBalance: '35000.00' },
    ];
  }

  // Income Statement
  if (path.includes('/ledger/income') || path.includes('/income-statement')) {
    return {
      revenue: 152000,
      cogs: 35000,
      grossProfit: 117000,
      expenses: 15000,
      netOperatingProfit: 102000,
      zakatProvision: 2550,
      netProfit: 99450,
      details: {
        revenue: [{ code: '4110', nameAr: 'إيرادات تطوير البرمجيات والخدمات التقنية', amount: '152000.00' }],
        cogs: [{ code: '5100', nameAr: 'رواتب وبدلات المبرمجين المباشرة', amount: '35000.00' }],
        expenses: [{ code: '5200', nameAr: 'مصروفات استضافة وحوسبة سحابية', amount: '15000.00' }],
      },
    };
  }

  // Balance Sheet
  if (path.includes('/ledger/balan') || path.includes('/balance-sheet')) {
    return {
      assets: { total: 624800, current: [{ code: '1110', nameAr: 'النقدية بالبنوك', amount: '450000.00' }, { code: '1200', nameAr: 'مدينو الفواتير (العملاء)', amount: '174800.00' }] },
      liabilities: { total: 107800, current: [{ code: '2100', nameAr: 'مستحقات الموردين', amount: '85000.00' }, { code: '2400', nameAr: 'مستحقات ضريبة القيمة المضافة', amount: '22800.00' }] },
      equity: { total: 517000, items: [{ code: '3100', nameAr: 'رأس المال', amount: '400000.00' }, { code: '3300', nameAr: 'الأرباح المبقاة والفترة', amount: '117000.00' }] },
    };
  }

  // Cost components & profiles
  if (path.includes('/cost-compone') || path.includes('/cost-profiles') || path.includes('/cost')) {
    return {
      data: [
        { id: 'cc-1', code: 'BASIC', nameAr: 'الراتب الأساسي', category: 'SALARY', isFixed: true, defaultAmount: '12000.00' },
        { id: 'cc-2', code: 'HOUSING', nameAr: 'بدل السكن (25%)', category: 'ALLOWANCE', isFixed: true, defaultAmount: '3000.00' },
        { id: 'cc-3', code: 'TRANS', nameAr: 'بدل الانتقال', category: 'ALLOWANCE', isFixed: true, defaultAmount: '1000.00' },
        { id: 'cc-4', code: 'GOSI_CO', nameAr: 'تأمينات اجتماعية - حصة الشركة (GOSI)', category: 'STATUTORY', isFixed: true, defaultAmount: '1755.00' },
        { id: 'cc-5', code: 'MEDICAL', nameAr: 'تأمين طبي فئة VIP', category: 'BENEFIT', isFixed: true, defaultAmount: '500.00' },
      ],
      meta: { page: 1, pageSize: 50, total: 5 },
    };
  }

  // Organization (Branches, Departments, Cost Centers, Currencies)
  if (path.includes('/branches')) {
    return [{ id: 'br-1', code: 'BR-RUH', nameAr: 'فرع الرياض الرئيسي', city: 'الرياض', isHeadOffice: true }];
  }
  if (path.includes('/departments')) {
    return [
      { id: 'dp-1', code: 'TECH', nameAr: 'قطاع التطوير والتكنولوجيا البرمجية' },
      { id: 'dp-2', code: 'QA', nameAr: 'إدارة الجودة والأمن السيبراني' },
      { id: 'dp-3', code: 'FIN', nameAr: 'الإدارة المالية والمحاسبية' },
    ];
  }
  if (path.includes('/cost-centers')) {
    return [
      { id: 'cc-01', code: 'CC-DEV-KSA', nameAr: 'مركز تكلفة مطوري المملكة العربية السعودية' },
      { id: 'cc-02', code: 'CC-DEV-EGY', nameAr: 'مركز تكلفة فريق التطوير عن بعد (مصر)' },
    ];
  }
  if (path.includes('/currencies')) {
    return [
      { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', isBase: true, exchangeRate: '1.0000' },
      { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', isBase: false, exchangeRate: '0.0780' },
      { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', isBase: false, exchangeRate: '3.7500' },
    ];
  }
  if (path.includes('/taxes')) {
    return [{ id: 'tx-1', code: 'VAT15', nameAr: 'ضريبة القيمة المضافة 15%', rate: '15.00', isDefault: true }];
  }
  if (path.includes('/positions')) {
    return [
      { id: 'pos-1', titleAr: 'كبير مهندسي البرمجيات (Lead Architect)' },
      { id: 'pos-2', titleAr: 'مطور Full Stack (Senior)' },
      { id: 'pos-3', titleAr: 'مطور واجهات React (Frontend)' },
      { id: 'pos-4', titleAr: 'مهندس جودة واختبارات QA' },
    ];
  }

  // ZATCA Hub & Invoices
  if (path.includes('/zatca/status')) {
    return {
      environment: 'SIMULATION',
      csidStatus: 'PRODUCTION',
      csidExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      readyToTransmit: true,
      transmissionAvailable: true,
      transmissionNoteAr: 'منظومة ZATCA مفعّلة وجاهزة بالكامل (المرحلة 2). يتم اعتماد الفواتير وتوليد ملفات XML UBL 2.1 والأختام الرقمية وتشفير رموز QR فورياً.',
      checklist: [
        { key: 'vat', labelAr: 'الرقم الضريبي للمنشأة (15 رقماً)', ok: true, hintAr: '310123456700003' },
        { key: 'cr', labelAr: 'رقم السجل التجاري', ok: true, hintAr: '1010123456' },
        { key: 'egs', labelAr: 'تعريف وحدة الفوترة الإلكترونية (EGS)', ok: true, hintAr: 'EGS-AZM-01' },
        { key: 'csid', labelAr: 'شهادة CSID من هيئة الزكاة والضريبة والجمارك', ok: true, hintAr: 'معتمدة' },
        { key: 'prod', labelAr: 'شهادة الإنتاج المعتمدة (Production CSID)', ok: true, hintAr: 'صالحة لسنة' },
        { key: 'clientVat', labelAr: 'الرقم الضريبي لعملاء الفواتير الضريبية (B2B)', ok: true, hintAr: 'مطابق' },
        { key: 'ublEngine', labelAr: 'محرك توليد مستندات UBL 2.1 XML والتجزئة SHA-256', ok: true, hintAr: 'مدمج ومطابق' },
      ],
      submittedCount: 2,
      pendingCount: 0,
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
    return [
      {
        id: 'sub-01',
        invoiceNo: 'INV-2026-0002',
        attemptNo: 1,
        environment: 'SIMULATION',
        mode: 'CLEARANCE',
        status: 'CLEARED',
        requestHash: '95f57f9b242e1c98492048590382901a',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sub-02',
        invoiceNo: 'INV-2026-0001',
        attemptNo: 1,
        environment: 'SIMULATION',
        mode: 'CLEARANCE',
        status: 'CLEARED',
        requestHash: '34393532393931386439343930356439',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  if (path.includes('/zatca/invoices') || path.includes('/sal/invoices')) {
    const invs = [
      {
        id: 'inv-01',
        invoiceNo: 'INV-2026-0002',
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-22',
        clientName: 'شركة التقنية المتقدمة',
        clientVat: '300012345600003',
        currencyCode: 'SAR',
        totalAmount: '87400.00',
        vatAmount: '11400.00',
        zatcaStatus: 'CLEARED',
        complianceStatus: 'PASS',
        hasQr: true,
        hash: '95f57f9b242e1c98492048590382901a',
        submittedAt: new Date().toISOString(),
      },
      {
        id: 'inv-02',
        invoiceNo: 'INV-2026-0001',
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-20',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        clientVat: '300098765400003',
        currencyCode: 'SAR',
        totalAmount: '87400.00',
        vatAmount: '11400.00',
        zatcaStatus: 'CLEARED',
        complianceStatus: 'PASS',
        hasQr: true,
        hash: '34393532393931386439343930356439',
        submittedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
    if (path.includes('/sal/invoices')) {
      return { data: invs, meta: { page: 1, pageSize: 50, total: invs.length } };
    }
    return invs;
  }

  // Default empty list or object
  return { data: [], meta: { page: 1, pageSize: 50, total: 0 } };
}
