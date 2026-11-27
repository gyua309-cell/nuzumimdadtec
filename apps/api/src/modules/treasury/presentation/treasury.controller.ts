import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { activeCompanyId } from '../../../shared/http/request';
import { uuid } from '../../../shared/http/common';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import {
  BankReconcileInput,
  ChequeCreate,
  TreasuryAccountCreate,
  TreasuryService,
  VoucherCreate,
} from '../application/treasury.service';

const idPipe = new ZodPipe(uuid);

@Controller('treasury')
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  @Get('overview')
  @RequirePermission('acc.bank.view')
  overview() {
    return this.treasury.overview(activeCompanyId());
  }

  @Get('accounts')
  @RequirePermission('acc.bank.view')
  listAccounts(@Query('kind') kind?: 'BANK' | 'CASH') {
    return this.treasury.listAccounts(activeCompanyId(), kind);
  }

  @Post('accounts')
  @RequirePermission('acc.bank.create')
  createAccount(@Body(new ZodPipe(TreasuryAccountCreate)) body: z.infer<typeof TreasuryAccountCreate>) {
    return this.treasury.createAccount(activeCompanyId(), body);
  }

  @Get('vouchers')
  @RequirePermission('acc.bank.view')
  listVouchers(@Query('voucherType') voucherType?: string, @Query('employeeId') employeeId?: string) {
    return this.treasury.listVouchers(activeCompanyId(), { voucherType, employeeId });
  }

  @Post('vouchers')
  @RequirePermission('acc.bank.create')
  createVoucher(@Body(new ZodPipe(VoucherCreate)) body: z.infer<typeof VoucherCreate>) {
    return this.treasury.createVoucher(activeCompanyId(), body);
  }

  @Post('vouchers/:id/post')
  @RequirePermission('acc.bank.create')
  postVoucher(@Param('id', idPipe) id: string) {
    return this.treasury.postVoucher(activeCompanyId(), id);
  }

  @Post('vouchers/:id/cancel')
  @RequirePermission('acc.bank.create')
  cancelVoucher(@Param('id', idPipe) id: string, @Body('reason') reason?: string) {
    return this.treasury.cancelVoucher(activeCompanyId(), id, reason || 'إلغاء سند الخزينة');
  }

  @Get('cheques')
  @RequirePermission('acc.bank.view')
  listCheques(@Query('direction') direction?: string, @Query('status') status?: string, @Query('employeeId') employeeId?: string) {
    return this.treasury.listCheques(activeCompanyId(), { direction, status, employeeId });
  }

  @Post('cheques')
  @RequirePermission('acc.bank.create')
  createCheque(@Body(new ZodPipe(ChequeCreate)) body: z.infer<typeof ChequeCreate>) {
    return this.treasury.createCheque(activeCompanyId(), body);
  }

  @Post('cheques/:id/deposit')
  @RequirePermission('acc.bank.create')
  depositCheque(@Param('id', idPipe) id: string, @Body() body: { bankAccountId: string; depositDate?: string }) {
    return this.treasury.depositCheque(activeCompanyId(), id, body);
  }

  @Post('cheques/:id/collect')
  @RequirePermission('acc.bank.create')
  collectCheque(@Param('id', idPipe) id: string, @Body() body: { bankAccountId?: string; collectDate?: string }) {
    return this.treasury.collectCheque(activeCompanyId(), id, body);
  }

  @Post('cheques/:id/bounce')
  @RequirePermission('acc.bank.create')
  bounceCheque(@Param('id', idPipe) id: string, @Body() body: { reason?: string; bounceDate?: string }) {
    return this.treasury.bounceCheque(activeCompanyId(), id, body);
  }

  @Get('reconciliations')
  @RequirePermission('acc.bank.view')
  listReconciliations(@Query('bankAccountId') bankAccountId?: string) {
    return this.treasury.listReconciliations(activeCompanyId(), bankAccountId);
  }

  @Post('reconciliations')
  @RequirePermission('acc.bank.create')
  reconcile(@Body(new ZodPipe(BankReconcileInput)) body: z.infer<typeof BankReconcileInput>) {
    return this.treasury.reconcileBank(activeCompanyId(), body);
  }
}
