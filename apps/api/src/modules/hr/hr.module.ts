import { Module, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../infrastructure/db/db.service';
import { AccountResolverRegistry } from '../accounting/application/posting-engine';
import { CostConfigService } from './application/cost-config.service';
import { EmployeeCostService } from './application/employee-cost.service';
import { EmployeesService } from './application/employees.service';
import {
  CostComponentsController,
  CostProfilesController,
  CostSheetController,
  EmployeesController,
  PositionsController,
} from './presentation/hr.controllers';

/**
 * HR & Employee Cost: employees with effective-dated history, positions,
 * configurable cost components / profiles and the employee cost engine.
 * Registers the account resolvers driven by cost component configuration.
 */
@Module({
  controllers: [PositionsController, CostComponentsController, CostProfilesController, EmployeesController, CostSheetController],
  providers: [EmployeesService, CostConfigService, EmployeeCostService],
  exports: [EmployeesService, CostConfigService, EmployeeCostService],
})
export class HrModule implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly resolvers: AccountResolverRegistry,
  ) {}

  onModuleInit() {
    const fromComponent = (col: 'expense_account_id' | 'liability_account_id') => async (companyId: string, refs: Record<string, string | null | undefined>) => {
      if (!refs.componentId) return null;
      const r = await this.db.one<{ account_id: string | null }>(`SELECT ${col} AS account_id FROM hr.cost_components WHERE company_id = $1 AND id = $2`, [
        companyId,
        refs.componentId,
      ]);
      return r?.account_id ?? null;
    };
    this.resolvers.register('FROM_COMPONENT_EXPENSE', fromComponent('expense_account_id'));
    this.resolvers.register('FROM_COMPONENT_LIABILITY', fromComponent('liability_account_id'));
  }
}
