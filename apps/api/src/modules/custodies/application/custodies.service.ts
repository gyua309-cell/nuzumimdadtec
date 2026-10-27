import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, toDbAmount } from '../../../shared/money';
import { ListQuery, offset, orderBy, Page } from '../../../shared/http/common';
import { JournalService } from '../../accounting/application/journal.service';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';
import { JournalLineInput } from '../../accounting/domain/journal';

// ------------------------------------------------------------------ Schemas

export const CustodyCreate = z.object({
  employeeId: z.string().uuid(),
  titleAr: z.string().trim().min(3).max(255),
  titleEn: z.string().trim().max(255).optional().nullable(),
  purpose: z.string().trim().max(1000).optional().nullable(),
  sourceCurrency: z.string().trim().length(3).default('SAR'),
  requestedAmount: z.number().positive(),
  targetCurrency: z.string().trim().length(3).default('EGP'),
  disbursedFromAccountId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodyDisburse = z.object({
  disbursedFromAccountId: z.string().uuid(),
  disbursedAmount: z.number().positive().optional(),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodyConversion = z.object({
  targetCurrency: z.string().trim().length(3).default('EGP'),
  conversionRate: z.number().positive(),
  convertedAmountSource: z.number().positive(),
  convertedAmountTarget: z.number().positive(),
  conversionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conversionReceiptNo: z.string().trim().max(100).optional().nullable(),
  conversionNotes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodyTransferCreate = z.object({
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceBankAccountId: z.string().uuid().optional().nullable(),
  sourceBranchId: z.string().uuid().optional().nullable(),
  targetBranchId: z.string().uuid().optional().nullable(),
  amountSar: z.number().positive(),
  exchangeRate: z.number().positive(),
  amountEgp: z.number().positive().optional(),
  bankFeesSar: z.number().min(0).default(0),
  bankReference: z.string().trim().max(100).optional().nullable(),
  receiptUrl: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodySettlementCreate = z.object({
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  returnedAmountEgp: z.number().min(0).default(0),
  returnToBankAccountId: z.string().uuid().optional().nullable(),
  settlementRate: z.number().positive().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodySettlementLineCreate = z.object({
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptNo: z.string().trim().max(100).optional().nullable(),
  expenseAccountId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  vendorName: z.string().trim().max(255).optional().nullable(),
  description: z.string().trim().min(2).max(500),
  currencyCode: z.string().trim().length(3).default('EGP'),
  subtotal: z.number().min(0),
  vatRate: z.number().min(0).max(100).default(0),
  vatAmount: z.number().min(0).default(0),
  totalAmount: z.number().positive(),
  receiptFileUrl: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodyPostSettlement = z.object({
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const CustodyClose = z.object({
  closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  refundToAccountId: z.string().uuid().optional().nullable(),
  refundAmount: z.number().min(0).optional().nullable(),
  closureNotes: z.string().trim().max(1000).optional().nullable(),
});

// ------------------------------------------------------------------ Service

@Injectable()
export class CustodiesService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
    private readonly fx: ExchangeRateService,
  ) {}

  // ------------------------------------------------------------------ Next Sequence Number
  private async nextCustodyNo(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const row = await this.db.one<{ count: string }>(
      `SELECT count(*)::text AS count FROM fin.custodies WHERE company_id = $1 AND custody_no LIKE $2`,
      [companyId, `CUST-${year}-%`],
    );
    const seq = (parseInt(row?.count ?? '0', 10) + 1).toString().padStart(4, '0');
    return `CUST-${year}-${seq}`;
  }

  // ------------------------------------------------------------------ List
  async list(companyId: string, q: ListQuery & { status?: string; employeeId?: string; currency?: string }): Promise<Page<any>> {
    const where: string[] = ['c.company_id = $1'];
    const params: any[] = [companyId];

    if (q.status) {
      params.push(q.status);
      where.push(`c.status = $${params.length}`);
    }
    if (q.employeeId) {
      params.push(q.employeeId);
      where.push(`c.employee_id = $${params.length}`);
    }
    if (q.currency) {
      params.push(q.currency);
      where.push(`(c.source_currency = $${params.length} OR c.target_currency = $${params.length})`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(c.custody_no ILIKE $${params.length} OR c.title_ar ILIKE $${params.length} OR e.full_name_ar ILIKE $${params.length})`);
    }

    const whereClause = where.join(' AND ');
    const countRow = await this.db.one<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM fin.custodies c
         JOIN hr.employees e ON e.id = c.employee_id
        WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countRow?.count ?? '0', 10);

    const sortCols: Record<string, string> = {
      custodyNo: 'c.custody_no',
      createdAt: 'c.created_at',
      status: 'c.status',
      disbursedAmount: 'c.disbursed_amount',
    };
    const order = orderBy(q.sort, sortCols, 'c.created_at DESC');
    const off = offset(q);

    params.push(q.pageSize, off);
    const data = await this.db.query(
      `SELECT c.*,
              e.code AS "employeeCode",
              e.full_name_ar AS "employeeNameAr",
              COALESCE(e.full_name_en, e.full_name_ar) AS "employeeNameEn",
              bank.name_ar AS "disbursedFromAccountNameAr"
         FROM fin.custodies c
         JOIN hr.employees e ON e.id = c.employee_id
         LEFT JOIN acc.accounts bank ON bank.id = c.disbursed_from_account_id
        WHERE ${whereClause}
        ORDER BY ${order}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      data,
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
      },
    };
  }

  // ------------------------------------------------------------------ Get One
  async get(companyId: string, id: string) {
    const custody = await this.db.one<any>(
      `SELECT c.*,
              e.code AS "employeeCode",
              e.full_name_ar AS "employeeNameAr",
              COALESCE(e.full_name_en, e.full_name_ar) AS "employeeNameEn",
              bank.name_ar AS "disbursedFromAccountNameAr",
              je_disburse.entry_no AS "disbursementEntryNo",
              je_settle.entry_no AS "closureEntryNo"
         FROM fin.custodies c
         JOIN hr.employees e ON e.id = c.employee_id
         LEFT JOIN acc.accounts bank ON bank.id = c.disbursed_from_account_id
         LEFT JOIN acc.journal_entries je_disburse ON je_disburse.id = c.disbursement_journal_entry_id
         LEFT JOIN acc.journal_entries je_settle ON je_settle.id = c.closure_journal_entry_id
        WHERE c.company_id = $1 AND c.id = $2`,
      [companyId, id],
    );

    if (!custody) throw new NotFoundError('CUSTODY_NOT_FOUND', 'لم يتم العثور على سجل العهدة المطلوب');

    const lines = await this.db.query(
      `SELECT l.*,
              acc.code AS "expenseAccountCode",
              acc.name_ar AS "expenseAccountNameAr",
              prj.code AS "projectCode",
              prj.name_ar AS "projectNameAr",
              cc.name_ar AS "costCenterNameAr",
              je.entry_no AS "journalEntryNo"
         FROM fin.custody_settlement_lines l
         JOIN acc.accounts acc ON acc.id = l.expense_account_id
         LEFT JOIN prj.projects prj ON prj.id = l.project_id
         LEFT JOIN core.cost_centers cc ON cc.id = l.cost_center_id
         LEFT JOIN acc.journal_entries je ON je.id = l.journal_entry_id
        WHERE l.company_id = $1 AND l.custody_id = $2
        ORDER BY l.line_no ASC, l.expense_date ASC`,
      [companyId, id],
    );

    const transfers = await this.db.query(
      `SELECT t.*,
              sb.name_ar AS "sourceBranchNameAr",
              tb.name_ar AS "targetBranchNameAr",
              bank.name_ar AS "sourceBankNameAr",
              je_sa.entry_no AS "saJournalEntryNo",
              je_eg.entry_no AS "egJournalEntryNo"
         FROM fin.custody_transfers t
         LEFT JOIN core.branches sb ON sb.id = t.source_branch_id
         LEFT JOIN core.branches tb ON tb.id = t.target_branch_id
         LEFT JOIN acc.accounts bank ON bank.id = t.source_bank_account_id
         LEFT JOIN acc.journal_entries je_sa ON je_sa.id = t.journal_entry_sa_id
         LEFT JOIN acc.journal_entries je_eg ON je_eg.id = t.journal_entry_eg_id
        WHERE t.company_id = $1 AND t.custody_id = $2
        ORDER BY t.transfer_date DESC, t.created_at DESC`,
      [companyId, id],
    );

    const settlements = await this.db.query(
      `SELECT s.*,
              je.entry_no AS "journalEntryNo",
              u.full_name AS "approvedByName"
         FROM fin.custody_settlements s
         LEFT JOIN acc.journal_entries je ON je.id = s.journal_entry_id
         LEFT JOIN iam.users u ON u.id = s.approved_by
        WHERE s.company_id = $1 AND s.custody_id = $2
        ORDER BY s.settlement_date DESC, s.created_at DESC`,
      [companyId, id],
    );

    const pool = D(custody.converted_amount_target > 0 ? custody.converted_amount_target : custody.disbursed_amount);
    const remaining = D(custody.remaining_balance_target ?? 0);
    const balanceRatio = pool.isZero() ? 1 : remaining.div(pool).toNumber();
    const isLowBalance = balanceRatio <= 0.20 && ['CONVERTED', 'PARTIALLY_SETTLED'].includes(custody.status);
    const lowBalanceMessage = isLowBalance
      ? `تنبيه أمان السيولة: الرصيد المتبقي (${remaining.toFixed(2)} ${custody.target_currency}) يمثل أقل من 20% (${(balanceRatio * 100).toFixed(1)}%) من إجمالي العهدة`
      : null;

    return {
      ...custody,
      lines,
      transfers,
      settlements,
      isLowBalance,
      balanceRatio,
      lowBalanceMessage,
    };
  }

  // ------------------------------------------------------------------ Create Draft Custody
  async create(companyId: string, input: z.infer<typeof CustodyCreate>) {
    const parsed = CustodyCreate.parse(input);
    const custodyNo = await this.nextCustodyNo(companyId);

    // Fetch base currency exchange rate if source is not base
    const today = new Date().toISOString().slice(0, 10);
    let fxRate = D(1);
    try {
      const resolved = await this.fx.toBase(companyId, parsed.sourceCurrency, today);
      fxRate = resolved.rate;
    } catch {
      fxRate = D(1);
    }

    const disbursedBase = D(parsed.requestedAmount).times(fxRate);

    const row = await this.db.one<{ id: string }>(
      `INSERT INTO fin.custodies (
         company_id, custody_no, employee_id, title_ar, title_en, purpose,
         source_currency, requested_amount, disbursed_amount, disbursed_amount_base,
         target_currency, conversion_rate, converted_amount_source, converted_amount_target,
         remaining_balance_target, status, disbursed_from_account_id, notes,
         created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,$9,1,0,0,0,'DRAFT',$10,$11,sys.current_user_id(),sys.current_user_id())
       RETURNING id`,
      [
        companyId, custodyNo, parsed.employeeId, parsed.titleAr, parsed.titleEn ?? null,
        parsed.purpose ?? null, parsed.sourceCurrency, toDbAmount(parsed.requestedAmount),
        parsed.targetCurrency, parsed.disbursedFromAccountId ?? null, parsed.notes ?? null,
      ],
    );

    return this.get(companyId, row!.id);
  }

  // ------------------------------------------------------------------ Disburse Custody
  async disburse(companyId: string, id: string, input: z.infer<typeof CustodyDisburse>) {
    const parsed = CustodyDisburse.parse(input);
    return this.db.tx(async () => {
      const custody = await this.get(companyId, id);
      if (custody.status !== 'DRAFT') {
        throw new DomainError('INVALID_STATUS', 'لا يمكن صرف عهدة إلا إذا كانت في حالة مسودة');
      }

      const amount = parsed.disbursedAmount ? D(parsed.disbursedAmount) : D(custody.requested_amount);
      const disburseDate = parsed.disbursementDate ?? new Date().toISOString().slice(0, 10);

      // Resolve Custody Account: 1310 for Egypt Branch (EGP), 1320 for Saudi HQ (SAR)
      const custodyAccountCode = custody.target_currency === 'EGP' ? '1310' : '1320';
      let custodyAcc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = $2`,
        [companyId, custodyAccountCode],
      );
      if (!custodyAcc) {
        // Fallback to general custody account 1300
        custodyAcc = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1300'`,
          [companyId],
        );
      }
      if (!custodyAcc) throw new DomainError('CUSTODY_ACCOUNT_MISSING', 'لم يتم العثور على حساب العهد النقدية في شجرة الحسابات');

      // Resolve Base FX Rate
      let fxRate = D(1);
      try {
        const resolved = await this.fx.toBase(companyId, custody.source_currency, disburseDate);
        fxRate = resolved.rate;
      } catch {
        fxRate = D(1);
      }
      const disbursedAmountBase = amount.times(fxRate);

      // Create and Post General Ledger Entry
      // Dr. Custody Account 1310 / Cr. Disbursing Bank Account
      const jeLines: JournalLineInput[] = [
        {
          accountId: custodyAcc.id,
          debit: toDbAmount(amount),
          credit: '0',
          currencyCode: custody.source_currency,
          exchangeRate: toDbAmount(fxRate),
          employeeId: custody.employee_id,
          description: `صرف عهدة نقدية للموظف ${custody.employeeNameAr} - ${custody.custody_no}`,
        },
        {
          accountId: parsed.disbursedFromAccountId,
          debit: '0',
          credit: toDbAmount(amount),
          currencyCode: custody.source_currency,
          exchangeRate: toDbAmount(fxRate),
          employeeId: custody.employee_id,
          description: `صرف عهدة نقدية من البنك - ${custody.custody_no}`,
        },
      ];

      const entryId = await this.journal.createAndPost(companyId, {
        entryDate: disburseDate,
        journalType: 'PAYMENT',
        description: `صرف عهدة نقدية للموظف: ${custody.employeeNameAr} (${custody.custody_no})`,
        reference: parsed.reference ?? custody.custody_no,
        currencyCode: custody.source_currency,
        sourceModule: 'fin',
        sourceType: 'CUSTODY_DISBURSEMENT',
        sourceId: id,
        lines: jeLines,
      });

      // Update Custody status
      await this.db.query(
        `UPDATE fin.custodies
            SET status = 'DISBURSED',
                disbursed_amount = $2,
                disbursed_amount_base = $3,
                disbursed_at = $4,
                disbursed_from_account_id = $5,
                disbursement_journal_entry_id = $6,
                remaining_balance_target = $2,
                updated_at = now(),
                updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $7`,
        [
          companyId, toDbAmount(amount), toDbAmount(disbursedAmountBase),
          disburseDate, parsed.disbursedFromAccountId, entryId, id,
        ],
      );

      return this.get(companyId, id);
    });
  }

  // ------------------------------------------------------------------ Record FX Conversion (SAR to EGP)
  async recordConversion(companyId: string, id: string, input: z.infer<typeof CustodyConversion>) {
    const parsed = CustodyConversion.parse(input);
    const custody = await this.get(companyId, id);

    if (!['DISBURSED', 'CONVERTED', 'PARTIALLY_SETTLED'].includes(custody.status)) {
      throw new DomainError('INVALID_STATUS', 'لا يمكن تسجيل تحويل عملة إلا للعهدة المنصرفة');
    }

    const convDate = parsed.conversionDate ?? new Date().toISOString().slice(0, 10);
    const targetAmt = D(parsed.convertedAmountTarget);
    const settledAmt = D(custody.total_settled_amount_target ?? 0);
    const remainingBalance = targetAmt.minus(settledAmt);

    await this.db.query(
      `UPDATE fin.custodies
          SET target_currency = $2,
              conversion_rate = $3,
              converted_amount_source = $4,
              converted_amount_target = $5,
              remaining_balance_target = $6,
              converted_at = $7,
              conversion_receipt_no = $8,
              conversion_notes = $9,
              status = CASE WHEN status = 'PARTIALLY_SETTLED' THEN 'PARTIALLY_SETTLED' ELSE 'CONVERTED' END,
              updated_at = now(),
              updated_by = sys.current_user_id()
        WHERE company_id = $1 AND id = $10`,
      [
        companyId, parsed.targetCurrency, toDbAmount(parsed.conversionRate),
        toDbAmount(parsed.convertedAmountSource), toDbAmount(parsed.convertedAmountTarget),
        toDbAmount(remainingBalance), convDate, parsed.conversionReceiptNo ?? null,
        parsed.conversionNotes ?? null, id,
      ],
    );

    return this.get(companyId, id);
  }

  // ------------------------------------------------------------------ Create Custody Transfer (SAR -> EGP)
  async createTransfer(companyId: string, custodyId: string, input: z.infer<typeof CustodyTransferCreate>) {
    const parsed = CustodyTransferCreate.parse(input);
    return this.db.tx(async () => {
      const custody = await this.get(companyId, custodyId);
      if (['CLOSED', 'CANCELLED'].includes(custody.status)) {
        throw new DomainError('INVALID_STATUS', 'لا يمكن تحويل مبالغ إضافية لعهدة مغلقة أو ملغاة');
      }

      // 1. Generate transfer sequence number TRF-YYYY-XXXX
      const year = new Date().getFullYear();
      const countRow = await this.db.one<{ count: string }>(
        `SELECT count(*)::text AS count FROM fin.custody_transfers WHERE company_id = $1 AND transfer_number LIKE $2`,
        [companyId, `TRF-${year}-%`],
      );
      const seq = (parseInt(countRow?.count ?? '0', 10) + 1).toString().padStart(4, '0');
      const transferNo = `TRF-${year}-${seq}`;

      const transferDate = parsed.transferDate ?? new Date().toISOString().slice(0, 10);
      const amountSar = D(parsed.amountSar);
      const exchangeRate = D(parsed.exchangeRate);
      const amountEgp = parsed.amountEgp ? D(parsed.amountEgp) : amountSar.times(exchangeRate);
      const bankFeesSar = D(parsed.bankFeesSar ?? 0);

      // Resolve Branches
      let saBranch = await this.db.one<{ id: string; interbranch_account_id: string }>(
        `SELECT id, interbranch_account_id FROM core.branches WHERE company_id = $1 AND (code = 'HQ-RUH' OR country_code = 'SA') LIMIT 1`,
        [companyId],
      );

      let egBranch = await this.db.one<{ id: string; interbranch_account_id: string }>(
        `SELECT id, interbranch_account_id FROM core.branches WHERE company_id = $1 AND (code = 'BR-CAI' OR country_code = 'EG') LIMIT 1`,
        [companyId],
      );

      // Accounts
      let acc1390 = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1390'`,
        [companyId],
      );
      let acc2390 = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '2390'`,
        [companyId],
      );
      let accCustodyEg = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1310'`,
        [companyId],
      );

      let sourceBankId = parsed.sourceBankAccountId;
      if (!sourceBankId) {
        const defaultBank = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND (code IN ('1110', '1100') OR subtype = 'BANK') AND is_posting = true ORDER BY (code = '1110') DESC LIMIT 1`,
          [companyId],
        );
        sourceBankId = defaultBank?.id;
      }
      if (!sourceBankId) throw new DomainError('BANK_ACCOUNT_MISSING', 'يرجى تحديد حساب البنك السعودي للتحويل منه');

      const accFees = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '5150'`,
        [companyId],
      );

      // Saudi HQ Journal Entry (SAR Base)
      const saJeLines: JournalLineInput[] = [
        {
          accountId: acc1390?.id ?? saBranch?.interbranch_account_id!,
          debit: toDbAmount(amountSar),
          credit: '0',
          currencyCode: 'SAR',
          exchangeRate: '1',
          branchId: saBranch?.id,
          description: `تحويل عهدة إلى فرع مصر - ${transferNo} (${custody.custody_no})`,
        },
      ];

      if (bankFeesSar.gt(0) && accFees) {
        saJeLines.push({
          accountId: accFees.id,
          debit: toDbAmount(bankFeesSar),
          credit: '0',
          currencyCode: 'SAR',
          exchangeRate: '1',
          branchId: saBranch?.id,
          description: `عمولات ورسوم بنكية على تحويل العهدة - ${transferNo}`,
        });
      }

      saJeLines.push({
        accountId: sourceBankId,
        debit: '0',
        credit: toDbAmount(amountSar.plus(bankFeesSar)),
        currencyCode: 'SAR',
        exchangeRate: '1',
        branchId: saBranch?.id,
        description: `صرف تحويل عهدة لفرع مصر من البنك - ${transferNo}`,
      });

      const saJeId = await this.journal.createAndPost(companyId, {
        entryDate: transferDate,
        journalType: 'PAYMENT',
        description: `تحويل عهدة نقدية إلى فرع مصر: ${custody.employeeNameAr} (${transferNo})`,
        reference: parsed.bankReference ?? transferNo,
        currencyCode: 'SAR',
        sourceModule: 'fin',
        sourceType: 'CUSTODY_TRANSFER_SA',
        sourceId: custodyId,
        lines: saJeLines,
      });

      // Egypt Branch Journal Entry (EGP with base equivalent)
      const egRateToBase = amountSar.div(amountEgp).toDecimalPlaces(10);
      const egJeLines: JournalLineInput[] = [
        {
          accountId: accCustodyEg?.id!,
          debit: toDbAmount(amountEgp),
          credit: '0',
          currencyCode: 'EGP',
          exchangeRate: toDbAmount(egRateToBase),
          branchId: egBranch?.id,
          employeeId: custody.employee_id,
          description: `استلام تحويل عهدة من المركز الرئيسي بالسعودية - ${transferNo}`,
        },
        {
          accountId: acc2390?.id ?? egBranch?.interbranch_account_id!,
          debit: '0',
          credit: toDbAmount(amountEgp),
          currencyCode: 'EGP',
          exchangeRate: toDbAmount(egRateToBase),
          branchId: egBranch?.id,
          description: `جاري المركز الرئيسي عن تحويل عهدة لفرع مصر - ${transferNo}`,
        },
      ];

      const egJeId = await this.journal.createAndPost(companyId, {
        entryDate: transferDate,
        journalType: 'GENERAL',
        description: `استلام وقيد تحويل عهدة نقدية بفرع مصر: ${custody.employeeNameAr} (${transferNo})`,
        reference: transferNo,
        currencyCode: 'EGP',
        sourceModule: 'fin',
        sourceType: 'CUSTODY_TRANSFER_EG',
        sourceId: custodyId,
        lines: egJeLines,
      });

      // Insert into fin.custody_transfers
      await this.db.query(
        `INSERT INTO fin.custody_transfers (
           company_id, custody_id, transfer_number, transfer_date,
           source_branch_id, source_bank_account_id, target_branch_id,
           amount_sar, exchange_rate, amount_egp, bank_fees_sar,
           bank_reference, status, journal_entry_sa_id, journal_entry_eg_id,
           receipt_url, notes, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'COMPLETED',$13,$14,$15,$16,sys.current_user_id(),sys.current_user_id())`,
        [
          companyId, custodyId, transferNo, transferDate,
          saBranch?.id ?? null, sourceBankId, egBranch?.id ?? null,
          toDbAmount(amountSar), toDbAmount(exchangeRate), toDbAmount(amountEgp), toDbAmount(bankFeesSar),
          parsed.bankReference ?? null, saJeId, egJeId,
          parsed.receiptUrl ?? null, parsed.notes ?? null,
        ],
      );

      // Update custody balances
      const newDisbursedSar = D(custody.disbursed_amount_base ?? 0).plus(amountSar);
      const newConvertedEgp = D(custody.converted_amount_target ?? 0).plus(amountEgp);
      const newRemainingEgp = D(custody.remaining_balance_target ?? 0).plus(amountEgp);

      await this.db.query(
        `UPDATE fin.custodies
            SET disbursed_amount = disbursed_amount + $2,
                disbursed_amount_base = $3,
                converted_amount_target = $4,
                remaining_balance_target = $5,
                conversion_rate = $6,
                target_currency = 'EGP',
                status = CASE WHEN status = 'DRAFT' THEN 'CONVERTED' ELSE status END,
                updated_at = now(),
                updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $7`,
        [
          companyId, toDbAmount(amountSar), toDbAmount(newDisbursedSar),
          toDbAmount(newConvertedEgp), toDbAmount(newRemainingEgp),
          toDbAmount(exchangeRate), custodyId,
        ],
      );

      return this.get(companyId, custodyId);
    });
  }

  // ------------------------------------------------------------------ List Transfers
  async listTransfers(companyId: string, custodyId: string) {
    return this.db.query(
      `SELECT t.*,
              sb.name_ar AS "sourceBranchNameAr",
              tb.name_ar AS "targetBranchNameAr",
              bank.name_ar AS "sourceBankNameAr",
              je_sa.entry_no AS "saJournalEntryNo",
              je_eg.entry_no AS "egJournalEntryNo"
         FROM fin.custody_transfers t
         LEFT JOIN core.branches sb ON sb.id = t.source_branch_id
         LEFT JOIN core.branches tb ON tb.id = t.target_branch_id
         LEFT JOIN acc.accounts bank ON bank.id = t.source_bank_account_id
         LEFT JOIN acc.journal_entries je_sa ON je_sa.id = t.journal_entry_sa_id
         LEFT JOIN acc.journal_entries je_eg ON je_eg.id = t.journal_entry_eg_id
        WHERE t.company_id = $1 AND t.custody_id = $2
        ORDER BY t.transfer_date DESC, t.created_at DESC`,
      [companyId, custodyId],
    );
  }

  // ------------------------------------------------------------------ Add Settlement Expense Line
  async addSettlementLine(companyId: string, custodyId: string, input: z.infer<typeof CustodySettlementLineCreate>) {
    const parsed = CustodySettlementLineCreate.parse(input);

    return this.db.tx(async () => {
      const custody = await this.get(companyId, custodyId);
      if (['CLOSED', 'CANCELLED', 'DRAFT'].includes(custody.status)) {
        throw new DomainError('INVALID_STATUS', 'لا يمكن إضافة فواتير أو إيصالات لعهدة غير منصرفة أو مغلقة');
      }

      // Check max line_no
      const lineNoRow = await this.db.one<{ max_no: string }>(
        `SELECT COALESCE(MAX(line_no), 0)::text AS max_no FROM fin.custody_settlement_lines WHERE custody_id = $1`,
        [custodyId],
      );
      const nextLineNo = parseInt(lineNoRow?.max_no ?? '0', 10) + 1;

      // Base FX
      let fxRate = D(1);
      try {
        const resolved = await this.fx.toBase(companyId, parsed.currencyCode, parsed.expenseDate);
        fxRate = resolved.rate;
      } catch {
        fxRate = D(1);
      }

      const subtotal = D(parsed.subtotal);
      const vatAmount = D(parsed.vatAmount);
      const totalAmount = D(parsed.totalAmount);

      const subtotalBase = subtotal.times(fxRate);
      const vatAmountBase = vatAmount.times(fxRate);
      const totalAmountBase = totalAmount.times(fxRate);

      await this.db.query(
        `INSERT INTO fin.custody_settlement_lines (
           company_id, custody_id, line_no, expense_date, receipt_no,
           expense_account_id, project_id, cost_center_id, vendor_name,
           description, currency_code, exchange_rate, subtotal, vat_rate,
           vat_amount, total_amount, subtotal_base, vat_amount_base,
           total_amount_base, receipt_file_url, notes, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,sys.current_user_id(),sys.current_user_id())`,
        [
          companyId, custodyId, nextLineNo, parsed.expenseDate, parsed.receiptNo ?? null,
          parsed.expenseAccountId, parsed.projectId ?? null, parsed.costCenterId ?? null,
          parsed.vendorName ?? null, parsed.description, parsed.currencyCode, toDbAmount(fxRate),
          toDbAmount(subtotal), toDbAmount(parsed.vatRate), toDbAmount(vatAmount),
          toDbAmount(totalAmount), toDbAmount(subtotalBase), toDbAmount(vatAmountBase),
          toDbAmount(totalAmountBase), parsed.receiptFileUrl ?? null, parsed.notes ?? null,
        ],
      );

      // Recalculate custody totals
      await this.recalculateCustodyTotals(companyId, custodyId);

      return this.get(companyId, custodyId);
    });
  }

  // ------------------------------------------------------------------ Remove Settlement Line
  async removeSettlementLine(companyId: string, custodyId: string, lineId: string) {
    return this.db.tx(async () => {
      const line = await this.db.one<any>(
        `SELECT * FROM fin.custody_settlement_lines WHERE company_id = $1 AND custody_id = $2 AND id = $3`,
        [companyId, custodyId, lineId],
      );
      if (!line) throw new NotFoundError('LINE_NOT_FOUND', 'إيصال التسوية غير موجود');
      if (line.journal_entry_id) {
        throw new DomainError('LINE_POSTED', 'لا يمكن حذف إيصال تم ترحيله في قيود اليومية');
      }

      await this.db.query(
        `DELETE FROM fin.custody_settlement_lines WHERE company_id = $1 AND id = $2`,
        [companyId, lineId],
      );

      await this.recalculateCustodyTotals(companyId, custodyId);
      return this.get(companyId, custodyId);
    });
  }

  // ------------------------------------------------------------------ Recalculate Totals
  private async recalculateCustodyTotals(companyId: string, custodyId: string) {
    const sumRow = await this.db.one<{ total_settled: string }>(
      `SELECT COALESCE(SUM(total_amount), 0)::text AS total_settled
         FROM fin.custody_settlement_lines
        WHERE company_id = $1 AND custody_id = $2 AND status = 'APPROVED'`,
      [companyId, custodyId],
    );

    const totalSettled = D(sumRow?.total_settled ?? '0');
    const custody = await this.db.one<any>(
      `SELECT converted_amount_target, disbursed_amount, status FROM fin.custodies WHERE id = $1`,
      [custodyId],
    );

    const availablePool = D(custody.converted_amount_target > 0 ? custody.converted_amount_target : custody.disbursed_amount);
    const remaining = availablePool.minus(totalSettled);

    let nextStatus = custody.status;
    if (['DISBURSED', 'CONVERTED', 'PARTIALLY_SETTLED', 'SETTLED'].includes(custody.status)) {
      if (totalSettled.isZero()) {
        nextStatus = custody.converted_amount_target > 0 ? 'CONVERTED' : 'DISBURSED';
      } else if (remaining.isZero()) {
        nextStatus = 'SETTLED';
      } else {
        nextStatus = 'PARTIALLY_SETTLED';
      }
    }

    await this.db.query(
      `UPDATE fin.custodies
          SET total_settled_amount_target = $2,
              remaining_balance_target = $3,
              status = $4,
              updated_at = now()
        WHERE company_id = $1 AND id = $5`,
      [companyId, toDbAmount(totalSettled), toDbAmount(remaining), nextStatus, custodyId],
    );
  }

  // ------------------------------------------------------------------ Post Settlement Journal Entry
  async postSettlement(companyId: string, custodyId: string, input: z.infer<typeof CustodyPostSettlement>) {
    const parsed = CustodyPostSettlement.parse(input);

    return this.db.tx(async () => {
      const custody = await this.get(companyId, custodyId);
      const unpostedLines = custody.lines.filter((l: any) => !l.journal_entry_id && l.status === 'APPROVED');

      if (!unpostedLines.length) {
        throw new DomainError('NO_UNPOSTED_LINES', 'لا توجد إيصالات أو فواتير تسوية جديدة للترحيل');
      }

      // Custody Account (1310 for Egypt / 1320 for HQ / 1300 general)
      const custodyAccountCode = custody.target_currency === 'EGP' ? '1310' : '1320';
      let custodyAcc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = $2`,
        [companyId, custodyAccountCode],
      );
      if (!custodyAcc) {
        custodyAcc = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1300'`,
          [companyId],
        );
      }
      if (!custodyAcc) throw new DomainError('CUSTODY_ACCOUNT_MISSING', 'لم يتم العثور على حساب العهدة');

      // VAT Account 1250
      const vatAcc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1250'`,
        [companyId],
      );

      const jeLines: JournalLineInput[] = [];
      let totalSettlementCredit = D(0);

      // Debit each expense account
      for (const line of unpostedLines) {
        jeLines.push({
          accountId: line.expense_account_id,
          debit: line.subtotal,
          credit: '0',
          currencyCode: line.currency_code,
          exchangeRate: line.exchange_rate,
          projectId: line.project_id ?? undefined,
          costCenterId: line.cost_center_id ?? undefined,
          employeeId: custody.employee_id,
          description: `${line.description} - إيصال: ${line.receipt_no ?? 'بدون'}`,
        });

        // Debit Input VAT if > 0
        if (!D(line.vat_amount).isZero() && vatAcc) {
          jeLines.push({
            accountId: vatAcc.id,
            debit: line.vat_amount,
            credit: '0',
            currencyCode: line.currency_code,
            exchangeRate: line.exchange_rate,
            description: `ضريبة مدخلات إيصال ${line.receipt_no ?? ''} - عهدة ${custody.custody_no}`,
          });
        }

        totalSettlementCredit = totalSettlementCredit.plus(D(line.total_amount));
      }

      // Credit Custody Account to reduce balance
      jeLines.push({
        accountId: custodyAcc.id,
        debit: '0',
        credit: toDbAmount(totalSettlementCredit),
        currencyCode: custody.target_currency,
        exchangeRate: unpostedLines[0]?.exchange_rate ?? '1',
        employeeId: custody.employee_id,
        description: `تسوية مصروفات عهدة ${custody.custody_no} للموظف ${custody.employeeNameAr}`,
      });

      const entryId = await this.journal.createAndPost(companyId, {
        entryDate: parsed.settlementDate,
        journalType: 'EXPENSE',
        description: `تسوية مصروفات عهدة فرع: ${custody.title_ar} (${custody.custody_no})`,
        reference: parsed.reference ?? `SETTLE-${custody.custody_no}`,
        currencyCode: custody.target_currency,
        sourceModule: 'fin',
        sourceType: 'CUSTODY_SETTLEMENT',
        sourceId: custodyId,
        lines: jeLines,
      });

      // Update line rows with journal_entry_id
      const lineIds = unpostedLines.map((l: any) => l.id);
      await this.db.query(
        `UPDATE fin.custody_settlement_lines
            SET journal_entry_id = $2, updated_at = now()
          WHERE company_id = $1 AND id = ANY($3::uuid[])`,
        [companyId, entryId, lineIds],
      );

      await this.recalculateCustodyTotals(companyId, custodyId);
      return this.get(companyId, custodyId);
    });
  }

  // ------------------------------------------------------------------ Dedicated Custody Settlement Workflow
  async createSettlement(companyId: string, custodyId: string, input: z.infer<typeof CustodySettlementCreate>) {
    const parsed = CustodySettlementCreate.parse(input);
    return this.db.tx(async () => {
      const custody = await this.get(companyId, custodyId);
      const unpostedLines = custody.lines.filter((l: any) => !l.journal_entry_id && l.status === 'APPROVED');
      const returnedEgp = D(parsed.returnedAmountEgp ?? 0);

      if (!unpostedLines.length && returnedEgp.isZero()) {
        throw new DomainError('NO_SETTLEMENT_ITEMS', 'لا توجد فواتير تسوية معتمدة ولا مبالغ مسترجعة لتسويتها');
      }

      // 1. Sequence number STL-YYYY-XXXX
      const year = new Date().getFullYear();
      const countRow = await this.db.one<{ count: string }>(
        `SELECT count(*)::text AS count FROM fin.custody_settlements WHERE company_id = $1 AND settlement_number LIKE $2`,
        [companyId, `STL-${year}-%`],
      );
      const seq = (parseInt(countRow?.count ?? '0', 10) + 1).toString().padStart(4, '0');
      const settlementNo = `STL-${year}-${seq}`;
      const settlementDate = parsed.settlementDate ?? new Date().toISOString().slice(0, 10);

      // 2. Sum expenses
      let totalExpensesEgp = D(0);
      let totalExpensesSar = D(0);

      for (const line of unpostedLines) {
        totalExpensesEgp = totalExpensesEgp.plus(line.total_amount);
        totalExpensesSar = totalExpensesSar.plus(line.total_amount_base);
      }

      // Weighted average original rate for custody funds
      const origPoolEgp = D(custody.converted_amount_target > 0 ? custody.converted_amount_target : 1);
      const origPoolSar = D(custody.disbursed_amount_base > 0 ? custody.disbursed_amount_base : 1);
      const origAvgRate = origPoolEgp.div(origPoolSar).toNumber(); // e.g. 13.00 EGP per SAR

      let settlementRate = parsed.settlementRate ? D(parsed.settlementRate) : D(origAvgRate);
      if (!parsed.settlementRate) {
        try {
          const resolved = await this.fx.getRate(companyId, 'SAR', 'EGP', settlementDate, 'SPOT');
          settlementRate = resolved.rate;
        } catch {
          settlementRate = D(origAvgRate);
        }
      }

      const returnedSar = returnedEgp.gt(0) ? returnedEgp.div(settlementRate) : D(0);
      const actualCostSar = totalExpensesEgp.div(settlementRate);
      const origCostSar = totalExpensesSar;
      const fxDifferenceSar = origCostSar.minus(actualCostSar);

      // Accounts
      const custodyAcc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1310'`,
        [companyId],
      );
      const vatAcc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1250'`,
        [companyId],
      );

      // Build Journal Entry Lines
      const jeLines: JournalLineInput[] = [];

      for (const line of unpostedLines) {
        const hasVat = D(line.vat_amount).gt(0) && !!vatAcc;
        const debitAmt = hasVat ? line.subtotal : line.total_amount;

        jeLines.push({
          accountId: line.expense_account_id,
          debit: toDbAmount(debitAmt),
          credit: '0',
          currencyCode: line.currency_code ?? 'EGP',
          exchangeRate: toDbAmount(D(1).div(settlementRate)),
          projectId: line.project_id ?? undefined,
          costCenterId: line.cost_center_id ?? undefined,
          employeeId: custody.employee_id,
          description: `${line.description} - إيصال: ${line.receipt_no ?? 'بدون'}`,
        });

        if (hasVat) {
          jeLines.push({
            accountId: vatAcc!.id,
            debit: toDbAmount(line.vat_amount),
            credit: '0',
            currencyCode: line.currency_code ?? 'EGP',
            exchangeRate: toDbAmount(D(1).div(settlementRate)),
            employeeId: custody.employee_id,
            description: `ضريبة مدخلات مشتريات عهدة - إيصال: ${line.receipt_no ?? 'بدون'}`,
          });
        }
      }

      if (returnedEgp.gt(0) && parsed.returnToBankAccountId) {
        jeLines.push({
          accountId: parsed.returnToBankAccountId,
          debit: toDbAmount(returnedEgp),
          credit: '0',
          currencyCode: 'EGP',
          exchangeRate: toDbAmount(D(1).div(settlementRate)),
          description: `استرجاع رصيد فائض من العهدة النقدية - ${settlementNo}`,
        });
      }

      const totalRelievedEgp = totalExpensesEgp.plus(returnedEgp);
      jeLines.push({
        accountId: custodyAcc?.id!,
        debit: '0',
        credit: toDbAmount(totalRelievedEgp),
        currencyCode: 'EGP',
        exchangeRate: toDbAmount(D(1).div(settlementRate)),
        employeeId: custody.employee_id,
        description: `تسوية وإقفال مصروفات عهدة - ${settlementNo}`,
      });

      const jeId = await this.journal.createAndPost(companyId, {
        entryDate: settlementDate,
        journalType: 'GENERAL',
        description: `تسوية عهدة نقدية: ${custody.employeeNameAr} (${settlementNo})`,
        reference: settlementNo,
        currencyCode: 'EGP',
        sourceModule: 'fin',
        sourceType: 'CUSTODY_SETTLEMENT',
        sourceId: custodyId,
        lines: jeLines,
      });

      // Insert settlement record
      const remainingBalanceEgp = D(custody.remaining_balance_target ?? 0).minus(totalRelievedEgp);
      const remainingBalanceSar = remainingBalanceEgp.div(settlementRate);

      const stlRow = await this.db.one<{ id: string }>(
        `INSERT INTO fin.custody_settlements (
           company_id, custody_id, settlement_number, settlement_date,
           period_start, period_end, total_expenses_egp, total_expenses_sar,
           returned_amount_egp, returned_amount_sar, remaining_balance_egp,
           remaining_balance_sar, fx_gain_loss_sar, settlement_rate,
           original_average_rate, status, journal_entry_id, approved_by,
           approved_at, notes, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'POSTED',$16,sys.current_user_id(),now(),$17,sys.current_user_id(),sys.current_user_id())
         RETURNING id`,
        [
          companyId, custodyId, settlementNo, settlementDate,
          parsed.periodStart ?? null, parsed.periodEnd ?? null,
          toDbAmount(totalExpensesEgp), toDbAmount(totalExpensesSar),
          toDbAmount(returnedEgp), toDbAmount(returnedSar),
          toDbAmount(remainingBalanceEgp), toDbAmount(remainingBalanceSar),
          toDbAmount(fxDifferenceSar), toDbAmount(settlementRate),
          toDbAmount(origAvgRate), jeId, parsed.notes ?? null,
        ],
      );

      // Link lines to settlement and journal
      for (const line of unpostedLines) {
        await this.db.query(
          `UPDATE fin.custody_settlement_lines
              SET settlement_id = $1,
                  journal_entry_id = $2,
                  updated_at = now()
            WHERE id = $3`,
          [stlRow!.id, jeId, line.id],
        );
      }

      await this.recalculateCustodyTotals(companyId, custodyId);
      return this.get(companyId, custodyId);
    });
  }

  // ------------------------------------------------------------------ List Settlements
  async listSettlements(companyId: string, custodyId: string) {
    return this.db.query(
      `SELECT s.*,
              je.entry_no AS "journalEntryNo",
              u.full_name AS "approvedByName"
         FROM fin.custody_settlements s
         LEFT JOIN acc.journal_entries je ON je.id = s.journal_entry_id
         LEFT JOIN iam.users u ON u.id = s.approved_by
        WHERE s.company_id = $1 AND s.custody_id = $2
        ORDER BY s.settlement_date DESC, s.created_at DESC`,
      [companyId, custodyId],
    );
  }

  // ------------------------------------------------------------------ Close Custody
  async closeCustody(companyId: string, custodyId: string, input: z.infer<typeof CustodyClose>) {
    const parsed = CustodyClose.parse(input);

    return this.db.tx(async () => {
      const custody = await this.get(companyId, custodyId);
      if (['CLOSED', 'CANCELLED'].includes(custody.status)) {
        throw new DomainError('INVALID_STATUS', 'العهدة مغلقة أو ملغاة بالفعل');
      }

      let closureEntryId: string | null = null;
      const remainingBalance = D(custody.remaining_balance_target ?? 0);

      // If remaining balance is positive and refund account is provided, record refund to bank
      if (!remainingBalance.isZero() && parsed.refundToAccountId) {
        const custodyAccountCode = custody.target_currency === 'EGP' ? '1310' : '1320';
        let custodyAcc = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = $2`,
          [companyId, custodyAccountCode],
        );
        if (!custodyAcc) {
          custodyAcc = await this.db.one<{ id: string }>(
            `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1300'`,
            [companyId],
          );
        }

        if (custodyAcc) {
          const refundAmt = parsed.refundAmount ? D(parsed.refundAmount) : remainingBalance;
          const jeLines: JournalLineInput[] = [
            {
              accountId: parsed.refundToAccountId,
              debit: toDbAmount(refundAmt),
              credit: '0',
              currencyCode: custody.target_currency,
              exchangeRate: '1',
              description: `استرداد متبقي عهدة نقدية إلى البنك - ${custody.custody_no}`,
            },
            {
              accountId: custodyAcc.id,
              debit: '0',
              credit: toDbAmount(refundAmt),
              currencyCode: custody.target_currency,
              exchangeRate: '1',
              employeeId: custody.employee_id,
              description: `إقفال واسترداد رصيد عهدة ${custody.employeeNameAr}`,
            },
          ];

          closureEntryId = await this.journal.createAndPost(companyId, {
            entryDate: parsed.closureDate,
            journalType: 'PAYMENT',
            description: `إقفال واسترداد متبقي عهدة نقدية: ${custody.custody_no}`,
            reference: `CLOSE-${custody.custody_no}`,
            currencyCode: custody.target_currency,
            sourceModule: 'fin',
            sourceType: 'CUSTODY_CLOSURE',
            sourceId: custodyId,
            lines: jeLines,
          });
        }
      }

      await this.db.query(
        `UPDATE fin.custodies
            SET status = 'CLOSED',
                closure_date = $2,
                closure_notes = $3,
                closure_journal_entry_id = $4,
                remaining_balance_target = 0,
                updated_at = now(),
                updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $5`,
        [companyId, parsed.closureDate, parsed.closureNotes ?? null, closureEntryId, custodyId],
      );

      return this.get(companyId, custodyId);
    });
  }

  // ------------------------------------------------------------------ Comprehensive Custody Report
  async getCustodyReport(companyId: string, q: { fromDate?: string; toDate?: string; employeeId?: string }) {
    const params: any[] = [companyId];
    let whereCustody = 'c.company_id = $1';

    if (q.employeeId) {
      params.push(q.employeeId);
      whereCustody += ` AND c.employee_id = $${params.length}`;
    }

    // 1. KPI Totals
    const kpis = await this.db.one<any>(
      `SELECT
         COUNT(*)::int AS "totalCustodiesCount",
         COALESCE(SUM(c.disbursed_amount) FILTER (WHERE c.source_currency = 'SAR'), 0) AS "totalDisbursedSar",
         COALESCE(SUM(c.disbursed_amount) FILTER (WHERE c.source_currency = 'EGP'), 0) AS "totalDisbursedEgp",
         COALESCE(SUM(c.converted_amount_target), 0) AS "totalConvertedToEgp",
         COALESCE(SUM(c.total_settled_amount_target), 0) AS "totalSettledEgp",
         COALESCE(SUM(c.remaining_balance_target), 0) AS "totalRemainingBalanceEgp"
        FROM fin.custodies c
       WHERE ${whereCustody} AND c.status NOT IN ('CANCELLED')`,
      params,
    );

    // 2. Spending breakdown by expense category
    const expenseBreakdown = await this.db.query<any>(
      `SELECT
         acc.code AS "accountCode",
         acc.name_ar AS "accountNameAr",
         COUNT(l.id)::int AS "vouchersCount",
         COALESCE(SUM(l.subtotal), 0) AS "subtotal",
         COALESCE(SUM(l.vat_amount), 0) AS "vatAmount",
         COALESCE(SUM(l.total_amount), 0) AS "totalAmount"
        FROM fin.custody_settlement_lines l
        JOIN fin.custodies c ON c.id = l.custody_id
        JOIN acc.accounts acc ON acc.id = l.expense_account_id
       WHERE ${whereCustody} AND l.status = 'APPROVED'
       GROUP BY acc.code, acc.name_ar
       ORDER BY COALESCE(SUM(l.total_amount), 0) DESC`,
      params,
    );

    // 3. Custodian Balances List
    const custodians = await this.db.query<any>(
      `SELECT
         e.id AS "employeeId",
         e.code AS "employeeCode",
         e.full_name_ar AS "employeeNameAr",
         COUNT(c.id)::int AS "custodiesCount",
         COALESCE(SUM(c.disbursed_amount) FILTER (WHERE c.source_currency = 'SAR'), 0) AS "disbursedSar",
         COALESCE(SUM(c.converted_amount_target), 0) AS "convertedEgp",
         COALESCE(SUM(c.total_settled_amount_target), 0) AS "settledEgp",
         COALESCE(SUM(c.remaining_balance_target), 0) AS "balanceEgp"
        FROM fin.custodies c
        JOIN hr.employees e ON e.id = c.employee_id
       WHERE ${whereCustody} AND c.status NOT IN ('CANCELLED')
       GROUP BY e.id, e.code, e.full_name_ar
       ORDER BY COALESCE(SUM(c.remaining_balance_target), 0) DESC`,
      params,
    );

    return {
      kpis,
      expenseBreakdown,
      custodians,
    };
  }
}
