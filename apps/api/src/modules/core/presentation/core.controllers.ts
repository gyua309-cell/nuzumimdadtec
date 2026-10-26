import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { isoDate, listQuery, uuid } from '../../../shared/http/common';
import { crudController } from '../../../shared/http/crud.controller';
import { activeCompanyId, assertSystemAdmin } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { NoCompany, RequirePermission } from '../../iam/presentation/decorators';
import {
  CompanyCreate,
  CompanyUpdate,
  CoreService,
  ExchangeRateCreate,
  ExchangeRateUpdate,
  HolidayCreate,
  TaxRateCreate,
} from '../application/core.service';
import { ExchangeRateService } from '../application/exchange-rate.service';
import { FiscalService } from '../application/fiscal.service';
import {
  BRANCH_REPO,
  BranchCreate,
  BranchUpdate,
  CALENDAR_REPO,
  CalendarCreate,
  CalendarUpdate,
  COST_CENTER_REPO,
  CostCenterCreate,
  CostCenterUpdate,
  DEPARTMENT_REPO,
  DepartmentCreate,
  DepartmentUpdate,
  TAX_CODE_REPO,
  TaxCodeCreate,
  TaxCodeUpdate,
} from '../infrastructure/core.repositories';

const id = new ZodPipe(uuid);

export const BranchesController = crudController({
  path: 'branches', permission: 'core.branch', token: BRANCH_REPO, create: BranchCreate, update: BranchUpdate,
});
export const CostCentersController = crudController({
  path: 'cost-centers', permission: 'core.cost_center', token: COST_CENTER_REPO, create: CostCenterCreate, update: CostCenterUpdate,
});
export const DepartmentsController = crudController({
  path: 'departments', permission: 'core.department', token: DEPARTMENT_REPO, create: DepartmentCreate, update: DepartmentUpdate,
});
export const WorkCalendarsController = crudController({
  path: 'work-calendars', permission: 'core.calendar', token: CALENDAR_REPO, create: CalendarCreate, update: CalendarUpdate,
});
export const TaxCodesController = crudController({
  path: 'tax-codes', permission: 'core.tax', token: TAX_CODE_REPO, create: TaxCodeCreate, update: TaxCodeUpdate,
});

@Controller('companies')
export class CompaniesController {
  constructor(private readonly core: CoreService) {}

  @Get('current')
  @RequirePermission('core.company.view')
  current() {
    return this.core.getCompany(activeCompanyId());
  }

  @Patch('current')
  @RequirePermission('core.company.edit')
  update(@Body(new ZodPipe(CompanyUpdate)) body: z.infer<typeof CompanyUpdate>) {
    return this.core.updateCompany(activeCompanyId(), body);
  }

  /** Additional companies are created by the system administrator. */
  @Post()
  @NoCompany()
  create(@Body(new ZodPipe(CompanyCreate)) body: z.infer<typeof CompanyCreate>) {
    assertSystemAdmin();
    return this.core.createCompany(body);
  }
}

@Controller()
export class CurrenciesController {
  constructor(
    private readonly core: CoreService,
    private readonly fx: ExchangeRateService,
  ) {}

  @Get('currencies')
  @NoCompany()
  list() {
    return this.core.listCurrencies();
  }

  @Get('company-currencies')
  @RequirePermission('core.fx.view')
  companyCurrencies() {
    return this.core.companyCurrencies(activeCompanyId());
  }

  @Post('company-currencies')
  @RequirePermission('core.fx.create')
  enable(@Body(new ZodPipe(z.object({ code: z.string().trim().length(3).toUpperCase() }))) body: { code: string }) {
    return this.core.enableCurrency(activeCompanyId(), body.code);
  }

  @Delete('company-currencies/:code')
  @HttpCode(204)
  @RequirePermission('core.fx.delete')
  async disable(@Param('code') code: string) {
    await this.core.disableCurrency(activeCompanyId(), code.toUpperCase());
  }

  @Get('exchange-rates')
  @RequirePermission('core.fx.view')
  rates(@Query(new ZodPipe(listQuery.passthrough())) q: any) {
    return this.core.listRates(activeCompanyId(), q);
  }

  @Get('exchange-rates/lookup')
  @RequirePermission('core.fx.view')
  async lookup(
    @Query(
      new ZodPipe(
        z.object({
          from: z.string().length(3).toUpperCase(),
          to: z.string().length(3).toUpperCase(),
          date: isoDate,
          type: z.enum(['SPOT', 'MONTHLY_AVG', 'CLOSING']).default('SPOT'),
        }),
      ),
    )
    q: { from: string; to: string; date: string; type: 'SPOT' | 'MONTHLY_AVG' | 'CLOSING' },
  ) {
    const r = await this.fx.getRate(activeCompanyId(), q.from, q.to, q.date, q.type);
    return { rate: r.rate.toString(), rateId: r.rateId, rateDate: r.rateDate, inverse: r.inverse };
  }

