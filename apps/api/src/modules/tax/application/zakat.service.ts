import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { isoDate } from '../../../shared/http/common';
import { D, toDbAmount } from '../../../shared/money';
import { JournalService } from '../../accounting/application/journal.service';
import { LedgerService } from '../../accounting/application/ledger.service';
import {
  computeZakat, EMPTY_MANUAL_INPUTS, ZakatManualInputs, ZakatSettings, ZakatWorksheet,
} from '../domain/zakat';

const amount = z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'رقم غير صالح').default('0');

export const ZakatSettingsUpdate = z.object({
  saudiGulfPct: z.string().regex(/^\d+(\.\d{1,4})?$/),
  foreignPct: z.string().regex(/^\d+(\.\d{1,4})?$/),
  zakatRatePct: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  incomeTaxRatePct: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  zakatTin: z.string().trim().max(30).nullable().optional(),
}).refine((v) => D(v.saudiGulfPct).plus(v.foreignPct).equals(100), {
  message: 'مجموع نسبة الملكية السعودية/الخليجية والأجنبية يجب أن يساوي 100',
  path: ['foreignPct'],
});

export const ZakatManualSchema = z.object({
  provisionsAddBack: amount, nonDeductibleExpenses: amount, otherDeductionsFromProfit: amount,
  longTermLiabilities: amount, otherAdditionsToBase: amount, investmentsDeduction: amount,
  otherNonCurrentAssetsDeduction: amount, carriedForwardLossesDeduction: amount, dividendsDeduction: amount,
});

export const ZakatCalcInput = z.object({
  periodFrom: isoDate,
  periodTo: isoDate,
  inputs: ZakatManualSchema.default({}),
}).refine((v) => v.periodTo >= v.periodFrom, { message: 'نهاية الفترة قبل بدايتها', path: ['periodTo'] });

export const ZakatReturnCreate = ZakatCalcInput.and(z.object({ notes: z.string().trim().max(1000).nullable().optional() }));

const dayBefore = (iso: string) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const RETURN_COLS = `id, return_no AS "returnNo", period_from AS "periodFrom", period_to AS "periodTo",
  saudi_gulf_pct AS "saudiGulfPct", foreign_pct AS "foreignPct", adjusted_net_profit AS "adjustedNetProfit",
  zakat_base AS "zakatBase", zakat_due AS "zakatDue", income_tax_due AS "incomeTaxDue", total_due AS "totalDue",
  status, journal_entry_id AS "journalEntryId", notes, inputs, computed, created_at AS "createdAt", row_version AS "rowVersion"`;

@Injectable()
export class ZakatService {
  constructor(
    private readonly db: DbService,
    private readonly ledger: LedgerService,
    private readonly journals: JournalService,
  ) {}

  async getSettings(companyId: string): Promise<ZakatSettings & { zakatTin: string | null }> {
    const row = await this.db.one<ZakatSettings & { zakatTin: string | null }>(
      `SELECT saudi_gulf_pct AS "saudiGulfPct", foreign_pct AS "foreignPct", zakat_rate_pct AS "zakatRatePct",
              income_tax_rate_pct AS "incomeTaxRatePct", hijri_year_days AS "hijriYearDays", zakat_tin AS "zakatTin"
         FROM acc.zakat_settings WHERE company_id = $1`,
      [companyId],
    );
    if (row) return row;
    await this.db.query(`INSERT INTO acc.zakat_settings (company_id) VALUES ($1) ON CONFLICT DO NOTHING`, [companyId]);
    return this.getSettings(companyId);
  }

  async updateSettings(companyId: string, body: z.infer<typeof ZakatSettingsUpdate>) {
    await this.getSettings(companyId);
    await this.db.query(
      `UPDATE acc.zakat_settings
          SET saudi_gulf_pct = $2, foreign_pct = $3,
              zakat_rate_pct = COALESCE($4, zakat_rate_pct),
              income_tax_rate_pct = COALESCE($5, income_tax_rate_pct),
              zakat_tin = $6, updated_by = sys.current_user_id()
        WHERE company_id = $1`,
      [companyId, body.saudiGulfPct, body.foreignPct, body.zakatRatePct ?? null, body.incomeTaxRatePct ?? null, body.zakatTin ?? null],
    );
    return this.getSettings(companyId);
  }

