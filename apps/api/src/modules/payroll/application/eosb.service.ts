import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { D } from '../../../shared/money';
import { NotFoundError } from '../../../shared/errors';

export const EosbCalculationInput = z.object({
  employeeId: z.string().uuid(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ YYYY-MM-DD مطلوبة'),
  terminationType: z.enum(['TERMINATION_BY_EMPLOYER', 'RESIGNATION', 'CONTRACT_EXPIRY', 'FORCE_MAJEURE', 'RETIREMENT']),
  reason: z.string().trim().max(500).optional(),
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
  constructor(private readonly db: DbService) {}

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
      housing_allowance: string;
      transport_allowance: string;
    }>(
      `SELECT e.id, e.code, e.full_name_ar, e.hire_date::text,
              COALESCE(c.basic_salary, 0)::text as basic_salary,
              COALESCE(c.housing_allowance, 0)::text as housing_allowance,
              COALESCE(c.transport_allowance, 0)::text as transport_allowance
         FROM hr.employees e
         LEFT JOIN hr.employee_contracts c ON c.employee_id = e.id AND c.is_active = true
        WHERE e.id = $1 AND e.company_id = $2`,
      [parsed.employeeId, companyId],
    );

    if (!emp) throw new NotFoundError('EMPLOYEE_NOT_FOUND', 'الموظف غير موجود');

    const hireDate = new Date(emp.hire_date);
    const termDate = new Date(parsed.terminationDate);

    const diffMs = termDate.getTime() - hireDate.getTime();
    if (diffMs < 0) {
      throw new Error('تاريخ نهاية الخدمة لا يمكن أن يكون قبل تاريخ التعيين');
    }

    const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const totalYears = Number((totalDays / 365.25).toFixed(2));

    // Full wage base = Basic + Housing + Transport
    const salary = D(emp.basic_salary).plus(D(emp.housing_allowance)).plus(D(emp.transport_allowance));
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
}
