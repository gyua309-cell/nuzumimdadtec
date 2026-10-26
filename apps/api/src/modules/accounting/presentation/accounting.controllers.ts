import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { CrudRepository } from '../../../shared/crud';
import { decimalString, isoDate, listQuery, offset, reasonSchema, uuid } from '../../../shared/http/common';
import { crudController } from '../../../shared/http/crud.controller';
import { activeCompanyId } from '../../../shared/http/request';
import { ZodPipe } from '../../../shared/http/zod.pipe';
import { RequirePermission } from '../../iam/presentation/decorators';
import { AccountCreate, AccountsService, AccountUpdate } from '../application/accounts.service';
import { ClosingService } from '../application/closing.service';
import { JournalService } from '../application/journal.service';
import { LedgerService } from '../application/ledger.service';
import { PostingEngine } from '../application/posting-engine';
import { PostingRulesService, RuleCreate, RuleUpdate } from '../application/posting-rules.service';

const id = new ZodPipe(uuid);
const optUuid = uuid.nullable().optional();
const dims = {
  branchId: optUuid, costCenterId: optUuid, departmentId: optUuid, projectId: optUuid, clientId: optUuid, supplierId: optUuid,
  employeeId: optUuid, assetId: optUuid,
};

// ------------------------------------------------------------------ bank accounts
export const BANK_ACCOUNT_REPO = 'BANK_ACCOUNT_REPO';
export const bankAccountRepoProvider = {
  provide: BANK_ACCOUNT_REPO,
  inject: [DbService],
  useFactory: (db: DbService) =>
    new CrudRepository(db, {
      entity: 'BankAccount',
      table: 'acc.bank_accounts',
      columns: {
        id: 'id', code: 'code', name: 'name', kind: 'kind', bankName: 'bank_name', accountNumber: 'account_number', iban: 'iban',
        currencyCode: 'currency_code', glAccountId: 'gl_account_id', branchId: 'branch_id', isActive: 'is_active', rowVersion: 'row_version',
      },
      writable: ['code', 'name', 'kind', 'bankName', 'accountNumber', 'iban', 'currencyCode', 'glAccountId', 'branchId', 'isActive'],
      searchColumns: ['code', 'name', 'bank_name'],
      sortable: { code: 't.code', name: 't.name' },
      defaultSort: 't.code ASC',
      filterable: ['isActive', 'kind', 'currencyCode'],
    }),
};
const BankCreate = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(['BANK', 'CASH']).default('BANK'),
  bankName: z.string().trim().max(200).nullable().optional(),
  accountNumber: z.string().trim().max(60).nullable().optional(),
  iban: z.string().trim().max(60).nullable().optional(),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  glAccountId: uuid,
  branchId: optUuid,
  isActive: z.boolean().optional(),
});
export const BankAccountsController = crudController({
  path: 'bank-accounts', permission: 'acc.bank', token: BANK_ACCOUNT_REPO, create: BankCreate, update: BankCreate.partial(),
});

