import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  AutoInvoiceFromRevenue, CreditNoteCreate, InvoiceCreate, InvoicesService,
} from '../application/invoices.service';
import { ServicesCatalogService } from '../application/services-catalog.service';

const idPipe = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get()
  @RequirePermission('sal.invoice.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('sal.invoice.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('sal.invoice.create')
  create(@Body(new ZodPipe(InvoiceCreate)) body: z.infer<typeof InvoiceCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Post('auto-generate')
  @RequirePermission('sal.invoice.create')
  autoGenerate(@Body(new ZodPipe(AutoInvoiceFromRevenue)) body: z.infer<typeof AutoInvoiceFromRevenue>) {
    return this.svc.generateFromRevenue(activeCompanyId(), body);
  }

  @Post(':id/repair-journal')
  @HttpCode(200)
  @RequirePermission('sal.invoice.post')
  repairJournal(@Param('id', idPipe) id: string) {
    return this.svc.repairJournal(activeCompanyId(), id);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('sal.invoice.post')
  post(@Param('id', idPipe) id: string) {
    return this.svc.post(activeCompanyId(), id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('sal.invoice.cancel')
  cancel(@Param('id', idPipe) id: string, @Body(new ZodPipe(cancelSchema)) body: { reason: string }) {
    return this.svc.cancel(activeCompanyId(), id, body.reason);
  }
}

@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly svc: InvoicesService) {}

  @Get()
  @RequirePermission('sal.invoice.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), { ...q, type: 'CREDIT_NOTE' });
  }

  @Post()
  @RequirePermission('sal.invoice.create')
  create(@Body(new ZodPipe(CreditNoteCreate)) body: z.infer<typeof CreditNoteCreate>) {
    return this.svc.createCreditNote(activeCompanyId(), body);
  }
}

@Controller('services/catalog')
export class ServicesCatalogController {
  constructor(private readonly svc: ServicesCatalogService) {}

  @Get()
  list() {
    return this.svc.list(activeCompanyId());
  }

  @Get(':id')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  create(@Body() body: any) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Patch(':id')
  update(@Param('id', idPipe) id: string, @Body() body: any) {
    return this.svc.update(activeCompanyId(), id, body);
  }

  @Put(':id')
  putUpdate(@Param('id', idPipe) id: string, @Body() body: any) {
    return this.svc.update(activeCompanyId(), id, body);
  }

  @Delete(':id')
  delete(@Param('id', idPipe) id: string) {
    return this.svc.delete(activeCompanyId(), id);
  }
}

@Controller('sal/services')
export class SalServicesAliasController {
  constructor(private readonly svc: ServicesCatalogService) {}

  @Get()
  list() {
    return this.svc.list(activeCompanyId());
  }

  @Get(':id')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  create(@Body() body: any) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Patch(':id')
  update(@Param('id', idPipe) id: string, @Body() body: any) {
    return this.svc.update(activeCompanyId(), id, body);
  }

  @Delete(':id')
  delete(@Param('id', idPipe) id: string) {
    return this.svc.delete(activeCompanyId(), id);
  }
}
