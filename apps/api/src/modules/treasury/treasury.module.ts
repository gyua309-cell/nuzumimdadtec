import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CoreModule } from '../core/core.module';
import { TreasuryService } from './application/treasury.service';
import { TreasuryController } from './presentation/treasury.controller';

@Module({
  imports: [DbModule, AccountingModule, CoreModule],
  providers: [TreasuryService],
  controllers: [TreasuryController],
  exports: [TreasuryService],
})
export class TreasuryModule {}
