import { HttpStatus, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { DbService } from '../../../infrastructure/db/db.service';
import { ConflictError, DomainError, NotFoundError } from '../../../shared/errors';
import { decimalString, isoDate, ListQuery, offset, orderBy, Page } from '../../../shared/http/common';

// ------------------------------------------------------------------ schemas
export const CompanyCreate = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  legalName: z.string().trim().max(300).nullable().optional(),
  taxNumber: z.string().trim().max(50).nullable().optional(),
  commercialReg: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  countryCode: z.string().trim().length(2).toUpperCase().nullable().optional(),
  timezone: z.string().trim().min(3).max(64).default('Africa/Cairo'),
  baseCurrency: z.string().trim().length(3).toUpperCase(),
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
});
export const CompanyUpdate = CompanyCreate.omit({ code: true }).partial().extend({ rowVersion: z.number().int().optional() });

export const ExchangeRateCreate = z.object({
  fromCurrency: z.string().trim().length(3).toUpperCase(),
  toCurrency: z.string().trim().length(3).toUpperCase(),
  rateType: z.enum(['SPOT', 'MONTHLY_AVG', 'CLOSING']).default('SPOT'),
  rateDate: isoDate,
  rate: decimalString.refine((v) => Number(v) > 0, 'Rate must be positive'),
  source: z.string().trim().max(100).nullable().optional(),
});
export const ExchangeRateUpdate = z.object({
  rate: decimalString.refine((v) => Number(v) > 0, 'Rate must be positive'),
  source: z.string().trim().max(100).nullable().optional(),
  rowVersion: z.number().int().optional(),
});

export const HolidayCreate = z.object({ holidayDate: isoDate, name: z.string().trim().min(1).max(200) });
export const TaxRateCreate = z.object({
  ratePct: decimalString.refine((v) => Number(v) >= 0 && Number(v) <= 100),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable().optional(),
});

const COMPANY_COLS = `id, code, name_ar AS "nameAr", name_en AS "nameEn", legal_name AS "legalName", tax_number AS "taxNumber",
  commercial_reg AS "commercialReg", address, country_code AS "countryCode", timezone, base_currency_code AS "baseCurrency",
  fiscal_year_start_month AS "fiscalYearStartMonth", is_active AS "isActive", row_version AS "rowVersion"`;

const COMPANY_FIELDS: Record<string, string> = {
  nameAr: 'name_ar', nameEn: 'name_en', legalName: 'legal_name', taxNumber: 'tax_number', commercialReg: 'commercial_reg',
  address: 'address', countryCode: 'country_code', timezone: 'timezone', baseCurrency: 'base_currency_code',
  fiscalYearStartMonth: 'fiscal_year_start_month',
};

/** Organization structure, currencies, exchange rates, calendars and tax rates. */
@Injectable()
export class CoreService {
  constructor(private readonly db: DbService) {}

  // ------------------------------------------------------------ companies
  async getCompany(id: string) {
    const c = await this.db.one(`SELECT ${COMPANY_COLS} FROM core.companies WHERE id = $1`, [id]);
    if (!c) throw new NotFoundError('Company', id);
    return c;
  }