// ------------------------------------------------------------------ chart of accounts
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermission('acc.coa.view')
  tree(
    @Query(new ZodPipe(z.object({ q: z.string().max(100).optional(), activeOnly: z.coerce.boolean().optional(), postingOnly: z.coerce.boolean().optional() })))
    q: { q?: string; activeOnly?: boolean; postingOnly?: boolean },
  ) {
    return this.accounts.tree(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('acc.coa.view')
  get(@Param('id', id) aid: string) {
    return this.accounts.get(activeCompanyId(), aid);
  }

  @Post()
  @RequirePermission('acc.coa.create')
  create(@Body(new ZodPipe(AccountCreate)) body: z.infer<typeof AccountCreate>) {
    return this.accounts.create(activeCompanyId(), body);
  }

  @Post('import-template')
  @RequirePermission('acc.coa.create')
  importTemplate(
    @Body(new ZodPipe(z.object({ accounts: z.array(AccountCreate.extend({ parentCode: z.string().nullable().optional() })).min(1).max(2000) })))
    body: { accounts: any[] },
  ) {
    return this.accounts.importTemplate(activeCompanyId(), body.accounts);
  }

  @Patch(':id')
  @RequirePermission('acc.coa.edit')
  update(@Param('id', id) aid: string, @Body(new ZodPipe(AccountUpdate)) body: z.infer<typeof AccountUpdate>) {
    return this.accounts.update(activeCompanyId(), aid, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('acc.coa.delete')
  async remove(@Param('id', id) aid: string) {
    await this.accounts.remove(activeCompanyId(), aid);
  }
}

// ------------------------------------------------------------------ posting rules
const SimulateSchema = z.object({
  eventCode: z.string(),
  entryDate: isoDate,
  currencyCode: z.string().length(3).toUpperCase(),
  exchangeRate: decimalString.nullable().optional(),
  context: z.record(z.unknown()).default({}),
  items: z
    .array(
      z.object({
        key: z.string(),
        amount: decimalString,
        dims: z.object(dims).partial().optional(),
        refs: z.record(z.string().nullable()).optional(),
        split: z.array(z.object({ weight: decimalString, dims: z.object(dims).partial() })).optional(),
      }),
    )
    .min(1),
});

@Controller()
export class PostingRulesController {
  constructor(
    private readonly rules: PostingRulesService,
    private readonly engine: PostingEngine,
  ) {}

  @Get('posting-events')
  @RequirePermission('acc.rules.view')
  events() {
    return this.rules.events();
  }

  @Get('posting-rules')
  @RequirePermission('acc.rules.view')
  list(@Query(new ZodPipe(z.object({ eventCode: z.string().optional() }))) q: { eventCode?: string }) {
    return this.rules.list(activeCompanyId(), q.eventCode);
  }

  @Get('posting-rules/:id')
  @RequirePermission('acc.rules.view')
  get(@Param('id', id) rid: string) {
    return this.rules.get(activeCompanyId(), rid);
  }

  @Post('posting-rules')
  @RequirePermission('acc.rules.create')
  create(@Body(new ZodPipe(RuleCreate)) body: z.infer<typeof RuleCreate>) {
    return this.rules.create(activeCompanyId(), body);
  }

  @Patch('posting-rules/:id')
  @RequirePermission('acc.rules.edit')
  update(@Param('id', id) rid: string, @Body(new ZodPipe(RuleUpdate)) body: z.infer<typeof RuleUpdate>) {
    return this.rules.update(activeCompanyId(), rid, body);
  }

  @Delete('posting-rules/:id')
  @HttpCode(204)
  @RequirePermission('acc.rules.delete')
  async remove(@Param('id', id) rid: string) {
    await this.rules.remove(activeCompanyId(), rid);
  }

  @Post('posting-rules/simulate')
  @HttpCode(200)
  @RequirePermission('acc.rules.view')
  simulate(@Body(new ZodPipe(SimulateSchema)) body: z.infer<typeof SimulateSchema>) {
    return this.engine.simulate(activeCompanyId(), {
      ...body,
      journalType: 'GENERAL',
      description: 'simulation',
      sourceModule: 'SIM',
      sourceType: 'SIMULATION',
      sourceId: '00000000-0000-0000-0000-000000000000',
    });
  }
}

// ------------------------------------------------------------------ journal entries
const ManualLine = z.object({
  accountId: uuid,
  debit: decimalString.nullable().optional(),
  credit: decimalString.nullable().optional(),
  currencyCode: z.string().length(3).toUpperCase().nullable().optional(),
  exchangeRate: decimalString.nullable().optional(),
  taxCodeId: optUuid,
  taxBaseAmount: decimalString.nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  ...dims,
});
const ManualEntry = z.object({
  entryDate: isoDate,
  fiscalPeriodId: optUuid,
  journalType: z.enum(['GENERAL', 'ADJUSTMENT', 'ACCRUAL', 'OPENING']).default('GENERAL'),
  description: z.string().trim().min(3).max(500),
  reference: z.string().trim().max(100).nullable().optional(),
  currencyCode: z.string().length(3).toUpperCase().nullable().optional(),
  lines: z.array(ManualLine).min(2).max(1000),
  rowVersion: z.number().int().optional(),
});
const JournalListQuery = listQuery.extend({
  status: z.enum(['DRAFT', 'POSTED', 'CANCELLED']).optional(),
  ledger: z.enum(['FINANCIAL', 'MANAGEMENT']).optional(),
  journalType: z.string().max(30).optional(),
  sourceModule: z.string().max(30).optional(),
  sourceType: z.string().max(60).optional(),
  sourceId: uuid.optional(),
  periodId: uuid.optional(),
  accountId: uuid.optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

@Controller('journal-entries')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  @RequirePermission('acc.journal.view')
  list(@Query(new ZodPipe(JournalListQuery)) q: z.infer<typeof JournalListQuery>) {
    return this.journal.list(activeCompanyId(), q);
  }

  @Get(':id')
  @RequirePermission('acc.journal.view')
  get(@Param('id', id) jid: string) {
    return this.journal.get(activeCompanyId(), jid);
  }

  @Post()
  @RequirePermission('acc.journal.create')
  async create(@Body(new ZodPipe(ManualEntry)) body: z.infer<typeof ManualEntry>, @Headers('idempotency-key') key?: string) {
    const companyId = activeCompanyId();
    const { rowVersion: _rv, ...input } = body;
    const jid = await this.journal.createDraft(companyId, {
      ...input,
      sourceModule: 'GL',
      sourceType: 'MANUAL',
      postingEvent: body.journalType === 'OPENING' ? 'OPENING.BALANCE' : body.journalType === 'ADJUSTMENT' ? 'GL.ADJUSTMENT' : 'GL.MANUAL',
      idempotencyKey: key && /^[A-Za-z0-9_-]{8,128}$/.test(key) ? key : null,
    });
    return this.journal.get(companyId, jid);
  }

  @Put(':id')
  @RequirePermission('acc.journal.edit')
  async update(@Param('id', id) jid: string, @Body(new ZodPipe(ManualEntry)) body: z.infer<typeof ManualEntry>) {
    const companyId = activeCompanyId();
    const { rowVersion, ...input } = body;
    await this.journal.updateDraft(companyId, jid, input, rowVersion);
    return this.journal.get(companyId, jid);
  }

  @Post(':id/post')
  @HttpCode(200)
  @RequirePermission('acc.journal.post')
  async post(@Param('id', id) jid: string) {
    const companyId = activeCompanyId();
    await this.journal.post(companyId, jid);
    return this.journal.get(companyId, jid);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('acc.journal.cancel')
  async cancel(@Param('id', id) jid: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }) {
    const companyId = activeCompanyId();
    await this.journal.cancel(companyId, jid, body.reason);
    return this.journal.get(companyId, jid);
  }

  @Post(':id/reverse')
  @HttpCode(200)
  @RequirePermission('acc.journal.post')
  async reverse(
    @Param('id', id) jid: string,
    @Body(new ZodPipe(reasonSchema.extend({ reversalDate: isoDate.nullable().optional() }))) body: { reason: string; reversalDate?: string | null },
  ) {
    const companyId = activeCompanyId();
    const revId = await this.journal.reverse(companyId, jid, body.reason, body.reversalDate);
    return this.journal.get(companyId, revId);
  }
}

// ------------------------------------------------------------------ ledger & statements
const DimQuery = z.object(dims).partial();
const RangeQuery = DimQuery.extend({
  from: isoDate,
  to: isoDate,
  ledger: z.enum(['FINANCIAL', 'MANAGEMENT']).default('FINANCIAL'),
});

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('trial-balance')
  @RequirePermission('acc.ledger.view')
  trialBalance(@Query(new ZodPipe(RangeQuery.extend({ includeZero: z.coerce.boolean().optional() }))) q: any) {
    return this.ledger.trialBalance(activeCompanyId(), q);
  }

  @Get('account-statement')
  @RequirePermission('acc.ledger.view')
  statement(@Query(new ZodPipe(RangeQuery.extend({ accountId: uuid, page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(500).default(100) }))) q: any) {
    return this.ledger.accountStatement(activeCompanyId(), q);
  }

  @Get('income-statement')
  @RequirePermission('rpt.financial.view')
  incomeStatement(@Query(new ZodPipe(RangeQuery)) q: any) {
    return this.ledger.incomeStatement(activeCompanyId(), q);
  }

  @Get('balance-sheet')
  @RequirePermission('rpt.financial.view')
  balanceSheet(@Query(new ZodPipe(z.object({ asOf: isoDate, ledger: z.enum(['FINANCIAL', 'MANAGEMENT']).default('FINANCIAL') }))) q: any) {
    return this.ledger.balanceSheet(activeCompanyId(), q.asOf, q.ledger);
  }
}

// ------------------------------------------------------------------ closing
@Controller()
export class ClosingController {
  constructor(private readonly closing: ClosingService) {}

  @Get('closing/periods/:id/checks')
  @RequirePermission('close.period.view')
  checks(@Param('id', id) pid: string) {
    return this.closing.runChecks(activeCompanyId(), pid);
  }

  @Post('closing/periods/:id/close')
  @HttpCode(200)
  @RequirePermission('close.period.close')
  close(@Param('id', id) pid: string, @Body(new ZodPipe(z.object({ reason: z.string().trim().max(1000).optional() }))) body: { reason?: string }) {
    return this.closing.close(activeCompanyId(), pid, body.reason);
  }

  @Post('closing/periods/:id/reopen')
  @HttpCode(200)
  @RequirePermission('close.period.reopen')
  reopen(@Param('id', id) pid: string, @Body(new ZodPipe(reasonSchema)) body: { reason: string }) {
    return this.closing.reopen(activeCompanyId(), pid, body.reason);
  }

  @Get('snapshots')
  @RequirePermission('close.snapshot.view')
  snapshots(@Query(new ZodPipe(z.object({ periodId: uuid.optional() }))) q: { periodId?: string }) {
    return this.closing.listSnapshots(activeCompanyId(), q.periodId);
  }

  @Get('snapshots/:id')
  @RequirePermission('close.snapshot.view')
  snapshot(@Param('id', id) sid: string) {
    return this.closing.getSnapshot(activeCompanyId(), sid);
  }
}

// ------------------------------------------------------------------ audit trail
const AuditQuery = listQuery.extend({
  table: z.string().regex(/^[a-z_]+$/).optional(),
  entityId: z.string().max(64).optional(),
  userId: uuid.optional(),
  action: z.string().regex(/^[A-Z_]+$/).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

@Controller('audit-log')
export class AuditController {
  constructor(private readonly db: DbService) {}

  @Get()
  @RequirePermission('audit.log.view')
  async list(@Query(new ZodPipe(AuditQuery)) q: z.infer<typeof AuditQuery>) {
    const params: unknown[] = [activeCompanyId()];
    const where = ['(a.company_id = $1 OR a.company_id IS NULL)'];
    const eq = (col: string, v: unknown) => {
      if (!v) return;
      params.push(v);
      where.push(`${col} = $${params.length}`);
    };
    eq('a.table_name', q.table);
    eq('a.entity_id', q.entityId);
    eq('a.user_id', q.userId);
    eq('a.action', q.action);
    if (q.from) {
      params.push(q.from);
      where.push(`a.occurred_at >= $${params.length}::date`);
    }
    if (q.to) {
      params.push(q.to);
      where.push(`a.occurred_at < ($${params.length}::date + 1)`);
    }
    const w = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) n FROM audit.audit_log a WHERE ${w}`, params);
    const data = await this.db.query(
      `SELECT a.id, a.occurred_at AS "occurredAt", a.user_id AS "userId", u.full_name AS "userName", a.ip, a.device,
              a.request_id AS "requestId", a.schema_name AS "schemaName", a.table_name AS "tableName", a.entity_id AS "entityId",
              a.action, a.old_values AS "oldValues", a.new_values AS "newValues", a.changed_fields AS "changedFields",
              a.reason, a.reference, a.row_hash AS "rowHash"
         FROM audit.audit_log a LEFT JOIN iam.users u ON u.id = a.user_id
        WHERE ${w} ORDER BY a.occurred_at DESC, a.id DESC LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }
}
