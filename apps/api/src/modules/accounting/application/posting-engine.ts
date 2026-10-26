import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { DomainError } from '../../../shared/errors';
import { allocateLargestRemainder, D } from '../../../shared/money';
import { Dimensions, JournalLineInput } from '../domain/journal';
import { JournalService, JournalType } from './journal.service';
import { PostingRulesService, Rule, RuleLine } from './posting-rules.service';

export type AccountRefs = Record<string, string | null | undefined>;
export type AccountResolver = (companyId: string, refs: AccountRefs, line: RuleLine) => Promise<string | null>;

export interface PostingSplit {
  weight: string;
  dims: Dimensions;
  allocationBucket?: 'PROJECT' | 'UNUTILIZED' | 'NONE';
}

export interface PostingItem {
  /** amount key referenced by rule lines (e.g. AMOUNT, NET, TAX, GROSS) */
  key: string;
  /** amount in the transaction currency; negative values post on the opposite side */
  amount: string;
  dims?: Dimensions;
  /** inputs for account resolvers (componentId, clientId, bankAccountId, taxCodeId, accountId ...) */
  refs?: AccountRefs;
  /** used by SPLIT_BY_ALLOCATION lines */
  split?: PostingSplit[];
  allocationBucket?: 'PROJECT' | 'UNUTILIZED' | 'NONE';
  revenueType?: 'NORMAL' | 'RETRO' | 'ADJUSTMENT' | null;
  taxCodeId?: string | null;
  taxBaseAmount?: string | null;
  description?: string | null;
  sourceLineRef?: string | null;
}

export interface PostingRequest {
  eventCode: string;
  entryDate: string;
  fiscalPeriodId?: string | null;
  journalType: JournalType;
  description: string;
  reference?: string | null;
  sourceModule: string;
  sourceType: string;
  sourceId: string;
  currencyCode: string;
  /** rate fixed by the source document; resolved by date when omitted */
  exchangeRate?: string | null;
  /** attributes used to match rule conditions (e.g. componentType, employeeType) */
  context?: Record<string, unknown>;
  items: PostingItem[];
}

/**
 * Registry of account resolvers per account source. Each business module
 * registers the resolvers it owns (cost components, clients, asset categories…),
 * so account determination always comes from configuration, never from code.
 */
@Injectable()
export class AccountResolverRegistry {
  private readonly resolvers = new Map<string, AccountResolver>();

  constructor(private readonly db: DbService) {
    this.register('FROM_PAYLOAD', async (_c, refs) => refs.accountId ?? null);
    this.register('FROM_BANK', async (companyId, refs) => {
      if (!refs.bankAccountId) return null;
      const r = await this.db.one<{ gl_account_id: string }>(
        'SELECT gl_account_id FROM acc.bank_accounts WHERE company_id = $1 AND id = $2 AND is_active',
        [companyId, refs.bankAccountId],
      );
      return r?.gl_account_id ?? null;
    });
    this.register('FROM_TAX_CODE', async (companyId, refs) => {
      if (!refs.taxCodeId) return null;
      const r = await this.db.one<{ account_id: string | null }>(
        'SELECT account_id FROM core.tax_codes WHERE company_id = $1 AND id = $2',
        [companyId, refs.taxCodeId],
      );
      return r?.account_id ?? null;
    });
  }

  register(source: string, resolver: AccountResolver): void {
    this.resolvers.set(source, resolver);
  }

  async resolve(companyId: string, line: RuleLine, refs: AccountRefs): Promise<string> {
    if (line.accountSource === 'FIXED') return line.accountId!;
    const fn = this.resolvers.get(line.accountSource);
    if (!fn) throw new DomainError('ACCOUNT_RESOLVER_MISSING', `No resolver registered for ${line.accountSource}`);
    const id = (await fn(companyId, refs, line)) ?? line.accountId ?? null;
    if (!id) {
      throw new DomainError('ACCOUNT_DETERMINATION_FAILED', `Cannot determine account (${line.accountSource}) for rule line ${line.lineNo}`, 422, {
        accountSource: line.accountSource,
        refs,
      });
    }
    return id;
  }
}

function applyPolicy(policy: RuleLine['dimensionPolicy'], dims: Dimensions = {}): Dimensions {
  switch (policy) {
    case 'NONE':
      return {};
    case 'EMPLOYEE_ONLY':
      return { employeeId: dims.employeeId, branchId: dims.branchId, departmentId: dims.departmentId, costCenterId: dims.costCenterId };
    case 'PARTY_ONLY':
      return { clientId: dims.clientId, supplierId: dims.supplierId, branchId: dims.branchId };
    default:
      return { ...dims };
  }
}

/**
 * Posting Engine: business event + payload -> rule selection -> account
 * determination -> dimension policy / allocation split -> balanced journal
 * entry (FX conversion and rounding by the JournalService) -> posted atomically.
 */
