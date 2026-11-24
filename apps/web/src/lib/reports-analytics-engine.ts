/**
 * Multi-Level Cost Centers & Cross-Dimensional Analytics Engine (Local / Safe Mode)
 * 1:1 Domain parity with apps/api CostCentersReportService & cost-center-rollup.ts
 */

import {
  IS_SECTIONS,
  computeDynamicBalanceSheet,
  computeDynamicIncomeStatement,
  computeDynamicTrialBalance,
  createLineDimMatcher,
  createLineDimResolver,
  expandLocalCostCenterIds,
  getLocalCostCenters,
  getReclassifications,
  resolveLocalEffectiveClassification,
  type DimensionFilterParams,
} from './coa-statements-engine';
import { defaultFiscalPeriodsList, getEntityList } from './local-store';

export const COST_CENTER_TYPE_LABELS: Record<string, string> = {
  DIRECT: 'تشغيلي مباشر',
  INDIRECT: 'تشغيلي غير مباشر',
  ADMIN: 'إداري وعمومي',
};

const PNL_SECTION_LABELS_AR: Record<string, string> = {
  REVENUE: 'الإيرادات التشغيلية',
  COST_OF_SALES: 'تكلفة الإيرادات والمشاريع',
  OPERATING_EXPENSES: 'المصروفات الإدارية والعمومية',
  OTHER_INCOME: 'إيرادات أخرى',
  OTHER_EXPENSES: 'مصروفات أخرى',
  ZAKAT_TAX: 'مخصص الزكاة وضريبة الدخل',
};

export interface CostCenterReportParams extends DimensionFilterParams {
  periodId?: string;
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
  ccType?: string;
}

function calcVar(cur: number, prev: number) {
  const variance = Number((cur - prev).toFixed(2));
  const variancePct =
    Math.abs(prev) > 0.005 ? Number(((variance / Math.abs(prev)) * 100).toFixed(1)) : cur === 0 ? 0 : 100;
  return {
    amount: cur.toFixed(2),
    previous: prev.toFixed(2),
    variance: variance.toFixed(2),
    variancePct,
  };
}

export function resolveReportFilterWindow(params: {
  periodId?: string | null;
  from?: string | null;
  to?: string | null;
}): { from: string; to: string; periodId: string | null; periodName: string | null } {
  const periods = getEntityList<any>('fiscal_periods', defaultFiscalPeriodsList);
  const year = new Date().getFullYear();
  if (params.periodId) {
    const p = periods.find((x: any) => x.id === params.periodId || x.code === params.periodId);
    if (p) {
      return {
        from: params.from || String(p.startDate).slice(0, 10),
        to: params.to || String(p.endDate).slice(0, 10),
        periodId: p.id,
        periodName: p.name || p.code,
      };
    }
  }
  return {
    from: params.from || `${year}-01-01`,
    to: params.to || new Date().toISOString().slice(0, 10),
    periodId: params.periodId || null,
    periodName: null,
  };
}

interface MutableCcAgg {
  rev: number;
  cos: number;
  opex: number;
  otherInc: number;
  otherExp: number;
  txCount: number;
  projects: Set<string>;
  clients: Set<string>;
  employees: Set<string>;
}

const emptyAgg = (): MutableCcAgg => ({
  rev: 0,
  cos: 0,
  opex: 0,
  otherInc: 0,
  otherExp: 0,
  txCount: 0,
  projects: new Set(),
  clients: new Set(),
  employees: new Set(),
});

