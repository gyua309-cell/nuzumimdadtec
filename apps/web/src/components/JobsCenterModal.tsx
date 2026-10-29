/**
 * IDHAM ERP - Jobs Center Modal & Status Button
 * Displays background jobs, real-time export progress, and file downloads.
 */

import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, AlertCircle, Clock, Download, Trash2, X, FileSpreadsheet, FileText, Database } from 'lucide-react';
import { getJobsList, clearCompletedJobs, cancelJob, downloadJobResult, BackgroundJob } from '../engine/jobs-center';
import { Modal } from './ui';

export const JobsCenterButton: React.FC = () => {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setJobs(getJobsList());
    const handleUpdate = (e: any) => {
      setJobs(e.detail || getJobsList());
    };
    window.addEventListener('idham_jobs_center_updated', handleUpdate);
    return () => window.removeEventListener('idham_jobs_center_updated', handleUpdate);
  }, []);

  const runningCount = jobs.filter((j) => j.status === 'running' || j.status === 'pending').length;

  return (
    <>
      <button
        type="button"
        className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          runningCount > 0
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        onClick={() => setOpen(true)}
        title="مركز المهام والتصدير الخلفي"
      >
        <Activity className={`size-3.5 ${runningCount > 0 ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">مركز المهام</span>
        {runningCount > 0 ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {runningCount}
          </span>
        ) : jobs.length > 0 ? (
          <span className="text-[10px] opacity-60">({jobs.length})</span>
        ) : null}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="مركز المهام والعمليات الخلفية"
        wide
        maxWidth="max-w-3xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              className="btn-secondary text-xs flex items-center gap-1.5 text-rose-600 hover:bg-rose-50"
              onClick={clearCompletedJobs}
              disabled={jobs.filter((j) => j.status === 'completed' || j.status === 'failed').length === 0}
            >
              <Trash2 className="size-3.5" /> مسح المهام المكتملة
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => setOpen(false)}>
              إغلاق
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Clock className="size-8 mx-auto opacity-40" />
              <div className="text-sm font-semibold">لا توجد مهام جارية أو منتهية حالياً</div>
              <p className="text-xs">عمليات التصدير والاستيراد الكبيرة ستظهر هنا تلقائياً مع شريط التقدم.</p>
            </div>
          ) : (
            jobs.map((job) => (
              <div
                key={job.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {job.type === 'EXPORT_EXCEL' ? (
                        <FileSpreadsheet className="size-4 text-emerald-600" />
                      ) : job.type === 'EXPORT_CSV' ? (
                        <FileText className="size-4 text-blue-600" />
                      ) : (
                        <Database className="size-4 text-indigo-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{job.title}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(job.createdAt).toLocaleTimeString('ar-SA')} •{' '}
                        {job.meta?.rowCount ? `${job.meta.rowCount} سجل` : 'مهمة نظام'}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge & Actions */}
                  <div className="flex items-center gap-2">
                    {job.status === 'running' || job.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {job.progress}%
                        </span>
                        <button
                          type="button"
                          className="btn-ghost size-7 p-0 text-rose-500"
                          onClick={() => cancelJob(job.id)}
                          title="إلغاء العملية"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : job.status === 'completed' ? (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="size-3" /> مكتمل
                        </span>
                        {job.filename && (
                          <button
                            type="button"
                            className="btn-primary text-xs h-7 px-2.5 flex items-center gap-1"
                            onClick={() => downloadJobResult(job)}
                          >
                            <Download className="size-3" /> تنزيل
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                        <AlertCircle className="size-3" /> {job.error || 'فشلت'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar for running jobs */}
                {(job.status === 'running' || job.status === 'pending') && (
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-brand-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(job.progress, 5)}%` }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </>
  );
};
