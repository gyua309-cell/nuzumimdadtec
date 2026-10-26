import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Type } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';
import { RequirePermission } from '../../modules/iam/presentation/decorators';
import { CrudRepository } from '../crud';
import { listQuery, uuid } from './common';
import { activeCompanyId } from './request';
import { ZodPipe } from './zod.pipe';

export interface CrudControllerOptions {
  path: string;
  /** permission prefix, e.g. 'core.branch' -> core.branch.view / create / edit / delete */
  permission: string;
  token: string | symbol | Type<CrudRepository>;
  create: ZodTypeAny;
  update: ZodTypeAny;
}

const idPipe = new ZodPipe(uuid);

/**
 * Mixin producing a standard REST controller (list/get/create/update/delete)
 * for simple master data. Validation via Zod, permissions via RBAC metadata,
 * persistence via the whitelist-driven CrudRepository (company scoped).
 */
export function crudController(opts: CrudControllerOptions): Type<unknown> {
  const listPipe = new ZodPipe(listQuery.passthrough());
  const createPipe = new ZodPipe(opts.create);
  const updatePipe = new ZodPipe(opts.update.and(z.object({ rowVersion: z.number().int().positive().optional() })));

  @Controller(opts.path)
  class GeneratedCrudController {
    constructor(@Inject(opts.token) readonly repo: CrudRepository) {}

    @Get()
    @RequirePermission(`${opts.permission}.view`)
    list(@Query(listPipe) q: any) {
      return this.repo.list(activeCompanyId(), q, q);
    }

    @Get(':id')
    @RequirePermission(`${opts.permission}.view`)
    get(@Param('id', idPipe) id: string) {
      return this.repo.get(activeCompanyId(), id);
    }

    @Post()
    @RequirePermission(`${opts.permission}.create`)
    create(@Body(createPipe) body: Record<string, unknown>) {
      return this.repo.create(activeCompanyId(), body);
    }

    @Patch(':id')
    @RequirePermission(`${opts.permission}.edit`)
    update(@Param('id', idPipe) id: string, @Body(updatePipe) body: Record<string, unknown> & { rowVersion?: number }) {
      const { rowVersion, ...data } = body;
      return this.repo.update(activeCompanyId(), id, data, rowVersion);
    }

    @Delete(':id')
    @HttpCode(204)
    @RequirePermission(`${opts.permission}.delete`)
    async remove(@Param('id', idPipe) id: string) {
      await this.repo.remove(activeCompanyId(), id);
    }
  }
  Object.defineProperty(GeneratedCrudController, 'name', { value: `Crud_${opts.path.replace(/[^a-z]/gi, '_')}` });
  return GeneratedCrudController;
}
