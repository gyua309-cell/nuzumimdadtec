import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Play, Plus, Printer, Search } from 'lucide-react';
import { api, Page } from '../lib/api';
import { date as _date, downloadCsv, money, today } from '../lib/format';
import { ActiveBadge, CrudPage, FieldDef } from '../components/CrudPage';
import { FormModal, PeriodSelect, REF } from '../components/forms';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, Pager, ReasonDialog, Stat, useToast } from '../components/ui';

const CALC_METHOD: Record<string, string> = {
  FIXED: 'مبلغ ثابت',
  HOURS_RATE: 'ساعات × معدل × مضاعف',
  DAYS_RATE: 'أيام × معدل × مضاعف',
  PCT_BASIC: 'نسبة من الراتب الأساسي',
};
const VAR_CATEGORY: Record<string, { label: string; color?: string }> = {
  BONUS: { label: 'مكافأة', color: 'green' },
  OVERTIME: { label: 'إضافي', color: 'blue' },
  REWARD: { label: 'حافز', color: 'green' },
  ALLOWANCE: { label: 'بدل', color: 'blue' },
  DEDUCTION: { label: 'خصم', color: 'red' },
  ADVANCE: { label: 'سلفة', color: 'amber' },
  OTHER: { label: 'أخرى', color: 'slate' },
};
const LOAN_STATUS: Record<string, { label: string; color?: string }> = {
  ACTIVE: { label: 'نشط', color: 'blue' },
  SETTLED: { label: 'مسدد', color: 'green' },
  CANCELLED: { label: 'ملغى', color: 'red' },
};
const INST_STATUS: Record<string, { label: string; color?: string }> = {
  PENDING: { label: 'معلق', color: 'amber' },
  DEDUCTED: { label: 'مخصوم', color: 'green' },
  POSTPONED: { label: 'مؤجل', color: 'blue' },
  WAIVED: { label: 'معفو', color: 'slate' },
};
const RUN_STATUS: Record<string, { label: string; color?: string }> = {
  DRAFT: { label: 'مسودة', color: 'slate' },
  PROCESSING: { label: 'قيد المعالجة', color: 'blue' },
  POSTED: { label: 'مرحّل', color: 'green' },
  CANCELLED: { label: 'ملغى', color: 'red' },
};

const opts = (map: Record<string, any>) =>
  Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }));

// ================================================================== variable types
export const VariableTypesPage = () => (
  <CrudPage
    title="أنواع المتغيرات الشهرية"
    subtitle="تعريف أنواع المكافآت والإضافي والخصومات. كل نوع له طريقة حساب وحساب محاسبي مرتبط."
    path="/variable-types"
    entityLabel="نوع"
    columns={[
      { key: 'code', label: 'الرمز', className: 'num text-start' },
      { key: 'nameAr', label: 'الاسم' },
      { key: 'category', label: 'الفئة', render: (r) => <Badge color={VAR_CATEGORY[r.category]?.color}>{VAR_CATEGORY[r.category]?.label ?? r.category}</Badge> },
      { key: 'calcMethod', label: 'طريقة الحساب', render: (r) => CALC_METHOD[r.calcMethod] ?? r.calcMethod },
      { key: 'isTaxable', label: 'خاضع للضريبة', render: (r) => r.isTaxable ? 'نعم' : 'لا' },
      { key: 'affectsProfitability', label: 'يؤثر على الربحية', render: (r) => r.affectsProfitability ? 'نعم' : 'لا' },
      { key: 'isActive', label: 'الحالة', render: (r) => <ActiveBadge v={r.isActive} /> },
    ]}
    fields={[
      { name: 'code', label: 'الرمز', type: 'text', required: true, ltr: true, createOnly: true },
      { name: 'nameAr', label: 'الاسم بالعربية', type: 'text', required: true },
      { name: 'nameEn', label: 'الاسم بالإنجليزية', type: 'text', ltr: true },
      { name: 'category', label: 'الفئة', type: 'select', options: opts(VAR_CATEGORY), required: true },
      { name: 'calcMethod', label: 'طريقة الحساب', type: 'select', options: opts(CALC_METHOD), required: true, default: 'FIXED' },
      { name: 'defaultAmount', label: 'المبلغ الافتراضي', type: 'decimal', hint: 'للطريقة الثابتة' },
      { name: 'defaultRate', label: 'المعدل الافتراضي', type: 'decimal', hint: 'للساعات/الأيام' },
      { name: 'defaultMultiplier', label: 'المضاعف الافتراضي', type: 'decimal', hint: 'للإضافي: 1.5 أو 2', default: '1' },
      { name: 'isTaxable', label: 'خاضع للضريبة', type: 'bool', default: false },
      { name: 'affectsProfitability', label: 'يؤثر على ربحية المشاريع', type: 'bool', default: true },
      { name: 'debitAccountId', label: 'حساب المدين', type: 'ref', ref: REF.postingAccount },
      { name: 'creditAccountId', label: 'حساب الدائن', type: 'ref', ref: REF.postingAccount },
      { name: 'isActive', label: 'نشط', type: 'bool', default: true },
      { name: 'notes', label: 'ملاحظات', type: 'textarea' },
    ]}
  />
);

