import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, History, Percent, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { saveStoredCompany } from '../lib/storage-company';
import { date, dateTime } from '../lib/format';
import { ActiveBadge, cleanPayload, CrudPage, EntityForm, FieldDef, fieldErrors } from '../components/CrudPage';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';

const nameOf = (r: any) => `${r.code} — ${r.nameAr ?? r.name ?? r.titleAr}`;

// ------------------------------------------------------------------ company
const companyFields: FieldDef[] = [
  { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
  { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
  { name: 'legalName', label: 'الاسم القانوني', type: 'text' },
  { name: 'taxNumber', label: 'الرقم الضريبي', type: 'text', ltr: true },
  { name: 'commercialReg', label: 'السجل التجاري', type: 'text', ltr: true },
  { name: 'countryCode', label: 'رمز الدولة', type: 'text', ltr: true },
  { name: 'timezone', label: 'المنطقة الزمنية', type: 'text', ltr: true },
  { name: 'address', label: 'العنوان', type: 'textarea' },
];

export function CompanyPage() {
  const toast = useToast();
  const { reload } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['company'], queryFn: () => api.get<any>('/companies/current') });
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...cleanPayload(companyFields, form!, true), rowVersion: q.data?.rowVersion ?? 1 };
      saveStoredCompany(payload);
      return api.patch('/companies/current', payload);
    },
    onSuccess: async () => {
      toast.success('تم حفظ بيانات الشركة بنجاح');
      setForm(null);
      qc.invalidateQueries({ queryKey: ['company'] });
      await reload();
    },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const c = q.data;
  return (
    <div>
      <PageHeader title="بيانات الشركة" actions={<button className="btn-primary" onClick={() => setForm({ ...c })}>تعديل</button>} />
      <div className="card grid grid-cols-2 gap-4 p-5 md:grid-cols-3">
        {[
          ['الرمز', c.code], ['الاسم بالعربية', c.nameAr], ['الاسم بالإنجليزية', c.nameEn], ['الاسم القانوني', c.legalName],
          ['الرقم الضريبي', c.taxNumber], ['السجل التجاري', c.commercialReg], ['الدولة', c.countryCode], ['المنطقة الزمنية', c.timezone],
          ['العملة الأساسية', c.baseCurrency], ['شهر بداية السنة المالية', c.fiscalYearStartMonth], ['العنوان', c.address],
        ].map(([k, v]) => (
          <div key={k as string}>
            <div className="text-xs text-slate-500">{k}</div>
            <div className="mt-0.5 font-medium">{v ?? '—'}</div>
          </div>
        ))}
      </div>
      <Drawer
        open={!!form}
        onClose={() => setForm(null)}
        title="تعديل بيانات الشركة"
        footer={<><button className="btn-secondary" onClick={() => setForm(null)}>إلغاء</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} حفظ</button></>}
      >
        {form && <EntityForm fields={companyFields} value={form} onChange={setForm} />}
      </Drawer>
    </div>
  );
}

// ------------------------------------------------------------------ master data
export const BranchesPage = () => (
  <CrudPage
    title="الفروع والشركات التابعة" path="/branches" entityLabel="فرع"
    columns={[
      { key: 'code', label: 'الرمز' },
      { key: 'nameAr', label: 'الاسم' },
      { key: 'countryCode', label: 'الدولة', render: (r) => r.countryCode === 'SA' ? 'المملكة العربية السعودية' : r.countryCode === 'EG' ? 'جمهورية مصر العربية' : (r.countryCode ?? 'SA') },
      { key: 'functionalCurrency', label: 'العملة الوظيفية', render: (r) => <Badge color={r.functionalCurrency === 'SAR' ? 'blue' : r.functionalCurrency === 'EGP' ? 'cyan' : 'slate'}>{r.functionalCurrency ?? 'SAR'}</Badge> },
      { key: 'documentSequencePrefix', label: 'بادئة الترقيم' },
      { key: 'taxNumber', label: 'الرقم الضريبي' },
      { key: 'address', label: 'العنوان' },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> }
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true },
      { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
      { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
      { name: 'countryCode', label: 'الدولة', type: 'select', options: [{ value: 'SA', label: 'المملكة العربية السعودية (SA)' }, { value: 'EG', label: 'جمهورية مصر العربية (EG)' }], required: true, default: 'SA' },
      { name: 'functionalCurrency', label: 'العملة الوظيفية', type: 'select', options: [{ value: 'SAR', label: 'ريال سعودي (SAR - عملة الأساس)' }, { value: 'EGP', label: 'جنيه مصري (EGP)' }, { value: 'USD', label: 'دولار أمريكي (USD)' }], required: true, default: 'SAR' },
      { name: 'documentSequencePrefix', label: 'بادئة ترقيم الوثائق (مثال: RUH- / CAI-)', type: 'text', ltr: true },
      { name: 'taxNumber', label: 'الرقم الضريبي للفرع', type: 'text', ltr: true },
      { name: 'isActive', label: 'نشط', type: 'bool', default: true },
      { name: 'address', label: 'العنوان', type: 'textarea' },
    ]}
  />
);

