/**
 * IDHAM ERP - Royal Enterprise Export & Print Engine (Royal PDF, Royal ExcelJS, CSV)
 * Produces executive Royal Navy & Gold corporate printouts/PDFs and styled RTL Excel workbooks
 * with true numeric types, live SUM formulas, frozen headers, A4 page setup, Arabic Tafqeet,
 * Executive KPI strips, Official Signatures, and anti-formula injection.
 */

import ExcelJS from 'exceljs';
import { getPlatformAdapter } from './platform-adapter';
import { sanitizeForSpreadsheet } from './formatters';
import { createJob, updateJob } from './jobs-center';
import { getStoredCompany } from '../lib/storage-company';
import { tafqeetArabic } from '../lib/format';

export interface ExportColumnDef {
  key: string;
  header: string;
  width?: number;
  type?: 'text' | 'number' | 'currency' | 'date' | 'percent';
  format?: string;
  isTotal?: boolean; // include in SUM formula footer
}

export interface RoyalKpiItem {
  label: string;
  value: string;
  tone?: 'navy' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'sky';
}

export interface ExportReportOptions {
  title: string;
  filename?: string;
  subtitle?: string;
  branchName?: string;
  currency?: string;
  periodLabel?: string;
  orientation?: 'portrait' | 'landscape';
  columns: ExportColumnDef[];
  data: Array<Record<string, any>>;
  summaryKpis?: RoyalKpiItem[];
  summaryRows?: Array<Record<string, any>>;
  includeHeaderBanner?: boolean;
  sheetName?: string;
  signatureLabels?: [string, string, string];
  notes?: string;
  watermark?: 'NONE' | 'DRAFT' | 'CANCELLED' | 'DUPLICATE';
  additionalSheets?: Array<{
    sheetName: string;
    title: string;
    columns: ExportColumnDef[];
    data: Array<Record<string, any>>;
  }>;
}

export interface RoyalPreviewRequest {
  kind: 'report' | 'detail' | 'element';
  title: string;
  subtitle?: string;
  filename?: string;
  docNo?: string;
  currency?: string;
  orientation?: 'portrait' | 'landscape';
  reportOptions?: ExportReportOptions;
  detailOptions?: RoyalDetailDocumentOptions;
  elementId?: string;
  pageSize?: 'A4' | 'A5';
}

type PreviewListener = (req: RoyalPreviewRequest) => void;
const previewListeners = new Set<PreviewListener>();

export function subscribePrintPreview(fn: PreviewListener): () => void {
  previewListeners.add(fn);
  return () => {
    previewListeners.delete(fn);
  };
}

export interface RoyalDetailSection {
  title: string;
  columns: ExportColumnDef[];
  data: Array<Record<string, any>>;
}

