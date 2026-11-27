/**
 * IDHAM ERP — Integrated Treasury, Cashboxes, Banks, Vouchers, Cheques & Bank Reconciliation Engine
 * Complete 1:1 local parity with NestJS TreasuryModule + full double-entry GL integration
 * and seamless linking to Employee as Primary Cost Center (الموظف = مركز التكلفة).
 */

import { deleteEntityItem, getEntityList, replaceEntityList, runLocalAtomicTx, saveEntityItem, uid } from './local-store';
import {
  assertPeriodOpen,
  convertToBase,
  createAutoPostedJournalEntry,
  createReversalJournalEntry,
  defaultBankAccountsList,
  getBaseCurrencyCode,
  getNormalizedAccounts,
  matchesEmployee,
  recordAudit,
  resolvePeriodByIdOrDate,
} from './fallback-engine';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function resolveEmployeeAndDims(input: {
  employeeId?: string | null;
  projectId?: string | null;
  costCenterId?: string | null;
  departmentId?: string | null;
  branchId?: string | null;
  clientId?: string | null;
}) {
  const emps = getEntityList<any>('employees', []);
  const prjs = getEntityList<any>('projects', []);
  const emp = input.employeeId ? emps.find((e) => e.id === input.employeeId || e.code === input.employeeId) : null;
  const prj = input.projectId ? prjs.find((p) => p.id === input.projectId || p.code === input.projectId) : null;

  const employeeId = emp?.id || input.employeeId || undefined;
  const projectId = prj?.id || input.projectId || undefined;
  const clientId = input.clientId || prj?.clientId || undefined;
  const costCenterId =
    input.costCenterId ||
    prj?.costCenterId ||
    emp?.costCenterId ||
    emp?.placement?.costCenterId ||
    (emp ? `cc-emp-${emp.id}` : undefined);
  const departmentId = input.departmentId || emp?.departmentId || emp?.placement?.departmentId || undefined;
  const branchId = input.branchId || prj?.branchId || emp?.branchId || emp?.placement?.branchId || undefined;

  return { emp, prj, employeeId, projectId, clientId, costCenterId, departmentId, branchId };
}

function resolveAccountByCodeOrId(codeOrId: string | null | undefined, fallbackCode: string): any {
  const accounts = getNormalizedAccounts();
  if (codeOrId) {
    const found = accounts.find((a) => a.id === codeOrId || a.code === codeOrId);
    if (found) return found;
  }
  return accounts.find((a) => a.code === fallbackCode) || accounts.find((a) => a.isPosting) || accounts[0];
}

function ensurePostingAccount(code: string, nameAr: string, cls: 'ASSET' | 'LIABILITY', subtype: string, parentId: string): any {
  const accounts = getNormalizedAccounts();
  const found = accounts.find((a) => a.code === code);
  if (found) return found;
  const normalBalance = cls === 'ASSET' ? 'DEBIT' : 'CREDIT';
  const statementSection = cls === 'ASSET' ? 'CURRENT_ASSETS' : 'CURRENT_LIABILITIES';
  const statementLineId = cls === 'ASSET' ? 'sl-bs-ca' : 'sl-bs-cl';
  const acc = saveEntityItem('accounts', {
    id: `acc-${code}`,
    parentId,
    code,
    nameAr,
    accountClass: cls,
    subtype,
    normalBalance,
    isPosting: true,
    isActive: true,
    level: 4,
    currency: getBaseCurrencyCode(),
    statementSection,
    statementLineId,
    cashFlowCategory: subtype === 'CASH' || subtype === 'BANK' ? 'CASH' : 'OPERATING',
    currentBalance: '0.00',
  });
  return acc;
}

export function getEnrichedTreasuryAccounts(kindFilter?: 'BANK' | 'CASH'): any[] {
  const bankList = getEntityList<any>('bank_accounts', defaultBankAccountsList);
  const accounts = getNormalizedAccounts();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const accByCode = new Map(accounts.map((a) => [a.code, a]));
  const emps = getEntityList<any>('employees', []);
  const jes = getEntityList<any>('journal_entries', []).filter((j) => j.status === 'POSTED');
  const cheques = getEntityList<any>('cheques', []);

  const enriched = bankList.map((b) => {
    const gl = accById.get(b.glAccountId) || accByCode.get(b.glAccountCode);
    let totalInflows = 0;
    let totalOutflows = 0;
    let lastTxDate: string | null = null;
    for (const je of jes) {
      for (const l of je.lines || []) {
        if ((gl?.id && l.accountId === gl.id) || (gl?.code && l.accountCode === gl.code)) {
          totalInflows += Number(l.debitBase || 0);
          totalOutflows += Number(l.creditBase || 0);
          if (!lastTxDate || String(je.entryDate) > lastTxDate) lastTxDate = String(je.entryDate);
        }
      }
    }
    const balance = round2(totalInflows - totalOutflows);
    const treasurer = b.treasurerEmployeeId ? emps.find((e) => e.id === b.treasurerEmployeeId) : null;
    const pendingCheques = cheques.filter(
      (c) => c.bankAccountId === b.id && ['RECEIVED', 'UNDER_COLLECTION', 'ISSUED'].includes(c.status),
    ).length;

    return {
      ...b,
      glAccountId: gl?.id || b.glAccountId,
      glAccountCode: gl?.code || b.glAccountCode || (b.kind === 'CASH' ? '10101' : '10201'),
      glAccountNameAr: gl?.nameAr || b.glAccountNameAr || b.name,
      treasurerName: treasurer?.fullNameAr || b.treasurerName || null,
      balance,
      totalInflows: round2(totalInflows),
      totalOutflows: round2(totalOutflows),
      pendingChequesCount: pendingCheques,
      lastTxDate,
    };
  });

  return kindFilter ? enriched.filter((x) => x.kind === kindFilter) : enriched;
}

export function createTreasuryAccount(body: any): any {
  const kind: 'BANK' | 'CASH' = body?.kind === 'CASH' ? 'CASH' : 'BANK';
  const cur = String(body?.currencyCode || getBaseCurrencyCode()).toUpperCase();
  let glAcc = body?.glAccountId ? resolveAccountByCodeOrId(body.glAccountId, kind === 'CASH' ? '10101' : '10201') : null;

  if (!glAcc || body?.autoCreateGlAccount) {
    const accounts = getNormalizedAccounts();
    const existingCodes = new Set(accounts.map((a) => String(a.code)));
    const prefix = kind === 'CASH' ? '101' : '102';
    let seq = 1;
    while (existingCodes.has(`${prefix}${String(seq).padStart(2, '0')}`)) seq++;
    const nextCode = `${prefix}${String(seq).padStart(2, '0')}`;
    glAcc = ensurePostingAccount(nextCode, body?.name || `${kind === 'CASH' ? 'خزينة' : 'حساب بنكي'} ${nextCode}`, 'ASSET', kind, 'acc-h-1101');
  }

  const list = getEntityList<any>('bank_accounts', defaultBankAccountsList);
  const nextCode = body?.code || `${kind === 'CASH' ? 'CSH' : 'BNK'}-${String(list.length + 1).padStart(2, '0')}`;
  const openingBal = round2(Number(body?.openingBalance || 0));

  const saved = saveEntityItem('bank_accounts', {
    id: body?.id || uid(kind === 'CASH' ? 'csh' : 'bnk'),
    code: nextCode,
    name: body?.name || 'حساب خزينة/بنك',
    kind,
    bankName: body?.bankName || (kind === 'CASH' ? 'الخزينة النقدية' : 'بنك تجاري'),
    bankBranch: body?.bankBranch || null,
    accountNumber: body?.accountNumber || `${kind}-${nextCode}`,
    iban: body?.iban || null,
    currencyCode: cur,
    glAccountId: glAcc.id,
    glAccountCode: glAcc.code,
    glAccountNameAr: glAcc.nameAr,
    branchId: body?.branchId || null,
    treasurerEmployeeId: body?.treasurerEmployeeId || null,
    isActive: body?.isActive !== false,
    notes: body?.notes || null,
    createdAt: new Date().toISOString(),
  });

  // If opening balance > 0, generate balanced Opening Entry so BS & TB stay reconciled!
  if (openingBal > 0) {
    const openDate = (body?.openingDate || new Date().toISOString()).slice(0, 10);
    const dims = resolveEmployeeAndDims({ employeeId: body?.treasurerEmployeeId, branchId: body?.branchId });
    createAutoPostedJournalEntry({
      entryDate: openDate,
      fiscalPeriodId: resolvePeriodByIdOrDate(undefined, openDate)?.id,
      journalType: 'OPENING',
      sourceModule: 'TREASURY',
      sourceType: 'TREASURY_OPENING',
      postingEvent: 'TREASURY_OPENING',
      reference: saved.code,
      description: `رصيد افتتاحي ${kind === 'CASH' ? 'للخزينة' : 'للحساب البنكي'}: ${saved.name}`,
      lines: [
        { accountCode: glAcc.code, debit: openingBal, credit: 0, currencyCode: cur, branchId: dims.branchId, employeeId: dims.employeeId, costCenterId: dims.costCenterId, description: `رصيد افتتاحي ${saved.name}` },
        { accountCode: '30101', debit: 0, credit: openingBal, currencyCode: cur, branchId: dims.branchId, description: `مقابل الرصيد الافتتاحي (${saved.name})` },
      ],
    });
  }

  recordAudit({
    action: 'CREATE_TREASURY_ACCOUNT',
    schemaName: 'acc',
    tableName: 'bank_accounts',
    entityId: saved.id,
    newValues: { code: saved.code, name: saved.name, kind, glAccountCode: glAcc.code },
    reason: `إنشاء ${kind === 'CASH' ? 'خزينة نقدية' : 'حساب بنكي'} (${saved.name}) وربطه بحساب ${glAcc.code}`,
  });

  return getEnrichedTreasuryAccounts().find((x) => x.id === saved.id) || saved;
}

