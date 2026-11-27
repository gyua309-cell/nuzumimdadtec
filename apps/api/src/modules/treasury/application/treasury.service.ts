import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { JournalService } from '../../accounting/application/journal.service';
import { JournalLineInput } from '../../accounting/domain/journal';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';

const optUuid = z.string().uuid().nullable().optional();
const optStr = z.string().trim().max(500).nullable().optional();

export const TreasuryAccountCreate = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(200),
  kind: z.enum(['BANK', 'CASH']).default('BANK'),
  bankName: optStr,
  bankBranch: optStr,
  accountNumber: z.string().trim().max(60).nullable().optional(),
  iban: z.string().trim().max(60).nullable().optional(),
  currencyCode: z.string().trim().length(3).toUpperCase().default('SAR'),
  glAccountId: optUuid,
  autoCreateGlAccount: z.boolean().optional().default(false),
  openingBalance: z.coerce.number().min(0).optional().default(0),
  treasurerEmployeeId: optUuid,
  branchId: optUuid,
  notes: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const VoucherCreate = z.object({
  voucherType: z.enum(['RECEIPT', 'PAYMENT']),
  voucherDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD']).default('CASH'),
  treasuryAccountId: z.string().uuid(),
  currencyCode: z.string().trim().length(3).toUpperCase().default('SAR'),
  exchangeRate: z.coerce.number().positive().optional(),
  amount: z.coerce.number().positive(),
  partyType: z.enum(['CLIENT', 'VENDOR', 'EMPLOYEE', 'ACCOUNT', 'PROJECT']).default('CLIENT'),
  partySubType: z.string().trim().max(60).nullable().optional(),
  clientId: optUuid,
  vendorId: optUuid,
  invoiceId: optUuid,
  purchaseInvoiceId: optUuid,
  employeeId: optUuid,
  projectId: optUuid,
  costCenterId: optUuid,
  departmentId: optUuid,
  branchId: optUuid,
  counterAccountId: optUuid,
  beneficiaryName: z.string().trim().max(250).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().min(2).max(1000),
  autoPost: z.boolean().optional().default(true),
  // Optional inline cheque fields when paymentMethod === 'CHEQUE'
  chequeNo: z.string().trim().max(60).nullable().optional(),
  chequeDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  chequeBankName: z.string().trim().max(200).nullable().optional(),
  drawerName: z.string().trim().max(200).nullable().optional(),
});

