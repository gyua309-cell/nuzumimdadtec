import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  CustodyClose,
  CustodyConversion,
  CustodyCreate,
  CustodyDisburse,
  CustodyPostSettlement,
  CustodySettlementCreate,
  CustodySettlementLineCreate,
  CustodyTransferCreate,
  CustodiesService,
} from '../application/custodies.service';

const idPipe = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());

@Controller('custodies')
export class CustodiesController {
  constructor(private readonly svc: CustodiesService) {}

  @Get()
  @RequirePermission('fin.custody.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get('report')
  @RequirePermission('fin.custody.view')
  report(@Query() q: any) {
    return this.svc.getCustodyReport(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('fin.custody.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('fin.custody.create')
  create(@Body(new ZodPipe(CustodyCreate)) body: z.infer<typeof CustodyCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Post(':id/disburse')
  @RequirePermission('fin.custody.approve')
  disburse(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodyDisburse)) body: z.infer<typeof CustodyDisburse>) {
    return this.svc.disburse(activeCompanyId(), id, body);
  }

  @Post(':id/conversion')
  @RequirePermission('fin.custody.edit')
  recordConversion(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodyConversion)) body: z.infer<typeof CustodyConversion>) {
    return this.svc.recordConversion(activeCompanyId(), id, body);
  }

  @Post(':id/transfers')
  @RequirePermission('fin.custody_transfer.create')
  createTransfer(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodyTransferCreate)) body: z.infer<typeof CustodyTransferCreate>) {
    return this.svc.createTransfer(activeCompanyId(), id, body);
  }

  @Get(':id/transfers')
  @RequirePermission('fin.custody_transfer.view')
  listTransfers(@Param('id', idPipe) id: string) {
    return this.svc.listTransfers(activeCompanyId(), id);
  }

  @Post(':id/settlements')
  @RequirePermission('fin.custody_settlement.create')
  createSettlement(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodySettlementCreate)) body: z.infer<typeof CustodySettlementCreate>) {
    return this.svc.createSettlement(activeCompanyId(), id, body);
  }

  @Get(':id/settlements')
  @RequirePermission('fin.custody_settlement.view')
  listSettlements(@Param('id', idPipe) id: string) {
    return this.svc.listSettlements(activeCompanyId(), id);
  }

  @Post(':id/lines')
  @RequirePermission('fin.custody.edit')
  addLine(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodySettlementLineCreate)) body: z.infer<typeof CustodySettlementLineCreate>) {
    return this.svc.addSettlementLine(activeCompanyId(), id, body);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermission('fin.custody.edit')
  removeLine(@Param('id', idPipe) id: string, @Param('lineId', idPipe) lineId: string) {
    return this.svc.removeSettlementLine(activeCompanyId(), id, lineId);
  }

  @Post(':id/settle')
  @RequirePermission('fin.custody.post')
  postSettlement(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodyPostSettlement)) body: z.infer<typeof CustodyPostSettlement>) {
    return this.svc.postSettlement(activeCompanyId(), id, body);
  }

  @Post(':id/close')
  @RequirePermission('fin.custody.close')
  close(@Param('id', idPipe) id: string, @Body(new ZodPipe(CustodyClose)) body: z.infer<typeof CustodyClose>) {
    return this.svc.closeCustody(activeCompanyId(), id, body);
  }
}
