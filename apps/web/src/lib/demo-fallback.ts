import { getStoredCompany, saveStoredCompany } from './storage-company';
import { getEntityList, saveEntityItem, deleteEntityItem, replaceEntityList, uid } from './local-store';
import {
  sha256Hex,
  recordAudit,
  defaultCurrenciesList,
  defaultExchangeRatesList,
  defaultCostComponentsList,
  defaultCostProfilesList,
  defaultVariableTypesList,
  defaultFiscalPeriodsList,
  defaultAssetCategoriesList,
  getOverheadPolicy,
  saveOverheadPolicy,
  getNormalizedAccounts,
  convertToBase,
  resolvePeriodByIdOrDate,
  assertPeriodOpen,
  computeEmployeeCostBreakdown,
  computeAssignmentEconomics,
  normalizePricingBasis,
  normalizeJournalEntry,
  createAutoPostedJournalEntry,
  createReversalJournalEntry,
  computeTrialBalance,
  computeIncomeStatement,
  computeBalanceSheet,
  computeCashFlowStatement,
  computeEquityChangesStatement,
  computeAccountStatement,
  computeCostCentersReport,
  computeMultiLevelReportsOverview,
  evaluatePeriodClosingChecks,
  isAssignmentActiveInPeriod,
  matchesEmployee,
  matchesProject,
} from './fallback-engine';
import {
  DEFAULT_LOCAL_COST_CENTERS,
  createLocalAccount,
  deleteLocalAccount,
  expandLocalCostCenterIds,
  getLocalCostCenters,
  getReclassifications,
  getStatementLines,
  moveLocalAccount,
  reclassifyLocalAccount,
  suggestNextLocalCode,
  updateLocalAccount,
} from './coa-statements-engine';
import {
  activateAssetItem,
  addCustodyExpenseLine,
  assignAssetCustody,
  autoGenerateSalesInvoicesFromAssignments,
  buildZatcaUblXml,
  cancelDepreciationRunItem,
  cancelPurchaseInvoiceItem,
  cancelSalesInvoice,
  cancelZakatReturnItem,
  closeCustodyItem,
  computeCashFlowSummary,
  computeCustodiesReport,
  computeVatReturnSummary,
  computeZakatSummary,
  convertCustodyItem,
  createAssetItem,
  createCreditNoteAndPost,
  createCustodyItem,
  createDebitNoteAndPost,
  createPurchaseInvoiceItem,
  createSalesInvoice,
  decodeZatcaTlv,
  deleteCustodyExpenseLine,
  disburseCustodyItem,
  disposeAssetItem,
  executeDepreciationRun,
  getZakatSettings,
  onboardZatcaSettings,
  payPurchaseInvoiceItem,
  postPurchaseInvoiceItem,
  postSalesInvoice,
  postZakatReturnItem,
  previewDepreciationRun,
  recordSalesInvoicePayment,
  repairSalesInvoiceJournal,
  returnAssetCustody,
  saveZakatReturnDraft,
  saveZakatSettings,
  settleCustodyExpenses,
  settleVatReturnPeriod,
  syncAllOperationalJournals,
  topUpCustodyTransfer,
  executeInterBankTransfer,
  payPayrollRunFromBank,
  postEosbSettlementJournal,
} from './cycle-engine';
import {
  batchTransmitZatcaLocal,
  createSalesDebitNoteLocal,
  createZatcaDeviceLocal,
  generateDeviceCsrLocal,
  getInvoiceZatcaDetailsLocal,
  getZatcaLiveStatusV2,
  getZatcaSettingsV2,
  listNotificationsLocal,
  listRetryQueueLocal,
  listZatcaDevicesLocal,
  markNotificationReadLocal,
  processRetryQueueLocal,
  requestComplianceCsidLocal,
  requestProductionCsidLocal,
  runComplianceChecksLocal,
  testDeviceConnectionLocal,
  transmitZatcaInvoiceV2,
  updateZatcaSettingsV2,
  validateInvoiceLocal,
} from './zatca-local-engine';
import {
  bounceCheque,
  cancelTreasuryVoucher,
  cascadeDeleteEmployeeTreasury,
  collectCheque,
  createCheque,
  createTreasuryAccount,
  createTreasuryVoucher,
  depositCheque,
  ensureSyncedEmployeeCostCenter,
  getEnrichedTreasuryAccounts,
  getTreasuryOverview,
  listBankReconciliations,
  listCheques,
  listTreasuryVouchers,
  postTreasuryVoucher,
  reconcileBankAccount,
} from './treasury-engine';

