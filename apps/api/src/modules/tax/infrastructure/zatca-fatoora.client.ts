import { Injectable, Logger } from '@nestjs/common';
import { ZatcaEnvironment } from '../domain/zatca-csr';

/**
 * Official ZATCA Fatoora Phase 2 (Integration Phase) REST API Gateway Client.
 *
 * Official Endpoints:
 * - SANDBOX:    https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal
 * - SIMULATION: https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation
 * - PRODUCTION: https://gw-fatoora.zatca.gov.sa/e-invoicing/core
 *
 * Strictly enforces:
 * - Server-side execution only (zero credentials ever exposed to Frontend)
 * - Accept-Version: V2 header
 * - Explicit timeout & transient network classification (`retryable`)
 * - Never fabricates `CLEARED` / `REPORTED` status without an actual API response!
 */

export const ZATCA_DEFAULT_URLS: Record<ZatcaEnvironment, string> = {
  SANDBOX: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  SIMULATION: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  PRODUCTION: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

export interface ZatcaGatewayConfig {
  environment: ZatcaEnvironment;
  baseUrl?: string;
  apiVersion?: string;
  timeoutMs?: number;
}

export interface ZatcaBasicAuth {
  binarySecurityToken: string;
  secret: string;
}

export interface ZatcaValidationMsg {
  type?: string;
  code: string;
  category?: string;
  message: string;
  status?: string;
}

export interface ZatcaApiValidationResults {
  status: 'PASS' | 'WARNING' | 'ERROR';
  infoMessages: ZatcaValidationMsg[];
  warningMessages: ZatcaValidationMsg[];
  errorMessages: ZatcaValidationMsg[];
}

export interface ZatcaCsidApiResponse {
  ok: boolean;
  httpStatus: number;
  requestId?: string;
  dispositionMessage?: string;
  binarySecurityToken?: string;
  secret?: string;
  errors?: any[];
  errorMessageAr?: string;
  retryable: boolean;
  raw?: any;
}

export interface ZatcaInvoiceApiResponse {
  ok: boolean;
  httpStatus: number;
  mode: 'CLEARANCE' | 'REPORTING' | 'COMPLIANCE';
  clearanceStatus?: 'CLEARED' | 'NOT_CLEARED' | string;
  reportingStatus?: 'REPORTED' | 'NOT_REPORTED' | string;
  clearedInvoiceBase64?: string;
  clearedInvoiceXml?: string;
  validationResults: ZatcaApiValidationResults;
  responseCode: string;
  responseMessageAr: string;
  retryable: boolean;
  raw?: any;
}

@Injectable()
export class ZatcaFatooraClient {
  private readonly logger = new Logger(ZatcaFatooraClient.name);

  resolveBaseUrl(config: ZatcaGatewayConfig): string {
    const custom = (config.baseUrl || '').trim().replace(/\/$/, '');
    if (custom) return custom;
    return ZATCA_DEFAULT_URLS[config.environment] || ZATCA_DEFAULT_URLS.SANDBOX;
  }

  private basicAuthHeader(auth: ZatcaBasicAuth): string {
    const encoded = Buffer.from(`${auth.binarySecurityToken}:${auth.secret}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }

  private normalizeValidationResults(raw: any): ZatcaApiValidationResults {
    const vr = raw?.validationResults || {};
    return {
      status: vr.status || (Array.isArray(vr.errorMessages) && vr.errorMessages.length > 0 ? 'ERROR' : 'PASS'),
      infoMessages: Array.isArray(vr.infoMessages) ? vr.infoMessages : [],
      warningMessages: Array.isArray(vr.warningMessages) ? vr.warningMessages : [],
      errorMessages: Array.isArray(vr.errorMessages) ? vr.errorMessages : [],
    };
  }

  private async postJson(
    url: string,
    headers: Record<string, string>,
    payload: Record<string, any>,
    timeoutMs = 20000,
  ): Promise<{ httpStatus: number; data: any; networkError?: string; timedOut?: boolean }> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Language': 'ar',
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { rawText: text };
      }
      return { httpStatus: res.status, data };
    } catch (err: any) {
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      this.logger.warn(`ZATCA API call failed (${url}): ${err?.message || 'Network error'}`);
      return {
        httpStatus: 0,
        data: null,
        timedOut: isTimeout,
        networkError: err?.message || 'تعذر الاتصال ببوابة فاتورة',
      };
    }
  }

  /**
   * Step 4 of Onboarding: Request Compliance CSID using generated CSR + manual OTP from Fatoora Portal.
   * POST /compliance
   */
  async requestComplianceCsid(
    config: ZatcaGatewayConfig,
    input: { csrBase64: string; otp: string },
  ): Promise<ZatcaCsidApiResponse> {
    const url = `${this.resolveBaseUrl(config)}/compliance`;
    const res = await this.postJson(
      url,
      {
        OTP: input.otp.trim(),
        'Accept-Version': config.apiVersion || 'V2',
      },
      { csr: input.csrBase64 },
      config.timeoutMs,
    );

    if (res.httpStatus === 0) {
      return {
        ok: false,
        httpStatus: 0,
        retryable: true,
        errorMessageAr: res.timedOut
          ? 'انتهت مهلة الاتصال ببوابة هيئة الزكاة (Timeout). يمكنك إعادة المحاولة.'
          : `تعذر الوصول إلى بوابة هيئة الزكاة (${url}): ${res.networkError}`,
      };
    }

    const ok = res.httpStatus >= 200 && res.httpStatus < 300 && Boolean(res.data?.binarySecurityToken && res.data?.secret);
    return {
      ok,
      httpStatus: res.httpStatus,
      requestId: res.data?.requestID ? String(res.data.requestID) : undefined,
      dispositionMessage: res.data?.dispositionMessage,
      binarySecurityToken: res.data?.binarySecurityToken,
      secret: res.data?.secret,
      errors: res.data?.errors,
      errorMessageAr: ok
        ? undefined
        : res.httpStatus === 401
          ? 'فشل المصادقة (401): رمز OTP غير صحيح أو منتهي الصلاحية (صالح لمدة 60 دقيقة فقط من بوابة فاتورة).'
          : `رفضت الهيئة إصدار شهادة الامتثال (HTTP ${res.httpStatus}): ${res.data?.message || res.data?.dispositionMessage || JSON.stringify(res.data?.errors || {})}`,
      retryable: res.httpStatus === 429 || res.httpStatus >= 500,
      raw: res.data,
    };
  }

  /**
   * Step 5 of Onboarding: Run Compliance Invoice check against ZATCA before requesting Production CSID.
   * POST /compliance/invoices
   */
  async checkComplianceInvoice(
    config: ZatcaGatewayConfig,
    auth: ZatcaBasicAuth,
    input: { invoiceHash: string; uuid: string; invoiceBase64: string },
  ): Promise<ZatcaInvoiceApiResponse> {
    const url = `${this.resolveBaseUrl(config)}/compliance/invoices`;
    const res = await this.postJson(
      url,
      {
        Authorization: this.basicAuthHeader(auth),
        'Accept-Version': config.apiVersion || 'V2',
      },
      {
        invoiceHash: input.invoiceHash,
        uuid: input.uuid,
        invoice: input.invoiceBase64,
      },
      config.timeoutMs,
    );

    return this.parseInvoiceResponse('COMPLIANCE', res);
  }

  /**
   * Step 6 of Onboarding: Exchange Compliance Request ID for official Production CSID.
   * POST /production/csids
   */
  async requestProductionCsid(
    config: ZatcaGatewayConfig,
    complianceAuth: ZatcaBasicAuth,
    input: { complianceRequestId: string },
  ): Promise<ZatcaCsidApiResponse> {
    const url = `${this.resolveBaseUrl(config)}/production/csids`;
    const res = await this.postJson(
      url,
      {
        Authorization: this.basicAuthHeader(complianceAuth),
        'Accept-Version': config.apiVersion || 'V2',
      },
      { compliance_request_id: input.complianceRequestId },
      config.timeoutMs,
    );

    if (res.httpStatus === 0) {
      return {
        ok: false,
        httpStatus: 0,
        retryable: true,
        errorMessageAr: res.timedOut
          ? 'انتهت مهلة الاتصال ببوابة فاتورة أثناء طلب شهادة الإنتاج.'
          : `فشل الاتصال الشبكي ببوابة فاتورة: ${res.networkError}`,
      };
    }

    const ok = res.httpStatus >= 200 && res.httpStatus < 300 && Boolean(res.data?.binarySecurityToken && res.data?.secret);
    return {
      ok,
      httpStatus: res.httpStatus,
      requestId: res.data?.requestID ? String(res.data.requestID) : undefined,
      dispositionMessage: res.data?.dispositionMessage,
      binarySecurityToken: res.data?.binarySecurityToken,
      secret: res.data?.secret,
      errors: res.data?.errors,
      errorMessageAr: ok
        ? undefined
        : `تعذر إصدار شهادة الإنتاج PCSID (HTTP ${res.httpStatus}): ${res.data?.message || res.data?.dispositionMessage || 'تأكد من اجتياز جميع اختبارات الامتثال أولاً.'}`,
      retryable: res.httpStatus === 429 || res.httpStatus >= 500,
      raw: res.data,
    };
  }

  /**
   * Standard Tax Invoice (B2B) Real-Time Clearance API.
   * POST /invoices/clearance/single (Clearance-Status: 1)
   */
  async clearStandardInvoice(
    config: ZatcaGatewayConfig,
    productionAuth: ZatcaBasicAuth,
    input: { invoiceHash: string; uuid: string; invoiceBase64: string },
  ): Promise<ZatcaInvoiceApiResponse> {
    const url = `${this.resolveBaseUrl(config)}/invoices/clearance/single`;
    const res = await this.postJson(
      url,
      {
        Authorization: this.basicAuthHeader(productionAuth),
        'Accept-Version': config.apiVersion || 'V2',
        'Clearance-Status': '1',
      },
      {
        invoiceHash: input.invoiceHash,
        uuid: input.uuid,
        invoice: input.invoiceBase64,
      },
      config.timeoutMs,
    );

    return this.parseInvoiceResponse('CLEARANCE', res);
  }

  /**
   * Simplified Tax Invoice (B2C) Reporting API (within 24 hours).
   * POST /invoices/reporting/single (Clearance-Status: 0)
   */
  async reportSimplifiedInvoice(
    config: ZatcaGatewayConfig,
    productionAuth: ZatcaBasicAuth,
    input: { invoiceHash: string; uuid: string; invoiceBase64: string },
  ): Promise<ZatcaInvoiceApiResponse> {
    const url = `${this.resolveBaseUrl(config)}/invoices/reporting/single`;
    const res = await this.postJson(
      url,
      {
        Authorization: this.basicAuthHeader(productionAuth),
        'Accept-Version': config.apiVersion || 'V2',
        'Clearance-Status': '0',
      },
      {
        invoiceHash: input.invoiceHash,
        uuid: input.uuid,
        invoice: input.invoiceBase64,
      },
      config.timeoutMs,
    );

    return this.parseInvoiceResponse('REPORTING', res);
  }

  /**
   * Step 7: Live Connectivity & Certificate Auth Health Check against ZATCA Gateway.
   */
  async testConnection(
    config: ZatcaGatewayConfig,
    auth?: ZatcaBasicAuth | null,
  ): Promise<{
    reachable: boolean;
    authenticated: boolean;
    httpStatus: number;
    latencyMs: number;
    endpoint: string;
    messageAr: string;
  }> {
    const endpoint = `${this.resolveBaseUrl(config)}/invoices/reporting/single`;
    const start = Date.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Version': config.apiVersion || 'V2',
      };
      if (auth?.binarySecurityToken && auth?.secret) {
        headers.Authorization = this.basicAuthHeader(auth);
      }

      // Send a minimal structural ping (empty payload yields 400 if authenticated, 401 if bad CSID)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(config.timeoutMs || 10000),
      });
      const latencyMs = Date.now() - start;

      if (res.status === 401 || res.status === 403) {
        return {
          reachable: true,
          authenticated: false,
          httpStatus: res.status,
          latencyMs,
          endpoint,
          messageAr: `بوابة هيئة الزكاة متاحة (${latencyMs}ms)، لكن شهادة CSID غير مصادق عليها أو غير صالحة (HTTP ${res.status}).`,
        };
      }
      // HTTP 400 on empty payload means TLS + Gateway + Basic Auth CSID passed!
      if (res.status === 400 || (res.status >= 200 && res.status < 300)) {
        return {
          reachable: true,
          authenticated: Boolean(auth?.binarySecurityToken),
          httpStatus: res.status,
          latencyMs,
          endpoint,
          messageAr: auth?.binarySecurityToken
            ? `اتصال ناجح ومُصادَق عليه ببوابة فاتورة (${config.environment}) خلال ${latencyMs}ms.`
            : `بوابة فاتورة (${config.environment}) متاحة وتستجيب خلال ${latencyMs}ms (بانتظار إصدار شهادة CSID).`,
        };
      }
      return {
        reachable: true,
        authenticated: false,
        httpStatus: res.status,
        latencyMs,
        endpoint,
        messageAr: `استجابت بوابة فاتورة برمز HTTP ${res.status} خلال ${latencyMs}ms.`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        reachable: false,
        authenticated: false,
        httpStatus: 0,
        latencyMs,
        endpoint,
        messageAr: `تعذر الوصول إلى بوابة هيئة الزكاة (${endpoint}): ${err?.message || 'خطأ شبكة'}`,
      };
    }
  }

  private parseInvoiceResponse(
    mode: 'CLEARANCE' | 'REPORTING' | 'COMPLIANCE',
    res: { httpStatus: number; data: any; networkError?: string; timedOut?: boolean },
  ): ZatcaInvoiceApiResponse {
    if (res.httpStatus === 0) {
      return {
        ok: false,
        httpStatus: 0,
        mode,
        validationResults: { status: 'ERROR', infoMessages: [], warningMessages: [], errorMessages: [] },
        responseCode: res.timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
        responseMessageAr: res.timedOut
          ? 'انتهت مهلة الاتصال ببوابة هيئة الزكاة (Timeout) — تم تحويل الفاتورة إلى طابور إعادة المحاولة الآمن.'
          : `انقطاع الاتصال الشبكي مع بوابة فاتورة: ${res.networkError || 'Network unreachable'}`,
        retryable: true,
      };
    }

    const vr = this.normalizeValidationResults(res.data);
    const clearanceStatus = res.data?.clearanceStatus;
    const reportingStatus = res.data?.reportingStatus;
    const clearedInvoiceBase64 = res.data?.clearedInvoice;
    const clearedInvoiceXml = clearedInvoiceBase64
      ? Buffer.from(clearedInvoiceBase64, 'base64').toString('utf8')
      : undefined;

    if (res.httpStatus === 401 || res.httpStatus === 403) {
      return {
        ok: false,
        httpStatus: res.httpStatus,
        mode,
        clearanceStatus,
        reportingStatus,
        validationResults: vr,
        responseCode: `HTTP_${res.httpStatus}`,
        responseMessageAr: 'فشل المصادقة مع بوابة فاتورة (401/403): تحقق من صلاحية شهادة CSID أو البيئة المختارة.',
        retryable: false,
        raw: res.data,
      };
    }

    if (res.httpStatus === 429 || res.httpStatus >= 500) {
      return {
        ok: false,
        httpStatus: res.httpStatus,
        mode,
        clearanceStatus,
        reportingStatus,
        validationResults: vr,
        responseCode: `HTTP_${res.httpStatus}`,
        responseMessageAr: `خطأ مؤقت من خوادم هيئة الزكاة (HTTP ${res.httpStatus}) — ستتم إعادة المحاولة تلقائياً بنفس UUID.`,
        retryable: true,
        raw: res.data,
      };
    }

    const isSuccessHttp = res.httpStatus === 200 || res.httpStatus === 202;
    const isClearedOk = mode === 'CLEARANCE' && clearanceStatus === 'CLEARED' && Boolean(clearedInvoiceBase64);
    const isReportedOk = mode === 'REPORTING' && reportingStatus === 'REPORTED';
    const isComplianceOk =
      mode === 'COMPLIANCE' && (clearanceStatus === 'CLEARED' || reportingStatus === 'REPORTED' || vr.status === 'PASS' || vr.status === 'WARNING');

    const ok = isSuccessHttp && (isClearedOk || isReportedOk || isComplianceOk);

    const errSummary = vr.errorMessages.map((e) => `[${e.code}] ${e.message}`).join(' | ');
    const warnSummary = vr.warningMessages.map((w) => `[${w.code}] ${w.message}`).join(' | ');

    let responseMessageAr = '';
    if (ok) {
      responseMessageAr =
        mode === 'CLEARANCE'
          ? res.httpStatus === 202
            ? `تم تخليص الفاتورة رسمياً (Cleared) مع تحذيرات: ${warnSummary}`
            : 'تم تخليص الفاتورة الضريبية رسمياً من هيئة الزكاة (CLEARED).'
          : mode === 'REPORTING'
            ? res.httpStatus === 202
              ? `تم الإبلاغ عن الفاتورة رسمياً (Reported) مع تحذيرات: ${warnSummary}`
              : 'تم الإبلاغ عن الفاتورة المبسطة رسمياً لدى هيئة الزكاة (REPORTED).'
            : 'اجتازت الفاتورة فحص الامتثال لدى هيئة الزكاة بنجاح.';
    } else {
      responseMessageAr = errSummary
        ? `رفضت هيئة الزكاة الفاتورة (HTTP ${res.httpStatus}): ${errSummary}`
        : `لم يتم اعتماد الفاتورة من الهيئة (HTTP ${res.httpStatus}): ${res.data?.message || clearanceStatus || reportingStatus || 'استجابة غير متوقعة'}`;
    }

    return {
      ok,
      httpStatus: res.httpStatus,
      mode,
      clearanceStatus,
      reportingStatus,
      clearedInvoiceBase64,
      clearedInvoiceXml,
      validationResults: vr,
      responseCode: ok ? (res.httpStatus === 202 ? 'ACCEPTED_WITH_WARNINGS' : 'OK') : `ZATCA_${res.httpStatus}`,
      responseMessageAr,
      retryable: false,
      raw: res.data,
    };
  }
}
