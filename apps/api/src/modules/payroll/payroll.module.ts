import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { HrModule } from '../hr/hr.module';
import { CoreModule } from '../core/core.module';
import { PayrollService } from './application/payroll.service';
import { LoansService } from './application/loans.service';
import { VariablesService } from './application/variables.service';
import { PayrollController, LoansController, VariablesController, VariableTypesController } from './presentation/payroll.controllers';

@Module({
  imports: [DbModule, HrModule, CoreModule],
  providers: [PayrollService, LoansService, VariablesService],
  controllers: [PayrollController, LoansController, VariablesController, VariableTypesController],
  exports: [PayrollService, LoansService, VariablesService],
})
export class PayrollModule {}
