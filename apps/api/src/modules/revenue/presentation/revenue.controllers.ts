import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  OverheadPolicyUpdate,
  RetroactiveAdjustmentCreate,
  RevenueRunCancel,
  RevenueRunCreate,
  RevenueService,
} from '../application/revenue.service';

const idPipe = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const periodQuery = new ZodPipe(z.object({ periodId: uuid }));
const optPeriodQuery = new ZodPipe(z.object({ periodId: uuid.optional() }));

@Controller('revenue-runs')
export class RevenueRunsController {
  constructor(private readonly svc: RevenueService) {}

  @Get()
  @RequirePermission('rev.run.view')
  list(@Query(listPipe) q: any) {
    return this.svc.listRuns(activeCompanyId(), q);
  }

  @Get('preview')
  @RequirePermission('rev.run.view')
  preview(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.preview(activeCompanyId(), q.periodId);
  }

  @Get(':id')
  @RequirePermission('rev.run.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.getRun(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('rev.run.create')
  execute(@Body(new ZodPipe(RevenueRunCreate)) body: z.infer<typeof RevenueRunCreate>) {
    return this.svc.executeRun(activeCompanyId(), body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('rev.run.cancel')
  cancel(@Param('id', idPipe) id: string, @Body(new ZodPipe(RevenueRunCancel)) body: z.infer<typeof RevenueRunCancel>) {
    return this.svc.cancelRun(activeCompanyId(), id, body);
  }
}

@Controller('revenue-lines')
export class RevenueLinesController {
  constructor(private readonly svc: RevenueService) {}

  @Get()
  @RequirePermission('rev.run.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }
}

@Controller('profitability')
export class ProfitabilityController {
  constructor(private readonly svc: RevenueService) {}

  @Get('projects')
  @RequirePermission('cost.profitability.view')
  projects(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.getProjectProfitability(activeCompanyId(), q.periodId);
  }

  @Get('employees')
  @RequirePermission('cost.profitability.view')
  employees(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.getEmployeeProfitability(activeCompanyId(), q.periodId);
  }

  @Get('clients')
  @RequirePermission('cost.profitability.view')
  clients(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.getClientProfitability(activeCompanyId(), q.periodId);
  }
}

@Controller('project-profitability')
export class ProjectProfitabilityController {
  constructor(private readonly svc: RevenueService) {}

  @Get()
  @RequirePermission('cost.profitability.view')
  get(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.getProjectProfitability(activeCompanyId(), q.periodId);
  }
}

@Controller('revenue-adjustments')
export class RevenueAdjustmentsController {
  constructor(private readonly svc: RevenueService) {}

  @Get('retroactive')
  @RequirePermission('rev.adjustment.view')
  listRetroactive(@Query(optPeriodQuery) q: { periodId?: string }) {
    return this.svc.listRetroactiveAdjustments(activeCompanyId(), q.periodId);
  }

  @Post('retroactive')
  @RequirePermission('rev.adjustment.create')
  createRetroactive(@Body(new ZodPipe(RetroactiveAdjustmentCreate)) body: z.infer<typeof RetroactiveAdjustmentCreate>) {
    return this.svc.createRetroactiveAdjustment(activeCompanyId(), body);
  }
}

@Controller('overhead-policy')
export class OverheadPolicyController {
  constructor(private readonly svc: RevenueService) {}

  @Get()
  @RequirePermission('rev.overhead.view')
  get() {
    return this.svc.getOverheadPolicy(activeCompanyId());
  }

  @Put()
  @RequirePermission('rev.overhead.edit')
  update(@Body(new ZodPipe(OverheadPolicyUpdate)) body: z.infer<typeof OverheadPolicyUpdate>) {
    return this.svc.updateOverheadPolicy(activeCompanyId(), body);
  }
}
