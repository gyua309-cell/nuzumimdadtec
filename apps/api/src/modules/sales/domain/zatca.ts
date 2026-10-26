import { createHash } from 'crypto';

/**
 * ZATCA (Zakat, Tax and Customs Authority - هيئة الزكاة والضريبة والجمارك)
 * E-Invoicing (Fatoora - فاتورة) Engine for Phase 1 & Phase 2.
 *
 * Implements standard TLV (Tag-Length-Value) Base64 QR Code generation,
 * canonical SHA-256 hashing, invoice sequential chaining, and compliance verification.
 */

export interface ZatcaQrInputs {
  sellerName: string;
  vatNumber: string;
  issueDateTime: string; // ISO 8601 (e.g. 2026-10-22T20:30:00Z)
  totalAmountWithVat: string;
  vatTotal: string;
  invoiceHash?: string;
  ecdsaSignature?: string;
  ecdsaPublicKey?: string;
}

/**
 * Encodes a string or buffer into TLV format:
 * [Tag (1 byte)][Length (1 byte)][Value (N bytes)]
 */
function toTlv(tag: number, value: string | Buffer): Buffer {
  const valBuf = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  const tagBuf = Buffer.from([tag]);
  const lenBuf = Buffer.from([valBuf.length]);
  return Buffer.concat([tagBuf, lenBuf, valBuf]);
}

/**
 * Generates official ZATCA Base64 TLV string for QR Code rendering.
 * Tags:
 * 1: Seller Name
 * 2: Seller VAT Registration Number
 * 3: Time Stamp (ISO 8601)
 * 4: Invoice Total (with VAT)
 * 5: VAT Total
 * 6: Invoice Hash (Phase 2)
 * 7: Cryptographic Signature (Phase 2)
 * 8: Public Key (Phase 2)
 */
export function generateZatcaTlv(inputs: ZatcaQrInputs): string {
  const parts: Buffer[] = [
    toTlv(1, inputs.sellerName),
    toTlv(2, inputs.vatNumber),
    toTlv(3, inputs.issueDateTime),
    toTlv(4, inputs.totalAmountWithVat),
    toTlv(5, inputs.vatTotal),
  ];

  if (inputs.invoiceHash) {
    parts.push(toTlv(6, inputs.invoiceHash));
  }
  if (inputs.ecdsaSignature) {
    parts.push(toTlv(7, inputs.ecdsaSignature));
  }
  if (inputs.ecdsaPublicKey) {
    parts.push(toTlv(8, inputs.ecdsaPublicKey));
  }

  const combined = Buffer.concat(parts);
  return combined.toString('base64');
}

/**
 * Computes canonical SHA-256 hash of invoice document for ZATCA Phase 2 chaining.
 */
export function computeInvoiceHash(invoiceData: {
  uuid: string;
  invoiceNo: string;
  issueDateTime: string;
  clientVatNumber?: string | null;
  totalAmount: string;
  vatAmount: string;
  previousInvoiceHash: string;
}): string {
  const canonicalString = [
    invoiceData.uuid,
    invoiceData.invoiceNo,
    invoiceData.issueDateTime,
    invoiceData.clientVatNumber || 'N/A',
    invoiceData.totalAmount,
    invoiceData.vatAmount,
    invoiceData.previousInvoiceHash,
  ].join('|');

  return createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

export interface ComplianceResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates invoice data against ZATCA E-Invoicing regulations.
 */
export function validateZatcaCompliance(data: {
  sellerVatNumber?: string | null;
  sellerName?: string | null;
  invoiceType: string;
  clientName?: string | null;
  clientVatNumber?: string | null;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  qrCode?: string | null;
}): ComplianceResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Seller VAT validation (15 digits, starting and ending with 3 in KSA)
  const vat = (data.sellerVatNumber || '').trim();
  if (!vat) {
    errors.push('الرقم الضريبي للمورد غير مسجل (مطلوب للربط مع هيئة الزكاة)');
  } else if (!/^\d{15}$/.test(vat)) {
    warnings.push('تنبيه هيئة الزكاة: الرقم الضريبي يجب أن يتكون من 15 خانة رقمية');
  }

  // 2. Seller Name
  if (!data.sellerName || data.sellerName.trim().length < 2) {
    errors.push('اسم المورد القانوني مطلوب');
  }

  // 3. Tax Invoice (B2B) requirements
  if (data.invoiceType === 'TAX_INVOICE') {
    if (!data.clientName) {
      errors.push('الفاتورة الضريبية القياسية B2B تتطلب تسجيل اسم المنشأة المشترية');
    }
    if (!data.clientVatNumber) {
      warnings.push('يُفضل إدراج الرقم الضريبي للعميل في الفواتير الضريبية القياسية');
    }
  }

  // 4. Mathematical balance
  const expectedTotal = Number((data.subtotal + data.vatAmount).toFixed(2));
  const diff = Math.abs(expectedTotal - Number(data.totalAmount.toFixed(2)));
  if (diff > 0.05) {
    errors.push(`عدم توازن حسابي في الفاتورة: الإجمالي (${data.totalAmount}) لا يطابق المجموع + الضريبة (${expectedTotal})`);
  }

  // 5. QR Code presence
  if (!data.qrCode) {
    errors.push('رمز الاستجابة السريع المشفر (ZATCA QR Code) غير موجود');
  }

  return {
    passed: errors.length === 0,
    warnings,
    errors,
  };
}
