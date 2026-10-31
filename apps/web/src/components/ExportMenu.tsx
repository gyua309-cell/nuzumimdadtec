/**
 * IDHAM ERP - Universal Export & Print Menu Component
 * Provides a standardized dropdown menu for Print, Excel (.xlsx), CSV, and PDF
 * across all ERP screens and reports.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, Share2, ChevronDown, Settings2 } from 'lucide-react';
import { ExportEngine, ExportColumnDef } from '../engine/export-engine';
import { PrintEngine, PaperSize, PageOrientation } from '../engine/print-engine';
import { Spinner, useToast } from './ui';

export interface ExportMenuProps {
  title: string;
  columns: ExportColumnDef[];
  data: Array<Record<string, any>>;
  filename?: string;
  periodLabel?: string;
  branchName?: string;
  currency?: string;
  elementIdToPrint?: string;
  pageSize?: PaperSize;
  orientation?: PageOrientation;
  onCustomPrint?: () => void;
  className?: string;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  title,
  columns,
  data,
  filename,
  periodLabel,
  branchName,
  currency = 'SAR',
  elementIdToPrint,
  pageSize = 'A4',
  orientation = 'portrait',
  onCustomPrint,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [loadingType, setLoadingType] = useState<'excel' | 'csv' | 'print' | null>(null);
  const [colModalOpen, setColModalOpen] = useState(false);
  const [selectedColKeys, setSelectedColKeys] = useState<string[]>(columns.map((c) => c.key));

  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    setSelectedColKeys(columns.map((c) => c.key));
  }, [columns]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const activeColumns = columns.filter((c) => selectedColKeys.includes(c.key));

  const handleExportExcel = async () => {
    setLoadingType('excel');
    setOpen(false);
    try {
      const ok = await ExportEngine.exportExcel({
        title,
        filename,
        columns: activeColumns,
        data,
        periodLabel,
        branchName,
        currency,
      });
      if (ok) {
        toast.success(`تم تصدير ملف إكسل (${title}) بنجاح`);
      } else {
        toast.error('حدث خطأ أثناء تصدير ملف الإكسل');
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل التصدير');
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
        data,
      });
      if (ok) {
        toast.success(`تم تصدير ملف CSV (${title}) بنجاح`);
      } else {
        toast.error('حدث خطأ أثناء تصدير ملف CSV');
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل التصدير');
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
        window.print();
      }
    } finally {
      setLoadingType(null);
    }
  };

  const handleShareWhatsApp = () => {
    setOpen(false);
    const text = encodeURIComponent(`*تقرير ${title}*\nتاريخ: ${new Date().toLocaleDateString('ar-SA')}\nإجمالي السجلات: ${data.length}\nالمنظومة: نظام إدهام ERP`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className={`relative inline-block text-start ${className}`} ref={menuRef}>
      <button
        type="button"
        className="btn-secondary text-xs flex items-center gap-1.5 shadow-xs transition-colors hover:border-brand-500"
        onClick={() => setOpen(!open)}
        disabled={loadingType !== null}
      >
        {loadingType ? (
          <Spinner className="size-3.5" />
        ) : (
          <Download className="size-3.5 text-brand-600 dark:text-brand-400" />
        )}
        <span>طباعة وتصدير</span>
        <ChevronDown className="size-3 text-slate-400 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div className="absolute end-0 mt-1.5 w-60 overflow-hidden rounded-2xl bg-white dark:bg-[#0c1427] border border-slate-200 dark:border-slate-800 shadow-2xl z-50 pb-1.5 text-xs animate-scale-in">
          <div className="h-1 w-full bg-gradient-to-l from-amber-400 via-cyan-500 to-emerald-500" />
          <div className="px-3 py-2 text-[10.5px] font-extrabold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
            خيارات الطباعة والتصدير ({data.length} سجل)
          </div>

          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={handlePrint}
          >
            <Printer className="size-4 text-blue-600" />
            <div className="flex-1">
              <div className="font-semibold">طباعة المستند / تقرير</div>
              <div className="text-[10px] text-slate-400">معاينة وطباعة A4 / A5 / حراري</div>
            </div>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={handleExportExcel}
          >
            <FileSpreadsheet className="size-4 text-emerald-600" />
            <div className="flex-1">
              <div className="font-semibold">تصدير Excel (.xlsx)</div>
              <div className="text-[10px] text-slate-400">منسق RTL مع معادلات المجاميع</div>
            </div>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={handleExportCsv}
          >
            <FileText className="size-4 text-slate-500" />
            <div className="flex-1">
              <div className="font-semibold">تصدير CSV (UTF-8)</div>
              <div className="text-[10px] text-slate-400">نصي متوافق مع البرامج الحسابية</div>
            </div>
          </button>

          <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={() => {
              setOpen(false);
              setColModalOpen(true);
            }}
          >
            <Settings2 className="size-3.5 text-amber-500" />
            <span>تحديد الأعمدة المصدّرة ({selectedColKeys.length}/{columns.length})</span>
          </button>

          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={handleShareWhatsApp}
          >
            <Share2 className="size-3.5 text-green-500" />
            <span>مشاركة عبر واتساب</span>
          </button>
        </div>
      )}

      {/* Columns Filter Modal */}
      {colModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-sm">تحديد أعمدة ملف التصدير</h3>
              <button
                type="button"
                className="text-xs text-brand-600 hover:underline"
                onClick={() => setSelectedColKeys(columns.map((c) => c.key))}
              >
                تحديد الكل
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
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
                        } else {
                          if (selectedColKeys.length > 1) {
                            setSelectedColKeys(selectedColKeys.filter((k) => k !== col.key));
                          }
                        }
                      }}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="font-medium">{col.header}</span>
                  </label>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                className="btn-primary text-xs w-full py-2"
                onClick={() => setColModalOpen(false)}
              >
                اعتماد الأعمدة المحددة ({selectedColKeys.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
