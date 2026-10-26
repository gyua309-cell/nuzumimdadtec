import { Module } from '@nestjs/common';
import { DbModule } from '../../infrastructure/db/db.module';
import { HrModule } from '../hr/hr.module';
import { ProjectsModule } from '../projects/projects.module';
import { RevenueService } from './application/revenue.service';
import {
  OverheadPolicyController,
  ProfitabilityController,
  ProjectProfitabilityController,
  RevenueAdjustmentsController,
  RevenueLinesController,
  RevenueRunsController,
} from './presentation/revenue.controllers';

@Module({
  imports: [DbModule, HrModule, ProjectsModule],
  providers: [RevenueService],
  controllers: [
    RevenueRunsController,
    RevenueLinesController,
    ProjectProfitabilityController,
    ProfitabilityController,
    RevenueAdjustmentsController,
    OverheadPolicyController,
  ],
  exports: [RevenueService],
})
export class RevenueModule {}
