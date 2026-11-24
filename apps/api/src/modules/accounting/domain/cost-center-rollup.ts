/**
 * Pure Domain Engine for Multi-Level Cost Center Hierarchy & Reconciliation
 * Guarantees:
 *  - Unlimited parent -> child rollup without double-counting leaf P&L lines
 *  - Reconciles 100% of Cost Center P&L + Unassigned bucket against GL Income Statement Net Profit
 */

import { D, Decimal } from '../../../shared/money';
import { calcVariance } from './financial-statements';

export interface CostCenterMeta {
  id: string;
  parentId: string | null;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  ccType: 'DIRECT' | 'INDIRECT' | 'ADMIN' | string;
  isPosting: boolean;
  isActive: boolean;
}

export interface CostCenterLineInput {
  costCenterId: string | null;
  statementSection: string;
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  debitBase: number | string;
  creditBase: number | string;
  projectId?: string | null;
  clientId?: string | null;
  employeeId?: string | null;
}

export interface RolledCostCenterNode extends CostCenterMeta {
  level: number;
  ownRevenue: string;
  ownDirectCost: string;
  ownOperatingExpense: string;
  ownOtherIncome: string;
  ownOtherExpense: string;
  ownTotalCost: string;
  ownNetContribution: string;
  revenue: string;
  directCost: string;
  operatingExpense: string;
  otherIncome: string;
  otherExpense: string;
  totalCost: string;
  netContribution: string;
  marginPct: string;
  shareOfTotalCostPct: string;
  txCount: number;
  projectCount: number;
  clientCount: number;
  employeeCount: number;
  hasChildren: boolean;
}

interface MutableAgg {
  rev: Decimal;
  cos: Decimal;
  opex: Decimal;
  otherInc: Decimal;
  otherExp: Decimal;
  txCount: number;
  projects: Set<string>;
  clients: Set<string>;
  employees: Set<string>;
}

const emptyAgg = (): MutableAgg => ({
  rev: D(0),
  cos: D(0),
  opex: D(0),
  otherInc: D(0),
  otherExp: D(0),
  txCount: 0,
  projects: new Set(),
  clients: new Set(),
  employees: new Set(),
});

/** Collects a Cost Center ID and all its descendant IDs safely (cycle-guarded). */
export function expandCostCenterTreeIds(rootId: string, centers: CostCenterMeta[]): string[] {
  const childrenMap = new Map<string, string[]>();
  for (const c of centers) {
    if (c.parentId) {
      const list = childrenMap.get(c.parentId) ?? [];
      list.push(c.id);
      childrenMap.set(c.parentId, list);
    }
  }
  const res: string[] = [];
  const visited = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    res.push(cur);
    for (const ch of childrenMap.get(cur) ?? []) {
      if (!visited.has(ch)) stack.push(ch);
    }
  }
  return res;
}

