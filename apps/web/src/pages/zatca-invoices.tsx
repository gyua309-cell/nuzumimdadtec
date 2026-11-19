import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  Lock,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { date, dateTime, money } from '../lib/format';
import { ExportMenu } from '../components/ExportMenu';
import { ExportColumnDef } from '../engine/export-engine';
import { Badge, ErrorState, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';

type ViewTab =
  | 'ALL'
  | 'PENDING_ALL'
  | 'ACCEPTED_ALL'
  | 'REJECTED_ALL'
  | 'RETRY_QUEUE'
  | 'TAX_INVOICE'
  | 'SIMPLIFIED'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'OPERATIONS_LOG'
  | 'ERRORS_LOG';

const STATUS_LABEL: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'slate' | 'purple' }> = {
  DRAFT: { label: 'مسودة', color: 'slate' },
  NOT_SUBMITTED: { label: 'بانتظار الإرسال', color: 'amber' },
  READY: { label: 'جاهزة للإرسال', color: 'blue' },
  VALIDATION_FAILED: { label: 'فشل التحقق', color: 'red' },
  PENDING_SUBMISSION: { label: 'قيد الانتظار', color: 'amber' },
  SUBMITTED: { label: 'تم الإرسال', color: 'blue' },
  PROCESSING: { label: 'قيد المعالجة', color: 'blue' },
  CLEARED: { label: 'مُخلَّصة (Cleared)', color: 'green' },
  REPORTED: { label: 'مُبلَّغ عنها (Reported)', color: 'green' },
  ACCEPTED: { label: 'مقبولة', color: 'green' },
  WARNING: { label: 'مقبولة بتحذير', color: 'amber' },
  REJECTED: { label: 'مرفوضة من الهيئة', color: 'red' },
  FAILED: { label: 'فشل الإرسال', color: 'red' },
  RETRY_PENDING: { label: 'بانتظار إعادة المحاولة', color: 'amber' },
  CANCELLED: { label: 'ملغاة', color: 'slate' },
  CREDIT_NOTE_ISSUED: { label: 'صدر لها إشعار دائن', color: 'purple' },
  DEBIT_NOTE_ISSUED: { label: 'صدر لها إشعار مدين', color: 'blue' },
};

const TYPE_LABEL: Record<string, string> = {
  TAX_INVOICE: 'قياسية (B2B)',
  SIMPLIFIED: 'مبسطة (B2C)',
  CREDIT_NOTE: 'إشعار دائن',
  DEBIT_NOTE: 'إشعار مدين',
};

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: 'ALL', label: 'جميع الفواتير' },
  { id: 'PENDING_ALL', label: 'المطلوب إرسالها' },
  { id: 'ACCEPTED_ALL', label: 'المقبولة (Cleared / Reported)' },
  { id: 'REJECTED_ALL', label: 'المرفوضة والفاشلة' },
  { id: 'RETRY_QUEUE', label: 'طابور إعادة المحاولة' },
  { id: 'TAX_INVOICE', label: 'قياسية B2B' },
  { id: 'SIMPLIFIED', label: 'مبسطة B2C' },
  { id: 'CREDIT_NOTE', label: 'الإشعارات الدائنة' },
  { id: 'DEBIT_NOTE', label: 'الإشعارات المدينة' },
  { id: 'OPERATIONS_LOG', label: 'سجل العمليات' },
  { id: 'ERRORS_LOG', label: 'سجل الأخطاء' },
];

