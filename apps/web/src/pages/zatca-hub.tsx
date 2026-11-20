import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  FileBarChart2,
  FileCheck2,
  FileText,
  KeyRound,
  QrCode,
  Send,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { dateTime, money } from '../lib/format';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { Badge, ErrorState, Loading, PageHeader, Spinner, Stat, useToast } from '../components/ui';

const ENV_META: Record<string, { label: string; color: 'amber' | 'blue' | 'green' }> = {
  SANDBOX: { label: 'بيئة التجربة (Sandbox)', color: 'amber' },
  SIMULATION: { label: 'بيئة المحاكاة (Simulation)', color: 'blue' },
  PRODUCTION: { label: 'بيئة الإنتاج الحية (Production)', color: 'green' },
};

const CSID_META: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'slate' }> = {
  NOT_ONBOARDED: { label: 'غير مهيّأ (بحاجة للربط)', color: 'amber' },
  CSR_GENERATED: { label: 'تم توليد CSR فقط', color: 'blue' },
  COMPLIANCE: { label: 'شهادة امتثال (CCSID)', color: 'blue' },
  PRODUCTION: { label: 'شهادة إنتاج رسمية (PCSID)', color: 'green' },
  EXPIRED: { label: 'شهادة منتهية الصلاحية', color: 'red' },
  REVOKED: { label: 'شهادة ملغاة', color: 'red' },
};

const STATUS_META: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'purple' }> = {
  NOT_SUBMITTED: { label: 'بانتظار الإرسال', color: 'amber' },
  READY: { label: 'جاهزة للإرسال', color: 'blue' },
  VALIDATION_FAILED: { label: 'فشل التحقق', color: 'red' },
  PENDING_SUBMISSION: { label: 'قيد الانتظار', color: 'amber' },
  SUBMITTED: { label: 'تم الإرسال', color: 'blue' },
  CLEARED: { label: 'مُخلَّصة (Cleared)', color: 'green' },
  REPORTED: { label: 'مُبلَّغ عنها (Reported)', color: 'green' },
  ACCEPTED: { label: 'مقبولة', color: 'green' },
  WARNING: { label: 'مقبولة بتحذير', color: 'amber' },
  REJECTED: { label: 'مرفوضة من الهيئة', color: 'red' },
  FAILED: { label: 'فشل الإرسال', color: 'red' },
  RETRY_PENDING: { label: 'بانتظار إعادة المحاولة', color: 'amber' },
};

