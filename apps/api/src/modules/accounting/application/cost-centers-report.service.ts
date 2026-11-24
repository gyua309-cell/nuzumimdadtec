import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError } from '../../../shared/errors';
import { D, Decimal } from '../../../shared/money';
import {
  AccountReclassificationRecord,
  calcVariance,
  CoaAccountMeta,
  IS_SECTIONS,
  resolveEffectiveClassification,
  SECTION_LABELS_AR,
} from '../domain/financial-statements';
import {
  buildCostCenterHierarchyReport,
  CostCenterMeta,
  expandCostCenterTreeIds,
} from '../domain/cost-center-rollup';
import { Ledger, LedgerService } from './ledger.service';

export interface CostCenterReportFilter {
  periodId?: string;
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
  ledger?: Ledger;
  costCenterId?: string;
  ccType?: string;
  branchId?: string;
  departmentId?: string;
  projectId?: string;
  clientId?: string;
  employeeId?: string;
}

interface RawPostedPnlRow {
  entryId: string;
  entryNo: string;
  entryDate: string;
  description: string | null;
  sourceModule: string | null;
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  costCenterId: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  clientId: string | null;
  clientCode: string | null;
  clientName: string | null;
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  branchId: string | null;
  departmentId: string | null;
  debitBase: string;
  creditBase: string;
}

@Injectable()
export class CostCentersReportService {
  constructor(
    private readonly db: DbService,
    private readonly ledger: LedgerService,
  ) {}

  private async resolveDateWindow(
    companyId: string,
    q: CostCenterReportFilter,
  ): Promise<{ from: string; to: string; periodName?: string }> {
    if (q.periodId && (!q.from || !q.to)) {
      const p = await this.db.one<{ start_date: string; end_date: string; name: string }>(
        `SELECT start_date::text, end_date::text, name
           FROM core.fiscal_periods
          WHERE company_id = $1 AND id = $2`,
        [companyId, q.periodId],
      );
      if (p) {
        return {
          from: q.from || p.start_date,
          to: q.to || p.end_date,
          periodName: p.name,
        };
      }
    }
    const nowYear = new Date().getUTCFullYear();
    const from = q.from || `${nowYear}-01-01`;
    const to = q.to || new Date().toISOString().slice(0, 10);
    if (from > to) throw new DomainError('INVALID_DATE_RANGE');
    return { from, to };
  }