export function buildLocalCostCenterHierarchyReport(
  centers: any[],
  lines: Array<{
    costCenterId: string | null;
    statementSection: string;
    debitBase: number | string;
    creditBase: number | string;
    projectId?: string | null;
    clientId?: string | null;
    employeeId?: string | null;
  }>,
  previousCenters?: Map<string, { revenue: number; totalCost: number; netContribution: number }>,
) {
  const byId = new Map(centers.map((c) => [c.id, c]));
  const childrenMap = new Map<string | null, any[]>();
  for (const c of centers) {
    const pid = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    const arr = childrenMap.get(pid) ?? [];
    arr.push(c);
    childrenMap.set(pid, arr);
  }
  for (const [, arr] of childrenMap) {
    arr.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  }

  const levelOf = (id: string): number => {
    let lvl = 1;
    let cur = byId.get(id)?.parentId ?? null;
    const seen = new Set<string>([id]);
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      lvl++;
      cur = byId.get(cur)!.parentId;
    }
    return lvl;
  };

  const ownMap = new Map<string, MutableCcAgg>();
  for (const c of centers) ownMap.set(c.id, emptyAgg());
  ownMap.set('UNASSIGNED', emptyAgg());

  for (const l of lines) {
    const key = l.costCenterId && ownMap.has(l.costCenterId) ? l.costCenterId : 'UNASSIGNED';
    const agg = ownMap.get(key)!;
    const dr = Number(l.debitBase || 0);
    const cr = Number(l.creditBase || 0);

    switch (l.statementSection) {
      case 'REVENUE':
        agg.rev += cr - dr;
        break;
      case 'COST_OF_SALES':
        agg.cos += dr - cr;
        break;
      case 'OPERATING_EXPENSES':
        agg.opex += dr - cr;
        break;
      case 'OTHER_INCOME':
        agg.otherInc += cr - dr;
        break;
      case 'OTHER_EXPENSES':
      case 'ZAKAT_TAX':
        agg.otherExp += dr - cr;
        break;
      default:
        continue;
    }

    agg.txCount += 1;
    if (l.projectId) agg.projects.add(l.projectId);
    if (l.clientId) agg.clients.add(l.clientId);
    if (l.employeeId) agg.employees.add(l.employeeId);
  }

  // Ancestor rollup without double-counting
  const rolledMap = new Map<string, MutableCcAgg>();
  for (const c of centers) rolledMap.set(c.id, emptyAgg());
  rolledMap.set('UNASSIGNED', emptyAgg());

  for (const [id, own] of ownMap.entries()) {
    if (id === 'UNASSIGNED') {
      const u = rolledMap.get('UNASSIGNED')!;
      u.rev = own.rev;
      u.cos = own.cos;
      u.opex = own.opex;
      u.otherInc = own.otherInc;
      u.otherExp = own.otherExp;
      u.txCount = own.txCount;
      own.projects.forEach((x) => u.projects.add(x));
      own.clients.forEach((x) => u.clients.add(x));
      own.employees.forEach((x) => u.employees.add(x));
      continue;
    }
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur && rolledMap.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const r = rolledMap.get(cur)!;
      r.rev += own.rev;
      r.cos += own.cos;
      r.opex += own.opex;
      r.otherInc += own.otherInc;
      r.otherExp += own.otherExp;
      r.txCount += own.txCount;
      own.projects.forEach((x) => r.projects.add(x));
      own.clients.forEach((x) => r.clients.add(x));
      own.employees.forEach((x) => r.employees.add(x));
      cur = byId.get(cur)?.parentId ?? null;
    }
  }

  let totalRev = 0;
  let totalCos = 0;
  let totalOpex = 0;
  let totalOtherInc = 0;
  let totalOtherExp = 0;
  for (const own of ownMap.values()) {
    totalRev += own.rev;
    totalCos += own.cos;
    totalOpex += own.opex;
    totalOtherInc += own.otherInc;
    totalOtherExp += own.otherExp;
  }
  const grandTotalCost = totalCos + totalOpex + totalOtherExp;
  const grandNetProfit = totalRev + totalOtherInc - grandTotalCost;

  const ordered: any[] = [];
  const walk = (pid: string | null) => {
    for (const c of childrenMap.get(pid) ?? []) {
      ordered.push(c);
      walk(c.id);
    }
  };
  walk(null);

  const buildRow = (meta: any, own: MutableCcAgg, rolled: MutableCcAgg, level: number, hasChildren: boolean) => {
    const ownTotCost = own.cos + own.opex + own.otherExp;
    const ownNet = own.rev + own.otherInc - ownTotCost;
    const rTotCost = rolled.cos + rolled.opex + rolled.otherExp;
    const rNet = rolled.rev + rolled.otherInc - rTotCost;
    const marginPct = rolled.rev > 0.005 ? ((rNet / rolled.rev) * 100).toFixed(1) : '0.0';
    const sharePct = grandTotalCost > 0.005 ? ((rTotCost / grandTotalCost) * 100).toFixed(1) : '0.0';
    const prev = previousCenters?.get(meta.id);

    return {
      ...meta,
      level,
      hasChildren,
      ownRevenue: own.rev.toFixed(2),
      ownDirectCost: own.cos.toFixed(2),
      ownOperatingExpense: own.opex.toFixed(2),
      ownOtherIncome: own.otherInc.toFixed(2),
      ownOtherExpense: own.otherExp.toFixed(2),
      ownTotalCost: ownTotCost.toFixed(2),
      ownNetContribution: ownNet.toFixed(2),
      revenue: rolled.rev.toFixed(2),
      directCost: rolled.cos.toFixed(2),
      operatingExpense: rolled.opex.toFixed(2),
      otherIncome: rolled.otherInc.toFixed(2),
      otherExpense: rolled.otherExp.toFixed(2),
      totalCost: rTotCost.toFixed(2),
      netContribution: rNet.toFixed(2),
      marginPct,
      shareOfTotalCostPct: sharePct,
      txCount: rolled.txCount,
      projectCount: rolled.projects.size,
      clientCount: rolled.clients.size,
      employeeCount: rolled.employees.size,
      ...(prev
        ? {
            comparativeRevenue: calcVar(rolled.rev, prev.revenue),
            comparativeCost: calcVar(rTotCost, prev.totalCost),
            comparativeNet: calcVar(rNet, prev.netContribution),
          }
        : {}),
    };
  };

  const rows = ordered.map((c) =>
    buildRow(
      c,
      ownMap.get(c.id)!,
      rolledMap.get(c.id)!,
      levelOf(c.id),
      (childrenMap.get(c.id)?.length ?? 0) > 0,
    ),
  );

  const uOwn = ownMap.get('UNASSIGNED')!;
  const uHasData = uOwn.txCount > 0 || Math.abs(uOwn.rev) > 0.005 || Math.abs(uOwn.cos) > 0.005 || Math.abs(uOwn.opex) > 0.005;
  if (uHasData) {
    rows.push(
      buildRow(
        {
          id: 'UNASSIGNED',
          parentId: null,
          code: 'UNASSIGNED',
          nameAr: 'حركات عامة غير مرتبطة بمركز تكلفة محدد',
          nameEn: 'Unassigned / Corporate Pool',
          ccType: 'ADMIN',
          isPosting: true,
          isActive: true,
        },
        uOwn,
        rolledMap.get('UNASSIGNED')!,
        1,
        false,
      ),
    );
  }

  const unassignedCost = uOwn.cos + uOwn.opex + uOwn.otherExp;

  return {
    rows,
    summary: {
      costCentersCount: centers.length,
      activeCostCentersCount: centers.filter((c) => c.isActive !== false).length,
      totalRevenue: totalRev.toFixed(2),
      totalDirectCost: totalCos.toFixed(2),
      totalOperatingExpense: totalOpex.toFixed(2),
      totalOtherIncome: totalOtherInc.toFixed(2),
      totalOtherExpense: totalOtherExp.toFixed(2),
      totalCost: grandTotalCost.toFixed(2),
      netContribution: grandNetProfit.toFixed(2),
      overallMarginPct: totalRev > 0.005 ? ((grandNetProfit / totalRev) * 100).toFixed(1) : '0.0',
      unassignedCost: unassignedCost.toFixed(2),
      unassignedCostPct: grandTotalCost > 0.005 ? ((unassignedCost / grandTotalCost) * 100).toFixed(1) : '0.0',
    },
  };
}