const TYPE_AR: Record<string, string> = {
  TAX_INVOICE: 'قياسية (B2B)',
  SIMPLIFIED: 'مبسطة (B2C)',
  CREDIT_NOTE: 'إشعار دائن (381)',
  DEBIT_NOTE: 'إشعار مدين (383)',
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

  const notificationsQuery = useQuery({
    queryKey: ['zatca-notifications'],
    queryFn: () => api.get<any[]>('/zatca/notifications'),
  });

  const batchTransmit = useMutation({
    mutationFn: () => api.post<any>('/zatca/invoices/batch-transmit', {}),
    onSuccess: (data) => {
      toast.success(
        `تمت معالجة ${data.processed ?? 0} فاتورة (${data.cleared ?? 0} مُخلّصة، ${data.reported ?? 0} مُبلّغ عنها، ${data.rejected ?? 0} مرفوضة)`,
      );
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-submissions'] });
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
      qc.invalidateQueries({ queryKey: ['zatca-notifications'] });
    },
    onError: (e) => toast.error(e),
  });

  const testConn = useMutation({
    mutationFn: () => api.post<any>('/zatca/test-connection', {}),
    onSuccess: (data) => {
      if (data.reachable && data.authenticated) toast.success(data.messageAr || 'الاتصال ببوابة فاتورة ناجح والشهادة صالحة');
      else toast.error(data.messageAr || 'تعذر التحقق من المصادقة مع الهيئة');
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
    },
    onError: (e) => toast.error(e),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/zatca/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zatca-notifications'] }),
  });

  if (statusQuery.isLoading) return <Loading />;
  if (statusQuery.error) return <ErrorState error={statusQuery.error} />;

  const st = statusQuery.data ?? {};
  const kpis = st.kpis ?? {
    totalInvoices: 0,
    submittedCount: st.submittedCount ?? 0,
    acceptedCount: st.submittedCount ?? 0,
    clearedCount: 0,
    reportedCount: 0,
    rejectedCount: 0,
    pendingCount: st.pendingCount ?? 0,
    retryPendingCount: 0,
    totalValue: '0.00',
    totalVat: '0.00',
    successRate: 100,
  };

  const checklist: any[] = Array.isArray(st.checklist) ? st.checklist : [];
  const okChecksCount = checklist.filter((c) => c.ok).length;
  const readinessPct = checklist.length ? Math.round((okChecksCount / checklist.length) * 100) : 100;

  const submissions: any[] = Array.isArray(submissionsQuery.data)
    ? submissionsQuery.data
    : ((submissionsQuery.data as any)?.data ?? []);
  const notifications: any[] = Array.isArray(notificationsQuery.data)
    ? notificationsQuery.data
    : ((notificationsQuery.data as any)?.data ?? []);

  const envMeta = ENV_META[st.environment] ?? ENV_META.SANDBOX;
  const csidMeta = CSID_META[st.csidStatus] ?? CSID_META.NOT_ONBOARDED;

  const daysUntilExpiry = st.csidExpiresAt
    ? Math.max(0, Math.ceil((new Date(st.csidExpiresAt).getTime() - Date.now()) / 86400_000))
    : null;

  const statusDonutData = [
    { name: 'مُخلَّصة B2B', value: Number(kpis.clearedCount || 0), color: '#10b981' },
    { name: 'مُبلَّغ عنها B2C', value: Number(kpis.reportedCount || 0), color: '#0ea5e9' },
    { name: 'بانتظار الإرسال', value: Number(kpis.pendingCount || 0), color: '#f59e0b' },
    { name: 'إعادة محاولة', value: Number(kpis.retryPendingCount || 0), color: '#8b5cf6' },
    { name: 'مرفوضة / فشل', value: Number(kpis.rejectedCount || 0), color: '#f43f5e' },
  ];

  const byTypeData = (Array.isArray(st.invoicesByType) ? st.invoicesByType : []).map((t: any) => ({
    name: TYPE_AR[t.invoiceType] || t.invoiceType,
    value: Number(t.n || 0),
  }));

  const dailyCharts = Array.isArray(st.charts?.daily) ? st.charts.daily : [];
  const monthlyCharts = Array.isArray(st.charts?.monthly) ? st.charts.monthly : [];
  const branchCharts = Array.isArray(st.charts?.byBranch) ? st.charts.byBranch : [];

  return (
    <div className="space-y-6 animate-fade-in pb-14">
      <PageHeader
        title="الفوترة الإلكترونية – هيئة الزكاة (ZATCA Fatoora Phase 2)"
        subtitle="لوحة القيادة التنفيذية لمرحلة الربط والتكامل المباشر (Clearance & Reporting)، إدارة أجهزة EGS، الشهادات الرقمية، ومراقبة حالة الامتثال."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="ملخص لوحة الفوترة الإلكترونية وسجل الإرسال (ZATCA Phase 2)"
              columns={[
                { key: 'invoiceNo', header: 'رقم الفاتورة', width: 16 },
                { key: 'clientName', header: 'العميل', width: 22 },
                { key: 'mode', header: 'المسار', width: 14 },
                { key: 'environment', header: 'البيئة', width: 12 },
                { key: 'status', header: 'الحالة', width: 14 },
                { key: 'responseCode', header: 'كود الهيئة', width: 14 },
                { key: 'responseMessage', header: 'رسالة الهيئة', width: 32 },
              ]}
              data={submissions}
            />
            <button
              className="btn-secondary text-sm"
              disabled={testConn.isPending}
              onClick={() => testConn.mutate()}
            >
              {testConn.isPending ? <Spinner /> : <Wifi className="size-4 text-sky-600" />}
              اختبار الاتصال بالهيئة
            </button>
            <Link to="/zatca/settings" className="btn-secondary text-sm">
              <Settings className="size-4 text-slate-600" /> إعدادات المنشأة و EGS
            </Link>
            <Link to="/zatca/onboarding" className="btn-secondary text-sm">
              <KeyRound className="size-4 text-emerald-600" /> معالج الربط (7 خطوات)
            </Link>
            <button
              className="btn-primary text-sm shadow-sm"
              disabled={batchTransmit.isPending || Number(kpis.pendingCount || 0) === 0}
              onClick={() => batchTransmit.mutate()}
            >
              {batchTransmit.isPending ? <Spinner /> : <Send className="size-4" />}
              إرسال المعلقة للهيئة ({kpis.pendingCount ?? 0})
            </button>
          </div>
        }
      />

      {/* Connection, Environment & Certificate Banner */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          st.csidStatus === 'PRODUCTION'
            ? 'border-emerald-300 bg-emerald-50/85 dark:border-emerald-800/80 dark:bg-emerald-950/35'
            : 'border-amber-300 bg-amber-50/85 dark:border-amber-800/80 dark:bg-amber-950/35'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${
              st.csidStatus === 'PRODUCTION' ? 'bg-emerald-600' : 'bg-amber-500'
            }`}
          >
            {st.csidStatus === 'PRODUCTION' ? <ShieldCheck className="size-6" /> : <ShieldAlert className="size-6" />}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                حالة الربط مع بوابة فاتورة (ZATCA Phase 2)
              </h2>
              <Badge color={envMeta.color}>{envMeta.label}</Badge>
              <Badge color={csidMeta.color}>{csidMeta.label}</Badge>
              <Badge color={st.connectionStatus === 'CONNECTED' ? 'green' : 'amber'}>
                {st.connectionStatus === 'CONNECTED' ? 'متصل بالبوابة' : 'بحاجة لاختبار الاتصال'}
              </Badge>
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
              {st.transmissionNoteAr}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300 pt-0.5">
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="size-3.5 text-indigo-600" />
                الأجهزة النشطة: {st.activeDeviceCount ?? 0}
              </span>
              {daysUntilExpiry !== null && (
                <span className={`inline-flex items-center gap-1.5 ${daysUntilExpiry < 30 ? 'text-rose-600' : ''}`}>
                  <Clock className="size-3.5" />
                  صلاحية الشهادة: متبقي {daysUntilExpiry} يوماً
                </span>
              )}
              {st.lastSubmissionAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="size-3.5 text-emerald-600" />
                  آخر إرسال: {dateTime(st.lastSubmissionAt)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link to="/zatca/invoices" className="btn-secondary text-xs">
            <FileText className="size-4 text-indigo-600" /> مركز الفواتير والسجلات
          </Link>
          <Link to="/zatca/reports" className="btn-secondary text-xs">
            <FileBarChart2 className="size-4 text-emerald-600" /> التقارير الضريبية (14 تقرير)
          </Link>
          <Link to="/zatca/qr-validator" className="btn-secondary text-xs">
            <QrCode className="size-4 text-violet-600" /> فاحص QR 9-Tags
          </Link>
        </div>
      </div>

      {/* Executive KPIs Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="إجمالي الفواتير المرحّلة"
          value={String(kpis.totalInvoices ?? 0)}
          hint={`المقبولة: ${kpis.acceptedCount ?? 0} | المعلقة: ${kpis.pendingCount ?? 0}`}
          tone="blue"
          icon={FileText}
        />
        <Stat
          label="المُخلَّصة (B2B) والمُبلَّغ عنها (B2C)"
          value={`${kpis.clearedCount ?? 0} / ${kpis.reportedCount ?? 0}`}
          hint={`نسبة نجاح الإرسال: ${kpis.successRate ?? 100}%`}
          tone="green"
          icon={CheckCircle2}
        />
        <Stat
          label="بانتظار الإرسال / إعادة المحاولة"
          value={`${kpis.pendingCount ?? 0} / ${kpis.retryPendingCount ?? 0}`}
          hint={`المرفوضة / الفاشلة: ${kpis.rejectedCount ?? 0}`}
          tone={Number(kpis.rejectedCount || 0) > 0 ? 'red' : 'amber'}
          icon={AlertTriangle}
        />
        <Stat
          label="إجمالي قيمة الفواتير والضريبة"
          value={`${money(kpis.totalValue ?? 0)} SAR`}
          hint={`ضريبة القيمة المضافة: ${money(kpis.totalVat ?? 0)} SAR`}
          tone="purple"
          icon={ShieldCheck}
        />
      </div>

      {/* Interactive Analytics — 4 Core Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ExecutiveChartCard
          title="توزيع حالات الفواتير الإلكترونية (ZATCA Status)"
          subtitle="نسبة الفواتير المخَلَّصة والمُبلَّغ عنها مقابل المعلقة والمرفوضة"
          icon={ShieldCheck}
          accent="emerald"
        >
          <ExecutiveDonutChart
            data={statusDonutData}
            centerValue={`${kpis.successRate ?? 100}%`}
            centerLabel="نسبة القبول"
            height={250}
            unit="فاتورة"
          />
        </ExecutiveChartCard>

        <ExecutiveChartCard
          title="حركة الإرسال اليومي إلى بوابة فاتورة"
          subtitle="مقارنة الفواتير المرسلة والمقبولة والمرفوضة خلال آخر 30 يوماً"
          icon={Activity}
          accent="indigo"
        >
          <ExecutiveBarChart
            categories={dailyCharts.map((d: any) => d.day)}
            series={[
              { name: 'مقبولة', data: dailyCharts.map((d: any) => Number(d.accepted || 0)), color: '#10b981' },
              { name: 'مرفوضة', data: dailyCharts.map((d: any) => Number(d.rejected || 0)), color: '#f43f5e' },
            ]}
            height={250}
            unit=""
            emptyText="لا توجد عمليات إرسال خلال آخر 30 يوماً بعد"
          />
        </ExecutiveChartCard>

        <ExecutiveChartCard
          title="إجمالي المبيعات وضريبة القيمة المضافة شهرياً"
          subtitle="تطور الفوترة الإلكترونية وضريبة VAT خلال آخر 12 شهراً"
          icon={FileBarChart2}
          accent="cyan"
        >
          <ExecutiveBarChart
            categories={monthlyCharts.map((m: any) => m.month)}
            series={[
              { name: 'إجمالي الفواتير', data: monthlyCharts.map((m: any) => Number(m.total || 0)), color: '#4f46e5' },
              { name: 'ضريبة VAT', data: monthlyCharts.map((m: any) => Number(m.vat || 0)), color: '#0ea5e9' },
            ]}
            height={250}
            unit="SAR"
            emptyText="لا توجد فواتير شهرية مسجلة بعد"
          />
        </ExecutiveChartCard>

        <ExecutiveChartCard
          title="توزيع أنواع المستندات والفروع"
          subtitle="الفواتير القياسية (388) والمبسطة والإشعارات الدائنة (381) والمدينة (383)"
          icon={Building2}
          accent="purple"
          footer={
            branchCharts.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-slate-700 dark:text-slate-200">
                <span>الفروع النشطة: {branchCharts.length}</span>
                <span>
                  أعلى فرع: {branchCharts[0]?.branchName} ({money(branchCharts[0]?.total || 0)} SAR)
                </span>
              </div>
            )
          }
        >
          <ExecutiveDonutChart
            data={byTypeData}
            centerValue={String(kpis.totalInvoices ?? 0)}
            centerLabel="إجمالي المستندات"
            height={250}
            unit="مستند"
          />
        </ExecutiveChartCard>
      </div>

      {/* Compliance Readiness Checklist + Live Notifications Center */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                قائمة جاهزية الامتثال للمرحلة الثانية (Phase 2 Checklist)
              </h3>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                تحقق آلي من استيفاء جميع متطلبات هيئة الزكاة قبل الإرسال الفعلي
              </p>
            </div>
            <Badge color={readinessPct === 100 ? 'green' : 'amber'}>
              جاهزية {readinessPct}% ({okChecksCount}/{checklist.length})
            </Badge>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${readinessPct === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${readinessPct}%` }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checklist.map((item: any) => (
              <div
                key={item.key}
                className={`rounded-xl border p-3.5 flex items-start gap-3 ${
                  item.ok
                    ? 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                    : 'border-amber-200/90 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20'
                }`}
              >
                {item.ok ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
                ) : (
                  <XCircle className="size-5 shrink-0 text-amber-600 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{item.labelAr}</div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">{item.hintAr}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications Panel */}
        <div className="xl:col-span-5 card p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="size-5 text-indigo-600" />
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                تنبيهات وإشعارات هيئة الزكاة
              </h3>
            </div>
            <Badge color="blue">{notifications.filter((n) => !n.isRead).length} غير مقروء</Badge>
          </div>

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pl-1">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm font-medium text-slate-500">
                لا توجد تنبيهات نشطة حالياً — جميع العمليات مستقرة.
              </div>
            ) : (
              notifications.slice(0, 8).map((n: any) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3 text-xs transition-colors ${
                    n.isRead
                      ? 'border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40 opacity-75'
                      : n.severity === 'CRITICAL'
                        ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30'
                        : n.severity === 'WARNING'
                          ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30'
                          : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/25'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold text-slate-900 dark:text-white leading-snug">{n.titleAr}</span>
                    {!n.isRead && (
                      <button
                        className="text-[11px] font-bold text-indigo-600 hover:underline shrink-0"
                        onClick={() => markRead.mutate(n.id)}
                      >
                        تحديد كمقروء
                      </button>
                    )}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{n.messageAr}</p>
                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                    <span>{dateTime(n.createdAt)}</span>
                    {n.invoiceId && (
                      <Link to={`/zatca/invoices/${n.invoiceId}`} className="font-bold text-indigo-600 hover:underline">
                        عرض تفاصيل الفاتورة ←
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Operations Log */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              أحدث عمليات الإرسال والربط مع بوابة فاتورة
            </h3>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mt-0.5">
              سجل تدقيقي فوري لآخر 10 محاولات تخليص (Clearance) وإبلاغ (Reporting)
            </p>
          </div>
          <Link to="/zatca/invoices" className="btn-secondary text-xs">
            <FileCheck2 className="size-4" /> فتح السجل الكامل
            <ArrowLeft className="size-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-900/60 text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-200/80 dark:border-slate-800">
                <th className="py-3 px-4 text-right">رقم الفاتورة</th>
                <th className="py-3 px-4 text-right">العميل</th>
                <th className="py-3 px-4 text-right">المسار والبيئة</th>
                <th className="py-3 px-4 text-right">المحاولة</th>
                <th className="py-3 px-4 text-right">الحالة</th>
                <th className="py-3 px-4 text-right">كود ورد الهيئة</th>
                <th className="py-3 px-4 text-right">التاريخ</th>
                <th className="py-3 px-4 text-center">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {submissions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm font-medium text-slate-500">
                    لا توجد عمليات إرسال مسجلة بعد. انتقل إلى شاشة الفواتير لإرسال أول فاتورة إلكترونية.
                  </td>
                </tr>
              ) : (
                submissions.slice(0, 10).map((s: any) => {
                  const stMeta = STATUS_META[s.status] ?? { label: s.status, color: 'slate' as const };
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white font-mono">
                        {s.invoiceNo}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">
                        {s.clientName || '—'}
                      </td>
                      <td className="py-3 px-4 text-xs font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          <Badge color={s.mode === 'CLEARANCE' ? 'blue' : 'purple'}>
                            {s.mode === 'CLEARANCE' ? 'تخليص B2B' : 'إبلاغ B2C'}
                          </Badge>
                          <span className="text-slate-500">{s.environment}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                        #{s.attemptNo ?? 1}
                      </td>
                      <td className="py-3 px-4">
                        <Badge color={stMeta.color}>{stMeta.label}</Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300 max-w-xs">
                        <div className="font-mono font-bold text-[11px]">{s.responseCode || `HTTP ${s.httpStatusCode || '—'}`}</div>
                        <div className="mt-0.5 leading-snug">{s.responseMessage || s.errorMessage || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {dateTime(s.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Link
                          to={`/zatca/invoices/${s.invoiceId}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                        >
                          ملف الفاتورة (7 تبويبات)
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