  private async queryPostedLinesWindow(
    companyId: string,
    from: string,
    to: string,
    ledger: Ledger,
    dims: {
      costCenterIds?: string[];
      branchId?: string;
      departmentId?: string;
      projectId?: string;
      clientId?: string;
      employeeId?: string;
    },
  ): Promise<RawPostedPnlRow[]> {
    const params: unknown[] = [companyId, from, to, ledger];
    const conds: string[] = [
      `l.company_id = $1`,
      `e.status = 'POSTED'`,
      `e.ledger = $4`,
      `e.journal_type <> 'CLOSING'`,
      `e.entry_date BETWEEN $2::date AND $3::date`,
    ];

    const effCcExpr = `COALESCE(l.cost_center_id, p.cost_center_id, emp_ja.cost_center_id, d.default_cost_center_id)`;
    const effClientExpr = `COALESCE(l.client_id, p.client_id)`;

    if (dims.costCenterIds?.length) {
      params.push(dims.costCenterIds);
      conds.push(`${effCcExpr} = ANY($${params.length}::uuid[])`);
    }
    if (dims.branchId) {
      params.push(dims.branchId);
      conds.push(`COALESCE(l.branch_id, p.branch_id, emp_ja.branch_id) = $${params.length}`);
    }
    if (dims.departmentId) {
      params.push(dims.departmentId);
      conds.push(`COALESCE(l.department_id, emp_ja.department_id) = $${params.length}`);
    }
    if (dims.projectId) {
      params.push(dims.projectId);
      conds.push(`l.project_id = $${params.length}`);
    }
    if (dims.clientId) {
      params.push(dims.clientId);
      conds.push(`${effClientExpr} = $${params.length}`);
    }
    if (dims.employeeId) {
      params.push(dims.employeeId);
      conds.push(`l.employee_id = $${params.length}`);
    }

    return this.db.query<RawPostedPnlRow>(
      `SELECT e.id AS "entryId",
              e.entry_no AS "entryNo",
              e.entry_date::text AS "entryDate",
              COALESCE(l.description, e.description) AS description,
              e.source_module AS "sourceModule",
              a.id AS "accountId",
              a.code AS "accountCode",
              a.name_ar AS "accountNameAr",
              ${effCcExpr} AS "costCenterId",
              l.project_id AS "projectId",
              p.code AS "projectCode",
              p.name_ar AS "projectName",
              ${effClientExpr} AS "clientId",
              c.code AS "clientCode",
              c.name_ar AS "clientName",
              l.employee_id AS "employeeId",
              emp.code AS "employeeCode",
              emp.full_name_ar AS "employeeName",
              COALESCE(l.branch_id, p.branch_id, emp_ja.branch_id) AS "branchId",
              COALESCE(l.department_id, emp_ja.department_id) AS "departmentId",
              l.debit_base::text AS "debitBase",
              l.credit_base::text AS "creditBase"
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
         JOIN acc.accounts a ON a.id = l.account_id
         LEFT JOIN prj.projects p ON p.id = l.project_id AND p.company_id = l.company_id
         LEFT JOIN LATERAL (
           SELECT ja.cost_center_id, ja.branch_id, ja.department_id
             FROM hr.employee_job_assignments ja
            WHERE ja.company_id = l.company_id
              AND ja.employee_id = l.employee_id
              AND ja.effective_from <= e.entry_date
              AND (ja.effective_to IS NULL OR ja.effective_to >= e.entry_date)
            ORDER BY ja.effective_from DESC
            LIMIT 1
         ) emp_ja ON l.employee_id IS NOT NULL
         LEFT JOIN core.departments d ON d.id = COALESCE(l.department_id, emp_ja.department_id) AND d.company_id = l.company_id
         LEFT JOIN prj.clients c ON c.id = ${effClientExpr} AND c.company_id = l.company_id
         LEFT JOIN hr.employees emp ON emp.id = l.employee_id AND emp.company_id = l.company_id
        WHERE ${conds.join(' AND ')}
        ORDER BY e.entry_date DESC, e.entry_no DESC, l.line_no ASC`,
      params,
    );
  }

