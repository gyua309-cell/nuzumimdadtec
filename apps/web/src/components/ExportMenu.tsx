/**
 * IDHAM ERP - Universal Export & Print Menu Component
 * Provides a standardized dropdown menu for Print, Excel (.xlsx), CSV, and PDF
 * across all ERP screens and reports.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Download, FileDown, FileSpreadsheet, FileText, Printer, Share2, ChevronDown, Settings2 } from 'lucide-react';
import { ExportEngine, ExportColumnDef } from '../engine/export-engine';
import { PrintEngine, PaperSize, PageOrientation } from '../engine/print-engine';
import { Modal, Spinner, useToast } from './ui';

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
  const [loadingType, setLoadingType] = useState<'excel' | 'pdf' | 'csv' | 'print' | null>(null);
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

  const handleExportPdf = async () => {
    setLoadingType('pdf');
    setOpen(false);
    try {
      if (elementIdToPrint) {
        // If an element ID is given, print that element directly (e.g., formal invoice/receipt)
        await PrintEngine.print({
          elementId: elementIdToPrint,
          title,
          pageSize,
          orientation,
        });
        toast.success(`تم فتح مستند PDF (${title}) للطباعة والحفظ`);
      } else {
        const ok = await ExportEngine.exportPdf({
          title,
          filename,
          columns: activeColumns,
          data,
          periodLabel,
          branchName,
          currency,
        });
        if (ok) {
          toast.success(`تم إنشاء مستند PDF معتمد (${title}) بنجاح`);
        } else {
          toast.error('حدث خطأ أثناء تصدير مستند PDF');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل تصدير PDF');
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
        // Fallback to table print via ExportEngine PDF/Print wrapper
        await ExportEngine.exportPdf({
          title,
          filename,
          columns: activeColumns,
          data,
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
    const text = encodeURIComponent(`*تقرير ${title}*\nتاريخ: ${new Date().toLocaleDateString('ar-SA')}\nإجمالي السجلات: ${data.length}\nالمنظومة: نظام إدهام ERP`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className={`relative inline-block text-start ${className}`} ref={menuRef}>
      <button
        type="button"
        className="btn-secondary text-xs flex items-center gap-2 shadow-2xs hover:border-amber-500/60 dark:hover:border-amber-400/50 transition-all font-semibold"
        onClick={() => setOpen(!open)}
        disabled={loadingType !== null}
        title="طباعة وتصدير البيانات بعدة صيغ (PDF, Excel, CSV)"
      >
        {loadingType ? (
          <Spinner className="size-3.5" />
        ) : (
          <Download className="size-3.5 text-amber-600 dark:text-amber-400" />
        )}
        <span>طباعة وتصدير</span>
        <ChevronDown className="size-3 text-slate-400 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div className="absolute end-0 mt-1.5 w-68 overflow-hidden rounded-2xl bg-white dark:bg-[#0c1427] border border-slate-200/90 dark:border-slate-800 shadow-2xl z-50 pb-1.5 text-xs animate-scale-in">
          <div className="h-1 w-full bg-gradient-to-l from-amber-500 via-sky-500 to-emerald-500" />
          <div className="px-3.5 py-2 text-[10.5px] font-black text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span>خيارات الطباعة والتصدير</span>
            <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-300 font-bold">{data.length} سجل</span>
          </div>

          {/* 1. PDF Export */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-colors text-start group"
            onClick={handleExportPdf}
          >
            <div className="flex size-7.5 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/30 group-hover:scale-105 transition-transform">
              <FileDown className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>تصدير مستند PDF</span>
                <span className="text-[9px] bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1 rounded font-bold">A4</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">مستند رسمي معتمد بختم وترويسة ومجاميع</div>
            </div>
          </button>

          {/* 2. Excel Export */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors text-start group"
            onClick={handleExportExcel}
          >
            <div className="flex size-7.5 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/30 group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>تصدير Excel (.xlsx)</span>
                <span className="text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1 rounded font-bold">RTL</span>
              </div>
              <div className="text-[10px] text-slate-400 truncate">منسق محاسبياً مع معادلات SUM وتجميد العناوين</div>
            </div>
          </button>

          {/* 3. Direct Print */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-700 dark:text-slate-200 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 transition-colors text-start group"
            onClick={handlePrint}
          >
            <div className="flex size-7.5 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400 border border-sky-500/30 group-hover:scale-105 transition-transform">
              <Printer className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 dark:text-white">معاينة وطباعة فورية</div>
              <div className="text-[10px] text-slate-400 truncate">طباعة نظيفة A4 أو طابعة إيصالات حرارية</div>
            </div>
          </button>

          {/* 4. CSV Export */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3.5 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start group"
            onClick={handleExportCsv}
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-300/60 dark:border-slate-700 group-hover:scale-105 transition-transform">
              <FileText className="size-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 dark:text-slate-200">تصدير CSV (UTF-8)</div>
              <div className="text-[10px] text-slate-400 truncate">ملف نصي متوافق مع كافة المنظومات المحاسبية</div>
            </div>
          </button>

          <div className="border-t border-slate-100 dark:border-slate-800/80 my-1" />

          {/* 5. Column Customizer */}
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={() => {
              setOpen(false);
              setColModalOpen(true);
            }}
          >
            <Settings2 className="size-3.5 text-amber-500" />
            <span>تحديد الأعمدة المصدّرة ({selectedColKeys.length}/{columns.length})</span>
          </button>

          {/* 6. WhatsApp Share */}
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-start"
            onClick={handleShareWhatsApp}
          >
            <Share2 className="size-3.5 text-emerald-500" />
            <span>مشاركة ملخص التقرير عبر واتساب</span>
          </button>
        </div>
      )}

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
              className="text-xs text-cyan-600 hover:underline font-bold"
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
                      } else {
                        if (selectedColKeys.length > 1) {
                          setSelectedColKeys(selectedColKeys.filter((k) => k !== col.key));
                        }
                      }
                    }}
                    className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{col.header}</span>
                </label>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};