  /** Reads the figures that come from the ledger for the period. */
  private async ledgerFigures(companyId: string, from: string, to: string) {
    // Opening equity = equity accounts + unclosed earnings as of the day before the period.
    const opening = await this.ledger.balanceSheet(companyId, dayBefore(from));
    const openingEquity = D(opening.equity.total).plus(opening.currentEarnings);

    const pnl = await this.ledger.incomeStatement(companyId, { from, to });
    // Zakat expense already booked in the period must not reduce the profit it is computed on.
    const zakatExpense = await this.db.one<{ amt: string | null }>(
      `SELECT SUM(l.debit_base - l.credit_base) AS amt
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
         JOIN acc.accounts a ON a.id = l.account_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = 'FINANCIAL'
          AND e.entry_date BETWEEN $2 AND $3 AND a.code = '6100'`,
      [companyId, from, to],
    );
    const netProfitBeforeZakat = D(pnl.netProfit).plus(zakatExpense?.amt ?? 0);

    const fixed = await this.db.one<{ amt: string | null }>(
      `SELECT SUM(l.debit_base - l.credit_base) AS amt
         FROM acc.journal_lines l
         JOIN acc.journal_entries e ON e.id = l.entry_id
         JOIN acc.accounts a ON a.id = l.account_id
        WHERE l.company_id = $1 AND e.status = 'POSTED' AND e.ledger = 'FINANCIAL'
          AND e.entry_date <= $2 AND a.subtype IN ('FIXED_ASSET','ACCUMULATED_DEPRECIATION')`,
      [companyId, to],
    );

    return {
      openingEquity: openingEquity.toFixed(4),
      netProfitBeforeZakat: netProfitBeforeZakat.toFixed(4),
      netFixedAssets: D(fixed?.amt ?? 0).toFixed(4),
    };
  }

  async calculate(companyId: string, body: z.infer<typeof ZakatCalcInput>): Promise<ZakatWorksheet> {
    const settings = await this.getSettings(companyId);
    const figures = await this.ledgerFigures(companyId, body.periodFrom, body.periodTo);
    return computeZakat(body.periodFrom, body.periodTo, settings, figures, { ...EMPTY_MANUAL_INPUTS, ...body.inputs } as ZakatManualInputs);
  }

  async list(companyId: string) {
    return this.db.query(`SELECT ${RETURN_COLS} FROM acc.zakat_returns WHERE company_id = $1 ORDER BY period_to DESC, created_at DESC`, [companyId]);
  }

  async get(companyId: string, id: string) {
    const row = await this.db.one(`SELECT ${RETURN_COLS} FROM acc.zakat_returns WHERE company_id = $1 AND id = $2`, [companyId, id]);
    if (!row) throw new NotFoundError('الإقرار الزكوي', id);
    return row;
  }

