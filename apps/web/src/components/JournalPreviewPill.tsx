import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Landmark, Printer, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { date, money } from '../lib/format';
import { JOURNAL_TYPE, SOURCE_MODULE_LABELS, SOURCE_TYPE_LABELS } from '../lib/labels';
import { Badge, Loading, Modal } from './ui';

export function JournalLinkBadge({
  entryId,
  entryNo,
  labelPrefix,
  compact = false,
}: {
  entryId?: string | null;
  entryNo?: string | null;
  labelPrefix?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const jeQuery = useQuery({
    queryKey: ['journal-quick-preview', entryId || entryNo],
    enabled: open && Boolean(entryId || entryNo),
    queryFn: async () => {
      if (entryId) {
        const res = await api.get<any>(`/journal-entries/${entryId}`).catch(() => null);
        if (res && res.id) return res;
      }
      const listRes = await api.get<any>('/journal-entries', { q: entryNo || entryId || '', pageSize: 20 });
      const arr: any[] = Array.isArray(listRes) ? listRes : (listRes?.data ?? []);
      return arr.find((j) => j.id === entryId || j.entryNo === entryNo) || arr[0] || null;
    },
  });

  if (!entryId && !entryNo) {
    return <span className="text-xs text-slate-400 dark:text-slate-500">—</span>;
  }

  const displayNo = entryNo || 'JE-AUTO';
  const je = jeQuery.data;
  const lines: any[] = Array.isArray(je?.lines) ? je.lines : [];

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="معاينة سند القيد المحاسبي المتولد تلقائياً"
        className={`group inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-sky-500/10 font-mono font-bold text-emerald-700 shadow-2xs transition-all hover:border-indigo-500/50 hover:from-indigo-600 hover:to-indigo-500 hover:text-white hover:shadow-sm cursor-pointer dark:border-emerald-500/35 dark:text-emerald-300 dark:hover:text-white ${
          compact ? 'px-2 py-0.5 text-[10.5px]' : 'px-2.5 py-1 text-[11px]'
        }`}
      >
        <Sparkles className="size-3 shrink-0 text-emerald-600 group-hover:text-amber-300 dark:text-emerald-400 transition-colors" />
        {labelPrefix && <span className="font-sans font-bold">{labelPrefix}:</span>}
        <span dir="ltr">{displayNo}</span>
      </button>

      {open && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          wide
          title={`سند قيد يومية آلي متزن — ${je?.entryNo || displayNo}`}
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" />
                <span>قيد مزدوج مرحّل تلقائياً في الأستاذ العام وميزان المراجعة</span>
              </div>
              <div className="flex items-center gap-2">
                {je?.id && (
                  <Link
                    to={`/acc/journals/${je.id}`}
                    onClick={() => setOpen(false)}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <ExternalLink className="size-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>فتح في دفتر اليومية</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Printer className="size-3.5" />
                  <span>طباعة السند</span>
                </button>
                <button type="button" onClick={() => setOpen(false)} className="btn-primary text-xs">
                  إغلاق
                </button>
              </div>
            </div>
          }
        >
          {jeQuery.isLoading ? (
            <Loading />
          ) : !je ? (
            <div className="p-8 text-center text-xs text-slate-500">
              تعذر العثور على تفاصيل القيد رقم <strong className="font-mono">{displayNo}</strong>.
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {/* Top Metadata Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-[#080d1a]">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">رقم القيد والفترة</div>
                  <div className="mt-0.5 font-mono font-black text-indigo-700 dark:text-indigo-300 text-sm">
                    {je.entryNo} <span className="font-sans text-[11px] font-semibold text-slate-500">({je.periodName})</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">تاريخ الترحيل</div>
                  <div className="mt-0.5 font-mono font-bold text-slate-900 dark:text-white">{date(je.entryDate)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">الوحدة والمصدر</div>
                  <div className="mt-0.5 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Landmark className="size-3.5 text-indigo-500 shrink-0" />
                    <span>{SOURCE_MODULE_LABELS[je.sourceModule] || je.sourceModule}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{SOURCE_TYPE_LABELS[je.sourceType] || JOURNAL_TYPE[je.journalType] || je.sourceType}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">حالة القيد والمرجع</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge color="green" dot>مرحّل ومتزن</Badge>
                    {je.reference && <span className="font-mono text-[10.5px] text-slate-500">{je.reference}</span>}
                  </div>
                </div>
                <div className="col-span-full border-t border-slate-200/70 pt-2 dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">البيان المحاسبي: </span>
                  <strong className="text-slate-900 dark:text-white">{je.description}</strong>
                </div>
              </div>

              {/* Balanced Debit/Credit Lines Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-800">
                <table className="table table-compact w-full">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>رمز واسم الحساب</th>
                      <th>البيان التحليلي</th>
                      <th className="text-end">مدين (SAR)</th>
                      <th className="text-end">دائن (SAR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l: any, idx: number) => {
                      const dr = Number(l.debitBase ?? l.debit ?? 0);
                      const cr = Number(l.creditBase ?? l.credit ?? 0);
                      return (
                        <tr key={l.id || idx}>
                          <td className="num text-slate-400">{l.lineNo || idx + 1}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                {l.accountCode}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-100">{l.accountNameAr}</span>
                            </div>
                          </td>
                          <td className="text-slate-600 dark:text-slate-300">{l.description || je.description}</td>
                          <td className={`num text-end font-bold ${dr > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`}>
                            {dr > 0 ? money(dr) : '—'}
                          </td>
                          <td className={`num text-end font-bold ${cr > 0 ? 'text-sky-700 dark:text-sky-400' : 'text-slate-300 dark:text-slate-600'}`}>
                            {cr > 0 ? money(cr) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="text-start font-black">إجمالي سند القيد المتوازن</td>
                      <td className="num text-end font-black text-emerald-700 dark:text-emerald-400">{money(je.totalDebitBase)}</td>
                      <td className="num text-end font-black text-sky-700 dark:text-sky-400">{money(je.totalCreditBase)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
