import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Layers, Plus, Printer, Search } from 'lucide-react';
import { api, Page } from '../lib/api';
import { date, downloadCsv, money, today } from '../lib/format';
import { opts, PRICING_BASIS, PROJECT_STATUS } from '../lib/labels';
import { ActiveBadge, CrudPage, FieldDef } from '../components/CrudPage';
import { FormModal, PeriodSelect, REF } from '../components/forms';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, Pager, Stat, useToast } from '../components/ui';

const ProjStatus = ({ s }: { s: string }) => (
  <Badge color={PROJECT_STATUS[s]?.color}>{PROJECT_STATUS[s]?.label ?? s}</Badge>
);

// ------------------------------------------------------------------ clients
export const ClientsPage = () => (
  <CrudPage
    title="العملاء"
    subtitle="قائمة عملاء المشاريع. كل مشروع يرتبط بعميل إلزامياً."
    path="/clients"
    entityLabel="عميل"
    columns={[
      { key: 'code', label: 'الرمز', className: 'num text-start' },
      { key: 'nameAr', label: 'الاسم بالعربية' },
      { key: 'nameEn', label: 'الاسم بالإنجليزية' },
      { key: 'currencyCode', label: 'العملة', className: 'num' },
      { key: 'paymentTermsDays', label: 'أيام الدفع', className: 'num' },
      { key: 'email', label: 'البريد الإلكتروني' },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true, createOnly: true },
      { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
      { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
      { name: 'currencyCode', label: 'عملة العميل', type: 'ref', ref: REF.currency, required: true },
      { name: 'paymentTermsDays', label: 'أيام الدفع', type: 'number', default: 30 },
      { name: 'email', label: 'البريد الإلكتروني', type: 'text', ltr: true },
      { name: 'phone', label: 'الهاتف', type: 'text', ltr: true },
      { name: 'address', label: 'العنوان', type: 'textarea' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
      { name: 'isActive', label: 'نشط', type: 'bool', default: true },
    ]}
  />
);

// ------------------------------------------------------------------ projects list
const projectFormFields: FieldDef[] = [
  { name: 'code', label: 'رمز المشروع', type: 'text', required: true, ltr: true, createOnly: true },
  { name: 'nameAr', label: 'اسم المشروع بالعربية', type: 'text', required: true },
  { name: 'nameEn', label: 'اسم المشروع بالإنجليزية', type: 'text', ltr: true },
  { name: 'clientId', label: 'العميل', type: 'ref', ref: REF.client, required: true },
  { name: 'managerId', label: 'مدير المشروع', type: 'ref', ref: REF.employee },
  { name: 'currencyCode', label: 'عملة المشروع', type: 'ref', ref: REF.currency, required: true },
  { name: 'startDate', label: 'تاريخ البداية', type: 'date' },
  { name: 'endDate', label: 'تاريخ النهاية المتوقعة', type: 'date' },
  { name: 'requiredMarginPct', label: 'الهامش المستهدف %', type: 'decimal', hint: 'نسبة الربحية المطلوبة. مثال: 30 تعني 30%' },
  { name: 'notes', label: 'ملاحظات', type: 'textarea' },
];

export function ProjectsPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ['/projects', page, search, statusFilter],
    queryFn: () => api.get<Page<any>>('/projects', { page, pageSize: 50, q: search, status: statusFilter }),
  });
  const prjList = list.data?.data ?? [];
  const totalProjects = list.data?.meta.total ?? prjList.length;
  const activePrjCount = prjList.filter((x: any) => x.status === 'ACTIVE').length;
  const onHoldCount = prjList.filter((x: any) => x.status === 'ON_HOLD').length;
  const draftPrjCount = prjList.filter((x: any) => x.status === 'DRAFT').length;

  const handleExport = () => {
    downloadCsv(`projects-${today()}.csv`, [
      ['الرمز', 'المشروع بالعربية', 'المشروع بالإنجليزية', 'العميل', 'مدير المشروع', 'تاريخ البداية', 'تاريخ النهاية', 'الهامش المستهدف %', 'الحالة'],
      ...prjList.map((p: any) => [
        p.code, p.nameAr, p.nameEn || '', p.clientName || '', p.managerName || '', p.startDate || '', p.endDate || '', p.requiredMarginPct != null ? `${p.requiredMarginPct}%` : '', p.status || '',
      ]),
    ]);
    toast.success('تم تصدير قائمة المشاريع إلى ملف CSV بنجاح');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="المشاريع التعاقدية"
        subtitle="إدارة مشاريع العملاء ودورة حياتها. كل مشروع يحتوي على تخصيصات الموظفين والمبرمجين وأسعار الخدمات."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> إضافة مشروع
            </button>
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat label="إجمالي المشاريع" value={String(totalProjects)} tone="blue" hint="عقود العملاء المسجلة" />
        <Stat label="مشاريع جارية ونشطة" value={String(activePrjCount)} tone="green" hint="قيد التطوير والفوترة" />
        <Stat label="مشاريع معلقة" value={String(onHoldCount)} tone="amber" hint="بانتظار مستخلصات أو إفراج" />
        <Stat label="مسودات قيد التجهيز" value={String(draftPrjCount)} tone="slate" hint="بانتظار توقيع العقد" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 p-3.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-80">
              <Search className="absolute start-3 top-3 size-4 text-slate-400" />
              <input className="input ps-9 h-9.5 text-xs" placeholder="بحث بالرمز أو الاسم…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-44 h-9.5 text-xs" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="">كل الحالات</option>
              {opts(PROJECT_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {list.data?.meta && (
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              المعروض: <strong className="font-mono text-slate-900 dark:text-white font-bold">{list.data.data.length}</strong> من <strong className="font-mono text-slate-900 dark:text-white font-bold">{list.data.meta.total}</strong>
            </div>
          )}
        </div>
        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorState error={list.error} /></div>
          : list.data!.data.length === 0 ? <EmptyState text="لا توجد مشاريع. أنشئ عميلاً أولاً ثم أضف مشروعاً." />
          : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الرمز</th><th>المشروع</th><th>العميل</th><th>المدير</th>
                      <th>البداية</th><th>النهاية</th><th>الهامش المستهدف</th><th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data!.data.map((p) => (
                      <tr key={p.id} className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50" onClick={() => nav(`/prj/projects/${p.id}`)}>
                        <td className="num text-start font-mono font-bold text-slate-800 dark:text-slate-200">{p.code}</td>
                        <td>
                          <div className="font-bold text-slate-900 dark:text-white">{p.nameAr}</div>
                          {p.nameEn && <div className="text-[11px] font-mono text-slate-400">{p.nameEn}</div>}
                        </td>
                        <td>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium">
                            {p.clientName}
                          </span>
                        </td>
                        <td><span className="text-xs text-slate-600 dark:text-slate-400 font-medium">{p.managerName ?? '—'}</span></td>
                        <td className="text-xs font-mono">{p.startDate ? date(p.startDate) : '—'}</td>
                        <td className="text-xs font-mono">{p.endDate ? date(p.endDate) : '—'}</td>
                        <td className="num">
                          {p.requiredMarginPct != null ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 font-mono font-bold text-xs">
                              {p.requiredMarginPct}%
                            </span>
                          ) : '—'}
                        </td>
                        <td><ProjStatus s={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...list.data!.meta} onPage={setPage} />
            </>
          )}
      </div>
      <FormModal
        open={creating} wide title="إضافة مشروع (مسودة)"
        fields={projectFormFields}
        onClose={() => setCreating(false)}
        onSubmit={async (b) => {
          const p: any = await api.post('/projects', b);
          qc.invalidateQueries({ queryKey: ['/projects'] });
          nav(`/prj/projects/${p.id}`);
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ project detail
const STATUS_TRANSITIONS: Record<string, { label: string; value: string }[]> = {
  DRAFT: [{ value: 'ACTIVE', label: 'تفعيل' }, { value: 'CANCELLED', label: 'إلغاء' }],
  ACTIVE: [{ value: 'ON_HOLD', label: 'تعليق' }, { value: 'COMPLETED', label: 'إكمال' }, { value: 'CANCELLED', label: 'إلغاء' }],
  ON_HOLD: [{ value: 'ACTIVE', label: 'استئناف' }, { value: 'COMPLETED', label: 'إكمال' }, { value: 'CANCELLED', label: 'إلغاء' }],
  COMPLETED: [{ value: 'ACTIVE', label: 'إعادة تفعيل' }],
  CANCELLED: [],
};

export function ProjectDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'info' | 'assignments' | 'prices' | 'history'>('info');
  const [modal, setModal] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const key = ['project', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<any>(`/projects/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['/projects'] }); };

  // Assignment & price forms
  const [addAssign, setAddAssign] = useState(false);
  const [addPrice, setAddPrice] = useState(false);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const p = q.data;
  const transitions = STATUS_TRANSITIONS[p.status] ?? [];

  const changeStatus = async () => {
    if (!newStatus) return;
    setBusy(true);
    try {
      await api.post(`/projects/${id}/status`, { newStatus, reason });
      toast.success('تم تغيير الحالة');
      setModal(null);
      setReason('');
      refresh();
    } catch (e) { toast.error(e); }
    finally { setBusy(false); }
  };

  const assignFields: FieldDef[] = [
    { name: 'employeeId', label: 'الموظف', type: 'ref', ref: REF.employee, required: true },
    {
      name: 'allocationBasis',
      label: 'أساس التوزيع',
      type: 'select',
      options: [
        { value: 'DAYS', label: 'أيام عمل فعلية (مثلاً: 18 يوم)' },
        { value: 'PERCENTAGE', label: 'نسبة مئوية % (مثلاً: 100% أو 70%)' },
      ],
      default: 'DAYS',
      required: true,
    },
    { name: 'allocatedDays', label: 'عدد أيام العمل المخصصة', type: 'decimal', hint: 'مثال: 18 يوم بالمشروع الحالي و 3 أيام بمشروع آخر' },
    { name: 'workingDaysInMonth', label: 'أيام العمل الشهرية للمقارنة', type: 'number', default: 22, hint: 'الافتراضي 22 يوم' },
    { name: 'allocationPct', label: 'نسبة التخصيص %', type: 'decimal', default: '100', hint: 'إن تُركت فارغة تُحسب آلياً: (الأيام / أيام الشهر × 100)' },
    { name: 'startDate', label: 'من تاريخ', type: 'date', required: true },
    { name: 'endDate', label: 'إلى تاريخ', type: 'date' },
    { name: 'notes', label: 'ملاحظات وتفاصيل التكليف', type: 'textarea' },
  ];

  const priceFields: FieldDef[] = [
    { name: 'employeeId', label: 'الموظف', type: 'ref', ref: REF.employee, required: true },
    { name: 'pricingBasis', label: 'أساس التسعير', type: 'select', options: opts(PRICING_BASIS), required: true, default: 'MONTHLY' },
    { name: 'price', label: 'السعر', type: 'decimal', required: true },
    { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency, required: true },
    { name: 'effectiveFrom', label: 'من تاريخ', type: 'date', required: true },
    { name: 'effectiveTo', label: 'إلى تاريخ', type: 'date' },
    { name: 'reason', label: 'السبب / المبرر', type: 'text', required: true, default: 'تحديد سعر الخدمة' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${p.code} — ${p.nameAr}`}
        subtitle={`${p.clientName} • ${p.currencyCode}${p.managerName ? ` • مدير: ${p.managerName}` : ''}`}
        actions={
          <>
            <ProjStatus s={p.status} />
            {transitions.length > 0 && (
              <button className="btn-secondary" onClick={() => { setNewStatus(transitions[0].value); setModal('status'); }}>
                تغيير الحالة
              </button>
            )}
            <Link to="/prj/projects" className="btn-secondary"><ArrowRight className="size-4" /> المشاريع</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="الهامش المستهدف" value={p.requiredMarginPct != null ? `${p.requiredMarginPct}%` : '—'} hint="نسبة الربحية المطلوبة" />
        <Stat label="البداية" value={p.startDate ? date(p.startDate) : '—'} />
        <Stat label="النهاية المتوقعة" value={p.endDate ? date(p.endDate) : '—'} />
        <Stat label="التخصيصات النشطة" value={String(p.activeAssignmentCount ?? '—')} tone="blue" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(['info', 'assignments', 'prices', 'history'] as const).map((t) => {
          const labels: Record<string, string> = { info: 'معلومات المشروع', assignments: 'التخصيصات', prices: 'أسعار الخدمات', history: 'سجل الحالات' };
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {labels[t]}
            </button>
          );
        })}
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <div className="card p-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-slate-500">الرمز:</span> <span className="font-mono ms-2">{p.code}</span></div>
          <div><span className="text-slate-500">العميل:</span> <span className="ms-2">{p.clientName}</span></div>
          <div><span className="text-slate-500">العملة:</span> <span className="ms-2">{p.currencyCode}</span></div>
          <div><span className="text-slate-500">مدير المشروع:</span> <span className="ms-2">{p.managerName ?? '—'}</span></div>
          <div className="col-span-2"><span className="text-slate-500">ملاحظات:</span> <span className="ms-2">{p.notes ?? '—'}</span></div>
        </div>
      )}

      {/* Assignments tab */}
      {tab === 'assignments' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <h3 className="font-semibold">تخصيصات الموظفين</h3>
            <button className="btn-primary h-8" onClick={() => setAddAssign(true)}><Plus className="size-4" /> إضافة تخصيص</button>
          </div>
          <table className="table">
            <thead>
              <tr><th>الموظف</th><th>النسبة%</th><th>من</th><th>إلى</th><th>فائض؟</th><th>ملاحظات</th><th /></tr>
            </thead>
            <tbody>
              {(!p.assignments || p.assignments.length === 0)
                ? <tr><td colSpan={7} className="text-center text-slate-500">لا توجد تخصيصات</td></tr>
                : p.assignments.map((a: any) => (
                  <tr key={a.id}>
                    <td><Link to={`/hr/employees/${a.employeeId}`} className="text-brand-600 hover:underline">{a.employeeName}</Link></td>
                    <td className="num">{a.allocationPct}%</td>
                    <td>{date(a.startDate)}</td>
                    <td>{a.endDate ? date(a.endDate) : 'مفتوح'}</td>
                    <td>{a.isOverAllocated ? <Badge color="red">فائض</Badge> : <Badge color="green">طبيعي</Badge>}</td>
                    <td className="text-xs">{a.notes}</td>
                    <td>
                      {!a.endDate && (
                        <button className="btn-ghost h-7 px-2 text-rose-600 text-xs"
                          onClick={async () => {
                            if (!confirm('إنهاء التخصيص اليوم؟')) return;
                            try { await api.post(`/assignments/${a.id}/end`, { endDate: new Date().toISOString().slice(0, 10) }); refresh(); toast.success('تم الإنهاء'); } catch (e) { toast.error(e); }
                          }}>إنهاء</button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <FormModal
            open={addAssign} title="إضافة تخصيص" fields={assignFields}
            onClose={() => setAddAssign(false)}
            onSubmit={async (b) => {
              await api.post('/assignments', { ...b, projectId: id });
              qc.invalidateQueries({ queryKey: key });
            }}
          />
        </div>
      )}

      {/* Prices tab */}
      {tab === 'prices' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <h3 className="font-semibold">أسعار الخدمة (override للمشروع)</h3>
            <button className="btn-primary h-8" onClick={() => setAddPrice(true)}><Plus className="size-4" /> إضافة سعر</button>
          </div>
          <table className="table">
            <thead>
              <tr><th>الموظف</th><th>الأساس</th><th>السعر</th><th>العملة</th><th>من</th><th>إلى</th><th /></tr>
            </thead>
            <tbody>
              {(!p.servicePrices || p.servicePrices.length === 0)
                ? <tr><td colSpan={7} className="text-center text-slate-500">لا توجد أسعار override — يُستخدم السعر الافتراضي للموظف</td></tr>
                : p.servicePrices.map((sp: any) => (
                  <tr key={sp.id}>
                    <td>{sp.employeeName}</td>
                    <td>{PRICING_BASIS[sp.pricingBasis ?? sp.basis] ?? (sp.pricingBasis ?? sp.basis)}</td>
                    <td className="num">{money(sp.price)}</td>
                    <td>{sp.currencyCode}</td>
                    <td>{date(sp.effectiveFrom)}</td>
                    <td>{sp.effectiveTo ? date(sp.effectiveTo) : 'مفتوح'}</td>
                    <td>
                      {!sp.effectiveTo && (
                        <button className="btn-ghost h-7 px-2 text-rose-600 text-xs"
                          onClick={async () => {
                            if (!confirm('إنهاء السعر اليوم؟')) return;
                            try { await api.post(`/service-prices/${sp.id}/end`, { effectiveTo: new Date().toISOString().slice(0, 10) }); refresh(); toast.success('تم الإنهاء'); } catch (e) { toast.error(e); }
                          }}>إنهاء</button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <FormModal
            open={addPrice} title="إضافة سعر خدمة للمشروع" fields={priceFields}
            onClose={() => setAddPrice(false)}
            onSubmit={async (b) => {
              await api.post('/service-prices', { ...b, projectId: id });
              qc.invalidateQueries({ queryKey: key });
            }}
          />
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2.5 font-semibold dark:border-slate-800">سجل تغييرات الحالة</div>
          <table className="table">
            <thead><tr><th>من</th><th>إلى</th><th>السبب</th><th>بواسطة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {(!p.statusHistory || p.statusHistory.length === 0)
                ? <tr><td colSpan={5} className="text-center text-slate-500">لا يوجد سجل</td></tr>
                : p.statusHistory.map((h: any) => (
                  <tr key={h.id}>
                    <td><ProjStatus s={h.fromStatus} /></td>
                    <td><ProjStatus s={h.toStatus} /></td>
                    <td className="text-xs">{h.reason ?? '—'}</td>
                    <td>{h.changedBy}</td>
                    <td>{date(h.changedAt?.slice(0, 10))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status change dialog */}
      {modal === 'status' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-96 rounded-xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 font-semibold dark:border-slate-800">تغيير حالة المشروع</div>
            <div className="space-y-3 p-5">
              <Field label="الحالة الجديدة">
                <select className="input" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                  {transitions.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.value})</option>)}
                </select>
              </Field>
              <Field label="السبب">
                <textarea className="input h-20 py-2" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
              <button className="btn-secondary" onClick={() => setModal(null)}>إلغاء</button>
              <button className="btn-primary" disabled={!newStatus || busy} onClick={changeStatus}>تأكيد</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ all assignments
export function AssignmentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({
    queryKey: ['/assignments', page, search],
    queryFn: () => api.get<Page<any>>('/assignments', { page, pageSize: 50, q: search }),
  });

  const assignmentItems = list.data?.data ?? [];
  const activeCount = assignmentItems.filter((a) => !a.endDate || a.endDate >= today()).length;
  const overAllocatedCount = assignmentItems.filter((a) => a.isOverAllocated).length;

  const handleExportCsv = () => {
    if (!assignmentItems.length) return;
    downloadCsv(`assignments-${today()}.csv`, [
      ['اسم الموظف', 'كود المشروع', 'اسم المشروع', 'نسبة التخصيص%', 'تاريخ البداية', 'تاريخ النهاية', 'فائض تخصيص؟'],
      ...assignmentItems.map((a: any) => [
        a.employeeName, a.projectCode, a.projectName, `${a.allocationPct}%`, a.startDate || '', a.endDate || 'مفتوح', a.isOverAllocated ? 'نعم (فائض)' : 'طبيعي',
      ]),
    ]);
    toast.success('تم تصدير التخصيصات إلى CSV بنجاح');
  };

  const fields: FieldDef[] = [
    { name: 'employeeId', label: 'الموظف *', type: 'ref', ref: REF.employee, required: true },
    { name: 'clientId', label: 'العميل المتعاقد', type: 'ref', ref: REF.client, hint: 'اختياري: لتصفية وتحديد العميل المتعاقد' },
    { name: 'projectId', label: 'المشروع التعاقدي *', type: 'ref', ref: REF.project, required: true },
    { name: 'costCenterId', label: 'مركز التكلفة', type: 'ref', ref: REF.costCenter, hint: 'مركز التكلفة المستفيد (إن ترك فارغاً يؤخذ من المشروع)' },
    {
      name: 'allocationBasis',
      label: 'أساس التخصيص *',
      type: 'select',
      options: [
        { value: 'DAYS', label: 'أيام عمل محددة (مثل: 18 يوم بمشروع و3 بمشروع آخر)' },
        { value: 'PERCENTAGE', label: 'نسبة مئوية % (مثل: 100% أو 70%)' },
      ],
      default: 'DAYS',
      required: true,
    },
    { name: 'allocatedDays', label: 'عدد أيام العمل المخصصة', type: 'decimal', hint: 'إذا اخترت أياماً (مثلاً: 18 يوماً)' },
    { name: 'workingDaysInMonth', label: 'أيام العمل الشهرية للمقارنة', type: 'number', default: 22, hint: 'الافتراضي 22 يوم' },
    { name: 'allocationPct', label: 'نسبة التخصيص %', type: 'decimal', default: '100', hint: 'إن تُركت فارغة تُحسب آلياً من الأيام' },
    {
      name: 'billingBasis',
      label: 'أساس سعر الفوترة للعميل',
      type: 'select',
      options: [
        { value: 'DAILY', label: 'سعر يومية محدد للعميل (Daily Rate) — الافتراضي' },
        { value: 'HOURLY', label: 'سعر ساعة عمل للعميل (Hourly Rate T&M)' },
        { value: 'MONTHLY', label: 'مبلغ مقطوع شهرياً للعميل (Monthly Dedicated Retainer)' },
      ],
      default: 'DAILY',
    },
    { name: 'billableRate', label: 'سعر البيع / الفوترة للعميل', type: 'decimal', hint: 'سعر محاسبة العميل عن الموظف (مثال: 1,800 SAR/يوم)' },
    {
      name: 'billingCurrency',
      label: 'عملة الفوترة للعميل',
      type: 'select',
      options: [
        { value: 'SAR', label: 'SAR (ريال سعودي) — العملة الأساسية' },
        { value: 'EGP', label: 'EGP (جنيه مصري)' },
        { value: 'USD', label: 'USD (دولار أمريكي)' },
      ],
      default: 'SAR',
    },
    { name: 'roleTitle', label: 'المسمى / الدور التعاقدي للعميل', type: 'text', hint: 'مثال: كبير مهندسي الحلول / Lead Full-Stack' },
    { name: 'startDate', label: 'من تاريخ *', type: 'date', required: true },
    { name: 'endDate', label: 'إلى تاريخ', type: 'date' },
    { name: 'notes', label: 'ملاحظات وتفاصيل التكليف', type: 'textarea' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="تخصيصات الموظفين على المشاريع"
        subtitle="توزيع أوقات المبرمجين والموظفين على مشاريع العملاء بنسب مئوية. يُحسب التوزيع وتكلفة المشروع والوقت الضائع آلياً."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/prj/allocation-days" className="btn-secondary text-xs flex items-center gap-1.5 text-brand-700 bg-brand-50 border-brand-200 hover:bg-brand-100">
              <Layers className="size-3.5 text-brand-600" /> تقرير الأيام والنسب وربط المبيعات
            </Link>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> إضافة تخصيص
            </button>
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat label="إجمالي التخصيصات" value={String(list.data?.meta.total ?? assignmentItems.length)} tone="blue" hint="توزيعات المسجلة" />
        <Stat label="تخصيصات جارية وفعالة" value={String(activeCount)} tone="green" hint="تعمل في فترات حالية" />
        <Stat label="تخصيصات فائضة (> 100%)" value={String(overAllocatedCount)} tone="amber" hint="يتم تطبيع تكلفتها تلقائياً" />
        <Stat label="المعروض في الصفحة" value={String(assignmentItems.length)} tone="slate" hint="سجلات حالية" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-3 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative w-72">
            <Search className="absolute start-2.5 top-2.5 size-4 text-slate-400" />
            <input className="input ps-8 h-9 text-xs" placeholder="بحث بالموظف أو المشروع…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.data?.meta && (
            <div className="text-xs text-slate-500 font-mono">
              المعروض: <strong>{assignmentItems.length}</strong> من <strong>{list.data.meta.total}</strong>
            </div>
          )}
        </div>
        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorState error={list.error} /></div>
          : list.data!.data.length === 0 ? <EmptyState text="لا توجد تخصيصات." />
          : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>المشروع التعاقدي والعميل</th>
                      <th>مركز التكلفة</th>
                      <th>التخصيص والأيام</th>
                      <th>سعر الفوترة للعميل</th>
                      <th>من</th>
                      <th>إلى</th>
                      <th>الحالة</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.data!.data.map((a: any) => (
                      <tr key={a.id}>
                        <td>
                          <Link to={`/hr/employees/${a.employeeId}`} className="font-bold text-brand-600 hover:underline">
                            {a.employeeNameAr || a.employeeName}
                          </Link>
                          {a.roleTitle && <div className="text-[11px] text-slate-500">{a.roleTitle}</div>}
                        </td>
                        <td>
                          <Link to={`/prj/projects/${a.projectId}`} className="font-semibold text-slate-900 hover:underline">
                            {a.projectCode} — {a.projectNameAr || a.projectName}
                          </Link>
                          {a.clientNameAr && <div className="text-[11px] text-slate-500 font-medium">العميل: {a.clientNameAr}</div>}
                        </td>
                        <td className="text-xs text-slate-600 font-medium">
                          {a.costCenterName || 'مركزي عام'}
                        </td>
                        <td>
                          <span className="font-mono font-bold text-blue-700">{a.allocationPct}%</span>
                          <span className="text-[11px] text-slate-500 ms-1.5 font-mono">({a.allocatedDays || Math.round((Number(a.allocationPct)/100)*22)} يوم)</span>
                        </td>
                        <td>
                          {a.billableRate ? (
                            <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs inline-block">
                              {Number(a.billableRate).toLocaleString()} {a.billingCurrency || 'SAR'}{a.billingBasis === 'DAILY' ? ' / يوم' : a.billingBasis === 'HOURLY' ? ' / ساعة' : ' / شهر'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td>{date(a.startDate)}</td>
                        <td>{a.endDate ? date(a.endDate) : 'مفتوح'}</td>
                        <td>{a.isOverAllocated ? <Badge color="red">فائض تخصيص</Badge> : <Badge color="green">طبيعي</Badge>}</td>
                        <td>
                          <div className="flex justify-end gap-1">
                            {!a.endDate && (
                              <button className="btn-ghost h-7 px-2 text-rose-600 text-xs"
                                onClick={async () => {
                                  if (!confirm('إنهاء التخصيص اليوم؟')) return;
                                  try { await api.post(`/assignments/${a.id}/end`, { endDate: new Date().toISOString().slice(0, 10) }); qc.invalidateQueries({ queryKey: ['/assignments'] }); toast.success('تم الإنهاء'); } catch (e) { toast.error(e); }
                                }}>إنهاء</button>
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
      <FormModal
        open={adding} wide title="إضافة تخصيص جديد"
        fields={fields}
        onClose={() => setAdding(false)}
        onSubmit={async (b) => { await api.post('/assignments', b); qc.invalidateQueries({ queryKey: ['/assignments'] }); }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ utilization report
export function UtilizationPage() {
  const toast = useToast();
  const [periodId, setPeriodId] = useState('');
  const report = useQuery({
    queryKey: ['utilization', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any[]>('/assignments/utilization', { periodId }),
  });

  const handleExportCsv = () => {
    if (!report.data?.length) return;
    downloadCsv(`utilization-${periodId || today()}.csv`, [
      ['اسم الموظف', 'إجمالي التخصيص%', 'الوقت غير المستغل%', 'الوقت الفائض%', 'الحالة', 'المشاريع'],
      ...report.data.map((r: any) => [
        r.employeeName, `${Number(r.allocatedPct).toFixed(1)}%`, `${Number(r.unutilizedPct).toFixed(1)}%`, `${Number(r.overAllocatedPct ?? 0).toFixed(1)}%`, r.isOverAllocated ? 'فائض تخصيص' : r.allocatedPct < 100 ? 'وقت فائض' : 'مكتمل', r.projectNames?.join(' - ') || '—',
      ]),
    ]);
    toast.success('تم تصدير تقرير استغلال الموظفين إلى CSV بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="تقرير استغلال الموظفين والوقت الضائع"
        subtitle="يوضح نسبة تخصيص كل موظف على المشاريع والوقت غير المستغل (الضائع) والمتجاوز خلال الفترة المختارة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {report.data && report.data.length > 0 && (
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv} title="تصدير CSV">
                <Download className="size-3.5" /> تصدير Excel/CSV
              </button>
            )}
          </div>
        }
      />
      <div className="card p-4">
        <Field label="الفترة المالية">
          <PeriodSelect value={periodId} onChange={setPeriodId} />
        </Field>
      </div>
      {report.isLoading && <Loading />}
      {report.data && (
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2.5 font-semibold dark:border-slate-800">
            نتائج الاستغلال — {report.data.length} موظف
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th className="num">إجمالي التخصيص%</th>
                  <th className="num">الوقت غير المستغل%</th>
                  <th className="num">الوقت الفائض%</th>
                  <th>الحالة</th>
                  <th>المشاريع</th>
                </tr>
              </thead>
              <tbody>
                {report.data.length === 0
                  ? <tr><td colSpan={6} className="text-center text-slate-500">لا توجد تخصيصات في هذه الفترة</td></tr>
                  : report.data.map((r: any) => (
                    <tr key={r.employeeId}>
                      <td>
                        <Link to={`/hr/employees/${r.employeeId}`} className="text-brand-600 hover:underline">
                          {r.employeeName}
                        </Link>
                      </td>
                      <td className="num font-medium">{Number(r.allocatedPct).toFixed(1)}%</td>
                      <td className="num text-amber-600">{Number(r.unutilizedPct).toFixed(1)}%</td>
                      <td className="num text-rose-600">{Number(r.overAllocatedPct ?? 0).toFixed(1)}%</td>
                      <td>
                        {r.isOverAllocated
                          ? <Badge color="red">فائض تخصيص</Badge>
                          : r.allocatedPct < 100
                            ? <Badge color="amber">وقت فائض</Badge>
                            : <Badge color="green">مكتمل</Badge>}
                      </td>
                      <td className="text-xs text-slate-500">{r.projectNames?.join('، ') ?? '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ service prices (global)
export function ServicePricesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: ['/service-prices', page],
    queryFn: () => api.get<Page<any>>('/service-prices', { page, pageSize: 50 }),
  });

  const priceItems = list.data?.data ?? [];

  const handleExportCsv = () => {
    if (!priceItems.length) return;
    downloadCsv(`service-prices-${today()}.csv`, [
      ['اسم الموظف', 'أساس التسعير', 'السعر', 'العملة', 'النوع (عام أم خاص بمشروع)', 'ساري من', 'ساري حتى'],
      ...priceItems.map((sp: any) => [
        sp.employeeName, PRICING_BASIS[sp.pricingBasis ?? sp.basis] || sp.pricingBasis, sp.price, sp.currencyCode, sp.projectId ? 'خاص بمشروع' : 'افتراضي عام', sp.effectiveFrom || '', sp.effectiveTo || 'مفتوح',
      ]),
    ]);
    toast.success('تم تصدير أسعار الخدمات إلى CSV بنجاح');
  };

  const fields: FieldDef[] = [
    { name: 'employeeId', label: 'الموظف', type: 'ref', ref: REF.employee, required: true },
    { name: 'projectId', label: 'المشروع (اختياري - Override)', type: 'ref', ref: REF.project, hint: 'اتركه فارغًا ليكون السعر الافتراضي العام للموظف، أو حدد مشروعًا ليكون سعرًا خاصًا (Override)' },
    { name: 'pricingBasis', label: 'أساس التسعير', type: 'select', options: opts(PRICING_BASIS), required: true, default: 'MONTHLY' },
    { name: 'price', label: 'السعر', type: 'decimal', required: true },
    { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency, required: true },
    { name: 'effectiveFrom', label: 'من تاريخ', type: 'date', required: true },
    { name: 'effectiveTo', label: 'إلى تاريخ (اتركه فارغًا للسعر الافتراضي المفتوح)', type: 'date' },
    { name: 'reason', label: 'السبب / المبرر', type: 'text', required: true, default: 'سعر خدمة' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="أسعار خدمات الموظفين والمبرمجين"
        subtitle="السعر الافتراضي لكل موظف. عند إسناده لمشروع يمكن تجاوزه بسعر خاص بالمشروع (Override). السعر مؤرّخ ولا يتأثر بالتغييرات المستقبلية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> إضافة سعر
            </button>
          </div>
        }
      />
      <div className="card overflow-hidden">
        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorState error={list.error} /></div>
          : list.data!.data.length === 0 ? <EmptyState text="لا توجد أسعار. أضف سعراً افتراضياً لكل موظف." />
          : (
            <>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr><th>الموظف</th><th>الأساس</th><th>السعر</th><th>العملة</th><th>النوع</th><th>من</th><th>إلى</th><th /></tr>
                  </thead>
                  <tbody>
                    {list.data!.data.map((sp: any) => (
                      <tr key={sp.id}>
                        <td><Link to={`/hr/employees/${sp.employeeId}`} className="text-brand-600 hover:underline">{sp.employeeName}</Link></td>
                        <td>{PRICING_BASIS[sp.pricingBasis ?? sp.basis] ?? (sp.pricingBasis ?? sp.basis)}</td>
                        <td className="num">{money(sp.price)}</td>
                        <td>{sp.currencyCode}</td>
                        <td>{sp.projectId ? <Badge color="blue">مشروع محدد</Badge> : <Badge color="slate">افتراضي</Badge>}</td>
                        <td>{date(sp.effectiveFrom)}</td>
                        <td>{sp.effectiveTo ? date(sp.effectiveTo) : 'مفتوح'}</td>
                        <td>
                          {!sp.effectiveTo && (
                            <button className="btn-ghost h-7 px-2 text-rose-600 text-xs"
                              onClick={async () => {
                                if (!confirm('إنهاء هذا السعر اليوم؟')) return;
                                try { await api.post(`/service-prices/${sp.id}/end`, { effectiveTo: new Date().toISOString().slice(0, 10) }); qc.invalidateQueries({ queryKey: ['/service-prices'] }); toast.success('تم الإنهاء'); } catch (e) { toast.error(e); }
                              }}>إنهاء</button>
                          )}
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
      <FormModal
        open={adding} title="إضافة سعر خدمة افتراضي" fields={fields} wide
        onClose={() => setAdding(false)}
        onSubmit={async (b) => { await api.post('/service-prices', b); qc.invalidateQueries({ queryKey: ['/service-prices'] }); }}
      />
    </div>
  );
}