export function buildCostCenterHierarchyReport(
  centers: CostCenterMeta[],
  lines: CostCenterLineInput[],
  previousCenters?: Map<string, { revenue: number; totalCost: number; netContribution: number }>,
) {
  const byId = new Map(centers.map((c) => [c.id, c]));
  const childrenMap = new Map<string | null, CostCenterMeta[]>();
  for (const c of centers) {
    const pid = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    const arr = childrenMap.get(pid) ?? [];
    arr.push(c);
    childrenMap.set(pid, arr);
  }
  for (const [, arr] of childrenMap) {
    arr.sort((a, b) => a.code.localeCompare(b.code));
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

  // Own direct aggregations (only actual P&L lines touching this cost center or UNASSIGNED)
  const ownMap = new Map<string, MutableAgg>();
  for (const c of centers) ownMap.set(c.id, emptyAgg());
  ownMap.set('UNASSIGNED', emptyAgg());

  for (const l of lines) {
    const key = l.costCenterId && ownMap.has(l.costCenterId) ? l.costCenterId : 'UNASSIGNED';
    const agg = ownMap.get(key)!;
    const dr = D(l.debitBase || 0);
    const cr = D(l.creditBase || 0);

    switch (l.statementSection) {
      case 'REVENUE':
        agg.rev = agg.rev.plus(cr.minus(dr));
        break;
      case 'COST_OF_SALES':
        agg.cos = agg.cos.plus(dr.minus(cr));
        break;
      case 'OPERATING_EXPENSES':
        agg.opex = agg.opex.plus(dr.minus(cr));
        break;
      case 'OTHER_INCOME':
        agg.otherInc = agg.otherInc.plus(cr.minus(dr));
        break;
      case 'OTHER_EXPENSES':
      case 'ZAKAT_TAX':
        agg.otherExp = agg.otherExp.plus(dr.minus(cr));
        break;
      default:
        continue; // Non-P&L BS line is excluded from Cost Center P&L (Assets/Liabilities don't alter Net Profit)
    }

    agg.txCount += 1;
    if (l.projectId) agg.projects.add(l.projectId);
    if (l.clientId) agg.clients.add(l.clientId);
    if (l.employeeId) agg.employees.add(l.employeeId);
  }

  // Roll up through ancestors without double-counting
  const rolledMap = new Map<string, MutableAgg>();
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
      r.rev = r.rev.plus(own.rev);
      r.cos = r.cos.plus(own.cos);
      r.opex = r.opex.plus(own.opex);
      r.otherInc = r.otherInc.plus(own.otherInc);
      r.otherExp = r.otherExp.plus(own.otherExp);
      r.txCount += own.txCount;
      own.projects.forEach((x) => r.projects.add(x));
      own.clients.forEach((x) => r.clients.add(x));
      own.employees.forEach((x) => r.employees.add(x));
      cur = byId.get(cur)?.parentId ?? null;
    }
  }

  // Compute global totals from ONLY ownMap (each line counted strictly ONCE -> exact reconciliation!)
  let totalRev = D(0);
  let totalCos = D(0);
  let totalOpex = D(0);
  let totalOtherInc = D(0);
  let totalOtherExp = D(0);
  for (const own of ownMap.values()) {
    totalRev = totalRev.plus(own.rev);
    totalCos = totalCos.plus(own.cos);
    totalOpex = totalOpex.plus(own.opex);
    totalOtherInc = totalOtherInc.plus(own.otherInc);
    totalOtherExp = totalOtherExp.plus(own.otherExp);
  }
  const grandTotalCost = totalCos.plus(totalOpex).plus(totalOtherExp);
  const grandNetProfit = totalRev.plus(totalOtherInc).minus(grandTotalCost);

  const ordered: CostCenterMeta[] = [];
  const walk = (pid: string | null) => {
    for (const c of childrenMap.get(pid) ?? []) {
      ordered.push(c);
      walk(c.id);
    }
  };
  walk(null);

  const buildRow = (meta: CostCenterMeta, own: MutableAgg, rolled: MutableAgg, level: number, hasChildren: boolean) => {
    const ownTotCost = own.cos.plus(own.opex).plus(own.otherExp);
    const ownNet = own.rev.plus(own.otherInc).minus(ownTotCost);
    const rTotCost = rolled.cos.plus(rolled.opex).plus(rolled.otherExp);
    const rNet = rolled.rev.plus(rolled.otherInc).minus(rTotCost);
    const marginPct = rolled.rev.gt(0) ? rNet.div(rolled.rev).times(100).toFixed(1) : '0.0';
    const sharePct = grandTotalCost.gt(0) ? rTotCost.div(grandTotalCost).times(100).toFixed(1) : '0.0';
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
            comparativeRevenue: calcVariance(rolled.rev, D(prev.revenue)),
            comparativeCost: calcVariance(rTotCost, D(prev.totalCost)),
            comparativeNet: calcVariance(rNet, D(prev.netContribution)),
          }
        : {}),
    };
  };

  const rows: RolledCostCenterNode[] = ordered.map((c) =>
    buildRow(
      c,
      ownMap.get(c.id)!,
      rolledMap.get(c.id)!,
      levelOf(c.id),
      (childrenMap.get(c.id)?.length ?? 0) > 0,
    ),
  );

  const uOwn = ownMap.get('UNASSIGNED')!;
  const uHasData = uOwn.txCount > 0 || !uOwn.rev.isZero() || !uOwn.cos.isZero() || !uOwn.opex.isZero();
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

  const unassignedCost = uOwn.cos.plus(uOwn.opex).plus(uOwn.otherExp);

  return {
    rows,
    summary: {
      costCentersCount: centers.length,
      activeCostCentersCount: centers.filter((c) => c.isActive).length,
      totalRevenue: totalRev.toFixed(2),
      totalDirectCost: totalCos.toFixed(2),
      totalOperatingExpense: totalOpex.toFixed(2),
      totalOtherIncome: totalOtherInc.toFixed(2),
      totalOtherExpense: totalOtherExp.toFixed(2),
      totalCost: grandTotalCost.toFixed(2),
      netContribution: grandNetProfit.toFixed(2),
      overallMarginPct: totalRev.gt(0) ? grandNetProfit.div(totalRev).times(100).toFixed(1) : '0.0',
      unassignedCost: unassignedCost.toFixed(2),
      unassignedCostPct: grandTotalCost.gt(0) ? unassignedCost.div(grandTotalCost).times(100).toFixed(1) : '0.0',
    },
  };
}
