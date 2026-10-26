import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calculator, CheckCircle2, FileText, Printer, Save, Send, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { date, money, today } from '../lib/format';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, ReasonDialog, Spinner, Stat, useToast } from '../components/ui';

const MANUAL_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'provisionsAddBack', label: 'يضاف: المخصصات المكوّنة خلال الفترة', hint: 'مخصصات لم تُسدَّد فعلياً خلال الفترة' },
  { key: 'nonDeductibleExpenses', label: 'يضاف: مصروفات غير قابلة للحسم', hint: 'مصروفات لا تقبلها الهيئة كحسم' },
  { key: 'otherDeductionsFromProfit', label: 'يخصم: إيرادات أو بنود معفاة من الربح', hint: 'بنود تُخصم من صافي الربح للوصول للربح المعدّل' },
  { key: 'longTermLiabilities', label: 'يضاف: قروض والتزامات طويلة الأجل', hint: 'القروض التي تمول أصولاً خاضعة للزكاة' },
  { key: 'otherAdditionsToBase', label: 'يضاف: بنود أخرى إلى الوعاء', hint: 'أي إضافات أخرى يقتضيها النظام' },
  { key: 'investmentsDeduction', label: 'يخصم: استثمارات', hint: 'استثمارات تخضع للزكاة لدى الجهة المستثمر فيها' },
  { key: 'otherNonCurrentAssetsDeduction', label: 'يخصم: أصول غير متداولة أخرى', hint: 'أصول غير متداولة غير الأصول الثابتة' },
  { key: 'carriedForwardLossesDeduction', label: 'يخصم: خسائر مدورة', hint: 'وفق الضوابط النظامية المعمول بها' },
  { key: 'dividendsDeduction', label: 'يخصم: توزيعات أرباح', hint: 'توزيعات معتمدة خلال الفترة' },
];

const emptyInputs = () => Object.fromEntries(MANUAL_FIELDS.map((f) => [f.key, '0']));

const STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'مسودة', color: 'amber' },
  POSTED: { label: 'مرحّل', color: 'green' },
  CANCELLED: { label: 'ملغى', color: 'red' },
};

