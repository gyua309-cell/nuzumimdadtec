import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCode,
  FileText,
  KeyRound,
  QrCode,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { dateTime } from '../lib/format';
import { Badge, ErrorState, Loading, PageHeader, Spinner, Stat, useToast } from '../components/ui';

const ENV_LABEL: Record<string, string> = {
  SANDBOX: 'بيئة التجربة (Sandbox)',
  SIMULATION: 'بيئة المحاكاة (Simulation)',
  PRODUCTION: 'بيئة الإنتاج الحية (Production)',
};

const CSID_LABEL: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' }> = {
  NOT_ONBOARDED: { label: 'غير مسجّل (بحاجة لتهيئة)', color: 'amber' },
  COMPLIANCE: { label: 'شهادة امتثال (CCSID)', color: 'blue' },
  PRODUCTION: { label: 'شهادة إنتاج معتمدة (PCSID)', color: 'green' },
  EXPIRED: { label: 'شهادة منتهية الصلاحية', color: 'red' },
};

const STATUS_LABEL: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'slate' }> = {
  NOT_SUBMITTED: { label: 'بانتظار الإرسال', color: 'amber' },
  CLEARED: { label: 'مُعتمدة رسمياً (Cleared)', color: 'green' },
  REPORTED: { label: 'مُبلّغ عنها (Reported)', color: 'green' },
  REJECTED: { label: 'مرفوضة من الهيئة', color: 'red' },
  WARNING: { label: 'مقبولة بتحذير', color: 'amber' },
};

