import { HttpStatus, Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/errors';
import { ListQuery, offset, orderBy, Page } from '../../../shared/http/common';
import { ExchangeRateService } from '../../core/application/exchange-rate.service';
import { BuiltLine, buildLines, CurrencyInfo, JournalLineInput, mirrorLines, roundingLine } from '../domain/journal';

export type JournalType =
  | 'GENERAL' | 'PAYROLL' | 'REVENUE' | 'DEPRECIATION' | 'OVERHEAD' | 'ACCRUAL' | 'COLLECTION' | 'PAYMENT' | 'LOAN'
  | 'ASSET' | 'EXPENSE' | 'ADJUSTMENT' | 'REVERSAL' | 'FX_REVALUATION' | 'OPENING' | 'CLOSING';

export interface DraftInput {
  entryDate: string;
  /** explicit period (e.g. adjustment period 13); defaults to the regular period containing entryDate */
  fiscalPeriodId?: string | null;
  ledger?: 'FINANCIAL' | 'MANAGEMENT';
  journalType: JournalType;
  description: string;
  reference?: string | null;
  currencyCode?: string | null;
  sourceModule: string;
  sourceType: string;
  sourceId?: string | null;
  postingEvent?: string | null;
  postingRuleId?: string | null;
  reversalOfId?: string | null;
  originalPeriodId?: string | null;
  idempotencyKey?: string | null;
  lines: JournalLineInput[];
}

interface EntryRow {
  id: string;
  company_id: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  ledger: 'FINANCIAL' | 'MANAGEMENT';
  entry_date: string;
  fiscal_period_id: string;
  reversed_by_id: string | null;
  reversal_of_id: string | null;
  source_module: string;
  source_type: string;
  source_id: string | null;
  posting_event: string | null;
  journal_type: JournalType;
  description: string;
  reference: string | null;
  currency_code: string | null;
  entry_no: string | null;
}

const LINE_COLUMNS = [
  'entry_id', 'company_id', 'line_no', 'account_id', 'debit_tx', 'credit_tx', 'currency_code', 'exchange_rate', 'debit_base',
  'credit_base', 'branch_id', 'cost_center_id', 'department_id', 'project_id', 'client_id', 'supplier_id', 'employee_id',
  'asset_id', 'tax_code_id', 'tax_base_amount', 'allocation_bucket', 'revenue_type', 'description', 'source_line_ref',
];

const HEADER_COLS = `e.id, e.entry_no AS "entryNo", e.ledger, e.journal_type AS "journalType", e.entry_date AS "entryDate",
  e.fiscal_period_id AS "fiscalPeriodId", p.name AS "periodName", e.status, e.source_module AS "sourceModule",
  e.source_type AS "sourceType", e.source_id AS "sourceId", e.posting_event AS "postingEvent", e.posting_rule_id AS "postingRuleId",
  e.reference, e.description, e.currency_code AS "currencyCode", e.reversal_of_id AS "reversalOfId", e.reversed_by_id AS "reversedById",
  e.total_debit_base AS "totalDebitBase", e.total_credit_base AS "totalCreditBase", e.posted_at AS "postedAt",
  pu.full_name AS "postedBy", e.cancelled_at AS "cancelledAt", e.cancel_reason AS "cancelReason", e.created_at AS "createdAt",
  cu.full_name AS "createdBy", e.row_version AS "rowVersion"`;

/**
 * Journal entries: the only path into the general ledger.
 * Draft -> Posted (immutable) -> corrected only by Reversal; Draft -> Cancelled.
 * The database triggers are the last line of defence (balance, period, accounts,
 * dimensions, FX consistency, immutability); this service validates first for
 * clear errors and orchestrates numbering + audit inside one transaction.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly db: DbService,
    private readonly fx: ExchangeRateService,
  ) {}

  // ------------------------------------------------------------------ helpers
  private async currencyMap(): Promise<Map<string, number>> {
    const rows = await this.db.query<{ code: string; decimal_places: number }>('SELECT code, decimal_places FROM core.currencies');
    return new Map(rows.map((r) => [r.code, Number(r.decimal_places)]));
  }

  private async roundingAccount(companyId: string): Promise<string | null> {
    const r = await this.db.one<{ id: string }>(
      `SELECT id FROM acc.accounts WHERE company_id = $1 AND subtype = 'ROUNDING' AND is_active AND is_posting`,
      [companyId],
    );
    return r?.id ?? null;
  }

  private async resolvePeriod(companyId: string, entryDate: string, periodId?: string | null) {
    const p = periodId
      ? await this.db.one<{ id: string; status: string; start_date: string; end_date: string }>(
          'SELECT id, status, start_date, end_date FROM core.fiscal_periods WHERE company_id = $1 AND id = $2',
          [companyId, periodId],
        )
      : await this.db.one<{ id: string; status: string; start_date: string; end_date: string }>(
          `SELECT id, status, start_date, end_date FROM core.fiscal_periods
            WHERE company_id = $1 AND NOT is_adjustment_period AND $2::date BETWEEN start_date AND end_date`,
          [companyId, entryDate],
        );
    if (!p) throw new DomainError('PERIOD_NOT_FOUND_FOR_DATE', `No fiscal period covers ${entryDate}`);
    if (entryDate < p.start_date || entryDate > p.end_date) throw new DomainError('ENTRY_DATE_OUTSIDE_PERIOD');
    if (p.status !== 'OPEN') throw new DomainError('PERIOD_NOT_OPEN', `Fiscal period is ${p.status}`);
    return p;
  }

  /** Resolves currency + rate per line and converts to base (strict FX: missing rate fails). */
  async prepareLines(companyId: string, entryDate: string, headerCurrency: string | null | undefined, lines: JournalLineInput[]) {
    const base = await this.fx.baseCurrency(companyId);
    const decimals = await this.currencyMap();
    const enabled = new Set(
      (await this.db.query<{ currency_code: string }>('SELECT currency_code FROM core.company_currencies WHERE company_id = $1', [companyId])).map(
        (r) => r.currency_code,
      ),
    );
    const rateCache = new Map<string, string>();
    const resolved: (JournalLineInput & { currencyCode: string; exchangeRate: string })[] = [];
    for (const l of lines) {
      const cur = (l.currencyCode ?? headerCurrency ?? base.code).toUpperCase();
      if (!enabled.has(cur)) throw new DomainError('CURRENCY_NOT_ENABLED', `Currency ${cur} is not enabled for this company`);
      let rate = l.exchangeRate ?? null;
      if (cur === base.code) rate = '1';
      if (!rate) {
        if (!rateCache.has(cur)) rateCache.set(cur, (await this.fx.getRate(companyId, cur, base.code, entryDate)).rate.toString());
        rate = rateCache.get(cur)!;
      }
      resolved.push({ ...l, currencyCode: cur, exchangeRate: rate });
    }
    const baseInfo: CurrencyInfo = { code: base.code, decimals: Number(base.decimals) };
    const built = buildLines(resolved, baseInfo, (c) => {
      const d = decimals.get(c);
      if (d === undefined) throw new DomainError('INVALID_CURRENCY', `Unknown currency ${c}`);
      return d;
    });
    const rounding = roundingLine(built, baseInfo, await this.roundingAccount(companyId));
    if (rounding) built.push(rounding);
    return built;
  }

  private async insertLines(entryId: string, companyId: string, lines: BuiltLine[]) {
    for (let start = 0; start < lines.length; start += 500) {
      const chunk = lines.slice(start, start + 500);
      const params: unknown[] = [];
      const tuples = chunk.map((l) => {
        const values = [
          entryId, companyId, l.lineNo, l.accountId, l.debitTx, l.creditTx, l.currencyCode, l.exchangeRate, l.debitBase, l.creditBase,
          l.branchId ?? null, l.costCenterId ?? null, l.departmentId ?? null, l.projectId ?? null, l.clientId ?? null,
          l.supplierId ?? null, l.employeeId ?? null, l.assetId ?? null, l.taxCodeId ?? null, l.taxBaseAmount ?? null,
          l.allocationBucket ?? 'NONE', l.revenueType ?? null, l.description ?? null, l.sourceLineRef ?? null,
        ];
        const ph = values.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${ph.join(',')})`;
      });
      await this.db.query(`INSERT INTO acc.journal_lines (${LINE_COLUMNS.join(',')}) VALUES ${tuples.join(',')}`, params);
    }
  }

  private async validateManualAccounts(companyId: string, lines: BuiltLine[], sourceModule: string) {
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const rows = await this.db.query<{ id: string; code: string; is_posting: boolean; is_active: boolean; is_control: boolean }>(
      'SELECT id, code, is_posting, is_active, is_control FROM acc.accounts WHERE company_id = $1 AND id = ANY($2::uuid[])',
      [companyId, ids],
    );
    if (rows.length !== ids.length) throw new DomainError('ACCOUNT_NOT_FOUND', 'One or more accounts do not exist in this company');
    for (const a of rows) {
      if (!a.is_posting || !a.is_active) throw new DomainError('NON_POSTING_ACCOUNT', `Account ${a.code} is a header or inactive account`);
      if (sourceModule === 'GL' && a.is_control) {
        throw new DomainError('CONTROL_ACCOUNT_MANUAL_POSTING', `Account ${a.code} is a control account (sub-ledger only)`);
      }
    }
  }

  private async lockEntry(companyId: string, id: string): Promise<EntryRow> {
    const e = await this.db.one<EntryRow>('SELECT * FROM acc.journal_entries WHERE company_id = $1 AND id = $2 FOR UPDATE', [companyId, id]);
    if (!e) throw new NotFoundError('JournalEntry', id);
    return e;
  }

  /** Gapless numbering: the sequence row is locked inside the posting transaction. */
  private async nextNumber(companyId: string, docType: string, scope: string, prefix: string): Promise<string> {
    await this.db.query(
      `INSERT INTO sys.number_sequences(company_id, doc_type, scope_key, prefix) VALUES ($1,$2,$3,$4)
       ON CONFLICT (company_id, doc_type, scope_key) DO NOTHING`,
      [companyId, docType, scope, prefix],
    );
    const seq = await this.db.one<{ id: string; prefix: string; padding: number; next_value: string }>(
      `SELECT id, prefix, padding, next_value FROM sys.number_sequences
        WHERE company_id = $1 AND doc_type = $2 AND scope_key = $3 FOR UPDATE`,
      [companyId, docType, scope],
    );
    await this.db.query('UPDATE sys.number_sequences SET next_value = next_value + 1, updated_at = now() WHERE id = $1', [seq!.id]);
    return `${seq!.prefix}${String(seq!.next_value).padStart(seq!.padding, '0')}`;
  }

  // ------------------------------------------------------------------ commands
  async createDraft(companyId: string, input: DraftInput): Promise<string> {
    return this.db.tx(async () => {
      if (input.idempotencyKey) {
        const existing = await this.db.one<{ id: string }>(
          'SELECT id FROM acc.journal_entries WHERE company_id = $1 AND idempotency_key = $2',
          [companyId, input.idempotencyKey],
        );
        if (existing) return existing.id;
      }
      const period = await this.resolvePeriod(companyId, input.entryDate, input.fiscalPeriodId);
      const lines = await this.prepareLines(companyId, input.entryDate, input.currencyCode, input.lines);
      await this.validateManualAccounts(companyId, lines, input.sourceModule);
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO acc.journal_entries(company_id, ledger, journal_type, entry_date, fiscal_period_id, status, source_module,
                                         source_type, source_id, posting_event, posting_rule_id, reference, description,
                                         currency_code, reversal_of_id, original_period_id, idempotency_key, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, sys.current_user_id(), sys.current_user_id())
         RETURNING id`,
        [companyId, input.ledger ?? 'FINANCIAL', input.journalType, input.entryDate, period.id, input.sourceModule, input.sourceType,
          input.sourceId ?? null, input.postingEvent ?? null, input.postingRuleId ?? null, input.reference ?? null, input.description,
          input.currencyCode ?? null, input.reversalOfId ?? null, input.originalPeriodId ?? null, input.idempotencyKey ?? null],
      );
      await this.insertLines(row!.id, companyId, lines);
      return row!.id;
    });
  }

  /** Replace header fields and lines of a draft (optimistic locking via rowVersion). */
  async updateDraft(companyId: string, id: string, input: Omit<DraftInput, 'sourceModule' | 'sourceType'>, rowVersion?: number) {
    return this.db.tx(async () => {
      const e = await this.lockEntry(companyId, id);
      if (e.status !== 'DRAFT') throw new DomainError('JE_NOT_DRAFT');
      if (rowVersion !== undefined) {
        const v = await this.db.one('SELECT 1 FROM acc.journal_entries WHERE id = $1 AND row_version = $2', [id, rowVersion]);
        if (!v) throw new ConflictError('VERSION_CONFLICT');
      }
      const period = await this.resolvePeriod(companyId, input.entryDate, input.fiscalPeriodId);
      const lines = await this.prepareLines(companyId, input.entryDate, input.currencyCode, input.lines);
      await this.validateManualAccounts(companyId, lines, e.source_module);
      await this.db.query('DELETE FROM acc.journal_lines WHERE entry_id = $1', [id]);
      await this.db.query(
        `UPDATE acc.journal_entries SET entry_date = $2, fiscal_period_id = $3, journal_type = $4, description = $5,
                reference = $6, currency_code = $7 WHERE id = $1`,
        [id, input.entryDate, period.id, input.journalType, input.description, input.reference ?? null, input.currencyCode ?? null],
      );
      await this.insertLines(id, companyId, lines);
      return id;
    });
  }

  async post(companyId: string, id: string): Promise<string> {
    return this.db.tx(async () => {
      const e = await this.lockEntry(companyId, id);
      if (e.status !== 'DRAFT') throw new DomainError('JE_NOT_DRAFT');
      const fy = await this.db.one<{ code: string }>(
        `SELECT y.code FROM core.fiscal_periods p JOIN core.fiscal_years y ON y.id = p.fiscal_year_id WHERE p.id = $1`,
        [e.fiscal_period_id],
      );
      const docType = e.ledger === 'MANAGEMENT' ? 'MJE' : 'JE';
      const entryNo = await this.nextNumber(companyId, docType, fy!.code, `${docType}-${fy!.code}-`);
      await this.db.query(
        `UPDATE acc.journal_entries SET status = 'POSTED', entry_no = $2, posted_at = now(), posted_by = sys.current_user_id()
          WHERE id = $1`,
        [id, entryNo],
      );
      await this.db.query(`SELECT audit.log_action('acc','journal_entries',$1,'POST',NULL,$2::jsonb,NULL,$3)`, [
        id,
        JSON.stringify({ entryNo, entryDate: e.entry_date, ledger: e.ledger, sourceModule: e.source_module, sourceId: e.source_id }),
        entryNo,
      ]);
      return id;
    });
  }

  /** Create + post atomically (used by sub-ledgers through the posting engine). */
  async createAndPost(companyId: string, input: DraftInput): Promise<string> {
    return this.db.tx(async () => {
      const id = await this.createDraft(companyId, input);
      const st = await this.db.one<{ status: string }>('SELECT status FROM acc.journal_entries WHERE id = $1', [id]);
      if (st?.status === 'DRAFT') await this.post(companyId, id);
      return id;
    });
  }

  async cancel(companyId: string, id: string, reason: string) {
    return this.db.tx(async () => {
      const e = await this.lockEntry(companyId, id);
      if (e.status !== 'DRAFT') throw new DomainError('JE_NOT_DRAFT');
      await this.db.setReason(reason);
      await this.db.query(
        `UPDATE acc.journal_entries SET status = 'CANCELLED', cancel_reason = $2, cancelled_at = now(), cancelled_by = sys.current_user_id()
          WHERE id = $1`,
        [id, reason],
      );
      return id;
    }, { reason });
  }

  /**
   * Reverses a posted entry with an exact mirror (same currency, rate and base
   * amounts) dated `reversalDate` (default: original date when its period is open).
   */
  async reverse(companyId: string, id: string, reason: string, reversalDate?: string | null): Promise<string> {
    return this.db.tx(async () => {
      const e = await this.lockEntry(companyId, id);
      if (e.status !== 'POSTED') throw new DomainError('JE_NOT_POSTED');
      if (e.reversed_by_id) throw new DomainError('JE_ALREADY_REVERSED', undefined, HttpStatus.CONFLICT);
      if (e.reversal_of_id) throw new DomainError('JE_IS_REVERSAL', 'A reversal entry cannot be reversed; post a new entry instead');
      let date = reversalDate ?? null;
      if (!date) {
        const p = await this.db.one<{ status: string }>('SELECT status FROM core.fiscal_periods WHERE id = $1', [e.fiscal_period_id]);
        if (p?.status !== 'OPEN') {
          throw new DomainError('REVERSAL_DATE_REQUIRED', 'Original period is closed; choose a reversal date in an open period');
        }
        date = e.entry_date;
      }
      const lines = await this.db.query(
        `SELECT account_id AS "accountId", debit_tx AS "debitTx", credit_tx AS "creditTx", currency_code AS "currencyCode",
                exchange_rate AS "exchangeRate", debit_base AS "debitBase", credit_base AS "creditBase", branch_id AS "branchId",
                cost_center_id AS "costCenterId", department_id AS "departmentId", project_id AS "projectId", client_id AS "clientId",
                supplier_id AS "supplierId", employee_id AS "employeeId", asset_id AS "assetId", tax_code_id AS "taxCodeId",
                tax_base_amount AS "taxBaseAmount", allocation_bucket AS "allocationBucket", revenue_type AS "revenueType",
                description, source_line_ref AS "sourceLineRef"
           FROM acc.journal_lines WHERE entry_id = $1 ORDER BY line_no`,
        [id],
      );
      await this.db.setReason(reason);
      const revId = await this.createDraft(companyId, {
        entryDate: date,
        ledger: e.ledger,
        journalType: 'REVERSAL',
        description: `عكس القيد ${e.entry_no}: ${reason}`.slice(0, 500),
        reference: e.entry_no,
        currencyCode: e.currency_code,
        sourceModule: e.source_module,
        sourceType: e.source_type,
        sourceId: e.source_id,
        postingEvent: e.posting_event,
        reversalOfId: e.id,
        originalPeriodId: e.fiscal_period_id,
        lines: mirrorLines(lines as never[]),
      });
      await this.post(companyId, revId);
      await this.db.query('UPDATE acc.journal_entries SET reversed_by_id = $2 WHERE id = $1', [id, revId]);
      await this.db.query(`SELECT audit.log_action('acc','journal_entries',$1,'REVERSE',NULL,$2::jsonb,$3,$4)`, [
        id,
        JSON.stringify({ reversedById: revId }),
        reason,
        e.entry_no,
      ]);
      return revId;
    }, { reason });
  }

  // ------------------------------------------------------------------ queries
  async get(companyId: string, id: string) {
    const header = await this.db.one(
      `SELECT ${HEADER_COLS} FROM acc.journal_entries e
         JOIN core.fiscal_periods p ON p.id = e.fiscal_period_id
         LEFT JOIN iam.users pu ON pu.id = e.posted_by
         LEFT JOIN iam.users cu ON cu.id = e.created_by
        WHERE e.company_id = $1 AND e.id = $2`,
      [companyId, id],
    );
    if (!header) throw new NotFoundError('JournalEntry', id);
    const lines = await this.db.query(
      `SELECT l.line_no AS "lineNo", l.account_id AS "accountId", a.code AS "accountCode", a.name_ar AS "accountNameAr",
              a.name_en AS "accountNameEn", l.debit_tx AS "debitTx", l.credit_tx AS "creditTx", l.currency_code AS "currencyCode",
              l.exchange_rate AS "exchangeRate", l.debit_base AS "debitBase", l.credit_base AS "creditBase",
              l.branch_id AS "branchId", b.name_ar AS "branchName", l.cost_center_id AS "costCenterId", cc.name_ar AS "costCenterName",
              l.department_id AS "departmentId", d.name_ar AS "departmentName", l.project_id AS "projectId", l.client_id AS "clientId",
              l.supplier_id AS "supplierId", l.employee_id AS "employeeId", l.asset_id AS "assetId", l.tax_code_id AS "taxCodeId",
              l.tax_base_amount AS "taxBaseAmount", l.allocation_bucket AS "allocationBucket", l.revenue_type AS "revenueType",
              l.description, l.source_line_ref AS "sourceLineRef"
         FROM acc.journal_lines l
         JOIN acc.accounts a ON a.id = l.account_id
         LEFT JOIN core.branches b ON b.id = l.branch_id
         LEFT JOIN core.cost_centers cc ON cc.id = l.cost_center_id
         LEFT JOIN core.departments d ON d.id = l.department_id
        WHERE l.entry_id = $1 ORDER BY l.line_no`,
      [id],
    );
    return { ...header, lines };
  }

  async list(
    companyId: string,
    q: ListQuery & {
      status?: string; ledger?: string; journalType?: string; sourceModule?: string; periodId?: string;
      dateFrom?: string; dateTo?: string; accountId?: string; sourceType?: string; sourceId?: string;
    },
  ): Promise<Page<any>> {
    const params: unknown[] = [companyId];
    const where = ['e.company_id = $1'];
    const eq = (col: string, v: unknown) => {
      if (v === undefined || v === null || v === '') return;
      params.push(v);
      where.push(`${col} = $${params.length}`);
    };
    eq('e.status', q.status);
    eq('e.ledger', q.ledger);
    eq('e.journal_type', q.journalType);
    eq('e.source_module', q.sourceModule);
    eq('e.source_type', q.sourceType);
    eq('e.source_id', q.sourceId);
    eq('e.fiscal_period_id', q.periodId);
    if (q.dateFrom) {
      params.push(q.dateFrom);
      where.push(`e.entry_date >= $${params.length}`);
    }
    if (q.dateTo) {
      params.push(q.dateTo);
      where.push(`e.entry_date <= $${params.length}`);
    }
    if (q.accountId) {
      params.push(q.accountId);
      where.push(`EXISTS (SELECT 1 FROM acc.journal_lines l WHERE l.entry_id = e.id AND l.account_id = $${params.length})`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(e.entry_no ILIKE $${params.length} OR e.description ILIKE $${params.length} OR e.reference ILIKE $${params.length})`);
    }
    const w = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) n FROM acc.journal_entries e WHERE ${w}`, params);
    const data = await this.db.query(
      `SELECT ${HEADER_COLS} FROM acc.journal_entries e
         JOIN core.fiscal_periods p ON p.id = e.fiscal_period_id
         LEFT JOIN iam.users pu ON pu.id = e.posted_by
         LEFT JOIN iam.users cu ON cu.id = e.created_by
        WHERE ${w}
        ORDER BY ${orderBy(q.sort, { entryDate: 'e.entry_date', entryNo: 'e.entry_no', createdAt: 'e.created_at', total: 'e.total_debit_base' }, 'e.entry_date DESC, e.created_at DESC')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }
}
