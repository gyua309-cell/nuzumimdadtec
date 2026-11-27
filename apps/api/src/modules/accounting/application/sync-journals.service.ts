import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { D } from '../../../shared/money';
import { JournalLineInput } from '../domain/journal';
import { JournalService } from './journal.service';
import { PostingEngine, PostingItem } from './posting-engine';

@Injectable()
export class SyncJournalsService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
    private readonly posting: PostingEngine,
  ) {}

  async syncAllOperationalJournals(companyId: string) {
    const repairedItems: Array<{ module: string; ref: string; journalEntryNo: string; amount: string }> = [];

    // 1. Posted Sales Invoices / Credit Notes / Debit Notes missing valid POSTED journal entry
    const unlinkedSales = await this.db.query<{
      id: string; invoice_no: string; invoice_type: string; client_id: string; project_id: string | null;
      fiscal_period_id: string; issue_date: string; currency_code: string; exchange_rate: string;
      subtotal_base: string; vat_amount_base: string; total_amount_base: string; client_name: string;
    }>(
      `SELECT i.id, i.invoice_no, i.invoice_type, i.client_id, i.project_id, i.fiscal_period_id,
              i.issue_date::text, i.currency_code, i.exchange_rate::text,
              i.subtotal_base::text, i.vat_amount_base::text, i.total_amount_base::text, c.name_ar AS client_name
         FROM sal.invoices i
         JOIN prj.clients c ON c.id = i.client_id
         LEFT JOIN acc.journal_entries je ON je.id = i.journal_entry_id AND je.status = 'POSTED'
        WHERE i.company_id = $1 AND i.status = 'POSTED' AND je.id IS NULL`,
      [companyId],
    );

    for (const inv of unlinkedSales) {
      try {
        const isCreditNote = inv.invoice_type === 'CREDIT_NOTE';
        const isDebitNote = inv.invoice_type === 'DEBIT_NOTE';
        const eventCode = isCreditNote ? 'SAL.CREDIT_NOTE' : isDebitNote ? 'SAL.DEBIT_NOTE' : 'SAL.INVOICE';
        const docLabel = isCreditNote ? 'إشعار دائن' : isDebitNote ? 'إشعار مدين' : 'فاتورة مبيعات';

        const items: PostingItem[] = [
          {
            key: 'total',
            amount: inv.total_amount_base,
            dims: { clientId: inv.client_id, projectId: inv.project_id ?? undefined },
            refs: { clientId: inv.client_id },
            description: `${docLabel} ${inv.invoice_no} - عميل: ${inv.client_name}`,
          },
          {
            key: 'subtotal',
            amount: inv.subtotal_base,
            dims: { clientId: inv.client_id, projectId: inv.project_id ?? undefined },
            description: `${isDebitNote ? 'إضافات/فروقات إيرادات' : 'إيرادات خدمات تعاقدية'} - ${inv.invoice_no}`,
          },
        ];
        if (!D(inv.vat_amount_base).isZero()) {
          items.push({
            key: 'vat',
            amount: inv.vat_amount_base,
            dims: { clientId: inv.client_id },
            description: `ضريبة القيمة المضافة المستحقة (15%) - ${inv.invoice_no}`,
          });
        }

        const payload = {
          eventCode,
          entryDate: inv.issue_date,
          fiscalPeriodId: inv.fiscal_period_id,
          journalType: 'REVENUE' as const,
          description: `${docLabel} - ${inv.invoice_no} (${inv.client_name})`,
          reference: inv.invoice_no,
          sourceModule: 'sales',
          sourceType: isCreditNote ? 'CREDIT_NOTE' : isDebitNote ? 'DEBIT_NOTE' : 'SALES_INVOICE',
          sourceId: inv.id,
          currencyCode: inv.currency_code,
          exchangeRate: inv.exchange_rate,
          items,
        };

        let entryId: string;
        try {
          entryId = await this.posting.post(companyId, payload);
        } catch (err: any) {
          if (err?.code === 'POSTING_RULE_MISSING' && isDebitNote) {
            entryId = await this.posting.post(companyId, { ...payload, eventCode: 'SAL.INVOICE' });
          } else {
            throw err;
          }
        }

        await this.db.query(`UPDATE sal.invoices SET journal_entry_id = $2, updated_at = now() WHERE id = $1`, [inv.id, entryId]);
        const je = await this.db.one<{ entry_no: string }>('SELECT entry_no FROM acc.journal_entries WHERE id = $1', [entryId]);
        repairedItems.push({ module: 'المبيعات والفوترة', ref: inv.invoice_no, journalEntryNo: je?.entry_no ?? '', amount: inv.total_amount_base });
      } catch {
        // Skip items whose period is closed or posting rules aren't configured yet
      }
    }

    // 2. Posted Purchase Bills missing valid POSTED journal entry
    const unlinkedPurchases = await this.db.query<{
      id: string; invoice_no: string; invoice_type: string; vendor_id: string; project_id: string | null;
      fiscal_period_id: string; issue_date: string; currency_code: string; vat_amount: string; total_amount: string;
      vendor_name: string; payable_account_id: string | null;
    }>(
      `SELECT p.id, p.invoice_no, p.invoice_type, p.vendor_id, p.project_id, p.fiscal_period_id,
              p.issue_date::text, p.currency_code, p.vat_amount::text, p.total_amount::text,
              v.name_ar AS vendor_name, v.payable_account_id
         FROM pur.purchase_invoices p
         JOIN pur.vendors v ON v.id = p.vendor_id
         LEFT JOIN acc.journal_entries je ON je.id = p.journal_entry_id AND je.status = 'POSTED'
        WHERE p.company_id = $1 AND p.status = 'POSTED' AND je.id IS NULL`,
      [companyId],
    );

    for (const bill of unlinkedPurchases) {
      try {
        const isDebitNote = bill.invoice_type === 'DEBIT_NOTE';
        const lines = await this.db.query<{
          description: string; expense_account_id: string; project_id: string | null; cost_center_id: string | null; subtotal: string;
        }>(
          `SELECT description, expense_account_id, project_id, cost_center_id, subtotal::text
             FROM pur.purchase_invoice_lines WHERE purchase_invoice_id = $1 ORDER BY line_no`,
          [bill.id],
        );

        let apAccountId = bill.payable_account_id;
        if (!apAccountId) {
          const ap = await this.db.one<{ id: string }>(
            `SELECT id FROM acc.accounts WHERE company_id = $1 AND (code = '2300' OR subtype = 'PAYABLE') AND is_posting AND is_active LIMIT 1`,
            [companyId],
          );
          apAccountId = ap?.id ?? null;
        }
        if (!apAccountId || lines.length === 0) continue;

        let vatAccountId: string | null = null;
        if (!D(bill.vat_amount).isZero()) {
          const vat = await this.db.one<{ id: string }>(
            `SELECT id FROM acc.accounts WHERE company_id = $1 AND (code = '1250' OR (subtype = 'TAX' AND normal_balance = 'DEBIT')) AND is_posting AND is_active LIMIT 1`,
            [companyId],
          );
          vatAccountId = vat?.id ?? null;
          if (!vatAccountId) continue;
        }

        const jeLines: JournalLineInput[] = [];
        if (!isDebitNote) {
          for (const l of lines) {
            jeLines.push({ accountId: l.expense_account_id, debit: l.subtotal, projectId: l.project_id ?? bill.project_id ?? undefined, costCenterId: l.cost_center_id ?? undefined, supplierId: bill.vendor_id, description: `${l.description} - ${bill.invoice_no}` });
          }
          if (vatAccountId && !D(bill.vat_amount).isZero()) {
            jeLines.push({ accountId: vatAccountId, debit: bill.vat_amount, supplierId: bill.vendor_id, description: `ضريبة المدخلات - ${bill.invoice_no}` });
          }
          jeLines.push({ accountId: apAccountId, credit: bill.total_amount, supplierId: bill.vendor_id, projectId: bill.project_id ?? undefined, description: `استحقاق مورد - ${bill.invoice_no}` });
        } else {
          jeLines.push({ accountId: apAccountId, debit: bill.total_amount, supplierId: bill.vendor_id, projectId: bill.project_id ?? undefined, description: `إشعار مدين مشتريات - ${bill.invoice_no}` });
          for (const l of lines) {
            jeLines.push({ accountId: l.expense_account_id, credit: l.subtotal, projectId: l.project_id ?? bill.project_id ?? undefined, costCenterId: l.cost_center_id ?? undefined, supplierId: bill.vendor_id, description: `مردود: ${l.description}` });
          }
          if (vatAccountId && !D(bill.vat_amount).isZero()) {
            jeLines.push({ accountId: vatAccountId, credit: bill.vat_amount, supplierId: bill.vendor_id, description: `عكس ضريبة مدخلات - ${bill.invoice_no}` });
          }
        }

        const entryId = await this.journal.createAndPost(companyId, {
          entryDate: bill.issue_date,
          fiscalPeriodId: bill.fiscal_period_id,
          journalType: 'EXPENSE',
          sourceModule: 'purchases',
          sourceType: isDebitNote ? 'DEBIT_NOTE' : 'PURCHASE_BILL',
          sourceId: bill.id,
          reference: bill.invoice_no,
          currencyCode: bill.currency_code,
          description: `${isDebitNote ? 'إشعار مدين مشتريات' : 'فاتورة مشتريات مورد'} - ${bill.invoice_no} (${bill.vendor_name})`,
          lines: jeLines,
        });
        await this.db.query(`UPDATE pur.purchase_invoices SET journal_entry_id = $2, updated_at = now() WHERE id = $1`, [bill.id, entryId]);
        const je = await this.db.one<{ entry_no: string }>('SELECT entry_no FROM acc.journal_entries WHERE id = $1', [entryId]);
        repairedItems.push({ module: 'المشتريات والموردين', ref: bill.invoice_no, journalEntryNo: je?.entry_no ?? '', amount: bill.total_amount });
      } catch {
        // Skip bills in closed periods
      }
    }

    const totalPosted = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM acc.journal_entries WHERE company_id = $1 AND status = 'POSTED'`,
      [companyId],
    );

    return {
      syncedCount: repairedItems.length,
      repairedCount: repairedItems.length,
      repairedItems,
      totalPostedJournals: Number(totalPosted?.n ?? 0),
    };
  }
}
