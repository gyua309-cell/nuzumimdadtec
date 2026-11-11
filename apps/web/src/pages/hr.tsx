import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  FolderPlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Square,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, dateTime, money, today } from '../lib/format';
import { DOC_TYPE, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, opts } from '../lib/labels';
import { ActiveBadge, cleanPayload, CrudPage, EntityForm, FieldDef, fieldErrors } from '../components/CrudPage';
import { ExportMenu } from '../components/ExportMenu';
import { FormModal, PeriodSelect, REF } from '../components/forms';
import {
  Badge,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pager,
  Spinner,
  Stat,
  useToast,
} from '../components/ui';

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

export const StatusBadge = ({ s }: { s: string }) => (
  <Badge color={EMPLOYEE_STATUS[s]?.color}>{EMPLOYEE_STATUS[s]?.label ?? s}</Badge>
);

export const employeeFields: FieldDef[] = [
  { name: 'code', label: 'الرقم الوظيفي', type: 'text', required: true, ltr: true },
  { name: 'fullNameAr', label: 'الاسم بالعربية', type: 'text', required: true },
  { name: 'fullNameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
  { name: 'nationalId', label: 'الرقم القومي / الهوية', type: 'text', ltr: true },
  { name: 'email', label: 'البريد الإلكتروني', type: 'text', ltr: true },
  { name: 'phone', label: 'الهاتف', type: 'text', ltr: true },
  { name: 'birthDate', label: 'تاريخ الميلاد', type: 'date' },
  { name: 'gender', label: 'النوع', type: 'select', options: [{ value: 'MALE', label: 'ذكر' }, { value: 'FEMALE', label: 'أنثى' }] },
  { name: 'employmentType', label: 'نوع التعاقد', type: 'select', options: opts(EMPLOYMENT_TYPE), default: 'FULL_TIME', required: true },
  { name: 'isBillableResource', label: 'مورد قابل للفوترة للعميل', type: 'bool', default: true },
  { name: 'requiredMarginPct', label: 'هامش الربح المطلوب %', type: 'decimal', default: '25' },
  { name: 'defaultBillingRate', label: 'سعر بيع الخدمة الافتراضي للعميل', type: 'decimal', default: '1500', hint: 'سعر الخدمة اليومي أو الشهري المحسوب على العميل' },
  { name: 'defaultBillingBasis', label: 'أساس تسعير الخدمة الافتراضي', type: 'select', options: [{ value: 'DAILY', label: 'يومي (باليوم)' }, { value: 'MONTHLY', label: 'شهري (بالشهر)' }, { value: 'HOURLY', label: 'بالساعة' }], default: 'DAILY' },
  { name: 'workCalendarId', label: 'تقويم العمل', type: 'ref', ref: REF.calendar },
  { name: 'bankName', label: 'البنك', type: 'text' },
  { name: 'bankAccountNo', label: 'رقم الحساب البنكي', type: 'text', ltr: true },
  { name: 'iban', label: 'IBAN', type: 'text', ltr: true },
  { name: 'notes', label: 'ملاحظات', type: 'textarea' },
];

export const placementFields: FieldDef[] = [
  { name: 'departmentId', label: 'القسم', type: 'ref', ref: REF.department },
  { name: 'branchId', label: 'الفرع', type: 'ref', ref: REF.branch },
  { name: 'positionId', label: 'الوظيفة', type: 'ref', ref: REF.position },
  { name: 'costCenterId', label: 'مركز التكلفة', type: 'ref', ref: REF.costCenter },
  { name: 'managerEmployeeId', label: 'المدير المباشر', type: 'ref', ref: REF.employee },
];

export const salaryFields: FieldDef[] = [
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
  const [assignModalEmp, setAssignModalEmp] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({
    employmentType: 'FULL_TIME',
    isBillableResource: true,
    requiredMarginPct: '25',
    defaultBillingRate: '1500',
    defaultBillingBasis: 'DAILY',
    salaryCurrency: 'SAR',
    insuranceCurrency: 'SAR',
    hireDate: today(),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ['/employees', page, search, status],
    queryFn: () => api.get<Page<any>>('/employees', { page, pageSize: 50, q: search, status }),
  });

  const hireFields: FieldDef[] = [
    { name: 'code', label: 'الرقم الوظيفي (تلقائي إن تُرك فارغاً)', type: 'text', ltr: true },
    { name: 'fullNameAr', label: 'الاسم بالعربية *', type: 'text', required: true },
    { name: 'fullNameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
    { name: 'nationalId', label: 'الرقم القومي / الهوية', type: 'text', ltr: true },
    { name: 'phone', label: 'الهاتف', type: 'text', ltr: true },
    { name: 'email', label: 'البريد الإلكتروني', type: 'text', ltr: true },
    { name: 'hireDate', label: 'تاريخ التعيين *', type: 'date', required: true, default: today() },
    { name: 'employmentType', label: 'نوع التعاقد *', type: 'select', options: opts(EMPLOYMENT_TYPE), default: 'FULL_TIME', required: true },
    ...placementFields,
    ...salaryFields,
    { name: 'costProfileId', label: 'ملف التكلفة', type: 'ref', ref: REF.profile },
    { name: 'defaultBillingRate', label: 'سعر بيع الخدمة للعميل (الافتراضي)', type: 'decimal', default: '1500', hint: 'السعر الافتراضي للفوترة على العميل' },
    { name: 'defaultBillingBasis', label: 'أساس تسعير الخدمة', type: 'select', options: [{ value: 'DAILY', label: 'يومي (باليوم)' }, { value: 'MONTHLY', label: 'شهري (بالشهر)' }, { value: 'HOURLY', label: 'بالساعة' }], default: 'DAILY' },
    { name: 'requiredMarginPct', label: 'هامش الربح المطلوب %', type: 'decimal', default: '25' },
    { name: 'initialProjectId', label: 'ربط أولي بمشروع (اختياري)', type: 'ref', ref: REF.project, hint: 'إسناد الموظف لمشروع عمل فور التعيين' },
    { name: 'initialAllocationPct', label: 'نسبة التخصيص للمشروع %', type: 'decimal', default: '100' },
  ];

  const save = useMutation({
    mutationFn: () => {
      const v = cleanPayload(hireFields, form, false);
      const body: Record<string, any> = {};
      for (const f of employeeFields) {
        if (v[f.name] !== undefined && v[f.name] !== null) body[f.name] = v[f.name];
      }
      body.hireDate = v.hireDate || today();
      body.placement = Object.fromEntries(placementFields.map((f) => [f.name, v[f.name] ?? null]));
      if (v.basicSalary) {
        body.compensation = {
          basicSalary: String(v.basicSalary),
          salaryCurrency: v.salaryCurrency || 'SAR',
          insuranceSalary: String(v.insuranceSalary || '0'),
          insuranceCurrency: v.insuranceCurrency || v.salaryCurrency || 'SAR',
        };
        body.basicSalary = String(v.basicSalary);
        body.salaryCurrency = v.salaryCurrency || 'SAR';
        body.insuranceSalary = String(v.insuranceSalary || '0');
        body.insuranceCurrency = v.insuranceCurrency || v.salaryCurrency || 'SAR';
      }
      body.costProfileId = v.costProfileId ?? null;
      if (v.defaultBillingRate) body.defaultBillingRate = String(v.defaultBillingRate);
      if (v.defaultBillingBasis) body.defaultBillingBasis = v.defaultBillingBasis;
      if (v.fullNameAr) body.fullNameAr = v.fullNameAr;
      if (v.fullNameEn) body.fullNameEn = v.fullNameEn;
      if (v.initialProjectId) {
        body.initialProjectId = v.initialProjectId;
        body.initialAllocationPct = v.initialAllocationPct || '100';
      }
      return api.post<any>('/employees', body);
    },
    onSuccess: (e) => {
      toast.success('تم تعيين الموظف بنجاح');
      qc.invalidateQueries({ queryKey: ['/employees'] });
      setCreating(false);
      setForm({
        employmentType: 'FULL_TIME',
        isBillableResource: true,
        requiredMarginPct: '25',
        defaultBillingRate: '1500',
        defaultBillingBasis: 'DAILY',
        salaryCurrency: 'SAR',
        insuranceCurrency: 'SAR',
        hireDate: today(),
      });
      if (e?.id) {
        nav(`/hr/employees/${e.id}`);
      }
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(e);
    },
  });

  const rawData: any = list.data;
  const empList: any[] = Array.isArray(rawData)
    ? rawData
    : Array.isArray(rawData?.data)
    ? rawData.data
    : Array.isArray(rawData?.items)
    ? rawData.items
    : [];
  const totalEmployees = list.data?.meta?.total ?? empList.length;
  const activeCount = empList.filter((x: any) => x?.status === 'ACTIVE').length;
  const billableCount = empList.filter((x: any) => x?.isBillableResource).length;
  const withProfileCount = empList.filter((x: any) => x?.costProfileId || x?.costProfileName).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="الموظفون والكوادر البشرية"
        subtitle="إدارة الكوادر والمطورين: الرواتب، التنسيب، ملفات التكلفة، وإسناد المشاريع وحساب الربحية المباشرة."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="سجل الموظفين والكوادر البشرية"
              filename={`Employees-${today()}`}
              columns={[
                { key: 'code', header: 'الرقم الوظيفي', width: 14 },
                { key: 'fullNameAr', header: 'الاسم بالعربية', width: 25 },
                { key: 'fullNameEn', header: 'الاسم بالإنجليزية', width: 20 },
                { key: 'departmentName', header: 'القسم', width: 22 },
                { key: 'positionTitle', header: 'المسمى الوظيفي', width: 22 },
                { key: 'hireDate', header: 'تاريخ التعيين', width: 14 },
                { key: 'basicSalary', header: 'الراتب الأساسي', width: 18 },
                { key: 'salaryCurrency', header: 'العملة', width: 10 },
                { key: 'costProfileName', header: 'ملف التكلفة', width: 22 },
                { key: 'status', header: 'الحالة', width: 14 },
              ]}
              data={empList}
            />
            <button
              className="btn-primary"
              onClick={() => {
                setForm({
                  employmentType: 'FULL_TIME',
                  isBillableResource: true,
                  requiredMarginPct: '25',
                  defaultBillingRate: '1500',
                  defaultBillingBasis: 'DAILY',
                  salaryCurrency: 'SAR',
                  insuranceCurrency: 'SAR',
                  hireDate: today(),
                });
                setErrors({});
                setCreating(true);
              }}
            >
              <UserPlus className="size-4" /> تعيين موظف جديد
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="إجمالي الكوادر" value={totalEmployees} hint="في كافة الفروع والأقسام" />
        <Stat label="الموظفون النشطون" value={activeCount} hint="على رأس العمل" tone="green" />
        <Stat label="الكوادر المفوترة للمشاريع" value={billableCount} hint="تحقق إيرادات بيع خدمة" tone="blue" />
        <Stat label="مرتبط بملف تكلفة" value={withProfileCount} hint="جاهز لحساب التكلفة الفعلية" tone="amber" />
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative min-w-[240px] max-w-sm flex-1">
              <Search className="pointer-events-none absolute right-3 top-2.5 size-4 text-slate-400" />
              <input
                className="input pr-9"
                placeholder="بحث بالاسم أو الكود الوظيفي..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="input w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">جميع الحالات</option>
              {opts(EMPLOYEE_STATUS).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} />
        ) : empList.length === 0 ? (
          <EmptyState
            text="لم يتم إضافة أي موظف حتى الآن. اضغط على زر تعيين موظف جديد لإدخال بيانات الكادر وراتبه وربطه بالمشاريع."
            action={
              <button className="btn-primary" onClick={() => setCreating(true)}>
                <UserPlus className="size-4" /> تعيين موظف جديد
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-24">الرقم</th>
                  <th>الاسم</th>
                  <th>القسم</th>
                  <th>المسمى الوظيفي</th>
                  <th>تاريخ التعيين</th>
                  <th>الراتب الأساسي</th>
                  <th>سعر الفوترة</th>
                  <th>ملف التكلفة</th>
                  <th>الحالة</th>
                  <th className="w-32 text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {empList.map((e: any) => {
                  const empName = e.fullNameAr || e.full_name_ar || e.fullNameEn || e.code || 'موظف';
                  return (
                    <tr
                      key={e.id}
                      className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                      onClick={() => nav(`/hr/employees/${e.id}`)}
                    >
                      <td className="num text-start font-mono font-bold text-slate-800 dark:text-slate-200">
                        {e.code}
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-indigo-600 text-xs font-bold text-white shadow-2xs">
                            {empName.trim().slice(0, 1) || 'م'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{empName}</div>
                            {e.fullNameEn && <div className="text-[11px] font-mono text-slate-400">{e.fullNameEn}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {e.departmentName ? (
                          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {e.departmentName}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {e.positionTitle ?? '—'}
                        </span>
                      </td>
                      <td className="text-xs font-mono">{date(e.hireDate || e.hire_date)}</td>
                      <td className="num font-bold text-slate-900 dark:text-white">
                        {e.basicSalary !== undefined ? (e.basicSalary ? `${money(e.basicSalary)} ${e.salaryCurrency || 'SAR'}` : '—') : '•••'}
                      </td>
                      <td className="num text-xs font-semibold text-brand-700 dark:text-brand-300">
                        {e.defaultBillingRate ? `${money(e.defaultBillingRate)} ${e.salaryCurrency || 'SAR'}` : '—'}
                      </td>
                      <td>
                        {e.costProfileName ? (
                          <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                            {e.costProfileName}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-amber-600">غير محدد</span>
                        )}
                      </td>
                      <td><StatusBadge s={e.status} /></td>
                      <td onClick={(evt) => evt.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40"
                            title="معاينة الملف والتخصيص"
                            onClick={() => nav(`/hr/employees/${e.id}`)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40"
                            title="تعديل بيانات الموظف"
                            onClick={() => nav(`/hr/employees/${e.id}`)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            className="btn-ghost h-7 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                            title="إسناد الموظف إلى مشروع"
                            onClick={() => setAssignModalEmp(e)}
                          >
                            <FolderPlus className="size-3.5" />
                          </button>
                          <button
                            className="btn-ghost h-7 px-2 text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                            title="حذف الموظف"
                            onClick={() => {
                              if (confirm(`هل أنت متأكد من حذف سجل الموظف ${empName}؟ سيتم حذف بياناته وسجلاته بالكامل.`)) {
                                api.del(`/employees/${e.id}`)
                                  .then(() => {
                                    toast.success('تم حذف الموظف بنجاح');
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {list.data?.meta && (
          <div className="border-t border-slate-200 p-3 dark:border-slate-800">
            <Pager
              page={page}
              pageSize={list.data.meta.pageSize}
              total={list.data.meta.total}
              onPage={setPage}
            />
          </div>
        )}
      </div>

      {/* Creation Drawer */}
      <Drawer
        open={creating}
        onClose={() => setCreating(false)}
        title="تعيين موظف جديد — دورة العمل المتكاملة"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreating(false)}>
              إلغاء
            </button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Spinner />} حفظ واعتماد التعيين
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50/60 p-3 text-xs text-brand-900 dark:bg-brand-950/40 dark:text-brand-200">
            <strong>دورة العمل المترابطة (Business Process):</strong> يتم إنشاء بيانات الموظف، تسكينه الوظيفي، راتبه وبدلاته، ملف تكلفته، وربطه الأولي بالمشروع في عملية تشغيلية موحدة لضمان احتساب التكلفة والإيراد بدقة.
          </div>
          <EntityForm fields={hireFields} value={form} onChange={setForm} errors={errors} />
        </div>
      </Drawer>

      {/* Direct Assignment Modal from Table */}
      {assignModalEmp && (
        <AssignProjectModal
          employee={assignModalEmp}
          open={!!assignModalEmp}
          onClose={() => setAssignModalEmp(null)}
          onSuccess={() => {
            setAssignModalEmp(null);
            qc.invalidateQueries({ queryKey: ['/employees'] });
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ employee detail
type Tab = 'info' | 'placement' | 'salary' | 'assignments' | 'profitability' | 'cost' | 'custody' | 'docs' | 'preview' | 'status';
const TABS: Array<[Tab, string]> = [
  ['info', 'البيانات الأساسية'],
  ['placement', 'التنسيب الوظيفي'],
  ['salary', 'الراتب والبدلات'],
  ['assignments', 'المشاريع والتخصيص'],
  ['profitability', 'تحليل الربحية والأداء'],
  ['cost', 'ملف التكلفة والاستثناءات'],
  ['custody', 'العهد والأصول'],
  ['docs', 'المستندات والعقود'],
  ['preview', 'محاكاة التكلفة الشاملة'],
  ['status', 'الحالة وسجل الخدمة'],
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
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('info');
  const [modal, setModal] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const key = ['employee', id];
  const emp = useQuery({ queryKey: key, queryFn: () => api.get<any>(`/employees/${id}`) });

  const refresh = (data?: any) => {
    if (data) qc.setQueryData(key, data);
    else qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['/employees'] });
    qc.invalidateQueries({ queryKey: ['assignments', 'employee', id] });
  };

  const act = useMutation({
    mutationFn: (f: () => Promise<any>) => f(),
    onSuccess: (d) => {
      toast.success('تم الحفظ بنجاح');
      refresh(d && typeof d === 'object' && d.id ? d : undefined);
    },
    onError: (e) => toast.error(e),
  });

  const removeVersion = (kind: string, vid: string) => {
    if (confirm('حذف آخر إصدار؟ (تصحيح إدخال خاطئ)')) {
      act.mutate(() => api.del(`/employees/${id}/${kind}/${vid}`));
    }
  };

  const handleDeleteEmployee = () => {
    const e = emp.data;
    const empName = e?.fullNameAr || e?.full_name_ar || e?.code || 'هذا الموظف';
    if (confirm(`هل أنت متأكد من حذف سجل الموظف ${empName}؟ سيتم حذف بياناته وإلغاء ارتباطاته بالمشاريع بشكل نهائي.`)) {
      api.del(`/employees/${id}`)
        .then(() => {
          toast.success('تم حذف الموظف بنجاح');
          qc.invalidateQueries({ queryKey: ['/employees'] });
          nav('/hr/employees');
        })
        .catch((err) => toast.error(err));
    }
  };

  if (emp.isLoading) return <Loading />;
  if (emp.error || !emp.data) return <ErrorState error={emp.error} />;

  const e = emp.data;
  const empTitle = e.fullNameAr || e.full_name_ar || e.fullNameEn || e.nameAr || (e.code ? `موظف ${e.code}` : 'ملف الموظف');
  const empCode = e.code || '—';
  const empHireDate = e.hireDate || e.hire_date;
  const empTermDate = e.terminationDate || e.termination_date;

  const placements: any[] = Array.isArray(e?.placements) ? e.placements : [];
  const compensations: any[] | null = Array.isArray(e?.compensations)
    ? e.compensations
    : e?.compensations === null
    ? null
    : [];
  const costProfiles: any[] = Array.isArray(e?.costProfiles) ? e.costProfiles : [];
  const overrides: any[] = Array.isArray(e?.overrides) ? e.overrides : [];
  const custodies: any[] = Array.isArray(e?.custodies) ? e.custodies : [];
  const statusHistory: any[] = Array.isArray(e?.statusHistory) ? e.statusHistory : [];
  const documents: any[] = Array.isArray(e?.documents) ? e.documents : [];

  const submit = (path: string) => async (body: Record<string, any>) => {
    const res = await api.post(`/employees/${id}${path}`, body);
    refresh(res);
    return res;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={empTitle}
        subtitle={`الرقم الوظيفي: ${empCode} — تاريخ التعيين: ${empHireDate ? date(empHireDate) : 'غير محدد'}${empTermDate ? ` — انتهاء الخدمة: ${date(empTermDate)}` : ''}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge s={e.status} />
            <button
              className="btn-primary"
              onClick={() => setEditModalOpen(true)}
              title="تعديل بيانات الموظف الأساسية"
            >
              <Pencil className="size-4" /> تعديل الموظف
            </button>
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setAssignModalOpen(true)}
              title="ربط الموظف بمشروع وتحديد نسبة التخصيص وسعر الفوترة"
            >
              <FolderPlus className="size-4" /> ربط بمشروع
            </button>
            <button
              className="btn-secondary text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
              onClick={handleDeleteEmployee}
              title="حذف الموظف"
            >
              <Trash2 className="size-4" /> حذف
            </button>
            <button
              className="btn-secondary"
              onClick={() => window.print()}
              title="طباعة بطاقة الموظف"
            >
              <Printer className="size-4" /> طباعة
            </button>
            <Link to="/hr/employees" className="btn-secondary">
              <ArrowRight className="size-4" /> الموظفون
            </Link>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === k
                ? 'border-brand-600 font-bold text-brand-700 dark:text-brand-100'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {tab === 'info' && <InfoTab e={e} onSaved={refresh} />}

      {tab === 'placement' && (
        <Section
          title="سجل التنسيب (القسم / الفرع / الوظيفة / مركز التكلفة)"
          action={
            <button className="btn-primary h-8" onClick={() => setModal('placement')}>
              <Plus className="size-4" /> تغيير التنسيب
            </button>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>الفترة</th>
                <th>القسم</th>
                <th>الفرع</th>
                <th>الوظيفة</th>
                <th>مركز التكلفة</th>
                <th>المدير</th>
                <th>السبب</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {placements.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-500">لا يوجد تنسيب مسجل</td>
                </tr>
              )}
              {placements.map((p: any, i: number) => (
                <tr key={p.id}>
                  <td><Effective from={p.effectiveFrom} to={p.effectiveTo} /></td>
                  <td>{p.departmentName ?? '—'}</td>
                  <td>{p.branchName ?? '—'}</td>
                  <td>{p.positionTitle ?? '—'}</td>
                  <td>{p.costCenterName ?? '—'}</td>
                  <td>{p.managerName ?? '—'}</td>
                  <td className="text-xs">{p.changeReason}</td>
                  <td>
                    {i === 0 && placements.length > 1 && (
                      <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => removeVersion('placements', p.id)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 'salary' && (
        compensations === null ? (
          <EmptyState text="ليست لديك صلاحية عرض الرواتب." />
        ) : (
          <Section
            title="سجل الراتب والبدلات"
            action={
              <button className="btn-primary h-8" onClick={() => setModal('salary')}>
                <Plus className="size-4" /> تعديل الراتب
              </button>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>الفترة</th>
                  <th>الأساسي</th>
                  <th>التأميني</th>
                  <th>السبب</th>
                  <th>بواسطة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {compensations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-500">لم يُسجل راتب بعد</td>
                  </tr>
                )}
                {compensations.map((c: any, i: number) => (
                  <tr key={c.id}>
                    <td><Effective from={c.effectiveFrom} to={c.effectiveTo} /></td>
                    <td className="num font-bold text-slate-900 dark:text-white">
                      {money(c.basicSalary)} {c.salaryCurrency || 'SAR'}
                    </td>
                    <td className="num">
                      {money(c.insuranceSalary)} {c.insuranceCurrency || c.salaryCurrency || 'SAR'}
                    </td>
                    <td className="text-xs">{c.changeReason}</td>
                    <td className="text-xs">{c.createdBy || 'المدير التنفيذي'} — {dateTime(c.createdAt)}</td>
                    <td>
                      {i === 0 && compensations.length > 1 && (
                        <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => removeVersion('compensations', c.id)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
              التعديل يُنشئ إصدارًا جديدًا يبدأ من تاريخ السريان، ويُغلق الإصدار السابق تلقائيًا للحفاظ على السجلات التاريخية المالية وفق Business Process.
            </p>
          </Section>
        )
      )}

      {/* NEW: Assignments & Projects Tab */}
      {tab === 'assignments' && (
        <EmployeeAssignmentsTab
          employee={e}
          onAssignNew={() => setAssignModalOpen(true)}
          onRefresh={refresh}
        />
      )}

      {/* NEW: Profitability Tab */}
      {tab === 'profitability' && (
        <EmployeeProfitabilityTab employee={e} />
      )}

      {tab === 'cost' && (
        <div className="space-y-4">
          <Section
            title="ملف التكلفة (Cost Profile)"
            action={
              <div className="flex gap-2">
                <button className="btn-secondary h-8" onClick={() => setModal('endProfile')}>
                  <Square className="size-3.5" /> إنهاء
                </button>
                <button className="btn-primary h-8" onClick={() => setModal('profile')}>
                  <Plus className="size-4" /> إسناد ملف
                </button>
              </div>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>الفترة</th>
                  <th>الملف</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {costProfiles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="text-center text-amber-600">
                      لا يوجد ملف تكلفة؛ لن تُحسب مكونات التكلفة لهذا الموظف.
                    </td>
                  </tr>
                )}
                {costProfiles.map((p: any, i: number) => (
                  <tr key={p.id}>
                    <td><Effective from={p.effectiveFrom} to={p.effectiveTo} /></td>
                    <td>
                      <Link className="text-brand-600 hover:underline" to={`/cost/profiles/${p.profileId}`}>
                        {p.profileCode} — {p.profileName}
                      </Link>
                    </td>
                    <td>
                      {i === 0 && (
                        <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => removeVersion('cost-profiles', p.id)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section
            title="استثناءات المكونات لهذا الموظف"
            action={
              <button className="btn-primary h-8" onClick={() => setModal('override')}>
                <Plus className="size-4" /> إضافة استثناء
              </button>
            }
          >
            <table className="table">
              <thead>
                <tr>
                  <th>المكون</th>
                  <th>الفترة</th>
                  <th>النسبة</th>
                  <th>المبلغ</th>
                  <th>مستبعد</th>
                  <th>السبب</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overrides.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-500">
                      لا توجد استثناءات — تُطبق قيم ملف التكلفة القياسي كما هي.
                    </td>
                  </tr>
                )}
                {overrides.map((o: any) => (
                  <tr key={o.id}>
                    <td>{o.componentCode} — {o.componentName}</td>
                    <td><Effective from={o.effectiveFrom} to={o.effectiveTo} /></td>
                    <td className="num">{o.ratePct ? `${o.ratePct}%` : '—'}</td>
                    <td className="num">{o.amount ? `${money(o.amount)} ${o.currencyCode}` : '—'}</td>
                    <td>{o.isExcluded ? <Badge color="red">مستبعد</Badge> : '—'}</td>
                    <td className="text-xs">{o.reason}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {!o.effectiveTo && (
                          <button
                            className="btn-ghost h-7 px-2"
                            title="إنهاء"
                            onClick={() => {
                              const d = prompt('تاريخ آخر يوم للاستثناء (YYYY-MM-DD)', today());
                              if (d) act.mutate(() => api.post(`/employees/${id}/overrides/${o.id}/end`, { effectiveTo: d }));
                            }}
                          >
                            <Square className="size-3.5" />
                          </button>
                        )}
                        <button
                          className="btn-ghost h-7 px-2 text-rose-600"
                          onClick={() => confirm('حذف الاستثناء؟') && act.mutate(() => api.del(`/employees/${id}/overrides/${o.id}`))}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
        <Section
          title="العهد (الأصول في عهدة الموظف)"
          action={<Link to="/assets/list" className="btn-secondary h-8">إدارة الأصول</Link>}
        >
          <table className="table">
            <thead>
              <tr>
                <th>رقم الأصل</th>
                <th>الأصل</th>
                <th>الفترة</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {custodies.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500">لا توجد عهد مسندة للموظف.</td>
                </tr>
              )}
              {custodies.map((c: any) => (
                <tr key={c.id}>
                  <td className="num text-start">
                    <Link className="text-brand-600 hover:underline" to={`/assets/list/${c.assetId}`}>
                      {c.assetNo}
                    </Link>
                  </td>
                  <td>{c.assetName}</td>
                  <td><Effective from={c.effectiveFrom} to={c.effectiveTo} /></td>
                  <td className="text-xs">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === 'docs' && <DocumentsTab employeeId={id!} docs={documents} onChange={() => refresh()} />}
      {tab === 'preview' && <CostPreview employeeId={id!} />}

      {tab === 'status' && (
        <Section
          title="سجل الحالة"
          action={
            <button className="btn-primary h-8" onClick={() => setModal('status')}>
              تغيير الحالة
            </button>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>من</th>
                <th>إلى</th>
                <th>تاريخ السريان</th>
                <th>السبب</th>
                <th>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {statusHistory.map((h: any) => (
                <tr key={h.id}>
                  <td>{h.oldStatus ? <StatusBadge s={h.oldStatus} /> : '—'}</td>
                  <td><StatusBadge s={h.newStatus} /></td>
                  <td>{date(h.effectiveDate)}</td>
                  <td className="text-xs">{h.reason === 'HIRED' ? 'تعيين' : h.reason}</td>
                  <td className="text-xs">{h.changedBy ?? '—'} — {dateTime(h.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Modals */}
      <FormModal
        open={modal === 'placement'}
        title="تغيير التنسيب الوظيفي"
        onClose={() => setModal(null)}
        onSubmit={submit('/placements')}
        initial={{
          ...Object.fromEntries(placementFields.map((f) => [f.name, (placements[0] as any)?.[f.name] ?? ''])),
          effectiveFrom: today(),
        }}
        fields={[
          { name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true },
          ...placementFields,
          { name: 'reason', label: 'السبب', type: 'textarea', required: true },
        ]}
      />

      <FormModal
        open={modal === 'salary'}
        title="تعديل الراتب والأجر التأميني"
        onClose={() => setModal(null)}
        onSubmit={submit('/compensations')}
        initial={{
          ...(compensations?.[0]
            ? {
                basicSalary: compensations[0].basicSalary,
                salaryCurrency: compensations[0].salaryCurrency,
                insuranceSalary: compensations[0].insuranceSalary,
                insuranceCurrency: compensations[0].insuranceCurrency,
              }
            : {}),
          effectiveFrom: today(),
        }}
        fields={[
          { name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true },
          ...salaryFields,
          { name: 'reason', label: 'السبب / المبرر', type: 'textarea', required: true },
        ]}
      />

      <FormModal
        open={modal === 'profile'}
        title="إسناد ملف تكلفة"
        onClose={() => setModal(null)}
        onSubmit={submit('/cost-profiles')}
        initial={{ effectiveFrom: today() }}
        fields={[
          { name: 'profileId', label: 'ملف التكلفة', type: 'ref', ref: REF.profile, required: true },
          { name: 'effectiveFrom', label: 'تاريخ السريان', type: 'date', required: true },
        ]}
      />

      <FormModal
        open={modal === 'endProfile'}
        title="إنهاء ملف التكلفة الحالي"
        onClose={() => setModal(null)}
        onSubmit={submit('/cost-profiles/end')}
        initial={{ effectiveTo: today() }}
        fields={[{ name: 'effectiveTo', label: 'آخر يوم', type: 'date', required: true }]}
      />

      <FormModal
        open={modal === 'override'}
        title="استثناء مكون لهذا الموظف"
        onClose={() => setModal(null)}
        onSubmit={submit('/overrides')}
        initial={{ effectiveFrom: today() }}
        note="الاستثناء يغيّر نسبة أو مبلغ المكون لهذا الموظف فقط خلال الفترة المحددة، أو يستبعده تمامًا. إن لم يكن المكون ضمن ملف التكلفة فسيُضاف له."
        fields={[
          { name: 'componentId', label: 'المكون', type: 'ref', ref: REF.component, required: true },
          { name: 'isExcluded', label: 'استبعاد المكون', type: 'bool', default: false },
          { name: 'ratePct', label: 'النسبة %', type: 'decimal' },
          { name: 'amount', label: 'المبلغ الثابت', type: 'decimal' },
          { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency },
          { name: 'effectiveFrom', label: 'من تاريخ', type: 'date', required: true },
          { name: 'reason', label: 'السبب', type: 'text', required: true },
        ]}
      />

      <FormModal
        open={modal === 'status'}
        title="تغيير حالة الموظف"
        onClose={() => setModal(null)}
        onSubmit={submit('/status')}
        initial={{ effectiveDate: today(), newStatus: 'ACTIVE' }}
        fields={[
          { name: 'newStatus', label: 'الحالة الجديدة', type: 'select', options: opts(EMPLOYEE_STATUS), required: true },
          { name: 'effectiveDate', label: 'تاريخ السريان', type: 'date', required: true },
          { name: 'reason', label: 'السبب', type: 'textarea', required: true },
        ]}
      />

      {/* Edit Employee In-Place Modal */}
      {editModalOpen && (
        <EditEmployeeModal
          employee={e}
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => {
            setEditModalOpen(false);
            refresh();
          }}
        />
      )}

      {/* Assign Project Modal */}
      {assignModalOpen && (
        <AssignProjectModal
          employee={e}
          open={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={() => {
            setAssignModalOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Employee Assignments Tab
function EmployeeAssignmentsTab({
  employee,
  onAssignNew,
  onRefresh,
}: {
  employee: any;
  onAssignNew: () => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const empId = employee.id;

  const asgQuery = useQuery({
    queryKey: ['assignments', 'employee', empId],
    queryFn: () => api.get<any>('/assignments', { employeeId: empId }),
  });

  const rawRows = asgQuery.data?.rows || asgQuery.data?.data || asgQuery.data || [];
  const assignments: any[] = Array.isArray(rawRows) ? rawRows : [];

  // Active assignments calculations
  const t = today();
  const activeAssignments = assignments.filter((a) => !a.effectiveTo || a.effectiveTo >= t);

  let totalAllocPct = 0;
  let totalRevenue = 0;

  for (const a of activeAssignments) {
    totalAllocPct += Number(a.allocationPct || 0);
    const rate = Number(a.billableRate || employee.defaultBillingRate || 1500);
    const days = Number(a.allocatedDays || 22);
    if (a.billingBasis === 'DAILY') {
      totalRevenue += days * rate;
    } else if (a.billingBasis === 'MONTHLY') {
      totalRevenue += (Number(a.allocationPct || 100) / 100) * rate;
    } else {
      totalRevenue += days * 8 * rate;
    }
  }

  const unutilizedPct = Math.max(0, 100 - totalAllocPct);
  const overAllocPct = Math.max(0, totalAllocPct - 100);

  // Employee direct cost from salary
  const basicSalary = Number(employee.basicSalary || employee.compensations?.[0]?.basicSalary || 0);
  const unutilizedCost = (unutilizedPct / 100) * basicSalary;

  const handleDeleteAssignment = async (asgId: string) => {
    if (confirm('هل أنت متأكد من إلغاء إسناد الموظف لهذا المشروع؟')) {
      try {
        await api.del(`/assignments/${asgId}`);
        toast.success('تم حذف الإسناد بنجاح');
        onRefresh();
      } catch (err: any) {
        toast.error(err);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="إجمالي نسبة التخصيص"
          value={`${totalAllocPct.toFixed(1)}%`}
          hint={overAllocPct > 0 ? `تخصيص زائد بنسبة ${overAllocPct.toFixed(1)}%` : 'من إجمالي وقت العمل'}
          tone={overAllocPct > 0 ? 'red' : totalAllocPct >= 80 ? 'green' : 'blue'}
        />
        <Stat
          label="الوقت غير المستغل (Bench)"
          value={`${unutilizedPct.toFixed(1)}%`}
          hint="طاقة غير مخصصة لمشاريع"
          tone={unutilizedPct > 0 ? 'amber' : 'green'}
        />
        <Stat
          label="تكلفة الوقت غير المستغل"
          value={`${money(unutilizedCost)} ${employee.salaryCurrency || 'SAR'}`}
          hint="تكلفة مباشرة تتحملها الشركة"
          tone={unutilizedCost > 0 ? 'red' : 'green'}
        />
        <Stat
          label="الإيراد الشهري المقدر"
          value={`${money(totalRevenue)} ${employee.salaryCurrency || 'SAR'}`}
          hint="من عقود بيع الخدمة"
          tone="green"
        />
      </div>

      {/* Warnings & Notes */}
      {overAllocPct > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-5 shrink-0 text-amber-600" />
          <div>
            <strong>تنبيه التخصيص الزائد ({overAllocPct.toFixed(1)}%):</strong> الموظف مخصص بأكثر من 100% على المشاريع. وفق سياسة دورة العمل في الشركة، يتم تطبيع التوزيع المحاسبي للتكلفة على المشاريع لمنع تكرار تحميل التكلفة، مع قيد كامل إيراد الفوترة لكل مشروع.
          </div>
        </div>
      )}

      {unutilizedPct > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <CheckCircle2 className="size-4 shrink-0 text-sky-600" />
          <div>
            الموظف لديه <strong>{unutilizedPct.toFixed(1)}% وقت متاح (Bench)</strong> بتكلفة {money(unutilizedCost)} {employee.salaryCurrency || 'SAR'} شهرياً جاهزة للإسناد إلى مشاريع جديدة لتعظيم الربحية.
          </div>
        </div>
      )}

      {/* Section Table */}
      <Section
        title="المشاريع المسند إليها الموظف"
        action={
          <button className="btn-primary h-8" onClick={onAssignNew}>
            <FolderPlus className="size-4" /> إسناد لمشروع جديد
          </button>
        }
      >
        {asgQuery.isLoading ? (
          <Loading />
        ) : assignments.length === 0 ? (
          <EmptyState
            text="الموظف متواجد بالكامل على البنش (Bench) بنسبة 100% وتتحمل الشركة تكلفته دون إيراد مقابل. اضغط على زر إسناد لمشروع لربطه بمشروع وتحديد سعر الفوترة."
            action={
              <button className="btn-primary" onClick={onAssignNew}>
                <FolderPlus className="size-4" /> إسناد الموظف لمشروع
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>المشروع والعميل</th>
                  <th>أساس التوزيع</th>
                  <th>نسبة التخصيص</th>
                  <th>أيام العمل</th>
                  <th>سعر الفوترة (Rate)</th>
                  <th>الإيراد الشهري</th>
                  <th>التكلفة المحملة</th>
                  <th>الهامش %</th>
                  <th>فترة التكليف</th>
                  <th className="w-20 text-end">حذف</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a: any) => {
                  const rate = Number(a.billableRate || employee.defaultBillingRate || 1500);
                  const days = Number(a.allocatedDays || 22);
                  const allocPct = Number(a.allocationPct || 100);
                  let lineRev = 0;
                  if (a.billingBasis === 'DAILY') lineRev = days * rate;
                  else if (a.billingBasis === 'MONTHLY') lineRev = (allocPct / 100) * rate;
                  else lineRev = days * 8 * rate;

                  const lineCost = (allocPct / 100) * basicSalary;
                  const lineMargin = lineRev > 0 ? (((lineRev - lineCost) / lineRev) * 100).toFixed(1) : '0';

                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {a.projectName || a.projectCode || 'مشروع'}
                        </div>
                        <div className="text-xs text-slate-500">{a.clientName || 'عميل'}</div>
                      </td>
                      <td>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {a.allocationBasis === 'DAYS' ? 'أيام عمل فعلية' : 'نسبة مئوية %'}
                        </span>
                      </td>
                      <td className="num font-bold text-brand-700 dark:text-brand-300">
                        {allocPct}%
                      </td>
                      <td className="num">{days} يوم</td>
                      <td className="num font-semibold">
                        {money(rate)} {a.billingCurrency || 'SAR'}
                        <span className="text-[10px] text-slate-400">/{a.billingBasis === 'DAILY' ? 'يوم' : a.billingBasis === 'MONTHLY' ? 'شهر' : 'ساعة'}</span>
                      </td>
                      <td className="num font-bold text-emerald-600">
                        {money(lineRev)} SAR
                      </td>
                      <td className="num text-slate-600 dark:text-slate-400">
                        {money(lineCost)} SAR
                      </td>
                      <td className="num font-semibold text-slate-900 dark:text-white">
                        {lineMargin}%
                      </td>
                      <td className="text-xs font-mono">
                        <Effective from={a.effectiveFrom || a.startDate} to={a.effectiveTo || a.endDate} />
                      </td>
                      <td className="text-end">
                        <button
                          className="btn-ghost h-7 px-2 text-rose-600 hover:bg-rose-50"
                          title="إلغاء الإسناد"
                          onClick={() => handleDeleteAssignment(a.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Employee Profitability Tab
function EmployeeProfitabilityTab({ employee }: { employee: any }) {
  const empId = employee.id;
  const asgQuery = useQuery({
    queryKey: ['assignments', 'employee', empId],
    queryFn: () => api.get<any>('/assignments', { employeeId: empId }),
  });

  const rawRows = asgQuery.data?.rows || asgQuery.data?.data || asgQuery.data || [];
  const assignments: any[] = Array.isArray(rawRows) ? rawRows : [];

  const basicSalary = Number(employee.basicSalary || employee.compensations?.[0]?.basicSalary || 0);
  const insuranceSalary = Number(employee.insuranceSalary || employee.compensations?.[0]?.insuranceSalary || 0);

  // Direct Cost = Basic Salary + GOSI/Company Insurance
  const directCost = basicSalary + insuranceSalary * 0.1185; // approx GOSI or defined cost
  const overhead = directCost * 0.1; // 10% overhead share
  const totalCost = directCost + overhead;

  // Active revenue
  const t = today();
  const activeAssignments = assignments.filter((a) => !a.effectiveTo || a.effectiveTo >= t);

  let totalAllocPct = 0;
  let totalRevenue = 0;

  for (const a of activeAssignments) {
    totalAllocPct += Number(a.allocationPct || 0);
    const rate = Number(a.billableRate || employee.defaultBillingRate || 1500);
    const days = Number(a.allocatedDays || 22);
    if (a.billingBasis === 'DAILY') {
      totalRevenue += days * rate;
    } else if (a.billingBasis === 'MONTHLY') {
      totalRevenue += (Number(a.allocationPct || 100) / 100) * rate;
    } else {
      totalRevenue += days * 8 * rate;
    }
  }

  const unutilizedPct = Math.max(0, 100 - totalAllocPct);
  const unutilizedCost = (unutilizedPct / 100) * directCost;
  const netProfit = totalRevenue - totalCost;
  const realizedMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const targetMarginPct = Number(employee.requiredMarginPct || 25);
  const delta = realizedMarginPct - targetMarginPct;

  return (
    <div className="space-y-4">
      {/* Financial Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="إجمالي الإيرادات" value={`${money(totalRevenue)} SAR`} hint="عقود بيع الخدمة" tone="green" />
        <Stat label="التكلفة المباشرة" value={`${money(directCost)} SAR`} hint="الراتب + التأمينات" tone="blue" />
        <Stat label="تكلفة البنش (غير المستغلة)" value={`${money(unutilizedCost)} SAR`} hint={`${unutilizedPct.toFixed(1)}% طاقة مهدورة`} tone={unutilizedCost > 0 ? 'amber' : 'green'} />
        <Stat label="المصروفات الإدارية (10%)" value={`${money(overhead)} SAR`} hint="Overhead محمل" />
        <Stat label="صافي الربح المحقق" value={`${money(netProfit)} SAR`} hint={netProfit >= 0 ? 'ربحية موجبة' : 'خسارة تشغيلية'} tone={netProfit >= 0 ? 'green' : 'red'} />
        <Stat label="الهامش المحقق مقابل المستهدف" value={`${realizedMarginPct.toFixed(1)}% / ${targetMarginPct}%`} hint={`الفارق: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`} tone={delta >= 0 ? 'green' : 'red'} />
      </div>

      {/* Profitability Breakdown Table */}
      <Section title="توزيع التكاليف والإيرادات والربحية حسب المشاريع (Business Process)">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>بند التكليف / المشروع</th>
                <th>نسبة التخصيص</th>
                <th>الإيراد المحقق</th>
                <th>التكلفة المباشرة المحملة</th>
                <th>المصروفات الإدارية</th>
                <th>التكلفة الإجمالية</th>
                <th>صافي الربح</th>
                <th>هامش الربح %</th>
              </tr>
            </thead>
            <tbody>
              {activeAssignments.map((a: any) => {
                const allocPct = Number(a.allocationPct || 100);
                const rate = Number(a.billableRate || employee.defaultBillingRate || 1500);
                const days = Number(a.allocatedDays || 22);
                let lineRev = 0;
                if (a.billingBasis === 'DAILY') lineRev = days * rate;
                else if (a.billingBasis === 'MONTHLY') lineRev = (allocPct / 100) * rate;
                else lineRev = days * 8 * rate;

                const lineDirectCost = (allocPct / 100) * directCost;
                const lineOverhead = lineDirectCost * 0.1;
                const lineTotalCost = lineDirectCost + lineOverhead;
                const lineProfit = lineRev - lineTotalCost;
                const lineMargin = lineRev > 0 ? ((lineProfit / lineRev) * 100).toFixed(1) : '0';

                return (
                  <tr key={a.id}>
                    <td>
                      <div className="font-bold text-slate-900 dark:text-white">{a.projectName || 'مشروع'}</div>
                      <div className="text-xs text-slate-500">{a.clientName || 'العميل'}</div>
                    </td>
                    <td className="num font-bold">{allocPct}%</td>
                    <td className="num font-bold text-emerald-600">{money(lineRev)} SAR</td>
                    <td className="num">{money(lineDirectCost)} SAR</td>
                    <td className="num">{money(lineOverhead)} SAR</td>
                    <td className="num font-semibold">{money(lineTotalCost)} SAR</td>
                    <td className={`num font-bold ${lineProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {money(lineProfit)} SAR
                    </td>
                    <td className="num font-bold">{lineMargin}%</td>
                  </tr>
                );
              })}

              {/* Unutilized Row */}
              {unutilizedPct > 0 && (
                <tr className="bg-amber-50/50 dark:bg-amber-950/20">
                  <td>
                    <div className="font-bold text-amber-900 dark:text-amber-200">
                      الوقت غير المستغل / البنش (Unutilized Bench)
                    </div>
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      طاقة عمل شاغرة لا تولد إيراداً
                    </div>
                  </td>
                  <td className="num font-bold text-amber-700">{unutilizedPct.toFixed(1)}%</td>
                  <td className="num font-mono text-slate-400">0.00 SAR</td>
                  <td className="num text-amber-700">{money(unutilizedCost)} SAR</td>
                  <td className="num text-slate-500">{money(unutilizedCost * 0.1)} SAR</td>
                  <td className="num font-semibold text-amber-800">{money(unutilizedCost * 1.1)} SAR</td>
                  <td className="num font-bold text-rose-600">-{money(unutilizedCost * 1.1)} SAR</td>
                  <td className="num font-mono text-rose-600">-100.0%</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-bold dark:border-slate-700">
                <td>الإجمالي الكلي للموظف</td>
                <td className="num">{totalAllocPct.toFixed(1)}%</td>
                <td className="num text-emerald-700">{money(totalRevenue)} SAR</td>
                <td className="num">{money(directCost)} SAR</td>
                <td className="num">{money(overhead)} SAR</td>
                <td className="num">{money(totalCost)} SAR</td>
                <td className={`num ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {money(netProfit)} SAR
                </td>
                <td className="num text-brand-700">{realizedMarginPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ Quick In-Place Employee Edit Modal
function EditEmployeeModal({
  employee,
  open,
  onClose,
  onSuccess,
}: {
  employee: any;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, any>>({
    fullNameAr: employee.fullNameAr || employee.full_name_ar || '',
    fullNameEn: employee.fullNameEn || employee.full_name_en || '',
    nationalId: employee.nationalId || '',
    email: employee.email || '',
    phone: employee.phone || '',
    requiredMarginPct: employee.requiredMarginPct || '25',
    defaultBillingRate: employee.defaultBillingRate || '1500',
    defaultBillingBasis: employee.defaultBillingBasis || 'DAILY',
    bankName: employee.bankName || '',
    bankAccountNo: employee.bankAccountNo || '',
    iban: employee.iban || '',
    notes: employee.notes || '',
  });

  const save = useMutation({
    mutationFn: () => api.patch(`/employees/${employee.id}`, form),
    onSuccess: () => {
      toast.success('تم تحديث بيانات الموظف بنجاح');
      onSuccess();
    },
    onError: (err) => toast.error(err),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تعديل بيانات الموظف الأساسية"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner />} حفظ التعديلات
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="الاسم بالعربية *" className="col-span-2">
          <input
            className="input"
            value={form.fullNameAr}
            onChange={(e) => setForm({ ...form, fullNameAr: e.target.value })}
          />
        </Field>
        <Field label="الاسم بالإنجليزية">
          <input
            className="input"
            dir="ltr"
            value={form.fullNameEn}
            onChange={(e) => setForm({ ...form, fullNameEn: e.target.value })}
          />
        </Field>
        <Field label="الرقم القومي / الهوية">
          <input
            className="input"
            dir="ltr"
            value={form.nationalId}
            onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
          />
        </Field>
        <Field label="الهاتف">
          <input
            className="input"
            dir="ltr"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
        <Field label="البريد الإلكتروني">
          <input
            className="input"
            dir="ltr"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="سعر بيع الخدمة للعميل الافتراضي">
          <input
            className="input"
            type="number"
            value={form.defaultBillingRate}
            onChange={(e) => setForm({ ...form, defaultBillingRate: e.target.value })}
          />
        </Field>
        <Field label="هامش الربح المطلوب %">
          <input
            className="input"
            type="number"
            value={form.requiredMarginPct}
            onChange={(e) => setForm({ ...form, requiredMarginPct: e.target.value })}
          />
        </Field>
        <Field label="البنك">
          <input
            className="input"
            value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          />
        </Field>
        <Field label="رقم الحساب البنكي">
          <input
            className="input"
            dir="ltr"
            value={form.bankAccountNo}
            onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })}
          />
        </Field>
        <Field label="IBAN" className="col-span-2">
          <input
            className="input font-mono"
            dir="ltr"
            value={form.iban}
            onChange={(e) => setForm({ ...form, iban: e.target.value })}
          />
        </Field>
        <Field label="ملاحظات" className="col-span-2">
          <textarea
            className="input h-16 py-2"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Assign Employee to Project Modal
function AssignProjectModal({
  employee,
  open,
  onClose,
  onSuccess,
}: {
  employee: any;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const empName = employee.fullNameAr || employee.full_name_ar || employee.code || 'الموظف';
  const [form, setForm] = useState<Record<string, any>>({
    projectId: '',
    allocationBasis: 'PERCENTAGE',
    allocationPct: '100',
    allocatedDays: '22',
    workingDaysInMonth: '22',
    billableRate: employee.defaultBillingRate || '1500',
    billingBasis: employee.defaultBillingBasis || 'DAILY',
    billingCurrency: employee.salaryCurrency || 'SAR',
    startDate: today(),
    endDate: '',
    roleTitle: employee.positionTitle || 'مهندس برمجيات',
    notes: 'إسناد الموظف لتنفيذ مهام المشروع',
  });

  const projectsQuery = useQuery({
    queryKey: ['/projects', 1, '', ''],
    queryFn: () => api.get<any>('/projects', { page: 1, pageSize: 100 }),
  });

  const rawProjects = projectsQuery.data?.rows || projectsQuery.data?.data || projectsQuery.data || [];
  const projects: any[] = Array.isArray(rawProjects) ? rawProjects : [];

  const assign = useMutation({
    mutationFn: () => {
      if (!form.projectId) throw new Error('يرجى اختيار المشروع المراد ربطه بالموظف');
      const payload = {
        employeeId: employee.id,
        projectId: form.projectId,
        allocationBasis: form.allocationBasis,
        allocationPct: Number(form.allocationPct || 100),
        allocatedDays: Number(form.allocatedDays || 22),
        workingDaysInMonth: Number(form.workingDaysInMonth || 22),
        billableRate: Number(form.billableRate || 1500),
        billingBasis: form.billingBasis,
        billingCurrency: form.billingCurrency,
        startDate: form.startDate,
        endDate: form.endDate || null,
        roleTitle: form.roleTitle,
        notes: form.notes,
      };
      return api.post('/assignments', payload);
    },
    onSuccess: () => {
      toast.success(`تم ربط الموظف ${empName} بالمشروع بنجاح`);
      onSuccess();
    },
    onError: (err) => toast.error(err),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`إسناد الموظف: ${empName} إلى مشروع عمل`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button
            className="btn-primary"
            disabled={assign.isPending || !form.projectId}
            onClick={() => assign.mutate()}
          >
            {assign.isPending && <Spinner />} إسناد واعتماد التخصيص
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="المشروع المراد ربطه بالموظف *">
          <select
            className="input"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          >
            <option value="">— اختر المشروع —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.nameAr || p.name} ({p.clientName || 'عميل'})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="أساس التوزيع *">
            <select
              className="input"
              value={form.allocationBasis}
              onChange={(e) => setForm({ ...form, allocationBasis: e.target.value })}
            >
              <option value="PERCENTAGE">نسبة مئوية % (مثال: 100% أو 50%)</option>
              <option value="DAYS">أيام عمل فعلية (مثال: 22 يوم أو 10 أيام)</option>
            </select>
          </Field>

          {form.allocationBasis === 'PERCENTAGE' ? (
            <Field label="نسبة التخصيص % *">
              <input
                className="input"
                type="number"
                value={form.allocationPct}
                onChange={(e) => setForm({ ...form, allocationPct: e.target.value })}
              />
            </Field>
          ) : (
            <Field label="أيام العمل المخصصة *">
              <input
                className="input"
                type="number"
                value={form.allocatedDays}
                onChange={(e) => {
                  const d = Number(e.target.value || 0);
                  const w = Number(form.workingDaysInMonth || 22);
                  setForm({
                    ...form,
                    allocatedDays: e.target.value,
                    allocationPct: ((d / w) * 100).toFixed(1),
                  });
                }}
              />
            </Field>
          )}

          <Field label="سعر بيع الخدمة على العميل (Override)">
            <input
              className="input"
              type="number"
              value={form.billableRate}
              onChange={(e) => setForm({ ...form, billableRate: e.target.value })}
            />
          </Field>

          <Field label="أساس تسعير الخدمة">
            <select
              className="input"
              value={form.billingBasis}
              onChange={(e) => setForm({ ...form, billingBasis: e.target.value })}
            >
              <option value="DAILY">يومي (باليوم)</option>
              <option value="MONTHLY">شهري (بالشهر)</option>
              <option value="HOURLY">بالساعة</option>
            </select>
          </Field>

          <Field label="من تاريخ *">
            <input
              className="input"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </Field>

          <Field label="إلى تاريخ (اختياري)">
            <input
              className="input"
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>

          <Field label="الدور / التكليف بالمشروع" className="col-span-2">
            <input
              className="input"
              value={form.roleTitle}
              onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
            />
          </Field>

          <Field label="ملاحظات الإسناد" className="col-span-2">
            <textarea
              className="input h-14 py-2"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ InfoTab
function InfoTab({ e, onSaved }: { e: any; onSaved: (d: any) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<string, any>>(e);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => setForm(e), [e]);

  const fields = employeeFields.filter((f) => f.name !== 'code');

  const save = useMutation({
    mutationFn: () => {
      const body = cleanPayload(fields, form, true);
      for (const k of ['nationalId', 'bankAccountNo', 'iban']) {
        if (typeof body[k] === 'string' && body[k].includes('*')) delete body[k];
      }
      return api.patch<any>(`/employees/${e.id}`, { ...body, rowVersion: e.rowVersion });
    },
    onSuccess: (d) => {
      toast.success('تم حفظ بيانات الموظف بنجاح');
      onSaved(d);
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err);
    },
  });

  return (
    <div className="card p-4">
      <EntityForm fields={fields} value={form} onChange={setForm} errors={errors} editing />
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner />} حفظ البيانات
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ DocumentsTab
function DocumentsTab({
  employeeId,
  docs,
  onChange,
}: {
  employeeId: string;
  docs: any[];
  onChange: () => void;
}) {
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
      toast.success('تم رفع المستند بنجاح');
      setOpen(false);
      onChange();
    } catch (e: any) {
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
    } catch (e: any) {
      toast.error(e);
    }
  };

  const remove = async (d: any) => {
    if (!confirm('حذف المستند؟')) return;
    try {
      await api.del(`/employees/${employeeId}/documents/${d.id}`);
      onChange();
    } catch (e: any) {
      toast.error(e);
    }
  };

  const expiring = (d: any) =>
    d.expiryDate && d.expiryDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <Section
      title="المستندات"
      action={
        <button
          className="btn-primary h-8"
          onClick={() => {
            setMeta({ docType: 'CONTRACT', title: '' });
            setFile(null);
            setOpen(true);
          }}
        >
          <FileUp className="size-4" /> رفع مستند
        </button>
      }
    >
      <table className="table">
        <thead>
          <tr>
            <th>النوع</th>
            <th>العنوان</th>
            <th>الرقم</th>
            <th>الإصدار</th>
            <th>الانتهاء</th>
            <th>الملف</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-slate-500">لا توجد مستندات مرفقة</td>
            </tr>
          )}
          {docs.map((d) => (
            <tr key={d.id}>
              <td>{DOC_TYPE[d.docType] ?? d.docType}</td>
              <td>{d.title}</td>
              <td className="num text-start">{d.docNumber ?? '—'}</td>
              <td>{date(d.issueDate)}</td>
              <td>
                {d.expiryDate ? (
                  <span className={expiring(d) ? 'font-medium text-rose-600' : ''}>{date(d.expiryDate)}</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="text-xs">
                {d.fileName ? `${d.fileName} (${Math.ceil(Number(d.sizeBytes) / 1024)} KB)` : '—'}
              </td>
              <td>
                <div className="flex justify-end gap-1">
                  {d.fileName && (
                    <button className="btn-ghost h-7 px-2" onClick={() => download(d)}>
                      <Download className="size-3.5" />
                    </button>
                  )}
                  <button className="btn-ghost h-7 px-2 text-rose-600" onClick={() => remove(d)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="رفع مستند موظف"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>إلغاء</button>
            <button className="btn-primary" disabled={busy || !meta.title} onClick={upload}>
              {busy && <Spinner />} رفع
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="النوع *">
            <select
              className="input"
              value={meta.docType}
              onChange={(e) => setMeta({ ...meta, docType: e.target.value })}
            >
              {opts(DOC_TYPE).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="العنوان *">
            <input
              className="input"
              value={meta.title}
              onChange={(e) => setMeta({ ...meta, title: e.target.value })}
            />
          </Field>
          <Field label="رقم المستند">
            <input
              className="input"
              dir="ltr"
              value={meta.docNumber ?? ''}
              onChange={(e) => setMeta({ ...meta, docNumber: e.target.value })}
            />
          </Field>
          <Field label="تاريخ الإصدار">
            <input
              className="input"
              type="date"
              value={meta.issueDate ?? ''}
              onChange={(e) => setMeta({ ...meta, issueDate: e.target.value })}
            />
          </Field>
          <Field label="تاريخ الانتهاء">
            <input
              className="input"
              type="date"
              value={meta.expiryDate ?? ''}
              onChange={(e) => setMeta({ ...meta, expiryDate: e.target.value })}
            />
          </Field>
          <Field label="الملف (حتى 10 ميجابايت)">
            <input
              className="input py-1.5"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="ملاحظات" className="col-span-2">
            <textarea
              className="input h-16 py-2"
              value={meta.notes ?? ''}
              onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </Section>
  );
}

// ------------------------------------------------------------------ Cost Simulator
export function CostLinesTable({ lines, base }: { lines: any[]; base: string }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>المكون</th>
          <th>الطبيعة</th>
          <th>أيام</th>
          <th>المبلغ</th>
          <th>سعر الصرف</th>
          <th>بالعملة الأساسية ({base})</th>
          <th>الربحية</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={`${l.componentId}-${l.currencyCode}`}>
            <td>{l.code} — {l.nameAr}</td>
            <td className="text-xs">
              {l.nature === 'EMPLOYEE_DEDUCTION' || l.nature === 'TAX' ? (
                <Badge color="amber">استقطاع</Badge>
              ) : (
                <Badge color="blue">تكلفة</Badge>
              )}
            </td>
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
  const cost = useQuery({
    queryKey: ['employee-cost', employeeId, periodId],
    queryFn: () => api.get<any>(`/employees/${employeeId}/cost`, periodId ? { periodId } : {}),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <Field label="الفترة المالية">
          <PeriodSelect value={periodId} onChange={setPeriodId} />
        </Field>
        <p className="pb-2 text-xs text-slate-500">
          حساب فعلي وتفصيلي من الراتب الساري وملف التكلفة والاستثناءات والعهد والأصول، بالتناسب وفق أيام التقويم الفعلي.
        </p>
      </div>

      {cost.isLoading ? (
        <Loading />
      ) : cost.error ? (
        <ErrorState error={cost.error} />
      ) : cost.data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="أيام العمل في الفترة" value={`${cost.data.employedDays} / ${cost.data.periodDays}`} />
            <Stat label="إجمالي التكلفة" value={money(cost.data.totalCostBase)} hint={base} tone="blue" />
            <Stat label="القابلة للتوزيع على المشاريع" value={money(cost.data.distributableCostBase)} hint={base} tone="green" />
            <Stat label="استقطاعات الموظف" value={money(cost.data.totalDeductionsBase)} hint="ليست تكلفة على الشركة" />
          </div>
          <div className="card overflow-x-auto">
            {cost.data.lines?.length === 0 ? (
              <EmptyState text="لا توجد مكونات تكلفة لهذه الفترة (تأكد من سريان الراتب وملف التكلفة)." />
            ) : (
              <CostLinesTable lines={cost.data.lines || []} base={cost.data.baseCurrency || base} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
