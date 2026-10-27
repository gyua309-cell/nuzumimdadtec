import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, toDbAmount } from '../../../shared/money';
import { ListQuery, Page, offset, orderBy } from '../../../shared/http/common';
import { JournalService } from '../../accounting/application/journal.service';
import { JournalLineInput } from '../../accounting/domain/journal';

export const PurchaseInvoiceLineInput = z.object({
  itemType: z.enum(['EXPENSE', 'SERVICE', 'GOODS', 'SOFTWARE_LICENSE', 'SERVER_HOSTING', 'EQUIPMENT', 'SUBCONTRACTOR']).default('EXPENSE'),
  description: z.string().trim().min(2).max(500),
  expenseAccountId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  quantity: z.string().or(z.number()).transform(v => String(v)),
  unitPrice: z.string().or(z.number()).transform(v => String(v)),
  discountAmount: z.string().or(z.number()).transform(v => String(v)).optional().default('0'),
  vatRate: z.string().or(z.number()).transform(v => String(v)).optional().default('15.00'),
});

export const PurchaseInvoiceCreate = z.object({
  vendorInvoiceNo: z.string().trim().max(100).nullable().optional(),
  invoiceType: z.enum(['STANDARD_BILL', 'EXPENSE_BILL', 'DEBIT_NOTE']).default('STANDARD_BILL'),
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  fiscalPeriodId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currencyCode: z.string().trim().length(3).default('SAR'),
  exchangeRate: z.string().or(z.number()).transform(v => String(v)).optional().default('1'),
  originalInvoiceId: z.string().uuid().nullable().optional(),
  returnReason: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(PurchaseInvoiceLineInput).min(1, 'يجب إضافة بند واحد على الأقل في فاتورة المشتريات'),
});

export const DebitNoteCreate = z.object({
  originalInvoiceId: z.string().uuid(),
  returnReason: z.string().trim().min(3).max(1000),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(PurchaseInvoiceLineInput).optional(),
});

