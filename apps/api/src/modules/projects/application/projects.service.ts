import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { CrudConfig, CrudRepository } from '../../../shared/crud';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { decimalString, isoDate, ListQuery, offset, orderBy, Page } from '../../../shared/http/common';
import { dayAfter } from '../../../shared/effective';

const optText = z.string().trim().max(500).nullable().optional();
const optUuid = z.string().uuid().nullable().optional();
const currency = z.string().trim().length(3).toUpperCase();

// ------------------------------------------------------------------ clients
export const CLIENTS: CrudConfig = {
  entity: 'Client',
  table: 'prj.clients',
  columns: {
    id: 'id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', taxRegistrationNo: 'tax_registration_no', contactPerson: 'contact_person',
    email: 'email', phone: 'phone', address: 'address', currencyCode: 'currency_code', paymentTermsDays: 'payment_terms_days',
    receivableAccountId: 'receivable_account_id', defaultTaxCodeId: 'default_tax_code_id', isActive: 'is_active', notes: 'notes',
    createdAt: 'created_at', rowVersion: 'row_version',
  },
  writable: [
    'code', 'nameAr', 'nameEn', 'taxRegistrationNo', 'contactPerson', 'email', 'phone', 'address', 'currencyCode', 'paymentTermsDays',
    'receivableAccountId', 'defaultTaxCodeId', 'isActive', 'notes',
  ],
  searchColumns: ['code', 'name_ar', 'name_en', 'tax_registration_no'],
  sortable: { code: 't.code', nameAr: 't.name_ar', createdAt: 't.created_at' },
  defaultSort: 't.code ASC',
  filterable: ['isActive', 'currencyCode'],
};

const clientFields = {
  code: z.string().trim().min(1).max(30),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  taxRegistrationNo: z.string().trim().max(60).nullable().optional(),
  contactPerson: optText,
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  currencyCode: currency,
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  receivableAccountId: optUuid,
  defaultTaxCodeId: optUuid,
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};
export const ClientCreate = z.object(clientFields);
export const ClientUpdate = ClientCreate.partial();

// ------------------------------------------------------------------ projects
export const PROJECT_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;
type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** allowed status transitions (every transition is recorded with a reason) */
const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ACTIVE'],
  CANCELLED: [],
};

