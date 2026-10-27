import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Download, Eye, FileUp, Pencil, Plus, Printer, Search, Square, Trash2, UserPlus } from 'lucide-react';
import { api, Page } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, dateTime, downloadCsv, money, today } from '../lib/format';
import { DOC_TYPE, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, opts } from '../lib/labels';
import { ActiveBadge, cleanPayload, CrudPage, EntityForm, FieldDef, fieldErrors } from '../components/CrudPage';
import { FormModal, PeriodSelect, REF } from '../components/forms';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Spinner, Stat, useToast } from '../components/ui';

// ------------------------------------------------------------------ positions
export const PositionsPage = () => (
  <CrudPage
    title="الوظائف"
    subtitle="المسميات الوظيفية المستخدمة في تنسيب الموظفين."
    path="/positions"
    entityLabel="وظيفة"
    columns={[
      { key: 'code', label: 'الرمز', className: 'num text-start' },
      { key: 'titleAr', label: 'المسمى' },
      { key: 'titleEn', label: 'المسمى (EN)' },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true, createOnly: true },
      { name: 'titleAr', label: 'المسمى بالعربية', type: 'text', required: true },
      { name: 'titleEn', label: 'المسمى بالإنجليزية', type: 'text', ltr: true },
      { name: 'isActive', label: 'نشطة', type: 'bool', default: true },
    ]}
  />
);

const StatusBadge = ({ s }: { s: string }) => <Badge color={EMPLOYEE_STATUS[s]?.color}>{EMPLOYEE_STATUS[s]?.label ?? s}</Badge>;

