/**
 * IDHAM ERP - Enterprise Export Engine (ExcelJS & CSV)
 * Creates professional RTL Excel workbooks with true numeric types,
 * live SUM formulas, frozen headers, zebra stripes, and anti-formula injection.
 */

import ExcelJS from 'exceljs';
import { getPlatformAdapter } from './platform-adapter';
import { sanitizeForSpreadsheet } from './formatters';
import { createJob, updateJob } from './jobs-center';
import { getStoredCompany } from '../lib/storage-company';

export interface ExportColumnDef {
  key: string;
  header: string;
  width?: number;
  type?: 'text' | 'number' | 'currency' | 'date' | 'percent';
  format?: string;
  isTotal?: boolean; // include in SUM formula footer
}

export interface ExportReportOptions {
  title: string;
  filename?: string;
  subtitle?: string;
  branchName?: string;
  currency?: string;
  periodLabel?: string;
  columns: ExportColumnDef[];
  data: Array<Record<string, any>>;
  summaryRows?: Array<Record<string, any>>;
  includeHeaderBanner?: boolean;
  sheetName?: string;
  additionalSheets?: Array<{
    sheetName: string;
    title: string;
    columns: ExportColumnDef[];
    data: Array<Record<string, any>>;
  }>;
}

export class ExportEngine {
  /**
   * Generates and downloads a styled professional RTL Excel file (.xlsx)
   */
  static async exportExcel(options: ExportReportOptions): Promise<boolean> {
    const job = createJob({
      type: 'EXPORT_EXCEL',
      title: `تصدير إكسل: ${options.title}`,
      meta: { rowCount: options.data.length },
    });

    try {
      updateJob(job.id, { status: 'running', progress: 10 });

      const company = getStoredCompany();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = company.nameAr || 'IDHAM ERP';
      workbook.lastModifiedBy = 'IDHAM ERP';
      workbook.created = new Date();
      workbook.modified = new Date();

      // 1. Build Main Sheet
      await this.buildSheet(workbook, options, company);
      updateJob(job.id, { progress: 60 });

      // 2. Build Additional Sheets if provided
      if (options.additionalSheets && options.additionalSheets.length > 0) {
        for (const extra of options.additionalSheets) {
          await this.buildSheet(
            workbook,
            {
              ...options,
              title: extra.title,
              sheetName: extra.sheetName,
              columns: extra.columns,
              data: extra.data,
            },
            company
          );
        }
      }

      updateJob(job.id, { progress: 85 });

      // 3. Write Buffer
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
      updateJob(job.id, {
        status: 'failed',
        error: err.message || 'فشل توليد ملف الإكسل',
      });
      return false;
    }
  }

