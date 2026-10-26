import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { requestContext, currentContext } from '../../../shared/context';
import { DomainError } from '../../../shared/errors';
import { hashPassword, validatePasswordPolicy } from './auth.service';
import { expandTemplate, ROLE_TEMPLATES } from '../domain/role-templates';
import { FiscalService } from '../../core/application/fiscal.service';

export const SetupSchema = z.object({
  company: z.object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/),
    nameAr: z.string().trim().min(2).max(200),
    nameEn: z.string().trim().max(200).optional(),
    legalName: z.string().trim().max(300).optional(),
    taxNumber: z.string().trim().max(50).optional(),
    countryCode: z.string().trim().length(2).toUpperCase().optional(),
    timezone: z.string().trim().min(3).max(64).default('Africa/Cairo'),
    baseCurrency: z.string().trim().length(3).toUpperCase(),
    fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  }),
  firstFiscalYear: z
    .object({
      code: z.string().trim().min(2).max(20),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
  admin: z.object({
    username: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/),
    fullName: z.string().trim().min(2).max(200),
    email: z.string().trim().email().optional(),
    password: z.string().min(10).max(200),
  }),
});
export type SetupInput = z.infer<typeof SetupSchema>;

/**
 * First-run setup wizard. Available ONLY while no user exists. Creates the first
 * company, the system administrator, role templates, and optionally the first
 * fiscal year. It never creates demo / sample business data.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly db: DbService,
    private readonly fiscal: FiscalService,
  ) {}

  async status(): Promise<{ initialized: boolean }> {
    const r = await this.db.one<{ n: string }>('SELECT count(*) AS n FROM iam.users');
    return { initialized: Number(r?.n ?? 0) > 0 };
  }

  async initialize(input: SetupInput): Promise<{ companyId: string; userId: string }> {
    validatePasswordPolicy(input.admin.password);
    const passwordHash = await hashPassword(input.admin.password);

    return this.db.tx(async () => {
      // serialize concurrent setup attempts
      await this.db.query('SELECT pg_advisory_xact_lock(727274002)');
      const st = await this.status();
      if (st.initialized) throw new DomainError('SETUP_ALREADY_COMPLETED', undefined, HttpStatus.CONFLICT);

      const cur = await this.db.one('SELECT 1 FROM core.currencies WHERE code = $1 AND is_active', [input.company.baseCurrency]);
      if (!cur) throw new DomainError('INVALID_CURRENCY', 'Unknown base currency');

      const user = await this.db.one<{ id: string }>(
        `INSERT INTO iam.users(username, email, full_name, password_hash, is_system_admin)
         VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [input.admin.username, input.admin.email ?? null, input.admin.fullName, passwordHash],
      );
      // from now on, audit entries are attributed to the new administrator
      const ctx = currentContext();
      if (ctx) ctx.userId = user!.id;
      await this.db.query(`SELECT set_config('app.user_id', $1, true)`, [user!.id]);

      const c = input.company;
      const company = await this.db.one<{ id: string }>(
        `INSERT INTO core.companies(code, name_ar, name_en, legal_name, tax_number, country_code, timezone,
                                    base_currency_code, fiscal_year_start_month, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [c.code, c.nameAr, c.nameEn ?? null, c.legalName ?? null, c.taxNumber ?? null, c.countryCode ?? null, c.timezone,
          c.baseCurrency, c.fiscalYearStartMonth, user!.id],
      );
      await this.db.query(`SELECT set_config('app.company_id', $1, true)`, [company!.id]);
      await this.db.query('INSERT INTO core.company_currencies(company_id, currency_code) VALUES ($1, $2)', [
        company!.id,
        c.baseCurrency,
      ]);

      // role templates (global, editable)
      const catalogue = (await this.db.query<{ code: string }>('SELECT code FROM iam.permissions')).map((r) => r.code);
      for (const t of ROLE_TEMPLATES) {
        const role = await this.db.one<{ id: string }>(
          `INSERT INTO iam.roles(company_id, code, name_ar, name_en, is_system, created_by, updated_by)
           VALUES (NULL, $1, $2, $3, true, $4, $4)
           ON CONFLICT DO NOTHING RETURNING id`,
          [t.code, t.nameAr, t.nameEn, user!.id],
        );
        if (!role) continue;
        const perms = expandTemplate(t, catalogue);
        if (perms.length) {
          await this.db.query(
            `INSERT INTO iam.role_permissions(role_id, permission_code) SELECT $1, unnest($2::text[])`,
            [role.id, perms],
          );
        }
      }

      if (input.firstFiscalYear) {
        await requestContext.run({ ...(ctx ?? { requestId: 'setup' }), companyId: company!.id, userId: user!.id }, () =>
          this.fiscal.createYear(company!.id, input.firstFiscalYear!.code, input.firstFiscalYear!.startDate),
        );
      }

      await this.db.query(
        `INSERT INTO audit.security_events(user_id, username, event_type, ip, user_agent)
         VALUES ($1, $2, 'SETUP_COMPLETED', $3, $4)`,
        [user!.id, input.admin.username, ctx?.ip ?? null, ctx?.device ?? null],
      );
      return { companyId: company!.id, userId: user!.id };
    });
  }
}
