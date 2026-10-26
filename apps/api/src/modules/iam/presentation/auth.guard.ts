import { CanActivate, ExecutionContext, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { DbService } from '../../../infrastructure/db/db.service';
import { currentContext } from '../../../shared/context';
import { DomainError, ForbiddenError } from '../../../shared/errors';
import { PermissionService } from '../application/permission.service';
import { IS_PUBLIC, NO_COMPANY, PERMISSIONS } from './decorators';

export interface AccessTokenPayload {
  sub: string;
  usr: string;
  sid: string;
}

/**
 * Global guard: Authentication (Bearer JWT) -> active company resolution
 * (X-Company-Id) -> RBAC permission check. Fills the request context used by
 * repositories (scope) and the audit trail.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: DbService,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }

    const user = await this.db.one<{ id: string; username: string; status: string; is_system_admin: boolean }>(
      'SELECT id, username, status, is_system_admin FROM iam.users WHERE id = $1',
      [payload.sub],
    );
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });

    const ctx = currentContext();
    if (ctx) {
      ctx.userId = user.id;
      ctx.username = user.username;
      ctx.isSystemAdmin = user.is_system_admin;
    }

    if (this.reflector.getAllAndOverride<boolean>(NO_COMPANY, targets)) return true;

    const companyId = req.header('x-company-id');
    if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) {
      throw new DomainError('COMPANY_REQUIRED', 'X-Company-Id header is required', HttpStatus.BAD_REQUEST);
    }

    let granted: Set<string>;
    let branchScope: string[] | null = null;
    if (user.is_system_admin) {
      const exists = await this.db.one('SELECT 1 FROM core.companies WHERE id = $1', [companyId]);
      if (!exists) throw new ForbiddenError('COMPANY_ACCESS_DENIED');
      granted = await this.permissions.allPermissionCodes();
    } else {
      const resolved = await this.permissions.resolve(user.id, companyId);
      if (!resolved.hasAccess) throw new ForbiddenError('COMPANY_ACCESS_DENIED');
      granted = resolved.permissions;
      branchScope = resolved.branchScope;
    }
    if (ctx) {
      ctx.companyId = companyId;
      ctx.permissions = granted;
      ctx.branchScope = branchScope;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, targets) ?? [];
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      await this.db
        .query(
          `INSERT INTO audit.security_events(user_id, username, event_type, ip, user_agent, details)
           VALUES ($1, $2, 'PERMISSION_DENIED', $3, $4, $5)`,
          [user.id, user.username, ctx?.ip ?? null, ctx?.device ?? null, JSON.stringify({ missing, path: req.path })],
        )
        .catch(() => undefined);
      throw new ForbiddenError('FORBIDDEN', `Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
