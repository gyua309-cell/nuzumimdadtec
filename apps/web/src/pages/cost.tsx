import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Plus, Printer, Square, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, downloadCsv, money, today } from '../lib/format';
import { CALC_METHOD, COMPONENT_NATURE, COMPONENT_TYPE, COST_BEHAVIOR, opts, POSTING_TREATMENT, PROFITABILITY_TREATMENT, TAX_TREATMENT } from '../lib/labels';
import { ActiveBadge, CrudPage, FieldDef } from '../components/CrudPage';
import { FormModal, PeriodSelect, REF } from '../components/forms';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, Stat, useToast } from '../components/ui';
import { CostLinesTable } from './hr';

// ------------------------------------------------------------------ cost components
const componentFields: FieldDef[] = [
  { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true, createOnly: true },
  { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
  { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
  { name: 'componentType', label: 'النوع', type: 'select', options: opts(COMPONENT_TYPE), required: true, default: 'SALARY' },
  { name: 'nature', label: 'الطبيعة المحاسبية', type: 'select', options: opts(COMPONENT_NATURE), required: true, default: 'EARNING' },
  { name: 'calcMethod', label: 'طريقة الحساب', type: 'select', options: opts(CALC_METHOD), required: true, default: 'BASIC_SALARY' },
  { name: 'costBehavior', label: 'سلوك التكلفة', type: 'select', options: opts(COST_BEHAVIOR), required: true, default: 'FIXED' },
  { name: 'profitabilityTreatment', label: 'معاملة الربحية', type: 'select', options: opts(PROFITABILITY_TREATMENT), required: true, default: 'DISTRIBUTE' },
  { name: 'postingTreatment', label: 'معاملة الترحيل', type: 'select', options: opts(POSTING_TREATMENT), required: true, default: 'PAYROLL' },
  { name: 'taxTreatment', label: 'المعاملة الضريبية', type: 'select', options: opts(TAX_TREATMENT), required: true, default: 'NOT_APPLICABLE' },
  { name: 'taxablePct', label: 'نسبة الخاضع للضريبة %', type: 'decimal', hint: 'مطلوبة عند "خاضع جزئيًا"' },
  { name: 'affectsNetPay', label: 'يؤثر على صافي الراتب', type: 'bool', default: false },
  { name: 'expenseAccountId', label: 'حساب المصروف', type: 'ref', ref: REF.postingAccount },
  { name: 'liabilityAccountId', label: 'حساب الالتزام', type: 'ref', ref: REF.postingAccount },
  { name: 'sortOrder', label: 'الترتيب', type: 'number', default: 100, required: true },
  { name: 'effectiveFrom', label: 'ساري من', type: 'date', required: true, default: today() },
  { name: 'effectiveTo', label: 'ساري حتى', type: 'date' },
  { name: 'isActive', label: 'نشط', type: 'bool', default: true },
  { name: 'description', label: 'وصف', type: 'textarea' },
];

export const CostComponentsPage = () => (
  <CrudPage
    title="مكونات التكلفة"
    subtitle="لا توجد مكونات مدمجة في الكود: أنشئ ما تحتاجه (راتب، تأمينات، طبي، إهلاك، مزايا…) وحدد لكل مكون طريقة حسابه وحساباته وسلوكه الربحي."
    path="/cost-components"
    entityLabel="مكون"
    columns={[
      { key: 'code', label: 'الرمز', className: 'num text-start' },
      { key: 'nameAr', label: 'الاسم' },
      { key: 'componentType', label: 'النوع', render: (r) => COMPONENT_TYPE[r.componentType] },
      { key: 'nature', label: 'الطبيعة', render: (r) => COMPONENT_NATURE[r.nature] },
      { key: 'calcMethod', label: 'الحساب', render: (r) => CALC_METHOD[r.calcMethod] },
      { key: 'profitabilityTreatment', label: 'الربحية', render: (r) => (r.profitabilityTreatment === 'DISTRIBUTE' ? <Badge color="blue">تُوزع</Badge> : <Badge>مستبعدة</Badge>) },
      { key: 'effective', label: 'السريان', render: (r) => `${date(r.effectiveFrom)} ← ${r.effectiveTo ? date(r.effectiveTo) : 'مفتوح'}`, className: 'text-xs' },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={componentFields}
  />
);

// ------------------------------------------------------------------ cost profiles
export const CostProfilesPage = () => {
  const nav = useNavigate();
  return (
    <CrudPage
      title="ملفات التكلفة"
      subtitle="ملف التكلفة مجموعة من المكونات بنسب ومبالغ مؤرخة، تُسند للموظفين بتاريخ سريان."
      path="/cost-profiles"
      entityLabel="ملف"
      onRowClick={(r) => nav(`/cost/profiles/${r.id}`)}
      columns={[
        { key: 'code', label: 'الرمز', className: 'num text-start' },
        { key: 'nameAr', label: 'الاسم' },
        { key: 'description', label: 'الوصف' },
        { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
      ]}
      fields={[
        { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true, createOnly: true },
        { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
        { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
        { name: 'description', label: 'وصف', type: 'textarea' },
        { name: 'isActive', label: 'نشط', type: 'bool', default: true },
      ]}
    />
  );
};

export function CostProfileDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const key = ['cost-profile', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<any>(`/cost-profiles/${id}`) });
  const act = useMutation({
    mutationFn: (f: () => Promise<any>) => f(),
    onSuccess: (d) => { if (d?.lines) qc.setQueryData(key, d); toast.success('تم'); },
    onError: (e) => toast.error(e),
  });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const p = q.data;
  const t = today();
  const handleExportCsv = () => {
    if (!p.lines?.length) return;
    downloadCsv(`cost-profile-${p.code}-${today()}.csv`, [
      ['كود المكون', 'اسم المكون', 'طريقة الحساب', 'الطبيعة', 'النسبة%', 'المبلغ', 'العملة', 'حد أدنى', 'حد أقصى', 'ساري من', 'ساري حتى'],
      ...p.lines.map((l: any) => [
        l.componentCode, l.componentName, CALC_METHOD[l.calcMethod] || l.calcMethod, COMPONENT_NATURE[l.nature] || l.nature, l.ratePct ? `${l.ratePct}%` : '', l.amount || '', l.currencyCode || '', l.minAmount || '', l.maxAmount || '', l.effectiveFrom || '', l.effectiveTo || 'مفتوح',
      ]),
    ]);
    toast.success('تم تصدير مكونات ملف التكلفة إلى CSV بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${p.code} — ${p.nameAr}`}
        subtitle={`${p.activeEmployees} موظف على هذا الملف حاليًا. التغييرات تنشئ إصدارات جديدة بتاريخ سريان ولا تعدّل الماضي.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير CSV
            </button>
            <Link to="/cost/profiles" className="btn-secondary text-xs flex items-center gap-1.5"><ArrowRight className="size-3.5" /> الملفات</Link>
          </div>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <h3 className="font-semibold">مكونات الملف</h3>
          <button className="btn-primary h-8" onClick={() => setModal(true)}><Plus className="size-4" /> إضافة / تعديل مكون</button>
        </div>
        {p.lines.length === 0 ? <EmptyState text="الملف فارغ. أضف المكونات التي تُحسب لموظفي هذا الملف." /> : (
          <table className="table">
            <thead><tr><th>المكون</th><th>الطبيعة</th><th>النسبة</th><th>المبلغ</th><th>حد أدنى</th><th>حد أقصى</th><th>السريان</th><th /></tr></thead>
            <tbody>
              {p.lines.map((l: any) => {
                const current = l.effectiveFrom <= t && (!l.effectiveTo || l.effectiveTo >= t);
                return (
                  <tr key={l.id} className={current ? '' : 'opacity-60'}>
                    <td>{l.componentCode} — {l.componentName}<div className="text-xs text-slate-500">{CALC_METHOD[l.calcMethod]}</div></td>
                    <td className="text-xs">{COMPONENT_NATURE[l.nature]}</td>
                    <td className="num">{l.ratePct ? `${l.ratePct}%` : '—'}</td>
                    <td className="num">{l.amount ? `${money(l.amount)} ${l.currencyCode}` : '—'}</td>
                    <td className="num">{l.minAmount ? money(l.minAmount) : '—'}</td>
                    <td className="num">{l.maxAmount ? money(l.maxAmount) : '—'}</td>
                    <td className="whitespace-nowrap text-xs">{date(l.effectiveFrom)} ← {l.effectiveTo ? date(l.effectiveTo) : 'مفتوح'} {current && <Badge color="green">ساري</Badge>}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {!l.effectiveTo && <button className="btn-ghost h-7 px-2" title="إنهاء" onClick={() => { const d = prompt('آخر يوم للمكون (YYYY-MM-DD)', today()); if (d) act.mutate(() => api.post(`/cost-profiles/${id}/lines/${l.id}/end`, { effectiveTo: d })); }}><Square className="size-3.5" /></button>}
                        <button className="btn-ghost h-7 px-2 text-rose-600" title="حذف (آخر إصدار)" onClick={() => confirm('حذف هذا الإصدار؟') && act.mutate(() => api.del(`/cost-profiles/${id}/lines/${l.id}`))}><Trash2 className="size-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <FormModal
        open={modal}
        title="إضافة / تعديل مكون في الملف"
        onClose={() => setModal(false)}
        initial={{ effectiveFrom: today() }}
        note="إضافة مكون موجود بتاريخ جديد تُنهي إصداره السابق في اليوم السابق وتبدأ القيم الجديدة من تاريخ السريان."
        onSubmit={async (b) => { qc.setQueryData(key, await api.post(`/cost-profiles/${id}/lines`, b)); }}
        fields={[
          { name: 'componentId', label: 'المكون', type: 'ref', ref: REF.component, required: true, full: true },
          { name: 'ratePct', label: 'النسبة %', type: 'decimal', hint: 'للمكونات النسبية' },
          { name: 'amount', label: 'المبلغ الشهري', type: 'decimal', hint: 'للمكونات الثابتة' },
          { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency },
          { name: 'minAmount', label: 'حد أدنى', type: 'decimal' },
          { name: 'maxAmount', label: 'حد أقصى', type: 'decimal' },
          { name: 'effectiveFrom', label: 'من', type: 'date', required: true },
          { name: 'effectiveTo', label: 'إلى', type: 'date' },
        ]}
      />
    </div>
  );
}

// ------------------------------------------------------------------ cost sheet
export function CostSheetPage() {
  const base = useBaseCurrency();
  const [periodId, setPeriodId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const sheet = useQuery({ queryKey: ['cost-sheet', periodId], enabled: !!periodId, queryFn: () => api.get<any>('/cost-sheet', { periodId }) });
  const exportCsv = () => {
    if (!sheet.data) return;
    downloadCsv(`cost-sheet-${sheet.data.period.name}.csv`, [
      ['الرقم', 'الموظف', 'أيام العمل', 'إجمالي التكلفة', 'القابلة للتوزيع', 'الاستقطاعات'],
      ...sheet.data.rows.map((r: any) => [r.code, r.fullNameAr, r.employedDays, r.totalCostBase, r.distributableCostBase, r.totalDeductionsBase]),
    ]);
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title="كشف تكلفة الموظفين"
        subtitle="تكلفة كل موظف عن الفترة بعملة الشركة الأساسية، محسوبة من البيانات الفعلية المؤرخة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {sheet.data && (
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={exportCsv} title="تصدير CSV">
                <Download className="size-3.5" /> تصدير Excel/CSV
              </button>
            )}
          </div>
        }
      />
      <Field label="الفترة"><PeriodSelect value={periodId} onChange={setPeriodId} /></Field>
      {sheet.isLoading ? <Loading /> : sheet.error ? <ErrorState error={sheet.error} /> : sheet.data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="إجمالي التكلفة" value={money(sheet.data.totals.totalCostBase)} hint={base} tone="blue" />
            <Stat label="القابلة للتوزيع على المشاريع" value={money(sheet.data.totals.distributableCostBase)} hint={base} tone="green" />
            <Stat label="استقطاعات الموظفين" value={money(sheet.data.totals.totalDeductionsBase)} hint="ليست تكلفة شركة" />
          </div>
          <div className="card overflow-x-auto">
            {sheet.data.rows.length === 0 ? <EmptyState text="لا يوجد موظفون عاملون في هذه الفترة." /> : (
              <table className="table">
                <thead><tr><th>الرقم</th><th>الموظف</th><th>أيام العمل</th><th>إجمالي التكلفة</th><th>القابلة للتوزيع</th><th>الاستقطاعات</th></tr></thead>
                <tbody>
                  {sheet.data.rows.map((r: any) => (
                    <Fragment key={r.employeeId}>
                      <tr className="cursor-pointer" onClick={() => setOpen(open === r.employeeId ? null : r.employeeId)}>
                        <td className="num text-start">{r.code}</td>
                        <td><Link className="text-brand-600 hover:underline" to={`/hr/employees/${r.employeeId}`} onClick={(e) => e.stopPropagation()}>{r.fullNameAr}</Link></td>
                        {r.error ? (
                          <td colSpan={4}><Badge color="red">{r.error.code}</Badge> <span className="text-xs text-rose-600">{r.error.message}</span></td>
                        ) : (
                          <>
                            <td className="num">{r.employedDays} / {r.periodDays}</td>
                            <td className="num">{money(r.totalCostBase)}</td>
                            <td className="num">{money(r.distributableCostBase)}</td>
                            <td className="num">{money(r.totalDeductionsBase)}</td>
                          </>
                        )}
                      </tr>
                      {open === r.employeeId && !r.error && (
                        <tr key={`${r.employeeId}-d`}><td colSpan={6} className="bg-slate-50 p-0 dark:bg-slate-800/40">{r.lines.length ? <CostLinesTable lines={r.lines} base={base} /> : <div className="p-3 text-xs text-slate-500">لا توجد مكونات (راجع الراتب وملف التكلفة).</div>}</td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
