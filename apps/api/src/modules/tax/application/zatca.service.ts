import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { D } from '../../../shared/money';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { formatZatcaEgsSerial, generateZatcaCsr, ZatcaEnvironment } from '../domain/zatca-csr';
import { assertCanTransmitToZatca, getZatcaStatusMeta, ZatcaUnifiedStatus } from '../domain/zatca-status';
import {
  buildZatcaUblInvoice,
  decodeZatcaQr,
  ZATCA_GENESIS_PIH,
  ZatcaInvoiceUblInput,
} from '../domain/zatca-ubl';
import { determineRecommendedZatcaType, validateInvoiceForZatca } from '../domain/zatca-validation';
import { ZatcaCryptoVaultService } from '../infrastructure/zatca-crypto-vault.service';
import {
  ZATCA_DEFAULT_URLS,
  ZatcaBasicAuth,
  ZatcaFatooraClient,
  ZatcaGatewayConfig,
} from '../infrastructure/zatca-fatoora.client';

// ── Zod Schemas ──────────────────────────────────────────────────────────────
export const ZatcaSettingsUpdate = z.object({
  environment: z.enum(['SANDBOX', 'SIMULATION', 'PRODUCTION']).optional(),
  organizationNameAr: z.string().trim().max(250).nullable().optional(),
  organizationNameEn: z.string().trim().max(250).nullable().optional(),
  vatNumber: z
    .string()
    .trim()
    .regex(/^3\d{13}3$/, 'الرقم الضريبي يجب أن يتكون من 15 رقماً يبدأ وينتهي بالرقم 3')
    .nullable()
    .optional(),
  crNumber: z.string().trim().max(30).nullable().optional(),
  buildingNumber: z.string().trim().max(10).nullable().optional(),
  streetName: z.string().trim().max(200).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  postalCode: z.string().trim().max(10).nullable().optional(),
  additionalNumber: z.string().trim().max(10).nullable().optional(),
  countryCode: z.string().trim().length(2).optional(),
  entityType: z.string().trim().max(80).optional(),
  businessCategory: z.string().trim().max(200).optional(),
  defaultBranchId: z.string().uuid().nullable().optional(),
  currencyCode: z.string().trim().length(3).optional(),
  invoicingType: z.enum(['STANDARD', 'SIMPLIFIED', 'BOTH']).optional(),
  zatcaEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contactEmail: z.string().trim().max(150).nullable().optional(),
  contactPhone: z.string().trim().max(50).nullable().optional(),
  egsUnitName: z.string().trim().max(100).nullable().optional(),
  egsSerialNo: z.string().trim().max(120).nullable().optional(),
  autoSubmit: z.boolean().optional(),
  sandboxBaseUrl: z.string().trim().url().optional(),
  simulationBaseUrl: z.string().trim().url().optional(),
  productionBaseUrl: z.string().trim().url().optional(),
  apiVersion: z.string().trim().max(20).optional(),
  retryMaxAttempts: z.number().int().min(1).max(20).optional(),
  retryBackoffSeconds: z.number().int().min(10).max(3600).optional(),
});

export const EgsDeviceCreate = z.object({
  branchId: z.string().uuid().nullable().optional(),
  branchCode: z.string().trim().max(40).nullable().optional(),
  deviceCode: z.string().trim().min(2).max(60),
  deviceName: z.string().trim().min(2).max(120),
  deviceType: z.enum(['ERP_CLOUD', 'POS', 'BRANCH_TERMINAL', 'API_GATEWAY']).default('ERP_CLOUD'),
  environment: z.enum(['SANDBOX', 'SIMULATION', 'PRODUCTION']).default('SANDBOX'),
  vatNumber: z.string().trim().regex(/^3\d{13}3$/, 'الرقم الضريبي يجب أن يتكون من 15 رقماً يبدأ وينتهي بالرقم 3'),
  crNumber: z.string().trim().max(30).nullable().optional(),
  serialNumber: z.string().trim().min(3).max(120),
  invoicingTypeCode: z.enum(['1100', '1000', '0100']).default('1100'),
});

export const DeviceComplianceCsidInput = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'رمز التحقق OTP يجب أن يتكون من 6 أرقام صادرة من بوابة فاتورة'),
});

export const ZatcaOnboardInput = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'رمز التحقق OTP يجب أن يتكون من 6 أرقام صادرة من بوابة فاتورة'),
  egsUnitName: z.string().trim().max(100).optional(),
  egsSerialNo: z.string().trim().max(120).optional(),
  environment: z.enum(['SANDBOX', 'SIMULATION', 'PRODUCTION']).optional(),
  deviceId: z.string().uuid().optional(),
});

export const DecodeQrInput = z.object({
  qrBase64: z.string().trim().min(10, 'نص رمز الاستجابة السريع مطلوب'),
});

const ONBOARDED = new Set(['COMPLIANCE', 'PRODUCTION']);

@Injectable()
export class ZatcaService {
  private readonly logger = new Logger(ZatcaService.name);

  constructor(
    private readonly db: DbService,
    private readonly vault: ZatcaCryptoVaultService,
    private readonly fatoora: ZatcaFatooraClient,
  ) {}

  // ── 1. Organization & Gateway Configuration (Never Exposes Secrets) ────────
  async getSettings(companyId: string) {
    const query = () =>
      this.db.one<any>(
        `SELECT s.environment,
                COALESCE(s.organization_name_ar, c.name_ar) AS "organizationNameAr",
                COALESCE(s.organization_name_en, c.name_en) AS "organizationNameEn",
                COALESCE(s.vat_number, c.tax_number) AS "vatNumber",
                COALESCE(s.cr_number, c.commercial_reg) AS "crNumber",
                s.building_number AS "buildingNumber",
                s.street_name AS "streetName",
                s.district,
                s.city,
                s.postal_code AS "postalCode",
                s.additional_number AS "additionalNumber",
                COALESCE(s.country_code, c.country_code, 'SA') AS "countryCode",
                s.entity_type AS "entityType",
                s.business_category AS "businessCategory",
                s.default_branch_id AS "defaultBranchId",
                COALESCE(s.currency_code, c.base_currency_code, 'SAR') AS "currencyCode",
                s.invoicing_type AS "invoicingType",
                s.zatca_effective_date::text AS "zatcaEffectiveDate",
                s.contact_email AS "contactEmail",
                s.contact_phone AS "contactPhone",
                s.egs_unit_name AS "egsUnitName",
                s.egs_serial_no AS "egsSerialNo",
                s.csid_status AS "csidStatus",
                s.csid_expires_at AS "csidExpiresAt",
                s.auto_submit AS "autoSubmit",
                s.last_onboarded_at AS "lastOnboardedAt",
                (s.private_key IS NOT NULL) AS "hasCryptoKeys",
                s.compliance_request_id AS "complianceRequestId",
                s.sandbox_base_url AS "sandboxBaseUrl",
                s.simulation_base_url AS "simulationBaseUrl",
                s.production_base_url AS "productionBaseUrl",
                s.api_version AS "apiVersion",
                s.connection_status AS "connectionStatus",
                s.last_connection_test_at AS "lastConnectionTestAt",
                s.last_connection_message AS "lastConnectionMessage",
                s.retry_max_attempts AS "retryMaxAttempts",
                s.retry_backoff_seconds AS "retryBackoffSeconds"
           FROM sal.zatca_settings s
           JOIN core.companies c ON c.id = s.company_id
          WHERE s.company_id = $1`,
        [companyId],
      );

    const row = await query();
    if (row) return row;

    await this.db.query(
      `INSERT INTO sal.zatca_settings (company_id, environment, egs_unit_name, egs_serial_no)
       VALUES ($1, 'SANDBOX', 'EGS-MAIN-01', '1-IDHAM|2-ERP2026|3-MAIN01')
       ON CONFLICT DO NOTHING`,
      [companyId],
    );
    return query();
  }

  async updateSettings(companyId: string, body: z.infer<typeof ZatcaSettingsUpdate>) {
    await this.getSettings(companyId);
    await this.db.query(
      `UPDATE sal.zatca_settings
          SET environment = COALESCE($2, environment),
              organization_name_ar = COALESCE($3, organization_name_ar),
              organization_name_en = COALESCE($4, organization_name_en),
              vat_number = COALESCE($5, vat_number),
              cr_number = COALESCE($6, cr_number),
              building_number = COALESCE($7, building_number),
              street_name = COALESCE($8, street_name),
              district = COALESCE($9, district),
              city = COALESCE($10, city),
              postal_code = COALESCE($11, postal_code),
              additional_number = COALESCE($12, additional_number),
              country_code = COALESCE($13, country_code),
              entity_type = COALESCE($14, entity_type),
              business_category = COALESCE($15, business_category),
              default_branch_id = COALESCE($16, default_branch_id),
              currency_code = COALESCE($17, currency_code),
              invoicing_type = COALESCE($18, invoicing_type),
              zatca_effective_date = COALESCE($19::date, zatca_effective_date),
              contact_email = COALESCE($20, contact_email),
              contact_phone = COALESCE($21, contact_phone),
              egs_unit_name = COALESCE($22, egs_unit_name),
              egs_serial_no = COALESCE($23, egs_serial_no),
              auto_submit = COALESCE($24, auto_submit),
              sandbox_base_url = COALESCE($25, sandbox_base_url),
              simulation_base_url = COALESCE($26, simulation_base_url),
              production_base_url = COALESCE($27, production_base_url),
              api_version = COALESCE($28, api_version),
              retry_max_attempts = COALESCE($29, retry_max_attempts),
              retry_backoff_seconds = COALESCE($30, retry_backoff_seconds),
              updated_by = sys.current_user_id()
        WHERE company_id = $1`,
      [
        companyId,
        body.environment ?? null,
        body.organizationNameAr ?? null,
        body.organizationNameEn ?? null,
        body.vatNumber ?? null,
        body.crNumber ?? null,
        body.buildingNumber ?? null,
        body.streetName ?? null,
        body.district ?? null,
        body.city ?? null,
        body.postalCode ?? null,
        body.additionalNumber ?? null,
        body.countryCode ?? null,
        body.entityType ?? null,
        body.businessCategory ?? null,
        body.defaultBranchId ?? null,
        body.currencyCode ?? null,
        body.invoicingType ?? null,
        body.zatcaEffectiveDate ?? null,
        body.contactEmail ?? null,
        body.contactPhone ?? null,
        body.egsUnitName ?? null,
        body.egsSerialNo ?? null,
        body.autoSubmit ?? null,
        body.sandboxBaseUrl ?? null,
        body.simulationBaseUrl ?? null,
        body.productionBaseUrl ?? null,
        body.apiVersion ?? null,
        body.retryMaxAttempts ?? null,
        body.retryBackoffSeconds ?? null,
      ],
    );
    return this.getSettings(companyId);
  }