export function computeDynamicCostCentersReport(
  accounts: any[],
  postedJournals: any[],
  params: CostCenterReportParams = {},
) {
  const win = resolveReportFilterWindow(params);
  const ledger = params.ledger || 'FINANCIAL';
  const allCenters = getLocalCostCenters();
  const filteredCenters = params.ccType ? allCenters.filter((c) => c.ccType === params.ccType) : allCenters;
  const ccById = new Map(allCenters.map((c) => [c.id, c]));
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const accByCode = new Map(accounts.map((a) => [a.code, a]));
  const reclass = getReclassifications();
  const dimMatch = createLineDimMatcher(params);
  const dimResolve = createLineDimResolver();
  const ccSet = expandLocalCostCenterIds(params.costCenterId);

  const extractPnlLines = (from: string, to: string) => {
    const out: Array<any> = [];
    const sorted = [...postedJournals]
      .filter((je) => je.status === 'POSTED' && je.journalType !== 'CLOSING')
      .filter((je) => !ledger || ledger === 'ALL' || !je.ledger || je.ledger === ledger)
      .filter((je) => String(je.entryDate) >= from && String(je.entryDate) <= to)
      .sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)) || String(b.entryNo || '').localeCompare(String(a.entryNo || '')));

    for (const je of sorted) {
      for (const l of je.lines || []) {
        if (!dimMatch(l)) continue;
        const acc = accById.get(l.accountId) || accByCode.get(l.accountCode);
        if (!acc || !acc.isPosting) continue;
        const eff = resolveLocalEffectiveClassification(acc, to, reclass);
        if (!IS_SECTIONS.has(eff.statementSection)) continue;
        const d = dimResolve(l);
        out.push({
          entryId: je.id,
          entryNo: je.entryNo,
          entryDate: je.entryDate,
          sourceModule: je.sourceModule || 'ACC',
          description: l.description || je.description || '—',
          accountId: acc.id,
          accountCode: acc.code,
          accountNameAr: acc.nameAr,
          statementSection: eff.statementSection,
          costCenterId: d.costCenterId,
          projectId: d.projectId,
          projectCode: d.projectCode,
          projectName: d.projectName,
          clientId: d.clientId,
          clientName: d.clientName,
          employeeId: d.employeeId,
          employeeCode: d.employeeCode,
          employeeName: d.employeeName,
          debitBase: l.debitBase,
          creditBase: l.creditBase,
        });
      }
    }
    return out;
  };

  const pnlInputs = extractPnlLines(win.from, win.to);

  let prevMap: Map<string, { revenue: number; totalCost: number; netContribution: number }> | undefined;
  if (params.compareFrom && params.compareTo) {
    const prevLines = extractPnlLines(params.compareFrom, params.compareTo);
    const prevBuilt = buildLocalCostCenterHierarchyReport(filteredCenters, prevLines);
    prevMap = new Map(
      prevBuilt.rows.map((r: any) => [
        r.id,
        { revenue: Number(r.revenue), totalCost: Number(r.totalCost), netContribution: Number(r.netContribution) },
      ]),
    );
  }

  const hierarchyResult = buildLocalCostCenterHierarchyReport(filteredCenters, pnlInputs, prevMap);
  const visibleHierarchy = ccSet
    ? hierarchyResult.rows.filter((r: any) => ccSet.has(r.id))
    : hierarchyResult.rows;

  const ccAccMap = new Map<string, any>();
  const ccPrjMap = new Map<string, any>();
  const ccEmpMap = new Map<string, any>();

  for (const l of pnlInputs) {
    const ccKey = l.costCenterId && ccById.has(l.costCenterId) ? l.costCenterId : 'UNASSIGNED';
    const ccMeta = ccById.get(ccKey) ?? {
      id: 'UNASSIGNED',
      code: 'UNASSIGNED',
      nameAr: 'حركات عامة غير مرتبطة بمركز تكلفة محدد',
      ccType: 'ADMIN',
    };
    const dr = Number(l.debitBase || 0);
    const cr = Number(l.creditBase || 0);
    const isCreditSec = l.statementSection === 'REVENUE' || l.statementSection === 'OTHER_INCOME';
    const signedAmt = isCreditSec ? cr - dr : dr - cr;

    // Level 2: Cost Center x GL Account
    const accK = `${ccKey}::${l.accountId}`;
    const accRow = ccAccMap.get(accK) ?? {
      costCenterId: ccKey,
      costCenterCode: ccMeta.code,
      costCenterName: ccMeta.nameAr,
      ccType: ccMeta.ccType || 'DIRECT',
      accountId: l.accountId,
      accountCode: l.accountCode,
      accountNameAr: l.accountNameAr,
      statementSection: l.statementSection,
      sectionNameAr: PNL_SECTION_LABELS_AR[l.statementSection] || l.statementSection,
      debit: 0,
      credit: 0,
      netAmount: 0,
      txCount: 0,
    };
    accRow.debit += dr;
    accRow.credit += cr;
    accRow.netAmount += signedAmt;
    accRow.txCount += 1;
    ccAccMap.set(accK, accRow);

    // Level 3: Cost Center x Project / Client
    if (l.projectId || l.clientId) {
      const prjK = `${ccKey}::${l.projectId || 'NONE'}::${l.clientId || 'NONE'}`;
      const prjRow = ccPrjMap.get(prjK) ?? {
        costCenterId: ccKey,
        costCenterCode: ccMeta.code,
        costCenterName: ccMeta.nameAr,
        projectId: l.projectId,
        projectCode: l.projectCode || (l.projectId ? 'PRJ' : 'GENERAL'),
        projectName: l.projectName || 'حركات مباشرة على العميل',
        clientId: l.clientId,
        clientName: l.clientName || '—',
        revenue: 0,
        directCost: 0,
        operatingExpense: 0,
        otherNet: 0,
        txCount: 0,
      };
      if (l.statementSection === 'REVENUE') prjRow.revenue += signedAmt;
      else if (l.statementSection === 'COST_OF_SALES') prjRow.directCost += signedAmt;
      else if (l.statementSection === 'OPERATING_EXPENSES') prjRow.operatingExpense += signedAmt;
      else prjRow.otherNet += isCreditSec ? signedAmt : -signedAmt;
      prjRow.txCount += 1;
      ccPrjMap.set(prjK, prjRow);
    }

    // Level 4: Cost Center x Employee
    if (l.employeeId) {
      const empK = `${ccKey}::${l.employeeId}`;
      const empRow = ccEmpMap.get(empK) ?? {
        costCenterId: ccKey,
        costCenterCode: ccMeta.code,
        costCenterName: ccMeta.nameAr,
        employeeId: l.employeeId,
        employeeCode: l.employeeCode || 'EMP',
        employeeName: l.employeeName || 'موظف',
        revenueGenerated: 0,
        payrollAndDirectCost: 0,
        otherExpense: 0,
        txCount: 0,
        projects: new Set<string>(),
      };
      if (l.statementSection === 'REVENUE') empRow.revenueGenerated += signedAmt;
      else if (l.statementSection === 'COST_OF_SALES') empRow.payrollAndDirectCost += signedAmt;
      else if (l.statementSection === 'OPERATING_EXPENSES' || l.statementSection === 'OTHER_EXPENSES' || l.statementSection === 'ZAKAT_TAX') {
        empRow.otherExpense += signedAmt;
      }
      if (l.projectName) empRow.projects.add(l.projectName);
      empRow.txCount += 1;
      ccEmpMap.set(empK, empRow);
    }
  }

  const byAccount = Array.from(ccAccMap.values())
    .map((x) => ({
      ...x,
      debit: x.debit.toFixed(2),
      credit: x.credit.toFixed(2),
      netAmount: x.netAmount.toFixed(2),
    }))
    .sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode) || a.accountCode.localeCompare(b.accountCode));

  const byProjectAndClient = Array.from(ccPrjMap.values())
    .map((x) => {
      const totalCost = x.directCost + x.operatingExpense;
      const netProfit = x.revenue - totalCost + x.otherNet;
      const marginPct = x.revenue > 0.005 ? ((netProfit / x.revenue) * 100).toFixed(1) : '0.0';
      return {
        ...x,
        revenue: x.revenue.toFixed(2),
        directCost: x.directCost.toFixed(2),
        operatingExpense: x.operatingExpense.toFixed(2),
        totalCost: totalCost.toFixed(2),
        netProfit: netProfit.toFixed(2),
        marginPct,
      };
    })
    .sort((a, b) => Number(b.totalCost) - Number(a.totalCost));

  const byEmployee = Array.from(ccEmpMap.values())
    .map((x) => {
      const totalCost = x.payrollAndDirectCost + x.otherExpense;
      const net = x.revenueGenerated - totalCost;
      const marginPct = x.revenueGenerated > 0.005 ? ((net / x.revenueGenerated) * 100).toFixed(1) : '0.0';
      return {
        costCenterId: x.costCenterId,
        costCenterCode: x.costCenterCode,
        costCenterName: x.costCenterName,
        employeeId: x.employeeId,
        employeeCode: x.employeeCode,
        employeeName: x.employeeName,
        revenueGenerated: x.revenueGenerated.toFixed(2),
        payrollAndDirectCost: x.payrollAndDirectCost.toFixed(2),
        otherExpense: x.otherExpense.toFixed(2),
        totalCost: totalCost.toFixed(2),
        netContribution: net.toFixed(2),
        marginPct,
        projectNames: Array.from(x.projects),
        txCount: x.txCount,
      };
    })
    .sort((a, b) => Number(b.totalCost) - Number(a.totalCost));

  const movements = pnlInputs.slice(0, 300).map((l) => {
    const ccMeta = (l.costCenterId && ccById.get(l.costCenterId)) || null;
    const isCreditSec = l.statementSection === 'REVENUE' || l.statementSection === 'OTHER_INCOME';
    const pnlImpact = isCreditSec
      ? Number(l.creditBase || 0) - Number(l.debitBase || 0)
      : Number(l.debitBase || 0) - Number(l.creditBase || 0);
    return {
      entryId: l.entryId,
      entryNo: l.entryNo,
      entryDate: l.entryDate,
      sourceModule: l.sourceModule,
      accountId: l.accountId,
      accountCode: l.accountCode,
      accountNameAr: l.accountNameAr,
      statementSection: l.statementSection,
      statementSectionAr: PNL_SECTION_LABELS_AR[l.statementSection] || l.statementSection,
      costCenterId: l.costCenterId || 'UNASSIGNED',
      costCenterCode: ccMeta?.code || 'UNASSIGNED',
      costCenterName: ccMeta?.nameAr || 'حركات عامة غير مرتبطة بمركز تكلفة محدد',
      projectName: l.projectName || '—',
      clientName: l.clientName || '—',
      employeeName: l.employeeName || '—',
      description: l.description || '—',
      debitBase: Number(l.debitBase || 0).toFixed(2),
      creditBase: Number(l.creditBase || 0).toFixed(2),
      amount: pnlImpact.toFixed(2),
    };
  });

  const isRef = computeDynamicIncomeStatement(accounts, postedJournals, {
    from: win.from,
    to: win.to,
    ledger,
    branchId: params.branchId,
    departmentId: params.departmentId,
    projectId: params.projectId,
    clientId: params.clientId,
    employeeId: params.employeeId,
    costCenterId: params.costCenterId,
  });

  const isNet = Number(isRef.netProfit || 0);
  const ccNet = Number(hierarchyResult.summary.netContribution || 0);
  const diff = Number((isNet - ccNet).toFixed(2));

  return {
    period: {
      from: win.from,
      to: win.to,
      periodId: win.periodId,
      periodName: win.periodName,
      ledger,
      compareFrom: params.compareFrom || null,
      compareTo: params.compareTo || null,
    },
    summary: hierarchyResult.summary,
    reconciliation: {
      incomeStatementNetProfit: isNet.toFixed(2),
      costCentersNetContribution: ccNet.toFixed(2),
      difference: diff.toFixed(2),
      reconciled: Math.abs(diff) < 0.05,
    },
    hierarchy: visibleHierarchy,
    byAccount,
    byProjectAndClient,
    byEmployee,
    movements,
  };
}

