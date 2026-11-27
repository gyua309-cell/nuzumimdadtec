import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { D } from '../../../shared/money';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { JournalService } from '../../accounting/application/journal.service';

export const EosbCalculationInput = z.object({
  employeeId: z.string().uuid(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ YYYY-MM-DD مطلوبة'),
  terminationType: z.enum(['TERMINATION_BY_EMPLOYER', 'RESIGNATION', 'CONTRACT_EXPIRY', 'FORCE_MAJEURE', 'RETIREMENT']),
  reason: z.string().trim().max(500).optional(),
});

export const EosbPostJournalInput = z.object({
  employeeId: z.string().uuid().optional(),
  employeeName: z.string().trim().max(200).optional(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalYears: z.coerce.number().min(0).default(0),
  netEosb: z.coerce.number().min(0).default(0),
  vacPay: z.coerce.number().min(0).default(0),
  totalSettlement: z.coerce.number().positive(),
  mode: z.enum(['PROVISION', 'PAY_NOW']).default('PROVISION'),
  bankAccountId: z.string().uuid().optional(),
});

export interface EosbCalculationResult {
  employeeId: string;
  employeeCode: string;
  employeeNameAr: string;
  hireDate: string;
  terminationDate: string;
  totalServiceDays: number;
  totalServiceYears: number;
  monthlySalary: string;
  baseAmountFirst5Years: string;
  baseAmountAfter5Years: string;
  grossAmount: string;
  entitlementPct: number;
  netEosbDue: string;
  saudiLaborArticle: string;
  calculationBreakdownAr: string;
}

@Injectable()
export class EosbService {
  constructor(
    private readonly db: DbService,
    private readonly journal: JournalService,
  ) {}

  /**
   * Calculates End of Service Benefit according to Articles 84 & 85 of Saudi Labor Law.
   */
  async calculateEosb(companyId: string, input: z.infer<typeof EosbCalculationInput>): Promise<EosbCalculationResult> {
    const parsed = EosbCalculationInput.parse(input);

    const emp = await this.db.one<{
      id: string;
      code: string;
      full_name_ar: string;
      hire_date: string;
      basic_salary: string;
      allowances_total: string;
    }>(
      `SELECT e.id, e.code, e.full_name_ar, e.hire_date::text,
              COALESCE(c.basic_salary, 0)::text AS basic_salary,
              COALESCE(ov.allowances_total, 0)::text AS allowances_total
         FROM hr.employees e
         LEFT JOIN LATERAL (
           SELECT c2.basic_salary
             FROM hr.employee_compensations c2
            WHERE c2.company_id = $2 AND c2.employee_id = e.id
              AND c2.effective_from <= $3::date
              AND (c2.effective_to IS NULL OR c2.effective_to >= $3::date)
            ORDER BY c2.effective_from DESC LIMIT 1
         ) c ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(o.amount), 0) AS allowances_total
             FROM hr.employee_component_overrides o
             JOIN hr.cost_components cc ON cc.id = o.component_id
            WHERE o.company_id = $2 AND o.employee_id = e.id
              AND cc.nature = 'EARNING'
              AND o.effective_from <= $3::date
              AND (o.effective_to IS NULL OR o.effective_to >= $3::date)
         ) ov ON true
        WHERE e.id = $1 AND e.company_id = $2`,
      [parsed.employeeId, companyId, parsed.terminationDate],
    );

    if (!emp) throw new NotFoundError('EMPLOYEE_NOT_FOUND', 'الموظف غير موجود');

    const hireDate = new Date(emp.hire_date);
    const termDate = new Date(parsed.terminationDate);

    const diffMs = termDate.getTime() - hireDate.getTime();
    if (diffMs < 0) {
      throw new DomainError('INVALID_TERMINATION_DATE', 'تاريخ نهاية الخدمة لا يمكن أن يكون قبل تاريخ التعيين');
    }

    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const totalYears = Number((totalDays / 365.25).toFixed(2));

    // Full wage base = Basic + active recurring earning allowances
    const salary = D(emp.basic_salary).plus(D(emp.allowances_total));
    const halfMonth = salary.dividedBy(2);

    let first5YearsAmount = D(0);
    let after5YearsAmount = D(0);

    if (totalYears <= 5) {
      first5YearsAmount = halfMonth.times(totalYears);
    } else {
      first5YearsAmount = halfMonth.times(5);
      const remainingYears = totalYears - 5;
      after5YearsAmount = salary.times(remainingYears);
    }

    const grossAmount = first5YearsAmount.plus(after5YearsAmount);

    // Entitlement percentage based on Article 85 (Resignation vs Termination)
    let entitlementPct = 100;
    let articleRef = 'المادة 84 من نظام العمل السعودي (استحقاق كامل)';
    let breakdownNote = 'إنهاء خدمة من صاحب العمل أو انتهاء العقد محدد المدة يستحق المكافأة كاملة 100%.';

    if (parsed.terminationType === 'RESIGNATION') {
      articleRef = 'المادة 85 من نظام العمل السعودي (استقالة الموظف)';
      if (totalYears < 2) {
        entitlementPct = 0;
        breakdownNote = 'استقالة مع خدمة أقل من سنتين: لا يستحق مكافأة نهاية خدمة (0%).';
      } else if (totalYears < 5) {
        entitlementPct = 33.333;
        breakdownNote = 'استقالة مع خدمة بين سنتين وأقل من 5 سنوات: يستحق ثلث المكافأة (33.33%).';
      } else if (totalYears < 10) {
        entitlementPct = 66.667;
        breakdownNote = 'استقالة مع خدمة بين 5 سنوات وأقل من 10 سنوات: يستحق ثلثي المكافأة (66.67%).';
      } else {
        entitlementPct = 100;
        breakdownNote = 'استقالة مع خدمة 10 سنوات فأكثر: يستحق المكافأة كاملة (100%).';
      }
    }

    const netDue = grossAmount.times(entitlementPct).dividedBy(100);

    return {
      employeeId: emp.id,
      employeeCode: emp.code,
      employeeNameAr: emp.full_name_ar,
      hireDate: emp.hire_date,
      terminationDate: parsed.terminationDate,
      totalServiceDays: totalDays,
      totalServiceYears: totalYears,
      monthlySalary: salary.toFixed(2),
      baseAmountFirst5Years: first5YearsAmount.toFixed(2),
      baseAmountAfter5Years: after5YearsAmount.toFixed(2),
      grossAmount: grossAmount.toFixed(2),
      entitlementPct,
      netEosbDue: netDue.toFixed(2),
      saudiLaborArticle: articleRef,
      calculationBreakdownAr: breakdownNote,
    };
  }

  async postSettlementJournal(companyId: string, input: z.infer<typeof EosbPostJournalInput>) {
    return this.db.tx(async () => {
      const parsed = EosbPostJournalInput.parse(input);
      let empName = parsed.employeeName || 'كادر وظيفي';
      if (parsed.employeeId) {
        const emp = await this.db.one<{ full_name_ar: string }>(
          'SELECT full_name_ar FROM hr.employees WHERE company_id = $1 AND id = $2',
          [companyId, parsed.employeeId],
        );
        if (emp) empName = emp.full_name_ar;
      }

      const expAcc = await this.db.one<{ id: string }>(
        `SELECT id FROM acc.accounts WHERE company_id = $1 AND is_posting AND is_active
            AND (code = '50103' OR account_class = 'OPERATING_EXPENSE')
          ORDER BY (code = '50103') DESC, code ASC LIMIT 1`,
        [companyId],
      );
      if (!expAcc) throw new DomainError('EOSB_EXPENSE_ACCOUNT_MISSING', 'لم يتم العثور على حساب مصروف نهاية الخدمة (50103)');

      let creditAccId: string | undefined;
      if (parsed.mode === 'PAY_NOW') {
        if (parsed.bankAccountId) {
          const bank = await this.db.one<{ gl_account_id: string }>(
            'SELECT gl_account_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2',
            [companyId, parsed.bankAccountId],
          );
          creditAccId = bank?.gl_account_id;
        }
        if (!creditAccId) {
          const bank = await this.db.one<{ gl_account_id: string }>(
            'SELECT gl_account_id FROM acc.bank_accounts WHERE company_id = $1 AND is_active ORDER BY code ASC LIMIT 1',
            [companyId],
          );
          creditAccId = bank?.gl_account_id;
        }
        if (!creditAccId) {
          const acc = await this.db.one<{ id: string }>(
            `SELECT id FROM acc.accounts WHERE company_id = $1 AND is_posting AND is_active
                AND (code IN ('10201','1110','1120') OR subtype IN ('BANK','CASH'))
              ORDER BY code ASC LIMIT 1`,
            [companyId],
          );
          creditAccId = acc?.id;
        }
      } else {
        const prov = await this.db.one<{ id: string }>(
          `SELECT id FROM acc.accounts WHERE company_id = $1 AND is_posting AND is_active
              AND (code IN ('20402','20401') OR subtype = 'PAYROLL_LIABILITY')
            ORDER BY (code = '20402') DESC, code ASC LIMIT 1`,
          [companyId],
        );
        creditAccId = prov?.id;
      }
      if (!creditAccId) {
        throw new DomainError('EOSB_CREDIT_ACCOUNT_MISSING', 'لم يتم العثور على الحساب الدائن لتسوية نهاية الخدمة');
      }

      const cnt = await this.db.one<{ n: string }>('SELECT count(*) AS n FROM pay.eosb_settlements WHERE company_id = $1', [companyId]);
      const refNo = `EOSB-${parsed.terminationDate.slice(0, 4)}-${String(Number(cnt?.n ?? 0) + 1).padStart(3, '0')}`;
      const amt = D(parsed.totalSettlement).toFixed(2);

      const entryId = await this.journal.createAndPost(companyId, {
        entryDate: parsed.terminationDate,
        journalType: parsed.mode === 'PAY_NOW' ? 'PAYMENT' : 'PAYROLL',
        sourceModule: 'payroll',
        sourceType: 'EOSB_SETTLEMENT',
        reference: refNo,
        description: `${parsed.mode === 'PAY_NOW' ? 'صرف وتصفية نهائية لمكافأة نهاية الخدمة' : 'استحقاق مخصص مكافأة نهاية الخدمة'} — ${empName} (${refNo})`,
        lines: [
          {
            accountId: expAcc.id,
            debit: amt,
            employeeId: parsed.employeeId ?? undefined,
            description: `مصروف مكافأة نهاية الخدمة والإجازات — ${empName}`,
          },
          {
            accountId: creditAccId,
            credit: amt,
            employeeId: parsed.employeeId ?? undefined,
            description: parsed.mode === 'PAY_NOW' ? `صرف التصفية النهائية من البنك — ${empName}` : `مخصص مكافأة نهاية الخدمة — ${empName}`,
          },
        ],
      });

      const saved = await this.db.one<{ id: string }>(
        `INSERT INTO pay.eosb_settlements (
           company_id, employee_id, termination_date, total_years, net_eosb, vac_pay,
           total_settlement, mode, bank_account_id, journal_entry_id, created_by
         ) VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,sys.current_user_id())
         RETURNING id`,
        [
          companyId, parsed.employeeId ?? null, parsed.terminationDate,
          parsed.totalYears, parsed.netEosb, parsed.vacPay,
          parsed.totalSettlement, parsed.mode, parsed.bankAccountId ?? null, entryId,
        ],
      );
      const je = await this.db.one<{ entry_no: string }>('SELECT entry_no FROM acc.journal_entries WHERE id = $1', [entryId]);
      return {
        id: saved!.id,
        reference: refNo,
        journalEntryId: entryId,
        journalEntryNo: je?.entry_no ?? '',
        mode: parsed.mode,
        totalSettlement: amt,
      };
    });
  }
}
