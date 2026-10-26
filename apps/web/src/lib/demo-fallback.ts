/**
 * Demo fallback data for cloud previews (e.g. Vercel static deployment)
 * when the backend API is running locally or unconfigured.
 */

export function getDemoFallback(path: string): any {
  if (path.includes('/zatca/status')) {
    return {
      environment: 'SIMULATION',
      csidStatus: 'PRODUCTION',
      csidExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      readyToTransmit: true,
      transmissionAvailable: true,
      transmissionNoteAr: 'منظومة ZATCA مفعّلة وجاهزة بالكامل (المرحلة 2). يتم اعتماد الفواتير وتوليد ملفات XML UBL 2.1 والأختام الرقمية وتشفير رموز QR فورياً.',
      checklist: [
        { key: 'vat', labelAr: 'الرقم الضريبي للمنشأة (15 رقماً)', ok: true, hintAr: '310123456700003' },
        { key: 'cr', labelAr: 'رقم السجل التجاري', ok: true, hintAr: '1010123456' },
        { key: 'egs', labelAr: 'تعريف وحدة الفوترة الإلكترونية (EGS)', ok: true, hintAr: 'EGS-AZM-01' },
        { key: 'csid', labelAr: 'شهادة CSID من هيئة الزكاة والضريبة والجمارك', ok: true, hintAr: 'معتمدة' },
        { key: 'prod', labelAr: 'شهادة الإنتاج المعتمدة (Production CSID)', ok: true, hintAr: 'صالحة لسنة' },
        { key: 'clientVat', labelAr: 'الرقم الضريبي لعملاء الفواتير الضريبية (B2B)', ok: true, hintAr: 'مطابق' },
        { key: 'ublEngine', labelAr: 'محرك توليد مستندات UBL 2.1 XML والتجزئة SHA-256', ok: true, hintAr: 'مدمج ومطابق' },
      ],
      submittedCount: 2,
      pendingCount: 0,
      invoicesByStatus: {
        CLEARED: { count: 2, total: '174800.00' },
        REPORTED: { count: 0, total: '0.00' },
        NOT_SUBMITTED: { count: 0, total: '0.00' },
      },
      nonCompliant: [],
    };
  }

  if (path.includes('/zatca/settings')) {
    return {
      environment: 'SIMULATION',
      vatNumber: '310123456700003',
      crNumber: '1010123456',
      egsUnitName: 'EGS-AZM-01',
      egsSerialNo: 'AZM-KSA-2026-EGS-001',
      csidStatus: 'PRODUCTION',
      csidExpiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      hasCryptoKeys: true,
    };
  }

  if (path.includes('/zatca/submissions')) {
    return [
      {
        id: 'sub-01',
        invoiceNo: 'INV-2026-0002',
        attemptNo: 1,
        environment: 'SIMULATION',
        mode: 'CLEARANCE',
        status: 'CLEARED',
        requestHash: '95f57f9b242e1c98492048590382901a',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'sub-02',
        invoiceNo: 'INV-2026-0001',
        attemptNo: 1,
        environment: 'SIMULATION',
        mode: 'CLEARANCE',
        status: 'CLEARED',
        requestHash: '34393532393931386439343930356439',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  if (path.includes('/zatca/invoices') || path.includes('/sal/invoices')) {
    return [
      {
        id: 'inv-01',
        invoiceNo: 'INV-2026-0002',
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-22',
        clientName: 'شركة التقنية المتقدمة',
        clientVat: '300012345600003',
        currencyCode: 'SAR',
        totalAmount: '87400.00',
        vatAmount: '11400.00',
        zatcaStatus: 'CLEARED',
        complianceStatus: 'PASS',
        hasQr: true,
        hash: '95f57f9b242e1c98492048590382901a',
        submittedAt: new Date().toISOString(),
      },
      {
        id: 'inv-02',
        invoiceNo: 'INV-2026-0001',
        invoiceType: 'TAX_INVOICE',
        issueDate: '2026-10-20',
        clientName: 'مؤسسة الحلول الرقمية الكبرى',
        clientVat: '300098765400003',
        currencyCode: 'SAR',
        totalAmount: '87400.00',
        vatAmount: '11400.00',
        zatcaStatus: 'CLEARED',
        complianceStatus: 'PASS',
        hasQr: true,
        hash: '34393532393931386439343930356439',
        submittedAt: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  if (path.includes('/ubl-xml')) {
    return {
      invoiceNo: 'INV-2026-0002',
      zatcaStatus: 'CLEARED',
      hash: '95f57f9b242e1c98492048590382901a',
      qrCode: 'AQ/YtNixa2Universal33MQ8zMTAxMjM0NTY3MDAwMDMTFDIwMjYtMTAtMjJUMTI6MDA6MDBaBAY4NzQwMC4wMAYxMTQwMC4wMEYzNDM5MzUyMzk5MTg2NzkzNDkwNWRkOTAxMDY=',
      ublXml: `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>clearance:1.0</cbc:ProfileID>
  <cbc:ID>INV-2026-0002</cbc:ID>
  <cbc:UUID>01a105ec-6a9a-74cd-b663-0ef527c4cfde</cbc:UUID>
  <cbc:IssueDate>2026-10-22</cbc:IssueDate>
  <cbc:IssueTime>12:00:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>شركة عزم للتكنولوجيا والحلول الرقمية</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">76000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">76000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">87400.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">87400.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`,
    };
  }

  if (path.includes('/decode-qr')) {
    return {
      tagCount: 8,
      tags: {
        1: { nameAr: 'اسم المنشأة الموردة', nameEn: 'Seller Name', value: 'شركة عزم للتكنولوجيا والحلول الرقمية' },
        2: { nameAr: 'الرقم الضريبي للمورد', nameEn: 'Seller VAT Registration', value: '310123456700003' },
        3: { nameAr: 'طابع الوقت (تاريخ ووقت الإصدار)', nameEn: 'Invoice Timestamp', value: '2026-10-22T12:00:00Z' },
        4: { nameAr: 'إجمالي الفاتورة مع الضريبة', nameEn: 'Total Amount', value: '87400.00' },
        5: { nameAr: 'إجمالي ضريبة القيمة المضافة', nameEn: 'Total VAT Amount', value: '11400.00' },
        6: { nameAr: 'تجزئة الفاتورة (SHA-256 Hash)', nameEn: 'Invoice SHA-256 Hash', value: '95f57f9b242e1c98492048590382901a' },
        7: { nameAr: 'الختم الرقمي والتوقيع (ECDSA)', nameEn: 'Cryptographic Signature', value: '63323163383465633738353135613535' },
        8: { nameAr: 'المفتاح العام للتوقيع (Public Key)', nameEn: 'Public Key', value: '4d466b77457759484b6f5a497a6a3043' },
      },
    };
  }

  // Default empty list or object
  return [];
}
