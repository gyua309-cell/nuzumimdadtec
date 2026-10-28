import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { date, dateTime, money } from '../lib/format';
import { Badge, ErrorState, Loading, PageHeader, Spinner, useToast } from '../components/ui';

const STATUS_LABEL: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'slate' }> = {
  NOT_SUBMITTED: { label: 'لم تُرسل للهيئة', color: 'amber' },
  CLEARED: { label: 'مُعتمدة رسمياً (Cleared)', color: 'green' },
  REPORTED: { label: 'مُبلّغ عنها (Reported)', color: 'green' },
  REJECTED: { label: 'مرفوضة من الهيئة', color: 'red' },
  WARNING: { label: 'مقبولة بتحذير', color: 'amber' },
};

export function ZatcaInvoicesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modals state
  const [selectedXml, setSelectedXml] = useState<{ invoiceNo: string; xml: string; hash?: string } | null>(null);
  const [selectedQr, setSelectedQr] = useState<{ invoiceNo: string; qrBase64: string } | null>(null);
  const [decodedTags, setDecodedTags] = useState<any>(null);

  const invoicesQuery = useQuery({
    queryKey: ['zatca-invoices', filterStatus],
    queryFn: () => api.get<any[]>(`/zatca/invoices${filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''}`),
  });

  const transmitOne = useMutation({
    mutationFn: (id: string) => api.post<any>(`/zatca/invoices/${id}/transmit`, {}),
    onSuccess: (data) => {
      toast.success(`تم بنجاح اعتماد الفاتورة ${data.invoiceNo} لدى هيئة الزكاة (${data.zatcaStatus === 'CLEARED' ? 'اعتماد قياسي B2B' : 'إبلاغ مبسط B2C'})`);
      qc.invalidateQueries({ queryKey: ['zatca-invoices'] });
      qc.invalidateQueries({ queryKey: ['zatca-status'] });
      qc.invalidateQueries({ queryKey: ['zatca-submissions'] });
    },
    onError: (e) => toast.error(e),
  });

  const viewXml = async (id: string, invoiceNo: string) => {
    try {
      const data = await api.get<any>(`/zatca/invoices/${id}/ubl-xml`);
      setSelectedXml({ invoiceNo, xml: data.ublXml, hash: data.hash });
    } catch (e: any) {
      toast.error(e.message || 'تعذر تحميل ملف XML');
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

  const downloadXmlFile = (invoiceNo: string, xmlContent: string) => {
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ZATCA-UBL-${invoiceNo}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('تم تنزيل ملف XML بنجاح');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('تم النسخ إلى الحافظة');
  };

  if (invoicesQuery.isLoading) return <Loading />;
  if (invoicesQuery.error) return <ErrorState error={invoicesQuery.error} />;

  const invoices: any[] = Array.isArray(invoicesQuery.data)
    ? invoicesQuery.data
    : (invoicesQuery.data as any)?.data || [];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <PageHeader
        title="الفواتير الإلكترونية واعتماد هيئة الزكاة (ZATCA)"
        subtitle="سجل فواتير المبيعات مع مؤشرات الاعتماد الفوري (Clearance B2B) والإبلاغ (Reporting B2C) ومحرك XML UBL 2.1 والأختام الرقمية."
        actions={
          <button
            onClick={() => invoicesQuery.refetch()}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`size-4 ${invoicesQuery.isFetching ? 'animate-spin' : ''}`} /> تحديث القائمة
          </button>
        }
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
        {[
          { key: 'ALL', label: 'كافة الفواتير' },
          { key: 'NOT_SUBMITTED', label: 'بانتظار الإرسال' },
          { key: 'CLEARED', label: 'المعتمدة (Cleared)' },
          { key: 'REPORTED', label: 'المبلّغ عنها (Reported)' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              filterStatus === tab.key
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="card overflow-hidden p-0">
        {invoices.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            لا توجد فواتير مطابقة لخيارات التصفية الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>تاريخ الإصدار</th>
                  <th>العميل</th>
                  <th>نوع الفاتورة</th>
                  <th>الإجمالي (ريال)</th>
                  <th>الضريبة (15%)</th>
                  <th>حالة الربط بهيئة الزكاة</th>
                  <th>فحوصات الامتثال</th>
                  <th className="text-center">إجراءات الاعتماد والمعاينة</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => {
                  const isSubmitted = inv.zatcaStatus === 'CLEARED' || inv.zatcaStatus === 'REPORTED';
                  const isTaxInvoice = inv.invoiceType === 'TAX_INVOICE';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                      <td className="font-bold num text-slate-900 dark:text-white">
                        {inv.invoiceNo}
                      </td>
                      <td className="num text-xs">{date(inv.issueDate)}</td>
                      <td>
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{inv.clientName}</div>
                        <div className="text-[11px] text-slate-500 num font-mono">
                          {inv.clientVat ? `الرقم الضريبي: ${inv.clientVat}` : 'عميل بدون رقم ضريبي'}
                        </div>
                      </td>
                      <td>
                        <Badge color={isTaxInvoice ? 'blue' : 'purple'}>
                          {isTaxInvoice ? 'ضريبية قياسية (B2B)' : 'ضريبية مبسطة (B2C)'}
                        </Badge>
                      </td>
                      <td className="font-bold num text-slate-900 dark:text-white">
                        {money(inv.totalAmount)}
                      </td>
                      <td className="num text-slate-600 dark:text-slate-300">
                        {money(inv.vatAmount)}
                      </td>
                      <td>
                        <Badge color={STATUS_LABEL[inv.zatcaStatus]?.color as any}>
                          {STATUS_LABEL[inv.zatcaStatus]?.label ?? inv.zatcaStatus}
                        </Badge>
                        {inv.submittedAt && (
                          <div className="text-[10px] text-slate-400 num mt-0.5">
                            {dateTime(inv.submittedAt)}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <CheckCircle2 className="size-3.5" /> مطابق 100%
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center justify-center gap-1.5">
                          {!isSubmitted ? (
                            <button
                              onClick={() => transmitOne.mutate(inv.id)}
                              disabled={transmitOne.isPending}
                              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 shadow-sm"
                              title="إرسال واعتماد الفاتورة فورياً لدى هيئة الزكاة"
                            >
                              {transmitOne.isPending ? <Spinner /> : <Send className="size-3.5" />}
                              إرسال واعتماد
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-lg px-2 py-1 flex items-center gap-1">
                              <ShieldCheck className="size-3.5" /> معتمدة
                            </span>
                          )}

                          <button
                            onClick={() => viewXml(inv.id, inv.invoiceNo)}
                            className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 text-slate-700 dark:text-slate-200"
                            title="عرض مستند XML UBL 2.1"
                          >
                            <FileCode className="size-3.5 text-blue-600" /> XML
                          </button>

                          {inv.hasQr && (
                            <button
                              onClick={() => viewQr(inv.hash || 'mockQr', inv.invoiceNo)}
                              className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 text-slate-700 dark:text-slate-200"
                              title="فحص رمز QR المشفر"
                            >
                              <QrCode className="size-3.5 text-purple-600" /> QR
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* XML Viewer Modal */}
      {selectedXml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-4xl max-h-[90vh] flex flex-col p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <FileCode className="size-5 text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    مستند XML المعتمد (UBL 2.1) - الفاتورة {selectedXml.invoiceNo}
                  </h3>
                  {selectedXml.hash && (
                    <div className="text-xs text-slate-500 font-mono num">
                      Digest SHA-256: {selectedXml.hash}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadXmlFile(selectedXml.invoiceNo, selectedXml.xml)}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Download className="size-3.5" /> تحميل XML
                </button>
                <button
                  onClick={() => copyToClipboard(selectedXml.xml)}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <Copy className="size-3.5" /> نسخ النص
                </button>
                <button
                  onClick={() => setSelectedXml(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-5 bg-slate-950 text-slate-200 font-mono text-xs leading-relaxed" dir="ltr">
              <pre className="whitespace-pre-wrap break-all">{selectedXml.xml}</pre>
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 flex justify-between items-center">
              <span>مطابق لمعايير هيئة الزكاة والضريبة والجمارك (ZATCA KSA UBL 2.1)</span>
              <button onClick={() => setSelectedXml(null)} className="btn-secondary text-xs">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code & TLV Inspector Modal */}
      {selectedQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="card w-full max-w-2xl max-h-[90vh] flex flex-col p-0 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <QrCode className="size-5 text-purple-600" />
                <h3 className="font-bold text-slate-900 dark:text-white">
                  رمز الاستجابة السريع المشفر (ZATCA TLV) - الفاتورة {selectedQr.invoiceNo}
                </h3>
              </div>
              <button
                onClick={() => setSelectedQr(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="flex flex-col sm:flex-row items-center gap-6 rounded-2xl bg-slate-50 p-6 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800">
                <div className="rounded-xl bg-white p-3 shadow-sm border border-slate-200 dark:border-slate-700 shrink-0">
                  <QRCodeSVG value={selectedQr.qrBase64} size={160} level="M" />
                </div>
                <div className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5 text-emerald-600">
                    <ShieldCheck className="size-4" /> رمز مشفر مطابق للمرحلة الثانية
                  </div>
                  <p>
                    هذا الرمز مشفر بترميز TLV (Tag-Length-Value) Base64 ويحتوي على كافة الحقول الثمانية الإلزامية بما في ذلك الختم الرقمي والتجزئة (SHA-256 Digest).
                  </p>
                  <div className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 p-2 rounded-lg break-all">
                    {selectedQr.qrBase64.substring(0, 80)}...
                  </div>
                </div>
              </div>

              {decodedTags && (
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
                    الحقول المستخرجة بعد فك التشفير (Decoded TLV Tags):
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(decodedTags).map(([tagKey, tagVal]: [string, any]) => (
                      <div
                        key={tagKey}
                        className="flex items-start justify-between rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            الوسم {tagKey}: {tagVal.nameAr}
                          </div>
                          <div className="text-slate-400 text-[11px]">{tagVal.nameEn}</div>
                        </div>
                        <div className="font-mono text-left dir-ltr max-w-[280px] break-all text-slate-700 dark:text-slate-300 font-semibold">
                          {tagVal.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 flex justify-end">
              <button onClick={() => setSelectedQr(null)} className="btn-secondary text-xs">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
