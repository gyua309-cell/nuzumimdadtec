import { INestApplication } from '@nestjs/common';
import { adminToken, Api, expectOk, newCompany, startApp } from './helpers';

/**
 * HR / Employee cost / Assets acceptance tests against PostgreSQL:
 * configurable components, calendar-day proration, effective-dated history,
 * closed-period history lock, asset acquisition journal, custody-driven
 * depreciation into the employee dimension, run cancellation by reversal,
 * disposal with loss, and the accounting equation afterwards.
 */
describe('HR, employee cost and assets (integration)', () => {
  let app: INestApplication;
  let a: Api;
  const acc: Record<string, string> = {};
  let periods: Array<{ id: string; periodNo: number; name: string }>;
  let jan: string;
  let feb: string;
  const ids: Record<string, string> = {};

  async function account(code: string, body: Record<string, unknown>) {
    const r = expectOk(await a.post('/accounts', { code, nameAr: `حساب ${code}`, ...body }), 201);
    acc[code] = r.id;
  }

  beforeAll(async () => {
    app = await startApp();
    const token = await adminToken(app);
    const c = await newCompany(app, token);
    a = c.api;
    periods = c.fiscalYear.periods;
    jan = periods.find((p) => p.periodNo === 1)!.id;
    feb = periods.find((p) => p.periodNo === 2)!.id;

    await account('1', { accountClass: 'ASSET', isPosting: false });
    await account('1100', { accountClass: 'ASSET', parentId: acc['1'], subtype: 'CASH' });
    await account('1500', { accountClass: 'ASSET', parentId: acc['1'], subtype: 'FIXED_ASSET' });
    await account('1590', { accountClass: 'ASSET', parentId: acc['1'] });
    await account('2', { accountClass: 'LIABILITY', isPosting: false });
    await account('2100', { accountClass: 'LIABILITY', parentId: acc['2'], subtype: 'PAYROLL_LIABILITY' });
    await account('2200', { accountClass: 'LIABILITY', parentId: acc['2'] });
    await account('3', { accountClass: 'EQUITY', isPosting: false });
    await account('3100', { accountClass: 'EQUITY', parentId: acc['3'] });
    await account('5', { accountClass: 'OPERATING_EXPENSE', isPosting: false });
    await account('5200', { accountClass: 'OPERATING_EXPENSE', parentId: acc['5'] });
    await account('5300', { accountClass: 'OPERATING_EXPENSE', parentId: acc['5'] });
    await account('5400', { accountClass: 'OPERATING_EXPENSE', parentId: acc['5'] });
    await account('5800', { accountClass: 'OTHER_EXPENSE' });

    // capital so the bank can pay
    const je = expectOk(
      await a.post('/journal-entries', {
        entryDate: '2026-01-02', description: 'رأس المال',
        lines: [{ accountId: acc['1100'], debit: '500000', credit: null }, { accountId: acc['3100'], debit: null, credit: '500000' }],
      }),
      201,
    );
    expectOk(await a.post(`/journal-entries/${je.id}/post`));
    ids.bank = expectOk(await a.post('/bank-accounts', { code: 'CASH', name: 'الخزينة', kind: 'CASH', currencyCode: 'EGP', glAccountId: acc['1100'] }), 201).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('configures cost components (validated) and a cost profile with effective-dated lines', async () => {
    const bad = await a.post('/cost-components', {
      code: 'BAD', nameAr: 'خطأ', componentType: 'DEPRECIATION', nature: 'DEPRECIATION', calcMethod: 'FIXED', postingTreatment: 'PAYROLL', effectiveFrom: '2026-01-01',
    });
    expect(bad.status).toBe(400);

    ids.salary = expectOk(
      await a.post('/cost-components', {
        code: 'SAL', nameAr: 'الراتب الأساسي', componentType: 'SALARY', nature: 'EARNING', calcMethod: 'BASIC_SALARY', postingTreatment: 'PAYROLL',
        affectsNetPay: true, expenseAccountId: acc['5200'], liabilityAccountId: acc['2100'], sortOrder: 1, effectiveFrom: '2026-01-01',
      }),
      201,
    ).id;
    ids.ins = expectOk(
      await a.post('/cost-components', {
        code: 'INS', nameAr: 'تأمينات حصة الشركة', componentType: 'INSURANCE', nature: 'EMPLOYER_CONTRIB', calcMethod: 'PCT_INSURANCE', postingTreatment: 'PAYROLL',
        expenseAccountId: acc['5300'], liabilityAccountId: acc['2200'], sortOrder: 2, effectiveFrom: '2026-01-01',
      }),
      201,
    ).id;
    ids.dep = expectOk(
      await a.post('/cost-components', {
        code: 'DEP', nameAr: 'إهلاك العهد', componentType: 'DEPRECIATION', nature: 'DEPRECIATION', calcMethod: 'FROM_ASSETS', postingTreatment: 'DEPRECIATION_SOURCE',
        expenseAccountId: acc['5400'], sortOrder: 3, effectiveFrom: '2026-01-01',
      }),
      201,
    ).id;
    ids.profile = expectOk(await a.post('/cost-profiles', { code: 'STD', nameAr: 'الملف القياسي' }), 201).id;
    const missingRate = await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.ins, effectiveFrom: '2026-01-01' });
    expect(missingRate.body.code).toBe('VALIDATION_FAILED');
    expectOk(await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.salary, effectiveFrom: '2026-01-01' }), 201);
    expectOk(await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.ins, ratePct: '18.75', effectiveFrom: '2026-01-01' }), 201);
    const p = expectOk(await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.dep, effectiveFrom: '2026-01-01' }), 201);
    expect(p.lines).toHaveLength(3);
  });

  it('hires an employee with placement, salary and profile in one transaction', async () => {
    const dept = expectOk(await a.post('/departments', { code: 'IT', nameAr: 'تقنية المعلومات' }), 201);
    const e = expectOk(
      await a.post('/employees', {
        code: 'E001', fullNameAr: 'أحمد علي', hireDate: '2026-01-16', nationalId: '29001011234567',
        placement: { departmentId: dept.id },
        compensation: { basicSalary: '10000', salaryCurrency: 'EGP', insuranceSalary: '8000' },
        costProfileId: ids.profile,
      }),
      201,
    );
    ids.emp = e.id;
    expect(e.status).toBe('ACTIVE');
    expect(e.placements).toHaveLength(1);
    expect(e.compensations[0].basicSalary).toBe('10000.0000');
    expect(e.costProfiles[0].profileId).toBe(ids.profile);
    expect(e.statusHistory[0].newStatus).toBe('ACTIVE');
  });

  it('computes employee cost with calendar-day proration for a partial month', async () => {
    const c = expectOk(await a.get(`/employees/${ids.emp}/cost?periodId=${jan}`));
    const sal = c.lines.find((l: any) => l.code === 'SAL');
    const ins = c.lines.find((l: any) => l.code === 'INS');
    expect(c.employedDays).toBe(16);
    expect(sal.amount).toBe('5161.29'); // 10000 * 16 / 31
    expect(ins.amount).toBe('774.19'); // 8000 * 18.75% * 16 / 31
    expect(c.totalCostBase).toBe('5935.48');
  });

  it('refuses back-dated salary versions and keeps history intact', async () => {
    const r = await a.post(`/employees/${ids.emp}/compensations`, { basicSalary: '9000', salaryCurrency: 'EGP', effectiveFrom: '2026-01-16', reason: 'تعديل خاطئ' });
    expect(r.body.code).toBe('EFFECTIVE_DATE_NOT_AFTER_CURRENT');
    const e = expectOk(await a.post(`/employees/${ids.emp}/compensations`, { basicSalary: '12000', salaryCurrency: 'EGP', insuranceSalary: '8000', effectiveFrom: '2026-03-01', reason: 'زيادة سنوية' }), 201);
    expect(e.compensations).toHaveLength(2);
    expect(e.compensations[1].effectiveTo).toBe('2026-02-28');
    const febCost = expectOk(await a.get(`/employees/${ids.emp}/cost?periodId=${feb}`));
    expect(febCost.lines.find((l: any) => l.code === 'SAL').amount).toBe('10000.00');
  });

  it('activates an asset through the posting engine (balanced acquisition journal)', async () => {
    expectOk(
      await a.post('/posting-rules', {
        eventCode: 'ASSET.ACQUISITION', name: 'شراء أصل نقدًا', effectiveFrom: '2026-01-01',
        lines: [
          { lineNo: 1, side: 'DEBIT', accountSource: 'FROM_ASSET_CATEGORY_ASSET', amountKey: 'COST' },
          { lineNo: 2, side: 'CREDIT', accountSource: 'FROM_BANK', amountKey: 'COST', dimensionPolicy: 'NONE' },
        ],
      }),
      201,
    );
    ids.cat = expectOk(
      await a.post('/asset-categories', {
        code: 'LAP', nameAr: 'أجهزة لابتوب', assetAccountId: acc['1500'], accumAccountId: acc['1590'], expenseAccountId: acc['5400'], defaultUsefulLifeMonths: 36,
      }),
      201,
    ).id;
    const asset = expectOk(
      await a.post('/assets', { assetNo: 'LT-001', name: 'Laptop', categoryId: ids.cat, assetKind: 'LAPTOP', purchaseDate: '2026-01-16', acquisitionCost: '36000', currencyCode: 'EGP' }),
      201,
    );
    ids.asset = asset.id;
    expect(asset.status).toBe('DRAFT');
    expect(asset.depreciationEnd).toBe('2028-12-31');
    expect(asset.schedule).toHaveLength(36);
    const act = expectOk(await a.post(`/assets/${ids.asset}/activate`, { funding: 'BANK', bankAccountId: ids.bank }), 201);
    expect(act.status).toBe('ACTIVE');
    const je = expectOk(await a.get(`/journal-entries/${act.acquisitionEntryId}`));
    expect(je.status).toBe('POSTED');
    expect(je.totalDebitBase).toBe('36000.0000');
    expect(je.totalDebitBase).toBe(je.totalCreditBase);
    const locked = await a.patch(`/assets/${ids.asset}`, { acquisitionCost: '1' });
    expect(locked.body.code).toBe('ASSET_FINANCIALS_LOCKED');
  });

  it('feeds custody depreciation into employee cost by custody days', async () => {
    expectOk(await a.post(`/assets/${ids.asset}/custody`, { employeeId: ids.emp, effectiveFrom: '2026-02-15' }), 201);
    const c = expectOk(await a.get(`/employees/${ids.emp}/cost?periodId=${feb}`));
    expect(c.lines.find((l: any) => l.code === 'DEP').amount).toBe('500.00'); // 1000 * 14 / 28
  });

  it('runs depreciation (catch-up, custody split to the employee dimension) exactly once per period', async () => {
    expectOk(
      await a.post('/posting-rules', {
        eventCode: 'ASSET.DEPRECIATION', name: 'إهلاك شهري', effectiveFrom: '2026-01-01',
        lines: [
          { lineNo: 1, side: 'DEBIT', accountSource: 'FROM_ASSET_CATEGORY_EXPENSE', amountKey: 'AMOUNT' },
          { lineNo: 2, side: 'CREDIT', accountSource: 'FROM_ASSET_CATEGORY_ACCUM', amountKey: 'AMOUNT', dimensionPolicy: 'NONE' },
        ],
      }),
      201,
    );
    const preview = expectOk(await a.get(`/depreciation-runs/preview?periodId=${feb}`));
    expect(preview.totalAmountBase).toBe('2000.0000');
    const run = expectOk(await a.post('/depreciation-runs', { periodId: feb }), 201);
    ids.run = run.id;
    expect(run.totalAmountBase).toBe('2000.0000');
    expect(run.lines).toHaveLength(3);
    const toEmployee = run.lines.filter((l: any) => l.employeeId === ids.emp);
    expect(toEmployee).toHaveLength(1);
    expect(toEmployee[0].amountBase).toBe('500.0000');
    const je = expectOk(await a.get(`/journal-entries/${run.journalEntryId}`));
    expect(je.totalDebitBase).toBe('2000.0000');
    expect(je.totalDebitBase).toBe(je.totalCreditBase);
    expect(je.lines.some((l: any) => l.employeeId === ids.emp && l.debitBase === '500.0000')).toBe(true);
    const again = await a.post('/depreciation-runs', { periodId: feb });
    expect(again.body.code).toBe('DEPRECIATION_RUN_EXISTS');
  });

  it('freezes employee history inside a closed period', async () => {
    const closed = expectOk(await a.post(`/closing/periods/${jan}/close`, { reason: 'إقفال يناير' }));
    expect(closed.period.status).toBe('CLOSED');
    const r = await a.post(`/employees/${ids.emp}/placements`, { effectiveFrom: '2026-01-20', reason: 'نقل بأثر رجعي' });
    expect(r.body.code).toBe('HISTORY_LOCKED_BY_CLOSED_PERIOD');
    // a change starting in the open period only ends the January version on Jan-31: closed history is untouched
    const ok = expectOk(await a.post(`/employees/${ids.emp}/placements`, { effectiveFrom: '2026-02-01', reason: 'نقل' }), 201);
    expect(ok.placements).toHaveLength(2);
    expect(ok.placements[1].effectiveTo).toBe('2026-01-31');
    const del = await a.del(`/employees/${ids.emp}/placements/${ok.placements[1].id}`);
    expect(del.body.code).toBe('ONLY_LATEST_VERSION_REMOVABLE');
  });

  it('cancels a depreciation run by reversal (reason required) and allows re-running', async () => {
    const noReason = await a.post(`/depreciation-runs/${ids.run}/cancel`, {});
    expect(noReason.status).toBe(400);
    const c = expectOk(await a.post(`/depreciation-runs/${ids.run}/cancel`, { reason: 'تصحيح العهدة' }), 201);
    expect(c.status).toBe('CANCELLED');
    expect(c.reversalEntryId).toBeTruthy();
    const rerun = expectOk(await a.post('/depreciation-runs', { periodId: feb }), 201);
    expect(rerun.totalAmountBase).toBe('2000.0000');
  });

  it('disposes an asset with a balanced disposal journal (loss) and ends custody', async () => {
    expectOk(
      await a.post('/posting-rules', {
        eventCode: 'ASSET.DISPOSAL', name: 'استبعاد أصل', effectiveFrom: '2026-01-01',
        lines: [
          { lineNo: 1, side: 'DEBIT', accountSource: 'FROM_ASSET_CATEGORY_ACCUM', amountKey: 'ACCUMULATED', dimensionPolicy: 'NONE' },
          { lineNo: 2, side: 'DEBIT', accountSource: 'FROM_BANK', amountKey: 'PROCEEDS', dimensionPolicy: 'NONE' },
          { lineNo: 3, side: 'DEBIT', accountSource: 'FIXED', accountId: acc['5800'], amountKey: 'LOSS', dimensionPolicy: 'NONE' },
          { lineNo: 4, side: 'CREDIT', accountSource: 'FROM_ASSET_CATEGORY_ASSET', amountKey: 'COST', dimensionPolicy: 'NONE' },
          { lineNo: 5, side: 'CREDIT', accountSource: 'FIXED', accountId: acc['5800'], amountKey: 'GAIN', dimensionPolicy: 'NONE' },
        ],
      }),
      201,
    );
    const d = expectOk(
      await a.post(`/assets/${ids.asset}/dispose`, { disposalDate: '2026-03-10', proceedsBase: '30000', bankAccountId: ids.bank, reason: 'بيع الجهاز' }),
      201,
    );
    expect(d.status).toBe('DISPOSED');
    expect(d.custodies[0].effectiveTo).toBe('2026-03-10');
    const je = expectOk(await a.get(`/journal-entries/${d.disposalEntryId}`));
    expect(je.totalDebitBase).toBe('36000.0000');
    expect(je.lines.find((l: any) => l.accountId === acc['5800']).debitBase).toBe('4000.0000'); // NBV 34000 - proceeds 30000
  });

  it('keeps Debit = Credit and Assets = Liabilities + Equity', async () => {
    const tb = expectOk(await a.get('/ledger/trial-balance?from=2026-01-01&to=2026-12-31'));
    expect(tb.balanced).toBe(true);
    const bs = expectOk(await a.get('/ledger/balance-sheet?asOf=2026-12-31'));
    expect(bs.balanced).toBe(true);
    expect(bs.difference).toBe('0.0000');
  });
});