// ================================================================== monthly variables
export function MonthlyVariablesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [periodId, setPeriodId] = useState('');
  const [adding, setAdding] = useState(false);
  const list = useQuery({
    queryKey: ['/monthly-variables', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<Page<any>>('/monthly-variables', { periodId, pageSize: 200 }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['/monthly-variables', periodId] });

  const addFields: FieldDef[] = [
    { name: 'employeeId', label: 'الموظف', type: 'ref', ref: REF.employee, required: true },
    { name: 'variableTypeId', label: 'نوع المتغير', type: 'ref', ref: { path: '/variable-types', label: (v: any) => `${v.code} — ${v.nameAr}` }, required: true },
    { name: 'projectId', label: 'المشروع (اختياري)', type: 'ref', ref: REF.project, hint: 'إذا كان المتغير مرتبطاً بمشروع محدد' },
    { name: 'amount', label: 'المبلغ / الكمية', type: 'decimal', hint: 'مبلغ للطريقة الثابتة، أو كمية للساعات/الأيام' },
    { name: 'hours', label: 'الساعات', type: 'decimal', hint: 'للإضافي والساعات' },
    { name: 'days', label: 'الأيام', type: 'decimal', hint: 'للخصم اليومي' },
    { name: 'rate', label: 'المعدل (تجاوز)', type: 'decimal', hint: 'اتركه فارغًا لاستخدام معدل النوع الافتراضي' },
    { name: 'multiplier', label: 'المضاعف (تجاوز)', type: 'decimal', hint: 'اتركه فارغًا لاستخدام المضاعف الافتراضي' },
    { name: 'notes', label: 'ملاحظات', type: 'textarea' },
  ];

  const totalApproved = list.data?.data.filter((v: any) => v.status === 'APPROVED').reduce((s: number, v: any) => s + Number(v.computedAmount), 0) ?? 0;
  const totalDraft = list.data?.data.filter((v: any) => v.status === 'DRAFT').reduce((s: number, v: any) => s + Number(v.computedAmount), 0) ?? 0;

  const handleExport = () => {
    downloadCsv(`monthly-variables-${periodId || today()}.csv`, [
      ['الموظف', 'النوع', 'الفئة', 'المشروع', 'المبلغ المحسوب', 'الحالة'],
      ...(list.data?.data ?? []).map((v: any) => [
        v.employeeName, v.variableTypeName, VAR_CATEGORY[v.category]?.label || v.category, v.projectName || '', v.computedAmount, v.status,
      ]),
    ]);
    toast.success('تم تصدير المتغيرات الشهرية بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="المتغيرات الشهرية"
        subtitle="مكافآت وإضافي وخصومات وبدلات الشهر. يجب اعتماد المتغير قبل تضمينه في مسيّر الرواتب."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> إضافة متغير
            </button>
          </div>
        }
      />
      <div className="card p-3">
        <Field label="الفترة المالية"><PeriodSelect value={periodId} onChange={setPeriodId} className="w-64" /></Field>
      </div>
      {periodId && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="إجمالي المعتمد" value={money(totalApproved)} tone="green" />
            <Stat label="إجمالي المسودة" value={money(totalDraft)} hint="في انتظار الاعتماد" />
            <Stat label="عدد السجلات" value={String(list.data?.meta.total ?? '—')} />
          </div>
          <div className="card overflow-hidden">
            {list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} /> : list.data!.data.length === 0 ? <EmptyState text="لا توجد متغيرات لهذه الفترة." /> : (
              <table className="table">
                <thead>
                  <tr><th>الموظف</th><th>النوع</th><th>الفئة</th><th>المشروع</th><th>المبلغ المحسوب</th><th>الحالة</th><th /></tr>
                </thead>
                <tbody>
                  {list.data!.data.map((v: any) => (
                    <tr key={v.id}>
                      <td><Link to={`/hr/employees/${v.employeeId}`} className="text-brand-600 hover:underline">{v.employeeName}</Link></td>
                      <td>{v.variableTypeName}</td>
                      <td><Badge color={VAR_CATEGORY[v.category]?.color}>{VAR_CATEGORY[v.category]?.label ?? v.category}</Badge></td>
                      <td className="text-xs">{v.projectName ?? '—'}</td>
                      <td className="num font-medium">{money(v.computedAmount)}</td>
                      <td><Badge color={v.status === 'APPROVED' ? 'green' : v.status === 'POSTED' ? 'blue' : 'slate'}>{v.status === 'DRAFT' ? 'مسودة' : v.status === 'APPROVED' ? 'معتمد' : v.status === 'POSTED' ? 'مرحّل' : v.status}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {v.status === 'DRAFT' && (
                            <>
                              <button className="btn-ghost h-7 px-2 text-xs text-green-600"
                                onClick={async () => { try { await api.post(`/monthly-variables/${v.id}/approve`, {}); refresh(); toast.success('تم الاعتماد'); } catch (e) { toast.error(e); } }}>اعتماد</button>
                              <button className="btn-ghost h-7 px-2 text-xs text-rose-600"
                                onClick={async () => { if (!confirm('حذف المتغير؟')) return; try { await api.del(`/monthly-variables/${v.id}`); refresh(); toast.success('تم الحذف'); } catch (e) { toast.error(e); } }}>حذف</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
      <FormModal open={adding} wide title="إضافة متغير شهري" fields={addFields}
        initial={{ periodId }}
        onClose={() => setAdding(false)}
        onSubmit={async (b) => { await api.post('/monthly-variables', { ...b, fiscalPeriodId: periodId }); refresh(); }}
      />
    </div>
  );
}

// ================================================================== loans
export function LoansPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SETTLED' | 'CANCELLED'>('ALL');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [postponeId, setPostponeId] = useState<string | null>(null);
  const [postponePeriodId, setPostponePeriodId] = useState('');

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const list = useQuery({ queryKey: ['/loans', page, search], queryFn: () => api.get<Page<any>>('/loans', { page, pageSize: 100, q: search }) });
  const detail = useQuery({ queryKey: ['loan', selected?.id], enabled: !!selected?.id, queryFn: () => api.get<any>(`/loans/${selected.id}`) });

  const loans = list.data?.data ?? [];

  // Summary KPIs
  const totalPrincipal = loans.reduce((acc: number, l: any) => acc + Number(l.principalBase || 0), 0);
  const activeLoans = loans.filter((l: any) => l.status === 'ACTIVE');
  const settledLoans = loans.filter((l: any) => l.status === 'SETTLED');
  const activeBorrowers = new Set(activeLoans.map((l: any) => l.employeeId)).size;

  const filteredLoans = loans.filter((l: any) => {
    if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
    return true;
  });

  const handleExportCsv = () => {
    downloadCsv(`employee-loans-${today()}.csv`, [
      ['رقم القرض', 'الموظف', 'مبلغ السلفة', 'عدد الأقساط', 'تاريخ البدء', 'الحالة', 'السبب'],
      ...filteredLoans.map((l: any) => [
        l.loanNo, l.employeeName, l.principalBase, l.installments, l.startPeriodName || '', LOAN_STATUS[l.status]?.label || l.status, l.reason,
      ]),
    ]);
    toast.success('تم تصدير سجل القروض والسلف بنجاح');
  };

  const loanFields: FieldDef[] = [
    { name: 'employeeId', label: 'الموظف', type: 'ref', ref: REF.employee, required: true },
    { name: 'reason', label: 'السبب / الغرض', type: 'textarea', required: true },
    { name: 'principalAmount', label: 'مبلغ القرض / السلفة', type: 'decimal', required: true },
    { name: 'currencyCode', label: 'العملة', type: 'ref', ref: REF.currency, required: true },
    { name: 'installments', label: 'عدد الأقساط', type: 'number', required: true, default: 1 },
    { name: 'startPeriodId', label: 'فترة بداية الخصم', type: 'ref', ref: { path: '/fiscal-periods', label: (p: any) => p.name }, required: true },
    { name: 'notes', label: 'ملاحظات', type: 'textarea' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="قروض وسلف الموظفين"
        subtitle="إدارة سلف العاملين وجداول الأقساط الشهرية والتتبع الآلي للاستقطاعات من مسيّر الرواتب."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv}>
              <Download className="size-3.5" /> تصدير CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> إضافة سلفة جديدة
            </button>
          </div>
        }
      />

      {/* Top Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 bg-white border border-slate-200/90 shadow-xs rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>إجمالي السلف المصروفة</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 font-mono font-bold">{loans.length} سلفة</span>
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono mt-2">{money(totalPrincipal)}</div>
          <div className="text-[11px] text-slate-400 mt-1">إجمالي المبالغ المنصرفة تاريخياً</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/90 shadow-xs rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>السلف النشطة الجارية</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 font-mono font-bold">{activeLoans.length} سلفة</span>
          </div>
          <div className="text-2xl font-black text-amber-700 font-mono mt-2">
            {money(activeLoans.reduce((s: number, l: any) => s + Number(l.principalBase || 0), 0))}
          </div>
          <div className="text-[11px] text-amber-600 font-semibold mt-1">تُخصم دورياً عبر مسيرات الرواتب</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/90 shadow-xs rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>السلف المسددة بالكامل</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 font-mono font-bold">{settledLoans.length} سلفة</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono mt-2">
            {money(settledLoans.reduce((s: number, l: any) => s + Number(l.principalBase || 0), 0))}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">تم تحصيل أقساطها بالكامل</div>
        </div>

        <div className="card p-4 bg-white border border-slate-200/90 shadow-xs rounded-xl">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>عدد المستفيدين الحاليين</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600 font-mono font-bold">نشط</span>
          </div>
          <div className="text-2xl font-black text-purple-700 font-mono mt-2">{activeBorrowers} موظف</div>
          <div className="text-[11px] text-slate-400 mt-1">كوادر لديها أقساط جارية</div>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button
            className={`px-3 py-1.5 rounded-md transition-all ${
              statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setStatusFilter('ALL')}
          >
            كافة السلف ({loans.length})
          </button>
          <button
            className={`px-3 py-1.5 rounded-md transition-all ${
              statusFilter === 'ACTIVE' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            سلف جارية ({activeLoans.length})
          </button>
          <button
            className={`px-3 py-1.5 rounded-md transition-all ${
              statusFilter === 'SETTLED' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setStatusFilter('SETTLED')}
          >
            مسددة بالكامل ({settledLoans.length})
          </button>
        </div>

        <div className="relative w-72">
          <Search className="absolute start-2.5 top-2.5 size-4 text-slate-400" />
          <input
            className="input w-full ps-8 text-xs h-9"
            placeholder="بحث بالموظف أو رقم السلفة…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Main Grid: Loans List + Details Drawer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`card overflow-hidden bg-white border border-slate-200 rounded-xl ${selected ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {list.isLoading ? (
            <div className="p-8 text-center"><Loading /></div>
          ) : filteredLoans.length === 0 ? (
            <div className="p-8 text-center"><EmptyState text="لا توجد سلف مطابقة للبحث والتصفية." /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                      <th>رقم السلفة</th>
                      <th>الموظف</th>
                      <th>السبب / الغرض</th>
                      <th className="num">مبلغ السلفة</th>
                      <th className="num">الأقساط</th>
                      <th>الحالة</th>
                      <th className="text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLoans.map((l: any) => (
                      <tr
                        key={l.id}
                        className={`cursor-pointer transition-colors ${selected?.id === l.id ? 'bg-blue-50/70 font-semibold' : 'hover:bg-slate-50/70'}`}
                        onClick={() => setSelected(l)}
                      >
                        <td className="font-mono text-xs font-bold text-slate-800">{l.loanNo}</td>
                        <td>
                          <div className="font-bold text-slate-900">{l.employeeName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{l.employeeCode || ''}</div>
                        </td>
                        <td className="text-slate-600 max-w-xs">{l.reason}</td>
                        <td className="num font-bold font-mono text-slate-900">{money(l.principalBase)}</td>
                        <td className="num font-mono font-bold text-blue-700">{l.installments} قسط</td>
                        <td>
                          <Badge color={LOAN_STATUS[l.status]?.color}>{LOAN_STATUS[l.status]?.label ?? l.status}</Badge>
                        </td>
                        <td className="text-center">
                          <button
                            className="btn-ghost text-xs text-brand-600 px-2 py-1 font-bold"
                            onClick={(e) => { e.stopPropagation(); setSelected(l); }}
                          >
                            عرض الأقساط ←
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-2 border-t border-slate-200">
                <Pager {...list.data!.meta} onPage={setPage} />
              </div>
            </>
          )}
        </div>

        {selected && (
          <div className="card overflow-hidden bg-white border border-slate-200 rounded-xl lg:col-span-5 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{selected.loanNo}</h3>
                <div className="text-xs text-slate-500">{detail.data?.employeeName || selected.employeeName}</div>
              </div>
              <div className="flex items-center gap-2">
                {detail.data?.status === 'ACTIVE' && (
                  <button
                    className="btn-ghost text-rose-600 text-xs px-2 py-1 font-bold hover:bg-rose-50"
                    onClick={async () => {
                      const r = prompt('سبب إلغاء القرض:');
                      if (!r) return;
                      try {
                        await api.post(`/loans/${selected.id}/cancel`, { reason: r });
                        qc.invalidateQueries({ queryKey: ['/loans'] });
                        qc.invalidateQueries({ queryKey: ['loan', selected.id] });
                        toast.success('تم إلغاء القرض بنجاح');
                      } catch (e) {
                        toast.error(e);
                      }
                    }}
                  >
                    إلغاء القرض
                  </button>
                )}
                <button className="btn-secondary text-xs px-2.5 py-1" onClick={() => setSelected(null)}>✕ إغلاق</button>
              </div>
            </div>

            {detail.isLoading ? (
              <div className="p-8 text-center"><Loading /></div>
            ) : (
              <div className="p-4 space-y-4 text-xs">
                {/* Loan Overview Strip */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-500">إجمالي المبلغ:</span>
                    <strong className="font-mono text-slate-900 ms-1 text-sm">{money(detail.data?.principalBase)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">قسط الشهر:</span>
                    <strong className="font-mono text-blue-700 ms-1 text-sm">{money(detail.data?.installmentAmount)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">عدد الأقساط:</span>
                    <strong className="font-mono ms-1">{detail.data?.installments} قسط</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">الحالة:</span>{' '}
                    <Badge color={LOAN_STATUS[detail.data?.status]?.color}>
                      {LOAN_STATUS[detail.data?.status]?.label ?? detail.data?.status}
                    </Badge>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-200/80">
                    <span className="text-slate-500">السبب والغرض:</span>
                    <div className="text-slate-800 font-medium mt-0.5">{detail.data?.reason}</div>
                  </div>
                </div>

                {/* Installments Schedule */}
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">جدول الأقساط الشهرية والاستقطاع:</h4>
                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="table w-full text-xs">
                      <thead className="bg-slate-100 font-bold sticky top-0">
                        <tr>
                          <th>#</th>
                          <th>الفترة المالية</th>
                          <th className="num">مبلغ القسط</th>
                          <th>الحالة</th>
                          <th className="text-center">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.data?.installments_list?.map((inst: any) => (
                          <tr key={inst.id} className="hover:bg-slate-50">
                            <td className="num font-bold text-slate-500">{inst.installmentNo}</td>
                            <td className="font-medium text-slate-800">{inst.periodName}</td>
                            <td className="num font-mono font-bold">{money(inst.dueAmount)}</td>
                            <td>
                              <Badge color={INST_STATUS[inst.status]?.color}>{INST_STATUS[inst.status]?.label ?? inst.status}</Badge>
                            </td>
                            <td className="text-center">
                              {inst.status === 'PENDING' && (
                                <button
                                  className="btn-secondary text-[11px] px-2 py-0.5 font-bold"
                                  onClick={() => setPostponeId(inst.id)}
                                >
                                  تأجيل
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <FormModal
        open={adding}
        wide
        title="إضافة قرض / سلفة جديدة لموظف"
        fields={loanFields}
        onClose={() => setAdding(false)}
        note="يُنشأ جدول الأقساط تلقائياً وتُربط الاستقطاعات آلياً مع مسيّر الرواتب لكل فترة محددة."
        onSubmit={async (b) => {
          await api.post('/loans', b);
          qc.invalidateQueries({ queryKey: ['/loans'] });
          toast.success('تم إنشاء السلفة وجدول الأقساط بنجاح');
        }}
      />

      {postponeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-96 rounded-xl bg-white shadow-2xl space-y-4 p-5 text-xs">
            <h3 className="font-bold text-slate-900 text-sm">تأجيل موعد استقطاع القسط</h3>
            <Field label="ترحيل القسط إلى الفترة المالية:">
              <PeriodSelect value={postponePeriodId} onChange={setPostponePeriodId} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary text-xs" onClick={() => setPostponeId(null)}>إلغاء</button>
              <button
                className="btn-primary text-xs"
                onClick={async () => {
                  try {
                    await api.post(`/loans/installments/${postponeId}/postpone`, { toPeriodId: postponePeriodId, reason: 'تأجيل إداري' });
                    qc.invalidateQueries({ queryKey: ['loan', selected?.id] });
                    toast.success('تم تأجيل القسط بنجاح');
                    setPostponeId(null);
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              >
                تأكيد التأجيل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================== payroll runs
export function PayrollRunsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [periodId, setPeriodId] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const preview = useQuery({ queryKey: ['payroll-preview', periodId], enabled: !!periodId, queryFn: () => api.get<any>('/payroll-runs/preview', { periodId }) });
  const runs = useQuery({ queryKey: ['/payroll-runs'], queryFn: () => api.get<Page<any>>('/payroll-runs', { pageSize: 50 }) });
  const detail = useQuery({ queryKey: ['payroll-run', viewId], enabled: !!viewId, queryFn: () => api.get<any>(`/payroll-runs/${viewId}`) });

  const doRun = async () => {
    if (!confirm('تنفيذ مسيّر رواتب هذه الفترة؟ لا يمكن التراجع إلا بالإلغاء وعكس القيد.')) return;
    try {
      const r: any = await api.post('/payroll-runs', { periodId });
      toast.success('تم ترحيل مسيّر الرواتب');
      qc.invalidateQueries({ queryKey: ['/payroll-runs'] });
      qc.invalidateQueries({ queryKey: ['payroll-preview', periodId] });
      setViewId(r.id);
    } catch (e) { toast.error(e); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="مسيّر الرواتب"
        subtitle="تجميع الرواتب الأساسية والمتغيرات المعتمدة وأقساط القروض في قيد واحد شهري. قيد الرواتب لا يمكن حذفه — يُلغى بعكس قيد."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() => {
                downloadCsv(`payroll-runs-${today()}.csv`, [
                  ['رقم المسيّر', 'الفترة', 'عدد الموظفين', 'إجمالي الرواتب', 'إجمالي المتغيرات', 'صافي الاستحقاق', 'رقم القيد', 'الحالة'],
                  ...(runs.data?.data ?? []).map((r: any) => [
                    r.runNo, r.periodName, r.employeeCount, r.totalSalaryBase, r.totalVariablesBase, r.netPayableBase, r.journalEntryNo || '', r.status,
                  ]),
                ]);
                toast.success('تم تصدير مسيرات الرواتب إلى CSV بنجاح');
              }}
              title="تصدير CSV"
            >
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
          </div>
        }
      />
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="الفترة المالية"><PeriodSelect value={periodId} onChange={setPeriodId} /></Field>
          <button className="btn-primary" disabled={!preview.data || !!preview.data.existingRunId || preview.data.employeeCount === 0}
            onClick={doRun}><Play className="size-4" /> تشغيل مسيّر الرواتب</button>
        </div>
        {preview.isLoading && <Loading />}
        {preview.data && (
          <div className="space-y-2">
            {preview.data.existingRunId && <p className="text-amber-600 text-sm">تم تشغيل مسيّر هذه الفترة مسبقًا. ألغِه لإعادة التشغيل.</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="الموظفون" value={String(preview.data.employeeCount ?? 0)} />
              <Stat label="إجمالي الرواتب" value={money(preview.data.totalSalaryBase)} />
              <Stat label="إجمالي المتغيرات" value={money(preview.data.totalVariablesBase)} tone="green" />
              <Stat label="إجمالي القروض (خصم)" value={money(preview.data.totalLoanDeductionsBase)} hint="ليست تكلفة ربحية" />
            </div>
            <Stat label="صافي الاستحقاق" value={money(preview.data.netPayableBase)} tone="blue" />
          </div>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 font-semibold dark:border-slate-800">التشغيلات السابقة</div>
        {runs.isLoading ? <Loading /> : runs.data?.data.length === 0 ? <EmptyState text="لم يتم تشغيل مسيّر بعد." /> : (
          <table className="table">
            <thead><tr><th>#</th><th>الفترة</th><th>الموظفون</th><th>الرواتب</th><th>المتغيرات</th><th>صافي الاستحقاق</th><th>القيد</th><th>الحالة</th><th /></tr></thead>
            <tbody>
              {runs.data?.data.map((r: any) => (
                <tr key={r.id}>
                  <td className="num">{r.runNo}</td>
                  <td>{r.periodName}</td>
                  <td className="num">{r.employeeCount}</td>
                  <td className="num">{money(r.totalSalaryBase)}</td>
                  <td className="num">{money(r.totalVariablesBase)}</td>
                  <td className="num font-medium">{money(r.netPayableBase)}</td>
                  <td>{r.journalEntryId ? <Link to={`/acc/journals/${r.journalEntryId}`} className="text-brand-600 hover:underline">{r.journalEntryNo}</Link> : '—'}</td>
                  <td><Badge color={RUN_STATUS[r.status]?.color}>{RUN_STATUS[r.status]?.label ?? r.status}</Badge></td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <button className="btn-ghost h-7 px-2 text-xs" onClick={() => setViewId(r.id)}>تفاصيل</button>
                      {r.status === 'POSTED' && <button className="btn-ghost h-7 px-2 text-xs text-rose-600" onClick={() => setCancelId(r.id)}>إلغاء</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {viewId && detail.data && (
        <div className="card overflow-hidden">
          <div className="flex justify-between items-center border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <h3 className="font-semibold">تفاصيل مسيّر #{detail.data.runNo} — {detail.data.periodName}</h3>
            <div className="flex items-center gap-2">
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
                <Printer className="size-3.5" /> طباعة الكشف
              </button>
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={() => {
                  downloadCsv(`payroll-details-${detail.data.runNo}-${today()}.csv`, [
                    ['الموظف', 'الراتب الأساسي', 'مكافآت', 'إضافي', 'بدلات', 'خصومات', 'أقساط السلف', 'الإجمالي', 'الصافي'],
                    ...(detail.data.lines ?? []).map((l: any) => [
                      l.employeeName, l.salaryBase, l.bonusesBase, l.overtimeBase, l.allowancesBase, l.deductionsBase, l.loanDeductionsBase, l.grossBase, l.netPayableBase,
                    ]),
                  ]);
                  toast.success('تم تصدير تفاصيل المسير إلى CSV بنجاح');
                }}
              >
                <Download className="size-3.5" /> تصدير CSV
              </button>
              <button className="btn-ghost h-7" onClick={() => setViewId(null)}>إغلاق</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>الموظف</th><th>الراتب</th><th>مكافآت</th><th>إضافي</th><th>بدلات</th><th>خصومات</th><th>أقساط</th><th>الإجمالي</th><th>الصافي</th></tr></thead>
              <tbody>
                {detail.data.lines?.map((l: any) => (
                  <tr key={l.id}>
                    <td><Link to={`/hr/employees/${l.employeeId}`} className="text-brand-600 hover:underline">{l.employeeName}</Link></td>
                    <td className="num">{money(l.salaryBase)}</td>
                    <td className="num">{money(l.bonusesBase)}</td>
                    <td className="num">{money(l.overtimeBase)}</td>
                    <td className="num">{money(l.allowancesBase)}</td>
                    <td className="num text-rose-600">{money(l.deductionsBase)}</td>
                    <td className="num text-rose-600">{money(l.loanDeductionsBase)}</td>
                    <td className="num font-medium">{money(l.grossBase)}</td>
                    <td className="num font-bold text-brand-600">{money(l.netPayableBase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ReasonDialog open={!!cancelId} danger title="إلغاء مسيّر الرواتب" confirmText="إلغاء المسيّر"
        onClose={() => setCancelId(null)}
        extra={<p className="mb-3 text-sm text-slate-500">يُعكس قيد الرواتب تلقائيًا. يمكن إعادة التشغيل بعد التصحيح.</p>}
        onConfirm={async (reason) => {
          try { await api.post(`/payroll-runs/${cancelId}/cancel`, { reason }); toast.success('تم الإلغاء'); setCancelId(null); qc.invalidateQueries({ queryKey: ['/payroll-runs'] }); } catch (e) { toast.error(e); }
        }} />
    </div>
  );
}
