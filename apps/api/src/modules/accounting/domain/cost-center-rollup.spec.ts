import { buildCostCenterHierarchyReport, CostCenterMeta, expandCostCenterTreeIds } from './cost-center-rollup';

describe('Cost Center Hierarchy & P&L Reconciliation Engine', () => {
  const centers: CostCenterMeta[] = [
    { id: 'cc-ops', parentId: null, code: 'CC-10', nameAr: 'قطاع العمليات والتسليم', ccType: 'DIRECT', isPosting: false, isActive: true },
    { id: 'cc-del', parentId: 'cc-ops', code: 'CC-101', nameAr: 'مركز تسليم المشاريع', ccType: 'DIRECT', isPosting: true, isActive: true },
    { id: 'cc-rnd', parentId: 'cc-ops', code: 'CC-102', nameAr: 'مركز البحث والتطوير', ccType: 'INDIRECT', isPosting: true, isActive: true },
    { id: 'cc-adm', parentId: null, code: 'CC-20', nameAr: 'الإدارة العامة', ccType: 'ADMIN', isPosting: true, isActive: true },
  ];

  it('expands parent cost centers to include all descendants safely', () => {
    const ids = expandCostCenterTreeIds('cc-ops', centers);
    expect(new Set(ids)).toEqual(new Set(['cc-ops', 'cc-del', 'cc-rnd']));
  });

  it('rolls up child revenues and costs to parent without double-counting grand totals or Income Statement profit', () => {
    const { rows, summary } = buildCostCenterHierarchyReport(centers, [
      {
        costCenterId: 'cc-del',
        statementSection: 'REVENUE',
        accountId: 'a-rev',
        accountCode: '40101',
        accountNameAr: 'إيرادات المشاريع',
        debitBase: 0,
        creditBase: 200000,
        projectId: 'prj-1',
        clientId: 'cli-1',
        employeeId: 'emp-1',
      },
      {
        costCenterId: 'cc-del',
        statementSection: 'COST_OF_SALES',
        accountId: 'a-cos',
        accountCode: '50101',
        accountNameAr: 'تكلفة المطورين',
        debitBase: 80000,
        creditBase: 0,
        projectId: 'prj-1',
        clientId: 'cli-1',
        employeeId: 'emp-1',
      },
      {
        costCenterId: 'cc-rnd',
        statementSection: 'OPERATING_EXPENSES',
        accountId: 'a-opx',
        accountCode: '50401',
        accountNameAr: 'مصروفات تطوير',
        debitBase: 20000,
        creditBase: 0,
        employeeId: 'emp-2',
      },
      {
        costCenterId: null, // unassigned corporate expense
        statementSection: 'OPERATING_EXPENSES',
        accountId: 'a-opx',
        accountCode: '50401',
        accountNameAr: 'مصروفات إدارية عامة',
        debitBase: 10000,
        creditBase: 0,
      },
    ]);

    const ops = rows.find((r) => r.id === 'cc-ops')!;
    const del = rows.find((r) => r.id === 'cc-del')!;
    const rnd = rows.find((r) => r.id === 'cc-rnd')!;
    const unassigned = rows.find((r) => r.id === 'UNASSIGNED')!;

    expect(ops.revenue).toBe('200000.00');
    expect(ops.directCost).toBe('80000.00');
    expect(ops.operatingExpense).toBe('20000.00');
    expect(ops.netContribution).toBe('100000.00');
    expect(ops.employeeCount).toBe(2);

    expect(del.netContribution).toBe('120000.00');
    expect(rnd.netContribution).toBe('-20000.00');
    expect(unassigned.totalCost).toBe('10000.00');

    // Grand totals NEVER double-count parent + child
    expect(summary.totalRevenue).toBe('200000.00');
    expect(summary.totalCost).toBe('110000.00'); // 80k + 20k + 10k
    expect(summary.netContribution).toBe('90000.00'); // 200k - 110k matches Income Statement!
    expect(summary.unassignedCost).toBe('10000.00');
  });
});
