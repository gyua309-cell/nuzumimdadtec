import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, toDbAmount } from '../../../shared/money';
import { ListQuery, Page, offset, orderBy } from '../../../shared/http/common';
import { PostingEngine, PostingItem } from '../../accounting/application/posting-engine';
import { JournalService } from '../../accounting/application/journal.service';
import { FiscalService } from '../../core/application/fiscal.service';
import { computeInvoiceHash, generateZatcaTlv, validateZatcaCompliance } from '../domain/zatca';

export const InvoiceLineInput = z.object({
  revenueLineId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(2).max(500),
  quantity: z.string().or(z.number()).transform(v => String(v)),
  unitPrice: z.string().or(z.number()).transform(v => String(v)),
  discountPct: z.string().or(z.number()).transform(v => String(v)).optional().default('0'),
  vatRate: z.string().or(z.number()).transform(v => String(v)).optional().default('15.00'),
  vatCategory: z.enum(['S', 'Z', 'E', 'O']).optional().default('S'),
  vatExemptionReason: z.string().trim().max(300).nullable().optional(),
});

export const InvoiceCreate = z.object({
  invoiceType: z.enum(['TAX_INVOICE', 'SIMPLIFIED', 'CREDIT_NOTE', 'DEBIT_NOTE']).default('TAX_INVOICE'),
  invoiceSubType: z.enum(['STANDARD', 'THIRD_PARTY', 'NOMINAL', 'EXPORTS', 'SUMMARY']).default('STANDARD'),
  clientId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  fiscalPeriodId: z.string().uuid(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  currencyCode: z.string().trim().length(3).default('SAR'),
  exchangeRate: z.string().or(z.number()).transform(v => String(v)).optional().default('1'),
  originalInvoiceId: z.string().uuid().nullable().optional(),
  returnReason: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(InvoiceLineInput).min(1),
});

export const CreditNoteCreate = z.object({
  originalInvoiceId: z.string().uuid(),
  returnReason: z.string().trim().min(3).max(1000),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(InvoiceLineInput).optional(),
});

export const AutoInvoiceFromRevenue = z.object({
  fiscalPeriodId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  autoPost: z.boolean().default(false),
});

@Injectable()
export class InvoicesService {
  constructor(
    private readonly db: DbService,
    private readonly posting: PostingEngine,
    private readonly journal: JournalService,
    private readonly fiscal: FiscalService,
  ) {}

  private async nextInvoiceNo(companyId: string, type: string): Promise<string> {
    const prefix = type === 'CREDIT_NOTE' ? 'CRN' : type === 'DEBIT_NOTE' ? 'DBN' : 'INV';
    const year = new Date().getFullYear().toString();
    const docPrefix = `${prefix}-${year}-`;
    
    await this.db.query(
      `INSERT INTO sys.number_sequences(company_id, doc_type, scope_key, prefix, padding)
       VALUES ($1, $2, $3, $4, 4)
       ON CONFLICT (company_id, doc_type, scope_key) DO NOTHING`,
      [companyId, type, year, docPrefix],
    );
    const seq = await this.db.one<{ id: string; prefix: string; padding: number; next_value: string }>(
      `SELECT id, prefix, padding, next_value FROM sys.number_sequences
        WHERE company_id = $1 AND doc_type = $2 AND scope_key = $3 FOR UPDATE`,
      [companyId, type, year],
    );
    await this.db.query(
      `UPDATE sys.number_sequences SET next_value = next_value + 1, updated_at = now() WHERE id = $1`,
      [seq!.id],
    );
    return `${seq!.prefix}${String(seq!.next_value).padStart(seq!.padding || 4, '0')}`;
  }

  private async lastInvoiceHash(companyId: string): Promise<string> {
    const last = await this.db.one<{ zatca_hash: string }>(
      `SELECT zatca_hash FROM sal.invoices WHERE company_id = $1 AND zatca_hash IS NOT NULL ORDER BY zatca_icv DESC LIMIT 1`,
      [companyId],
    );
    return last?.zatca_hash ?? 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjBmZTQ3NDhhNzk3NmU1NQ==';
  }

  async list(companyId: string, q: ListQuery & { type?: string; clientId?: string; projectId?: string; status?: string }): Promise<Page<any>> {
    const where = ['i.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.type) { params.push(q.type); where.push(`i.invoice_type = $${params.length}`); }
    if (q.clientId) { params.push(q.clientId); where.push(`i.client_id = $${params.length}`); }
    if (q.projectId) { params.push(q.projectId); where.push(`i.project_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`i.status = $${params.length}`); }
    const sql = where.join(' AND ');

    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM sal.invoices i WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT i.id, i.invoice_no AS "invoiceNo", i.invoice_type AS "invoiceType",
              i.client_id AS "clientId", c.name_ar AS "clientName", c.vat_number AS "clientVatNumber",
              i.project_id AS "projectId", p.name_ar AS "projectName", p.code AS "projectCode",
              i.issue_date AS "issueDate", i.due_date AS "dueDate", i.currency_code AS "currencyCode",
              i.subtotal::text AS "subtotal", i.vat_amount::text AS "vatAmount",
              i.total_amount::text AS "totalAmount", i.status, i.payment_status AS "paymentStatus",
              i.zatca_status AS "zatcaStatus", i.zatca_compliance_status AS "zatcaComplianceStatus",
              i.zatca_qr_code AS "zatcaQrCode", i.journal_entry_id AS "journalEntryId", i.created_at AS "createdAt"
       FROM sal.invoices i
       JOIN prj.clients c ON c.id = i.client_id
       LEFT JOIN prj.projects p ON p.id = i.project_id
       WHERE ${sql}
       ORDER BY ${orderBy(q.sort, { invoiceNo: 'i.invoice_no', issueDate: 'i.issue_date', total: 'i.total_amount' }, 'i.created_at DESC')}
       LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const inv = await this.db.one(
      `SELECT i.id, i.company_id AS "companyId", i.invoice_no AS "invoiceNo",
              i.invoice_type AS "invoiceType", i.invoice_sub_type AS "invoiceSubType",
              i.client_id AS "clientId", c.name_ar AS "clientName", c.name_en AS "clientNameEn",
              c.vat_number AS "clientVatNumber", c.cr_number AS "clientCrNumber",
              c.street_address AS "clientAddress", c.city AS "clientCity",
              i.project_id AS "projectId", p.name_ar AS "projectName", p.code AS "projectCode",
              i.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              i.issue_date AS "issueDate", i.issue_time AS "issueTime", i.due_date AS "dueDate",
              i.currency_code AS "currencyCode", i.exchange_rate::text AS "exchangeRate",
              i.original_invoice_id AS "originalInvoiceId", orig.invoice_no AS "originalInvoiceNo",
              i.return_reason AS "returnReason",
              i.subtotal::text AS "subtotal", i.discount_amount::text AS "discountAmount",
              i.taxable_amount::text AS "taxableAmount", i.vat_rate::text AS "vatRate",
              i.vat_amount::text AS "vatAmount", i.total_amount::text AS "totalAmount",
              i.subtotal_base::text AS "subtotalBase", i.vat_amount_base::text AS "vatAmountBase",
              i.total_amount_base::text AS "totalAmountBase",
              i.status, i.payment_status AS "paymentStatus", i.paid_amount::text AS "paidAmount",
              i.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo",
              i.notes,
              i.zatca_uuid AS "zatcaUuid", i.zatca_icv AS "zatcaIcv", i.zatca_pih AS "zatcaPih",
              i.zatca_hash AS "zatcaHash", i.zatca_qr_code AS "zatcaQrCode",
              i.zatca_status AS "zatcaStatus", i.zatca_compliance_status AS "zatcaComplianceStatus",
              i.zatca_submitted_at AS "zatcaSubmittedAt",
              co.name_ar AS "sellerName", co.legal_name AS "sellerLegalName", co.tax_number AS "sellerVatNumber",
              co.address AS "sellerAddress", co.commercial_reg AS "sellerCrNumber"
       FROM sal.invoices i
       JOIN core.companies co ON co.id = i.company_id
       JOIN prj.clients c ON c.id = i.client_id
       LEFT JOIN prj.projects p ON p.id = i.project_id
       LEFT JOIN core.fiscal_periods fp ON fp.id = i.fiscal_period_id
       LEFT JOIN sal.invoices orig ON orig.id = i.original_invoice_id
       LEFT JOIN acc.journal_entries je ON je.id = i.journal_entry_id
       WHERE i.company_id = $1 AND i.id = $2`,
      [companyId, id],
    );
    if (!inv) throw new NotFoundError('Invoice', id);

    const lines = await this.db.query(
      `SELECT l.id, l.line_no AS "lineNo", l.revenue_line_id AS "revenueLineId",
              l.employee_id AS "employeeId", e.full_name_ar AS "employeeName", e.code AS "employeeCode",
              l.description, l.quantity::text AS "quantity", l.unit_price::text AS "unitPrice",
              l.discount_pct::text AS "discountPct", l.subtotal::text AS "subtotal",
              l.vat_rate::text AS "vatRate", l.vat_amount::text AS "vatAmount",
              l.total::text AS "total", l.vat_category AS "vatCategory",
              l.vat_exemption_reason AS "vatExemptionReason",
              rl.pricing_basis AS "pricingBasis", rl.units::text AS "units",
              COALESCE(pos.title_ar, a.role_title, 'تطوير وهندسة برمجيات') AS "positionTitle"
       FROM sal.invoice_lines l
       LEFT JOIN hr.employees e ON e.id = l.employee_id
       LEFT JOIN rev.revenue_lines rl ON rl.id = l.revenue_line_id
       LEFT JOIN prj.assignments a ON a.id = rl.assignment_id
       LEFT JOIN LATERAL (
         SELECT position_id FROM hr.employee_job_assignments ja
         WHERE ja.company_id = e.company_id AND ja.employee_id = e.id
         ORDER BY ja.effective_from DESC LIMIT 1
       ) cur_ja ON true
       LEFT JOIN hr.positions pos ON pos.id = cur_ja.position_id
       WHERE l.invoice_id = $1
       ORDER BY l.line_no ASC`,
      [id],
    );

    const bank = await this.db.one<{ bankName: string; accountNo: string; iban: string; currencyCode: string }>(
      `SELECT bank_name AS "bankName", account_number AS "accountNo", iban, currency_code AS "currencyCode"
       FROM acc.bank_accounts
       WHERE company_id = $1 AND kind = 'BANK' AND is_active
       ORDER BY created_at ASC LIMIT 1`,
      [companyId],
    );

    return { ...inv, lines, bank };
  }

  async create(companyId: string, body: z.infer<typeof InvoiceCreate>) {
    return this.db.tx(async () => {
      const company = await this.db.one<{ name_ar: string; legal_name: string; tax_number: string }>(
        'SELECT name_ar, legal_name, tax_number FROM core.companies WHERE id = $1',
        [companyId],
      );

      const client = await this.db.one<{ name_ar: string; vat_number: string }>(
        'SELECT name_ar, vat_number FROM prj.clients WHERE id = $1 AND company_id = $2',
        [body.clientId, companyId],
      );
      if (!client) throw new NotFoundError('Client', body.clientId);

      const invoiceNo = await this.nextInvoiceNo(companyId, body.invoiceType);
      const pih = await this.lastInvoiceHash(companyId);
      const rate = D(body.exchangeRate);

      // Line computations
      let subtotal = D(0);
      let vatTotal = D(0);
      const processedLines = body.lines.map((l, idx) => {
        const qty = D(l.quantity);
        const price = D(l.unitPrice);
        const disc = D(l.discountPct).div(100);
        const lineGross = qty.times(price);
        const lineDiscount = lineGross.times(disc);
        const lineSubtotal = lineGross.minus(lineDiscount);
        const lineVatRate = D(l.vatRate).div(100);
        const lineVat = lineSubtotal.times(lineVatRate);
        const lineTotal = lineSubtotal.plus(lineVat);

        subtotal = subtotal.plus(lineSubtotal);
        vatTotal = vatTotal.plus(lineVat);

        return {
          ...l,
          lineNo: idx + 1,
          quantity: qty.toFixed(4),
          unitPrice: price.toFixed(4),
          subtotal: lineSubtotal.toFixed(4),
          vatRate: D(l.vatRate).toFixed(2),
          vatAmount: lineVat.toFixed(4),
          total: lineTotal.toFixed(4),
        };
      });

      const totalAmount = subtotal.plus(vatTotal);
      const subtotalBase = subtotal.times(rate);
      const vatAmountBase = vatTotal.times(rate);
      const totalAmountBase = totalAmount.times(rate);

      // Generate ZATCA metadata
      const issueTime = new Date().toISOString();
      const zatcaUuid = crypto.randomUUID();
      const qrCode = generateZatcaTlv({
        sellerName: company?.legal_name || company?.name_ar || 'IDHAM ERP',
        vatNumber: company?.tax_number || '300000000000003',
        issueDateTime: issueTime,
        totalAmountWithVat: totalAmount.toFixed(2),
        vatTotal: vatTotal.toFixed(2),
      });

      const zatcaHash = computeInvoiceHash({
        uuid: zatcaUuid,
        invoiceNo,
        issueDateTime: issueTime,
        clientVatNumber: client.vat_number,
        totalAmount: totalAmount.toFixed(2),
        vatAmount: vatTotal.toFixed(2),
        previousInvoiceHash: pih,
      });

      const compliance = validateZatcaCompliance({
        sellerVatNumber: company?.tax_number,
        sellerName: company?.name_ar,
        invoiceType: body.invoiceType,
        clientName: client.name_ar,
        clientVatNumber: client.vat_number,
        subtotal: subtotal.toNumber(),
        vatAmount: vatTotal.toNumber(),
        totalAmount: totalAmount.toNumber(),
        qrCode,
      });

      const inv = await this.db.one<{ id: string }>(
        `INSERT INTO sal.invoices
           (company_id, invoice_no, invoice_type, invoice_sub_type, client_id, project_id,
            fiscal_period_id, issue_date, issue_time, due_date, currency_code, exchange_rate,
            original_invoice_id, return_reason, subtotal, discount_amount, taxable_amount,
            vat_rate, vat_amount, total_amount, subtotal_base, vat_amount_base, total_amount_base,
            status, payment_status, notes, zatca_uuid, zatca_pih, zatca_hash, zatca_qr_code,
            zatca_status, zatca_compliance_status, created_by, updated_by)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$15,15.00,$16,$17,$18,$19,$20,
            'DRAFT','UNPAID',$21,$22,$23,$24,$25,'NOT_SUBMITTED',$26,sys.current_user_id(),sys.current_user_id())
         RETURNING id`,
        [
          companyId, invoiceNo, body.invoiceType, body.invoiceSubType, body.clientId, body.projectId ?? null,
          body.fiscalPeriodId, body.issueDate, issueTime, body.dueDate ?? null, body.currencyCode, rate.toFixed(10),
          body.originalInvoiceId ?? null, body.returnReason ?? null,
          subtotal.toFixed(4), vatTotal.toFixed(4), totalAmount.toFixed(4),
          subtotalBase.toFixed(4), vatAmountBase.toFixed(4), totalAmountBase.toFixed(4),
          body.notes ?? null, zatcaUuid, pih, zatcaHash, qrCode,
          compliance.passed ? 'PASS' : 'WARNING',
        ],
      );

      for (const l of processedLines) {
        await this.db.query(
          `INSERT INTO sal.invoice_lines
             (invoice_id, line_no, revenue_line_id, employee_id, description, quantity,
              unit_price, discount_pct, subtotal, vat_rate, vat_amount, total, vat_category, vat_exemption_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            inv!.id, l.lineNo, l.revenueLineId ?? null, l.employeeId ?? null, l.description,
            l.quantity, l.unitPrice, l.discountPct, l.subtotal, l.vatRate, l.vatAmount, l.total,
            l.vatCategory, l.vatExemptionReason ?? null,
          ],
        );
      }

      return this.get(companyId, inv!.id);
    });
  }

  /**
   * Automates invoice generation directly from project assignments and service prices.
   */
  async generateFromRevenue(companyId: string, body: z.infer<typeof AutoInvoiceFromRevenue>) {
    return this.db.tx(async () => {
      // Find all posted revenue lines for this period not yet invoiced
      const lines = await this.db.query<{
        id: string; project_id: string; employee_id: string; client_id: string;
        pricing_basis: string; unit_price: string; currency_code: string; units: string;
        gross_revenue: string; employee_code: string; employee_name: string;
        project_name: string; project_code: string; role_title: string;
      }>(
        `SELECT rl.id, rl.project_id, rl.employee_id, p.client_id,
                rl.pricing_basis, rl.unit_price::text, rl.currency_code, rl.units::text,
                rl.gross_revenue::text, e.code AS employee_code, e.full_name_ar AS employee_name,
                p.name_ar AS project_name, p.code AS project_code,
                COALESCE(pos.title_ar, a.role_title, 'هندسة وبرمجة النظم') AS role_title
         FROM rev.revenue_lines rl
         JOIN prj.projects p ON p.id = rl.project_id
         JOIN hr.employees e ON e.id = rl.employee_id
         LEFT JOIN prj.assignments a ON a.id = rl.assignment_id
         LEFT JOIN LATERAL (
           SELECT position_id FROM hr.employee_job_assignments ja
           WHERE ja.company_id = e.company_id AND ja.employee_id = e.id
           ORDER BY ja.effective_from DESC LIMIT 1
         ) cur_ja ON true
         LEFT JOIN hr.positions pos ON pos.id = cur_ja.position_id
         WHERE rl.company_id = $1 AND rl.fiscal_period_id = $2 AND rl.status = 'POSTED'
           AND ($3::uuid IS NULL OR rl.project_id = $3::uuid)
           AND NOT EXISTS (SELECT 1 FROM sal.invoice_lines il WHERE il.revenue_line_id = rl.id)`,
        [companyId, body.fiscalPeriodId, body.projectId ?? null],
      );

      if (lines.length === 0) {
        throw new DomainError('NO_UNINVOICED_LINES', 'لا توجد أسطر إيرادات مشاريع غير مفوترة في هذه الفترة');
      }

      // Group by client and project
      const groups = new Map<string, typeof lines>();
      for (const line of lines) {
        const key = `${line.client_id}::${line.project_id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(line);
      }

      const period = await this.fiscal.getPeriod(companyId, body.fiscalPeriodId);
      const issueDate = body.issueDate || period.endDate;
      const createdInvoices = [];

      for (const [key, groupLines] of groups.entries()) {
        const [clientId, projectId] = key.split('::');
        const first = groupLines[0];

        const invoiceLines = groupLines.map((l) => {
          const basisLabel = l.pricing_basis === 'MONTHLY' ? 'تفرغ وتطوير برمجي شهري' : l.pricing_basis === 'DAILY' ? 'أيام عمل برمجية واستشارية' : 'ساعات عمل هندسة وتطوير';
          const role = l.role_title || 'هندسة وتطوير النظم';
          return {
            revenueLineId: l.id,
            employeeId: l.employee_id,
            description: `خدمات برمجية: ${role} | المبرمج: ${l.employee_name} (${l.employee_code}) - مشروع ${l.project_name} [${basisLabel}: ${Number(l.units).toFixed(2)}]`,
            quantity: l.units,
            unitPrice: l.unit_price,
            discountPct: '0',
            vatRate: '15.00',
            vatCategory: 'S' as const,
          };
        });

        let inv = await this.create(companyId, {
          invoiceType: 'TAX_INVOICE',
          invoiceSubType: 'STANDARD',
          clientId,
          projectId,
          fiscalPeriodId: body.fiscalPeriodId,
          issueDate,
          currencyCode: first.currency_code,
          exchangeRate: '1',
          lines: invoiceLines,
          notes: `فاتورة استشارات وإسناد كوادر برمجية مستحقة عن الفترة ${body.fiscalPeriodId}`,
        });

        if (body.autoPost) {
          inv = await this.post(companyId, inv.id);
        }

        createdInvoices.push(inv);
      }

      const totalAmount = createdInvoices.reduce((acc, inv) => acc.add(inv.totalAmount), D(0)).toFixed(4);
      return {
        count: createdInvoices.length,
        totalAmount,
        invoices: createdInvoices,
      };
    });
  }

  async post(companyId: string, id: string) {
    return this.postInternal(companyId, id, false);
  }

  /**
   * Regenerates the missing journal entry of an invoice that was marked POSTED
   * without one (it was posted while no SAL.* posting rule existed).
   */
  async repairJournal(companyId: string, id: string) {
    return this.postInternal(companyId, id, true);
  }

  private async postInternal(companyId: string, id: string, repair: boolean) {
    return this.db.tx(async () => {
      const inv = await this.get(companyId, id);
      if (repair) {
        if (inv.status !== 'POSTED' || inv.journalEntryId) {
          throw new DomainError('INVOICE_JOURNAL_NOT_MISSING', 'هذه الفاتورة لا تحتاج إلى إعادة توليد قيد');
        }
      } else if (inv.status !== 'DRAFT') {
        throw new DomainError('INVOICE_NOT_DRAFT', 'الفاتورة ليست في حالة مسودة');
      }

      const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';
      const eventCode = isCreditNote ? 'SAL.CREDIT_NOTE' : 'SAL.INVOICE';

      // Accounting entries:
      // SAL.INVOICE:     Debit A/R (total), Credit Revenue (subtotal), Credit VAT (vat)
      // SAL.CREDIT_NOTE: Debit Revenue/Returns (subtotal), Debit VAT (vat), Credit A/R (total)
      const items: PostingItem[] = [
        {
          key: 'total',
          amount: inv.totalAmountBase,
          dims: { clientId: inv.clientId, projectId: inv.projectId ?? undefined },
          refs: { clientId: inv.clientId },
          description: `${isCreditNote ? 'إشعار دائن' : 'فاتورة مبيعات'} ${inv.invoiceNo} - عميل: ${inv.clientName}`,
        },
        {
          key: 'subtotal',
          amount: inv.subtotalBase,
          dims: { clientId: inv.clientId, projectId: inv.projectId ?? undefined },
          description: `إيرادات خدمات تعاقدية - ${inv.invoiceNo}`,
        },
      ];

      if (!D(inv.vatAmountBase).isZero()) {
        items.push({
          key: 'vat',
          amount: inv.vatAmountBase,
          dims: { clientId: inv.clientId },
          description: `ضريبة القيمة المضافة المستحقة (15%) - ${inv.invoiceNo}`,
        });
      }

      let entryId: string | null = null;
      try {
        entryId = await this.posting.post(companyId, {
          eventCode,
          entryDate: inv.issueDate,
          fiscalPeriodId: inv.fiscalPeriodId,
          journalType: 'REVENUE',
          description: `${isCreditNote ? 'إشعار دائن' : 'فاتورة مبيعات'} - ${inv.invoiceNo} (${inv.clientName})`,
          reference: inv.invoiceNo,
          sourceModule: 'sales',
          sourceType: isCreditNote ? 'CREDIT_NOTE' : 'SALES_INVOICE',
          sourceId: inv.id,
          currencyCode: inv.currencyCode,
          exchangeRate: inv.exchangeRate,
          items,
        });
      } catch (err: any) {
        // An invoice must never post silently without its journal entry: that left revenue and
        // VAT payable out of the ledger. Fail loudly so the missing rule gets configured.
        if (err.code === 'POSTING_RULE_MISSING') {
          throw new DomainError(
            'POSTING_RULE_MISSING',
            `لا توجد قاعدة ترحيل نشطة للحدث ${eventCode}. أضفها من المحاسبة العامة ← قواعد الترحيل قبل ترحيل الفاتورة`,
          );
        }
        throw err;
      }

      await this.db.query(
        `UPDATE sal.invoices
            SET status = 'POSTED', journal_entry_id = $2,
                updated_at = now(), updated_by = sys.current_user_id()
          WHERE id = $1`,
        [id, entryId],
      );

      return this.get(companyId, id);
    });
  }

  async createCreditNote(companyId: string, body: z.infer<typeof CreditNoteCreate>) {
    return this.db.tx(async () => {
      const original = await this.get(companyId, body.originalInvoiceId);
      if (original.status !== 'POSTED') {
        throw new DomainError('ORIGINAL_NOT_POSTED', 'يمكن إصدار إشعار دائن للفواتير المرحّلة فقط');
      }

      const returnLines = body.lines && body.lines.length > 0 ? body.lines : original.lines.map((l: any) => ({
        revenueLineId: l.revenueLineId,
        employeeId: l.employeeId,
        description: `مردود/تخفيض: ${l.description}`,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        vatRate: l.vatRate,
        vatCategory: l.vatCategory,
      }));

      const crn = await this.create(companyId, {
        invoiceType: 'CREDIT_NOTE',
        invoiceSubType: 'STANDARD',
        clientId: original.clientId,
        projectId: original.projectId,
        fiscalPeriodId: original.fiscalPeriodId,
        issueDate: body.issueDate || original.issueDate,
        currencyCode: original.currencyCode,
        exchangeRate: original.exchangeRate,
        originalInvoiceId: original.id,
        returnReason: body.returnReason,
        notes: body.notes ?? `إشعار دائن مرتبط بالفاتورة ${original.invoiceNo} - سبب: ${body.returnReason}`,
        lines: returnLines,
      });

      return crn;
    });
  }

  async cancel(companyId: string, id: string, reason: string) {
    return this.db.tx(async () => {
      const inv = await this.get(companyId, id);
      if (inv.status !== 'POSTED') {
        throw new DomainError('NOT_POSTED', 'يمكن إلغاء الفواتير المرحّلة فقط');
      }

      if (inv.journalEntryId) {
        await this.journal.reverse(
          companyId,
          inv.journalEntryId,
          `إلغاء الفاتورة ${inv.invoiceNo}: ${reason}`,
          new Date().toISOString().slice(0, 10),
        );
      }

      await this.db.query(
        `UPDATE sal.invoices
            SET status = 'CANCELLED', notes = COALESCE(notes || ' | ', '') || $2,
                updated_at = now(), updated_by = sys.current_user_id()
          WHERE id = $1`,
        [id, `سبب الإلغاء: ${reason}`],
      );

      return this.get(companyId, id);
    });
  }
}
