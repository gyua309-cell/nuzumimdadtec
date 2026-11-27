import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { JournalService } from '../../accounting/application/journal.service';
import { JournalLineInput } from '../../accounting/domain/journal';

export const VatSettleInput = z.object({
  periodId: z.string().uuid().optional(),
  fiscalPeriodId: z.string().uuid().optional(),
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payNow: z.boolean().default(true),
  bankAccountId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
});

@Injectable()
export class VatSettlementService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
  ) {}

  async listSettlements(companyId: string) {
    return this.db.query(
      `SELECT vs.id, vs.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              vs.settlement_date::text AS "settlementDate",
              vs.output_vat::float8 AS "outputVat", vs.input_vat::float8 AS "inputVat",
              vs.net_vat::float8 AS "netVat", vs.pay_now AS "payNow", vs.status,
              vs.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo",
              vs.notes, vs.created_at AS "createdAt"
         FROM acc.vat_settlements vs
         JOIN core.fiscal_periods fp ON fp.id = vs.fiscal_period_id
         LEFT JOIN acc.journal_entries je ON je.id = vs.journal_entry_id
        WHERE vs.company_id = $1
        ORDER BY vs.settlement_date DESC, vs.created_at DESC`,
      [companyId],
    );
  }

  private async findTaxAccount(companyId: string, codes: string[], normalBalance: 'DEBIT' | 'CREDIT') {
    for (const c of codes) {
      const acc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = $2 AND is_posting AND is_active`,
        [companyId, c],
      );
      if (acc) return acc.id;
    }
    const fallback = await this.db.one<{ id: string }>(
      `SELECT id FROM acc.accounts
        WHERE company_id = $1 AND subtype = 'TAX' AND normal_balance = $2 AND is_posting AND is_active
        ORDER BY code ASC LIMIT 1`,
      [companyId, normalBalance],
    );
    return fallback?.id ?? null;
  }

  async settlePeriod(companyId: string, input: z.infer<typeof VatSettleInput>) {
    const periodId = input.periodId || input.fiscalPeriodId;
    if (!periodId) throw new DomainError('PERIOD_REQUIRED', 'يرجى تحديد الفترة المالية المطلوب تسوية ضريبتها');

    return this.db.tx(async () => {
      const period = await this.db.one<{ id: string; name: string; end_date: string; status: string }>(
        `SELECT id, name, end_date::text, status FROM core.fiscal_periods WHERE company_id = $1 AND id = $2`,
        [companyId, periodId],
      );
      if (!period) throw new NotFoundError('FiscalPeriod', periodId);

      const existing = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.vat_settlements WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'`,
        [companyId, periodId],
      );
      if (existing) {
        throw new DomainError('VAT_ALREADY_SETTLED', 'تم ترحيل تسوية ضريبة القيمة المضافة لهذه الفترة مسبقاً', 409);
      }

      const outRow = await this.db.one<{ amt: string }>(
        `SELECT COALESCE(SUM(
                  CASE WHEN invoice_type IN ('CREDIT_NOTE','DEBIT_NOTE') THEN -vat_amount_base ELSE vat_amount_base END
                ), 0)::text AS amt
           FROM sal.invoices
          WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'`,
        [companyId, periodId],
      );
      const inRow = await this.db.one<{ amt: string }>(
        `SELECT COALESCE(SUM(
                  CASE WHEN invoice_type = 'DEBIT_NOTE' THEN -vat_amount_base ELSE vat_amount_base END
                ), 0)::text AS amt
           FROM pur.purchase_invoices
          WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'`,
        [companyId, periodId],
      );

      const outVat = D(outRow?.amt ?? 0);
      const inVat = D(inRow?.amt ?? 0);
      const netVat = outVat.minus(inVat);
      if (outVat.lte(0) && inVat.lte(0)) {
        throw new DomainError('VAT_NO_ACTIVITY', 'لا توجد ضريبة مخرجات أو مدخلات مسجلة لهذه الفترة');
      }

      const outVatAcc = await this.findTaxAccount(companyId, ['2400', '20201'], 'CREDIT');
      const inVatAcc = await this.findTaxAccount(companyId, ['1250', '12501'], 'DEBIT');
      if (!outVatAcc && outVat.gt(0)) throw new DomainError('OUTPUT_VAT_ACCOUNT_MISSING', 'حساب ضريبة المخرجات غير موجود');
      if (!inVatAcc && inVat.gt(0)) throw new DomainError('INPUT_VAT_ACCOUNT_MISSING', 'حساب ضريبة المدخلات (1250) غير موجود');

      const entryDate = input.settlementDate || period.end_date;
      const lines: JournalLineInput[] = [];
      if (outVat.gt(0) && outVatAcc) {
        lines.push({ accountId: outVatAcc, debit: outVat.toFixed(2), description: `إقفال ضريبة المخرجات — ${period.name}` });
      }
      if (inVat.gt(0) && inVatAcc) {
        lines.push({ accountId: inVatAcc, credit: inVat.toFixed(2), description: `إقفال ضريبة المدخلات — ${period.name}` });
      }

      if (!netVat.isZero()) {
        if (netVat.gt(0)) {
          let creditAccId: string | undefined;
          if (input.payNow) {
            if (input.bankAccountId) {
              const b = await this.db.one<{ gl_account_id: string }>(
                'SELECT gl_account_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2',
                [companyId, input.bankAccountId],
              );
              creditAccId = b?.gl_account_id;
            }
            if (!creditAccId) {
              const b = await this.db.one<{ gl_account_id: string }>(
                'SELECT gl_account_id FROM acc.bank_accounts WHERE company_id = $1 AND is_active ORDER BY code ASC LIMIT 1',
                [companyId],
              );
              creditAccId = b?.gl_account_id;
            }
            if (!creditAccId) {
              const acc = await this.db.one<{ id: string }>(
                `SELECT id FROM acc.accounts WHERE company_id = $1 AND (code IN ('10201','1110','1120') OR subtype IN ('BANK','CASH')) AND is_posting AND is_active ORDER BY code ASC LIMIT 1`,
                [companyId],
              );
              creditAccId = acc?.id;
            }
          } else {
            creditAccId = outVatAcc ?? undefined;
          }
          if (!creditAccId) throw new DomainError('BANK_ACCOUNT_MISSING', 'لم يتم العثور على حساب بنكي لسداد الضريبة');
          lines.push({
            accountId: creditAccId,
            credit: netVat.toFixed(2),
            description: input.payNow ? `سداد صافي ضريبة القيمة المضافة لهيئة الزكاة — ${period.name}` : `صافي الضريبة المستحقة — ${period.name}`,
          });
        } else {
          // Excess input VAT credit carried forward / receivable
          const receivableTaxAcc = inVatAcc || outVatAcc!;
          lines.push({
            accountId: receivableTaxAcc,
            debit: netVat.abs().toFixed(2),
            description: `رصيد ضريبة مدخلات مرحّل لصالح المنشأة — ${period.name}`,
          });
        }
      }

      const refNo = `VAT-${period.end_date.slice(0, 7)}`;
      const entryId = await this.journal.createAndPost(companyId, {
        entryDate,
        fiscalPeriodId: periodId,
        journalType: 'GENERAL',
        sourceModule: 'tax',
        sourceType: 'VAT_SETTLEMENT',
        reference: refNo,
        description: `تسوية إقرار ضريبة القيمة المضافة — ${period.name}`,
        lines,
      });

      const inserted = await this.db.one<{ id: string }>(
        `INSERT INTO acc.vat_settlements (
           company_id, fiscal_period_id, settlement_date, output_vat, input_vat, net_vat,
           pay_now, status, bank_account_id, journal_entry_id, notes, created_by
         ) VALUES ($1,$2,$3::date,$4,$5,$6,$7,'POSTED',$8,$9,$10,sys.current_user_id())
         RETURNING id`,
        [
          companyId, periodId, entryDate,
          outVat.toFixed(4), inVat.toFixed(4), netVat.toFixed(4),
          input.payNow, input.bankAccountId ?? null, entryId, input.notes ?? null,
        ],
      );

      const je = await this.db.one<{ entry_no: string }>('SELECT entry_no FROM acc.journal_entries WHERE id = $1', [entryId]);
      return {
        id: inserted!.id,
        fiscalPeriodId: periodId,
        periodName: period.name,
        settlementDate: entryDate,
        outputVat: Number(outVat.toFixed(2)),
        inputVat: Number(inVat.toFixed(2)),
        netVat: Number(netVat.toFixed(2)),
        journalEntryId: entryId,
        journalEntryNo: je?.entry_no ?? '',
        status: 'POSTED',
      };
    });
  }
}
