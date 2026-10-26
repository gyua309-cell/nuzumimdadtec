import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { listQuery, reasonSchema, uuid } from '../../../shared/http/common';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import { AssetActivate, AssetCreate, AssetDispose, AssetsService, AssetUpdate, CategoryCreate, CustodyAssign, CustodyReturn } from '../application/assets.service';
import { DepreciationService } from '../application/depreciation.service';

const id = new ZodPipe(uuid);
const listPipe = new ZodPipe(listQuery.passthrough());
const rowVersion = z.object({ rowVersion: z.number().int().positive().optional() });

@Controller('asset-categories')
export class AssetCategoriesController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermission('ast.asset.view')
  list(@Query(listPipe) q: any) {
    return this.assets.categories.list(activeCompanyId(), q, q);
  }

  @Get(':id')
  @RequirePermission('ast.asset.view')
  get(@Param('id', id) cid: string) {
    return this.assets.categories.get(activeCompanyId(), cid);
  }

  @Post()
  @RequirePermission('ast.asset.create')
  create(@Body(new ZodPipe(CategoryCreate)) body: z.infer<typeof CategoryCreate>) {
    return this.assets.createCategory(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('ast.asset.edit')
  update(@Param('id', id) cid: string, @Body(new ZodPipe(CategoryCreate.partial().merge(rowVersion))) body: any) {
    const { rowVersion: v, ...data } = body;
    return this.assets.updateCategory(activeCompanyId(), cid, data, v);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('ast.asset.delete')
  async remove(@Param('id', id) cid: string) {
    await this.assets.categories.remove(activeCompanyId(), cid);
  }
}

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermission('ast.asset.view')
  list(@Query(listPipe) q: any) {
    return this.assets.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('ast.asset.view')
  get(@Param('id', id) aid: string) {
    return this.assets.get(activeCompanyId(), aid);
  }

  @Post()
  @RequirePermission('ast.asset.create')
  create(@Body(new ZodPipe(AssetCreate)) body: z.infer<typeof AssetCreate>) {
    return this.assets.create(activeCompanyId(), body);
  }

  @Patch(':id')
  @RequirePermission('ast.asset.edit')
  update(@Param('id', id) aid: string, @Body(new ZodPipe(AssetUpdate)) body: z.infer<typeof AssetUpdate>) {
    return this.assets.update(activeCompanyId(), aid, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('ast.asset.delete')
  async remove(@Param('id', id) aid: string) {
    await this.assets.remove(activeCompanyId(), aid);
  }

  @Post(':id/activate')
  @RequirePermission('ast.asset.post')
  activate(@Param('id', id) aid: string, @Body(new ZodPipe(AssetActivate)) body: z.infer<typeof AssetActivate>) {
    return this.assets.activate(activeCompanyId(), aid, body);
  }

  @Post(':id/dispose')
  @RequirePermission('ast.asset.post')
  dispose(@Param('id', id) aid: string, @Body(new ZodPipe(AssetDispose)) body: z.infer<typeof AssetDispose>) {
    return this.assets.dispose(activeCompanyId(), aid, body);
  }

  @Post(':id/custody')
  @RequirePermission('ast.asset.edit')
  assign(@Param('id', id) aid: string, @Body(new ZodPipe(CustodyAssign)) body: z.infer<typeof CustodyAssign>) {
    return this.assets.assignCustody(activeCompanyId(), aid, body);
  }

  @Post(':id/custody/return')
  @RequirePermission('ast.asset.edit')
  giveBack(@Param('id', id) aid: string, @Body(new ZodPipe(CustodyReturn)) body: { effectiveTo: string }) {
    return this.assets.returnCustody(activeCompanyId(), aid, body.effectiveTo);
  }

  @Delete(':id/custody/:custodyId')
  @RequirePermission('ast.asset.edit')
  removeCustody(@Param('id', id) aid: string, @Param('custodyId', id) cid: string) {
    return this.assets.removeCustody(activeCompanyId(), aid, cid);
  }

  @Get(':id/schedule')
  @RequirePermission('ast.asset.view')
  schedule(@Param('id', id) aid: string) {
    return this.assets.schedule(activeCompanyId(), aid);
  }
}

@Controller('depreciation-runs')
export class DepreciationController {
  constructor(private readonly dep: DepreciationService) {}

  @Get()
  @RequirePermission('ast.depreciation.view')
  list(@Query(listPipe) q: any) {
    return this.dep.list(activeCompanyId(), q);
  }

  @Get('preview')
  @RequirePermission('ast.depreciation.view')
  preview(@Query(new ZodPipe(z.object({ periodId: uuid }))) q: { periodId: string }) {
    return this.dep.preview(activeCompanyId(), q.periodId);
  }

  @Get(':id')
  @RequirePermission('ast.depreciation.view')
  get(@Param('id', id) rid: string) {
    return this.dep.get(activeCompanyId(), rid);
  }

  @Post()
  @RequirePermission('ast.depreciation.post')
  run(@Body(new ZodPipe(z.object({ periodId: uuid }))) body: { periodId: string }) {
    return this.dep.run(activeCompanyId(), body.periodId);
  }

  @Post(':id/cancel')
  @RequirePermission('ast.depreciation.cancel')
  cancel(@Param('id', id) rid: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }) {
    return this.dep.cancel(activeCompanyId(), rid, body.reason);
  }
}
