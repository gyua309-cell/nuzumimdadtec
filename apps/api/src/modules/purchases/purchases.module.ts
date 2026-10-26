import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { VendorsService } from './application/vendors.service';
import { PurchasesService } from './application/purchases.service';
import {
  DebitNotesController, PurchaseInvoicesController, VendorsController,
} from './presentation/purchases.controllers';

@Module({
  imports: [DbModule, AccountingModule],
  providers: [VendorsService, PurchasesService],
  controllers: [VendorsController, PurchaseInvoicesController, DebitNotesController],
  exports: [VendorsService, PurchasesService],
})
export class PurchasesModule {}
