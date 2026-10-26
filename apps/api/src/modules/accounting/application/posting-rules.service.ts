import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/errors';
import { isoDate } from '../../../shared/http/common';

export const ACCOUNT_SOURCES = ['FIXED', 'FROM_COMPONENT_EXPENSE', 'FROM_COMPONENT_LIABILITY', 'FROM_VARIABLE_TYPE',
  'FROM_ASSET_CATEGORY_ASSET', 'FROM_ASSET_CATEGORY_ACCUM', 'FROM_ASSET_CATEGORY_EXPENSE', 'FROM_CLIENT', 'FROM_SUPPLIER',
  'FROM_BANK', 'FROM_TAX_CODE', 'FROM_PAYLOAD'] as const;
export const DIMENSION_POLICIES = ['INHERIT_ALL', 'SPLIT_BY_ALLOCATION', 'EMPLOYEE_ONLY', 'PARTY_ONLY', 'NONE'] as const;

const conditionValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]);

export const RuleLineSchema = z.object({
  lineNo: z.number().int().positive(),
  side: z.enum(['DEBIT', 'CREDIT']),
  accountSource: z.enum(ACCOUNT_SOURCES),
  accountId: z.string().uuid().nullable().optional(),
  amountKey: z.string().trim().min(1).max(40),
  dimensionPolicy: z.enum(DIMENSION_POLICIES).default('INHERIT_ALL'),
  descriptionTemplate: z.string().trim().max(300).nullable().optional(),
});

export const RuleCreate = z.object({
  eventCode: z.string().trim(),
  name: z.string().trim().min(2).max(200),
  ledger: z.enum(['FINANCIAL', 'MANAGEMENT']).default('FINANCIAL'),
  conditions: z.record(conditionValue).default({}),
  priority: z.number().int().min(0).max(10000).default(100),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable().optional(),
  isActive: z.boolean().default(true),
  lines: z.array(RuleLineSchema).min(2),
});
export const RuleUpdate = RuleCreate.omit({ eventCode: true }).partial().extend({ rowVersion: z.number().int().optional() });
export type RuleCreateInput = z.infer<typeof RuleCreate>;

export interface RuleLine {
  id: string;
  lineNo: number;
  side: 'DEBIT' | 'CREDIT';
  accountSource: (typeof ACCOUNT_SOURCES)[number];
  accountId: string | null;
  amountKey: string;
  dimensionPolicy: (typeof DIMENSION_POLICIES)[number];
  descriptionTemplate: string | null;
}

export interface Rule {
  id: string;
  eventCode: string;
  name: string;
  ledger: 'FINANCIAL' | 'MANAGEMENT';
  conditions: Record<string, unknown>;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  lines: RuleLine[];
}

/** Does a rule's condition object match the posting context? (all keys must match; arrays = IN) */
export function conditionsMatch(conditions: Record<string, unknown>, context: Record<string, unknown>): boolean {
  return Object.entries(conditions).every(([k, expected]) => {
    const actual = context[k];
    if (Array.isArray(expected)) return expected.map(String).includes(String(actual));
    return String(expected) === String(actual);
  });
}

const RULE_COLS = `r.id, r.event_code AS "eventCode", r.name, r.ledger, r.conditions, r.priority, r.effective_from AS "effectiveFrom",
  r.effective_to AS "effectiveTo", r.is_active AS "isActive", r.row_version AS "rowVersion"`;

/** Posting rules = configurable account determination per business event. */
@Injectable()
export class PostingRulesService {
  constructor(private readonly db: DbService) {}

  events() {
    return this.db.query(
      `SELECT code, module, description_ar AS "descriptionAr", description_en AS "descriptionEn", amount_keys AS "amountKeys",
              account_sources AS "accountSources" FROM acc.posting_events ORDER BY module, code`,
    );
  }

  private async withLines(rules: any[]): Promise<Rule[]> {
    if (!rules.length) return [];
    const lines = await this.db.query(
      `SELECT id, rule_id AS "ruleId", line_no AS "lineNo", side, account_source AS "accountSource", account_id AS "accountId",
              amount_key AS "amountKey", dimension_policy AS "dimensionPolicy", description_template AS "descriptionTemplate"
         FROM acc.posting_rule_lines WHERE rule_id = ANY($1::uuid[]) ORDER BY line_no`,
      [rules.map((r) => r.id)],
    );
    return rules.map((r) => ({ ...r, lines: lines.filter((l: any) => l.ruleId === r.id) }));
  }

