import { randomUUID } from 'crypto';
import { formatZatcaEgsSerial, generateZatcaCsr } from './zatca-csr';
import {
  assertCanTransmitToZatca,
  getZatcaStatusMeta,
  isLockedByZatca,
  ZATCA_STATUSES,
} from './zatca-status';
import {
  buildZatcaUblInvoice,
  decodeZatcaQr,
  ZATCA_GENESIS_PIH,
  ZatcaInvoiceUblInput,
} from './zatca-ubl';
import { determineRecommendedZatcaType, validateInvoiceForZatca } from './zatca-validation';
import { ZatcaCryptoVaultService } from '../infrastructure/zatca-crypto-vault.service';
import { ZatcaFatooraClient, ZATCA_DEFAULT_URLS } from '../infrastructure/zatca-fatoora.client';
import { ZatcaService } from '../application/zatca.service';

describe('ZATCA Fatoora Phase 2 — Comprehensive Compliance & Integration Suite (Section 21)', () => {
  const baseSeller = {
    name: 'شركة نظم الإمداد الحديثة لتقنية المعلومات',
    vatNumber: '310123456700003',
    crNumber: '1010123456',
    buildingNumber: '4210',
    streetName: 'طريق الملك فهد',
    district: 'العليا',
    city: 'الرياض',
    postalCode: '12211',
    additionalNumber: '7412',
    countryCode: 'SA',
  };

  const baseBuyerB2B = {
    name: 'شركة عزم الرقمية للحلول التقنية',
    vatNumber: '300123456700003',
    crNumber: '1010998877',
    buildingNumber: '2310',
    streetName: 'طريق الأمير سلطان',
    district: 'الملقا',
    city: 'الرياض',
    postalCode: '13524',
    countryCode: 'SA',
    buyerType: 'B2B',
  };

  // ── 1. CSR Generation & Multi-Environment Isolation ────────────────────────
  describe('1. PKCS#10 CSR Generation (Sandbox / Simulation / Production)', () => {
    it('generates valid secp256k1 keypair and DER PKCS#10 CSR for Sandbox, Simulation, and Production', () => {
      const envs = [
        { env: 'SANDBOX' as const, template: 'TSTZATCA-Code-Signing' },
        { env: 'SIMULATION' as const, template: 'PREZATCA-Code-Signing' },
        { env: 'PRODUCTION' as const, template: 'ZATCA-Code-Signing' },
      ];

      for (const { env, template } of envs) {
        const csr = generateZatcaCsr({
          environment: env,
          commonName: `${env.slice(0, 3)}-EGS01-310123456700003`,
          serialNumber: 'EGS-MAIN-01',
          organizationIdentifier: '310123456700003',
          organizationUnitName: 'Riyadh Main Branch',
          organizationName: 'Modern Supply Systems LLC',
          countryName: 'SA',
          invoiceType: '1100',
          locationAddress: 'Riyadh, King Fahd Rd, 12211',
          industryBusinessCategory: 'Information Technology',
        });

        expect(csr.templateName).toBe(template);
        expect(csr.formattedSerialNumber).toMatch(/^1-.+\|2-.+\|3-.+/);
        expect(csr.privateKeyPem).toContain('BEGIN PRIVATE KEY');
        expect(csr.publicKeyPem).toContain('BEGIN PUBLIC KEY');
        expect(csr.csrPem).toContain('BEGIN CERTIFICATE REQUEST');
        expect(csr.csrPem).toContain('END CERTIFICATE REQUEST');
        expect(csr.csrBase64.length).toBeGreaterThan(200);
        // Fatoora API expects csrBase64 = Base64(csrPem), and inner PEM body = ASN.1 DER containing template & VAT
        const decodedPem = Buffer.from(csr.csrBase64, 'base64').toString('utf8');
        expect(decodedPem).toBe(csr.csrPem);
        const pemBody = decodedPem.replace(/-----.*?-----/g, '').replace(/\s+/g, '');
        const derBytes = Buffer.from(pemBody, 'base64');
        expect(derBytes.toString('utf8')).toContain(template);
        expect(derBytes.toString('utf8')).toContain('310123456700003');
      }
    });

    it('preserves already formatted ZATCA EGS serial numbers', () => {
      const valid = '1-IDHAM|2-ERP2026|3-UNIT001';
      expect(formatZatcaEgsSerial(valid)).toBe(valid);
      expect(formatZatcaEgsSerial('POS-09')).toBe('1-IDHAM-ERP|2-PHASE2|3-POS-09');
    });
  });

  // ── 2. AES-256-GCM Secret Vault (Private Keys & CSID Secrets) ──────────────
  describe('2. AES-256-GCM Server-Side Secret Vault', () => {
    const vault = new ZatcaCryptoVaultService();

    it('encrypts & decrypts private keys with random IV and detects tampering', () => {
      const secret = '-----BEGIN PRIVATE KEY-----\nMIGEAgEAMBAGByqGSM49AgEGBSuBBAAK\n-----END PRIVATE KEY-----';
      const c1 = vault.encrypt(secret);
      const c2 = vault.encrypt(secret);

      expect(vault.isEncrypted(c1)).toBe(true);
      expect(c1).toMatch(/^enc:v1:/);
      expect(c1).not.toBe(c2); // unique random IV each time
      expect(c1).not.toContain('BEGIN PRIVATE KEY');
      expect(vault.decrypt(c1)).toBe(secret);
      expect(vault.decrypt(c2)).toBe(secret);

      // Tampering with ciphertext must throw GCM auth error
      const tampered = c1.slice(0, -4) + 'AAAA';
      expect(() => vault.decrypt(tampered)).toThrow();
    });

    it('masks sensitive values safely for UI display', () => {
      expect(vault.mask('super-secret-csid-password-9999')).toBe('supe••••9999');
      expect(vault.mask('')).toBe('—');
    });
  });

  // ── 3–9. UBL 2.1 XML, Tax Types, Discounts, Notes, Hash, Signature & 9-Tag QR ──
  describe('3-9. UBL 2.1 XML Generation, Signatures, Tax Variants & 9-Tag QR', () => {
    const csr = generateZatcaCsr({
      environment: 'SANDBOX',
      commonName: 'TST-UNIT1-310123456700003',
      serialNumber: '1-IDHAM|2-ERP|3-UNIT1',
      organizationIdentifier: '310123456700003',
      organizationUnitName: 'HQ',
      organizationName: 'Modern Supply Systems',
      invoiceType: '1100',
      locationAddress: 'Riyadh',
      industryBusinessCategory: 'IT',
    });

    const baseUblInput = (overrides?: Partial<ZatcaInvoiceUblInput>): ZatcaInvoiceUblInput => ({
      invoiceId: randomUUID(),
      invoiceNo: 'INV-2026-0001',
      invoiceType: 'TAX_INVOICE',
      issueDate: '2026-11-19',
      issueTime: '14:30:00',
      currencyCode: 'SAR',
      icv: 1,
      previousInvoiceHash: ZATCA_GENESIS_PIH,
      seller: baseSeller,
      buyer: baseBuyerB2B,
      lines: [
        {
          id: 1,
          name: 'تطوير منصة الموارد البشرية السحابية',
          quantity: 1,
          unitPrice: 10000,
          discount: 0,
          netAmount: 10000,
          vatRate: 15,
          vatAmount: 1500,
          totalWithVat: 11500,
          vatCategory: 'S',
        },
      ],
      subtotal: 10000,
      discountTotal: 0,
      taxableAmount: 10000,
      vatAmount: 1500,
      totalAmount: 11500,
      privateKeyPem: csr.privateKeyPem,
      publicKeyPem: csr.publicKeyPem,
      ...overrides,
    });

    it('generates Standard Tax Invoice (B2B 388/0100000) with Clearance mode, XMLDSig/XAdES & 9-Tag QR', () => {
      const res = buildZatcaUblInvoice(baseUblInput());
      expect(res.submissionMode).toBe('CLEARANCE');
      expect(res.ublXml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');
      expect(res.ublXml).toContain('<ext:UBLExtensions>');
      expect(res.ublXml).toContain('<ds:Signature');
      expect(res.ublXml).toContain('<xades:SignedProperties');
      expect(res.ublXml).toContain('<cbc:ID>QR</cbc:ID>');
      expect(res.ublXml).toContain('<cbc:ID>ICV</cbc:ID>');
      expect(res.ublXml).toContain('<cbc:ID>PIH</cbc:ID>');
      expect(res.invoiceHashBase64.length).toBeGreaterThan(40);
      expect(res.digitalSignature.length).toBeGreaterThan(50);

      const decoded = decodeZatcaQr(res.qrCodeBase64);
      expect(decoded[1]?.value).toBe(baseSeller.name);
      expect(decoded[2]?.value).toBe(baseSeller.vatNumber);
      expect(decoded[3]?.value).toBe('2026-11-19T14:30:00Z');
      expect(decoded[4]?.value).toBe('11500.00');
      expect(decoded[5]?.value).toBe('1500.00');
      expect(decoded[6]?.value).toBe(res.invoiceHashBase64);
      expect(decoded[7]?.value).toBe(res.digitalSignature);
      expect(decoded[8]?.value.length).toBeGreaterThan(20);
    });

    it('generates Simplified Tax Invoice (B2C 388/0200000) in Reporting mode', () => {
      const res = buildZatcaUblInvoice(
        baseUblInput({
          invoiceType: 'SIMPLIFIED',
          isSimplifiedFlow: true,
          buyer: { name: 'عميل نقدي فردي', city: 'الرياض', countryCode: 'SA' },
        }),
      );
      expect(res.submissionMode).toBe('REPORTING');
      expect(res.ublXml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
      expect(res.qrCodeBase64.length).toBeGreaterThan(100);
    });

    it('generates Credit Note (381) with BillingReference & InstructionNote', () => {
      const res = buildZatcaUblInvoice(
        baseUblInput({
          invoiceNo: 'CRN-2026-0001',
          invoiceType: 'CREDIT_NOTE',
          originalInvoiceNo: 'INV-2026-0001',
          instructionNote: 'تسوية خصم تجاري ومرتجع جزئي للخدمة',
        }),
      );
      expect(res.ublXml).toContain('<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>');
      expect(res.ublXml).toContain('<cac:BillingReference>');
      expect(res.ublXml).toContain('<cbc:ID>INV-2026-0001</cbc:ID>');
      expect(res.ublXml).toContain('<cbc:InstructionNote>تسوية خصم تجاري ومرتجع جزئي للخدمة</cbc:InstructionNote>');
    });

    it('generates Debit Note (383) with BillingReference & InstructionNote', () => {
      const res = buildZatcaUblInvoice(
        baseUblInput({
          invoiceNo: 'DBN-2026-0001',
          invoiceType: 'DEBIT_NOTE',
          originalInvoiceNo: 'INV-2026-0001',
          instructionNote: 'إضافة ساعات عمل تطويرية إضافية متفق عليها',
        }),
      );
      expect(res.ublXml).toContain('<cbc:InvoiceTypeCode name="0100000">383</cbc:InvoiceTypeCode>');
      expect(res.ublXml).toContain('<cac:BillingReference>');
      expect(res.ublXml).toContain('<cbc:InstructionNote>إضافة ساعات عمل تطويرية إضافية متفق عليها</cbc:InstructionNote>');
    });

    it('handles multi-line invoice with mixed VAT categories (S 15%, Z 0%, E 0%) and line-level discounts', () => {
      const res = buildZatcaUblInvoice(
        baseUblInput({
          lines: [
            {
              id: 1,
              name: 'ترخيص نظام سحابي (خاضع 15% مع خصم)',
              quantity: 2,
              unitPrice: 1000,
              discount: 200,
              netAmount: 1800,
              vatRate: 15,
              vatAmount: 270,
              totalWithVat: 2070,
              vatCategory: 'S',
            },
            {
              id: 2,
              name: 'خدمات تصدير دولي (نسبة صفرية Z)',
              quantity: 1,
              unitPrice: 500,
              discount: 0,
              netAmount: 500,
              vatRate: 0,
              vatAmount: 0,
              totalWithVat: 500,
              vatCategory: 'Z',
              vatExemptionReasonCode: 'VATEX-SA-32',
              vatExemptionReason: 'Export of services outside GCC',
            },
            {
              id: 3,
              name: 'عمولة مالية معفاة (E)',
              quantity: 1,
              unitPrice: 300,
              discount: 0,
              netAmount: 300,
              vatRate: 0,
              vatAmount: 0,
              totalWithVat: 300,
              vatCategory: 'E',
              vatExemptionReasonCode: 'VATEX-SA-29',
              vatExemptionReason: 'Exempt financial services',
            },
          ],
          subtotal: 2600,
          discountTotal: 200,
          taxableAmount: 2600,
          vatAmount: 270,
          totalAmount: 2870,
        }),
      );

      expect(res.ublXml).toContain('<cbc:ID>S</cbc:ID>');
      expect(res.ublXml).toContain('<cbc:ID>Z</cbc:ID>');
      expect(res.ublXml).toContain('<cbc:ID>E</cbc:ID>');
      expect(res.ublXml).toContain('<cbc:TaxExemptionReasonCode>VATEX-SA-32</cbc:TaxExemptionReasonCode>');
      expect(res.ublXml).toContain('<cbc:TaxExemptionReasonCode>VATEX-SA-29</cbc:TaxExemptionReasonCode>');
      expect(res.ublXml).toContain('<cbc:Amount currencyID="SAR">200.00</cbc:Amount>');
      expect(res.ublXml).toContain('<cbc:PayableAmount currencyID="SAR">2870.00</cbc:PayableAmount>');
    });
  });

  // ── 10. 22-Point Pre-Submission Validation Engine ──────────────────────────
  describe('10. 22-Point Arabic Pre-Submission Validation Engine', () => {
    const validInput = () => ({
      invoiceNo: 'INV-2026-0099',
      invoiceType: 'TAX_INVOICE',
      uuid: randomUUID(),
      issueDate: '2026-11-19',
      issueTime: '11:00:00',
      currencyCode: 'SAR',
      subtotal: 1000,
      discountAmount: 0,
      taxableAmount: 1000,
      vatAmount: 150,
      totalAmount: 1150,
      seller: baseSeller,
      buyer: baseBuyerB2B,
      lines: [
        {
          lineNo: 1,
          description: 'خدمات برمجية واستشارات',
          quantity: 1,
          unitPrice: 1000,
          discountPct: 0,
          subtotal: 1000,
          vatRate: 15,
          vatAmount: 150,
          total: 1150,
          vatCategory: 'S',
        },
      ],
      icv: 1,
      pih: ZATCA_GENESIS_PIH,
    });

    it('passes cleanly for a complete compliant Standard B2B invoice', () => {
      const report = validateInvoiceForZatca(validInput());
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(report.recommendedSubmissionType).toBe('CLEARANCE');
    });

    it('rejects missing seller VAT, invalid National Address, missing B2B buyer VAT, and math mismatch', () => {
      const bad = validInput();
      bad.seller = { ...baseSeller, vatNumber: '12345', buildingNumber: '', postalCode: '12' };
      bad.buyer = { ...baseBuyerB2B, vatNumber: '' };
      bad.totalAmount = 9999; // wrong sum

      const report = validateInvoiceForZatca(bad);
      expect(report.valid).toBe(false);
      const codes = report.errors.map((e) => e.code);
      expect(codes).toContain('BR-KSA-40'); // Seller VAT invalid
      expect(codes).toContain('BR-KSA-37'); // Seller Building invalid
      expect(codes).toContain('BR-KSA-66'); // Seller Postal Code invalid
      expect(codes).toContain('BR-KSA-46'); // Buyer VAT required for B2B
      expect(codes).toContain('BR-CO-15');  // Total mismatch
    });

    it('requires originalInvoiceNo and returnReason for Credit Notes and Debit Notes', () => {
      const crn = { ...validInput(), invoiceType: 'CREDIT_NOTE', originalInvoiceNo: null, returnReason: '' };
      const report = validateInvoiceForZatca(crn);
      expect(report.valid).toBe(false);
      const codes = report.errors.map((e) => e.code);
      expect(codes).toContain('BR-KSA-56'); // Original invoice ref mandatory
      expect(codes).toContain('BR-KSA-17'); // InstructionNote mandatory
    });

    it('auto-routes B2C clients without VAT to SIMPLIFIED / REPORTING', () => {
      const rec = determineRecommendedZatcaType({ buyerVatNumber: null, buyerType: 'B2C' });
      expect(rec).toEqual({ invoiceType: 'SIMPLIFIED', submissionType: 'REPORTING' });
    });
  });

  // ── 11. Unified 15-State Engine, Anti-Duplication & Immutability Guards ────
  describe('11. 15-State Unified Status Engine & Anti-Duplication Guards', () => {
    it('defines metadata for all 15 official states', () => {
      expect(ZATCA_STATUSES).toHaveLength(15);
      for (const s of ZATCA_STATUSES) {
        const m = getZatcaStatusMeta(s);
        expect(m.labelAr.length).toBeGreaterThan(2);
      }
    });

    it('blocks duplicate submission of CLEARED, REPORTED, ACCEPTED, and in-flight SUBMITTED invoices', () => {
      expect(assertCanTransmitToZatca('CLEARED', true).ok).toBe(false);
      expect(assertCanTransmitToZatca('REPORTED', true).ok).toBe(false);
      expect(assertCanTransmitToZatca('ACCEPTED', true).ok).toBe(false);
      expect(assertCanTransmitToZatca('SUBMITTED', true).ok).toBe(false);
      expect(assertCanTransmitToZatca('NOT_SUBMITTED', false).ok).toBe(false); // unposted draft
    });

    it('permits submission / retry for NOT_SUBMITTED, READY, REJECTED, FAILED, and RETRY_PENDING', () => {
      for (const st of ['NOT_SUBMITTED', 'READY', 'REJECTED', 'FAILED', 'RETRY_PENDING', 'VALIDATION_FAILED']) {
        expect(assertCanTransmitToZatca(st, true).ok).toBe(true);
      }
    });

    it('enforces immutability lock once Cleared or Reported', () => {
      expect(isLockedByZatca('CLEARED')).toBe(true);
      expect(isLockedByZatca('REPORTED')).toBe(true);
      expect(isLockedByZatca('NOT_SUBMITTED')).toBe(false);
      expect(isLockedByZatca('REJECTED')).toBe(false);
    });
  });

  // ── 12. Real Fatoora V2 HTTP Client Protocol & Error Handling ──────────────
  describe('12. ZatcaFatooraClient HTTP Handling (200/202/400/401/503/Timeout/Invalid JSON)', () => {
    const client = new ZatcaFatooraClient();
    const gw = { environment: 'SANDBOX' as const, baseUrl: ZATCA_DEFAULT_URLS.SANDBOX, apiVersion: 'V2' };
    const auth = { binarySecurityToken: 'Q0VSVF9UT0tFTg==', secret: 'secret-123' };
    const origFetch = global.fetch;

    afterEach(() => {
      global.fetch = origFetch;
    });

    it('sends OTP & Accept-Version: V2 header for Compliance CSID onboarding', async () => {
      let capturedHeaders: any = null;
      global.fetch = jest.fn(async (_url: any, init: any) => {
        capturedHeaders = init.headers;
        return new Response(
          JSON.stringify({
            requestID: 1234567890,
            dispositionMessage: 'ISSUED',
            binarySecurityToken: 'TOKEN_BASE64',
            secret: 'SECRET_VALUE',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }) as any;

      const res = await client.requestComplianceCsid(gw, { csrBase64: 'Q1NS', otp: '123345' });
      expect(res.ok).toBe(true);
      expect(res.binarySecurityToken).toBe('TOKEN_BASE64');
      expect(res.secret).toBe('SECRET_VALUE');
      expect(capturedHeaders['OTP']).toBe('123345');
      expect(capturedHeaders['Accept-Version']).toBe('V2');
    });

    it('parses 200 CLEARED + clearedInvoice XML and 202 ACCEPTED WITH WARNINGS accurately', async () => {
      const sampleClearedXml = '<Invoice><cbc:ID>INV-1</cbc:ID></Invoice>';
      global.fetch = jest.fn(async () =>
        new Response(
          JSON.stringify({
            clearanceStatus: 'CLEARED',
            clearedInvoice: Buffer.from(sampleClearedXml, 'utf8').toString('base64'),
            validationResults: {
              status: 'WARNING',
              infoMessages: [{ code: 'XSD_ZATCA_VALID', message: 'Valid' }],
              warningMessages: [{ code: 'BR-KSA-W1', message: 'Minor warning' }],
              errorMessages: [],
            },
          }),
          { status: 202 },
        ),
      ) as any;

      const res = await client.clearStandardInvoice(gw, auth, {
        invoiceHash: 'HASH==',
        uuid: randomUUID(),
        invoiceBase64: 'WE1M',
      });
      expect(res.ok).toBe(true);
      expect(res.clearanceStatus).toBe('CLEARED');
      expect(res.clearedInvoiceXml).toBe(sampleClearedXml);
      expect(res.validationResults.warningMessages).toHaveLength(1);
    });

    it('classifies 400 Rejected (non-retryable), 401 Auth Failure (non-retryable), 503 Outage (retryable), and Network Timeout (retryable)', async () => {
      // 400 Bad Request
      global.fetch = jest.fn(async () =>
        new Response(
          JSON.stringify({
            clearanceStatus: 'NOT_CLEARED',
            validationResults: {
              status: 'ERROR',
              errorMessages: [{ code: 'BR-KSA-39', message: 'Seller VAT mismatch' }],
            },
          }),
          { status: 400 },
        ),
      ) as any;
      const r400 = await client.clearStandardInvoice(gw, auth, { invoiceHash: 'H', uuid: randomUUID(), invoiceBase64: 'X' });
      expect(r400.ok).toBe(false);
      expect(r400.retryable).toBe(false);
      expect(r400.validationResults.errorMessages[0].code).toBe('BR-KSA-39');

      // 401 Unauthorized
      global.fetch = jest.fn(async () => new Response('Unauthorized', { status: 401 })) as any;
      const r401 = await client.reportSimplifiedInvoice(gw, auth, { invoiceHash: 'H', uuid: randomUUID(), invoiceBase64: 'X' });
      expect(r401.ok).toBe(false);
      expect(r401.retryable).toBe(false);
      expect(r401.httpStatus).toBe(401);

      // 503 Service Unavailable -> Retryable
      global.fetch = jest.fn(async () => new Response('Service Unavailable', { status: 503 })) as any;
      const r503 = await client.clearStandardInvoice(gw, auth, { invoiceHash: 'H', uuid: randomUUID(), invoiceBase64: 'X' });
      expect(r503.ok).toBe(false);
      expect(r503.retryable).toBe(true);

      // Timeout / Network Failure -> Retryable
      global.fetch = jest.fn(async () => {
        const err: any = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        throw err;
      }) as any;
      const rNet = await client.reportSimplifiedInvoice(gw, auth, { invoiceHash: 'H', uuid: randomUUID(), invoiceBase64: 'X' });
      expect(rNet.ok).toBe(false);
      expect(rNet.retryable).toBe(true);
      expect(rNet.httpStatus).toBe(0);
    });
  });

  // ── 13. Retry Queue UUID Preservation, No Duplicate Journal & Anti-Dup Lock ─
  describe('13. End-to-End Retry UUID Preservation & Accounting Isolation', () => {
    it('preserves exact UUID across 503 retry -> 200 CLEARED, locks invoice, and blocks duplicate resend', async () => {
      const vault = new ZatcaCryptoVaultService();
      const csr = generateZatcaCsr({
        environment: 'SANDBOX',
        commonName: 'TST-EGS-1',
        serialNumber: '1-IDHAM|2-ERP|3-EGS1',
        organizationIdentifier: baseSeller.vatNumber,
        organizationUnitName: 'HQ',
        organizationName: baseSeller.name,
        invoiceType: '1100',
        locationAddress: 'Riyadh',
        industryBusinessCategory: 'IT',
      });

      const fixedUuid = randomUUID();
      let currentZatcaStatus = 'NOT_SUBMITTED';
      let retryQueueStatus: string | null = null;
      const sentUuids: string[] = [];
      const journalMutations: string[] = [];

      const mockDb: any = {
        one: jest.fn(async (sql: string) => {
          if (sql.includes('FROM sal.zatca_settings')) {
            return {
              environment: 'SANDBOX',
              organizationNameAr: baseSeller.name,
              organizationNameEn: 'Modern Supply Systems',
              vatNumber: baseSeller.vatNumber,
              crNumber: baseSeller.crNumber,
              buildingNumber: baseSeller.buildingNumber,
              streetName: baseSeller.streetName,
              district: baseSeller.district,
              city: baseSeller.city,
              postalCode: baseSeller.postalCode,
              countryCode: 'SA',
              retryMaxAttempts: 5,
              retryBackoffSeconds: 60,
              autoSubmit: true,
            };
          }
          if (sql.includes('FROM sal.invoices i')) {
            return {
              id: 'inv-1',
              invoice_no: 'INV-2026-0050',
              invoice_type: 'TAX_INVOICE',
              invoice_sub_type: 'STANDARD',
              status: 'POSTED',
              zatca_status: currentZatcaStatus,
              zatca_uuid: fixedUuid,
              zatca_icv: 7,
              zatca_pih: ZATCA_GENESIS_PIH,
              issue_date: '2026-11-19',
              issue_time: '2026-11-19T12:00:00Z',
              currency_code: 'SAR',
              subtotal: '1000.00',
              discount_amount: '0.00',
              taxable_amount: '1000.00',
              vat_amount: '150.00',
              total_amount: '1150.00',
              journal_entry_id: 'je-existing-1',
              clientName: baseBuyerB2B.name,
              clientVatNumber: baseBuyerB2B.vatNumber,
              clientCrNumber: baseBuyerB2B.crNumber,
              clientStreet: baseBuyerB2B.streetName,
              clientBuildingNumber: baseBuyerB2B.buildingNumber,
              clientDistrict: baseBuyerB2B.district,
              clientCity: baseBuyerB2B.city,
              clientPostalCode: baseBuyerB2B.postalCode,
              clientCountryCode: 'SA',
              clientBuyerType: 'B2B',
              companyName: baseSeller.name,
              companyVatNumber: baseSeller.vatNumber,
              companyCrNumber: baseSeller.crNumber,
            };
          }
          if (sql.includes('FROM sal.zatca_egs_devices')) {
            return {
              id: 'dev-1',
              device_code: 'EGS-01',
              device_name: 'Main EGS',
              environment: 'SANDBOX',
              vat_number: baseSeller.vatNumber,
              production_csid_token: 'MOCK_TOKEN',
              encrypted_production_secret: vault.encrypt('MOCK_SECRET'),
              encrypted_private_key: vault.encrypt(csr.privateKeyPem),
              icv_counter: 6,
              last_pih: ZATCA_GENESIS_PIH,
            };
          }
          if (sql.includes('MAX(attempt_no)')) return { n: sentUuids.length };
          if (sql.includes('FROM sal.zatca_retry_queue')) return null;
          return null;
        }),
        query: jest.fn(async (sql: string, params?: any[]) => {
          if (sql.includes('FROM sal.invoice_lines')) {
            return [
              {
                line_no: 1,
                description: 'تطوير أنظمة',
                quantity: 1,
                unit_price: 1000,
                discount_pct: 0,
                subtotal: 1000,
                vat_rate: 15,
                vat_amount: 150,
                total: 1150,
                vat_category: 'S',
              },
            ];
          }
          if (sql.includes('acc.journal')) journalMutations.push(sql);
          if (sql.includes('UPDATE sal.invoices') && params && sql.includes('SET zatca_status = $2')) {
            currentZatcaStatus = params[1];
          }
          if (sql.includes('INSERT INTO sal.zatca_retry_queue')) retryQueueStatus = 'QUEUED';
          if (sql.includes("UPDATE sal.zatca_retry_queue SET status = 'SUCCEEDED'")) retryQueueStatus = 'SUCCEEDED';
          return [];
        }),
      };

      const mockFatoora: any = {
        clearStandardInvoice: jest
          .fn()
          .mockImplementationOnce(async (_gw: any, _auth: any, payload: any) => {
            sentUuids.push(payload.uuid);
            return {
              ok: false,
              httpStatus: 503,
              mode: 'CLEARANCE',
              responseCode: 'HTTP_503',
              responseMessageAr: 'الخدمة غير متاحة مؤقتاً',
              retryable: true,
              validationResults: { status: 'ERROR', infoMessages: [], warningMessages: [], errorMessages: [] },
            };
          })
          .mockImplementationOnce(async (_gw: any, _auth: any, payload: any) => {
            sentUuids.push(payload.uuid);
            return {
              ok: true,
              httpStatus: 200,
              mode: 'CLEARANCE',
              clearanceStatus: 'CLEARED',
              clearedInvoiceXml: '<Invoice>CLEARED</Invoice>',
              responseCode: 'CLEARED',
              responseMessageAr: 'تم تخليص الفاتورة بنجاح',
              retryable: false,
              validationResults: { status: 'PASS', infoMessages: [], warningMessages: [], errorMessages: [] },
            };
          }),
      };

      const svc = new ZatcaService(mockDb, vault, mockFatoora);

      // Attempt 1 -> 503 Service Outage -> Enqueued in retry queue
      const attempt1 = await svc.transmitInvoice('comp-1', 'inv-1');
      expect(attempt1.success).toBe(false);
      expect(attempt1.zatcaStatus).toBe('RETRY_PENDING');
      expect(attempt1.uuid).toBe(fixedUuid);
      expect(retryQueueStatus).toBe('QUEUED');
      expect(journalMutations).toHaveLength(0); // ZERO accounting journal changes on failure!

      // Attempt 2 -> Retry succeeds -> Exact same UUID -> CLEARED & Locked
      const attempt2 = await svc.transmitInvoice('comp-1', 'inv-1', { isRetry: true });
      expect(attempt2.success).toBe(true);
      expect(attempt2.zatcaStatus).toBe('CLEARED');
      expect(attempt2.uuid).toBe(fixedUuid);
      expect(sentUuids).toEqual([fixedUuid, fixedUuid]); // Identical UUID guaranteed!
      expect(retryQueueStatus).toBe('SUCCEEDED');
      expect(journalMutations).toHaveLength(0); // ZERO duplicate journal entries created by ZATCA!

      // Attempt 3 -> Anti-duplication guard MUST block re-sending a CLEARED invoice
      await expect(svc.transmitInvoice('comp-1', 'inv-1')).rejects.toThrow(/معتمدة مسبقاً|مُخلَّصة/);
    });
  });
});