  /**
   * Builds an individual RTL worksheet with metadata banner, styles, and formulas
   */
  private static async buildSheet(
    workbook: ExcelJS.Workbook,
    options: ExportReportOptions,
    company: any
  ): Promise<ExcelJS.Worksheet> {
    const rawSheetName = (options.sheetName || options.title).slice(0, 31).replace(/[\\/?*[\]]/g, '-');
    const ws = workbook.addWorksheet(rawSheetName, {
      views: [{ state: 'normal', rightToLeft: true }],
      properties: { defaultRowHeight: 22 },
    });

    let currentRow = 1;

    // A. Company & Report Header Banner
    if (options.includeHeaderBanner !== false) {
      // Row 1: Company Name
      const rowComp = ws.getRow(currentRow++);
      rowComp.values = [company.nameAr || 'شركة نظم إمداد للتقنية والحلول الرقمية (AZM)'];
      rowComp.font = { name: 'IBM Plex Sans Arabic', size: 14, bold: true, color: { argb: 'FF0F172A' } };
      rowComp.alignment = { horizontal: 'right', vertical: 'middle' };

      // Row 2: Report Title & Period
      const rowTitle = ws.getRow(currentRow++);
      const subInfo = [
        options.title,
        options.periodLabel ? `الفترة: ${options.periodLabel}` : null,
        options.branchName ? `الفرع: ${options.branchName}` : null,
        `العملة: ${options.currency || company.baseCurrency || 'SAR'}`,
      ].filter(Boolean).join(' • ');
      rowTitle.values = [subInfo];
      rowTitle.font = { name: 'IBM Plex Sans Arabic', size: 11, bold: true, color: { argb: 'FF0284C7' } };
      rowTitle.alignment = { horizontal: 'right', vertical: 'middle' };

      // Row 3: Meta & Timestamp
      const rowMeta = ws.getRow(currentRow++);
      const nowFormatted = new Date().toLocaleString('ar-SA');
      rowMeta.values = [`تاريخ التصدير: ${nowFormatted} | الرقم الضريبي: ${company.taxNumber || '310123456700003'}`];
      rowMeta.font = { name: 'IBM Plex Sans Arabic', size: 9, italic: true, color: { argb: 'FF64748B' } };
      rowMeta.alignment = { horizontal: 'right', vertical: 'middle' };

      currentRow++; // Empty spacing row
    }

    const tableStartRow = currentRow;

    // B. Table Headers
    const headerRow = ws.getRow(currentRow++);
    headerRow.values = options.columns.map((c) => c.header);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'IBM Plex Sans Arabic', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' }, // Slate-900 Theme Header
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF334155' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF334155' } },
        right: { style: 'thin', color: { argb: 'FF334155' } },
      };
    });

    // C. Data Rows
    const dataStartRow = currentRow;
    for (let rIdx = 0; rIdx < options.data.length; rIdx++) {
      const item = options.data[rIdx];
      const row = ws.getRow(currentRow++);
      row.height = 20;

      const isEven = rIdx % 2 === 1;
      const rowValues: any[] = [];

      options.columns.forEach((col) => {
        let val = item[col.key];

        if (val === true) val = 'نعم';
        else if (val === false) val = 'لا';
        else if (val === null || val === undefined) val = '';

        if (col.type === 'number' || col.type === 'currency' || col.type === 'percent') {
          const num = typeof val === 'number' ? val : Number(val);
          rowValues.push(isNaN(num) ? 0 : num);
        } else {
          rowValues.push(sanitizeForSpreadsheet(String(val)));
        }
      });

      row.values = rowValues;

      // Apply Cell Formats and Zebra Striping
      row.eachCell((cell, colNumber) => {
        const colDef = options.columns[colNumber - 1];
        cell.font = { name: 'IBM Plex Sans Arabic', size: 9.5 };

        // Zebra stripes
        if (isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' }, // slate-50
          };
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
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
        }
      });
    }

    const dataEndRow = currentRow - 1;

    // D. Live Formulas / Totals Row (SUM)
    const hasTotalCols = options.columns.some((c) => c.isTotal || c.type === 'currency');
    if (hasTotalCols && dataEndRow >= dataStartRow) {
      const totalRow = ws.getRow(currentRow++);
      totalRow.height = 24;

      const totalValues: any[] = [];
      options.columns.forEach((col, idx) => {
        if (idx === 0) {
          totalValues.push('الإجمالي الكلي:');
        } else if (col.isTotal || col.type === 'currency') {
          const colLetter = this.getColumnLetter(idx + 1);
          // Excel formula: SUM(E6:E25)
          totalValues.push({
            formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})`,
          });
        } else {
          totalValues.push('');
        }
      });

      totalRow.values = totalValues;
      totalRow.eachCell((cell, colNumber) => {
        const colDef = options.columns[colNumber - 1];
        cell.font = { name: 'IBM Plex Sans Arabic', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' }, // Slate-200
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF0F172A' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } }, // Double bottom accounting underline
        };
        if (colDef && (colDef.isTotal || colDef.type === 'currency')) {
          cell.numFmt = colDef.format || '#,##0.00';
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });
    }

    // E. Column Widths & Auto-Fit
    options.columns.forEach((col, idx) => {
      const wsCol = ws.getColumn(idx + 1);
      if (col.width) {
        wsCol.width = col.width;
      } else {
        // Compute reasonable width based on header length and content sample
        const headerLen = (col.header || '').length;
        wsCol.width = Math.max(headerLen * 1.5, 14);
      }
    });

    // F. Freeze Table Header & Enable AutoFilter
    ws.views = [{ state: 'frozen', ySplit: tableStartRow, rightToLeft: true }];
    if (dataEndRow >= dataStartRow) {
      const lastColLetter = this.getColumnLetter(options.columns.length);
      ws.autoFilter = {
        from: `A${tableStartRow}`,
        to: `${lastColLetter}${dataEndRow}`,
      };
    }

    return ws;
  }

  /**
   * Generates and triggers an official printable PDF document with corporate headers,
   * RTL data table, live totals, and executive signatures.
   */
  static async exportPdf(options: ExportReportOptions): Promise<boolean> {
    const job = createJob({
      type: 'EXPORT_PDF',
      title: `تصدير PDF: ${options.title}`,
      meta: { rowCount: options.data.length },
    });

    try {
      updateJob(job.id, { status: 'running', progress: 30 });
      const company = getStoredCompany();
      const nowFormatted = new Date().toLocaleString('ar-SA');
      const currency = options.currency || company.baseCurrency || 'SAR';

      // 1. Calculate totals for numeric/currency columns
      const totals: Record<string, number> = {};
      options.columns.forEach((col) => {
        if (col.isTotal || col.type === 'currency' || col.type === 'number') {
          let sum = 0;
          options.data.forEach((row) => {
            const rawVal = row[col.key];
            const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
            if (!isNaN(num)) sum += num;
          });
          totals[col.key] = sum;
        }
      });

      // 2. Build Table Headers
      const tableHeadersHtml = options.columns
        .map((col) => {
          const isNum = col.type === 'currency' || col.type === 'number' || col.type === 'percent';
          return `<th style="background:#0f172a;color:#ffffff;padding:8px 10px;text-align:${
            isNum ? 'left' : 'right'
          };font-size:11px;font-weight:700;border:1px solid #1e293b;white-space:nowrap;">${col.header}</th>`;
        })
        .join('');

      // 3. Build Table Rows
      const tableRowsHtml = options.data
        .map((row, idx) => {
          const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
          const cells = options.columns
            .map((col) => {
              let val = row[col.key];
              if (val === true) val = 'نعم';
              else if (val === false) val = 'لا';
              else if (val === null || val === undefined) val = '—';

              let formatted = String(val);
              let align = 'right';

              if (col.type === 'currency' || col.type === 'number') {
                align = 'left';
                const num = typeof val === 'number' ? val : Number(val);
                if (!isNaN(num)) {
                  formatted = num.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                }
              } else if (col.type === 'percent') {
                align = 'left';
                const num = typeof val === 'number' ? val : Number(val);
                if (!isNaN(num)) formatted = `${num.toFixed(2)}%`;
              } else if (col.type === 'date') {
                align = 'center';
              }

              return `<td style="padding:6px 10px;font-size:10.5px;color:#1e293b;border-bottom:1px solid #e2e8f0;border-inline:1px solid #f1f5f9;text-align:${align};">${formatted}</td>`;
            })
            .join('');
          return `<tr style="background:${bg};page-break-inside:avoid;">${cells}</tr>`;
        })
        .join('');

      // 4. Build Totals Row
      const hasTotals = Object.keys(totals).length > 0;
      let tableFooterHtml = '';
      if (hasTotals) {
        const footCells = options.columns
          .map((col, idx) => {
            if (idx === 0) {
              return `<td style="padding:8px 10px;font-size:11px;font-weight:bold;color:#0f172a;background:#f1f5f9;border-top:2px solid #0f172a;border-bottom:3px double #0f172a;text-align:right;">الإجمالي الكلي:</td>`;
            }
            if (totals[col.key] !== undefined) {
              const formatted = totals[col.key].toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              return `<td style="padding:8px 10px;font-size:11px;font-weight:bold;color:#0f172a;background:#f1f5f9;border-top:2px solid #0f172a;border-bottom:3px double #0f172a;text-align:left;font-family:monospace;">${formatted} ${col.type === 'currency' ? currency : ''}</td>`;
            }
            return `<td style="padding:8px 10px;background:#f1f5f9;border-top:2px solid #0f172a;border-bottom:3px double #0f172a;"></td>`;
          })
          .join('');
        tableFooterHtml = `<tfoot><tr style="page-break-inside:avoid;">${footCells}</tr></tfoot>`;
      }

      // 5. Complete Corporate A4 Report HTML
      const reportHtml = `
        <div style="direction:rtl;font-family:'IBM Plex Sans Arabic',system-ui,Arial,sans-serif;padding:12px;color:#0f172a;background:#ffffff;">
          <!-- Top Executive Header -->
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
            <div style="max-width:380px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <div style="width:28px;height:28px;border-radius:6px;background:#0f172a;color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;">ع</div>
                <div>
                  <div style="font-size:15px;font-weight:800;color:#0f172a;line-height:1.2;">${company.nameAr || 'شركة نظم إمداد للتقنية والحلول الرقمية'}</div>
                  <div style="font-size:10px;color:#64748b;font-weight:600;">${company.nameEn || 'AZM TECH & DIGITAL SOLUTIONS'}</div>
                </div>
              </div>
              <div style="font-size:10px;color:#475569;margin-top:4px;line-height:1.4;">
                الرقم الضريبي (VAT): <span style="font-family:monospace;font-weight:bold;">${company.taxNumber || '310123456700003'}</span>
                ${company.commercialReg ? ` | س.ت: <span style="font-family:monospace;">${company.commercialReg}</span>` : ''}
              </div>
            </div>

            <div style="text-align:center;align-self:center;">
              <div style="background:#0f172a;color:#ffffff;padding:5px 16px;border-radius:8px;font-size:13px;font-weight:800;display:inline-block;letter-spacing:0.5px;">
                ${options.title}
              </div>
              <div style="font-size:10.5px;color:#475569;margin-top:4px;font-weight:600;">
                ${options.periodLabel ? `الفترة: ${options.periodLabel} • ` : ''}الفرع: ${options.branchName || 'المقر الرئيسي'}
              </div>
            </div>

            <div style="text-align:left;font-size:10px;color:#64748b;line-height:1.5;">
              <div>التاريخ: <span style="font-weight:bold;color:#0f172a;">${nowFormatted}</span></div>
              <div>إجمالي السجلات: <span style="font-weight:bold;color:#0f172a;">${options.data.length}</span></div>
              <div>العملة: <span style="font-weight:bold;color:#0f172a;">${currency}</span></div>
            </div>
          </div>

          <!-- Data Table -->
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <thead>
              <tr style="page-break-inside:avoid;">${tableHeadersHtml}</tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
            ${tableFooterHtml}
          </table>

          <!-- Official Signatures & Stamp Footer -->
          <div style="margin-top:24px;padding-top:12px;border-top:1px solid #cbd5e1;page-break-inside:avoid;">
            <div style="display:flex;justify-content:space-between;text-align:center;font-size:11px;margin-bottom:20px;">
              <div style="width:28%;">
                <div style="font-weight:bold;color:#1e293b;">إعداد المحاسب المسؤول</div>
                <div style="margin-top:25px;border-bottom:1px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
              </div>
              <div style="width:28%;">
                <div style="font-weight:bold;color:#1e293b;">المراجعة والتدقيق المالي</div>
                <div style="margin-top:25px;border-bottom:1px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
              </div>
              <div style="width:28%;">
                <div style="font-weight:bold;color:#1e293b;">اعتماد الإدارة والختم الرسمي</div>
                <div style="margin-top:25px;border-bottom:1px dashed #94a3b8;width:80%;margin-inline:auto;"></div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:9.5px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:6px;">
              <span>منظومة إدهام لإدارة الموارد والمحاسبة (IDHAM ERP) • مستند رقمي رسمي معتمد</span>
              <span>صفحة 1 من 1</span>
            </div>
          </div>
        </div>
      `;

      updateJob(job.id, { progress: 85 });
      const adapter = getPlatformAdapter();
      await adapter.printDocument({
        contentHtml: reportHtml,
        title: `${options.title} - IDHAM ERP`,
        pageSize: 'A4',
        orientation: options.columns.length > 6 ? 'landscape' : 'portrait',
      });

      updateJob(job.id, { status: 'completed', progress: 100 });
      return true;
    } catch (err: any) {
      console.error('[ExportEngine] exportPdf error', err);
      updateJob(job.id, { status: 'failed', error: err.message || 'فشل تصدير مستند PDF' });
      return false;
    }
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
      updateJob(job.id, {
        status: 'failed',
        error: err.message || 'فشل تصدير ملف CSV',
      });
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
