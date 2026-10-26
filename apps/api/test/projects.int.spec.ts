import { INestApplication } from '@nestjs/common';
import { adminToken, Api, expectOk, newCompany, startApp } from './helpers';

/**
 * Clients, projects, assignments, utilization and service pricing against
 * PostgreSQL: a project cannot exist without a client, over-allocation is a
 * warning (never an error) and is normalized so cost is never loaded twice,
 * unutilized cost is reported, assignments/prices keep effective-dated history,
 * and closed periods protect history.
 */
describe('Clients, projects, assignments and pricing (integration)', () => {
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
        code: 'E1', fullNameAr: 'منى حسن', hireDate: '2026-01-01',
        compensation: { basicSalary: '10000', salaryCurrency: 'EGP', insuranceSalary: '0' }, costProfileId: ids.profile,
      }),
      201,
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a project without a client', async () => {
    const noClient = await a.post('/projects', { code: 'P0', nameAr: 'بدون عميل', startDate: '2026-01-01', currencyCode: 'EGP' });
    expect(noClient.status).toBe(400);
    const ghost = await a.post('/projects', { clientId: '019a0000-0000-7000-8000-000000000000', code: 'P0', nameAr: 'عميل وهمي', startDate: '2026-01-01', currencyCode: 'EGP' });
    expect(ghost.status).toBe(404);
  });

  it('creates a client and projects with an immutable status history', async () => {
    ids.client = expectOk(await a.post('/clients', { code: 'C1', nameAr: 'شركة النور', currencyCode: 'EGP', paymentTermsDays: 45 }), 201).id;
    const p1 = expectOk(await a.post('/projects', { clientId: ids.client, code: 'P1', nameAr: 'مشروع ألف', startDate: '2026-01-01', currencyCode: 'EGP', requiredMarginPct: '20', status: 'ACTIVE' }), 201);
    ids.p1 = p1.id;
    expect(p1.clientNameAr).toBe('شركة النور');
    expect(p1.statusHistory).toHaveLength(1);
    ids.p2 = expectOk(await a.post('/projects', { clientId: ids.client, code: 'P2', nameAr: 'مشروع باء', startDate: '2026-01-01', currencyCode: 'EGP', status: 'ACTIVE' }), 201).id;

    const dup = await a.post('/projects', { clientId: ids.client, code: 'P1', nameAr: 'مكرر', startDate: '2026-01-01', currencyCode: 'EGP' });
    expect(dup.body.code).toBe('DUPLICATE');

    const locked = await a.patch(`/projects/${ids.p1}`, { currencyCode: 'USD' });
    expect(locked.body.code).toBe('PROJECT_CURRENCY_LOCKED');
    const badMove = await a.post(`/projects/${ids.p1}/status`, { newStatus: 'DRAFT', effectiveDate: '2026-01-10', reason: 'اختبار' });
    expect(badMove.body.code).toBe('PROJECT_TRANSITION_NOT_ALLOWED');
  });

  it('reports under-allocation as unutilized time and cost', async () => {
    const r = expectOk(await a.post('/assignments', { employeeId: ids.emp, projectId: ids.p1, allocationPct: '60', startDate: '2026-01-01' }), 201);
    ids.as1 = r.id;
    expect(r.warnings).toHaveLength(0);
    const u = expectOk(await a.get(`/utilization/employees/${ids.emp}?periodId=${jan}`));
    expect(u.summary.allocatedPct).toBe('60.0000');
    expect(u.summary.unutilizedPct).toBe('40.0000');
    expect(u.cost.distributableCostBase).toBe('10000.00');
    expect(u.cost.unutilizedCostBase).toBe('4000.00');
    expect(u.cost.byProject[0].amountBase).toBe('6000.00');
  });

  it('allows over-allocation with a warning and normalizes so cost is loaded once', async () => {
    const r = expectOk(await a.post('/assignments', { employeeId: ids.emp, projectId: ids.p2, allocationPct: '70', startDate: '2026-01-01' }), 201);
    expect(r.warnings[0].code).toBe('OVER_ALLOCATION');
    expect(r.warnings[0].segments[0].totalPct).toBe('130.0000');
    const u = expectOk(await a.get(`/utilization/employees/${ids.emp}?periodId=${jan}`));
    expect(u.summary.isOverAllocated).toBe(true);
    expect(u.summary.overAllocatedPct).toBe('30.0000');
    expect(u.warnings[0].code).toBe('OVER_ALLOCATION');
    const parts = u.cost.byProject.map((x: any) => Number(x.amountBase));
    const sum = parts.reduce((s: number, x: number) => s + x, 0) + Number(u.cost.unutilizedCostBase);
    expect(sum.toFixed(2)).toBe('10000.00'); // never more than the employee cost
    expect(u.cost.unutilizedCostBase).toBe('0.00');
    const p1 = u.cost.byProject.find((x: any) => x.projectId === ids.p1);
    expect(p1.amountBase).toBe('4615.38'); // 60/130
  });

  it('refuses a second overlapping assignment on the same project', async () => {
    const r = await a.post('/assignments', { employeeId: ids.emp, projectId: ids.p1, allocationPct: '10', startDate: '2026-01-15' });
    expect(r.body.code).toBe('OVERLAPPING_PERIOD');
  });

  it('keeps history when allocation changes (end + new row) and validates dates', async () => {
    const before = await a.post('/assignments', { employeeId: ids.emp, projectId: ids.p2, allocationPct: '50', startDate: '2025-12-01' });
    expect(before.body.code).toBe('DATE_OUTSIDE_EMPLOYMENT');
    const list = expectOk(await a.get(`/assignments?employeeId=${ids.emp}`));
    expect(list.meta.total).toBe(2);
    const ch = expectOk(await a.post(`/assignments/${ids.as1}/change`, { effectiveFrom: '2026-02-01', allocationPct: '30', reason: 'تقليل الحصة' }), 201);
    expect(ch.allocationPct).toBe('30.0000');
    expect(ch.startDate).toBe('2026-02-01');
    const old = expectOk(await a.get(`/assignments/${ids.as1}`));
    expect(old.endDate).toBe('2026-01-31');
    const febU = expectOk(await a.get(`/utilization/employees/${ids.emp}?periodId=${feb}`));
    expect(febU.summary.allocatedPct).toBe('100.0000'); // 30 + 70
    expect(febU.summary.isOverAllocated).toBe(false);
    const report = expectOk(await a.get(`/utilization?periodId=${feb}`));
    expect(report.rows[0].allocatedPct).toBe('100.0000');
  });

  it('resolves service prices: default, project override, versions never overlap', async () => {
    expectOk(await a.post('/service-prices', { employeeId: ids.emp, pricingBasis: 'MONTHLY', price: '20000', currencyCode: 'EGP', effectiveFrom: '2026-01-01', reason: 'السعر الافتراضي' }), 201);
    const over = expectOk(await a.post('/service-prices', { employeeId: ids.emp, projectId: ids.p2, pricingBasis: 'DAILY', price: '1200', currencyCode: 'EGP', effectiveFrom: '2026-01-01', reason: 'سعر خاص' }), 201);
    expect(over.scope).toBe('PROJECT_OVERRIDE');
    const r1 = expectOk(await a.get(`/service-prices/resolve?employeeId=${ids.emp}&projectId=${ids.p1}&date=2026-01-10`));
    expect(r1.scope).toBe('DEFAULT');
    expect(r1.pricingBasis).toBe('MONTHLY');
    const r2 = expectOk(await a.get(`/service-prices/resolve?employeeId=${ids.emp}&projectId=${ids.p2}&date=2026-01-10`));
    expect(r2.scope).toBe('PROJECT_OVERRIDE');
    expect(r2.price).toBe('1200.0000');

    // a new default version supersedes the open one from its start date
    expectOk(await a.post('/service-prices', { employeeId: ids.emp, pricingBasis: 'MONTHLY', price: '24000', currencyCode: 'EGP', effectiveFrom: '2026-03-01', reason: 'زيادة' }), 201);
    const jan2 = expectOk(await a.get(`/service-prices/resolve?employeeId=${ids.emp}&projectId=${ids.p1}&date=2026-02-28`));
    expect(jan2.price).toBe('20000.0000');
    expect(jan2.effectiveTo).toBe('2026-02-28');
    const mar = expectOk(await a.get(`/service-prices/resolve?employeeId=${ids.emp}&projectId=${ids.p1}&date=2026-03-05`));
    expect(mar.price).toBe('24000.0000');
    // explicit overlapping range is refused
    const bad = await a.post('/service-prices', { employeeId: ids.emp, pricingBasis: 'HOURLY', price: '100', currencyCode: 'EGP', effectiveFrom: '2026-02-10', effectiveTo: '2026-02-20', reason: 'تداخل' });
    expect(bad.body.code).toBe('PRICE_OVERLAP');
  });

  it('completing a project ends its open assignments and cancelled projects are frozen', async () => {
    expectOk(await a.post(`/projects/${ids.p2}/status`, { newStatus: 'COMPLETED', effectiveDate: '2026-03-31', reason: 'تسليم نهائي' }), 201);
    const p = expectOk(await a.get(`/projects/${ids.p2}`));
    expect(p.status).toBe('COMPLETED');
    expect(p.endDate).toBe('2026-03-31');
    expect(p.statusHistory).toHaveLength(2);
    const asg = expectOk(await a.get(`/assignments?projectId=${ids.p2}`));
    expect(asg.data[0].endDate).toBe('2026-03-31');
    const late = await a.post('/assignments', { employeeId: ids.emp, projectId: ids.p2, allocationPct: '10', startDate: '2026-04-01' });
    expect(late.body.code).toBe('PROJECT_NOT_OPEN_FOR_ASSIGNMENT');
  });

  it('protects assignment history inside a closed period', async () => {
    const closed = expectOk(await a.post(`/closing/periods/${jan}/close`, { reason: 'إقفال يناير' }));
    expect(closed.period.status).toBe('CLOSED');
    const rm = await a.del(`/assignments/${ids.as1}`);
    expect(rm.body.code).toBe('HISTORY_LOCKED_BY_CLOSED_PERIOD');
    const end = await a.post(`/assignments/${ids.as1}/end`, { endDate: '2026-01-10' });
    expect(end.body.code).toBe('HISTORY_LOCKED_BY_CLOSED_PERIOD');
    const rmPrice = await a.get('/service-prices?scope=DEFAULT');
    const first = rmPrice.body.data.find((p: any) => p.effectiveFrom === '2026-01-01');
    const rp = await a.del(`/service-prices/${first.id}`);
    expect(rp.body.code).toBe('HISTORY_LOCKED_BY_CLOSED_PERIOD');
  });
});