  async list(companyId: string, eventCode?: string) {
    const params: unknown[] = [companyId];
    let where = 'r.company_id = $1';
    if (eventCode) {
      params.push(eventCode);
      where += ' AND r.event_code = $2';
    }
    const rules = await this.db.query(`SELECT ${RULE_COLS} FROM acc.posting_rules r WHERE ${where} ORDER BY r.event_code, r.priority`, params);
    return this.withLines(rules);
  }

  async get(companyId: string, id: string): Promise<Rule> {
    const r = await this.db.one(`SELECT ${RULE_COLS} FROM acc.posting_rules r WHERE r.company_id = $1 AND r.id = $2`, [companyId, id]);
    if (!r) throw new NotFoundError('PostingRule', id);
    return (await this.withLines([r]))[0];
  }

  private async validate(companyId: string, eventCode: string, lines: z.infer<typeof RuleLineSchema>[]) {
    const ev = await this.db.one<{ amount_keys: string[]; account_sources: string[] }>(
      'SELECT amount_keys, account_sources FROM acc.posting_events WHERE code = $1',
      [eventCode],
    );
    if (!ev) throw new DomainError('UNKNOWN_POSTING_EVENT', `Unknown posting event ${eventCode}`);
    const sides = new Set(lines.map((l) => l.side));
    if (sides.size < 2) throw new DomainError('RULE_NEEDS_BOTH_SIDES', 'A rule must have at least one debit and one credit line');
    const nos = new Set<number>();
    for (const l of lines) {
      if (nos.has(l.lineNo)) throw new DomainError('RULE_DUPLICATE_LINE_NO');
      nos.add(l.lineNo);
      if (l.accountSource === 'FIXED' && !l.accountId) throw new DomainError('RULE_FIXED_ACCOUNT_REQUIRED', `Line ${l.lineNo}: account required`);
      if (l.accountSource !== 'FIXED' && !ev.account_sources.includes(l.accountSource)) {
        throw new DomainError('RULE_ACCOUNT_SOURCE_NOT_ALLOWED', `Line ${l.lineNo}: ${l.accountSource} is not valid for ${eventCode}`);
      }
      if (ev.amount_keys.length && !ev.amount_keys.includes(l.amountKey)) {
        throw new DomainError('RULE_AMOUNT_KEY_INVALID', `Line ${l.lineNo}: amount key must be one of ${ev.amount_keys.join(', ')}`);
      }
      if (l.accountId) {
        const a = await this.db.one<{ is_posting: boolean; is_active: boolean }>(
          'SELECT is_posting, is_active FROM acc.accounts WHERE company_id = $1 AND id = $2',
          [companyId, l.accountId],
        );
        if (!a) throw new DomainError('ACCOUNT_NOT_FOUND', `Line ${l.lineNo}: account not found`);
        if (!a.is_posting || !a.is_active) throw new DomainError('NON_POSTING_ACCOUNT', `Line ${l.lineNo}: header or inactive account`);
      }
    }
  }

  private async writeLines(companyId: string, ruleId: string, lines: z.infer<typeof RuleLineSchema>[]) {
    await this.db.query('DELETE FROM acc.posting_rule_lines WHERE rule_id = $1', [ruleId]);
    for (const l of lines) {
      await this.db.query(
        `INSERT INTO acc.posting_rule_lines(rule_id, company_id, line_no, side, account_source, account_id, amount_key,
                                            dimension_policy, description_template)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [ruleId, companyId, l.lineNo, l.side, l.accountSource, l.accountSource === 'FIXED' ? l.accountId : l.accountId ?? null,
          l.amountKey, l.dimensionPolicy, l.descriptionTemplate ?? null],
      );
    }
  }

  async create(companyId: string, input: RuleCreateInput) {
    return this.db.tx(async () => {
      await this.validate(companyId, input.eventCode, input.lines);
      const r = await this.db.one<{ id: string }>(
        `INSERT INTO acc.posting_rules(company_id, event_code, name, ledger, conditions, priority, effective_from, effective_to,
                                       is_active, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [companyId, input.eventCode, input.name, input.ledger, JSON.stringify(input.conditions), input.priority, input.effectiveFrom,
          input.effectiveTo ?? null, input.isActive],
      );
      await this.writeLines(companyId, r!.id, input.lines);
      return this.get(companyId, r!.id);
    });
  }

