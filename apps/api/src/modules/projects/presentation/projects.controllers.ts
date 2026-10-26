import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import { AssignmentChange, AssignmentCreate, AssignmentEnd, AssignmentsService, AssignmentUpdate } from '../application/assignments.service';
import { PriceCreate, PriceEnd, PricingService } from '../application/pricing.service';
import { ClientCreate, ClientUpdate, ProjectCreate, ProjectsService, ProjectStatusChange, ProjectUpdate } from '../application/projects.service';

const id = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const rowVersion = z.object({ rowVersion: z.number().int().positive().optional() });
const periodQuery = new ZodPipe(z.object({ periodId: uuid }));

// ------------------------------------------------------------------ clients
@Controller('clients')
export class ClientsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  @RequirePermission('prj.client.view')
  list(@Query(listPipe) q: any) {
    return this.svc.clients.list(activeCompanyId(), q, q);
  }

  @Get(':id')
  @RequirePermission('prj.client.view')
  get(@Param('id', id) cid: string) {
    return this.svc.clients.get(activeCompanyId(), cid);
  }

  @Post()
  @RequirePermission('prj.client.create')
  create(@Body(new ZodPipe(ClientCreate)) body: z.infer<typeof ClientCreate>) {
    return this.svc.createClient(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('prj.client.edit')
  update(@Param('id', id) cid: string, @Body(new ZodPipe(ClientUpdate.merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.svc.updateClient(activeCompanyId(), cid, data, v);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('prj.client.delete')
  async remove(@Param('id', id) cid: string) {
    await this.svc.clients.remove(activeCompanyId(), cid);
  }
}

// ------------------------------------------------------------------ projects
@Controller('projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  @RequirePermission('prj.project.view')
  list(@Query(listPipe) q: any) {
    return this.svc.listProjects(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('prj.project.view')
  get(@Param('id', id) pid: string) {
    return this.svc.getProject(activeCompanyId(), pid);
  }

  @Post()
  @RequirePermission('prj.project.create')
  create(@Body(new ZodPipe(ProjectCreate)) body: z.infer<typeof ProjectCreate>) {
    return this.svc.createProject(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('prj.project.edit')
  update(@Param('id', id) pid: string, @Body(new ZodPipe(ProjectUpdate.merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.svc.updateProject(activeCompanyId(), pid, data, v);
  }

  @Post(':id/status')
  @RequirePermission('prj.project.edit')
  status(@Param('id', id) pid: string, @Body(new ZodPipe(ProjectStatusChange)) body: z.infer<typeof ProjectStatusChange>) {
    return this.svc.changeStatus(activeCompanyId(), pid, body);
  }
}

// ------------------------------------------------------------------ assignments
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly svc: AssignmentsService) {}

  @Get()
  @RequirePermission('prj.assignment.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get('employee-days-report')
  @RequirePermission('prj.assignment.view')
  employeeDaysReport(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.getEmployeeDaysReport(activeCompanyId(), q.periodId);
  }

  @Get(':id')
  @RequirePermission('prj.assignment.view')
  get(@Param('id', id) aid: string) {
    return this.svc.get(activeCompanyId(), aid);
  }

  @Post()
  @RequirePermission('prj.assignment.create')
  create(@Body(new ZodPipe(AssignmentCreate)) body: z.infer<typeof AssignmentCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('prj.assignment.edit')
  update(@Param('id', id) aid: string, @Body(new ZodPipe(AssignmentUpdate)) body: z.infer<typeof AssignmentUpdate>) {
    return this.svc.update(activeCompanyId(), aid, body);
  }

  @Post(':id/change')
  @RequirePermission('prj.assignment.edit')
  change(@Param('id', id) aid: string, @Body(new ZodPipe(AssignmentChange)) body: z.infer<typeof AssignmentChange>) {
    return this.svc.change(activeCompanyId(), aid, body);
  }

  @Post(':id/end')
  @RequirePermission('prj.assignment.edit')
  end(@Param('id', id) aid: string, @Body(new ZodPipe(AssignmentEnd)) body: z.infer<typeof AssignmentEnd>) {
    return this.svc.end(activeCompanyId(), aid, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('prj.assignment.delete')
  async remove(@Param('id', id) aid: string) {
    await this.svc.remove(activeCompanyId(), aid);
  }
}

@Controller('utilization')
export class UtilizationController {
  constructor(private readonly svc: AssignmentsService) {}

  @Get()
  @RequirePermission('prj.assignment.view')
  report(@Query(periodQuery) q: { periodId: string }) {
    return this.svc.report(activeCompanyId(), q.periodId);
  }

  @Get('employees/:employeeId')
  @RequirePermission('prj.assignment.view')
  employee(@Param('employeeId', id) employeeId: string, @Query(periodQuery) q: { periodId: string }) {
    return this.svc.employeeUtilization(activeCompanyId(), employeeId, q.periodId);
  }
}

// ------------------------------------------------------------------ service prices
@Controller('service-prices')
export class ServicePricesController {
  constructor(private readonly svc: PricingService) {}

  @Get()
  @RequirePermission('prj.price.view')
  list(@Query(listPipe) q: any) {
    return this.svc.list(activeCompanyId(), q);
  }

  @Get('resolve')
  @RequirePermission('prj.price.view')
  resolve(@Query(new ZodPipe(z.object({ employeeId: uuid, projectId: uuid.optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))) q: any) {
    return this.svc.resolve(activeCompanyId(), q.employeeId, q.projectId ?? null, q.date);
  }

  @Get(':id')
  @RequirePermission('prj.price.view')
  get(@Param('id', id) pid: string) {
    return this.svc.get(activeCompanyId(), pid);
  }

  @Post()
  @RequirePermission('prj.price.create')
  create(@Body(new ZodPipe(PriceCreate)) body: z.infer<typeof PriceCreate>) {
    return this.svc.create(activeCompanyId(), body);
  }

  @Post(':id/end')
  @RequirePermission('prj.price.edit')
  end(@Param('id', id) pid: string, @Body(new ZodPipe(PriceEnd)) body: z.infer<typeof PriceEnd>) {
    return this.svc.end(activeCompanyId(), pid, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('prj.price.delete')
  async remove(@Param('id', id) pid: string) {
    await this.svc.remove(activeCompanyId(), pid);
  }
}
