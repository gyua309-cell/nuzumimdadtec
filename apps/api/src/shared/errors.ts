import { HttpStatus } from '@nestjs/common';

/**
 * Business error with a stable machine code. Mapped to RFC 7807 problem+json
 * by the global exception filter.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
    public readonly status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super('NOT_FOUND', `${entity}${id ? ` ${id}` : ''} not found`, HttpStatus.NOT_FOUND);
  }
}

export class ConflictError extends DomainError {
  constructor(code = 'CONFLICT', message?: string) {
    super(code, message, HttpStatus.CONFLICT);
  }
}

export class ForbiddenError extends DomainError {
  constructor(code = 'FORBIDDEN', message?: string) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

/** Arabic messages for the stable error codes (UI shows these). */
export const ERROR_MESSAGES_AR: Record<string, string> = {
  NOT_FOUND: 'السجل غير موجود',
  CONFLICT: 'تعارض في البيانات، يرجى إعادة التحميل',
  VERSION_CONFLICT: 'تم تعديل السجل بواسطة مستخدم آخر، يرجى إعادة التحميل',
  VALIDATION_FAILED: 'البيانات المدخلة غير صحيحة',
  UNAUTHENTICATED: 'يجب تسجيل الدخول',
  INVALID_CREDENTIALS: 'اسم المستخدم أو كلمة المرور غير صحيحة',
  ACCOUNT_LOCKED: 'الحساب مقفل مؤقتًا بسبب محاولات دخول فاشلة',
  FORBIDDEN: 'ليست لديك صلاحية لهذه العملية',
  COMPANY_ACCESS_DENIED: 'ليست لديك صلاحية على هذه الشركة',
  SETUP_ALREADY_COMPLETED: 'تم إعداد النظام مسبقًا',
  JE_UNBALANCED: 'القيد غير متوازن: مجموع المدين لا يساوي مجموع الدائن',
  JE_TOO_FEW_LINES: 'القيد يجب أن يحتوي على سطرين على الأقل',
  JE_MUST_START_AS_DRAFT: 'القيد يجب أن يبدأ كمسودة',
  POSTED_JE_IMMUTABLE: 'لا يمكن تعديل قيد مرحّل؛ استخدم العكس أو التسوية',
  CANCELLED_JE_IMMUTABLE: 'لا يمكن تعديل قيد ملغى',
  JE_LINES_LOCKED: 'لا يمكن تعديل سطور قيد غير مسودة',
  JE_DELETE_FORBIDDEN: 'لا يمكن حذف قيد غير مسودة',
  JE_NOT_DRAFT: 'العملية متاحة للقيود المسودة فقط',
  JE_NOT_POSTED: 'العملية متاحة للقيود المرحّلة فقط',
  JE_ALREADY_REVERSED: 'تم عكس هذا القيد مسبقًا',
  PERIOD_NOT_OPEN: 'الفترة المالية غير مفتوحة',
  PERIOD_NOT_FOUND_FOR_DATE: 'لا توجد فترة مالية تغطي هذا التاريخ',
  PERIOD_HAS_DRAFT_ENTRIES: 'الفترة تحتوي على قيود مسودة',
  ENTRY_DATE_OUTSIDE_PERIOD: 'تاريخ القيد خارج الفترة المالية',
  NON_POSTING_ACCOUNT: 'لا يمكن الترحيل على حساب تجميعي أو غير نشط',
  CONTROL_ACCOUNT_MANUAL_POSTING: 'لا يمكن الترحيل يدويًا على حساب رقابي',
  ACCOUNT_CURRENCY_MISMATCH: 'عملة السطر لا تطابق عملة الحساب',
  REQUIRED_DIMENSION_MISSING: 'الحساب يتطلب بُعدًا تحليليًا (مشروع/موظف/مركز تكلفة)',
  FX_CONVERSION_INCONSISTENT: 'مبلغ العملة الأساسية لا يطابق سعر الصرف',
  EXCHANGE_RATE_MISSING: 'سعر الصرف غير موجود لهذا التاريخ',
  ACCOUNT_PARENT_MUST_BE_HEADER: 'الحساب الأب يجب أن يكون حسابًا تجميعيًا',
  ACCOUNT_CLASS_MISMATCH_WITH_PARENT: 'تصنيف الحساب يجب أن يطابق تصنيف الحساب الأب',
  ACCOUNT_TREE_CYCLE: 'لا يمكن نقل الحساب تحت أحد فروعه',
  ACCOUNT_HAS_TRANSACTIONS: 'الحساب عليه حركات',
  ACCOUNT_HAS_CHILDREN: 'الحساب له حسابات فرعية',
  ACCOUNT_CLASS_LOCKED: 'لا يمكن تغيير تصنيف حساب عليه حركات أو له فروع',
  BASE_CURRENCY_LOCKED: 'لا يمكن تغيير العملة الأساسية بعد تسجيل قيود',
  POSTING_RULE_MISSING: 'لا توجد قاعدة ترحيل صالحة لهذا الحدث',
  REASON_REQUIRED: 'يجب إدخال السبب',
  FISCAL_YEAR_OVERLAP: 'السنة المالية تتداخل مع سنة موجودة',
  DUPLICATE: 'القيمة مكررة',
  REFERENCED: 'لا يمكن الحذف لوجود بيانات مرتبطة',
  IDEMPOTENCY_CONFLICT: 'تم تنفيذ هذا الطلب مسبقًا',
  EFFECTIVE_DATE_NOT_AFTER_CURRENT: 'تاريخ السريان يجب أن يكون بعد آخر إصدار مسجل',
  FUTURE_VERSION_EXISTS: 'يوجد إصدار لاحق؛ احذفه أولًا',
  NO_OPEN_VERSION: 'لا يوجد إصدار ساري في هذا التاريخ',
  ONLY_LATEST_VERSION_REMOVABLE: 'يمكن حذف آخر إصدار فقط',
  LAST_VERSION_REQUIRED: 'لا يمكن حذف الإصدار الأول',
  HISTORY_LOCKED_BY_CLOSED_PERIOD: 'لا يمكن تعديل بيانات تاريخية داخل فترة مقفلة',
  DATE_OUTSIDE_EMPLOYMENT: 'التاريخ خارج فترة خدمة الموظف',
  STATUS_UNCHANGED: 'الموظف بنفس الحالة بالفعل',
  COMPONENT_IN_USE: 'المكون مستخدم في رواتب مرحّلة؛ أنشئ مكونًا جديدًا',
  ADJUSTMENT_PERIOD_NOT_ALLOWED: 'استخدم فترة شهرية عادية',
  ASSET_NOT_DRAFT: 'العملية متاحة للأصول المسودة فقط',
  ASSET_FINANCIALS_LOCKED: 'لا يمكن تعديل البيانات المالية لأصل مفعّل',
  ASSET_NOT_ACTIVE: 'الأصل غير مفعّل',
  NOTHING_TO_DEPRECIATE: 'لا يوجد إهلاك مستحق لهذه الفترة',
  DEPRECIATION_NOT_UP_TO_DATE: 'يجب ترحيل الإهلاك المستحق حتى تاريخ الاستبعاد أولًا',
  DEPRECIATION_RUN_EXISTS: 'تم تشغيل الإهلاك لهذه الفترة مسبقًا',
  NOT_LATEST_RUN: 'يمكن إلغاء آخر تشغيل فقط',
  ACCOUNT_DETERMINATION_FAILED: 'تعذر تحديد الحساب من الإعدادات',
  EMPLOYEE_NOT_ACTIVE: 'الموظف غير نشط في هذا التاريخ',
  INVALID_RECEIVABLE_ACCOUNT: 'حساب العميل يجب أن يكون حساب أصول نشطًا قابلًا للترحيل',
  CLIENT_INACTIVE: 'العميل غير نشط',
  PROJECT_CANCELLED: 'المشروع ملغى ولا يمكن تعديله',
  PROJECT_CLIENT_LOCKED: 'لا يمكن تغيير العميل بعد تفعيل المشروع',
  PROJECT_CURRENCY_LOCKED: 'لا يمكن تغيير عملة المشروع بعد تفعيله',
  PROJECT_TRANSITION_NOT_ALLOWED: 'لا يمكن نقل المشروع إلى هذه الحالة',
  PROJECT_DATES_CONFLICT_ASSIGNMENTS: 'توجد تخصيصات خارج تواريخ المشروع الجديدة',
  PROJECT_NOT_OPEN_FOR_ASSIGNMENT: 'المشروع مغلق أمام تخصيصات جديدة',
  DATE_OUTSIDE_PROJECT: 'التاريخ خارج فترة المشروع',
  ASSIGNMENT_OUTSIDE_PROJECT: 'التخصيص خارج فترة المشروع',
  DATE_OUTSIDE_ASSIGNMENT: 'التاريخ خارج فترة التخصيص',
  INVALID_DATE_RANGE: 'نطاق التواريخ غير صحيح',
  PRICE_OVERLAP: 'إصدارات السعر لا يجوز أن تتداخل؛ أنهِ الإصدار الحالي أولًا',
  // Payroll module
  VARIABLE_TYPE_INACTIVE: 'نوع المتغير غير نشط',
  VARIABLE_NOT_DRAFT: 'يمكن التعديل على المتغيرات المسودة فقط',
  EMPLOYEE_SALARY_NOT_FOUND: 'لا يوجد راتب أساسي للموظف في هذه الفترة',
  LOAN_NOT_ACTIVE: 'يمكن إلغاء القروض النشطة فقط',
  LOAN_HAS_DEDUCTIONS: 'لا يمكن إلغاء قرض تم خصم أقساط منه',
  INSTALLMENT_NOT_PENDING: 'يمكن تأجيل الأقساط المعلقة فقط',
  INSUFFICIENT_PERIODS: 'لا توجد فترات مالية كافية لجدولة الأقساط',
  PAYROLL_RUN_EXISTS: 'يوجد مسير رواتب لهذه الفترة بالفعل',
  PAYROLL_NO_EMPLOYEES: 'لا يوجد موظفون نشطون لتشغيل مسير الرواتب',
  PAYROLL_RUN_NOT_POSTED: 'يمكن إلغاء مسيرات الرواتب المرحّلة فقط',
};