const projectFields = {
  clientId: z.string().uuid(),
  code: z.string().trim().min(1).max(30),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  managerEmployeeId: optUuid,
  currencyCode: currency,
  requiredMarginPct: decimalString.nullable().optional(),
  branchId: optUuid,
  costCenterId: optUuid,
  revenueAccountId: optUuid,
  description: z.string().trim().max(4000).nullable().optional(),
};
export const ProjectCreate = z
  .object({ ...projectFields, status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT') })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'endDate must not be before startDate', path: ['endDate'] });
export const ProjectUpdate = z.object(projectFields).partial();
export const ProjectStatusChange = z.object({
  newStatus: z.enum(PROJECT_STATUSES),
  effectiveDate: isoDate,
  reason: z.string().trim().min(3).max(1000),
});

const PCOLS: Record<string, string> = {
  clientId: 'client_id', code: 'code', nameAr: 'name_ar', nameEn: 'name_en', startDate: 'start_date', endDate: 'end_date',
  managerEmployeeId: 'manager_employee_id', currencyCode: 'currency_code', requiredMarginPct: 'required_margin_pct', branchId: 'branch_id',
  costCenterId: 'cost_center_id', revenueAccountId: 'revenue_account_id', description: 'description',
};

const PROJECT_SELECT = `
  p.id, p.code, p.name_ar AS "nameAr", p.name_en AS "nameEn", p.status, p.start_date::text AS "startDate", p.end_date::text AS "endDate",
  p.client_id AS "clientId", c.code AS "clientCode", c.name_ar AS "clientNameAr",
  p.manager_employee_id AS "managerEmployeeId", m.full_name_ar AS "managerNameAr",
  p.currency_code AS "currencyCode", p.required_margin_pct AS "requiredMarginPct", p.branch_id AS "branchId",
  p.cost_center_id AS "costCenterId", p.revenue_account_id AS "revenueAccountId", p.description,
  p.created_at AS "createdAt", p.row_version AS "rowVersion"`;
const PROJECT_FROM = `prj.projects p JOIN prj.clients c ON c.id = p.client_id LEFT JOIN hr.employees m ON m.id = p.manager_employee_id`;

/**
 * Clients and projects. A project always belongs to a client (NOT NULL composite
 * FK). Status changes are explicit, validated transitions with a reason and are
 * stored in an immutable history; closing/cancelling a project ends its open
 * assignments so nothing keeps earning revenue afterwards.
 */
@Injectable()
export class ProjectsService {
  readonly clients: CrudRepository;

  constructor(private readonly db: DbService) {
    this.clients = new CrudRepository(db, CLIENTS);
  }

  // ---- clients
  private async assertReceivableAccount(companyId: string, accountId?: string | null) {
    if (!accountId) return;
    const a = await this.db.one<{ account_class: string; is_posting: boolean; is_active: boolean }>(
      'SELECT account_class, is_posting, is_active FROM acc.accounts WHERE company_id = $1 AND id = $2',
      [companyId, accountId],
    );
    if (!a) throw new NotFoundError('Account', accountId);
    if (a.account_class !== 'ASSET' || !a.is_posting || !a.is_active) {
      throw new DomainError('INVALID_RECEIVABLE_ACCOUNT', 'Receivable account must be an active posting asset account');
    }
  }

  async createClient(companyId: string, body: z.infer<typeof ClientCreate>) {
    await this.assertReceivableAccount(companyId, body.receivableAccountId);
    return this.clients.create(companyId, body);
  }

  async updateClient(companyId: string, id: string, body: Record<string, unknown>, rowVersion?: number) {
    await this.assertReceivableAccount(companyId, body.receivableAccountId as string | undefined);
    return this.clients.update(companyId, id, body, rowVersion);
  }

  // ---- projects
  async listProjects(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['p.company_id = $1'];
    const params: unknown[] = [companyId];
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(p.code ILIKE $${params.length} OR p.name_ar ILIKE $${params.length} OR c.name_ar ILIKE $${params.length})`);
    }
    for (const [key, col] of [['status', 'p.status'], ['clientId', 'p.client_id'], ['managerEmployeeId', 'p.manager_employee_id']] as const) {
      if (q[key]) {
        params.push(q[key]);
        where.push(`${col} = $${params.length}`);
      }
    }
    const sql = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) AS n FROM ${PROJECT_FROM} WHERE ${sql}`, params);
    const rows = await this.db.query(
      `SELECT ${PROJECT_SELECT} FROM ${PROJECT_FROM} WHERE ${sql}
        ORDER BY ${orderBy(q.sort, { code: 'p.code', nameAr: 'p.name_ar', startDate: 'p.start_date', status: 'p.status' }, 'p.code ASC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async getProject(companyId: string, id: string) {
    const p = await this.db.one(`SELECT ${PROJECT_SELECT} FROM ${PROJECT_FROM} WHERE p.company_id = $1 AND p.id = $2`, [companyId, id]);
    if (!p) throw new NotFoundError('Project', id);
    const history = await this.db.query(
      `SELECT id, old_status AS "oldStatus", new_status AS "newStatus", effective_date::text AS "effectiveDate", reason,
              changed_by AS "changedBy", changed_at AS "changedAt"
         FROM prj.project_status_history WHERE company_id = $1 AND project_id = $2 ORDER BY changed_at, id`,
      [companyId, id],
    );
    return { ...p, statusHistory: history };
  }

  private async assertClientUsable(companyId: string, clientId: string) {
    const c = await this.db.one<{ is_active: boolean }>('SELECT is_active FROM prj.clients WHERE company_id = $1 AND id = $2', [companyId, clientId]);
    if (!c) throw new NotFoundError('Client', clientId);
    if (!c.is_active) throw new DomainError('CLIENT_INACTIVE', 'Client is inactive');
  }

  private async assertEmployeeExists(companyId: string, employeeId?: string | null) {
    if (!employeeId) return;
    const e = await this.db.one('SELECT 1 FROM hr.employees WHERE company_id = $1 AND id = $2', [companyId, employeeId]);
    if (!e) throw new NotFoundError('Employee', employeeId);
  }

  async createProject(companyId: string, body: z.infer<typeof ProjectCreate>) {
    return this.db.tx(async () => {
      await this.assertClientUsable(companyId, body.clientId);
      await this.assertEmployeeExists(companyId, body.managerEmployeeId);
      const fields = Object.keys(PCOLS).filter((f) => (body as Record<string, unknown>)[f] !== undefined);
      const cols = ['company_id', 'status', ...fields.map((f) => PCOLS[f])];
      const params = [companyId, body.status, ...fields.map((f) => (body as Record<string, unknown>)[f])];
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO prj.projects (${cols.join(', ')}, created_by, updated_by)
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        params,
      );
      await this.db.query(
        `INSERT INTO prj.project_status_history (company_id, project_id, old_status, new_status, effective_date, reason, changed_by)
         VALUES ($1, $2, NULL, $3, $4, 'Project created', sys.current_user_id())`,
        [companyId, row!.id, body.status, body.startDate],
      );
      return this.getProject(companyId, row!.id);
    });
  }

  async updateProject(companyId: string, id: string, body: Record<string, unknown>, rowVersion?: number) {
    return this.db.tx(async () => {
      const cur = await this.db.one<{ status: string; client_id: string; currency_code: string; start_date: string; end_date: string | null }>(
        'SELECT status, client_id, currency_code, start_date::text, end_date::text FROM prj.projects WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!cur) throw new NotFoundError('Project', id);
      if (cur.status === 'CANCELLED') throw new DomainError('PROJECT_CANCELLED', 'A cancelled project cannot be edited');
      if (cur.status !== 'DRAFT') {
        if (body.clientId !== undefined && body.clientId !== cur.client_id) throw new DomainError('PROJECT_CLIENT_LOCKED', 'Client cannot change after activation');
        if (body.currencyCode !== undefined && body.currencyCode !== cur.currency_code) throw new DomainError('PROJECT_CURRENCY_LOCKED', 'Currency cannot change after activation');
      }
      if (body.clientId && body.clientId !== cur.client_id) await this.assertClientUsable(companyId, body.clientId as string);
      await this.assertEmployeeExists(companyId, body.managerEmployeeId as string | undefined);
      const start = (body.startDate as string | undefined) ?? cur.start_date;
      const end = body.endDate === undefined ? cur.end_date : (body.endDate as string | null);
      if (end && end < start) throw new DomainError('INVALID_DATE_RANGE', 'endDate before startDate');
      const conflict = await this.db.one<{ n: string }>(
        `SELECT count(*) AS n FROM prj.assignments WHERE company_id = $1 AND project_id = $2
            AND (effective_from < $3::date OR ($4::date IS NOT NULL AND effective_from > $4::date))`,
        [companyId, id, start, end],
      );
      if (Number(conflict?.n ?? 0) > 0) throw new DomainError('PROJECT_DATES_CONFLICT_ASSIGNMENTS', 'Existing assignments fall outside the new project dates');
      if (end && end !== cur.end_date) await this.closeAssignmentsAt(companyId, id, end);
      const data: Record<string, unknown> = {};
      for (const f of Object.keys(PCOLS)) if (body[f] !== undefined) data[f] = body[f];
      const fields = Object.keys(data);
      if (fields.length === 0) return this.getProject(companyId, id);
      const params: unknown[] = [companyId, id];
      const sets = fields.map((f) => {
        params.push(data[f]);
        return `${PCOLS[f]} = $${params.length}`;
      });
      let vsql = '';
      if (rowVersion !== undefined) {
        params.push(rowVersion);
        vsql = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(`UPDATE prj.projects SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2${vsql} RETURNING id`, params);
      if (r.length === 0) throw new DomainError('VERSION_CONFLICT', 'Record was modified by another user', 409);
      return this.getProject(companyId, id);
    });
  }

  async changeStatus(companyId: string, id: string, input: z.infer<typeof ProjectStatusChange>) {
    return this.db.tx(async () => {
      const cur = await this.db.one<{ status: ProjectStatus; start_date: string; end_date: string | null }>(
        'SELECT status, start_date::text, end_date::text FROM prj.projects WHERE company_id = $1 AND id = $2 FOR UPDATE',
        [companyId, id],
      );
      if (!cur) throw new NotFoundError('Project', id);
      if (cur.status === input.newStatus) throw new DomainError('STATUS_UNCHANGED', 'Project already has this status');
      if (!TRANSITIONS[cur.status].includes(input.newStatus)) {
        throw new DomainError('PROJECT_TRANSITION_NOT_ALLOWED', `Cannot move a project from ${cur.status} to ${input.newStatus}`);
      }
      if (input.effectiveDate < cur.start_date && input.newStatus !== 'ACTIVE') {
        throw new DomainError('DATE_OUTSIDE_PROJECT', 'Effective date is before the project start');
      }
      let endDate: string | null | undefined;
      if (input.newStatus === 'COMPLETED' || input.newStatus === 'CANCELLED') {
        endDate = cur.end_date && cur.end_date < input.effectiveDate ? cur.end_date : input.effectiveDate;
        await this.closeAssignmentsAt(companyId, id, endDate);
      } else if (cur.status === 'COMPLETED' && input.newStatus === 'ACTIVE') {
        endDate = null; // reopened
      }
      await this.db.query(
        `UPDATE prj.projects SET status = $3${endDate !== undefined ? ', end_date = $4::date' : ''} WHERE company_id = $1 AND id = $2`,
        endDate !== undefined ? [companyId, id, input.newStatus, endDate] : [companyId, id, input.newStatus],
      );
      await this.db.query(
        `INSERT INTO prj.project_status_history (company_id, project_id, old_status, new_status, effective_date, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6, sys.current_user_id())`,
        [companyId, id, cur.status, input.newStatus, input.effectiveDate, input.reason],
      );
      return this.getProject(companyId, id);
    });
  }

  /**
   * Ends every assignment of the project at `endDate`. Assignments that would
   * start after that date are removed; touching a CLOSED period is refused by
   * the database guard (history of closed months stays intact).
   */
  private async closeAssignmentsAt(companyId: string, projectId: string, endDate: string) {
    const rows = await this.db.query<{ id: string; effective_from: string; effective_to: string | null }>(
      `SELECT id, effective_from::text, effective_to::text FROM prj.assignments
        WHERE company_id = $1 AND project_id = $2 AND (effective_to IS NULL OR effective_to > $3::date)`,
      [companyId, projectId, endDate],
    );
    for (const a of rows) {
      const tailFrom = a.effective_from > endDate ? a.effective_from : dayAfter(endDate);
      await this.db.query('SELECT core.assert_dates_open($1, $2::date, $3::date)', [companyId, tailFrom, a.effective_to]);
      if (a.effective_from > endDate) await this.db.query('DELETE FROM prj.assignments WHERE id = $1', [a.id]);
      else await this.db.query('UPDATE prj.assignments SET effective_to = $2::date, updated_by = sys.current_user_id() WHERE id = $1', [a.id, endDate]);
    }
  }
}