export interface RoyalDetailDocumentOptions {
  title: string;
  subtitle?: string;
  filename?: string;
  docNo?: string;
  docDate?: string;
  statusLabel?: string;
  statusTone?: 'green' | 'amber' | 'red' | 'blue' | 'slate';
  branchName?: string;
  periodLabel?: string;
  currency?: string;
  kpis?: RoyalKpiItem[];
  metaFields?: Array<{ label: string; value: string | number | null | undefined }>;
  sections?: RoyalDetailSection[];
  totalAmountForTafqeet?: number;
  notes?: string;
  signatureLabels?: [string, string, string];
  watermark?: 'NONE' | 'DRAFT' | 'CANCELLED' | 'DUPLICATE';
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNum(val: unknown, decimals = 2): string {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) return String(val ?? '—');
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function kpiAccentStyle(tone?: RoyalKpiItem['tone']): { border: string; text: string; bg: string } {
  switch (tone) {
    case 'emerald':
      return { border: '#10b981', text: '#047857', bg: '#ecfdf5' };
    case 'amber':
      return { border: '#d97706', text: '#b45309', bg: '#fffbeb' };
    case 'rose':
      return { border: '#e11d48', text: '#be123c', bg: '#fff1f2' };
    case 'sky':
      return { border: '#0284c7', text: '#0369a1', bg: '#f0f9ff' };
    case 'indigo':
      return { border: '#4f46e5', text: '#3730a3', bg: '#eef2ff' };
    default:
      return { border: '#0f172a', text: '#0f172a', bg: '#f8fafc' };
  }
}

function renderCompanyLogoHtml(company: any): string {
  if (company?.logoDataUrl) {
    return `<img src="${escapeHtml(company.logoDataUrl)}" alt="logo" style="width:44px;height:44px;border-radius:11px;object-fit:contain;background:#ffffff;padding:3px;border:2px solid #fde68a;flex-shrink:0;" />`;
  }
  return `
    <div style="width:44px;height:44px;border-radius:11px;background:linear-gradient(135deg,#d97706,#f59e0b);color:#0b1224;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:21px;border:2px solid #fde68a;flex-shrink:0;">إ</div>
  `;
}

function renderRoyalHeaderHtml(params: {
  company: any;
  title: string;
  subtitle?: string;
  docRef: string;
  docNo?: string;
  docDate?: string;
  statusLabel?: string;
  statusTone?: string;
  periodLabel?: string;
  branchName?: string;
  currency: string;
  recordCount?: number;
  nowFormatted: string;
  compactContinuation?: boolean;
  pageNo?: number;
  totalPages?: number;
}): string {
  const {
    company, title, subtitle, docRef, docNo, docDate, statusLabel, statusTone,
    periodLabel, branchName, currency, recordCount, nowFormatted, compactContinuation, pageNo, totalPages,
  } = params;

  if (compactContinuation) {
    return `
      <div style="border-radius:10px;overflow:hidden;border:1px solid #0f172a;margin-bottom:12px;">
        <div style="height:4px;width:100%;background:linear-gradient(90deg,#b45309 0%,#f59e0b 50%,#4f46e5 100%);"></div>
        <div style="background:#0f172a;color:#ffffff;padding:8px 14px;display:flex;justify-content:space-between;align-items:center;font-size:10.5px;">
          <div style="font-weight:900;">${escapeHtml(company.nameAr || 'شركة نظم إمداد للتقنية والحلول الرقمية')} — ${escapeHtml(title)}</div>
          <div style="font-family:monospace;color:#fde68a;font-weight:700;">
            ${escapeHtml(docRef)}${pageNo && totalPages ? ` • صفحة ${pageNo} من ${totalPages}` : ''}
          </div>
        </div>
      </div>
    `;
  }

  const statusColors: Record<string, { bg: string; fg: string; bd: string }> = {
    green: { bg: '#059669', fg: '#ffffff', bd: '#34d399' },
    amber: { bg: '#d97706', fg: '#ffffff', bd: '#fbbf24' },
    red: { bg: '#e11d48', fg: '#ffffff', bd: '#fb7185' },
    blue: { bg: '#2563eb', fg: '#ffffff', bd: '#60a5fa' },
    slate: { bg: '#475569', fg: '#ffffff', bd: '#94a3b8' },
  };
  const stStyle = statusColors[statusTone || 'blue'] || statusColors.blue;

  return `
    <div style="border-radius:14px;overflow:hidden;border:1.5px solid #0f172a;margin-bottom:14px;page-break-inside:avoid;">
      <!-- Gold Royal Crown Bar -->
      <div style="height:6px;width:100%;background:linear-gradient(90deg,#b45309 0%,#f59e0b 35%,#4f46e5 70%,#0f172a 100%);"></div>

      <!-- Deep Midnight Navy Executive Banner -->
      <div style="background:linear-gradient(135deg,#0b1224 0%,#17203d 55%,#0f172a 100%);color:#ffffff;padding:13px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <!-- Right: Company Royal Identity -->
        <div style="max-width:42%;">
          <div style="display:flex;align-items:center;gap:10px;">
            ${renderCompanyLogoHtml(company)}
            <div>
              <div style="font-size:14.5px;font-weight:900;color:#ffffff;line-height:1.25;">${escapeHtml(company.nameAr || 'شركة نظم إمداد للتقنية والحلول الرقمية')}</div>
              <div style="font-size:9.5px;color:#cbd5e1;font-weight:700;letter-spacing:0.35px;margin-top:2px;">${escapeHtml(company.nameEn || 'NUZUM IMDAD TECHNOLOGY CO. • IDHAM ERP PRO')}</div>
            </div>
          </div>
          <div style="font-size:9.5px;color:#e2e8f0;margin-top:6px;line-height:1.45;font-weight:600;">
            الرقم الضريبي (VAT): <span style="font-family:monospace;font-weight:800;color:#fbbf24;">${escapeHtml(company.taxNumber || '310123456700003')}</span>
            ${company.commercialReg ? ` &nbsp;|&nbsp; س.ت: <span style="font-family:monospace;font-weight:700;color:#f8fafc;">${escapeHtml(company.commercialReg)}</span>` : ''}
          </div>
        </div>

        <!-- Center: Document Title & Royal Badge -->
        <div style="text-align:center;flex:1;">
          <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1.5px solid rgba(251,191,36,0.65);border-radius:11px;padding:6px 16px;">
            <div style="font-size:13.5px;font-weight:900;color:#ffffff;line-height:1.3;">${escapeHtml(title)}</div>
            ${subtitle ? `<div style="font-size:9.5px;color:#cbd5e1;font-weight:600;margin-top:2px;">${escapeHtml(subtitle)}</div>` : ''}
          </div>
          <div style="margin-top:6px;display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;font-size:9.5px;color:#e2e8f0;font-weight:700;">
            ${docNo ? `<span style="background:rgba(251,191,36,0.18);color:#fde68a;border:1px solid rgba(251,191,36,0.45);padding:2px 8px;border-radius:6px;font-family:monospace;">رقم المستند: ${escapeHtml(docNo)}</span>` : ''}
            ${statusLabel ? `<span style="background:${stStyle.bg};color:${stStyle.fg};border:1px solid ${stStyle.bd};padding:2px 9px;border-radius:6px;font-weight:800;">${escapeHtml(statusLabel)}</span>` : ''}
            ${periodLabel ? `<span>الفترة: ${escapeHtml(periodLabel)}</span>` : ''}
          </div>
        </div>

        <!-- Left: Meta Control Box -->
        <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(148,163,184,0.3);border-radius:10px;padding:7px 11px;font-size:9.5px;color:#e2e8f0;line-height:1.6;min-width:160px;text-align:right;">
          <div>المرجع: <span style="font-family:monospace;font-weight:800;color:#fbbf24;">${escapeHtml(docRef)}</span></div>
          <div>التاريخ: <span style="font-weight:800;color:#ffffff;">${escapeHtml(docDate || nowFormatted)}</span></div>
          <div>الفرع: <span style="font-weight:700;color:#ffffff;">${escapeHtml(branchName || 'المقر الرئيسي')}</span></div>
          <div>العملة: <span style="font-family:monospace;font-weight:800;color:#34d399;">${escapeHtml(currency)}</span>${recordCount !== undefined ? ` &nbsp;•&nbsp; السجلات: <b style="color:#ffffff;">${recordCount}</b>` : ''}</div>
        </div>
      </div>
    </div>
  `;
}

function renderRoyalTableHtml(
  columns: ExportColumnDef[],
  data: Array<Record<string, any>>,
  currency: string,
  opts?: { showTotalsFooter?: boolean; overrideTotals?: Record<string, number>; totalCountLabel?: number },
): { html: string; totals: Record<string, number> } {
  const totals: Record<string, number> = {};
  if (opts?.overrideTotals) {
    Object.assign(totals, opts.overrideTotals);
  } else {
    columns.forEach((col) => {
      if (col.isTotal || col.type === 'currency') {
        let sum = 0;
        data.forEach((row) => {
          const rawVal = row[col.key];
          const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
          if (!isNaN(num)) sum += num;
        });
        totals[col.key] = sum;
      }
    });
  }

  const headersHtml = columns
    .map((col) => {
      const isNum = col.type === 'currency' || col.type === 'number' || col.type === 'percent';
      return `<th style="background:#0f172a;color:#ffffff;padding:8px 9px;text-align:${
        isNum ? 'left' : 'right'
      };font-size:10.5px;font-weight:800;border:1px solid #1e293b;border-bottom:2.5px solid #d97706;white-space:nowrap;">${escapeHtml(col.header)}</th>`;
    })
    .join('');

  const rowsHtml = data
    .map((row, idx) => {
      const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
      const cells = columns
        .map((col) => {
          let val = row[col.key];
          if (val === true) val = 'نعم';
          else if (val === false) val = 'لا';
          else if (val === null || val === undefined || val === '') val = '—';

          let formatted = escapeHtml(val);
          let align = 'right';
          let extraStyle = 'font-weight:600;color:#1e293b;';

          if (col.type === 'currency' || col.type === 'number') {
            align = 'left';
            const num = typeof val === 'number' ? val : Number(val);
            if (!isNaN(num) && val !== '—') {
              formatted = formatNum(num, col.type === 'number' && Number.isInteger(num) ? 0 : 2);
              extraStyle = `font-family:'Inter',monospace;font-weight:700;color:${num < 0 ? '#be123c' : '#0f172a'};`;
            }
          } else if (col.type === 'percent') {
            align = 'left';
            const num = typeof val === 'number' ? val : Number(val);
            if (!isNaN(num) && val !== '—') {
              formatted = `${num.toFixed(1)}%`;
              extraStyle = `font-family:'Inter',monospace;font-weight:700;color:#1e40af;`;
            }
          } else if (col.type === 'date') {
            align = 'center';
            extraStyle = `font-family:'Inter',monospace;font-weight:600;color:#334155;`;
          }

          return `<td style="padding:6.5px 9px;font-size:10.5px;border-bottom:1px solid #e2e8f0;border-inline:1px solid #eef2f7;text-align:${align};${extraStyle}">${formatted}</td>`;
        })
        .join('');
      return `<tr style="background:${bg};page-break-inside:avoid;">${cells}</tr>`;
    })
    .join('');

  const showFooter = opts?.showTotalsFooter !== false;
  const hasTotals = showFooter && Object.keys(totals).length > 0 && (opts?.totalCountLabel ?? data.length) > 0;
  let footerHtml = '';
  if (hasTotals) {
    const countShown = opts?.totalCountLabel ?? data.length;
    const footCells = columns
      .map((col, idx) => {
        if (idx === 0) {
          return `<td style="padding:8.5px 9px;font-size:11px;font-weight:900;color:#0f172a;background:#fef3c7;border-top:2px solid #0f172a;border-bottom:3.5px double #0f172a;text-align:right;">الإجمالي الكلي (${countShown}):</td>`;
        }
        if (totals[col.key] !== undefined) {
          const formatted = formatNum(totals[col.key], col.type === 'number' && Number.isInteger(totals[col.key]) ? 0 : 2);
          return `<td style="padding:8.5px 9px;font-size:11px;font-weight:900;color:#0f172a;background:#fef3c7;border-top:2px solid #0f172a;border-bottom:3.5px double #0f172a;text-align:left;font-family:'Inter',monospace;">${formatted}${col.type === 'currency' ? ` <span style="font-size:9px;color:#92400e;">${escapeHtml(currency)}</span>` : ''}</td>`;
        }
        return `<td style="padding:8.5px 9px;background:#fef3c7;border-top:2px solid #0f172a;border-bottom:3.5px double #0f172a;"></td>`;
      })
      .join('');
    footerHtml = `<tfoot><tr style="page-break-inside:avoid;">${footCells}</tr></tfoot>`;
  }

  const html = `
    <table style="width:100%;border-collapse:collapse;border:1.25px solid #cbd5e1;margin-bottom:14px;">
      <thead><tr style="page-break-inside:avoid;">${headersHtml}</tr></thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="${Math.max(1, columns.length)}" style="padding:20px;text-align:center;color:#64748b;font-weight:700;font-size:11px;">لا توجد بيانات مسجلة ضمن معايير التقرير الحالية</td></tr>`}
      </tbody>
      ${footerHtml}
    </table>
  `;

  return { html, totals };
}

function renderRoyalPageBottomBar(company: any, docRef: string, pageNo: number, totalPages: number): string {
  return `
    <div style="margin-top:auto;padding-top:8px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;align-items:center;font-size:9.5px;color:#475569;">
      <span style="font-weight:800;color:#0f172a;">${escapeHtml(company.nameAr || 'منظومة إدهام لإدارة الموارد والمحاسبة')} • VAT: ${escapeHtml(company.taxNumber || '310123456700003')}</span>
      <span style="font-family:monospace;font-weight:800;color:#4f46e5;">REF: ${escapeHtml(docRef)}</span>
      <span style="background:#0f172a;color:#fde68a;padding:2px 10px;border-radius:999px;font-weight:800;font-size:9.5px;">صفحة ${pageNo} من ${totalPages}</span>
    </div>
  `;
}

function renderRoyalFooterHtml(params: {
  company: any;
  docRef: string;
  notes?: string;
  tafqeetText?: string;
  signatureLabels?: [string, string, string];
}): string {
  const { notes, tafqeetText, signatureLabels } = params;
  const sigs = signatureLabels || ['إعداد المحاسب / المختص', 'المراجعة والتدقيق المالي', 'اعتماد الإدارة والختم الرسمي'];

  return `
    ${tafqeetText ? `
      <div style="margin-bottom:12px;padding:8px 13px;border-radius:10px;background:linear-gradient(90deg,#fffbeb,#fef3c7);border:1.5px solid #f59e0b;font-size:10.5px;font-weight:800;color:#78350f;page-break-inside:avoid;">
        <span style="color:#b45309;">المبلغ بالحروف:</span> ${escapeHtml(tafqeetText)}
      </div>
    ` : ''}
    ${notes ? `
      <div style="margin-bottom:12px;padding:8px 12px;border-radius:10px;background:#f8fafc;border:1px solid #cbd5e1;font-size:10px;color:#334155;line-height:1.5;page-break-inside:avoid;">
        <strong style="color:#0f172a;">ملاحظات وبيانات إضافية:</strong> ${escapeHtml(notes)}
      </div>
    ` : ''}
    <div style="margin-top:16px;padding-top:12px;border-top:2px solid #0f172a;page-break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;text-align:center;font-size:10.5px;gap:12px;">
        ${sigs
          .map(
            (label) => `
          <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 8px 11px 8px;">
            <div style="font-weight:900;color:#0f172a;font-size:10.5px;">${escapeHtml(label)}</div>
            <div style="margin-top:26px;border-bottom:1.5px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
            <div style="margin-top:4px;font-size:9px;color:#64748b;font-weight:600;">الاسم والتوقيع والتاريخ</div>
          </div>`,
          )
          .join('')}
      </div>
    </div>
  `;
}

export class ExportEngine {
  /**
   * Generates and downloads a Royal styled RTL Excel workbook (.xlsx)
   */
  static async exportExcel(options: ExportReportOptions): Promise<boolean> {
    const job = createJob({
      type: 'EXPORT_EXCEL',
      title: `تصدير إكسل ملكي: ${options.title}`,
      meta: { rowCount: options.data.length },
    });

    try {
      updateJob(job.id, { status: 'running', progress: 15 });

      const company = getStoredCompany();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = company.nameAr || 'IDHAM ERP PRO';
      workbook.lastModifiedBy = 'IDHAM ERP PRO';
      workbook.created = new Date();
      workbook.modified = new Date();

      await this.buildRoyalSheet(workbook, options, company);
      updateJob(job.id, { progress: 60 });

      if (options.additionalSheets && options.additionalSheets.length > 0) {
        for (const extra of options.additionalSheets) {
          await this.buildRoyalSheet(
            workbook,
            {
              ...options,
              title: extra.title,
              sheetName: extra.sheetName,
              columns: extra.columns,
              data: extra.data,
            },
            company,
          );
        }
      }

      updateJob(job.id, { progress: 85 });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const todayStr = new Date().toISOString().slice(0, 10);
      const cleanFilename = (options.filename || `${options.title}-${todayStr}`).replace(/\.xlsx$/i, '') + '.xlsx';

      const adapter = getPlatformAdapter();
      const success = await adapter.saveFile(blob, cleanFilename, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      });

      updateJob(job.id, {
        status: success ? 'completed' : 'failed',
        progress: 100,
        filename: cleanFilename,
        fileBlob: blob,
      });

      return success;
    } catch (err: any) {
      console.error('[ExportEngine] exportExcel error', err);
      updateJob(job.id, { status: 'failed', error: err.message || 'فشل توليد ملف الإكسل الملكي' });
      return false;
    }
  }

  /**
   * Builds a Royal Navy & Gold RTL worksheet with merged banner, formulas, signatures, and A4 page setup
   */
  private static async buildRoyalSheet(
    workbook: ExcelJS.Workbook,
    options: ExportReportOptions,
    company: any,
  ): Promise<ExcelJS.Worksheet> {
    const baseSheetName = (options.sheetName || options.title || 'Report')
      .replace(/[\\/?*[\]:']/g, '-')
      .trim()
      .slice(0, 28) || 'Report';
    let rawSheetName = baseSheetName;
    let suffix = 2;
    while (workbook.getWorksheet(rawSheetName)) {
      rawSheetName = `${baseSheetName.slice(0, 25)}-${suffix++}`;
    }
    const colCount = Math.max(options.columns.length, 4);
    const lastCol = this.getColumnLetter(colCount);
    const ws = workbook.addWorksheet(rawSheetName, {
      views: [{ state: 'normal', rightToLeft: true }],
      properties: { defaultRowHeight: 22 },
      pageSetup: {
        paperSize: 9, // A4
        orientation: options.columns.length > 6 ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
      },
    });

    let currentRow = 1;
    const docRef = `IDH-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const currency = options.currency || company.baseCurrency || 'SAR';

