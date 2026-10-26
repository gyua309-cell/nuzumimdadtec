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

  @Post('onboard')
  @HttpCode(200)
  @RequirePermission('sal.zatca.edit')
  onboard(@Body(new ZodPipe(ZatcaOnboardInput)) body: z.infer<typeof ZatcaOnboardInput>) {
    return this.svc.onboard(activeCompanyId(), body);
  }

  @Get('status')
  @RequirePermission('sal.zatca.view')
  status() {
    return this.svc.status(activeCompanyId());
  }

  @Get('submissions')
  @RequirePermission('sal.zatca.view')
  submissions(@Query('invoiceId') invoiceId?: string) {
    return this.svc.submissions(activeCompanyId(), invoiceId);
  }

  @Get('invoices')
  @RequirePermission('sal.zatca.view')
  listInvoices(@Query('status') status?: string) {
    return this.svc.listInvoices(activeCompanyId(), { status });
  }

  @Post('invoices/:id/transmit')
  @HttpCode(200)
  @RequirePermission('sal.zatca.approve')
  transmit(@Param('id', idPipe) id: string) {
    return this.svc.transmitInvoice(activeCompanyId(), id);
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

  @Post('decode-qr')
  @HttpCode(200)
  @RequirePermission('sal.zatca.view')
  decodeQr(@Body(new ZodPipe(DecodeQrInput)) body: z.infer<typeof DecodeQrInput>) {
    return this.svc.decodeQr(body);
  }
}
