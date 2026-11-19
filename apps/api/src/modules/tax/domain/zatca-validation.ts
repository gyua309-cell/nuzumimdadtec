/**
 * ZATCA Fatoora Phase 2 Pre-Submission Validation Engine (22 Mandatory Checks)
 * Produces precise Arabic validation errors mapped to specific fields before XML signing or API call.
 */

export interface ZatcaValidationIssue {
  field: string;
  fieldLabelAr: string;
  code: string;
  messageAr: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ZatcaValidationInput {
  invoiceNo?: string | null;
  invoiceType?: string | null; // TAX_INVOICE | SIMPLIFIED | CREDIT_NOTE | DEBIT_NOTE
  invoiceSubType?: string | null;
  uuid?: string | null;
  issueDate?: string | null;
  issueTime?: string | null;
  currencyCode?: string | null;
  originalInvoiceNo?: string | null;
  returnReason?: string | null;
  subtotal: number;
  discountAmount?: number;
  taxableAmount: number;
  vatAmount: number;
  totalAmount: number;
  seller: {
    name?: string | null;
    vatNumber?: string | null;
    crNumber?: string | null;
    buildingNumber?: string | null;
    streetName?: string | null;
    district?: string | null;
    city?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
  };
  buyer: {
    name?: string | null;
    vatNumber?: string | null;
    crNumber?: string | null;
    buildingNumber?: string | null;
    streetName?: string | null;
    district?: string | null;
    city?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
    buyerType?: string | null;
  };
  lines: Array<{
    lineNo?: number;
    description?: string | null;
    quantity: number;
    unitPrice: number;
    discountPct?: number;
    discountAmount?: number;
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
    vatCategory?: string | null;
    vatExemptionReason?: string | null;
  }>;
  icv?: number | null;
  pih?: string | null;
}

export interface ZatcaValidationReport {
  valid: boolean;
  checkedCount: number;
  passedCount: number;
  errors: ZatcaValidationIssue[];
  warnings: ZatcaValidationIssue[];
  recommendedSubmissionType: 'CLEARANCE' | 'REPORTING';
  recommendedInvoiceType: 'TAX_INVOICE' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KSA_VAT_REGEX = /^3\d{13}3$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function determineRecommendedZatcaType(params: {
  invoiceType?: string | null;
  buyerVatNumber?: string | null;
  buyerType?: string | null;
}): { invoiceType: 'TAX_INVOICE' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE'; submissionType: 'CLEARANCE' | 'REPORTING' } {
  const rawType = (params.invoiceType || '').toUpperCase();
  const hasValidBuyerVat = KSA_VAT_REGEX.test((params.buyerVatNumber || '').trim());
  const isB2B = params.buyerType === 'B2B' || hasValidBuyerVat;

  if (rawType === 'CREDIT_NOTE') {
    return { invoiceType: 'CREDIT_NOTE', submissionType: isB2B ? 'CLEARANCE' : 'REPORTING' };
  }
  if (rawType === 'DEBIT_NOTE') {
    return { invoiceType: 'DEBIT_NOTE', submissionType: isB2B ? 'CLEARANCE' : 'REPORTING' };
  }
  if (rawType === 'SIMPLIFIED') {
    return { invoiceType: 'SIMPLIFIED', submissionType: 'REPORTING' };
  }
  if (rawType === 'TAX_INVOICE') {
    return { invoiceType: 'TAX_INVOICE', submissionType: 'CLEARANCE' };
  }
  return isB2B
    ? { invoiceType: 'TAX_INVOICE', submissionType: 'CLEARANCE' }
    : { invoiceType: 'SIMPLIFIED', submissionType: 'REPORTING' };
}

export function validateInvoiceForZatca(input: ZatcaValidationInput): ZatcaValidationReport {
  const errors: ZatcaValidationIssue[] = [];
  const warnings: ZatcaValidationIssue[] = [];
  const totalChecks = 22;

  const pushErr = (field: string, fieldLabelAr: string, code: string, messageAr: string) =>
    errors.push({ field, fieldLabelAr, code, messageAr, severity: 'ERROR' });
  const pushWarn = (field: string, fieldLabelAr: string, code: string, messageAr: string) =>
    warnings.push({ field, fieldLabelAr, code, messageAr, severity: 'WARNING' });

  const resolved = determineRecommendedZatcaType({
    invoiceType: input.invoiceType,
    buyerVatNumber: input.buyer?.vatNumber,
    buyerType: input.buyer?.buyerType,
  });
  const isStandardFlow = resolved.submissionType === 'CLEARANCE';
  const isNote = resolved.invoiceType === 'CREDIT_NOTE' || resolved.invoiceType === 'DEBIT_NOTE';

  // 1. Seller Name
  if (!input.seller?.name || input.seller.name.trim().length < 2) {
    pushErr('seller.name', 'اسم المنشأة الموردة', 'BR-KSA-SELLER-NAME', 'اسم المنشأة المسجّل في إعدادات ZATCA مطلوب.');
  }

  // 2. Seller VAT (15 digits starting and ending with 3)
  const sellerVat = (input.seller?.vatNumber || '').trim();
  if (!sellerVat) {
    pushErr('seller.vatNumber', 'الرقم الضريبي للمنشأة', 'BR-KSA-39', 'الرقم الضريبي للمنشأة (VAT Number) مطلوب للربط مع الهيئة.');
  } else if (!KSA_VAT_REGEX.test(sellerVat)) {
    pushErr('seller.vatNumber', 'الرقم الضريبي للمنشأة', 'BR-KSA-40', 'الرقم الضريبي للمنشأة غير صحيح: يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3.');
  }

  // 3. Seller CR Number
  if (!input.seller?.crNumber || input.seller.crNumber.trim().length < 5) {
    pushWarn('seller.crNumber', 'السجل التجاري للمنشأة', 'BR-KSA-08', 'يُوصى بتسجيل رقم السجل التجاري (CRN) في إعدادات المنشأة.');
  }

  // 4-8. Seller Structured National Address (Mandatory for Phase 2 KSA)
  if (!input.seller?.streetName?.trim()) {
    pushErr('seller.streetName', 'الشارع (العنوان الوطني)', 'BR-KSA-09-STR', 'اسم الشارع في العنوان الوطني للمنشأة مطلوب وفق معيار UBL 2.1.');
  }
  if (!input.seller?.buildingNumber?.trim() || !/^\d{4}$/.test(input.seller.buildingNumber.trim())) {
    pushErr('seller.buildingNumber', 'رقم المبنى', 'BR-KSA-37', 'رقم المبنى للمنشأة يجب أن يتكون من 4 أرقام وفق العنوان الوطني السعودي.');
  }
  if (!input.seller?.district?.trim()) {
    pushErr('seller.district', 'الحي', 'BR-KSA-09-DIST', 'اسم الحي في العنوان الوطني للمنشأة إلزامي في المرحلة الثانية.');
  }
  if (!input.seller?.city?.trim()) {
    pushErr('seller.city', 'المدينة', 'BR-KSA-09-CITY', 'اسم المدينة في العنوان الوطني للمنشأة إلزامي.');
  }
  if (!input.seller?.postalCode?.trim() || !/^\d{5}$/.test(input.seller.postalCode.trim())) {
    pushErr('seller.postalCode', 'الرمز البريدي', 'BR-KSA-66', 'الرمز البريدي للمنشأة يجب أن يتكون من 5 أرقام سعودية.');
  }

  // 9-11. Buyer Validation (Strict for Standard B2B Clearance)
  if (!input.buyer?.name?.trim()) {
    if (isStandardFlow) {
      pushErr('buyer.name', 'اسم العميل', 'BR-KSA-BUYER-NAME', 'اسم المنشأة المشترية (العميل) إلزامي في الفاتورة الضريبية القياسية (B2B).');
    } else {
      pushWarn('buyer.name', 'اسم العميل', 'BR-KSA-SIMP-BUYER', 'يُفضل تسجيل اسم العميل في الفاتورة المبسطة.');
    }
  }
  const buyerVat = (input.buyer?.vatNumber || '').trim();
  if (isStandardFlow) {
    if (!buyerVat) {
      pushErr('buyer.vatNumber', 'الرقم الضريبي للعميل', 'BR-KSA-46', 'الرقم الضريبي للعميل إلزامي للفاتورة الضريبية القياسية (Clearance B2B).');
    } else if (!KSA_VAT_REGEX.test(buyerVat)) {
      pushErr('buyer.vatNumber', 'الرقم الضريبي للعميل', 'BR-KSA-47', 'الرقم الضريبي للعميل يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3.');
    }
    if (!input.buyer?.city?.trim() || !input.buyer?.streetName?.trim()) {
      pushWarn('buyer.address', 'عنوان العميل الوطني', 'BR-KSA-63', 'يُوصى باستكمال بيانات العنوان الوطني للعميل (الشارع، الحي، المدينة، الرمز البريدي) لتجنب تحذيرات الهيئة.');
    }
  }

  // 12. Invoice Number
  if (!input.invoiceNo || input.invoiceNo.trim().length < 2) {
    pushErr('invoiceNo', 'رقم الفاتورة', 'BR-02', 'رقم الفاتورة التسلسلي مطلوب.');
  }

  // 13. UUID
  if (!input.uuid || !UUID_REGEX.test(input.uuid.trim())) {
    pushErr('uuid', 'المعرّف الفريد UUID', 'BR-KSA-03', 'المعرّف الفريد للفاتورة (UUID v4/v7) غير صالح أو مفقود.');
  }

  // 14. Issue Date & Time
  if (!input.issueDate || !ISO_DATE_REGEX.test(input.issueDate.slice(0, 10))) {
    pushErr('issueDate', 'تاريخ الإصدار', 'BR-03', 'تاريخ إصدار الفاتورة يجب أن يكون بصيغة YYYY-MM-DD.');
  }
  if (!input.issueTime) {
    pushWarn('issueTime', 'وقت الإصدار', 'BR-KSA-70', 'سيتم استخدام وقت الخادم UTC عند توليد ملف XML.');
  }

  // 15. Currency
  if (!input.currencyCode || !/^[A-Z]{3}$/.test(input.currencyCode.toUpperCase())) {
    pushErr('currencyCode', 'عملة الفاتورة', 'BR-05', 'رمز العملة يجب أن يتكون من 3 أحرف ISO (مثل SAR).');
  }

  // 16. Credit / Debit Note Mandatory Reference & Reason
  if (isNote) {
    if (!input.originalInvoiceNo?.trim()) {
      pushErr('originalInvoiceNo', 'رقم الفاتورة الأصلية', 'BR-KSA-56', 'الإشعار الدائن أو المدين يتطلب ربطه برقم الفاتورة الأصلية (BillingReference).');
    }
    if (!input.returnReason?.trim() || input.returnReason.trim().length < 3) {
      pushErr('returnReason', 'سبب الإشعار', 'BR-KSA-17', 'سبب إصدار الإشعار الدائن أو المدين (InstructionNote) إلزامي وفق قواعد ZATCA.');
    }
  }

  // 17-20. Lines, Quantities, Prices, Discounts, Tax Categories & Exemptions
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    pushErr('lines', 'بنود الفاتورة', 'BR-16', 'يجب أن تحتوي الفاتورة على بند واحد على الأقل.');
  } else {
    let linesSubtotalSum = 0;
    let linesVatSum = 0;
    input.lines.forEach((l, idx) => {
      const n = l.lineNo ?? idx + 1;
      if (!l.description?.trim()) {
        pushErr(`lines[${idx}].description`, `وصف البند #${n}`, 'BR-25', `وصف الصنف/الخدمة في البند رقم ${n} مطلوب.`);
      }
      if (!(Number(l.quantity) > 0)) {
        pushErr(`lines[${idx}].quantity`, `كمية البند #${n}`, 'BR-22', `الكمية في البند رقم ${n} يجب أن تكون أكبر من صفر.`);
      }
      if (Number(l.unitPrice) < 0) {
        pushErr(`lines[${idx}].unitPrice`, `سعر البند #${n}`, 'BR-27', `سعر الوحدة في البند رقم ${n} لا يمكن أن يكون سالباً.`);
      }
      const cat = (l.vatCategory || 'S').toUpperCase();
      if (!['S', 'Z', 'E', 'O'].includes(cat)) {
        pushErr(`lines[${idx}].vatCategory`, `فئة الضريبة للبند #${n}`, 'BR-KSA-18', `فئة الضريبة (${cat}) غير مدعومة؛ يجب أن تكون S أو Z أو E أو O.`);
      }
      if (cat === 'S' && Math.abs(Number(l.vatRate) - 15) > 0.01 && Math.abs(Number(l.vatRate) - 5) > 0.01) {
        pushWarn(`lines[${idx}].vatRate`, `نسبة الضريبة للبند #${n}`, 'BR-KSA-RATE', `النسبة القياسية المعتمدة في السعودية هي 15% (الحالية: ${l.vatRate}%).`);
      }
      if (['Z', 'E', 'O'].includes(cat)) {
        if (Number(l.vatRate) !== 0 || Number(l.vatAmount) !== 0) {
          pushErr(`lines[${idx}].vatRate`, `ضريبة البند المعفى #${n}`, 'BR-Z-05', `البند رقم ${n} بفئة (${cat}) يجب أن تكون نسبته ومبلغ ضريبته 0%.`);
        }
        if (!l.vatExemptionReason?.trim()) {
          pushErr(`lines[${idx}].vatExemptionReason`, `سبب الإعفاء للبند #${n}`, 'BR-KSA-E-01', `يجب تحديد سبب الإعفاء أو الصفرية الضريبية للبند رقم ${n} (فئة ${cat}).`);
        }
      }
      linesSubtotalSum += Number(l.subtotal || 0);
      linesVatSum += Number(l.vatAmount || 0);
    });

    // 21. Mathematical Integrity (Header vs Lines & Tax Inclusive)
    const expectedTotal = Number((Number(input.taxableAmount) + Number(input.vatAmount)).toFixed(2));
    if (Math.abs(expectedTotal - Number(input.totalAmount.toFixed(2))) > 0.05) {
      pushErr(
        'totalAmount',
        'الإجمالي شامل الضريبة',
        'BR-CO-15',
        `عدم تطابق حسابي: الإجمالي (${input.totalAmount.toFixed(2)}) لا يساوي المبلغ الخاضع (${input.taxableAmount.toFixed(2)}) + الضريبة (${input.vatAmount.toFixed(2)}).`,
      );
    }
    if (Math.abs(linesSubtotalSum - Number(input.subtotal)) > 0.1) {
      pushWarn('subtotal', 'مجموع البنود', 'BR-CO-10', `مجموع صافي البنود (${linesSubtotalSum.toFixed(2)}) يختلف عن الإجمالي الفرعي (${Number(input.subtotal).toFixed(2)}).`);
    }
    if (Math.abs(linesVatSum - Number(input.vatAmount)) > 0.1) {
      pushWarn('vatAmount', 'إجمالي الضريبة', 'BR-CO-14', `مجموع ضريبة البنود (${linesVatSum.toFixed(2)}) يختلف عن إجمالي الضريبة (${Number(input.vatAmount).toFixed(2)}).`);
    }
  }

  // 22. ICV & PIH Chaining Integrity
  if (input.icv != null && Number(input.icv) < 1) {
    pushErr('icv', 'العداد التسلسلي ICV', 'BR-KSA-33', 'العداد التسلسلي للفاتورة (ICV) يجب أن يكون رقماً صحيحاً أكبر من 0.');
  }
  if (!input.pih?.trim()) {
    pushWarn('pih', 'تجزئة الفاتورة السابقة PIH', 'BR-KSA-26', 'سيتم استخدام تجزئة البداية القياسية للهيئة عند الإرسال الأول.');
  }

  return {
    valid: errors.length === 0,
    checkedCount: totalChecks,
    passedCount: Math.max(0, totalChecks - errors.length),
    errors,
    warnings,
    recommendedSubmissionType: resolved.submissionType,
    recommendedInvoiceType: resolved.invoiceType,
  };
}
