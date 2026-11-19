/**
 * ZATCA Phase 2 Unified Status Engine (15 Official States + Safe Legacy Mapping)
 * Enforces strict state transitions, duplicate-submission prevention, and invoice immutability.
 */

export const ZATCA_STATUSES = [
  'DRAFT',
  'READY',
  'VALIDATION_FAILED',
  'PENDING_SUBMISSION',
  'SUBMITTED',
  'PROCESSING',
  'REPORTED',
  'CLEARED',
  'ACCEPTED',
  'REJECTED',
  'FAILED',
  'RETRY_PENDING',
  'CANCELLED',
  'CREDIT_NOTE_ISSUED',
  'DEBIT_NOTE_ISSUED',
] as const;

export type ZatcaUnifiedStatus = (typeof ZATCA_STATUSES)[number] | 'NOT_SUBMITTED' | 'WARNING';

export interface ZatcaStatusMeta {
  code: ZatcaUnifiedStatus;
  labelAr: string;
  labelEn: string;
  color: 'slate' | 'blue' | 'indigo' | 'amber' | 'green' | 'red' | 'purple' | 'cyan';
  isTerminalAccepted: boolean;
  isLocked: boolean;
  canSubmit: boolean;
  canRetry: boolean;
}

export const ZATCA_STATUS_META: Record<ZatcaUnifiedStatus, ZatcaStatusMeta> = {
  DRAFT: {
    code: 'DRAFT',
    labelAr: 'مسودة (غير جاهزة)',
    labelEn: 'Draft',
    color: 'slate',
    isTerminalAccepted: false,
    isLocked: false,
    canSubmit: false,
    canRetry: false,
  },
  NOT_SUBMITTED: {
    code: 'NOT_SUBMITTED',
    labelAr: 'بانتظار الإرسال للهيئة',
    labelEn: 'Not Submitted',
    color: 'amber',
    isTerminalAccepted: false,
    isLocked: false,
    canSubmit: true,
    canRetry: false,
  },
  READY: {
    code: 'READY',
    labelAr: 'جاهزة للإرسال (مطابقة)',
    labelEn: 'Ready',
    color: 'blue',
    isTerminalAccepted: false,
    isLocked: false,
    canSubmit: true,
    canRetry: false,
  },
  VALIDATION_FAILED: {
    code: 'VALIDATION_FAILED',
    labelAr: 'فشل التحقق قبل الإرسال',
    labelEn: 'Validation Failed',
    color: 'red',
    isTerminalAccepted: false,
    isLocked: false,
    canSubmit: true,
    canRetry: false,
  },
  PENDING_SUBMISSION: {
    code: 'PENDING_SUBMISSION',
    labelAr: 'قيد الانتظار للإرسال',
    labelEn: 'Pending Submission',
    color: 'amber',
    isTerminalAccepted: false,
    isLocked: true,
    canSubmit: true,
    canRetry: true,
  },
  SUBMITTED: {
    code: 'SUBMITTED',
    labelAr: 'تم الإرسال (بانتظار الرد)',
    labelEn: 'Submitted',
    color: 'indigo',
    isTerminalAccepted: false,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  PROCESSING: {
    code: 'PROCESSING',
    labelAr: 'قيد المعالجة لدى الهيئة',
    labelEn: 'Processing',
    color: 'indigo',
    isTerminalAccepted: false,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  REPORTED: {
    code: 'REPORTED',
    labelAr: 'مُبلَّغ عنها رسمياً (Reported)',
    labelEn: 'Reported',
    color: 'green',
    isTerminalAccepted: true,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  CLEARED: {
    code: 'CLEARED',
    labelAr: 'مُخلَّصة ومعتمدة (Cleared)',
    labelEn: 'Cleared',
    color: 'green',
    isTerminalAccepted: true,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  ACCEPTED: {
    code: 'ACCEPTED',
    labelAr: 'مقبولة من الهيئة (Accepted)',
    labelEn: 'Accepted',
    color: 'green',
    isTerminalAccepted: true,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  WARNING: {
    code: 'WARNING',
    labelAr: 'مقبولة بتحذيرات الهيئة',
    labelEn: 'Accepted with Warnings',
    color: 'amber',
    isTerminalAccepted: true,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  REJECTED: {
    code: 'REJECTED',
    labelAr: 'مرفوضة من الهيئة (Rejected)',
    labelEn: 'Rejected',
    color: 'red',
    isTerminalAccepted: false,
    isLocked: false,
    canSubmit: true,
    canRetry: true,
  },
  FAILED: {
    code: 'FAILED',
    labelAr: 'فشل الإرسال التقني (Failed)',
    labelEn: 'Failed',
    color: 'red',
    isTerminalAccepted: false,
    isLocked: false,
    canSubmit: true,
    canRetry: true,
  },
  RETRY_PENDING: {
    code: 'RETRY_PENDING',
    labelAr: 'بانتظار إعادة المحاولة (Retry)',
    labelEn: 'Retry Pending',
    color: 'amber',
    isTerminalAccepted: false,
    isLocked: true,
    canSubmit: true,
    canRetry: true,
  },
  CANCELLED: {
    code: 'CANCELLED',
    labelAr: 'ملغاة',
    labelEn: 'Cancelled',
    color: 'slate',
    isTerminalAccepted: false,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  CREDIT_NOTE_ISSUED: {
    code: 'CREDIT_NOTE_ISSUED',
    labelAr: 'صدر لها إشعار دائن',
    labelEn: 'Credit Note Issued',
    color: 'purple',
    isTerminalAccepted: true,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
  DEBIT_NOTE_ISSUED: {
    code: 'DEBIT_NOTE_ISSUED',
    labelAr: 'صدر لها إشعار مدين',
    labelEn: 'Debit Note Issued',
    color: 'cyan',
    isTerminalAccepted: true,
    isLocked: true,
    canSubmit: false,
    canRetry: false,
  },
};

export function getZatcaStatusMeta(status: string | null | undefined): ZatcaStatusMeta {
  const key = (status || 'NOT_SUBMITTED') as ZatcaUnifiedStatus;
  return ZATCA_STATUS_META[key] ?? ZATCA_STATUS_META.NOT_SUBMITTED;
}

/**
 * Prevents duplicate transmission of already Cleared / Reported / Accepted invoices.
 */
export function assertCanTransmitToZatca(currentStatus: string, isInvoicePosted: boolean): { ok: boolean; reasonAr?: string } {
  if (!isInvoicePosted) {
    return { ok: false, reasonAr: 'يجب ترحيل الفاتورة محاسبياً أولاً قبل إرسالها إلى هيئة الزكاة.' };
  }
  const meta = getZatcaStatusMeta(currentStatus);
  if (meta.isTerminalAccepted) {
    return {
      ok: false,
      reasonAr: `لا يمكن إعادة إرسال هذه الفاتورة لأنها معتمدة مسبقاً لدى الهيئة بحالة (${meta.labelAr}). لإجراء تعديل، أصدر إشعاراً دائناً أو مديناً.`,
    };
  }
  if (currentStatus === 'SUBMITTED' || currentStatus === 'PROCESSING') {
    return {
      ok: false,
      reasonAr: 'الفاتورة قيد الإرسال والمعالجة حالياً لدى هيئة الزكاة، يرجى انتظار الاستجابة لمنع التكرار.',
    };
  }
  if (currentStatus === 'CANCELLED') {
    return { ok: false, reasonAr: 'لا يمكن إرسال فاتورة ملغاة إلى هيئة الزكاة.' };
  }
  return { ok: true };
}

/**
 * Checks whether an invoice is locked against editing/deletion due to ZATCA submission.
 */
export function isLockedByZatca(currentStatus: string | null | undefined, lockedFlag?: boolean): boolean {
  if (lockedFlag) return true;
  const meta = getZatcaStatusMeta(currentStatus);
  return meta.isTerminalAccepted || currentStatus === 'SUBMITTED' || currentStatus === 'PROCESSING';
}
