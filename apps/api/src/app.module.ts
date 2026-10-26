import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DbModule } from './infrastructure/db/db.module';
import { DbService } from './infrastructure/db/db.service';
import { AccountingModule } from './modules/accounting/accounting.module';
import { AssetsModule } from './modules/assets/assets.module';
import { CoreModule } from './modules/core/core.module';
import { HrModule } from './modules/hr/hr.module';
import { IamModule } from './modules/iam/iam.module';
import { Public } from './modules/iam/presentation/decorators';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { CustodiesModule } from './modules/custodies/custodies.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { SalesModule } from './modules/sales/sales.module';
import { TaxModule } from './modules/tax/tax.module';
import { contextMiddleware } from './shared/http/context.middleware';

@Controller('health')
class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Public()
  async health() {
    const r = await this.db.one<{ now: string }>('SELECT now()::text AS now');
    return { status: 'ok', database: r ? 'up' : 'down', time: r?.now };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }]),
    DbModule,
    IamModule,
    CoreModule,
    AccountingModule,
    HrModule,
    AssetsModule,
    ProjectsModule,
    PayrollModule,
    RevenueModule,
    SalesModule,
    PurchasesModule,
    CustodiesModule,
    TaxModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(contextMiddleware).forRoutes('*path');
  }
}
