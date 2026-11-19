import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { ZakatService } from './application/zakat.service';
import { ZatcaService } from './application/zatca.service';
import { ZatcaCryptoVaultService } from './infrastructure/zatca-crypto-vault.service';
import { ZatcaFatooraClient } from './infrastructure/zatca-fatoora.client';
import { ZakatController, ZatcaController } from './presentation/tax.controllers';

@Module({
  imports: [DbModule, AccountingModule],
  providers: [ZakatService, ZatcaCryptoVaultService, ZatcaFatooraClient, ZatcaService],
  controllers: [ZakatController, ZatcaController],
  exports: [ZatcaService, ZatcaCryptoVaultService, ZatcaFatooraClient],
})
export class TaxModule {}
