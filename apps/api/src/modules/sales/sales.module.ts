import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CoreModule } from '../core/core.module';
import { ProjectsModule } from '../projects/projects.module';
import { InvoicesService } from './application/invoices.service';
import { ServicesCatalogService } from './application/services-catalog.service';
import {
  CreditNotesController,
  InvoicesController,
  SalServicesAliasController,
  ServicesCatalogController,
} from './presentation/sales.controllers';

@Module({
  imports: [DbModule, AccountingModule, CoreModule, ProjectsModule],
  providers: [InvoicesService, ServicesCatalogService],
  controllers: [
    InvoicesController,
    CreditNotesController,
    ServicesCatalogController,
    SalServicesAliasController,
  ],
  exports: [InvoicesService, ServicesCatalogService],
})
export class SalesModule {}
