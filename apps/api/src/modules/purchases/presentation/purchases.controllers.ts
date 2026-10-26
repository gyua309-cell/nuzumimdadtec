import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import { VendorCreate, VendorUpdate, VendorsService } from '../application/vendors.service';
import {
  DebitNoteCreate, PurchaseInvoiceCreate, PurchasesService,
} from '../application/purchases.service';

const idPipe = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

@Controller('vendors')
export class VendorsController {
  constructor(private readonly svc: VendorsService) {}

  @Get()
  @RequirePermission('pur.vendor.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('pur.vendor.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pur.vendor.create')
  create(@Body(new ZodPipe(VendorCreate)) body: z.infer<typeof VendorCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('pur.vendor.edit')
  update(@Param('id', idPipe) id: string, @Body(new ZodPipe(VendorUpdate)) body: z.infer<typeof VendorUpdate>) {
    return this.svc.update(activeCompanyId(), id, body);
  }

  @Delete(':id')
  @RequirePermission('pur.vendor.delete')
  delete(@Param('id', idPipe) id: string) {
    return this.svc.delete(activeCompanyId(), id);
  }
}

@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  @RequirePermission('pur.invoice.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('pur.invoice.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pur.invoice.create')
  create(@Body(new ZodPipe(PurchaseInvoiceCreate)) body: z.infer<typeof PurchaseInvoiceCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('pur.invoice.post')
  post(@Param('id', idPipe) id: string) {
    return this.svc.post(activeCompanyId(), id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('pur.invoice.cancel')
  cancel(@Param('id', idPipe) id: string, @Body(new ZodPipe(cancelSchema)) body: { reason: string }) {
    return this.svc.cancel(activeCompanyId(), id, body.reason);
  }
}

@Controller('debit-notes')
export class DebitNotesController {
  constructor(private readonly svc: PurchasesService) {}

  @Get()
  @RequirePermission('pur.debit_note.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), { ...q, type: 'DEBIT_NOTE' });
  }

  @Get(':id')
  @RequirePermission('pur.debit_note.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pur.debit_note.create')
  create(@Body(new ZodPipe(DebitNoteCreate)) body: z.infer<typeof DebitNoteCreate>) {
    return this.svc.createDebitNote(activeCompanyId(), body);
  }
}
