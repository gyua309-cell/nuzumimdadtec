import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { isoDate, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import { CostCentersReportService } from '../application/cost-centers-report.service';

const optUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), uuid.optional());
const optIsoDate = z.preprocess((v) => (v === '' || v === null ? undefined : v), isoDate.optional());
const optStr = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().max(40).optional());

const ReportsFilterQuery = z.object({
  periodId: optUuid,
  from: optIsoDate,
  to: optIsoDate,
  compareFrom: optIsoDate,
  compareTo: optIsoDate,
  ledger: z.enum(['FINANCIAL', 'MANAGEMENT']).default('FINANCIAL'),
  costCenterId: optUuid,
  ccType: optStr,
  branchId: optUuid,
  departmentId: optUuid,
  projectId: optUuid,
  clientId: optUuid,
  employeeId: optUuid,
});

@Controller('reports')
export class ReportsController {
  constructor(private readonly ccReport: CostCentersReportService) {}

  @Get('cost-centers')
  @RequirePermission('rpt.financial.view')
  costCenters(@Query(new ZodPipe(ReportsFilterQuery)) q: z.infer<typeof ReportsFilterQuery>) {
    return this.ccReport.costCentersReport(activeCompanyId(), q);
  }

  @Get('multi-level')
  @RequirePermission('rpt.financial.view')
  multiLevel(@Query(new ZodPipe(ReportsFilterQuery)) q: z.infer<typeof ReportsFilterQuery>) {
    return this.ccReport.multiLevelOverview(activeCompanyId(), q);
  }
}