const CC_TYPES = [{ value: 'DIRECT', label: 'مباشر' }, { value: 'INDIRECT', label: 'غير مباشر' }, { value: 'ADMIN', label: 'إداري' }];
export const CostCentersPage = () => (
  <CrudPage
    title="مراكز التكلفة" path="/cost-centers" entityLabel="مركز تكلفة"
    columns={[
      { key: 'code', label: 'الرمز' }, { key: 'nameAr', label: 'الاسم' },
      { key: 'ccType', label: 'النوع', render: (r) => CC_TYPES.find((t) => t.value === r.ccType)?.label },
      { key: 'isPosting', label: 'تفصيلي', render: (r) => (r.isPosting ? 'نعم' : 'تجميعي') },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true },
      { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
      { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
      { name: 'parentId', label: 'المركز الأب', type: 'ref', ref: { path: '/cost-centers', label: nameOf } },
      { name: 'ccType', label: 'النوع', type: 'select', options: CC_TYPES, required: true, default: 'DIRECT' },
      { name: 'isPosting', label: 'يقبل الترحيل (تفصيلي)', type: 'bool', default: true },
      { name: 'isActive', label: 'نشط', type: 'bool', default: true },
    ]}
  />
);

export const DepartmentsPage = () => (
  <CrudPage
    title="الأقسام" path="/departments" entityLabel="قسم"
    columns={[{ key: 'code', label: 'الرمز' }, { key: 'nameAr', label: 'الاسم' }, { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> }]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true },
      { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
      { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
      { name: 'branchId', label: 'الفرع', type: 'ref', ref: { path: '/branches', label: nameOf } },
      { name: 'parentId', label: 'القسم الأب', type: 'ref', ref: { path: '/departments', label: nameOf } },
      { name: 'defaultCostCenterId', label: 'مركز التكلفة الافتراضي', type: 'ref', ref: { path: '/cost-centers', label: nameOf } },
      { name: 'isActive', label: 'نشط', type: 'bool', default: true },
    ]}
  />
);

const TAX_TYPES = [
  { value: 'VAT_OUTPUT', label: 'ضريبة قيمة مضافة - مبيعات' }, { value: 'VAT_INPUT', label: 'ضريبة قيمة مضافة - مشتريات' },
  { value: 'WITHHOLDING', label: 'خصم من المنبع' }, { value: 'PAYROLL_TAX', label: 'ضريبة كسب العمل' },
];

function RatesModal({ taxCode, onClose }: { taxCode: any; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['tax-rates', taxCode.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<any[]>(`/tax-codes/${taxCode.id}/rates`) });
  const [f, setF] = useState({ ratePct: '', effectiveFrom: '' });
  const add = useMutation({
    mutationFn: () => api.post(`/tax-codes/${taxCode.id}/rates`, f),
    onSuccess: () => {
      toast.success('تمت إضافة النسبة');
      setF({ ratePct: '', effectiveFrom: '' });
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title={`نسب الضريبة — ${taxCode.name}`}>
      <p className="mb-3 text-xs text-slate-500">النسب مؤرخة بتاريخ سريان؛ إضافة نسبة جديدة تنهي النسبة السابقة تلقائيًا دون تغيير الحركات التاريخية.</p>
      {q.isLoading ? <Loading /> : (
        <table className="table mb-4">
          <thead><tr><th>النسبة %</th><th>من</th><th>إلى</th></tr></thead>
          <tbody>
            {(q.data ?? []).map((r) => <tr key={r.id}><td className="num">{r.ratePct}</td><td>{date(r.effectiveFrom)}</td><td>{date(r.effectiveTo)}</td></tr>)}
            {q.data?.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500">لا توجد نسب بعد</td></tr>}
          </tbody>
        </table>
      )}
      <div className="flex items-end gap-2">
        <Field label="النسبة %" className="flex-1"><input className="input" dir="ltr" value={f.ratePct} onChange={(e) => setF({ ...f, ratePct: e.target.value })} /></Field>
        <Field label="تاريخ السريان" className="flex-1"><input className="input" type="date" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
        <button className="btn-primary" disabled={!f.ratePct || !f.effectiveFrom || add.isPending} onClick={() => add.mutate()}><Plus className="size-4" /> إضافة</button>
      </div>
    </Modal>
  );
}

export function TaxesPage() {
  const [rates, setRates] = useState<any | null>(null);
  return (
    <>
      <CrudPage
        title="الضرائب" path="/tax-codes" entityLabel="رمز ضريبي"
        columns={[
          { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الاسم' },
          { key: 'taxType', label: 'النوع', render: (r) => TAX_TYPES.find((t) => t.value === r.taxType)?.label },
          { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
        ]}
        fields={[
          { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true },
          { name: 'name', label: 'الاسم', type: 'text', required: true },
          { name: 'taxType', label: 'النوع', type: 'select', options: TAX_TYPES, required: true, default: 'VAT_OUTPUT' },
          { name: 'accountId', label: 'حساب الضريبة', type: 'ref', ref: { path: '/accounts', query: { postingOnly: 'true' }, label: nameOf } },
          { name: 'isActive', label: 'نشط', type: 'bool', default: true },
        ]}
        extraActions={(r) => <button className="btn-ghost h-7 px-2" title="النسب" onClick={() => setRates(r)}><Percent className="size-3.5" /></button>}
      />
      {rates && <RatesModal taxCode={rates} onClose={() => setRates(null)} />}
    </>
  );
}

function HolidaysModal({ cal, onClose }: { cal: any; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['holidays', cal.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<any[]>(`/work-calendars/${cal.id}/holidays`) });
  const [f, setF] = useState({ holidayDate: '', name: '' });
  const add = useMutation({
    mutationFn: () => api.post(`/work-calendars/${cal.id}/holidays`, f),
    onSuccess: () => { setF({ holidayDate: '', name: '' }); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(e),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/work-calendars/${cal.id}/holidays/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: key }), onError: (e) => toast.error(e) });
  return (
    <Modal open onClose={onClose} title={`العطلات — ${cal.name}`}>
      {q.isLoading ? <Loading /> : (
        <table className="table mb-4">
          <thead><tr><th>التاريخ</th><th>الاسم</th><th /></tr></thead>
          <tbody>
            {(q.data ?? []).map((h) => <tr key={h.id}><td>{date(h.holidayDate)}</td><td>{h.name}</td><td><button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => del.mutate(h.id)}><Trash2 className="size-3.5" /></button></td></tr>)}
            {q.data?.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500">لا توجد عطلات مسجلة</td></tr>}
          </tbody>
        </table>
      )}
      <div className="flex items-end gap-2">
        <Field label="التاريخ" className="flex-1"><input className="input" type="date" value={f.holidayDate} onChange={(e) => setF({ ...f, holidayDate: e.target.value })} /></Field>
        <Field label="الاسم" className="flex-1"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <button className="btn-primary" disabled={!f.holidayDate || !f.name} onClick={() => add.mutate()}><Plus className="size-4" /></button>
      </div>
    </Modal>
  );
}

export function CalendarsPage() {
  const [cal, setCal] = useState<any | null>(null);
  return (
    <>
      <CrudPage
        title="تقويمات العمل" path="/work-calendars" entityLabel="تقويم"
        columns={[
          { key: 'code', label: 'الرمز' }, { key: 'name', label: 'الاسم' },
          { key: 'stdHoursPerDay', label: 'ساعات اليوم', className: 'num' },
          { key: 'isDefault', label: 'افتراضي', render: (r) => (r.isDefault ? <Badge color="blue">افتراضي</Badge> : '') },
        ]}
        fields={[
          { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true },
          { name: 'name', label: 'الاسم', type: 'text', required: true },
          { name: 'stdHoursPerDay', label: 'ساعات العمل اليومية', type: 'decimal', required: true, default: '8' },
          { name: 'isDefault', label: 'افتراضي', type: 'bool', default: false },
          { name: 'weekendDays', label: 'أيام العطلة الأسبوعية', type: 'weekdays', default: [5, 6] },
        ]}
        extraActions={(r) => <button className="btn-ghost h-7 px-2" title="العطلات" onClick={() => setCal(r)}><CalendarDays className="size-3.5" /></button>}
      />
      {cal && <HolidaysModal cal={cal} onClose={() => setCal(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ currencies
export function CurrenciesPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const all = useQuery({ queryKey: ['currencies'], queryFn: () => api.get<any[]>('/currencies') });
  const mine = useQuery({ queryKey: ['company-currencies'], queryFn: () => api.get<any[]>('/company-currencies') });
  const [filter, setFilter] = useState({ fromCurrency: '', toCurrency: '' });
  const rates = useQuery({ queryKey: ['exchange-rates', filter], queryFn: () => api.get<any>('/exchange-rates', { ...filter, pageSize: 100 }) });
  const [addCur, setAddCur] = useState('');
  const [rateForm, setRateForm] = useState<Record<string, any> | null>(null);
  const base = mine.data?.find((c) => c.isBase)?.code;

  const enable = useMutation({
    mutationFn: () => api.post('/company-currencies', { code: addCur }),
    onSuccess: () => { setAddCur(''); qc.invalidateQueries({ queryKey: ['company-currencies'] }); toast.success('تم تفعيل العملة'); },
    onError: (e) => toast.error(e),
  });
  const disable = useMutation({ mutationFn: (code: string) => api.del(`/company-currencies/${code}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['company-currencies'] }), onError: (e) => toast.error(e) });
  const saveRate = useMutation({
    mutationFn: () => (rateForm!.id ? api.patch(`/exchange-rates/${rateForm!.id}`, { rate: rateForm!.rate, source: rateForm!.source || null }) : api.post('/exchange-rates', { ...rateForm, source: rateForm!.source || null })),
    onSuccess: () => { setRateForm(null); qc.invalidateQueries({ queryKey: ['exchange-rates'] }); toast.success('تم حفظ سعر الصرف'); },
    onError: (e) => toast.error(e),
  });
  const delRate = useMutation({ mutationFn: (id: string) => api.del(`/exchange-rates/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }), onError: (e) => toast.error(e) });

  return (
    <div className="space-y-5">
      <PageHeader title="العملات وأسعار الصرف" subtitle="كل حركة مالية تحفظ عملتها وسعر الصرف المستخدم ومبلغها بالعملة الأساسية، فلا تتغير النتائج التاريخية عند تغير السعر." />
      <div className="card p-4">
        <h3 className="mb-3 font-semibold">عملات الشركة</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {mine.data?.map((c) => (
            <span key={c.code} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">
              <b>{c.code}</b> {c.nameAr} {c.isBase ? <Badge color="blue">أساسية</Badge> : <button className="text-rose-500" onClick={() => disable.mutate(c.code)}><Trash2 className="size-3.5" /></button>}
            </span>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Field label="تفعيل عملة" className="w-64">
            <select className="input" value={addCur} onChange={(e) => setAddCur(e.target.value)}>
              <option value="">—</option>
              {all.data?.filter((c) => !mine.data?.some((m) => m.code === c.code)).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.nameAr}</option>)}
            </select>
          </Field>
          <button className="btn-primary" disabled={!addCur} onClick={() => enable.mutate()}><Plus className="size-4" /> تفعيل</button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <h3 className="me-auto font-semibold">أسعار الصرف</h3>
          <select className="input w-32" value={filter.fromCurrency} onChange={(e) => setFilter({ ...filter, fromCurrency: e.target.value })}>
            <option value="">من: الكل</option>{mine.data?.map((c) => <option key={c.code}>{c.code}</option>)}
          </select>
          <select className="input w-32" value={filter.toCurrency} onChange={(e) => setFilter({ ...filter, toCurrency: e.target.value })}>
            <option value="">إلى: الكل</option>{mine.data?.map((c) => <option key={c.code}>{c.code}</option>)}
          </select>
          <button className="btn-primary" onClick={() => setRateForm({ fromCurrency: '', toCurrency: base ?? '', rateType: 'SPOT', rateDate: new Date().toISOString().slice(0, 10), rate: '', source: '' })}>
            <Plus className="size-4" /> سعر جديد
          </button>
        </div>
        {rates.isLoading ? <Loading /> : rates.error ? <ErrorState error={rates.error} /> : rates.data.data.length === 0 ? (
          <EmptyState text="لا توجد أسعار صرف مسجلة بعد. أضف سعرًا لكل عملة أجنبية تتعامل بها." />
        ) : (
          <table className="table">
            <thead><tr><th>من</th><th>إلى</th><th>النوع</th><th>التاريخ</th><th>السعر</th><th>المصدر</th><th /></tr></thead>
            <tbody>
              {rates.data.data.map((r: any) => (
                <tr key={r.id}>
                  <td>{r.fromCurrency}</td><td>{r.toCurrency}</td>
                  <td>{{ SPOT: 'فوري', MONTHLY_AVG: 'متوسط شهري', CLOSING: 'إقفال' }[r.rateType as string]}</td>
                  <td>{date(r.rateDate)}</td><td className="num">{r.rate}</td><td>{r.source ?? '—'}</td>
                  <td className="text-end">
                    <button className="btn-ghost h-7 px-2" onClick={() => setRateForm({ ...r })}>تعديل</button>
                    <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => confirm('حذف السعر؟') && delRate.mutate(r.id)}><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!rateForm}
        onClose={() => setRateForm(null)}
        title={rateForm?.id ? 'تعديل سعر الصرف' : 'سعر صرف جديد'}
        footer={<><button className="btn-secondary" onClick={() => setRateForm(null)}>إلغاء</button><button className="btn-primary" disabled={saveRate.isPending} onClick={() => saveRate.mutate()}>{saveRate.isPending && <Spinner />} حفظ</button></>}
      >
        {rateForm && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="من عملة"><select className="input" disabled={!!rateForm.id} value={rateForm.fromCurrency} onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value })}><option value="">—</option>{mine.data?.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
            <Field label="إلى عملة"><select className="input" disabled={!!rateForm.id} value={rateForm.toCurrency} onChange={(e) => setRateForm({ ...rateForm, toCurrency: e.target.value })}><option value="">—</option>{mine.data?.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
            <Field label="نوع السعر"><select className="input" disabled={!!rateForm.id} value={rateForm.rateType} onChange={(e) => setRateForm({ ...rateForm, rateType: e.target.value })}><option value="SPOT">فوري</option><option value="MONTHLY_AVG">متوسط شهري</option><option value="CLOSING">إقفال</option></select></Field>
            <Field label="التاريخ"><input className="input" type="date" disabled={!!rateForm.id} value={rateForm.rateDate} onChange={(e) => setRateForm({ ...rateForm, rateDate: e.target.value })} /></Field>
            <Field label="السعر" hint="1 من العملة الأولى = ؟ من العملة الثانية"><input className="input" dir="ltr" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })} /></Field>
            <Field label="المصدر"><input className="input" value={rateForm.source ?? ''} onChange={(e) => setRateForm({ ...rateForm, source: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------------ fiscal
export const PERIOD_STATUS: Record<string, { label: string; color: 'green' | 'red' | 'amber' | 'slate' }> = {
  OPEN: { label: 'مفتوحة', color: 'green' },
  CLOSING: { label: 'قيد الإقفال', color: 'amber' },
  CLOSED: { label: 'مقفلة', color: 'red' },
  LOCKED: { label: 'مقفلة نهائيًا', color: 'slate' },
};

export function FiscalPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ['fiscal-years'], queryFn: () => api.get<any[]>('/fiscal-years') });
  const [sel, setSel] = useState<string | null>(null);
  const yearId = sel ?? years.data?.[0]?.id ?? null;
  const year = useQuery({ queryKey: ['fiscal-year', yearId], enabled: !!yearId, queryFn: () => api.get<any>(`/fiscal-years/${yearId}`) });
  const [newYear, setNewYear] = useState<{ code: string; startDate: string } | null>(null);
  const [hist, setHist] = useState<any | null>(null);
  const history = useQuery({ queryKey: ['period-history', hist?.id], enabled: !!hist, queryFn: () => api.get<any[]>(`/fiscal-periods/${hist.id}/history`) });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => api.post<any>('/fiscal-years', newYear),
    onSuccess: (y) => { toast.success('تم إنشاء السنة المالية وفتراتها'); setNewYear(null); setSel(y.id); qc.invalidateQueries({ queryKey: ['fiscal-years'] }); },
    onError: (e) => { setErrs(fieldErrors(e)); toast.error(e); },
  });
  return (
    <div>
      <PageHeader
        title="السنوات والفترات المالية"
        subtitle="كل سنة تنشأ تلقائيًا بـ 12 فترة شهرية + فترة تسويات. الإقفال يتم من شاشة الإقفال."
        actions={<button className="btn-primary" onClick={() => {
          const last = years.data?.[0];
          const next = last ? new Date(Date.parse(`${last.endDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : `${new Date().getFullYear()}-01-01`;
          setNewYear({ code: `FY${next.slice(0, 4)}`, startDate: next });
        }}><Plus className="size-4" /> سنة مالية جديدة</button>}
      />
      {years.isLoading ? <Loading /> : years.data?.length === 0 ? <div className="card"><EmptyState text="لا توجد سنوات مالية بعد." /></div> : (
        <div className="grid grid-cols-[220px_1fr] gap-4">
          <div className="card p-2">
            {years.data?.map((y) => (
              <button key={y.id} onClick={() => setSel(y.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${y.id === yearId ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span className="font-medium">{y.code}</span>
                <Badge color={y.status === 'OPEN' ? 'green' : 'red'}>{y.status === 'OPEN' ? 'مفتوحة' : 'مقفلة'}</Badge>
              </button>
            ))}
          </div>
          <div className="card overflow-hidden">
            {year.isLoading ? <Loading /> : year.data && (
              <table className="table">
                <thead><tr><th>#</th><th>الفترة</th><th>من</th><th>إلى</th><th>الحالة</th><th>تاريخ الإقفال</th><th>مرات إعادة الفتح</th><th /></tr></thead>
                <tbody>
                  {year.data.periods.map((p: any) => (
                    <tr key={p.id}>
                      <td className="num">{p.periodNo}</td>
                      <td>{p.name} {p.isAdjustmentPeriod && <Badge color="amber">تسويات</Badge>}</td>
                      <td>{date(p.startDate)}</td><td>{date(p.endDate)}</td>
                      <td><Badge color={PERIOD_STATUS[p.status].color}>{PERIOD_STATUS[p.status].label}</Badge></td>
                      <td>{dateTime(p.closedAt)}</td><td className="num">{p.reopenCount}</td>
                      <td><button className="btn-ghost h-7 px-2" title="السجل" onClick={() => setHist(p)}><History className="size-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      <Modal open={!!newYear} onClose={() => setNewYear(null)} title="سنة مالية جديدة"
        footer={<><button className="btn-secondary" onClick={() => setNewYear(null)}>إلغاء</button><button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending && <Spinner />} إنشاء</button></>}>
        {newYear && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="الرمز" error={errs.code}><input className="input" dir="ltr" value={newYear.code} onChange={(e) => setNewYear({ ...newYear, code: e.target.value })} /></Field>
            <Field label="تاريخ البداية" hint="أول يوم في الشهر" error={errs.startDate}><input className="input" type="date" value={newYear.startDate} onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Drawer open={!!hist} onClose={() => setHist(null)} title={`سجل حالة الفترة ${hist?.name ?? ''}`}>
        {history.isLoading ? <Loading /> : history.data?.length === 0 ? <EmptyState text="لم تتغير حالة هذه الفترة بعد" /> : (
          <ol className="space-y-3">
            {history.data?.map((h) => (
              <li key={h.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Badge color={PERIOD_STATUS[h.oldStatus]?.color}>{PERIOD_STATUS[h.oldStatus]?.label}</Badge> ←
                  <Badge color={PERIOD_STATUS[h.newStatus]?.color}>{PERIOD_STATUS[h.newStatus]?.label}</Badge>
                  <span className="ms-auto text-xs text-slate-500">{dateTime(h.changedAt)}</span>
                </div>
                <div className="mt-2">{h.reason}</div>
                <div className="mt-1 text-xs text-slate-500">بواسطة: {h.changedBy ?? '—'}</div>
              </li>
            ))}
          </ol>
        )}
      </Drawer>
    </div>
  );
}