  async costCentersReport(companyId: string, q: CostCenterReportFilter) {
    const win = await this.resolveDateWindow(companyId, q);
    const ledger = q.ledger ?? 'FINANCIAL';

    const [centers, accounts, reclassifications] = await Promise.all([
      this.db.query<CostCenterMeta>(
        `SELECT id, parent_id AS "parentId", code, name_ar AS "nameAr", name_en AS "nameEn",
                cc_type AS "ccType", is_posting AS "isPosting", is_active AS "isActive"
           FROM core.cost_centers
          WHERE company_id = $1
          ORDER BY code ASC`,
        [companyId],
      ),
      this.db.query<CoaAccountMeta>(
        `SELECT id, parent_id AS "parentId", code, name_ar AS "nameAr", name_en AS "nameEn",
                account_class AS "accountClass", subtype, normal_balance AS "normalBalance",
                is_contra AS "isContra", is_posting AS "isPosting", is_active AS "isActive", level,
                statement_section AS "statementSection", statement_line_id AS "statementLineId",
                equity_line_id AS "equityLineId", cash_flow_category AS "cashFlowCategory"
           FROM acc.accounts WHERE company_id = $1`,
        [companyId],
      ),
      this.db.query<AccountReclassificationRecord>(
        `SELECT account_id AS "accountId", effective_from::text AS "effectiveFrom", changed_at::text AS "changedAt",
                old_statement_section AS "oldStatementSection", new_statement_section AS "newStatementSection",
                old_statement_line_id AS "oldStatementLineId", new_statement_line_id AS "newStatementLineId",
                old_equity_line_id AS "oldEquityLineId", new_equity_line_id AS "newEquityLineId",
                old_cash_flow_category AS "oldCashFlowCategory", new_cash_flow_category AS "newCashFlowCategory"
           FROM acc.account_reclassifications WHERE company_id = $1`,
        [companyId],
      ),
    ]);

    const filteredCenters = q.ccType ? centers.filter((c) => c.ccType === q.ccType) : centers;
    const costCenterIds = q.costCenterId
      ? expandCostCenterTreeIds(q.costCenterId, centers)
      : undefined;

    const ccById = new Map(centers.map((c) => [c.id, c]));
    const accById = new Map(accounts.map((a) => [a.id, a]));

    const rawLines = await this.queryPostedLinesWindow(companyId, win.from, win.to, ledger, {
      costCenterIds,
      branchId: q.branchId,
      departmentId: q.departmentId,
      projectId: q.projectId,
      clientId: q.clientId,
      employeeId: q.employeeId,
    });

    const classify = (accountId: string, asOfDate: string) => {
      const acc = accById.get(accountId);
      if (!acc || !acc.isPosting) return null;
      const eff = resolveEffectiveClassification(acc, asOfDate, reclassifications);
      return eff.statementSection;
    };

    const toPnlInputs = (rows: RawPostedPnlRow[], asOfDate: string) => {
      const out: Array<RawPostedPnlRow & { statementSection: string }> = [];
      for (const l of rows) {
        const sec = classify(l.accountId, asOfDate);
        if (sec && IS_SECTIONS.has(sec)) {
          out.push({ ...l, statementSection: sec });
        }
      }
      return out;
    };

    const pnlInputs = toPnlInputs(rawLines, win.to);

    // Optional comparative period
    let prevMap: Map<string, { revenue: number; totalCost: number; netContribution: number }> | undefined;
    if (q.compareFrom && q.compareTo) {
      const prevLines = await this.queryPostedLinesWindow(companyId, q.compareFrom, q.compareTo, ledger, {
        costCenterIds,
        branchId: q.branchId,
        departmentId: q.departmentId,
        projectId: q.projectId,
        clientId: q.clientId,
        employeeId: q.employeeId,
      });
      const prevPnl = toPnlInputs(prevLines, q.compareTo);
      const prevBuilt = buildCostCenterHierarchyReport(filteredCenters, prevPnl);
      prevMap = new Map(
        prevBuilt.rows.map((r) => [
          r.id,
          { revenue: Number(r.revenue), totalCost: Number(r.totalCost), netContribution: Number(r.netContribution) },
        ]),
      );
    }

    const hierarchyResult = buildCostCenterHierarchyReport(filteredCenters, pnlInputs, prevMap);
    const visibleHierarchy = q.costCenterId
      ? hierarchyResult.rows.filter((r) => costCenterIds?.includes(r.id))
      : hierarchyResult.rows;

    // Level 2: Cost Center x GL Account breakdown
    const ccAccMap = new Map<string, {
      costCenterId: string; costCenterCode: string; costCenterName: string; ccType: string;
      accountId: string; accountCode: string; accountNameAr: string; statementSection: string;
      debit: Decimal; credit: Decimal; netAmount: Decimal; txCount: number;
    }>();

    // Level 3: Cost Center x Project / Client breakdown
    const ccPrjMap = new Map<string, {
      costCenterId: string; costCenterCode: string; costCenterName: string;
      projectId: string | null; projectCode: string; projectName: string;
      clientId: string | null; clientName: string;
      revenue: Decimal; directCost: Decimal; operatingExpense: Decimal; otherNet: Decimal; txCount: number;
    }>();

    // Level 4: Cost Center x Employee breakdown
    const ccEmpMap = new Map<string, {
      costCenterId: string; costCenterCode: string; costCenterName: string;
      employeeId: string; employeeCode: string; employeeName: string;
      revenueGenerated: Decimal; payrollAndDirectCost: Decimal; otherExpense: Decimal; txCount: number;
      projects: Set<string>;
    }>();

    for (const l of pnlInputs) {
      const ccKey = l.costCenterId && ccById.has(l.costCenterId) ? l.costCenterId : 'UNASSIGNED';
      const ccMeta = ccById.get(ccKey) ?? {
        id: 'UNASSIGNED', code: 'UNASSIGNED', nameAr: 'حركات عامة غير مرتبطة بمركز تكلفة', ccType: 'ADMIN',
      };
      const dr = D(l.debitBase);
      const cr = D(l.creditBase);
      const isCreditSec = l.statementSection === 'REVENUE' || l.statementSection === 'OTHER_INCOME';
      const signedAmt = isCreditSec ? cr.minus(dr) : dr.minus(cr);

      // Level 2
      const accK = `${ccKey}::${l.accountId}`;
      const existingAcc = ccAccMap.get(accK) ?? {
        costCenterId: ccKey,
        costCenterCode: ccMeta.code,
        costCenterName: ccMeta.nameAr,
        ccType: ccMeta.ccType,
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountNameAr: l.accountNameAr,
        statementSection: l.statementSection,
        debit: D(0),
        credit: D(0),
        netAmount: D(0),
        txCount: 0,
      };
      existingAcc.debit = existingAcc.debit.plus(dr);
      existingAcc.credit = existingAcc.credit.plus(cr);
      existingAcc.netAmount = existingAcc.netAmount.plus(signedAmt);
      existingAcc.txCount += 1;
      ccAccMap.set(accK, existingAcc);

      // Level 3
      if (l.projectId || l.clientId) {
        const prjK = `${ccKey}::${l.projectId || 'NONE'}::${l.clientId || 'NONE'}`;
        const existingPrj = ccPrjMap.get(prjK) ?? {
          costCenterId: ccKey,
          costCenterCode: ccMeta.code,
          costCenterName: ccMeta.nameAr,
          projectId: l.projectId,
          projectCode: l.projectCode || (l.projectId ? 'PRJ' : 'GENERAL'),
          projectName: l.projectName || 'حركات مباشرة على العميل',
          clientId: l.clientId,
          clientName: l.clientName || '—',
          revenue: D(0),
          directCost: D(0),
          operatingExpense: D(0),
          otherNet: D(0),
          txCount: 0,
        };
        if (l.statementSection === 'REVENUE') existingPrj.revenue = existingPrj.revenue.plus(signedAmt);
        else if (l.statementSection === 'COST_OF_SALES') existingPrj.directCost = existingPrj.directCost.plus(signedAmt);
        else if (l.statementSection === 'OPERATING_EXPENSES') existingPrj.operatingExpense = existingPrj.operatingExpense.plus(signedAmt);
        else existingPrj.otherNet = existingPrj.otherNet.plus(isCreditSec ? signedAmt : signedAmt.negated());
        existingPrj.txCount += 1;
        ccPrjMap.set(prjK, existingPrj);
      }

      // Level 4
      if (l.employeeId) {
        const empK = `${ccKey}::${l.employeeId}`;
        const existingEmp = ccEmpMap.get(empK) ?? {
          costCenterId: ccKey,
          costCenterCode: ccMeta.code,
          costCenterName: ccMeta.nameAr,
          employeeId: l.employeeId,
          employeeCode: l.employeeCode || 'EMP',
          employeeName: l.employeeName || 'موظف',
          revenueGenerated: D(0),
          payrollAndDirectCost: D(0),
          otherExpense: D(0),
          txCount: 0,
          projects: new Set<string>(),
        };
        if (l.statementSection === 'REVENUE') existingEmp.revenueGenerated = existingEmp.revenueGenerated.plus(signedAmt);
        else if (l.statementSection === 'COST_OF_SALES') existingEmp.payrollAndDirectCost = existingEmp.payrollAndDirectCost.plus(signedAmt);
        else if (l.statementSection === 'OPERATING_EXPENSES' || l.statementSection === 'OTHER_EXPENSES') existingEmp.otherExpense = existingEmp.otherExpense.plus(signedAmt);
        if (l.projectName) existingEmp.projects.add(l.projectName);
        existingEmp.txCount += 1;
        ccEmpMap.set(empK, existingEmp);
      }
    }

    const byAccount = Array.from(ccAccMap.values())
      .map((x) => ({
        ...x,
        sectionNameAr: SECTION_LABELS_AR[x.statementSection]?.nameAr || x.statementSection,
        debit: x.debit.toFixed(2),
        credit: x.credit.toFixed(2),
        netAmount: x.netAmount.toFixed(2),
      }))
      .sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode) || a.accountCode.localeCompare(b.accountCode));

    const byProjectAndClient = Array.from(ccPrjMap.values())
      .map((x) => {
        const totalCost = x.directCost.plus(x.operatingExpense);
        const netProfit = x.revenue.minus(totalCost).plus(x.otherNet);
        const marginPct = x.revenue.gt(0) ? netProfit.div(x.revenue).times(100).toFixed(1) : '0.0';
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
        const totalCost = x.payrollAndDirectCost.plus(x.otherExpense);
        const net = x.revenueGenerated.minus(totalCost);
        const marginPct = x.revenueGenerated.gt(0) ? net.div(x.revenueGenerated).times(100).toFixed(1) : '0.0';
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
        ? D(l.creditBase).minus(l.debitBase)
        : D(l.debitBase).minus(l.creditBase);
      return {
        entryId: l.entryId,
        entryNo: l.entryNo,
        entryDate: l.entryDate,
        sourceModule: l.sourceModule,
        accountId: l.accountId,
        accountCode: l.accountCode,
        accountNameAr: l.accountNameAr,
        statementSection: l.statementSection,
        statementSectionAr: SECTION_LABELS_AR[l.statementSection]?.nameAr || l.statementSection,
        costCenterId: l.costCenterId || 'UNASSIGNED',
        costCenterCode: ccMeta?.code || 'UNASSIGNED',
        costCenterName: ccMeta?.nameAr || 'حركات عامة غير مرتبطة بمركز تكلفة',
        projectName: l.projectName || '—',
        clientName: l.clientName || '—',
        employeeName: l.employeeName || '—',
        description: l.description || '—',
        debitBase: D(l.debitBase).toFixed(2),
        creditBase: D(l.creditBase).toFixed(2),
        amount: pnlImpact.toFixed(2),
      };
    });

    // Reconcile against Income Statement directly when unconstrained by ccType
    const isRef = await this.ledger.incomeStatement(companyId, {
      from: win.from,
      to: win.to,
      ledger,
      branchId: q.branchId,
      departmentId: q.departmentId,
      projectId: q.projectId,
      clientId: q.clientId,
      employeeId: q.employeeId,
      costCenterId: q.costCenterId,
    });
    const isNet = D(isRef.netProfit);
    const ccNet = D(hierarchyResult.summary.netContribution);
    const diff = isNet.minus(ccNet);

    return {
      period: {
        from: win.from,
        to: win.to,
        periodId: q.periodId || null,
        periodName: win.periodName || null,
        ledger,
        compareFrom: q.compareFrom || null,
        compareTo: q.compareTo || null,
      },
      summary: hierarchyResult.summary,
      reconciliation: {
        incomeStatementNetProfit: isNet.toFixed(2),
        costCentersNetContribution: ccNet.toFixed(2),
        difference: diff.toFixed(2),
        reconciled: diff.abs().lessThan(0.05),
      },
      hierarchy: visibleHierarchy,
      byAccount,
      byProjectAndClient,
      byEmployee,
      movements,
    };
  }

  async multiLevelOverview(companyId: string, q: CostCenterReportFilter) {
    const win = await this.resolveDateWindow(companyId, q);
    const [ccReport, isStmt, bsStmt, tb] = await Promise.all([
      this.costCentersReport(companyId, q),
      this.ledger.incomeStatement(companyId, {
        from: win.from,
        to: win.to,
        compareFrom: q.compareFrom,
        compareTo: q.compareTo,
        ledger: q.ledger ?? 'FINANCIAL',
        branchId: q.branchId,
        costCenterId: q.costCenterId,
        departmentId: q.departmentId,
        projectId: q.projectId,
        clientId: q.clientId,
        employeeId: q.employeeId,
      }),
      this.ledger.balanceSheet(companyId, {
        asOf: win.to,
        ledger: q.ledger ?? 'FINANCIAL',
        branchId: q.branchId,
        costCenterId: q.costCenterId,
        departmentId: q.departmentId,
        projectId: q.projectId,
        clientId: q.clientId,
        employeeId: q.employeeId,
      }),
      this.ledger.trialBalance(companyId, {
        from: win.from,
        to: win.to,
        ledger: q.ledger ?? 'FINANCIAL',
        branchId: q.branchId,
        costCenterId: q.costCenterId,
        departmentId: q.departmentId,
        projectId: q.projectId,
        clientId: q.clientId,
        employeeId: q.employeeId,
      }),
    ]);

    return {
      period: ccReport.period,
      companyLevel: {
        revenue: Number(isStmt.revenue).toFixed(2),
        directCost: Number(isStmt.directCost).toFixed(2),
        grossProfit: Number(isStmt.grossProfit).toFixed(2),
        operatingExpenses: Number(isStmt.operatingExpenses).toFixed(2),
        netProfit: Number(isStmt.netProfit).toFixed(2),
        totalAssets: Number(bsStmt.assets?.total ?? 0).toFixed(2),
        totalLiabilities: Number(bsStmt.liabilities?.total ?? 0).toFixed(2),
        totalEquity: (Number(bsStmt.equity?.total ?? 0) + Number(bsStmt.currentEarnings ?? 0)).toFixed(2),
        trialBalanceBalanced: tb.balanced,
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
}
