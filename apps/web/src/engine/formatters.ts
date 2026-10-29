/**
 * IDHAM ERP - Engine Formatters
 * Strict formatting for accounting numbers, multi-currencies (SAR/EGP/USD),
 * Hijri/Gregorian dates, bilingual Tafqeet, and Formula Injection sanitization.
 */

import Decimal from 'decimal.js';
import { tafqeetArabic, tafqeetEnglish } from '../lib/format';

export type NumberSystem = 'latn' | 'arab'; // 123 vs ١٢٣
export type CalendarType = 'gregorian' | 'hijri' | 'both';
export type NegativeFormat = 'minus' | 'parentheses'; // -100 vs (100)

export interface MoneyFormatOptions {
  currency?: string;
  decimals?: number;
  negativeFormat?: NegativeFormat;
  numberSystem?: NumberSystem;
  showCurrency?: boolean;
}

export interface DateFormatOptions {
  calendar?: CalendarType;
  includeTime?: boolean;
  numberSystem?: NumberSystem;
}

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicDigits(str: string | number): string {
  return String(str).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

export function toEnglishDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

/**
 * Universal Accounting Currency Formatter
 * Complies with Saudi GAAP (SOCPA) & Egyptian Accounting Standards (EAS).
 */
export function formatAccountingMoney(
  amount: string | number | null | undefined,
  opts: MoneyFormatOptions = {}
): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  
  const d = new Decimal(amount);
  const isNeg = d.isNegative();
  const abs = d.abs();
  const decimals = opts.decimals ?? 2;
  const numStr = abs.toFixed(decimals);

  // Group thousands
  const [intPart, fracPart] = numStr.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let formattedNumber = fracPart ? `${formattedInt}.${fracPart}` : formattedInt;

  if (opts.numberSystem === 'arab') {
    formattedNumber = toArabicDigits(formattedNumber);
  }

  // Handle negative representation
  let signedNumber = formattedNumber;
  if (isNeg) {
    signedNumber = opts.negativeFormat === 'parentheses' ? `(${formattedNumber})` : `-${formattedNumber}`;
  }

  if (opts.showCurrency === false) {
    return signedNumber;
  }

  const cur = opts.currency || 'SAR';
  const symbolMap: Record<string, string> = {
    SAR: 'ر.س',
    EGP: 'ج.م',
    USD: '$',
    EUR: '€',
  };
  const sym = symbolMap[cur] || cur;

  return `${signedNumber} ${sym}`;
}

/**
 * Dual Hijri & Gregorian Date Formatter
 */
export function formatSystemDate(
  dateValue: string | Date | null | undefined,
  opts: DateFormatOptions = {}
): string {
  if (!dateValue) return '—';

  const d = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  if (isNaN(d.getTime())) return String(dateValue);

  const cal = opts.calendar || 'gregorian';

  // Gregorian
  const gregFormatter = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(opts.includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
  const gregStr = gregFormatter.format(d).replace(/\//g, '-');

  if (cal === 'gregorian') {
    return opts.numberSystem === 'arab' ? toArabicDigits(gregStr) : gregStr;
  }

  // Hijri (Umm al-Qura)
  let hijriStr = '';
  try {
    const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    hijriStr = hijriFormatter.format(d).replace(/\//g, '-');
  } catch {
    hijriStr = gregStr;
  }

  if (cal === 'hijri') {
    const res = `${hijriStr} هـ`;
    return opts.numberSystem === 'arab' ? toArabicDigits(res) : res;
  }

  // Both
  const combined = `${gregStr} م (${hijriStr} هـ)`;
  return opts.numberSystem === 'arab' ? toArabicDigits(combined) : combined;
}

/**
 * Formula Injection (CSV / Excel Injection) Sanitizer
 * Protects users opening exported files from malicious macros or formulas starting with = + - @ \t \r.
 */
export function sanitizeForSpreadsheet(val: any): any {
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('\t') ||
    trimmed.startsWith('\r')
  ) {
    // Escape with a prepended single quote
    return `'${val}`;
  }
  return val;
}

export { tafqeetArabic, tafqeetEnglish };