  /**
   * Rules already used by posted entries keep their history: changing the
   * account determination of a used rule is rejected – end-date it and create a
   * new version instead (effective dating).
   */
  async update(companyId: string, id: string, input: z.infer<typeof RuleUpdate>) {
    return this.db.tx(async () => {
      const current = await this.get(companyId, id);
      const used = await this.db.one('SELECT 1 FROM acc.journal_entries WHERE posting_rule_id = $1 LIMIT 1', [id]);
      if (used && (input.lines || input.conditions || input.ledger || input.effectiveFrom)) {
        throw new DomainError('RULE_IN_USE', 'Rule has posted entries; set an end date and create a new version', HttpStatus.CONFLICT);
      }
      if (input.lines) await this.validate(companyId, current.eventCode, input.lines);
      const params: unknown[] = [companyId, id];
      const sets: string[] = [];
      const map: Record<string, string> = {
        name: 'name', ledger: 'ledger', priority: 'priority', effectiveFrom: 'effective_from', effectiveTo: 'effective_to', isActive: 'is_active',
      };
      for (const [f, c] of Object.entries(map)) {
        const v = (input as Record<string, unknown>)[f];
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${c} = $${params.length}`);
      }
      if (input.conditions) {
        params.push(JSON.stringify(input.conditions));
        sets.push(`conditions = $${params.length}`);
      }
      if (sets.length) {
        let ver = '';
        if (input.rowVersion !== undefined) {
          params.push(input.rowVersion);
          ver = ` AND row_version = $${params.length}`;
        }
        const r = await this.db.query(`UPDATE acc.posting_rules SET ${sets.join(', ')} WHERE company_id = $1 AND id = $2${ver} RETURNING id`, params);
        if (!r.length) throw new ConflictError('VERSION_CONFLICT');
      }
      if (input.lines) await this.writeLines(companyId, id, input.lines);
      return this.get(companyId, id);
    });
  }

  async remove(companyId: string, id: string) {
    await this.db.tx(async () => {
      await this.get(companyId, id);
      if (await this.db.one('SELECT 1 FROM acc.journal_entries WHERE posting_rule_id = $1 LIMIT 1', [id])) {
        throw new DomainError('RULE_IN_USE', 'Rule has entries; deactivate it instead', HttpStatus.CONFLICT);
      }
      await this.db.query('DELETE FROM acc.posting_rules WHERE id = $1', [id]);
    });
  }

  /**
   * Selects the applicable rule: active, effective on the date, conditions match;
   * lowest priority number first, then the most specific (most condition keys).
   */
  async select(companyId: string, eventCode: string, date: string, context: Record<string, unknown>): Promise<Rule> {
    const rules = await this.db.query(
      `SELECT ${RULE_COLS} FROM acc.posting_rules r
        WHERE r.company_id = $1 AND r.event_code = $2 AND r.is_active
          AND r.effective_from <= $3 AND (r.effective_to IS NULL OR r.effective_to >= $3)
        ORDER BY r.priority ASC`,
      [companyId, eventCode, date],
    );
    const candidates = rules
      .filter((r: any) => conditionsMatch(r.conditions ?? {}, context))
      .sort((a: any, b: any) => a.priority - b.priority || Object.keys(b.conditions).length - Object.keys(a.conditions).length);
    if (!candidates.length) {
      throw new DomainError('POSTING_RULE_MISSING', `No active posting rule for ${eventCode} on ${date}`, HttpStatus.UNPROCESSABLE_ENTITY, {
        eventCode,
        date,
        context,
      });
    }
    return (await this.withLines([candidates[0]]))[0];
  }
}