    // A. Royal Navy & Gold Merged Corporate Banner
    if (options.includeHeaderBanner !== false) {
      // Row 1: Deep Midnight Navy Company Crest Banner
      const r1 = ws.getRow(currentRow);
      r1.height = 34;
      ws.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
      const c1 = ws.getCell(`A${currentRow}`);
      c1.value = `${company.nameAr || 'شركة نظم إمداد للتقنية والحلول الرقمية'}  |  ${company.nameEn || 'IDHAM ERP PRO'}`;
      c1.font = { name: 'Tajawal', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1224' } };
      c1.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      c1.border = { bottom: { style: 'medium', color: { argb: 'FFD97706' } } };
      currentRow++;

      // Row 2: Royal Indigo Report Title Bar
      const r2 = ws.getRow(currentRow);
      r2.height = 26;
      ws.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
      const c2 = ws.getCell(`A${currentRow}`);
      c2.value = [
        `التقرير الملكي: ${options.title}`,
        options.periodLabel ? `الفترة: ${options.periodLabel}` : null,
        options.branchName ? `الفرع: ${options.branchName}` : null,
        `العملة: ${currency}`,
      ]
        .filter(Boolean)
        .join('   •   ');
      c2.font = { name: 'Tajawal', size: 11.5, bold: true, color: { argb: 'FF1E1B4B' } };
      c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };
      c2.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      c2.border = { bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } } };
      currentRow++;

      // Row 3: Audit & Tax Meta Bar
      const r3 = ws.getRow(currentRow);
      r3.height = 21;
      ws.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
      const c3 = ws.getCell(`A${currentRow}`);
      c3.value = `الرقم الضريبي (VAT): ${company.taxNumber || '310123456700003'}${company.commercialReg ? `  |  س.ت: ${company.commercialReg}` : ''}  |  تاريخ التصدير: ${new Date().toLocaleString('ar-SA')}  |  المرجع: ${docRef}  |  عدد السجلات: ${options.data.length}`;
      c3.font = { name: 'Tajawal', size: 9.5, italic: true, color: { argb: 'FF475569' } };
      c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      c3.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      currentRow++;

      // Optional KPI Summary Strip Row
      if (options.summaryKpis && options.summaryKpis.length > 0) {
        const kRow = ws.getRow(currentRow);
        kRow.height = 24;
        ws.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
        const kc = ws.getCell(`A${currentRow}`);
        kc.value = options.summaryKpis.map((k) => `${k.label}: ${k.value}`).join('    |    ');
        kc.font = { name: 'Tajawal', size: 10, bold: true, color: { argb: 'FF92400E' } };
        kc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        kc.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        kc.border = {
          top: { style: 'thin', color: { argb: 'FFFCD34D' } },
          bottom: { style: 'thin', color: { argb: 'FFFCD34D' } },
        };
        currentRow++;
      }

      currentRow++; // Clean spacer row
    }

    const tableStartRow = currentRow;

    // B. Royal Navy Column Headers with Gold Accent Bottom Border
    const headerRow = ws.getRow(currentRow++);
    headerRow.values = options.columns.map((c) => c.header);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Tajawal', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FFD97706' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    // C. Data Rows
    const dataStartRow = currentRow;
    for (let rIdx = 0; rIdx < options.data.length; rIdx++) {
      const item = options.data[rIdx];
      const row = ws.getRow(currentRow++);
      row.height = 22;

      const isEven = rIdx % 2 === 1;
      const rowValues: any[] = [];

      options.columns.forEach((col) => {
        let val = item[col.key];
        if (val === true) val = 'نعم';
        else if (val === false) val = 'لا';
        else if (val === null || val === undefined) val = '';

        if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
          const num = typeof val === 'number' ? val : Number(val);
          rowValues.push(isNaN(num) ? 0 : col.type === 'percent' && Math.abs(num) > 1 ? num / 100 : num);
        } else {
          rowValues.push(sanitizeForSpreadsheet(String(val)));
        }
      });

      row.values = rowValues;

      row.eachCell((cell, colNumber) => {
        const colDef = options.columns[colNumber - 1];
        cell.font = { name: 'Tajawal', size: 10, color: { argb: 'FF0F172A' } };

        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }

        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (colDef) {
          if (colDef.type === 'currency' || colDef.type === 'number') {
            cell.numFmt = colDef.format || '#,##0.00';
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else if (colDef.type === 'percent') {
            cell.numFmt = colDef.format || '0.00%';
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else if (colDef.type === 'date') {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
          }
        }
      });
    }

    const dataEndRow = currentRow - 1;

    // D. Royal Gold-Tinted Totals Row with Live Excel SUM Formulas
    const hasTotalCols = options.columns.some((c) => c.isTotal || c.type === 'currency');
    if (hasTotalCols && dataEndRow >= dataStartRow) {
      const totalRow = ws.getRow(currentRow++);
      totalRow.height = 27;

      const totalValues: any[] = [];
      options.columns.forEach((col, idx) => {
        if (idx === 0) {
          totalValues.push(`الإجمالي الكلي (${options.data.length} سجل):`);
        } else if (col.isTotal || col.type === 'currency') {
          const colLetter = this.getColumnLetter(idx + 1);
          totalValues.push({ formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` });
        } else {
          totalValues.push('');
        }
      });

      totalRow.values = totalValues;
      totalRow.eachCell((cell, colNumber) => {
        const colDef = options.columns[colNumber - 1];
        cell.font = { name: 'Tajawal', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF0F172A' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFF59E0B' } },
          right: { style: 'thin', color: { argb: 'FFF59E0B' } },
        };
        if (colDef && (colDef.isTotal || colDef.type === 'currency')) {
          cell.numFmt = colDef.format || '#,##0.00';
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    }

    // E. Executive Signature Block inside Excel
    currentRow += 2;
    const sigRow = ws.getRow(currentRow);
    sigRow.height = 24;
    ws.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
    const sigCell = ws.getCell(`A${currentRow}`);
    const sigs = options.signatureLabels || ['إعداد المحاسب / المختص', 'المراجعة والتدقيق المالي', 'اعتماد الإدارة والختم الرسمي'];
    sigCell.value = `${sigs[0]}: ___________________        |        ${sigs[1]}: ___________________        |        ${sigs[2]}: ___________________`;
    sigCell.font = { name: 'Tajawal', size: 9.5, bold: true, color: { argb: 'FF334155' } };
    sigCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // F. Column Widths
    options.columns.forEach((col, idx) => {
      const wsCol = ws.getColumn(idx + 1);
      if (col.width) {
        wsCol.width = col.width;
      } else {
        const headerLen = (col.header || '').length;
        wsCol.width = Math.max(headerLen * 1.5, 16);
      }
    });

    // G. Freeze Table Header, Print Title Rows & AutoFilter
    ws.views = [{ state: 'frozen', ySplit: tableStartRow, rightToLeft: true }];
    ws.pageSetup.printTitlesRow = `${tableStartRow}:${tableStartRow}`;
    if (dataEndRow >= dataStartRow) {
      const lastDataCol = this.getColumnLetter(options.columns.length);
      ws.autoFilter = { from: `A${tableStartRow}`, to: `${lastDataCol}${dataEndRow}` };
    }

    return ws;
  }

  private static emitPreview(req: RoyalPreviewRequest) {
    if (previewListeners.size === 0 && typeof document !== 'undefined') {
      // Fallback to direct print if no global preview host mounted
      if (req.kind === 'report' && req.reportOptions) void this.printReport(req.reportOptions);
      else if (req.kind === 'detail' && req.detailOptions) void this.printDetail(req.detailOptions);
      return;
    }
    previewListeners.forEach((fn) => fn(req));
  }

  static openPreview(options: ExportReportOptions) {
    const orientation = options.orientation || (options.columns.length > 6 ? 'landscape' : 'portrait');
    this.emitPreview({
      kind: 'report',
      title: options.title,
      subtitle: options.subtitle,
      filename: options.filename,
      currency: options.currency,
      orientation,
      reportOptions: options,
    });
  }

  static openDetailPreview(options: RoyalDetailDocumentOptions) {
    const maxCols = Math.max(0, ...(options.sections || []).map((s) => s.columns.length));
    this.emitPreview({
      kind: 'detail',
      title: options.title,
      subtitle: options.subtitle,
      filename: options.filename,
      docNo: options.docNo,
      currency: options.currency,
      orientation: maxCols > 7 ? 'landscape' : 'portrait',
      detailOptions: options,
    });
  }

  static openElementPreview(opts: { elementId: string; title: string; subtitle?: string; filename?: string; docNo?: string; pageSize?: 'A4' | 'A5'; orientation?: 'portrait' | 'landscape' }) {
    this.emitPreview({
      kind: 'element',
      title: opts.title,
      subtitle: opts.subtitle,
      filename: opts.filename,
      docNo: opts.docNo,
      pageSize: opts.pageSize || 'A4',
      orientation: opts.orientation || 'portrait',
      elementId: opts.elementId,
    });
  }

  /**
   * Builds deterministic A4 paginated HTML pages shared identically by Preview, Printer, and Direct PDF.
   */
  static buildRoyalReportPages(options: ExportReportOptions): {
    pagesHtml: string[];
    combinedHtml: string;
    orientation: 'portrait' | 'landscape';
    docRef: string;
    totalPages: number;
  } {
    const company = getStoredCompany();
    const nowFormatted = new Date().toLocaleString('ar-SA');
    const currency = options.currency || company.baseCurrency || 'SAR';
    const docRef = `IDH-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const orientation: 'portrait' | 'landscape' = options.orientation || (options.columns.length > 6 ? 'landscape' : 'portrait');

    const firstPageCap = orientation === 'landscape' ? 11 : 16;
    const nextPageCap = orientation === 'landscape' ? 16 : 22;

    const { totals: grandTotals } = renderRoyalTableHtml(options.columns, options.data, currency);

    const kpis: RoyalKpiItem[] =
      options.summaryKpis && options.summaryKpis.length > 0
        ? options.summaryKpis
        : [
            { label: 'إجمالي السجلات', value: `${options.data.length}`, tone: 'indigo' },
            ...options.columns
              .filter((c) => grandTotals[c.key] !== undefined && (c.isTotal || c.type === 'currency'))
              .slice(0, 3)
              .map((c, idx) => ({
                label: c.header,
                value: `${formatNum(grandTotals[c.key])}${c.type === 'currency' ? ` ${currency}` : ''}`,
                tone: (['emerald', 'sky', 'amber'] as const)[idx % 3],
              })),
          ];

    const kpiStripHtml =
      kpis.length > 0
        ? `
      <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;page-break-inside:avoid;">
        ${kpis
          .map((k) => {
            const st = kpiAccentStyle(k.tone);
            return `
            <div style="flex:1;min-width:115px;border-radius:10px;border:1px solid #e2e8f0;border-top:3px solid ${st.border};background:${st.bg};padding:7px 11px;">
              <div style="font-size:9px;font-weight:800;color:#475569;">${escapeHtml(k.label)}</div>
              <div style="font-size:13.5px;font-weight:900;color:${st.text};font-family:'Inter','Tajawal',monospace;margin-top:2px;">${escapeHtml(k.value)}</div>
            </div>`;
          })
          .join('')}
      </div>`
        : '';

    const chunks: Array<Array<Record<string, any>>> = [];
    if (options.data.length === 0) {
      chunks.push([]);
    } else {
      chunks.push(options.data.slice(0, firstPageCap));
      let cursor = firstPageCap;
      while (cursor < options.data.length) {
        chunks.push(options.data.slice(cursor, cursor + nextPageCap));
        cursor += nextPageCap;
      }
    }

    const totalPages = chunks.length;
    const primaryCurrencyCol = [...options.columns].reverse().find((c) => c.type === 'currency' && grandTotals[c.key] > 0);
    const tafqeetText =
      primaryCurrencyCol && grandTotals[primaryCurrencyCol.key] > 0
        ? tafqeetArabic(grandTotals[primaryCurrencyCol.key], currency)
        : undefined;

    const watermarkText =
      options.watermark === 'DRAFT'
        ? 'مسودة غير معتمدة'
        : options.watermark === 'CANCELLED'
          ? 'مستند ملغى'
          : options.watermark === 'DUPLICATE'
            ? 'نسخة طبق الأصل'
            : null;

    const sheetWidthPx = orientation === 'landscape' ? '1123px' : '794px';
    const sheetMinHeightPx = orientation === 'landscape' ? '794px' : '1123px';

    const pagesHtml = chunks.map((slice, idx) => {
      const pageNo = idx + 1;
      const isFirst = pageNo === 1;
      const isLast = pageNo === totalPages;

      const { html: tableHtml } = renderRoyalTableHtml(options.columns, slice, currency, {
        showTotalsFooter: isLast,
        overrideTotals: isLast ? grandTotals : undefined,
        totalCountLabel: options.data.length,
      });

      return `
        <section class="idham-a4-page" data-page="${pageNo}" style="position:relative;direction:rtl;font-family:'Tajawal','Cairo','IBM Plex Sans Arabic',system-ui,Arial,sans-serif;width:${sheetWidthPx};min-height:${sheetMinHeightPx};padding:26px 30px;color:#0f172a;background:#ffffff;display:flex;flex-direction:column;box-sizing:border-box;page-break-after:${isLast ? 'auto' : 'always'};">
          ${watermarkText ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0.07;transform:rotate(-28deg);font-size:64px;font-weight:900;color:#0f172a;z-index:0;">${watermarkText}</div>` : ''}
          <div style="position:relative;z-index:1;display:flex;flex-direction:column;flex:1;">
            ${renderRoyalHeaderHtml({
              company,
              title: options.title,
              subtitle: options.subtitle,
              docRef,
              periodLabel: options.periodLabel,
              branchName: options.branchName,
              currency,
              recordCount: options.data.length,
              nowFormatted,
              compactContinuation: !isFirst,
              pageNo,
              totalPages,
            })}
            ${isFirst ? kpiStripHtml : ''}
            <div style="flex:1;">
              ${tableHtml}
            </div>
            ${isLast ? renderRoyalFooterHtml({
              company,
              docRef,
              notes: options.notes,
              tafqeetText,
              signatureLabels: options.signatureLabels,
            }) : ''}
            ${renderRoyalPageBottomBar(company, docRef, pageNo, totalPages)}
          </div>
        </section>
      `;
    });

    return {
      pagesHtml,
      combinedHtml: pagesHtml.join('\n'),
      orientation,
      docRef,
      totalPages,
    };
  }

  /**
   * Builds deterministic A4 HTML page(s) for single documents (Invoices, Vouchers, Cheques, Journals, Profiles)
   */
  static buildRoyalDetailPages(options: RoyalDetailDocumentOptions): {
    pagesHtml: string[];
    combinedHtml: string;
    orientation: 'portrait' | 'landscape';
    docRef: string;
    totalPages: number;
  } {
    const company = getStoredCompany();
    const nowFormatted = new Date().toLocaleString('ar-SA');
    const currency = options.currency || company.baseCurrency || 'SAR';
    const docRef = options.docNo || `IDH-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const kpiHtml =
      options.kpis && options.kpis.length > 0
        ? `
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;page-break-inside:avoid;">
        ${options.kpis
          .map((k) => {
            const st = kpiAccentStyle(k.tone);
            return `
            <div style="flex:1;min-width:120px;border-radius:10px;border:1px solid #e2e8f0;border-top:3px solid ${st.border};background:${st.bg};padding:9px 12px;">
              <div style="font-size:9.5px;font-weight:800;color:#475569;">${escapeHtml(k.label)}</div>
              <div style="font-size:14.5px;font-weight:900;color:${st.text};font-family:'Inter','Tajawal',monospace;margin-top:3px;">${escapeHtml(k.value)}</div>
            </div>`;
          })
          .join('')}
      </div>`
        : '';

    const metaHtml =
      options.metaFields && options.metaFields.length > 0
        ? `
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:16px;page-break-inside:avoid;">
        ${options.metaFields
          .map(
            (f) => `
          <div style="border:1px solid #e2e8f0;border-radius:9px;background:#f8fafc;padding:7px 11px;">
            <div style="font-size:9.5px;font-weight:700;color:#64748b;">${escapeHtml(f.label)}</div>
            <div style="font-size:11.5px;font-weight:800;color:#0f172a;margin-top:2px;word-break:break-word;">${escapeHtml(f.value ?? '—')}</div>
          </div>`,
          )
          .join('')}
      </div>`
        : '';

    let maxCols = 0;
    const sectionsHtml = (options.sections || [])
      .map((sec) => {
        maxCols = Math.max(maxCols, sec.columns.length);
        const { html } = renderRoyalTableHtml(sec.columns, sec.data, currency);
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;page-break-after:avoid;">
              <div style="width:4px;height:16px;border-radius:4px;background:linear-gradient(180deg,#4f46e5,#d97706);"></div>
              <div style="font-size:12.5px;font-weight:900;color:#0f172a;">${escapeHtml(sec.title)} (${sec.data.length})</div>
            </div>
            ${html}
          </div>`;
      })
      .join('');

    const orientation: 'portrait' | 'landscape' = maxCols > 7 ? 'landscape' : 'portrait';
    const tafqeetText =
      options.totalAmountForTafqeet && options.totalAmountForTafqeet > 0
        ? tafqeetArabic(options.totalAmountForTafqeet, currency)
        : undefined;

    const watermarkText =
      options.watermark === 'DRAFT'
        ? 'مسودة غير معتمدة'
        : options.watermark === 'CANCELLED'
          ? 'مستند ملغى'
          : options.watermark === 'DUPLICATE'
            ? 'نسخة طبق الأصل'
            : null;

    const sheetWidthPx = orientation === 'landscape' ? '1123px' : '794px';
    const sheetMinHeightPx = orientation === 'landscape' ? '794px' : '1123px';

    const pageHtml = `
      <section class="idham-a4-page" data-page="1" style="position:relative;direction:rtl;font-family:'Tajawal','Cairo','IBM Plex Sans Arabic',system-ui,Arial,sans-serif;width:${sheetWidthPx};min-height:${sheetMinHeightPx};padding:26px 30px;color:#0f172a;background:#ffffff;display:flex;flex-direction:column;box-sizing:border-box;">
        ${watermarkText ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0.07;transform:rotate(-28deg);font-size:64px;font-weight:900;color:#0f172a;z-index:0;">${watermarkText}</div>` : ''}
        <div style="position:relative;z-index:1;display:flex;flex-direction:column;flex:1;">
          ${renderRoyalHeaderHtml({
            company,
            title: options.title,
            subtitle: options.subtitle,
            docRef,
            docNo: options.docNo,
            docDate: options.docDate,
            statusLabel: options.statusLabel,
            statusTone: options.statusTone,
            periodLabel: options.periodLabel,
            branchName: options.branchName,
            currency,
            nowFormatted,
            pageNo: 1,
            totalPages: 1,
          })}
          ${kpiHtml}
          ${metaHtml}
          <div style="flex:1;">
            ${sectionsHtml}
          </div>
          ${renderRoyalFooterHtml({
            company,
            docRef,
            notes: options.notes,
            tafqeetText,
            signatureLabels: options.signatureLabels,
          })}
          ${renderRoyalPageBottomBar(company, docRef, 1, 1)}
        </div>
      </section>
    `;

    return {
      pagesHtml: [pageHtml],
      combinedHtml: pageHtml,
      orientation,
      docRef,
      totalPages: 1,
    };
  }

  /**
   * Renders an array of `.idham-a4-page` HTML blocks (or arbitrary DOM element HTML)
   * using high-DPI html2canvas-pro + jsPDF into a direct .pdf file download 100% matching preview.
   */
  static async downloadDirectPdfFromPages(
    pagesHtml: string[],
    opts: { title: string; filename?: string; orientation?: 'portrait' | 'landscape' },
  ): Promise<boolean> {
    if (typeof document === 'undefined' || pagesHtml.length === 0) return false;
    const orientation = opts.orientation || 'portrait';
    const cleanFilename = (opts.filename || `${opts.title}-${new Date().toISOString().slice(0, 10)}`).replace(/\.pdf$/i, '') + '.pdf';

    let host: HTMLDivElement | null = null;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      const fontsReady = (document as any).fonts?.ready;
      if (fontsReady && typeof fontsReady.then === 'function') {
        await Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]);
      }

      host = document.createElement('div');
      host.setAttribute('dir', 'rtl');
      host.style.position = 'fixed';
      host.style.left = '-25000px';
      host.style.top = '0';
      host.style.background = '#ffffff';
      host.style.zIndex = '-1';
      host.style.fontFamily = "'Tajawal', 'Cairo', 'IBM Plex Sans Arabic', system-ui, sans-serif";
      document.body.appendChild(host);

      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const pdfPageW = pdf.internal.pageSize.getWidth();
      const pdfPageH = pdf.internal.pageSize.getHeight();
      let addedFirst = false;

      for (let i = 0; i < pagesHtml.length; i++) {
        host.innerHTML = pagesHtml[i];
        const targetEl = (host.firstElementChild as HTMLElement) || host;
        // Let layout & SVGs settle
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
        const canvas = await html2canvas(targetEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0,
        });
        if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
          throw new Error('تعذر توليد لوحة الطباعة للصفحة');
        }
        const imgW = canvas.width;
        const imgH = canvas.height;
        const ratioW = pdfPageW / imgW;
        const renderedHmm = imgH * ratioW;

        if (renderedHmm <= pdfPageH + 1.5) {
          if (addedFirst) pdf.addPage('a4', orientation);
          addedFirst = true;
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, pdfPageW, Math.min(pdfPageH, renderedHmm), undefined, 'FAST');
        } else {
          // Slice taller pages (like custom DOM invoice captures) across clean A4 slices
          const sliceHeightPx = Math.floor(pdfPageH / ratioW);
          let offsetY = 0;
          while (offsetY < imgH) {
            const hSlice = Math.min(sliceHeightPx, imgH - offsetY);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = imgW;
            sliceCanvas.height = hSlice;
            const ctx = sliceCanvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, imgW, hSlice);
              ctx.drawImage(canvas, 0, offsetY, imgW, hSlice, 0, 0, imgW, hSlice);
            }
            if (addedFirst) pdf.addPage('a4', orientation);
            addedFirst = true;
            pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pdfPageW, hSlice * ratioW, undefined, 'FAST');
            offsetY += hSlice;
          }
        }
      }

      const blob = pdf.output('blob');
      const adapter = getPlatformAdapter();
      return await adapter.saveFile(blob, cleanFilename, {
        mimeType: 'application/pdf',
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      });
    } catch (err) {
      console.warn('[ExportEngine] direct canvas PDF fallback to system print:', err);
      const adapter = getPlatformAdapter();
      await adapter.printDocument({
        contentHtml: pagesHtml.join('\n'),
        title: `${opts.title} - IDHAM ERP`,
        pageSize: 'A4',
        orientation,
      });
      return true;
    } finally {
      if (host && host.parentNode) host.parentNode.removeChild(host);
    }
  }

  /**
   * Direct isolated A4 print dialog for tabular reports (exact match to Preview)
   */
  static async printReport(options: ExportReportOptions): Promise<boolean> {
    const built = this.buildRoyalReportPages(options);
    const adapter = getPlatformAdapter();
    await adapter.printDocument({
      contentHtml: built.combinedHtml,
      title: `${options.title} - IDHAM ERP`,
      pageSize: 'A4',
      orientation: built.orientation,
    });
    return true;
  }

  /**
   * Direct isolated A4 print dialog for single detail documents (exact match to Preview)
   */
  static async printDetail(options: RoyalDetailDocumentOptions): Promise<boolean> {
    const built = this.buildRoyalDetailPages(options);
    const adapter = getPlatformAdapter();
    await adapter.printDocument({
      contentHtml: built.combinedHtml,
      title: `${options.title} - IDHAM ERP`,
      pageSize: 'A4',
      orientation: built.orientation,
    });
    return true;
  }

  /**
   * Direct high-resolution A4 PDF download for any tabular report (100% pixel-identical to A4 Preview)
   */
  static async exportPdf(options: ExportReportOptions): Promise<boolean> {
    const job = createJob({
      type: 'EXPORT_PDF',
      title: `تصدير PDF ملكي: ${options.title}`,
      meta: { rowCount: options.data.length },
    });

    try {
      updateJob(job.id, { status: 'running', progress: 30 });
      const built = this.buildRoyalReportPages(options);
      updateJob(job.id, { progress: 65 });
      const ok = await this.downloadDirectPdfFromPages(built.pagesHtml, {
        title: options.title,
        filename: options.filename,
        orientation: built.orientation,
      });
      updateJob(job.id, { status: ok ? 'completed' : 'failed', progress: 100 });
      return ok;
    } catch (err: any) {
      console.error('[ExportEngine] exportPdf error', err);
      updateJob(job.id, { status: 'failed', error: err.message || 'فشل تصدير مستند PDF الملكي' });
      return false;
    }
  }

  /**
   * Direct high-resolution A4 PDF download for single document (Invoice, Voucher, Cheque, Journal, Profile)
   */
  static async exportDetailPdf(options: RoyalDetailDocumentOptions): Promise<boolean> {
    const job = createJob({
      type: 'EXPORT_PDF',
      title: `طباعة PDF ملكية: ${options.title}`,
      meta: { docNo: options.docNo },
    });

    try {
      updateJob(job.id, { status: 'running', progress: 30 });
      const built = this.buildRoyalDetailPages(options);
      updateJob(job.id, { progress: 65 });
      const ok = await this.downloadDirectPdfFromPages(built.pagesHtml, {
        title: options.title,
        filename: options.filename || (options.docNo ? `${options.title}-${options.docNo}` : undefined),
        orientation: built.orientation,
      });
      updateJob(job.id, { status: ok ? 'completed' : 'failed', progress: 100 });
      return ok;
    } catch (err: any) {
      console.error('[ExportEngine] exportDetailPdf error', err);
      updateJob(job.id, { status: 'failed', error: err.message || 'فشل توليد مستند PDF الملكي' });
      return false;
    }
  }

  /**
   * Generates a Royal Multi-Sheet Excel workbook from any detail document (meta + sections)
   */
  static async exportDetailExcel(options: RoyalDetailDocumentOptions): Promise<boolean> {
    const primarySection = options.sections?.[0];
    if (primarySection) {
      const extraSheets = (options.sections || []).slice(1).map((s) => ({
        sheetName: s.title,
        title: `${options.title} — ${s.title}`,
        columns: s.columns,
        data: s.data,
      }));
      if (options.metaFields && options.metaFields.length > 0) {
        extraSheets.push({
          sheetName: 'بيانات المستند',
          title: `بطاقة بيانات المستند — ${options.title}`,
          columns: [
            { key: 'label', header: 'البيان / الحقل', width: 28 },
            { key: 'value', header: 'القيمة', width: 42 },
          ],
          data: options.metaFields.map((f) => ({ label: f.label, value: f.value ?? '—' })),
        });
      }
      return this.exportExcel({
        title: options.title,
        filename: options.filename || `${options.title}-${options.docNo || new Date().toISOString().slice(0, 10)}`,
        periodLabel: options.periodLabel,
        branchName: options.branchName,
        currency: options.currency,
        summaryKpis: options.kpis,
        columns: primarySection.columns,
        data: primarySection.data,
        sheetName: primarySection.title,
        signatureLabels: options.signatureLabels,
        additionalSheets: extraSheets,
      });
    }

    return this.exportExcel({
      title: options.title,
      filename: options.filename,
      periodLabel: options.periodLabel,
      branchName: options.branchName,
      currency: options.currency,
      summaryKpis: options.kpis,
      columns: [
        { key: 'label', header: 'البيان / الحقل', width: 28 },
        { key: 'value', header: 'القيمة', width: 42 },
      ],
      data: (options.metaFields || []).map((f) => ({ label: f.label, value: f.value ?? '—' })),
      signatureLabels: options.signatureLabels,
    });
  }

  /**
   * Generates and downloads a clean UTF-8 with BOM CSV file
   */
  static async exportCsv(options: ExportReportOptions): Promise<boolean> {
    const job = createJob({
      type: 'EXPORT_CSV',
      title: `تصدير CSV: ${options.title}`,
      meta: { rowCount: options.data.length },
    });

    try {
      updateJob(job.id, { status: 'running', progress: 20 });

      const headers = options.columns.map((c) => `"${c.header.replace(/"/g, '""')}"`);
      const rows: string[] = [headers.join(',')];

      for (let i = 0; i < options.data.length; i++) {
        const item = options.data[i];
        const line = options.columns.map((col) => {
          let val = item[col.key];
          if (val === true) val = 'نعم';
          else if (val === false) val = 'لا';
          else if (val === null || val === undefined) val = '';
          const sanitized = sanitizeForSpreadsheet(String(val));
          return `"${sanitized.replace(/"/g, '""')}"`;
        });
        rows.push(line.join(','));
      }

      updateJob(job.id, { progress: 80 });

      const csvContent = '\ufeff' + rows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

      const todayStr = new Date().toISOString().slice(0, 10);
      const cleanFilename = (options.filename || `${options.title}-${todayStr}`).replace(/\.csv$/i, '') + '.csv';

      const adapter = getPlatformAdapter();
      const success = await adapter.saveFile(blob, cleanFilename, {
        mimeType: 'text/csv;charset=utf-8',
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
      });

      updateJob(job.id, {
        status: success ? 'completed' : 'failed',
        progress: 100,
        filename: cleanFilename,
        fileBlob: blob,
      });

      return success;
    } catch (err: any) {
      console.error('[ExportEngine] exportCsv error', err);
      updateJob(job.id, { status: 'failed', error: err.message || 'فشل تصدير ملف CSV' });
      return false;
    }
  }

  private static getColumnLetter(colIndex: number): string {
    let temp: number;
    let letter = '';
    while (colIndex > 0) {
      temp = (colIndex - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      colIndex = (colIndex - temp - 1) / 26;
    }
    return letter;
  }
}
