import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  AutoInvoiceFromRevenue, CreditNoteCreate, InvoiceCreate, InvoicesService,
} from '../application/invoices.service';

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