  @Post('exchange-rates')
  @RequirePermission('core.fx.create')
  createRate(@Body(new ZodPipe(ExchangeRateCreate)) body: z.infer<typeof ExchangeRateCreate>) {
    return this.core.createRate(activeCompanyId(), body);
  }

  @Patch('exchange-rates/:id')
  @RequirePermission('core.fx.edit')
  updateRate(@Param('id', id) rid: string, @Body(new ZodPipe(ExchangeRateUpdate)) body: z.infer<typeof ExchangeRateUpdate>) {
    return this.core.updateRate(activeCompanyId(), rid, body);
  }

  @Delete('exchange-rates/:id')
  @HttpCode(204)
  @RequirePermission('core.fx.delete')
  async deleteRate(@Param('id', id) rid: string) {
    await this.core.deleteRate(activeCompanyId(), rid);
  }
}

@Controller()
export class CalendarDetailsController {
  constructor(private readonly core: CoreService) {}

  @Get('work-calendars/:calendarId/holidays')
  @RequirePermission('core.calendar.view')
  holidays(@Param('calendarId', id) calendarId: string) {
    return this.core.listHolidays(activeCompanyId(), calendarId);
  }

  @Post('work-calendars/:calendarId/holidays')
  @RequirePermission('core.calendar.edit')
  addHoliday(@Param('calendarId', id) calendarId: string, @Body(new ZodPipe(HolidayCreate)) body: z.infer<typeof HolidayCreate>) {
    return this.core.addHoliday(activeCompanyId(), calendarId, body);
  }

  @Delete('work-calendars/:calendarId/holidays/:id')
  @HttpCode(204)
  @RequirePermission('core.calendar.edit')
  async removeHoliday(@Param('calendarId', id) calendarId: string, @Param('id', id) hid: string) {
    await this.core.removeHoliday(activeCompanyId(), calendarId, hid);
  }

  @Get('tax-codes/:taxCodeId/rates')
  @RequirePermission('core.tax.view')
  taxRates(@Param('taxCodeId', id) taxCodeId: string) {
    return this.core.listTaxRates(activeCompanyId(), taxCodeId);
  }

  @Post('tax-codes/:taxCodeId/rates')
  @RequirePermission('core.tax.edit')
  addTaxRate(@Param('taxCodeId', id) taxCodeId: string, @Body(new ZodPipe(TaxRateCreate)) body: z.infer<typeof TaxRateCreate>) {
    return this.core.addTaxRate(activeCompanyId(), taxCodeId, body);
  }
}

const YearCreate = z.object({ code: z.string().trim().min(2).max(20), startDate: isoDate });

@Controller()
export class FiscalController {
  constructor(private readonly fiscal: FiscalService) {}

  @Get('fiscal-years')
  @RequirePermission('core.fiscal.view')
  years() {
    return this.fiscal.listYears(activeCompanyId());
  }

  @Get('fiscal-years/:id')
  @RequirePermission('core.fiscal.view')
  year(@Param('id', id) yid: string) {
    return this.fiscal.getYear(activeCompanyId(), yid);
  }

  @Post('fiscal-years')
  @RequirePermission('core.fiscal.create')
  createYear(@Body(new ZodPipe(YearCreate)) body: z.infer<typeof YearCreate>) {
    return this.fiscal.createYear(activeCompanyId(), body.code, body.startDate);
  }

  @Get('fiscal-periods')
  @RequirePermission('core.fiscal.view')
  periods(
    @Query(new ZodPipe(z.object({ status: z.enum(['OPEN', 'CLOSING', 'CLOSED', 'LOCKED']).optional(), fiscalYearId: uuid.optional() })))
    q: { status?: string; fiscalYearId?: string },
  ) {
    return this.fiscal.listPeriods(activeCompanyId(), q);
  }

  @Get('fiscal-periods/for-date')
  @RequirePermission('core.fiscal.view')
  forDate(@Query(new ZodPipe(z.object({ date: isoDate }))) q: { date: string }) {
    return this.fiscal.periodForDate(activeCompanyId(), q.date);
  }

  @Get('fiscal-periods/:id')
  @RequirePermission('core.fiscal.view')
  period(@Param('id', id) pid: string) {
    return this.fiscal.getPeriod(activeCompanyId(), pid);
  }

  @Get('fiscal-periods/:id/history')
  @RequirePermission('core.fiscal.view')
  history(@Param('id', id) pid: string) {
    return this.fiscal.statusHistory(activeCompanyId(), pid);
  }
}
