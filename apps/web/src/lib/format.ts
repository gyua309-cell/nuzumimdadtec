import Decimal from 'decimal.js';

/** Amounts arrive as decimal strings: format without converting to JS floats. */
export function money(v: string | number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || v === '') return '—';
  const d = new Decimal(v).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const neg = d.isNegative();
  const [int, frac] = d.abs().toFixed(decimals).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

export function sum(values: Array<string | number | null | undefined>): Decimal {
  return values.reduce<Decimal>((a, v) => (v === null || v === undefined || v === '' ? a : a.plus(new Decimal(v))), new Decimal(0));
}

export const isZero = (v: string | null | undefined) => !v || new Decimal(v).isZero();

export function date(v: string | null | undefined): string {
  if (!v) return '—';
  return v.slice(0, 10);
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = (iso = today()) => `${iso.slice(0, 7)}-01`;
export const yearStart = (iso = today()) => `${iso.slice(0, 4)}-01-01`;

export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Parses CSV text supporting quotes, commas, escaped quotes and CRLF/LF line breaks. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\ufeff/, '').trim();
  if (!clean) return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal.trim());
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.length > 0 && r.some((c) => c !== ''));
}

// ============================================================================
// Tafqeet: Bilingual Number to Words (Arabic & English)
// ============================================================================
const onesAr = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const tensAr = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const teensAr = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const hundredsAr = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function convertUnder1000Ar(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(hundredsAr[h]);
  if (rem > 0) {
    if (rem < 10) {
      parts.push(onesAr[rem]);
    } else if (rem < 20) {
      parts.push(teensAr[rem - 10]);
    } else {
      const u = rem % 10;
      const t = Math.floor(rem / 10);
      if (u > 0) {
        parts.push(`${onesAr[u]} و${tensAr[t]}`);
      } else {
        parts.push(tensAr[t]);
      }
    }
  }
  return parts.join(' و');
}

export function tafqeetArabic(amount: string | number | null | undefined, currency = 'SAR'): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const d = new Decimal(amount);
  if (d.isZero()) return 'صفر';
  const isNeg = d.isNegative();
  const abs = d.abs();
  const [intPartStr, fracPartStr = '0'] = abs.toFixed(2).split('.');
  const intPart = parseInt(intPartStr, 10);
  const fracPart = parseInt(fracPartStr, 10);

  if (intPart === 0 && fracPart === 0) return 'صفر';

  const billions = Math.floor(intPart / 1000000000);
  const millions = Math.floor((intPart % 1000000000) / 1000000);
  const thousands = Math.floor((intPart % 1000000) / 1000);
  const rem = intPart % 1000;

  const parts: string[] = [];

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions <= 10) parts.push(`${convertUnder1000Ar(billions)} مليارات`);
    else parts.push(`${convertUnder1000Ar(billions)} مليار`);
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions <= 10) parts.push(`${convertUnder1000Ar(millions)} ملايين`);
    else parts.push(`${convertUnder1000Ar(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands <= 10) parts.push(`${convertUnder1000Ar(thousands)} آلاف`);
    else parts.push(`${convertUnder1000Ar(thousands)} ألف`);
  }

  if (rem > 0) {
    parts.push(convertUnder1000Ar(rem));
  }

  let currencyNameAr = 'ريال سعودي';
  let subCurrencyNameAr = 'هللة';
  if (currency === 'USD') { currencyNameAr = 'دولار أمريكي'; subCurrencyNameAr = 'سنت'; }
  else if (currency === 'EUR') { currencyNameAr = 'يورو'; subCurrencyNameAr = 'سنت'; }
  else if (currency === 'EGP') { currencyNameAr = 'جنيه مصري'; subCurrencyNameAr = 'قرش'; }

  let result = parts.length > 0 ? parts.join(' و') + ` ${currencyNameAr}` : '';

  if (fracPart > 0) {
    const fracText = convertUnder1000Ar(fracPart);
    if (result) {
      result += ` و${fracText} ${subCurrencyNameAr}`;
    } else {
      result = `${fracText} ${subCurrencyNameAr}`;
    }
  }

  return `${isNeg ? 'سالب ' : ''}فقط ${result} لا غير`;
}

// English Tafqeet
const onesEn = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tensEn = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertUnder1000En(n: number): string {
  if (n === 0) return '';
  let str = '';
  if (n >= 100) {
    str += onesEn[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 20) {
    str += tensEn[Math.floor(n / 10)] + (n % 10 > 0 ? '-' + onesEn[n % 10] : '');
  } else if (n > 0) {
    str += onesEn[n];
  }
  return str.trim();
}

export function tafqeetEnglish(amount: string | number | null | undefined, currency = 'SAR'): string {
  if (amount === null || amount === undefined || amount === '') return '';
  const d = new Decimal(amount);
  if (d.isZero()) return 'Zero';
  const isNeg = d.isNegative();
  const abs = d.abs();
  const [intPartStr, fracPartStr = '0'] = abs.toFixed(2).split('.');
  const intPart = parseInt(intPartStr, 10);
  const fracPart = parseInt(fracPartStr, 10);

  if (intPart === 0 && fracPart === 0) return 'Zero';

  const billions = Math.floor(intPart / 1000000000);
  const millions = Math.floor((intPart % 1000000000) / 1000000);
  const thousands = Math.floor((intPart % 1000000) / 1000);
  const rem = intPart % 1000;

  const parts: string[] = [];
  if (billions > 0) parts.push(`${convertUnder1000En(billions)} Billion`);
  if (millions > 0) parts.push(`${convertUnder1000En(millions)} Million`);
  if (thousands > 0) parts.push(`${convertUnder1000En(thousands)} Thousand`);
  if (rem > 0) parts.push(convertUnder1000En(rem));

  let currMain = 'Saudi Riyals';
  let currSub = 'Halalas';
  if (currency === 'USD') { currMain = 'US Dollars'; currSub = 'Cents'; }
  else if (currency === 'EUR') { currMain = 'Euros'; currSub = 'Cents'; }
  else if (currency === 'EGP') { currMain = 'Egyptian Pounds'; currSub = 'Piastres'; }

  let mainText = parts.join(' ');
  let result = mainText ? `${mainText} ${currMain}` : '';

  if (fracPart > 0) {
    const subText = convertUnder1000En(fracPart);
    if (result) {
      result += ` and ${subText} ${currSub}`;
    } else {
      result = `${subText} ${currSub}`;
    }
  }

  return `${isNeg ? 'Minus ' : ''}Only ${result} exactly`;
}
