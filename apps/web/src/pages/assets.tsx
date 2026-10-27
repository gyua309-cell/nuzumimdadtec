import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Eye, Laptop, Pencil, Play, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { api, Page } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, downloadCsv, money, today } from '../lib/format';
import { ASSET_KIND, ASSET_STATUS, DEP_METHOD, opts, RUN_STATUS } from '../lib/labels';
import { ActiveBadge, CrudPage, FieldDef } from '../components/CrudPage';
import { FormModal, PeriodSelect, REF } from '../components/forms';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, Pager, ReasonDialog, Stat, useToast } from '../components/ui';

const AssetStatus = ({ s }: { s: string }) => <Badge color={ASSET_STATUS[s]?.color}>{ASSET_STATUS[s]?.label ?? s}</Badge>;

// ------------------------------------------------------------------ categories
export const AssetCategoriesPage = () => (
  <CrudPage
    title="فئات الأصول"
    subtitle="حسابات الأصل ومجمع الإهلاك ومصروف الإهلاك تُحدد هنا، ومنها يحدد النظام الحسابات في قيود الاقتناء والإهلاك والاستبعاد."
    path="/asset-categories"
    entityLabel="فئة"
    columns={[
      { key: 'code', label: 'الرمز', className: 'num text-start' },
      { key: 'nameAr', label: 'الاسم' },
      { key: 'defaultUsefulLifeMonths', label: 'العمر الافتراضي (شهر)', className: 'num' },
      { key: 'defaultMethod', label: 'الطريقة', render: (r) => DEP_METHOD[r.defaultMethod] },
      { key: 'includeInEmployeeCost', label: 'ضمن تكلفة الموظف', render: (r) => (r.includeInEmployeeCost ? 'نعم' : 'لا') },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true, createOnly: true },
      { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
      { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
      { name: 'assetAccountId', label: 'حساب الأصل', type: 'ref', ref: REF.postingAccount, required: true },
      { name: 'accumAccountId', label: 'حساب مجمع الإهلاك', type: 'ref', ref: REF.postingAccount, required: true },
      { name: 'expenseAccountId', label: 'حساب مصروف الإهلاك', type: 'ref', ref: REF.postingAccount, required: true },
      { name: 'defaultUsefulLifeMonths', label: 'العمر الافتراضي (شهر)', type: 'number' },
      { name: 'defaultMethod', label: 'طريقة الإهلاك', type: 'select', options: opts(DEP_METHOD), required: true, default: 'STRAIGHT_LINE' },
      { name: 'includeInEmployeeCost', label: 'يدخل في تكلفة الموظف عند العهدة', type: 'bool', default: true },
      { name: 'isActive', label: 'نشطة', type: 'bool', default: true },
    ]}
  />
);

// ------------------------------------------------------------------ assets list
const assetFormFields: FieldDef[] = [
  { name: 'assetNo', label: 'رقم الأصل', type: 'text', required: true, ltr: true },
  { name: 'name', label: 'اسم الأصل', type: 'text', required: true },
  { name: 'categoryId', label: 'الفئة', type: 'ref', ref: REF.assetCategory, required: true },
  { name: 'assetKind', label: 'النوع', type: 'select', options: opts(ASSET_KIND), required: true, default: 'LAPTOP' },
  { name: 'serialNo', label: 'الرقم التسلسلي', type: 'text', ltr: true },
  { name: 'purchaseDate', label: 'تاريخ الشراء', type: 'date', required: true, default: today() },
  { name: 'acquisitionCost', label: 'التكلفة', type: 'decimal', required: true },
  { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency, required: true },
  { name: 'exchangeRate', label: 'سعر الصرف', type: 'decimal', hint: 'اتركه فارغًا ليؤخذ من جدول الأسعار بتاريخ الشراء' },
  { name: 'residualValueBase', label: 'القيمة التخريدية (عملة أساسية)', type: 'decimal', default: '0' },
  { name: 'usefulLifeMonths', label: 'العمر الإنتاجي (شهر)', type: 'number', hint: 'افتراضيًا من الفئة' },
  { name: 'depreciationMethod', label: 'طريقة الإهلاك', type: 'select', options: opts(DEP_METHOD), hint: 'افتراضيًا من الفئة' },
  { name: 'decliningRatePct', label: 'معدل القسط المتناقص % سنويًا', type: 'decimal' },
  { name: 'depreciationStart', label: 'بداية الإهلاك', type: 'date', hint: 'افتراضيًا تاريخ الشراء — يبدأ الإهلاك بالشهر كاملًا' },
  { name: 'branchId', label: 'الفرع', type: 'ref', ref: REF.branch },
  { name: 'costCenterId', label: 'مركز التكلفة', type: 'ref', ref: REF.costCenter },
  { name: 'notes', label: 'ملاحظات', type: 'textarea' },
];

export function AssetsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const base = useBaseCurrency();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({ queryKey: ['/assets', page, search, status], queryFn: () => api.get<Page<any>>('/assets', { page, pageSize: 50, q: search, status }) });

  const assetItems = list.data?.data ?? [];
  const totalCost = assetItems.reduce((acc, a) => acc + (parseFloat(a.costBase) || 0), 0);
  const totalBookValue = assetItems.reduce((acc, a) => acc + (parseFloat(a.netBookValueBase) || 0), 0);
  const activeCount = assetItems.filter((a) => a.status === 'ACTIVE').length;

  const handleExportCsv = () => {
    if (!assetItems.length) return;
    downloadCsv(`assets-${today()}.csv`, [
      ['رقم الأصل', 'اسم الأصل', 'الفئة', 'الرقم التسلسلي', 'تاريخ الشراء', 'التكلفة بالعملة الأساسية', 'مجمع الإهلاك', 'صافي القيمة الدفترية', 'الموظف المسؤول (العهدة)', 'الحالة'],
      ...assetItems.map((a: any) => [
        a.assetNo, a.name, a.categoryName || '', a.serialNo || '', a.purchaseDate || '', a.costBase, a.accumulatedBase, a.netBookValueBase, a.custodianName || '—', a.status,
      ]),
    ]);
    toast.success('تم تصدير سجل الأصول إلى CSV بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="الأصول الثابتة والعهد"
        subtitle="إدارة أصول الشركة وعهد الموظفين التقنية (أجهزة، لابتوبات، تراخيص). تُحسب أقساط إهلاكها وتدخل ضمن تكلفة الموظف."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> إضافة أصل
            </button>
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat label="إجمالي الأصول" value={String(list.data?.meta.total ?? assetItems.length)} tone="blue" icon={Laptop} hint="أصول وعهد مقيدة" />
        <Stat label="أصول نشطة وقيد الخدمة" value={String(activeCount)} tone="green" hint="تُهلك شهرياً في النظام" />
        <Stat label={`إجمالي تكلفة الاقتناء (${base})`} value={money(totalCost)} tone="slate" hint="التكلفة التاريخية الدفترية" />
        <Stat label={`صافي القيمة الدفترية (${base})`} value={money(totalBookValue)} tone="cyan" hint="بعد خصم مجمع الإهلاك" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute start-2.5 top-2.5 size-4 text-slate-400" />
              <input className="input ps-8 h-9 text-xs" placeholder="بحث بالرقم أو الاسم أو التسلسلي…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-44 h-9 text-xs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">كل الحالات</option>
              {opts(ASSET_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {list.data?.meta && (
            <div className="text-xs text-slate-500 font-mono">
              المعروض: <strong>{assetItems.length}</strong> من <strong>{list.data.meta.total}</strong>
            </div>
          )}
        </div>
        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorState error={list.error} /></div> : list.data!.data.length === 0 ? (
          <EmptyState text="لا توجد أصول. أنشئ فئة أصول أولًا ثم أضف الأصل." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الرقم</th><th>الأصل</th><th>الفئة</th><th>الشراء</th><th>التكلفة (أساسية)</th><th>مجمع الإهلاك</th><th>القيمة الدفترية</th><th>العهدة</th><th>الحالة</th>
                    <th className="w-24 text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data!.data.map((a) => (
                    <tr key={a.id} className="cursor-pointer" onClick={() => nav(`/assets/list/${a.id}`)}>
                      <td className="num text-start">{a.assetNo}</td><td className="font-medium">{a.name}</td><td>{a.categoryName}</td><td>{date(a.purchaseDate)}</td>
                      <td className="num">{money(a.costBase)}</td><td className="num">{money(a.accumulatedBase)}</td><td className="num">{money(a.netBookValueBase)}</td>
                      <td>{a.custodianName ?? '—'}</td><td><AssetStatus s={a.status} /></td>
                      <td onClick={(evt) => evt.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="معاينة الأصل"
                            onClick={() => nav(`/assets/list/${a.id}`)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="تعديل الأصل"
                            onClick={() => nav(`/assets/list/${a.id}`)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          {a.status === 'DRAFT' && (
                            <button
                              className="btn-ghost h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="حذف"
                              onClick={() => {
                                if (confirm(`هل أنت متأكد من حذف الأصل ${a.name}؟`)) {
                                  api.del(`/assets/${a.id}`)
                                    .then(() => {
                                      toast.success('تم حذف الأصل بنجاح');
                                      qc.invalidateQueries({ queryKey: ['/assets'] });
                                    })
                                    .catch((err) => toast.error(err));
                                }
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...list.data!.meta} onPage={setPage} />
          </>
        )}
      </div>
      <FormModal open={creating} wide title="إضافة أصل (مسودة)" fields={assetFormFields} onClose={() => setCreating(false)}
        onSubmit={async (b) => { const a: any = await api.post('/assets', b); qc.invalidateQueries({ queryKey: ['/assets'] }); nav(`/assets/list/${a.id}`); }} />
    </div>
  );
}

// ------------------------------------------------------------------ asset detail
export function AssetDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = useBaseCurrency();
  const [modal, setModal] = useState<string | null>(null);
  const key = ['asset', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<any>(`/assets/${id}`) });
  const refresh = (d?: any) => { if (d) qc.setQueryData(key, d); else qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['/assets'] }); };
  const post = (path: string) => async (b: Record<string, any>) => refresh(await api.post(`/assets/${id}${path}`, b));
  const del = useMutation({ mutationFn: () => api.del(`/assets/${id}`), onSuccess: () => { toast.success('تم الحذف'); history.back(); }, onError: (e) => toast.error(e) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const a = q.data;
  const draft = a.status === 'DRAFT';
  const custodian = a.custodies.find((c: any) => !c.effectiveTo || c.effectiveTo >= today());
  return (
    <div className="space-y-4">
      <PageHeader
        title={`${a.assetNo} — ${a.name}`}
        subtitle={`${a.categoryName} • ${ASSET_KIND[a.assetKind]} • شراء ${date(a.purchaseDate)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AssetStatus s={a.status} />
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة البطاقة
            </button>
            {draft && <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setModal('activate')}><Play className="size-3.5" /> تفعيل الأصل</button>}
            {a.status !== 'DISPOSED' && !draft && <button className="btn-secondary text-xs" onClick={() => setModal('dispose')}>استبعاد</button>}
            {draft && <button className="btn-secondary text-xs text-rose-600" onClick={() => confirm('حذف المسودة؟') && del.mutate()}><Trash2 className="size-3.5" /></button>}
            <Link to="/assets/list" className="btn-secondary text-xs flex items-center gap-1.5"><ArrowRight className="size-3.5" /> الأصول</Link>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="التكلفة" value={money(a.costBase)} hint={`${money(a.acquisitionCost)} ${a.currencyCode} × ${Number(a.exchangeRate)}`} />
        <Stat label="مجمع الإهلاك المرحّل" value={money(a.accumulatedBase)} hint={base} />
        <Stat label="القيمة الدفترية" value={money(a.netBookValueBase)} hint={base} tone="blue" />
        <Stat label="الإهلاك" value={`${a.usefulLifeMonths} شهر`} hint={`${DEP_METHOD[a.depreciationMethod]} • ${date(a.depreciationStart)} ← ${date(a.depreciationEnd)}`} />
      </div>

      {a.acquisitionEntryId && <p className="text-sm">قيد الاقتناء: <Link className="text-brand-600 hover:underline" to={`/acc/journals/${a.acquisitionEntryId}`}>عرض القيد</Link></p>}
      {a.disposalEntryId && <p className="text-sm">قيد الاستبعاد ({date(a.disposalDate)} — {a.disposalReason}): <Link className="text-brand-600 hover:underline" to={`/acc/journals/${a.disposalEntryId}`}>عرض القيد</Link></p>}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <h3 className="font-semibold">سجل العهدة {custodian && <span className="ms-2 text-xs font-normal text-slate-500">الحالي: {custodian.employeeName}</span>}</h3>
          {a.status !== 'DISPOSED' && (
            <div className="flex gap-2">
              {custodian && <button className="btn-secondary h-8" onClick={() => setModal('return')}>استرجاع</button>}
              <button className="btn-primary h-8" onClick={() => setModal('assign')}>{custodian ? 'نقل العهدة' : 'إسناد لموظف'}</button>
            </div>
          )}
        </div>
        <table className="table">
          <thead><tr><th>الموظف</th><th>الفترة</th><th>ملاحظات</th></tr></thead>
          <tbody>
            {a.custodies.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500">لا توجد عهدة — الإهلاك لن يُحمّل على موظف.</td></tr>}
            {a.custodies.map((c: any) => (
              <tr key={c.id}><td><Link className="text-brand-600 hover:underline" to={`/hr/employees/${c.employeeId}`}>{c.employeeCode} — {c.employeeName}</Link></td><td>{date(c.effectiveFrom)} ← {c.effectiveTo ? date(c.effectiveTo) : 'مفتوح'}</td><td className="text-xs">{c.notes}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 font-semibold dark:border-slate-800">جدول الإهلاك</div>
        <div className="max-h-96 overflow-y-auto">
          <table className="table">
            <thead><tr><th>الشهر</th><th>القسط</th><th>المجمع</th><th>القيمة الدفترية</th><th>الحالة</th></tr></thead>
            <tbody>
              {a.schedule.map((r: any) => (
                <tr key={r.month}><td>{r.month.slice(0, 7)}</td><td className="num">{money(r.amount)}</td><td className="num">{money(r.accumulated)}</td><td className="num">{money(r.netBookValue)}</td><td>{r.posted ? <Badge color="green">مرحّل #{r.runNo}</Badge> : <Badge>مجدول</Badge>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FormModal open={modal === 'activate'} title="تفعيل الأصل" onClose={() => setModal(null)} onSubmit={post('/activate')} initial={{ funding: 'BANK', entryDate: a.purchaseDate }}
        note="التفعيل يُنشئ قيد الاقتناء تلقائيًا من قاعدة الترحيل ASSET.ACQUISITION ويجمّد البيانات المالية للأصل."
        fields={[
          { name: 'funding', label: 'التمويل', type: 'select', required: true, options: [{ value: 'BANK', label: 'مدفوع من بنك/صندوق' }, { value: 'NONE', label: 'مُسجّل مسبقًا (رصيد افتتاحي / فاتورة مورد)' }] },
          { name: 'bankAccountId', label: 'البنك / الصندوق', type: 'ref', ref: REF.bank },
          { name: 'entryDate', label: 'تاريخ القيد', type: 'date' },
          { name: 'reason', label: 'السبب (عند عدم إنشاء قيد)', type: 'textarea' },
        ]} />
      <FormModal open={modal === 'assign'} title="إسناد العهدة" onClose={() => setModal(null)} onSubmit={post('/custody')} initial={{ effectiveFrom: today() }}
        note="بإسناد عهدة جديدة تنتهي العهدة السابقة تلقائيًا في اليوم السابق. الإهلاك يُحمّل على الموظف بعدد أيام العهدة."
        fields={[{ name: 'employeeId', label: 'الموظف', type: 'ref', ref: REF.employee, required: true }, { name: 'effectiveFrom', label: 'من تاريخ', type: 'date', required: true }, { name: 'notes', label: 'ملاحظات', type: 'textarea' }]} />
      <FormModal open={modal === 'return'} title="استرجاع العهدة" onClose={() => setModal(null)} onSubmit={post('/custody/return')} initial={{ effectiveTo: today() }}
        fields={[{ name: 'effectiveTo', label: 'آخر يوم في العهدة', type: 'date', required: true }]} />
      <FormModal open={modal === 'dispose'} title="استبعاد الأصل" onClose={() => setModal(null)} onSubmit={post('/dispose')} initial={{ disposalDate: today(), proceedsBase: '0' }}
        note="يجب ترحيل الإهلاك حتى شهر الاستبعاد. القيد يُظهر ربح/خسارة الاستبعاد = المتحصل − القيمة الدفترية."
        fields={[
          { name: 'disposalDate', label: 'تاريخ الاستبعاد', type: 'date', required: true },
          { name: 'proceedsBase', label: `المتحصل (${base})`, type: 'decimal', required: true },
          { name: 'bankAccountId', label: 'البنك / الصندوق', type: 'ref', ref: REF.bank },
          { name: 'reason', label: 'السبب', type: 'textarea', required: true },
        ]} />
    </div>
  );
}

// ------------------------------------------------------------------ depreciation runs
export function DepreciationPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const base = useBaseCurrency();
  const [periodId, setPeriodId] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  const preview = useQuery({ queryKey: ['dep-preview', periodId], enabled: !!periodId, queryFn: () => api.get<any>('/depreciation-runs/preview', { periodId }) });
  const runs = useQuery({ queryKey: ['dep-runs'], queryFn: () => api.get<Page<any>>('/depreciation-runs', { pageSize: 50 }) });
  const detail = useQuery({ queryKey: ['dep-run', view], enabled: !!view, queryFn: () => api.get<any>(`/depreciation-runs/${view}`) });
  const done = () => { qc.invalidateQueries({ queryKey: ['dep-preview'] }); qc.invalidateQueries({ queryKey: ['dep-runs'] }); qc.invalidateQueries({ queryKey: ['/assets'] }); };
  const run = useMutation({ mutationFn: () => api.post<any>('/depreciation-runs', { periodId }), onSuccess: (r) => { toast.success('تم ترحيل الإهلاك'); done(); setView(r.id); }, onError: (e) => toast.error(e) });

  const handleExportRuns = () => {
    if (!runs.data?.data?.length) return;
    downloadCsv(`depreciation-runs-${today()}.csv`, [
      ['رقم التشغيل', 'الفترة المالية', 'عدد الأصول', 'إجمالي الإهلاك', 'رقم القيد المحاسبي', 'الحالة'],
      ...runs.data.data.map((r: any) => [
        r.runNo, r.periodName, r.assetCount, r.totalAmountBase, r.journalEntryNo || '—', r.status,
      ]),
    ]);
    toast.success('تم تصدير سجل تشغيلات الإهلاك إلى CSV بنجاح');
  };

  const handleExportPreview = () => {
    if (!preview.data?.lines?.length) return;
    downloadCsv(`depreciation-preview-${periodId || today()}.csv`, [
      ['رقم الأصل', 'اسم الأصل', 'الشهر', 'الموظف المسؤول', 'أيام العهدة', 'قسط الإهلاك بالعملة الأساسية'],
      ...preview.data.lines.map((l: any) => [
        l.assetNo, l.assetName, l.month?.slice(0, 7) || '', l.employeeName || (l.employeeId ? 'موظف' : 'بدون عهدة'), l.days, l.amountBase,
      ]),
    ]);
    toast.success('تم تصدير معاينة الإهلاك إلى CSV بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="تشغيل الإهلاك الشهري"
        subtitle="يرحّل أقساط الإهلاك المستحقة حتى نهاية الفترة (بما فيها المتأخر) في قيد واحد، موزعة على الموظفين حسب أيام العهدة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportRuns} title="تصدير السجل">
              <Download className="size-3.5" /> تصدير سجل التشغيلات
            </button>
          </div>
        }
      />
      <div className="card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="الفترة"><PeriodSelect value={periodId} onChange={setPeriodId} /></Field>
            <button className="btn-primary" disabled={!preview.data || !!preview.data.existingRunId || preview.data.lines.length === 0 || run.isPending} onClick={() => confirm('ترحيل الإهلاك لهذه الفترة؟') && run.mutate()}>
              <Play className="size-4" /> ترحيل الإهلاك
            </button>
          </div>
          {preview.data?.lines && preview.data.lines.length > 0 && (
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportPreview}>
              <Download className="size-3.5" /> تصدير معاينة الإهلاك (CSV)
            </button>
          )}
        </div>
        {preview.data && (
          <div className="mt-4">
            {preview.data.existingRunId && <p className="mb-2 text-sm text-amber-600">تم تشغيل الإهلاك لهذه الفترة مسبقًا. ألغِ التشغيل السابق لإعادة التشغيل.</p>}
            {preview.data.lines.length === 0 ? <p className="text-sm text-slate-500">لا يوجد إهلاك مستحق لهذه الفترة.</p> : (
              <>
                <p className="mb-2 text-sm">معاينة: <b>{preview.data.assetCount}</b> أصل — الإجمالي <b className="num">{money(preview.data.totalAmountBase)}</b> {base}</p>
                <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="table">
                    <thead><tr><th>الأصل</th><th>الشهر</th><th>الموظف</th><th>أيام</th><th>المبلغ</th></tr></thead>
                    <tbody>
                      {preview.data.lines.map((l: any, i: number) => (
                        <tr key={i}><td>{l.assetNo} — {l.assetName}</td><td>{l.month.slice(0, 7)}</td><td>{l.employeeId ? '✓ موظف' : <span className="text-slate-400">بدون عهدة</span>}</td><td className="num">{l.days}</td><td className="num">{money(l.amountBase)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 font-semibold dark:border-slate-800">التشغيلات السابقة</div>
        {runs.isLoading ? <Loading /> : runs.data?.data.length === 0 ? <EmptyState text="لم يتم تشغيل الإهلاك بعد." /> : (
          <table className="table">
            <thead><tr><th>#</th><th>الفترة</th><th>الأصول</th><th>الإجمالي</th><th>القيد</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {runs.data?.data.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.runNo}</td><td>{r.periodName}</td><td className="num">{r.assetCount}</td><td className="num">{money(r.totalAmountBase)}</td>
                  <td>{r.journalEntryId ? <Link className="text-brand-600 hover:underline" to={`/acc/journals/${r.journalEntryId}`}>{r.journalEntryNo}</Link> : '—'}</td>
                  <td><Badge color={RUN_STATUS[r.status].color}>{RUN_STATUS[r.status].label}</Badge>{r.cancelReason && <div className="text-xs text-slate-500">{r.cancelReason}</div>}</td>
                  <td><div className="flex justify-end gap-1"><button className="btn-ghost h-7 px-2" onClick={() => setView(r.id)}>تفاصيل</button>{r.status === 'POSTED' && <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => setCancelId(r.id)}>إلغاء</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {view && detail.data && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800"><h3 className="font-semibold">تشغيل #{detail.data.runNo} — {detail.data.periodName}</h3><button className="btn-ghost h-7" onClick={() => setView(null)}>إغلاق</button></div>
          <table className="table">
            <thead><tr><th>الأصل</th><th>الشهر</th><th>الموظف</th><th>أيام</th><th>المبلغ</th><th>القيمة الدفترية</th></tr></thead>
            <tbody>{detail.data.lines.map((l: any) => <tr key={l.id}><td>{l.assetNo} — {l.assetName}</td><td>{l.month.slice(0, 7)}</td><td>{l.employeeName ?? '—'}</td><td className="num">{l.days}</td><td className="num">{money(l.amountBase)}</td><td className="num">{money(l.netBookValueBase)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <ReasonDialog open={!!cancelId} danger title="إلغاء تشغيل الإهلاك" confirmText="إلغاء التشغيل" onClose={() => setCancelId(null)}
        extra={<p className="mb-3 text-sm text-slate-500">يُعكس قيد الإهلاك بقيد عكسي (لا يُحذف) ويمكن إعادة التشغيل بعد التصحيح.</p>}
        onConfirm={async (reason) => { try { await api.post(`/depreciation-runs/${cancelId}/cancel`, { reason }); toast.success('تم الإلغاء'); setCancelId(null); done(); } catch (e) { toast.error(e); } }} />
    </div>
  );
}