@Injectable()
export class PurchasesService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
  ) {}

  private async nextInvoiceNo(companyId: string, type: string): Promise<string> {
    const prefix = type === 'DEBIT_NOTE' ? 'DEB' : 'BILL';
    const year = new Date().getFullYear();
    const count = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM pur.purchase_invoices WHERE company_id = $1 AND invoice_type = $2`,
      [companyId, type],
    );
    const seq = (Number(count?.n ?? 0) + 1).toString().padStart(4, '0');
    return `${prefix}-${year}-${seq}`;
  }

  async list(companyId: string, q: ListQuery & { vendorId?: string; projectId?: string; status?: string; type?: string }): Promise<Page<any>> {
    const where = ['i.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.vendorId) { params.push(q.vendorId); where.push(`i.vendor_id = $${params.length}`); }
    if (q.projectId) { params.push(q.projectId); where.push(`i.project_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`i.status = $${params.length}`); }
    if (q.type) { params.push(q.type); where.push(`i.invoice_type = $${params.length}`); }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(i.invoice_no ILIKE $${params.length} OR i.vendor_invoice_no ILIKE $${params.length} OR v.name_ar ILIKE $${params.length})`);
    }
    const sql = where.join(' AND ');

    const total = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM pur.purchase_invoices i JOIN pur.vendors v ON v.id = i.vendor_id WHERE ${sql}`,
      params,
    );
    const rows = await this.db.query(
      `SELECT i.id, i.invoice_no AS "invoiceNo", i.vendor_invoice_no AS "vendorInvoiceNo",
              i.invoice_type AS "invoiceType", i.vendor_id AS "vendorId", v.name_ar AS "vendorName",
              v.tax_registration_no AS "vendorTaxNo", i.project_id AS "projectId",
              p.name_ar AS "projectName", p.code AS "projectCode",
              i.fiscal_period_id AS "fiscalPeriodId", i.issue_date AS "issueDate",
              i.due_date AS "dueDate", i.currency_code AS "currencyCode",
              i.subtotal::text AS "subtotal", i.vat_amount::text AS "vatAmount",
              i.total_amount::text AS "totalAmount", i.status, i.payment_status AS "paymentStatus",
              i.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo",
              i.notes, i.created_at AS "createdAt"
         FROM pur.purchase_invoices i
         JOIN pur.vendors v ON v.id = i.vendor_id
         LEFT JOIN prj.projects p ON p.id = i.project_id
         LEFT JOIN acc.journal_entries je ON je.id = i.journal_entry_id
        WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { invoiceNo: 'i.invoice_no', issueDate: 'i.issue_date' }, 'i.issue_date DESC, i.created_at DESC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const inv = await this.db.one(
      `SELECT i.id, i.invoice_no AS "invoiceNo", i.vendor_invoice_no AS "vendorInvoiceNo",
              i.invoice_type AS "invoiceType", i.vendor_id AS "vendorId", v.name_ar AS "vendorName",
              v.name_en AS "vendorNameEn", v.tax_registration_no AS "vendorTaxNo", v.cr_number AS "vendorCr",
              v.phone AS "vendorPhone", v.email AS "vendorEmail", v.address AS "vendorAddress",
              i.project_id AS "projectId", p.name_ar AS "projectName", p.code AS "projectCode",
              i.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              i.issue_date AS "issueDate", i.due_date AS "dueDate", i.currency_code AS "currencyCode",
              i.exchange_rate::text AS "exchangeRate", i.subtotal::text AS "subtotal",
              i.vat_amount::text AS "vatAmount", i.total_amount::text AS "totalAmount",
              i.subtotal_base::text AS "subtotalBase", i.vat_amount_base::text AS "vatAmountBase",
              i.total_amount_base::text AS "totalAmountBase", i.status, i.payment_status AS "paymentStatus",
              i.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo",
              i.original_invoice_id AS "originalInvoiceId", orig.invoice_no AS "originalInvoiceNo",
              i.return_reason AS "returnReason", i.notes, i.created_at AS "createdAt"
         FROM pur.purchase_invoices i
         JOIN pur.vendors v ON v.id = i.vendor_id
         JOIN core.fiscal_periods fp ON fp.id = i.fiscal_period_id
         LEFT JOIN prj.projects p ON p.id = i.project_id
         LEFT JOIN acc.journal_entries je ON je.id = i.journal_entry_id
         LEFT JOIN pur.purchase_invoices orig ON orig.id = i.original_invoice_id
        WHERE i.company_id = $1 AND i.id = $2`,
      [companyId, id],
    );
    if (!inv) throw new NotFoundError('PURCHASE_INVOICE_NOT_FOUND', 'فاتورة المشتريات غير موجودة');

    const lines = await this.db.query(
      `SELECT l.id, l.line_no AS "lineNo", l.item_type AS "itemType", l.description,
              l.expense_account_id AS "expenseAccountId", acc.code AS "accountCode", acc.name_ar AS "accountName",
              l.project_id AS "projectId", prj.name_ar AS "projectName", prj.code AS "projectCode",
              l.cost_center_id AS "costCenterId", cc.name_ar AS "costCenterName",
              l.quantity::text AS "quantity", l.unit_price::text AS "unitPrice",
              l.discount_amount::text AS "discountAmount", l.vat_rate::text AS "vatRate",
              l.subtotal::text AS "subtotal", l.vat_amount::text AS "vatAmount",
              l.total_amount::text AS "totalAmount", l.subtotal_base::text AS "subtotalBase",
              l.vat_amount_base::text AS "vatAmountBase", l.total_amount_base::text AS "totalAmountBase"
         FROM pur.purchase_invoice_lines l
         JOIN acc.accounts acc ON acc.id = l.expense_account_id
         LEFT JOIN prj.projects prj ON prj.id = l.project_id
         LEFT JOIN core.cost_centers cc ON cc.id = l.cost_center_id
        WHERE l.purchase_invoice_id = $1
        ORDER BY l.line_no ASC`,
      [id],
    );

    return { ...inv, lines };
  }

  async create(companyId: string, body: z.infer<typeof PurchaseInvoiceCreate>) {
    return this.db.tx(async () => {
      const invoiceNo = await this.nextInvoiceNo(companyId, body.invoiceType);
      const fxRate = D(body.exchangeRate || 1);

      let invoiceSubtotal = D(0);
      let invoiceVat = D(0);

      const computedLines = body.lines.map((l, idx) => {
        const qty = D(l.quantity);
        const price = D(l.unitPrice);
        const discount = D(l.discountAmount || 0);
        const vatRate = D(l.vatRate || 15);

        const gross = qty.mul(price);
        const lineSubtotal = gross.sub(discount);
        const lineVat = lineSubtotal.mul(vatRate.div(100));
        const lineTotal = lineSubtotal.add(lineVat);

        invoiceSubtotal = invoiceSubtotal.add(lineSubtotal);
        invoiceVat = invoiceVat.add(lineVat);

        return {
          ...l,
          lineNo: idx + 1,
          subtotal: lineSubtotal,
          vatAmount: lineVat,
          totalAmount: lineTotal,
          subtotalBase: lineSubtotal.mul(fxRate),
          vatAmountBase: lineVat.mul(fxRate),
          totalAmountBase: lineTotal.mul(fxRate),
        };
      });

      const invoiceTotal = invoiceSubtotal.add(invoiceVat);
      const subtotalBase = invoiceSubtotal.mul(fxRate);
      const vatAmountBase = invoiceVat.mul(fxRate);
      const totalAmountBase = invoiceTotal.mul(fxRate);

      const row = await this.db.one(
        `INSERT INTO pur.purchase_invoices (
           company_id, invoice_no, vendor_invoice_no, invoice_type, vendor_id,
           project_id, fiscal_period_id, issue_date, due_date, currency_code,
           exchange_rate, subtotal, vat_amount, total_amount, subtotal_base,
           vat_amount_base, total_amount_base, status, payment_status,
           original_invoice_id, return_reason, notes, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'DRAFT','UNPAID',$18,$19,$20,sys.current_user_id(),sys.current_user_id())
         RETURNING id`,
        [
          companyId, invoiceNo, body.vendorInvoiceNo ?? null, body.invoiceType, body.vendorId,
          body.projectId ?? null, body.fiscalPeriodId, body.issueDate, body.dueDate ?? null,
          body.currencyCode, toDbAmount(fxRate), toDbAmount(invoiceSubtotal), toDbAmount(invoiceVat),
          toDbAmount(invoiceTotal), toDbAmount(subtotalBase), toDbAmount(vatAmountBase),
          toDbAmount(totalAmountBase), body.originalInvoiceId ?? null, body.returnReason ?? null,
          body.notes ?? null,
        ],
      );

      for (const cl of computedLines) {
        await this.db.query(
          `INSERT INTO pur.purchase_invoice_lines (
             company_id, purchase_invoice_id, line_no, item_type, description,
             expense_account_id, project_id, cost_center_id, quantity, unit_price,
             discount_amount, vat_rate, subtotal, vat_amount, total_amount,
             subtotal_base, vat_amount_base, total_amount_base
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            companyId, row.id, cl.lineNo, cl.itemType, cl.description,
            cl.expenseAccountId, cl.projectId ?? body.projectId ?? null, cl.costCenterId ?? null,
            toDbAmount(cl.quantity), toDbAmount(cl.unitPrice), toDbAmount(cl.discountAmount),
            toDbAmount(cl.vatRate), toDbAmount(cl.subtotal), toDbAmount(cl.vatAmount),
            toDbAmount(cl.totalAmount), toDbAmount(cl.subtotalBase), toDbAmount(cl.vatAmountBase),
            toDbAmount(cl.totalAmountBase),
          ],
        );
      }

      return this.get(companyId, row.id);
    });
  }

  /**
   * Post Purchase Invoice: Generates Automatic Double-Entry Journal Entry in the General Ledger
   *
   * Standard Bill Accounting Entry:
   * Dr. Expense Accounts / Direct Project Costs (Lines subtotals)
   * Dr. Input VAT Account 1250 (15% VAT)
   * Cr. Accounts Payable (Vendor Account 2300)
   *
   * Debit Note (Purchase Return) Accounting Entry:
   * Dr. Accounts Payable (Vendor Account 2300 - reduces debt)
   * Cr. Expense Accounts / Purchase Returns (Lines subtotals)
   * Cr. Input VAT Account 1250 (reduces Input VAT)
   */
  async post(companyId: string, id: string) {
    return this.db.tx(async () => {
      const inv = await this.get(companyId, id);
      if (inv.status !== 'DRAFT') {
        throw new DomainError('INVOICE_NOT_DRAFT', 'لا يمكن ترحيل الفاتورة إلا إذا كانت في حالة مسودة');
      }

      const isDebitNote = inv.invoiceType === 'DEBIT_NOTE';

      // 1. Resolve Accounts
      // Vendor Accounts Payable account
      const vendorRow = await this.db.one<{ payable_account_id: string }>(
        `SELECT payable_account_id FROM pur.vendors WHERE company_id = $1 AND id = $2`,
        [companyId, inv.vendorId],
      );
      let apAccountId = vendorRow?.payable_account_id;
      if (!apAccountId) {
        const defaultAp = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '2300'`,
          [companyId],
        );
        apAccountId = defaultAp?.id;
      }
      if (!apAccountId) throw new DomainError('AP_ACCOUNT_MISSING', 'لم يتم العثور على حساب الموردين (2300)');

      // Input VAT Account 1250
      let vatAccountId: string | undefined;
      if (!D(inv.vatAmount).isZero()) {
        const vatAcc = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = '1250'`,
          [companyId],
        );
        vatAccountId = vatAcc?.id;
        if (!vatAccountId) throw new DomainError('VAT_ACCOUNT_MISSING', 'لم يتم العثور على حساب ضريبة المدخلات (1250)');
      }

      // 2. Build Journal Lines
      const jeLines: JournalLineInput[] = [];

      if (!isDebitNote) {
        // STANDARD PURCHASE BILL:
        // Debits: Each expense line
        for (const line of inv.lines) {
          jeLines.push({
            accountId: line.expenseAccountId,
            debit: line.subtotal,
            credit: '0',
            projectId: line.projectId ?? inv.projectId ?? undefined,
            costCenterId: line.costCenterId ?? undefined,
            supplierId: inv.vendorId,
            description: `${line.description} - فاتورة مورد: ${inv.invoiceNo}`,
          });
        }

        // Debit: Input VAT
        if (vatAccountId && !D(inv.vatAmount).isZero()) {
          jeLines.push({
            accountId: vatAccountId,
            debit: inv.vatAmount,
            credit: '0',
            supplierId: inv.vendorId,
            description: `ضريبة القيمة المضافة على المشتريات (15%) - فاتورة: ${inv.invoiceNo} (${inv.vendorName})`,
          });
        }

        // Credit: Accounts Payable (Vendor)
        jeLines.push({
          accountId: apAccountId,
          debit: '0',
          credit: inv.totalAmount,
          supplierId: inv.vendorId,
          projectId: inv.projectId ?? undefined,
          description: `استحقاق فاتورة مورد: ${inv.invoiceNo} - ${inv.vendorName}`,
        });
      } else {
        // DEBIT NOTE (PURCHASE RETURN):
        // Debit: Accounts Payable (Vendor) - reduces liability
        jeLines.push({
          accountId: apAccountId,
          debit: inv.totalAmount,
          credit: '0',
          supplierId: inv.vendorId,
          projectId: inv.projectId ?? undefined,
          description: `إشعار مدين / مردود مشتريات: ${inv.invoiceNo} - ${inv.vendorName}`,
        });

        // Credits: Each expense line reversed
        for (const line of inv.lines) {
          jeLines.push({
            accountId: line.expenseAccountId,
            debit: '0',
            credit: line.subtotal,
            projectId: line.projectId ?? inv.projectId ?? undefined,
            costCenterId: line.costCenterId ?? undefined,
            supplierId: inv.vendorId,
            description: `مردود مشتريات: ${line.description} - إشعار: ${inv.invoiceNo}`,
          });
        }

        // Credit: Input VAT reversed
        if (vatAccountId && !D(inv.vatAmount).isZero()) {
          jeLines.push({
            accountId: vatAccountId,
            debit: '0',
            credit: inv.vatAmount,
            supplierId: inv.vendorId,
            description: `عكس ضريبة القيمة المضافة لمردود المشتريات - إشعار: ${inv.invoiceNo}`,
          });
        }
      }

      // 3. Post to Journal
      const journalEntryId = await this.journal.createAndPost(companyId, {
        entryDate: inv.issueDate,
        fiscalPeriodId: inv.fiscalPeriodId,
        journalType: 'EXPENSE',
        sourceModule: 'purchases',
        sourceType: isDebitNote ? 'DEBIT_NOTE' : 'PURCHASE_BILL',
        sourceId: inv.id,
        reference: inv.invoiceNo,
        currencyCode: inv.currencyCode,
        description: `${isDebitNote ? 'إشعار مدين (مردودات مشتريات)' : 'فاتورة مشتريات مورد'} - ${inv.invoiceNo} (${inv.vendorName})`,
        lines: jeLines,
      });

      // 4. Update Purchase Invoice Status
      await this.db.query(
        `UPDATE pur.purchase_invoices
            SET status = 'POSTED', journal_entry_id = $2, updated_at = now(), updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $3`,
        [companyId, journalEntryId, id],
      );

      // 5. Cross-Module Automation: Auto-Acquisition of Fixed Assets from Equipment Bills
      if (!isDebitNote) {
        for (const line of inv.lines) {
          const acc = await this.db.one<{ code: string; subtype: string; account_class: string }>(
            `SELECT code, subtype, account_class FROM acc.accounts WHERE id = $1`,
            [line.expenseAccountId],
          );
          if (acc && (acc.code.startsWith('15') || acc.code.startsWith('16') || acc.subtype === 'FIXED_ASSET' || acc.account_class === 'NON_CURRENT_ASSET')) {
            const cat = await this.db.one<{ id: string }>(
              `SELECT id FROM ast.asset_categories WHERE company_id = $1 LIMIT 1`,
              [companyId],
            );
            if (cat) {
              const countAssets = await this.db.one<{ n: string }>(
                `SELECT count(*) AS n FROM ast.assets WHERE company_id = $1`,
                [companyId],
              );
              const assetNo = `AST-${new Date().getFullYear()}-${(Number(countAssets?.n ?? 0) + 1).toString().padStart(4, '0')}`;
              await this.db.query(
                `INSERT INTO ast.assets (
                   company_id, asset_no, name, category_id, asset_kind,
                   purchase_date, acquisition_cost, currency_code, status,
                   notes, created_by
                 ) VALUES ($1, $2, $3, $4, 'EQUIPMENT', $5, $6, $7, 'ACTIVE', $8, sys.current_user_id())
                 ON CONFLICT DO NOTHING`,
                [
                  companyId,
                  assetNo,
                  line.description,
                  cat.id,
                  inv.issueDate,
                  line.subtotal,
                  inv.currencyCode,
                  `تسجيل آلي عند ترحيل فاتورة المشتريات ${inv.invoiceNo} (${inv.vendorName})`,
                ],
              );
            }
          }
        }
      }

      return this.get(companyId, id);
    });
  }

  async createDebitNote(companyId: string, body: z.infer<typeof DebitNoteCreate>) {
    return this.db.tx(async () => {
      const original = await this.get(companyId, body.originalInvoiceId);
      if (original.status !== 'POSTED') {
        throw new DomainError('ORIGINAL_NOT_POSTED', 'يمكن إصدار إشعار مدين للفواتير المرحّلة فقط');
      }

      const returnLines = body.lines && body.lines.length > 0 ? body.lines : original.lines.map((l: any) => ({
        itemType: l.itemType,
        description: `مردود مشتريات: ${l.description}`,
        expenseAccountId: l.expenseAccountId,
        projectId: l.projectId,
        costCenterId: l.costCenterId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        vatRate: l.vatRate,
      }));

      const deb = await this.create(companyId, {
        vendorInvoiceNo: `RETURN-${original.invoiceNo}`,
        invoiceType: 'DEBIT_NOTE',
        vendorId: original.vendorId,
        projectId: original.projectId,
        fiscalPeriodId: original.fiscalPeriodId,
        issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
        currencyCode: original.currencyCode,
        exchangeRate: original.exchangeRate,
        originalInvoiceId: original.id,
        returnReason: body.returnReason,
        notes: body.notes || `إشعار مدين / مردود عن الفاتورة رقم ${original.invoiceNo}`,
        lines: returnLines,
      });

      // Post debit note automatically
      return this.post(companyId, deb.id);
    });
  }

  async cancel(companyId: string, id: string, reason: string) {
    return this.db.tx(async () => {
      const inv = await this.get(companyId, id);
      if (inv.status === 'CANCELLED') throw new DomainError('ALREADY_CANCELLED', 'الفاتورة ملغاة بالفعل');

      if (inv.journalEntryId) {
        // Reverse journal entry
        await this.journal.reverse(
          companyId,
          inv.journalEntryId,
          `إلغاء فاتورة المشتريات ${inv.invoiceNo}: ${reason}`,
          new Date().toISOString().slice(0, 10),
        );
      }

      await this.db.query(
        `UPDATE pur.purchase_invoices
            SET status = 'CANCELLED', notes = COALESCE(notes, '') || '\nسبب الإلغاء: ' || $2,
                updated_at = now(), updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $3`,
        [companyId, reason, id],
      );

      return this.get(companyId, id);
    });
  }
}
