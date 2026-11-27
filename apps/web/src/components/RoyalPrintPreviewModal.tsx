/**
 * IDHAM ERP — Unified Royal A4 Print Preview Modal
 * Renders exact A4 paginated RTL sheets (matching Direct PDF & System Printer pixel-for-pixel)
 * with zoom, orientation toggle, page navigation ("صفحة X من Y"), and 1-click PDF/Print/Excel.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Maximize2,
  Printer,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ExportEngine,
  RoyalPreviewRequest,
  subscribePrintPreview,
} from '../engine/export-engine';
import { PrintEngine } from '../engine/print-engine';
import { Spinner, useToast } from './ui';

export const RoyalPrintPreviewModal: React.FC = () => {
  const [req, setReq] = useState<RoyalPreviewRequest | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [zoom, setZoom] = useState<number>(0.85);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showAllPages, setShowAllPages] = useState<boolean>(true);
  const [busy, setBusy] = useState<'pdf' | 'print' | 'excel' | null>(null);
  const toast = useToast();

  useEffect(() => {
    const unsub = subscribePrintPreview((nextReq) => {
      setReq(nextReq);
      setOrientation(nextReq.orientation || 'portrait');
      setCurrentPage(1);
      setShowAllPages(true);
      setZoom(typeof window !== 'undefined' && window.innerWidth < 1100 ? 0.65 : 0.85);
    });
    const onPreviewEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.elementId) {
        ExportEngine.openElementPreview(detail);
      } else if (detail?.detailOptions) {
        ExportEngine.openDetailPreview(detail.detailOptions);
      }
    };
    const onPdfEvt = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.elementId) return;
      const el = document.getElementById(detail.elementId);
      if (!el) return;
      const orient: 'portrait' | 'landscape' = detail.orientation === 'landscape' ? 'landscape' : 'portrait';
      const w = orient === 'landscape' ? '1123px' : '794px';
      const h = orient === 'landscape' ? '794px' : '1123px';
      const wrapped = `<section class="idham-a4-page" data-page="1" style="direction:rtl;width:${w};min-height:${h};padding:20px 24px;background:#ffffff;color:#0f172a;box-sizing:border-box;">${el.outerHTML}</section>`;
      const ok = await ExportEngine.downloadDirectPdfFromPages([wrapped], {
        title: detail.title || 'مستند رسمي',
        filename: detail.filename || `document-${new Date().toISOString().slice(0, 10)}`,
        orientation: orient,
      });
      if (ok) toast.success(`تم تنزيل ملف PDF (${detail.title || 'المستند'}) بنجاح`);
    };
    window.addEventListener('idham:element-preview', onPreviewEvt);
    window.addEventListener('idham:element-pdf', onPdfEvt);
    return () => {
      unsub();
      window.removeEventListener('idham:element-preview', onPreviewEvt);
      window.removeEventListener('idham:element-pdf', onPdfEvt);
    };
  }, [toast]);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) setReq(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, busy]);

  const built = useMemo(() => {
    if (!req) return null;
    if (req.kind === 'report' && req.reportOptions) {
      return ExportEngine.buildRoyalReportPages({ ...req.reportOptions, orientation });
    }
    if (req.kind === 'detail' && req.detailOptions) {
      return ExportEngine.buildRoyalDetailPages(req.detailOptions);
    }
    if (req.kind === 'element' && req.elementId && typeof document !== 'undefined') {
      const el = document.getElementById(req.elementId);
      const rawHtml = el ? el.outerHTML : '<div style="padding:24px;text-align:center;">المحتوى غير متاح للمعاينة</div>';
      const w = orientation === 'landscape' ? '1123px' : '794px';
      const h = orientation === 'landscape' ? '794px' : '1123px';
      const wrapped = `<section class="idham-a4-page" data-page="1" style="direction:rtl;width:${w};min-height:${h};padding:20px 24px;background:#ffffff;color:#0f172a;box-sizing:border-box;">${rawHtml}</section>`;
      return { pagesHtml: [wrapped], combinedHtml: wrapped, orientation, docRef: req.docNo || 'DOC', totalPages: 1 };
    }
    return null;
  }, [req, orientation]);

  if (!req || !built) return null;

  const totalPages = built.totalPages || 1;
  const visiblePages = showAllPages ? built.pagesHtml : [built.pagesHtml[Math.min(currentPage - 1, totalPages - 1)]];

  const handleDownloadPdf = async () => {
    setBusy('pdf');
    try {
      const ok = await ExportEngine.downloadDirectPdfFromPages(built.pagesHtml, {
        title: req.title,
        filename: req.filename || `${req.title}-${req.docNo || new Date().toISOString().slice(0, 10)}`,
        orientation: built.orientation,
      });
      if (ok) {
        toast.success(`تم تنزيل ملف PDF (${req.title}) مطابقاً تماماً للمعاينة`);
      } else {
        toast.error('تعذر تنزيل ملف PDF مباشرة؛ يرجى التحقق من السماح بالتنزيلات');
      }
    } catch (err: any) {
      toast.error(err?.message || 'تعذر تصدير ملف PDF');
    } finally {
      setBusy(null);
    }
  };

  const handlePrintNow = async () => {
    setBusy('print');
    try {
      if (req.kind === 'element' && req.elementId) {
        await PrintEngine.print({ elementId: req.elementId, title: req.title, pageSize: req.pageSize || 'A4', orientation: built.orientation });
      } else if (req.kind === 'report' && req.reportOptions) {
        await ExportEngine.printReport({ ...req.reportOptions, orientation: built.orientation });
      } else if (req.kind === 'detail' && req.detailOptions) {
        await ExportEngine.printDetail(req.detailOptions);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleExportExcel = async () => {
    setBusy('excel');
    try {
      if (req.kind === 'report' && req.reportOptions) {
        await ExportEngine.exportExcel(req.reportOptions);
        toast.success('تم تصدير ملف Excel الملكي (.xlsx)');
      } else if (req.kind === 'detail' && req.detailOptions) {
        await ExportEngine.exportDetailExcel(req.detailOptions);
        toast.success('تم تصدير ملف Excel الملكي (.xlsx)');
      }
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[10050] flex flex-col bg-slate-950/85 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`معاينة قبل الطباعة — ${req.title}`}
    >
      {/* Executive Preview Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/80 bg-[#0b1224] px-4 py-3 text-white shadow-xl shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300">
            <Printer className="size-4.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-white truncate max-w-md">{req.title}</h3>
              <span className="rounded-md bg-indigo-500/25 border border-indigo-400/40 px-2 py-0.5 text-[10.5px] font-mono font-bold text-indigo-200">
                A4 {built.orientation === 'landscape' ? 'أفقي' : 'عمودي'} • {totalPages} صفحة
              </span>
            </div>
            {req.subtitle && <p className="text-[11px] text-slate-400 truncate max-w-lg">{req.subtitle}</p>}
          </div>
        </div>

        {/* Zoom & Pagination Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-700 bg-slate-900/90 p-1 text-xs">
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              title="تصغير المعاينة"
            >
              <ZoomOut className="size-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] font-bold text-amber-300">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
              title="تكبير المعاينة"
            >
              <ZoomIn className="size-3.5" />
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              onClick={() => setZoom(0.95)}
              title="الحجم الافتراضي"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>

          {req.kind === 'report' && (
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-400/60 cursor-pointer"
              onClick={() => {
                setOrientation((o) => (o === 'portrait' ? 'landscape' : 'portrait'));
                setCurrentPage(1);
              }}
              title="تبديل اتجاه الورقة عمودي / أفقي"
            >
              <RotateCw className="size-3.5 text-amber-400" />
              <span>{orientation === 'portrait' ? 'عمودي' : 'أفقي'}</span>
            </button>
          )}

          {totalPages > 1 && (
            <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-xs">
              <button
                type="button"
                className="p-1 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                disabled={showAllPages || currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="size-3.5" />
              </button>
              <button
                type="button"
                className="px-2 font-mono text-[11px] font-bold text-white cursor-pointer hover:text-amber-300"
                onClick={() => setShowAllPages((v) => !v)}
                title="تبديل بين عرض كل الصفحات أو صفحة بصفحة"
              >
                {showAllPages ? `كل الصفحات (${totalPages})` : `صفحة ${currentPage} من ${totalPages}`}
              </button>
              <button
                type="button"
                className="p-1 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                disabled={showAllPages || currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronLeft className="size-3.5" />
              </button>
            </div>
          )}

          {/* Direct PDF Download */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-rose-600 to-red-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm hover:brightness-110 cursor-pointer disabled:opacity-50"
            disabled={busy !== null}
            onClick={handleDownloadPdf}
            title="تحميل ملف PDF مطابق تماماً للمعاينة بجودة عالية"
          >
            {busy === 'pdf' ? <Spinner className="size-3.5" /> : <FileDown className="size-3.5" />}
            <span>تحميل PDF مباشر (.pdf)</span>
          </button>

          {/* Direct Print */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-indigo-600 to-sky-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm hover:brightness-110 cursor-pointer disabled:opacity-50"
            disabled={busy !== null}
            onClick={handlePrintNow}
            title="طباعة فورية على ورق A4"
          >
            {busy === 'print' ? <Spinner className="size-3.5" /> : <Printer className="size-3.5" />}
            <span>طباعة فورية (A4)</span>
          </button>

          {(req.kind === 'report' || req.kind === 'detail') && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
              disabled={busy !== null}
              onClick={handleExportExcel}
              title="تصدير نسخة Excel الملكية (.xlsx)"
            >
              {busy === 'excel' ? <Spinner className="size-3.5" /> : <FileSpreadsheet className="size-3.5" />}
              <span>Excel</span>
            </button>
          )}

          <button
            type="button"
            className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer"
            disabled={busy !== null}
            onClick={() => setReq(null)}
            title="إغلاق المعاينة (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Live A4 Sheets Canvas Workspace */}
      <div className="flex-1 overflow-auto p-4 sm:p-8 flex flex-col items-center gap-6 bg-slate-800/75 custom-scrollbar">
        {visiblePages.map((pageHtml, idx) => (
          <div
            key={idx}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              marginBottom: zoom < 1 ? `calc((1123px * ${zoom - 1}))` : '0px',
            }}
            className="shadow-[0_20px_60px_rgba(0,0,0,0.55)] rounded-sm overflow-hidden bg-white transition-transform duration-150 shrink-0"
            dangerouslySetInnerHTML={{ __html: pageHtml }}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
};
