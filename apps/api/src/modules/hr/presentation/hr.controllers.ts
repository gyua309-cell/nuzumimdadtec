import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { DomainError } from '../../../shared/errors';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId, assertPermission } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import { ComponentCreate, ComponentUpdate, CostConfigService, PositionCreate, ProfileCreate, ProfileLineCreate } from '../application/cost-config.service';
import { EmployeeCostService } from '../application/employee-cost.service';
import {
  DocumentMeta,
  EmployeeCreate,
  EmployeesService,
  EmployeeUpdate,
  EndVersion,
  OverrideCreate,
  PlacementChange,
  ProfileAssign,
  SalaryChange,
  StatusChange,
} from '../application/employees.service';

const id = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const rowVersion = z.object({ rowVersion: z.number().int().positive().optional() });
const periodQuery = new ZodPipe(z.object({ periodId: uuid }));
const MAX_UPLOAD = 10 * 1024 * 1024;

type UploadedDoc = { originalname: string; mimetype: string; size: number; buffer: Buffer };

// ------------------------------------------------------------------ positions
@Controller('positions')
export class PositionsController {
  constructor(private readonly cfg: CostConfigService) {}

  @Get()
  @RequirePermission('hr.position.view')
  list(@Query(listPipe) q: any) {
    return this.cfg.positions.list(activeCompanyId(), q, q);
  }

  @Get(':id')
  @RequirePermission('hr.position.view')
  get(@Param('id', id) pid: string) {
    return this.cfg.positions.get(activeCompanyId(), pid);
  }

