import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  MonthlyVariableCreate, MonthlyVariableUpdate, VariableTypeCreate, VariableTypeUpdate, VariablesService,
} from '../application/variables.service';
import { PostponeInstallment, CancelLoan, LoanCreate, LoansService } from '../application/loans.service';
const InstallmentPostpone = PostponeInstallment;
const LoanCancel = CancelLoan;
import { PayrollRunCancel, PayrollRunCreate, PayrollService } from '../application/payroll.service';

const idPipe = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const rowVersion = z.object({ rowVersion: z.number().int().positive().optional() });
const periodQuery = new ZodPipe(z.object({ periodId: uuid }));

// ---------------------------------------------------------------- variable types

@Controller('variable-types')
export class VariableTypesController {
  constructor(private readonly svc: VariablesService) {}

  @Get()
  @RequirePermission('pay.config.view')
  list(@Query(listPipe) q: any) {
    return this.svc.listVariableTypes(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('pay.config.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.getVariableType(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pay.config.create')
  create(@Body(new ZodPipe(VariableTypeCreate)) body: z.infer<typeof VariableTypeCreate>) {
    return this.svc.createVariableType(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('pay.config.edit')
  update(@Param('id', idPipe) id: string, @Body(new ZodPipe(VariableTypeUpdate.merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.svc.updateVariableType(activeCompanyId(), id, data, v);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('pay.config.delete')
  async remove(@Param('id', idPipe) id: string) {
    await this.svc.deleteVariableType(activeCompanyId(), id);
  }
}

// ---------------------------------------------------------------- monthly variables

@Controller('monthly-variables')
export class VariablesController {
  constructor(private readonly svc: VariablesService) {}

  @Get()
  @RequirePermission('pay.variable.view')
  list(@Query(listPipe) q: any) {
    return this.svc.listMonthlyVariables(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('pay.variable.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.getMonthlyVariable(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pay.variable.create')
  create(@Body(new ZodPipe(MonthlyVariableCreate)) body: z.infer<typeof MonthlyVariableCreate>) {
    return this.svc.createMonthlyVariable(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('pay.variable.edit')
  update(@Param('id', idPipe) id: string, @Body(new ZodPipe(MonthlyVariableUpdate)) body: any) {
    return this.svc.updateMonthlyVariable(activeCompanyId(), id, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('pay.variable.approve')
  approve(@Param('id', idPipe) id: string) {
    return this.svc.approveMonthlyVariable(activeCompanyId(), id);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('pay.variable.delete')
  async remove(@Param('id', idPipe) id: string) {
    await this.svc.deleteMonthlyVariable(activeCompanyId(), id);
  }
}

// ---------------------------------------------------------------- loans

@Controller('loans')
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  @Get()
  @RequirePermission('pay.loan.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get('installments/:id/postpone')
  @RequirePermission('pay.loan.view')
  getInstallment(@Param('id', idPipe) id: string) {
    // placeholder – detail is retrieved via loan GET
    return { id };
  }

  @Get(':id')
  @RequirePermission('pay.loan.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pay.loan.create')
  create(@Body(new ZodPipe(LoanCreate)) body: z.infer<typeof LoanCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('pay.loan.cancel')
  cancel(@Param('id', idPipe) id: string, @Body(new ZodPipe(LoanCancel)) body: z.infer<typeof LoanCancel>) {
    return this.svc.cancel(activeCompanyId(), id, body);
  }

  @Post('installments/:id/postpone')
  @HttpCode(200)
  @RequirePermission('pay.loan.edit')
  postpone(@Param('id', idPipe) id: string, @Body(new ZodPipe(InstallmentPostpone)) body: z.infer<typeof InstallmentPostpone>) {
    return this.svc.postponeInstallment(activeCompanyId(), id, body);
  }
}

// ---------------------------------------------------------------- payroll runs

@Controller('payroll-runs')
export class PayrollController {
  constructor(private readonly svc: PayrollService) {}

  @Get('preview')
  @RequirePermission('pay.run.view')
  preview(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.preview(activeCompanyId(), q.periodId);
  }

  @Get()
  @RequirePermission('pay.run.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('pay.run.view')
  get(@Param('id', idPipe) id: string) {
    return this.svc.get(activeCompanyId(), id);
  }

  @Post()
  @RequirePermission('pay.run.create')
  create(@Body(new ZodPipe(PayrollRunCreate)) body: z.infer<typeof PayrollRunCreate>) {
    return this.svc.run(activeCompanyId(), body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('pay.run.cancel')
  cancel(@Param('id', idPipe) id: string, @Body(new ZodPipe(PayrollRunCancel)) body: z.infer<typeof PayrollRunCancel>) {
    return this.svc.cancel(activeCompanyId(), id, body);
  }
}
