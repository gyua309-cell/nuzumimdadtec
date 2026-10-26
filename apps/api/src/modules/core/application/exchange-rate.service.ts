import { Injectable } from '@nestjs/common';
import { DbService } from '../../../infrastructure/db/db.service';
import { D, Decimal } from '../../../shared/money';
import { DomainError } from '../../../shared/errors';

export type RateType = 'SPOT' | 'MONTHLY_AVG' | 'CLOSING';

export interface ResolvedRate {
  rate: Decimal;
  rateId: string | null;
  rateDate: string | null;
  inverse: boolean;
}

/**
 * Exchange-rate resolution. Strict: if no rate exists on/before the date for the
 * requested type, the operation fails (EXCHANGE_RATE_MISSING) – the system never
 * silently uses a default/current rate. Inverse pairs are supported.
 */
@Injectable()
export class ExchangeRateService {
  constructor(private readonly db: DbService) {}

  async baseCurrency(companyId: string): Promise<{ code: string; decimals: number }> {
    const r = await this.db.one<{ code: string; decimals: number }>(
      `SELECT c.base_currency_code AS code, cur.decimal_places AS decimals
         FROM core.companies c JOIN core.currencies cur ON cur.code = c.base_currency_code WHERE c.id = $1`,
      [companyId],
    );
    if (!r) throw new DomainError('COMPANY_NOT_FOUND');
    return r;
  }

  async currencyDecimals(code: string): Promise<number> {
    const r = await this.db.one<{ decimal_places: number }>('SELECT decimal_places FROM core.currencies WHERE code = $1', [code]);
    if (!r) throw new DomainError('INVALID_CURRENCY', `Unknown currency ${code}`);
    return r.decimal_places;
  }

  async getRate(companyId: string, from: string, to: string, date: string, type: RateType = 'SPOT'): Promise<ResolvedRate> {
    if (from === to) return { rate: D(1), rateId: null, rateDate: null, inverse: false };
    const direct = await this.db.one<{ id: string; rate: string; rate_date: string }>(
      `SELECT id, rate, rate_date FROM core.exchange_rates
        WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3 AND rate_type = $4 AND rate_date <= $5
        ORDER BY rate_date DESC LIMIT 1`,
      [companyId, from, to, type, date],
    );
    if (direct) return { rate: D(direct.rate), rateId: direct.id, rateDate: direct.rate_date, inverse: false };
    const inv = await this.db.one<{ id: string; rate: string; rate_date: string }>(
      `SELECT id, rate, rate_date FROM core.exchange_rates
        WHERE company_id = $1 AND from_currency = $3 AND to_currency = $2 AND rate_type = $4 AND rate_date <= $5
        ORDER BY rate_date DESC LIMIT 1`,
      [companyId, from, to, type, date],
    );
    if (inv) {
      return { rate: D(1).div(inv.rate).toDecimalPlaces(10), rateId: inv.id, rateDate: inv.rate_date, inverse: true };
    }
    throw new DomainError('EXCHANGE_RATE_MISSING', `No ${type} rate ${from}->${to} on or before ${date}`, undefined, {
      from,
      to,
      date,
      type,
    });
  }

  /** Rate from a currency into the company's base currency. */
  async toBase(companyId: string, currency: string, date: string, type: RateType = 'SPOT'): Promise<ResolvedRate> {
    const base = await this.baseCurrency(companyId);
    return this.getRate(companyId, currency, base.code, date, type);
  }
}
