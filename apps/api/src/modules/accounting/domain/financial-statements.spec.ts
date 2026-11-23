import { D } from '../../../shared/money';
import {
  calcVariance,
  CoaAccountMeta,
  computeHierarchicalBalances,
  inferCashFlowCategory,
  inferEquitySection,
  inferStatementSection,
  resolveEffectiveClassification,
  suggestNextAccountCode,
} from './financial-statements';

describe('Chart of Accounts & Dynamic Financial Statements Domain Rules', () => {
  test('suggestNextAccountCode generates clean hierarchical codes at unlimited depth', () => {
    expect(suggestNextAccountCode(null, [], 'ASSET')).toBe('1');
    expect(suggestNextAccountCode(null, ['1', '2', '3', '4', '5'], 'ASSET')).toBe('6');
    expect(suggestNextAccountCode('1', ['11', '12'])).toBe('13');
    expect(suggestNextAccountCode('11', [])).toBe('1101');
    expect(suggestNextAccountCode('11', ['1101', '1102'])).toBe('1103');
    expect(suggestNextAccountCode('1101', ['110101', '110102'])).toBe('110103');
    expect(suggestNextAccountCode('110101', [])).toBe('11010101');
  });

  test('inferStatementSection accurately classifies assets, liabilities, equity, revenue, costs & zakat', () => {
    expect(inferStatementSection({ accountClass: 'ASSET', subtype: 'BANK', code: '10201' })).toBe('CURRENT_ASSETS');
    expect(inferStatementSection({ accountClass: 'ASSET', subtype: 'FIXED_ASSET', code: '10501' })).toBe('NON_CURRENT_ASSETS');
    expect(inferStatementSection({ accountClass: 'ASSET', subtype: 'ACCUMULATED_DEPRECIATION', code: '10502' })).toBe('NON_CURRENT_ASSETS');
    expect(inferStatementSection({ accountClass: 'LIABILITY', code: '20101', nameAr: 'الموردون' })).toBe('CURRENT_LIABILITIES');
    expect(inferStatementSection({ accountClass: 'LIABILITY', code: '20402', nameAr: 'مخصص مكافأة نهاية الخدمة' })).toBe('NON_CURRENT_LIABILITIES');
    expect(inferStatementSection({ accountClass: 'EQUITY', code: '30101' })).toBe('EQUITY');
    expect(inferStatementSection({ accountClass: 'REVENUE', code: '40101' })).toBe('REVENUE');
    expect(inferStatementSection({ accountClass: 'DIRECT_COST', code: '50101' })).toBe('COST_OF_SALES');
    expect(inferStatementSection({ accountClass: 'OPERATING_EXPENSE', code: '50401', nameAr: 'مصروفات إدارية' })).toBe('OPERATING_EXPENSES');
    expect(inferStatementSection({ accountClass: 'OPERATING_EXPENSE', code: '50501', nameAr: 'مصروف الزكاة الشرعية' })).toBe('ZAKAT_TAX');
    expect(inferStatementSection({ accountClass: 'OTHER_INCOME', code: '4300' })).toBe('OTHER_INCOME');
    expect(inferStatementSection({ accountClass: 'OTHER_EXPENSE', code: '5700' })).toBe('OTHER_EXPENSES');
  });

  test('inferCashFlowCategory and inferEquitySection classify accounts accurately', () => {
    expect(inferCashFlowCategory({ accountClass: 'ASSET', subtype: 'BANK' })).toBe('CASH');
    expect(inferCashFlowCategory({ accountClass: 'ASSET', subtype: 'FIXED_ASSET' })).toBe('INVESTING');
    expect(inferCashFlowCategory({ accountClass: 'ASSET', subtype: 'ACCUMULATED_DEPRECIATION' })).toBe('NON_CASH');
    expect(inferCashFlowCategory({ accountClass: 'EQUITY', code: '30101' })).toBe('FINANCING');
    expect(inferCashFlowCategory({ accountClass: 'REVENUE', code: '40101' })).toBe('OPERATING');

    expect(inferEquitySection({ code: '30101', nameAr: 'رأس المال المدفوع' })).toBe('PAID_IN_CAPITAL');
    expect(inferEquitySection({ code: '30201', nameAr: 'الأرباح المبقاة' })).toBe('RETAINED_EARNINGS');
  });

  test('resolveEffectiveClassification honors historical period classifications prior to reclassification effectiveFrom', () => {
    const acc: CoaAccountMeta = {
      id: 'acc-x',
      parentId: null,
      code: '50102',
      nameAr: 'رواتب التفرغ',
      accountClass: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT',
      isPosting: true,
      level: 4,
      statementSection: 'COST_OF_SALES',
      statementLineId: 'sl-cos',
      cashFlowCategory: 'OPERATING',
    };
    const history = [
      {
        accountId: 'acc-x',
        effectiveFrom: '2026-07-01',
        oldStatementSection: 'OPERATING_EXPENSES',
        newStatementSection: 'COST_OF_SALES',
        oldStatementLineId: 'sl-opex',
        newStatementLineId: 'sl-cos',
        oldCashFlowCategory: 'OPERATING',
        newCashFlowCategory: 'OPERATING',
      },
    ];

    // Before effective date -> preserves historical classification!
    const h1 = resolveEffectiveClassification(acc, '2026-06-30', history);
    expect(h1.statementSection).toBe('OPERATING_EXPENSES');
    expect(h1.statementLineId).toBe('sl-opex');

    // On or after effective date -> uses new classification!
    const h2 = resolveEffectiveClassification(acc, '2026-07-01', history);
    expect(h2.statementSection).toBe('COST_OF_SALES');
    expect(h2.statementLineId).toBe('sl-cos');
  });

  test('computeHierarchicalBalances rolls up leaf balances through multi-level ancestors without double-counting', () => {
    const accounts: CoaAccountMeta[] = [
      { id: 'r1', parentId: null, code: '1', nameAr: 'الأصول', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false, level: 1 },
      { id: 'r11', parentId: 'r1', code: '11', nameAr: 'الأصول المتداولة', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false, level: 2 },
      { id: 'r1101', parentId: 'r11', code: '1101', nameAr: 'النقدية والبنوك', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: false, level: 3 },
      { id: 'a1', parentId: 'r1101', code: '10101', nameAr: 'الصندوق', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 4 },
      { id: 'a2', parentId: 'r1101', code: '10201', nameAr: 'البنك', accountClass: 'ASSET', normalBalance: 'DEBIT', isPosting: true, level: 4 },
      { id: 'a3', parentId: 'r1', code: '10502', nameAr: 'مجمع الإهلاك', accountClass: 'ASSET', normalBalance: 'CREDIT', isContra: true, isPosting: true, level: 2 },
    ];
    const leafSums = new Map([
      ['a1', { debit: D(1000), credit: D(200) }],
      ['a2', { debit: D(5000), credit: D(1000) }],
      ['a3', { debit: D(0), credit: D(300) }],
    ]);
    const rolled = computeHierarchicalBalances(accounts, leafSums);

    expect(rolled.get('a1')!.net.toNumber()).toBe(800);
    expect(rolled.get('a2')!.net.toNumber()).toBe(4000);
    expect(rolled.get('r1101')!.net.toNumber()).toBe(4800);
    expect(rolled.get('r11')!.net.toNumber()).toBe(4800);
    expect(rolled.get('a3')!.net.toNumber()).toBe(300); // CREDIT normal balance
    // Root Asset debit = 6000, credit = 1500 -> net = 4500 (contra depreciation properly netted!)
    expect(rolled.get('r1')!.debit.toNumber()).toBe(6000);
    expect(rolled.get('r1')!.credit.toNumber()).toBe(1500);
    expect(rolled.get('r1')!.net.toNumber()).toBe(4500);
  });

  test('calcVariance computes variance and percentage cleanly', () => {
    const v = calcVariance(D(150), D(100));
    expect(v.previousAmount).toBe('100.00');
    expect(v.variance).toBe('50.00');
    expect(v.variancePct).toBe('50.0');
  });
});
