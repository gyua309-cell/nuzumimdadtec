import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { ZakatService } from './application/zakat.service';
import { ZatcaService } from './application/zatca.service';
import { ZakatController, ZatcaController } from './presentation/tax.controllers';

@Module({
  imports: [DbModule, AccountingModule],
  providers: [ZakatService, ZatcaService],
  controllers: [ZakatController, ZatcaController],
})
export class TaxModule {}
