import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CoreModule } from '../core/core.module';
import { CustodiesService } from './application/custodies.service';
import { CustodiesController } from './presentation/custodies.controllers';

@Module({
  imports: [DbModule, AccountingModule, CoreModule],
  providers: [CustodiesService],
  controllers: [CustodiesController],
  exports: [CustodiesService],
})
export class CustodiesModule {}
