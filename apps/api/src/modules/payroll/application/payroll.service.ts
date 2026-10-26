import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D, toDbAmount } from '../../../shared/money';
import { ListQuery, offset, orderBy, Page } from '../../../shared/http/common';
import { PostingEngine, PostingItem } from '../../accounting/application/posting-engine';
import { JournalService } from '../../accounting/application/journal.service';
import { FiscalService } from '../../core/application/fiscal.service';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';

// ------------------------------------------------------------------ schemas

export const PayrollRunCreate = z.object({
  fiscalPeriodId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const PayrollRunCancel = z.object({
  reason: z.string().trim().min(3).max(1000),
});

/**
 * Payroll run: previews and executes the monthly payroll close.
 * Collects employees, salaries, approved monthly variables, and pending loan installments.
 * One run per period enforced by UNIQUE constraint.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly db: DbService,
    private readonly posting: PostingEngine,
    private readonly journal: JournalService,
    private readonly fiscal: FiscalService,
    private readonly fx: ExchangeRateService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private async collectLines(companyId: string, periodId: string, periodStartDate: string, periodEndDate: string) {
    const baseCur = await this.db.one<{ code: string }>(`SELECT base_currency_code AS code FROM core.companies WHERE id = $1`, [companyId]);
    const baseCode = (baseCur?.code ?? 'EGP').toUpperCase();

    // active employees with their current salary as of period end
    const employees = await this.db.query<{
      employeeId: string; fullNameAr: string; basicSalary: string; salaryCurrency: string;
    }>(
      `SELECT e.id AS "employeeId", e.full_name_ar AS "fullNameAr",
              COALESCE(c.basic_salary, '0') AS "basicSalary",
              COALESCE(c.salary_currency, 'EGP') AS "salaryCurrency"
         FROM hr.employees e
         LEFT JOIN LATERAL (
           SELECT c2.basic_salary, c2.salary_currency
             FROM hr.employee_compensations c2
            WHERE c2.company_id = $1 AND c2.employee_id = e.id
              AND c2.effective_from <= $3::date
              AND (c2.effective_to IS NULL OR c2.effective_to >= $2::date)
            ORDER BY c2.effective_from DESC LIMIT 1
         ) c ON true
        WHERE e.company_id = $1 AND e.status = 'ACTIVE'
        ORDER BY e.full_name_ar`,
      [companyId, periodStartDate, periodEndDate],
    );

    // approved monthly variables for this period
    const variables = await this.db.query<{
      employeeId: string; variableTypeId: string; category: string; computedAmount: string; exchangeRate: string;
    }>(
      `SELECT mv.employee_id AS "employeeId", mv.variable_type_id AS "variableTypeId",
              vt.category, mv.computed_amount AS "computedAmount", mv.exchange_rate AS "exchangeRate"
         FROM pay.monthly_variables mv
         JOIN pay.variable_types vt ON vt.id = mv.variable_type_id
        WHERE mv.company_id = $1 AND mv.fiscal_period_id = $2 AND mv.status = 'APPROVED'`,
      [companyId, periodId],
    );

    // pending loan installments due in this period
    const loanDeductions = await this.db.query<{ employeeId: string; installmentId: string; dueAmount: string }>(
      `SELECT l.employee_id AS "employeeId", li.id AS "installmentId", li.due_amount AS "dueAmount"
         FROM pay.loan_installments li
         JOIN pay.loans l ON l.id = li.loan_id
        WHERE l.company_id = $1 AND li.fiscal_period_id = $2 AND li.status = 'PENDING' AND l.status = 'ACTIVE'`,
      [companyId, periodId],
    );

    // build per-employee lines with multi-currency tracking
    const byEmployee = new Map<string, {
      employeeId: string; fullNameAr: string;
      contractCurrency: string; contractAmount: string;
      payoutCurrency: string; payoutExchangeRate: string; payoutAmount: string;
      exchangeRateToBase: string;
      salaryBase: string; bonusesBase: string; overtimeBase: string; allowancesBase: string; deductionsBase: string;
      loanDeductionsBase: string; grossBase: string; netPayableBase: string;
      installmentIds: string[];
    }>();

    for (const e of employees) {
      const contractCurrency = (e.salaryCurrency || 'EGP').toUpperCase();
      let rateToBase = D(1);
      if (contractCurrency !== baseCode) {
        try {
          const res = await this.fx.getRate(companyId, contractCurrency, baseCode, periodEndDate);
          rateToBase = res.rate;
        } catch {
          rateToBase = contractCurrency === 'SAR' ? D('13.15') : D(1);
        }
      }

      const payoutCurrency = contractCurrency;
      const salaryBase = toDbAmount(D(e.basicSalary).times(rateToBase));

      byEmployee.set(e.employeeId, {
        employeeId: e.employeeId,
        fullNameAr: e.fullNameAr,
        contractCurrency,
        contractAmount: e.basicSalary,
        payoutCurrency,
        payoutExchangeRate: '1',
        payoutAmount: '0.0000',
        exchangeRateToBase: toDbAmount(rateToBase),
        salaryBase,
        bonusesBase: '0.0000',
        overtimeBase: '0.0000',
        allowancesBase: '0.0000',
        deductionsBase: '0.0000',
        loanDeductionsBase: '0.0000',
        grossBase: '0.0000',
        netPayableBase: '0.0000',
        installmentIds: [],
      });
    }

    for (const v of variables) {
      let line = byEmployee.get(v.employeeId);
      if (!line) continue;
      const amt = D(v.computedAmount).times(D(v.exchangeRate || 1));
      switch (v.category) {
        case 'BONUS':   line.bonusesBase = toDbAmount(D(line.bonusesBase).plus(amt)); break;
        case 'OVERTIME': line.overtimeBase = toDbAmount(D(line.overtimeBase).plus(amt)); break;
        case 'ALLOWANCE': line.allowancesBase = toDbAmount(D(line.allowancesBase).plus(amt)); break;
        case 'DEDUCTION':
        case 'ADVANCE':   line.deductionsBase = toDbAmount(D(line.deductionsBase).plus(amt)); break;
        default: line.bonusesBase = toDbAmount(D(line.bonusesBase).plus(amt));
      }
    }

    for (const ld of loanDeductions) {
      const line = byEmployee.get(ld.employeeId);
      if (!line) continue;
      line.loanDeductionsBase = toDbAmount(D(line.loanDeductionsBase).plus(D(ld.dueAmount)));
      line.installmentIds.push(ld.installmentId);
    }

    // compute totals and payout amounts
    for (const line of byEmployee.values()) {
      const gross = D(line.salaryBase)
        .plus(D(line.bonusesBase))
        .plus(D(line.overtimeBase))
        .plus(D(line.allowancesBase));
      line.grossBase = toDbAmount(gross);
      const net = gross
        .minus(D(line.deductionsBase))
        .minus(D(line.loanDeductionsBase));
      line.netPayableBase = toDbAmount(net);

      // Payout amount in target payout currency
      const rateToBase = D(line.exchangeRateToBase || 1);
      if (line.payoutCurrency === baseCode) {
        line.payoutAmount = line.netPayableBase;
      } else if (!rateToBase.isZero()) {
        line.payoutAmount = toDbAmount(net.div(rateToBase));
      } else {
        line.payoutAmount = line.netPayableBase;
      }
    }

    return [...byEmployee.values()];
  }

  // ---------------------------------------------------------------- preview

  async preview(companyId: string, periodId: string) {
    const p = await this.fiscal.getPeriod(companyId, periodId);
    if (p.isAdjustmentPeriod) throw new DomainError('ADJUSTMENT_PERIOD_NOT_ALLOWED', 'استخدم فترة شهرية عادية');
    const existing = await this.db.one<{ id: string; status: string }>(
      `SELECT id, status FROM pay.payroll_runs WHERE company_id = $1 AND fiscal_period_id = $2`,
      [companyId, periodId],
    );
    const lines = await this.collectLines(companyId, periodId, p.startDate, p.endDate);
    const totals = lines.reduce(
      (acc, l) => ({
        totalSalaryBase: toDbAmount(D(acc.totalSalaryBase).plus(l.salaryBase)),
        totalVariablesBase: toDbAmount(D(acc.totalVariablesBase).plus(D(l.bonusesBase)).plus(D(l.overtimeBase)).plus(D(l.allowancesBase))),
        totalDeductionsBase: toDbAmount(D(acc.totalDeductionsBase).plus(l.deductionsBase)),
        totalLoanDeductionsBase: toDbAmount(D(acc.totalLoanDeductionsBase).plus(l.loanDeductionsBase)),
        netPayableBase: toDbAmount(D(acc.netPayableBase).plus(l.netPayableBase)),
      }),
      { totalSalaryBase: '0.0000', totalVariablesBase: '0.0000', totalDeductionsBase: '0.0000', totalLoanDeductionsBase: '0.0000', netPayableBase: '0.0000' },
    );
    const totalPayoutSar = lines
      .filter((l) => l.payoutCurrency === 'SAR')
      .reduce((sum, l) => sum.plus(D(l.payoutAmount)), D(0));
    const totalPayoutEgp = lines
      .filter((l) => l.payoutCurrency === 'EGP')
      .reduce((sum, l) => sum.plus(D(l.payoutAmount)), D(0));

    return {
      period: { id: p.id, name: p.name, startDate: p.startDate, endDate: p.endDate, status: p.status },
      existingRunId: existing?.id ?? null,
      existingRunStatus: existing?.status ?? null,
      employeeCount: lines.length,
      lines,
      totalPayoutSar: toDbAmount(totalPayoutSar),
      totalPayoutEgp: toDbAmount(totalPayoutEgp),
      ...totals,
    };
  }

  // ---------------------------------------------------------------- execute run

  async run(companyId: string, input: z.infer<typeof PayrollRunCreate>) {
    return this.db.tx(async () => {
      const p = await this.fiscal.getPeriod(companyId, input.fiscalPeriodId);
      if (p.isAdjustmentPeriod) throw new DomainError('ADJUSTMENT_PERIOD_NOT_ALLOWED', 'استخدم فترة شهرية عادية');
      if (p.status !== 'OPEN') throw new DomainError('PERIOD_NOT_OPEN', 'الفترة المالية غير مفتوحة');
      // serialize per company/period
      await this.db.query(`SELECT pg_advisory_xact_lock(hashtext('payroll-run:' || $1::text))`, [companyId]);
      const existing = await this.db.one<{ id: string }>(
        `SELECT id FROM pay.payroll_runs WHERE company_id = $1 AND fiscal_period_id = $2 AND status NOT IN ('CANCELLED')`,
        [companyId, input.fiscalPeriodId],
      );
      if (existing) throw new DomainError('PAYROLL_RUN_EXISTS', 'يوجد مسير رواتب لهذه الفترة بالفعل', 409);
      const lines = await this.collectLines(companyId, input.fiscalPeriodId, p.startDate, p.endDate);
      if (!lines.length) throw new DomainError('PAYROLL_NO_EMPLOYEES', 'لا يوجد موظفون نشطون لتشغيل مسير الرواتب');
      const totals = lines.reduce(
        (acc, l) => ({
          totalSalaryBase: D(acc.totalSalaryBase).plus(l.salaryBase),
          totalVariablesBase: D(acc.totalVariablesBase).plus(D(l.bonusesBase)).plus(D(l.overtimeBase)).plus(D(l.allowancesBase)),
          totalDeductionsBase: D(acc.totalDeductionsBase).plus(l.deductionsBase),
          totalLoanDeductionsBase: D(acc.totalLoanDeductionsBase).plus(l.loanDeductionsBase),
          netPayableBase: D(acc.netPayableBase).plus(l.netPayableBase),
        }),
        { totalSalaryBase: D(0), totalVariablesBase: D(0), totalDeductionsBase: D(0), totalLoanDeductionsBase: D(0), netPayableBase: D(0) },
      );
      // get base currency
      const base = await this.db.one<{ code: string }>(`SELECT base_currency_code AS code FROM core.companies WHERE id = $1`, [companyId]);
      const currencyCode = base?.code ?? 'SAR';
      const totalPayoutSar = lines
        .filter((l) => l.payoutCurrency === 'SAR')
        .reduce((sum, l) => sum.plus(D(l.payoutAmount)), D(0));
      const totalPayoutEgp = lines
        .filter((l) => l.payoutCurrency === 'EGP')
        .reduce((sum, l) => sum.plus(D(l.payoutAmount)), D(0));

      // insert run header
      const run = await this.db.one<{ id: string; run_no: string }>(
        `INSERT INTO pay.payroll_runs
           (company_id, fiscal_period_id, status,
            total_salary_base, total_variables_base, total_deductions_base,
            total_loan_deductions_base, net_payable_base, total_payout_sar, total_payout_egp,
            notes, created_by, updated_by)
         VALUES ($1,$2,'PROCESSING',$3,$4,$5,$6,$7,$8,$9,$10,sys.current_user_id(),sys.current_user_id())
         RETURNING id, run_no`,
        [
          companyId, input.fiscalPeriodId,
          totals.totalSalaryBase.toFixed(4), totals.totalVariablesBase.toFixed(4),
          totals.totalDeductionsBase.toFixed(4), totals.totalLoanDeductionsBase.toFixed(4),
          totals.netPayableBase.toFixed(4), totalPayoutSar.toFixed(4), totalPayoutEgp.toFixed(4),
          input.notes ?? null,
        ],
      );
      const runId = run!.id;
      // insert payroll lines
      for (const l of lines) {
        await this.db.query(
          `INSERT INTO pay.payroll_lines
             (run_id, employee_id, salary_base, bonuses_base, overtime_base, allowances_base,
              deductions_base, loan_deductions_base, gross_base, net_payable_base,
              contract_currency, contract_amount, payout_currency, payout_exchange_rate, payout_amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            runId, l.employeeId, l.salaryBase, l.bonusesBase, l.overtimeBase,
            l.allowancesBase, l.deductionsBase, l.loanDeductionsBase,
            l.grossBase, l.netPayableBase,
            l.contractCurrency, l.contractAmount, l.payoutCurrency, l.payoutExchangeRate, l.payoutAmount,
          ],
        );
        // mark loan installments as deducted
        for (const instId of l.installmentIds) {
          await this.db.query(
            `UPDATE pay.loan_installments
                SET status = 'DEDUCTED', deducted_at = now(), paid_amount = due_amount, updated_at = now()
              WHERE id = $1`,
            [instId],
          );
        }
      }
      // post accounting entry PAY.SALARY
      const items: PostingItem[] = [];
      lines.forEach((l, i) => {
        if (!D(l.netPayableBase).isZero()) {
          items.push({
            key: 'net',
            amount: l.netPayableBase,
            dims: { employeeId: l.employeeId },
            description: `صافي راتب ${l.fullNameAr} - ${p.name}`,
            sourceLineRef: String(i + 1),
          });
          items.push({
            key: 'AMOUNT',
            amount: l.netPayableBase,
            dims: { employeeId: l.employeeId },
            description: `راتب ${l.fullNameAr} - ${p.name}`,
            sourceLineRef: String(i + 1),
          });
        }
        if (!D(l.grossBase).isZero()) {
          items.push({
            key: 'gross',
            amount: l.grossBase,
            dims: { employeeId: l.employeeId },
            description: `إجمالي استحقاقات ${l.fullNameAr} - ${p.name}`,
            sourceLineRef: String(i + 1),
          });
        }
      });

      if (items.length > 0) {
        try {
          const entryId = await this.posting.post(companyId, {
            eventCode: 'PAY.SALARY',
            entryDate: p.endDate,
            fiscalPeriodId: p.id,
            journalType: 'PAYROLL',
            description: `مسير الرواتب - ${p.name}`,
            reference: `PAY-${run!.run_no}`,
            sourceModule: 'payroll',
            sourceType: 'PAYROLL_RUN',
            sourceId: runId,
            currencyCode,
            exchangeRate: '1',
            items,
          });
          await this.db.query(
            `UPDATE pay.payroll_runs SET status = 'POSTED', journal_entry_id = $2, posted_at = now(), updated_by = sys.current_user_id()
              WHERE id = $1`,
            [runId, entryId],
          );
        } catch (err: any) {
          if (err.code === 'POSTING_RULE_MISSING') {
            await this.db.query(
              `UPDATE pay.payroll_runs SET status = 'POSTED', posted_at = now(), updated_by = sys.current_user_id() WHERE id = $1`,
              [runId],
            );
          } else {
            throw err;
          }
        }
        // mark variables as POSTED
        await this.db.query(
          `UPDATE pay.monthly_variables SET status = 'POSTED', updated_by = sys.current_user_id()
            WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'APPROVED'`,
          [companyId, input.fiscalPeriodId],
        );
      } else {
        await this.db.query(
          `UPDATE pay.payroll_runs SET status = 'POSTED', posted_at = now(), updated_by = sys.current_user_id() WHERE id = $1`,
          [runId],
        );
      }
      // check if loans are fully settled
      const allInstallmentIds = lines.flatMap((l) => l.installmentIds);
      if (allInstallmentIds.length > 0) {
        const loanIds = await this.db.query<{ loan_id: string }>(
          `SELECT DISTINCT loan_id FROM pay.loan_installments WHERE id = ANY($1::uuid[])`,
          [allInstallmentIds],
        );
        for (const { loan_id } of loanIds) {
          const pending = await this.db.one<{ n: string }>(
            `SELECT count(*) AS n FROM pay.loan_installments WHERE loan_id = $1 AND status = 'PENDING'`,
            [loan_id],
          );
          if (Number(pending?.n ?? 0) === 0) {
            await this.db.query(
              `UPDATE pay.loans SET status = 'SETTLED', settled_at = now(), updated_by = sys.current_user_id() WHERE id = $1`,
              [loan_id],
            );
          }
        }
      }
      return this.get(companyId, runId);
    });
  }

  // ---------------------------------------------------------------- list & get

  async list(companyId: string, q: ListQuery): Promise<Page<any>> {
    const total = await this.db.one<{ n: string }>('SELECT count(*) AS n FROM pay.payroll_runs WHERE company_id = $1', [companyId]);
    const rows = await this.db.query(
      `SELECT r.id, r.run_no AS "runNo", r.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              r.status, r.total_salary_base AS "totalSalaryBase", r.total_variables_base AS "totalVariablesBase",
              r.total_deductions_base AS "totalDeductionsBase", r.total_loan_deductions_base AS "totalLoanDeductionsBase",
              r.net_payable_base AS "netPayableBase",
              COALESCE(r.total_payout_sar, 0) AS "totalPayoutSar",
              COALESCE(r.total_payout_egp, 0) AS "totalPayoutEgp",
              r.journal_entry_id AS "journalEntryId",
              je.entry_no AS "journalEntryNo", r.posted_at AS "postedAt",
              r.notes, r.created_at AS "createdAt", r.row_version AS "rowVersion"
         FROM pay.payroll_runs r
         JOIN core.fiscal_periods fp ON fp.id = r.fiscal_period_id
         LEFT JOIN acc.journal_entries je ON je.id = r.journal_entry_id
        WHERE r.company_id = $1
        ORDER BY ${orderBy(q.sort, { runNo: 'r.run_no', createdAt: 'r.created_at' }, 'r.run_no DESC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      [companyId],
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const r = await this.db.one(
      `SELECT r.id, r.run_no AS "runNo", r.fiscal_period_id AS "fiscalPeriodId", fp.name AS "periodName",
              fp.start_date AS "periodStart", fp.end_date AS "periodEnd",
              r.status, r.total_salary_base AS "totalSalaryBase", r.total_variables_base AS "totalVariablesBase",
              r.total_deductions_base AS "totalDeductionsBase", r.total_loan_deductions_base AS "totalLoanDeductionsBase",
              r.net_payable_base AS "netPayableBase",
              COALESCE(r.total_payout_sar, 0) AS "totalPayoutSar",
              COALESCE(r.total_payout_egp, 0) AS "totalPayoutEgp",
              r.journal_entry_id AS "journalEntryId",
              je.entry_no AS "journalEntryNo", r.posted_at AS "postedAt",
              r.cancel_reason AS "cancelReason", r.notes, r.created_at AS "createdAt",
              r.updated_at AS "updatedAt", r.row_version AS "rowVersion"
         FROM pay.payroll_runs r
         JOIN core.fiscal_periods fp ON fp.id = r.fiscal_period_id
         LEFT JOIN acc.journal_entries je ON je.id = r.journal_entry_id
        WHERE r.company_id = $1 AND r.id = $2`,
      [companyId, id],
    );
    if (!r) throw new NotFoundError('PayrollRun', id);
    const lines = await this.db.query(
      `SELECT pl.id, pl.employee_id AS "employeeId", e.code AS "employeeCode",
              e.full_name_ar AS "employeeName",
              COALESCE(pl.contract_currency, 'EGP') AS "contractCurrency",
              COALESCE(pl.contract_amount, 0) AS "contractAmount",
              COALESCE(pl.payout_currency, 'EGP') AS "payoutCurrency",
              COALESCE(pl.payout_exchange_rate, 1) AS "payoutExchangeRate",
              COALESCE(pl.payout_amount, pl.net_payable_base) AS "payoutAmount",
              pl.salary_base AS "salaryBase", pl.bonuses_base AS "bonusesBase",
              pl.overtime_base AS "overtimeBase", pl.allowances_base AS "allowancesBase",
              pl.deductions_base AS "deductionsBase", pl.loan_deductions_base AS "loanDeductionsBase",
              pl.gross_base AS "grossBase", pl.net_payable_base AS "netPayableBase", pl.notes
         FROM pay.payroll_lines pl
         JOIN hr.employees e ON e.id = pl.employee_id
        WHERE pl.run_id = $1
        ORDER BY e.full_name_ar`,
      [id],
    );
    return { ...r, lines };
  }

  async cancel(companyId: string, runId: string, input: z.infer<typeof PayrollRunCancel>) {
    return this.db.tx(
      async () => {
        const run = await this.db.one<{ id: string; status: string; journal_entry_id: string | null; fiscal_period_id: string }>(
          'SELECT id, status, journal_entry_id, fiscal_period_id FROM pay.payroll_runs WHERE company_id = $1 AND id = $2 FOR UPDATE',
          [companyId, runId],
        );
        if (!run) throw new NotFoundError('PayrollRun', runId);
        if (run.status !== 'POSTED') throw new DomainError('PAYROLL_RUN_NOT_POSTED', 'يمكن إلغاء مسيرات الرواتب المرحّلة فقط');
        // check no later run exists
        const later = await this.db.one(
          `SELECT 1 FROM pay.payroll_runs r
             JOIN core.fiscal_periods fp ON fp.id = r.fiscal_period_id
             JOIN core.fiscal_periods fp2 ON fp2.id = $2
            WHERE r.company_id = $1 AND r.status = 'POSTED' AND fp.start_date > fp2.start_date LIMIT 1`,
          [companyId, run.fiscal_period_id],
        );
        if (later) throw new DomainError('NOT_LATEST_RUN', 'يمكن إلغاء آخر مسير رواتب فقط');
        // reverse journal if present
        if (run.journal_entry_id) {
          await this.journal.reverse(companyId, run.journal_entry_id, input.reason);
        }
        await this.db.query(
          `UPDATE pay.payroll_runs SET status = 'CANCELLED', cancel_reason = $2, updated_by = sys.current_user_id(), row_version = row_version + 1
            WHERE id = $1`,
          [runId, input.reason],
        );
        // revert loan installments to PENDING
        const lines = await this.db.query<{ employee_id: string }>('SELECT employee_id FROM pay.payroll_lines WHERE run_id = $1', [runId]);
        const empIds = lines.map((l) => l.employee_id);
        if (empIds.length > 0) {
          await this.db.query(
            `UPDATE pay.loan_installments li
                SET status = 'PENDING', deducted_at = NULL, paid_amount = 0, updated_at = now()
               FROM pay.loans l
              WHERE li.loan_id = l.id AND l.company_id = $1
                AND l.employee_id = ANY($2::uuid[])
                AND li.fiscal_period_id = $3
                AND li.status = 'DEDUCTED'`,
            [companyId, empIds, run.fiscal_period_id],
          );
          // revert settled loans back to ACTIVE
          await this.db.query(
            `UPDATE pay.loans SET status = 'ACTIVE', settled_at = NULL, updated_by = sys.current_user_id()
              WHERE company_id = $1 AND employee_id = ANY($2::uuid[]) AND status = 'SETTLED'`,
            [companyId, empIds],
          );
        }
        // revert posted variables back to APPROVED
        await this.db.query(
          `UPDATE pay.monthly_variables SET status = 'APPROVED', updated_by = sys.current_user_id()
            WHERE company_id = $1 AND fiscal_period_id = $2 AND status = 'POSTED'`,
          [companyId, run.fiscal_period_id],
        );
        return this.get(companyId, runId);
      },
      { reason: input.reason },
    );
  }
}
