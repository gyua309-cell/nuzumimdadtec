import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/errors';
import { ListQuery, offset, orderBy, Page } from '../../../shared/http/common';
import { currentContext } from '../../../shared/context';
import { hashPassword, validatePasswordPolicy } from './auth.service';
import { PermissionService } from './permission.service';

export const UserCreate = z.object({
  username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/),
  fullName: z.string().trim().min(2).max(200),
  email: z.string().trim().email().nullable().optional(),
  password: z.string().min(10).max(200),
  preferredLocale: z.enum(['ar', 'en']).default('ar'),
  mustChangePassword: z.boolean().default(true),
});
export const UserUpdate = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  email: z.string().trim().email().nullable().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  preferredLocale: z.enum(['ar', 'en']).optional(),
  rowVersion: z.number().int().optional(),
});
export const ResetPassword = z.object({ password: z.string().min(10).max(200) });
export const RoleCreate = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  permissions: z.array(z.string()).default([]),
});
export const RoleUpdate = RoleCreate.omit({ code: true }).partial();
export const AssignRole = z.object({
  roleId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const USER_COLS = `u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.is_system_admin AS "isSystemAdmin",
  u.preferred_locale AS "preferredLocale", u.must_change_password AS "mustChangePassword", u.last_login_at AS "lastLoginAt",
  u.locked_until AS "lockedUntil", u.created_at AS "createdAt", u.row_version AS "rowVersion"`;

/**
 * Users, roles and role assignments of the active company. Template roles
 * (company_id NULL) are visible to all companies; companies may define their own.
 */
@Injectable()
export class UserAdminService {
  constructor(
    private readonly db: DbService,
    private readonly permissions: PermissionService,
  ) {}

  // ---------------------------------------------------------------- users
  async listUsers(companyId: string, q: ListQuery): Promise<Page<any>> {
    const params: unknown[] = [companyId];
    let where = `(u.is_system_admin OR EXISTS (SELECT 1 FROM iam.user_role_assignments a WHERE a.user_id = u.id AND a.company_id = $1)
                  OR NOT EXISTS (SELECT 1 FROM iam.user_role_assignments a2 WHERE a2.user_id = u.id))`;
    if (q.q) {
      params.push(`%${q.q}%`);
      where += ` AND (u.username ILIKE $2 OR u.full_name ILIKE $2 OR u.email ILIKE $2)`;
    }
    const total = await this.db.one<{ n: string }>(`SELECT count(*) n FROM iam.users u WHERE ${where}`, params);
    const data = await this.db.query(
      `SELECT ${USER_COLS},
              COALESCE((SELECT json_agg(json_build_object('assignmentId', a.id, 'roleId', r.id, 'roleCode', r.code, 'roleName', r.name_ar,
                                                          'branchId', a.branch_id, 'validFrom', a.valid_from, 'validTo', a.valid_to))
                          FROM iam.user_role_assignments a JOIN iam.roles r ON r.id = a.role_id
                         WHERE a.user_id = u.id AND a.company_id = $1), '[]') AS roles
         FROM iam.users u WHERE ${where}
        ORDER BY ${orderBy(q.sort, { username: 'u.username', fullName: 'u.full_name', createdAt: 'u.created_at' }, 'u.username')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async getUser(id: string) {
    const u = await this.db.one(`SELECT ${USER_COLS} FROM iam.users u WHERE u.id = $1`, [id]);
    if (!u) throw new NotFoundError('User', id);
    return u;
  }

  async createUser(input: z.infer<typeof UserCreate>) {
    validatePasswordPolicy(input.password);
    const hash = await hashPassword(input.password);
    return this.db.tx(async () => {
      const r = await this.db.one<{ id: string }>(
        `INSERT INTO iam.users(username, email, full_name, password_hash, preferred_locale, must_change_password, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [input.username, input.email ?? null, input.fullName, hash, input.preferredLocale, input.mustChangePassword],
      );
      return this.getUser(r!.id);
    });
  }

  async updateUser(id: string, input: z.infer<typeof UserUpdate>) {
    if (id === currentContext()?.userId && input.status === 'DISABLED') {
      throw new DomainError('CANNOT_DISABLE_SELF', 'You cannot disable your own account');
    }
    return this.db.tx(async () => {
      const map: Record<string, string> = { fullName: 'full_name', email: 'email', status: 'status', preferredLocale: 'preferred_locale' };
      const params: unknown[] = [id];
      const sets: string[] = [];
      for (const [f, c] of Object.entries(map)) {
        const v = (input as Record<string, unknown>)[f];
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${c} = $${params.length}`);
      }
      if (!sets.length) return this.getUser(id);
      let ver = '';
      if (input.rowVersion !== undefined) {
        params.push(input.rowVersion);
        ver = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(`UPDATE iam.users SET ${sets.join(', ')} WHERE id = $1${ver} RETURNING id`, params);
      if (!r.length) {
        await this.getUser(id);
        throw new ConflictError('VERSION_CONFLICT');
      }
      if (input.status === 'DISABLED') {
        await this.db.query('UPDATE iam.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      }
      this.db.afterCommit(() => this.permissions.invalidate(id));
      return this.getUser(id);
    });
  }

  async resetPassword(id: string, password: string) {
    validatePasswordPolicy(password);
    const hash = await hashPassword(password);
    await this.db.tx(async () => {
      const r = await this.db.query(
        `UPDATE iam.users SET password_hash = $2, must_change_password = true, password_changed_at = now(),
                failed_attempts = 0, locked_until = NULL WHERE id = $1 RETURNING id`,
        [id, hash],
      );
      if (!r.length) throw new NotFoundError('User', id);
      await this.db.query('UPDATE iam.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    });
  }

  async assignRole(companyId: string, userId: string, input: z.infer<typeof AssignRole>) {
    return this.db.tx(async () => {
      await this.getUser(userId);
      const role = await this.db.one('SELECT 1 FROM iam.roles WHERE id = $1 AND (company_id IS NULL OR company_id = $2)', [
        input.roleId,
        companyId,
      ]);
      if (!role) throw new NotFoundError('Role', input.roleId);
      const r = await this.db.one(
        `INSERT INTO iam.user_role_assignments(user_id, role_id, company_id, branch_id, valid_from, valid_to, created_by)
         VALUES ($1,$2,$3,$4, COALESCE($5::date, current_date), $6, sys.current_user_id())
         RETURNING id AS "assignmentId"`,
        [userId, input.roleId, companyId, input.branchId ?? null, input.validFrom ?? null, input.validTo ?? null],
      );
      this.db.afterCommit(() => this.permissions.invalidate(userId));
      return r;
    });
  }

  async revokeRole(companyId: string, userId: string, assignmentId: string) {
    await this.db.tx(async () => {
      const r = await this.db.query(
        'DELETE FROM iam.user_role_assignments WHERE id = $1 AND user_id = $2 AND company_id = $3 RETURNING id',
        [assignmentId, userId, companyId],
      );
      if (!r.length) throw new NotFoundError('RoleAssignment', assignmentId);
      this.db.afterCommit(() => this.permissions.invalidate(userId));
    });
  }

  // ---------------------------------------------------------------- roles
  listPermissions() {
    return this.db.query(
      `SELECT code, module, resource, action, is_sensitive AS "isSensitive", description_ar AS "descriptionAr",
              description_en AS "descriptionEn" FROM iam.permissions ORDER BY module, resource, action`,
    );
  }

  listRoles(companyId: string) {
    return this.db.query(
      `SELECT r.id, r.code, r.name_ar AS "nameAr", r.name_en AS "nameEn", r.description, r.is_system AS "isSystem",
              (r.company_id IS NULL) AS "isTemplate",
              (SELECT count(*)::int FROM iam.role_permissions rp WHERE rp.role_id = r.id) AS "permissionCount",
              (SELECT count(*)::int FROM iam.user_role_assignments a WHERE a.role_id = r.id AND a.company_id = $1) AS "userCount"
         FROM iam.roles r WHERE r.company_id IS NULL OR r.company_id = $1 ORDER BY r.is_system DESC, r.code`,
      [companyId],
    );
  }

  async getRole(companyId: string, id: string) {
    const r = await this.db.one(
      `SELECT id, code, name_ar AS "nameAr", name_en AS "nameEn", description, is_system AS "isSystem",
              (company_id IS NULL) AS "isTemplate", row_version AS "rowVersion"
         FROM iam.roles WHERE id = $1 AND (company_id IS NULL OR company_id = $2)`,
      [id, companyId],
    );
    if (!r) throw new NotFoundError('Role', id);
    const perms = await this.db.query<{ permission_code: string }>(
      'SELECT permission_code FROM iam.role_permissions WHERE role_id = $1 ORDER BY permission_code',
      [id],
    );
    return { ...r, permissions: perms.map((p) => p.permission_code) };
  }

  private async setPermissions(roleId: string, codes: string[]) {
    const unique = [...new Set(codes)];
    if (unique.length) {
      const known = await this.db.query<{ code: string }>('SELECT code FROM iam.permissions WHERE code = ANY($1::text[])', [unique]);
      if (known.length !== unique.length) {
        const k = new Set(known.map((x) => x.code));
        throw new DomainError('UNKNOWN_PERMISSION', 'Unknown permission codes', HttpStatus.UNPROCESSABLE_ENTITY, unique.filter((c) => !k.has(c)));
      }
    }
    await this.db.query('DELETE FROM iam.role_permissions WHERE role_id = $1', [roleId]);
    if (unique.length) {
      await this.db.query('INSERT INTO iam.role_permissions(role_id, permission_code) SELECT $1, unnest($2::text[])', [roleId, unique]);
    }
  }

  async createRole(companyId: string, input: z.infer<typeof RoleCreate>) {
    return this.db.tx(async () => {
      const r = await this.db.one<{ id: string }>(
        `INSERT INTO iam.roles(company_id, code, name_ar, name_en, description, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [companyId, input.code, input.nameAr, input.nameEn ?? null, input.description ?? null],
      );
      await this.setPermissions(r!.id, input.permissions);
      return this.getRole(companyId, r!.id);
    });
  }

  /** Template roles are edited globally (affects all companies) – system admin only, checked by controller. */
  async updateRole(companyId: string, id: string, input: z.infer<typeof RoleUpdate>) {
    return this.db.tx(async () => {
      await this.getRole(companyId, id);
      await this.db.query(
        `UPDATE iam.roles SET name_ar = COALESCE($2, name_ar), name_en = COALESCE($3, name_en),
                description = COALESCE($4, description) WHERE id = $1`,
        [id, input.nameAr ?? null, input.nameEn ?? null, input.description ?? null],
      );
      if (input.permissions) await this.setPermissions(id, input.permissions);
      this.db.afterCommit(() => this.permissions.invalidate());
      return this.getRole(companyId, id);
    });
  }

  async deleteRole(companyId: string, id: string) {
    await this.db.tx(async () => {
      const role = await this.db.one<{ is_system: boolean }>('SELECT is_system FROM iam.roles WHERE id = $1 AND company_id = $2', [id, companyId]);
      if (!role) throw new NotFoundError('Role', id);
      if (role.is_system) throw new DomainError('SYSTEM_ROLE_LOCKED', 'System roles cannot be deleted');
      const used = await this.db.one('SELECT 1 FROM iam.user_role_assignments WHERE role_id = $1 LIMIT 1', [id]);
      if (used) throw new DomainError('REFERENCED', 'Role is assigned to users', HttpStatus.CONFLICT);
      await this.db.query('DELETE FROM iam.roles WHERE id = $1', [id]);
    });
  }

  async isTemplateRole(id: string): Promise<boolean> {
    const r = await this.db.one<{ t: boolean }>('SELECT company_id IS NULL AS t FROM iam.roles WHERE id = $1', [id]);
    return !!r?.t;
  }

  // ---------------------------------------------------------------- security events
  async securityEvents(q: ListQuery & { eventType?: string; userId?: string }): Promise<Page<any>> {
    const params: unknown[] = [];
    const where: string[] = ['true'];
    if (q.eventType) {
      params.push(q.eventType);
      where.push(`event_type = $${params.length}`);
    }
    if (q.userId) {
      params.push(q.userId);
      where.push(`user_id = $${params.length}`);
    }
    const w = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) n FROM audit.security_events WHERE ${w}`, params);
    const data = await this.db.query(
      `SELECT id, occurred_at AS "occurredAt", user_id AS "userId", username, event_type AS "eventType", ip,
              user_agent AS "userAgent", details
         FROM audit.security_events WHERE ${w} ORDER BY occurred_at DESC LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }
}
