import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { D } from '../../../shared/money';
import { decimalString, ListQuery, offset, orderBy, Page } from '../../../shared/http/common';

const currency = z.string().trim().length(3).toUpperCase();

export const LoanCreate = z.object({
  employeeId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  principalAmount: decimalString,
  currencyCode: currency,
  exchangeRate: decimalString.optional(),
  installments: z.number().int().min(1).max(120),
  startPeriodId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const PostponeInstallment = z.object({
  toPeriodId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export const CancelLoan = z.object({
  reason: z.string().trim().min(3).max(1000),
});

@Injectable()
export class LoansService {
  constructor(private readonly db: DbService) {}

  async create(companyId: string, body: z.infer<typeof LoanCreate>) {
    return this.db.tx(async () => {
      // Validate employee
      const emp = await this.db.one<{ id: string }>(
        'SELECT id FROM hr.employees WHERE company_id = $1 AND id = $2 AND status != $3',
        [companyId, body.employeeId, 'TERMINATED'],
      );
      if (!emp) throw new NotFoundError('Employee', body.employeeId);

      // Get period
      const period = await this.db.one<{ id: string; start_date: string; status: string }>(
        'SELECT id, start_date::text, status FROM core.fiscal_periods WHERE company_id = $1 AND id = $2',
        [companyId, body.startPeriodId],
      );
      if (!period) throw new NotFoundError('FiscalPeriod', body.startPeriodId);
      if (period.status === 'CLOSED') throw new DomainError('PERIOD_CLOSED', 'لا يمكن منح قرض في فترة مغلقة');

      // Exchange rate
      let exRate = D(body.exchangeRate ?? '1');
      if (!body.exchangeRate || exRate.eq(0)) {
        const r = await this.db.one<{ rate: string }>(
          `SELECT rate::text FROM core.exchange_rates WHERE company_id = $1 AND from_currency = $2
           AND rate_date <= $3 ORDER BY rate_date DESC LIMIT 1`,
          [companyId, body.currencyCode, period.start_date],
        );
        exRate = D(r?.rate ?? '1');
      }
      const principalBase = D(body.principalAmount).times(exRate);
      const installmentAmt = principalBase.div(body.installments);

      // Auto loan number
      const cnt = await this.db.one<{ n: number }>(
        'SELECT COUNT(*)::int AS n FROM pay.loans WHERE company_id = $1', [companyId],
      );
      const loanNo = `LOAN-${new Date().getFullYear()}-${String((cnt?.n ?? 0) + 1).padStart(4, '0')}`;

      const loan = await this.db.one<{ id: string }>(
        `INSERT INTO pay.loans
           (company_id, employee_id, loan_no, reason, principal_amount, currency_code, exchange_rate, principal_base,
            installments, installment_amount, start_period_id, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, sys.current_user_id(), sys.current_user_id())
         RETURNING id`,
        [companyId, body.employeeId, loanNo, body.reason,
         body.principalAmount, body.currencyCode, exRate.toFixed(10), principalBase.toFixed(4),
         body.installments, installmentAmt.toFixed(4), body.startPeriodId, body.notes ?? null],
      );

      // Generate installment schedule
      // Get all periods from start in order
      const periods = await this.db.query<{ id: string; period_no: number }>(
        `SELECT fp.id, fp.period_no FROM core.fiscal_periods fp
         WHERE fp.company_id = $1 AND fp.id >= $2 AND NOT fp.is_adjustment_period
         ORDER BY fp.start_date ASC LIMIT $3`,
        [companyId, body.startPeriodId, body.installments],
      );

      let remaining = principalBase;
      for (let i = 0; i < body.installments; i++) {
        const pid = periods[i]?.id ?? body.startPeriodId; // fallback if periods list short
        const isLast = i === body.installments - 1;
        const amt = isLast ? remaining : installmentAmt;
        if (isLast) remaining = D(0);
        else remaining = remaining.minus(installmentAmt);

        await this.db.query(
          `INSERT INTO pay.loan_installments (loan_id, installment_no, fiscal_period_id, due_amount)
           VALUES ($1,$2,$3,$4)`,
          [loan!.id, i + 1, pid, amt.toFixed(4)],
        );
      }

      return this.get(companyId, loan!.id);
    });
  }

  async list(companyId: string, q: ListQuery & { employeeId?: string; status?: string }): Promise<Page<any>> {
    const where = ['l.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.employeeId) { params.push(q.employeeId); where.push(`l.employee_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`l.status = $${params.length}`); }
    if (q.q) { params.push(`%${q.q}%`); where.push(`(e.full_name_ar ILIKE $${params.length} OR l.loan_no ILIKE $${params.length})`); }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(
      `SELECT count(*) AS n FROM pay.loans l JOIN hr.employees e ON e.id = l.employee_id WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT l.id, l.loan_no AS "loanNo", l.employee_id AS "employeeId", e.full_name_ar AS "employeeName",
              l.principal_base::text AS "principalBase", l.installments, l.installment_amount::text AS "installmentAmount",
              l.status, l.reason, l.created_at AS "createdAt"
       FROM pay.loans l JOIN hr.employees e ON e.id = l.employee_id
       WHERE ${sql}
       ORDER BY ${orderBy(q.sort, { createdAt: 'l.created_at' }, 'l.created_at DESC')}
       LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async get(companyId: string, id: string) {
    const loan = await this.db.one(
      `SELECT l.id, l.loan_no AS "loanNo", l.loan_no, l.employee_id AS "employeeId",
              l.reason, l.principal_amount::text AS "principalAmount", l.currency_code AS "currencyCode",
              l.exchange_rate::text AS "exchangeRate", l.principal_base::text AS "principalBase",
              l.installments, l.installment_amount::text AS "installmentAmount",
              l.start_period_id AS "startPeriodId", l.status, l.notes,
              l.created_at AS "createdAt",
              e.full_name_ar AS "employeeName", e.code AS "employeeCode"
       FROM pay.loans l JOIN hr.employees e ON e.id = l.employee_id
       WHERE l.company_id = $1 AND l.id = $2`,
      [companyId, id],
    );
    if (!loan) throw new NotFoundError('Loan', id);
    const installments = await this.db.query(
      `SELECT li.id, li.installment_no AS "installmentNo", li.due_amount::text AS "dueAmount",
              li.status, fp.name AS "periodName", fp.id AS "periodId",
              li.postpone_reason AS "postponeReason"
       FROM pay.loan_installments li
       JOIN core.fiscal_periods fp ON fp.id = li.fiscal_period_id
       WHERE li.loan_id = $1 ORDER BY li.installment_no`,
      [id],
    );
    return { ...loan, installments_list: installments };
  }

  async postponeInstallment(companyId: string, installmentId: string, body: z.infer<typeof PostponeInstallment>) {
    const inst = await this.db.one<{ id: string; loan_id: string; status: string }>(
      `SELECT li.id, li.loan_id, li.status FROM pay.loan_installments li
       JOIN pay.loans l ON l.id = li.loan_id WHERE l.company_id = $1 AND li.id = $2`,
      [companyId, installmentId],
    );
    if (!inst) throw new NotFoundError('LoanInstallment', installmentId);
    if (inst.status !== 'PENDING') throw new DomainError('INSTALLMENT_NOT_PENDING', 'يمكن تأجيل الأقساط المعلقة فقط');
    await this.db.query(
      `UPDATE pay.loan_installments SET status = 'POSTPONED', postponed_to_period_id = $1, postpone_reason = $2,
       postponed_by = sys.current_user_id(), postponed_at = now() WHERE id = $3`,
      [body.toPeriodId, body.reason, installmentId],
    );
    // Insert a new pending installment for the target period
    const orig = await this.db.one<{ due_amount: string }>(
      'SELECT due_amount::text FROM pay.loan_installments WHERE id = $1', [installmentId]);
    const maxNo = await this.db.one<{ max: number }>(
      'SELECT MAX(installment_no) AS max FROM pay.loan_installments WHERE loan_id = $1', [inst.loan_id]);
    await this.db.query(
      'INSERT INTO pay.loan_installments (loan_id, installment_no, fiscal_period_id, due_amount) VALUES ($1,$2,$3,$4)',
      [inst.loan_id, (maxNo?.max ?? 0) + 1, body.toPeriodId, orig!.due_amount],
    );
    return { ok: true };
  }

  async cancel(companyId: string, id: string, body: z.infer<typeof CancelLoan>) {
    const loan = await this.db.one<{ status: string }>(
      'SELECT status FROM pay.loans WHERE company_id = $1 AND id = $2', [companyId, id]);
    if (!loan) throw new NotFoundError('Loan', id);
    if (loan.status !== 'ACTIVE') throw new DomainError('LOAN_NOT_ACTIVE', 'يمكن إلغاء القروض النشطة فقط');
    await this.db.tx(async () => {
      await this.db.query(
        `UPDATE pay.loans SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = $1,
         updated_by = sys.current_user_id() WHERE id = $2`,
        [body.reason, id],
      );
      await this.db.query(
        `UPDATE pay.loan_installments SET status = 'WAIVED' WHERE loan_id = $1 AND status = 'PENDING'`, [id]);
    });
    return this.get(companyId, id);
  }

  /** Returns all pending installments for a period (used by payroll run). */
  async pendingInstallmentsForPeriod(companyId: string, periodId: string) {
    return this.db.query<{ id: string; loanId: string; employeeId: string; dueAmount: string }>(
      `SELECT li.id, li.loan_id AS "loanId", l.employee_id AS "employeeId", li.due_amount::text AS "dueAmount"
       FROM pay.loan_installments li
       JOIN pay.loans l ON l.id = li.loan_id
       WHERE l.company_id = $1 AND li.fiscal_period_id = $2 AND li.status = 'PENDING' AND l.status = 'ACTIVE'`,
      [companyId, periodId],
    );
  }
}
