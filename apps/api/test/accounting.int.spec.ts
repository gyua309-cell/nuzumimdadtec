import { INestApplication } from '@nestjs/common';
import { requestContext } from '../src/shared/context';
import { PostingEngine } from '../src/modules/accounting/application/posting-engine';
import { adminToken, Api, expectOk, newCompany, sql, startApp } from './helpers';

/**
 * Accounting engine acceptance tests against a real PostgreSQL database.
 * Covers: double entry, DB-level guards, immutability, reversal, FX + rounding,
 * period close/snapshot/reopen, audit trail, posting engine, A = L + E.
 */
describe('Accounting engine (integration)', () => {
  let app: INestApplication;
  let token: string;
  let a: Api;
  let companyId: string;
  const acc: Record<string, string> = {};
  let periods: Array<{ id: string; periodNo: number; name: string; status: string }>;

  const line = (accountId: string, debit: string | null, credit: string | null, extra: Record<string, unknown> = {}) => ({
    accountId, debit, credit, ...extra,
  });

  async function createAccount(code: string, body: Record<string, unknown>) {
    const r = expectOk(await a.post('/accounts', { code, nameAr: `حساب ${code}`, ...body }), 201);
    acc[code] = r.id;
    return r;
  }

  async function postEntry(entryDate: string, lines: unknown[], description = 'قيد اختبار') {
    const d = expectOk(await a.post('/journal-entries', { entryDate, description, lines }), 201);
    return a.post(`/journal-entries/${d.id}/post`);
  }

  beforeAll(async () => {
    app = await startApp();
    token = await adminToken(app);
    const c = await newCompany(app, token);
    a = c.api;
    companyId = c.companyId;
    periods = c.fiscalYear.periods;

    expectOk(await a.post('/company-currencies', { code: 'USD' }), 201);
    expectOk(await a.post('/exchange-rates', { fromCurrency: 'USD', toCurrency: 'EGP', rateDate: '2026-01-01', rate: '50.1234' }), 201);
    expectOk(await a.post('/exchange-rates', { fromCurrency: 'USD', toCurrency: 'EGP', rateDate: '2026-02-10', rate: '3.3333' }), 201);

    await createAccount('1', { accountClass: 'ASSET', isPosting: false });
    await createAccount('1100', { accountClass: 'ASSET', parentId: acc['1'], subtype: 'CASH' });
    await createAccount('1200', { accountClass: 'ASSET', parentId: acc['1'], subtype: 'BANK', currencyCode: 'USD' });
    await createAccount('1300', { accountClass: 'ASSET', parentId: acc['1'], subtype: 'RECEIVABLE', isControl: true });
    await createAccount('2', { accountClass: 'LIABILITY', isPosting: false });
    await createAccount('2100', { accountClass: 'LIABILITY', parentId: acc['2'], subtype: 'PAYABLE' });
    await createAccount('3', { accountClass: 'EQUITY', isPosting: false });
    await createAccount('3100', { accountClass: 'EQUITY', parentId: acc['3'] });
    await createAccount('4', { accountClass: 'REVENUE', isPosting: false });
    await createAccount('4100', { accountClass: 'REVENUE', parentId: acc['4'] });
    await createAccount('5', { accountClass: 'OPERATING_EXPENSE', isPosting: false });
    await createAccount('5100', { accountClass: 'OPERATING_EXPENSE', parentId: acc['5'], requiresCostCenter: true });
    await createAccount('5900', { accountClass: 'OTHER_EXPENSE', subtype: 'ROUNDING' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('posts a balanced entry with a gapless number and Debit = Credit', async () => {
    const res = expectOk(await postEntry('2026-01-05', [line(acc['1100'], '100000', null), line(acc['3100'], null, '100000')], 'رأس المال'));
    expect(res.status).toBe('POSTED');
    expect(res.entryNo).toBe('JE-FY2026-000001');
    expect(res.totalDebitBase).toBe(res.totalCreditBase);
    expect(res.totalDebitBase).toBe('100000.0000');
  });

  it('rejects an unbalanced entry at database level and allows cancelling the draft with a reason', async () => {
    const d = expectOk(await a.post('/journal-entries', { entryDate: '2026-01-06', description: 'غير متوازن', lines: [line(acc['1100'], '10', null), line(acc['3100'], null, '9')] }), 201);
    const p = await a.post(`/journal-entries/${d.id}/post`);
    expect(p.status).toBe(422);
    expect(p.body.code).toBe('JE_UNBALANCED');
    const noReason = await a.post(`/journal-entries/${d.id}/cancel`, {});
    expect(noReason.status).toBe(400);
    const c = expectOk(await a.post(`/journal-entries/${d.id}/cancel`, { reason: 'إدخال خاطئ' }));
    expect(c.status).toBe('CANCELLED');
  });

  it('rejects header accounts, control accounts (manual) and missing required dimensions', async () => {
    const header = await a.post('/journal-entries', { entryDate: '2026-01-07', description: 'قيد اختبار', lines: [line(acc['1'], '5', null), line(acc['3100'], null, '5')] });
    expect(header.body.code).toBe('NON_POSTING_ACCOUNT');
    const control = await a.post('/journal-entries', { entryDate: '2026-01-07', description: 'قيد اختبار', lines: [line(acc['1300'], '5', null), line(acc['3100'], null, '5')] });
    expect(control.body.code).toBe('CONTROL_ACCOUNT_MANUAL_POSTING');
    const d = expectOk(await a.post('/journal-entries', { entryDate: '2026-01-07', description: 'بدون مركز تكلفة', lines: [line(acc['5100'], '5', null), line(acc['1100'], null, '5')] }), 201);
    const p = await a.post(`/journal-entries/${d.id}/post`);
    expect(p.body.code).toBe('REQUIRED_DIMENSION_MISSING');
    expectOk(await a.post(`/journal-entries/${d.id}/cancel`, { reason: 'اختبار' }));
  });

  it('keeps posted entries immutable even for direct SQL', async () => {
    const list = expectOk(await a.get('/journal-entries?status=POSTED'));
    const posted = list.data[0];
    const c = sql();
    await c.connect();
    try {
      await expect(c.query(`UPDATE acc.journal_entries SET description = 'hack' WHERE id = $1`, [posted.id])).rejects.toThrow(/POSTED_JE_IMMUTABLE/);
      await expect(c.query(`UPDATE acc.journal_lines SET debit_base = debit_base + 1 WHERE entry_id = $1`, [posted.id])).rejects.toThrow(/JE_LINES_LOCKED/);
      await expect(c.query(`DELETE FROM acc.journal_entries WHERE id = $1`, [posted.id])).rejects.toThrow(/JE_DELETE_FORBIDDEN/);
      await expect(
        c.query(`INSERT INTO acc.account_period_balances(company_id, ledger, period_id, account_id) VALUES ($1,'FINANCIAL',$2,$3)`, [companyId, periods[0].id, acc['1100']]),
      ).rejects.toThrow(/BALANCES_MAINTAINED_BY_POSTING_ONLY/);
      await expect(c.query(`UPDATE audit.audit_log SET reason = 'x' WHERE true`)).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
    } finally {
      await c.end();
    }
  });

  it('converts foreign currency with the transaction-date rate and keeps history when rates change', async () => {
    const res = expectOk(await postEntry('2026-01-10', [line(acc['1200'], '100', null, { currencyCode: 'USD' }), line(acc['3100'], null, '5012.34')]));
    const usd = res.lines.find((l: any) => l.currencyCode === 'USD');
    expect(usd.exchangeRate).toBe('50.1234000000');
    expect(usd.debitBase).toBe('5012.3400');
    const rates = expectOk(await a.get('/exchange-rates?fromCurrency=USD'));
    const jan = rates.data.find((r: any) => r.rateDate === '2026-01-01');
    expectOk(await a.patch(`/exchange-rates/${jan.id}`, { rate: '60' }));
    const again = expectOk(await a.get(`/journal-entries/${res.id}`));
    expect(again.lines.find((l: any) => l.currencyCode === 'USD').debitBase).toBe('5012.3400');
  });

  it('adds an FX rounding line to the configured ROUNDING account', async () => {
    const res = expectOk(
      await postEntry('2026-02-10', [
        line(acc['1200'], '1.00', null, { currencyCode: 'USD' }),
        line(acc['4100'], null, '0.50', { currencyCode: 'USD' }),
        line(acc['2100'], null, '0.50', { currencyCode: 'USD' }),
      ]),
    );
    expect(res.lines).toHaveLength(4);
    const r = res.lines.find((l: any) => l.accountId === acc['5900']);
    expect(r.debitBase).toBe('0.0100');
    expect(res.totalDebitBase).toBe(res.totalCreditBase);
  });

  it('fails strictly when an exchange rate is missing', async () => {
    const r = await a.post('/journal-entries', { entryDate: '2025-12-31', description: 'قيد اختبار', lines: [line(acc['1200'], '1', null, { currencyCode: 'USD' }), line(acc['3100'], null, '1')] });
    expect(['EXCHANGE_RATE_MISSING', 'PERIOD_NOT_FOUND_FOR_DATE']).toContain(r.body.code);
  });

  it('reverses a posted entry exactly once and links both entries', async () => {
    const cc = expectOk(await a.post('/cost-centers', { code: 'CC1', nameAr: 'مركز 1' }), 201);
    const e = expectOk(await postEntry('2026-01-15', [line(acc['5100'], '2500', null, { costCenterId: cc.id }), line(acc['1100'], null, '2500')]));
    const noReason = await a.post(`/journal-entries/${e.id}/reverse`, {});
    expect(noReason.status).toBe(400);
    const rev = expectOk(await a.post(`/journal-entries/${e.id}/reverse`, { reason: 'تصحيح' }));
    expect(rev.journalType).toBe('REVERSAL');
    expect(rev.reversalOfId).toBe(e.id);
    const o = expectOk(await a.get(`/journal-entries/${e.id}`));
    expect(o.reversedById).toBe(rev.id);
    const twice = await a.post(`/journal-entries/${e.id}/reverse`, { reason: 'مرة أخرى' });
    expect(twice.status).toBe(409);
    const st = expectOk(await a.get(`/ledger/account-statement?accountId=${acc['5100']}&from=2026-01-01&to=2026-01-31`));
    expect(st.closingBalance).toBe('0.0000');
  });

  it('writes the audit trail for posting and reversal', async () => {
    const r = expectOk(await a.get('/audit-log?table=journal_entries&action=REVERSE'));
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0].reason).toBe('تصحيح');
    const p = expectOk(await a.get('/audit-log?table=journal_entries&action=POST'));
    expect(p.data.length).toBeGreaterThanOrEqual(4);
    expect(p.data[0].userId).toBeTruthy();
  });

  it('keeps the trial balance balanced and Assets = Liabilities + Equity', async () => {
    const tb = expectOk(await a.get('/ledger/trial-balance?from=2026-01-01&to=2026-12-31'));
    expect(tb.balanced).toBe(true);
    expect(tb.totals.periodDebit).toBe(tb.totals.periodCredit);
    const bs = expectOk(await a.get('/ledger/balance-sheet?asOf=2026-12-31'));
    expect(bs.balanced).toBe(true);
    expect(bs.difference).toBe('0.0000');
  });

  it('posts through the posting engine with configurable rules, allocation split and once-per-source protection', async () => {
    const bank = expectOk(await a.post('/bank-accounts', { code: 'CASH1', name: 'الخزينة', kind: 'CASH', currencyCode: 'EGP', glAccountId: acc['1100'] }), 201);
    const cc1 = expectOk(await a.post('/cost-centers', { code: 'CCA', nameAr: 'أ' }), 201);
    const cc2 = expectOk(await a.post('/cost-centers', { code: 'CCB', nameAr: 'ب' }), 201);
    expectOk(
      await a.post('/posting-rules', {
        eventCode: 'LIABILITY.SETTLEMENT',
        name: 'سداد مصروف موزع',
        effectiveFrom: '2026-01-01',
        lines: [
          { lineNo: 1, side: 'DEBIT', accountSource: 'FIXED', accountId: acc['5100'], amountKey: 'AMOUNT', dimensionPolicy: 'SPLIT_BY_ALLOCATION' },
          { lineNo: 2, side: 'CREDIT', accountSource: 'FROM_BANK', amountKey: 'AMOUNT', dimensionPolicy: 'NONE' },
        ],
      }),
      201,
    );
    const items = [{
      key: 'AMOUNT', amount: '100.01', refs: { bankAccountId: bank.id },
      split: [{ weight: '60', dims: { costCenterId: cc1.id } }, { weight: '40', dims: { costCenterId: cc2.id } }],
    }];
    const sim = expectOk(await a.post('/posting-rules/simulate', { eventCode: 'LIABILITY.SETTLEMENT', entryDate: '2026-01-20', currencyCode: 'EGP', items }), 200);
    const debits = sim.lines.filter((l: any) => Number(l.debitBase) > 0).map((l: any) => l.debitBase).sort();
    expect(debits).toEqual(['40.0000', '60.0100']);

    const engine = app.get(PostingEngine);
    const user = await (async () => {
      const c = sql();
      await c.connect();
      const r = await c.query(`SELECT id FROM iam.users WHERE username = 'admin.test'`);
      await c.end();
      return r.rows[0].id as string;
    })();
    const sourceId = '01990000-0000-7000-8000-000000000001';
    const run = () =>
      requestContext.run({ requestId: 'test', userId: user, companyId }, () =>
        engine.post(companyId, {
          eventCode: 'LIABILITY.SETTLEMENT', entryDate: '2026-01-20', journalType: 'PAYMENT', description: 'سداد',
          sourceModule: 'TEST', sourceType: 'TEST_DOC', sourceId, currencyCode: 'EGP', items,
        }),
      );
    const jeId = await run();
    const je = expectOk(await a.get(`/journal-entries/${jeId}`));
    expect(je.status).toBe('POSTED');
    expect(je.postingEvent).toBe('LIABILITY.SETTLEMENT');
    expect(je.lines).toHaveLength(3);
    await expect(run()).rejects.toMatchObject({ code: 'DUPLICATE' });
  });

  it('closes a period with validations and an immutable hashed snapshot, blocks posting, and reopens only with a reason', async () => {
    const jan = periods.find((p) => p.periodNo === 1)!;
    const feb = periods.find((p) => p.periodNo === 2)!;
    const febEarly = await a.post(`/closing/periods/${feb.id}/close`, {});
    expect(febEarly.body.code).toBe('PERIOD_CLOSE_VALIDATION_FAILED');

    const closed = expectOk(await a.post(`/closing/periods/${jan.id}/close`, { reason: 'إقفال يناير' }));
    expect(closed.period.status).toBe('CLOSED');
    expect(closed.snapshot.hash).toMatch(/^[0-9a-f]{64}$/);

    const blocked = await a.post('/journal-entries', { entryDate: '2026-01-25', description: 'قيد اختبار', lines: [line(acc['1100'], '1', null), line(acc['3100'], null, '1')] });
    expect(blocked.body.code).toBe('PERIOD_NOT_OPEN');

    const snap = expectOk(await a.get(`/snapshots/${closed.snapshot.id}`));
    expect(snap.hashValid).toBe(true);
    expect(snap.data.trialBalance.financial.balanced).toBe(true);
    const c = sql();
    await c.connect();
    await expect(c.query(`UPDATE rpt.period_snapshots SET reason = 'x' WHERE id = $1`, [snap.id])).rejects.toThrow(/SNAPSHOT_IMMUTABLE/);
    await c.end();

    const noReason = await a.post(`/closing/periods/${jan.id}/reopen`, {});
    expect(noReason.status).toBe(400);
    const reopened = expectOk(await a.post(`/closing/periods/${jan.id}/reopen`, { reason: 'تسوية متأخرة' }));
    expect(reopened.status).toBe('OPEN');
    expect(reopened.reopenCount).toBe(1);
    const hist = expectOk(await a.get(`/fiscal-periods/${jan.id}/history`));
    expect(hist[0].reason).toBe('تسوية متأخرة');
  });
});