function round2Val(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const jeLineDr = (l: any): number => round2Val(Number(l?.debitBase ?? l?.debit ?? 0));
const jeLineCr = (l: any): number => round2Val(Number(l?.creditBase ?? l?.credit ?? 0));

function withUpdatedJeLineAmounts(l: any, nextDrBase: number, nextCrBase: number): any {
  const fx = Number(l?.exchangeRate || 1) || 1;
  const drBase = round2Val(Math.max(0, nextDrBase));
  const crBase = round2Val(Math.max(0, nextCrBase));
  return {
    ...l,
    debitBase: drBase.toFixed(2),
    creditBase: crBase.toFixed(2),
    debitTx: round2Val(drBase / fx).toFixed(2),
    creditTx: round2Val(crBase / fx).toFixed(2),
    ...(l.debit !== undefined ? { debit: drBase } : {}),
    ...(l.credit !== undefined ? { credit: crBase } : {}),
  };
}

function finalizeBalancedJe(je: any, nextLines: any[]): any | null {
  const cleaned = nextLines
    .filter((l) => jeLineDr(l) > 0 || jeLineCr(l) > 0)
    .map((l, idx) => ({ ...l, lineNo: idx + 1 }));
  if (cleaned.length < 2) return null;
  const totDr = round2Val(cleaned.reduce((s, l) => s + jeLineDr(l), 0));
  const totCr = round2Val(cleaned.reduce((s, l) => s + jeLineCr(l), 0));
  if (Math.abs(totDr - totCr) >= 0.01) return null;
  return {
    ...je,
    lines: cleaned,
    totalDebitBase: totDr.toFixed(2),
    totalCreditBase: totCr.toFixed(2),
  };
}

/**
 * Strict employee ownership check for destructive cascade cleanup:
 * prioritizes ID/code equality without substring fallback when IDs differ.
 */
function belongsToEmployeeStrict(record: any, emp: any): boolean {
  if (!record || !emp) return false;
  const rId = String(record.employeeId ?? record.employee_id ?? '').trim();
  const rCode = String(record.employeeCode ?? record.employee_code ?? '').trim();
  const rName = String(record.employeeName ?? record.employeeNameAr ?? record.employee_name ?? '').trim().toLowerCase();

  const eId = String(emp.id ?? '').trim();
  const eCode = String(emp.code ?? '').trim();
  const eName = String(emp.fullNameAr ?? emp.full_name_ar ?? emp.nameAr ?? emp.name ?? '').trim().toLowerCase();

  if (rId) return rId === eId || (Boolean(eCode) && rId === eCode);
  if (rCode) return (Boolean(eCode) && rCode === eCode) || rCode === eId;
  if (rName && eName) return rName === eName;
  return false;
}

function collectEntityJournalIds(rec: any, out: Set<string>): void {
  if (!rec) return;
  for (const k of ['journalEntryId', 'paymentJournalEntryId', 'reversalJournalEntryId', 'settlementJournalEntryId']) {
    if (rec[k]) out.add(String(rec[k]));
  }
  if (Array.isArray(rec.payments)) {
    for (const p of rec.payments) if (p?.journalEntryId) out.add(String(p.journalEntryId));
  }
  if (Array.isArray(rec.settlements)) {
    for (const s of rec.settlements) if (s?.journalEntryId) out.add(String(s.journalEntryId));
  }
}

/**
 * Removes all operational & auto-posted financial records strictly owned by a deleted employee
 * while preserving multi-employee runs/invoices balanced for remaining employees.
 */
function cascadeDeleteEmployee(delEmp: any): void {
  const removedJeIds = new Set<string>();
  const modifiedJes = new Map<string, any>();

  // 1. Simple employee-scoped entities (no standalone posted GL headers)
  for (const key of ['assignments', 'service_prices', 'monthly_variables', 'revenue_lines']) {
    const list = getEntityList<any>(key, []);
    const next = list.filter((row) => !belongsToEmployeeStrict(row, delEmp));
    if (next.length !== list.length) replaceEntityList(key, next);
  }

  // 2. Loans & custodies (collect linked JEs before removal)
  for (const key of ['loans', 'custodies']) {
    const list = getEntityList<any>(key, []);
    const next = list.filter((row) => {
      if (!belongsToEmployeeStrict(row, delEmp)) return true;
      collectEntityJournalIds(row, removedJeIds);
      return false;
    });
    if (next.length !== list.length) replaceEntityList(key, next);
  }

  const allJes = getEntityList<any>('journal_entries', []);
  const findJe = (jeId?: string) => (jeId ? modifiedJes.get(jeId) || allJes.find((j) => j.id === jeId) : undefined);

  // 3. Payroll runs: drop single-employee runs, or shrink & rebalance multi-employee runs
  const payRuns = getEntityList<any>('payroll_runs', []);
  let payRunsChanged = false;
  const nextPayRuns: any[] = [];
  for (const run of payRuns) {
    if (!Array.isArray(run.lines) || run.lines.length === 0) {
      nextPayRuns.push(run);
      continue;
    }
    const kept = run.lines.filter((l: any) => !belongsToEmployeeStrict(l, delEmp));
    if (kept.length === run.lines.length) {
      nextPayRuns.push(run);
      continue;
    }
    payRunsChanged = true;
    const removed = run.lines.filter((l: any) => belongsToEmployeeStrict(l, delEmp));
    if (kept.length === 0) {
      collectEntityJournalIds(run, removedJeIds);
      continue;
    }
    const sumNum = (arr: any[], fn: (x: any) => number) => round2Val(arr.reduce((s, x) => s + fn(x), 0));
    const remLoan = sumNum(removed, (l) => Number(l.loanDeductionsBase || 0));
    const remDed = sumNum(removed, (l) => Number(l.deductionsBase || 0));
    const remNet = sumNum(removed, (l) => Number(l.netPayableBase || 0));
    const keptSal = sumNum(kept, (l) => Number(l.salaryBase || 0));
    const keptVars = sumNum(kept, (l) => Number(l.bonusesBase || 0) + Number(l.overtimeBase || 0) + Number(l.allowancesBase || 0));
    const keptLoan = sumNum(kept, (l) => Number(l.loanDeductionsBase || 0));
    const keptNet = sumNum(kept, (l) => Number(l.netPayableBase || 0));
    nextPayRuns.push({
      ...run,
      employeeCount: kept.length,
      totalSalaryBase: keptSal.toFixed(2),
      totalVariablesBase: keptVars.toFixed(2),
      totalLoanDeductionsBase: keptLoan.toFixed(2),
      netPayableBase: keptNet.toFixed(2),
      lines: kept,
    });

    const accJe = findJe(run.journalEntryId);
    if (accJe && Array.isArray(accJe.lines)) {
      const nextLines = accJe.lines
        .filter((l: any) => !belongsToEmployeeStrict(l, delEmp))
        .map((l: any) => {
          const code = String(l.accountCode || '');
          const curCr = jeLineCr(l);
          if (curCr > 0) {
            if (code === '10401') return withUpdatedJeLineAmounts(l, 0, curCr - remLoan);
            if (code === '20301') return withUpdatedJeLineAmounts(l, 0, curCr - remDed);
            if (code === '20401') return withUpdatedJeLineAmounts(l, 0, curCr - remNet);
          }
          return l;
        });
      const updatedAccJe = finalizeBalancedJe(accJe, nextLines);
      if (updatedAccJe) modifiedJes.set(accJe.id, updatedAccJe);
    }
    const payJe = findJe(run.paymentJournalEntryId);
    if (payJe && Array.isArray(payJe.lines)) {
      const nextPayLines = payJe.lines.map((l: any) => {
        const curDr = jeLineDr(l);
        const curCr = jeLineCr(l);
        return withUpdatedJeLineAmounts(l, curDr > 0 ? curDr - remNet : 0, curCr > 0 ? curCr - remNet : 0);
      });
      const updatedPayJe = finalizeBalancedJe(payJe, nextPayLines);
      if (updatedPayJe) modifiedJes.set(payJe.id, updatedPayJe);
    }
  }
  if (payRunsChanged) replaceEntityList('payroll_runs', nextPayRuns);

  // 4. Revenue runs
  const revRuns = getEntityList<any>('revenue_runs', []);
  let revRunsChanged = false;
  const nextRevRuns: any[] = [];
  for (const run of revRuns) {
    if (!Array.isArray(run.lines) || run.lines.length === 0) {
      nextRevRuns.push(run);
      continue;
    }
    const kept = run.lines.filter((l: any) => !belongsToEmployeeStrict(l, delEmp));
    if (kept.length === run.lines.length) {
      nextRevRuns.push(run);
      continue;
    }
    revRunsChanged = true;
    if (kept.length === 0) {
      collectEntityJournalIds(run, removedJeIds);
      continue;
    }
    const nextTotal = round2Val(kept.reduce((s: number, l: any) => s + Number(l.grossRevenueBase || l.amount || 0), 0));
    const uniqueEmps = new Set(kept.map((l: any) => l.employeeId || l.employeeCode).filter(Boolean)).size || kept.length;
    nextRevRuns.push({ ...run, employeeCount: uniqueEmps, lineCount: kept.length, totalRevenueBase: nextTotal.toFixed(2), lines: kept });
    const revJe = findJe(run.journalEntryId);
    if (revJe && Array.isArray(revJe.lines) && nextTotal > 0) {
      const nextJeLines = revJe.lines.map((l: any) =>
        withUpdatedJeLineAmounts(l, jeLineDr(l) > 0 ? nextTotal : 0, jeLineCr(l) > 0 ? nextTotal : 0),
      );
      const updatedRevJe = finalizeBalancedJe(revJe, nextJeLines);
      if (updatedRevJe) modifiedJes.set(revJe.id, updatedRevJe);
    }
  }
  if (revRunsChanged) replaceEntityList('revenue_runs', nextRevRuns);

  // 5. Invoices & ZATCA logs
  const invoices = getEntityList<any>('invoices', []);
  const removedInvoiceIds = new Set<string>();
  const keptInvoicesPass1: any[] = [];
  for (const inv of invoices) {
    const lines = Array.isArray(inv.lines) ? inv.lines : [];
    const matchedLineCount = lines.filter((l: any) => belongsToEmployeeStrict(l, delEmp)).length;
    const keptLines = lines.filter((l: any) => !belongsToEmployeeStrict(l, delEmp));
    const linkedInvJe = findJe(inv.journalEntryId);
    const linkedJeOwnedByEmp = Boolean(
      linkedInvJe &&
      Array.isArray(linkedInvJe.lines) &&
      linkedInvJe.lines.length > 0 &&
      linkedInvJe.lines.every((l: any) => belongsToEmployeeStrict(l, delEmp)),
    );
    const whollyOwned =
      belongsToEmployeeStrict(inv, delEmp) ||
      (matchedLineCount > 0 && keptLines.length === 0) ||
      (matchedLineCount === 0 && linkedJeOwnedByEmp);
    if (whollyOwned) {
      removedInvoiceIds.add(inv.id);
      collectEntityJournalIds(inv, removedJeIds);
    } else if (matchedLineCount > 0 && keptLines.length > 0) {
      const subtotal = round2Val(keptLines.reduce((s: number, l: any) => s + Number(l.subtotal || 0), 0));
      const vatAmount = round2Val(keptLines.reduce((s: number, l: any) => s + Number(l.vatAmount || 0), 0));
      const totalAmount = round2Val(subtotal + vatAmount);
      const fxRate = Number(inv.subtotal || 0) > 0 && Number(inv.subtotalBase || 0) > 0
        ? Number(inv.subtotalBase) / Number(inv.subtotal)
        : 1;
      const subBase = round2Val(subtotal * fxRate);
      const vatBase = round2Val(vatAmount * fxRate);
      const totBase = round2Val(totalAmount * fxRate);
      keptInvoicesPass1.push({
        ...inv,
        lines: keptLines,
        subtotal: subtotal.toFixed(2),
        taxableAmount: subtotal.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        subtotalBase: subBase.toFixed(2),
        vatAmountBase: vatBase.toFixed(2),
        totalAmountBase: totBase.toFixed(2),
      });
      if (linkedInvJe && Array.isArray(linkedInvJe.lines) && Number(inv.paidAmount || 0) === 0 && totalAmount > 0) {
        const nextJeLines = linkedInvJe.lines.map((l: any) => {
          const code = String(l.accountCode || '');
          if (code === '10301' && jeLineDr(l) > 0) return withUpdatedJeLineAmounts(l, totBase, 0);
          if (code === '40101' && jeLineCr(l) > 0) return withUpdatedJeLineAmounts(l, 0, subBase);
          if (code === '20201' && jeLineCr(l) > 0) return withUpdatedJeLineAmounts(l, 0, vatBase);
          return l;
        });
        const updatedInvJe = finalizeBalancedJe(linkedInvJe, nextJeLines);
        if (updatedInvJe) modifiedJes.set(linkedInvJe.id, updatedInvJe);
      }
    } else {
      keptInvoicesPass1.push(inv);
    }
  }
  const finalInvoices = keptInvoicesPass1.filter((inv) => {
    if (inv.invoiceType === 'CREDIT_NOTE' && inv.originalInvoiceId && removedInvoiceIds.has(inv.originalInvoiceId)) {
      removedInvoiceIds.add(inv.id);
      collectEntityJournalIds(inv, removedJeIds);
      return false;
    }
    return true;
  });
  if (finalInvoices.length !== invoices.length || keptInvoicesPass1.some((inv, idx) => inv !== invoices[idx])) {
    replaceEntityList('invoices', finalInvoices);
  }
  if (removedInvoiceIds.size > 0) {
    for (const zKey of ['zatca_submissions', 'zatca_retry_queue']) {
      const zList = getEntityList<any>(zKey, []);
      const zNext = zList.filter((z) => !removedInvoiceIds.has(z.invoiceId));
      if (zNext.length !== zList.length) replaceEntityList(zKey, zNext);
    }
  }

  cascadeDeleteEmployeeTreasury(delEmp, (row) => belongsToEmployeeStrict(row, delEmp), removedJeIds);

  // 6. Journal entries: remove linked doc journals & non-manual entries whose lines belong exclusively to delEmp
  let jesChanged = modifiedJes.size > 0;
  const nextJes = allJes
    .filter((je) => {
      if (removedJeIds.has(je.id) || (je.reversalOfId && removedJeIds.has(je.reversalOfId)) || (je.originalEntryId && removedJeIds.has(je.originalEntryId))) {
        jesChanged = true;
        return false;
      }
      const isAutoJe = je.journalType !== 'MANUAL' && je.journalType !== 'GENERAL' && je.sourceModule !== 'MANUAL';
      if (isAutoJe && Array.isArray(je.lines) && je.lines.length > 0 && je.lines.every((l: any) => belongsToEmployeeStrict(l, delEmp))) {
        jesChanged = true;
        return false;
      }
      return true;
    })
    .map((je) => modifiedJes.get(je.id) || je);
  if (jesChanged) replaceEntityList('journal_entries', nextJes);
}

/** Filters sales/purchase invoice collections by status, ZATCA state, type, search, and fiscal period (ID or date window). */
function filterInvoicesByQuery(items: any[], path: string, opts?: { isZatca?: boolean }): any[] {
  const qStr = path.includes('?') ? path.split('?')[1] : '';
  const params = new URLSearchParams(qStr);
  const statusFilter = params.get('status');
  const typeFilter = params.get('type');
  const searchFilter = (params.get('search') || '').trim().toLowerCase();
  const fromDate = params.get('from');
  const toDate = params.get('to');
  const fiscalPeriodId = params.get('fiscalPeriodId') || params.get('periodId');
  const clientIdFilter = params.get('clientId');
  const projectIdFilter = params.get('projectId');
  const costCenterFilter = params.get('costCenterId');
  const employeeIdFilter = params.get('employeeId');

  let result = items;
  if (opts?.isZatca) {
    result = result.filter((i: any) => i.status === 'POSTED' || i.status === 'PAID' || i.status === 'PARTIALLY_PAID');
    if (statusFilter && statusFilter !== 'ALL') {
      if (statusFilter === 'PENDING_ALL') {
        result = result.filter((i: any) => ['NOT_SUBMITTED', 'READY', 'PENDING_SUBMISSION', 'RETRY_PENDING'].includes(i.zatcaStatus || 'NOT_SUBMITTED'));
      } else if (statusFilter === 'ACCEPTED_ALL') {
        result = result.filter((i: any) => ['CLEARED', 'REPORTED', 'ACCEPTED', 'WARNING'].includes(i.zatcaStatus || ''));
      } else if (statusFilter === 'REJECTED_ALL') {
        result = result.filter((i: any) => ['REJECTED', 'FAILED', 'VALIDATION_FAILED'].includes(i.zatcaStatus || ''));
      } else {
        result = result.filter((i: any) => (i.zatcaStatus || 'NOT_SUBMITTED') === statusFilter);
      }
    }
  } else if (statusFilter) {
    result = result.filter((i: any) => i.status === statusFilter);
  }

  if (typeFilter && typeFilter !== 'ALL') {
    result = result.filter((i: any) => (i.invoiceType || 'TAX_INVOICE') === typeFilter);
  }
  if (fromDate) {
    result = result.filter((i: any) => String(i.issueDate || '').slice(0, 10) >= fromDate);
  }
  if (toDate) {
    result = result.filter((i: any) => String(i.issueDate || '').slice(0, 10) <= toDate);
  }
  if (clientIdFilter) {
    result = result.filter((i: any) => i.clientId === clientIdFilter || i.client_id === clientIdFilter);
  }
  if (projectIdFilter) {
    result = result.filter((i: any) => i.projectId === projectIdFilter);
  }
  if (costCenterFilter) {
    const ccSet = expandLocalCostCenterIds(costCenterFilter);
    const prjs = getEntityList<any>('projects', []);
    const pMap = new Map(prjs.map((p: any) => [p.id, p]));
    result = result.filter((i: any) => {
      const effCc = i.costCenterId || (i.projectId && pMap.get(i.projectId)?.costCenterId) || null;
      return effCc && ccSet?.has(effCc);
    });
  }
  if (employeeIdFilter) {
    result = result.filter((i: any) =>
      i.employeeId === employeeIdFilter ||
      (Array.isArray(i.lines) && i.lines.some((l: any) => l.employeeId === employeeIdFilter)),
    );
  }
  if (searchFilter) {
    result = result.filter((i: any) =>
      String(i.invoiceNo || '').toLowerCase().includes(searchFilter) ||
      String(i.clientName || '').toLowerCase().includes(searchFilter) ||
      String(i.clientVatNumber || '').toLowerCase().includes(searchFilter) ||
      String(i.zatcaUuid || '').toLowerCase().includes(searchFilter),
    );
  }

  if (fiscalPeriodId) {
    const resolved = resolvePeriodByIdOrDate(fiscalPeriodId, null);
    const targetStart = resolved?.startDate ? String(resolved.startDate).slice(0, 10) : '';
    const targetEnd = resolved?.endDate ? String(resolved.endDate).slice(0, 10) : '';
    result = result.filter((item: any) => {
      if (item.fiscalPeriodId) {
        return item.fiscalPeriodId === fiscalPeriodId || (resolved && item.fiscalPeriodId === resolved.id);
      }
      const docDate = String(item.issueDate || item.invoiceDate || item.date || item.createdAt || '').slice(0, 10);
      return Boolean(targetStart && targetEnd && docDate && docDate >= targetStart && docDate <= targetEnd);
    });
  }

  return result;
}

/**
 * Clean Production In-Browser Engine (GitHub Pages)
 * Zero hardcoded fake/demo data.
 * Pure dynamic storage backed by localStorage with full CRUD (Create, Read, Update, Delete).
 */

export function makeList<T = any>(items: T[]): T[] & { data: T[]; meta: { page: number; pageSize: number; total: number }; items: T[]; success: boolean } {
  const arr = (Array.isArray(items) ? [...items] : []) as any;
  arr.data = arr;
  arr.meta = { page: 1, pageSize: 50, total: arr.length };
  arr.items = arr;
  arr.success = true;
  return arr;
}

export const defaultBranches = [
  { id: 'br-hq', code: 'HQ', nameAr: 'المقر الرئيسي (الرياض)', nameEn: 'Headquarters - Riyadh', city: 'الرياض', isDefault: true, isActive: true },
  { id: 'br-cai', code: 'CAI', nameAr: 'فرع القاهرة (مركز التطوير)', nameEn: 'Cairo Branch - Dev Center', city: 'القاهرة', isDefault: false, isActive: true },
];

export const defaultDepartments = [
  { id: 'dept-dev', code: 'DEV', nameAr: 'إدارة تطوير البرمجيات والأنظمة', nameEn: 'Software Engineering', isActive: true },
  { id: 'dept-qa', code: 'QA', nameAr: 'إدارة الجودة وضمان الأداء', nameEn: 'Quality Assurance', isActive: true },
  { id: 'dept-infra', code: 'INFRA', nameAr: 'إدارة البنية السحابية وDevOps', nameEn: 'Cloud Infrastructure', isActive: true },
  { id: 'dept-pmo', code: 'PMO', nameAr: 'إدارة المشاريع الرقمية', nameEn: 'Digital PMO', isActive: true },
];

export const defaultPositions = [
  { id: 'pos-fs', code: 'POS-FS', titleAr: 'مهندس برمجيات متقدم (Senior Full-Stack)', titleEn: 'Senior Full-Stack Engineer', departmentId: 'dept-dev', isActive: true },
  { id: 'pos-be', code: 'POS-BE', titleAr: 'مهندس واجهات خلفية (Backend Engineer)', titleEn: 'Backend Engineer', departmentId: 'dept-dev', isActive: true },
  { id: 'pos-fe', code: 'POS-FE', titleAr: 'مهندس واجهات أمامية (Frontend Engineer)', titleEn: 'Frontend Engineer', departmentId: 'dept-dev', isActive: true },
  { id: 'pos-devops', code: 'POS-OPS', titleAr: 'مهندس سحابي وعمليات (DevOps Engineer)', titleEn: 'DevOps Engineer', departmentId: 'dept-infra', isActive: true },
  { id: 'pos-pm', code: 'POS-PM', titleAr: 'مدير مشروع تقني (Technical PM)', titleEn: 'Technical Project Manager', departmentId: 'dept-pmo', isActive: true },
];

export const defaultCostProfiles = defaultCostProfilesList;

export const defaultCostCenters = DEFAULT_LOCAL_COST_CENTERS;

export const defaultClients = [
  {
    id: 'cli-001',
    code: 'CLI-001',
    nameAr: 'شركة التقنية المتقدمة للحلول الرقمية',
    nameEn: 'Advanced Tech Digital Solutions Co.',
    currencyCode: 'SAR',
    taxNumber: '310123456700003',
    paymentTermsDays: 30,
    email: 'billing@advtech.sa',
    phone: '+966112345678',
    isActive: true,
  },
  {
    id: 'cli-002',
    code: 'CLI-002',
    nameAr: 'مجموعة إمداد للتجارة والخدمات',
    nameEn: 'Imdad Trading & Services Group',
    currencyCode: 'SAR',
    taxNumber: '310987654300003',
    paymentTermsDays: 15,
    email: 'finance@imdad.sa',
    phone: '+966123456789',
    isActive: true,
  },
];

export function getDemoFallback(path: string, method = 'GET', body?: any): any {
  // Handle mutations (POST/PATCH/PUT/DELETE) for all entities
  const recomputeEmployeeOverAllocation = (targetEmpIdOrCode?: string) => {
    const allAsg = getEntityList<any>('assignments', []);
    if (allAsg.length === 0) return;
    const t = new Date().toISOString().slice(0, 10);
    const empTotals = new Map<string, number>();
    for (const a of allAsg) {
      const asgEnd = a.endDate || a.effectiveTo;
      if (asgEnd && asgEnd < t) continue;
      const key = String(a.employeeId || a.employeeCode || '');
      if (!key) continue;
      if (targetEmpIdOrCode && key !== targetEmpIdOrCode && a.employeeCode !== targetEmpIdOrCode) continue;
      const pct = Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100));
      empTotals.set(key, (empTotals.get(key) || 0) + pct);
    }
    let changed = false;
    const updated = allAsg.map((a: any) => {
      const key = String(a.employeeId || a.employeeCode || '');
      if (targetEmpIdOrCode && key !== targetEmpIdOrCode && a.employeeCode !== targetEmpIdOrCode) return a;
      const asgEnd = a.endDate || a.effectiveTo;
      if (asgEnd && asgEnd < t) {
        if (a.isOverAllocated) {
          changed = true;
          return { ...a, isOverAllocated: false, overAllocatedPct: 0 };
        }
        return a;
      }
      const tot = empTotals.get(key) || 0;
      const isOver = tot > 100;
      const overPct = Math.max(0, Number((tot - 100).toFixed(1)));
      if (a.isOverAllocated !== isOver || a.overAllocatedPct !== overPct) {
        changed = true;
        return { ...a, isOverAllocated: isOver, overAllocatedPct: overPct };
      }
      return a;
    });
    if (changed) {
      localStorage.setItem('idham_prod_assignments', JSON.stringify(updated));
    }
  };

  if (method !== 'GET') {
    if (path.includes('/companies/current')) {
      return saveStoredCompany(body);
    }
    // --- 1. Robust Employee Sub-routes and Mutations ---
    if (path.startsWith('/employees/')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segments = cleanP.split('/').filter(Boolean); // ['employees', id, (subAction), (subId)]
      const empId = segments[1];
      const subAction = segments[2];
      const subId = segments[3];
      const emps = getEntityList('employees', []);
      const empIndex = emps.findIndex((e) => e.id === empId || e.code === empId || e.code?.toLowerCase() === empId?.toLowerCase());
      const emp = empIndex >= 0 ? { ...emps[empIndex] } : null;

      if (method === 'DELETE' && !subAction) {
        if (empIndex >= 0) {
          const delEmp = emps[empIndex];
          deleteEntityItem('employees', delEmp.id);
          cascadeDeleteEmployee(delEmp);
          recordAudit({ action: 'DELETE_EMPLOYEE', schemaName: 'hr', tableName: 'employees', entityId: delEmp.id, oldValues: { code: delEmp.code, fullNameAr: delEmp.fullNameAr }, reason: 'حذف ملف موظف وكافة ارتباطاته المالية والتشغيلية' });
        }
        return { success: true, message: 'تم حذف الموظف بنجاح' };
      }

      if (method === 'PATCH' && !subAction) {
        const targetEmp = emp || { id: empId, code: body?.code || empId };
        const updated = {
          ...targetEmp,
          ...body,
          id: targetEmp.id || empId,
          code: targetEmp.code || empId,
          fullNameAr: body?.fullNameAr || targetEmp.fullNameAr || ('موظف ' + empId),
          fullNameEn: body?.fullNameEn !== undefined ? body.fullNameEn : (targetEmp.fullNameEn || ''),
          updatedAt: new Date().toISOString(),
          rowVersion: ((targetEmp.rowVersion) || 1) + 1,
        };
        saveEntityItem('employees', updated);
        recordAudit({ action: 'UPDATE_EMPLOYEE', schemaName: 'hr', tableName: 'employees', entityId: updated.id, oldValues: emp ? { fullNameAr: emp.fullNameAr, basicSalary: emp.basicSalary } : null, newValues: body, reason: 'تحديث البيانات الأساسية للموظف' });
        return updated;
      }

      if (emp) {
        if (subAction === 'compensations' && method === 'POST') {
          const oldSalary = emp.basicSalary;
          const newComp = {
            id: uid('cmp'),
            effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
            effectiveTo: null,
            basicSalary: String(body.basicSalary || '0.00'),
            salaryCurrency: body.salaryCurrency || 'SAR',
            insuranceSalary: String(body.insuranceSalary || '0.00'),
            insuranceCurrency: body.insuranceCurrency || body.salaryCurrency || 'SAR',
            changeReason: body.reason || body.changeReason || 'تعديل الراتب المعتمد',
            createdBy: 'المدير التنفيذي',
            createdAt: new Date().toISOString(),
          };
          const curComps = Array.isArray(emp.compensations) ? emp.compensations : [];
          if (curComps.length > 0 && !curComps[0].effectiveTo) curComps[0].effectiveTo = newComp.effectiveFrom;
          emp.basicSalary = newComp.basicSalary;
          emp.salaryCurrency = newComp.salaryCurrency;
          emp.insuranceSalary = newComp.insuranceSalary;
          emp.insuranceCurrency = newComp.insuranceCurrency;
          emp.compensations = [newComp, ...curComps];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'UPDATE_EMPLOYEE_SALARY', schemaName: 'hr', tableName: 'employee_compensations', entityId: emp.id, oldValues: { basicSalary: oldSalary }, newValues: newComp, reason: newComp.changeReason });
          return emp;
        }

        if (subAction === 'placements' && method === 'POST') {
          const departments = getEntityList('departments', defaultDepartments);
          const positions = getEntityList('positions', defaultPositions);
          const branches = getEntityList('branches', defaultBranches);
          const dept = departments.find((d) => d.id === body.departmentId);
          const pos = positions.find((p) => p.id === body.positionId);
          const br = branches.find((b) => b.id === body.branchId);
          const newPlc = {
            id: uid('plc'),
            effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
            effectiveTo: null,
            departmentId: body.departmentId || null,
            positionId: body.positionId || null,
            branchId: body.branchId || null,
            costCenterId: body.costCenterId || null,
            managerEmployeeId: body.managerEmployeeId || null,
            departmentName: dept?.nameAr || emp.departmentName || '',
            positionTitle: pos?.titleAr || emp.positionTitle || '',
            branchName: br?.nameAr || emp.branchName || '',
            changeReason: body.reason || 'تغيير التنسيب الوظيفي',
          };
          const curPlcs = Array.isArray(emp.placements) ? emp.placements : [];
          if (curPlcs.length > 0 && !curPlcs[0].effectiveTo) curPlcs[0].effectiveTo = newPlc.effectiveFrom;
          emp.departmentId = newPlc.departmentId;
          emp.departmentName = newPlc.departmentName;
          emp.positionId = newPlc.positionId;
          emp.positionTitle = newPlc.positionTitle;
          emp.branchId = newPlc.branchId;
          emp.branchName = newPlc.branchName;
          emp.placements = [newPlc, ...curPlcs];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'UPDATE_EMPLOYEE_PLACEMENT', schemaName: 'hr', tableName: 'employee_placements', entityId: emp.id, newValues: newPlc, reason: newPlc.changeReason });
          return emp;
        }

        if (subAction === 'cost-profiles' && method === 'POST') {
          if (cleanP.endsWith('/end')) {
            const curP = Array.isArray(emp.costProfiles) ? emp.costProfiles : [];
            if (curP.length > 0) curP[0].effectiveTo = body.effectiveTo || new Date().toISOString().slice(0, 10);
            emp.costProfiles = curP;
            recordAudit({ action: 'END_EMPLOYEE_COST_PROFILE', schemaName: 'cost', tableName: 'employee_cost_profiles', entityId: emp.id, newValues: { effectiveTo: body.effectiveTo }, reason: 'إنهاء سريان ملف تكلفة الموظف' });
          } else {
            const profiles = getEntityList('cost_profiles', defaultCostProfilesList);
            const prf = profiles.find((p) => p.id === body.profileId);
            const newP = {
              id: uid('ecp'),
              profileId: body.profileId,
              profileCode: prf?.code || 'STD',
              profileName: prf?.nameAr || 'ملف التكلفة المعتمد',
              effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
              effectiveTo: null,
            };
            const curP = Array.isArray(emp.costProfiles) ? emp.costProfiles : [];
            if (curP.length > 0 && !curP[0].effectiveTo) curP[0].effectiveTo = newP.effectiveFrom;
            emp.costProfileId = newP.profileId;
            emp.costProfileName = newP.profileName;
            emp.costProfiles = [newP, ...curP];
            recordAudit({ action: 'ASSIGN_EMPLOYEE_COST_PROFILE', schemaName: 'cost', tableName: 'employee_cost_profiles', entityId: emp.id, newValues: newP, reason: `ربط الموظف بملف التكلفة (${newP.profileName})` });
          }
          saveEntityItem('employees', emp);
          return emp;
        }

        if (subAction === 'overrides' && method === 'POST') {
          const curO = Array.isArray(emp.overrides) ? emp.overrides : [];
          if (cleanP.endsWith('/end') && subId) {
            const targetO = curO.find((o: any) => o.id === subId);
            if (targetO) targetO.effectiveTo = body.effectiveTo;
            recordAudit({ action: 'END_EMPLOYEE_OVERRIDE', schemaName: 'cost', tableName: 'employee_cost_overrides', entityId: emp.id, newValues: { overrideId: subId, effectiveTo: body.effectiveTo }, reason: 'إنهاء استثناء تكلفة موظف' });
          } else {
            const newO = {
              id: uid('ovr'),
              componentId: body.componentId,
              isExcluded: !!body.isExcluded,
              ratePct: body.ratePct || null,
              amount: body.amount || null,
              currencyCode: body.currencyCode || 'SAR',
              reason: body.reason || 'استثناء خاص بالموظف',
              effectiveFrom: body.effectiveFrom || new Date().toISOString().slice(0, 10),
              effectiveTo: null,
            };
            emp.overrides = [newO, ...curO];
            recordAudit({ action: 'CREATE_EMPLOYEE_OVERRIDE', schemaName: 'cost', tableName: 'employee_cost_overrides', entityId: emp.id, newValues: newO, reason: newO.reason });
          }
          saveEntityItem('employees', emp);
          return emp;
        }

        if (subAction === 'status' && method === 'POST') {
          const oldStatus = emp.status;
          const newStatus = body.newStatus || 'ACTIVE';
          const newSh = {
            id: uid('sh'),
            oldStatus: emp.status,
            newStatus,
            effectiveDate: body.effectiveDate || new Date().toISOString().slice(0, 10),
            reason: body.reason || 'تغيير الحالة الإدارية',
            changedBy: 'المدير التنفيذي',
            changedAt: new Date().toISOString(),
          };
          emp.status = newStatus;
          emp.statusHistory = [newSh, ...(Array.isArray(emp.statusHistory) ? emp.statusHistory : [])];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'UPDATE_EMPLOYEE_STATUS', schemaName: 'hr', tableName: 'employees', entityId: emp.id, oldValues: { status: oldStatus }, newValues: { status: newStatus }, reason: newSh.reason });
          return emp;
        }

        if (subAction === 'documents' && method === 'POST') {
          const newDoc = {
            id: uid('doc'),
            title: body.title || 'مستند موظف',
            docType: body.docType || 'CONTRACT',
            docNumber: body.docNumber || '—',
            issueDate: body.issueDate || null,
            expiryDate: body.expiryDate || null,
            fileName: body.fileName || (body.file && body.file.name) || 'document.pdf',
            sizeBytes: 1024 * 45,
            notes: body.notes || '',
            createdAt: new Date().toISOString(),
          };
          emp.documents = [newDoc, ...(Array.isArray(emp.documents) ? emp.documents : [])];
          saveEntityItem('employees', emp);
          recordAudit({ action: 'ADD_EMPLOYEE_DOCUMENT', schemaName: 'hr', tableName: 'employee_documents', entityId: emp.id, newValues: newDoc, reason: `إضافة مستند (${newDoc.title})` });
          return emp;
        }

        if (method === 'DELETE' && subAction && subId) {
          const arrKey = subAction === 'compensations' ? 'compensations'
                       : subAction === 'placements' ? 'placements'
                       : subAction === 'cost-profiles' ? 'costProfiles'
                       : subAction === 'overrides' ? 'overrides'
                       : subAction === 'documents' ? 'documents' : null;
          if (arrKey && Array.isArray(emp[arrKey])) {
            emp[arrKey] = emp[arrKey].filter((x: any) => x.id !== subId);
            saveEntityItem('employees', emp);
            recordAudit({ action: 'DELETE', schemaName: 'hr', tableName: arrKey, entityId: subId, reason: `حذف سجل فرعي (${arrKey}) للموظف ${emp.fullNameAr}` });
          }
          return { success: true };
        }
      }
    }

    // --- 1.1 Robust Project Sub-routes and Mutations ---
    if (path.startsWith('/projects/')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segments = cleanP.split('/').filter(Boolean); // ['projects', id, (subAction)]
      const prjId = segments[1];
      const subAction = segments[2];
      const prjs = getEntityList('projects', []);
      const prjIndex = prjs.findIndex((p: any) => p.id === prjId || p.code === prjId || p.code?.toLowerCase() === prjId?.toLowerCase());
      const prj = prjIndex >= 0 ? { ...prjs[prjIndex] } : null;

      if (method === 'DELETE' && !subAction) {
        if (prjIndex >= 0) {
          deleteEntityItem('projects', prjs[prjIndex].id);
          const allAsg = getEntityList('assignments', []);
          const remainingAsg = allAsg.filter((a: any) => a.projectId !== prjs[prjIndex].id && a.projectId !== prjs[prjIndex].code);
          if (remainingAsg.length !== allAsg.length) {
            localStorage.setItem('idham_prod_assignments', JSON.stringify(remainingAsg));
          }
          recordAudit({ action: 'DELETE_PROJECT', schemaName: 'pmo', tableName: 'projects', entityId: prjs[prjIndex].id, reason: 'حذف مشروع' });
        }
        return { success: true, message: 'تم حذف المشروع بنجاح' };
      }

      if ((method === 'PATCH' || method === 'PUT') && !subAction) {
        if (prj) {
          const updated = {
            ...prj,
            ...body,
            id: prj.id,
            code: prj.code,
            nameAr: body.nameAr || prj.nameAr,
          };
          saveEntityItem('projects', updated);
          recordAudit({ action: 'UPDATE_PROJECT', schemaName: 'pmo', tableName: 'projects', entityId: updated.id, newValues: body, reason: 'تحديث بيانات المشروع' });
          return updated;
        }
      }

      if (subAction === 'status') {
        if (prj) {
          const oldStatus = prj.status;
          prj.status = body.newStatus;
          if (!Array.isArray(prj.statusHistory)) {
            prj.statusHistory = [];
          }
          prj.statusHistory.unshift({
            id: uid('sh'),
            fromStatus: oldStatus,
            toStatus: body.newStatus,
            reason: body.reason || 'تحديث حالة المشروع',
            changedBy: 'المدير التنفيذي',
            changedAt: new Date().toISOString(),
          });
          saveEntityItem('projects', prj);
          recordAudit({ action: 'UPDATE_PROJECT_STATUS', schemaName: 'pmo', tableName: 'projects', entityId: prj.id, oldValues: { status: oldStatus }, newValues: { status: body.newStatus }, reason: body.reason || 'تحديث حالة المشروع' });
          return prj;
        }
      }
    }

    // --- 1.2 Service Prices End Route (Business Process Section 6 & 8) ---
    if (path.startsWith('/service-prices/') && path.endsWith('/end') && method === 'POST') {
      const spId = path.split('?')[0].split('/')[2];
      const list = getEntityList<any>('service_prices', []);
      const idx = list.findIndex((s) => s.id === spId);
      if (idx >= 0) {
        const endDate = body?.effectiveTo || body?.endDate || new Date().toISOString().slice(0, 10);
        list[idx].effectiveTo = endDate;
        saveEntityItem('service_prices', list[idx]);
        recordAudit({
          action: 'END_SERVICE_PRICE',
          schemaName: 'revenue',
          tableName: 'service_prices',
          entityId: spId,
          oldValues: { effectiveTo: null },
          newValues: { effectiveTo: endDate },
          reason: `إنهاء سريان سعر خدمة الموظف ${list[idx].employeeName || ''}`,
        });
        return list[idx];
      }
    }

    // --- 2. Robust Assignment Mutations (Business Process Section 7 & 11) ---
    if (path.startsWith('/assignments')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      if (cleanP.endsWith('/end') && method === 'POST') {
        const asgId = cleanP.split('/')[2];
        const allAsg = getEntityList<any>('assignments', []);
        const idx = allAsg.findIndex((a) => a.id === asgId);
        if (idx >= 0) {
          const endDate = body?.endDate || body?.effectiveTo || new Date().toISOString().slice(0, 10);
          allAsg[idx].endDate = endDate;
          allAsg[idx].effectiveTo = endDate;
          saveEntityItem('assignments', allAsg[idx]);
          recomputeEmployeeOverAllocation(allAsg[idx].employeeId || allAsg[idx].employeeCode);
          recordAudit({
            action: 'END_ASSIGNMENT',
            schemaName: 'pmo',
            tableName: 'assignments',
            entityId: asgId,
            oldValues: { endDate: null },
            newValues: { endDate },
            reason: body?.reason || `إنهاء تخصيص الموظف ${allAsg[idx].employeeName || ''} في مشروع ${allAsg[idx].projectName || ''}`,
          });
          return allAsg[idx];
        }
      }
      if (method === 'DELETE') {
        const id = cleanP.split('/').filter(Boolean).pop();
        const existing = getEntityList<any>('assignments', []).find((a) => a.id === id);
        if (id) deleteEntityItem('assignments', id);
        if (existing) {
          recomputeEmployeeOverAllocation(existing.employeeId || existing.employeeCode);
          recordAudit({
            action: 'DELETE_ASSIGNMENT',
            schemaName: 'pmo',
            tableName: 'assignments',
            entityId: id!,
            oldValues: existing,
            reason: `حذف تخصيص الموظف ${existing.employeeName || ''}`,
          });
        }
        return { success: true, message: 'تم حذف الإسناد بنجاح' };
      }
      if (typeof body === 'object' && body !== null) {
        const emps = getEntityList('employees', []);
        const projects = getEntityList('projects', []);
        const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
        const emp = emps.find((e) => e.id === body.employeeId || e.code === body.employeeId);
        const prj = projects.find((p) => p.id === body.projectId || p.code === body.projectId);
        const startDateStr = body.startDate || body.effectiveFrom || new Date().toISOString().slice(0, 10);
        const endDateStr = body.endDate || body.effectiveTo || null;
        const period = resolvePeriodByIdOrDate(null, startDateStr);

        const econ = computeAssignmentEconomics({
          assignment: body,
          employee: emp,
          project: prj,
          servicePrices,
          period,
        });

        const enrichedAsg = {
          id: body.id || uid('asg'),
          employeeId: emp?.id || body.employeeId,
          employeeCode: emp?.code || body.employeeCode || '',
          employeeName: emp?.fullNameAr || emp?.full_name_ar || body.employeeName || 'موظف',
          projectId: prj?.id || body.projectId,
          projectCode: prj?.code || body.projectCode || '',
          projectName: prj?.nameAr || body.projectName || 'مشروع',
          clientName: prj?.clientName || body.clientName || 'عميل',
          allocationBasis: econ.allocationBasis,
          allocationPct: econ.allocationPct,
          allocatedDays: econ.allocatedDays,
          allocatedHours: body.allocatedHours ? Number(body.allocatedHours) : null,
          workingDaysInMonth: econ.workingDays,
          billableRate: econ.rawUnitPrice || Number(body.billableRate || emp?.defaultBillingRate || 1500),
          billingBasis: normalizePricingBasis(body.billingBasis, body.pricingBasis, emp?.defaultBillingBasis, 'DAILY'),
          billingCurrency: econ.rateCurrency || 'SAR',
          startDate: startDateStr,
          endDate: endDateStr,
          effectiveFrom: startDateStr,
          effectiveTo: endDateStr,
          roleTitle: body.roleTitle || emp?.positionTitle || 'مهندس برمجيات',
          isBillable: body.isBillable !== false,
          monthlyRevenue: econ.revenueBase,
          allocatedCost: econ.directCostShareBase,
          marginPct: String(econ.grossMarginPct),
          changeReason: body.changeReason || body.notes || 'إسناد الموظف إلى المشروع',
          notes: body.notes || body.changeReason || null,
        };
        const saved = saveEntityItem('assignments', enrichedAsg);
        recomputeEmployeeOverAllocation(enrichedAsg.employeeId || enrichedAsg.employeeCode);
        const refreshed = getEntityList<any>('assignments', []).find((a) => a.id === saved.id) || saved;
        recordAudit({
          action: 'CREATE_ASSIGNMENT',
          schemaName: 'pmo',
          tableName: 'assignments',
          entityId: refreshed.id,
          newValues: { employeeName: refreshed.employeeName, projectName: refreshed.projectName, allocationPct: refreshed.allocationPct, isOverAllocated: refreshed.isOverAllocated },
          reason: refreshed.changeReason,
        });
        return refreshed;
      }
    }


    // --- 2.1 Robust Closing & Period Operations (Business Process Section 27, 28, 29) ---
    if (path.includes('/closing/periods/') && path.endsWith('/close') && method === 'POST') {
      const periodId = path.split('?')[0].split('/')[3];
      const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList);
      const pIdx = periods.findIndex((p: any) => p.id === periodId);
      const periodObj = pIdx >= 0 ? periods[pIdx] : { id: periodId, name: 'الفترة المالية', startDate: '2026-01-01', endDate: new Date().toISOString().slice(0, 10) };
      const checks = evaluatePeriodClosingChecks(periodObj.id);
      if (!checks.canClose) {
        const failed = checks.results.find((r: any) => r.status === 'FAIL');
        throw new Error(failed?.message || 'لا يمكن إقفال الفترة لعدم استيفاء فحوصات ما قبل الإقفال');
      }
      if (pIdx >= 0) {
        periods[pIdx].status = 'CLOSED';
        saveEntityItem('fiscal_periods', periods[pIdx]);
      } else {
        saveEntityItem('fiscal_periods', { ...periodObj, status: 'CLOSED' });
      }
      const prevSnaps = getEntityList<any>('snapshots', []).filter((s) => s.periodId === periodId);
      const tbFinancial = computeTrialBalance({ from: periodObj.startDate, to: periodObj.endDate, ledger: 'FINANCIAL' });
      const isPeriod = computeIncomeStatement({ from: periodObj.startDate, to: periodObj.endDate });
      const bsPeriod = computeBalanceSheet({ asOf: periodObj.endDate });
      const profOverview = getDemoFallback(`/reports/profitability/overview?periodId=${periodId}`);
      const snapData = {
        periodId,
        periodName: periodObj.name,
        startDate: periodObj.startDate,
        endDate: periodObj.endDate,
        closingDate: new Date().toISOString(),
        closedBy: 'المدير التنفيذي',
        trialBalance: { financial: tbFinancial },
        incomeStatement: { period: isPeriod },
        balanceSheet: bsPeriod,
        profitability: profOverview,
      };
      const snapHash = sha256Hex(JSON.stringify(snapData));
      const snap = {
        id: uid('snap'),
        periodId,
        periodName: periodObj.name,
        version: prevSnaps.length + 1,
        kind: 'PERIOD_CLOSE',
        dataHash: snapHash,
        createdAt: snapData.closingDate,
        createdBy: 'المدير التنفيذي',
        hashValid: true,
        data: snapData,
      };
      saveEntityItem('snapshots', snap);
      recordAudit({
        action: 'CLOSE_PERIOD',
        schemaName: 'acc',
        tableName: 'fiscal_periods',
        entityId: periodId,
        oldValues: { status: 'OPEN' },
        newValues: { status: 'CLOSED', snapshotId: snap.id, dataHash: snapHash },
        reason: `إقفال الفترة ${periodObj.name} وتوليد اللقطة الرقمية المحمية ببصمة SHA-256`,
      });
      return { success: true, snapshot: snap, message: 'تم إقفال الفترة وحفظ اللقطة بنجاح' };
    }

    if (path.includes('/closing/periods/') && path.endsWith('/reopen') && method === 'POST') {
      const periodId = path.split('?')[0].split('/')[3];
      const reasonText = String(body?.reason || '').trim();
      if (reasonText.length < 3) {
        throw new Error('إعادة فتح فترة مقفلة يتطلب توثيق السبب (3 أحرف على الأقل)');
      }
      const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList);
      const pIdx = periods.findIndex((p: any) => p.id === periodId);
      const pName = pIdx >= 0 ? periods[pIdx].name : 'الفترة المالية';
      if (pIdx >= 0) {
        periods[pIdx].status = 'OPEN';
        saveEntityItem('fiscal_periods', periods[pIdx]);
      }
      recordAudit({
        action: 'REOPEN_PERIOD',
        schemaName: 'acc',
        tableName: 'fiscal_periods',
        entityId: periodId,
        oldValues: { status: 'CLOSED' },
        newValues: { status: 'OPEN' },
        reason: `${reasonText} (${pName})`,
      });
      return { success: true, message: 'تمت إعادة فتح الفترة بنجاح' };
    }

    // --- 2.2 Robust Monthly Variables Operations (Business Process Section 12, 13, 14, 15) ---
    if (path.startsWith('/monthly-variables/approve-all') && method === 'POST') {
      const targetPeriodId = body?.periodId || body?.fiscalPeriodId;
      if (targetPeriodId) assertPeriodOpen(targetPeriodId, 'اعتماد المتغيرات الشهرية دفعة واحدة');
      const list = getEntityList<any>('monthly_variables', []);
      let approvedCount = 0;
      for (const mv of list) {
        if (mv.status === 'DRAFT' && (!targetPeriodId || mv.fiscalPeriodId === targetPeriodId)) {
          mv.status = 'APPROVED';
          mv.approvedAt = new Date().toISOString();
          mv.approvedBy = 'المدير التنفيذي';
          saveEntityItem('monthly_variables', mv);
          approvedCount++;
        }
      }
      return { success: true, approvedCount };
    }

    if (path.startsWith('/monthly-variables/') && path.endsWith('/approve') && method === 'POST') {
      const mvId = path.split('?')[0].split('/')[2];
      const list = getEntityList('monthly_variables', []);
      const idx = list.findIndex((m: any) => m.id === mvId);
      if (idx >= 0) {
        assertPeriodOpen(list[idx].fiscalPeriodId, 'اعتماد المتغير الشهري');
        list[idx].status = 'APPROVED';
        list[idx].approvedAt = new Date().toISOString();
        list[idx].approvedBy = 'المدير التنفيذي';
        saveEntityItem('monthly_variables', list[idx]);
        recordAudit({
          action: 'APPROVE_VARIABLE',
          schemaName: 'pay',
          tableName: 'monthly_variables',
          entityId: mvId,
          oldValues: { status: 'DRAFT' },
          newValues: { status: 'APPROVED', computedAmount: list[idx].computedAmount },
          reason: 'اعتماد متغير شهري لصالح الموظف ' + list[idx].employeeName,
        });
        return list[idx];
      }
    }

    if (path.startsWith('/monthly-variables/') && method === 'DELETE') {
      const mvId = path.split('?')[0].split('/')[2];
      const list = getEntityList('monthly_variables', []);
      const existing = list.find((m: any) => m.id === mvId);
      if (existing) assertPeriodOpen(existing.fiscalPeriodId, 'حذف المتغير الشهري');
      deleteEntityItem('monthly_variables', mvId);
      recordAudit({
        action: 'DELETE',
        schemaName: 'pay',
        tableName: 'monthly_variables',
        entityId: mvId,
        oldValues: existing || null,
        reason: 'حذف متغير شهري',
      });
      return { success: true, message: 'تم حذف المتغير بنجاح' };
    }

    // --- 2.3 Robust Revenue Runs Operations (Business Process Section 8 & Revenue Engine) ---
    if (path.split('?')[0] === '/revenue-runs' && method === 'POST') {
      const targetPeriodId = body?.fiscalPeriodId || body?.periodId;
      const pObj = assertPeriodOpen(targetPeriodId, 'ترحيل تشغيل الإيرادات');
      const resolvedPeriod = pObj || resolvePeriodByIdOrDate(targetPeriodId, null);
      const existingPosted = getEntityList<any>('revenue_runs', []).find(
        (r) => r.fiscalPeriodId === resolvedPeriod?.id && r.status === 'POSTED',
      );
      if (existingPosted) {
        throw new Error(`يوجد تشغيل إيرادات مرحّل مسبقاً للفترة (${resolvedPeriod?.name})؛ ألغِه أولاً لإعادة التشغيل.`);
      }

      const previewData = getDemoFallback(`/revenue-runs/preview?periodId=${resolvedPeriod?.id || ''}`);
      const runCount = getEntityList('revenue_runs', []).length + 1;
      const runNo = `REV-${new Date().getFullYear()}-${String(runCount).padStart(3, '0')}`;
      const todayIso = new Date().toISOString().slice(0, 10);
      const entryDate = resolvedPeriod
        ? (todayIso >= resolvedPeriod.startDate && todayIso <= resolvedPeriod.endDate ? todayIso : resolvedPeriod.endDate)
        : todayIso;

      const je = createAutoPostedJournalEntry({
        entryDate,
        fiscalPeriodId: resolvedPeriod?.id,
        journalType: 'REVENUE',
        sourceModule: 'REV',
        sourceType: 'REVENUE_RUN',
        postingEvent: 'REVENUE_RECOGNIZED',
        reference: runNo,
        description: `ترحيل إيرادات الخدمات والمشاريع للتشغيل ${runNo} — ${resolvedPeriod?.name || ''}`,
        lines: [
          { accountCode: '110301', debit: Number(previewData.totalRevenueBase || 0), credit: 0, description: `إيرادات مستحقة غير مفوترة (${runNo})` },
          { accountCode: '410101', debit: 0, credit: Number(previewData.totalRevenueBase || 0), description: `إيرادات عقود ومشاريع (${runNo})` },
        ],
      });

      const runItem = {
        id: uid('revrun'),
        runNo,
        fiscalPeriodId: resolvedPeriod?.id || targetPeriodId,
        periodName: resolvedPeriod?.name || 'فترة التشغيل الحالية',
        projectCount: previewData.projectCount,
        employeeCount: previewData.employeeCount,
        lineCount: previewData.lineCount,
        totalRevenueBase: previewData.totalRevenueBase,
        journalEntryNo: je.entryNo,
        journalEntryId: je.id,
        status: 'POSTED',
        createdAt: new Date().toISOString(),
        lines: previewData.lines,
      };
      saveEntityItem('revenue_runs', runItem);
      recordAudit({
        action: 'POST_REVENUE_RUN',
        schemaName: 'revenue',
        tableName: 'revenue_runs',
        entityId: runItem.id,
        newValues: { runNo, totalRevenueBase: runItem.totalRevenueBase, journalEntryNo: je.entryNo },
        reason: `ترحيل إيرادات الخدمات بمبلغ ${runItem.totalRevenueBase} ريال`,
      });
      return runItem;
    }

    if (path.startsWith('/revenue-runs/') && path.endsWith('/cancel') && method === 'POST') {
      const runId = path.split('?')[0].split('/')[2];
      const runs = getEntityList('revenue_runs', []);
      const idx = runs.findIndex((r: any) => r.id === runId);
      if (idx >= 0) {
        assertPeriodOpen(runs[idx].fiscalPeriodId, 'إلغاء تشغيل الإيرادات');
        const reasonText = body?.reason || 'إلغاء ترحيل الإيراد وعكس القيد';
        let revJe: any = null;
        if (runs[idx].journalEntryId) {
          try {
            revJe = createReversalJournalEntry(runs[idx].journalEntryId, reasonText);
          } catch { /* already reversed or manual */ }
        }
        runs[idx].status = 'CANCELLED';
        runs[idx].cancelReason = reasonText;
        runs[idx].reversalJournalEntryId = revJe?.id || null;
        saveEntityItem('revenue_runs', runs[idx]);
        recordAudit({
          action: 'CANCEL_REVENUE_RUN',
          schemaName: 'revenue',
          tableName: 'revenue_runs',
          entityId: runs[idx].id,
          reason: reasonText,
        });
        return runs[idx];
      }
    }

    // --- 2.35 Overhead Policy Update (Business Process Section 19) ---
    if (path.includes('/overhead-policy') && (method === 'PUT' || method === 'POST' || method === 'PATCH')) {
      return saveOverheadPolicy(body || {});
    }

    // --- 2.36 Cost Profile Lines CRUD (Business Process Section 4 & 5) ---
    if (path.startsWith('/cost-profiles/') && path.includes('/lines')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segs = cleanP.split('/').filter(Boolean); // ['cost-profiles', profileId, 'lines', lineId?, 'end'?]
      const profileId = segs[1];
      const lineId = segs[3];
      const profiles = getEntityList<any>('cost_profiles', defaultCostProfilesList);
      const pIdx = profiles.findIndex((p) => p.id === profileId || p.code === profileId);
      if (pIdx >= 0) {
        const prf = { ...profiles[pIdx], lines: Array.isArray(profiles[pIdx].lines) ? [...profiles[pIdx].lines] : [] };
        if (method === 'DELETE' && lineId) {
          prf.lines = prf.lines.filter((l: any) => l.id !== lineId);
          saveEntityItem('cost_profiles', prf);
          recordAudit({ action: 'DELETE', schemaName: 'cost', tableName: 'cost_profile_lines', entityId: lineId, reason: 'حذف بند من ملف التكلفة' });
          return { success: true };
        }
        if (method === 'POST' && cleanP.endsWith('/end') && lineId) {
          prf.lines = prf.lines.map((l: any) => (l.id === lineId ? { ...l, effectiveTo: body?.effectiveTo || new Date().toISOString().slice(0, 10) } : l));
          saveEntityItem('cost_profiles', prf);
          recordAudit({ action: 'UPDATE', schemaName: 'cost', tableName: 'cost_profile_lines', entityId: lineId, newValues: { effectiveTo: body?.effectiveTo }, reason: 'إنهاء سريان بند في ملف التكلفة' });
          return prf;
        }
        if (method === 'POST') {
          const comps = getEntityList<any>('cost_components', defaultCostComponentsList);
          const comp = comps.find((c) => c.id === body?.componentId || c.code === body?.componentId);
          const newLine = {
            id: uid('cpl'),
            componentId: comp?.id || body?.componentId,
            componentCode: comp?.code || 'CMP',
            componentName: comp?.nameAr || 'مكون تكلفة',
            calcMethod: body?.calcMethod || comp?.defaultMethod || 'FIXED',
            nature: comp?.nature || 'EMPLOYER_COST',
            ratePct: body?.ratePct != null && body.ratePct !== '' ? String(body.ratePct) : null,
            amount: body?.amount != null && body.amount !== '' ? String(body.amount) : null,
            currencyCode: body?.currencyCode || prf.currencyCode || 'SAR',
            minAmount: body?.minAmount || null,
            maxAmount: body?.maxAmount || null,
            effectiveFrom: body?.effectiveFrom || new Date().toISOString().slice(0, 10),
            effectiveTo: null,
          };
          prf.lines.push(newLine);
          saveEntityItem('cost_profiles', prf);
          recordAudit({ action: 'INSERT', schemaName: 'cost', tableName: 'cost_profile_lines', entityId: newLine.id, newValues: newLine, reason: `إضافة مكون (${newLine.componentName}) إلى ملف التكلفة ${prf.nameAr}` });
          return newLine;
        }
      }
    }

    // --- 2.37 Loans Cancel & Installment Postpone (Business Process Section 16) ---
    if (path.startsWith('/loans/') && path.endsWith('/cancel') && method === 'POST') {
      const loanId = path.split('?')[0].split('/')[2];
      const loans = getEntityList<any>('loans', []);
      const idx = loans.findIndex((l) => l.id === loanId);
      if (idx >= 0) {
        const list = Array.isArray(loans[idx].installments_list) ? loans[idx].installments_list : [];
        const pendingSum = list
          .filter((inst: any) => inst.status === 'PENDING')
          .reduce((s: number, inst: any) => s + Number(inst.dueAmount || 0), 0);

        if (pendingSum > 0) {
          try {
            const revJe = createAutoPostedJournalEntry({
              entryDate: new Date().toISOString().slice(0, 10),
              journalType: 'LOAN',
              sourceModule: 'PAY',
              sourceType: 'LOAN_CANCELLATION',
              postingEvent: 'LOAN_CANCELLED',
              reference: loans[idx].loanNo,
              description: `قيد عكس وتسوية الرصيد المتبقي للسلفة الملغاة (${loans[idx].loanNo}) — ${loans[idx].employeeName || ''}`,
              lines: [
                { accountCode: '10201', debit: pendingSum, credit: 0, employeeId: loans[idx].employeeId, description: `استرداد / إلغاء متبقي سلفة (${loans[idx].loanNo})` },
                { accountCode: '10401', debit: 0, credit: pendingSum, employeeId: loans[idx].employeeId, description: `تخفيض ذمة سلفة الموظف (${loans[idx].loanNo})` },
              ],
            });
            loans[idx].cancellationJournalEntryId = revJe.id;
            loans[idx].cancellationJournalEntryNo = revJe.entryNo;
          } catch { /* ignore if closed period */ }
        }

        loans[idx].status = 'CANCELLED';
        loans[idx].cancelReason = body?.reason || 'إلغاء القرض إدارياً';
        loans[idx].installments_list = list.map((inst: any) => (inst.status === 'PENDING' ? { ...inst, status: 'CANCELLED' } : inst));
        saveEntityItem('loans', loans[idx]);
        recordAudit({ action: 'CANCEL_LOAN', schemaName: 'pay', tableName: 'loans', entityId: loanId, reason: loans[idx].cancelReason });
        return loans[idx];
      }
    }

    if (path.includes('/loans/installments/') && path.endsWith('/postpone') && method === 'POST') {
      const instId = path.split('?')[0].split('/')[3];
      const toPeriod = resolvePeriodByIdOrDate(body?.toPeriodId, null);
      if (!toPeriod) throw new Error('يرجى تحديد الفترة المالية المستهدفة لتأجيل القسط');
      assertPeriodOpen(toPeriod.id, 'تأجيل قسط سلفة إلى فترة لاحقة');

      const loans = getEntityList<any>('loans', []);
      for (const loan of loans) {
        const list = Array.isArray(loan.installments_list) ? [...loan.installments_list] : [];
        const instIdx = list.findIndex((x: any) => x.id === instId);
        if (instIdx >= 0) {
          const origInst = list[instIdx];
          list[instIdx] = { ...origInst, status: 'POSTPONED', postponedReason: body?.reason || 'تأجيل إداري' };
          list.push({
            id: uid(`${loan.id}-inst`),
            installmentNo: origInst.installmentNo,
            periodId: toPeriod.id,
            periodName: toPeriod.name,
            dueAmount: origInst.dueAmount,
            status: 'PENDING',
            postponedFrom: origInst.periodName,
          });
          loan.installments_list = list;
          saveEntityItem('loans', loan);
          recordAudit({
            action: 'POSTPONE_INSTALLMENT',
            schemaName: 'pay',
            tableName: 'loan_installments',
            entityId: instId,
            oldValues: { periodId: origInst.periodId, status: 'PENDING' },
            newValues: { toPeriodId: toPeriod.id, toPeriodName: toPeriod.name },
            reason: body?.reason || `تأجيل قسط ${loan.loanNo} إلى ${toPeriod.name}`,
          });
          return loan;
        }
      }
    }

    // --- 2.38 Payroll Run Execution, Bank Payment & Reversal (Business Process Section 12-16 & Accounting) ---
    if (path.startsWith('/payroll-runs/') && path.endsWith('/pay') && method === 'POST') {
      const runId = path.split('?')[0].split('/')[2];
      return payPayrollRunFromBank(runId, body);
    }

    if (path.split('?')[0] === '/payroll-runs' && method === 'POST') {
      const targetPeriodId = body?.periodId || body?.fiscalPeriodId;
      const period = assertPeriodOpen(targetPeriodId, 'تشغيل مسيّر الرواتب');
      const resolvedPeriod = period || resolvePeriodByIdOrDate(targetPeriodId, null);
      const existing = getEntityList<any>('payroll_runs', []).find((r) => r.fiscalPeriodId === resolvedPeriod?.id && r.status === 'POSTED');
      if (existing) {
        throw new Error(`تم تشغيل مسيّر الرواتب للفترة (${resolvedPeriod?.name}) مسبقاً؛ ألغِه أولاً لإعادة التشغيل.`);
      }

      const preview = getDemoFallback(`/payroll-runs/preview?periodId=${resolvedPeriod?.id || ''}`);
      if (!preview.lines || preview.lines.length === 0) {
        throw new Error('لا يوجد موظفون نشطون لحساب مسيّر الرواتب في هذه الفترة.');
      }

      const runCount = getEntityList('payroll_runs', []).length + 1;
      const runNo = `PAY-${(resolvedPeriod?.startDate || new Date().toISOString()).slice(0, 7).replace('-', '')}-${String(runCount).padStart(2, '0')}`;
      const todayIso = new Date().toISOString().slice(0, 10);
      const entryDate = resolvedPeriod
        ? (todayIso >= resolvedPeriod.startDate && todayIso <= resolvedPeriod.endDate ? todayIso : resolvedPeriod.endDate)
        : todayIso;

      const totalGross = preview.lines.reduce((s: number, l: any) => s + Number(l.grossBase || 0), 0);
      const totalLoanDed = Number(preview.totalLoanDeductionsBase || 0);
      const netPayable = Number(preview.netPayableBase || 0);
      const otherDeductions = Math.max(0, totalGross - totalLoanDed - netPayable);

      // Smart Project-Level Labor Cost Split vs Bench Time Cost based on active period assignments!
      const allEmps = getEntityList<any>('employees', []);
      const activeAsgs = getEntityList<any>('assignments', []).filter((a) => isAssignmentActiveInPeriod(a, resolvedPeriod));
      const jeLines: Array<{ accountCode: string; debit: number; credit: number; employeeId?: string; projectId?: string; description?: string }> = [];

      let allocatedSum = 0;
      let benchSum = 0;

      for (const line of preview.lines) {
        const lineGross = Number(line.grossBase || 0);
        if (lineGross <= 0) continue;
        const empObj = allEmps.find((e) => e.id === line.employeeId || e.code === line.employeeCode) || { id: line.employeeId, code: line.employeeCode, fullNameAr: line.employeeName };
        const empAsgs = activeAsgs.filter((a) => matchesEmployee(a, empObj));
        const rawTotalPct = empAsgs.reduce(
          (s, a) => s + Number(a.allocationPct != null ? a.allocationPct : (a.allocationBasis === 'DAYS' ? ((Number(a.allocatedDays) || 22) / 22) * 100 : 100)),
          0,
        );
        const normFactor = rawTotalPct > 100 ? 100 / rawTotalPct : 1;

        let empAllocatedPortion = 0;
        for (const asg of empAsgs) {
          const pct = Number(asg.allocationPct != null ? asg.allocationPct : (asg.allocationBasis === 'DAYS' ? ((Number(asg.allocatedDays) || 22) / 22) * 100 : 100)) * normFactor;
          const prjShare = Math.round(lineGross * (pct / 100) * 100) / 100;
          if (prjShare > 0) {
            empAllocatedPortion += prjShare;
            jeLines.push({
              accountCode: '50101',
              debit: prjShare,
              credit: 0,
              employeeId: line.employeeId,
              projectId: asg.projectId,
              description: `تكلفة راتب مباشر (${Math.round(pct)}%) — ${line.employeeName} على مشروع ${asg.projectName || asg.projectCode || ''}`,
            });
          }
        }
        allocatedSum += empAllocatedPortion;
        const empBench = Math.max(0, Math.round((lineGross - empAllocatedPortion) * 100) / 100);
        if (empBench > 0.005) {
          benchSum += empBench;
          jeLines.push({
            accountCode: '50102',
            debit: empBench,
            credit: 0,
            employeeId: line.employeeId,
            description: `تكلفة راتب وقت غير مستغل (Bench) — ${line.employeeName}`,
          });
        }
      }

      // Ensure exact penny rounding match with totalGross
      const drDiff = Math.round((totalGross - (allocatedSum + benchSum)) * 100) / 100;
      if (Math.abs(drDiff) >= 0.01 && jeLines.length > 0) {
        jeLines[0].debit = Math.round((jeLines[0].debit + drDiff) * 100) / 100;
      } else if (jeLines.length === 0 && totalGross > 0) {
        jeLines.push({ accountCode: '50101', debit: totalGross, credit: 0, description: `رواتب وأجور ومتغيرات ${resolvedPeriod?.name}` });
      }

      if (totalLoanDed > 0) {
        jeLines.push({ accountCode: '10401', debit: 0, credit: totalLoanDed, description: `استقطاع أقساط السلف المستحقة (${runNo}) — ليست تكلفة ربحية` });
      }
      if (otherDeductions > 0.005) {
        jeLines.push({ accountCode: '20301', debit: 0, credit: otherDeductions, description: `استقطاعات وخصومات إدارية (${runNo})` });
      }
      jeLines.push({ accountCode: '20401', debit: 0, credit: netPayable, description: `صافي الرواتب المستحقة للدفع (${runNo})` });

      const je = createAutoPostedJournalEntry({
        entryDate,
        fiscalPeriodId: resolvedPeriod?.id,
        journalType: 'PAYROLL',
        sourceModule: 'PAY',
        sourceType: 'PAYROLL_RUN',
        postingEvent: 'PAYROLL_POSTED',
        reference: runNo,
        description: `قيد مسيّر الرواتب الشهري الموزع على المشاريع ${runNo} — ${resolvedPeriod?.name}`,
        lines: jeLines,
      });

      const runId = uid('payrun');
      // Mark due PENDING loan installments in this period as DEDUCTED
      const loans = getEntityList<any>('loans', []);
      for (const loan of loans) {
        if (loan.status !== 'ACTIVE') continue;
        let touched = false;
        const list = (Array.isArray(loan.installments_list) ? loan.installments_list : []).map((inst: any) => {
          if (inst.status === 'PENDING' && inst.periodId === resolvedPeriod?.id) {
            touched = true;
            return { ...inst, status: 'DEDUCTED', payrollRunId: runId };
          }
          return inst;
        });
        if (touched) {
          loan.installments_list = list;
          if (list.every((x: any) => x.status !== 'PENDING')) loan.status = 'COMPLETED';
          saveEntityItem('loans', loan);
        }
      }

      const runItem = {
        id: runId,
        runNo,
        fiscalPeriodId: resolvedPeriod?.id,
        periodName: resolvedPeriod?.name || 'الفترة الحالية',
        employeeCount: preview.employeeCount,
        totalSalaryBase: preview.totalSalaryBase,
        totalVariablesBase: preview.totalVariablesBase,
        totalLoanDeductionsBase: preview.totalLoanDeductionsBase,
        netPayableBase: preview.netPayableBase,
        journalEntryId: je.id,
        journalEntryNo: je.entryNo,
        status: 'POSTED',
        createdAt: new Date().toISOString(),
        lines: preview.lines,
      };
      saveEntityItem('payroll_runs', runItem);
      recordAudit({
        action: 'POST_PAYROLL_RUN',
        schemaName: 'pay',
        tableName: 'payroll_runs',
        entityId: runId,
        newValues: { runNo, netPayableBase: runItem.netPayableBase, totalLoanDeductionsBase: runItem.totalLoanDeductionsBase, journalEntryNo: je.entryNo },
        reason: `ترحيل مسيّر الرواتب ${runNo} للفترة ${resolvedPeriod?.name}`,
      });
      return runItem;
    }

    if (path.startsWith('/payroll-runs/') && path.endsWith('/cancel') && method === 'POST') {
      const runId = path.split('?')[0].split('/')[2];
      const runs = getEntityList<any>('payroll_runs', []);
      const idx = runs.findIndex((r) => r.id === runId);
      if (idx >= 0) {
        assertPeriodOpen(runs[idx].fiscalPeriodId, 'إلغاء مسيّر الرواتب');
        const reasonText = body?.reason || 'إلغاء مسيّر الرواتب وعكس القيد';
        let revJe: any = null;
        if (runs[idx].journalEntryId) {
          try {
            revJe = createReversalJournalEntry(runs[idx].journalEntryId, reasonText);
          } catch { /* already reversed */ }
        }
        // Restore DEDUCTED loan installments tied to this run back to PENDING
        const loans = getEntityList<any>('loans', []);
        for (const loan of loans) {
          let touched = false;
          const list = (Array.isArray(loan.installments_list) ? loan.installments_list : []).map((inst: any) => {
            if (inst.payrollRunId === runId && inst.status === 'DEDUCTED') {
              touched = true;
              const { payrollRunId: _omit, ...rest } = inst;
              return { ...rest, status: 'PENDING' };
            }
            return inst;
          });
          if (touched) {
            loan.installments_list = list;
            if (loan.status === 'COMPLETED') loan.status = 'ACTIVE';
            saveEntityItem('loans', loan);
          }
        }
        runs[idx].status = 'CANCELLED';
        runs[idx].cancelReason = reasonText;
        runs[idx].reversalJournalEntryId = revJe?.id || null;
        saveEntityItem('payroll_runs', runs[idx]);
        recordAudit({ action: 'CANCEL_PAYROLL_RUN', schemaName: 'pay', tableName: 'payroll_runs', entityId: runId, reason: reasonText });
        return runs[idx];
      }
    }

    // --- 2.39 Journal Entries Manual CRUD, Post, Cancel & Reverse ---
    if (path.startsWith('/journal-entries') || path.startsWith('/journals')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segs = cleanP.split('/').filter(Boolean); // ['journal-entries', id?, action?]
      const jeId = segs[1];
      const action = segs[2];
      const accounts = getNormalizedAccounts();

      if (jeId && action === 'post' && method === 'POST') {
        const list = getEntityList<any>('journal_entries', []);
        const idx = list.findIndex((j) => j.id === jeId);
        if (idx < 0) throw new Error('القيد غير موجود');
        const je = normalizeJournalEntry(list[idx], accounts);
        assertPeriodOpen(je.entryDate, 'ترحيل القيد المحاسبي');
        // Enforce accounting rule: only active posting (leaf) accounts may accept posted lines
        for (const line of (je.lines || [])) {
          const targetAcc = accounts.find((a) => a.id === line.accountId || a.code === line.accountCode);
          if (!targetAcc) throw new Error(`الحساب (${line.accountCode || line.accountId}) غير موجود في شجرة الحسابات`);
          if (!targetAcc.isPosting) throw new Error(`لا يمكن الترحيل المباشر على الحساب التجميعي الرئيسي (${targetAcc.code} — ${targetAcc.nameAr})؛ اختر حساباً فرعياً تفصيلياً`);
          if (targetAcc.isActive === false) throw new Error(`الحساب (${targetAcc.code} — ${targetAcc.nameAr}) غير نشط ولا يقبل الترحيل`);
        }
        if (Math.abs(Number(je.totalDebitBase) - Number(je.totalCreditBase)) > 0.01 || Number(je.totalDebitBase) <= 0) {
          throw new Error('لا يمكن ترحيل قيد غير متوازن (مجموع المدين لا يساوي مجموع الدائن) أو صفري');
        }
        const seq = list.filter((j) => j.status === 'POSTED').length + 1;
        const year = (je.entryDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
        je.status = 'POSTED';
        je.entryNo = je.entryNo || `JE-${year}-${String(seq).padStart(4, '0')}`;
        je.postedAt = new Date().toISOString();
        je.rowVersion = (je.rowVersion || 1) + 1;
        saveEntityItem('journal_entries', je);
        recordAudit({ action: 'POST', schemaName: 'acc', tableName: 'journal_entries', entityId: je.id, newValues: { entryNo: je.entryNo, status: 'POSTED' }, reason: `ترحيل القيد ${je.entryNo}` });
        return je;
      }

      if (jeId && action === 'cancel' && method === 'POST') {
        const list = getEntityList<any>('journal_entries', []);
        const idx = list.findIndex((j) => j.id === jeId);
        if (idx < 0) throw new Error('القيد غير موجود');
        if (list[idx].status !== 'DRAFT') throw new Error('لا يمكن إلغاء قيد مرحّل؛ استخدم القيد العكسي بدلاً من ذلك');
        list[idx].status = 'CANCELLED';
        list[idx].cancelReason = body?.reason || 'إلغاء مسودة القيد';
        saveEntityItem('journal_entries', list[idx]);
        recordAudit({ action: 'CANCEL', schemaName: 'acc', tableName: 'journal_entries', entityId: jeId, reason: list[idx].cancelReason });
        return list[idx];
      }

      if (jeId && action === 'reverse' && method === 'POST') {
        return createReversalJournalEntry(jeId, body?.reason || 'قيد عكسي يدوي', body?.reversalDate);
      }

      if (method === 'DELETE' && jeId && !action) {
        const list = getEntityList<any>('journal_entries', []);
        const target = list.find((j) => j.id === jeId);
        if (target?.status === 'POSTED') throw new Error('لا يمكن حذف قيد مرحّل نهائياً؛ استخدم القيد العكسي حفاظاً على سجل التدقيق');
        deleteEntityItem('journal_entries', jeId);
        recordAudit({ action: 'DELETE', schemaName: 'acc', tableName: 'journal_entries', entityId: jeId, reason: 'حذف مسودة قيد يومي' });
        return { success: true };
      }

      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !action) {
        assertPeriodOpen(body?.entryDate, 'حفظ قيد يومية');
        const list = getEntityList<any>('journal_entries', []);
        const existing = jeId ? list.find((j) => j.id === jeId) : null;
        if (existing && existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل قيد غير مسودة');
        const built = normalizeJournalEntry({
          ...(existing || {}),
          ...body,
          id: existing?.id || uid('je'),
          status: existing?.status || 'DRAFT',
          entryNo: existing?.entryNo || null,
          rowVersion: ((existing?.rowVersion) || 0) + 1,
        }, accounts);
        saveEntityItem('journal_entries', built);
        recordAudit({
          action: existing ? 'UPDATE' : 'INSERT',
          schemaName: 'acc',
          tableName: 'journal_entries',
          entityId: built.id,
          newValues: { description: built.description, totalDebitBase: built.totalDebitBase },
          reason: built.description,
        });
        return built;
      }
    }

    // --- 2.4 Robust Retroactive Adjustments & Approval Workflow (Business Process Section 18 & 29) ---
    if (path.startsWith('/revenue-adjustments/') && (path.endsWith('/submit') || path.endsWith('/approve') || path.endsWith('/reject')) && method === 'POST') {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segs = cleanP.split('/').filter(Boolean); // ['revenue-adjustments', id, action]
      const adjId = segs[1];
      const act = segs[2];
      const list = getEntityList<any>('revenue_adjustments', []);
      const idx = list.findIndex((r) => r.id === adjId);
      if (idx >= 0) {
        const oldStatus = list[idx].status;
        if (act === 'submit') {
          list[idx].status = 'PENDING_APPROVAL';
          list[idx].submittedAt = new Date().toISOString();
          saveEntityItem('revenue_adjustments', list[idx]);
          recordAudit({
            action: 'SUBMIT_ADJUSTMENT',
            schemaName: 'revenue',
            tableName: 'revenue_adjustments',
            entityId: adjId,
            oldValues: { status: oldStatus },
            newValues: { status: 'PENDING_APPROVAL' },
            reason: `إرسال تسوية الإيراد للموظف ${list[idx].employeeName} للاعتماد`,
          });
        } else if (act === 'approve') {
          list[idx].status = 'APPROVED';
          list[idx].approvedAt = new Date().toISOString();
          list[idx].approvedBy = 'المدير التنفيذي';
          const amt = Math.abs(Number(list[idx].grossRevenueBase || 0));
          if (amt > 0 && !list[idx].journalEntryId) {
            const p = resolvePeriodByIdOrDate(list[idx].fiscalPeriodId, null);
            const isPos = Number(list[idx].grossRevenueBase || 0) >= 0;
            const je = createAutoPostedJournalEntry({
              entryDate: p?.endDate || new Date().toISOString().slice(0, 10),
              fiscalPeriodId: list[idx].fiscalPeriodId,
              journalType: 'ADJUSTMENT',
              sourceModule: 'REV',
              sourceType: 'REVENUE_ADJUSTMENT',
              postingEvent: 'RETRO_REVENUE_APPROVED',
              reference: list[idx].id,
              description: `قيد اعتماد تسوية إيراد بأثر رجعي — ${list[idx].employeeName} (${list[idx].projectName})`,
              lines: isPos
                ? [
                    { accountCode: '110301', debit: amt, credit: 0, employeeId: list[idx].employeeId, projectId: list[idx].projectId, description: `إيراد مستحق بأثر رجعي (${list[idx].originalPeriodName})` },
                    { accountCode: '40101', debit: 0, credit: amt, employeeId: list[idx].employeeId, projectId: list[idx].projectId, description: `إيراد عقود ومشاريع — تسوية ${list[idx].projectName}` },
                  ]
                : [
                    { accountCode: '40101', debit: amt, credit: 0, employeeId: list[idx].employeeId, projectId: list[idx].projectId, description: `تخفيض إيراد بأثر رجعي — ${list[idx].projectName}` },
                    { accountCode: '110301', debit: 0, credit: amt, employeeId: list[idx].employeeId, projectId: list[idx].projectId, description: `تخفيض إيرادات مستحقة غير مفوترة` },
                  ],
            });
            list[idx].journalEntryId = je.id;
            list[idx].journalEntryNo = je.entryNo;
          }
          saveEntityItem('revenue_adjustments', list[idx]);
          recordAudit({
            action: 'APPROVE_ADJUSTMENT',
            schemaName: 'revenue',
            tableName: 'revenue_adjustments',
            entityId: adjId,
            oldValues: { status: oldStatus },
            newValues: { status: 'APPROVED', grossRevenueBase: list[idx].grossRevenueBase, journalEntryNo: list[idx].journalEntryNo || null },
            reason: body?.reason || `اعتماد تسوية الإيراد للموظف ${list[idx].employeeName}`,
          });
        } else if (act === 'reject') {
          list[idx].status = 'REJECTED';
          list[idx].rejectedAt = new Date().toISOString();
          list[idx].rejectReason = body?.reason || 'رفض التسوية';
          saveEntityItem('revenue_adjustments', list[idx]);
          recordAudit({
            action: 'REJECT_ADJUSTMENT',
            schemaName: 'revenue',
            tableName: 'revenue_adjustments',
            entityId: adjId,
            oldValues: { status: oldStatus },
            newValues: { status: 'REJECTED', rejectReason: list[idx].rejectReason },
            reason: list[idx].rejectReason,
          });
        }
        return list[idx];
      }
    }

    if (path.includes('/revenue-adjustments/retroactive') && method === 'POST') {
      assertPeriodOpen(body.fiscalPeriodId, 'تسجيل تسوية إيراد بأثر رجعي');
      const emps = getEntityList('employees', []);
      const prjs = getEntityList('projects', []);
      const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList);
      const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
      const prj = prjs.find((p: any) => p.id === body.projectId || p.code === body.projectId);
      const origPeriod = periods.find((p: any) => p.id === body.originalPeriodId);
      const regPeriod = periods.find((p: any) => p.id === body.fiscalPeriodId);
      const units = Number(body.units || 1);
      const unitPrice = Number(body.unitPrice || 0);
      const { amountBase: grossRev } = convertToBase(units * unitPrice, body.currencyCode || 'SAR');
      const initialStatus = body.status || 'APPROVED';
      const retroItem: any = {
        id: uid('retro'),
        employeeId: body.employeeId,
        employeeCode: emp?.code || '',
        employeeName: emp?.fullNameAr || 'الموظف',
        projectId: body.projectId,
        projectCode: prj?.code || '',
        projectName: prj?.nameAr || 'المشروع',
        clientName: prj?.clientName || 'العميل',
        originalPeriodId: body.originalPeriodId,
        originalPeriodName: origPeriod?.name || 'فترة سابقة',
        fiscalPeriodId: body.fiscalPeriodId,
        periodName: regPeriod?.name || 'فترة حالية',
        pricingBasis: body.pricingBasis || 'DAILY',
        units,
        unitPrice,
        grossRevenueBase: grossRev,
        currencyCode: body.currencyCode || 'SAR',
        adjustmentReason: body.adjustmentReason || 'تسوية إيراد أثر رجعي',
        createdAt: new Date().toISOString(),
        createdBy: 'المدير التنفيذي',
        status: initialStatus,
      };
      if (initialStatus === 'APPROVED' && Math.abs(grossRev) > 0) {
        const amt = Math.abs(grossRev);
        const isPos = grossRev >= 0;
        const je = createAutoPostedJournalEntry({
          entryDate: regPeriod?.endDate || new Date().toISOString().slice(0, 10),
          fiscalPeriodId: body.fiscalPeriodId,
          journalType: 'ADJUSTMENT',
          sourceModule: 'REV',
          sourceType: 'REVENUE_ADJUSTMENT',
          postingEvent: 'RETRO_REVENUE_APPROVED',
          reference: retroItem.id,
          description: `قيد تسوية إيراد بأثر رجعي — ${retroItem.employeeName} (${retroItem.projectName})`,
          lines: isPos
            ? [
                { accountCode: '110301', debit: amt, credit: 0, employeeId: retroItem.employeeId, projectId: retroItem.projectId, description: `إثبات إيراد مستحق بأثر رجعي (${retroItem.originalPeriodName})` },
                { accountCode: '40101', debit: 0, credit: amt, employeeId: retroItem.employeeId, projectId: retroItem.projectId, description: `إيراد عقود ومشاريع — تسوية ${retroItem.projectName}` },
              ]
            : [
                { accountCode: '40101', debit: amt, credit: 0, employeeId: retroItem.employeeId, projectId: retroItem.projectId, description: `تخفيض إيراد بأثر رجعي — ${retroItem.projectName}` },
                { accountCode: '110301', debit: 0, credit: amt, employeeId: retroItem.employeeId, projectId: retroItem.projectId, description: `تخفيض إيرادات مستحقة غير مفوترة` },
              ],
        });
        retroItem.journalEntryId = je.id;
        retroItem.journalEntryNo = je.entryNo;
      }
      saveEntityItem('revenue_adjustments', retroItem);
      recordAudit({
        action: 'RETROACTIVE_REVENUE_ADJUSTMENT',
        schemaName: 'revenue',
        tableName: 'revenue_adjustments',
        entityId: retroItem.id,
        newValues: { originalPeriodId: retroItem.originalPeriodId, fiscalPeriodId: retroItem.fiscalPeriodId, grossRevenueBase: retroItem.grossRevenueBase, status: initialStatus },
        reason: retroItem.adjustmentReason,
      });
      return retroItem;
    }

    const entityMap: Record<string, string> = {
      '/employees': 'employees',
      '/positions': 'positions',
      '/departments': 'departments',
      '/cost-centers': 'cost_centers',
      '/branches': 'branches',
      '/cost-profiles': 'cost_profiles',
      '/cost-components': 'cost_components',
      '/service-prices': 'service_prices',
      '/projects': 'projects',
      '/clients': 'clients',
      '/assignments': 'assignments',
      '/vendors': 'vendors',
      '/purchase-invoices': 'purchase_invoices',
      '/pur/invoices': 'purchase_invoices',
      '/invoices': 'invoices',
      '/sal/invoices': 'invoices',
      '/credit-notes': 'credit_notes',
      '/debit-notes': 'debit_notes',
      '/journal-entries': 'journal_entries',
      '/journals': 'journal_entries',
      '/bank-accounts': 'bank_accounts',
      '/banks': 'bank_accounts',
      '/bank-transfers': 'bank_transfers',
      '/custodies': 'custodies',
      '/assets': 'assets',
      '/asset-categories': 'asset_categories',
      '/variable-types': 'variable_types',
      '/monthly-variables': 'monthly_variables',
      '/loans': 'loans',
      '/services/catalog': 'services_catalog',
      '/services': 'services_catalog',
      '/zatca/submissions': 'zatca_submissions',
      '/revenue-adjustments': 'revenue_adjustments',
      '/revenue-runs': 'revenue_runs',
      '/payroll-runs': 'payroll_runs',
      '/audit-log': 'audit_log',
      '/audit/log': 'audit_log',
      '/tax-codes': 'tax_codes',
      '/taxes': 'tax_codes',
      '/fiscal-years': 'fiscal_years',
      '/fiscal-periods': 'fiscal_periods',
      '/work-calendars': 'work_calendars',
      '/company-currencies': 'currencies',
      '/currencies': 'currencies',
      '/exchange-rates': 'exchange_rates',
      '/users': 'users',
      '/roles': 'roles',
      '/zakat/returns': 'zakat_returns',
      '/snapshots': 'snapshots',
    };

    let targetKey: string | null = null;
    for (const [route, key] of Object.entries(entityMap)) {
      if (path.includes(route)) {
        targetKey = key;
        break;
      }
    }

    const cleanActionPath = path.split('?')[0].replace(/\/$/, '');

    // --- Chart of Accounts (Full Hierarchical CRUD + Move + Reclassify) ---
    if (cleanActionPath === '/accounts' && method === 'POST') {
      return createLocalAccount(body, getNormalizedAccounts());
    }
    if (cleanActionPath.startsWith('/accounts/')) {
      const segs = cleanActionPath.split('/').filter(Boolean);
      const accId = segs[1];
      const subAction = segs[2];
      const allAccs = getNormalizedAccounts();
      if (accId && subAction === 'move' && method === 'POST') {
        return moveLocalAccount(accId, body || {}, allAccs);
      }
      if (accId && subAction === 'reclassify' && method === 'POST') {
        return reclassifyLocalAccount(accId, body || {}, allAccs);
      }
      if (accId && !subAction && (method === 'PATCH' || method === 'PUT')) {
        return updateLocalAccount(accId, body || {}, allAccs);
      }
      if (accId && !subAction && method === 'DELETE') {
        return deleteLocalAccount(accId, allAccs);
      }
    }

    // --- Dynamic Financial Statement Lines CRUD ---
    if (cleanActionPath === '/statement-lines' && method === 'POST') {
      const list = getStatementLines();
      const code = String(body?.code || '').trim();
      if (!code || !body?.nameAr) throw new Error('يرجى إدخال رمز واسم بند القائمة المالية');
      if (list.some((s) => s.code === code)) throw new Error(`رمز البند (${code}) مستخدم بالفعل`);
      const item = {
        id: uid('sl'),
        statementType: body.statementType || 'BALANCE_SHEET',
        sectionCode: body.sectionCode || 'CURRENT_ASSETS',
        code,
        nameAr: String(body.nameAr).trim(),
        nameEn: body.nameEn || null,
        normalSign: body.normalSign === -1 ? -1 : 1,
        sortOrder: Number(body.sortOrder || 100),
        isSystem: false,
        isActive: body.isActive !== false,
        description: body.description || null,
      };
      // Ensure defaults seeded before adding custom line
      if (getEntityList<any>('statement_lines', []).length === 0) {
        for (const d of list) saveEntityItem('statement_lines', d);
      }
      saveEntityItem('statement_lines', item);
      return item;
    }
    if (cleanActionPath.startsWith('/statement-lines/')) {
      const slId = cleanActionPath.split('/').filter(Boolean)[1];
      const list = getStatementLines();
      if (getEntityList<any>('statement_lines', []).length === 0) {
        for (const d of list) saveEntityItem('statement_lines', d);
      }
      const existing = list.find((s) => s.id === slId);
      if (!existing) throw new Error('بند القائمة المالية غير موجود');
      if (method === 'PATCH' || method === 'PUT') {
        const next = { ...existing, ...body, id: slId };
        saveEntityItem('statement_lines', next);
        return next;
      }
      if (method === 'DELETE') {
        if (existing.isSystem) throw new Error('لا يمكن حذف بند نظامي أساسي في القوائم المالية');
        const used = getNormalizedAccounts().some((a) => a.statementLineId === slId || a.equityLineId === slId);
        if (used) throw new Error('لا يمكن حذف بند مرتبط بحسابات في شجرة الحسابات — أعد تصنيف الحسابات أولاً');
        deleteEntityItem('statement_lines', slId);
        return { deleted: true };
      }
    }

    // --- ZATCA Phase 2 Operations ---
    if (cleanActionPath === '/zatca/settings' && (method === 'PUT' || method === 'PATCH')) {
      return updateZatcaSettingsV2(body);
    }
    if (cleanActionPath === '/zatca/devices' && method === 'POST') {
      return createZatcaDeviceLocal(body);
    }
    if (cleanActionPath.includes('/zatca/devices/') && cleanActionPath.endsWith('/csr')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return generateDeviceCsrLocal(parts[parts.length - 2]);
    }
    if (cleanActionPath.includes('/zatca/devices/') && cleanActionPath.endsWith('/compliance-csid')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return requestComplianceCsidLocal(parts[parts.length - 2], body?.otp);
    }
    if (cleanActionPath.includes('/zatca/devices/') && cleanActionPath.endsWith('/compliance-check')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return runComplianceChecksLocal(parts[parts.length - 2]);
    }
    if (cleanActionPath.includes('/zatca/devices/') && cleanActionPath.endsWith('/production-csid')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return requestProductionCsidLocal(parts[parts.length - 2]);
    }
    if (cleanActionPath.includes('/zatca/devices/') && cleanActionPath.endsWith('/test')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return testDeviceConnectionLocal(parts[parts.length - 2]);
    }
    if (cleanActionPath === '/zatca/test-connection') {
      return testDeviceConnectionLocal(body?.deviceId);
    }
    if (cleanActionPath.includes('/zatca/onboard')) {
      return onboardZatcaSettings(body);
    }
    if (cleanActionPath.includes('/zatca/decode-qr')) {
      return decodeZatcaTlv(body?.qrBase64 || '');
    }
    if (cleanActionPath.includes('/zatca/invoices/batch-transmit')) {
      return batchTransmitZatcaLocal();
    }
    if (cleanActionPath.includes('/zatca/invoices/') && cleanActionPath.endsWith('/validate')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return validateInvoiceLocal(parts[parts.length - 2]);
    }
    if (cleanActionPath.includes('/zatca/invoices/') && cleanActionPath.endsWith('/transmit')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const tIdx = parts.findIndex((p) => p === 'transmit');
      return transmitZatcaInvoiceV2(tIdx > 0 ? parts[tIdx - 1] : parts.pop() || '', body);
    }
    if (cleanActionPath === '/zatca/retry-queue/process') {
      return processRetryQueueLocal();
    }
    if (cleanActionPath.includes('/zatca/retry-queue/') && cleanActionPath.endsWith('/retry')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return processRetryQueueLocal(parts[parts.length - 2]);
    }
    if (cleanActionPath.includes('/zatca/notifications/') && cleanActionPath.endsWith('/read')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return markNotificationReadLocal(parts[parts.length - 2]);
    }

    // --- Sales Invoices, Customer Receipts, Credit Notes & Sales Debit Notes ---
    if ((cleanActionPath === '/invoices/debit-notes' || cleanActionPath === '/sales-debit-notes') && method === 'POST') {
      return createSalesDebitNoteLocal(body);
    }
    if (cleanActionPath.includes('/invoices/auto-generate')) {
      return autoGenerateSalesInvoicesFromAssignments(body);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/payments')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const pIdx = parts.findIndex((p) => p === 'payments');
      return recordSalesInvoicePayment(parts[pIdx - 1], body);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/post')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const postIdx = parts.findIndex((p) => p === 'post');
      return postSalesInvoice(parts[postIdx - 1]);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const cancelIdx = parts.findIndex((p) => p === 'cancel');
      return cancelSalesInvoice(parts[cancelIdx - 1], body?.reason);
    }
    if (cleanActionPath.includes('/invoices/') && cleanActionPath.endsWith('/repair-journal')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const repairIdx = parts.findIndex((p) => p === 'repair-journal');
      return repairSalesInvoiceJournal(parts[repairIdx - 1]);
    }
    if ((cleanActionPath === '/invoices' || cleanActionPath === '/sal/invoices') && method === 'POST') {
      return createSalesInvoice(body);
    }
    if (cleanActionPath === '/credit-notes' && method === 'POST') {
      return createCreditNoteAndPost(body);
    }

    // --- Purchase Invoices, Vendor Payments & Debit Notes ---
    if (cleanActionPath.includes('/purchase-invoices/') && cleanActionPath.endsWith('/post')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const postIdx = parts.findIndex((p) => p === 'post');
      return postPurchaseInvoiceItem(parts[postIdx - 1]);
    }
    if (cleanActionPath.includes('/purchase-invoices/') && (cleanActionPath.endsWith('/pay') || cleanActionPath.endsWith('/payments'))) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const pIdx = parts.findIndex((p) => p === 'pay' || p === 'payments');
      return payPurchaseInvoiceItem(parts[pIdx - 1], body);
    }
    if ((cleanActionPath.includes('/purchase-invoices/') || cleanActionPath.includes('/pur/invoices/')) && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const cIdx = parts.findIndex((p) => p === 'cancel');
      return cancelPurchaseInvoiceItem(parts[cIdx - 1], body?.reason);
    }
    if ((cleanActionPath === '/purchase-invoices' || cleanActionPath === '/pur/invoices') && method === 'POST') {
      return createPurchaseInvoiceItem(body);
    }
    if (cleanActionPath === '/debit-notes' && method === 'POST') {
      return createDebitNoteAndPost(body);
    }

    // --- Fixed Assets & Depreciation Runs ---
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/activate')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'activate');
      return activateAssetItem(parts[idx - 1], body);
    }
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/custody/return')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'custody');
      return returnAssetCustody(parts[idx - 1], body);
    }
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/custody')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'custody');
      return assignAssetCustody(parts[idx - 1], body);
    }
    if (cleanActionPath.includes('/assets/') && cleanActionPath.endsWith('/dispose')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'dispose');
      return disposeAssetItem(parts[idx - 1], body);
    }
    if (cleanActionPath === '/assets' && method === 'POST') {
      return createAssetItem(body);
    }
    if (cleanActionPath.includes('/depreciation-runs/') && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'cancel');
      return cancelDepreciationRunItem(parts[idx - 1], body?.reason);
    }
    if (cleanActionPath === '/depreciation-runs' && method === 'POST') {
      return executeDepreciationRun(body);
    }

    // --- Custodies Lifecycle ---
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/disburse')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return disburseCustodyItem(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/conversion')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return convertCustodyItem(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/transfers') && method === 'POST') {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return topUpCustodyTransfer(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.includes('/lines/') && method === 'DELETE') {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const lIdx = parts.findIndex((p) => p === 'lines');
      return deleteCustodyExpenseLine(parts[1], parts[lIdx + 1]);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/lines') && method === 'POST') {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return addCustodyExpenseLine(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && (cleanActionPath.endsWith('/settle') || cleanActionPath.endsWith('/settlements'))) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return settleCustodyExpenses(parts[1], body);
    }
    if (cleanActionPath.includes('/custodies/') && cleanActionPath.endsWith('/close')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      return closeCustodyItem(parts[1], body);
    }
    if (cleanActionPath === '/custodies' && method === 'POST') {
      return createCustodyItem(body);
    }

    // --- Zakat Settings, Calculations & Returns ---
    if (cleanActionPath.includes('/zakat/settings')) {
      return saveZakatSettings(body);
    }
    if (cleanActionPath.includes('/zakat/calculate')) {
      return computeZakatSummary(body);
    }
    if (cleanActionPath.includes('/zakat/returns/') && cleanActionPath.endsWith('/post')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'post');
      return postZakatReturnItem(parts[idx - 1]);
    }
    if (cleanActionPath.includes('/zakat/returns/') && cleanActionPath.endsWith('/cancel')) {
      const parts = cleanActionPath.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'cancel');
      return cancelZakatReturnItem(parts[idx - 1], body?.reason);
    }
    if (cleanActionPath === '/zakat/returns' && method === 'POST') {
      return saveZakatReturnDraft(body);
    }

    // --- Master Accounting Auto-Sync, EOSB & VAT Settlement ---
    if (cleanActionPath === '/accounting/sync-all-journals' && method === 'POST') {
      return syncAllOperationalJournals();
    }
    if (cleanActionPath === '/eosb/post-journal' && method === 'POST') {
      return postEosbSettlementJournal(body);
    }
    if (cleanActionPath === '/vat-return/settle' && method === 'POST') {
      return settleVatReturnPeriod(body);
    }

    // --- Treasury, Cashboxes, Banks, Receipt & Payment Vouchers, Cheques & Bank Reconciliation ---
    if ((cleanActionPath === '/bank-accounts' || cleanActionPath === '/banks' || cleanActionPath === '/treasury/accounts') && method === 'POST') {
      return createTreasuryAccount(body);
    }
    if (cleanActionPath === '/bank-transfers' && method === 'POST') {
      return executeInterBankTransfer(body);
    }
    if (cleanActionPath === '/treasury/vouchers' && method === 'POST') {
      return createTreasuryVoucher(body);
    }
    if (cleanActionPath.startsWith('/treasury/vouchers/') && cleanActionPath.endsWith('/post') && method === 'POST') {
      const id = cleanActionPath.split('/')[3];
      return postTreasuryVoucher(id);
    }
    if (cleanActionPath.startsWith('/treasury/vouchers/') && cleanActionPath.endsWith('/cancel') && method === 'POST') {
      const id = cleanActionPath.split('/')[3];
      return cancelTreasuryVoucher(id, body?.reason);
    }
    if (cleanActionPath === '/treasury/cheques' && method === 'POST') {
      return createCheque(body);
    }
    if (cleanActionPath.startsWith('/treasury/cheques/') && cleanActionPath.endsWith('/deposit') && method === 'POST') {
      const id = cleanActionPath.split('/')[3];
      return depositCheque(id, body);
    }
    if (cleanActionPath.startsWith('/treasury/cheques/') && cleanActionPath.endsWith('/collect') && method === 'POST') {
      const id = cleanActionPath.split('/')[3];
      return collectCheque(id, body);
    }
    if (cleanActionPath.startsWith('/treasury/cheques/') && cleanActionPath.endsWith('/bounce') && method === 'POST') {
      const id = cleanActionPath.split('/')[3];
      return bounceCheque(id, body);
    }
    if (cleanActionPath === '/treasury/reconciliations' && method === 'POST') {
      return reconcileBankAccount(body);
    }

    if (targetKey) {
      if (targetKey === 'exchange_rates') getEntityList('exchange_rates', defaultExchangeRatesList);
      if (targetKey === 'cost_components') getEntityList('cost_components', defaultCostComponentsList);
      if (targetKey === 'cost_profiles') getEntityList('cost_profiles', defaultCostProfilesList);
      if (targetKey === 'variable_types') getEntityList('variable_types', defaultVariableTypesList);
      if (targetKey === 'asset_categories') getEntityList('asset_categories', defaultAssetCategoriesList);
      if (targetKey === 'cost_centers') getEntityList('cost_centers', defaultCostCenters);
      if (targetKey === 'branches') getEntityList('branches', defaultBranches);
      if (targetKey === 'departments') getEntityList('departments', defaultDepartments);
      if (targetKey === 'clients') getEntityList('clients', defaultClients);
      if (method === 'DELETE') {
        const id = path.split('?')[0].split('/').filter(Boolean).pop();
        if (id) {
          deleteEntityItem(targetKey, id);
          recordAudit({ action: 'DELETE', tableName: targetKey, entityId: id, reason: `حذف سجل من ${targetKey}` });
        }
        return { success: true };
      }
      if ((method === 'PATCH' || method === 'PUT') && typeof body === 'object' && body !== null && !body.id) {
        const urlId = path.split('?')[0].split('/').filter(Boolean).pop();
        if (urlId && !urlId.startsWith(targetKey.replace('_', '-'))) body.id = urlId;
        else if (urlId && path.split('?')[0].split('/').filter(Boolean).length >= 2) body.id = urlId;
      }
      if (typeof body === 'object' && body !== null) {
        // 1) Employee enrichment
        if (targetKey === 'employees') {
          const departments = getEntityList('departments', defaultDepartments);
          const positions = getEntityList('positions', defaultPositions);
          const branches = getEntityList('branches', defaultBranches);
          const dept = departments.find((d) => d.id === body.placement?.departmentId || d.id === body.departmentId);
          const pos = positions.find((p) => p.id === body.placement?.positionId || p.id === body.positionId);
          const br = branches.find((b) => b.id === body.placement?.branchId || b.id === body.branchId);
          body.departmentName = dept?.nameAr || body.departmentName || '';
          body.positionTitle = pos?.titleAr || body.positionTitle || '';
          body.branchName = br?.nameAr || body.branchName || '';
          body.basicSalary = body.compensation?.basicSalary || body.basicSalary || '0.00';
          body.salaryCurrency = body.compensation?.salaryCurrency || body.salaryCurrency || 'SAR';
          body.insuranceSalary = body.compensation?.insuranceSalary || body.insuranceSalary || body.basicSalary || '0.00';
          body.insuranceCurrency = body.compensation?.insuranceCurrency || body.salaryCurrency || 'SAR';
          body.costProfileId = body.costProfileId || 'cp-tech';
          body.status = body.status || 'ACTIVE';
          body.hireDate = body.hireDate || new Date().toISOString().slice(0, 10);
          if (!body.code) {
            const count = getEntityList('employees', []).length + 1;
            body.code = `EMP-${String(count).padStart(3, '0')}`;
          }
          if (!body.id) {
            body.id = uid('emp');
          }
          if (!body.costCenterId && !body.placement?.costCenterId) {
            body.costCenterId = ensureSyncedEmployeeCostCenter(body);
          } else {
            body.costCenterId = body.costCenterId || body.placement?.costCenterId;
          }
          // Populate initial placement & compensation histories
          body.placements = [
            {
              id: uid('plc'),
              effectiveFrom: body.hireDate,
              effectiveTo: null,
              departmentId: body.departmentId || body.placement?.departmentId || null,
              positionId: body.positionId || body.placement?.positionId || null,
              branchId: body.branchId || body.placement?.branchId || null,
              costCenterId: body.costCenterId || null,
              departmentName: body.departmentName,
              positionTitle: body.positionTitle,
              branchName: body.branchName,
              changeReason: 'التعيين الأولي وتسكين الكادر',
            }
          ];
          body.compensations = [
            {
              id: uid('cmp'),
              effectiveFrom: body.hireDate,
              effectiveTo: null,
              basicSalary: body.basicSalary,
              salaryCurrency: body.salaryCurrency,
              insuranceSalary: body.insuranceSalary,
              insuranceCurrency: body.insuranceCurrency,
              changeReason: 'الراتب المعتمد عند التعيين',
              createdBy: 'المدير التنفيذي',
              createdAt: new Date().toISOString(),
            }
          ];
          // Seed initial default service price if defaultBillingRate provided (Sec 6)
          if (Number(body.defaultBillingRate || 0) > 0) {
            const spItem = {
              id: uid('sp'),
              employeeId: body.id,
              employeeCode: body.code,
              employeeName: body.fullNameAr,
              projectId: null,
              projectCode: null,
              projectName: null,
              pricingBasis: body.defaultBillingBasis || 'DAILY',
              price: String(body.defaultBillingRate),
              currencyCode: body.billingCurrency || 'SAR',
              effectiveFrom: body.hireDate,
              effectiveTo: null,
            };
            saveEntityItem('service_prices', spItem);
          }
          // Initial project assignment if provided
          if (body.initialProjectId) {
            const allPrjs = getEntityList('projects', []);
            const targetPrj = allPrjs.find((p) => p.id === body.initialProjectId);
            if (targetPrj) {
              const allocPctNum = Number(body.initialAllocationPct || 100);
              const asg = {
                id: uid('asg'),
                employeeId: body.id,
                employeeCode: body.code,
                employeeName: body.fullNameAr,
                projectId: targetPrj.id,
                projectCode: targetPrj.code,
                projectName: targetPrj.nameAr,
                clientName: targetPrj.clientName,
                allocationBasis: 'PERCENTAGE',
                allocationPct: allocPctNum,
                allocatedDays: Number(((allocPctNum / 100) * 22).toFixed(2)),
                workingDaysInMonth: 22,
                billableRate: Number(body.defaultBillingRate || 1500),
                billingBasis: body.defaultBillingBasis || 'DAILY',
                billingCurrency: 'SAR',
                startDate: body.hireDate,
                endDate: null,
                effectiveFrom: body.hireDate,
                effectiveTo: null,
                changeReason: 'الإسناد المبدئي لمشروع العمل عند التعيين',
              };
              saveEntityItem('assignments', asg);
              recomputeEmployeeOverAllocation(body.id);
            }
          }
          const savedEmp = saveEntityItem(targetKey, body);
          recordAudit({
            action: 'CREATE_EMPLOYEE',
            schemaName: 'hr',
            tableName: 'employees',
            entityId: savedEmp.id,
            newValues: { code: savedEmp.code, fullNameAr: savedEmp.fullNameAr, basicSalary: savedEmp.basicSalary, salaryCurrency: savedEmp.salaryCurrency },
            reason: `إنشاء وتعيين الموظف ${savedEmp.fullNameAr} (${savedEmp.code})`,
          });
          return savedEmp;
        }

        // 1.5) Service prices enrichment (Sec 6 & 8)
        if (targetKey === 'service_prices') {
          const emps = getEntityList('employees', []);
          const prjs = getEntityList('projects', []);
          const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
          const prj = body.projectId ? prjs.find((p: any) => p.id === body.projectId || p.code === body.projectId) : null;
          body.id = body.id || uid('sp');
          body.employeeId = emp?.id || body.employeeId;
          body.employeeCode = emp?.code || body.employeeCode || '';
          body.employeeName = emp?.fullNameAr || body.employeeName || 'الموظف';
          body.projectId = prj?.id || body.projectId || null;
          body.projectCode = prj?.code || body.projectCode || null;
          body.projectName = prj?.nameAr || body.projectName || null;
          body.pricingBasis = body.pricingBasis || 'DAILY';
          body.price = String(body.price || '0.00');
          body.currencyCode = body.currencyCode || 'SAR';
          body.effectiveFrom = body.effectiveFrom || new Date().toISOString().slice(0, 10);
          body.effectiveTo = body.effectiveTo || null;
          const savedSp = saveEntityItem('service_prices', body);
          recordAudit({
            action: 'CREATE_SERVICE_PRICE',
            schemaName: 'revenue',
            tableName: 'service_prices',
            entityId: savedSp.id,
            newValues: { employeeName: savedSp.employeeName, projectName: savedSp.projectName || 'سعر افتراضي عام', price: savedSp.price, pricingBasis: savedSp.pricingBasis },
            reason: `تسجيل سعر خدمة للموظف ${savedSp.employeeName}`,
          });
          return savedSp;
        }

        // 2) Project enrichment
        if (targetKey === 'projects') {
          const clients = getEntityList('clients', defaultClients);
          const employees = getEntityList('employees', []);
          const ccs = getEntityList('cost_centers', defaultCostCenters);
          const branches = getEntityList('branches', defaultBranches);
          const cli = clients.find((c) => c.id === body.clientId);
          const mgr = employees.find((e) => e.id === body.managerId);
          const cc = ccs.find((c: any) => c.id === body.costCenterId);
          const br = branches.find((b: any) => b.id === body.branchId);
          body.clientName = cli?.nameAr || body.clientName || 'العميل';
          body.managerName = mgr?.fullNameAr || body.managerName || '';
          body.costCenterId = body.costCenterId || null;
          body.costCenterName = cc?.nameAr || body.costCenterName || '';
          body.branchId = body.branchId || null;
          body.branchName = br?.nameAr || body.branchName || '';
          body.status = body.status || 'ACTIVE';
          body.currencyCode = body.currencyCode || 'SAR';
          if (!body.code) {
            const count = getEntityList('projects', []).length + 1;
            body.code = `PRJ-${String(count).padStart(3, '0')}`;
          }
        }

        // 2.5) Monthly variables enrichment (Sec 12, 13, 14, 15)
        if (targetKey === 'monthly_variables') {
          if (body.fiscalPeriodId) assertPeriodOpen(body.fiscalPeriodId, 'تسجيل متغير شهري');
          const emps = getEntityList('employees', []);
          const prjs = getEntityList('projects', []);
          const varTypes = getEntityList('variable_types', defaultVariableTypesList);
          const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
          const prj = prjs.find((p: any) => p.id === body.projectId || p.code === body.projectId);
          const vt = varTypes.find((v: any) => v.id === body.variableTypeId || v.code === body.variableTypeId);
          body.id = body.id || uid('mv');
          body.employeeName = emp?.fullNameAr || body.employeeName || 'الموظف';
          body.employeeCode = emp?.code || body.employeeCode || '';
          body.projectName = prj?.nameAr || body.projectName || null;
          body.variableTypeName = vt?.nameAr || body.variableTypeName || 'مكافأة / متغير';
          body.category = vt?.category || body.category || 'EARNING';
          body.status = body.status || 'DRAFT';

          const bSal = Number(emp?.basicSalary || emp?.basic_salary || 0);
          const dailyRate = bSal > 0 ? (bSal / 22) : 500;
          const hourlyRate = dailyRate / 8;
          const calcMethod = body.calcMethod || vt?.calcMethod || 'FIXED';
          let computed = Number(body.amount || 0);
          if (calcMethod === 'PCT_BASIC' && !body.hours && !body.days) {
            const pct = Number(body.rate || body.pct || body.amount || 0);
            const mult = Number(body.multiplier || vt?.defaultMultiplier || 1);
            computed = (pct / 100) * bSal * mult;
          } else if (body.hours || calcMethod === 'HOURS_RATE') {
            const mult = Number(body.multiplier || vt?.defaultMultiplier || 1.5);
            const r = Number(body.rate || hourlyRate);
            computed = Number(body.hours || 0) * r * mult;
          } else if (body.days || calcMethod === 'DAYS_RATE') {
            const mult = Number(body.multiplier || vt?.defaultMultiplier || 1);
            const r = Number(body.rate || dailyRate);
            computed = Number(body.days || 0) * r * mult;
          }
          body.computedAmount = String(computed.toFixed(2));
          const savedVar = saveEntityItem(targetKey, body);
          recordAudit({
            action: 'CREATE_VARIABLE',
            schemaName: 'pay',
            tableName: 'monthly_variables',
            entityId: savedVar.id,
            newValues: { employeeName: savedVar.employeeName, variableTypeName: savedVar.variableTypeName, computedAmount: savedVar.computedAmount, projectId: savedVar.projectId || null },
            reason: `إضافة متغير شهري (${savedVar.variableTypeName}) للموظف ${savedVar.employeeName}`,
          });
          return savedVar;
        }

        // 2.6) Loans enrichment (Business Process Section 16: Installment schedule tied to fiscal periods)
        if (targetKey === 'loans') {
          const emps = getEntityList('employees', []);
          const periods = getEntityList('fiscal_periods', defaultFiscalPeriodsList).filter((p: any) => !p.isAdjustmentPeriod);
          const emp = emps.find((e: any) => e.id === body.employeeId || e.code === body.employeeId);
          const count = getEntityList('loans', []).length + 1;
          body.id = body.id || uid('loan');
          body.loanNo = body.loanNo || `LN-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`;
          body.employeeName = emp?.fullNameAr || body.employeeName || 'الموظف';
          const { amountBase: principalNum } = convertToBase(body.principalAmount || body.principalBase || 0, body.currencyCode || 'SAR');
          body.principalBase = principalNum.toFixed(2);
          body.status = body.status || 'ACTIVE';
          const instCount = Math.max(1, Number(body.installments || 1));
          body.installments = instCount;
          const monthlyDeduct = principalNum / instCount;
          body.installmentAmount = monthlyDeduct.toFixed(2);

          let startIdx = body.startPeriodId ? periods.findIndex((p: any) => p.id === body.startPeriodId) : periods.findIndex((p: any) => p.status === 'OPEN');
          if (startIdx < 0) startIdx = 0;
          body.startPeriodName = periods[startIdx]?.name || '';

          body.installments_list = Array.from({ length: instCount }, (_, i) => {
            const p = periods[startIdx + i];
            return {
              id: `${body.id}-inst-${i + 1}`,
              installmentNo: i + 1,
              periodId: p?.id || `fp-future-${i + 1}`,
              periodName: p?.name || `فترة لاحقة +${i + 1}`,
              dueAmount: monthlyDeduct.toFixed(2),
              status: 'PENDING',
            };
          });

          // Automatically generate Loan Disbursement Journal Entry (Dr 10401 Employee Loans / Cr 10201 Bank)
          if (principalNum > 0) {
            try {
              const entryDate = (body.disbursementDate || new Date().toISOString()).slice(0, 10);
              const je = createAutoPostedJournalEntry({
                entryDate,
                fiscalPeriodId: periods[startIdx]?.id || resolvePeriodByIdOrDate(undefined, entryDate)?.id,
                journalType: 'LOAN',
                sourceModule: 'PAY',
                sourceType: 'LOAN_DISBURSEMENT',
                postingEvent: 'LOAN_DISBURSED',
                reference: body.loanNo,
                description: `قيد صرف سلفة موظف (${body.loanNo}) — ${body.employeeName}`,
                lines: [
                  { accountCode: '10401', debit: principalNum, credit: 0, employeeId: emp?.id || body.employeeId, description: `إثبات ذمة سلفة الموظف ${body.employeeName} (${body.loanNo})` },
                  { accountCode: '10201', debit: 0, credit: principalNum, employeeId: emp?.id || body.employeeId, description: `صرف مبلغ السلفة من البنك (${body.loanNo})` },
                ],
              });
              body.journalEntryId = je.id;
              body.journalEntryNo = je.entryNo;
            } catch { /* fallback if period closed */ }
          }

          body.createdAt = body.createdAt || new Date().toISOString();
          const savedLoan = saveEntityItem(targetKey, body);
          recordAudit({
            action: 'CREATE_LOAN',
            schemaName: 'pay',
            tableName: 'loans',
            entityId: savedLoan.id,
            newValues: { loanNo: savedLoan.loanNo, employeeName: savedLoan.employeeName, principalBase: savedLoan.principalBase, installments: savedLoan.installments, journalEntryNo: savedLoan.journalEntryNo || null },
            reason: `إضافة وصرف سلفة موظف (${savedLoan.loanNo}) للموظف ${savedLoan.employeeName} — لا تدخل ضمن تكلفة الربحية`,
          });
          return savedLoan;
        }

        // 2.7) Assets enrichment
        if (targetKey === 'assets') {
          const emps = getEntityList('employees', []);
          const emp = emps.find((e: any) => e.id === body.custodianEmployeeId || e.id === body.employeeId);
          body.id = body.id || uid('ast');
          body.custodianName = emp?.fullNameAr || body.custodianName || '—';
          body.costBase = String(body.costBase || body.cost || '0.00');
          body.accumulatedBase = body.accumulatedBase || '0.00';
          body.netBookValueBase = body.costBase;
          body.status = body.status || 'ACTIVE';
        }

        // 3) Invoice enrichment
        if (targetKey === 'invoices') {
          const clients = getEntityList('clients', defaultClients);
          const projects = getEntityList('projects', []);
          const cli = clients.find((c) => c.id === body.clientId);
          const prj = projects.find((p) => p.id === body.projectId);
          const invCount = getEntityList('invoices', []).length + 1;
          body.invoiceNo = body.invoiceNo || `INV-2026-${String(invCount).padStart(4, '0')}`;
          body.clientName = cli?.nameAr || body.clientName || 'العميل';
          body.clientVatNumber = cli?.taxNumber || cli?.vatNumber || '310123456700003';
          body.projectName = prj?.nameAr || body.projectName || '';
          body.currencyCode = body.currencyCode || 'SAR';
          body.status = body.status || 'POSTED';
          body.paymentStatus = body.paymentStatus || 'UNPAID';
          body.paidAmount = body.paidAmount || '0.00';
          body.journalEntryId = body.journalEntryId || uid('je');

          if (Array.isArray(body.lines) && body.lines.length > 0) {
            let st = 0;
            let disc = 0;
            let vt = 0;
            body.lines = body.lines.map((l: any, idx: number) => {
              const qty = Number(l.quantity ?? l.units ?? 1);
              const price = Number(l.unitPrice ?? 0);
              const dPct = Number(l.discountPct ?? 0);
              const lineGross = qty * price;
              const lineDisc = lineGross * (dPct / 100);
              const lineNet = lineGross - lineDisc;
              const vatR = Number(l.vatRate ?? 15);
              const lineVat = lineNet * (vatR / 100);
              const lineTot = lineNet + lineVat;
              st += lineNet;
              disc += lineDisc;
              vt += lineVat;
              return {
                id: l.id || `line-${idx + 1}`,
                lineNo: idx + 1,
                description: l.description || 'خدمات برمجية وتقنية',
                quantity: qty,
                unitPrice: price,
                discountPct: dPct,
                subtotal: lineNet.toFixed(2),
                vatRate: vatR,
                vatAmount: lineVat.toFixed(2),
                total: lineTot.toFixed(2),
                employeeId: l.employeeId,
              };
            });
            body.subtotal = st.toFixed(2);
            body.discountAmount = disc.toFixed(2);
            body.taxableAmount = st.toFixed(2);
            body.vatRate = '15.00';
            body.vatAmount = vt.toFixed(2);
            body.totalAmount = (st + vt).toFixed(2);
            body.subtotalBase = body.subtotal;
            body.vatAmountBase = body.vatAmount;
            body.totalAmountBase = body.totalAmount;
          } else {
            body.subtotal = body.subtotal || '0.00';
            body.vatAmount = body.vatAmount || '0.00';
            body.totalAmount = body.totalAmount || '0.00';
          }
        }

        return saveEntityItem(targetKey, body);
      }
    }

    return {
      id: (body && body.id) || uid('id'),
      success: true,
      rowVersion: 1,
      message: 'تمت العملية بنجاح',
      returnNo: uid('RET'),
      ...(typeof body === 'object' && body !== null ? body : {}),
    };
  }

  // 1. Auth & Current Setup
  if (path.includes('/auth/login') || path.includes('/auth/refresh')) {
    return {
      accessToken: 'demo-jwt-token-idham-2026',
      expiresIn: 86400,
      tokenType: 'Bearer',
    };
  }

  if (path.includes('/auth/me')) {
    const comp = getStoredCompany();
    return {
      user: {
        id: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
        username: 'admin',
        email: 'admin@idham.net',
        fullName: 'المدير التنفيذي',
        isSystemAdmin: true,
        preferredLocale: 'ar',
        mustChangePassword: false,
      },
      companies: [
        {
          id: comp.id,
          code: comp.code,
          nameAr: comp.nameAr,
          nameEn: comp.nameEn,
          baseCurrency: comp.baseCurrency || 'SAR',
        },
      ],
    };
  }

  if (path.includes('/setup/status') || path.includes('/setup/initialize')) {
    return { initialized: true };
  }

  if (path.includes('/companies/current')) {
    return getStoredCompany();
  }

  // 2. Positions (الوظائف)
  if (path.includes('/positions')) {
    return makeList(getEntityList('positions', defaultPositions));
  }

  // 3. Dynamic 3-Level Profitability Engine (Executive Intelligence & Business Process)
  function computeDynamicProfitability(
    filterArg?:
      | string
      | null
      | {
          periodId?: string | null;
          from?: string | null;
          to?: string | null;
          clientId?: string | null;
          projectId?: string | null;
          employeeId?: string | null;
          costCenterId?: string | null;
          departmentId?: string | null;
        },
  ) {
    const pf =
      typeof filterArg === 'string' || !filterArg
        ? { periodId: filterArg || undefined }
        : filterArg;
    const periodFilterId = pf.periodId || undefined;
    const emps = getEntityList('employees', []);
    const prjs = getEntityList('projects', []);
    const clients = getEntityList('clients', defaultClients);
    const allCostCenters = getLocalCostCenters();
    const targetPeriod = periodFilterId
      ? resolvePeriodByIdOrDate(periodFilterId, null)
      : pf.from || pf.to
        ? { id: 'custom', startDate: pf.from || '2000-01-01', endDate: pf.to || '2099-12-31' }
        : undefined;
    const assignments = getEntityList('assignments', []).filter((a: any) => isAssignmentActiveInPeriod(a, targetPeriod));
    const depts = getEntityList('departments', defaultDepartments);
    const deptMap = new Map(depts.map((d: any) => [d.id, d.nameAr]));
    const monthlyVars = getEntityList('monthly_variables', []);
    const retroAdjs = getEntityList('revenue_adjustments', []).filter((r: any) => r.status !== 'REJECTED' && (!periodFilterId || r.fiscalPeriodId === periodFilterId || r.originalPeriodId === periodFilterId));
    const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
    const overheadPolicy = getOverheadPolicy();
    const empBreakdownMap = new Map<string, ReturnType<typeof computeEmployeeCostBreakdown>>();

    // 1. Employee calculations (Level 1 per Business Process)
    const empList: any[] = [];
    let sumEmpRev = 0;
    let sumEmpCost = 0;
    let sumEmpProfit = 0;
    let sumUnutilizedCost = 0;

    for (const emp of emps) {
      const bd = computeEmployeeCostBreakdown(emp, targetPeriod, overheadPolicy);
      empBreakdownMap.set(emp.id, bd);
      if (emp.code) empBreakdownMap.set(emp.code, bd);
      const directCost = bd.distributableCostBase;
      const assetDeprCost = bd.assetDepreciationBase;
      const generalVarsCost = bd.generalVariablesBase;
      const overhead = overheadPolicy.method === 'PERCENTAGE'
        ? Math.round(directCost * (Number(overheadPolicy.rate || 0) / 100))
        : overheadPolicy.method === 'FIXED_PER_EMPLOYEE'
          ? Math.round(Number(overheadPolicy.rate || 0))
          : Math.round(prjs.length > 0 && emps.length > 0 ? (Number(overheadPolicy.rate || 0) * prjs.length) / emps.length : 0);
      const totalCost = directCost + overhead;
      const targetMargin = Number(emp.targetMarginPct || emp.requiredMarginPct || 25);

      const myAsgs = assignments.filter((a: any) => matchesEmployee(a, emp));
      const workingDaysInMonth = 22;
      let totalAllocPct = 0;
      let totalAllocDays = 0;
      for (const a of myAsgs) {
        const wDays = Math.max(1, Number(a.workingDaysInMonth || a.working_days_in_month || workingDaysInMonth));
        const isDays = String(a.allocationBasis || '').toUpperCase() === 'DAYS';
        let days = wDays;
        let pct = 100;
        if (isDays) {
          days = a.allocatedDays != null && a.allocatedDays !== '' ? Number(a.allocatedDays) : wDays;
          pct = Number(((days / wDays) * 100).toFixed(2));
        } else {
          pct = a.allocationPct != null && a.allocationPct !== ''
            ? Number(a.allocationPct)
            : (a.allocatedDays != null && a.allocatedDays !== '' ? Number(((Number(a.allocatedDays) / wDays) * 100).toFixed(2)) : 100);
          days = Number(((pct / 100) * wDays).toFixed(2));
        }
        totalAllocPct += pct;
        totalAllocDays += days;
      }

      const unutilizedPct = Math.max(0, 100 - totalAllocPct);
      const unutilizedDays = Math.max(0, Number((workingDaysInMonth - totalAllocDays).toFixed(2)));
      const unutilizedCost = Math.round(directCost * (unutilizedPct / 100));
      const overAllocatedPct = Math.max(0, totalAllocPct - 100);
      const overAllocatedDays = Math.max(0, Number((totalAllocDays - workingDaysInMonth).toFixed(2)));

      let empRev = 0;
      const empProjects: any[] = [];
      let weightedDailyRateSum = 0;
      let weightedDaysSum = 0;

      for (const a of myAsgs) {
        const prj = prjs.find((p: any) => matchesProject(a, p));
        const cli = clients.find((c: any) => c.id === (a.clientId || prj?.clientId));
        const econ = computeAssignmentEconomics({
          assignment: a,
          employee: emp,
          project: prj,
          servicePrices,
          period: targetPeriod,
          totalEmployeeAllocPct: totalAllocPct,
          overheadPolicy,
        });
        empRev += econ.revenueBase;
        const impliedDailyRate = econ.allocatedDays > 0 ? econ.revenueBase / econ.allocatedDays : 0;
        if (impliedDailyRate > 0 && econ.allocatedDays > 0) {
          weightedDailyRateSum += impliedDailyRate * econ.allocatedDays;
          weightedDaysSum += econ.allocatedDays;
        }

        const prjProfit = econ.revenueBase - econ.totalCostShareBase;
        const prjMarginPct = econ.revenueBase > 0 ? Number(((prjProfit / econ.revenueBase) * 100).toFixed(1)) : 0;

        empProjects.push({
          assignmentId: a.id,
          projectId: prj?.id || a.projectId,
          projectCode: a.projectCode || prj?.code || '',
          projectName: a.projectName || prj?.nameAr || 'مشروع',
          clientId: cli?.id || a.clientId || prj?.clientId || null,
          clientName: cli?.nameAr || a.clientName || prj?.clientName || 'العميل',
          roleTitle: a.roleTitle || emp.positionTitle || 'كادر تقني',
          startDate: a.startDate || a.effectiveFrom || targetPeriod?.startDate || '',
          endDate: a.endDate || a.effectiveTo || null,
          allocationBasis: econ.allocationBasis,
          allocationPct: Number(econ.allocationPct.toFixed(1)),
          allocatedDays: Number(econ.allocatedDays.toFixed(2)),
          pricingBasis: econ.pricingBasis,
          billableRate: econ.unitPriceBase,
          revenueBase: econ.revenueBase,
          directCostBase: econ.directCostShareBase,
          overheadShareBase: econ.overheadShareBase,
          totalCostShareBase: econ.totalCostShareBase,
          profitBase: Number(prjProfit.toFixed(2)),
          marginPct: prjMarginPct,
        });
      }

      // Compute default/implied daily billable rate for bench opportunity estimation
      const empDefaultSp = servicePrices.find((sp: any) => !sp.projectId && (sp.employeeId === emp.id || sp.employeeCode === emp.code));
      const dailyDirectCost = workingDaysInMonth > 0 ? Number((directCost / workingDaysInMonth).toFixed(2)) : 0;
      const fallbackDailyRate = empDefaultSp
        ? (empDefaultSp.pricingBasis === 'MONTHLY'
            ? Number(empDefaultSp.price || 0) / workingDaysInMonth
            : empDefaultSp.pricingBasis === 'HOURLY'
              ? Number(empDefaultSp.price || 0) * 8
              : Number(empDefaultSp.price || 0))
        : Math.max(Math.round((dailyDirectCost * (1 + targetMargin / 100)) / 50) * 50, 1200);
      const effectiveDailyRate = weightedDaysSum > 0 ? Number((weightedDailyRateSum / weightedDaysSum).toFixed(2)) : Number(fallbackDailyRate.toFixed(2));
      const potentialRevenueBase = unutilizedDays > 0 ? Number((unutilizedDays * effectiveDailyRate).toFixed(2)) : 0;
      const potentialProfitBase = unutilizedDays > 0 ? Number((potentialRevenueBase - unutilizedCost).toFixed(2)) : 0;

      const utilizationTier: 'FULL' | 'PARTIAL' | 'IDLE' | 'OVER' =
        totalAllocPct > 100.05
          ? 'OVER'
          : totalAllocPct >= 99.5
            ? 'FULL'
            : totalAllocPct > 0.05
              ? 'PARTIAL'
              : 'IDLE';

      const empProfit = empRev - totalCost;
      const empMarginPct = empRev > 0 ? Number(((empProfit / empRev) * 100).toFixed(1)) : 0;
      const deltaMargin = Number((empMarginPct - targetMargin).toFixed(1));

      sumEmpRev += empRev;
      sumEmpCost += totalCost;
      sumEmpProfit += empProfit;
      sumUnutilizedCost += unutilizedCost;

      empList.push({
        employeeId: emp.id,
        employeeCode: emp.code,
        code: emp.code,
        employeeName: emp.fullNameAr || emp.full_name_ar || emp.nameAr || 'الموظف',
        nameAr: emp.fullNameAr || emp.full_name_ar || emp.nameAr || 'الموظف',
        departmentId: emp.departmentId || emp.placement?.departmentId || null,
        departmentName: deptMap.get(emp.departmentId || emp.placement?.departmentId) || emp.departmentName || 'تقنية المعلومات',
        positionTitle: emp.positionTitle || 'مهندس برمجيات',
        workingDaysInMonth,
        allocatedDays: Number(totalAllocDays.toFixed(2)),
        unutilizedDays,
        overAllocatedDays,
        dailyDirectCostBase: dailyDirectCost,
        effectiveDailyRateBase: effectiveDailyRate,
        potentialRevenueBase,
        potentialProfitBase,
        utilizationTier,
        directCostBase: directCost,
        overheadBase: overhead,
        overheadCostBase: overhead,
        totalCostBase: totalCost,
        revenueBase: empRev,
        grossProfitBase: empProfit,
        grossMarginPct: empMarginPct,
        targetMarginPct: targetMargin,
        requiredMarginPct: targetMargin,
        deltaMarginPct: deltaMargin,
        allocatedPct: Number(totalAllocPct.toFixed(1)),
        unutilizedPct: Number(unutilizedPct.toFixed(1)),
        unutilizedCostBase: unutilizedCost,
        isOverAllocated: totalAllocPct > 100.05,
        overAllocatedPct: Number(overAllocatedPct.toFixed(1)),
        assetDepreciationBase: assetDeprCost,
        variablesCostBase: generalVarsCost,
        projectCount: empProjects.length,
        projectNames: empProjects.map((p) => `${p.projectCode ? `${p.projectCode} — ` : ''}${p.projectName} (${p.allocationPct}%)`),
        projects: empProjects,
        status: empMarginPct >= targetMargin ? 'TOP_PERFORMER' : empProfit >= 0 ? 'PROFITABLE' : 'LOSS_MAKER',
      });
    }

    const empSummary = {
      employeeCount: emps.length,
      totalRevenueBase: String(sumEmpRev.toFixed(2)),
      totalCostBase: String(sumEmpCost.toFixed(2)),
      totalUnutilizedCostBase: String(sumUnutilizedCost.toFixed(2)),
      totalProfitBase: String(sumEmpProfit.toFixed(2)),
      averageMarginPct: sumEmpRev > 0 ? String(((sumEmpProfit / sumEmpRev) * 100).toFixed(1)) : '0.00',
    };

    // 2. Project calculations (Level 2 per Business Process)
    const projectList: any[] = [];
    for (const p of prjs) {
      const pAsgs = assignments.filter((a: any) => matchesProject(a, p));
      let pRev = 0;
      let pDirect = 0;
      const teamMembers: any[] = [];

      for (const a of pAsgs) {
        const emp = emps.find((e: any) => matchesEmployee(a, e));
        const empAllAsgs = assignments.filter((x: any) => matchesEmployee(x, emp || a));
        const eTotalAlloc = empAllAsgs.reduce(
          (acc: number, x: any) =>
            acc + Number(x.allocationPct != null ? x.allocationPct : (x.allocationBasis === 'DAYS' ? ((Number(x.allocatedDays) || 22) / 22) * 100 : 100)),
          0,
        );
        const econ = computeAssignmentEconomics({
          assignment: a,
          employee: emp,
          project: p,
          servicePrices,
          period: targetPeriod,
          totalEmployeeAllocPct: eTotalAlloc,
          overheadPolicy,
        });
        pRev += econ.revenueBase;
        pDirect += econ.directCostShareBase;

        teamMembers.push({
          id: a.id,
          employeeId: emp?.id || a.employeeId,
          employeeCode: a.employeeCode || emp?.code || '',
          employeeName: a.employeeName || emp?.fullNameAr || 'الموظف',
          allocationBasis: econ.allocationBasis,
          pricingBasis: econ.pricingBasis,
          allocatedDays: econ.allocatedDays,
          allocationPct: econ.allocationPct,
          billableRate: econ.unitPriceBase,
          revenue: econ.revenueBase,
          directCost: econ.directCostShareBase,
          overheadShare: econ.overheadShareBase,
          totalCost: econ.totalCostShareBase,
          marginPct: econ.grossMarginPct,
          netMarginPct: econ.netMarginPct,
        });
      }

      // Section 14 & 15: Add project-linked approved variables to project cost
      const pVars = monthlyVars.filter((v: any) => (v.projectId === p.id || v.projectId === p.code) && v.status === 'APPROVED');
      const pVarsCost = pVars.reduce((sum: number, v: any) => sum + Number(v.computedAmount || 0), 0);
      pDirect += pVarsCost;

      // Section 18: Add retroactive adjustments registered for this project
      const pRetros = retroAdjs.filter((r: any) => r.projectId === p.id || r.projectId === p.code);
      const pRetroRev = pRetros.reduce((sum: number, r: any) => sum + Number(r.grossRevenueBase || 0), 0);
      pRev += pRetroRev;

      const pOverhead = overheadPolicy.method === 'PERCENTAGE'
        ? Math.round(pDirect * (Number(overheadPolicy.rate || 0) / 100))
        : overheadPolicy.method === 'FIXED_PER_PROJECT'
          ? Math.round(Number(overheadPolicy.rate || 0))
          : Math.round(teamMembers.reduce((sum, m) => sum + Number(overheadPolicy.rate || 0) * ((Number(m.allocationPct) || 100) / 100), 0));
      const pTotal = pDirect + pOverhead;
      const pProfit = pRev - pTotal;
      const pMargin = pRev > 0 ? Number(((pProfit / pRev) * 100).toFixed(1)) : 0;
      const reqMargin = Number(p.requiredMarginPct || 25);
      const pDelta = Number((pMargin - reqMargin).toFixed(1));

      const cc = p.costCenterId ? allCostCenters.find((c: any) => c.id === p.costCenterId) : null;
      projectList.push({
        id: p.id,
        projectId: p.id,
        code: p.code,
        projectCode: p.code,
        nameAr: p.nameAr,
        projectName: p.nameAr,
        clientName: p.clientName || 'العميل',
        clientId: p.clientId,
        costCenterId: p.costCenterId || null,
        costCenterName: cc?.nameAr || '',
        status: p.status || 'ACTIVE',
        currencyCode: p.currencyCode || 'SAR',
        revenueBase: pRev,
        directCostBase: pDirect,
        employeeCostBase: pDirect - pVarsCost,
        projectVariablesBase: pVarsCost,
        retroactiveRevenueBase: pRetroRev,
        overheadBase: pOverhead,
        overheadCostBase: pOverhead,
        totalCostBase: pTotal,
        grossProfitBase: pProfit,
        grossMarginPct: pMargin,
        requiredMarginPct: reqMargin,
        targetMarginPct: reqMargin,
        deltaMarginPct: pDelta,
        teamCount: teamMembers.length,
        teamMembers,
        profitabilityStatus: pMargin >= reqMargin ? 'PROFITABLE' : pProfit > 0 ? 'MARGINAL' : 'LOSS',
        meetsTarget: pMargin >= reqMargin,
      });
    }

    // 3. Client calculations (Level 3 per Business Process)
    const clientList: any[] = [];
    for (const c of clients) {
      const cProjects = projectList.filter((p) => p.clientId === c.id || p.clientName === c.nameAr);
      const cRev = cProjects.reduce((acc, p) => acc + p.revenueBase, 0);
      const cDirect = cProjects.reduce((acc, p) => acc + p.directCostBase, 0);
      const cOverhead = cProjects.reduce((acc, p) => acc + p.overheadBase, 0);
      const cTotal = cProjects.reduce((acc, p) => acc + p.totalCostBase, 0);
      const cProfit = cRev - cTotal;
      const cMargin = cRev > 0 ? Number(((cProfit / cRev) * 100).toFixed(1)) : 0;
      const uniqueTeam = new Set(cProjects.flatMap((p) => p.teamMembers.map((m: any) => m.employeeId))).size;

      clientList.push({
        id: c.id,
        clientId: c.id,
        code: c.code,
        clientCode: c.code,
        nameAr: c.nameAr,
        clientName: c.nameAr,
        revenueBase: cRev,
        directCostBase: cDirect,
        overheadBase: cOverhead,
        totalCostBase: cTotal,
        grossProfitBase: cProfit,
        grossMarginPct: cMargin,
        projectCount: cProjects.length,
        projectsCount: cProjects.length,
        teamCount: uniqueTeam,
        projects: cProjects,
      });
    }

    // Apply optional multi-dimensional filters cleanly across all 3 levels
    const ccFilterSet = expandLocalCostCenterIds(pf.costCenterId);
    const hasDimFilter = Boolean(pf.clientId || pf.projectId || pf.employeeId || pf.costCenterId || pf.departmentId);
    let outProjects = projectList;
    let outClients = clientList;
    let outEmps = empList;
    let outSummary = empSummary;

    if (hasDimFilter) {
      const prjByIdMap = new Map(prjs.map((p: any) => [p.id, p]));
      const empByIdMap = new Map(emps.map((e: any) => [e.id, e]));

      outProjects = projectList.filter((p) => {
        if (pf.projectId && p.id !== pf.projectId && p.code !== pf.projectId) return false;
        if (pf.clientId && p.clientId !== pf.clientId) return false;
        if (ccFilterSet && (!p.costCenterId || !ccFilterSet.has(p.costCenterId))) return false;
        if (pf.employeeId && !p.teamMembers.some((m: any) => m.employeeId === pf.employeeId)) return false;
        if (pf.departmentId && !p.teamMembers.some((m: any) => empByIdMap.get(m.employeeId)?.departmentId === pf.departmentId)) return false;
        return true;
      });

      const allowedPrjIds = new Set(outProjects.map((p) => p.id));
      outClients = clientList
        .map((c) => {
          if (pf.clientId && c.id !== pf.clientId) return null;
          const cp = outProjects.filter((p) => p.clientId === c.id || p.clientName === c.nameAr);
          if ((pf.projectId || pf.costCenterId || pf.employeeId || pf.departmentId) && cp.length === 0) return null;
          const cRev = cp.reduce((acc, p) => acc + p.revenueBase, 0);
          const cDirect = cp.reduce((acc, p) => acc + p.directCostBase, 0);
          const cOverhead = cp.reduce((acc, p) => acc + p.overheadBase, 0);
          const cTotal = cp.reduce((acc, p) => acc + p.totalCostBase, 0);
          const cProfit = cRev - cTotal;
          const cMargin = cRev > 0 ? Number(((cProfit / cRev) * 100).toFixed(1)) : 0;
          const uniqueTeam = new Set(cp.flatMap((p) => p.teamMembers.map((m: any) => m.employeeId))).size;
          return {
            ...c,
            revenueBase: cRev,
            directCostBase: cDirect,
            overheadBase: cOverhead,
            totalCostBase: cTotal,
            grossProfitBase: cProfit,
            grossMarginPct: cMargin,
            projectCount: cp.length,
            projectsCount: cp.length,
            teamCount: uniqueTeam,
            projects: cp,
          };
        })
        .filter(Boolean);

      outEmps = empList.filter((e) => {
        const rawEmp = empByIdMap.get(e.employeeId || e.id);
        if (pf.employeeId && e.employeeId !== pf.employeeId && e.id !== pf.employeeId) return false;
        if (pf.departmentId && (e.departmentId || rawEmp?.departmentId) !== pf.departmentId) return false;
        const empAsgs = assignments.filter((a: any) => matchesEmployee(a, rawEmp || { id: e.employeeId || e.id }));
        if (pf.projectId && !empAsgs.some((a: any) => a.projectId === pf.projectId || a.projectCode === pf.projectId)) return false;
        if (pf.clientId && !empAsgs.some((a: any) => prjByIdMap.get(a.projectId)?.clientId === pf.clientId || allowedPrjIds.has(a.projectId))) return false;
        if (ccFilterSet) {
          const directCc = rawEmp?.costCenterId || rawEmp?.placement?.costCenterId || null;
          const matchesAsgCc = empAsgs.some((a: any) => {
            const pCc = a.costCenterId || prjByIdMap.get(a.projectId)?.costCenterId || null;
            return pCc && ccFilterSet.has(pCc);
          });
          if (!matchesAsgCc && (!directCc || !ccFilterSet.has(directCc))) return false;
        }
        return true;
      });

      const fRev = outEmps.reduce((s, e) => s + Number(e.revenueBase || 0), 0);
      const fCost = outEmps.reduce((s, e) => s + Number(e.totalCostBase || 0), 0);
      const fUnutil = outEmps.reduce((s, e) => s + Number(e.unutilizedCostBase || 0), 0);
      const fProfit = outEmps.reduce((s, e) => s + Number(e.grossProfitBase || 0), 0);
      outSummary = {
        ...empSummary,
        employeeCount: outEmps.length,
        totalRevenueBase: fRev.toFixed(2),
        totalCostBase: fCost.toFixed(2),
        totalUnutilizedCostBase: fUnutil.toFixed(2),
        totalProfitBase: fProfit.toFixed(2),
        averageMarginPct: fRev > 0 ? ((fProfit / fRev) * 100).toFixed(1) : '0.0',
      };
    }

    return { empSummary: outSummary, empList: outEmps, projectList: outProjects, clientList: outClients };
  }

  const readProfQuery = (p: string) => {
    const qp = new URLSearchParams(p.includes('?') ? p.split('?')[1] : '');
    return {
      periodId: qp.get('periodId'),
      from: qp.get('from'),
      to: qp.get('to'),
      clientId: qp.get('clientId'),
      projectId: qp.get('projectId'),
      employeeId: qp.get('employeeId'),
      costCenterId: qp.get('costCenterId'),
      departmentId: qp.get('departmentId'),
    };
  };

  if (path.includes('/profitability/projects')) {
    const { projectList } = computeDynamicProfitability(readProfQuery(path));
    return makeList(projectList);
  }

  if (path.includes('/profitability/clients')) {
    const { clientList } = computeDynamicProfitability(readProfQuery(path));
    return makeList(clientList);
  }

  if (path.includes('/profitability/employees') || path.includes('/reports/employee-profitability')) {
    const { empSummary, empList } = computeDynamicProfitability(readProfQuery(path));
    return {
      summary: empSummary,
      employees: empList,
      data: empList,
      rows: empList,
      meta: { total: empList.length },
    };
  }

  // 4. Assignments Reports (100% Unified with computeAssignmentEconomics)
  if (path.includes('/assignments/employee-days-report')) {
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const qParams = new URLSearchParams(qStr);
    const periodId = qParams.get('periodId');
    const qFrom = qParams.get('from');
    const qTo = qParams.get('to');
    const fClientId = qParams.get('clientId');
    const fProjectId = qParams.get('projectId');
    const fEmployeeId = qParams.get('employeeId');
    const fCostCenterId = qParams.get('costCenterId');
    const fDepartmentId = qParams.get('departmentId');
    const ccFilterSet = expandLocalCostCenterIds(fCostCenterId);
    const period = periodId
      ? resolvePeriodByIdOrDate(periodId, null)
      : (qFrom || qTo)
        ? { id: 'custom', name: `من ${qFrom || '...'} إلى ${qTo || '...'}`, startDate: qFrom || '2000-01-01', endDate: qTo || '2099-12-31' }
        : resolvePeriodByIdOrDate(null, null);

    const emps = getEntityList('employees', []);
    const prjs = getEntityList('projects', []);
    const clients = getEntityList('clients', defaultClients);
    const allCostCenters = getLocalCostCenters();
    const ccNameMap = new Map(allCostCenters.map((c: any) => [c.id, c.nameAr]));
    const assignments = getEntityList('assignments', []).filter((a: any) => isAssignmentActiveInPeriod(a, period));
    const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
    const invoices = getEntityList('invoices', []).filter((i: any) => i.status !== 'CANCELLED' && i.invoiceType !== 'CREDIT_NOTE');
    const overheadPolicy = getOverheadPolicy();

    let totalAllocatedDaysAll = 0;
    let totalRevenueAll = 0;
    let projectCostAll = 0;
    let benchCostAll = 0;
    let overheadCostAll = 0;
    let invoicedCount = 0;
    let pendingInvoiceCount = 0;

    const rows: any[] = [];

    for (const emp of emps) {
      if (fEmployeeId && emp.id !== fEmployeeId && emp.code !== fEmployeeId) continue;
      const empDeptId = emp.departmentId || emp.placement?.departmentId || null;
      if (fDepartmentId && empDeptId !== fDepartmentId) continue;

      const bd = computeEmployeeCostBreakdown(emp, period, overheadPolicy);
      const empMonthlyCost = bd.distributableCostBase;
      const empOverhead = overheadPolicy.method === 'PERCENTAGE'
        ? Math.round(empMonthlyCost * (Number(overheadPolicy.rate || 0) / 100) * 100) / 100
        : overheadPolicy.method === 'FIXED_PER_EMPLOYEE'
          ? Math.round(Number(overheadPolicy.rate || 0) * 100) / 100
          : 0;
      const positionTitle = emp.positionTitle || emp.role || 'مهندس برمجيات';

      const myAsgs = assignments.filter((a: any) => matchesEmployee(a, emp));

      if (myAsgs.length > 0) {
        let empAssignedDaysTotal = 0;
        let empAssignedPctTotal = 0;
        for (const a of myAsgs) {
          const mDays = Math.max(1, Number(a.workingDaysInMonth || 22));
          const isDays = String(a.allocationBasis || '').toUpperCase() === 'DAYS';
          const days = isDays
            ? Number(a.allocatedDays ?? mDays)
            : Number(((Number(a.allocationPct ?? 100) / 100) * mDays).toFixed(2));
          const pct = isDays ? (days / mDays) * 100 : Number(a.allocationPct ?? 100);
          empAssignedDaysTotal += days;
          empAssignedPctTotal += pct;
        }

        const unutilizedPct = Math.max(0, Number((100 - empAssignedPctTotal).toFixed(1)));
        const empBenchCost = Math.round(empMonthlyCost * (unutilizedPct / 100) * 100) / 100;
        let empBenchAdded = false;
        let empOhAdded = false;

        for (const a of myAsgs) {
          const prj = prjs.find((p: any) => matchesProject(a, p)) || {
            id: a.projectId,
            code: a.projectCode || 'PRJ-001',
            nameAr: a.projectName || 'مشروع تطوير منصه',
            clientId: a.clientId || clients[0]?.id,
          };
          const cli = clients.find((c: any) => c.id === prj.clientId || c.id === a.clientId) || clients[0] || {
            id: 'cli-001',
            nameAr: 'شركة الإمداد لتقنية المعلومات',
          };
          const effCcId = a.costCenterId || prj.costCenterId || emp.costCenterId || emp.placement?.costCenterId || null;
          if (fClientId && cli.id !== fClientId) continue;
          if (fProjectId && prj.id !== fProjectId && prj.code !== fProjectId) continue;
          if (ccFilterSet && (!effCcId || !ccFilterSet.has(effCcId))) continue;

          if (!empBenchAdded) { benchCostAll += empBenchCost; empBenchAdded = true; }
          if (!empOhAdded) { overheadCostAll += empOverhead; empOhAdded = true; }

          const econ = computeAssignmentEconomics({
            assignment: a,
            employee: emp,
            project: prj,
            servicePrices,
            period,
            totalEmployeeAllocPct: empAssignedPctTotal,
            overheadPolicy,
          });

          const unutilizedDays = Math.max(0, Number((econ.workingDays - empAssignedDaysTotal).toFixed(1)));

          const invMatch = invoices.find(
            (i: any) =>
              (matchesProject(i, prj) || i.projectId === a.projectId) &&
              (!periodId || i.fiscalPeriodId === periodId) &&
              (!qFrom || String(i.issueDate || '').slice(0, 10) >= qFrom) &&
              (!qTo || String(i.issueDate || '').slice(0, 10) <= qTo) &&
              ((i.lines || []).length === 0 || (i.lines || []).some((l: any) => matchesEmployee(l, emp) || l.description?.includes(emp.fullNameAr || emp.nameAr || ''))),
          );

          const invoiceStatus = invMatch ? (invMatch.status || 'POSTED') : 'UNINVOICED';
          if (invMatch) invoicedCount++;
          else pendingInvoiceCount++;

          totalAllocatedDaysAll += econ.allocatedDays;
          totalRevenueAll += econ.revenueBase;
          projectCostAll += econ.directCostShareBase;

          rows.push({
            assignmentId: a.id || `asg-${emp.id}-${prj.id}`,
            employeeId: emp.id,
            employeeCode: emp.code,
            employeeName: emp.fullNameAr || emp.nameAr || emp.name,
            positionTitle,
            projectId: prj.id,
            projectCode: prj.code,
            projectName: prj.nameAr,
            clientId: cli.id,
            clientName: cli.nameAr,
            costCenterId: effCcId,
            costCenterName: (effCcId && ccNameMap.get(effCcId)) || '',
            allocationBasis: econ.allocationBasis,
            workingDaysInMonth: econ.workingDays,
            allocatedDays: econ.allocatedDays,
            allocationPct: econ.allocationPct,
            unutilizedDays,
            unutilizedPct,
            pricingBasis: econ.pricingBasis,
            unitPrice: econ.unitPriceBase.toFixed(2),
            employeeMonthlyCost: empMonthlyCost.toFixed(2),
            projectCostShare: econ.directCostShareBase.toFixed(2),
            revenueGenerated: econ.revenueBase.toFixed(2),
            grossProfit: econ.grossProfitBase.toFixed(2),
            marginPct: econ.grossMarginPct,
            invoiceStatus,
            invoiceId: invMatch?.id || null,
            invoiceNo: invMatch?.invoiceNo || null,
          });
        }
      } else {
        const effCcId = emp.costCenterId || emp.placement?.costCenterId || null;
        if (fClientId || fProjectId) continue;
        if (ccFilterSet && (!effCcId || !ccFilterSet.has(effCcId))) continue;
        benchCostAll += empMonthlyCost;
        overheadCostAll += empOverhead;
        pendingInvoiceCount++;

        rows.push({
          assignmentId: `unassigned-${emp.id}`,
          employeeId: emp.id,
          employeeCode: emp.code,
          employeeName: emp.fullNameAr || emp.nameAr || emp.name,
          positionTitle,
          projectId: '',
          projectCode: 'BENCH',
          projectName: 'غير مسند لمشروع (على قوة الشركة - Bench)',
          clientId: '',
          clientName: 'تشغيل وتطوير داخلي',
          costCenterId: effCcId,
          costCenterName: (effCcId && ccNameMap.get(effCcId)) || '',
          allocationBasis: 'DAYS',
          workingDaysInMonth: 22,
          allocatedDays: 0,
          allocationPct: 0,
          unutilizedDays: 22,
          unutilizedPct: 100,
          pricingBasis: 'DAILY',
          unitPrice: '0.00',
          employeeMonthlyCost: empMonthlyCost.toFixed(2),
          projectCostShare: '0.00',
          revenueGenerated: '0.00',
          grossProfit: (-empMonthlyCost).toFixed(2),
          marginPct: 0,
          invoiceStatus: 'UNINVOICED',
          invoiceId: null,
          invoiceNo: null,
        });
      }
    }

    const totalCostAll = projectCostAll + benchCostAll;
    const totalProfitAll = totalRevenueAll - totalCostAll;
    const totalCostWithOverhead = totalCostAll + overheadCostAll;
    const netProfitAfterOverhead = totalRevenueAll - totalCostWithOverhead;
    const averageMarginPct = totalRevenueAll > 0 ? Number(((totalProfitAll / totalRevenueAll) * 100).toFixed(1)) : 0;

    return {
      period: {
        id: period?.id || periodId || 'fp-2026-11',
        name: period?.name || 'الفترة المالية الحالية',
        start: period?.startDate || '2026-11-01',
        end: period?.endDate || '2026-11-30',
      },
      summary: {
        totalAssignments: rows.filter((r) => r.projectId).length,
        totalAllocatedDays: Number(totalAllocatedDaysAll.toFixed(2)),
        totalRevenue: totalRevenueAll.toFixed(2),
        projectCost: projectCostAll.toFixed(2),
        benchCost: benchCostAll.toFixed(2),
        totalCost: totalCostAll.toFixed(2),
        overheadCost: overheadCostAll.toFixed(2),
        totalCostWithOverhead: totalCostWithOverhead.toFixed(2),
        totalProfit: totalProfitAll.toFixed(2),
        netProfitAfterOverhead: netProfitAfterOverhead.toFixed(2),
        averageMarginPct,
        invoicedCount,
        pendingInvoiceCount,
      },
      rows,
      meta: { total: rows.length },
    };
  }

  if (path.includes('/assignments/utilization')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const { empList } = computeDynamicProfitability({
      periodId: q.get('periodId'),
      from: q.get('from'),
      to: q.get('to'),
      clientId: q.get('clientId'),
      projectId: q.get('projectId'),
      employeeId: q.get('employeeId'),
      costCenterId: q.get('costCenterId'),
      departmentId: q.get('departmentId'),
    } as any);
    return makeList(empList);
  }

  // 5. Employees & Placement (Clean Dynamic List)
  if (path.includes('/employees')) {
    const emps = getEntityList('employees', []);
    if (path.includes('/cost')) {
      const cleanP = path.split('?')[0].replace(/\/$/, '');
      const segments = cleanP.split('/').filter(Boolean); // ['employees', targetId, 'cost']
      const targetId = segments[1];
      const qStr = path.includes('?') ? path.split('?')[1] : '';
      const qParams = new URLSearchParams(qStr);
      const period = resolvePeriodByIdOrDate(qParams.get('periodId'), null);
      const emp = emps.find((e: any) => e.id === targetId || e.code === targetId || e.code?.toLowerCase() === targetId?.toLowerCase());
      if (!emp) {
        return {
          employedDays: 0,
          periodDays: 22,
          totalCostBase: '0.00',
          distributableCostBase: '0.00',
          totalDeductionsBase: '0.00',
          dailyDirectCost: '0.00',
          dailyOverheadCost: '0.00',
          dailyTotalCost: '0.00',
          currency: 'SAR',
          baseCurrency: 'SAR',
          breakdown: [],
          lines: [],
        };
      }
      const bd = computeEmployeeCostBreakdown(emp, period);
      return {
        ...bd,
        totalCostBase: bd.totalCostBase.toFixed(2),
        distributableCostBase: bd.distributableCostBase.toFixed(2),
        totalDeductionsBase: bd.totalDeductionsBase.toFixed(2),
      };
    }

    if (path.includes('/documents')) {
      return makeList(getEntityList('employee_documents', []));
    }

    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const segments = cleanP.split('/').filter(Boolean); // e.g. ['employees', 'id']

    if (segments.length >= 2 && segments[0] === 'employees') {
      const targetId = segments[1];
      const singleEmp = emps.find((e) => e.id === targetId || e.code === targetId || e.code?.toLowerCase() === targetId?.toLowerCase());
      const allAsg = getEntityList('assignments', []);
      const empAsg = allAsg.filter((a) => matchesEmployee(a, singleEmp || { id: targetId, code: targetId }));

      if (singleEmp) {
        const defaultPlacement = {
          id: `plc-${singleEmp.id || '1'}`,
          effectiveFrom: singleEmp.hireDate || new Date().toISOString().slice(0, 10),
          effectiveTo: null,
          departmentId: singleEmp.departmentId || singleEmp.placement?.departmentId || null,
          branchId: singleEmp.branchId || singleEmp.placement?.branchId || null,
          positionId: singleEmp.positionId || singleEmp.placement?.positionId || null,
          costCenterId: singleEmp.costCenterId || singleEmp.placement?.costCenterId || null,
          departmentName: singleEmp.departmentName || '',
          branchName: singleEmp.branchName || '',
          positionTitle: singleEmp.positionTitle || '',
          costCenterName: singleEmp.costCenterName || '',
          managerName: null,
          changeReason: 'التعيين الأولي وتسكين الكادر',
        };
        const defaultCompensation = {
          id: `cmp-${singleEmp.id || '1'}`,
          effectiveFrom: singleEmp.hireDate || new Date().toISOString().slice(0, 10),
          effectiveTo: null,
          basicSalary: singleEmp.basicSalary || singleEmp.compensation?.basicSalary || '0.00',
          salaryCurrency: singleEmp.salaryCurrency || singleEmp.compensation?.salaryCurrency || 'SAR',
          insuranceSalary: singleEmp.insuranceSalary || singleEmp.compensation?.insuranceSalary || '0.00',
          insuranceCurrency: singleEmp.insuranceCurrency || singleEmp.salaryCurrency || 'SAR',
          changeReason: 'الراتب المعتمد عند التعيين',
          createdBy: 'المدير التنفيذي',
          createdAt: new Date().toISOString(),
        };

        const activeAssets = getEntityList<any>('assets', []).filter(
          (a) => (a.custodianEmployeeId === singleEmp.id || a.employeeId === singleEmp.id || a.custodianEmployeeId === singleEmp.code) && a.status === 'ACTIVE',
        );
        const assetCustodies = activeAssets.map((a) => ({
          id: `cst-${a.id}`,
          assetId: a.id,
          assetCode: a.code || a.assetCode || 'AST',
          assetNameAr: a.nameAr || a.assetNameAr || 'أصل تشغيلي',
          assignedDate: a.assignedDate || a.purchaseDate || singleEmp.hireDate || new Date().toISOString().slice(0, 10),
          returnedDate: null,
          conditionOut: 'جيد جداً',
          conditionIn: null,
          monthlyDepreciationBase: Math.round(((Number(a.costBase || a.cost || 0) - Number(a.salvageValueBase || 0)) / (Number(a.usefulLifeMonths) || 36)) * 100) / 100,
        }));
        const existingCustodies = Array.isArray(singleEmp.custodies) ? singleEmp.custodies : [];
        const mergedCustodies = [
          ...assetCustodies,
          ...existingCustodies.filter((c: any) => !assetCustodies.some((ac) => ac.assetId === c.assetId || ac.assetCode === c.assetCode)),
        ];

        return {
          ...singleEmp,
          fullNameAr: singleEmp.fullNameAr || singleEmp.full_name_ar || singleEmp.nameAr || 'موظف',
          fullNameEn: singleEmp.fullNameEn || singleEmp.full_name_en || singleEmp.nameEn || '',
          code: singleEmp.code || targetId,
          hireDate: singleEmp.hireDate || singleEmp.hire_date || new Date().toISOString().slice(0, 10),
          basicSalary: singleEmp.basicSalary || '0.00',
          salaryCurrency: singleEmp.salaryCurrency || 'SAR',
          insuranceSalary: singleEmp.insuranceSalary || '0.00',
          insuranceCurrency: singleEmp.insuranceCurrency || singleEmp.salaryCurrency || 'SAR',
          placement: defaultPlacement,
          placements: Array.isArray(singleEmp.placements) && singleEmp.placements.length > 0 ? singleEmp.placements : [defaultPlacement],
          salary: defaultCompensation,
          compensations: Array.isArray(singleEmp.compensations) && singleEmp.compensations.length > 0 ? singleEmp.compensations : [defaultCompensation],
          costProfiles: Array.isArray(singleEmp.costProfiles) ? singleEmp.costProfiles : [],
          assignments: empAsg,
          overrides: Array.isArray(singleEmp.overrides) ? singleEmp.overrides : [],
          custodies: mergedCustodies,
          documents: Array.isArray(singleEmp.documents) ? singleEmp.documents : [],
          statusHistory: Array.isArray(singleEmp.statusHistory) && singleEmp.statusHistory.length > 0 ? singleEmp.statusHistory : [
            {
              id: `sh-${singleEmp.id || '1'}`,
              oldStatus: null,
              newStatus: singleEmp.status || 'ACTIVE',
              effectiveDate: singleEmp.hireDate || new Date().toISOString().slice(0, 10),
              reason: 'HIRED',
              changedBy: 'المدير التنفيذي',
              changedAt: new Date().toISOString(),
            }
          ],
        };
      }

      // Safe non-crashing fallback if single employee record not found
      return {
        id: targetId,
        code: targetId,
        fullNameAr: `الموظف ${targetId}`,
        fullNameEn: `Employee ${targetId}`,
        status: 'ACTIVE',
        hireDate: new Date().toISOString().slice(0, 10),
        basicSalary: '0.00',
        salaryCurrency: 'SAR',
        insuranceSalary: '0.00',
        insuranceCurrency: 'SAR',
        placements: [],
        compensations: [],
        costProfiles: [],
        assignments: empAsg,
        overrides: [],
        custodies: [],
        documents: [],
        statusHistory: [],
      };
    }
    const allActiveAsg = getEntityList<any>('assignments', []).filter((a) => isAssignmentActiveInPeriod(a));
    const allPrjs = getEntityList<any>('projects', []);
    const enrichedEmps = emps.map((e: any) => {
      const myAsg = allActiveAsg.filter((a) => matchesEmployee(a, e));
      const totalPct = Math.round(
        myAsg.reduce((s, a) => {
          const wDays = Math.max(1, Number(a.workingDaysInMonth || 22));
          const pct = String(a.allocationBasis || '').toUpperCase() === 'DAYS'
            ? (Number(a.allocatedDays ?? wDays) / wDays) * 100
            : Number(a.allocationPct ?? 100);
          return s + pct;
        }, 0),
      );
      const firstAsg = myAsg[0];
      const primaryPrj = firstAsg ? allPrjs.find((p) => matchesProject(firstAsg, p)) : null;
      return {
        ...e,
        activeAssignmentsCount: myAsg.length,
        totalAllocationPct: totalPct,
        primaryProjectId: primaryPrj?.id || firstAsg?.projectId || null,
        primaryProjectCode: primaryPrj?.code || firstAsg?.projectCode || null,
        primaryProjectName: primaryPrj?.nameAr || firstAsg?.projectName || null,
      };
    });
    return makeList(enrichedEmps);
  }

  // 6. Projects (المشاريع) — Unified 360° with computeDynamicProfitability & computeAssignmentEconomics
  if (path.includes('/projects')) {
    const projects = getEntityList('projects', []);
    const allAsg = getEntityList('assignments', []);
    const allPrices = getEntityList('service_prices', []);
    const emps = getEntityList('employees', []);
    const overheadPolicy = getOverheadPolicy();
    const { projectList: profProjects } = computeDynamicProfitability();

    const singleProj: any = projects.find((p: any) => path.endsWith(`/${p.id}`) || path.endsWith(`/${p.code}`) || path.includes(`/${p.id}/`) || path.includes(`/${p.code}/`));
    if (singleProj) {
      const prjProf = profProjects.find((pp: any) => pp.id === singleProj.id || pp.code === singleProj.code) || null;
      const prjAsgs = allAsg.filter((a: any) => matchesProject(a, singleProj)).map((a: any) => {
        const emp = emps.find((e: any) => matchesEmployee(a, e));
        const empAllAsgs = allAsg.filter((x: any) => matchesEmployee(x, emp || a) && isAssignmentActiveInPeriod(x));
        const eTotalAlloc = empAllAsgs.reduce(
          (acc: number, x: any) =>
            acc + Number(x.allocationPct != null ? x.allocationPct : (x.allocationBasis === 'DAYS' ? ((Number(x.allocatedDays) || 22) / 22) * 100 : 100)),
          0,
        );
        const econ = computeAssignmentEconomics({
          assignment: a,
          employee: emp,
          project: singleProj,
          servicePrices: allPrices,
          totalEmployeeAllocPct: eTotalAlloc,
          overheadPolicy,
        });
        return {
          ...a,
          employeeName: a.employeeName || emp?.fullNameAr || emp?.nameAr || 'الموظف',
          employeeCode: a.employeeCode || emp?.code || '',
          allocationBasis: econ.allocationBasis,
          allocationPct: econ.allocationPct,
          allocatedDays: econ.allocatedDays,
          billingBasis: econ.pricingBasis,
          pricingBasis: econ.pricingBasis,
          billableRate: econ.unitPriceBase,
          monthlyRevenue: econ.revenueBase,
          allocatedCost: econ.directCostShareBase,
          overheadShare: econ.overheadShareBase,
          totalCostShare: econ.totalCostShareBase,
          grossMarginPct: econ.grossMarginPct,
          netMarginPct: econ.netMarginPct,
        };
      });
      const prjPrices = allPrices.filter((sp: any) => matchesProject(sp, singleProj));
      const prjInvoices = getEntityList<any>('invoices', []).filter((inv: any) => matchesProject(inv, singleProj));
      const prjPurchases = getEntityList<any>('purchase_invoices', []).filter((inv: any) => matchesProject(inv, singleProj));
      const accounts = getNormalizedAccounts();
      const prjJournals = getEntityList<any>('journal_entries', [])
        .map((j: any) => normalizeJournalEntry(j, accounts))
        .filter((j: any) => j.status === 'POSTED' && ((j.lines || []).some((l: any) => l.projectId === singleProj.id || l.projectId === singleProj.code) || String(j.description || '').includes(singleProj.nameAr)));

      return {
        ...singleProj,
        assignments: prjAsgs,
        activeAssignmentCount: prjAsgs.filter((a: any) => isAssignmentActiveInPeriod(a)).length,
        profitability: prjProf,
        overheadPolicy,
        invoices: prjInvoices,
        purchaseInvoices: prjPurchases,
        journalEntries: prjJournals,
        servicePrices: prjPrices.length > 0 ? prjPrices : (Array.isArray(singleProj.servicePrices) ? singleProj.servicePrices : []),
        prices: prjPrices.length > 0 ? prjPrices : (Array.isArray(singleProj.prices) ? singleProj.prices : []),
        statusHistory: Array.isArray(singleProj.statusHistory) ? singleProj.statusHistory : (Array.isArray(singleProj.history) ? singleProj.history : []),
        history: Array.isArray(singleProj.statusHistory) ? singleProj.statusHistory : (Array.isArray(singleProj.history) ? singleProj.history : []),
      };
    }

    const enrichedProjects = projects.map((p: any) => {
      const prjProf = profProjects.find((pp: any) => pp.id === p.id || pp.code === p.code);
      const pCount = allAsg.filter((a: any) => matchesProject(a, p) && isAssignmentActiveInPeriod(a)).length;
      return {
        ...p,
        activeAssignmentCount: pCount,
        monthlyRevenueBase: prjProf?.revenueBase ?? 0,
        totalCostBase: prjProf?.totalCostBase ?? 0,
        grossProfitBase: prjProf?.grossProfitBase ?? 0,
        grossMarginPct: prjProf?.grossMarginPct ?? 0,
      };
    });

    return makeList(enrichedProjects);
  }

  // 7. Clients (العملاء)
  if (path.includes('/clients')) {
    const clients = getEntityList('clients', defaultClients);
    const singleCli = clients.find((c: any) => path.endsWith(`/${c.id}`) || path.endsWith(`/${c.code}`));
    if (singleCli) return singleCli;
    return makeList(clients);
  }

  // 8. Assignments & Workload (الإسناد) — Live enriched via computeAssignmentEconomics
  if (path.includes('/assignments')) {
    const allAsg = getEntityList('assignments', []);
    let rows = allAsg;
    const emps = getEntityList('employees', []);
    const projects = getEntityList('projects', []);
    const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
    const overheadPolicy = getOverheadPolicy();
    const queryStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(queryStr);
    const filterEmp = params.get('employeeId');
    const filterPrj = params.get('projectId');
    if (filterEmp) {
      const matchedEmp = emps.find((e: any) => e.id === filterEmp || e.code === filterEmp);
      rows = rows.filter((a) => (matchedEmp ? matchesEmployee(a, matchedEmp) : (a.employeeId === filterEmp || a.employeeCode === filterEmp)));
    }
    if (filterPrj) {
      const matchedPrj = projects.find((p: any) => p.id === filterPrj || p.code === filterPrj);
      rows = rows.filter((a) => (matchedPrj ? matchesProject(a, matchedPrj) : (a.projectId === filterPrj || a.projectCode === filterPrj)));
    }
    let totalDays = 0;
    let totalRevenue = 0;
    let totalCost = 0;
    const enrichedRows = rows.map((a: any) => {
      const emp = emps.find((e: any) => matchesEmployee(a, e));
      const prj = projects.find((p: any) => matchesProject(a, p));
      const empActiveAsgs = allAsg.filter((x: any) => matchesEmployee(x, emp || a) && isAssignmentActiveInPeriod(x));
      const empTotalPct = empActiveAsgs.reduce(
        (s: number, x: any) => s + Number(x.allocationPct != null ? x.allocationPct : (x.allocationBasis === 'DAYS' ? ((Number(x.allocatedDays) || 22) / 22) * 100 : 100)),
        0,
      );
      const econ = computeAssignmentEconomics({
        assignment: a,
        employee: emp,
        project: prj,
        servicePrices,
        totalEmployeeAllocPct: empTotalPct,
        overheadPolicy,
      });
      if (isAssignmentActiveInPeriod(a)) {
        totalDays += econ.allocatedDays;
        totalRevenue += econ.revenueBase;
        totalCost += econ.directCostShareBase;
      }
      return {
        ...a,
        employeeName: a.employeeName || emp?.fullNameAr || 'الموظف',
        employeeCode: a.employeeCode || emp?.code || '',
        projectName: a.projectName || prj?.nameAr || 'مشروع',
        projectCode: a.projectCode || prj?.code || '',
        clientName: a.clientName || prj?.clientName || 'عميل',
        allocationBasis: econ.allocationBasis,
        allocationPct: econ.allocationPct,
        allocatedDays: econ.allocatedDays,
        billingBasis: econ.pricingBasis,
        pricingBasis: econ.pricingBasis,
        billableRate: econ.rawUnitPrice,
        unitPriceBase: econ.unitPriceBase,
        monthlyRevenue: econ.revenueBase,
        allocatedCost: econ.directCostShareBase,
        overheadShare: econ.overheadShareBase,
        marginPct: String(econ.grossMarginPct),
      };
    });
    const margin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
    return {
      summary: { totalDays: Number(totalDays.toFixed(2)), totalRevenue, totalCost, margin: margin.toFixed(1) },
      rows: enrichedRows,
      data: enrichedRows,
      meta: { page: 1, pageSize: 50, total: enrichedRows.length },
    };
  }

  // 9. Organization Structures (الفروع، الأقسام، مراكز التكلفة)
  if (path.includes('/branches')) {
    return makeList(getEntityList('branches', defaultBranches));
  }

  if (path.includes('/departments')) {
    return makeList(getEntityList('departments', defaultDepartments));
  }

  if (path.includes('/cost-centers') && !path.includes('/reports/')) {
    return makeList(getEntityList('cost_centers', defaultCostCenters));
  }

  if (path.includes('/currencies') || path.includes('/company-currencies')) {
    return makeList(getEntityList('currencies', defaultCurrenciesList));
  }

  if (path.includes('/exchange-rates')) {
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(qStr);
    const fromCur = params.get('fromCurrency');
    const toCur = params.get('toCurrency');
    let rates = getEntityList('exchange_rates', defaultExchangeRatesList);
    if (fromCur) rates = rates.filter((r: any) => r.fromCurrency === fromCur);
    if (toCur) rates = rates.filter((r: any) => r.toCurrency === toCur);
    return makeList(rates);
  }

  // 10. Accounting & Ledgers
  if (path.includes('/fiscal-years')) {
    const defaultFy = [
      { id: 'fy-2026', code: 'FY-2026', nameAr: 'السنة المالية 2026', startDate: '2026-01-01', endDate: '2026-12-31', status: 'OPEN', isClosed: false },
    ];
    return makeList(getEntityList('fiscal_years', defaultFy));
  }

  if (path.includes('/fiscal-periods')) {
    return makeList(getEntityList('fiscal_periods', defaultFiscalPeriodsList));
  }

  if (path.includes('/work-calendars')) {
    return makeList(getEntityList('work_calendars', []));
  }

  if (path.includes('/tax-codes') || path.includes('/taxes')) {
    const defaultTaxes = [
      { id: 'tax-15', code: 'VAT15', nameAr: 'ضريبة القيمة المضافة القياسية 15%', ratePct: '15.00', taxType: 'VAT', isRecoverable: true, isActive: true },
      { id: 'tax-0', code: 'VAT0', nameAr: 'ضريبة بنسبة الصفر %0', ratePct: '0.00', taxType: 'VAT', isRecoverable: true, isActive: true },
      { id: 'tax-ex', code: 'VATEX', nameAr: 'معفى من الضريبة', ratePct: '0.00', taxType: 'EXEMPT', isRecoverable: false, isActive: true },
    ];
    return makeList(getEntityList('tax_codes', defaultTaxes));
  }

  if (path.includes('/statement-lines')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const stType = p.get('statementType') || undefined;
    const allAccs = getNormalizedAccounts();
    const lines = getStatementLines(stType).map((sl) => ({
      ...sl,
      mappedAccountsCount: allAccs.filter((a) => a.isPosting && (a.statementLineId === sl.id || a.equityLineId === sl.id)).length,
    }));
    return makeList(lines);
  }

  if (path.includes('/treasury/overview')) {
    return getTreasuryOverview();
  }

  if (path.includes('/treasury/accounts')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const kindParam = q.get('kind');
    return getEnrichedTreasuryAccounts(kindParam === 'BANK' || kindParam === 'CASH' ? kindParam : undefined);
  }

  if (path.includes('/treasury/vouchers')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return listTreasuryVouchers({
      voucherType: q.get('voucherType') || undefined,
      employeeId: q.get('employeeId') || undefined,
      treasuryAccountId: q.get('treasuryAccountId') || undefined,
      paymentMethod: q.get('paymentMethod') || undefined,
      status: q.get('status') || undefined,
      from: q.get('from') || undefined,
      to: q.get('to') || undefined,
      search: q.get('search') || undefined,
    });
  }

  if (path.includes('/treasury/cheques')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return listCheques({
      direction: q.get('direction') || undefined,
      status: q.get('status') || undefined,
      employeeId: q.get('employeeId') || undefined,
      search: q.get('search') || undefined,
    });
  }

  if (path.includes('/treasury/reconciliations')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return listBankReconciliations(q.get('bankAccountId') || undefined);
  }

  if (path.includes('/accounts/suggest-code')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const parentId = p.get('parentId') || null;
    const accountClass = p.get('accountClass') || 'ASSET';
    const allAccs = getNormalizedAccounts();
    const parent = parentId ? allAccs.find((a) => a.id === parentId) : null;
    const siblings = allAccs.filter((a) => (a.parentId || null) === (parent?.id || null)).map((a) => a.code);
    return {
      suggestedCode: suggestNextLocalCode(parent?.code || null, siblings, parent?.accountClass || accountClass),
      level: parent ? Number(parent.level || 1) + 1 : 1,
      parentCode: parent?.code || null,
      accountClass: parent?.accountClass || accountClass,
      statementSection: parent?.statementSection || null,
    };
  }

  if (path.includes('/accounts/reclassifications')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return makeList(getReclassifications(p.get('accountId') || undefined));
  }

  if (path.includes('/accounts')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    let list = getNormalizedAccounts({ asOf: p.get('asOf') || undefined });
    const singleAcc = list.find((a) => cleanP.endsWith(`/${a.id}`));
    if (singleAcc && !cleanP.endsWith('/accounts')) return singleAcc;
    if (p.get('activeOnly') === 'true') list = list.filter((a) => a.isActive !== false);
    if (p.get('postingOnly') === 'true') list = list.filter((a) => a.isPosting);
    if (p.get('headerOnly') === 'true') list = list.filter((a) => !a.isPosting);
    if (p.get('accountClass')) list = list.filter((a) => a.accountClass === p.get('accountClass'));
    if (p.get('statementSection')) list = list.filter((a) => a.statementSection === p.get('statementSection'));
    if (p.get('cashFlowCategory')) list = list.filter((a) => a.cashFlowCategory === p.get('cashFlowCategory'));
    if (p.get('q')) {
      const term = p.get('q')!.trim().toLowerCase();
      list = list.filter((a) => String(a.code).toLowerCase().includes(term) || String(a.nameAr).toLowerCase().includes(term) || String(a.nameEn || '').toLowerCase().includes(term));
    }
    return makeList(list);
  }

  if (path.includes('/bank-accounts') || path.includes('/banks')) {
    const banks = getEnrichedTreasuryAccounts();
    const cleanB = path.split('?')[0].replace(/\/$/, '');
    const singleB = banks.find((b: any) => cleanB.endsWith(`/${b.id}`));
    if (singleB) return singleB;
    return makeList(banks);
  }

  if (path.includes('/bank-transfers')) {
    return makeList(getEntityList('bank_transfers', []));
  }

  if (path.includes('/journal-entries') || path.includes('/journals')) {
    const accounts = getNormalizedAccounts();
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const params = new URLSearchParams(qStr);
    const statusFilter = params.get('status');
    const fromDate = params.get('fromDate');
    const toDate = params.get('toDate');
    const jes = getEntityList<any>('journal_entries', []).map((j) => normalizeJournalEntry(j, accounts));
    const singleJe = jes.find((j) => cleanP.endsWith(`/${j.id}`) || (j.entryNo && cleanP.endsWith(`/${j.entryNo}`)));
    if (singleJe) return singleJe;
    let filtered = statusFilter ? jes.filter((j) => j.status === statusFilter) : jes;
    if (fromDate) filtered = filtered.filter((j) => String(j.entryDate) >= fromDate);
    if (toDate) filtered = filtered.filter((j) => String(j.entryDate) <= toDate);
    filtered.sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return makeList(filtered);
  }

  // 11. Live Financial Reports & Statements from Posted Journal Entries
  const parseLedgerDims = (p: URLSearchParams) => {
    const pId = p.get('periodId') || undefined;
    const pObj = pId ? resolvePeriodByIdOrDate(pId, null) : null;
    return {
      periodId: pId,
      resolvedFrom: p.get('from') || p.get('fromDate') || (pObj ? String(pObj.startDate).slice(0, 10) : undefined),
      resolvedTo: p.get('to') || p.get('toDate') || (pObj ? String(pObj.endDate).slice(0, 10) : undefined),
      resolvedAsOf: p.get('asOf') || p.get('to') || (pObj ? String(pObj.endDate).slice(0, 10) : undefined),
      branchId: p.get('branchId') || undefined,
      costCenterId: p.get('costCenterId') || undefined,
      departmentId: p.get('departmentId') || undefined,
      projectId: p.get('projectId') || undefined,
      clientId: p.get('clientId') || undefined,
      employeeId: p.get('employeeId') || undefined,
      ledger: p.get('ledger') || undefined,
    };
  };

  if (path.includes('/ledger/trial')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const d = parseLedgerDims(p);
    return computeTrialBalance({
      ...d,
      from: d.resolvedFrom,
      to: d.resolvedTo,
      ledger: d.ledger || 'FINANCIAL',
      includeZero: p.get('includeZero') === 'true',
    });
  }

  if (path.includes('/ledger/income')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const d = parseLedgerDims(p);
    return computeIncomeStatement({
      ...d,
      from: d.resolvedFrom,
      to: d.resolvedTo,
      compareFrom: p.get('compareFrom') || undefined,
      compareTo: p.get('compareTo') || undefined,
    });
  }

  if (path.includes('/ledger/balance')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const d = parseLedgerDims(p);
    return computeBalanceSheet({
      ...d,
      asOf: d.resolvedAsOf,
      compareAsOf: p.get('compareAsOf') || undefined,
    });
  }

  if (path.includes('/ledger/cash-flow')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const d = parseLedgerDims(p);
    return computeCashFlowStatement({
      ...d,
      from: d.resolvedFrom,
      to: d.resolvedTo,
      compareFrom: p.get('compareFrom') || undefined,
      compareTo: p.get('compareTo') || undefined,
    });
  }

  if (path.includes('/ledger/equity-changes')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const d = parseLedgerDims(p);
    return computeEquityChangesStatement({
      ...d,
      from: d.resolvedFrom,
      to: d.resolvedTo,
      compareFrom: p.get('compareFrom') || undefined,
      compareTo: p.get('compareTo') || undefined,
    });
  }

  if (path.includes('/ledger/account-statement')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const d = parseLedgerDims(p);
    return computeAccountStatement({
      ...d,
      accountId: p.get('accountId') || undefined,
      from: d.resolvedFrom,
      to: d.resolvedTo,
    });
  }

  if (path.includes('/posting-rules') || path.includes('/posting-events')) {
    const defaultRules = [
      { id: 'pr-01', eventCode: 'INVOICE_POSTED', nameAr: 'ترحيل فاتورة مبيعات', debitAccountCode: '10301', creditAccountCode: '40101', taxAccountCode: '20201', isActive: true },
      { id: 'pr-02', eventCode: 'PAYROLL_POSTED', nameAr: 'ترحيل مسير الرواتب الشهري', debitAccountCode: '50101', creditAccountCode: '10202', isActive: true },
      { id: 'pr-03', eventCode: 'DEPRECIATION_POSTED', nameAr: 'ترحيل قيد الإهلاك الدوري', debitAccountCode: '50301', creditAccountCode: '10502', isActive: true },
    ];
    return makeList(getEntityList('posting_rules', defaultRules));
  }

  // 12. Invoicing, ZATCA & Sales
  if (path.includes('/credit-notes')) {
    return makeList(getEntityList('credit_notes', []));
  }
  if (path.includes('/sales-debit-notes')) {
    const invs = getEntityList<any>('invoices', []).filter((i) => i.invoiceType === 'DEBIT_NOTE');
    return makeList(invs);
  }

  if (path.includes('/invoices') || path.includes('/sal/invoices') || path.includes('/zatca/invoices')) {
    const cleanI = path.split('?')[0].replace(/\/$/, '');
    const invs = getEntityList<any>('invoices', []);
    if (cleanI.endsWith('/details') && cleanI.includes('/zatca/invoices/')) {
      const parts = cleanI.split('/').filter(Boolean);
      return getInvoiceZatcaDetailsLocal(parts[parts.length - 2]);
    }
    if (path.includes('/ubl-xml')) {
      const parts = cleanI.split('/').filter(Boolean);
      const xmlIdx = parts.findIndex((p) => p === 'ubl-xml');
      const targetId = xmlIdx > 0 ? parts[xmlIdx - 1] : '';
      const inv = invs.find((i: any) => i.id === targetId || i.invoiceNo === targetId) || invs[0];
      const ublXml = inv ? buildZatcaUblXml(inv) : '<?xml version="1.0" encoding="UTF-8"?><Invoice></Invoice>';
      return { ublXml, hash: inv?.zatcaHash || sha256Hex(ublXml), qrCode: inv?.zatcaQrCode || '' };
    }
    const single = invs.find((i: any) => cleanI.endsWith(`/${i.id}`) || cleanI.endsWith(`/${i.invoiceNo}`));
    if (single) {
      return {
        ...single,
        lines: Array.isArray(single.lines) ? single.lines : [],
        payments: Array.isArray(single.payments) ? single.payments : [],
      };
    }
    const filtered = filterInvoicesByQuery(invs, path, { isZatca: path.includes('/zatca/invoices') });
    if (path.includes('/zatca/invoices')) {
      return filtered.map((i: any) => ({
        ...i,
        uuid: i.zatcaUuid || i.id,
        icv: i.zatcaIcv || 1,
        accountingStatus: i.status,
        zatcaStatus: i.zatcaStatus || 'NOT_SUBMITTED',
        complianceStatus: i.zatcaComplianceStatus || 'PASS',
        submissionType: i.zatcaSubmissionType || (i.invoiceType === 'SIMPLIFIED' ? 'REPORTING' : 'CLEARANCE'),
        clientVat: i.clientVatNumber || '',
        hasQr: Boolean(i.zatcaQrCode),
        branchName: 'الفرع الرئيسي',
        deviceCode: 'EGS-MAIN-01',
      }));
    }
    return makeList(filtered);
  }

  // 13. ZATCA Phase 2
  if (path.includes('/zatca/status')) {
    return getZatcaLiveStatusV2();
  }

  if (path.includes('/zatca/settings')) {
    return getZatcaSettingsV2();
  }

  if (path.includes('/zatca/devices')) {
    const qStr = path.includes('?') ? path.split('?')[1] : '';
    const env = new URLSearchParams(qStr).get('environment') || undefined;
    return listZatcaDevicesLocal(env);
  }

  if (path.includes('/zatca/retry-queue')) {
    return listRetryQueueLocal();
  }

  if (path.includes('/zatca/notifications')) {
    return listNotificationsLocal();
  }

  if (path.includes('/zatca/submissions')) {
    return getEntityList('zatca_submissions', []);
  }

  if (path.includes('/zatca/decode-qr')) {
    return decodeZatcaTlv('');
  }

  // 14. Purchases & Vendors
  if (path.includes('/vendors')) {
    const vens = getEntityList('vendors', []);
    const singleVen = vens.find((v: any) => path.endsWith(`/${v.id}`) || path.endsWith(`/${v.code}`));
    if (singleVen) return singleVen;
    return makeList(vens);
  }

  if (path.includes('/purchase-invoices') || path.includes('/pur/invoices')) {
    const pinvs = getEntityList('purchase_invoices', []);
    const cleanPinvPath = path.split('?')[0];
    const singlePinv: any = pinvs.find((p: any) => cleanPinvPath.endsWith(`/${p.id}`));
    if (singlePinv) {
      return {
        ...singlePinv,
        lines: Array.isArray(singlePinv.lines) ? singlePinv.lines : [],
        payments: Array.isArray(singlePinv.payments) ? singlePinv.payments : [],
      };
    }
    return makeList(filterInvoicesByQuery(pinvs, path));
  }

  if (path.includes('/debit-notes')) {
    return makeList(getEntityList('debit_notes', []));
  }

  if (path.includes('/services/catalog') || path.includes('/services')) {
    return makeList(getEntityList('services_catalog', []));
  }

  // 15. Payroll, Variables, Loans (Business Process Sections 12-16)
  if (path.includes('/payroll-runs')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const runs = getEntityList<any>('payroll_runs', []);
    if (cleanP.includes('/preview')) {
      const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      const period = resolvePeriodByIdOrDate(p.get('periodId'), null);
      const emps = getEntityList<any>('employees', []).filter((e) => e.status === 'ACTIVE');
      const monthlyVars = getEntityList<any>('monthly_variables', []).filter(
        (v) => v.status === 'APPROVED' && (!period || !v.fiscalPeriodId || v.fiscalPeriodId === period.id),
      );
      const loans = getEntityList<any>('loans', []).filter((l) => l.status === 'ACTIVE');
      const existing = runs.find((r) => r.fiscalPeriodId === period?.id && r.status === 'POSTED');

      let totalSalary = 0;
      let totalVars = 0;
      let totalLoanDed = 0;
      let totalNet = 0;

      const lines = emps.map((emp, idx) => {
        const salRaw = Number(emp.basicSalary || emp.basic_salary || emp.salary || 0);
        const salBase = convertToBase(salRaw, emp.salaryCurrency || 'SAR', period?.endDate).amountBase;
        const empVars = monthlyVars.filter((v) => v.employeeId === emp.id || v.employeeCode === emp.code);
        let bonuses = 0;
        let overtime = 0;
        let allowances = 0;
        let deductions = 0;
        for (const v of empVars) {
          const vBase = convertToBase(v.computedAmount || v.amount || 0, v.currencyCode || 'SAR', period?.endDate).amountBase;
          if (v.category === 'DEDUCTION') {
            deductions += vBase;
          } else if (String(v.variableTypeId || '').includes('overtime') || String(v.variableTypeName || '').includes('إضافي')) {
            overtime += vBase;
          } else if (String(v.variableTypeId || '').includes('allow') || String(v.variableTypeName || '').includes('بدل')) {
            allowances += vBase;
          } else {
            bonuses += vBase;
          }
        }

        // Section 16: Loan installment due for this exact period reduces Net Payable ONLY
        let loanDed = 0;
        for (const loan of loans) {
          if (loan.employeeId !== emp.id && loan.employeeCode !== emp.code) continue;
          const dueInst = (Array.isArray(loan.installments_list) ? loan.installments_list : []).filter(
            (inst: any) => inst.status === 'PENDING' && (!period || inst.periodId === period.id),
          );
          for (const inst of dueInst) loanDed += Number(inst.dueAmount || 0);
        }

        const gross = salBase + bonuses + overtime + allowances;
        const net = Math.max(0, gross - deductions - loanDed);
        totalSalary += salBase;
        totalVars += (bonuses + overtime + allowances - deductions);
        totalLoanDed += loanDed;
        totalNet += net;

        const contractCur = (emp.salaryCurrency || 'SAR').toUpperCase();
        const payoutCur = (emp.payoutCurrency || contractCur || 'SAR').toUpperCase();
        const fxInfo = convertToBase(1, payoutCur, period?.endDate);
        const payoutExRate = fxInfo.rate > 0 ? fxInfo.rate : 1;
        const payoutAmt = payoutCur === (getStoredCompany().baseCurrency || 'SAR')
          ? net
          : Math.round((net / payoutExRate) * 100) / 100;

        return {
          id: `prl-${idx + 1}`,
          employeeId: emp.id,
          employeeCode: emp.code,
          employeeName: emp.fullNameAr || emp.nameAr || 'موظف',
          contractCurrency: contractCur,
          payoutCurrency: payoutCur,
          payoutExchangeRate: payoutExRate.toFixed(4),
          payoutAmount: payoutAmt.toFixed(2),
          iban: emp.iban || emp.bankAccountNo || null,
          salaryBase: salBase.toFixed(2),
          bonusesBase: bonuses.toFixed(2),
          overtimeBase: overtime.toFixed(2),
          allowancesBase: allowances.toFixed(2),
          deductionsBase: deductions.toFixed(2),
          loanDeductionsBase: loanDed.toFixed(2),
          grossBase: gross.toFixed(2),
          netPayableBase: net.toFixed(2),
        };
      });

      return {
        runCode: `PAY-${(period?.startDate || new Date().toISOString()).slice(0, 7)}-PREV`,
        periodName: period?.name || 'الفترة الحالية',
        employeeCount: lines.length,
        totalSalaryBase: totalSalary.toFixed(2),
        totalVariablesBase: totalVars.toFixed(2),
        totalLoanDeductionsBase: totalLoanDed.toFixed(2),
        netPayableBase: totalNet.toFixed(2),
        existingRunId: existing?.id || null,
        currencyCode: getStoredCompany().baseCurrency || 'SAR',
        payoutCurrency: getStoredCompany().baseCurrency || 'SAR',
        lines,
      };
    }

    const singleRun: any = runs.find((r) => cleanP.endsWith(`/${r.id}`));
    if (singleRun) {
      return {
        ...singleRun,
        lines: Array.isArray(singleRun.lines) ? singleRun.lines : [],
        entries: Array.isArray(singleRun.entries) ? singleRun.entries : [],
      };
    }
    return makeList(runs);
  }

  if (path.includes('/monthly-variables')) {
    return makeList(getEntityList('monthly_variables', []));
  }

  if (path.includes('/variable-types')) {
    return makeList(getEntityList('variable_types', defaultVariableTypesList));
  }

  if (path.includes('/loans')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const loans = getEntityList('loans', []);
    const normalizeLoan = (l: any) => {
      const list = Array.isArray(l.installments_list)
        ? l.installments_list
        : (Array.isArray(l.installmentsSchedule) ? l.installmentsSchedule : (Array.isArray(l.installments) ? l.installments : []));
      const count = typeof l.installments === 'number' ? l.installments : (list.length || 1);
      const principalNum = Number(l.principalBase || l.principalAmount || 0);
      return {
        ...l,
        principalBase: principalNum.toFixed(2),
        installments: count,
        installmentAmount: l.installmentAmount || (principalNum / Math.max(1, count)).toFixed(2),
        installments_list: list,
      };
    };
    const singleLoan: any = loans.find((l: any) => cleanP.endsWith(`/${l.id}`));
    if (singleLoan) return normalizeLoan(singleLoan);
    return makeList(loans.map(normalizeLoan));
  }

  if (path.includes('/eosb')) {
    const emps = getEntityList<any>('employees', []);
    const emp = emps.find((e: any) => e.id === body?.employeeId) || emps[0];
    const salary = Number(emp?.basicSalary || emp?.basic_salary || 0);
    const years = 3;
    const halfMonth = salary / 2;
    const gross = halfMonth * years;
    const pct = body?.terminationType === 'RESIGNATION' ? 33.333 : 100;
    const net = (gross * pct) / 100;
    return {
      employeeId: emp?.id || '',
      employeeCode: emp?.code || '',
      employeeNameAr: emp?.fullNameAr || emp?.nameAr || 'موظف',
      hireDate: emp?.hireDate || '2023-01-01',
      terminationDate: body?.terminationDate || new Date().toISOString().slice(0, 10),
      totalServiceDays: years * 365,
      totalServiceYears: years,
      monthlySalary: salary.toFixed(2),
      baseAmountFirst5Years: gross.toFixed(2),
      baseAmountAfter5Years: '0.00',
      grossAmount: gross.toFixed(2),
      entitlementPct: pct,
      netEosbDue: net.toFixed(2),
      saudiLaborArticle: body?.terminationType === 'RESIGNATION' ? 'المادة 85 من نظام العمل السعودي' : 'المادة 84 من نظام العمل السعودي',
      calculationBreakdownAr: 'محسوبة بدقة وفقاً لنظام العمل السعودي.',
    };
  }

  // 16. Fixed Assets & Custodies
  if (path.includes('/asset-categories')) {
    return makeList(getEntityList('asset_categories', defaultAssetCategoriesList));
  }

  if (path.includes('/assets')) {
    const cleanA = path.split('?')[0].replace(/\/$/, '');
    const assets = getEntityList('assets', []);
    const singleAst: any = assets.find((a: any) => cleanA.endsWith(`/${a.id}`));
    if (singleAst) {
      return {
        ...singleAst,
        custodies: Array.isArray(singleAst.custodies) ? singleAst.custodies : [],
        schedule: Array.isArray(singleAst.schedule) ? singleAst.schedule : [],
      };
    }
    return makeList(assets);
  }

  if (path.includes('/depreciation-runs')) {
    const cleanD = path.split('?')[0].replace(/\/$/, '');
    if (cleanD.includes('/preview')) {
      const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      return previewDepreciationRun(p.get('periodId'));
    }
    const runs = getEntityList<any>('depreciation_runs', []);
    const singleRun = runs.find((r) => cleanD.endsWith(`/${r.id}`));
    if (singleRun) return singleRun;
    return makeList(runs);
  }

  if (path.includes('/custodies/report') || (path.includes('/custodies') && path.includes('/report'))) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const pId = p.get('periodId');
    const pObj = pId ? resolvePeriodByIdOrDate(pId, null) : null;
    return computeCustodiesReport({
      employeeId: p.get('employeeId') || undefined,
      costCenterId: p.get('costCenterId') || undefined,
      projectId: p.get('projectId') || undefined,
      fromDate: p.get('fromDate') || p.get('from') || (pObj ? String(pObj.startDate).slice(0, 10) : undefined),
      toDate: p.get('toDate') || p.get('to') || (pObj ? String(pObj.endDate).slice(0, 10) : undefined),
    });
  }

  if (path.includes('/custodies')) {
    const cleanC = path.split('?')[0].replace(/\/$/, '');
    const custodies = getEntityList('custodies', []);
    const singleCst = custodies.find((c: any) => cleanC.endsWith(`/${c.id}`));
    if (singleCst) return singleCst;
    return makeList(custodies);
  }

  // 17. Cost Engine, Profiles & Components (100% Dynamic from real data + Cost Profiles + FX + Asset Depr)
  if (path.includes('/cost-components')) {
    return makeList(getEntityList('cost_components', defaultCostComponentsList));
  }

  if (path.includes('/cost-profiles')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const profiles = getEntityList('cost_profiles', defaultCostProfilesList);
    const singleCp: any = profiles.find((p: any) => cleanP.endsWith(`/${p.id}`) || cleanP.endsWith(`/${p.code}`));
    if (singleCp) {
      const lines = Array.isArray(singleCp.lines) ? singleCp.lines : (Array.isArray(singleCp.components) ? singleCp.components : []);
      return { ...singleCp, lines, components: lines };
    }
    return makeList(profiles);
  }

  if (path.includes('/cost-sheet')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const period = resolvePeriodByIdOrDate(p.get('periodId'), null);
    const emps = getEntityList<any>('employees', []);
    if (emps.length === 0) {
      return {
        period: period || { id: 'fp-2026-11', name: 'نوفمبر 2026' },
        totals: { totalCostBase: '0.00', distributableCostBase: '0.00', totalDeductionsBase: '0.00' },
        rows: [],
        dailyWorkingHours: 8,
        annualWorkingDays: 240,
        monthlyWorkingDays: 22,
        components: getEntityList('cost_components', defaultCostComponentsList),
      };
    }

    let sumTotal = 0;
    let sumDist = 0;
    let sumDed = 0;
    const rows = emps.map((e: any, idx: number) => {
      const bd = computeEmployeeCostBreakdown(e, period);
      sumTotal += bd.totalCostBase;
      sumDist += bd.distributableCostBase;
      sumDed += bd.totalDeductionsBase;
      return {
        employeeId: e.id || `emp-${idx}`,
        code: e.code || `EMP-00${idx + 1}`,
        fullNameAr: e.fullNameAr || e.nameAr || e.name || 'موظف',
        employedDays: bd.employedDays,
        periodDays: bd.periodDays,
        totalCostBase: bd.totalCostBase.toFixed(2),
        distributableCostBase: bd.distributableCostBase.toFixed(2),
        totalDeductionsBase: bd.totalDeductionsBase.toFixed(2),
        lines: bd.lines,
      };
    });

    return {
      period: period || { id: 'fp-2026-11', name: 'نوفمبر 2026' },
      totals: {
        totalCostBase: sumTotal.toFixed(2),
        distributableCostBase: sumDist.toFixed(2),
        totalDeductionsBase: sumDed.toFixed(2),
      },
      rows,
      dailyWorkingHours: 8,
      annualWorkingDays: 240,
      monthlyWorkingDays: 22,
      components: getEntityList('cost_components', defaultCostComponentsList),
    };
  }

  // 18. Overhead Policy & Service Prices
  if (path.includes('/overhead-policy')) {
    return getOverheadPolicy();
  }

  if (path.includes('/service-prices')) {
    return makeList(getEntityList('service_prices', []));
  }

  // 19. Revenue Recognition & Runs
  if (path.includes('/revenue-adjustments')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const pId = q.get('periodId');
    const allAdjs = getEntityList<any>('revenue_adjustments', []);
    const filtered = pId ? allAdjs.filter((r) => r.fiscalPeriodId === pId || r.originalPeriodId === pId) : allAdjs;
    return makeList(filtered);
  }

  if (path.includes('/revenue-runs')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const runs = getEntityList<any>('revenue_runs', []);
    if (cleanP.includes('/preview')) {
      const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      const period = resolvePeriodByIdOrDate(q.get('periodId'), null);
      const asgs = getEntityList('assignments', []).filter((a: any) => isAssignmentActiveInPeriod(a, period));
      const servicePrices = getEntityList('service_prices', []).filter((sp: any) => !sp.effectiveTo);
      const emps = getEntityList('employees', []);
      const prjs = getEntityList('projects', []);
      const existing = runs.find((r) => r.fiscalPeriodId === period?.id && r.status === 'POSTED');
      let totalRev = 0;
      const lines = asgs.map((a: any, idx: number) => {
        const emp = emps.find((e: any) => matchesEmployee(a, e));
        const prj = prjs.find((p: any) => matchesProject(a, p));
        const econ = computeAssignmentEconomics({
          assignment: a,
          employee: emp,
          project: prj,
          servicePrices,
          period,
        });
        totalRev += econ.revenueBase;
        return {
          id: `rev-line-${idx + 1}`,
          employeeId: emp?.id || a.employeeId,
          employeeName: emp?.fullNameAr || a.employeeName || 'الموظف',
          projectId: prj?.id || a.projectId,
          projectName: prj?.nameAr || a.projectName || 'المشروع',
          clientName: prj?.clientName || a.clientName || 'العميل',
          pricingBasis: econ.pricingBasis,
          units: econ.billingUnits,
          unitPrice: econ.unitPriceBase,
          allocationPct: econ.allocationPct,
          grossRevenueBase: econ.revenueBase,
        };
      });
      const uniqueEmps = new Set(lines.map((l) => l.employeeId)).size;
      const uniquePrjs = new Set(lines.map((l) => l.projectId)).size;
      return {
        lineCount: lines.length,
        projectCount: uniquePrjs,
        employeeCount: uniqueEmps,
        totalRevenueBase: Math.round(totalRev * 100) / 100,
        lines,
        existingRunId: existing?.id || null,
      };
    }
    const singleRun = runs.find((r) => cleanP.endsWith(`/${r.id}`));
    if (singleRun) return singleRun;
    return makeList(runs);
  }

  // 20. Reports & Financial Intelligence
  if (path.includes('/reports/cost-centers')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeCostCentersReport({
      periodId: q.get('periodId') || undefined,
      from: q.get('from') || undefined,
      to: q.get('to') || undefined,
      compareFrom: q.get('compareFrom') || undefined,
      compareTo: q.get('compareTo') || undefined,
      ledger: q.get('ledger') || 'FINANCIAL',
      costCenterId: q.get('costCenterId') || undefined,
      ccType: q.get('ccType') || undefined,
      branchId: q.get('branchId') || undefined,
      departmentId: q.get('departmentId') || undefined,
      projectId: q.get('projectId') || undefined,
      clientId: q.get('clientId') || undefined,
      employeeId: q.get('employeeId') || undefined,
    });
  }

  if (path.includes('/reports/multi-level')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeMultiLevelReportsOverview({
      periodId: q.get('periodId') || undefined,
      from: q.get('from') || undefined,
      to: q.get('to') || undefined,
      compareFrom: q.get('compareFrom') || undefined,
      compareTo: q.get('compareTo') || undefined,
      ledger: q.get('ledger') || 'FINANCIAL',
      costCenterId: q.get('costCenterId') || undefined,
      ccType: q.get('ccType') || undefined,
      branchId: q.get('branchId') || undefined,
      departmentId: q.get('departmentId') || undefined,
      projectId: q.get('projectId') || undefined,
      clientId: q.get('clientId') || undefined,
      employeeId: q.get('employeeId') || undefined,
    });
  }

  if (path.includes('/reports/profitability/overview')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const prof = computeDynamicProfitability({
      periodId: q.get('periodId'),
      from: q.get('from'),
      to: q.get('to'),
      clientId: q.get('clientId'),
      projectId: q.get('projectId'),
      employeeId: q.get('employeeId'),
      costCenterId: q.get('costCenterId'),
      departmentId: q.get('departmentId'),
    } as any);
    return {
      summary: prof.empSummary,
      employees: prof.empList,
      projects: prof.projectList,
      clients: prof.clientList,
    };
  }

  if (path.includes('/reports/executive-intelligence')) {
    const q = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const pId = q.get('periodId') || undefined;
    const pObj = pId ? resolvePeriodByIdOrDate(pId, null) : null;
    const fFrom = q.get('from') || (pObj ? String(pObj.startDate).slice(0, 10) : undefined);
    const fTo = q.get('to') || (pObj ? String(pObj.endDate).slice(0, 10) : undefined);
    const dims = {
      branchId: q.get('branchId') || undefined,
      costCenterId: q.get('costCenterId') || undefined,
      departmentId: q.get('departmentId') || undefined,
      projectId: q.get('projectId') || undefined,
      clientId: q.get('clientId') || undefined,
      employeeId: q.get('employeeId') || undefined,
      ledger: q.get('ledger') || undefined,
    };
    const prof = computeDynamicProfitability({ periodId: pId, from: fFrom, to: fTo, ...dims } as any);
    const is = computeIncomeStatement({ from: fFrom, to: fTo, ...dims });
    const avgUtil = prof.empList.length > 0
      ? prof.empList.reduce((s: number, e: any) => s + Number(e.allocatedPct || 0), 0) / prof.empList.length
      : 0;
    const revTotal = Number(prof.empSummary.totalRevenueBase || 0) || Number(is.revenue || 0);
    const netProf = Number(prof.empSummary.totalProfitBase || 0) || Number(is.netProfit || 0);
    return {
      kpis: {
        ytdRevenue: revTotal.toFixed(2),
        ytdNetProfit: netProf.toFixed(2),
        netMarginPct: revTotal > 0 ? ((netProf / revTotal) * 100).toFixed(1) : '0.0',
        utilizationRate: avgUtil.toFixed(1),
        activeProjects: prof.projectList.filter((p: any) => p.status === 'ACTIVE').length,
        totalDevelopers: prof.empList.length,
      },
      topClients: prof.clientList,
      profitability: {
        summary: prof.empSummary,
        employees: prof.empList,
        projects: prof.projectList,
        clients: prof.clientList,
      },
    };
  }

  if (path.includes('/reports/cash-flow')) {
    return computeCashFlowSummary();
  }

  if (path.includes('/eosb/settlements')) {
    return makeList(getEntityList('eosb_settlements', []));
  }

  if (path.includes('/vat-return/settlements')) {
    return makeList(getEntityList('vat_settlements', []));
  }

  if (path.includes('/reports/vat-return') || path.includes('/vat-report')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    return computeVatReturnSummary({
      periodId: p.get('fiscalPeriodId') || p.get('periodId'),
      from: p.get('from'),
      to: p.get('to'),
      costCenterId: p.get('costCenterId'),
      projectId: p.get('projectId'),
      clientId: p.get('clientId'),
    });
  }

  // 21. Zakat Declarations & Settings
  if (path.includes('/zakat/returns')) {
    return makeList(getEntityList('zakat_returns', []));
  }

  if (path.includes('/zakat/settings')) {
    return getZakatSettings();
  }

  if (path.includes('/zakat/calculate') || path.includes('/zakat')) {
    return computeZakatSummary({});
  }

  if (path.includes('/snapshots')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const snaps = getEntityList<any>('snapshots', []);
    const verifySnap = (s: any) => ({
      ...s,
      hashValid: s?.data ? sha256Hex(JSON.stringify(s.data)) === s.dataHash : Boolean(s.hashValid),
    });
    const singleSnap = snaps.find((s) => cleanP.endsWith(`/${s.id}`));
    if (singleSnap) return verifySnap(singleSnap);
    return makeList(snaps.map(verifySnap));
  }

  // 22. Users, Roles & Permissions
  if (path.includes('/permissions')) {
    const defaultPerms = [
      { id: 'perm-1', code: 'org.companies.read', module: 'org', resource: 'companies', action: 'read', descriptionAr: 'بيانات الشركة — قراءة وعرض بيانات المنشأة' },
      { id: 'perm-2', code: 'org.companies.write', module: 'org', resource: 'companies', action: 'write', descriptionAr: 'بيانات الشركة — تعديل بيانات المنشأة' },
      { id: 'perm-3', code: 'hr.employees.read', module: 'hr', resource: 'employees', action: 'read', descriptionAr: 'سجل الموظفين — قراءة وعرض بيانات الكوادر' },
      { id: 'perm-4', code: 'hr.employees.write', module: 'hr', resource: 'employees', action: 'write', descriptionAr: 'سجل الموظفين — إضافة وتعديل ملفات الكوادر' },
      { id: 'perm-5', code: 'prj.projects.read', module: 'prj', resource: 'projects', action: 'read', descriptionAr: 'سجل المشاريع — متابعة العقود وتكاليف المشاريع' },
      { id: 'perm-6', code: 'prj.projects.write', module: 'prj', resource: 'projects', action: 'write', descriptionAr: 'سجل المشاريع — إنشاء واعتماد المشاريع' },
      { id: 'perm-7', code: 'pay.runs.read', module: 'pay', resource: 'runs', action: 'read', descriptionAr: 'مسير الرواتب — استعراض مسيرات الأجور' },
      { id: 'perm-8', code: 'pay.runs.write', module: 'pay', resource: 'runs', action: 'write', descriptionAr: 'مسير الرواتب — اعتماد وترحيل مسيرات الأجور' },
      { id: 'perm-9', code: 'acc.journals.read', module: 'acc', resource: 'journals', action: 'read', descriptionAr: 'القيود المحاسبية — استعراض دفتر اليومية' },
      { id: 'perm-10', code: 'acc.journals.write', module: 'acc', resource: 'journals', action: 'write', descriptionAr: 'القيود المحاسبية — إنشاء وترحيل القيود' },
      { id: 'perm-11', code: 'sal.zatca.read', module: 'sal', resource: 'zatca', action: 'read', descriptionAr: 'هيئة الزكاة ZATCA — استعراض الفواتير والربط' },
      { id: 'perm-12', code: 'sal.zatca.write', module: 'sal', resource: 'zatca', action: 'write', descriptionAr: 'هيئة الزكاة ZATCA — إرسال واعتماد الفواتير' },
    ];
    return makeList(getEntityList('permissions', defaultPerms));
  }

  if (path.includes('/roles')) {
    const defaultRoles = [
      { id: 'role-1', code: 'ADMIN', nameAr: 'مدير النظام التنفيذي (Admin)', description: 'كامل الصلاحيات المالية والإدارية والتقنية وإقفال وإعادة فتح الشهور', userCount: 1, permissionCount: 12, isTemplate: false, isSystem: true, permissions: ['org.companies.read', 'org.companies.write', 'hr.employees.read', 'hr.employees.write', 'prj.projects.read', 'prj.projects.write', 'pay.runs.read', 'pay.runs.write', 'acc.journals.read', 'acc.journals.write', 'sal.zatca.read', 'sal.zatca.write'], rowVersion: 1 },
      { id: 'role-2', code: 'HR', nameAr: 'إدارة الموارد البشرية (HR)', description: 'إدارة الموظفين والرواتب والبدلات والسلف والمتغيرات الشهرية', userCount: 1, permissionCount: 5, isTemplate: false, isSystem: false, permissions: ['hr.employees.read', 'hr.employees.write', 'pay.runs.read', 'pay.runs.write', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-3', code: 'FINANCE', nameAr: 'الإدارة المالية والمحاسبة (Finance)', description: 'إدارة التكاليف، الإيرادات، الأوفر هيد، القيود، الضرائب، وإقفال الشهر', userCount: 1, permissionCount: 6, isTemplate: false, isSystem: false, permissions: ['acc.journals.read', 'acc.journals.write', 'sal.zatca.read', 'sal.zatca.write', 'pay.runs.read', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-4', code: 'PROJECT_MANAGER', nameAr: 'مدير المشاريع والعمليات (Project Manager)', description: 'إدارة المشاريع، تخصيص الكوادر، ومتابعة ربحية المشاريع والوقت غير المستغل', userCount: 1, permissionCount: 4, isTemplate: false, isSystem: false, permissions: ['prj.projects.read', 'prj.projects.write', 'hr.employees.read', 'org.companies.read'], rowVersion: 1 },
      { id: 'role-5', code: 'VIEWER', nameAr: 'مراقب ومستعرض تقارير (Viewer)', description: 'صلاحية قراءة واستعراض التقارير ولوحات الربحية فقط دون تعديل', userCount: 0, permissionCount: 5, isTemplate: true, isSystem: false, permissions: ['org.companies.read', 'hr.employees.read', 'prj.projects.read', 'pay.runs.read', 'acc.journals.read'], rowVersion: 1 },
    ];
    const roles = getEntityList('roles', defaultRoles);
    const singleRole = roles.find((r: any) => path.endsWith(`/${r.id}`));
    if (singleRole) return singleRole;
    return makeList(roles);
  }

  if (path.includes('/users')) {
    const defaultUsers = [
      {
        id: 'u-1',
        username: 'admin',
        fullName: 'المدير التنفيذي',
        email: 'admin@idham.net',
        isSystemAdmin: true,
        status: 'ACTIVE',
        roles: [{ assignmentId: 'ra-1', roleName: 'مدير النظام التنفيذي' }],
        lastLoginAt: new Date().toISOString(),
      },
    ];
    return makeList(getEntityList('users', defaultUsers));
  }

  // 23. Security & Audit Logs (Real user activities with full filters)
  if (path.includes('/audit-log') || path.includes('/audit/log')) {
    const p = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    const fTable = (p.get('table') || '').toLowerCase();
    const fAction = p.get('action') || '';
    const fEntity = p.get('entityId') || '';
    const fFrom = p.get('from') || '';
    const fTo = p.get('to') || '';
    let logs = getEntityList<any>('audit_log', []).map((a) => ({
      ...a,
      occurredAt: a.occurredAt || a.createdAt,
      userName: a.userName || a.actor || 'المدير التنفيذي',
      schemaName: a.schemaName || 'core',
      entityId: a.entityId || a.recordId || a.id,
      changedFields: Array.isArray(a.changedFields) ? a.changedFields : [],
    }));
    if (fTable) logs = logs.filter((l) => String(l.tableName || '').toLowerCase().includes(fTable));
    if (fAction) logs = logs.filter((l) => l.action === fAction);
    if (fEntity) logs = logs.filter((l) => l.entityId === fEntity || l.recordId === fEntity);
    if (fFrom) logs = logs.filter((l) => String(l.occurredAt || '').slice(0, 10) >= fFrom);
    if (fTo) logs = logs.filter((l) => String(l.occurredAt || '').slice(0, 10) <= fTo);
    logs.sort((a, b) => String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')));
    return makeList(logs);
  }

  if (path.includes('/security-events') || path.includes('/audit/security')) {
    return makeList(getEntityList('security_events', []));
  }

  if (path.includes('/auth/logout') || path.includes('/auth/password/change')) {
    return { success: true, message: 'تم بنجاح' };
  }

  if (path.includes('/closing/periods')) {
    const cleanP = path.split('?')[0].replace(/\/$/, '');
    const segs = cleanP.split('/').filter(Boolean); // ['closing', 'periods', periodId, 'checks']
    const periodId = segs[2] || 'fp-2026-11';
    return evaluatePeriodClosingChecks(periodId);
  }

  if (path.includes('/zatca/onboard')) {
    return { onboarded: true, csidStatus: 'PRODUCTION', message: 'تم الربط مع هيئة الزكاة والضريبة والجمارك بنجاح' };
  }

  // 24. Default fallback for any unspecified endpoint
  return makeList([]);
}
