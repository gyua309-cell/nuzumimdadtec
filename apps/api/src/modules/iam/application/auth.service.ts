import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { env } from '../../../config/env';
import { DbService } from '../../../infrastructure/db/db.service';
import { currentContext } from '../../../shared/context';
import { DomainError } from '../../../shared/errors';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function validatePasswordPolicy(password: string): void {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new DomainError(
      'WEAK_PASSWORD',
      'Password must be at least 10 characters and contain letters and digits',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export const hashPassword = (password: string) =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }); // OWASP argon2id baseline

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
  ) {}

  private async securityEvent(type: string, userId: string | null, username: string | null, details?: unknown) {
    const ctx = currentContext();
    await this.db.query(
      `INSERT INTO audit.security_events(user_id, username, event_type, ip, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, username, type, ctx?.ip ?? null, ctx?.device ?? null, details ? JSON.stringify(details) : null],
    );
  }

  async login(username: string, password: string): Promise<IssuedTokens & { userId: string }> {
    const user = await this.db.one<{
      id: string;
      username: string;
      password_hash: string;
      status: string;
      failed_attempts: number;
      locked_until: string | null;
    }>(
      `SELECT id, username, password_hash, status, failed_attempts, locked_until
         FROM iam.users WHERE username = $1`,
      [username],
    );

    if (!user) {
      // constant-ish time: still run a verification against a dummy hash
      await verify('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFy', password).catch(
        () => false,
      );
      await this.securityEvent('LOGIN_FAILED', null, username, { reason: 'unknown_user' });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    if (user.status === 'DISABLED') {
      await this.securityEvent('LOGIN_FAILED', user.id, username, { reason: 'disabled' });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await this.securityEvent('LOGIN_FAILED', user.id, username, { reason: 'locked' });
      throw new DomainError('ACCOUNT_LOCKED', undefined, HttpStatus.LOCKED);
    }

    const ok = await verify(user.password_hash, password).catch(() => false);
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= MAX_FAILED_ATTEMPTS;
      await this.db.query(
        `UPDATE iam.users SET failed_attempts = $2,
                locked_until = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE locked_until END
          WHERE id = $1`,
        [user.id, lock ? 0 : attempts, lock, LOCK_MINUTES],
      );
      await this.securityEvent(lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', user.id, username, { attempts });
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    await this.db.query(
      `UPDATE iam.users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
      [user.id],
    );
    const tokens = await this.issue(user.id, user.username, randomUUID());
    await this.securityEvent('LOGIN_SUCCESS', user.id, username);
    return { ...tokens, userId: user.id };
  }

  /** Rotates the refresh token. Reuse of a revoked token revokes the whole family. */
  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    const outcome = await this.db.tx(async (): Promise<IssuedTokens | 'REJECT'> => {
      const row = await this.db.one<{
        id: string;
        user_id: string;
        family_id: string;
        expires_at: string;
        revoked_at: string | null;
        username: string;
        status: string;
      }>(
        `SELECT t.id, t.user_id, t.family_id, t.expires_at, t.revoked_at, u.username, u.status
           FROM iam.refresh_tokens t JOIN iam.users u ON u.id = t.user_id
          WHERE t.token_hash = $1 FOR UPDATE OF t`,
        [sha256(refreshToken)],
      );
      if (!row) return 'REJECT';
      if (row.revoked_at) {
        // token reuse => assume theft: revoke the whole family (committed before rejecting)
        await this.db.query(
          `UPDATE iam.refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        await this.securityEvent('TOKEN_REUSE_DETECTED', row.user_id, row.username);
        return 'REJECT';
      }
      if (new Date(row.expires_at) < new Date() || row.status !== 'ACTIVE') return 'REJECT';
      return this.issue(row.user_id, row.username, row.family_id, row.id);
    });
    if (outcome === 'REJECT') throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    return outcome;
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const row = await this.db.one<{ family_id: string; user_id: string }>(
      `SELECT family_id, user_id FROM iam.refresh_tokens WHERE token_hash = $1`,
      [sha256(refreshToken)],
    );
    if (!row) return;
    await this.db.query(`UPDATE iam.refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [
      row.family_id,
    ]);
    await this.securityEvent('LOGOUT', row.user_id, null);
  }

  private async issue(userId: string, username: string, familyId: string, replacesId?: string): Promise<IssuedTokens> {
    const ttl = env().ACCESS_TOKEN_TTL_SECONDS;
    const accessToken = await this.jwt.signAsync({ sub: userId, usr: username, sid: familyId }, { expiresIn: ttl });
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86400_000);
    const ctx = currentContext();
    const inserted = await this.db.one<{ id: string }>(
      `INSERT INTO iam.refresh_tokens(user_id, family_id, token_hash, ip, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, familyId, sha256(refreshToken), ctx?.ip ?? null, ctx?.device?.slice(0, 300) ?? null, refreshExpiresAt],
    );
    if (replacesId) {
      await this.db.query(`UPDATE iam.refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`, [
        replacesId,
        inserted!.id,
      ]);
    }
    return { accessToken, accessTokenExpiresIn: ttl, refreshToken, refreshExpiresAt };
  }

  async me(userId: string) {
    const user = await this.db.one(
      `SELECT id, username, email, full_name AS "fullName", is_system_admin AS "isSystemAdmin",
              preferred_locale AS "preferredLocale", must_change_password AS "mustChangePassword"
         FROM iam.users WHERE id = $1`,
      [userId],
    );
    const companies = await this.db.query(
      `SELECT c.id, c.code, c.name_ar AS "nameAr", c.name_en AS "nameEn", c.base_currency_code AS "baseCurrency"
         FROM core.companies c
        WHERE c.is_active AND (
              (SELECT is_system_admin FROM iam.users WHERE id = $1)
              OR EXISTS (SELECT 1 FROM iam.user_role_assignments a WHERE a.user_id = $1 AND a.company_id = c.id))
        ORDER BY c.code`,
      [userId],
    );
    return { user, companies };
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    validatePasswordPolicy(next);
    const row = await this.db.one<{ password_hash: string; username: string }>(
      'SELECT password_hash, username FROM iam.users WHERE id = $1',
      [userId],
    );
    if (!row || !(await verify(row.password_hash, current).catch(() => false))) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }
    await this.db.tx(async () => {
      await this.db.query(
        `UPDATE iam.users SET password_hash = $2, password_changed_at = now(), must_change_password = false WHERE id = $1`,
        [userId, await hashPassword(next)],
      );
      await this.db.query(`UPDATE iam.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [
        userId,
      ]);
      await this.securityEvent('PASSWORD_CHANGED', userId, row.username);
    });
  }
}
