import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  Download,
  FileText,
  History,
  Lock,
  Printer,
  QrCode,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import { date, dateTime, money } from '../lib/format';
import { ZatcaTaxInvoiceTemplate } from '../components/ZatcaTaxInvoiceTemplate';
import { Badge, ErrorState, Loading, PageHeader, Spinner, useToast } from '../components/ui';

type DetailTab = 'INVOICE' | 'ZATCA' | 'XML' | 'QR' | 'PDF' | 'LOG' | 'ACCOUNTING';

const TABS: Array<{ id: DetailTab; label: string; icon: any }> = [
  { id: 'INVOICE', label: '1. الفاتورة', icon: FileText },
  { id: 'ZATCA', label: '2. تفاصيل ZATCA', icon: ShieldCheck },
  { id: 'XML', label: '3. ملف XML', icon: Code2 },
  { id: 'QR', label: '4. رمز QR', icon: QrCode },
  { id: 'PDF', label: '5. نسخة PDF والطباعة', icon: Printer },
  { id: 'LOG', label: '6. سجل العمليات والحالات', icon: History },
  { id: 'ACCOUNTING', label: '7. القيد المحاسبي', icon: BookOpen },
];

export function ZatcaInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('INVOICE');
  const [xmlFlavor, setXmlFlavor] = useState<'SIGNED' | 'CLEARED' | 'RAW'>('SIGNED');

  const detailQuery = useQuery({
    queryKey: ['zatca-invoice-detail', id],
    enabled: Boolean(id),
    queryFn: () => api.get<any>(`/zatca/invoices/${id}/details`),
  });

  const validateMut = useMutation({
    mutationFn: () => api.post<any>(`/zatca/invoices/${id}/validate`, {}),
    onSuccess: (rep) => {
      if (rep.valid) toast.success(`اجتازت الفاتورة جميع الفحوصات (${rep.passedCount}/${rep.checkedCount})`);
      else toast.error(`فشل التحقق: ${rep.errors?.[0]?.fieldLabelAr} — ${rep.errors?.[0]?.messageAr}`);
      qc.invalidateQueries({ queryKey: ['zatca-invoice-detail', id] });
    },
    onError: (e) => toast.error(e),
  });

  const transmitMut = useMutation({
    mutationFn: () => api.post<any>(`/zatca/invoices/${id}/transmit`, {}),
    onSuccess: (res) => {
      if (res.success) toast.success(`تم اعتماد الفاتورة لدى هيئة الزكاة (${res.zatcaStatus})`);
      else toast.error(res.responseMessage || 'رفضت الهيئة الفاتورة أو تعذر الإرسال');
      qc.invalidateQueries({ queryKey: ['zatca-invoice-detail', id] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
    },
    onError: (e) => toast.error(e),
  });

  if (detailQuery.isLoading) return <Loading />;
  if (detailQuery.error) return <ErrorState error={detailQuery.error} />;

  const d = detailQuery.data;
  const inv = d.invoice;
  const z = d.zatca;
  const xml = d.xml || {};
  const qr = d.qr || {};
  const submissions: any[] = d.submissions || [];
  const history: any[] = d.statusHistory || [];
  const acc = d.accounting || {};

  const isAccepted = ['CLEARED', 'REPORTED', 'ACCEPTED', 'WARNING'].includes(z.status);
  const activeXml =
    xmlFlavor === 'CLEARED'
      ? xml.clearedXml || 'لم يصدر ملف Cleared XML من الهيئة بعد.'
      : xmlFlavor === 'RAW'
        ? xml.rawXml || xml.signedXml || ''
        : xml.signedXml || xml.rawXml || '';

  const downloadXmlFile = () => {
    const blob = new Blob([activeXml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZATCA-${xmlFlavor}-${inv.invoiceNo}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fade-in pb-14">
      <PageHeader
        title={`ملف الفاتورة الإلكترونية — ${inv.invoiceNo}`}
        subtitle={`العميل: ${inv.clientName} | المسار: ${z.submissionType === 'REPORTING' ? 'إبلاغ مبسط (Reporting)' : 'تخليص قياسي (Clearance)'} | البيئة: ${z.environment}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/zatca/invoices" className="btn-secondary text-sm">
              <ArrowRight className="size-4" /> العودة لقائمة الفواتير
            </Link>
            {!isAccepted && (
              <>
                <button className="btn-secondary text-sm" disabled={validateMut.isPending} onClick={() => validateMut.mutate()}>
                  {validateMut.isPending ? <Spinner /> : <ClipboardCheck className="size-4 text-sky-600" />}
                  فحص 22 معياراً
                </button>
                <button className="btn-primary text-sm" disabled={transmitMut.isPending} onClick={() => transmitMut.mutate()}>
                  {transmitMut.isPending ? <Spinner /> : <Send className="size-4" />}
                  إرسال للهيئة الآن
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Status Header Strip */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge color={z.statusMeta?.color || (isAccepted ? 'green' : 'amber')}>
            {z.statusMeta?.labelAr || z.status}
          </Badge>
          <Badge color={inv.status === 'POSTED' ? 'green' : 'slate'}>الحالة المحاسبية: {inv.status}</Badge>
          {z.locked && (
            <Badge color="green">
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3" /> مقفلة ومحصّنة ضد التعديل
              </span>
            </Badge>
          )}
          {inv.originalInvoiceNo && (
            <Badge color="purple">مرتبطة بالفاتورة الأصلية: {inv.originalInvoiceNo}</Badge>
          )}
        </div>
        <div className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
          UUID: {z.uuid}
        </div>
      </div>

      {/* 7-Tab Navigation */}
      <div className="card p-2.5 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-extrabold transition-all ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200'
              }`}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Invoice Details */}
      {tab === 'INVOICE' && (
        <div className="card p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5 text-xs">
              <div className="text-slate-500 font-bold">بيانات المورّد (المنشأة)</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">{inv.sellerName}</div>
              <div className="font-mono text-slate-600 dark:text-slate-300">الرقم الضريبي: {inv.sellerVatNumber || '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5 text-xs">
              <div className="text-slate-500 font-bold">بيانات المشتري (العميل)</div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">{inv.clientName}</div>
              <div className="font-mono text-slate-600 dark:text-slate-300">
                الرقم الضريبي: {inv.clientVatNumber || 'عميل فردي / مبسطة'} • المدينة: {inv.clientCity || '—'}
              </div>
            </div>
          </div>

          {inv.returnReason && (
            <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3.5 text-xs font-bold text-purple-900">
              سبب الإشعار (BR-KSA-17): {inv.returnReason}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-extrabold border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3 text-right">#</th>
                  <th className="py-2.5 px-3 text-right">البيان / الخدمة</th>
                  <th className="py-2.5 px-3 text-right">الكمية</th>
                  <th className="py-2.5 px-3 text-right">سعر الوحدة</th>
                  <th className="py-2.5 px-3 text-right">فئة VAT</th>
                  <th className="py-2.5 px-3 text-right">الصافي</th>
                  <th className="py-2.5 px-3 text-right">الضريبة</th>
                  <th className="py-2.5 px-3 text-right">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(inv.lines || []).map((l: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 font-mono text-xs">{l.line_no ?? l.lineNo ?? idx + 1}</td>
                    <td className="py-2.5 px-3 font-semibold">{l.description}</td>
                    <td className="py-2.5 px-3 font-mono">{Number(l.quantity || 1)}</td>
                    <td className="py-2.5 px-3 font-mono">{money(l.unit_price ?? l.unitPrice)}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">
                      {l.vat_category || l.vatCategory || 'S'} ({Number(l.vat_rate ?? l.vatRate ?? 15)}%)
                    </td>
                    <td className="py-2.5 px-3 font-mono">{money(l.subtotal)}</td>
                    <td className="py-2.5 px-3 font-mono">{money(l.vat_amount ?? l.vatAmount)}</td>
                    <td className="py-2.5 px-3 font-mono font-bold">{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-6 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-4 text-sm font-mono">
            <div><span className="text-slate-500 font-sans font-bold ml-2">المجموع قبل الضريبة:</span>{money(inv.subtotal)}</div>
            <div><span className="text-slate-500 font-sans font-bold ml-2">الضريبة:</span>{money(inv.vatAmount)}</div>
            <div className="text-indigo-700 dark:text-indigo-300 font-black">
              <span className="text-slate-700 dark:text-slate-200 font-sans font-extrabold ml-2">الإجمالي النهائي:</span>
              {money(inv.totalAmount)} {inv.currencyCode || 'SAR'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ZATCA Cryptographic & API Details */}
      {tab === 'ZATCA' && (
        <div className="card p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {[
              { label: 'UUID الفاتورة (محفوظ عند الإعادة)', value: z.uuid, mono: true },
              { label: 'عداد الفاتورة (ICV)', value: `#${z.icv ?? 1}`, mono: true },
              { label: 'مسار الربط (Mode)', value: z.submissionType },
              { label: 'البيئة (Environment)', value: z.environment },
              { label: 'كود استجابة الهيئة', value: z.responseCode || '—', mono: true },
              { label: 'عدد محاولات الإعادة', value: String(z.retryCount ?? 0), mono: true },
              { label: 'تاريخ الإرسال', value: z.submittedAt ? dateTime(z.submittedAt) : 'لم تُرسل بعد' },
              { label: 'تاريخ الرد', value: z.respondedAt ? dateTime(z.respondedAt) : '—' },
              { label: 'حالة القفل (Immutability Lock)', value: z.locked ? 'مقفلة رسمياً ✓' : 'مفتوحة قبل الاعتماد' },
            ].map((item, i) => (
              <div key={i} className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3.5">
                <div className="text-slate-500 font-bold">{item.label}</div>
                <div className={`mt-1 font-extrabold text-slate-900 dark:text-white break-all ${item.mono ? 'font-mono' : ''}`}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3.5">
              <div className="text-slate-500 font-bold">تجزئة الفاتورة SHA-256 Base64 (Invoice Hash)</div>
              <div className="font-mono text-slate-900 dark:text-emerald-300 break-all mt-1">{z.invoiceHash || '—'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3.5">
              <div className="text-slate-500 font-bold">تجزئة الفاتورة السابقة (PIH Chain)</div>
              <div className="font-mono text-slate-700 dark:text-slate-300 break-all mt-1">{z.pih || '—'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3.5">
              <div className="text-slate-500 font-bold">رسالة الهيئة التفصيلية</div>
              <div className="font-bold text-slate-900 dark:text-white mt-1">{z.responseMessage || '—'}</div>
            </div>
          </div>

          {z.response && (
            <div className="space-y-1.5">
              <div className="text-xs font-extrabold text-slate-600 dark:text-slate-300">رد بوابة فاتورة الخام (JSON)</div>
              <pre dir="ltr" className="rounded-xl bg-slate-950 text-sky-300 p-4 text-[11px] font-mono overflow-auto max-h-64">
                {typeof z.response === 'string' ? z.response : JSON.stringify(z.response, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: XML Viewer (Raw / Signed / Cleared) */}
      {tab === 'XML' && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(['SIGNED', 'CLEARED', 'RAW'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setXmlFlavor(f)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-extrabold ${
                    xmlFlavor === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {f === 'SIGNED' ? 'XML الموقّع (XAdES)' : f === 'CLEARED' ? 'XML المُخلّص من الهيئة' : 'XML الأصلي (Raw)'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(activeXml);
                  toast.success('تم نسخ XML');
                }}
              >
                <Copy className="size-3.5" /> نسخ
              </button>
              <button className="btn-primary text-xs" onClick={downloadXmlFile}>
                <Download className="size-3.5" /> تنزيل .xml
              </button>
            </div>
          </div>
          <pre dir="ltr" className="rounded-xl bg-slate-950 text-emerald-400 p-4 text-[11px] font-mono overflow-auto max-h-[520px]">
            {activeXml}
          </pre>
        </div>
      )}

      {/* TAB 4: 9-Tag TLV QR Code */}
      {tab === 'QR' && (
        <div className="card p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 flex flex-col items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-slate-900">
            {qr.qrBase64 ? (
              <div className="p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                <QRCodeSVG value={qr.qrBase64} size={220} />
              </div>
            ) : (
              <div className="py-12 text-xs text-slate-500">لم يُولّد رمز QR بعد</div>
            )}
            <button
              className="btn-secondary text-xs w-full justify-center"
              disabled={!qr.qrBase64}
              onClick={() => {
                navigator.clipboard.writeText(qr.qrBase64);
                toast.success('تم نسخ نص QR Base64');
              }}
            >
              <Copy className="size-3.5" /> نسخ نص TLV Base64
            </button>
          </div>
          <div className="lg:col-span-8 space-y-3">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              تفكيك حقول رمز الاستجابة السريع (ZATCA Phase 2 — 9 TLV Tags)
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {Object.entries(qr.decodedTags || {}).length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">لا توجد حقول QR مفكّكة.</div>
              ) : (
                Object.entries(qr.decodedTags || {}).map(([tag, info]: [string, any]) => (
                  <div key={tag} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-slate-900/60">
                    <div>
                      <span className="inline-flex items-center justify-center rounded-md bg-indigo-100 text-indigo-800 font-mono text-[11px] font-black px-2 py-0.5 ml-2">
                        Tag {tag}
                      </span>
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {info.nameAr || info.nameEn}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all max-w-md" dir="ltr">
                      {info.value}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Official ZATCA PDF & Print View */}
      {tab === 'PDF' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-primary text-sm" onClick={() => window.print()}>
              <Printer className="size-4" /> طباعة / تصدير PDF رسمي متوافق مع هيئة الزكاة
            </button>
          </div>
          <div className="card p-4 overflow-x-auto bg-white">
            <ZatcaTaxInvoiceTemplate
              invoice={{
                ...inv,
                zatcaUuid: z.uuid,
                zatcaHash: z.invoiceHash,
                zatcaQrCode: qr.qrBase64,
                zatcaStatus: z.status,
                issueTime: inv.issueDate,
                exchangeRate: '1',
                vatRate: '15',
                subtotalBase: inv.subtotal,
                vatAmountBase: inv.vatAmount,
                totalAmountBase: inv.totalAmount,
                paidAmount: '0',
                companyId: '',
                clientId: '',
                fiscalPeriodId: '',
              } as any}
            />
          </div>
        </div>
      )}

      {/* TAB 6: Operations Log & Status History */}
      {tab === 'LOG' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              سجل محاولات الإرسال إلى هيئة الزكاة ({submissions.length})
            </h3>
            {submissions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">لم تُرسل الفاتورة للهيئة بعد.</div>
            ) : (
              <div className="space-y-2.5">
                {submissions.map((s: any) => (
                  <div key={s.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">محاولة #{s.attemptNo ?? 1} — {s.mode} ({s.environment})</span>
                      <Badge color={['CLEARED', 'REPORTED'].includes(s.status) ? 'green' : 'red'}>{s.status}</Badge>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">HTTP {s.httpStatusCode || '—'} • {s.responseCode}</div>
                    <div className="text-slate-700 dark:text-slate-300">{s.responseMessage || s.errorMessage || '—'}</div>
                    <div className="text-[11px] text-slate-400">{dateTime(s.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              سجل انتقالات الحالة التدقيقي ({history.length})
            </h3>
            {history.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">لا توجد انتقالات حالة مسجلة بعد.</div>
            ) : (
              <div className="space-y-2.5">
                {history.map((h: any) => (
                  <div key={h.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                        {h.fromStatus || 'INIT'} ← {h.toStatus}
                      </span>
                      <span className="text-[11px] text-slate-400">{dateTime(h.occurredAt)}</span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300">{h.message || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: Linked Accounting Journal */}
      {tab === 'ACCOUNTING' && (
        <div className="card p-5 sm:p-6 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs font-bold text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            <span>
              حماية المنطق المحاسبي: يتم توليد القيد المحاسبي مرة واحدة فقط عند ترحيل الفاتورة المحاسبي؛ ولا يقوم إرسال ZATCA أو إعادة المحاولة بإنشاء أي قيد مكرر أو حذف قيد قائم.
            </span>
          </div>

          {!acc.journalEntryId ? (
            <div className="py-10 text-center text-sm font-semibold text-slate-500">
              لا يوجد قيد محاسبي مرتبط بهذه الفاتورة بعد (تأكد من ترحيل الفاتورة محاسبياً).
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-4 text-xs">
                <div className="space-y-1">
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                    رقم القيد: <span className="font-mono">{acc.journalEntryNo || acc.journalEntryId}</span>
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    التاريخ: {date(acc.journalDate)} • الحالة: {acc.journalStatus}
                  </div>
                </div>
                <Link to={`/acc/journals/${acc.journalEntryId}`} className="btn-secondary text-xs">
                  <BookOpen className="size-3.5" /> فتح القيد في الأستاذ العام
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 text-xs font-extrabold border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2.5 px-3 text-right">رمز الحساب</th>
                      <th className="py-2.5 px-3 text-right">اسم الحساب</th>
                      <th className="py-2.5 px-3 text-right">البيان</th>
                      <th className="py-2.5 px-3 text-right">مدين (Debit)</th>
                      <th className="py-2.5 px-3 text-right">دائن (Credit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(acc.lines || []).map((l: any, idx: number) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">{l.accountCode}</td>
                        <td className="py-2.5 px-3 font-bold">{l.accountName}</td>
                        <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300">{l.description}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{money(l.debitBase)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-rose-700">{money(l.creditBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
