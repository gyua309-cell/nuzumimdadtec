import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { HrModule } from '../hr/hr.module';
import { CoreModule } from '../core/core.module';
import { PayrollService } from './application/payroll.service';
import { LoansService } from './application/loans.service';
import { VariablesService } from './application/variables.service';
import { EosbService } from './application/eosb.service';
import { PayrollController, LoansController, VariablesController, VariableTypesController, EosbController } from './presentation/payroll.controllers';

@Module({
  imports: [DbModule, HrModule, CoreModule],
  providers: [PayrollService, LoansService, VariablesService, EosbService],
  controllers: [PayrollController, LoansController, VariablesController, VariableTypesController, EosbController],
  exports: [PayrollService, LoansService, VariablesService, EosbService],
})
export class PayrollModule {}
