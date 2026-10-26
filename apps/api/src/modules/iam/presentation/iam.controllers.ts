import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../../../config/env';
import { DomainError } from '../../../shared/errors';
import { listQuery, uuid } from '../../../shared/http/common';
import { activeCompanyId, activeUserId, assertSystemAdmin } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { AuthService, IssuedTokens } from '../application/auth.service';
import { SetupInput, SetupSchema, SetupService } from '../application/setup.service';
import {
  AssignRole,
  ResetPassword,
  RoleCreate,
  RoleUpdate,
  UserAdminService,
  UserCreate,
  UserUpdate,
} from '../application/user-admin.service';
import { NoCompany, Public, RequirePermission } from './decorators';

export const REFRESH_COOKIE = 'idham_rt';
const id = new ZodPipe(uuid);

function cookieOptions(expires?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env().COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/v1/auth',
    expires,
  };
}

function tokenResponse(res: Response, t: IssuedTokens) {
  res.cookie(REFRESH_COOKIE, t.refreshToken, cookieOptions(t.refreshExpiresAt));
  return { accessToken: t.accessToken, expiresIn: t.accessTokenExpiresIn, tokenType: 'Bearer' };
}

/** CSRF defence for cookie-authenticated endpoints: require a custom header (not sendable cross-site without CORS). */
function requireCsrfHeader(req: Request) {
  if (req.header('x-requested-with') !== 'XMLHttpRequest') {
    throw new DomainError('CSRF_HEADER_REQUIRED', 'X-Requested-With header is required', 403);
  }
}

const LoginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(200) });
const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body(new ZodPipe(LoginSchema)) body: z.infer<typeof LoginSchema>, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.login(body.username, body.password);
    return tokenResponse(res, t);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrfHeader(req);
    try {
      const t = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      return tokenResponse(res, t);
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      throw e;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrfHeader(req);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }

  @Get('me')
  @NoCompany()
  me() {
    return this.auth.me(activeUserId());
  }

  @Post('password/change')
  @NoCompany()
  @HttpCode(204)
  async changePassword(@Body(new ZodPipe(ChangePasswordSchema)) body: z.infer<typeof ChangePasswordSchema>) {
    await this.auth.changePassword(activeUserId(), body.currentPassword, body.newPassword);
  }
}

@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  @Public()
  status() {
    return this.setup.status();
  }

  @Post('initialize')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  initialize(@Body(new ZodPipe(SetupSchema)) body: SetupInput) {
    return this.setup.initialize(body);
  }
}

@Controller()
export class UsersController {
  constructor(private readonly admin: UserAdminService) {}

  @Get('users')
  @RequirePermission('iam.user.view')
  list(@Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    return this.admin.listUsers(activeCompanyId(), q);
  }

  @Get('users/:id')
  @RequirePermission('iam.user.view')
  get(@Param('id', id) uid: string) {
    return this.admin.getUser(uid);
  }

  @Post('users')
  @RequirePermission('iam.user.create')
  create(@Body(new ZodPipe(UserCreate)) body: z.infer<typeof UserCreate>) {
    return this.admin.createUser(body);
  }

  @Patch('users/:id')
  @RequirePermission('iam.user.edit')
  update(@Param('id', id) uid: string, @Body(new ZodPipe(UserUpdate)) body: z.infer<typeof UserUpdate>) {
    return this.admin.updateUser(uid, body);
  }

  @Post('users/:id/reset-password')
  @RequirePermission('iam.user.edit')
  @HttpCode(204)
  async reset(@Param('id', id) uid: string, @Body(new ZodPipe(ResetPassword)) body: z.infer<typeof ResetPassword>) {
    await this.admin.resetPassword(uid, body.password);
  }

  @Post('users/:id/roles')
  @RequirePermission('iam.role.edit')
  assign(@Param('id', id) uid: string, @Body(new ZodPipe(AssignRole)) body: z.infer<typeof AssignRole>) {
    return this.admin.assignRole(activeCompanyId(), uid, body);
  }

  @Delete('users/:id/roles/:assignmentId')
  @RequirePermission('iam.role.edit')
  @HttpCode(204)
  async revoke(@Param('id', id) uid: string, @Param('assignmentId', id) aid: string) {
    await this.admin.revokeRole(activeCompanyId(), uid, aid);
  }

  @Get('permissions')
  @RequirePermission('iam.role.view')
  permissions() {
    return this.admin.listPermissions();
  }

  @Get('roles')
  @RequirePermission('iam.role.view')
  roles() {
    return this.admin.listRoles(activeCompanyId());
  }

  @Get('roles/:id')
  @RequirePermission('iam.role.view')
  role(@Param('id', id) rid: string) {
    return this.admin.getRole(activeCompanyId(), rid);
  }

  @Post('roles')
  @RequirePermission('iam.role.create')
  createRole(@Body(new ZodPipe(RoleCreate)) body: z.infer<typeof RoleCreate>) {
    return this.admin.createRole(activeCompanyId(), body);
  }

  @Patch('roles/:id')
  @RequirePermission('iam.role.edit')
  async updateRole(@Param('id', id) rid: string, @Body(new ZodPipe(RoleUpdate)) body: z.infer<typeof RoleUpdate>) {
    if (await this.admin.isTemplateRole(rid)) assertSystemAdmin();
    return this.admin.updateRole(activeCompanyId(), rid, body);
  }

  @Delete('roles/:id')
  @RequirePermission('iam.role.delete')
  @HttpCode(204)
  async deleteRole(@Param('id', id) rid: string) {
    await this.admin.deleteRole(activeCompanyId(), rid);
  }

  @Get('security-events')
  @RequirePermission('audit.log.view')
  securityEvents(
    @Query(new ZodPipe(listQuery.extend({ eventType: z.string().max(40).optional(), userId: uuid.optional() })))
    q: z.infer<typeof listQuery> & { eventType?: string; userId?: string },
  ) {
    return this.admin.securityEvents(q);
  }
}
