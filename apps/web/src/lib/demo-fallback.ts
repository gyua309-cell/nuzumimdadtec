import { getStoredCompany, saveStoredCompany } from './storage-company';
import { getEntityList, saveEntityItem, deleteEntityItem } from './local-store';

/**
 * Comprehensive Demo Fallback Engine for Cloud Previews
 * (GitHub Pages, Vercel, Netlify) when the backend API is unhosted.
 * 
 * Provides clean production-ready Saudi & Egyptian ERP data for all 161+ system endpoints.
 */

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
    if (path.includes('/companies/current')) {
      return saveStoredCompany(body);
    }

    const entityMap: Record<string, string> = {
      '/employees': 'employees',
      '/projects': 'projects',
      '/clients': 'clients',
      '/vendors': 'vendors',
      '/journal-entries': 'journal_entries',
      '/journals': 'journal_entries',
      '/invoices': 'invoices',
      '/sal/invoices': 'invoices',
      '/purchase-invoices': 'purchase_invoices',
      '/pur/invoices': 'purchase_invoices',
      '/custodies': 'custodies',
      '/services/catalog': 'services_catalog',
      '/services': 'services_catalog',
      '/assets': 'assets',
      '/loans': 'loans',
      '/monthly-variables': 'monthly_variables',
    };

    let targetKey: string | null = null;
    for (const [route, key] of Object.entries(entityMap)) {
      if (path.includes(route)) {
        targetKey = key;
        break;
      }
    }

    if (targetKey) {
      if (method === 'DELETE') {
        const id = path.split('/').filter(Boolean).pop();
        if (id) deleteEntityItem(targetKey, id);
        return { success: true };
      }
      if (typeof body === 'object' && body !== null) {
        return saveEntityItem(targetKey, body);
      }
    }

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
    const comp = getStoredCompany();
    return {
      user: {
        id: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
        username: 'admin',
        email: 'admin@idham.net',
        fullName: `المدير التنفيذي (${comp.nameAr})`,
        isSystemAdmin: true,
        preferredLocale: 'ar',
        mustChangePassword: false,
      },
      companies: [
        {
          id: comp.id,
          code: comp.code,
          nameAr: comp.nameAr,
          nameEn: comp.nameEn,
          baseCurrency: comp.baseCurrency || 'SAR',
        },
      ],
    };
  }

  if (path.includes('/setup/status') || path.includes('/setup/initialize')) {
    return { initialized: true };
  }

  if (path.includes('/companies/current')) {
    return getStoredCompany();
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

  // 3. Profitability Modules (Production Zero Baseline)
  if (path.includes('/profitability/projects')) {
    return makeList(getEntityList('projects_profitability', []));
  }

  if (path.includes('/profitability/clients')) {
    return makeList(getEntityList('clients_profitability', []));
  }

  if (path.includes('/profitability/employees') || path.includes('/reports/employee-profitability')) {
    return {
      summary: {
        employeeCount: 0,
        totalRevenueBase: '0.00',
        totalCostBase: '0.00',
        totalUnutilizedCostBase: '0.00',
        totalProfitBase: '0.00',
        averageMarginPct: '0.00',
      },
      employees: [],
      data: [],
    };
  }

  // 4. Assignments Reports (Production Zero Baseline)
  if (path.includes('/assignments/employee-days-report')) {
    const stored = getEntityList('assignments_employee_days', []);
    return {
      summary: {
        employeeCount: stored.length,
        totalRevenue: 0,
        totalCost: 0,
        totalGrossProfit: 0,
        averageMarginPct: 0,
        totalAllocatedDays: 0,
        workingDaysInPeriod: 22,
        utilizationRate: 0,
        pendingInvoiceCount: 0,
        pendingInvoiceAmount: 0,
      },
      rows: stored,
      meta: { total: stored.length },
    };
  }

  if (path.includes('/assignments/utilization')) {
    return makeList(getEntityList('assignments_utilization', []));
  }

  // 5. Employees & Placement (Production Zero Baseline)
  if (path.includes('/employees')) {
    const emps = getEntityList<any>('employees', []);
    if (path.includes('/cost')) {
      return {
        employedDays: 0,
        periodDays: 22,
        totalCostBase: '0.00',
        distributableCostBase: '0.00',
        totalDeductionsBase: '0.00',
        dailyDirectCost: '0.00',
        dailyOverheadCost: '0.00',
        dailyTotalCost: '0.00',
        currency: 'SAR',
        breakdown: [],
        lines: [],
      };
    }

    if (path.includes('/documents')) {
      return makeList(getEntityList<any>('employee_documents', []));
    }

    const singleEmp: any = emps.find((e: any) => path.endsWith(`/${e.id}`) || path.endsWith(`/${e.code}`));
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
          basicSalary: singleEmp.basicSalary || '0.00',
          salaryCurrency: singleEmp.currency || 'SAR',
          insuranceSalary: '0.00',
          insuranceCurrency: singleEmp.currency || 'SAR',
        },
      };
    }
    return makeList(emps);
  }

  // 6. Projects (المشاريع والعقود)
  if (path.includes('/projects')) {
    const projects = getEntityList('projects', []);
    const singleProj = projects.find((p: any) => path.endsWith(`/${p.id}`) || path.endsWith(`/${p.code}`));
    if (singleProj) return singleProj;
    return makeList(projects);
  }

  // 7. Clients (العملاء)
  if (path.includes('/clients')) {
    const clients = getEntityList('clients', []);
    const singleCli = clients.find((c: any) => path.endsWith(`/${c.id}`) || path.endsWith(`/${c.code}`));
    if (singleCli) return singleCli;
    return makeList(clients);
  }

  // 8. Assignments & Workload (توزيع المطورين على المشاريع)
  if (path.includes('/assignments')) {
    const rows = getEntityList('assignments', []);
    return {
      summary: { totalDays: 0, totalRevenue: 0, totalCost: 0, margin: 0 },
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
      { id: 'dept-01', code: 'TECH', nameAr: 'تطوير البرمجيات والأنظمة', nameEn: 'Software Engineering', managerName: 'مدير تطوير البرمجيات', isActive: true },
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
      { id: 'acc-101', code: '10101', nameAr: 'الصندوق والعهد النقدية', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-102', code: '10201', nameAr: 'مصرف الراجحي - الحساب الجاري التجاري', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-103', code: '10202', nameAr: 'البنك الأهلي السعودي (SNB) - حساب الرواتب', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-104', code: '10301', nameAr: 'العملاء وحسابات القبض التجارية (A/R)', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-105', code: '10401', nameAr: 'العهد المؤقتة للموظفين', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-201', code: '20101', nameAr: 'الموردون وحسابات الدفع (A/P)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-202', code: '20201', nameAr: 'ضريبة القيمة المضافة المستحقة (ZATCA VAT)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-203', code: '20301', nameAr: 'مستحقات التأمينات الاجتماعية (GOSI)', accountClass: 'LIABILITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-301', code: '30101', nameAr: 'رأس المال المدفوع', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-302', code: '30201', nameAr: 'الأرباح المبقاة', accountClass: 'EQUITY', normalBalance: 'CREDIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-401', code: '40101', nameAr: 'إيرادات عقود وتطوير البرمجيات والمشاريع', accountClass: 'REVENUE', normalBalance: 'CREDIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-501', code: '50101', nameAr: 'تكلفة المطورين والرواتب المباشرة للمشاريع', accountClass: 'EXPENSE', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
      { id: 'acc-502', code: '50201', nameAr: 'تكاليف السحابة والبنية التحتية (AWS/GCP)', accountClass: 'EXPENSE', normalBalance: 'DEBIT', isPosting: true, currentBalance: '0.00', currency: 'SAR', isActive: true },
    ]);
  }

  if (path.includes('/bank-accounts') || path.includes('/banks')) {
    return makeList([
      { id: 'ba-01', code: 'BA-RAJHI', name: 'مصرف الراجحي - الحساب الجاري التجاري', bankName: 'مصرف الراجحي', bankNameAr: 'مصرف الراجحي', bankNameEn: 'Al Rajhi Bank', kind: 'BANK', accountNumber: '20401827491001', iban: 'SA038000020401827491001', currency: 'SAR', currencyCode: 'SAR', currentBalance: '0.00', balance: 385000, glAccountId: 'acc-102', isActive: true },
      { id: 'ba-02', code: 'BA-SNB', name: 'البنك الأهلي السعودي (SNB) - حساب العمليات', bankName: 'البنك الأهلي السعودي (SNB)', bankNameAr: 'البنك الأهلي السعودي (SNB)', bankNameEn: 'Saudi National Bank', kind: 'BANK', accountNumber: '10029384756002', iban: 'SA4410000010029384756002', currency: 'SAR', currencyCode: 'SAR', currentBalance: '0.00', balance: 120000, glAccountId: 'acc-103', isActive: true },
      { id: 'ba-03', code: 'BA-CIB', name: 'البنك التجاري الدولي (CIB مصر) - فرع القاهرة', bankName: 'البنك التجاري الدولي CIB', bankNameAr: 'البنك التجاري الدولي (CIB مصر)', bankNameEn: 'Commercial International Bank', kind: 'BANK', accountNumber: '100029384711', iban: 'EG3800100000000100029384711', currency: 'EGP', currencyCode: 'EGP', currentBalance: '0.00', balance: 1420500, glAccountId: 'acc-101', isActive: true },
      { id: 'ba-04', code: 'CASH-EGY', name: 'صندوق العهدة النقدية - فرع القاهرة', bankName: 'الخزينة النقدية الرئيسية', bankNameAr: 'الخزينة النقدية الرئيسية', bankNameEn: 'Main Petty Cash', kind: 'CASH', accountNumber: 'CASH-EGY-01', iban: null, currency: 'EGP', currencyCode: 'EGP', currentBalance: '0.00', balance: 812250, glAccountId: 'acc-104', isActive: true },
    ]);
  }

  if (path.includes('/journal-entries') || path.includes('/journals')) {
    return makeList(getEntityList('journal_entries', []));
  }

  // 11. Financial Reports & Statements (Zero Baseline for Production Readiness)
  if (path.includes('/ledger/trial')) {
    return {
      period: 'أكتوبر 2026',
      totalDebit: '0.00',
      totalCredit: '0.00',
      balanced: true,
      isBalanced: true,
      rows: [],
      lines: [],
      totals: {
        openingDebit: '0.00',
        openingCredit: '0.00',
        periodDebit: '0.00',
        periodCredit: '0.00',
        closingDebit: '0.00',
        closingCredit: '0.00',
      },
    };
  }

  if (path.includes('/ledger/income')) {
    return {
      revenue: '0.00',
      directCost: '0.00',
      grossProfit: '0.00',
      operatingExpenses: '0.00',
      operatingProfit: '0.00',
      otherIncome: '0.00',
      otherExpenses: '0.00',
      netProfit: '0.00',
      marginPct: '0.00',
      lines: [],
    };
  }

  if (path.includes('/ledger/balance')) {
    return {
      asOfDate: '2026-10-31',
      balanced: true,
      isBalanced: true,
      difference: '0.00',
      currentEarnings: '0.00',
      liabilitiesAndEquity: '0.00',
      assets: {
        total: '0.00',
        current: '0.00',
        nonCurrent: '0.00',
        lines: [],
      },
      liabilities: {
        total: '0.00',
        lines: [],
      },
      equity: {
        total: '0.00',
        lines: [],
      },
    };
  }

  if (path.includes('/ledger/account-statement')) {
    return {
      account: { code: '10201', nameAr: 'مصرف الراجحي - الحساب الجاري التجاري', currency: 'SAR', normalBalance: 'DEBIT' },
      openingBalance: '0.00',
      closingBalance: '0.00',
      periodDebit: '0.00',
      periodCredit: '0.00',
      totalDebit: '0.00',
      totalCredit: '0.00',
      lines: [],
      data: [],
      meta: { page: 1, pageSize: 50, total: 0 },
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
    const invs = getEntityList('invoices', []);
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
    const singleInv = invs.find((i: any) => path.endsWith(`/${i.id}`) || path.endsWith(`/${i.invoiceNumber}`));
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
    const comp = getStoredCompany();
    return {
      sellerName: comp.nameAr,
      vatNumber: comp.taxNumber || '310123456700003',
      timestamp: '2026-10-22T14:30:00Z',
      totalAmount: '87400.00',
      vatAmount: '11400.00',
      hashValid: true,
      signatureValid: true,
      tags: {
        sellerName: comp.nameAr,
        vatNumber: comp.taxNumber || '310123456700003',
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
    const pinvs = getEntityList('purchase_invoices', []);
    const singlePinv = pinvs.find((p: any) => path.endsWith(`/${p.id}`));
    if (singlePinv) return singlePinv;
    return makeList(pinvs);
  }

  if (path.includes('/vendors')) {
    return makeList(getEntityList('vendors', []));
  }

  if (path.includes('/debit-notes')) {
    return makeList(getEntityList('debit_notes', []));
  }

  if (path.includes('/services/catalog') || path.includes('/services')) {
    const defaultServices = [
      { id: 'srv-001', code: 'SRV-DEV-01', serviceCode: 'SRV-DEV-01', nameAr: 'تأجير مهندس برمجيات متقدم (Senior Full-Stack Engineer)', category: 'SOFTWARE_DEVELOPMENT', billingBasis: 'MONTHLY', defaultUnitPrice: '28000.00', currencyCode: 'SAR', vatRate: '15.00', isActive: true },
      { id: 'srv-002', code: 'SRV-CLD-02', serviceCode: 'SRV-CLD-02', nameAr: 'تأجير مهندس سحابة وبنية تحتية (DevOps & SRE Specialist)', category: 'CLOUD_DEVOPS', billingBasis: 'MONTHLY', defaultUnitPrice: '32000.00', currencyCode: 'SAR', vatRate: '15.00', isActive: true },
      { id: 'srv-003', code: 'SRV-QA-03', serviceCode: 'SRV-QA-03', nameAr: 'تأجير مهندس جودة واختبارات برمجية (QA Automation Engineer)', category: 'QA_TESTING', billingBasis: 'MONTHLY', defaultUnitPrice: '20000.00', currencyCode: 'SAR', vatRate: '15.00', isActive: true },
      { id: 'srv-004', code: 'SRV-ACC-04', serviceCode: 'SRV-ACC-04', nameAr: 'تأجير محاسب مالي أول (Senior Financial Accountant)', category: 'ACCOUNTING_FINANCE', billingBasis: 'MONTHLY', defaultUnitPrice: '18000.00', currencyCode: 'SAR', vatRate: '15.00', isActive: true },
      { id: 'srv-005', code: 'SRV-PMO-05', serviceCode: 'SRV-PMO-05', nameAr: 'تأجير مدير مشاريع تقنية (Agile PM / Scrum Master)', category: 'PROJECT_MANAGEMENT', billingBasis: 'MONTHLY', defaultUnitPrice: '30000.00', currencyCode: 'SAR', vatRate: '15.00', isActive: true },
      { id: 'srv-006', code: 'SRV-SEC-06', serviceCode: 'SRV-SEC-06', nameAr: 'استشارات أمن سيبراني واختبار اختراق (Cybersecurity Audit)', category: 'TECHNICAL_CONSULTING', billingBasis: 'DAILY', defaultUnitPrice: '4500.00', currencyCode: 'SAR', vatRate: '15.00', isActive: true },
    ];
    return makeList(getEntityList('services_catalog', defaultServices));
  }

  // 15. Payroll, Variables, Loans (Production Zero Baseline)
  if (path.includes('/payroll-runs')) {
    if (path.includes('/preview')) {
      return {
        runCode: 'PAY-2026-10-PREV',
        periodName: 'أكتوبر 2026',
        employeeCount: 0,
        totalBasic: '0.00',
        totalAllowances: '0.00',
        totalDeductions: '0.00',
        netPayableBase: '0.00',
        currencyCode: 'SAR',
        payoutCurrency: 'SAR',
        lines: [],
      };
    }
    const runs = getEntityList('payroll_runs', []);
    const singleRun = runs.find((r: any) => path.endsWith(`/${r.id}`));
    if (singleRun) return { lines: [], ...(singleRun as Record<string, any>) };
    return makeList(runs);
  }

  if (path.includes('/monthly-variables')) {
    return makeList(getEntityList('monthly_variables', []));
  }

  if (path.includes('/variable-types')) {
    return makeList([
      { id: 'vt-01', code: 'BONUS', nameAr: 'مكافأة إنجاز مشروع', action: 'EARNING', isTaxable: true, isActive: true },
      { id: 'vt-02', code: 'DEDUCT', nameAr: 'خصم غياب أو تأخير', action: 'DEDUCTION', isTaxable: false, isActive: true },
      { id: 'vt-03', code: 'OVERTIME', nameAr: 'بدل عمل إضافي معتمد', action: 'EARNING', isTaxable: true, isActive: true },
    ]);
  }

  if (path.includes('/loans')) {
    const loans = getEntityList('loans', []);
    const singleLoan = loans.find((l: any) => path.endsWith(`/${l.id}`));
    if (singleLoan) return singleLoan;
    return makeList(loans);
  }

  // 16. Fixed Assets & Custodies (Production Zero Baseline)
  if (path.includes('/asset-categories')) {
    return makeList([
      { id: 'ac-01', code: 'AC-SERVERS', nameAr: 'أجهزة الخوادم والشبكات', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 36, annualDepreciationPct: '33.33', isActive: true },
      { id: 'ac-02', code: 'AC-LAPTOPS', nameAr: 'أجهزة الحواسيب المحمولة للمطورين', depreciationMethod: 'STRAIGHT_LINE', usefulLifeMonths: 24, annualDepreciationPct: '50.00', isActive: true },
    ]);
  }

  if (path.includes('/assets')) {
    const assets = getEntityList('assets', []);
    const singleAst = assets.find((a: any) => path.endsWith(`/${a.id}`));
    if (singleAst) return singleAst;
    return makeList(assets);
  }

  if (path.includes('/depreciation-runs')) {
    if (path.includes('/preview')) {
      return {
        runCode: 'DEP-2026-10-PREV',
        periodName: 'أكتوبر 2026',
        assetCount: 0,
        totalDepreciation: '0.00',
        currency: 'SAR',
      };
    }
    return makeList(getEntityList('depreciation_runs', []));
  }

  if (path.includes('/custodies/report') || (path.includes('/custodies') && path.includes('/report'))) {
    const custodies = getEntityList('custodies', []);
    return {
      kpis: {
        totalCustodiesCount: custodies.length,
        totalDisbursedSar: '0.00',
        totalConvertedToEgp: '0.00',
        totalSettledEgp: '0.00',
        totalRemainingBalanceEgp: '0.00',
      },
      expenseBreakdown: [],
      custodians: [],
      rows: custodies,
    };
  }

  if (path.includes('/custodies')) {
    const custodies = getEntityList('custodies', []);
    const singleCst = custodies.find((c: any) => path.endsWith(`/${c.id}`));
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
          fullNameAr: 'مهندس برمجيات أول',
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
        employeeName: 'مهندس برمجيات أول',
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
        employeeName: 'مهندس برمجيات أول',
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
          { employeeName: 'مهندس برمجيات أول', projectName: 'مشروع التحول الرقمي ZATCA', pricingBasis: 'DAYS', units: 22, allocationPct: 100, grossRevenueBase: '85000.00' },
          { employeeName: 'م. إسلام حسن عبد العليم', projectName: 'تطوير منصة التجارة والتوزيع', pricingBasis: 'DAYS', units: 22, allocationPct: 100, grossRevenueBase: '67000.00' },
        ],
      };
    }
    return makeList([
      { id: 'rr-2026-10', runCode: 'REV-2026-10', period: '2026-10', recognizedRevenue: '302000.00', totalDirectCost: '125000.00', grossProfit: '177000.00', status: 'POSTED', runDate: '2026-10-25' },
    ]);
  }

  // 20. Reports & Financial Intelligence (Clean Production Baseline)
  if (path.includes('/reports/executive-intelligence')) {
    return {
      kpis: {
        ytdRevenue: '0.00',
        ytdNetProfit: '0.00',
        netMarginPct: '0.00',
        utilizationRate: '0.00',
        activeProjects: 0,
        totalDevelopers: 0,
      },
      topClients: [],
    };
  }

  if (path.includes('/reports/cash-flow')) {
    return {
      operatingInflow: '0.00',
      operatingOutflow: '0.00',
      netOperating: '0.00',
      investingInflow: '0.00',
      investingOutflow: '0.00',
      netInvesting: '0.00',
      financingInflow: '0.00',
      financingOutflow: '0.00',
      netFinancing: '0.00',
      netChangeInCash: '0.00',
      beginningCash: '0.00',
      endingCash: '0.00',
    };
  }

  if (path.includes('/reports/vat-return') || path.includes('/vat-report')) {
    return {
      period: 'Q3-2026',
      standardRatedSales: '0.00',
      outputVat: '0.00',
      standardRatedPurchases: '0.00',
      inputVat: '0.00',
      netVatDue: '0.00',
      status: 'OPEN',
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
      saudiGulfPct: '100.00',
      foreignPct: '0.00',
      zakatRatePct: '2.50',
      incomeTaxRatePct: '20.00',
      hijriYearDays: 354,
      zakatTin: '300000000000003',
      calculationMethod: 'CAPITAL_BASE',
      foreignOwnershipPct: '0.00',
      hijriYearRatio: '2.577',
    };
  }

  if (path.includes('/zakat/calculate') || path.includes('/zakat')) {
    const year = new Date().getFullYear();
    return {
      periodFrom: `${year}-01-01`,
      periodTo: `${year}-12-31`,
      days: 365,
      saudiGulfPct: '100.00',
      foreignPct: '0.00',
      effectiveZakatRatePct: '2.577',
      adjustedNetProfit: '0.00',
      baseBeforeDeductions: '0.00',
      totalDeductions: '0.00',
      zakatBaseRaw: '0.00',
      zakatBase: '0.00',
      baseFlooredToProfit: false,
      zakatableBase: '0.00',
      zakatDue: '0.00',
      incomeTaxableProfit: '0.00',
      incomeTaxDue: '0.00',
      totalDue: '0.00',
      ratePct: '2.577',
      calculatedZakat: '0.00',
      year,
      status: 'CALCULATED',
      lines: [
        { key: 'openingEquity', labelAr: 'حقوق الملكية في بداية الفترة (رأس المال والأرباح المبقاة)', amount: '0.00', kind: 'ledger' },
        { key: 'netProfitBeforeZakat', labelAr: 'صافي الربح للفترة قبل الزكاة (من دفتر الأستاذ)', amount: '0.00', kind: 'ledger' },
        { key: 'provisionsAddBack', labelAr: 'يضاف: المخصصات المكوّنة خلال الفترة', amount: '0.00', kind: 'manual' },
        { key: 'nonDeductibleExpenses', labelAr: 'يضاف: مصروفات غير قابلة للحسم', amount: '0.00', kind: 'manual' },
        { key: 'otherDeductionsFromProfit', labelAr: 'يخصم: إيرادات/بنود معفاة من الربح', amount: '0.00', kind: 'manual' },
        { key: 'adjustedNetProfit', labelAr: 'صافي الربح المعدّل', amount: '0.00', kind: 'subtotal' },
        { key: 'longTermLiabilities', labelAr: 'يضاف: قروض والتزامات طويلة الأجل', amount: '0.00', kind: 'manual' },
        { key: 'otherAdditionsToBase', labelAr: 'يضاف: بنود أخرى إلى الوعاء', amount: '0.00', kind: 'manual' },
        { key: 'baseBeforeDeductions', labelAr: 'الوعاء قبل الحسميات', amount: '0.00', kind: 'subtotal' },
        { key: 'netFixedAssets', labelAr: 'يخصم: صافي الأصول الثابتة (من دفتر الأستاذ)', amount: '0.00', kind: 'ledger' },
        { key: 'investmentsDeduction', labelAr: 'يخصم: استثمارات', amount: '0.00', kind: 'manual' },
        { key: 'otherNonCurrentAssetsDeduction', labelAr: 'يخصم: أصول غير متداولة أخرى', amount: '0.00', kind: 'manual' },
        { key: 'carriedForwardLossesDeduction', labelAr: 'يخصم: خسائر مدورة', amount: '0.00', kind: 'manual' },
        { key: 'dividendsDeduction', labelAr: 'يخصم: توزيعات أرباح', amount: '0.00', kind: 'manual' },
        { key: 'zakatBase', labelAr: 'الوعاء الزكوي (لا يقل عن صافي الربح المعدّل)', amount: '0.00', kind: 'subtotal' },
        { key: 'zakatableBase', labelAr: 'حصة الشركاء السعوديين/الخليجيين من الوعاء', amount: '0.00', kind: 'subtotal' },
        { key: 'zakatDue', labelAr: 'الزكاة المستحقة', amount: '0.00', kind: 'result' },
        { key: 'incomeTaxableProfit', labelAr: 'حصة الشريك الأجنبي من الربح الخاضع للضريبة', amount: '0.00', kind: 'subtotal' },
        { key: 'incomeTaxDue', labelAr: 'ضريبة الدخل المستحقة', amount: '0.00', kind: 'result' },
        { key: 'totalDue', labelAr: 'إجمالي المستحق (زكاة + ضريبة دخل)', amount: '0.00', kind: 'result' },
      ],
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
    const comp = getStoredCompany();
    return makeList([
      {
        id: 'u-1',
        username: 'admin',
        fullName: `المدير التنفيذي (${comp.nameAr})`,
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
