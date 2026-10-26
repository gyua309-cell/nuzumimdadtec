import { Global, Module } from '@nestjs/common';
import { CoreService } from './application/core.service';
import { ExchangeRateService } from './application/exchange-rate.service';
import { FiscalService } from './application/fiscal.service';
import { coreRepositoryProviders } from './infrastructure/core.repositories';
import {
  BranchesController,
  CalendarDetailsController,
  CompaniesController,
  CostCentersController,
  CurrenciesController,
  DepartmentsController,
  FiscalController,
  TaxCodesController,
  WorkCalendarsController,
} from './presentation/core.controllers';

@Global()
@Module({
  controllers: [
    CompaniesController,
    BranchesController,
    CostCentersController,
    DepartmentsController,
    CurrenciesController,
    WorkCalendarsController,
    TaxCodesController,
    CalendarDetailsController,
    FiscalController,
  ],
  providers: [CoreService, FiscalService, ExchangeRateService, ...coreRepositoryProviders],
  exports: [CoreService, FiscalService, ExchangeRateService],
})
export class CoreModule {}