  private gatewayConfigFor(settings: any, env: ZatcaEnvironment): ZatcaGatewayConfig {
    const baseUrl =
      env === 'PRODUCTION'
        ? settings.productionBaseUrl || ZATCA_DEFAULT_URLS.PRODUCTION
        : env === 'SIMULATION'
          ? settings.simulationBaseUrl || ZATCA_DEFAULT_URLS.SIMULATION
          : settings.sandboxBaseUrl || ZATCA_DEFAULT_URLS.SANDBOX;
    return {
      environment: env,
      baseUrl,
      apiVersion: settings.apiVersion || 'V2',
      timeoutMs: 20000,
    };
  }

  // ── 2. Multi-Branch, Environment-Isolated EGS Devices & 7-Step Onboarding ──
  async listDevices(companyId: string, environment?: string) {
    const params: unknown[] = [companyId];
    let envClause = '';
    if (environment && ['SANDBOX', 'SIMULATION', 'PRODUCTION'].includes(environment)) {
      params.push(environment);
      envClause = `AND d.environment = $${params.length}`;
    }

    return this.db.query(
      `SELECT d.id, d.branch_id AS "branchId", COALESCE(b.name_ar, 'الفرع الرئيسي') AS "branchName",
              COALESCE(d.branch_code, b.code, 'MAIN') AS "branchCode",
              d.device_code AS "deviceCode", d.device_name AS "deviceName", d.device_type AS "deviceType",
              d.environment, d.vat_number AS "vatNumber", d.cr_number AS "crNumber",
              d.serial_number AS "serialNumber", d.invoicing_type_code AS "invoicingTypeCode",
              (d.csr_pem IS NOT NULL) AS "hasCsr",
              d.csr_pem AS "csrPem",
              (d.encrypted_private_key IS NOT NULL) AS "hasPrivateKey",
              d.compliance_request_id AS "complianceRequestId",
              (d.compliance_csid_token IS NOT NULL) AS "hasComplianceCsid",
              d.compliance_checks_passed AS "complianceChecksPassed",
              d.production_request_id AS "productionRequestId",
              (d.production_csid_token IS NOT NULL) AS "hasProductionCsid",
              d.certificate_status AS "certificateStatus",
              d.connection_status AS "connectionStatus",
              d.device_status AS "deviceStatus",
              d.icv_counter::int AS "icvCounter",
              d.registered_at AS "registeredAt",
              d.csid_issued_at AS "csidIssuedAt",
              d.csid_expires_at AS "csidExpiresAt",
              d.last_tested_at AS "lastTestedAt",
              d.last_test_result AS "lastTestResult"
         FROM sal.zatca_egs_devices d
         LEFT JOIN core.branches b ON b.id = d.branch_id
        WHERE d.company_id = $1 ${envClause}
        ORDER BY d.environment ASC, d.created_at DESC`,
      params,
    );
  }