export function updateTreasuryAccount(id: string, body: any): any {
  return runLocalAtomicTx(['bank_accounts', 'accounts'], () => {
    const list = getEntityList<any>('bank_accounts', defaultBankAccountsList);
    const cur = list.find((x) => x.id === id || x.code === id);
    if (!cur) throw new Error('الحساب البنكي / الخزينة غير موجودة');
    const updated = saveEntityItem('bank_accounts', {
      ...cur,
      code: body?.code ?? cur.code,
      name: body?.name ?? cur.name,
      bankName: body?.bankName !== undefined ? body.bankName : cur.bankName,
      bankBranch: body?.bankBranch !== undefined ? body.bankBranch : cur.bankBranch,
      accountNumber: body?.accountNumber !== undefined ? body.accountNumber : cur.accountNumber,
      iban: body?.iban !== undefined ? body.iban : cur.iban,
      treasurerEmployeeId: body?.treasurerEmployeeId !== undefined ? body.treasurerEmployeeId : cur.treasurerEmployeeId,
      branchId: body?.branchId !== undefined ? body.branchId : cur.branchId,
      notes: body?.notes !== undefined ? body.notes : cur.notes,
      isActive: body?.isActive !== undefined ? body.isActive : cur.isActive,
    });
    recordAudit({
      action: 'UPDATE_TREASURY_ACCOUNT',
      schemaName: 'acc',
      tableName: 'bank_accounts',
      entityId: cur.id,
      oldValues: { code: cur.code, name: cur.name, treasurerEmployeeId: cur.treasurerEmployeeId },
      newValues: { code: updated.code, name: updated.name, treasurerEmployeeId: updated.treasurerEmployeeId },
      reason: body?.reason || `تعديل بيانات ${cur.kind === 'CASH' ? 'الخزينة' : 'الحساب البنكي'} (${updated.name})`,
    });
    return getEnrichedTreasuryAccounts().find((x) => x.id === updated.id) || updated;
  });
}

export function deleteTreasuryAccount(id: string, reason?: string): any {
  return runLocalAtomicTx(['bank_accounts', 'treasury_vouchers', 'cheques'], () => {
    const list = getEntityList<any>('bank_accounts', defaultBankAccountsList);
    const cur = list.find((x) => x.id === id || x.code === id);
    if (!cur) throw new Error('الحساب البنكي / الخزينة غير موجودة');

    const vouchers = getEntityList<any>('treasury_vouchers', []);
    if (vouchers.some((v) => v.treasuryAccountId === cur.id)) {
      throw new Error('لا يمكن حذف خزينة أو حساب بنكي مرتبط بسندات قبض أو صرف؛ يرجى تعطيل الحساب أو إلغاء السندات غير المرحلة أولاً');
    }
    const cheques = getEntityList<any>('cheques', []);
    if (cheques.some((c) => c.bankAccountId === cur.id)) {
      throw new Error('لا يمكن حذف حساب بنكي مرتبط بشيكات في حافظة الشيكات');
    }
    const jes = getEntityList<any>('journal_entries', []).filter((j) => j.status === 'POSTED');
    if (cur.glAccountId && jes.some((j) => (j.lines || []).some((l: any) => l.accountId === cur.glAccountId || l.accountCode === cur.glAccountCode))) {
      throw new Error('لا يمكن حذف خزينة أو حساب بنكي له حركات مالية أو رصيد افتتاحي مسجل بدفتر الأستاذ');
    }
    deleteEntityItem('bank_accounts', cur.id);
    recordAudit({
      action: 'DELETE_TREASURY_ACCOUNT',
      schemaName: 'acc',
      tableName: 'bank_accounts',
      entityId: cur.id,
      oldValues: { code: cur.code, name: cur.name, kind: cur.kind },
      reason: reason || `حذف ${cur.kind === 'CASH' ? 'الخزينة' : 'الحساب البنكي'} (${cur.name})`,
    });
    return { success: true, id: cur.id };
  });
}

function applySalesInvoiceDelta(invoiceId: string, deltaAmount: number, refLabel: string, refDate: string, journalEntryId?: string | null) {
  const invoices = getEntityList<any>('invoices', []);
  const idx = invoices.findIndex((i) => i.id === invoiceId || i.invoiceNo === invoiceId);
  if (idx < 0) return;
  const inv = { ...invoices[idx] };
  const tot = round2(Number(inv.totalAmount || 0));
  const curPaid = round2(Number(inv.paidAmount || 0));
  const nextPaid = round2(Math.max(0, Math.min(tot, curPaid + deltaAmount)));
  const payStatus = nextPaid >= tot - 0.01 ? 'PAID' : nextPaid > 0.01 ? 'PARTIALLY_PAID' : 'UNPAID';
  inv.paidAmount = nextPaid.toFixed(2);
  inv.paymentStatus = payStatus;
  if (inv.status === 'POSTED' || inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
    inv.status = payStatus === 'PAID' ? 'PAID' : payStatus === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID' : 'POSTED';
  }
  const pays = Array.isArray(inv.payments) ? [...inv.payments] : [];
  if (deltaAmount > 0) {
    pays.push({ id: uid('pay'), date: refDate, amount: round2(deltaAmount).toFixed(2), reference: refLabel, journalEntryId: journalEntryId || null });
  }
  inv.payments = pays;
  saveEntityItem('invoices', inv);
}

function applyPurchaseInvoiceSettlement(purchaseInvoiceId: string, paid: boolean) {
  const list = getEntityList<any>('purchase_invoices', []);
  const idx = list.findIndex((p) => p.id === purchaseInvoiceId || p.invoiceNo === purchaseInvoiceId);
  if (idx < 0) return;
  const next = { ...list[idx], paymentStatus: paid ? 'PAID' : 'UNPAID' };
  saveEntityItem('purchase_invoices', next);
}