export function ZakatPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const [inputs, setInputs] = useState<Record<string, string>>(emptyInputs());
  const [notes, setNotes] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);

  const settings = useQuery({ queryKey: ['zakat-settings'], queryFn: () => api.get<any>('/zakat/settings') });
  const [own, setOwn] = useState({ saudi: '100', foreign: '0' });
  useEffect(() => {
    if (settings.data) setOwn({ saudi: String(Number(settings.data.saudiGulfPct)), foreign: String(Number(settings.data.foreignPct)) });
  }, [settings.data]);
  const saveOwn = useMutation({
    mutationFn: () => api.put<any>('/zakat/settings', { saudiGulfPct: own.saudi, foreignPct: own.foreign }),
    onSuccess: () => { toast.success('تم حفظ نسب الملكية'); qc.invalidateQueries({ queryKey: ['zakat-settings'] }); calc.mutate(); },
    onError: (e) => toast.error(e),
  });
  const returns = useQuery({ queryKey: ['zakat-returns'], queryFn: () => api.get<any[]>('/zakat/returns') });

  const calc = useMutation({
    mutationFn: () => api.post<any>('/zakat/calculate', { periodFrom: from, periodTo: to, inputs }),
    onError: (e) => toast.error(e),
  });
  // Recalculate whenever the period or an adjustment changes (debounced).
  useEffect(() => {
    const t = setTimeout(() => calc.mutate(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, JSON.stringify(inputs)]);

  const save = useMutation({
    mutationFn: () => api.post<any>('/zakat/returns', { periodFrom: from, periodTo: to, inputs, notes: notes || null }),
    onSuccess: (r) => { toast.success(`تم حفظ الإقرار ${r.returnNo} كمسودة`); qc.invalidateQueries({ queryKey: ['zakat-returns'] }); },
    onError: (e) => toast.error(e),
  });
  const post = useMutation({
    mutationFn: (id: string) => api.post<any>(`/zakat/returns/${id}/post`),
    onSuccess: (r) => { toast.success(`تم ترحيل مخصص الزكاة (${r.returnNo})`); qc.invalidateQueries({ queryKey: ['zakat-returns'] }); },
    onError: (e) => toast.error(e),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<any>(`/zakat/returns/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('تم إلغاء الإقرار'); setCancelId(null); qc.invalidateQueries({ queryKey: ['zakat-returns'] }); },
    onError: (e) => toast.error(e),
  });

  if (settings.isLoading) return <Loading />;
  if (settings.error) return <ErrorState error={settings.error} />;
  const s = settings.data;
  const ws = calc.data;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="احتساب الزكاة وضريبة الدخل"
        subtitle="وعاء زكوي محتسب من دفتر الأستاذ مع تسويات يدخلها المحاسب، ثم ترحيل المخصص بقيد آلي. ورقة العمل أداة مساعدة تُراجع محاسبياً قبل التقديم للهيئة."
        actions={<button className="btn-secondary print:hidden" onClick={() => window.print()}><Printer className="size-4" /> طباعة</button>}
      />

      <div className="card flex flex-wrap items-end gap-x-5 gap-y-3 p-4 text-sm">
        <span className="pb-2 font-bold">هيكل الملكية المعتمد:</span>
        <Field label="سعودي / خليجي %" className="w-36">
          <input className="input num" inputMode="decimal" value={own.saudi} onChange={(e) => setOwn({ saudi: e.target.value, foreign: String(Math.max(0, 100 - Number(e.target.value || 0))) })} />
        </Field>
        <Field label="أجنبي %" className="w-36">
          <input className="input num" inputMode="decimal" value={own.foreign} onChange={(e) => setOwn({ foreign: e.target.value, saudi: String(Math.max(0, 100 - Number(e.target.value || 0))) })} />
        </Field>
        <button className="btn-secondary" disabled={saveOwn.isPending || Number(own.saudi) + Number(own.foreign) !== 100} onClick={() => saveOwn.mutate()}>
          {saveOwn.isPending ? <Spinner /> : <Save className="size-4" />} حفظ النسب
        </button>
        <span className="pb-2 text-slate-600 dark:text-slate-300">معدل الزكاة {Number(s.zakatRatePct)}% — ضريبة الدخل {Number(s.incomeTaxRatePct)}%</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          <div className="card space-y-3 p-4">
            <h3 className="flex items-center gap-2 font-bold"><Calculator className="size-4 text-brand-600" /> الفترة والتسويات</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="من تاريخ"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="إلى تاريخ"><input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            {MANUAL_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input className="input num" inputMode="decimal" value={inputs[f.key]} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value.replace(/[^0-9.-]/g, '') || '0' })} />
              </Field>
            ))}
            <Field label="ملاحظات">
              <textarea className="input h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <button className="btn-primary w-full" disabled={save.isPending || !ws} onClick={() => save.mutate()}>
              {save.isPending ? <Spinner /> : <Save className="size-4" />} حفظ كإقرار (مسودة)
            </button>
          </div>
        </div>

        <div className="space-y-4 lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="الوعاء الزكوي" value={ws ? money(ws.zakatBase) : '…'} tone="blue" icon={FileText} />
            <Stat label="الزكاة المستحقة" value={ws ? money(ws.zakatDue) : '…'} tone="green" icon={Calculator} />
            <Stat label="ضريبة الدخل" value={ws ? money(ws.incomeTaxDue) : '…'} tone="amber" icon={Calculator} />
            <Stat label="إجمالي المستحق" value={ws ? money(ws.totalDue) : '…'} tone="purple" icon={Calculator} />
          </div>

          {ws?.baseFlooredToProfit && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>الوعاء بعد الحسميات ({money(ws.zakatBaseRaw)}) أقل من صافي الربح المعدّل، لذلك رُفع الوعاء إلى صافي الربح المعدّل.</span>
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/60">
              ورقة العمل — {ws ? `${date(ws.periodFrom)} إلى ${date(ws.periodTo)} (${ws.days} يوماً، المعدل الفعلي ${ws.effectiveZakatRatePct}%)` : 'جارٍ الاحتساب…'}
            </div>
            {!ws ? <Loading /> : (
              <table className="table">
                <tbody>
                  {ws.lines.map((l: any) => (
                    <tr key={l.key} className={l.kind === 'subtotal' ? 'bg-slate-50 font-bold dark:bg-slate-800/40' : l.kind === 'result' ? 'bg-brand-50 font-black dark:bg-brand-950/30' : ''}>
                      <td className="whitespace-normal">
                        {l.labelAr}
                        {l.kind === 'ledger' && <span className="ms-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">من الدفاتر</span>}
                      </td>
                      <td className="num text-start">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/60">الإقرارات المحفوظة</div>
        {returns.isLoading ? <Loading /> : !returns.data?.length ? <EmptyState text="لا توجد إقرارات محفوظة بعد." /> : (
          <table className="table">
            <thead><tr><th>الرقم</th><th>الفترة</th><th>الوعاء</th><th>الزكاة</th><th>ضريبة الدخل</th><th>الإجمالي</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {returns.data.map((r: any) => (
                <tr key={r.id}>
                  <td className="num">{r.returnNo}</td>
                  <td className="num whitespace-normal">{date(r.periodFrom)} ← {date(r.periodTo)}</td>
                  <td className="num">{money(r.zakatBase)}</td>
                  <td className="num">{money(r.zakatDue)}</td>
                  <td className="num">{money(r.incomeTaxDue)}</td>
                  <td className="num font-bold">{money(r.totalDue)}</td>
                  <td><Badge color={STATUS[r.status]?.color as any}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                  <td className="whitespace-normal">
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'DRAFT' && (
                        <button className="btn-primary h-8 text-xs" disabled={post.isPending} onClick={() => post.mutate(r.id)}>
                          <Send className="size-3.5" /> ترحيل المخصص
                        </button>
                      )}
                      {r.status !== 'CANCELLED' && (
                        <button className="btn-secondary h-8 text-xs text-rose-700" onClick={() => setCancelId(r.id)}>
                          <XCircle className="size-3.5" /> إلغاء
                        </button>
                      )}
                      {r.status === 'POSTED' && <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" /> قيد المخصص مُرحّل</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ReasonDialog
        open={!!cancelId}
        title="إلغاء الإقرار الزكوي"
        confirmText="تأكيد الإلغاء"
        danger
        onClose={() => setCancelId(null)}
        onConfirm={async (reason) => { if (cancelId) await cancel.mutateAsync({ id: cancelId, reason }); }}
        extra={<p className="mb-3 text-xs text-slate-500">إن كان الإقرار مرحّلاً فسيُنشأ قيد عكسي تلقائياً لمخصصه بتاريخ {today()}.</p>}
      />
    </div>
  );
}