  async createDevice(companyId: string, body: z.infer<typeof EgsDeviceCreate>) {
    const formattedSerial = formatZatcaEgsSerial(body.serialNumber);
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO sal.zatca_egs_devices
         (company_id, branch_id, branch_code, device_code, device_name, device_type,
          environment, vat_number, cr_number, serial_number, invoicing_type_code,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, sys.current_user_id(), sys.current_user_id())
       RETURNING id`,
      [
        companyId,
        body.branchId ?? null,
        body.branchCode ?? null,
        body.deviceCode,
        body.deviceName,
        body.deviceType,
        body.environment,
        body.vatNumber,
        body.crNumber ?? null,
        formattedSerial,
        body.invoicingTypeCode,
      ],
    );
    const all = await this.listDevices(companyId);
    return all.find((d: any) => d.id === row!.id);
  }

  /** Step 3: Generate secp256k1 keypair + PKCS#10 CSR and store Private Key AES-256-GCM encrypted. */
  async generateDeviceCsr(companyId: string, deviceId: string) {
    const dev = await this.db.one<any>(
      `SELECT d.*, COALESCE(b.name_ar, 'Main Branch') AS branch_name
         FROM sal.zatca_egs_devices d
         LEFT JOIN core.branches b ON b.id = d.branch_id
        WHERE d.company_id = $1 AND d.id = $2`,
      [companyId, deviceId],
    );
    if (!dev) throw new NotFoundError('EGS Device', deviceId);

    const settings = await this.getSettings(companyId);
    const csr = generateZatcaCsr({
      environment: dev.environment as ZatcaEnvironment,
      commonName: `${dev.environment.slice(0, 3)}-${dev.device_code}-${dev.vat_number}`,
      serialNumber: dev.serial_number,
      organizationIdentifier: dev.vat_number,
      organizationUnitName: dev.branch_name || dev.branch_code || 'Main Branch',
      organizationName: settings.organizationNameEn || settings.organizationNameAr || 'IDHAM Organization',
      countryName: settings.countryCode || 'SA',
      invoiceType: (dev.invoicing_type_code || '1100') as '1100' | '1000' | '0100',
      locationAddress: [settings.city, settings.streetName, settings.postalCode].filter(Boolean).join(', ') || 'Riyadh, SA',
      industryBusinessCategory: settings.businessCategory || 'Information Technology',
    });

    const encryptedPriv = this.vault.encrypt(csr.privateKeyPem);

    await this.db.query(
      `UPDATE sal.zatca_egs_devices
          SET csr_pem = $3,
              csr_base64 = $4,
              encrypted_private_key = $5,
              public_key_pem = $6,
              serial_number = $7,
              certificate_status = CASE WHEN certificate_status = 'PRODUCTION' THEN certificate_status ELSE 'CSR_GENERATED' END,
              updated_by = sys.current_user_id()
        WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId, csr.csrPem, csr.csrBase64, encryptedPriv, csr.publicKeyPem, csr.formattedSerialNumber],
    );

    return {
      deviceId,
      environment: dev.environment,
      templateName: csr.templateName,
      formattedSerialNumber: csr.formattedSerialNumber,
      commonName: csr.commonName,
      csrPem: csr.csrPem,
      privateKeyStoredEncrypted: true,
      messageAr: 'تم توليد طلب الشهادة (CSR) والمفتاح الخاص المشفر (AES-256-GCM) على الخادم بنجاح.',
    };
  }

  /** Step 4: Submit CSR + manual OTP to ZATCA /compliance to obtain Compliance CSID. */
  async requestDeviceComplianceCsid(companyId: string, deviceId: string, otp: string) {
    const dev = await this.db.one<any>(
      `SELECT * FROM sal.zatca_egs_devices WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId],
    );
    if (!dev) throw new NotFoundError('EGS Device', deviceId);
    if (!dev.csr_base64) {
      throw new DomainError('CSR_REQUIRED', 'يجب توليد طلب الشهادة (CSR) أولاً في الخطوة السابقة قبل إدخال رمز OTP.');
    }

    const settings = await this.getSettings(companyId);
    const gw = this.gatewayConfigFor(settings, dev.environment as ZatcaEnvironment);
    const apiRes = await this.fatoora.requestComplianceCsid(gw, { csrBase64: dev.csr_base64, otp });

    if (!apiRes.ok || !apiRes.binarySecurityToken || !apiRes.secret) {
      await this.emitNotification(companyId, {
        egsDeviceId: deviceId,
        category: 'CONNECTION_FAILED',
        severity: 'CRITICAL',
        titleAr: `فشل إصدار شهادة الامتثال للجهاز ${dev.device_name}`,
        messageAr: apiRes.errorMessageAr || 'تعذر الحصول على شهادة الامتثال من هيئة الزكاة.',
      });
      throw new DomainError('ZATCA_COMPLIANCE_CSID_FAILED', apiRes.errorMessageAr || 'فشل إصدار شهادة الامتثال من بوابة فاتورة');
    }

    const encSecret = this.vault.encrypt(apiRes.secret);
    await this.db.query(
      `UPDATE sal.zatca_egs_devices
          SET compliance_request_id = $3,
              compliance_csid_token = $4,
              encrypted_compliance_secret = $5,
              certificate_status = 'COMPLIANCE',
              connection_status = 'CONNECTED',
              csid_issued_at = now(),
              updated_by = sys.current_user_id()
        WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId, apiRes.requestId || `CMP-${Date.now()}`, apiRes.binarySecurityToken, encSecret],
    );

    await this.db.query(
      `UPDATE sal.zatca_settings
          SET csid_status = CASE WHEN csid_status = 'PRODUCTION' THEN csid_status ELSE 'COMPLIANCE' END,
              compliance_request_id = $2,
              connection_status = 'CONNECTED',
              last_onboarded_at = now(),
              updated_by = sys.current_user_id()
        WHERE company_id = $1`,
      [companyId, apiRes.requestId || null],
    );

    return {
      ok: true,
      deviceId,
      environment: dev.environment,
      certificateStatus: 'COMPLIANCE',
      complianceRequestId: apiRes.requestId,
      dispositionMessage: apiRes.dispositionMessage,
      messageAr: 'تم إصدار شهادة الامتثال (Compliance CSID) من بوابة فاتورة وحفظها مشفرة بنجاح.',
    };
  }

  /** Step 5: Execute mandatory ZATCA Compliance checks across Standard, Simplified, Credit & Debit Notes. */
  async runDeviceComplianceChecks(companyId: string, deviceId: string) {
    const dev = await this.db.one<any>(
      `SELECT * FROM sal.zatca_egs_devices WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId],
    );
    if (!dev) throw new NotFoundError('EGS Device', deviceId);
    if (!dev.compliance_csid_token || !dev.encrypted_compliance_secret || !dev.encrypted_private_key) {
      throw new DomainError('COMPLIANCE_CSID_REQUIRED', 'يجب إصدار شهادة الامتثال (CCSID) أولاً قبل تشغيل اختبارات الامتثال.');
    }

    const settings = await this.getSettings(companyId);
    const gw = this.gatewayConfigFor(settings, dev.environment as ZatcaEnvironment);
    const auth: ZatcaBasicAuth = {
      binarySecurityToken: dev.compliance_csid_token,
      secret: this.vault.decrypt(dev.encrypted_compliance_secret),
    };
    const privKey = this.vault.decrypt(dev.encrypted_private_key);

    const testCases: Array<{
      key: 'STANDARD' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
      labelAr: string;
      invoiceType: 'TAX_INVOICE' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
      isSimplifiedFlow: boolean;
    }> = [
      { key: 'STANDARD', labelAr: 'فاتورة ضريبية قياسية (B2B)', invoiceType: 'TAX_INVOICE', isSimplifiedFlow: false },
      { key: 'SIMPLIFIED', labelAr: 'فاتورة ضريبية مبسطة (B2C)', invoiceType: 'SIMPLIFIED', isSimplifiedFlow: true },
      { key: 'CREDIT_NOTE', labelAr: 'إشعار دائن (Credit Note)', invoiceType: 'CREDIT_NOTE', isSimplifiedFlow: false },
      { key: 'DEBIT_NOTE', labelAr: 'إشعار مدين (Debit Note)', invoiceType: 'DEBIT_NOTE', isSimplifiedFlow: false },
    ];

    const checks: Record<string, any> = {};
    let prevHash = ZATCA_GENESIS_PIH;
    let icv = 1;

    for (const tc of testCases) {
      const uuid = randomUUID();
      const built = buildZatcaUblInvoice({
        invoiceId: uuid,
        invoiceNo: `CMP-${tc.key}-${icv}`,
        invoiceType: tc.invoiceType,
        isSimplifiedFlow: tc.isSimplifiedFlow,
        issueDate: new Date().toISOString().slice(0, 10),
        issueTime: '12:00:00',
        currencyCode: 'SAR',
        icv,
        previousInvoiceHash: prevHash,
        originalInvoiceNo: tc.invoiceType === 'CREDIT_NOTE' || tc.invoiceType === 'DEBIT_NOTE' ? 'CMP-STANDARD-1' : null,
        instructionNote: tc.invoiceType === 'CREDIT_NOTE' ? 'تسوية تجريبية لاختبار الامتثال' : tc.invoiceType === 'DEBIT_NOTE' ? 'زيادة قيمة تجريبية لاختبار الامتثال' : null,
        seller: {
          name: settings.organizationNameAr || 'شركة اختبار الامتثال',
          vatNumber: dev.vat_number,
          crNumber: dev.cr_number || settings.crNumber || '1010123456',
          streetName: settings.streetName || 'طريق الملك فهد',
          buildingNumber: settings.buildingNumber || '1234',
          district: settings.district || 'العليا',
          city: settings.city || 'الرياض',
          postalCode: settings.postalCode || '12211',
          countryCode: settings.countryCode || 'SA',
        },
        buyer: {
          name: 'شركة العميل التجريبي',
          vatNumber: '300000000000003',
          crNumber: '1010999999',
          streetName: 'طريق الأمير سلطان',
          buildingNumber: '5678',
          district: 'الملقا',
          city: 'الرياض',
          postalCode: '13524',
          countryCode: 'SA',
        },
        lines: [
          {
            id: 1,
            name: 'خدمة اختبار امتثال ZATCA Phase 2',
            quantity: 1,
            unitPrice: 1000,
            discount: 0,
            netAmount: 1000,
            vatRate: 15,
            vatAmount: 150,
            totalWithVat: 1150,
            vatCategory: 'S',
          },
        ],
        subtotal: 1000,
        discountTotal: 0,
        taxableAmount: 1000,
        vatAmount: 150,
        totalAmount: 1150,
        privateKeyPem: privKey,
        certificateBase64: dev.compliance_csid_token,
      });

      const res = await this.fatoora.checkComplianceInvoice(gw, auth, {
        invoiceHash: built.invoiceHashBase64,
        uuid,
        invoiceBase64: built.ublXmlBase64,
      });

      checks[tc.key] = {
        labelAr: tc.labelAr,
        passed: res.ok,
        httpStatus: res.httpStatus,
        responseCode: res.responseCode,
        messageAr: res.responseMessageAr,
        warnings: res.validationResults.warningMessages,
        errors: res.validationResults.errorMessages,
      };
      prevHash = built.invoiceHashBase64;
      icv++;
    }

    await this.db.query(
      `UPDATE sal.zatca_egs_devices
          SET compliance_checks_passed = $3, updated_by = sys.current_user_id()
        WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId, JSON.stringify(checks)],
    );

    const allPassed = Object.values(checks).every((c: any) => c.passed);
    return {
      deviceId,
      allPassed,
      checks,
      messageAr: allPassed
        ? 'اجتازت جميع أنواع الفواتير (القياسية، المبسطة، الدائن، المدين) اختبارات الامتثال بنجاح — يمكنك الآن إصدار شهادة الإنتاج (PCSID).'
        : 'بعض اختبارات الامتثال لم تجتز بعد؛ راجع رسائل الهيئة التفصيلية لكل نوع فاتورة.',
    };
  }

  /** Step 6: Request Official Production CSID using Compliance Request ID. */
  async requestDeviceProductionCsid(companyId: string, deviceId: string) {
    const dev = await this.db.one<any>(
      `SELECT * FROM sal.zatca_egs_devices WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId],
    );
    if (!dev) throw new NotFoundError('EGS Device', deviceId);
    if (!dev.compliance_request_id || !dev.compliance_csid_token || !dev.encrypted_compliance_secret) {
      throw new DomainError('COMPLIANCE_REQUIRED', 'يجب إتمام خطوتي شهادة الامتثال واختبارات الامتثال قبل طلب شهادة الإنتاج (PCSID).');
    }

    const settings = await this.getSettings(companyId);
    const gw = this.gatewayConfigFor(settings, dev.environment as ZatcaEnvironment);
    const auth: ZatcaBasicAuth = {
      binarySecurityToken: dev.compliance_csid_token,
      secret: this.vault.decrypt(dev.encrypted_compliance_secret),
    };

    const apiRes = await this.fatoora.requestProductionCsid(gw, auth, {
      complianceRequestId: dev.compliance_request_id,
    });

    if (!apiRes.ok || !apiRes.binarySecurityToken || !apiRes.secret) {
      throw new DomainError('ZATCA_PRODUCTION_CSID_FAILED', apiRes.errorMessageAr || 'فشل إصدار شهادة الإنتاج PCSID من الهيئة');
    }

    const encProdSecret = this.vault.encrypt(apiRes.secret);
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    await this.db.query(
      `UPDATE sal.zatca_egs_devices
          SET production_request_id = $3,
              production_csid_token = $4,
              encrypted_production_secret = $5,
              certificate_status = 'PRODUCTION',
              connection_status = 'CONNECTED',
              csid_issued_at = now(),
              csid_expires_at = $6::timestamptz,
              updated_by = sys.current_user_id()
        WHERE company_id = $1 AND id = $2`,
      [companyId, deviceId, apiRes.requestId || dev.compliance_request_id, apiRes.binarySecurityToken, encProdSecret, expiresAt],
    );

    await this.db.query(
      `UPDATE sal.zatca_settings
          SET csid_status = 'PRODUCTION',
              csid_expires_at = $2::timestamptz,
              connection_status = 'CONNECTED',
              last_onboarded_at = now(),
              updated_by = sys.current_user_id()
        WHERE company_id = $1`,
      [companyId, expiresAt],
    );

    await this.emitNotification(companyId, {
      egsDeviceId: deviceId,
      category: 'SUBMISSION_OK',
      severity: 'SUCCESS',
      titleAr: `تم تفعيل شهادة الإنتاج PCSID للجهاز ${dev.device_name}`,
      messageAr: `الشهادة صالحة حتى ${expiresAt.slice(0, 10)} وجاهزة لتخليص وإبلاغ الفواتير في بيئة ${dev.environment}.`,
    });

    return {
      ok: true,
      deviceId,
      environment: dev.environment,
      certificateStatus: 'PRODUCTION',
      productionRequestId: apiRes.requestId,
      expiresAt,
      messageAr: 'تم إصدار شهادة الإنتاج الرسمية (Production CSID) وتخزينها مشفرة بنجاح.',
    };
  }

  /** Step 7: Test Live Connection, Certificate Expiry & Auth against Fatoora Gateway. */
  async testDeviceConnection(companyId: string, deviceId?: string) {
    const settings = await this.getSettings(companyId);
    const dev = deviceId
      ? await this.db.one<any>(`SELECT * FROM sal.zatca_egs_devices WHERE company_id = $1 AND id = $2`, [companyId, deviceId])
      : await this.db.one<any>(
          `SELECT * FROM sal.zatca_egs_devices WHERE company_id = $1 AND environment = $2 AND device_status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
          [companyId, settings.environment || 'SANDBOX'],
        );

    const env = (dev?.environment || settings.environment || 'SANDBOX') as ZatcaEnvironment;
    const gw = this.gatewayConfigFor(settings, env);

    let auth: ZatcaBasicAuth | null = null;
    if (dev?.production_csid_token && dev?.encrypted_production_secret) {
      auth = {
        binarySecurityToken: dev.production_csid_token,
        secret: this.vault.decrypt(dev.encrypted_production_secret),
      };
    } else if (dev?.compliance_csid_token && dev?.encrypted_compliance_secret) {
      auth = {
        binarySecurityToken: dev.compliance_csid_token,
        secret: this.vault.decrypt(dev.encrypted_compliance_secret),
      };
    }

    const result = await this.fatoora.testConnection(gw, auth);
    const connStatus = result.reachable ? (result.authenticated ? 'CONNECTED' : 'WARNING') : 'ERROR';

    if (dev) {
      await this.db.query(
        `UPDATE sal.zatca_egs_devices
            SET connection_status = $3, last_tested_at = now(), last_test_result = $4, updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $2`,
        [companyId, dev.id, connStatus, JSON.stringify(result)],
      );
    }

    await this.db.query(
      `UPDATE sal.zatca_settings
          SET connection_status = $2, last_connection_test_at = now(), last_connection_message = $3, updated_by = sys.current_user_id()
        WHERE company_id = $1`,
      [companyId, connStatus, result.messageAr],
    );

    return {
      ...result,
      environment: env,
      deviceId: dev?.id || null,
      deviceName: dev?.device_name || null,
      certificateStatus: dev?.certificate_status || settings.csidStatus || 'NOT_ONBOARDED',
      csidExpiresAt: dev?.csid_expires_at || settings.csidExpiresAt || null,
      connectionStatus: connStatus,
    };
  }

  /** Backwards-compatible onboarding wrapper calling real CSR + Compliance CSID flow. */
  async onboard(companyId: string, body: z.infer<typeof ZatcaOnboardInput>) {
    const settings = await this.getSettings(companyId);
    const env = (body.environment || settings.environment || 'SANDBOX') as ZatcaEnvironment;
    let targetDeviceId = body.deviceId;

    if (!targetDeviceId) {
      const existing = await this.db.one<{ id: string }>(
        `SELECT id FROM sal.zatca_egs_devices WHERE company_id = $1 AND environment = $2 ORDER BY created_at DESC LIMIT 1`,
        [companyId, env],
      );
      if (existing) {
        targetDeviceId = existing.id;
      } else {
        const created = await this.createDevice(companyId, {
          deviceCode: `EGS-${env.slice(0, 3)}-01`,
          deviceName: body.egsUnitName || settings.egsUnitName || `جهاز ${env}`,
          deviceType: 'ERP_CLOUD',
          environment: env,
          vatNumber: settings.vatNumber || '310123456700003',
          crNumber: settings.crNumber || '1010123456',
          serialNumber: body.egsSerialNo || settings.egsSerialNo || `EGS-${Date.now()}`,
          invoicingTypeCode: '1100',
        });
        targetDeviceId = created.id;
      }
    }

    await this.generateDeviceCsr(companyId, targetDeviceId!);
    const ccsid = await this.requestDeviceComplianceCsid(companyId, targetDeviceId!, body.otp);
    return {
      success: true,
      ...ccsid,
    };
  }

  // ── 3. Pre-Submission Validation Engine ────────────────────────────────────
  private async loadFullInvoiceContext(companyId: string, invoiceId: string) {
    const inv = await this.db.one<any>(
      `SELECT i.*,
              c.name_ar AS "clientName", c.vat_number AS "clientVatNumber", c.cr_number AS "clientCrNumber",
              c.street_address AS "clientStreet", c.building_number AS "clientBuildingNumber",
              c.additional_number AS "clientAdditionalNumber", c.district AS "clientDistrict",
              c.city AS "clientCity", c.postal_code AS "clientPostalCode",
              COALESCE(c.country_code, 'SA') AS "clientCountryCode",
              COALESCE(c.buyer_type, 'B2B') AS "clientBuyerType",
              COALESCE(c.id_scheme, 'CRN') AS "clientIdScheme",
              orig.invoice_no AS "originalInvoiceNo",
              comp.name_ar AS "companyName", comp.tax_number AS "companyVatNumber", comp.commercial_reg AS "companyCrNumber",
              je.entry_no AS "journalEntryNo", je.status AS "journalStatus", je.entry_date AS "journalDate"
         FROM sal.invoices i
         JOIN prj.clients c ON c.id = i.client_id
         JOIN core.companies comp ON comp.id = i.company_id
         LEFT JOIN sal.invoices orig ON orig.id = i.original_invoice_id
         LEFT JOIN acc.journal_entries je ON je.id = i.journal_entry_id
        WHERE i.id = $1 AND i.company_id = $2`,
      [invoiceId, companyId],
    );
    if (!inv) throw new NotFoundError('Invoice', invoiceId);

    const lines = await this.db.query<any>(
      `SELECT * FROM sal.invoice_lines WHERE invoice_id = $1 ORDER BY line_no ASC`,
      [invoiceId],
    );
    const settings = await this.getSettings(companyId);

    return { inv, lines, settings };
  }

  async validateInvoice(companyId: string, invoiceId: string) {
    const { inv, lines, settings } = await this.loadFullInvoiceContext(companyId, invoiceId);
    const report = validateInvoiceForZatca({
      invoiceNo: inv.invoice_no,
      invoiceType: inv.invoice_type,
      invoiceSubType: inv.invoice_sub_type,
      uuid: inv.zatca_uuid,
      issueDate: String(inv.issue_date).slice(0, 10),
      issueTime: inv.issue_time ? new Date(inv.issue_time).toISOString().slice(11, 19) : '12:00:00',
      currencyCode: inv.currency_code || 'SAR',
      originalInvoiceNo: inv.originalInvoiceNo,
      returnReason: inv.return_reason,
      subtotal: Number(inv.subtotal || 0),
      discountAmount: Number(inv.discount_amount || 0),
      taxableAmount: Number(inv.taxable_amount || inv.subtotal || 0),
      vatAmount: Number(inv.vat_amount || 0),
      totalAmount: Number(inv.total_amount || 0),
      seller: {
        name: settings.organizationNameAr || inv.companyName,
        vatNumber: settings.vatNumber || inv.companyVatNumber,
        crNumber: settings.crNumber || inv.companyCrNumber,
        buildingNumber: settings.buildingNumber,
        streetName: settings.streetName,
        district: settings.district,
        city: settings.city,
        postalCode: settings.postalCode,
        countryCode: settings.countryCode || 'SA',
      },
      buyer: {
        name: inv.clientName,
        vatNumber: inv.clientVatNumber,
        crNumber: inv.clientCrNumber,
        buildingNumber: inv.clientBuildingNumber,
        streetName: inv.clientStreet,
        district: inv.clientDistrict,
        city: inv.clientCity,
        postalCode: inv.clientPostalCode,
        countryCode: inv.clientCountryCode || 'SA',
        buyerType: inv.clientBuyerType,
      },
      lines: lines.map((l: any) => ({
        lineNo: l.line_no,
        description: l.description,
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unit_price || 0),
        discountPct: Number(l.discount_pct || 0),
        subtotal: Number(l.subtotal || 0),
        vatRate: Number(l.vat_rate || 0),
        vatAmount: Number(l.vat_amount || 0),
        total: Number(l.total || 0),
        vatCategory: l.vat_category || 'S',
        vatExemptionReason: l.vat_exemption_reason,
      })),
      icv: inv.zatca_icv,
      pih: inv.zatca_pih,
    });

    // Update non-terminal invoice readiness status without touching accounting status
    const meta = getZatcaStatusMeta(inv.zatca_status);
    if (!meta.isTerminalAccepted && inv.status === 'POSTED') {
      const nextStatus: ZatcaUnifiedStatus = report.valid ? 'READY' : 'VALIDATION_FAILED';
      const complianceFlag = report.valid ? (report.warnings.length > 0 ? 'WARNING' : 'PASS') : 'FAIL';
      await this.recordStatusTransition(companyId, invoiceId, inv.zatca_status, nextStatus, {
        responseCode: report.valid ? 'VALIDATED_OK' : 'VALIDATION_FAILED',
        message: report.valid
          ? 'اجتازت الفاتورة جميع فحوصات ما قبل الإرسال بنجاح.'
          : `فشل التحقق قبل الإرسال (${report.errors.length} أخطاء): ${report.errors[0]?.messageAr}`,
        details: { errors: report.errors, warnings: report.warnings },
      });
      await this.db.query(
        `UPDATE sal.invoices
            SET zatca_status = $2, zatca_compliance_status = $3,
                zatca_submission_type = $4, updated_by = sys.current_user_id()
          WHERE id = $1`,
        [invoiceId, nextStatus, complianceFlag, report.recommendedSubmissionType],
      );
    }

    return report;
  }

  // ── 4. Real Invoice Transmission (Clearance B2B & Reporting B2C) ───────────
  async transmitInvoice(companyId: string, invoiceId: string, opts?: { deviceId?: string; isRetry?: boolean }) {
    const { inv, lines, settings } = await this.loadFullInvoiceContext(companyId, invoiceId);

    // 1. Anti-duplication & status guard
    const gate = assertCanTransmitToZatca(inv.zatca_status, inv.status === 'POSTED');
    if (!gate.ok) {
      throw new DomainError('ZATCA_TRANSMISSION_BLOCKED', gate.reasonAr || 'لا يمكن إرسال هذه الفاتورة حالياً');
    }

    // 2. Run 22-Point Pre-Submission Validation
    const validation = await this.validateInvoice(companyId, invoiceId);
    if (!validation.valid) {
      throw new DomainError(
        'ZATCA_VALIDATION_FAILED',
        `فشل التحقق قبل الإرسال (${validation.errors.length} أخطاء): ${validation.errors.map((e) => `${e.fieldLabelAr}: ${e.messageAr}`).join(' | ')}`,
      );
    }

    // 3. Resolve Active EGS Device for active environment & branch
    const env = (settings.environment || 'SANDBOX') as ZatcaEnvironment;
    const device = opts?.deviceId
      ? await this.db.one<any>(`SELECT * FROM sal.zatca_egs_devices WHERE company_id = $1 AND id = $2`, [companyId, opts.deviceId])
      : await this.db.one<any>(
          `SELECT * FROM sal.zatca_egs_devices
            WHERE company_id = $1 AND environment = $2 AND device_status = 'ACTIVE'
              AND (branch_id IS NOT DISTINCT FROM $3 OR branch_id IS NULL)
            ORDER BY (branch_id IS NOT NULL) DESC, (certificate_status = 'PRODUCTION') DESC, created_at DESC
            LIMIT 1`,
          [companyId, env, inv.branch_id ?? null],
        );

    if (!device) {
      throw new DomainError(
        'ZATCA_NO_ACTIVE_DEVICE',
        `لا يوجد جهاز فوترة إلكترونية (EGS) نشط ومسجّل لبيئة ${env}. يرجى إكمال معالج الربط (Onboarding) أولاً.`,
      );
    }

    // Resolve CSID credentials (Production CSID preferred; Compliance CSID allowed only in Sandbox)
    const token = device.production_csid_token || (env === 'SANDBOX' ? device.compliance_csid_token : null);
    const encSecret = device.encrypted_production_secret || (env === 'SANDBOX' ? device.encrypted_compliance_secret : null);
    if (!token || !encSecret || !device.encrypted_private_key) {
      throw new DomainError(
        'ZATCA_CSID_MISSING',
        `الجهاز (${device.device_name}) لا يملك شهادة CSID معتمدة لبيئة ${env}. أكمل خطوة إصدار الشهادة أولاً.`,
      );
    }

    const auth: ZatcaBasicAuth = { binarySecurityToken: token, secret: this.vault.decrypt(encSecret) };
    const privateKeyPem = this.vault.decrypt(device.encrypted_private_key);

    // 4. Preserve exact same UUID on retries! Never issue a second UUID for the same invoice.
    const invoiceUuid = inv.zatca_uuid;
    const icv = inv.zatca_icv || Number(device.icv_counter || 0) + 1;
    const pih = inv.zatca_pih || device.last_pih || ZATCA_GENESIS_PIH;

    // 5. Build Signed UBL 2.1 XML + Canonical Hash + 9-Tag TLV QR
    const resolvedType = determineRecommendedZatcaType({
      invoiceType: inv.invoice_type,
      buyerVatNumber: inv.clientVatNumber,
      buyerType: inv.clientBuyerType,
    });
    const isSimplifiedFlow = resolvedType.submissionType === 'REPORTING';

    const ublInput: ZatcaInvoiceUblInput = {
      invoiceId: invoiceUuid,
      invoiceNo: inv.invoice_no,
      invoiceType: inv.invoice_type as any,
      isSimplifiedFlow,
      issueDate: String(inv.issue_date).slice(0, 10),
      issueTime: inv.issue_time ? new Date(inv.issue_time).toISOString().slice(11, 19) : '12:00:00',
      currencyCode: inv.currency_code || 'SAR',
      icv,
      previousInvoiceHash: pih,
      originalInvoiceNo: inv.originalInvoiceNo,
      instructionNote: inv.return_reason,
      seller: {
        name: settings.organizationNameAr || inv.companyName,
        vatNumber: settings.vatNumber || device.vat_number || inv.companyVatNumber,
        crNumber: settings.crNumber || device.cr_number || inv.companyCrNumber,
        streetName: settings.streetName,
        buildingNumber: settings.buildingNumber,
        additionalNumber: settings.additionalNumber,
        district: settings.district,
        city: settings.city,
        postalCode: settings.postalCode,
        countryCode: settings.countryCode || 'SA',
      },
      buyer: {
        name: inv.clientName,
        vatNumber: inv.clientVatNumber,
        crNumber: inv.clientCrNumber,
        idScheme: inv.clientIdScheme,
        streetName: inv.clientStreet,
        buildingNumber: inv.clientBuildingNumber,
        additionalNumber: inv.clientAdditionalNumber,
        district: inv.clientDistrict,
        city: inv.clientCity,
        postalCode: inv.clientPostalCode,
        countryCode: inv.clientCountryCode || 'SA',
      },
      lines: lines.map((l: any, idx: number) => {
        const qty = Number(l.quantity || 1);
        const unitPrice = Number(l.unit_price || 0);
        const net = Number(l.subtotal || 0);
        const computedDiscount =
          l.discount_amount != null
            ? Number(l.discount_amount)
            : Math.max(0, Number((qty * unitPrice - net).toFixed(2)));
        return {
          id: l.line_no ?? idx + 1,
          name: l.description || 'خدمة',
          quantity: qty,
          unitPrice,
          discount: computedDiscount,
          netAmount: net,
          vatRate: Number(l.vat_rate ?? 15),
          vatAmount: Number(l.vat_amount || 0),
          totalWithVat: Number(l.total || 0),
          vatCategory: l.vat_category || 'S',
          vatExemptionReason: l.vat_exemption_reason,
        };
      }),
      subtotal: Number(inv.subtotal || 0),
      discountTotal: Number(inv.discount_amount || 0),
      taxableAmount: Number(inv.taxable_amount || inv.subtotal || 0),
      vatAmount: Number(inv.vat_amount || 0),
      totalAmount: Number(inv.total_amount || 0),
      privateKeyPem,
      certificateBase64: token,
    };

    const built = buildZatcaUblInvoice(ublInput);
    const mode = built.submissionMode;

    // 6. Save unsigned & signed XML + QR into protected document store BEFORE calling Fatoora
    await this.saveDocument(companyId, invoiceId, 'RAW_XML', 'application/xml', built.rawUblXml);
    await this.saveDocument(companyId, invoiceId, 'SIGNED_XML', 'application/xml', built.ublXml);
    await this.saveDocument(companyId, invoiceId, 'QR_TLV', 'text/plain', built.qrCodeBase64);

    // 7. Transition to SUBMITTED before network call (prevents concurrent double-sends)
    const requestId = `ZREQ-${Date.now().toString(36).toUpperCase()}`;
    const maxAttempt = await this.db.one<{ n: number }>(
      `SELECT COALESCE(MAX(attempt_no), 0) AS n FROM sal.zatca_submissions WHERE invoice_id = $1`,
      [invoiceId],
    );
    const attemptNo = (maxAttempt?.n ?? 0) + 1;
    const idempotencyKey = `${invoiceId}:${invoiceUuid}:${env}`;

    await this.recordStatusTransition(companyId, invoiceId, inv.zatca_status, 'SUBMITTED', {
      requestId,
      message: `بدء إرسال الفاتورة عبر مسار ${mode === 'CLEARANCE' ? 'التخليص القياسي (Clearance)' : 'الإبلاغ المبسط (Reporting)'} — محاولة #${attemptNo}.`,
    });

    await this.db.query(
      `UPDATE sal.invoices
          SET zatca_status = 'SUBMITTED',
              egs_device_id = $2,
              zatca_environment = $3,
              zatca_submission_type = $4,
              zatca_hash = $5,
              zatca_qr_code = $6,
              zatca_ubl_xml = $7,
              zatca_signed_xml = $7,
              zatca_last_attempt_at = now(),
              zatca_request_id = $8,
              zatca_retry_count = CASE WHEN $9 THEN zatca_retry_count + 1 ELSE zatca_retry_count END,
              updated_by = sys.current_user_id()
        WHERE id = $1`,
      [invoiceId, device.id, env, mode, built.invoiceHashBase64, built.qrCodeBase64, built.ublXml, requestId, Boolean(opts?.isRetry)],
    );

    // 8. Real HTTPS Call to ZATCA Fatoora API (Clearance vs Reporting)
    const gw = this.gatewayConfigFor(settings, env);
    const apiRes =
      mode === 'CLEARANCE'
        ? await this.fatoora.clearStandardInvoice(gw, auth, {
            invoiceHash: built.invoiceHashBase64,
            uuid: invoiceUuid,
            invoiceBase64: built.ublXmlBase64,
          })
        : await this.fatoora.reportSimplifiedInvoice(gw, auth, {
            invoiceHash: built.invoiceHashBase64,
            uuid: invoiceUuid,
            invoiceBase64: built.ublXmlBase64,
          });

    // 9. Determine True Final Status Strictly From ZATCA API Response
    let finalStatus: ZatcaUnifiedStatus;
    if (apiRes.ok) {
      finalStatus = mode === 'CLEARANCE' ? 'CLEARED' : 'REPORTED';
    } else if (apiRes.retryable) {
      finalStatus = 'RETRY_PENDING';
    } else {
      finalStatus = apiRes.httpStatus === 400 || apiRes.httpStatus === 422 ? 'REJECTED' : 'FAILED';
    }

    const finalXml = apiRes.clearedInvoiceXml || built.ublXml;
    const finalQr = built.qrCodeBase64;

    if (apiRes.clearedInvoiceXml) {
      await this.saveDocument(companyId, invoiceId, 'CLEARED_XML', 'application/xml', apiRes.clearedInvoiceXml);
    }
    await this.saveDocument(companyId, invoiceId, 'ZATCA_RESPONSE', 'application/json', JSON.stringify(apiRes.raw || apiRes));

    // 10. Append-Only Submission Log
    await this.db.query(
      `INSERT INTO sal.zatca_submissions
         (company_id, invoice_id, egs_device_id, branch_id, invoice_uuid, attempt_no,
          environment, mode, operation, status, http_status_code, response_code, response_message,
          request_hash, request_meta, response, error_message, responded_at, idempotency_key,
          validation_warnings, validation_errors, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now(), $18, $19, $20, sys.current_user_id())`,
      [
        companyId,
        invoiceId,
        device.id,
        inv.branch_id ?? null,
        invoiceUuid,
        attemptNo,
        env,
        mode,
        opts?.isRetry ? 'RETRY' : mode,
        finalStatus,
        apiRes.httpStatus,
        apiRes.responseCode,
        apiRes.responseMessageAr,
        built.invoiceHashBase64,
        JSON.stringify({ requestId, icv, pih, deviceCode: device.device_code }),
        JSON.stringify(apiRes.raw || {}),
        apiRes.ok ? null : apiRes.responseMessageAr,
        idempotencyKey,
        JSON.stringify(apiRes.validationResults.warningMessages),
        JSON.stringify(apiRes.validationResults.errorMessages),
      ],
    );

    // 11. Update Invoice ZATCA State & Lock if Accepted (Accounting Journal Untouched!)
    const lockInvoice = finalStatus === 'CLEARED' || finalStatus === 'REPORTED';
    await this.db.query(
      `UPDATE sal.invoices
          SET zatca_status = $2,
              zatca_compliance_status = $3,
              zatca_response_code = $4,
              zatca_response_message = $5,
              zatca_response = $6,
              zatca_cleared_xml = COALESCE($7, zatca_cleared_xml),
              zatca_ubl_xml = $8,
              zatca_submitted_at = CASE WHEN $9 THEN now() ELSE zatca_submitted_at END,
              zatca_responded_at = now(),
              zatca_locked = CASE WHEN $9 THEN true ELSE zatca_locked END,
              updated_by = sys.current_user_id()
        WHERE id = $1`,
      [
        invoiceId,
        finalStatus,
        apiRes.ok ? (apiRes.validationResults.warningMessages.length > 0 ? 'WARNING' : 'PASS') : 'FAIL',
        apiRes.responseCode,
        apiRes.responseMessageAr,
        JSON.stringify(apiRes.raw || {}),
        apiRes.clearedInvoiceXml ?? null,
        finalXml,
        lockInvoice,
      ],
    );

    await this.recordStatusTransition(companyId, invoiceId, 'SUBMITTED', finalStatus, {
      requestId,
      responseCode: apiRes.responseCode,
      message: apiRes.responseMessageAr,
      details: { httpStatus: apiRes.httpStatus, validationResults: apiRes.validationResults },
    });

    // 12. Advance EGS ICV & PIH Chain ONLY on Confirmed Acceptance
    if (lockInvoice) {
      await this.db.query(
        `UPDATE sal.zatca_egs_devices
            SET icv_counter = GREATEST(icv_counter, $3),
                last_pih = $4,
                updated_by = sys.current_user_id()
          WHERE company_id = $1 AND id = $2`,
        [companyId, device.id, icv, built.invoiceHashBase64],
      );
      // Resolve any pending retry queue item
      await this.db.query(
        `UPDATE sal.zatca_retry_queue SET status = 'SUCCEEDED', updated_at = now() WHERE company_id = $1 AND invoice_id = $2 AND status IN ('QUEUED', 'PROCESSING')`,
        [companyId, invoiceId],
      );
      await this.emitNotification(companyId, {
        invoiceId,
        egsDeviceId: device.id,
        category: finalStatus === 'CLEARED' ? 'CLEARED' : 'REPORTED',
        severity: 'SUCCESS',
        titleAr: `${finalStatus === 'CLEARED' ? 'تم تخليص' : 'تم الإبلاغ عن'} الفاتورة ${inv.invoice_no}`,
        messageAr: apiRes.responseMessageAr,
      });
    } else if (finalStatus === 'RETRY_PENDING') {
      await this.enqueueRetry(companyId, {
        invoiceId,
        invoiceUuid,
        egsDeviceId: device.id,
        environment: env,
        idempotencyKey,
        maxAttempts: settings.retryMaxAttempts || 5,
        backoffSeconds: settings.retryBackoffSeconds || 60,
        errorCode: apiRes.responseCode,
        errorMessage: apiRes.responseMessageAr,
      });
      await this.emitNotification(companyId, {
        invoiceId,
        egsDeviceId: device.id,
        category: 'RETRY_NEEDED',
        severity: 'WARNING',
        titleAr: `تعذر مؤقت في إرسال الفاتورة ${inv.invoice_no} — أُضيفت لطابور إعادة المحاولة`,
        messageAr: apiRes.responseMessageAr,
      });
    } else {
      await this.emitNotification(companyId, {
        invoiceId,
        egsDeviceId: device.id,
        category: 'REJECTED',
        severity: 'CRITICAL',
        titleAr: `رفضت هيئة الزكاة الفاتورة ${inv.invoice_no}`,
        messageAr: apiRes.responseMessageAr,
      });
    }

    return {
      success: apiRes.ok,
      invoiceId,
      invoiceNo: inv.invoice_no,
      uuid: invoiceUuid,
      zatcaStatus: finalStatus,
      mode,
      httpStatus: apiRes.httpStatus,
      responseCode: apiRes.responseCode,
      responseMessage: apiRes.responseMessageAr,
      hash: built.invoiceHashBase64,
      qrCode: finalQr,
      qrDecodedTags: built.qrDecodedTags,
      ublXml: finalXml,
      validationResults: apiRes.validationResults,
      retryable: apiRes.retryable,
    };
  }

  /** Safe post-posting auto-submit hook called AFTER accounting transaction commits. */
  async submitAfterAccountingPost(companyId: string, invoiceId: string) {
    try {
      const settings = await this.getSettings(companyId);
      if (!settings?.autoSubmit) return null;
      return await this.transmitInvoice(companyId, invoiceId);
    } catch (err: any) {
      // Never fail or rollback the already-committed accounting invoice posting!
      this.logger.warn(`Auto-submit ZATCA deferred for invoice ${invoiceId}: ${err?.message}`);
      return { deferred: true, reason: err?.message };
    }
  }

  async batchTransmit(companyId: string) {
    const pending = await this.db.query<{ id: string }>(
      `SELECT id FROM sal.invoices
        WHERE company_id = $1 AND status = 'POSTED'
          AND zatca_status IN ('NOT_SUBMITTED', 'READY', 'RETRY_PENDING', 'FAILED')
          AND COALESCE(zatca_is_historical, false) = false
        ORDER BY issue_date ASC, invoice_no ASC LIMIT 50`,
      [companyId],
    );

    const results: any[] = [];
    for (const inv of pending) {
      try {
        results.push(await this.transmitInvoice(companyId, inv.id));
      } catch (err: any) {
        results.push({ invoiceId: inv.id, success: false, error: err?.message });
      }
    }

    return {
      total: pending.length,
      processed: results.length,
      cleared: results.filter((r) => r.zatcaStatus === 'CLEARED').length,
      reported: results.filter((r) => r.zatcaStatus === 'REPORTED').length,
      rejected: results.filter((r) => r.zatcaStatus === 'REJECTED' || r.zatcaStatus === 'FAILED').length,
      retryPending: results.filter((r) => r.zatcaStatus === 'RETRY_PENDING').length,
      results,
    };
  }

  // ── 5. Idempotent Retry Queue Engine ───────────────────────────────────────
  private async enqueueRetry(
    companyId: string,
    input: {
      invoiceId: string;
      invoiceUuid: string;
      egsDeviceId: string;
      environment: ZatcaEnvironment;
      idempotencyKey: string;
      maxAttempts: number;
      backoffSeconds: number;
      errorCode: string;
      errorMessage: string;
    },
  ) {
    const existing = await this.db.one<{ id: string; attempt_count: number; max_attempts: number }>(
      `SELECT id, attempt_count, max_attempts FROM sal.zatca_retry_queue WHERE company_id = $1 AND idempotency_key = $2`,
      [companyId, input.idempotencyKey],
    );

    if (existing) {
      const nextCount = existing.attempt_count + 1;
      const isDead = nextCount >= existing.max_attempts;
      const delaySec = Math.min(3600, input.backoffSeconds * Math.pow(2, nextCount - 1));
      await this.db.query(
        `UPDATE sal.zatca_retry_queue
            SET attempt_count = $2,
                status = $3,
                next_retry_at = now() + ($4 || ' seconds')::interval,
                last_error_code = $5,
                last_error_message = $6,
                updated_at = now()
          WHERE id = $1`,
        [existing.id, nextCount, isDead ? 'DEAD_LETTER' : 'QUEUED', String(delaySec), input.errorCode, input.errorMessage],
      );
      return;
    }

    await this.db.query(
      `INSERT INTO sal.zatca_retry_queue
         (company_id, invoice_id, invoice_uuid, egs_device_id, environment, idempotency_key,
          attempt_count, max_attempts, next_retry_at, last_error_code, last_error_message, status)
       VALUES ($1,$2,$3,$4,$5,$6, 1, $7, now() + ($8 || ' seconds')::interval, $9, $10, 'QUEUED')`,
      [
        companyId,
        input.invoiceId,
        input.invoiceUuid,
        input.egsDeviceId,
        input.environment,
        input.idempotencyKey,
        input.maxAttempts,
        String(input.backoffSeconds),
        input.errorCode,
        input.errorMessage,
      ],
    );
  }

  async listRetryQueue(companyId: string) {
    return this.db.query(
      `SELECT rq.id, rq.invoice_id AS "invoiceId", i.invoice_no AS "invoiceNo",
              rq.invoice_uuid AS "invoiceUuid", rq.environment, rq.attempt_count AS "attemptCount",
              rq.max_attempts AS "maxAttempts", rq.next_retry_at AS "nextRetryAt",
              rq.last_error_code AS "lastErrorCode", rq.last_error_message AS "lastErrorMessage",
              rq.status, rq.updated_at AS "updatedAt",
              c.name_ar AS "clientName", i.total_amount::text AS "totalAmount"
         FROM sal.zatca_retry_queue rq
         JOIN sal.invoices i ON i.id = rq.invoice_id
         JOIN prj.clients c ON c.id = i.client_id
        WHERE rq.company_id = $1
        ORDER BY rq.updated_at DESC LIMIT 100`,
      [companyId],
    );
  }

  async processRetryQueue(companyId: string, specificQueueId?: string) {
    const due = specificQueueId
      ? await this.db.query<any>(
          `SELECT * FROM sal.zatca_retry_queue WHERE company_id = $1 AND id = $2 AND status IN ('QUEUED', 'DEAD_LETTER')`,
          [companyId, specificQueueId],
        )
      : await this.db.query<any>(
          `SELECT * FROM sal.zatca_retry_queue
            WHERE company_id = $1 AND status = 'QUEUED' AND next_retry_at <= now()
            ORDER BY next_retry_at ASC LIMIT 20`,
          [companyId],
        );

    const results: any[] = [];
    for (const item of due) {
      await this.db.query(`UPDATE sal.zatca_retry_queue SET status = 'PROCESSING', updated_at = now() WHERE id = $1`, [item.id]);
      try {
        const res = await this.transmitInvoice(companyId, item.invoice_id, {
          deviceId: item.egs_device_id ?? undefined,
          isRetry: true,
        });
        results.push({ queueId: item.id, ...res });
      } catch (err: any) {
        await this.db.query(
          `UPDATE sal.zatca_retry_queue SET status = 'DEAD_LETTER', last_error_message = $2, updated_at = now() WHERE id = $1`,
          [item.id, err?.message || 'Retry failed'],
        );
        results.push({ queueId: item.id, invoiceId: item.invoice_id, success: false, error: err?.message });
      }
    }
    return { processed: results.length, results };
  }

  // ── 6. 7-Tab Invoice Detail 360° + Status History + Documents ──────────────
  async getInvoiceZatcaDetails(companyId: string, invoiceId: string) {
    const { inv, lines, settings } = await this.loadFullInvoiceContext(companyId, invoiceId);
    const docs = await this.db.query<any>(
      `SELECT doc_kind AS "docKind", sha256_checksum AS "sha256", mime_type AS "mimeType",
              content_text AS "contentText", size_bytes AS "sizeBytes", created_at AS "createdAt"
         FROM sal.zatca_documents WHERE company_id = $1 AND invoice_id = $2`,
      [companyId, invoiceId],
    );
    const submissions = await this.submissions(companyId, invoiceId);
    const statusHistory = await this.db.query<any>(
      `SELECT id, from_status AS "fromStatus", to_status AS "toStatus", response_code AS "responseCode",
              message, request_id AS "requestId", details, occurred_at AS "occurredAt"
         FROM sal.zatca_status_history
        WHERE company_id = $1 AND invoice_id = $2
        ORDER BY occurred_at DESC`,
      [companyId, invoiceId],
    );

    let journalLines: any[] = [];
    if (inv.journal_entry_id) {
      journalLines = await this.db.query<any>(
        `SELECT jl.line_no AS "lineNo", a.code AS "accountCode", a.name_ar AS "accountName",
                jl.description, jl.debit_base::text AS "debitBase", jl.credit_base::text AS "creditBase"
           FROM acc.journal_lines jl
           JOIN acc.accounts a ON a.id = jl.account_id
          WHERE jl.journal_entry_id = $1
          ORDER BY jl.line_no ASC`,
        [inv.journal_entry_id],
      );
    }

    const docMap = Object.fromEntries(docs.map((d: any) => [d.docKind, d]));
    const qrBase64 = inv.zatca_qr_code || docMap.QR_TLV?.contentText || '';

    return {
      invoice: {
        id: inv.id,
        invoiceNo: inv.invoice_no,
        invoiceType: inv.invoice_type,
        invoiceSubType: inv.invoice_sub_type,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        currencyCode: inv.currency_code,
        subtotal: inv.subtotal,
        discountAmount: inv.discount_amount,
        taxableAmount: inv.taxable_amount,
        vatAmount: inv.vat_amount,
        totalAmount: inv.total_amount,
        status: inv.status,
        paymentStatus: inv.payment_status,
        originalInvoiceId: inv.original_invoice_id,
        originalInvoiceNo: inv.originalInvoiceNo,
        returnReason: inv.return_reason,
        clientName: inv.clientName,
        clientVatNumber: inv.clientVatNumber,
        clientCity: inv.clientCity,
        sellerName: settings.organizationNameAr || inv.companyName,
        sellerVatNumber: settings.vatNumber || inv.companyVatNumber,
        lines,
      },
      zatca: {
        uuid: inv.zatca_uuid,
        icv: inv.zatca_icv,
        pih: inv.zatca_pih,
        invoiceHash: inv.zatca_hash,
        status: inv.zatca_status,
        statusMeta: getZatcaStatusMeta(inv.zatca_status),
        complianceStatus: inv.zatca_compliance_status,
        submissionType: inv.zatca_submission_type || (inv.invoice_type === 'SIMPLIFIED' ? 'REPORTING' : 'CLEARANCE'),
        environment: inv.zatca_environment || settings.environment,
        responseCode: inv.zatca_response_code,
        responseMessage: inv.zatca_response_message,
        response: inv.zatca_response,
        requestId: inv.zatca_request_id,
        submittedAt: inv.zatca_submitted_at,
        respondedAt: inv.zatca_responded_at,
        retryCount: inv.zatca_retry_count || 0,
        locked: Boolean(inv.zatca_locked),
        isHistorical: Boolean(inv.zatca_is_historical),
      },
      xml: {
        rawXml: docMap.RAW_XML?.contentText || null,
        signedXml: inv.zatca_signed_xml || docMap.SIGNED_XML?.contentText || inv.zatca_ubl_xml || null,
        clearedXml: inv.zatca_cleared_xml || docMap.CLEARED_XML?.contentText || null,
      },
      qr: {
        qrBase64,
        decodedTags: qrBase64 ? decodeZatcaQr(qrBase64) : {},
      },
      submissions,
      statusHistory,
      accounting: {
        journalEntryId: inv.journal_entry_id,
        journalEntryNo: inv.journalEntryNo,
        journalStatus: inv.journalStatus,
        journalDate: inv.journalDate,
        lines: journalLines,
      },
    };
  }

  // ── 7. Dashboard, Status, Submissions, Reports & Notifications ─────────────
  async status(companyId: string) {
    const s = await this.getSettings(companyId);
    const devices = await this.listDevices(companyId);
    const activeEnvDevices = devices.filter((d: any) => d.environment === s.environment);

    const counts = await this.db.query<{ status: string; n: string; total: string; vat: string }>(
      `SELECT zatca_status AS status, COUNT(*)::text AS n,
              COALESCE(SUM(total_amount_base), 0)::text AS total,
              COALESCE(SUM(vat_amount_base), 0)::text AS vat
         FROM sal.invoices WHERE company_id = $1 AND status = 'POSTED' GROUP BY zatca_status`,
      [companyId],
    );

    const byType = await this.db.query<{ invoiceType: string; n: string; total: string }>(
      `SELECT invoice_type AS "invoiceType", COUNT(*)::text AS n, COALESCE(SUM(total_amount_base), 0)::text AS total
         FROM sal.invoices WHERE company_id = $1 AND status = 'POSTED' GROUP BY invoice_type`,
      [companyId],
    );

    const dailySeries = await this.db.query<{ day: string; sent: string; accepted: string; rejected: string }>(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
              COUNT(*)::text AS sent,
              COUNT(*) FILTER (WHERE status IN ('CLEARED', 'REPORTED', 'ACCEPTED'))::text AS accepted,
              COUNT(*) FILTER (WHERE status IN ('REJECTED', 'FAILED', 'ERROR'))::text AS rejected
         FROM sal.zatca_submissions
        WHERE company_id = $1 AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1 ASC`,
      [companyId],
    );

    const monthlySeries = await this.db.query<{ month: string; total: string; vat: string; count: string }>(
      `SELECT to_char(issue_date, 'YYYY-MM') AS month,
              COALESCE(SUM(total_amount_base), 0)::text AS total,
              COALESCE(SUM(vat_amount_base), 0)::text AS vat,
              COUNT(*)::text AS count
         FROM sal.invoices
        WHERE company_id = $1 AND status = 'POSTED' AND issue_date >= current_date - interval '12 months'
        GROUP BY 1 ORDER BY 1 ASC`,
      [companyId],
    );

    const byBranch = await this.db.query<{ branchName: string; count: string; total: string }>(
      `SELECT COALESCE(b.name_ar, 'الفرع الرئيسي') AS "branchName",
              COUNT(*)::text AS count, COALESCE(SUM(i.total_amount_base), 0)::text AS total
         FROM sal.invoices i
         LEFT JOIN core.branches b ON b.id = i.branch_id
        WHERE i.company_id = $1 AND i.status = 'POSTED'
        GROUP BY 1 ORDER BY SUM(i.total_amount_base) DESC`,
      [companyId],
    );

    const noClientVat = await this.db.one<{ n: string }>(
      `SELECT COUNT(DISTINCT i.client_id)::text AS n
         FROM sal.invoices i JOIN prj.clients c ON c.id = i.client_id
        WHERE i.company_id = $1 AND i.invoice_type = 'TAX_INVOICE' AND (c.vat_number IS NULL OR c.vat_number = '')`,
      [companyId],
    );

    const lastSub = await this.db.one<{ created_at: string; status: string }>(
      `SELECT created_at, status FROM sal.zatca_submissions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [companyId],
    );

    const byStatus = Object.fromEntries(
      counts.map((c) => [c.status, { count: Number(c.n), total: D(c.total).toFixed(2), vat: D(c.vat).toFixed(2) }]),
    );

    const clearedCount = byStatus.CLEARED?.count ?? 0;
    const reportedCount = byStatus.REPORTED?.count ?? 0;
    const acceptedCount = clearedCount + reportedCount + (byStatus.ACCEPTED?.count ?? 0) + (byStatus.WARNING?.count ?? 0);
    const rejectedCount = (byStatus.REJECTED?.count ?? 0) + (byStatus.FAILED?.count ?? 0) + (byStatus.VALIDATION_FAILED?.count ?? 0);
    const retryPendingCount = byStatus.RETRY_PENDING?.count ?? 0;
    const pendingCount = (byStatus.NOT_SUBMITTED?.count ?? 0) + (byStatus.READY?.count ?? 0) + (byStatus.PENDING_SUBMISSION?.count ?? 0);
    const totalInvoices = counts.reduce((sum, c) => sum + Number(c.n), 0);
    const totalValue = counts.reduce((sum, c) => sum.plus(c.total), D(0)).toFixed(2);
    const totalVat = counts.reduce((sum, c) => sum.plus(c.vat), D(0)).toFixed(2);
    const attemptedTotal = acceptedCount + rejectedCount;
    const successRate = attemptedTotal > 0 ? Number(((acceptedCount / attemptedTotal) * 100).toFixed(1)) : 100;

    const vat = s.vatNumber || null;
    const addressComplete = Boolean(s.buildingNumber && s.streetName && s.district && s.city && s.postalCode);
    const hasActiveDevice = activeEnvDevices.length > 0;
    const primaryDevice = activeEnvDevices.find((d: any) => d.certificateStatus === 'PRODUCTION') || activeEnvDevices[0] || null;
    const effectiveCsidStatus = primaryDevice?.certificateStatus || s.csidStatus || 'NOT_ONBOARDED';
    const isCsidOk = ONBOARDED.has(effectiveCsidStatus);

    const checklist = [
      { key: 'vat', labelAr: 'الرقم الضريبي للمنشأة (15 رقماً)', ok: !!vat && /^3\d{13}3$/.test(vat), hintAr: 'يبدأ وينتهي بالرقم 3' },
      { key: 'address', labelAr: 'العنوان الوطني السعودي المهيكل للمنشأة', ok: addressComplete, hintAr: 'رقم المبنى (4 أرقام)، الشارع، الحي، المدينة، الرمز البريدي (5 أرقام)' },
      { key: 'egs', labelAr: 'تسجيل جهاز الفوترة الإلكترونية (EGS)', ok: hasActiveDevice, hintAr: `عدد الأجهزة في بيئة ${s.environment}: ${activeEnvDevices.length}` },
      { key: 'csid', labelAr: 'شهادة الامتثال / الإنتاج (CSID) المشفرة بالخادم', ok: isCsidOk, hintAr: 'تصدر عبر معالج الربط وإدخال OTP من بوابة فاتورة' },
      { key: 'prod', labelAr: 'شهادة الإنتاج المعتمدة (Production CSID)', ok: effectiveCsidStatus === 'PRODUCTION', hintAr: 'تمنح صلاحية التخليص والإبلاغ المباشر' },
      { key: 'clientVat', labelAr: 'الرقم الضريبي لعملاء الفواتير القياسية (B2B)', ok: Number(noClientVat?.n ?? 0) === 0, hintAr: `${noClientVat?.n ?? 0} عميل بدون رقم ضريبي` },
      { key: 'ublEngine', labelAr: 'محرك UBL 2.1 + XMLDSig/XAdES + QR 9-Tags + Vault', ok: true, hintAr: 'نشط ومطابق لمواصفات المرحلة الثانية' },
    ];

    return {
      environment: s.environment,
      connectionStatus: primaryDevice?.connectionStatus || s.connectionStatus || 'DISCONNECTED',
      csidStatus: effectiveCsidStatus,
      csidExpiresAt: primaryDevice?.csidExpiresAt || s.csidExpiresAt || null,
      lastOnboardedAt: primaryDevice?.csidIssuedAt || s.lastOnboardedAt || null,
      lastSubmissionAt: lastSub?.created_at || null,
      hasCryptoKeys: Boolean(primaryDevice?.hasPrivateKey || s.hasCryptoKeys),
      activeDeviceCount: activeEnvDevices.length,
      primaryDevice,
      readyToTransmit: checklist.every((c) => c.ok),
      transmissionAvailable: isCsidOk,
      transmissionNoteAr: isCsidOk
        ? `الربط المباشر ببيئة ${s.environment} مُهيّأ بشهادة ${effectiveCsidStatus}. يتم التحقق والتوقيع المشفر والإرسال الفعلي إلى بوابة فاتورة.`
        : 'يرجى إكمال معالج الربط (Onboarding) وإدخال رمز OTP الصادر من بوابة فاتورة لتفعيل الإرسال المباشر.',
      checklist,
      kpis: {
        totalInvoices,
        submittedCount: acceptedCount + rejectedCount,
        acceptedCount,
        clearedCount,
        reportedCount,
        rejectedCount,
        pendingCount,
        retryPendingCount,
        totalValue,
        totalVat,
        successRate,
      },
      submittedCount: acceptedCount,
      pendingCount,
      invoicesByStatus: byStatus,
      invoicesByType: byType,
      charts: {
        daily: dailySeries,
        monthly: monthlySeries,
        byBranch,
      },
    };
  }

  async submissions(
    companyId: string,
    invoiceId?: string,
    filters?: { status?: string; from?: string; to?: string; search?: string },
  ) {
    const where = ['s.company_id = $1'];
    const params: unknown[] = [companyId];
    if (invoiceId) {
      params.push(invoiceId);
      where.push(`s.invoice_id = $${params.length}`);
    }
    if (filters?.status && filters.status !== 'ALL') {
      params.push(filters.status);
      where.push(`s.status = $${params.length}`);
    }
    if (filters?.from) {
      params.push(filters.from);
      where.push(`s.created_at >= $${params.length}::date`);
    }
    if (filters?.to) {
      params.push(filters.to);
      where.push(`s.created_at < ($${params.length}::date + interval '1 day')`);
    }
    if (filters?.search) {
      params.push(`%${filters.search}%`);
      where.push(`(i.invoice_no ILIKE $${params.length} OR c.name_ar ILIKE $${params.length} OR s.invoice_uuid::text ILIKE $${params.length})`);
    }

    return this.db.query(
      `SELECT s.id, s.invoice_id AS "invoiceId", i.invoice_no AS "invoiceNo",
              COALESCE(s.invoice_uuid, i.zatca_uuid) AS "uuid",
              c.code AS "clientCode", c.name_ar AS "clientName", c.vat_number AS "clientVat",
              i.invoice_type AS "invoiceType", i.issue_date AS "invoiceDate",
              i.total_amount::text AS "totalAmount", i.vat_amount::text AS "vatAmount",
              s.attempt_no AS "attemptNo", s.environment, s.mode, s.operation,
              s.status, s.http_status_code AS "httpStatusCode",
              s.response_code AS "responseCode", s.response_message AS "responseMessage",
              s.error_message AS "errorMessage", s.request_hash AS "requestHash",
              s.validation_warnings AS "validationWarnings", s.validation_errors AS "validationErrors",
              d.device_code AS "deviceCode", d.device_name AS "deviceName",
              COALESCE(b.name_ar, 'الفرع الرئيسي') AS "branchName",
              s.created_at AS "createdAt", s.responded_at AS "respondedAt"
         FROM sal.zatca_submissions s
         JOIN sal.invoices i ON i.id = s.invoice_id
         JOIN prj.clients c ON c.id = i.client_id
         LEFT JOIN sal.zatca_egs_devices d ON d.id = s.egs_device_id
         LEFT JOIN core.branches b ON b.id = COALESCE(s.branch_id, i.branch_id)
        WHERE ${where.join(' AND ')}
        ORDER BY s.created_at DESC LIMIT 300`,
      params,
    );
  }

  async listInvoices(
    companyId: string,
    q?: { status?: string; type?: string; clientId?: string; branchId?: string; from?: string; to?: string; search?: string },
  ) {
    const where = ['i.company_id = $1', "i.status IN ('POSTED', 'PAID', 'PARTIALLY_PAID', 'DRAFT')"];
    const params: unknown[] = [companyId];
    if (q?.status && q.status !== 'ALL') {
      if (q.status === 'PENDING_ALL') {
        where.push(`i.zatca_status IN ('NOT_SUBMITTED', 'READY', 'PENDING_SUBMISSION', 'RETRY_PENDING')`);
      } else if (q.status === 'ACCEPTED_ALL') {
        where.push(`i.zatca_status IN ('CLEARED', 'REPORTED', 'ACCEPTED', 'WARNING')`);
      } else if (q.status === 'REJECTED_ALL') {
        where.push(`i.zatca_status IN ('REJECTED', 'FAILED', 'VALIDATION_FAILED')`);
      } else {
        params.push(q.status);
        where.push(`i.zatca_status = $${params.length}`);
      }
    }
    if (q?.type && q.type !== 'ALL') {
      params.push(q.type);
      where.push(`i.invoice_type = $${params.length}`);
    }
    if (q?.clientId) {
      params.push(q.clientId);
      where.push(`i.client_id = $${params.length}`);
    }
    if (q?.branchId) {
      params.push(q.branchId);
      where.push(`i.branch_id = $${params.length}`);
    }
    if (q?.from) {
      params.push(q.from);
      where.push(`i.issue_date >= $${params.length}::date`);
    }
    if (q?.to) {
      params.push(q.to);
      where.push(`i.issue_date <= $${params.length}::date`);
    }
    if (q?.search) {
      params.push(`%${q.search}%`);
      where.push(`(i.invoice_no ILIKE $${params.length} OR c.name_ar ILIKE $${params.length} OR c.vat_number ILIKE $${params.length} OR i.zatca_uuid::text ILIKE $${params.length})`);
    }

    return this.db.query(
      `SELECT i.id, i.invoice_no AS "invoiceNo", i.invoice_type AS "invoiceType",
              i.zatca_uuid AS "uuid", i.zatca_icv AS "icv",
              i.issue_date AS "issueDate", i.currency_code AS "currencyCode",
              i.subtotal::text AS "subtotal", i.vat_amount::text AS "vatAmount", i.total_amount::text AS "totalAmount",
              i.status AS "accountingStatus",
              i.zatca_status AS "zatcaStatus", i.zatca_compliance_status AS "complianceStatus",
              i.zatca_submission_type AS "submissionType", i.zatca_environment AS "environment",
              i.zatca_response_code AS "responseCode", i.zatca_response_message AS "responseMessage",
              i.zatca_hash AS "hash", i.zatca_submitted_at AS "submittedAt", i.zatca_responded_at AS "respondedAt",
              i.zatca_retry_count AS "retryCount", i.zatca_locked AS "locked",
              i.zatca_qr_code AS "zatcaQrCode", (i.zatca_qr_code IS NOT NULL) AS "hasQr",
              i.journal_entry_id AS "journalEntryId",
              c.id AS "clientId", c.code AS "clientCode", c.name_ar AS "clientName", c.vat_number AS "clientVat",
              COALESCE(b.name_ar, 'الفرع الرئيسي') AS "branchName",
              d.device_code AS "deviceCode"
         FROM sal.invoices i
         JOIN prj.clients c ON c.id = i.client_id
         LEFT JOIN core.branches b ON b.id = i.branch_id
         LEFT JOIN sal.zatca_egs_devices d ON d.id = i.egs_device_id
        WHERE ${where.join(' AND ')}
        ORDER BY i.issue_date DESC, i.invoice_no DESC LIMIT 300`,
      params,
    );
  }

  async getInvoiceUblXml(companyId: string, invoiceId: string) {
    const details = await this.getInvoiceZatcaDetails(companyId, invoiceId);
    return {
      invoiceNo: details.invoice.invoiceNo,
      uuid: details.zatca.uuid,
      zatcaStatus: details.zatca.status,
      hash: details.zatca.invoiceHash,
      qrCode: details.qr.qrBase64,
      qrDecodedTags: details.qr.decodedTags,
      ublXml: details.xml.clearedXml || details.xml.signedXml || details.xml.rawXml || '',
      rawXml: details.xml.rawXml,
      signedXml: details.xml.signedXml,
      clearedXml: details.xml.clearedXml,
      submittedAt: details.zatca.submittedAt,
      response: details.zatca.response,
    };
  }

  decodeQr(body: z.infer<typeof DecodeQrInput>) {
    const tags = decodeZatcaQr(body.qrBase64);
    return { tagCount: Object.keys(tags).length, tags };
  }

  async listNotifications(companyId: string) {
    return this.db.query(
      `SELECT n.id, n.invoice_id AS "invoiceId", i.invoice_no AS "invoiceNo",
              n.egs_device_id AS "egsDeviceId", n.category, n.severity,
              n.title_ar AS "titleAr", n.message_ar AS "messageAr",
              n.is_read AS "isRead", n.created_at AS "createdAt"
         FROM sal.zatca_notifications n
         LEFT JOIN sal.invoices i ON i.id = n.invoice_id
        WHERE n.company_id = $1
        ORDER BY n.created_at DESC LIMIT 80`,
      [companyId],
    );
  }

  async markNotificationRead(companyId: string, id: string) {
    await this.db.query(
      `UPDATE sal.zatca_notifications SET is_read = true WHERE company_id = $1 AND id = $2`,
      [companyId, id],
    );
    return { ok: true };
  }

  // ── Internal Persistence Helpers ───────────────────────────────────────────
  private async saveDocument(
    companyId: string,
    invoiceId: string,
    docKind: 'RAW_XML' | 'SIGNED_XML' | 'CLEARED_XML' | 'QR_TLV' | 'ZATCA_RESPONSE' | 'PDF_SNAPSHOT',
    mimeType: string,
    contentText: string,
  ) {
    const checksum = createHash('sha256').update(contentText, 'utf8').digest('hex');
    const sizeBytes = Buffer.byteLength(contentText, 'utf8');
    await this.db.query(
      `INSERT INTO sal.zatca_documents
         (company_id, invoice_id, doc_kind, sha256_checksum, mime_type, content_text, size_bytes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7, sys.current_user_id())
       ON CONFLICT (invoice_id, doc_kind)
       DO UPDATE SET sha256_checksum = EXCLUDED.sha256_checksum,
                     content_text = EXCLUDED.content_text,
                     size_bytes = EXCLUDED.size_bytes,
                     created_at = now()`,
      [companyId, invoiceId, docKind, checksum, mimeType, contentText, sizeBytes],
    );
  }

  private async recordStatusTransition(
    companyId: string,
    invoiceId: string,
    fromStatus: string | null,
    toStatus: ZatcaUnifiedStatus,
    meta: { responseCode?: string; message?: string; requestId?: string; details?: any },
  ) {
    await this.db.query(
      `INSERT INTO sal.zatca_status_history
         (company_id, invoice_id, from_status, to_status, response_code, message, request_id, details, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, sys.current_user_id())`,
      [
        companyId,
        invoiceId,
        fromStatus,
        toStatus,
        meta.responseCode ?? null,
        meta.message ?? null,
        meta.requestId ?? null,
        meta.details ? JSON.stringify(meta.details) : null,
      ],
    );
  }

  private async emitNotification(
    companyId: string,
    n: {
      invoiceId?: string;
      egsDeviceId?: string;
      category: 'SUBMISSION_OK' | 'CLEARED' | 'REPORTED' | 'REJECTED' | 'CONNECTION_FAILED' | 'CERT_EXPIRY' | 'PENDING_INVOICES' | 'RETRY_NEEDED' | 'SYSTEM';
      severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
      titleAr: string;
      messageAr: string;
    },
  ) {
    try {
      await this.db.query(
        `INSERT INTO sal.zatca_notifications
           (company_id, invoice_id, egs_device_id, category, severity, title_ar, message_ar)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [companyId, n.invoiceId ?? null, n.egsDeviceId ?? null, n.category, n.severity, n.titleAr, n.messageAr],
      );
    } catch {
      // Non-critical notification insert must never disrupt main flow
    }
  }
}
