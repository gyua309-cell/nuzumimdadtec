import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { reasonSchema, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  ZakatCalcInput, ZakatReturnCreate, ZakatService, ZakatSettingsUpdate,
} from '../application/zakat.service';
import {
  DecodeQrInput,
  DeviceComplianceCsidInput,
  EgsDeviceCreate,
  ZatcaOnboardInput,
  ZatcaService,
  ZatcaSettingsUpdate,
} from '../application/zatca.service';

const idPipe = new ZodPipe(uuid);

@Controller('zakat')
export class ZakatController {
  constructor(private readonly svc: ZakatService) {}

  @Get('settings')
  @RequirePermission('acc.zakat.view')
  settings() {
    return this.svc.getSettings(activeCompanyId());
  }

  @Put('settings')
  @RequirePermission('acc.zakat.edit')
  updateSettings(@Body(new ZodPipe(ZakatSettingsUpdate)) body: z.infer<typeof ZakatSettingsUpdate>) {
    return this.svc.updateSettings(activeCompanyId(), body);
  }

  @Post('calculate')
  @HttpCode(200)
  @RequirePermission('acc.zakat.view')
  calculate(@Body(new ZodPipe(ZakatCalcInput)) body: z.infer<typeof ZakatCalcInput>) {
    return this.svc.calculate(activeCompanyId(), body);
  }

  @Get('returns')
  @RequirePermission('acc.zakat.view')
  list() {
    return this.svc.list(activeCompanyId());
  }

