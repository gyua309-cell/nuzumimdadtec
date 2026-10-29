/**
 * IDHAM ERP - Unified Print Engine
 * Provides official printable document layouts, watermarks (Draft, Canceled, Duplicate),
 * repeated table headers across pages, and thermal receipts (80mm / 58mm).
 */

import React, { ReactNode } from 'react';
import { getPlatformAdapter, PrintOptions } from './platform-adapter';
import { getStoredCompany } from '../lib/storage-company';

export type PaperSize = 'A4' | 'A5' | '80mm' | '58mm';
export type PageOrientation = 'portrait' | 'landscape';
export type WatermarkType = 'NONE' | 'DRAFT' | 'CANCELED' | 'DUPLICATE' | 'CONFIDENTIAL';

export interface PrintDocumentHeaderProps {
  documentTitle: string;
  documentNumber?: string;
  documentDate?: string;
  branchName?: string;
  branchCountry?: 'SA' | 'EG';
  currency?: string;
  watermark?: WatermarkType;
  qrCodeSvg?: ReactNode;
}

export class PrintEngine {
  /**
   * Triggers an isolated, clean print job for a document or DOM element
   */
  static async print(options: PrintOptions): Promise<void> {
    const adapter = getPlatformAdapter();
    await adapter.printDocument(options);
  }

  /**
   * Prepares a print-ready HTML wrapper with exact CSS @page rules
   */
  static wrapHtmlForPrint(bodyHtml: string, options: { pageSize?: PaperSize; orientation?: PageOrientation; title?: string }): string {
    const pageSize = options.pageSize || 'A4';
    const orientation = options.orientation || 'portrait';
    const sizeRule = pageSize.includes('mm') ? `${pageSize} auto` : `${pageSize} ${orientation}`;
    const margin = pageSize.includes('mm') ? '3mm' : '8mm';

    return `
      <div class="print-container" style="
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
        padding: 0;
        font-family: 'IBM Plex Sans Arabic', system-ui, -apple-system, sans-serif;
        direction: rtl;
        color: #0f172a;
        background: #ffffff;
      ">
        <style>
          @page {
            size: ${sizeRule};
            margin: ${margin};
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .table-header-repeat {
              display: table-header-group !important;
            }
            .table-row-avoid-break {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            .page-break-after {
              break-after: page !important;
              page-break-after: always !important;
            }
          }
        </style>
        ${bodyHtml}
      </div>
    `;
  }
}

/**
 * React Component: Official Print Layout Header
 */
export const OfficialPrintHeader: React.FC<PrintDocumentHeaderProps> = ({
  documentTitle,
  documentNumber,
  documentDate,
  branchName,
  branchCountry = 'SA',
  currency = 'SAR',
  watermark = 'NONE',
  qrCodeSvg,
}) => {
  const company = getStoredCompany();
  const isEgypt = branchCountry === 'EG';

  const watermarkText =
    watermark === 'DRAFT'
      ? 'مسودة غير معتمدة'
      : watermark === 'CANCELED'
      ? 'ملغاة / CANCELED'
      : watermark === 'DUPLICATE'
      ? 'نسخة مكررة'
      : watermark === 'CONFIDENTIAL'
      ? 'سري ومقيد'
      : null;

  return (
    <div className="relative border-b-2 border-slate-900 pb-5 mb-5 text-slate-900">
      {/* Watermark Diagonal Overlay */}
      {watermarkText && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-10 z-0 overflow-hidden"
          style={{ transform: 'rotate(-25deg)' }}
        >
          <span className="text-6xl font-black tracking-widest text-slate-900 border-8 border-dashed border-slate-900 px-10 py-4 rounded-3xl">
            {watermarkText}
          </span>
        </div>
      )}

      <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
        {/* Company Identity */}
        <div className="space-y-1.5 max-w-sm">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xl shadow-sm">
              ع
            </div>
            <div>
              <h1 className="font-extrabold text-base leading-tight text-slate-950">
                {company.nameAr || 'شركة عزم للتكنولوجيا والحلول الرقمية'}
              </h1>
              <p className="text-xs font-semibold text-slate-500 tracking-wide">
                {company.nameEn || 'AZM TECH & DIGITAL SOLUTIONS'}
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
            <div>
              <span className="font-bold">الرقم الضريبي (VAT):</span>{' '}
              <span className="font-mono">{company.taxNumber || '310123456700003'}</span>
            </div>
            {company.commercialReg && (
              <div>
                <span className="font-bold">السجل التجاري (CR):</span>{' '}
                <span className="font-mono">{company.commercialReg}</span>
              </div>
            )}
            <div>
              <span className="font-bold">الفرع:</span> {branchName || (isEgypt ? 'فرع القاهرة - مصر' : 'المقر الرئيسي - الرياض')}
            </div>
          </div>
        </div>

        {/* Center: Document Title Badge */}
        <div className="text-center self-center px-4">
          <div className="inline-block px-4 py-1.5 bg-slate-100 border border-slate-300 rounded-xl">
            <h2 className="text-base font-black tracking-wide text-slate-900">{documentTitle}</h2>
          </div>
          {documentNumber && (
            <div className="mt-1 font-mono text-xs font-bold text-slate-700 dir-ltr">
              {documentNumber}
            </div>
          )}
          {documentDate && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              التاريخ: {documentDate}
            </div>
          )}
        </div>

        {/* Left: QR Code (if tax invoice) or Stamp Placeholder */}
        <div className="flex flex-col items-center justify-center">
          {qrCodeSvg ? (
            <div className="p-1.5 bg-white border border-slate-300 rounded-xl shadow-xs">
              {qrCodeSvg}
            </div>
          ) : (
            <div className="size-20 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center text-[10px] text-slate-400 text-center p-1">
              الختم المعتمد
            </div>
          )}
          <div className="text-[10px] text-slate-400 mt-1">العملة: {currency}</div>
        </div>
      </div>
    </div>
  );
};

/**
 * React Component: Official Print Layout Footer
 */
export const OfficialPrintFooter: React.FC<{
  notes?: string;
  showSignatures?: boolean;
  signatureLabels?: [string, string, string];
}> = ({
  notes,
  showSignatures = true,
  signatureLabels = ['إعداد المحاسب', 'المراجعة والتدقيق', 'اعتماد المدير المالي'],
}) => {
  const company = getStoredCompany();
  const printTimestamp = new Date().toLocaleString('ar-SA');

  return (
    <div className="mt-8 pt-4 border-t border-slate-300 text-slate-700 text-xs break-inside-avoid">
      {notes && (
        <div className="mb-4 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600">
          <span className="font-bold">ملاحظات وشروط:</span> {notes}
        </div>
      )}

      {showSignatures && (
        <div className="grid grid-cols-3 gap-6 pt-2 pb-6 text-center text-xs">
          {signatureLabels.map((lbl, idx) => (
            <div key={idx} className="space-y-8">
              <div className="font-bold text-slate-800">{lbl}</div>
              <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto" />
              <div className="text-[10px] text-slate-400">التوقيع والتاريخ</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-3 border-t border-slate-200">
        <div>
          {company.legalName || company.nameAr} • {company.address || 'المملكة العربية السعودية / جمهورية مصر العربية'}
        </div>
        <div>
          طُبع بواسطة المنظومة في: {printTimestamp} • صفحة رقمية معتمدة
        </div>
      </div>
    </div>
  );
};