  async create(companyId: string, body: z.infer<typeof ZakatReturnCreate>) {
    const ws = await this.calculate(companyId, body);
    const overlap = await this.db.one(
      `SELECT return_no FROM acc.zakat_returns WHERE company_id = $1 AND period_from = $2 AND period_to = $3 AND status <> 'CANCELLED'`,
      [companyId, body.periodFrom, body.periodTo],
    );
    if (overlap) throw new DomainError('ZAKAT_RETURN_EXISTS', `يوجد إقرار لنفس الفترة (${(overlap as any).return_no}). ألغِه أولاً لإعادة الاحتساب`);

    const year = body.periodTo.slice(0, 4);
    const seq = await this.db.one<{ n: string }>(`SELECT COUNT(*)::text AS n FROM acc.zakat_returns WHERE company_id = $1 AND return_no LIKE $2`, [companyId, `ZK-${year}-%`]);
    const returnNo = `ZK-${year}-${String(Number(seq?.n ?? 0) + 1).padStart(3, '0')}`;

    const created = await this.db.one<{ id: string }>(
      `INSERT INTO acc.zakat_returns
         (company_id, return_no, period_from, period_to, saudi_gulf_pct, foreign_pct, inputs, computed,
          adjusted_net_profit, zakat_base, zakat_due, income_tax_due, total_due, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14, sys.current_user_id(), sys.current_user_id())
       RETURNING id`,
      [
        companyId, returnNo, body.periodFrom, body.periodTo, ws.saudiGulfPct, ws.foreignPct,
        JSON.stringify(body.inputs), JSON.stringify(ws),
        toDbAmount(ws.adjustedNetProfit), toDbAmount(ws.zakatBase), toDbAmount(ws.zakatDue), toDbAmount(ws.incomeTaxDue), toDbAmount(ws.totalDue),
        (body as any).notes ?? null,
      ],
    );
    return this.get(companyId, created!.id);
  }

  /** Books the provision: Dr zakat/income-tax expense, Cr zakat/income-tax payable. */
  async post(companyId: string, id: string) {
    return this.db.tx(async () => {
      const ret: any = await this.get(companyId, id);
      if (ret.status !== 'DRAFT') throw new DomainError('ZAKAT_NOT_DRAFT', 'الإقرار ليس مسودة');
      if (D(ret.totalDue).lessThanOrEqualTo(0)) throw new DomainError('ZAKAT_NOTHING_DUE', 'لا يوجد مبلغ مستحق لترحيله');

      const accts = await this.db.query<{ id: string; code: string }>(
        `SELECT id, code FROM acc.accounts WHERE company_id = $1 AND code IN ('6100','2450') AND is_active`,
        [companyId],
      );
      const exp = accts.find((a) => a.code === '6100');
      const pay = accts.find((a) => a.code === '2450');
      if (!exp || !pay) throw new DomainError('ZAKAT_ACCOUNTS_MISSING', 'حسابا الزكاة (6100 و2450) غير موجودين في شجرة الحسابات');

      const desc = `مخصص الزكاة وضريبة الدخل عن الفترة ${ret.periodFrom} إلى ${ret.periodTo} (${ret.returnNo})`;
      const entryId = await this.journals.createAndPost(companyId, {
        entryDate: ret.periodTo,
        journalType: 'ACCRUAL',
        description: desc,
        reference: ret.returnNo,
        sourceModule: 'tax',
        sourceType: 'ZAKAT_RETURN',
        sourceId: ret.id,
        lines: [
          { accountId: exp.id, debit: ret.totalDue, description: desc },
          { accountId: pay.id, credit: ret.totalDue, description: desc },
        ],
      });
      await this.db.query(
        `UPDATE acc.zakat_returns SET status = 'POSTED', journal_entry_id = $2, updated_by = sys.current_user_id() WHERE id = $1`,
        [id, entryId],
      );
      return this.get(companyId, id);
    });
  }

  async cancel(companyId: string, id: string, reason: string) {
    return this.db.tx(async () => {
      const ret: any = await this.get(companyId, id);
      if (ret.status === 'CANCELLED') throw new DomainError('ZAKAT_ALREADY_CANCELLED', 'الإقرار ملغى مسبقاً');
      if (ret.status === 'POSTED' && ret.journalEntryId) {
        await this.journals.reverse(companyId, ret.journalEntryId, `إلغاء الإقرار الزكوي ${ret.returnNo}: ${reason}`);
      }
      await this.db.query(
        `UPDATE acc.zakat_returns SET status = 'CANCELLED', notes = COALESCE(notes || E'\\n', '') || $2, updated_by = sys.current_user_id() WHERE id = $1`,
        [id, `سبب الإلغاء: ${reason}`],
      );
      return this.get(companyId, id);
    });
  }
}
