import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CoreModule } from '../core/core.module';
import { ProjectsModule } from '../projects/projects.module';
import { InvoicesService } from './application/invoices.service';
import { CreditNotesController, InvoicesController } from './presentation/sales.controllers';

@Module({
  imports: [DbModule, AccountingModule, CoreModule, ProjectsModule],
  providers: [InvoicesService],
  controllers: [InvoicesController, CreditNotesController],
  exports: [InvoicesService],
})
export class SalesModule {}
