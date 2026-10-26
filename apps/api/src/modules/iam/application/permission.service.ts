import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';

interface CacheEntry {
  expires: number;
  permissions: Set<string>;
  /** null => all branches; else allowed branch ids */
  branchScope: string[] | null;
  hasAccess: boolean;
}

/**
 * Resolves the effective permissions of a user in a company (RBAC + branch scope).
 * Short in-process cache, invalidated whenever roles/assignments change.
 */
@Injectable()
export class PermissionService {
  private cache = new Map<string, CacheEntry>();
  private static readonly TTL_MS = 30_000;

  constructor(private readonly db: DbService) {}

  async resolve(userId: string, companyId: string): Promise<CacheEntry> {
    const key = `${userId}:${companyId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit;

    const rows = await this.db.query<{ permission_code: string; branch_id: string | null }>(
      'SELECT permission_code, branch_id FROM iam.user_permissions($1, $2)',
      [userId, companyId],
    );
    const access = await this.db.one<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM iam.user_role_assignments
                       WHERE user_id = $1 AND company_id = $2
                         AND current_date >= valid_from AND (valid_to IS NULL OR current_date <= valid_to)) AS ok`,
      [userId, companyId],
    );
    const permissions = new Set(rows.map((r) => r.permission_code));
    const allBranches = rows.some((r) => r.branch_id === null);
    const branchScope = allBranches ? null : [...new Set(rows.map((r) => r.branch_id!).filter(Boolean))];
    const entry: CacheEntry = {
      expires: Date.now() + PermissionService.TTL_MS,
      permissions,
      branchScope,
      hasAccess: !!access?.ok,
    };
    this.cache.set(key, entry);
    return entry;
  }

  async allPermissionCodes(): Promise<Set<string>> {
    const rows = await this.db.query<{ code: string }>('SELECT code FROM iam.permissions');
    return new Set(rows.map((r) => r.code));
  }

  invalidate(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }
    for (const k of this.cache.keys()) if (k.startsWith(`${userId}:`)) this.cache.delete(k);
  }
}