  @Get('returns/:id')
  @RequirePermission('acc.zakat.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post('returns')
  @RequirePermission('acc.zakat.create')
  create(@Body(new ZodPipe(ZakatReturnCreate)) body: z.infer<typeof ZakatReturnCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Post('returns/:id/post')
  @HttpCode(200)
  @RequirePermission('acc.zakat.post')
  post(@Param('id', idPipe) id: string) {
    return this.svc.post(activeCompanyId(), id);
  }

  @Post('returns/:id/cancel')
  @HttpCode(200)
  @RequirePermission('acc.zakat.cancel')
  cancel(@Param('id', idPipe) id: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) {
    return this.svc.cancel(activeCompanyId(), id, body.reason);
  }
}

@Controller('zatca')
export class ZatcaController {
  constructor(private readonly svc: ZatcaService) {}

  @Get('settings')
  @RequirePermission('sal.zatca.view')
  settings() {
    return this.svc.getSettings(activeCompanyId());
  }

  @Put('settings')
  @RequirePermission('sal.zatca.edit')
  updateSettings(@Body(new ZodPipe(ZatcaSettingsUpdate)) body: z.infer<typeof ZatcaSettingsUpdate>) {
    return this.svc.updateSettings(activeCompanyId(), body);
  }

  // ── Multi-Branch EGS Devices & 7-Step Onboarding ───────────────────────────
  @Get('devices')
  @RequirePermission('sal.zatca.view')
  listDevices(@Query('environment') environment?: string) {
    return this.svc.listDevices(activeCompanyId(), environment);
  }

  @Post('devices')
  @RequirePermission('sal.zatca.edit')
  createDevice(@Body(new ZodPipe(EgsDeviceCreate)) body: z.infer<typeof EgsDeviceCreate>) {
    return this.svc.createDevice(activeCompanyId(), body);
  }

  @Post('devices/:id/csr')
  @HttpCode(200)
  @RequirePermission('sal.zatca.edit')
  generateDeviceCsr(@Param('id', idPipe) id: string) {
    return this.svc.generateDeviceCsr(activeCompanyId(), id);
  }

  @Post('devices/:id/compliance-csid')
  @HttpCode(200)
  @RequirePermission('sal.zatca.edit')
  requestComplianceCsid(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(DeviceComplianceCsidInput)) body: z.infer<typeof DeviceComplianceCsidInput>,
  ) {
    return this.svc.requestDeviceComplianceCsid(activeCompanyId(), id, body.otp);
  }

  @Post('devices/:id/compliance-check')
  @HttpCode(200)
  @RequirePermission('sal.zatca.edit')
  runComplianceChecks(@Param('id', idPipe) id: string) {
    return this.svc.runDeviceComplianceChecks(activeCompanyId(), id);
  }

  @Post('devices/:id/production-csid')
  @HttpCode(200)
  @RequirePermission('sal.zatca.edit')
  requestProductionCsid(@Param('id', idPipe) id: string) {
    return this.svc.requestDeviceProductionCsid(activeCompanyId(), id);
  }

  @Post('devices/:id/test')
  @HttpCode(200)
  @RequirePermission('sal.zatca.view')
  testDeviceConnection(@Param('id', idPipe) id: string) {
    return this.svc.testDeviceConnection(activeCompanyId(), id);
  }

  @Post('test-connection')
  @HttpCode(200)
  @RequirePermission('sal.zatca.view')
  testDefaultConnection(@Body() body?: { deviceId?: string }) {
    return this.svc.testDeviceConnection(activeCompanyId(), body?.deviceId);
  }

  @Post('onboard')
  @HttpCode(200)
  @RequirePermission('sal.zatca.edit')
  onboard(@Body(new ZodPipe(ZatcaOnboardInput)) body: z.infer<typeof ZatcaOnboardInput>) {
    return this.svc.onboard(activeCompanyId(), body);
  }

  // ── Dashboard, Invoices, Validation, Transmission & 7-Tab Details ──────────
  @Get('status')
  @RequirePermission('sal.zatca.view')
  status() {
    return this.svc.status(activeCompanyId());
  }

  @Get('submissions')
  @RequirePermission('sal.zatca.view')
  submissions(
    @Query('invoiceId') invoiceId?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.submissions(activeCompanyId(), invoiceId, { status, from, to, search });
  }

  @Get('invoices')
  @RequirePermission('sal.zatca.view')
  listInvoices(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('clientId') clientId?: string,
    @Query('branchId') branchId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listInvoices(activeCompanyId(), { status, type, clientId, branchId, from, to, search });
  }

  @Post('invoices/:id/validate')
  @HttpCode(200)
  @RequirePermission('sal.zatca.view')
  validateInvoice(@Param('id', idPipe) id: string) {
    return this.svc.validateInvoice(activeCompanyId(), id);
  }

  @Get('invoices/:id/details')
  @RequirePermission('sal.zatca.view')
  getInvoiceDetails(@Param('id', idPipe) id: string) {
    return this.svc.getInvoiceZatcaDetails(activeCompanyId(), id);
  }

  @Post('invoices/:id/transmit')
  @HttpCode(200)
  @RequirePermission('sal.zatca.approve')
  transmit(@Param('id', idPipe) id: string, @Body() body?: { deviceId?: string; isRetry?: boolean }) {
    return this.svc.transmitInvoice(activeCompanyId(), id, body);
  }

  @Post('invoices/batch-transmit')
  @HttpCode(200)
  @RequirePermission('sal.zatca.approve')
  batchTransmit() {
    return this.svc.batchTransmit(activeCompanyId());
  }

  @Get('invoices/:id/ubl-xml')
  @RequirePermission('sal.zatca.view')
  getUblXml(@Param('id', idPipe) id: string) {
    return this.svc.getInvoiceUblXml(activeCompanyId(), id);
  }

  // ── Retry Queue & Notifications ────────────────────────────────────────────
  @Get('retry-queue')
  @RequirePermission('sal.zatca.view')
  listRetryQueue() {
    return this.svc.listRetryQueue(activeCompanyId());
  }

  @Post('retry-queue/process')
  @HttpCode(200)
  @RequirePermission('sal.zatca.approve')
  processRetryQueue() {
    return this.svc.processRetryQueue(activeCompanyId());
  }

  @Post('retry-queue/:id/retry')
  @HttpCode(200)
  @RequirePermission('sal.zatca.approve')
  retryQueueItem(@Param('id', idPipe) id: string) {
    return this.svc.processRetryQueue(activeCompanyId(), id);
  }

  @Get('notifications')
  @RequirePermission('sal.zatca.view')
  listNotifications() {
    return this.svc.listNotifications(activeCompanyId());
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  @RequirePermission('sal.zatca.view')
  markNotificationRead(@Param('id', idPipe) id: string) {
    return this.svc.markNotificationRead(activeCompanyId(), id);
  }

  @Post('decode-qr')
  @HttpCode(200)
  @RequirePermission('sal.zatca.view')
  decodeQr(@Body(new ZodPipe(DecodeQrInput)) body: z.infer<typeof DecodeQrInput>) {
    return this.svc.decodeQr(body);
  }
}
