import { Module } from '@nestjs/common';
import { HrModule } from '../hr/hr.module';
import { AssignmentsService } from './application/assignments.service';
import { PricingService } from './application/pricing.service';
import { ProjectsService } from './application/projects.service';
import { AssignmentsController, ClientsController, ProjectsController, ServicePricesController, UtilizationController } from './presentation/projects.controllers';

/**
 * Clients, projects, employee assignments (allocation / utilization) and
 * service pricing – the inputs of the revenue engine and project allocation.
 */
@Module({
  imports: [HrModule],
  controllers: [ClientsController, ProjectsController, AssignmentsController, UtilizationController, ServicePricesController],
  providers: [ProjectsService, AssignmentsService, PricingService],
  exports: [ProjectsService, AssignmentsService, PricingService],
})
export class ProjectsModule {}