export function ZatcaHubPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['zatca-status'],
    queryFn: () => api.get<any>('/zatca/status'),
  });

  const submissionsQuery = useQuery({
    queryKey: ['zatca-submissions'],
    queryFn: () => api.get<any[]>('/zatca/submissions'),
  });

  const batchTransmit = useMutation({
    mutationFn: () => api.post<any>('/zatca/invoices/batch-transmit', {}),
    onSuccess: (data) => {
      toast.success(`تم بنجاح اعتماد وإرسال ${data.processed} فواتير للهيئة (${data.cleared} معتمدة B2B، ${data.reported} مبلّغ عنها B2C)`);
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-submissions'] });
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
    },
    onError: (e) => toast.error(e),
  });

  if (statusQuery.isLoading) return <Loading />;
  if (statusQuery.error) return <ErrorState error={statusQuery.error} />;

  const st = statusQuery.data;
  const submissions = submissionsQuery.data || [];
  const csidMeta = CSID_LABEL[st.csidStatus] ?? { label: st.csidStatus, color: 'amber' };
  const okChecksCount = st.checklist.filter((c: any) => c.ok).length;
  const totalChecks = st.checklist.length;
  const isAllReady = okChecksCount === totalChecks;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        title="مركز قيادة الربط مع هيئة الزكاة والضريبة والجمارك (ZATCA)"
        subtitle="إدارة منظومة الفوترة الإلكترونية الوطنية (المرحلة 1: الإصدار والحفظ + المرحلة 2: الربط والتكامل المباشر) وشهادات الامتثال والإنتاج CSID."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/zatca/onboarding" className="btn-secondary text-sm">
              <KeyRound className="size-4 text-emerald-600" /> معالج التهيئة (CSID)
            </Link>
            <button
              className="btn-primary text-sm shadow-sm"
              disabled={batchTransmit.isPending || st.pendingCount === 0}
              onClick={() => batchTransmit.mutate()}
            >
              {batchTransmit.isPending ? <Spinner /> : <Send className="size-4" />}
              اعتماد الفواتير المعلقة ({st.pendingCount})
            </button>
          </div>
        }
      />

      {/* Top Banner */}
      <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm leading-relaxed ${
        st.csidStatus === 'PRODUCTION'
          ? 'border-emerald-300 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-amber-300 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      }`}>
        <div className={`mt-0.5 rounded-xl p-2 ${
          st.csidStatus === 'PRODUCTION' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
        }`}>
          {st.csidStatus === 'PRODUCTION' ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 font-bold text-base">
            <span>{st.csidStatus === 'PRODUCTION' ? 'منظومة ZATCA مفعّلة ومعتمدة بالكامل (المرحلة الثانية)' : 'تنبيه منظومة الربط والتكامل'}</span>
            <Badge color={csidMeta.color}>{csidMeta.label}</Badge>
            <Badge color="blue">{ENV_LABEL[st.environment] ?? st.environment}</Badge>
          </div>
          <p className="mt-1 text-xs opacity-90">{st.transmissionNoteAr}</p>
        </div>
      </div>

      {/* Primary KPI Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="حالة شهادة الربط (CSID)"
          value={csidMeta.label}
          tone={csidMeta.color}
          icon={ShieldCheck}
          hint={st.csidExpiresAt ? `صالحة حتى: ${dateTime(st.csidExpiresAt)}` : 'غير مسجلة'}
        />
        <Stat
          label="فواتير معتمدة ومبلّغة"
          value={st.submittedCount}
          tone="green"
          icon={CheckCircle2}
          hint="معتمدة رسمياً وموثقة لدى الهيئة"
        />
        <Stat
          label="فواتير معلقة بانتظار الإرسال"
          value={st.pendingCount}
          tone={st.pendingCount > 0 ? 'amber' : 'slate'}
          icon={AlertTriangle}
          hint="فواتير مرحّلة محلياً"
        />
        <Stat
          label="معايير الامتثال والجاهزية"
          value={`${okChecksCount} من ${totalChecks}`}
          tone={isAllReady ? 'green' : 'amber'}
          icon={Sparkles}
          hint={isAllReady ? 'جاهزية كاملة 100%' : 'بحاجة لاستكمال بعض المعايير'}
        />
      </div>

      {/* Fast Navigation Quick-Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/zatca/invoices"
          className="card group flex flex-col justify-between p-5 transition-all hover:border-emerald-500 hover:shadow-md dark:hover:border-emerald-500"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <FileText className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="mt-4">
            <h4 className="font-bold text-slate-900 dark:text-white">فواتير المبيعات الإلكترونية</h4>
            <p className="mt-1 text-xs text-slate-500">استعراض الفواتير الضريبية والمبسطة والاعتماد الفوري.</p>
          </div>
        </Link>

        <Link
          to="/zatca/onboarding"
          className="card group flex flex-col justify-between p-5 transition-all hover:border-blue-500 hover:shadow-md dark:hover:border-blue-500"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <KeyRound className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="mt-4">
            <h4 className="font-bold text-slate-900 dark:text-white">تهيئة شهادات الربط (CSID)</h4>
            <p className="mt-1 text-xs text-slate-500">إصدار وتجديد شهادات الامتثال والإنتاج باستخدام OTP.</p>
          </div>
        </Link>

        <Link
          to="/zatca/qr-validator"
          className="card group flex flex-col justify-between p-5 transition-all hover:border-purple-500 hover:shadow-md dark:hover:border-purple-500"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-xl bg-purple-100 p-2.5 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400">
              <QrCode className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="mt-4">
            <h4 className="font-bold text-slate-900 dark:text-white">فاحص ومفسر رمز QR (TLV)</h4>
            <p className="mt-1 text-xs text-slate-500">فحص فوري وتفكيك حقول الرمز المشفر للتأكد من المعايير.</p>
          </div>
        </Link>

        <Link
          to="/reports/zakat"
          className="card group flex flex-col justify-between p-5 transition-all hover:border-amber-500 hover:shadow-md dark:hover:border-amber-500"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
              <FileCode className="size-5" />
            </span>
            <ArrowRight className="size-4 text-slate-400 transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="mt-4">
            <h4 className="font-bold text-slate-900 dark:text-white">إقرار الزكاة وضريبة الدخل</h4>
            <p className="mt-1 text-xs text-slate-500">كشف حساب الوعاء الزكوي والترحيل المحاسبي التلقائي.</p>
          </div>
        </Link>
      </div>

      {/* Main Content Sections: Checklist + Submissions */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Readiness Checklist */}
        <div className="card p-5 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">قائمة جاهزية المنظومة</h3>
              <p className="text-xs text-slate-500">متطلبات المرحلة الأولى والثانية للهيئة</p>
            </div>
            <Badge color={isAllReady ? 'green' : 'amber'}>
              {okChecksCount}/{totalChecks} مكتمل
            </Badge>
          </div>

          <ul className="mt-4 space-y-3.5">
            {st.checklist.map((c: any) => (
              <li key={c.key} className="flex items-start gap-3 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
                )}
                <div className="flex-1">
                  <div className={`font-semibold ${c.ok ? 'text-slate-800 dark:text-slate-200' : 'text-rose-700 dark:text-rose-400'}`}>
                    {c.labelAr}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.hintAr}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            <strong>ملاحظة للمدقق المالي:</strong> يتم الحفظ المشفر لكافة تجزئات الفواتير السابقة (PIH Chaining) لمنع أي تعديل أو تلاعب في التسلسل وفقاً للأنظمة السعودية.
          </div>
        </div>

        {/* Recent Submissions History */}
        <div className="card overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-white">
            <div className="flex items-center gap-2">
              <span>سجل عمليات الاعتماد والربط المباشر (Submissions Log)</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {submissions.length}
              </span>
            </div>
            <button
              onClick={() => submissionsQuery.refetch()}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
            >
              <RefreshCw className={`size-3.5 ${submissionsQuery.isFetching ? 'animate-spin' : ''}`} /> تحديث
            </button>
          </div>

          {submissions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              لا توجد عمليات إرسال سابقة بعد. استخدم زر «اعتماد الفواتير المعلقة» لإرسال أول دفعة.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[460px]">
              <table className="table">
                <thead>
                  <tr>
                    <th>تاريخ العملية</th>
                    <th>رقم الفاتورة</th>
                    <th>نوع الربط</th>
                    <th>الحالة لدى الهيئة</th>
                    <th>تجزئة الفاتورة (SHA-256)</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.slice(0, 15).map((sub: any) => (
                    <tr key={sub.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                      <td className="num text-xs whitespace-nowrap">{dateTime(sub.createdAt)}</td>
                      <td className="font-semibold num text-slate-900 dark:text-white">{sub.invoiceNo}</td>
                      <td>
                        <Badge color={sub.mode === 'CLEARANCE' ? 'blue' : 'purple'}>
                          {sub.mode === 'CLEARANCE' ? 'اعتماد قياسي (Clearance)' : 'إبلاغ مبسط (Reporting)'}
                        </Badge>
                      </td>
                      <td>
                        <Badge color={STATUS_LABEL[sub.status]?.color as any}>
                          {STATUS_LABEL[sub.status]?.label ?? sub.status}
                        </Badge>
                      </td>
                      <td className="num text-xs font-mono text-slate-500 max-w-[140px] truncate" title={sub.requestHash}>
                        {sub.requestHash ? `${sub.requestHash.substring(0, 16)}...` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
