import { INestApplication } from '@nestjs/common';
import { adminToken, Api, expectOk, newCompany, startApp } from './helpers';

describe('Branch Custodies & Multi-Currency Petty Cash (integration)', () => {
  let app: INestApplication;
  let a: Api;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    app = await startApp();
    const token = await adminToken(app);
    const c = await newCompany(app, token);
    a = c.api;

    // Enable SAR and exchange rate
    expectOk(await a.post('/company-currencies', { code: 'SAR' }), 201);
    expectOk(await a.post('/exchange-rates', { fromCurrency: 'SAR', toCurrency: 'EGP', rateDate: '2026-01-01', rate: '13.15' }), 201);

    // 1. Chart of Accounts Setup for company
    const a1 = expectOk(await a.post('/accounts', { code: '1', nameAr: 'الأصول', accountClass: 'ASSET', isPosting: false }), 201).id;
    const a5 = expectOk(await a.post('/accounts', { code: '5', nameAr: 'المصروفات التشغيلية', accountClass: 'OPERATING_EXPENSE', isPosting: false }), 201).id;

    // Bank Account (SAR)
    ids.bankSar = expectOk(
      await a.post('/accounts', { code: '1110', nameAr: 'حساب بنك الرياض (SAR)', accountClass: 'ASSET', parentId: a1, isPosting: true }),
      201,
    ).id;

    // Bank Account (EGP)
    ids.bankEgp = expectOk(
      await a.post('/accounts', { code: '1120', nameAr: 'حساب بنك CIB (EGP)', accountClass: 'ASSET', parentId: a1, isPosting: true }),
      201,
    ).id;

    // Custody Account (Egypt Branch)
    ids.custodyAcc = expectOk(
      await a.post('/accounts', { code: '1310', nameAr: 'عهد نقدية - فرع مصر', accountClass: 'ASSET', parentId: a1, isPosting: true }),
      201,
    ).id;

    // Input VAT
    ids.vatAcc = expectOk(
      await a.post('/accounts', { code: '1250', nameAr: 'ضريبة المدخلات', accountClass: 'ASSET', parentId: a1, isPosting: true }),
      201,
    ).id;

    // Branch Office Expenses
    ids.expenseAcc = expectOk(
      await a.post('/accounts', { code: '5150', nameAr: 'مصروفات تشغيلية للمقر والفرع', accountClass: 'OPERATING_EXPENSE', parentId: a5, isPosting: true }),
      201,
    ).id;

    // 2. Setup Cost Profile and Employee
    ids.salaryComp = expectOk(
      await a.post('/cost-components', {
        code: 'SAL', nameAr: 'الراتب', componentType: 'SALARY', nature: 'EARNING', calcMethod: 'BASIC_SALARY', postingTreatment: 'NONE',
        affectsNetPay: true, sortOrder: 1, effectiveFrom: '2026-01-01',
      }),
      201,
    ).id;
    ids.profile = expectOk(await a.post('/cost-profiles', { code: 'STD', nameAr: 'قياسي' }), 201).id;
    expectOk(await a.post(`/cost-profiles/${ids.profile}/lines`, { componentId: ids.salaryComp, effectiveFrom: '2026-01-01' }), 201);

    ids.emp = expectOk(
      await a.post('/employees', {
        code: 'E-CUST', fullNameAr: 'كريم عبد العزيز (أمين العهدة)', hireDate: '2026-01-01',
        compensation: { basicSalary: '25000', salaryCurrency: 'EGP', insuranceSalary: '0' }, costProfileId: ids.profile,
      }),
      201,
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. creates a custody advance request in SAR for Egypt branch operations', async () => {
    const res = expectOk(
      await a.post('/custodies', {
        employeeId: ids.emp,
        titleAr: 'عهدة المصروفات التشغيلية لفرع القاهرة - الربع الأول',
        purpose: 'مصاريف المقر والإنترنت والضيافة',
        sourceCurrency: 'SAR',
        requestedAmount: 10000,
        targetCurrency: 'EGP',
        disbursedFromAccountId: ids.bankSar,
      }),
      201,
    );

    expect(res.id).toBeDefined();
    expect(res.custody_no).toMatch(/^CUST-\d{4}-\d{4}$/);
    expect(res.status).toBe('DRAFT');
    expect(Number(res.requested_amount)).toBe(10000);
    ids.custody = res.id;
  });

  it('2. disburses the custody advance and generates an automatic GL journal entry', async () => {
    const res = expectOk(
      await a.post(`/custodies/${ids.custody}/disburse`, {
        disbursedFromAccountId: ids.bankSar,
        disbursementDate: '2026-01-15',
        reference: 'WIRE-SAR-00912',
      }),
      201,
    );

    expect(res.status).toBe('DISBURSED');
    expect(res.disbursement_journal_entry_id).toBeDefined();
    expect(Number(res.disbursed_amount)).toBe(10000);
  });

  it('3. records FX conversion of SAR into EGP in Cairo at spot rate', async () => {
    const res = expectOk(
      await a.post(`/custodies/${ids.custody}/conversion`, {
        targetCurrency: 'EGP',
        conversionRate: 13.15,
        convertedAmountSource: 10000,
        convertedAmountTarget: 131500,
        conversionDate: '2026-01-16',
        conversionReceiptNo: 'FX-CIB-9021',
        conversionNotes: 'تم استلام المبلغ وصرفه من بنك CIB مصر',
      }),
      201,
    );

    expect(res.status).toBe('CONVERTED');
    expect(Number(res.conversion_rate)).toBe(13.15);
    expect(Number(res.converted_amount_target)).toBe(131500);
    expect(Number(res.remaining_balance_target)).toBe(131500);
  });

  it('4. adds settlement expense vouchers (receipts) in EGP', async () => {
    const res = expectOk(
      await a.post(`/custodies/${ids.custody}/lines`, {
        expenseDate: '2026-01-20',
        receiptNo: 'REC-WE-1002',
        expenseAccountId: ids.expenseAcc,
        vendorName: 'المصرية للاتصالات WE',
        description: 'فاتورة الإنترنت فايبر فائق السرعة لمقر فرع مصر',
        currencyCode: 'EGP',
        subtotal: 1500,
        vatRate: 14,
        vatAmount: 210,
        totalAmount: 1710,
      }),
      201,
    );

    expect(res.status).toBe('PARTIALLY_SETTLED');
    expect(res.lines.length).toBe(1);
    expect(Number(res.total_settled_amount_target)).toBe(1710);
    expect(Number(res.remaining_balance_target)).toBe(131500 - 1710);
  });

  it('5. posts settlement journal entry to General Ledger', async () => {
    const res = expectOk(
      await a.post(`/custodies/${ids.custody}/settle`, {
        settlementDate: '2026-01-25',
        reference: 'SETTLE-JAN-01',
      }),
      201,
    );

    expect(res.lines[0].journal_entry_id).toBeDefined();
    expect(res.lines[0].journalEntryNo).toBeDefined();
  });

  it('6. closes custody and returns remaining balance to EGP bank', async () => {
    const res = expectOk(
      await a.post(`/custodies/${ids.custody}/close`, {
        closureDate: '2026-01-31',
        refundToAccountId: ids.bankEgp,
        refundAmount: 131500 - 1710,
        closureNotes: 'تم إقفال العهدة وإيداع باقي المبلغ في حساب البنك بالجنيه',
      }),
      201,
    );

    expect(res.status).toBe('CLOSED');
    expect(Number(res.remaining_balance_target)).toBe(0);
    expect(res.closure_journal_entry_id).toBeDefined();
  });

  it('7. retrieves comprehensive custody analytics report', async () => {
    const rep = expectOk(await a.get('/custodies/report'));
    expect(rep.kpis).toBeDefined();
    expect(Number(rep.kpis.totalCustodiesCount)).toBeGreaterThanOrEqual(1);
    expect(rep.expenseBreakdown.length).toBeGreaterThanOrEqual(1);
    expect(rep.custodians.length).toBeGreaterThanOrEqual(1);
  });
});