export function ZatcaInvoicesPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<ViewTab>('ALL');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Quick Modals
  const [selectedXml, setSelectedXml] = useState<{ invoiceNo: string; xml: string; hash?: string } | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ invoiceNo: string; qrBase64: string } | null>(null);
  const [decodedTags, setDecodedTags] = useState<any>(null);
  const [validationModal, setValidationModal] = useState<{ invoiceNo: string; report: any } | null>(null);

  const isLogTab = tab === 'OPERATIONS_LOG' || tab === 'ERRORS_LOG';
  const isRetryTab = tab === 'RETRY_QUEUE';

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (tab === 'PENDING_ALL' || tab === 'ACCEPTED_ALL' || tab === 'REJECTED_ALL') p.set('status', tab);
    if (tab === 'TAX_INVOICE' || tab === 'SIMPLIFIED' || tab === 'CREDIT_NOTE' || tab === 'DEBIT_NOTE') p.set('type', tab);
    if (search.trim()) p.set('search', search.trim());
    if (fromDate) p.set('from', fromDate);
    if (toDate) p.set('to', toDate);
    const s = p.toString();
    return s ? `?${s}` : '';
  }, [tab, search, fromDate, toDate]);

  const invoicesQuery = useQuery({
    queryKey: ['zatca-invoices', queryParams],
    enabled: !isLogTab && !isRetryTab,
    queryFn: () => api.get<any[]>(`/zatca/invoices${queryParams}`),
  });

  const submissionsQuery = useQuery({
    queryKey: ['zatca-submissions', tab, search, fromDate, toDate],
    enabled: isLogTab,
    queryFn: () => {
      const p = new URLSearchParams();
      if (search.trim()) p.set('search', search.trim());
      if (fromDate) p.set('from', fromDate);
      if (toDate) p.set('to', toDate);
      const q = p.toString();
      return api.get<any[]>(`/zatca/submissions${q ? `?${q}` : ''}`);
    },
  });

  const retryQueueQuery = useQuery({
    queryKey: ['zatca-retry-queue'],
    enabled: isRetryTab,
    queryFn: () => api.get<any[]>('/zatca/retry-queue'),
  });

  const validateOne = useMutation({
    mutationFn: ({ id }: { id: string; invoiceNo: string }) => api.post<any>(`/zatca/invoices/${id}/validate`, {}),
    onSuccess: (report, vars) => {
      setValidationModal({ invoiceNo: vars.invoiceNo, report });
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
    },
    onError: (e) => toast.error(e),
  });

  const transmitOne = useMutation({
    mutationFn: ({ id, isRetry }: { id: string; isRetry?: boolean }) =>
      api.post<any>(`/zatca/invoices/${id}/transmit`, { isRetry }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`تم اعتماد الفاتورة ${data.invoiceNo} بحالة (${data.zatcaStatus})`);
      } else {
        toast.error(data.responseMessage || `تعذر قبول الفاتورة ${data.invoiceNo}`);
      }
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-submissions'] });
      qc.invalidateQueries({ queryKey: ['zatca-retry-queue'] });
    },
    onError: (e) => toast.error(e),
  });

  const batchTransmit = useMutation({
    mutationFn: () => api.post<any>('/zatca/invoices/batch-transmit', {}),
    onSuccess: (data) => {
      toast.success(
        `تمت معالجة ${data.processed ?? 0} فاتورة (${data.cleared ?? 0} مُخلّصة، ${data.reported ?? 0} مُبلّغ عنها، ${data.rejected ?? 0} مرفوضة)`,
      );
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-submissions'] });
    },
    onError: (e) => toast.error(e),
  });

  const processRetries = useMutation({
    mutationFn: (queueId?: string) =>
      api.post<any>(queueId ? `/zatca/retry-queue/${queueId}/retry` : '/zatca/retry-queue/process', {}),
    onSuccess: (res) => {
      toast.success(`تمت معالجة ${res.processed ?? 0} عنصر في طابور إعادة المحاولة`);
      qc.invalidateQueries({ queryKey: ['zatca-retry-queue'] });
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
    },
    onError: (e) => toast.error(e),
  });

  const viewXml = async (id: string, invoiceNo: string) => {
    try {
      const data = await api.get<any>(`/zatca/invoices/${id}/ubl-xml`);
      setSelectedXml({ invoiceNo, xml: data.ublXml, hash: data.hash });
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل ملف XML');
    }
  };

  const viewQr = async (qrBase64: string, invoiceNo: string) => {
    setSelectedQr({ invoiceNo, qrBase64 });
    try {
      const dec = await api.post<any>('/zatca/decode-qr', { qrBase64 });
      setDecodedTags(dec.tags);
    } catch {
      setDecodedTags(null);
    }
  };

  const downloadXml = (invoiceNo: string, xml: string) => {
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZATCA-UBL-${invoiceNo}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const invoices: any[] = Array.isArray(invoicesQuery.data)
    ? invoicesQuery.data
    : ((invoicesQuery.data as any)?.data ?? []);

  const rawSubs: any[] = Array.isArray(submissionsQuery.data)
    ? submissionsQuery.data
    : ((submissionsQuery.data as any)?.data ?? []);
  const submissions = tab === 'ERRORS_LOG'
    ? rawSubs.filter((s) => ['REJECTED', 'FAILED', 'ERROR', 'RETRY_PENDING'].includes(s.status) || s.errorMessage)
    : rawSubs;

  const retryItems: any[] = Array.isArray(retryQueueQuery.data)
    ? retryQueueQuery.data
    : ((retryQueueQuery.data as any)?.data ?? []);

  const exportColumns: ExportColumnDef[] = isLogTab
    ? [
        { key: 'invoiceNo', header: 'رقم الفاتورة', width: 18 },
        { key: 'clientName', header: 'العميل', width: 24 },
        { key: 'mode', header: 'المسار', width: 14 },
        { key: 'environment', header: 'البيئة', width: 12 },
        { key: 'attemptNo', header: 'المحاولة', width: 10 },
        { key: 'status', header: 'الحالة', width: 16 },
        { key: 'responseCode', header: 'كود الهيئة', width: 16 },
        { key: 'responseMessage', header: 'الرسالة', width: 34 },
      ]
    : [
        { key: 'invoiceNo', header: 'رقم الفاتورة', width: 18 },
        { key: 'invoiceType', header: 'النوع', width: 14 },
        { key: 'clientName', header: 'العميل', width: 24 },
        { key: 'clientVat', header: 'الرقم الضريبي للعميل', width: 20 },
        { key: 'issueDate', header: 'التاريخ', width: 14 },
        { key: 'subtotal', header: 'الصافي', width: 14, type: 'currency', isTotal: true },
        { key: 'vatAmount', header: 'الضريبة', width: 14, type: 'currency', isTotal: true },
        { key: 'totalAmount', header: 'الإجمالي', width: 16, type: 'currency', isTotal: true },
        { key: 'zatcaStatus', header: 'حالة ZATCA', width: 16 },
      ];

  return (
    <div className="space-y-5 animate-fade-in pb-14">
      <PageHeader
        title="إدارة الفواتير الإلكترونية وسجل العمليات (ZATCA Phase 2)"
        subtitle="فحص الـ 22 معياراً قبل الإرسال، التخليص القياسي (Clearance)، الإبلاغ المبسط (Reporting)، طابور إعادة المحاولة الآمن، وسجل الأخطاء."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title={isLogTab ? 'سجل عمليات هيئة الزكاة (ZATCA)' : 'سجل الفواتير الإلكترونية — هيئة الزكاة'}
              periodLabel={`التبويب النشط: ${TABS.find((t) => t.id === tab)?.label || tab}`}
              columns={exportColumns}
              data={isLogTab ? submissions : invoices}
            />
            {isRetryTab ? (
              <button
                className="btn-primary text-sm"
                disabled={processRetries.isPending || retryItems.length === 0}
                onClick={() => processRetries.mutate(undefined)}
              >
                {processRetries.isPending ? <Spinner /> : <RotateCcw className="size-4" />}
                معالجة طابور إعادة المحاولة الآن
              </button>
            ) : (
              <button
                className="btn-primary text-sm"
                disabled={batchTransmit.isPending}
                onClick={() => batchTransmit.mutate()}
              >
                {batchTransmit.isPending ? <Spinner /> : <Send className="size-4" />}
                إرسال جميع الفواتير المعلقة
              </button>
            )}
          </div>
        }
      />

      {/* Comprehensive Tabs Bar */}
      <div className="card p-3 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3 py-2 text-xs font-extrabold transition-all ${
              tab === t.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      {!isRetryTab && (
        <div className="card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              بحث (رقم الفاتورة، اسم العميل، الرقم الضريبي، UUID)
            </label>
            <div className="relative">
              <Search className="size-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="input !pr-10"
                placeholder="ابحث برقم الفاتورة أو العميل أو UUID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">من تاريخ</label>
            <input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">إلى تاريخ</label>
              <input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            {(search || fromDate || toDate) && (
              <button
                className="btn-secondary text-xs h-[40px]"
                onClick={() => {
                  setSearch('');
                  setFromDate('');
                  setToDate('');
                }}
              >
                مسح
              </button>
            )}
          </div>
        </div>
      )}

      {/* VIEW A: E-Invoices Table */}
      {!isLogTab && !isRetryTab && (
        <div className="card overflow-hidden">
          {invoicesQuery.isLoading ? (
            <div className="p-10"><Loading /></div>
          ) : invoicesQuery.error ? (
            <ErrorState error={invoicesQuery.error} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/90 dark:bg-slate-900/60 text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 text-right">رقم الفاتورة والنوع</th>
                    <th className="py-3 px-4 text-right">العميل</th>
                    <th className="py-3 px-4 text-right">التاريخ</th>
                    <th className="py-3 px-4 text-right">الإجمالي والضريبة</th>
                    <th className="py-3 px-4 text-right">المسار</th>
                    <th className="py-3 px-4 text-right">حالة ZATCA</th>
                    <th className="py-3 px-4 text-center">الإجراءات والمستندات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm font-semibold text-slate-500">
                        لا توجد فواتير مطابقة لمعايير التصفية الحالية.
                      </td>
                    </tr>
                  ) : (
                    invoices.map((inv: any) => {
                      const zStatus = inv.zatcaStatus || 'NOT_SUBMITTED';
                      const stMeta = STATUS_LABEL[zStatus] ?? { label: zStatus, color: 'slate' as const };
                      const isAccepted = ['CLEARED', 'REPORTED', 'ACCEPTED', 'WARNING'].includes(zStatus);
                      const isRetryable = ['REJECTED', 'FAILED', 'RETRY_PENDING', 'VALIDATION_FAILED'].includes(zStatus);
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <Link
                                to={`/zatca/invoices/${inv.id}`}
                                className="font-mono font-extrabold text-indigo-700 hover:underline dark:text-indigo-300"
                              >
                                {inv.invoiceNo}
                              </Link>
                              {inv.locked && (
                                <span title="مقفلة بعد الاعتماد">
                                  <Lock className="size-3.5 text-emerald-600" />
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold text-slate-500 mt-0.5">
                              {TYPE_LABEL[inv.invoiceType] || inv.invoiceType}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{inv.clientName}</div>
                            <div className="text-[11px] font-mono text-slate-500">{inv.clientVat || 'بدون رقم ضريبي'}</div>
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {date(inv.issueDate)}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <div className="font-extrabold text-slate-900 dark:text-white">
                              {money(inv.totalAmount)} {inv.currencyCode || 'SAR'}
                            </div>
                            <div className="text-[11px] text-slate-500">ضريبة: {money(inv.vatAmount)}</div>
                          </td>
                          <td className="py-3 px-4">
                            <Badge color={inv.submissionType === 'REPORTING' ? 'purple' : 'blue'}>
                              {inv.submissionType === 'REPORTING' ? 'إبلاغ (Reporting)' : 'تخليص (Clearance)'}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Badge color={stMeta.color}>{stMeta.label}</Badge>
                            {inv.responseMessage && !isAccepted && (
                              <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 max-w-[220px] leading-snug">
                                {inv.responseMessage}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <Link
                                to={`/zatca/invoices/${inv.id}`}
                                className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 inline-flex items-center gap-1"
                              >
                                <ExternalLink className="size-3.5" /> 7 تبويبات
                              </Link>
                              {!isAccepted && (
                                <button
                                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 inline-flex items-center gap-1"
                                  disabled={validateOne.isPending}
                                  onClick={() => validateOne.mutate({ id: inv.id, invoiceNo: inv.invoiceNo })}
                                >
                                  <ClipboardCheck className="size-3.5 text-sky-600" /> تحقق
                                </button>
                              )}
                              {!isAccepted && (
                                <button
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 inline-flex items-center gap-1 disabled:opacity-50"
                                  disabled={transmitOne.isPending}
                                  onClick={() => transmitOne.mutate({ id: inv.id, isRetry: isRetryable })}
                                >
                                  {isRetryable ? <RefreshCw className="size-3.5" /> : <Send className="size-3.5" />}
                                  {isRetryable ? 'إعادة إرسال' : 'إرسال'}
                                </button>
                              )}
                              <button
                                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                                title="عرض UBL XML"
                                onClick={() => viewXml(inv.id, inv.invoiceNo)}
                              >
                                <FileCode className="size-4" />
                              </button>
                              {inv.zatcaQrCode && (
                                <button
                                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                                  title="عرض QR"
                                  onClick={() => viewQr(inv.zatcaQrCode, inv.invoiceNo)}
                                >
                                  <QrCode className="size-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW B: Retry Queue */}
      {isRetryTab && (
        <div className="card overflow-hidden">
          {retryQueueQuery.isLoading ? (
            <div className="p-10"><Loading /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 text-right">رقم الفاتورة والعميل</th>
                    <th className="py-3 px-4 text-right">UUID المحفوظ (Idempotent)</th>
                    <th className="py-3 px-4 text-right">المحاولات</th>
                    <th className="py-3 px-4 text-right">المحاولة القادمة</th>
                    <th className="py-3 px-4 text-right">آخر خطأ</th>
                    <th className="py-3 px-4 text-right">الحالة</th>
                    <th className="py-3 px-4 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {retryItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm font-semibold text-slate-500">
                        طابور إعادة المحاولة فارغ — لا توجد فواتير متعثرة حالياً.
                      </td>
                    </tr>
                  ) : (
                    retryItems.map((rq: any) => (
                      <tr key={rq.id}>
                        <td className="py-3 px-4">
                          <Link to={`/zatca/invoices/${rq.invoiceId}`} className="font-mono font-bold text-indigo-600 hover:underline">
                            {rq.invoiceNo}
                          </Link>
                          <div className="text-xs text-slate-500">{rq.clientName}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">{rq.invoiceUuid}</td>
                        <td className="py-3 px-4 font-mono text-xs font-bold">
                          {rq.attemptCount} / {rq.maxAttempts}
                        </td>
                        <td className="py-3 px-4 text-xs">{dateTime(rq.nextRetryAt)}</td>
                        <td className="py-3 px-4 text-xs text-rose-600 max-w-xs">{rq.lastErrorMessage || '—'}</td>
                        <td className="py-3 px-4">
                          <Badge color={rq.status === 'SUCCEEDED' ? 'green' : rq.status === 'DEAD_LETTER' ? 'red' : 'amber'}>
                            {rq.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {rq.status !== 'SUCCEEDED' && (
                            <button
                              className="btn-secondary text-xs"
                              disabled={processRetries.isPending}
                              onClick={() => processRetries.mutate(rq.id)}
                            >
                              <RefreshCw className="size-3.5" /> إعادة المحاولة الآن
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW C: Operations Log & Errors Log */}
      {isLogTab && (
        <div className="card overflow-hidden">
          {submissionsQuery.isLoading ? (
            <div className="p-10"><Loading /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-extrabold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 text-right">الفاتورة</th>
                    <th className="py-3 px-4 text-right">العميل والمبلغ</th>
                    <th className="py-3 px-4 text-right">البيئة / المسار / الجهاز</th>
                    <th className="py-3 px-4 text-right">المحاولة & HTTP</th>
                    <th className="py-3 px-4 text-right">الحالة</th>
                    <th className="py-3 px-4 text-right">الرد والتفاصيل</th>
                    <th className="py-3 px-4 text-right">التوقيت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-sm font-semibold text-slate-500">
                        {tab === 'ERRORS_LOG' ? 'لا توجد أخطاء أو فواتير مرفوضة مسجلة.' : 'لا توجد عمليات مسجلة بعد.'}
                      </td>
                    </tr>
                  ) : (
                    submissions.map((s: any) => {
                      const stMeta = STATUS_LABEL[s.status] ?? { label: s.status, color: 'slate' as const };
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4">
                            <Link to={`/zatca/invoices/${s.invoiceId}`} className="font-mono font-bold text-indigo-600 hover:underline">
                              {s.invoiceNo}
                            </Link>
                            <div className="text-[10px] font-mono text-slate-400">{String(s.uuid || '').slice(0, 18)}…</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white text-xs">{s.clientName}</div>
                            <div className="font-mono text-xs text-slate-600">{money(s.totalAmount)} SAR</div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-bold">{s.environment} • {s.mode}</div>
                            <div className="text-slate-500">{s.deviceCode || 'EGS'} — {s.branchName}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs font-bold">
                            #{s.attemptNo ?? 1} (HTTP {s.httpStatusCode || '—'})
                          </td>
                          <td className="py-3 px-4"><Badge color={stMeta.color}>{stMeta.label}</Badge></td>
                          <td className="py-3 px-4 text-xs max-w-sm">
                            <div className="font-mono font-bold text-[11px]">{s.responseCode}</div>
                            <div className="text-slate-700 dark:text-slate-300 mt-0.5">{s.responseMessage || s.errorMessage || '—'}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">{dateTime(s.createdAt)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pre-Submission Validation Modal */}
      <Modal
        open={Boolean(validationModal)}
        onClose={() => setValidationModal(null)}
        title={`تقرير التحقق قبل الإرسال (22 معياراً) — ${validationModal?.invoiceNo || ''}`}
      >
        {validationModal && (
          <div className="space-y-4">
            <div
              className={`rounded-xl border p-4 flex items-center gap-3 ${
                validationModal.report.valid
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-rose-300 bg-rose-50 text-rose-900'
              }`}
            >
              {validationModal.report.valid ? (
                <ShieldCheck className="size-6 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="size-6 text-rose-600 shrink-0" />
              )}
              <div>
                <div className="font-extrabold text-sm">
                  {validationModal.report.valid
                    ? 'الفاتورة مطابقة بالكامل وجاهزة للإرسال إلى هيئة الزكاة!'
                    : `توجد ${validationModal.report.errors?.length || 0} أخطاء تمنع الإرسال — يرجى معالجتها أولاً`}
                </div>
                <div className="text-xs mt-0.5">
                  اجتازت {validationModal.report.passedCount} من أصل {validationModal.report.checkedCount} فحصاً • المسار الموصى به:{' '}
                  {validationModal.report.recommendedSubmissionType}
                </div>
              </div>
            </div>

            {validationModal.report.errors?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-rose-700">الأخطاء الإلزامية (Errors):</div>
                {validationModal.report.errors.map((err: any, i: number) => (
                  <div key={i} className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs flex items-start gap-2">
                    <XCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-rose-900">{err.fieldLabelAr}</span>{' '}
                      <span className="font-mono text-[11px] text-rose-700">({err.code})</span>
                      <div className="text-rose-800 mt-0.5">{err.messageAr}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {validationModal.report.warnings?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-amber-700">التحذيرات (Warnings):</div>
                {validationModal.report.warnings.map((w: any, i: number) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs flex items-start gap-2">
                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-extrabold text-amber-900">{w.fieldLabelAr}</span>
                      <div className="text-amber-800 mt-0.5">{w.messageAr}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* XML Quick Viewer Modal */}
      <Modal open={Boolean(selectedXml)} onClose={() => setSelectedXml(null)} title={`ملف UBL 2.1 XML — ${selectedXml?.invoiceNo || ''}`}>
        {selectedXml && (
          <div className="space-y-3">
            {selectedXml.hash && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs font-mono break-all">
                <span className="font-bold text-slate-500">Invoice Hash: </span>
                {selectedXml.hash}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(selectedXml.xml);
                  toast.success('تم نسخ XML');
                }}
              >
                <Copy className="size-3.5" /> نسخ XML
              </button>
              <button className="btn-primary text-xs" onClick={() => downloadXml(selectedXml.invoiceNo, selectedXml.xml)}>
                <Download className="size-3.5" /> تنزيل ملف .xml
              </button>
            </div>
            <pre dir="ltr" className="rounded-xl bg-slate-950 text-emerald-400 p-4 text-[11px] font-mono overflow-auto max-h-96">
              {selectedXml.xml}
            </pre>
          </div>
        )}
      </Modal>

      {/* QR Quick Viewer Modal */}
      <Modal open={Boolean(selectedQr)} onClose={() => setSelectedQr(null)} title={`رمز الاستجابة السريع ZATCA QR — ${selectedQr?.invoiceNo || ''}`}>
        {selectedQr && (
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white rounded-2xl border border-slate-200">
              <QRCodeSVG value={selectedQr.qrBase64} size={200} />
            </div>
            {decodedTags && Object.keys(decodedTags).length > 0 && (
              <div className="space-y-1.5 text-xs">
                {Object.entries(decodedTags).map(([tag, info]: [string, any]) => (
                  <div key={tag} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-900 px-3 py-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      Tag {tag}: {info.nameAr || info.nameEn}
                    </span>
                    <span className="font-mono text-slate-600 dark:text-slate-300 truncate max-w-[220px]" dir="ltr">
                      {info.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
