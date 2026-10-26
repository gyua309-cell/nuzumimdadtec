import { INestApplication } from '@nestjs/common';
import { adminToken, Api, expectOk, newCompany, startApp } from './helpers';

describe('Payroll, Loans, Revenue & Profitability (integration)', () => {
  let app: INestApplication;
  let a: Api;
  let jan: string;
  let feb: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await startApp();
    const token = await adminToken(app);
    const c = await newCompany(app, token);
    a = c.api;
    const periods = c.fiscalYear.periods as Array<{ id: string; periodNo: number }>;
    jan = periods.find((p) => p.periodNo === 1)!.id;
    feb = periods.find((p) => p.periodNo === 2)!.id;

    // Setup accounts and posting rule for payroll
    const a2 = expectOk(await a.post('/accounts', { code: '2', nameAr: 'الالتزامات', accountClass: 'LIABILITY', isPosting: false }), 201).id;
    const payAccId = expectOk(await a.post('/accounts', { code: '2100', nameAr: 'مستحقات رواتب', accountClass: 'LIABILITY', parentId: a2, subtype: 'PAYROLL_LIABILITY' }), 201).id;
    const a5 = expectOk(await a.post('/accounts', { code: '5', nameAr: 'المصروفات التشغيلية', accountClass: 'OPERATING_EXPENSE', isPosting: false }), 201).id;
    const expAccId = expectOk(await a.post('/accounts', { code: '5200', nameAr: 'مصروفات الرواتب', accountClass: 'OPERATING_EXPENSE', parentId: a5 }), 201).id;

    await a.post('/posting-rules', {
      eventCode: 'PAY.SALARY',
      name: 'قيد مسير الرواتب الشهري',
      effectiveFrom: '2026-01-01',
      lines: [
        { lineNo: 1, side: 'DEBIT', accountSource: 'FIXED', accountId: expAccId, amountKey: 'net' },
        { lineNo: 2, side: 'CREDIT', accountSource: 'FIXED', accountId: payAccId, amountKey: 'net' },
      ],
    });

    // Setup base cost component, profile, and employee
    ids.salary = expectOk(
      await a.post('/cost-components', {
        code: 'SAL', nameAr: 'الراتب', componentType: 'SALARY', nature: 'EARNING', calcMethod: 'BASIC_SALARY', postingTreatment: 'NONE',
        affectsNetPay: true, sortOrder: 1, effectiveFrom: '2026-01-01',
      }),
      201,
    ).id;
    ids.profile = expectOk(await a.post('/cost-profiles', { code: 'STD', nameAr: 'قياسي' }), 201).id;
    expectOk(await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.salary, effectiveFrom: '2026-01-01' }), 201);
    ids.emp = expectOk(
      await a.post('/employees', {
        code: 'E10', fullNameAr: 'أحمد محمود', hireDate: '2026-01-01',
        compensation: { basicSalary: '15000', salaryCurrency: 'EGP', insuranceSalary: '0' }, costProfileId: ids.profile,
      }),
      201,
    ).id;

    // Setup client and project
    ids.client = expectOk(await a.post('/clients', { code: 'CL-PR', nameAr: 'عميل المشاريع', currencyCode: 'EGP' }), 201).id;
    ids.project = expectOk(
      await a.post('/projects', {
        clientId: ids.client, code: 'PRJ-REV', nameAr: 'مشروع الربحية', startDate: '2026-01-01', currencyCode: 'EGP', status: 'ACTIVE', requiredMarginPct: '25',
      }),
      201,
    ).id;

    // Assign employee to project
    ids.asgn = expectOk(
      await a.post('/assignments', {
        employeeId: ids.emp, projectId: ids.project, allocationPct: '100', startDate: '2026-01-01', isBillable: true,
      }),
      201,
    ).id;

    // Set service price for employee
    ids.price = expectOk(
      await a.post('/service-prices', {
        employeeId: ids.emp,
        projectId: ids.project,
        pricingBasis: 'MONTHLY',
        price: '25000',
        currencyCode: 'EGP',
        effectiveFrom: '2026-01-01',
        reason: 'سعر تعاقد المشروع',
      }),
      201,
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Payroll Variables', () => {
    it('creates variable types for bonus, overtime, and deduction', async () => {
      const bonus = expectOk(
        await a.post('/variable-types', {
          code: 'BONUS', nameAr: 'مكافأة تميز', category: 'BONUS', calcMethod: 'FIXED', defaultAmount: '2000',
        }),
        201,
      );
      ids.vtBonus = bonus.id;

      const ot = expectOk(
        await a.post('/variable-types', {
          code: 'OT', nameAr: 'ساعات إضافية', category: 'OVERTIME', calcMethod: 'HOURS_RATE', defaultRate: '100', defaultMultiplier: '1.5',
        }),
        201,
      );
      ids.vtOt = ot.id;

      const list = expectOk(await a.get('/variable-types'));
      expect(list.data.length).toBeGreaterThanOrEqual(2);
    });

    it('creates a monthly variable line and approves it', async () => {
      const line = expectOk(
        await a.post('/monthly-variables', {
          fiscalPeriodId: jan,
          employeeId: ids.emp,
          variableTypeId: ids.vtBonus,
          amount: '2500',
        }),
        201,
      );
      expect(line.status).toBe('DRAFT');
      expect(Number(line.computedAmount)).toBe(2500);

      const approved = expectOk(await a.post(`/monthly-variables/${line.id}/approve`, {}));
      expect(approved.status).toBe('APPROVED');
    });
  });

  describe('Loans & Installments', () => {
    it('creates an employee loan with scheduled installments', async () => {
      const loan = expectOk(
        await a.post('/loans', {
          employeeId: ids.emp,
          reason: 'سلفة طارئة',
          principalAmount: '6000',
          currencyCode: 'EGP',
          installments: 3,
          startPeriodId: jan,
        }),
        201,
      );
      ids.loan = loan.id;
      expect(loan.loanNo).toMatch(/^LOAN-/);
      expect(loan.installments_list.length).toBe(3);
      expect(Number(loan.installments_list[0].dueAmount)).toBe(2000);
      ids.firstInst = loan.installments_list[0].id;
    });

    it('postpones an installment to another period', async () => {
      const postponed = expectOk(
        await a.post(`/loans/installments/${ids.firstInst}/postpone`, {
          toPeriodId: feb,
          reason: 'طلب الموظف تأجيل القسط',
        }),
      );
      expect(postponed.ok).toBe(true);

      const loan = expectOk(await a.get(`/loans/${ids.loan}`));
      const inst = loan.installments_list.find((i: any) => i.id === ids.firstInst);
      expect(inst.status).toBe('POSTPONED');
    });
  });

  describe('Payroll Runs', () => {
    it('previews and executes a monthly payroll run', async () => {
      const preview = expectOk(await a.get(`/payroll-runs/preview?periodId=${jan}`));
      expect(preview.employeeCount).toBeGreaterThanOrEqual(1);

      const run = expectOk(await a.post('/payroll-runs', { fiscalPeriodId: jan }), 201);
      ids.payRun = run.id;
      expect(run.status).toBe('POSTED');
      expect(run.lines.length).toBeGreaterThanOrEqual(1);

      // Cannot run twice for the same period
      const dup = await a.post('/payroll-runs', { fiscalPeriodId: jan });
      expect([409, 422]).toContain(dup.status);
    });

    it('cancels a payroll run with reason', async () => {
      const cancelled = expectOk(
        await a.post(`/payroll-runs/${ids.payRun}/cancel`, { reason: 'إعادة مراجعة المتغيرات' }),
      );
      expect(cancelled.status).toBe('CANCELLED');
    });
  });

  describe('Revenue Engine & Profitability', () => {
    it('previews and executes a revenue run from assignments and prices', async () => {
      const preview = expectOk(await a.get(`/revenue-runs/preview?periodId=${jan}`));
      expect(preview.lineCount).toBeGreaterThanOrEqual(1);
      expect(Number(preview.totalRevenueBase)).toBe(25000);

      const run = expectOk(await a.post('/revenue-runs', { fiscalPeriodId: jan }), 201);
      ids.revRun = run.id;
      expect(run.status).toBe('POSTED');
      expect(Number(run.totalRevenueBase)).toBe(25000);
    });

    it('computes project profitability comparing revenue and target margin', async () => {
      const prof = expectOk(await a.get(`/project-profitability?periodId=${jan}`));
      expect(Array.isArray(prof)).toBe(true);
      const prj = prof.find((p: any) => p.projectId === ids.project);
      expect(prj).toBeDefined();
      expect(Number(prj.revenueBase)).toBe(25000);
      expect(prj.requiredMarginPct).toBe('25.00');
    });

    it('computes 3-tier profitability: employee, project, and client levels', async () => {
      // 1. Employee Profitability (Section 20 of Business Process)
      const empProf = expectOk(await a.get(`/profitability/employees?periodId=${jan}`));
      expect(empProf.summary).toBeDefined();
      expect(empProf.employees.length).toBeGreaterThanOrEqual(1);

      const targetEmp = empProf.employees.find((e: any) => e.employeeId === ids.emp);
      expect(targetEmp).toBeDefined();
      expect(Number(targetEmp.revenueBase)).toBe(25000);
      expect(Number(targetEmp.directCostBase)).toBe(15000); // 15,000 basic salary
      expect(Number(targetEmp.allocatedPct)).toBe(100);
      expect(Number(targetEmp.unutilizedPct)).toBe(0);

      // 2. Client Profitability (Section 22 of Business Process)
      const clientProf = expectOk(await a.get(`/profitability/clients?periodId=${jan}`));
      expect(Array.isArray(clientProf)).toBe(true);
      const targetClient = clientProf.find((c: any) => c.clientId === ids.client);
      expect(targetClient).toBeDefined();
      expect(Number(targetClient.revenueBase)).toBe(25000);
      expect(targetClient.projectCount).toBeGreaterThanOrEqual(1);
    });

    it('records and retrieves retroactive revenue adjustment (Section 18 of Business Process)', async () => {
      const adj = expectOk(
        await a.post('/revenue-adjustments/retroactive', {
          employeeId: ids.emp,
          projectId: ids.project,
          originalPeriodId: jan,
          fiscalPeriodId: feb,
          pricingBasis: 'DAILY',
          units: 2,
          unitPrice: 1000,
          currencyCode: 'EGP',
          adjustmentReason: 'يومان عمل إضافيان في الشهر السابق لم يتم فوترتها',
        }),
        201,
      );

      expect(adj.revenueType).toBe('RETROACTIVE');
      expect(adj.originalPeriodId).toBe(jan);
      expect(adj.fiscalPeriodId).toBe(feb);
      expect(Number(adj.grossRevenueBase)).toBe(2000);

      const list = expectOk(await a.get(`/revenue-adjustments/retroactive?periodId=${feb}`));
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list[0].adjustmentReason).toBe('يومان عمل إضافيان في الشهر السابق لم يتم فوترتها');
    });

    it('manages overhead policy (Section 19 of Business Process)', async () => {
      const policy = expectOk(await a.get('/overhead-policy'));
      expect(policy.method).toBeDefined();

      const updated = expectOk(
        await a.put('/overhead-policy', {
          method: 'PERCENTAGE',
          rate: 20,
          notes: 'نسبة المصروفات الإدارية المعتمدة 20%',
        }),
      );
      expect(Number(updated.rate)).toBe(20);
    });

    it('cancels a revenue run with reason', async () => {
      const cancelled = expectOk(
        await a.post(`/revenue-runs/${ids.revRun}/cancel`, { reason: 'تعديل أسعار الخدمات' }),
      );
      expect(cancelled.status).toBe('CANCELLED');
    });
  });
});
