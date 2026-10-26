import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Save, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { date, dateTime, money } from '../lib/format';
import { Badge, ErrorState, Field, Loading, PageHeader, Spinner, Stat, useToast } from '../components/ui';

const ENV_LABEL: Record<string, string> = { SANDBOX: 'بيئة التجربة (Sandbox)', SIMULATION: 'بيئة المحاكاة (Simulation)', PRODUCTION: 'بيئة الإنتاج (Production)' };
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NOT_SUBMITTED: { label: 'لم تُرسل للهيئة', color: 'amber' },
  CLEARED: { label: 'مُعتمدة (Cleared)', color: 'green' },
  REPORTED: { label: 'مُبلَّغ عنها (Reported)', color: 'green' },
  REJECTED: { label: 'مرفوضة', color: 'red' },
  WARNING: { label: 'مقبولة بتحذير', color: 'amber' },
};
const CSID_LABEL: Record<string, string> = {
  NOT_ONBOARDED: 'غير مسجّل', COMPLIANCE: 'شهادة امتثال', PRODUCTION: 'شهادة إنتاج', EXPIRED: 'منتهية',
};

export function ZatcaIntegrationPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['zatca-status'], queryFn: () => api.get<any>('/zatca/status') });
  const settings = useQuery({ queryKey: ['zatca-settings'], queryFn: () => api.get<any>('/zatca/settings') });
  const [form, setForm] = useState<any>(null);

  useEffect(() => {
    if (settings.data) setForm({ ...settings.data });
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.put<any>('/zatca/settings', {
      environment: form.environment,
      vatNumber: form.vatNumber || null,
      crNumber: form.crNumber || null,
      egsUnitName: form.egsUnitName || null,
      egsSerialNo: form.egsSerialNo || null,
    }),
    onSuccess: () => { toast.success('تم حفظ إعدادات الربط'); qc.invalidateQueries({ queryKey: ['zatca-status'] }); qc.invalidateQueries({ queryKey: ['zatca-settings'] }); },
    onError: (e) => toast.error(e),
  });

  if (status.isLoading || settings.isLoading || !form) return <Loading />;
  if (status.error) return <ErrorState error={status.error} />;
  const st = status.data;
  const set = (k: string, v: string) => setForm({ ...form, [k]: v });
  const rows = Object.entries(st.invoicesByStatus as Record<string, { count: number; total: string }>);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="الربط مع هيئة الزكاة والضريبة والجمارك (فاتورة)"
        subtitle="جاهزية الفوترة الإلكترونية (المرحلة الثانية: الربط والتكامل) وحالة الفواتير الفعلية لدى الهيئة."
      />

      <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        <Info className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="mb-1 font-bold">الإرسال الفعلي غير مفعّل</div>
          {st.transmissionNoteAr}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="البيئة الحالية" value={ENV_LABEL[st.environment] ?? st.environment} tone="blue" icon={ShieldCheck} />
        <Stat label="حالة الشهادة (CSID)" value={CSID_LABEL[st.csidStatus] ?? st.csidStatus} tone={st.csidStatus === 'PRODUCTION' ? 'green' : 'amber'} icon={ShieldCheck} />
        <Stat label="فواتير مرسلة للهيئة" value={st.submittedCount} tone="green" icon={CheckCircle2} />
        <Stat label="فواتير بانتظار الإرسال" value={st.pendingCount} tone="amber" icon={AlertTriangle} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 font-bold">قائمة الجاهزية للربط</h3>
          <ul className="space-y-2.5">
            {st.checklist.map((c: any) => (
              <li key={c.key} className="flex items-start gap-2.5 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />}
                <div>
                  <div className={c.ok ? 'font-semibold' : 'font-bold text-rose-700 dark:text-rose-400'}>{c.labelAr}</div>
                  {!c.ok && <div className="text-xs text-slate-500">{c.hintAr}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card space-y-3 p-4">
          <h3 className="font-bold">إعدادات الربط</h3>
          <Field label="البيئة">
            <select className="input" value={form.environment} onChange={(e) => set('environment', e.target.value)}>
              {Object.entries(ENV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="الرقم الضريبي (15 رقماً)" hint="يبدأ وينتهي بالرقم 3">
            <input className="input num" dir="ltr" maxLength={15} value={form.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="رقم السجل التجاري"><input className="input num" dir="ltr" value={form.crNumber ?? ''} onChange={(e) => set('crNumber', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم وحدة الفوترة (EGS)"><input className="input" value={form.egsUnitName ?? ''} onChange={(e) => set('egsUnitName', e.target.value)} /></Field>
            <Field label="الرقم التسلسلي للحل"><input className="input num" dir="ltr" value={form.egsSerialNo ?? ''} onChange={(e) => set('egsSerialNo', e.target.value)} /></Field>
          </div>
          <p className="text-xs text-slate-500">لا تُخزَّن شهادات CSID أو المفاتيح الخاصة في هذه الشاشة ولا في قاعدة البيانات العادية؛ تُحفظ في مخزن أسرار مخصص عند التفعيل.</p>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Spinner /> : <Save className="size-4" />} حفظ الإعدادات</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/60">الفواتير المرحّلة حسب حالتها لدى الهيئة</div>
        {rows.length === 0 ? <div className="p-6 text-sm text-slate-500">لا توجد فواتير مرحّلة.</div> : (
          <table className="table">
            <thead><tr><th>الحالة</th><th>عدد الفواتير</th><th>الإجمالي (عملة الأساس)</th></tr></thead>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td><Badge color={STATUS_LABEL[k]?.color as any}>{STATUS_LABEL[k]?.label ?? k}</Badge></td>
                  <td className="num">{v.count}</td>
                  <td className="num">{money(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {st.nonCompliant.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 dark:border-slate-800 dark:bg-rose-950/30 dark:text-rose-300">
            فواتير بها ملاحظات امتثال ({st.nonCompliant.length})
          </div>
          <table className="table">
            <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>نتيجة الفحص</th></tr></thead>
            <tbody>
              {st.nonCompliant.map((r: any) => (
                <tr key={r.invoiceNo}>
                  <td className="num">{r.invoiceNo}</td>
                  <td className="num">{date(r.issueDate)}</td>
                  <td className="whitespace-normal">{r.clientName}</td>
                  <td><Badge color={r.errors === 'FAIL' ? 'red' : 'amber'}>{r.errors === 'FAIL' ? 'فشل' : 'تحذير'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">آخر تحديث للبيانات: {dateTime(new Date().toISOString())}</p>
    </div>
  );
}