  @Post()
  @RequirePermission('hr.position.create')
  create(@Body(new ZodPipe(PositionCreate)) body: z.infer<typeof PositionCreate>) {
    return this.cfg.positions.create(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('hr.position.edit')
  update(@Param('id', id) pid: string, @Body(new ZodPipe(PositionCreate.partial().merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.cfg.positions.update(activeCompanyId(), pid, data, v);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('hr.position.delete')
  async remove(@Param('id', id) pid: string) {
    await this.cfg.positions.remove(activeCompanyId(), pid);
  }
}

// ------------------------------------------------------------------ cost components & profiles
@Controller('cost-components')
export class CostComponentsController {
  constructor(private readonly cfg: CostConfigService) {}

  @Get()
  @RequirePermission('cost.profile.view')
  list(@Query(listPipe) q: any) {
    return this.cfg.components.list(activeCompanyId(), q, q);
  }

  @Get(':id')
  @RequirePermission('cost.profile.view')
  get(@Param('id', id) cid: string) {
    return this.cfg.components.get(activeCompanyId(), cid);
  }

  @Post()
  @RequirePermission('cost.profile.create')
  create(@Body(new ZodPipe(ComponentCreate)) body: any) {
    return this.cfg.createComponent(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('cost.profile.edit')
  update(@Param('id', id) cid: string, @Body(new ZodPipe(ComponentUpdate.merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.cfg.updateComponent(activeCompanyId(), cid, data, v);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('cost.profile.delete')
  async remove(@Param('id', id) cid: string) {
    await this.cfg.components.remove(activeCompanyId(), cid);
  }
}

@Controller('cost-profiles')
export class CostProfilesController {
  constructor(private readonly cfg: CostConfigService) {}

  @Get()
  @RequirePermission('cost.profile.view')
  list(@Query(listPipe) q: any) {
    return this.cfg.profiles.list(activeCompanyId(), q, q);
  }

  @Get(':id')
  @RequirePermission('cost.profile.view')
  get(@Param('id', id) pid: string) {
    return this.cfg.getProfile(activeCompanyId(), pid);
  }

  @Post()
  @RequirePermission('cost.profile.create')
  create(@Body(new ZodPipe(ProfileCreate)) body: z.infer<typeof ProfileCreate>) {
    return this.cfg.profiles.create(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('cost.profile.edit')
  update(@Param('id', id) pid: string, @Body(new ZodPipe(ProfileCreate.partial().merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.cfg.profiles.update(activeCompanyId(), pid, data, v);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('cost.profile.delete')
  async remove(@Param('id', id) pid: string) {
    await this.cfg.profiles.remove(activeCompanyId(), pid);
  }

  @Post(':id/lines')
  @RequirePermission('cost.profile.edit')
  addLine(@Param('id', id) pid: string, @Body(new ZodPipe(ProfileLineCreate)) body: z.infer<typeof ProfileLineCreate>) {
    return this.cfg.addProfileLine(activeCompanyId(), pid, body);
  }

  @Post(':id/lines/:lineId/end')
  @RequirePermission('cost.profile.edit')
  endLine(@Param('id', id) pid: string, @Param('lineId', id) lineId: string, @Body(new ZodPipe(EndVersion)) body: { effectiveTo: string }) {
    return this.cfg.endProfileLine(activeCompanyId(), pid, lineId, body.effectiveTo);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermission('cost.profile.edit')
  removeLine(@Param('id', id) pid: string, @Param('lineId', id) lineId: string) {
    return this.cfg.removeProfileLine(activeCompanyId(), pid, lineId);
  }
}

// ------------------------------------------------------------------ employees
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly cost: EmployeeCostService,
  ) {}

  @Get()
  @RequirePermission('hr.employee.view')
  list(@Query(listPipe) q: any) {
    return this.employees.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('hr.employee.view')
  get(@Param('id', id) eid: string) {
    return this.employees.get(activeCompanyId(), eid);
  }

  @Post()
  @RequirePermission('hr.employee.create')
  create(@Body(new ZodPipe(EmployeeCreate)) body: z.infer<typeof EmployeeCreate>) {
    // initial salary is part of the hiring transaction but still needs the compensation right
    if (body.compensation) assertPermission('hr.compensation.create');
    return this.employees.create(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('hr.employee.edit')
  update(@Param('id', id) eid: string, @Body(new ZodPipe(EmployeeUpdate)) body: z.infer<typeof EmployeeUpdate>) {
    return this.employees.update(activeCompanyId(), eid, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('hr.employee.delete')
  async remove(@Param('id', id) eid: string) {
    await this.employees.remove(activeCompanyId(), eid);
  }

  @Post(':id/status')
  @RequirePermission('hr.employee.edit')
  status(@Param('id', id) eid: string, @Body(new ZodPipe(StatusChange)) body: z.infer<typeof StatusChange>) {
    return this.employees.changeStatus(activeCompanyId(), eid, body);
  }

  @Post(':id/compensations')
  @RequirePermission('hr.compensation.edit')
  salary(@Param('id', id) eid: string, @Body(new ZodPipe(SalaryChange)) body: z.infer<typeof SalaryChange>) {
    return this.employees.changeSalary(activeCompanyId(), eid, body);
  }

  @Delete(':id/compensations/:versionId')
  @RequirePermission('hr.compensation.edit')
  removeSalary(@Param('id', id) eid: string, @Param('versionId', id) vid: string) {
    return this.employees.removeVersion(activeCompanyId(), eid, 'compensations', vid);
  }

  @Post(':id/placements')
  @RequirePermission('hr.employee.edit')
  placement(@Param('id', id) eid: string, @Body(new ZodPipe(PlacementChange)) body: z.infer<typeof PlacementChange>) {
    return this.employees.changePlacement(activeCompanyId(), eid, body);
  }

  @Delete(':id/placements/:versionId')
  @RequirePermission('hr.employee.edit')
  removePlacement(@Param('id', id) eid: string, @Param('versionId', id) vid: string) {
    return this.employees.removeVersion(activeCompanyId(), eid, 'placements', vid);
  }

  @Post(':id/cost-profiles')
  @RequirePermission('cost.profile.edit')
  assignProfile(@Param('id', id) eid: string, @Body(new ZodPipe(ProfileAssign)) body: z.infer<typeof ProfileAssign>) {
    return this.employees.assignProfile(activeCompanyId(), eid, body);
  }

  @Post(':id/cost-profiles/end')
  @RequirePermission('cost.profile.edit')
  endProfile(@Param('id', id) eid: string, @Body(new ZodPipe(EndVersion)) body: { effectiveTo: string }) {
    return this.employees.endProfile(activeCompanyId(), eid, body.effectiveTo);
  }

  @Delete(':id/cost-profiles/:versionId')
  @RequirePermission('cost.profile.edit')
  removeProfile(@Param('id', id) eid: string, @Param('versionId', id) vid: string) {
    return this.employees.removeVersion(activeCompanyId(), eid, 'cost-profiles', vid);
  }

  @Post(':id/overrides')
  @RequirePermission('cost.profile.edit')
  addOverride(@Param('id', id) eid: string, @Body(new ZodPipe(OverrideCreate)) body: z.infer<typeof OverrideCreate>) {
    return this.employees.addOverride(activeCompanyId(), eid, body);
  }

  @Post(':id/overrides/:overrideId/end')
  @RequirePermission('cost.profile.edit')
  endOverride(@Param('id', id) eid: string, @Param('overrideId', id) oid: string, @Body(new ZodPipe(EndVersion)) body: { effectiveTo: string }) {
    return this.employees.endOverride(activeCompanyId(), eid, oid, body.effectiveTo);
  }

  @Delete(':id/overrides/:overrideId')
  @RequirePermission('cost.profile.edit')
  removeOverride(@Param('id', id) eid: string, @Param('overrideId', id) oid: string) {
    return this.employees.removeOverride(activeCompanyId(), eid, oid);
  }

  // --------------------------------------------------------- cost preview
  @Get(':id/cost')
  @RequirePermission('cost.profile.view', 'hr.compensation.view')
  async employeeCost(@Param('id', id) eid: string, @Query(periodQuery) q: { periodId: string }) {
    const p = await this.cost.periodRange(activeCompanyId(), q.periodId);
    return { period: p, ...(await this.cost.compute(activeCompanyId(), eid, p)) };
  }

  // --------------------------------------------------------- documents
  @Get(':id/documents')
  @RequirePermission('hr.document.view')
  documents(@Param('id', id) eid: string) {
    return this.employees.listDocuments(activeCompanyId(), eid);
  }

  @Post(':id/documents')
  @RequirePermission('hr.document.create')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  addDocument(@Param('id', id) eid: string, @UploadedFile() file: UploadedDoc | undefined, @Body() raw: Record<string, unknown>) {
    // multipart fields arrive as strings; empty strings mean "not provided"
    const clean = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, v === '' ? null : v]));
    const parsed = DocumentMeta.safeParse(clean);
    if (!parsed.success) {
      throw new DomainError(
        'VALIDATION_FAILED',
        'Invalid document data',
        422,
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return this.employees.addDocument(activeCompanyId(), eid, parsed.data, file);
  }

  @Get(':id/documents/:docId/file')
  @RequirePermission('hr.document.view')
  async download(@Param('id', id) eid: string, @Param('docId', id) did: string, @Res() res: Response) {
    const f = await this.employees.downloadDocument(activeCompanyId(), eid, did);
    res.setHeader('Content-Type', f.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.file_name || 'document')}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(f.content);
  }

  @Delete(':id/documents/:docId')
  @HttpCode(204)
  @RequirePermission('hr.document.delete')
  async removeDocument(@Param('id', id) eid: string, @Param('docId', id) did: string) {
    await this.employees.removeDocument(activeCompanyId(), eid, did);
  }
}

// ------------------------------------------------------------------ company cost sheet
@Controller('cost-sheet')
export class CostSheetController {
  constructor(private readonly cost: EmployeeCostService) {}

  @Get()
  @RequirePermission('cost.profile.view', 'hr.compensation.view')
  sheet(@Query(periodQuery) q: { periodId: string }) {
    return this.cost.costSheet(activeCompanyId(), q.periodId);
  }
}