export const ChequeCreate = z.object({
  chequeNo: z.string().trim().min(1).max(60),
  direction: z.enum(['INCOMING', 'OUTGOING']),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bankName: z.string().trim().min(2).max(200),
  drawerName: z.string().trim().max(200).nullable().optional(),
  bankAccountId: optUuid,
  currencyCode: z.string().trim().length(3).toUpperCase().default('SAR'),
  exchangeRate: z.coerce.number().positive().optional(),
  amount: z.coerce.number().positive(),
  partyType: z.enum(['CLIENT', 'VENDOR', 'EMPLOYEE', 'ACCOUNT', 'PROJECT']).default('CLIENT'),
  clientId: optUuid,
  vendorId: optUuid,
  employeeId: optUuid,
  invoiceId: optUuid,
  purchaseInvoiceId: optUuid,
  projectId: optUuid,
  costCenterId: optUuid,
  branchId: optUuid,
  counterAccountId: optUuid,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const BankReconcileInput = z.object({
  bankAccountId: z.string().uuid(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statementBalance: z.coerce.number(),
  clearedLineIds: z.array(z.union([z.number(), z.string()])).default([]),
  bankCharges: z.coerce.number().min(0).default(0),
  employeeId: optUuid,
  costCenterId: optUuid,
  notes: z.string().trim().max(1000).nullable().optional(),
});

@Injectable()
export class TreasuryService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
    private readonly fx: ExchangeRateService,
  ) {}

  private async ensureCoaAccount(companyId: string, preferredCodes: string[], fallback?: {
    code: string;
    nameAr: string;
    nameEn: string;
    accountClass: string;
    subtype: string;
    normalBalance: 'DEBIT' | 'CREDIT';
    parentCode: string;
  }): Promise<string> {
    for (const code of preferredCodes) {
      const r = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = $2 AND is_posting = true AND is_active = true`,
        [companyId, code],
      );
      if (r) return r.id;
    }
    if (fallback) {
      const parent = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code IN ($2, '11', '21', '1', '2') ORDER BY length(code) DESC LIMIT 1`,
        [companyId, fallback.parentCode],
      );
      if (parent) {
        const created = await this.db.one<{ id: string }>(
          `INSERT INTO acc.accounts (company_id, code, name_ar, name_en, account_class, subtype, normal_balance, parent_id, is_posting, is_active, statement_section, cash_flow_category)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,true,$9,$10)
           ON CONFLICT (company_id, code) DO UPDATE SET is_active = true
           RETURNING id`,
          [
            companyId, fallback.code, fallback.nameAr, fallback.nameEn, fallback.accountClass,
            fallback.subtype, fallback.normalBalance, parent.id,
            fallback.normalBalance === 'DEBIT' ? 'CURRENT_ASSETS' : 'CURRENT_LIABILITIES',
            'OPERATING',
          ],
        );
        if (created) return created.id;
      }
    }
    throw new DomainError('GL_ACCOUNT_MISSING', `لم يتم العثور على الحساب المحاسبي المطلوب (${preferredCodes.join('/')})`);
  }

  private async resolveDimensions(
    companyId: string,
    input: { employeeId?: string | null; projectId?: string | null; costCenterId?: string | null; departmentId?: string | null; branchId?: string | null },
  ) {
    let costCenterId = input.costCenterId || null;
    let departmentId = input.departmentId || null;
    let branchId = input.branchId || null;

    if (input.projectId && (!costCenterId || !branchId)) {
      const prj = await this.db.one<{ cost_center_id: string | null; branch_id: string | null }>(
        `SELECT cost_center_id, branch_id FROM prj.projects WHERE company_id = $1 AND id = $2`,
        [companyId, input.projectId],
      );
      if (prj) {
        if (!costCenterId) costCenterId = prj.cost_center_id;
        if (!branchId) branchId = prj.branch_id;
      }
    }
    if (input.employeeId && (!costCenterId || !departmentId || !branchId)) {
      const ja = await this.db.one<{ cost_center_id: string | null; department_id: string | null; branch_id: string | null }>(
        `SELECT cost_center_id, department_id, branch_id
           FROM hr.employee_job_assignments
          WHERE company_id = $1 AND employee_id = $2 AND effective_to IS NULL
          ORDER BY effective_from DESC LIMIT 1`,
        [companyId, input.employeeId],
      );
      if (ja) {
        if (!costCenterId) costCenterId = ja.cost_center_id;
        if (!departmentId) departmentId = ja.department_id;
        if (!branchId) branchId = ja.branch_id;
      }
    }
    return {
      employeeId: input.employeeId || null,
      projectId: input.projectId || null,
      costCenterId,
      departmentId,
      branchId,
    };
  }

  private async nextSeqNo(companyId: string, docType: string, prefixBase: string): Promise<string> {
    const year = new Date().getFullYear().toString();
    const prefix = `${prefixBase}-${year}-`;
    await this.db.query(
      `INSERT INTO sys.number_sequences(company_id, doc_type, scope_key, prefix, padding)
       VALUES ($1,$2,$3,$4,4)
       ON CONFLICT (company_id, doc_type, scope_key) DO NOTHING`,
      [companyId, docType, year, prefix],
    );
    const seq = await this.db.one<{ id: string; prefix: string; padding: number; next_value: string }>(
      `SELECT id, prefix, padding, next_value FROM sys.number_sequences WHERE company_id = $1 AND doc_type = $2 AND scope_key = $3 FOR UPDATE`,
      [companyId, docType, year],
    );
    await this.db.query(`UPDATE sys.number_sequences SET next_value = next_value + 1, updated_at = now() WHERE id = $1`, [seq!.id]);
    return `${seq!.prefix}${String(seq!.next_value).padStart(seq!.padding || 4, '0')}`;
  }

  async listAccounts(companyId: string, kind?: 'BANK' | 'CASH') {
    const conds = [`ba.company_id = $1`];
    const params: unknown[] = [companyId];
    if (kind) {
      params.push(kind);
      conds.push(`ba.kind = $${params.length}`);
    }
    return this.db.query(
      `SELECT ba.id, ba.code, ba.name, ba.kind, ba.bank_name AS "bankName", ba.bank_branch AS "bankBranch",
              ba.account_number AS "accountNumber", ba.iban, ba.currency_code AS "currencyCode",
              ba.gl_account_id AS "glAccountId", a.code AS "glAccountCode", a.name_ar AS "glAccountNameAr",
              ba.branch_id AS "branchId", b.name_ar AS "branchName",
              ba.treasurer_employee_id AS "treasurerEmployeeId", emp.full_name_ar AS "treasurerName",
              ba.is_active AS "isActive", ba.notes,
              COALESCE((
                SELECT SUM(jl.debit_base - jl.credit_base)
                  FROM acc.journal_lines jl
                  JOIN acc.journal_entries je ON je.id = jl.entry_id
                 WHERE jl.company_id = ba.company_id AND jl.account_id = ba.gl_account_id AND je.status = 'POSTED'
              ), 0)::float8 AS "balance",
              COALESCE((
                SELECT SUM(jl.debit_base)
                  FROM acc.journal_lines jl
                  JOIN acc.journal_entries je ON je.id = jl.entry_id
                 WHERE jl.company_id = ba.company_id AND jl.account_id = ba.gl_account_id AND je.status = 'POSTED'
              ), 0)::float8 AS "totalInflows",
              COALESCE((
                SELECT SUM(jl.credit_base)
                  FROM acc.journal_lines jl
                  JOIN acc.journal_entries je ON je.id = jl.entry_id
                 WHERE jl.company_id = ba.company_id AND jl.account_id = ba.gl_account_id AND je.status = 'POSTED'
              ), 0)::float8 AS "totalOutflows"
         FROM acc.bank_accounts ba
         LEFT JOIN acc.accounts a ON a.id = ba.gl_account_id
         LEFT JOIN core.branches b ON b.id = ba.branch_id
         LEFT JOIN hr.employees emp ON emp.id = ba.treasurer_employee_id
        WHERE ${conds.join(' AND ')}
        ORDER BY ba.kind ASC, ba.code ASC`,
      params,
    );
  }

  async createAccount(companyId: string, input: z.infer<typeof TreasuryAccountCreate>) {
    return this.db.tx(async () => {
      let glAccountId = input.glAccountId || null;
      if (!glAccountId || input.autoCreateGlAccount) {
        const parent = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND code IN ('1101','11','1') ORDER BY length(code) DESC LIMIT 1`,
          [companyId],
        );
        if (!parent) throw new DomainError('PARENT_CASH_ACCOUNT_NOT_FOUND');
        const prefix = input.kind === 'CASH' ? '101' : '102';
        const existingCodes = await this.db.query<{ code: string }>(
          `SELECT code FROM acc.accounts WHERE company_id = $1 AND code LIKE $2`,
          [companyId, `${prefix}%`],
        );
        const set = new Set(existingCodes.map((r) => r.code));
        let seq = 1;
        while (set.has(`${prefix}${String(seq).padStart(2, '0')}`)) seq++;
        const nextCode = `${prefix}${String(seq).padStart(2, '0')}`;
        const createdGl = await this.db.one<{ id: string }>(
          `INSERT INTO acc.accounts (company_id, code, name_ar, account_class, subtype, normal_balance, parent_id, is_posting, is_active, statement_section, cash_flow_category)
           VALUES ($1,$2,$3,'ASSET',$4,'DEBIT',$5,true,true,'CURRENT_ASSETS','CASH') RETURNING id`,
          [companyId, nextCode, input.name, input.kind, parent.id],
        );
        glAccountId = createdGl!.id;
      }
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO acc.bank_accounts (
           company_id, code, name, kind, bank_name, bank_branch, account_number, iban,
           currency_code, gl_account_id, branch_id, treasurer_employee_id, opening_balance, notes, is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          companyId, input.code, input.name, input.kind, input.bankName ?? null, input.bankBranch ?? null,
          input.accountNumber ?? null, input.iban ?? null, input.currencyCode, glAccountId,
          input.branchId ?? null, input.treasurerEmployeeId ?? null, input.openingBalance ?? 0,
          input.notes ?? null, input.isActive,
        ],
      );
      return (await this.listAccounts(companyId)).find((x: any) => x.id === row!.id);
    });
  }

  async overview(companyId: string) {
    const accounts = await this.listAccounts(companyId);
    const banks = accounts.filter((a: any) => a.kind === 'BANK');
    const cashboxes = accounts.filter((a: any) => a.kind === 'CASH');
    const voucherStats = await this.db.one<any>(
      `SELECT
         COUNT(*) FILTER (WHERE voucher_type = 'RECEIPT' AND status = 'POSTED')::int AS "receiptCount",
         COALESCE(SUM(amount_base) FILTER (WHERE voucher_type = 'RECEIPT' AND status = 'POSTED'), 0)::float8 AS "receiptTotal",
         COUNT(*) FILTER (WHERE voucher_type = 'PAYMENT' AND status = 'POSTED')::int AS "paymentCount",
         COALESCE(SUM(amount_base) FILTER (WHERE voucher_type = 'PAYMENT' AND status = 'POSTED'), 0)::float8 AS "paymentTotal"
       FROM fin.treasury_vouchers WHERE company_id = $1`,
      [companyId],
    );
    const chequeStats = await this.db.one<any>(
      `SELECT
         COUNT(*) FILTER (WHERE direction = 'INCOMING' AND status IN ('RECEIVED','UNDER_COLLECTION'))::int AS "pendingIncomingCount",
         COALESCE(SUM(amount_base) FILTER (WHERE direction = 'INCOMING' AND status IN ('RECEIVED','UNDER_COLLECTION')), 0)::float8 AS "pendingIncomingTotal",
         COUNT(*) FILTER (WHERE direction = 'OUTGOING' AND status = 'ISSUED')::int AS "pendingOutgoingCount",
         COALESCE(SUM(amount_base) FILTER (WHERE direction = 'OUTGOING' AND status = 'ISSUED'), 0)::float8 AS "pendingOutgoingTotal",
         COUNT(*) FILTER (WHERE status = 'BOUNCED')::int AS "bouncedCount"
       FROM fin.cheques WHERE company_id = $1`,
      [companyId],
    );
    const recentVouchers = await this.listVouchers(companyId, { limit: 10 });
    return {
      totalBankBalance: banks.reduce((s: number, b: any) => s + Number(b.balance || 0), 0),
      totalCashBalance: cashboxes.reduce((s: number, c: any) => s + Number(c.balance || 0), 0),
      bankCount: banks.length,
      cashboxCount: cashboxes.length,
      accounts,
      voucherStats: voucherStats ?? { receiptCount: 0, receiptTotal: 0, paymentCount: 0, paymentTotal: 0 },
      chequeStats: chequeStats ?? { pendingIncomingCount: 0, pendingIncomingTotal: 0, pendingOutgoingCount: 0, pendingOutgoingTotal: 0, bouncedCount: 0 },
      recentVouchers,
    };
  }

  async listVouchers(companyId: string, q: { voucherType?: string; employeeId?: string; limit?: number } = {}) {
    const conds = [`v.company_id = $1`];
    const params: unknown[] = [companyId];
    if (q.voucherType) {
      params.push(q.voucherType);
      conds.push(`v.voucher_type = $${params.length}`);
    }
    if (q.employeeId) {
      params.push(q.employeeId);
      conds.push(`v.employee_id = $${params.length}`);
    }
    const lim = Math.min(Number(q.limit || 200), 500);
    return this.db.query(
      `SELECT v.id, v.voucher_no AS "voucherNo", v.voucher_type AS "voucherType", v.voucher_date::text AS "voucherDate",
              v.payment_method AS "paymentMethod", v.treasury_account_id AS "treasuryAccountId", ba.name AS "treasuryAccountName",
              ba.kind AS "treasuryAccountKind", v.currency_code AS "currencyCode", v.amount_tx::float8 AS "amountTx",
              v.amount_base::float8 AS "amountBase", v.party_type AS "partyType", v.party_sub_type AS "partySubType",
              v.client_id AS "clientId", c.name_ar AS "clientName", v.vendor_id AS "vendorId", vn.name_ar AS "vendorName",
              v.invoice_id AS "invoiceId", v.purchase_invoice_id AS "purchaseInvoiceId",
              v.employee_id AS "employeeId", emp.code AS "employeeCode", emp.full_name_ar AS "employeeName",
              v.project_id AS "projectId", p.name_ar AS "projectName", v.cost_center_id AS "costCenterId",
              cc.name_ar AS "costCenterName", v.counter_account_id AS "counterAccountId", a.code AS "counterAccountCode",
              a.name_ar AS "counterAccountName", v.beneficiary_name AS "beneficiaryName", v.reference, v.description,
              v.cheque_id AS "chequeId", v.status, v.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo",
              v.created_at AS "createdAt"
         FROM fin.treasury_vouchers v
         JOIN acc.bank_accounts ba ON ba.id = v.treasury_account_id
         LEFT JOIN prj.clients c ON c.id = v.client_id
         LEFT JOIN pur.vendors vn ON vn.id = v.vendor_id
         LEFT JOIN hr.employees emp ON emp.id = v.employee_id
         LEFT JOIN prj.projects p ON p.id = v.project_id
         LEFT JOIN core.cost_centers cc ON cc.id = v.cost_center_id
         LEFT JOIN acc.accounts a ON a.id = v.counter_account_id
         LEFT JOIN acc.journal_entries je ON je.id = v.journal_entry_id
        WHERE ${conds.join(' AND ')}
        ORDER BY v.voucher_date DESC, v.created_at DESC
        LIMIT ${lim}`,
      params,
    );
  }

  private async resolveCounterAccountId(companyId: string, input: z.infer<typeof VoucherCreate>): Promise<string> {
    if (input.counterAccountId) return input.counterAccountId;
    if (input.partyType === 'CLIENT' || input.invoiceId) {
      return this.ensureCoaAccount(companyId, ['10301']);
    }
    if (input.partyType === 'VENDOR' || input.purchaseInvoiceId) {
      return this.ensureCoaAccount(companyId, ['20101']);
    }
    if (input.partyType === 'EMPLOYEE') {
      if (input.partySubType === 'LOAN' || input.partySubType === 'LOAN_REPAYMENT') return this.ensureCoaAccount(companyId, ['10401']);
      if (input.partySubType === 'CUSTODY' || input.partySubType === 'CUSTODY_REFUND') return this.ensureCoaAccount(companyId, ['1320', '1310', '10401']);
      if (input.partySubType === 'PAYROLL') return this.ensureCoaAccount(companyId, ['20401']);
      return this.ensureCoaAccount(companyId, [input.voucherType === 'PAYMENT' ? '50401' : '40101']);
    }
    return this.ensureCoaAccount(companyId, [input.voucherType === 'PAYMENT' ? '50401' : '40101']);
  }

  async createVoucher(companyId: string, input: z.infer<typeof VoucherCreate>) {
    return this.db.tx(async () => {
      const bankAcc = await this.db.one<{ id: string; gl_account_id: string; currency_code: string; branch_id: string | null }>(
        `SELECT id, gl_account_id, currency_code, branch_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2`,
        [companyId, input.treasuryAccountId],
      );
      if (!bankAcc) throw new NotFoundError('BankAccount', input.treasuryAccountId);

      const period = await this.db.one<{ id: string; status: string }>(
        `SELECT id, status FROM core.fiscal_periods WHERE company_id = $1 AND NOT is_adjustment_period AND $2::date BETWEEN start_date AND end_date`,
        [companyId, input.voucherDate],
      );
      if (!period) throw new DomainError('PERIOD_NOT_FOUND_FOR_DATE');

      const cur = (input.currencyCode || bankAcc.currency_code || 'SAR').toUpperCase();
      const base = await this.fx.baseCurrency(companyId);
      const exRate = cur === base.code ? 1 : (input.exchangeRate ?? Number((await this.fx.getRate(companyId, cur, base.code, input.voucherDate)).rate));
      const amtTx = D(input.amount);
      const amtBase = amtTx.times(exRate);

      const dims = await this.resolveDimensions(companyId, input);
      const counterAccId = await this.resolveCounterAccountId(companyId, input);
      const voucherNo = await this.nextSeqNo(companyId, input.voucherType === 'RECEIPT' ? 'RCV' : 'PMV', input.voucherType === 'RECEIPT' ? 'RV' : 'PV');

      let chequeId: string | null = null;
      if (input.paymentMethod === 'CHEQUE') {
        const chq = await this.insertChequeRecord(companyId, {
          chequeNo: input.chequeNo || `CHQ-${voucherNo}`,
          direction: input.voucherType === 'RECEIPT' ? 'INCOMING' : 'OUTGOING',
          issueDate: input.voucherDate,
          dueDate: input.chequeDueDate || input.voucherDate,
          bankName: input.chequeBankName || 'شيك مصرفي',
          drawerName: input.drawerName || input.beneficiaryName || undefined,
          bankAccountId: input.treasuryAccountId,
          currencyCode: cur,
          exchangeRate: exRate,
          amount: Number(amtTx.toFixed(2)),
          partyType: input.partyType,
          clientId: input.clientId ?? null,
          vendorId: input.vendorId ?? null,
          employeeId: dims.employeeId,
          invoiceId: input.invoiceId ?? null,
          purchaseInvoiceId: input.purchaseInvoiceId ?? null,
          projectId: dims.projectId,
          costCenterId: dims.costCenterId,
          branchId: dims.branchId,
          counterAccountId: counterAccId,
          notes: input.description,
        }, false);
        chequeId = chq.id;
      }

      const row = await this.db.one<{ id: string }>(
        `INSERT INTO fin.treasury_vouchers (
           company_id, voucher_no, voucher_type, voucher_date, fiscal_period_id, payment_method,
           treasury_account_id, currency_code, exchange_rate, amount_tx, amount_base,
           party_type, party_sub_type, client_id, vendor_id, invoice_id, purchase_invoice_id,
           employee_id, project_id, cost_center_id, department_id, branch_id,
           counter_account_id, beneficiary_name, reference, description, cheque_id, status, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'DRAFT',sys.current_user_id())
         RETURNING id`,
        [
          companyId, voucherNo, input.voucherType, input.voucherDate, period.id, input.paymentMethod,
          input.treasuryAccountId, cur, String(exRate), amtTx.toFixed(4), amtBase.toFixed(4),
          input.partyType, input.partySubType ?? null, input.clientId ?? null, input.vendorId ?? null,
          input.invoiceId ?? null, input.purchaseInvoiceId ?? null, dims.employeeId, dims.projectId,
          dims.costCenterId, dims.departmentId, dims.branchId || bankAcc.branch_id,
          counterAccId, input.beneficiaryName ?? null, input.reference ?? null, input.description, chequeId,
        ],
      );

      if (chequeId) {
        await this.db.query(`UPDATE fin.cheques SET voucher_id = $2 WHERE id = $1`, [chequeId, row!.id]);
      }
      if (input.autoPost !== false) {
        return this.postVoucher(companyId, row!.id);
      }
      return (await this.listVouchers(companyId)).find((x: any) => x.id === row!.id);
    });
  }

  async postVoucher(companyId: string, id: string) {
    return this.db.tx(async () => {
      const v = await this.db.one<any>(`SELECT * FROM fin.treasury_vouchers WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
      if (!v) throw new NotFoundError('TreasuryVoucher', id);
      if (v.status !== 'DRAFT') throw new DomainError('VOUCHER_NOT_DRAFT', 'السند مرحّل أو ملغي مسبقاً');

      const bankAcc = await this.db.one<{ gl_account_id: string }>(`SELECT gl_account_id FROM acc.bank_accounts WHERE id = $1`, [v.treasury_account_id]);
      let debitAccountId: string;
      let creditAccountId: string;

      if (v.voucher_type === 'RECEIPT') {
        debitAccountId = v.payment_method === 'CHEQUE'
          ? await this.ensureCoaAccount(companyId, ['10305'], { code: '10305', nameAr: 'أوراق القبض وشيكات برسم التحصيل', nameEn: 'Notes Receivable', accountClass: 'ASSET', subtype: 'RECEIVABLE', normalBalance: 'DEBIT', parentCode: '1102' })
          : bankAcc!.gl_account_id;
        creditAccountId = v.counter_account_id;
      } else {
        debitAccountId = v.counter_account_id;
        creditAccountId = v.payment_method === 'CHEQUE'
          ? await this.ensureCoaAccount(companyId, ['20105'], { code: '20105', nameAr: 'أوراق الدفع والشيكات الصادرة المؤجلة', nameEn: 'Notes Payable', accountClass: 'LIABILITY', subtype: 'PAYABLE', normalBalance: 'CREDIT', parentCode: '2101' })
          : bankAcc!.gl_account_id;
      }

      const dimFields = {
        employeeId: v.employee_id ?? undefined,
        projectId: v.project_id ?? undefined,
        costCenterId: v.cost_center_id ?? undefined,
        departmentId: v.department_id ?? undefined,
        branchId: v.branch_id ?? undefined,
        clientId: v.client_id ?? undefined,
        supplierId: v.vendor_id ?? undefined,
      };
      const lines: JournalLineInput[] = [
        { accountId: debitAccountId, debit: Number(v.amount_tx).toFixed(2), currencyCode: v.currency_code, ...dimFields, description: v.description },
        { accountId: creditAccountId, credit: Number(v.amount_tx).toFixed(2), currencyCode: v.currency_code, ...dimFields, description: v.description },
      ];

      const jeId = await this.journal.createAndPost(companyId, {
        entryDate: String(v.voucher_date).slice(0, 10),
        fiscalPeriodId: v.fiscal_period_id,
        journalType: v.voucher_type === 'RECEIPT' ? 'COLLECTION' : 'PAYMENT',
        sourceModule: 'treasury',
        sourceType: 'TREASURY_VOUCHER',
        sourceId: v.id,
        postingEvent: v.voucher_type === 'RECEIPT' ? 'TREASURY.RECEIPT_POSTED' : 'TREASURY.PAYMENT_POSTED',
        reference: v.voucher_no,
        currencyCode: v.currency_code,
        description: `${v.voucher_type === 'RECEIPT' ? 'سند قبض' : 'سند صرف'} رقم ${v.voucher_no} — ${v.description}`,
        lines,
      });

      await this.db.query(`UPDATE fin.treasury_vouchers SET status = 'POSTED', journal_entry_id = $2 WHERE id = $1`, [id, jeId]);
      if (v.cheque_id) {
        await this.db.query(`UPDATE fin.cheques SET initial_journal_entry_id = $2 WHERE id = $1`, [v.cheque_id, jeId]);
      }

      // Sync Sales Invoice / Purchase Invoice payment status (non-cheque settles immediately; cheque settles on collect)
      if (v.payment_method !== 'CHEQUE') {
        if (v.invoice_id && v.voucher_type === 'RECEIPT') {
          await this.applySalesInvoiceSettlement(companyId, v.invoice_id, Number(v.amount_tx));
        }
        if (v.purchase_invoice_id && v.voucher_type === 'PAYMENT') {
          await this.applyPurchaseInvoiceSettlement(companyId, v.purchase_invoice_id);
        }
      }
      return (await this.listVouchers(companyId)).find((x: any) => x.id === id);
    });
  }

  async cancelVoucher(companyId: string, id: string, reason: string) {
    return this.db.tx(async () => {
      const v = await this.db.one<any>(`SELECT * FROM fin.treasury_vouchers WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
      if (!v) throw new NotFoundError('TreasuryVoucher', id);
      if (v.status === 'CANCELLED') return v;
      let revId: string | null = null;
      if (v.status === 'POSTED' && v.journal_entry_id) {
        revId = await this.journal.reverse(companyId, v.journal_entry_id, reason || `إلغاء سند ${v.voucher_no}`);
        if (v.payment_method !== 'CHEQUE' && v.invoice_id && v.voucher_type === 'RECEIPT') {
          await this.applySalesInvoiceSettlement(companyId, v.invoice_id, -Number(v.amount_tx));
        }
      }
      await this.db.query(`UPDATE fin.treasury_vouchers SET status = 'CANCELLED', reversal_journal_entry_id = $2, cancel_reason = $3 WHERE id = $1`, [id, revId, reason]);
      return { success: true, id, status: 'CANCELLED', reversalJournalEntryId: revId };
    });
  }

  private async applySalesInvoiceSettlement(companyId: string, invoiceId: string, deltaAmount: number) {
    const inv = await this.db.one<{ id: string; total_amount: string; paid_amount: string }>(
      `SELECT id, total_amount::text, paid_amount::text FROM sal.invoices WHERE company_id = $1 AND id = $2 FOR UPDATE`,
      [companyId, invoiceId],
    );
    if (!inv) return;
    const total = Number(inv.total_amount || 0);
    const nextPaid = Math.max(0, Math.min(total, Number(inv.paid_amount || 0) + deltaAmount));
    const payStatus = nextPaid >= total - 0.01 ? 'PAID' : nextPaid > 0.01 ? 'PARTIALLY_PAID' : 'UNPAID';
    await this.db.query(`UPDATE sal.invoices SET paid_amount = $2, payment_status = $3 WHERE id = $1`, [invoiceId, nextPaid.toFixed(4), payStatus]);
  }

  private async applyPurchaseInvoiceSettlement(companyId: string, purchaseInvoiceId: string) {
    await this.db.query(`UPDATE pur.purchase_invoices SET payment_status = 'PAID' WHERE company_id = $1 AND id = $2`, [companyId, purchaseInvoiceId]);
  }

  async listCheques(companyId: string, q: { direction?: string; status?: string; employeeId?: string } = {}) {
    const conds = [`c.company_id = $1`];
    const params: unknown[] = [companyId];
    if (q.direction) { params.push(q.direction); conds.push(`c.direction = $${params.length}`); }
    if (q.status) { params.push(q.status); conds.push(`c.status = $${params.length}`); }
    if (q.employeeId) { params.push(q.employeeId); conds.push(`c.employee_id = $${params.length}`); }
    return this.db.query(
      `SELECT c.id, c.cheque_no AS "chequeNo", c.direction, c.cheque_type AS "chequeType",
              c.issue_date::text AS "issueDate", c.due_date::text AS "dueDate", c.bank_name AS "bankName",
              c.drawer_name AS "drawerName", c.bank_account_id AS "bankAccountId", ba.name AS "bankAccountName",
              c.currency_code AS "currencyCode", c.amount_tx::float8 AS "amountTx", c.amount_base::float8 AS "amountBase",
              c.party_type AS "partyType", c.client_id AS "clientId", cl.name_ar AS "clientName",
              c.vendor_id AS "vendorId", vn.name_ar AS "vendorName",
              c.employee_id AS "employeeId", emp.code AS "employeeCode", emp.full_name_ar AS "employeeName",
              c.project_id AS "projectId", prj.name_ar AS "projectName", c.cost_center_id AS "costCenterId",
              cc.name_ar AS "costCenterName", c.status, c.bounce_reason AS "bounceReason", c.notes,
              c.initial_journal_entry_id AS "initialJournalEntryId", je1.entry_no AS "initialJournalEntryNo",
              c.clearing_journal_entry_id AS "clearingJournalEntryId", je2.entry_no AS "clearingJournalEntryNo",
              c.bounce_journal_entry_id AS "bounceJournalEntryId", je3.entry_no AS "bounceJournalEntryNo",
              c.deposited_at::text AS "depositedAt", c.collected_at::text AS "collectedAt", c.bounced_at::text AS "bouncedAt"
         FROM fin.cheques c
         LEFT JOIN acc.bank_accounts ba ON ba.id = c.bank_account_id
         LEFT JOIN prj.clients cl ON cl.id = c.client_id
         LEFT JOIN pur.vendors vn ON vn.id = c.vendor_id
         LEFT JOIN hr.employees emp ON emp.id = c.employee_id
         LEFT JOIN prj.projects prj ON prj.id = c.project_id
         LEFT JOIN core.cost_centers cc ON cc.id = c.cost_center_id
         LEFT JOIN acc.journal_entries je1 ON je1.id = c.initial_journal_entry_id
         LEFT JOIN acc.journal_entries je2 ON je2.id = c.clearing_journal_entry_id
         LEFT JOIN acc.journal_entries je3 ON je3.id = c.bounce_journal_entry_id
        WHERE ${conds.join(' AND ')}
        ORDER BY c.due_date ASC, c.created_at DESC`,
      params,
    );
  }

  private async insertChequeRecord(companyId: string, input: z.infer<typeof ChequeCreate>, postInitialJe: boolean) {
    const base = await this.fx.baseCurrency(companyId);
    const cur = (input.currencyCode || base.code).toUpperCase();
    const rate = cur === base.code ? 1 : (input.exchangeRate ?? Number((await this.fx.getRate(companyId, cur, base.code, input.issueDate)).rate));
    const amtTx = D(input.amount);
    const amtBase = amtTx.times(rate);
    const dims = await this.resolveDimensions(companyId, input);
    const counterAccId = input.counterAccountId || await this.ensureCoaAccount(
      companyId,
      input.direction === 'INCOMING' ? ['10301'] : [input.partyType === 'EMPLOYEE' ? '50401' : '20101'],
    );
    const initialStatus = input.direction === 'INCOMING' ? 'RECEIVED' : 'ISSUED';
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO fin.cheques (
         company_id, cheque_no, direction, cheque_type, issue_date, due_date, bank_name, drawer_name,
         bank_account_id, currency_code, exchange_rate, amount_tx, amount_base, party_type,
         client_id, vendor_id, employee_id, invoice_id, purchase_invoice_id, project_id, cost_center_id, branch_id,
         counter_account_id, status, notes, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,sys.current_user_id())
       RETURNING id`,
      [
        companyId, input.chequeNo, input.direction, input.direction === 'INCOMING' ? 'RECEIVABLE' : 'PAYABLE',
        input.issueDate, input.dueDate, input.bankName, input.drawerName ?? null, input.bankAccountId ?? null,
        cur, String(rate), amtTx.toFixed(4), amtBase.toFixed(4), input.partyType,
        input.clientId ?? null, input.vendorId ?? null, dims.employeeId, input.invoiceId ?? null,
        input.purchaseInvoiceId ?? null, dims.projectId, dims.costCenterId, dims.branchId,
        counterAccId, initialStatus, input.notes ?? null,
      ],
    );

    if (postInitialJe) {
      const chqAccId = input.direction === 'INCOMING'
        ? await this.ensureCoaAccount(companyId, ['10305'], { code: '10305', nameAr: 'أوراق القبض وشيكات برسم التحصيل', nameEn: 'Notes Receivable', accountClass: 'ASSET', subtype: 'RECEIVABLE', normalBalance: 'DEBIT', parentCode: '1102' })
        : await this.ensureCoaAccount(companyId, ['20105'], { code: '20105', nameAr: 'أوراق الدفع والشيكات الصادرة المؤجلة', nameEn: 'Notes Payable', accountClass: 'LIABILITY', subtype: 'PAYABLE', normalBalance: 'CREDIT', parentCode: '2101' });
      const dimFields = {
        employeeId: dims.employeeId ?? undefined,
        projectId: dims.projectId ?? undefined,
        costCenterId: dims.costCenterId ?? undefined,
        branchId: dims.branchId ?? undefined,
        clientId: input.clientId ?? undefined,
        supplierId: input.vendorId ?? undefined,
      };
      const lines: JournalLineInput[] = input.direction === 'INCOMING'
        ? [
            { accountId: chqAccId, debit: amtTx.toFixed(2), currencyCode: cur, ...dimFields, description: `استلام شيك وارد رقم ${input.chequeNo}` },
            { accountId: counterAccId, credit: amtTx.toFixed(2), currencyCode: cur, ...dimFields, description: `شيك وارد رقم ${input.chequeNo}` },
          ]
        : [
            { accountId: counterAccId, debit: amtTx.toFixed(2), currencyCode: cur, ...dimFields, description: `إصدار شيك رقم ${input.chequeNo}` },
            { accountId: chqAccId, credit: amtTx.toFixed(2), currencyCode: cur, ...dimFields, description: `أوراق دفع — شيك صادر رقم ${input.chequeNo}` },
          ];
      const jeId = await this.journal.createAndPost(companyId, {
        entryDate: input.issueDate,
        journalType: input.direction === 'INCOMING' ? 'COLLECTION' : 'PAYMENT',
        sourceModule: 'treasury',
        sourceType: 'CHEQUE',
        sourceId: row!.id,
        postingEvent: 'TREASURY.CHEQUE_RECEIVED',
        reference: input.chequeNo,
        currencyCode: cur,
        description: `${input.direction === 'INCOMING' ? 'حافظة شيكات واردة' : 'إصدار شيك دفع'} رقم ${input.chequeNo}`,
        lines,
      });
      await this.db.query(`UPDATE fin.cheques SET initial_journal_entry_id = $2 WHERE id = $1`, [row!.id, jeId]);
    }
    return { id: row!.id };
  }

  async createCheque(companyId: string, input: z.infer<typeof ChequeCreate>) {
    return this.db.tx(async () => {
      const res = await this.insertChequeRecord(companyId, input, true);
      return (await this.listCheques(companyId)).find((x: any) => x.id === res.id);
    });
  }

  async depositCheque(companyId: string, id: string, body: { bankAccountId: string; depositDate?: string }) {
    return this.db.tx(async () => {
      const chq = await this.db.one<any>(`SELECT * FROM fin.cheques WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
      if (!chq) throw new NotFoundError('Cheque', id);
      if (chq.direction !== 'INCOMING' || chq.status !== 'RECEIVED') {
        throw new DomainError('INVALID_CHEQUE_STATE', 'يمكن إيداع الشيكات الواردة المستلمة فقط برسم التحصيل');
      }
      const depDate = body.depositDate || new Date().toISOString().slice(0, 10);
      await this.db.query(
        `UPDATE fin.cheques SET status = 'UNDER_COLLECTION', bank_account_id = $2, deposited_at = $3 WHERE id = $1`,
        [id, body.bankAccountId, depDate],
      );
      return (await this.listCheques(companyId)).find((x: any) => x.id === id);
    });
  }

  async collectCheque(companyId: string, id: string, body: { bankAccountId?: string; collectDate?: string }) {
    return this.db.tx(async () => {
      const chq = await this.db.one<any>(`SELECT * FROM fin.cheques WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
      if (!chq) throw new NotFoundError('Cheque', id);
      const bankId = body.bankAccountId || chq.bank_account_id;
      if (!bankId) throw new DomainError('BANK_REQUIRED', 'يرجى تحديد الحساب البنكي للتحصيل/الصرف');
      const bankAcc = await this.db.one<{ gl_account_id: string }>(`SELECT gl_account_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2`, [companyId, bankId]);
      if (!bankAcc) throw new NotFoundError('BankAccount', bankId);
      const collectDate = body.collectDate || new Date().toISOString().slice(0, 10);

      const chqAccId = chq.direction === 'INCOMING'
        ? await this.ensureCoaAccount(companyId, ['10305'])
        : await this.ensureCoaAccount(companyId, ['20105']);
      const dimFields = {
        employeeId: chq.employee_id ?? undefined,
        projectId: chq.project_id ?? undefined,
        costCenterId: chq.cost_center_id ?? undefined,
        branchId: chq.branch_id ?? undefined,
        clientId: chq.client_id ?? undefined,
        supplierId: chq.vendor_id ?? undefined,
      };
      const lines: JournalLineInput[] = chq.direction === 'INCOMING'
        ? [
            { accountId: bankAcc.gl_account_id, debit: Number(chq.amount_tx).toFixed(2), currencyCode: chq.currency_code, ...dimFields, description: `تحصيل شيك وارد رقم ${chq.cheque_no} بالبنك` },
            { accountId: chqAccId, credit: Number(chq.amount_tx).toFixed(2), currencyCode: chq.currency_code, ...dimFields, description: `إقفال ورقة قبض شيك ${chq.cheque_no}` },
          ]
        : [
            { accountId: chqAccId, debit: Number(chq.amount_tx).toFixed(2), currencyCode: chq.currency_code, ...dimFields, description: `سداد ورقة دفع شيك ${chq.cheque_no}` },
            { accountId: bankAcc.gl_account_id, credit: Number(chq.amount_tx).toFixed(2), currencyCode: chq.currency_code, ...dimFields, description: `صرف شيك صادر رقم ${chq.cheque_no} من البنك` },
          ];
      const jeId = await this.journal.createAndPost(companyId, {
        entryDate: collectDate,
        journalType: chq.direction === 'INCOMING' ? 'COLLECTION' : 'PAYMENT',
        sourceModule: 'treasury',
        sourceType: 'CHEQUE_CLEAR',
        sourceId: chq.id,
        postingEvent: 'TREASURY.CHEQUE_CLEARED',
        reference: chq.cheque_no,
        currencyCode: chq.currency_code,
        description: `${chq.direction === 'INCOMING' ? 'تحصيل شيك وارد' : 'صرف شيك صادر'} رقم ${chq.cheque_no}`,
        lines,
      });
      const nextStatus = chq.direction === 'INCOMING' ? 'COLLECTED' : 'PAID';
      await this.db.query(
        `UPDATE fin.cheques SET status = $2, bank_account_id = $3, collected_at = $4, clearing_journal_entry_id = $5 WHERE id = $1`,
        [id, nextStatus, bankId, collectDate, jeId],
      );
      if (chq.direction === 'INCOMING' && chq.invoice_id) await this.applySalesInvoiceSettlement(companyId, chq.invoice_id, Number(chq.amount_tx));
      if (chq.direction === 'OUTGOING' && chq.purchase_invoice_id) await this.applyPurchaseInvoiceSettlement(companyId, chq.purchase_invoice_id);
      return (await this.listCheques(companyId)).find((x: any) => x.id === id);
    });
  }

  async bounceCheque(companyId: string, id: string, body: { reason?: string; bounceDate?: string }) {
    return this.db.tx(async () => {
      const chq = await this.db.one<any>(`SELECT * FROM fin.cheques WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
      if (!chq) throw new NotFoundError('Cheque', id);
      if (chq.status === 'BOUNCED' || chq.status === 'CANCELLED') return chq;
      const reason = body.reason || 'ارتداد / رفض الشيك من البنك';
      let bounceJeId: string | null = null;
      const targetJe = chq.clearing_journal_entry_id || chq.initial_journal_entry_id;
      if (targetJe) {
        bounceJeId = await this.journal.reverse(companyId, targetJe, reason, body.bounceDate);
      }
      await this.db.query(
        `UPDATE fin.cheques SET status = 'BOUNCED', bounce_reason = $2, bounced_at = $3, bounce_journal_entry_id = $4 WHERE id = $1`,
        [id, reason, body.bounceDate || new Date().toISOString().slice(0, 10), bounceJeId],
      );
      return (await this.listCheques(companyId)).find((x: any) => x.id === id);
    });
  }

  async reconcileBank(companyId: string, input: z.infer<typeof BankReconcileInput>) {
    return this.db.tx(async () => {
      const ba = await this.db.one<{ id: string; name: string; gl_account_id: string; currency_code: string }>(
        `SELECT id, name, gl_account_id, currency_code FROM acc.bank_accounts WHERE company_id = $1 AND id = $2`,
        [companyId, input.bankAccountId],
      );
      if (!ba) throw new NotFoundError('BankAccount', input.bankAccountId);
      const book = await this.db.one<{ bal: string }>(
        `SELECT COALESCE(SUM(jl.debit_base - jl.credit_base), 0)::text AS bal
           FROM acc.journal_lines jl JOIN acc.journal_entries je ON je.id = jl.entry_id
          WHERE jl.company_id = $1 AND jl.account_id = $2 AND je.status = 'POSTED' AND je.entry_date <= $3::date`,
        [companyId, ba.gl_account_id, input.statementDate],
      );
      const bookBal = Number(book?.bal || 0);
      let adjJeId: string | null = null;
      if (input.bankCharges > 0) {
        const feeAcc = await this.ensureCoaAccount(companyId, ['50402', '50401']);
        const dims = await this.resolveDimensions(companyId, input);
        adjJeId = await this.journal.createAndPost(companyId, {
          entryDate: input.statementDate,
          journalType: 'PAYMENT',
          sourceModule: 'treasury',
          sourceType: 'BANK_RECONCILIATION',
          reference: `REC-${input.statementDate}`,
          description: `تسوية مصروفات وعمولات بنكية (${ba.name})`,
          lines: [
            { accountId: feeAcc, debit: input.bankCharges.toFixed(2), currencyCode: ba.currency_code, employeeId: dims.employeeId ?? undefined, costCenterId: dims.costCenterId ?? undefined, description: `عمولة تسوية كشف الحساب` },
            { accountId: ba.gl_account_id, credit: input.bankCharges.toFixed(2), currencyCode: ba.currency_code, description: `خصم مصروفات التسوية البنكية` },
          ],
        });
      }
      const adjustedBook = bookBal - Number(input.bankCharges || 0);
      const diff = Number((input.statementBalance - adjustedBook).toFixed(2));
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO acc.bank_reconciliations (
           company_id, bank_account_id, statement_date, statement_balance, book_balance, cleared_balance,
           difference, cleared_line_ids, bank_charges, adjustment_journal_entry_id, notes, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,sys.current_user_id()) RETURNING id`,
        [
          companyId, input.bankAccountId, input.statementDate, input.statementBalance.toFixed(4),
          bookBal.toFixed(4), adjustedBook.toFixed(4), diff.toFixed(4), JSON.stringify(input.clearedLineIds),
          input.bankCharges.toFixed(4), adjJeId, input.notes ?? null,
        ],
      );
      return { id: row!.id, bankAccountId: input.bankAccountId, statementDate: input.statementDate, bookBalance: adjustedBook, statementBalance: input.statementBalance, difference: diff, adjustmentJournalEntryId: adjJeId };
    });
  }

  async listReconciliations(companyId: string, bankAccountId?: string) {
    const conds = [`r.company_id = $1`];
    const params: unknown[] = [companyId];
    if (bankAccountId) { params.push(bankAccountId); conds.push(`r.bank_account_id = $${params.length}`); }
    return this.db.query(
      `SELECT r.id, r.bank_account_id AS "bankAccountId", ba.name AS "bankAccountName", r.statement_date::text AS "statementDate",
              r.statement_balance::float8 AS "statementBalance", r.book_balance::float8 AS "bookBalance",
              r.cleared_balance::float8 AS "clearedBalance", r.difference::float8 AS "difference",
              r.bank_charges::float8 AS "bankCharges", r.adjustment_journal_entry_id AS "adjustmentJournalEntryId",
              r.status, r.notes, r.created_at AS "createdAt"
         FROM acc.bank_reconciliations r
         JOIN acc.bank_accounts ba ON ba.id = r.bank_account_id
        WHERE ${conds.join(' AND ')}
        ORDER BY r.statement_date DESC, r.created_at DESC`,
      params,
    );
  }
}
