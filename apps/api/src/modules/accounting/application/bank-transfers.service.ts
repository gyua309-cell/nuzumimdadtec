import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';
import { JournalLineInput } from '../domain/journal';
import { JournalService } from './journal.service';

export const BankTransferCreate = z.object({
  sourceBankId: z.string().uuid(),
  targetBankId: z.string().uuid(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceCurrency: z.string().trim().length(3).toUpperCase().optional(),
  sourceAmount: z.coerce.number().positive(),
  targetCurrency: z.string().trim().length(3).toUpperCase().optional(),
  targetAmount: z.coerce.number().positive().optional(),
  exchangeRate: z.coerce.number().positive().optional(),
  bankFee: z.coerce.number().min(0).default(0),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

@Injectable()
export class BankTransfersService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
    private readonly fx: ExchangeRateService,
  ) {}

  async list(companyId: string) {
    return this.db.query(
      `SELECT t.id, t.transfer_date::text AS "transferDate",
              t.source_bank_id AS "sourceBankId", sb.name AS "sourceBankName",
              t.source_currency AS "sourceCurrency", t.source_amount::float8 AS "sourceAmount",
              t.target_bank_id AS "targetBankId", tb.name AS "targetBankName",
              t.target_currency AS "targetCurrency", t.target_amount::float8 AS "targetAmount",
              t.exchange_rate::float8 AS "exchangeRate", t.bank_fee::float8 AS "bankFee",
              t.reference, t.notes, t.status, t.cancel_reason AS "cancelReason",
              t.journal_entry_id AS "journalEntryId", je.entry_no AS "journalEntryNo",
              t.reversal_journal_entry_id AS "reversalJournalEntryId",
              t.created_at AS "createdAt"
         FROM acc.bank_transfers t
         JOIN acc.bank_accounts sb ON sb.id = t.source_bank_id
         JOIN acc.bank_accounts tb ON tb.id = t.target_bank_id
         LEFT JOIN acc.journal_entries je ON je.id = t.journal_entry_id
        WHERE t.company_id = $1
        ORDER BY t.transfer_date DESC, t.created_at DESC
        LIMIT 200`,
      [companyId],
    );
  }

  async cancel(companyId: string, id: string, reason: string) {
    return this.db.tx(async () => {
      const t = await this.db.one<any>(`SELECT * FROM acc.bank_transfers WHERE company_id = $1 AND id = $2 FOR UPDATE`, [companyId, id]);
      if (!t) throw new NotFoundError('BankTransfer', id);
      if (t.status === 'CANCELLED') return t;
      let revId: string | null = null;
      if (t.journal_entry_id) {
        revId = await this.journal.reverse(
          companyId,
          t.journal_entry_id,
          reason || `إلغاء تحويل بنكي (${t.reference || id})`,
          undefined,
          { allowSourceSync: true },
        );
      }
      await this.db.query(
        `UPDATE acc.bank_transfers SET status = 'CANCELLED', reversal_journal_entry_id = $2, cancel_reason = $3 WHERE company_id = $1 AND id = $4`,
        [companyId, revId, reason || 'إلغاء التحويل البنكي', id],
      );
      await this.db.query(`SELECT audit.log_action('acc','bank_transfers',$1,'CANCEL',$2::jsonb,$3::jsonb,$4,$5)`, [
        id,
        JSON.stringify({ status: t.status, sourceAmount: t.source_amount }),
        JSON.stringify({ status: 'CANCELLED', reversalJournalEntryId: revId }),
        reason || 'إلغاء تحويل بنكي',
        t.reference || id,
      ]);
      return { success: true, id, status: 'CANCELLED', reversalJournalEntryId: revId };
    });
  }

  private async resolveOperatingAccount(companyId: string, preferredCodes: string[], fallbackClass: string) {
    for (const code of preferredCodes) {
      const r = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND code = $2 AND is_posting AND is_active`,
        [companyId, code],
      );
      if (r) return r.id;
    }
    const cls = await this.db.one<{ id: string }>(
      `SELECT id FROM acc.accounts WHERE company_id = $1 AND account_class = $2 AND is_posting AND is_active ORDER BY code ASC LIMIT 1`,
      [companyId, fallbackClass],
    );
    return cls?.id ?? null;
  }

  async create(companyId: string, input: z.infer<typeof BankTransferCreate>) {
    if (input.sourceBankId === input.targetBankId) {
      throw new DomainError('SAME_BANK_TRANSFER', 'لا يمكن التحويل إلى نفس الحساب البنكي');
    }

    return this.db.tx(async () => {
      const srcBank = await this.db.one<{ id: string; name: string; currency_code: string; gl_account_id: string; branch_id: string | null }>(
        `SELECT id, name, currency_code, gl_account_id, branch_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2`,
        [companyId, input.sourceBankId],
      );
      if (!srcBank) throw new NotFoundError('BankAccount', input.sourceBankId);

      const tgtBank = await this.db.one<{ id: string; name: string; currency_code: string; gl_account_id: string; branch_id: string | null }>(
        `SELECT id, name, currency_code, gl_account_id, branch_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2`,
        [companyId, input.targetBankId],
      );
      if (!tgtBank) throw new NotFoundError('BankAccount', input.targetBankId);

      const base = await this.fx.baseCurrency(companyId);
      const srcCur = srcBank.currency_code.toUpperCase();
      const tgtCur = tgtBank.currency_code.toUpperCase();
      const isCross = srcCur !== tgtCur;

      const spotRate = input.exchangeRate ?? 1;
      const srcAmt = D(input.sourceAmount);
      const tgtAmt = input.targetAmount != null
        ? D(input.targetAmount)
        : isCross
          ? srcAmt.times(spotRate)
          : srcAmt;
      const feeAmt = D(input.bankFee ?? 0);

      // Compute exchange rates to company base currency so DB FX triggers remain exact
      const srcRateToBase = srcCur === base.code
        ? '1'
        : (await this.fx.getRate(companyId, srcCur, base.code, input.transferDate)).rate.toString();

      const srcBase = srcAmt.times(D(srcRateToBase));
      let tgtRateToBase: string;
      if (tgtCur === base.code) {
        tgtRateToBase = '1';
      } else if (srcCur === base.code && tgtAmt.gt(0)) {
        tgtRateToBase = srcBase.div(tgtAmt).toFixed(10);
      } else {
        try {
          tgtRateToBase = (await this.fx.getRate(companyId, tgtCur, base.code, input.transferDate)).rate.toString();
        } catch {
          tgtRateToBase = tgtAmt.gt(0) ? srcBase.div(tgtAmt).toFixed(10) : '1';
        }
      }

      const jeLines: JournalLineInput[] = [
        {
          accountId: tgtBank.gl_account_id,
          debit: tgtAmt.toFixed(2),
          currencyCode: tgtCur,
          exchangeRate: tgtRateToBase,
          branchId: tgtBank.branch_id ?? undefined,
          description: `إيداع تحويل بنكي وارد من ${srcBank.name}`,
        },
        {
          accountId: srcBank.gl_account_id,
          credit: srcAmt.plus(feeAmt).toFixed(2),
          currencyCode: srcCur,
          exchangeRate: srcRateToBase,
          branchId: srcBank.branch_id ?? undefined,
          description: `صرف تحويل بنكي صادر إلى ${tgtBank.name}`,
        },
      ];

      if (feeAmt.gt(0)) {
        const feeAccId = await this.resolveOperatingAccount(companyId, ['5150', '5700', '5100'], 'OPERATING_EXPENSE');
        if (!feeAccId) throw new DomainError('FEE_ACCOUNT_MISSING', 'لم يتم العثور على حساب مصروفات الرسوم البنكية');
        jeLines.push({
          accountId: feeAccId,
          debit: feeAmt.toFixed(2),
          currencyCode: srcCur,
          exchangeRate: srcRateToBase,
          branchId: srcBank.branch_id ?? undefined,
          description: `عمولة ورسوم تحويل بنكي (${input.reference || ''})`,
        });
      }

      // Check base-currency residual (e.g., cross-rate spread / FX variance) and book FX gain/loss if > 1 minor unit
      const prepared = await this.journal.prepareLines(companyId, input.transferDate, base.code, jeLines);
      const totalDr = prepared.reduce((s, l) => s.plus(l.debitBase), D(0));
      const totalCr = prepared.reduce((s, l) => s.plus(l.creditBase), D(0));
      const diff = totalDr.minus(totalCr);
      if (diff.abs().greaterThan(0.01)) {
        if (diff.gt(0)) {
          // Cr FX Gain
          const gainAcc = await this.resolveOperatingAccount(companyId, ['4300', '4200'], 'OTHER_INCOME');
          if (gainAcc) {
            jeLines.push({
              accountId: gainAcc,
              credit: diff.toFixed(2),
              currencyCode: base.code,
              exchangeRate: '1',
              description: 'فروق أسعار صرف محققة عن التحويل البنكي',
            });
          }
        } else {
          // Dr FX Loss
          const lossAcc = await this.resolveOperatingAccount(companyId, ['5700', '5150'], 'OPERATING_EXPENSE');
          if (lossAcc) {
            jeLines.push({
              accountId: lossAcc,
              debit: diff.abs().toFixed(2),
              currencyCode: base.code,
              exchangeRate: '1',
              description: 'فروق أسعار صرف محققة عن التحويل البنكي',
            });
          }
        }
      }

      const entryId = await this.journal.createAndPost(companyId, {
        entryDate: input.transferDate,
        journalType: 'PAYMENT',
        sourceModule: 'treasury',
        sourceType: 'BANK_TRANSFER',
        reference: input.reference || undefined,
        currencyCode: srcCur,
        description: input.notes || `تحويل بنكي من ${srcBank.name} إلى ${tgtBank.name}`,
        lines: jeLines,
      });

      const inserted = await this.db.one<{ id: string }>(
        `INSERT INTO acc.bank_transfers (
           company_id, transfer_date, source_bank_id, target_bank_id,
           source_currency, source_amount, target_currency, target_amount,
           exchange_rate, bank_fee, reference, notes, journal_entry_id, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,sys.current_user_id())
         RETURNING id`,
        [
          companyId, input.transferDate, srcBank.id, tgtBank.id,
          srcCur, srcAmt.toFixed(4), tgtCur, tgtAmt.toFixed(4),
          String(spotRate), feeAmt.toFixed(4), input.reference ?? null, input.notes ?? null, entryId,
        ],
      );

      const je = await this.db.one<{ entry_no: string }>('SELECT entry_no FROM acc.journal_entries WHERE id = $1', [entryId]);
      return {
        id: inserted!.id,
        transferDate: input.transferDate,
        sourceBankId: srcBank.id,
        sourceBankName: srcBank.name,
        sourceCurrency: srcCur,
        sourceAmount: Number(srcAmt.toFixed(2)),
        targetBankId: tgtBank.id,
        targetBankName: tgtBank.name,
        targetCurrency: tgtCur,
        targetAmount: Number(tgtAmt.toFixed(2)),
        exchangeRate: spotRate,
        bankFee: Number(feeAmt.toFixed(2)),
        reference: input.reference ?? '',
        notes: input.notes ?? '',
        journalEntryId: entryId,
        journalEntryNo: je?.entry_no ?? '',
      };
    });
  }
}