  async createCompany(input: z.infer<typeof CompanyCreate>) {
    return this.db.tx(async () => {
      const cur = await this.db.one('SELECT 1 FROM core.currencies WHERE code = $1 AND is_active', [input.baseCurrency]);
      if (!cur) throw new DomainError('INVALID_CURRENCY', 'Unknown base currency');
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO core.companies(code, name_ar, name_en, legal_name, tax_number, commercial_reg, address, country_code,
                                    timezone, base_currency_code, fiscal_year_start_month, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, sys.current_user_id(), sys.current_user_id()) RETURNING id`,
        [input.code, input.nameAr, input.nameEn ?? null, input.legalName ?? null, input.taxNumber ?? null,
          input.commercialReg ?? null, input.address ?? null, input.countryCode ?? null, input.timezone,
          input.baseCurrency, input.fiscalYearStartMonth],
      );
      await this.db.query('INSERT INTO core.company_currencies(company_id, currency_code) VALUES ($1, $2)', [row!.id, input.baseCurrency]);
      return this.getCompany(row!.id);
    });
  }

  async updateCompany(id: string, input: z.infer<typeof CompanyUpdate>) {
    return this.db.tx(async () => {
      const params: unknown[] = [id];
      const sets: string[] = [];
      for (const [field, col] of Object.entries(COMPANY_FIELDS)) {
        const v = (input as Record<string, unknown>)[field];
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
      if (sets.length === 0) return this.getCompany(id);
      let ver = '';
      if (input.rowVersion !== undefined) {
        params.push(input.rowVersion);
        ver = ` AND row_version = $${params.length}`;
      }
      const r = await this.db.query(`UPDATE core.companies SET ${sets.join(', ')} WHERE id = $1${ver} RETURNING id`, params);
      if (!r.length) throw new ConflictError('VERSION_CONFLICT');
      if (input.baseCurrency) {
        await this.db.query(
          `INSERT INTO core.company_currencies(company_id, currency_code) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, input.baseCurrency],
        );
      }
      return this.getCompany(id);
    });
  }

  // ------------------------------------------------------------ currencies
  listCurrencies() {
    return this.db.query(
      `SELECT code, name_ar AS "nameAr", name_en AS "nameEn", symbol, decimal_places AS "decimalPlaces"
         FROM core.currencies WHERE is_active ORDER BY code`,
    );
  }

  companyCurrencies(companyId: string) {
    return this.db.query(
      `SELECT c.code, c.name_ar AS "nameAr", c.name_en AS "nameEn", c.symbol, c.decimal_places AS "decimalPlaces",
              (c.code = co.base_currency_code) AS "isBase"
         FROM core.company_currencies cc
         JOIN core.currencies c ON c.code = cc.currency_code
         JOIN core.companies co ON co.id = cc.company_id
        WHERE cc.company_id = $1 ORDER BY (c.code = co.base_currency_code) DESC, c.code`,
      [companyId],
    );
  }

  async enableCurrency(companyId: string, code: string) {
    await this.db.tx(async () => {
      const cur = await this.db.one('SELECT 1 FROM core.currencies WHERE code = $1 AND is_active', [code]);
      if (!cur) throw new DomainError('INVALID_CURRENCY', `Unknown currency ${code}`);
      await this.db.query(
        'INSERT INTO core.company_currencies(company_id, currency_code) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [companyId, code],
      );
    });
    return this.companyCurrencies(companyId);
  }

  async disableCurrency(companyId: string, code: string) {
    await this.db.tx(async () => {
      const base = await this.db.one('SELECT 1 FROM core.companies WHERE id = $1 AND base_currency_code = $2', [companyId, code]);
      if (base) throw new DomainError('BASE_CURRENCY_REQUIRED', 'The base currency cannot be disabled');
      const used = await this.db.one(
        `SELECT 1 FROM acc.journal_lines WHERE company_id = $1 AND currency_code = $2 LIMIT 1`,
        [companyId, code],
      );
      if (used) throw new DomainError('CURRENCY_IN_USE', 'Currency has transactions', HttpStatus.CONFLICT);
      await this.db.query('DELETE FROM core.company_currencies WHERE company_id = $1 AND currency_code = $2', [companyId, code]);
    });
  }

  private async assertCompanyCurrency(companyId: string, code: string) {
    const r = await this.db.one('SELECT 1 FROM core.company_currencies WHERE company_id = $1 AND currency_code = $2', [companyId, code]);
    if (!r) throw new DomainError('CURRENCY_NOT_ENABLED', `Currency ${code} is not enabled for this company`);
  }

  // ------------------------------------------------------------ exchange rates
  async listRates(companyId: string, q: ListQuery & Record<string, unknown>): Promise<Page<any>> {
    const where = ['company_id = $1'];
    const params: unknown[] = [companyId];
    for (const [k, col] of [['fromCurrency', 'from_currency'], ['toCurrency', 'to_currency'], ['rateType', 'rate_type']] as const) {
      if (typeof q[k] === 'string' && q[k]) {
        params.push(String(q[k]).toUpperCase());
        where.push(`${col} = $${params.length}`);
      }
    }
    if (typeof q.dateFrom === 'string') {
      params.push(q.dateFrom);
      where.push(`rate_date >= $${params.length}`);
    }
    if (typeof q.dateTo === 'string') {
      params.push(q.dateTo);
      where.push(`rate_date <= $${params.length}`);
    }
    const w = where.join(' AND ');
    const total = await this.db.one<{ n: string }>(`SELECT count(*) n FROM core.exchange_rates WHERE ${w}`, params);
    const data = await this.db.query(
      `SELECT id, from_currency AS "fromCurrency", to_currency AS "toCurrency", rate_type AS "rateType",
              rate_date AS "rateDate", rate, source, row_version AS "rowVersion", created_at AS "createdAt"
         FROM core.exchange_rates WHERE ${w}
        ORDER BY ${orderBy(q.sort, { rateDate: 'rate_date', fromCurrency: 'from_currency' }, 'rate_date DESC, from_currency')}
        LIMIT ${q.pageSize} OFFSET ${offset(q)}`,
      params,
    );
    return { data, meta: { page: q.page, pageSize: q.pageSize, total: Number(total?.n ?? 0) } };
  }

  async createRate(companyId: string, input: z.infer<typeof ExchangeRateCreate>) {
    return this.db.tx(async () => {
      if (input.fromCurrency === input.toCurrency) throw new DomainError('INVALID_CURRENCY_PAIR');
      await this.assertCompanyCurrency(companyId, input.fromCurrency);
      await this.assertCompanyCurrency(companyId, input.toCurrency);
      return this.db.one(
        `INSERT INTO core.exchange_rates(company_id, from_currency, to_currency, rate_type, rate_date, rate, source, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7, sys.current_user_id(), sys.current_user_id())
         RETURNING id, from_currency AS "fromCurrency", to_currency AS "toCurrency", rate_type AS "rateType",
                   rate_date AS "rateDate", rate, source, row_version AS "rowVersion"`,
        [companyId, input.fromCurrency, input.toCurrency, input.rateType, input.rateDate, input.rate, input.source ?? null],
      );
    });
  }

  /**
   * Rates can be corrected; historical transactions are unaffected because every
   * transaction stores its own rate and base amount at the time it was recorded.
   */
  async updateRate(companyId: string, id: string, input: z.infer<typeof ExchangeRateUpdate>) {
    return this.db.tx(async () => {
      const params: unknown[] = [companyId, id, input.rate, input.source ?? null];
      let ver = '';
      if (input.rowVersion !== undefined) {
        params.push(input.rowVersion);
        ver = ` AND row_version = $5`;
      }
      const r = await this.db.one(
        `UPDATE core.exchange_rates SET rate = $3, source = $4 WHERE company_id = $1 AND id = $2${ver}
         RETURNING id, from_currency AS "fromCurrency", to_currency AS "toCurrency", rate_type AS "rateType",
                   rate_date AS "rateDate", rate, source, row_version AS "rowVersion"`,
        params,
      );
      if (!r) throw new NotFoundError('ExchangeRate', id);
      return r;
    });
  }

  async deleteRate(companyId: string, id: string) {
    await this.db.tx(async () => {
      const r = await this.db.query('DELETE FROM core.exchange_rates WHERE company_id = $1 AND id = $2 RETURNING id', [companyId, id]);
      if (!r.length) throw new NotFoundError('ExchangeRate', id);
    });
  }

  // ------------------------------------------------------------ holidays
  private async assertCalendar(companyId: string, calendarId: string) {
    const r = await this.db.one('SELECT 1 FROM core.work_calendars WHERE company_id = $1 AND id = $2', [companyId, calendarId]);
    if (!r) throw new NotFoundError('WorkCalendar', calendarId);
  }

  async listHolidays(companyId: string, calendarId: string) {
    await this.assertCalendar(companyId, calendarId);
    return this.db.query(
      `SELECT id, holiday_date AS "holidayDate", name FROM core.holidays WHERE calendar_id = $1 ORDER BY holiday_date`,
      [calendarId],
    );
  }

  async addHoliday(companyId: string, calendarId: string, input: z.infer<typeof HolidayCreate>) {
    return this.db.tx(async () => {
      await this.assertCalendar(companyId, calendarId);
      return this.db.one(
        `INSERT INTO core.holidays(calendar_id, holiday_date, name) VALUES ($1,$2,$3)
         RETURNING id, holiday_date AS "holidayDate", name`,
        [calendarId, input.holidayDate, input.name],
      );
    });
  }

  async removeHoliday(companyId: string, calendarId: string, id: string) {
    await this.db.tx(async () => {
      await this.assertCalendar(companyId, calendarId);
      const r = await this.db.query('DELETE FROM core.holidays WHERE calendar_id = $1 AND id = $2 RETURNING id', [calendarId, id]);
      if (!r.length) throw new NotFoundError('Holiday', id);
    });
  }

  // ------------------------------------------------------------ tax rates
  private async assertTaxCode(companyId: string, taxCodeId: string) {
    const r = await this.db.one('SELECT 1 FROM core.tax_codes WHERE company_id = $1 AND id = $2', [companyId, taxCodeId]);
    if (!r) throw new NotFoundError('TaxCode', taxCodeId);
  }

  async listTaxRates(companyId: string, taxCodeId: string) {
    await this.assertTaxCode(companyId, taxCodeId);
    return this.db.query(
      `SELECT id, rate_pct AS "ratePct", effective_from AS "effectiveFrom", effective_to AS "effectiveTo"
         FROM core.tax_rates WHERE tax_code_id = $1 ORDER BY effective_from DESC`,
      [taxCodeId],
    );
  }

  async addTaxRate(companyId: string, taxCodeId: string, input: z.infer<typeof TaxRateCreate>) {
    return this.db.tx(async () => {
      await this.assertTaxCode(companyId, taxCodeId);
      return this.db.one(
        `INSERT INTO core.tax_rates(tax_code_id, rate_pct, effective_from, effective_to) VALUES ($1,$2,$3,$4)
         RETURNING id, rate_pct AS "ratePct", effective_from AS "effectiveFrom", effective_to AS "effectiveTo"`,
        [taxCodeId, input.ratePct, input.effectiveFrom, input.effectiveTo ?? null],
      );
    });
  }

  /** Effective tax rate on a date (strict: missing rate is an error). */
  async taxRateOn(companyId: string, taxCodeId: string, date: string): Promise<string> {
    await this.assertTaxCode(companyId, taxCodeId);
    const r = await this.db.one<{ rate_pct: string }>(
      `SELECT rate_pct FROM core.tax_rates WHERE tax_code_id = $1 AND effective_from <= $2
          AND (effective_to IS NULL OR effective_to >= $2)`,
      [taxCodeId, date],
    );
    if (!r) throw new DomainError('TAX_RATE_MISSING', `No tax rate for ${date}`);
    return r.rate_pct;
  }
}