const employeeFields: FieldDef[] = [
  { name: 'code', label: 'الرقم الوظيفي', type: 'text', required: true, ltr: true },
  { name: 'fullNameAr', label: 'الاسم بالعربية', type: 'text', required: true },
  { name: 'fullNameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
  { name: 'nationalId', label: 'الرقم القومي / الهوية', type: 'text', ltr: true },
  { name: 'email', label: 'البريد الإلكتروني', type: 'text', ltr: true },
  { name: 'phone', label: 'الهاتف', type: 'text', ltr: true },
  { name: 'birthDate', label: 'تاريخ الميلاد', type: 'date' },
  { name: 'gender', label: 'النوع', type: 'select', options: [{ value: 'MALE', label: 'ذكر' }, { value: 'FEMALE', label: 'أنثى' }] },
  { name: 'employmentType', label: 'نوع التعاقد', type: 'select', options: opts(EMPLOYMENT_TYPE), default: 'FULL_TIME', required: true },
  { name: 'isBillableResource', label: 'مورد قابل للفوترة', type: 'bool', default: true },
  { name: 'requiredMarginPct', label: 'هامش الربح المطلوب %', type: 'decimal' },
  { name: 'workCalendarId', label: 'تقويم العمل', type: 'ref', ref: REF.calendar },
  { name: 'bankName', label: 'البنك', type: 'text' },
  { name: 'bankAccountNo', label: 'رقم الحساب البنكي', type: 'text', ltr: true },
  { name: 'iban', label: 'IBAN', type: 'text', ltr: true },
  { name: 'notes', label: 'ملاحظات', type: 'textarea' },
];
const placementFields: FieldDef[] = [
  { name: 'departmentId', label: 'القسم', type: 'ref', ref: REF.department },
  { name: 'branchId', label: 'الفرع', type: 'ref', ref: REF.branch },
  { name: 'positionId', label: 'الوظيفة', type: 'ref', ref: REF.position },
  { name: 'costCenterId', label: 'مركز التكلفة', type: 'ref', ref: REF.costCenter },
  { name: 'managerEmployeeId', label: 'المدير المباشر', type: 'ref', ref: REF.employee },
];
const salaryFields: FieldDef[] = [
  { name: 'basicSalary', label: 'الراتب الأساسي', type: 'decimal', required: true },
  { name: 'salaryCurrency', label: 'عملة الراتب', type: 'ref', ref: REF.currency, required: true },
  { name: 'insuranceSalary', label: 'الأجر التأميني', type: 'decimal', default: '0' },
  { name: 'insuranceCurrency', label: 'عملة الأجر التأميني', type: 'ref', ref: REF.currency, hint: 'افتراضيًا نفس عملة الراتب' },
];

// ------------------------------------------------------------------ employees list
export function EmployeesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const list = useQuery({ queryKey: ['/employees', page, search, status], queryFn: () => api.get<Page<any>>('/employees', { page, pageSize: 50, q: search, status }) });
  const hireFields: FieldDef[] = [
    ...employeeFields.slice(0, 10),
    { name: 'hireDate', label: 'تاريخ التعيين', type: 'date', required: true, default: today() },
    ...placementFields,
    ...salaryFields,
    { name: 'costProfileId', label: 'ملف التكلفة', type: 'ref', ref: REF.profile },
  ];
  const save = useMutation({
    mutationFn: () => {
      const v = cleanPayload(hireFields, form, false);
      const body: Record<string, any> = {};
      for (const f of employeeFields.slice(0, 10)) if (v[f.name] !== undefined) body[f.name] = v[f.name];
      body.hireDate = v.hireDate;
      body.placement = Object.fromEntries(placementFields.map((f) => [f.name, v[f.name] ?? null]));
      if (v.basicSalary) {
        body.compensation = { basicSalary: v.basicSalary, salaryCurrency: v.salaryCurrency, insuranceSalary: v.insuranceSalary ?? '0', insuranceCurrency: v.insuranceCurrency ?? undefined };
      }
      body.costProfileId = v.costProfileId ?? null;
      return api.post<any>('/employees', body);
    },
    onSuccess: (e) => {
      toast.success('تم تعيين الموظف');
      qc.invalidateQueries({ queryKey: ['/employees'] });
      setCreating(false);
      nav(`/hr/employees/${e.id}`);
    },
    onError: (e) => { setErrors(fieldErrors(e)); toast.error(e); },
  });
  const empList = list.data?.data ?? [];
  const totalEmployees = list.data?.meta.total ?? empList.length;
  const activeCount = empList.filter((x: any) => x.status === 'ACTIVE').length;
  const billableCount = empList.filter((x: any) => x.isBillableResource).length;
  const withProfileCount = empList.filter((x: any) => x.costProfileId || x.costProfileName).length;

  const handleExport = () => {
    downloadCsv(`employees-${today()}.csv`, [
      ['الرقم الوظيفي', 'الاسم بالعربية', 'الاسم بالإنجليزية', 'القسم', 'المسمى الوظيفي', 'تاريخ التعيين', 'الراتب الأساسي', 'العملة', 'ملف التكلفة', 'الحالة'],
      ...empList.map((e: any) => [
        e.code, e.fullNameAr, e.fullNameEn || '', e.departmentName || '', e.positionTitle || '', e.hireDate || '', e.basicSalary || '0', e.salaryCurrency || '', e.costProfileName || '', e.status || '',
      ]),
    ]);
    toast.success('تم تصدير قائمة الموظفين إلى ملف CSV بنجاح');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="الموظفون والكوادر البشرية"
        subtitle="بيانات الموظفين والمبرمجين مع سجل تاريخي لكل تغيير (التنسيب، الراتب، ملف التكلفة). التعديل لا يغيّر النتائج التاريخية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => { setForm({ employmentType: 'FULL_TIME', isBillableResource: true, hireDate: today(), insuranceSalary: '0' }); setErrors({}); setCreating(true); }}>
              <UserPlus className="size-4" /> تعيين موظف
            </button>
          </div>
        }
      />

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat label="إجمالي الكوادر" value={String(totalEmployees)} tone="blue" hint="مسجلون في قاعدة البيانات" />
        <Stat label="على رأس العمل" value={String(activeCount)} tone="green" hint="حالة وظيفية نشطة" />
        <Stat label="موارد مشاريع قابلة للفوترة" value={String(billableCount)} tone="purple" hint="مبرمجون ومستشارون" />
        <Stat label="ملفات التكلفة المربوطة" value={String(withProfileCount)} tone="teal" hint="محسوبة في محرك التكاليف" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 p-3.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-80">
              <Search className="absolute start-3 top-3 size-4 text-slate-400" />
              <input className="input ps-9 h-9.5 text-xs" placeholder="بحث بالرقم أو الاسم…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="input w-44 h-9.5 text-xs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">كل الحالات</option>
              {opts(EMPLOYEE_STATUS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {list.data?.meta && (
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              المعروض: <strong className="font-mono text-slate-900 dark:text-white font-bold">{list.data.data.length}</strong> من <strong className="font-mono text-slate-900 dark:text-white font-bold">{list.data.meta.total}</strong>
            </div>
          )}
        </div>
        {list.isLoading ? <Loading /> : list.error ? <div className="p-4"><ErrorState error={list.error} /></div> : list.data!.data.length === 0 ? (
          <EmptyState text={search || status ? 'لا توجد نتائج مطابقة' : 'لا يوجد موظفون بعد. ابدأ بتعيين أول موظف.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>الموظف</th>
                    <th>القسم</th>
                    <th>المسمى الوظيفي</th>
                    <th>تاريخ التعيين</th>
                    <th>الراتب الأساسي</th>
                    <th>ملف التكلفة</th>
                    <th>الحالة</th>
                    <th className="w-24 text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data!.data.map((e) => (
                    <tr key={e.id} className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50" onClick={() => nav(`/hr/employees/${e.id}`)}>
                      <td className="num text-start font-mono font-bold text-slate-800 dark:text-slate-200">{e.code}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-indigo-600 text-xs font-bold text-white shadow-2xs">
                            {e.fullNameAr?.trim().slice(0, 1) || 'م'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{e.fullNameAr}</div>
                            {e.fullNameEn && <div className="text-[11px] font-mono text-slate-400">{e.fullNameEn}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{e.departmentName ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium">{e.departmentName}</span> : '—'}</td>
                      <td><span className="font-medium text-slate-800 dark:text-slate-200 text-xs">{e.positionTitle ?? '—'}</span></td>
                      <td className="text-xs font-mono">{date(e.hireDate)}</td>
                      <td className="num font-bold text-slate-900 dark:text-white">{e.basicSalary !== undefined ? (e.basicSalary ? `${money(e.basicSalary)} ${e.salaryCurrency}` : '—') : '•••'}</td>
                      <td>{e.costProfileName ? <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 text-xs font-semibold">{e.costProfileName}</span> : <span className="text-amber-600 text-xs font-bold">غير محدد</span>}</td>
                      <td><StatusBadge s={e.status} /></td>
                      <td onClick={(evt) => evt.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="معاينة الملف"
                            onClick={() => nav(`/hr/employees/${e.id}`)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="تعديل"
                            onClick={() => nav(`/hr/employees/${e.id}`)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            className="btn-ghost h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="حذف"
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف سجل الموظف ${e.fullNameAr}؟`)) {
                                api.del(`/employees/${e.id}`)
                                  .then(() => {
                                    toast.success('تم حذف الموظف');
                                    qc.invalidateQueries({ queryKey: ['/employees'] });
                                  })
                                  .catch((err) => toast.error(err));
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
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
      <Drawer
        open={creating}
        onClose={() => setCreating(false)}
        title="تعيين موظف جديد"
        footer={<><button className="btn-secondary" onClick={() => setCreating(false)}>إلغاء</button><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} حفظ</button></>}
      >
        <p className="mb-3 text-xs text-slate-500">يتم إنشاء الموظف وتنسيبه وراتبه وملف تكلفته في عملية واحدة (كل شيء أو لا شيء)، وتبدأ جميعها من تاريخ التعيين.</p>
        <EntityForm fields={hireFields} value={form} onChange={setForm} errors={errors} />
      </Drawer>
    </div>
  );
}

// ------------------------------------------------------------------ employee detail
type Tab = 'info' | 'placement' | 'salary' | 'cost' | 'custody' | 'docs' | 'preview' | 'status';
const TABS: Array<[Tab, string]> = [
  ['info', 'البيانات الأساسية'], ['placement', 'التنسيب'], ['salary', 'الراتب'], ['cost', 'ملف التكلفة والاستثناءات'],
  ['custody', 'العهد'], ['docs', 'المستندات'], ['preview', 'تكلفة الموظف'], ['status', 'الحالة'],
];

function Effective({ from, to }: { from: string; to: string | null }) {
  const t = today();
  const current = from <= t && (!to || to >= t);
  return (
    <span className="whitespace-nowrap">
      {date(from)} ← {to ? date(to) : 'مفتوح'} {current && <Badge color="green">ساري</Badge>}
    </span>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('info');
  const [modal, setModal] = useState<string | null>(null);
  const key = ['employee', id];
  const emp = useQuery({ queryKey: key, queryFn: () => api.get<any>(`/employees/${id}`) });
  const refresh = (data?: any) => {
    if (data) qc.setQueryData(key, data);
    else qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['/employees'] });
  };
  const act = useMutation({
    mutationFn: (f: () => Promise<any>) => f(),
    onSuccess: (d) => { toast.success('تم'); refresh(d && typeof d === 'object' && d.id ? d : undefined); },
    onError: (e) => toast.error(e),
  });
  const removeVersion = (kind: string, vid: string) => confirm('حذف آخر إصدار؟ (تصحيح إدخال خاطئ)') && act.mutate(() => api.del(`/employees/${id}/${kind}/${vid}`));

  if (emp.isLoading) return <Loading />;
  if (emp.error) return <ErrorState error={emp.error} />;
  const e = emp.data;
  const submit = (path: string) => async (body: Record<string, any>) => refresh(await api.post(`/employees/${id}${path}`, body));

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${e.fullNameAr}`}
        subtitle={`الرقم الوظيفي ${e.code} — تاريخ التعيين ${date(e.hireDate)}${e.terminationDate ? ` — انتهاء الخدمة ${date(e.terminationDate)}` : ''}`}
        actions={<><StatusBadge s={e.status} /><Link to="/hr/employees" className="btn-secondary"><ArrowRight className="size-4" /> الموظفون</Link></>}
      />
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? 'border-brand-600 font-medium text-brand-700 dark:text-brand-100' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>
        ))}
      </div>

      {tab === 'info' && <InfoTab e={e} onSaved={refresh} />}

      {tab === 'placement' && (
        <Section title="سجل التنسيب (القسم / الفرع / الوظيفة / مركز التكلفة)" action={<button className="btn-primary h-8" onClick={() => setModal('placement')}><Plus className="size-4" /> تغيير التنسيب</button>}>
          <table className="table">
            <thead><tr><th>الفترة</th><th>القسم</th><th>الفرع</th><th>الوظيفة</th><th>مركز التكلفة</th><th>المدير</th><th>السبب</th><th /></tr></thead>
            <tbody>
              {e.placements.map((p: any, i: number) => (
                <tr key={p.id}>
                  <td><Effective from={p.effectiveFrom} to={p.effectiveTo} /></td>
                  <td>{p.departmentName ?? '—'}</td><td>{p.branchName ?? '—'}</td><td>{p.positionTitle ?? '—'}</td><td>{p.costCenterName ?? '—'}</td><td>{p.managerName ?? '—'}</td>
                  <td className="text-xs">{p.changeReason}</td>
                  <td>{i === 0 && e.placements.length > 1 && <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => removeVersion('placements', p.id)}><Trash2 className="size-3.5" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 'salary' && (
        e.compensations === null ? <EmptyState text="ليست لديك صلاحية عرض الرواتب." /> : (
          <Section title="سجل الراتب" action={<button className="btn-primary h-8" onClick={() => setModal('salary')}><Plus className="size-4" /> تعديل الراتب</button>}>
            <table className="table">
              <thead><tr><th>الفترة</th><th>الأساسي</th><th>التأميني</th><th>السبب</th><th>بواسطة</th><th /></tr></thead>
              <tbody>
                {e.compensations.length === 0 && <tr><td colSpan={6} className="text-center text-slate-500">لم يُسجل راتب بعد</td></tr>}
                {e.compensations.map((c: any, i: number) => (
                  <tr key={c.id}>
                    <td><Effective from={c.effectiveFrom} to={c.effectiveTo} /></td>
                    <td className="num">{money(c.basicSalary)} {c.salaryCurrency}</td>
                    <td className="num">{money(c.insuranceSalary)} {c.insuranceCurrency}</td>
                    <td className="text-xs">{c.changeReason}</td>
                    <td className="text-xs">{c.createdBy} — {dateTime(c.createdAt)}</td>
                    <td>{i === 0 && e.compensations.length > 1 && <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => removeVersion('compensations', c.id)}><Trash2 className="size-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">التعديل يُنشئ إصدارًا جديدًا يبدأ من تاريخ السريان، ويُغلق الإصدار السابق تلقائيًا. الإصدارات داخل فترة مقفلة لا يمكن تغييرها.</p>
          </Section>
        )
      )}

      {tab === 'cost' && (
        <div className="space-y-4">
          <Section title="ملف التكلفة" action={<div className="flex gap-2"><button className="btn-secondary h-8" onClick={() => setModal('endProfile')}><Square className="size-3.5" /> إنهاء</button><button className="btn-primary h-8" onClick={() => setModal('profile')}><Plus className="size-4" /> إسناد ملف</button></div>}>
            <table className="table">
              <thead><tr><th>الفترة</th><th>الملف</th><th /></tr></thead>
              <tbody>
                {e.costProfiles.length === 0 && <tr><td colSpan={3} className="text-center text-amber-600">لا يوجد ملف تكلفة؛ لن تُحسب مكونات التكلفة لهذا الموظف.</td></tr>}
                {e.costProfiles.map((p: any, i: number) => (
                  <tr key={p.id}>
                    <td><Effective from={p.effectiveFrom} to={p.effectiveTo} /></td>
                    <td><Link className="text-brand-600 hover:underline" to={`/cost/profiles/${p.profileId}`}>{p.profileCode} — {p.profileName}</Link></td>
                    <td>{i === 0 && <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => removeVersion('cost-profiles', p.id)}><Trash2 className="size-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="استثناءات المكونات لهذا الموظف" action={<button className="btn-primary h-8" onClick={() => setModal('override')}><Plus className="size-4" /> إضافة استثناء</button>}>
            <table className="table">
              <thead><tr><th>المكون</th><th>الفترة</th><th>النسبة</th><th>المبلغ</th><th>مستبعد</th><th>السبب</th><th /></tr></thead>
              <tbody>
                {e.overrides.length === 0 && <tr><td colSpan={7} className="text-center text-slate-500">لا توجد استثناءات — تُطبق قيم ملف التكلفة كما هي.</td></tr>}
                {e.overrides.map((o: any) => (
                  <tr key={o.id}>
                    <td>{o.componentCode} — {o.componentName}</td>
                    <td><Effective from={o.effectiveFrom} to={o.effectiveTo} /></td>
                    <td className="num">{o.ratePct ? `${o.ratePct}%` : '—'}</td>
                    <td className="num">{o.amount ? `${money(o.amount)} ${o.currencyCode}` : '—'}</td>
                    <td>{o.isExcluded ? <Badge color="red">مستبعد</Badge> : '—'}</td>
                    <td className="text-xs">{o.reason}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {!o.effectiveTo && <button className="btn-ghost h-7 px-2" title="إنهاء" onClick={() => { const d = prompt('تاريخ آخر يوم للاستثناء (YYYY-MM-DD)', today()); if (d) act.mutate(() => api.post(`/employees/${id}/overrides/${o.id}/end`, { effectiveTo: d })); }}><Square className="size-3.5" /></button>}
                        <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => confirm('حذف الاستثناء؟') && act.mutate(() => api.del(`/employees/${id}/overrides/${o.id}`))}><Trash2 className="size-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {tab === 'custody' && (
        <Section title="العهد (الأصول في عهدة الموظف)" action={<Link to="/assets/list" className="btn-secondary h-8">إدارة الأصول</Link>}>
          <table className="table">
            <thead><tr><th>رقم الأصل</th><th>الأصل</th><th>الفترة</th><th>ملاحظات</th></tr></thead>
            <tbody>
              {e.custodies.length === 0 && <tr><td colSpan={4} className="text-center text-slate-500">لا توجد عهد. تُسند العهد من شاشة الأصل.</td></tr>}
              {e.custodies.map((c: any) => (
                <tr key={c.id}>
                  <td className="num text-start"><Link className="text-brand-600 hover:underline" to={`/assets/list/${c.assetId}`}>{c.assetNo}</Link></td>
                  <td>{c.assetName}</td><td><Effective from={c.effectiveFrom} to={c.effectiveTo} /></td><td className="text-xs">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 'docs' && <DocumentsTab employeeId={id!} docs={e.documents} onChange={() => refresh()} />}
      {tab === 'preview' && <CostPreview employeeId={id!} />}

      {tab === 'status' && (
        <Section title="سجل الحالة" action={<button className="btn-primary h-8" onClick={() => setModal('status')}>تغيير الحالة</button>}>
          <table className="table">
            <thead><tr><th>من</th><th>إلى</th><th>تاريخ السريان</th><th>السبب</th><th>بواسطة</th></tr></thead>
            <tbody>
              {e.statusHistory.map((h: any) => (
                <tr key={h.id}>
                  <td>{h.oldStatus ? <StatusBadge s={h.oldStatus} /> : '—'}</td><td><StatusBadge s={h.newStatus} /></td><td>{date(h.effectiveDate)}</td>
                  <td className="text-xs">{h.reason === 'HIRED' ? 'تعيين' : h.reason}</td><td className="text-xs">{h.changedBy ?? '—'} — {dateTime(h.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <FormModal open={modal === 'placement'} title="تغيير التنسيب" onClose={() => setModal(null)} onSubmit={submit('/placements')}
        initial={{ ...Object.fromEntries(placementFields.map((f) => [f.name, e.placements[0]?.[f.name] ?? ''])), effectiveFrom: today() }}
        fields={[{ name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true }, ...placementFields, { name: 'reason', label: 'السبب', type: 'textarea', required: true }]} />
      <FormModal open={modal === 'salary'} title="تعديل الراتب" onClose={() => setModal(null)} onSubmit={submit('/compensations')}
        initial={{ ...(e.compensations?.[0] ? { basicSalary: e.compensations[0].basicSalary, salaryCurrency: e.compensations[0].salaryCurrency, insuranceSalary: e.compensations[0].insuranceSalary, insuranceCurrency: e.compensations[0].insuranceCurrency } : {}), effectiveFrom: today() }}
        fields={[{ name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true }, ...salaryFields, { name: 'reason', label: 'السبب', type: 'textarea', required: true }]} />
      <FormModal open={modal === 'profile'} title="إسناد ملف تكلفة" onClose={() => setModal(null)} onSubmit={submit('/cost-profiles')} initial={{ effectiveFrom: today() }}
        fields={[{ name: 'profileId', label: 'ملف التكلفة', type: 'ref', ref: REF.profile, required: true }, { name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true }]} />
      <FormModal open={modal === 'endProfile'} title="إنهاء ملف التكلفة الحالي" onClose={() => setModal(null)} onSubmit={submit('/cost-profiles/end')} initial={{ effectiveTo: today() }}
        fields={[{ name: 'effectiveTo', label: 'آخر يوم', type: 'date', required: true }]} />
      <FormModal open={modal === 'override'} title="استثناء مكون لهذا الموظف" onClose={() => setModal(null)} onSubmit={submit('/overrides')} initial={{ effectiveFrom: today() }}
        note="الاستثناء يغيّر نسبة أو مبلغ المكون لهذا الموظف فقط خلال الفترة المحددة، أو يستبعده تمامًا. إن لم يكن المكون ضمن ملف التكلفة فسيُضاف له."
        fields={[
          { name: 'componentId', label: 'المكون', type: 'ref', ref: REF.component, required: true },
          { name: 'isExcluded', label: 'استبعاد المكون', type: 'bool', default: false },
          { name: 'ratePct', label: 'النسبة %', type: 'decimal' },
          { name: 'amount', label: 'المبلغ الشهري', type: 'decimal' },
          { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency },
          { name: 'effectiveFrom', label: 'من', type: 'date', required: true },
          { name: 'effectiveTo', label: 'إلى', type: 'date' },
          { name: 'reason', label: 'السبب', type: 'textarea', required: true },
        ]} />
      <FormModal open={modal === 'status'} title="تغيير حالة الموظف" onClose={() => setModal(null)} onSubmit={submit('/status')} initial={{ effectiveDate: today() }}
        note="إنهاء الخدمة يُنهي التنسيب والراتب وملف التكلفة والعهد في تاريخ الإنهاء ويحذف أي إصدارات مستقبلية."
        fields={[
          { name: 'newStatus', label: 'الحالة الجديدة', type: 'select', options: opts(EMPLOYEE_STATUS), required: true, default: 'ON_LEAVE' },
          { name: 'effectiveDate', label: 'تاريخ السريان', type: 'date', required: true },
          { name: 'reason', label: 'السبب', type: 'textarea', required: true },
        ]} />
    </div>
  );
}

function InfoTab({ e, onSaved }: { e: any; onSaved: (d: any) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, any>>(e);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => setForm(e), [e]);
  const fields = employeeFields.filter((f) => f.name !== 'code');
  const save = useMutation({
    mutationFn: () => {
      const body = cleanPayload(fields, form, true);
      for (const k of ['nationalId', 'bankAccountNo', 'iban']) if (typeof body[k] === 'string' && body[k].includes('*')) delete body[k]; // masked values are not sent back
      return api.patch<any>(`/employees/${e.id}`, { ...body, rowVersion: e.rowVersion });
    },
    onSuccess: (d) => { toast.success('تم الحفظ'); onSaved(d); },
    onError: (err) => { setErrors(fieldErrors(err)); toast.error(err); },
  });
  return (
    <div className="card p-4">
      <EntityForm fields={fields} value={form} onChange={setForm} errors={errors} editing />
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending && <Spinner />} حفظ البيانات</button>
      </div>
    </div>
  );
}

function DocumentsTab({ employeeId, docs, onChange }: { employeeId: string; docs: any[]; onChange: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<Record<string, any>>({ docType: 'CONTRACT', title: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(meta)) if (v) fd.append(k, String(v));
      if (file) fd.append('file', file);
      await api.post(`/employees/${employeeId}/documents`, fd);
      toast.success('تم رفع المستند');
      setOpen(false);
      onChange();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const download = async (d: any) => {
    try {
      const blob = await api.blob(`/employees/${employeeId}/documents/${d.id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.fileName ?? 'document';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e);
    }
  };
  const remove = async (d: any) => {
    if (!confirm('حذف المستند؟')) return;
    try {
      await api.del(`/employees/${employeeId}/documents/${d.id}`);
      onChange();
    } catch (e) {
      toast.error(e);
    }
  };
  const expiring = (d: any) => d.expiryDate && d.expiryDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  return (
    <Section title="المستندات" action={<button className="btn-primary h-8" onClick={() => { setMeta({ docType: 'CONTRACT', title: '' }); setFile(null); setOpen(true); }}><FileUp className="size-4" /> رفع مستند</button>}>
      <table className="table">
        <thead><tr><th>النوع</th><th>العنوان</th><th>الرقم</th><th>الإصدار</th><th>الانتهاء</th><th>الملف</th><th /></tr></thead>
        <tbody>
          {docs.length === 0 && <tr><td colSpan={7} className="text-center text-slate-500">لا توجد مستندات</td></tr>}
          {docs.map((d) => (
            <tr key={d.id}>
              <td>{DOC_TYPE[d.docType] ?? d.docType}</td><td>{d.title}</td><td className="num text-start">{d.docNumber ?? '—'}</td><td>{date(d.issueDate)}</td>
              <td>{d.expiryDate ? <span className={expiring(d) ? 'font-medium text-rose-600' : ''}>{date(d.expiryDate)}</span> : '—'}</td>
              <td className="text-xs">{d.fileName ? `${d.fileName} (${Math.ceil(Number(d.sizeBytes) / 1024)} KB)` : '—'}</td>
              <td>
                <div className="flex justify-end gap-1">
                  {d.fileName && <button className="btn-ghost h-7 px-2" onClick={() => download(d)}><Download className="size-3.5" /></button>}
                  <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => remove(d)}><Trash2 className="size-3.5" /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} onClose={() => setOpen(false)} title="رفع مستند" footer={<><button className="btn-secondary" onClick={() => setOpen(false)}>إلغاء</button><button className="btn-primary" disabled={busy || !meta.title} onClick={upload}>{busy && <Spinner />} رفع</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="النوع *">
            <select className="input" value={meta.docType} onChange={(e) => setMeta({ ...meta, docType: e.target.value })}>
              {opts(DOC_TYPE).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="العنوان *"><input className="input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="رقم المستند"><input className="input" dir="ltr" value={meta.docNumber ?? ''} onChange={(e) => setMeta({ ...meta, docNumber: e.target.value })} /></Field>
          <Field label="تاريخ الإصدار"><input className="input" type="date" value={meta.issueDate ?? ''} onChange={(e) => setMeta({ ...meta, issueDate: e.target.value })} /></Field>
          <Field label="تاريخ الانتهاء"><input className="input" type="date" value={meta.expiryDate ?? ''} onChange={(e) => setMeta({ ...meta, expiryDate: e.target.value })} /></Field>
          <Field label="الملف (حتى 10 ميجابايت)"><input className="input py-1.5" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <Field label="ملاحظات" className="col-span-2"><textarea className="input h-16 py-2" value={meta.notes ?? ''} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </Section>
  );
}

export function CostLinesTable({ lines, base }: { lines: any[]; base: string }) {
  return (
    <table className="table">
      <thead><tr><th>المكون</th><th>الطبيعة</th><th>أيام</th><th>المبلغ</th><th>سعر الصرف</th><th>بالعملة الأساسية ({base})</th><th>الربحية</th></tr></thead>
      <tbody>
        {lines.map((l) => (
          <tr key={`${l.componentId}-${l.currencyCode}`}>
            <td>{l.code} — {l.nameAr}</td>
            <td className="text-xs">{l.nature === 'EMPLOYEE_DEDUCTION' || l.nature === 'TAX' ? <Badge color="amber">استقطاع</Badge> : <Badge color="blue">تكلفة</Badge>}</td>
            <td className="num">{l.activeDays}</td>
            <td className="num">{money(l.amount)} {l.currencyCode}</td>
            <td className="num text-xs">{Number(l.exchangeRate)}</td>
            <td className="num font-medium">{money(l.amountBase)}</td>
            <td className="text-xs">{l.profitabilityTreatment === 'DISTRIBUTE' ? 'تُوزع' : 'مستبعدة'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CostPreview({ employeeId }: { employeeId: string }) {
  const base = useBaseCurrency();
  const [periodId, setPeriodId] = useState('');
  const cost = useQuery({ queryKey: ['employee-cost', employeeId, periodId], enabled: !!periodId, queryFn: () => api.get<any>(`/employees/${employeeId}/cost`, { periodId }) });
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <Field label="الفترة"><PeriodSelect value={periodId} onChange={setPeriodId} /></Field>
        <p className="pb-2 text-xs text-slate-500">حساب فعلي من الراتب الساري وملف التكلفة والاستثناءات والعهد، بالتناسب حسب أيام التقويم.</p>
      </div>
      {cost.isLoading ? <Loading /> : cost.error ? <ErrorState error={cost.error} /> : cost.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="أيام العمل في الفترة" value={`${cost.data.employedDays} / ${cost.data.periodDays}`} />
            <Stat label="إجمالي التكلفة" value={money(cost.data.totalCostBase)} hint={base} tone="blue" />
            <Stat label="القابلة للتوزيع على المشاريع" value={money(cost.data.distributableCostBase)} hint={base} tone="green" />
            <Stat label="استقطاعات الموظف" value={money(cost.data.totalDeductionsBase)} hint="ليست تكلفة على الشركة" />
          </div>
          <div className="card overflow-x-auto">
            {cost.data.lines.length === 0 ? <EmptyState text="لا توجد مكونات تكلفة لهذه الفترة (تأكد من الراتب وملف التكلفة)." /> : <CostLinesTable lines={cost.data.lines} base={cost.data.baseCurrency} />}
          </div>
        </>
      )}
    </div>
  );
}