export function listTreasuryVouchers(query: {
  voucherType?: string;
  employeeId?: string;
  treasuryAccountId?: string;
  paymentMethod?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
} = {}): any[] {
  const list = getEntityList<any>('treasury_vouchers', []);
  const q = (query.search || '').trim().toLowerCase();
  return list
    .filter((v) => {
      if (query.voucherType && v.voucherType !== query.voucherType) return false;
      if (query.employeeId && v.employeeId !== query.employeeId) return false;
      if (query.treasuryAccountId && v.treasuryAccountId !== query.treasuryAccountId) return false;
      if (query.paymentMethod && v.paymentMethod !== query.paymentMethod) return false;
      if (query.status && v.status !== query.status) return false;
      if (query.from && String(v.voucherDate) < query.from) return false;
      if (query.to && String(v.voucherDate) > query.to) return false;
      if (q) {
        const hay = `${v.voucherNo} ${v.description} ${v.beneficiaryName || ''} ${v.employeeName || ''} ${v.clientName || ''} ${v.vendorName || ''} ${v.treasuryAccountName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => String(b.voucherDate).localeCompare(String(a.voucherDate)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function createTreasuryVoucher(body: any): any {
  const voucherType: 'RECEIPT' | 'PAYMENT' = body?.voucherType === 'PAYMENT' ? 'PAYMENT' : 'RECEIPT';
  const voucherDate = String(body?.voucherDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const period = assertPeriodOpen(voucherDate, voucherType === 'RECEIPT' ? 'إصدار سند قبض' : 'إصدار سند صرف');
  const amt = round2(Number(body?.amount || body?.amountTx || 0));
  if (amt <= 0) throw new Error('يجب إدخال مبلغ أكبر من الصفر');

  const treasuryAccs = getEnrichedTreasuryAccounts();
  const bankAcc = treasuryAccs.find((b) => b.id === body?.treasuryAccountId || b.code === body?.treasuryAccountId) || treasuryAccs[0];
  if (!bankAcc) throw new Error('يرجى تحديد الخزينة أو الحساب البنكي');

  const paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' =
    body?.paymentMethod || (bankAcc.kind === 'CASH' ? 'CASH' : 'BANK_TRANSFER');

  const partyType = body?.partyType || (body?.invoiceId || body?.clientId ? 'CLIENT' : body?.purchaseInvoiceId || body?.vendorId ? 'VENDOR' : body?.employeeId ? 'EMPLOYEE' : 'ACCOUNT');
  const clients = getEntityList<any>('clients', []);
  const vendors = getEntityList<any>('vendors', []);
  const cli = body?.clientId ? clients.find((c) => c.id === body.clientId) : null;
  const vnd = body?.vendorId ? vendors.find((v) => v.id === body.vendorId) : null;

  const dims = resolveEmployeeAndDims({
    employeeId: body?.employeeId,
    projectId: body?.projectId,
    costCenterId: body?.costCenterId,
    departmentId: body?.departmentId,
    branchId: body?.branchId || bankAcc.branchId,
    clientId: body?.clientId || cli?.id,
  });

  // Resolve counter GL account automatically or from user selection
  let fallbackCounterCode = voucherType === 'PAYMENT' ? '50401' : '40101';
  if (partyType === 'CLIENT' || body?.invoiceId) fallbackCounterCode = '10301';
  else if (partyType === 'VENDOR' || body?.purchaseInvoiceId) fallbackCounterCode = '20101';
  else if (partyType === 'EMPLOYEE') {
    if (body?.partySubType === 'LOAN' || body?.partySubType === 'LOAN_REPAYMENT') fallbackCounterCode = '10401';
    else if (body?.partySubType === 'CUSTODY' || body?.partySubType === 'CUSTODY_REFUND') fallbackCounterCode = '1320';
    else if (body?.partySubType === 'PAYROLL') fallbackCounterCode = '20401';
    else fallbackCounterCode = voucherType === 'PAYMENT' ? '50401' : '40101';
  }
  const counterAcc = resolveAccountByCodeOrId(body?.counterAccountId || body?.counterAccountCode, fallbackCounterCode);

  const cur = String(body?.currencyCode || bankAcc.currencyCode || getBaseCurrencyCode()).toUpperCase();
  const fxInfo = convertToBase(amt, cur, voucherDate);
  const existing = getEntityList<any>('treasury_vouchers', []);
  const sameTypeCount = existing.filter((x) => x.voucherType === voucherType).length + 1;
  const voucherNo = `${voucherType === 'RECEIPT' ? 'RV' : 'PV'}-${voucherDate.slice(0, 4)}-${String(sameTypeCount).padStart(4, '0')}`;

  const beneficiaryName =
    body?.beneficiaryName ||
    dims.emp?.fullNameAr ||
    cli?.nameAr ||
    vnd?.nameAr ||
    counterAcc?.nameAr ||
    'جهة مستفيدة';

  const voucherId = uid(voucherType === 'RECEIPT' ? 'rv' : 'pv');
  let chequeId: string | null = null;
  if (paymentMethod === 'CHEQUE') {
    const chq = createChequeInternal({
      chequeNo: body?.chequeNo || `CHQ-${voucherNo}`,
      direction: voucherType === 'RECEIPT' ? 'INCOMING' : 'OUTGOING',
      issueDate: voucherDate,
      dueDate: body?.chequeDueDate || voucherDate,
      bankName: body?.chequeBankName || bankAcc.bankName || 'شيك مصرفي',
      drawerName: body?.drawerName || beneficiaryName,
      bankAccountId: bankAcc.id,
      currencyCode: cur,
      amount: amt,
      partyType,
      clientId: dims.clientId || null,
      vendorId: body?.vendorId || null,
      employeeId: dims.employeeId || null,
      invoiceId: body?.invoiceId || null,
      purchaseInvoiceId: body?.purchaseInvoiceId || null,
      projectId: dims.projectId || null,
      costCenterId: dims.costCenterId || null,
      branchId: dims.branchId || null,
      counterAccountId: counterAcc.id,
      counterAccountCode: counterAcc.code,
      voucherId,
      notes: body?.description || '',
    }, false);
    chequeId = chq.id;
  }

  const record = saveEntityItem('treasury_vouchers', {
    id: voucherId,
    voucherNo,
    voucherType,
    voucherDate,
    fiscalPeriodId: period?.id || 'fp-2026-11',
    paymentMethod,
    treasuryAccountId: bankAcc.id,
    treasuryAccountName: bankAcc.name,
    treasuryAccountKind: bankAcc.kind,
    treasuryGlCode: bankAcc.glAccountCode,
    currencyCode: cur,
    exchangeRate: fxInfo.rate,
    amountTx: amt.toFixed(2),
    amountBase: fxInfo.amountBase.toFixed(2),
    partyType,
    partySubType: body?.partySubType || null,
    clientId: dims.clientId || null,
    clientName: cli?.nameAr || null,
    vendorId: body?.vendorId || null,
    vendorName: vnd?.nameAr || null,
    invoiceId: body?.invoiceId || null,
    purchaseInvoiceId: body?.purchaseInvoiceId || null,
    employeeId: dims.employeeId || null,
    employeeCode: dims.emp?.code || null,
    employeeName: dims.emp?.fullNameAr || null,
    projectId: dims.projectId || null,
    projectName: dims.prj?.nameAr || null,
    costCenterId: dims.costCenterId || null,
    departmentId: dims.departmentId || null,
    branchId: dims.branchId || null,
    counterAccountId: counterAcc.id,
    counterAccountCode: counterAcc.code,
    counterAccountName: counterAcc.nameAr,
    beneficiaryName,
    reference: body?.reference || voucherNo,
    description: body?.description || `${voucherType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} — ${beneficiaryName}`,
    chequeId,
    status: 'DRAFT',
    journalEntryId: null,
    journalEntryNo: null,
    createdAt: new Date().toISOString(),
  });

  if (body?.autoPost !== false) {
    return postTreasuryVoucher(record.id);
  }
  return record;
}

export function postTreasuryVoucher(id: string): any {
  const list = getEntityList<any>('treasury_vouchers', []);
  const v = list.find((x) => x.id === id || x.voucherNo === id);
  if (!v) throw new Error('السند غير موجود');
  if (v.status === 'POSTED') return v;
  if (v.status === 'CANCELLED') throw new Error('لا يمكن ترحيل سند ملغى');

  assertPeriodOpen(v.fiscalPeriodId || v.voucherDate, `ترحيل سند ${v.voucherNo}`);

  const amt = round2(Number(v.amountTx || 0));
  const chequeGl = v.voucherType === 'RECEIPT'
    ? ensurePostingAccount('10305', 'أوراق القبض وشيكات برسم التحصيل', 'ASSET', 'RECEIVABLE', 'acc-h-1102').code
    : ensurePostingAccount('20105', 'أوراق الدفع والشيكات الصادرة المؤجلة', 'LIABILITY', 'PAYABLE', 'acc-h-2101').code;

  const treasuryGlCode = v.paymentMethod === 'CHEQUE' ? chequeGl : (v.treasuryGlCode || '10101');
  const counterCode = v.counterAccountCode || (v.voucherType === 'RECEIPT' ? '10301' : '50401');

  const dims = {
    employeeId: v.employeeId || undefined,
    projectId: v.projectId || undefined,
    costCenterId: v.costCenterId || undefined,
    departmentId: v.departmentId || undefined,
    branchId: v.branchId || undefined,
    clientId: v.clientId || undefined,
  };

  const lines = v.voucherType === 'RECEIPT'
    ? [
        { accountCode: treasuryGlCode, debit: amt, credit: 0, currencyCode: v.currencyCode, ...dims, description: `استلام ${v.voucherNo} — ${v.description}` },
        { accountCode: counterCode, debit: 0, credit: amt, currencyCode: v.currencyCode, ...dims, description: `${v.voucherNo} (${v.beneficiaryName || ''}) — ${v.description}` },
      ]
    : [
        { accountCode: counterCode, debit: amt, credit: 0, currencyCode: v.currencyCode, ...dims, description: `${v.voucherNo} (${v.beneficiaryName || ''}) — ${v.description}` },
        { accountCode: treasuryGlCode, debit: 0, credit: amt, currencyCode: v.currencyCode, ...dims, description: `صرف ${v.voucherNo} — ${v.description}` },
      ];

  const je = createAutoPostedJournalEntry({
    entryDate: v.voucherDate,
    fiscalPeriodId: v.fiscalPeriodId,
    journalType: v.voucherType === 'RECEIPT' ? 'COLLECTION' : 'PAYMENT',
    sourceModule: 'TREASURY',
    sourceType: 'TREASURY_VOUCHER',
    sourceId: v.id,
    postingEvent: v.voucherType === 'RECEIPT' ? 'TREASURY_RECEIPT_POSTED' : 'TREASURY_PAYMENT_POSTED',
    reference: v.voucherNo,
    description: `${v.voucherType === 'RECEIPT' ? 'قيد سند قبض' : 'قيد سند صرف'} ${v.voucherNo} — ${v.description}`,
    lines,
  });

  v.status = 'POSTED';
  v.journalEntryId = je.id;
  v.journalEntryNo = je.entryNo;
  const saved = saveEntityItem('treasury_vouchers', v);

  if (v.chequeId) {
    const chqs = getEntityList<any>('cheques', []);
    const c = chqs.find((x) => x.id === v.chequeId);
    if (c) {
      c.initialJournalEntryId = je.id;
      c.initialJournalEntryNo = je.entryNo;
      saveEntityItem('cheques', c);
    }
  }

  // Non-cheque immediate sub-ledger settlement
  if (v.paymentMethod !== 'CHEQUE') {
    if (v.invoiceId && v.voucherType === 'RECEIPT') {
      applySalesInvoiceDelta(v.invoiceId, Number(v.amountTx || 0), v.voucherNo, v.voucherDate, je.id);
    }
    if (v.purchaseInvoiceId && v.voucherType === 'PAYMENT') {
      applyPurchaseInvoiceSettlement(v.purchaseInvoiceId, true);
    }
    if (v.partyType === 'EMPLOYEE' && v.partySubType === 'LOAN_REPAYMENT' && v.employeeId) {
      const loans = getEntityList<any>('loans', []);
      let rem = Number(v.amountBase || v.amountTx || 0);
      for (const loan of loans) {
        if (rem <= 0.01) break;
        if (loan.status !== 'ACTIVE' || !matchesEmployee(loan, { id: v.employeeId, code: v.employeeCode })) continue;
        let touched = false;
        const nextInst = (loan.installments_list || []).map((inst: any) => {
          if (inst.status === 'PENDING' && rem >= Number(inst.dueAmount || 0) - 0.01) {
            rem = round2(rem - Number(inst.dueAmount || 0));
            touched = true;
            return { ...inst, status: 'DEDUCTED', voucherId: v.id };
          }
          return inst;
        });
        if (touched) {
          loan.installments_list = nextInst;
          if (nextInst.every((i: any) => i.status !== 'PENDING')) loan.status = 'COMPLETED';
          saveEntityItem('loans', loan);
        }
      }
    }
  }

  recordAudit({
    action: v.voucherType === 'RECEIPT' ? 'POST_RECEIPT_VOUCHER' : 'POST_PAYMENT_VOUCHER',
    schemaName: 'fin',
    tableName: 'treasury_vouchers',
    entityId: v.id,
    newValues: { voucherNo: v.voucherNo, amount: v.amountTx, employeeName: v.employeeName, journalEntryNo: je.entryNo },
    reason: `ترحيل ${v.voucherType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} ${v.voucherNo} بقيمة ${v.amountTx} ${v.currencyCode}`,
  });

  return saved;
}

export function updateTreasuryVoucher(id: string, body: any): any {
  return runLocalAtomicTx(['treasury_vouchers', 'cheques', 'invoices', 'purchase_invoices', 'loans'], () => {
    const list = getEntityList<any>('treasury_vouchers', []);
    const v = list.find((x) => x.id === id || x.voucherNo === id);
    if (!v) throw new Error('السند غير موجود');
    if (v.status === 'CANCELLED') throw new Error('لا يمكن تعديل سند ملغى');

    if (v.chequeId) {
      const chqs = getEntityList<any>('cheques', []);
      const linkedChq = chqs.find((c) => c.id === v.chequeId);
      if (linkedChq && ['UNDER_COLLECTION', 'COLLECTED', 'PAID'].includes(linkedChq.status)) {
        throw new Error('لا يمكن تعديل سند مرتبط بشيك مودع بالتحصيل أو محصل/مصروف');
      }
    }

    const oldSnap = { amountTx: v.amountTx, treasuryAccountId: v.treasuryAccountId, employeeId: v.employeeId, description: v.description };
    const wasPosted = v.status === 'POSTED';
    if (wasPosted) {
      assertPeriodOpen(v.fiscalPeriodId || v.voucherDate, `تعديل سند ${v.voucherNo}`);
      if (v.journalEntryId) {
        createReversalJournalEntry(v.journalEntryId, body?.reason || `تعديل السند ${v.voucherNo}`, undefined, { allowSourceSync: true });
      }
      if (v.paymentMethod !== 'CHEQUE') {
        if (v.invoiceId && v.voucherType === 'RECEIPT') applySalesInvoiceDelta(v.invoiceId, -Number(v.amountTx || 0), v.voucherNo, v.voucherDate);
        if (v.purchaseInvoiceId && v.voucherType === 'PAYMENT') applyPurchaseInvoiceSettlement(v.purchaseInvoiceId, false);
      }
    }

    const voucherDate = String(body?.voucherDate || v.voucherDate).slice(0, 10);
    const period = assertPeriodOpen(voucherDate, `تعديل سند ${v.voucherNo}`);
    const amt = round2(Number(body?.amount ?? body?.amountTx ?? v.amountTx));
    if (amt <= 0) throw new Error('يجب إدخال مبلغ أكبر من الصفر');

    const treasuryAccs = getEnrichedTreasuryAccounts();
    const bankAcc = treasuryAccs.find((b) => b.id === (body?.treasuryAccountId || v.treasuryAccountId)) || treasuryAccs[0];
    const paymentMethod = body?.paymentMethod || v.paymentMethod;
    const partyType = body?.partyType || v.partyType;
    const clientId = body?.clientId !== undefined ? body.clientId : v.clientId;
    const vendorId = body?.vendorId !== undefined ? body.vendorId : v.vendorId;
    const employeeId = body?.employeeId !== undefined ? body.employeeId : v.employeeId;
    const projectId = body?.projectId !== undefined ? body.projectId : v.projectId;
    const invoiceId = body?.invoiceId !== undefined ? body.invoiceId : v.invoiceId;
    const purchaseInvoiceId = body?.purchaseInvoiceId !== undefined ? body.purchaseInvoiceId : v.purchaseInvoiceId;

    const dims = resolveEmployeeAndDims({
      employeeId,
      projectId,
      costCenterId: body?.costCenterId !== undefined ? body.costCenterId : v.costCenterId,
      departmentId: body?.departmentId !== undefined ? body.departmentId : v.departmentId,
      branchId: body?.branchId || bankAcc?.branchId || v.branchId,
      clientId,
    });
    const clients = getEntityList<any>('clients', []);
    const vendors = getEntityList<any>('vendors', []);
    const cli = clientId ? clients.find((c) => c.id === clientId) : null;
    const vnd = vendorId ? vendors.find((x) => x.id === vendorId) : null;

    let fallbackCounterCode = v.voucherType === 'PAYMENT' ? '50401' : '40101';
    if (partyType === 'CLIENT' || invoiceId) fallbackCounterCode = '10301';
    else if (partyType === 'VENDOR' || purchaseInvoiceId) fallbackCounterCode = '20101';
    else if (partyType === 'EMPLOYEE') {
      const pst = body?.partySubType !== undefined ? body.partySubType : v.partySubType;
      if (pst === 'LOAN' || pst === 'LOAN_REPAYMENT') fallbackCounterCode = '10401';
      else if (pst === 'CUSTODY' || pst === 'CUSTODY_REFUND') fallbackCounterCode = '1320';
      else if (pst === 'PAYROLL') fallbackCounterCode = '20401';
    }
    const counterAcc = resolveAccountByCodeOrId(body?.counterAccountId ?? v.counterAccountId, fallbackCounterCode);
    const cur = String(body?.currencyCode || v.currencyCode || bankAcc?.currencyCode || getBaseCurrencyCode()).toUpperCase();
    const fxInfo = convertToBase(amt, cur, voucherDate);
    const beneficiaryName = body?.beneficiaryName || dims.emp?.fullNameAr || cli?.nameAr || vnd?.nameAr || counterAcc?.nameAr || v.beneficiaryName;

    const updatedDraft = saveEntityItem('treasury_vouchers', {
      ...v,
      voucherDate,
      fiscalPeriodId: period?.id || v.fiscalPeriodId,
      paymentMethod,
      treasuryAccountId: bankAcc?.id || v.treasuryAccountId,
      treasuryAccountName: bankAcc?.name || v.treasuryAccountName,
      treasuryAccountKind: bankAcc?.kind || v.treasuryAccountKind,
      treasuryGlCode: bankAcc?.glAccountCode || v.treasuryGlCode,
      currencyCode: cur,
      exchangeRate: fxInfo.rate,
      amountTx: amt.toFixed(2),
      amountBase: fxInfo.amountBase.toFixed(2),
      partyType,
      partySubType: body?.partySubType !== undefined ? body.partySubType : v.partySubType,
      clientId: dims.clientId || null,
      clientName: cli?.nameAr || null,
      vendorId: vendorId || null,
      vendorName: vnd?.nameAr || null,
      invoiceId: invoiceId || null,
      purchaseInvoiceId: purchaseInvoiceId || null,
      employeeId: dims.employeeId || null,
      employeeCode: dims.emp?.code || null,
      employeeName: dims.emp?.fullNameAr || null,
      projectId: dims.projectId || null,
      projectName: dims.prj?.nameAr || null,
      costCenterId: dims.costCenterId || null,
      departmentId: dims.departmentId || null,
      branchId: dims.branchId || null,
      counterAccountId: counterAcc.id,
      counterAccountCode: counterAcc.code,
      counterAccountName: counterAcc.nameAr,
      beneficiaryName,
      reference: body?.reference !== undefined ? body.reference : v.reference,
      description: body?.description ?? v.description,
      status: 'DRAFT',
      journalEntryId: wasPosted ? null : v.journalEntryId,
      journalEntryNo: wasPosted ? null : v.journalEntryNo,
    });

    recordAudit({
      action: 'UPDATE_TREASURY_VOUCHER',
      schemaName: 'fin',
      tableName: 'treasury_vouchers',
      entityId: v.id,
      oldValues: oldSnap,
      newValues: { amountTx: updatedDraft.amountTx, treasuryAccountId: updatedDraft.treasuryAccountId, employeeId: updatedDraft.employeeId, description: updatedDraft.description },
      reason: body?.reason || `تعديل السند ${v.voucherNo}`,
    });

    return wasPosted ? postTreasuryVoucher(updatedDraft.id) : updatedDraft;
  });
}

export function deleteTreasuryVoucher(id: string, reason?: string): any {
  return runLocalAtomicTx(['treasury_vouchers', 'cheques'], () => {
    const list = getEntityList<any>('treasury_vouchers', []);
    const v = list.find((x) => x.id === id || x.voucherNo === id);
    if (!v) throw new Error('السند غير موجود');
    if (v.status !== 'DRAFT') {
      throw new Error('لا يمكن حذف سند مرحّل نهائياً؛ استخدم زر الإلغاء لعكس قيده وتحديث الأرصدة وحفظ سجل التدقيق');
    }
    if (v.chequeId) {
      deleteEntityItem('cheques', v.chequeId);
    }
    deleteEntityItem('treasury_vouchers', v.id);
    recordAudit({
      action: 'DELETE_TREASURY_VOUCHER',
      schemaName: 'fin',
      tableName: 'treasury_vouchers',
      entityId: v.id,
      oldValues: { voucherNo: v.voucherNo, amountTx: v.amountTx, status: v.status },
      reason: reason || `حذف مسودة السند ${v.voucherNo}`,
    });
    return { success: true, id: v.id };
  });
}

export function cancelTreasuryVoucher(id: string, reason?: string): any {
  return runLocalAtomicTx(['treasury_vouchers', 'cheques', 'invoices', 'purchase_invoices'], () => {
    const list = getEntityList<any>('treasury_vouchers', []);
    const v = list.find((x) => x.id === id || x.voucherNo === id);
    if (!v) throw new Error('السند غير موجود');
    if (v.status === 'CANCELLED') return v;
    const reasonText = reason || `إلغاء ${v.voucherType === 'RECEIPT' ? 'سند القبض' : 'سند الصرف'} ${v.voucherNo}`;

    if (v.chequeId) {
      const chqs = getEntityList<any>('cheques', []);
      const linkedChq = chqs.find((c) => c.id === v.chequeId);
      if (linkedChq && ['COLLECTED', 'PAID'].includes(linkedChq.status)) {
        throw new Error('لا يمكن إلغاء سند مرتبط بشيك محصل/مصروف؛ قم بتنفيذ ارتداد للشيك من حافظة الشيكات أولاً');
      }
      if (linkedChq) {
        saveEntityItem('cheques', { ...linkedChq, status: 'CANCELLED', bounceReason: reasonText });
      }
    }

    if (v.status === 'POSTED' && v.journalEntryId) {
      assertPeriodOpen(v.fiscalPeriodId || v.voucherDate, reasonText);
      const rev = createReversalJournalEntry(v.journalEntryId, reasonText, undefined, { allowSourceSync: true });
      v.reversalJournalEntryId = rev.id;
      if (v.paymentMethod !== 'CHEQUE') {
        if (v.invoiceId && v.voucherType === 'RECEIPT') applySalesInvoiceDelta(v.invoiceId, -Number(v.amountTx || 0), v.voucherNo, v.voucherDate);
        if (v.purchaseInvoiceId && v.voucherType === 'PAYMENT') applyPurchaseInvoiceSettlement(v.purchaseInvoiceId, false);
      }
    }
    v.status = 'CANCELLED';
    v.cancelReason = reasonText;
    const saved = saveEntityItem('treasury_vouchers', v);
    recordAudit({
      action: 'CANCEL_TREASURY_VOUCHER',
      schemaName: 'fin',
      tableName: 'treasury_vouchers',
      entityId: v.id,
      oldValues: { status: 'POSTED', amountTx: v.amountTx },
      newValues: { status: 'CANCELLED', reason: reasonText },
      reason: reasonText,
    });
    return saved;
  });
}

// ---------------------------------------------------------------------------
// Cheques Management (Incoming Receivable 10305 & Outgoing Payable 20105)
// ---------------------------------------------------------------------------
function createChequeInternal(body: any, postInitialJe: boolean): any {
  const direction: 'INCOMING' | 'OUTGOING' = body?.direction === 'OUTGOING' ? 'OUTGOING' : 'INCOMING';
  const issueDate = String(body?.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dueDate = String(body?.dueDate || issueDate).slice(0, 10);
  const amt = round2(Number(body?.amount || body?.amountTx || 0));
  if (amt <= 0) throw new Error('قيمة الشيك يجب أن تكون أكبر من الصفر');

  const dims = resolveEmployeeAndDims({
    employeeId: body?.employeeId,
    projectId: body?.projectId,
    costCenterId: body?.costCenterId,
    branchId: body?.branchId,
    clientId: body?.clientId,
  });
  const clients = getEntityList<any>('clients', []);
  const vendors = getEntityList<any>('vendors', []);
  const bankAccs = getEnrichedTreasuryAccounts();
  const bank = body?.bankAccountId ? bankAccs.find((b) => b.id === body.bankAccountId) : bankAccs.find((b) => b.kind === 'BANK');
  const cli = dims.clientId ? clients.find((c) => c.id === dims.clientId) : null;
  const vnd = body?.vendorId ? vendors.find((v) => v.id === body.vendorId) : null;

  const fallbackCounter = direction === 'INCOMING' ? '10301' : (body?.partyType === 'EMPLOYEE' ? '50401' : '20101');
  const counterAcc = resolveAccountByCodeOrId(body?.counterAccountCode || body?.counterAccountId, fallbackCounter);

  const cur = String(body?.currencyCode || bank?.currencyCode || getBaseCurrencyCode()).toUpperCase();
  const fxInfo = convertToBase(amt, cur, issueDate);
  const existing = getEntityList<any>('cheques', []);
  const chequeNo = body?.chequeNo || `CHQ-${issueDate.slice(0, 4)}-${String(existing.length + 1).padStart(4, '0')}`;
  const id = uid('chq');

  let initialJournalEntryId: string | null = null;
  let initialJournalEntryNo: string | null = null;
  if (postInitialJe) {
    assertPeriodOpen(issueDate, 'تسجيل شيك جديد');
    const chqGl = direction === 'INCOMING'
      ? ensurePostingAccount('10305', 'أوراق القبض وشيكات برسم التحصيل', 'ASSET', 'RECEIVABLE', 'acc-h-1102').code
      : ensurePostingAccount('20105', 'أوراق الدفع والشيكات الصادرة المؤجلة', 'LIABILITY', 'PAYABLE', 'acc-h-2101').code;
    const jeDims = {
      employeeId: dims.employeeId,
      projectId: dims.projectId,
      costCenterId: dims.costCenterId,
      branchId: dims.branchId,
      clientId: dims.clientId,
    };
    const lines = direction === 'INCOMING'
      ? [
          { accountCode: chqGl, debit: amt, credit: 0, currencyCode: cur, ...jeDims, description: `استلام شيك وارد رقم ${chequeNo}` },
          { accountCode: counterAcc.code, debit: 0, credit: amt, currencyCode: cur, ...jeDims, description: `حافظة شيكات واردة — شيك ${chequeNo}` },
        ]
      : [
          { accountCode: counterAcc.code, debit: amt, credit: 0, currencyCode: cur, ...jeDims, description: `إصدار شيك دفع رقم ${chequeNo}` },
          { accountCode: chqGl, debit: 0, credit: amt, currencyCode: cur, ...jeDims, description: `أوراق دفع — شيك صادر ${chequeNo}` },
        ];
    const je = createAutoPostedJournalEntry({
      entryDate: issueDate,
      fiscalPeriodId: resolvePeriodByIdOrDate(undefined, issueDate)?.id,
      journalType: direction === 'INCOMING' ? 'COLLECTION' : 'PAYMENT',
      sourceModule: 'TREASURY',
      sourceType: 'CHEQUE',
      sourceId: id,
      postingEvent: 'TREASURY_CHEQUE_RECEIVED',
      reference: chequeNo,
      description: `${direction === 'INCOMING' ? 'استلام شيك وارد' : 'إصدار شيك صادر'} رقم ${chequeNo}`,
      lines,
    });
    initialJournalEntryId = je.id;
    initialJournalEntryNo = je.entryNo;
  }

  const saved = saveEntityItem('cheques', {
    id,
    chequeNo,
    direction,
    chequeType: direction === 'INCOMING' ? 'RECEIVABLE' : 'PAYABLE',
    issueDate,
    dueDate,
    bankName: body?.bankName || bank?.bankName || 'بنك تجاري',
    drawerName: body?.drawerName || cli?.nameAr || vnd?.nameAr || dims.emp?.fullNameAr || 'جهة الشيك',
    bankAccountId: bank?.id || null,
    bankAccountName: bank?.name || null,
    currencyCode: cur,
    amountTx: amt.toFixed(2),
    amountBase: fxInfo.amountBase.toFixed(2),
    partyType: body?.partyType || (cli ? 'CLIENT' : vnd ? 'VENDOR' : dims.employeeId ? 'EMPLOYEE' : 'ACCOUNT'),
    clientId: dims.clientId || null,
    clientName: cli?.nameAr || null,
    vendorId: body?.vendorId || null,
    vendorName: vnd?.nameAr || null,
    employeeId: dims.employeeId || null,
    employeeCode: dims.emp?.code || null,
    employeeName: dims.emp?.fullNameAr || null,
    projectId: dims.projectId || null,
    projectName: dims.prj?.nameAr || null,
    costCenterId: dims.costCenterId || null,
    branchId: dims.branchId || null,
    counterAccountId: counterAcc.id,
    counterAccountCode: counterAcc.code,
    counterAccountName: counterAcc.nameAr,
    invoiceId: body?.invoiceId || null,
    purchaseInvoiceId: body?.purchaseInvoiceId || null,
    voucherId: body?.voucherId || null,
    status: direction === 'INCOMING' ? 'RECEIVED' : 'ISSUED',
    initialJournalEntryId,
    initialJournalEntryNo,
    clearingJournalEntryId: null,
    clearingJournalEntryNo: null,
    bounceJournalEntryId: null,
    bounceJournalEntryNo: null,
    notes: body?.notes || null,
    createdAt: new Date().toISOString(),
  });

  if (postInitialJe) {
    recordAudit({ action: 'CREATE_CHEQUE', schemaName: 'fin', tableName: 'cheques', entityId: saved.id, newValues: { chequeNo, direction, amount: amt, status: saved.status }, reason: `تسجيل شيك ${chequeNo}` });
  }
  return saved;
}

export function createCheque(body: any): any {
  return createChequeInternal(body, true);
}

export function listCheques(query: { direction?: string; status?: string; employeeId?: string; search?: string } = {}): any[] {
  const list = getEntityList<any>('cheques', []);
  const q = (query.search || '').trim().toLowerCase();
  return list
    .filter((c) => {
      if (query.direction && c.direction !== query.direction) return false;
      if (query.status && c.status !== query.status) return false;
      if (query.employeeId && c.employeeId !== query.employeeId) return false;
      if (q) {
        const hay = `${c.chequeNo} ${c.bankName} ${c.drawerName || ''} ${c.clientName || ''} ${c.vendorName || ''} ${c.employeeName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

export function depositCheque(id: string, body: any = {}): any {
  const list = getEntityList<any>('cheques', []);
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error('الشيك غير موجود');
  if (c.direction !== 'INCOMING' || c.status !== 'RECEIVED') throw new Error('يمكن إيداع الشيكات الواردة المستلمة فقط بالبنك');
  const banks = getEnrichedTreasuryAccounts('BANK');
  const bank = (body?.bankAccountId && banks.find((b) => b.id === body.bankAccountId)) || banks.find((b) => b.id === c.bankAccountId) || banks[0];
  if (!bank) throw new Error('يرجى تحديد حساب بنكي لإيداع الشيك');
  c.status = 'UNDER_COLLECTION';
  c.bankAccountId = bank.id;
  c.bankAccountName = bank.name;
  c.depositedAt = (body?.depositDate || new Date().toISOString()).slice(0, 10);
  return saveEntityItem('cheques', c);
}

export function collectCheque(id: string, body: any = {}): any {
  const list = getEntityList<any>('cheques', []);
  const c = list.find((x) => x.id === id);
  if (!c) throw new Error('الشيك غير موجود');
  if (['COLLECTED', 'PAID', 'BOUNCED', 'CANCELLED'].includes(c.status)) return c;

  const banks = getEnrichedTreasuryAccounts('BANK');
  const bank = (body?.bankAccountId && banks.find((b) => b.id === body.bankAccountId)) || banks.find((b) => b.id === c.bankAccountId) || banks[0];
  if (!bank) throw new Error('يرجى تحديد الحساب البنكي للتحصيل أو الصرف');

  const collectDate = (body?.collectDate || new Date().toISOString()).slice(0, 10);
  assertPeriodOpen(collectDate, `تحصيل/صرف شيك ${c.chequeNo}`);
  const amt = round2(Number(c.amountTx || 0));
  const chqGl = c.direction === 'INCOMING'
    ? ensurePostingAccount('10305', 'أوراق القبض وشيكات برسم التحصيل', 'ASSET', 'RECEIVABLE', 'acc-h-1102').code
    : ensurePostingAccount('20105', 'أوراق الدفع والشيكات الصادرة المؤجلة', 'LIABILITY', 'PAYABLE', 'acc-h-2101').code;
  const dims = { employeeId: c.employeeId || undefined, projectId: c.projectId || undefined, costCenterId: c.costCenterId || undefined, branchId: c.branchId || undefined, clientId: c.clientId || undefined };

  const lines = c.direction === 'INCOMING'
    ? [
        { accountCode: bank.glAccountCode || '10201', debit: amt, credit: 0, currencyCode: c.currencyCode, ...dims, description: `تحصيل شيك وارد رقم ${c.chequeNo} في ${bank.name}` },
        { accountCode: chqGl, debit: 0, credit: amt, currencyCode: c.currencyCode, ...dims, description: `إقفال ورقة قبض — شيك ${c.chequeNo}` },
      ]
    : [
        { accountCode: chqGl, debit: amt, credit: 0, currencyCode: c.currencyCode, ...dims, description: `سداد ورقة دفع — شيك ${c.chequeNo}` },
        { accountCode: bank.glAccountCode || '10201', debit: 0, credit: amt, currencyCode: c.currencyCode, ...dims, description: `صرف شيك صادر رقم ${c.chequeNo} من ${bank.name}` },
      ];

  const je = createAutoPostedJournalEntry({
    entryDate: collectDate,
    fiscalPeriodId: resolvePeriodByIdOrDate(undefined, collectDate)?.id,
    journalType: c.direction === 'INCOMING' ? 'COLLECTION' : 'PAYMENT',
    sourceModule: 'TREASURY',
    sourceType: 'CHEQUE_CLEAR',
    sourceId: c.id,
    postingEvent: 'TREASURY_CHEQUE_CLEARED',
    reference: c.chequeNo,
    description: `${c.direction === 'INCOMING' ? 'تحصيل شيك وارد بالبنك' : 'صرف شيك صادر من البنك'} (${c.chequeNo})`,
    lines,
  });

  c.status = c.direction === 'INCOMING' ? 'COLLECTED' : 'PAID';
  c.bankAccountId = bank.id;
  c.bankAccountName = bank.name;
  c.collectedAt = collectDate;
  c.clearingJournalEntryId = je.id;
  c.clearingJournalEntryNo = je.entryNo;
  const saved = saveEntityItem('cheques', c);

  if (c.direction === 'INCOMING' && c.invoiceId) {
    applySalesInvoiceDelta(c.invoiceId, amt, `شيك ${c.chequeNo}`, collectDate, je.id);
  }
  if (c.direction === 'OUTGOING' && c.purchaseInvoiceId) {
    applyPurchaseInvoiceSettlement(c.purchaseInvoiceId, true);
  }

  recordAudit({ action: 'COLLECT_CHEQUE', schemaName: 'fin', tableName: 'cheques', entityId: c.id, newValues: { status: c.status, journalEntryNo: je.entryNo }, reason: `إقفال شيك ${c.chequeNo}` });
  return saved;
}

export function updateCheque(id: string, body: any = {}): any {
  return runLocalAtomicTx(['cheques'], () => {
    const list = getEntityList<any>('cheques', []);
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error('الشيك غير موجود');
    if (['COLLECTED', 'PAID', 'BOUNCED', 'CANCELLED'].includes(c.status)) {
      throw new Error('لا يمكن تعديل شيك محصل أو مصروف أو مرتد أو ملغى');
    }
    const dims = resolveEmployeeAndDims({
      employeeId: body?.employeeId !== undefined ? body.employeeId : c.employeeId,
      projectId: body?.projectId !== undefined ? body.projectId : c.projectId,
      costCenterId: body?.costCenterId !== undefined ? body.costCenterId : c.costCenterId,
      branchId: body?.branchId !== undefined ? body.branchId : c.branchId,
      clientId: body?.clientId !== undefined ? body.clientId : c.clientId,
    });
    const bankAccs = getEnrichedTreasuryAccounts('BANK');
    const bank = body?.bankAccountId ? bankAccs.find((b) => b.id === body.bankAccountId) : null;
    const saved = saveEntityItem('cheques', {
      ...c,
      chequeNo: body?.chequeNo ?? c.chequeNo,
      dueDate: body?.dueDate ?? c.dueDate,
      bankName: body?.bankName ?? c.bankName,
      drawerName: body?.drawerName !== undefined ? body.drawerName : c.drawerName,
      bankAccountId: body?.bankAccountId !== undefined ? body.bankAccountId : c.bankAccountId,
      bankAccountName: bank?.name ?? c.bankAccountName,
      employeeId: dims.employeeId || null,
      employeeCode: dims.emp?.code || c.employeeCode,
      employeeName: dims.emp?.fullNameAr || c.employeeName,
      projectId: dims.projectId || null,
      projectName: dims.prj?.nameAr || c.projectName,
      costCenterId: dims.costCenterId || null,
      notes: body?.notes !== undefined ? body.notes : c.notes,
    });
    recordAudit({
      action: 'UPDATE_CHEQUE',
      schemaName: 'fin',
      tableName: 'cheques',
      entityId: c.id,
      oldValues: { chequeNo: c.chequeNo, dueDate: c.dueDate, bankName: c.bankName },
      newValues: { chequeNo: saved.chequeNo, dueDate: saved.dueDate, bankName: saved.bankName },
      reason: body?.reason || `تعديل بيانات الشيك ${saved.chequeNo}`,
    });
    return saved;
  });
}

export function deleteCheque(id: string, reason = 'إلغاء وحذف الشيك وعكس قيده'): any {
  return runLocalAtomicTx(['cheques'], () => {
    const list = getEntityList<any>('cheques', []);
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error('الشيك غير موجود');
    if (['COLLECTED', 'PAID'].includes(c.status)) {
      throw new Error('لا يمكن حذف شيك تم تحصيله/صرفه؛ استخدم إجراء ارتداد الشيك لعكس القيد والرصيد البنكي');
    }
    if (c.status !== 'CANCELLED' && c.status !== 'BOUNCED' && c.initialJournalEntryId) {
      assertPeriodOpen(c.issueDate, reason);
      const rev = createReversalJournalEntry(c.initialJournalEntryId, reason, undefined, { allowSourceSync: true });
      c.bounceJournalEntryId = rev.id;
      c.bounceJournalEntryNo = rev.entryNo;
    }
    c.status = 'CANCELLED';
    c.bounceReason = reason;
    const saved = saveEntityItem('cheques', c);
    recordAudit({
      action: 'CANCEL_CHEQUE',
      schemaName: 'fin',
      tableName: 'cheques',
      entityId: c.id,
      oldValues: { chequeNo: c.chequeNo, status: c.status },
      newValues: { status: 'CANCELLED', reason },
      reason,
    });
    return saved;
  });
}

export function bounceCheque(id: string, body: any = {}): any {
  return runLocalAtomicTx(['cheques', 'invoices', 'purchase_invoices'], () => {
    const list = getEntityList<any>('cheques', []);
    const c = list.find((x) => x.id === id);
    if (!c) throw new Error('الشيك غير موجود');
    if (c.status === 'BOUNCED' || c.status === 'CANCELLED') return c;

    const reason = body?.reason || 'ارتداد / رفض الشيك من البنك';
    const bounceDate = (body?.bounceDate || new Date().toISOString()).slice(0, 10);

    if (c.clearingJournalEntryId) {
      const rev1 = createReversalJournalEntry(c.clearingJournalEntryId, reason, bounceDate, { allowSourceSync: true });
      if (c.direction === 'INCOMING' && c.invoiceId) applySalesInvoiceDelta(c.invoiceId, -Number(c.amountTx || 0), c.chequeNo, bounceDate);
      if (c.direction === 'OUTGOING' && c.purchaseInvoiceId) applyPurchaseInvoiceSettlement(c.purchaseInvoiceId, false);
      c.bounceJournalEntryId = rev1.id;
      c.bounceJournalEntryNo = rev1.entryNo;
    }
    if (c.initialJournalEntryId) {
      const rev2 = createReversalJournalEntry(c.initialJournalEntryId, reason, bounceDate, { allowSourceSync: true });
      if (!c.bounceJournalEntryId) {
        c.bounceJournalEntryId = rev2.id;
        c.bounceJournalEntryNo = rev2.entryNo;
      }
    }
    c.status = 'BOUNCED';
    c.bounceReason = reason;
    c.bouncedAt = bounceDate;
    const saved = saveEntityItem('cheques', c);
    recordAudit({
      action: 'BOUNCE_CHEQUE',
      schemaName: 'fin',
      tableName: 'cheques',
      entityId: c.id,
      oldValues: { chequeNo: c.chequeNo, status: c.status },
      newValues: { status: 'BOUNCED', bounceJournalEntryId: c.bounceJournalEntryId },
      reason,
    });
    return saved;
  });
}

export function listBankReconciliations(bankAccountId?: string): any[] {
  const list = getEntityList<any>('bank_reconciliations', []);
  return bankAccountId ? list.filter((r) => r.bankAccountId === bankAccountId) : list;
}

export function reconcileBankAccount(body: any): any {
  const accounts = getEnrichedTreasuryAccounts();
  const ba = accounts.find((b) => b.id === body?.bankAccountId);
  if (!ba) throw new Error('الحساب البنكي غير موجود');
  const statementDate = (body?.statementDate || new Date().toISOString()).slice(0, 10);
  assertPeriodOpen(statementDate, 'التسوية البنكية');

  const bankCharges = round2(Number(body?.bankCharges || 0));
  const statementBalance = round2(Number(body?.statementBalance || 0));
  let adjJe: any = null;

  if (bankCharges > 0) {
    const dims = resolveEmployeeAndDims({ employeeId: body?.employeeId, costCenterId: body?.costCenterId, branchId: ba.branchId });
    adjJe = createAutoPostedJournalEntry({
      entryDate: statementDate,
      fiscalPeriodId: resolvePeriodByIdOrDate(undefined, statementDate)?.id,
      journalType: 'PAYMENT',
      sourceModule: 'TREASURY',
      sourceType: 'BANK_RECONCILIATION',
      postingEvent: 'BANK_FEE_RECONCILED',
      reference: `REC-${statementDate}`,
      description: `مصروفات وعمولات تسوية كشف الحساب البنكي (${ba.name})`,
      lines: [
        { accountCode: '50402', debit: bankCharges, credit: 0, currencyCode: ba.currencyCode, employeeId: dims.employeeId, costCenterId: dims.costCenterId, branchId: dims.branchId, description: `عمولة بنكية عند التسوية (${ba.name})` },
        { accountCode: ba.glAccountCode || '10201', debit: 0, credit: bankCharges, currencyCode: ba.currencyCode, branchId: dims.branchId, description: `خصم عمولة التسوية البنكية` },
      ],
    });
  }

  const nextAccounts = getEnrichedTreasuryAccounts();
  const updatedBa = nextAccounts.find((b) => b.id === ba.id) || ba;
  const bookBalance = round2(Number(updatedBa.balance || 0));
  const difference = round2(statementBalance - bookBalance);

  const rec = saveEntityItem('bank_reconciliations', {
    id: uid('brec'),
    bankAccountId: ba.id,
    bankAccountName: ba.name,
    statementDate,
    statementBalance: statementBalance.toFixed(2),
    bookBalance: bookBalance.toFixed(2),
    clearedBalance: bookBalance.toFixed(2),
    difference: difference.toFixed(2),
    bankCharges: bankCharges.toFixed(2),
    adjustmentJournalEntryId: adjJe?.id || null,
    adjustmentJournalEntryNo: adjJe?.entryNo || null,
    status: 'RECONCILED',
    notes: body?.notes || `تسوية كشف حساب ${ba.name}`,
    createdAt: new Date().toISOString(),
  });
  recordAudit({ action: 'BANK_RECONCILE', schemaName: 'acc', tableName: 'bank_reconciliations', entityId: rec.id, newValues: { bankAccountName: ba.name, statementBalance, bookBalance, difference }, reason: rec.notes });
  return rec;
}

export function getTreasuryOverview(): any {
  const accounts = getEnrichedTreasuryAccounts();
  const banks = accounts.filter((a) => a.kind === 'BANK');
  const cashboxes = accounts.filter((a) => a.kind === 'CASH');
  const vouchers = listTreasuryVouchers();
  const cheques = listCheques();

  const totalBankBalance = round2(banks.reduce((s, b) => s + Number(b.balance || 0), 0));
  const totalCashBalance = round2(cashboxes.reduce((s, c) => s + Number(c.balance || 0), 0));
  const postedReceipts = vouchers.filter((v) => v.voucherType === 'RECEIPT' && v.status === 'POSTED');
  const postedPayments = vouchers.filter((v) => v.voucherType === 'PAYMENT' && v.status === 'POSTED');
  const pendingIncoming = cheques.filter((c) => c.direction === 'INCOMING' && ['RECEIVED', 'UNDER_COLLECTION'].includes(c.status));
  const pendingOutgoing = cheques.filter((c) => c.direction === 'OUTGOING' && c.status === 'ISSUED');
  const bouncedCheques = cheques.filter((c) => c.status === 'BOUNCED');

  return {
    totalBankBalance,
    totalCashBalance,
    totalLiquidity: round2(totalBankBalance + totalCashBalance),
    bankCount: banks.length,
    cashboxCount: cashboxes.length,
    accounts,
    voucherStats: {
      receiptCount: postedReceipts.length,
      receiptTotal: round2(postedReceipts.reduce((s, v) => s + Number(v.amountBase || 0), 0)),
      paymentCount: postedPayments.length,
      paymentTotal: round2(postedPayments.reduce((s, v) => s + Number(v.amountBase || 0), 0)),
    },
    chequeStats: {
      pendingIncomingCount: pendingIncoming.length,
      pendingIncomingTotal: round2(pendingIncoming.reduce((s, c) => s + Number(c.amountBase || 0), 0)),
      pendingOutgoingCount: pendingOutgoing.length,
      pendingOutgoingTotal: round2(pendingOutgoing.reduce((s, c) => s + Number(c.amountBase || 0), 0)),
      bouncedCount: bouncedCheques.length,
    },
    recentVouchers: vouchers.slice(0, 12),
    recentCheques: cheques.slice(0, 10),
  };
}

/** Ensures every employee without a custom costCenterId gets an auto-synced Employee Cost Center. */
export function ensureSyncedEmployeeCostCenter(emp: any): string {
  const centers = getEntityList<any>('cost_centers', []);
  if (!centers.some((c) => c.id === 'cc-emp' || c.code === 'CC-EMP')) {
    saveEntityItem('cost_centers', {
      id: 'cc-emp',
      code: 'CC-EMP',
      nameAr: 'مراكز تكلفة الموظفين (الكوادر)',
      nameEn: 'Employee Cost Centers',
      ccType: 'DIRECT',
      isPosting: false,
      isActive: true,
      parentId: null,
    });
  }
  const ccId = `cc-emp-${emp.id}`;
  const existing = centers.find((c) => c.id === ccId || c.employeeId === emp.id);
  if (existing) {
    if (emp.fullNameAr && !existing.nameAr.includes(emp.fullNameAr)) {
      saveEntityItem('cost_centers', { ...existing, nameAr: `${emp.code || 'EMP'} — ${emp.fullNameAr}` });
    }
    return existing.id;
  }
  saveEntityItem('cost_centers', {
    id: ccId,
    parentId: 'cc-emp',
    code: `CC-${emp.code || emp.id.slice(0, 6)}`,
    nameAr: `${emp.code || ''} — ${emp.fullNameAr || 'موظف'}`.trim(),
    nameEn: emp.fullNameEn || emp.fullNameAr || 'Employee Center',
    ccType: 'DIRECT',
    employeeId: emp.id,
    isPosting: true,
    isActive: true,
  });
  return ccId;
}

/** Cascades deletion of employee-owned treasury vouchers, cheques, reconciliations & auto-synced cost center. */
export function cascadeDeleteEmployeeTreasury(delEmp: any, isOwnedByEmp: (row: any) => boolean, removedJeIds: Set<string>): void {
  const vouchers = getEntityList<any>('treasury_vouchers', []);
  const nextVouchers = vouchers.filter((v) => {
    if (!isOwnedByEmp(v)) return true;
    if (v.journalEntryId) removedJeIds.add(String(v.journalEntryId));
    if (v.reversalJournalEntryId) removedJeIds.add(String(v.reversalJournalEntryId));
    return false;
  });
  if (nextVouchers.length !== vouchers.length) replaceEntityList('treasury_vouchers', nextVouchers);

  const cheques = getEntityList<any>('cheques', []);
  const nextCheques = cheques.filter((c) => {
    if (!isOwnedByEmp(c)) return true;
    for (const k of ['initialJournalEntryId', 'clearingJournalEntryId', 'bounceJournalEntryId']) {
      if (c[k]) removedJeIds.add(String(c[k]));
    }
    return false;
  });
  if (nextCheques.length !== cheques.length) replaceEntityList('cheques', nextCheques);

  const centers = getEntityList<any>('cost_centers', []);
  const nextCenters = centers.filter((c) => c.id !== `cc-emp-${delEmp.id}` && c.employeeId !== delEmp.id);
  if (nextCenters.length !== centers.length) replaceEntityList('cost_centers', nextCenters);
}
