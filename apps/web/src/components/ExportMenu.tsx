/**
 * IDHAM ERP - Universal Royal Export & Print Menu Component
 * Renders direct 1-click "PDF ملكي" + "Excel ملكي" buttons + floating Portal dropdown
 * (z-[9999], position: fixed) so it NEVER clips behind PageHeader or KPI cards.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Printer,
  Settings2,
  Share2,
} from 'lucide-react';
import { ExportColumnDef, ExportEngine, RoyalKpiItem } from '../engine/export-engine';
import { PageOrientation, PaperSize, PrintEngine } from '../engine/print-engine';
import { Modal, Spinner, useToast } from './ui';

export interface ExportMenuProps {
  title: string;
  subtitle?: string;
  columns: ExportColumnDef[];
  data: Array<Record<string, any>>;
  summaryKpis?: RoyalKpiItem[];
  filename?: string;
  periodLabel?: string;
  branchName?: string;
  currency?: string;
  elementIdToPrint?: string;
  pageSize?: PaperSize;
  orientation?: PageOrientation;
  onCustomPrint?: () => void;
  showQuickPdf?: boolean;
  showQuickExcel?: boolean;
  className?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const MENU_WIDTH = 292;
const MENU_EST_HEIGHT = 345;

export const ExportMenu: React.FC<ExportMenuProps> = ({
  title,
  subtitle,
  columns,
  data,
  summaryKpis,
  filename,
  periodLabel,
  branchName,
  currency = 'SAR',
  elementIdToPrint,
  pageSize = 'A4',
  orientation = 'portrait',
  onCustomPrint,
  showQuickPdf = true,
  showQuickExcel = true,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<'excel' | 'pdf' | 'csv' | 'print' | null>(null);
  const [colModalOpen, setColModalOpen] = useState(false);
  const [selectedColKeys, setSelectedColKeys] = useState<string[]>(columns.map((c) => c.key));
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const triggerWrapRef = useRef<HTMLDivElement>(null);
  const dropdownBtnRef = useRef<HTMLButtonElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    setSelectedColKeys(columns.map((c) => c.key));
  }, [columns]);

  const computeCoords = useCallback(() => {
    const anchor = dropdownBtnRef.current || triggerWrapRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;

    const menuWidth = Math.min(MENU_WIDTH, vw - pad * 2);
    let left = rect.left;
    if (left + menuWidth > vw - pad) {
      left = Math.max(pad, rect.right - menuWidth);
    }
    if (left < pad) left = pad;

    const spaceBelow = vh - rect.bottom - pad;
    const spaceAbove = rect.top - pad;
    let top = rect.bottom + 8;
    let maxHeight = Math.max(220, spaceBelow);

    if (spaceBelow < Math.min(MENU_EST_HEIGHT, 280) && spaceAbove > spaceBelow) {
      const actualH = Math.min(MENU_EST_HEIGHT, spaceAbove);
      top = Math.max(pad, rect.top - actualH - 8);
      maxHeight = Math.max(220, spaceAbove);
    }

    setCoords({ top, left, width: menuWidth, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    computeCoords();

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerWrapRef.current &&
        !triggerWrapRef.current.contains(target) &&
        portalMenuRef.current &&
        !portalMenuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleReposition = () => computeCoords();

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, computeCoords]);

  const activeColumns = columns.filter((c) => selectedColKeys.includes(c.key));
  const safeRows = Array.isArray(data) ? data : [];

  const handleExportPdf = async () => {
    setLoadingType('pdf');
    setOpen(false);
    try {
      if (elementIdToPrint) {
        await PrintEngine.print({
          elementId: elementIdToPrint,
          title,
          pageSize,
          orientation,
        });
        toast.success(`تم فتح الطباعة الملكية / PDF (${title}) بنجاح`);
      } else {
        const ok = await ExportEngine.exportPdf({
          title,
          subtitle,
          filename,
          columns: activeColumns,
          data: safeRows,
          summaryKpis,
          periodLabel,
          branchName,
          currency,
        });
        if (ok) {
          toast.success(`تم تجهيز مستند PDF الملكي (${title}) للطباعة والحفظ`);
        } else {
          toast.error('حدث خطأ أثناء تصدير مستند PDF الملكي');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'فشل تصدير PDF الملكي');
    } finally {
      setLoadingType(null);
    }
  };

  const handleExportExcel = async () => {
    setLoadingType('excel');
    setOpen(false);
    try {
      const ok = await ExportEngine.exportExcel({
        title,
        subtitle,
        filename,
        columns: activeColumns,
        data: safeRows,
        summaryKpis,
        periodLabel,
        branchName,
        currency,
      });
      if (ok) {
        toast.success(`تم تصدير ملف Excel الملكي (${title}) بنجاح`);
      } else {
        toast.error('حدث خطأ أثناء تصدير ملف الإكسل الملكي');
      }
    } catch (err: any) {
      toast.error(err?.message || 'فشل التصدير إلى Excel');
    } finally {
      setLoadingType(null);
    }
  };

  const handleExportCsv = async () => {
    setLoadingType('csv');
    setOpen(false);
    try {
      const ok = await ExportEngine.exportCsv({
        title,
        filename,
        columns: activeColumns,
        data: safeRows,
      });
      if (ok) {
        toast.success(`تم تصدير ملف CSV (${title}) بنجاح`);
      } else {
        toast.error('حدث خطأ أثناء تصدير ملف CSV');
      }
    } catch (err: any) {
      toast.error(err?.message || 'فشل التصدير');
    } finally {
      setLoadingType(null);
    }
  };

  const handlePrint = async () => {
    setLoadingType('print');
    setOpen(false);
    try {
      if (onCustomPrint) {
        onCustomPrint();
      } else if (elementIdToPrint) {
        await PrintEngine.print({
          elementId: elementIdToPrint,
          title,
          pageSize,
          orientation,
        });
      } else {
        await ExportEngine.exportPdf({
          title,
          subtitle,
          filename,
          columns: activeColumns,
          data: safeRows,
          summaryKpis,
          periodLabel,
          branchName,
          currency,
        });
      }
    } finally {
      setLoadingType(null);
    }
  };

  const handleShareWhatsApp = () => {
    setOpen(false);
    const text = encodeURIComponent(
      `*تقرير ${title}*\nتاريخ: ${new Date().toLocaleDateString('ar-SA')}\nإجمالي السجلات: ${safeRows.length}\nالمنظومة: نظام إدهام ERP PRO`,
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const portalDropdown =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={portalMenuRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              zIndex: 9999,
            }}
            className="overflow-y-auto overflow-x-hidden rounded-2xl bg-white dark:bg-[#0c1427] border border-slate-200/95 dark:border-slate-700/90 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.42)] pb-1.5 text-xs animate-scale-in"
          >
            <div className="h-1.5 w-full bg-gradient-to-l from-indigo-600 via-amber-500 to-rose-500" />
            <div className="px-3.5 py-2.5 text-[11px] font-black text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60">
              <span>مركز الطباعة والتصدير الملكي</span>
              <span className="font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 px-2 py-0.5 rounded-md text-[10.5px] font-extrabold">
                {safeRows.length} سجل
              </span>
            </div>

            {/* 1. Royal PDF Export */}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-800 dark:text-slate-100 hover:bg-rose-50/75 dark:hover:bg-rose-950/30 transition-colors text-start group"
              onClick={handleExportPdf}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/30 group-hover:scale-105 transition-transform">
                <FileDown className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>طباعة / PDF ملكي معتمد</span>
                  <span className="text-[9.5px] bg-rose-600 text-white px-1.5 rounded font-extrabold">A4</span>
                </div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  ترويسة كحلية مذهبة، مؤشرات، تفقيط وتوقيعات
                </div>
              </div>
            </button>

            {/* 2. Royal Excel Export */}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-800 dark:text-slate-100 hover:bg-emerald-50/75 dark:hover:bg-emerald-950/30 transition-colors text-start group"
              onClick={handleExportExcel}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
                <FileSpreadsheet className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>تصدير Excel ملكي (.xlsx)</span>
                  <span className="text-[9.5px] bg-emerald-600 text-white px-1.5 rounded font-extrabold">RTL</span>
                </div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  ترويسة مدمجة، معادلات SUM وإعداد طباعة A4
                </div>
              </div>
            </button>

            {/* 3. Direct Royal Print */}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-800 dark:text-slate-100 hover:bg-sky-50/75 dark:hover:bg-sky-950/30 transition-colors text-start group"
              onClick={handlePrint}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border border-sky-500/30 group-hover:scale-105 transition-transform">
                <Printer className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-slate-900 dark:text-white">معاينة وطباعة ملكية فورية</div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  قالب رسمي معزول بدون قوائم المتصفح
                </div>
              </div>
            </button>

            {/* 4. CSV Export */}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-3.5 py-2 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start group"
              onClick={handleExportCsv}
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300/70 dark:border-slate-700 group-hover:scale-105 transition-transform">
                <FileText className="size-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 dark:text-slate-200">تصدير CSV (UTF-8)</div>
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-snug">
                  ملف نصي متوافق مع كافة المنظومات المحاسبية
                </div>
              </div>
            </button>

            <div className="border-t border-slate-100 dark:border-slate-800/80 my-1" />

            {/* 5. Column Customizer */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3.5 py-2 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
              onClick={() => {
                setOpen(false);
                setColModalOpen(true);
              }}
            >
              <Settings2 className="size-3.5 text-amber-500 shrink-0" />
              <span>
                تحديد الأعمدة المصدّرة ({selectedColKeys.length}/{columns.length})
              </span>
            </button>

            {/* 6. WhatsApp Share */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3.5 py-2 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
              onClick={handleShareWhatsApp}
            >
              <Share2 className="size-3.5 text-emerald-500 shrink-0" />
              <span>مشاركة ملخص التقرير عبر واتساب</span>
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 text-start ${className}`} ref={triggerWrapRef}>
      {/* Direct 1-Click Royal PDF Button */}
      {showQuickPdf && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200/90 bg-gradient-to-b from-rose-50 to-white px-2.5 py-2 text-xs font-extrabold text-rose-700 shadow-2xs hover:border-rose-400 hover:bg-rose-50 hover:shadow-sm transition-all dark:border-rose-800/80 dark:from-rose-950/50 dark:to-slate-900 dark:text-rose-300 dark:hover:border-rose-600 disabled:opacity-50"
          onClick={handleExportPdf}
          disabled={loadingType !== null}
          title={`تصدير وطباعة PDF ملكي رسمي (${title})`}
        >
          {loadingType === 'pdf' ? (
            <Spinner className="size-3.5" />
          ) : (
            <FileDown className="size-3.5 text-rose-600 dark:text-rose-400" />
          )}
          <span>PDF ملكي</span>
        </button>
      )}

      {/* Direct 1-Click Royal Excel Button */}
      {showQuickExcel && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50 to-white px-2.5 py-2 text-xs font-extrabold text-emerald-700 shadow-2xs hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-sm transition-all dark:border-emerald-800/80 dark:from-emerald-950/50 dark:to-slate-900 dark:text-emerald-300 dark:hover:border-emerald-600 disabled:opacity-50"
          onClick={handleExportExcel}
          disabled={loadingType !== null}
          title={`تصدير ملف Excel ملكي منسق (${title})`}
        >
          {loadingType === 'excel' ? (
            <Spinner className="size-3.5" />
          ) : (
            <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>Excel ملكي</span>
        </button>
      )}

      {/* Full Export & Print Dropdown Trigger (Portal z-[9999]) */}
      <button
        ref={dropdownBtnRef}
        type="button"
        className={`btn-secondary text-xs flex items-center gap-1.5 shadow-2xs hover:border-amber-500/70 dark:hover:border-amber-400/60 transition-all font-extrabold ${
          open ? 'ring-2 ring-indigo-500/30 border-indigo-400' : ''
        }`}
        onClick={() => setOpen((prev) => !prev)}
        disabled={loadingType !== null}
        aria-expanded={open}
        title="المزيد من خيارات الطباعة والتصدير الملكي (CSV، تخصيص الأعمدة، واتساب)"
      >
        {loadingType && loadingType !== 'pdf' && loadingType !== 'excel' ? (
          <Spinner className="size-3.5" />
        ) : (
          <Download className="size-3.5 text-amber-600 dark:text-amber-400" />
        )}
        <span>طباعة وتصدير</span>
        <ChevronDown
          className="size-3.5 text-slate-500 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {portalDropdown}

      {/* Columns Filter Modal */}
      <Modal
        open={colModalOpen}
        onClose={() => setColModalOpen(false)}
        title="تحديد أعمدة ملف التصدير"
        maxWidth="max-w-md"
        footer={
          <button
            type="button"
            className="btn-primary text-xs w-full py-2"
            onClick={() => setColModalOpen(false)}
          >
            اعتماد الأعمدة المحددة ({selectedColKeys.length})
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500">اختر الحقول التي ترغب في تضمينها في الملف:</span>
            <button
              type="button"
              className="text-xs text-indigo-600 hover:underline font-bold"
              onClick={() => setSelectedColKeys(columns.map((c) => c.key))}
            >
              تحديد الكل
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {columns.map((col) => {
              const checked = selectedColKeys.includes(col.key);
              return (
                <label
                  key={col.key}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedColKeys([...selectedColKeys, col.key]);
                      } else if (selectedColKeys.length > 1) {
                        setSelectedColKeys(selectedColKeys.filter((k) => k !== col.key));
                      }
                    }}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-bold text-slate-800 dark:text-slate-200">{col.header}</span>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};