@Injectable()
export class PostingEngine {
  constructor(
    private readonly db: DbService,
    private readonly rules: PostingRulesService,
    private readonly resolvers: AccountResolverRegistry,
    private readonly journal: JournalService,
  ) {}

  private async currencyDecimals(code: string): Promise<number> {
    const r = await this.db.one<{ decimal_places: number }>('SELECT decimal_places FROM core.currencies WHERE code = $1', [code]);
    if (!r) throw new DomainError('INVALID_CURRENCY', `Unknown currency ${code}`);
    return Number(r.decimal_places);
  }

  /** Builds journal lines from the rule (no persistence). */
  async buildLines(companyId: string, req: PostingRequest, rule: Rule): Promise<JournalLineInput[]> {
    const decimals = await this.currencyDecimals(req.currencyCode);
    const out: JournalLineInput[] = [];
    let dr = D(0);
    let cr = D(0);
    for (const rl of rule.lines) {
      const items = req.items.filter((i) => i.key === rl.amountKey && !D(i.amount).isZero());
      for (const item of items) {
        const accountId = await this.resolvers.resolve(companyId, rl, item.refs ?? {});
        const amount = D(item.amount);
        const side = amount.isNegative() ? (rl.side === 'DEBIT' ? 'CREDIT' : 'DEBIT') : rl.side;
        const abs = amount.abs();
        const parts: { amount: string; dims: Dimensions; bucket?: PostingSplit['allocationBucket'] }[] = [];
        if (rl.dimensionPolicy === 'SPLIT_BY_ALLOCATION' && item.split?.length) {
          const shares = allocateLargestRemainder(abs, item.split.map((s) => s.weight), decimals);
          item.split.forEach((s, i) => {
            if (!shares[i].isZero()) {
              parts.push({ amount: shares[i].toFixed(decimals), dims: { ...(item.dims ?? {}), ...s.dims }, bucket: s.allocationBucket });
            }
          });
        } else {
          parts.push({ amount: abs.toFixed(decimals), dims: applyPolicy(rl.dimensionPolicy, item.dims) });
        }
        for (const p of parts) {
          if (side === 'DEBIT') dr = dr.plus(p.amount);
          else cr = cr.plus(p.amount);
          out.push({
            ...p.dims,
            accountId,
            debit: side === 'DEBIT' ? p.amount : null,
            credit: side === 'CREDIT' ? p.amount : null,
            currencyCode: req.currencyCode,
            exchangeRate: req.exchangeRate ?? null,
            allocationBucket: p.bucket ?? item.allocationBucket ?? 'NONE',
            revenueType: item.revenueType ?? null,
            taxCodeId: item.taxCodeId ?? null,
            taxBaseAmount: item.taxBaseAmount ?? null,
            description: item.description ?? rl.descriptionTemplate ?? null,
            sourceLineRef: item.sourceLineRef ?? null,
          });
        }
      }
    }
    if (!dr.equals(cr)) {
      throw new DomainError('RULE_UNBALANCED', `Rule "${rule.name}" produces debit ${dr.toFixed()} and credit ${cr.toFixed()}`, 422, {
        ruleId: rule.id,
      });
    }
    if (out.length < 2) throw new DomainError('POSTING_NOTHING_TO_POST', 'The event produced no journal lines');
    return out;
  }

  /** Posts the event inside the caller's transaction (or a new one). Returns the journal entry id. */
  async post(companyId: string, req: PostingRequest): Promise<string> {
    return this.db.tx(async () => {
      const rule = await this.rules.select(companyId, req.eventCode, req.entryDate, req.context ?? {});
      const lines = await this.buildLines(companyId, req, rule);
      return this.journal.createAndPost(companyId, {
        entryDate: req.entryDate,
        fiscalPeriodId: req.fiscalPeriodId,
        ledger: rule.ledger,
        journalType: req.journalType,
        description: req.description,
        reference: req.reference,
        currencyCode: req.currencyCode,
        sourceModule: req.sourceModule,
        sourceType: req.sourceType,
        sourceId: req.sourceId,
        postingEvent: req.eventCode,
        postingRuleId: rule.id,
        lines,
      });
    });
  }

  /** Dry run: shows the entry that would be generated (accounts + base amounts) without saving. */
  async simulate(companyId: string, req: PostingRequest) {
    const rule = await this.rules.select(companyId, req.eventCode, req.entryDate, req.context ?? {});
    const lines = await this.buildLines(companyId, req, rule);
    const built = await this.journal.prepareLines(companyId, req.entryDate, req.currencyCode, lines);
    const accounts = await this.db.query<{ id: string; code: string; name_ar: string }>(
      'SELECT id, code, name_ar FROM acc.accounts WHERE id = ANY($1::uuid[])',
      [[...new Set(built.map((l) => l.accountId))]],
    );
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return {
      rule: { id: rule.id, name: rule.name, ledger: rule.ledger },
      lines: built.map((l) => ({ ...l, accountCode: byId.get(l.accountId)?.code, accountNameAr: byId.get(l.accountId)?.name_ar })),
    };
  }
}