export function computeDynamicMultiLevelReportsOverview(
  accounts: any[],
  postedJournals: any[],
  params: CostCenterReportParams = {},
) {
  const win = resolveReportFilterWindow(params);
  const ledger = params.ledger || 'FINANCIAL';
  const ccReport = computeDynamicCostCentersReport(accounts, postedJournals, params);
  const isStmt = computeDynamicIncomeStatement(accounts, postedJournals, {
    from: win.from,
    to: win.to,
    compareFrom: params.compareFrom,
    compareTo: params.compareTo,
    ledger,
    branchId: params.branchId,
    costCenterId: params.costCenterId,
    departmentId: params.departmentId,
    projectId: params.projectId,
    clientId: params.clientId,
    employeeId: params.employeeId,
  });
  const bsStmt = computeDynamicBalanceSheet(accounts, postedJournals, {
    asOf: win.to,
    ledger,
    branchId: params.branchId,
    costCenterId: params.costCenterId,
    departmentId: params.departmentId,
    projectId: params.projectId,
    clientId: params.clientId,
    employeeId: params.employeeId,
  });
  const tb = computeDynamicTrialBalance(accounts, postedJournals, {
    from: win.from,
    to: win.to,
    ledger,
    branchId: params.branchId,
    costCenterId: params.costCenterId,
    departmentId: params.departmentId,
    projectId: params.projectId,
    clientId: params.clientId,
    employeeId: params.employeeId,
  });

  return {
    period: ccReport.period,
    companyLevel: {
      revenue: Number(isStmt.revenue || 0).toFixed(2),
      directCost: Number(isStmt.directCost || 0).toFixed(2),
      grossProfit: Number(isStmt.grossProfit || 0).toFixed(2),
      operatingExpenses: Number(isStmt.operatingExpenses || 0).toFixed(2),
      netProfit: Number(isStmt.netProfit || 0).toFixed(2),
      totalAssets: Number(bsStmt.assets?.total ?? 0).toFixed(2),
      totalLiabilities: Number(bsStmt.liabilities?.total ?? 0).toFixed(2),
      totalEquity: (Number(bsStmt.equity?.total ?? 0) + Number(bsStmt.currentEarnings ?? 0)).toFixed(2),
      trialBalanceBalanced: Boolean(tb.balanced),
      ...((isStmt as any).comparative ? { comparative: (isStmt as any).comparative } : {}),
    },
    costCentersLevel: {
      summary: ccReport.summary,
      reconciliation: ccReport.reconciliation,
      rows: ccReport.hierarchy,
    },
    projectsLevel: ccReport.byProjectAndClient,
    employeesLevel: ccReport.byEmployee,
    accountsLevel: ccReport.byAccount,
  };
}
