import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, Page } from './api';
import { useBaseCurrency } from './auth';

export interface ReportCurrencyOption {
  code: string;
  nameAr: string;
  symbol?: string;
  isBase?: boolean;
}

export interface ReportCurrencyHelper {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  hasExplicitRate: boolean;
  isConverted: boolean;
  currencies: ReportCurrencyOption[];
  convert: (amountInBase: number | string | null | undefined) => number;
  formatMoney: (amountInBase: number | string | null | undefined) => string;
  rateLabel: string;
}

const DEFAULT_CURRENCY_NAMES: Record<string, string> = {
  SAR: 'ريال سعودي (الأساسية)',
  USD: 'دولار أمريكي',
  EGP: 'جنيه مصري',
  AED: 'درهم إماراتي',
  EUR: 'يورو أوروبي',
  GBP: 'جنيه إسترليني',
};

export function resolveReportFxRate(
  rateRows: any[],
  baseCurrency: string,
  targetCurrency: string,
  asOfDate?: string,
): { rate: number; hasExplicitRate: boolean } {
  const from = (baseCurrency || 'SAR').toUpperCase();
  const to = (targetCurrency || from).toUpperCase();
  if (from === to) return { rate: 1, hasExplicitRate: true };

  const sorted = [...rateRows].sort((a, b) =>
    String(b.effectiveDate || b.updatedAt || '').localeCompare(String(a.effectiveDate || a.updatedAt || '')),
  );
  const eligible = asOfDate
    ? sorted.filter((r) => !r.effectiveDate || String(r.effectiveDate).slice(0, 10) <= asOfDate.slice(0, 10))
    : sorted;
  const pool = eligible.length > 0 ? eligible : sorted;

  const direct = pool.find(
    (r) => String(r.fromCurrency).toUpperCase() === from && String(r.toCurrency).toUpperCase() === to && Number(r.rate) > 0,
  );
  if (direct) return { rate: Number(direct.rate), hasExplicitRate: true };

  const inverse = pool.find(
    (r) => String(r.fromCurrency).toUpperCase() === to && String(r.toCurrency).toUpperCase() === from && Number(r.rate) > 0,
  );
  if (inverse) return { rate: 1 / Number(inverse.rate), hasExplicitRate: true };

  return { rate: 1, hasExplicitRate: false };
}

export function formatReportCurrency(amount: number, currencyCode: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
}

export function useReportCurrency(currencyCode?: string, asOfDate?: string): ReportCurrencyHelper {
  const baseCurrency = (useBaseCurrency() || 'SAR').toUpperCase();
  const targetCurrency = (currencyCode || baseCurrency).toUpperCase();

  const qCurrencies = useQuery({
    queryKey: ['report-fx-currencies'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<any[]>('/company-currencies'),
  });
  const qRates = useQuery({
    queryKey: ['report-fx-rates'],
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Page<any>>('/exchange-rates', { pageSize: 200 }),
  });

  const currencies = useMemo<ReportCurrencyOption[]>(() => {
    const raw: any[] = Array.isArray(qCurrencies.data) ? qCurrencies.data : ((qCurrencies.data as any)?.data ?? []);
    const map = new Map<string, ReportCurrencyOption>();
    map.set(baseCurrency, { code: baseCurrency, nameAr: DEFAULT_CURRENCY_NAMES[baseCurrency] || baseCurrency, isBase: true });
    for (const c of raw) {
      const code = String(c.currencyCode || c.code || '').toUpperCase();
      if (!code) continue;
      map.set(code, {
        code,
        nameAr: c.nameAr || DEFAULT_CURRENCY_NAMES[code] || code,
        symbol: c.symbol,
        isBase: Boolean(c.isBase) || code === baseCurrency,
      });
    }
    const rateRows: any[] = Array.isArray(qRates.data) ? qRates.data : (qRates.data?.data ?? []);
    for (const r of rateRows) {
      for (const code of [String(r.fromCurrency || '').toUpperCase(), String(r.toCurrency || '').toUpperCase()]) {
        if (code && !map.has(code)) {
          map.set(code, { code, nameAr: DEFAULT_CURRENCY_NAMES[code] || code });
        }
      }
    }
    return Array.from(map.values());
  }, [qCurrencies.data, qRates.data, baseCurrency]);

  const { rate, hasExplicitRate } = useMemo(() => {
    const rateRows: any[] = Array.isArray(qRates.data) ? qRates.data : (qRates.data?.data ?? []);
    return resolveReportFxRate(rateRows, baseCurrency, targetCurrency, asOfDate);
  }, [qRates.data, baseCurrency, targetCurrency, asOfDate]);

  return useMemo(() => {
    const isConverted = targetCurrency !== baseCurrency && rate > 0;
    const convert = (val: number | string | null | undefined): number => {
      const num = Number(val ?? 0);
      if (!Number.isFinite(num)) return 0;
      return Math.round(num * rate * 100) / 100;
    };
    const formatMoney = (val: number | string | null | undefined): string =>
      formatReportCurrency(convert(val), targetCurrency);
    const rateLabel = targetCurrency === baseCurrency
      ? `${baseCurrency} (عملة الأساس)`
      : hasExplicitRate
        ? `1 ${baseCurrency} = ${rate.toFixed(4)} ${targetCurrency}`
        : `لا يوجد سعر صرف مسجل بين ${baseCurrency} و ${targetCurrency} (معامل 1.0000)`;

    return {
      baseCurrency,
      targetCurrency,
      rate,
      hasExplicitRate,
      isConverted,
      currencies,
      convert,
      formatMoney,
      rateLabel,
    };
  }, [baseCurrency, targetCurrency, rate, hasExplicitRate, currencies]);
}
