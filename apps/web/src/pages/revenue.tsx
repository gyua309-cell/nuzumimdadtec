import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase, Building2, ChevronDown, ChevronRight, Download,
  History, Play, Printer, Settings, Users,
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { PeriodSelect } from '../components/forms';
import {
  Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, ReasonDialog, Stat, useToast,
} from '../components/ui';

// ============================================================================
// Revenue Engine Run & Review
// ============================================================================
export function RevenuePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [periodId, setPeriodId] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: ['rev-preview', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any>('/revenue-runs/preview', { periodId }),
  });
  const runs = useQuery({
    queryKey: ['/revenue-runs'],
    queryFn: () => api.get<Page<any>>('/revenue-runs', { pageSize: 50 }),
  });
  const detail = useQuery({
    queryKey: ['rev-run', viewId],
    enabled: !!viewId,
    queryFn: () => api.get<any>(`/revenue-runs/${viewId}`),
  });

  const doRun = async () => {
    if (!confirm('ترحيل إيرادات هذه الفترة؟ لا يمكن التراجع إلا بالإلغاء وعكس القيد.')) return;
    try {
      const r: any = await api.post('/revenue-runs', { fiscalPeriodId: periodId });
      toast.success('تم ترحيل الإيرادات بنجاح');
      qc.invalidateQueries({ queryKey: ['/revenue-runs'] });
      qc.invalidateQueries({ queryKey: ['rev-preview', periodId] });
      setViewId(r.id);
    } catch (e) {
      toast.error(e);
    }
  };

  const doCancel = async (reason: string) => {
    if (!cancelId) return;
    try {
      await api.post(`/revenue-runs/${cancelId}/cancel`, { reason });
      toast.success('تم إلغاء تشغيل الإيراد');
      qc.invalidateQueries({ queryKey: ['/revenue-runs'] });
      qc.invalidateQueries({ queryKey: ['rev-preview', periodId] });
      setCancelId(null);
    } catch (e) {
      toast.error(e);
    }
  };

  const handleExportRuns = () => {
    if (!runs.data?.data?.length) return;
    downloadCsv(`revenue-runs-${today()}.csv`, [
      ['رقم التشغيل', 'الفترة المالية', 'المشاريع', 'الموظفون', 'الخطوط', 'إجمالي الإيراد', 'رقم القيد المحاسبي', 'الحالة'],
      ...runs.data.data.map((r: any) => [
        r.runNo, r.periodName, r.projectCount, r.employeeCount, r.lineCount, r.totalRevenueBase, r.journalEntryNo || '—', r.status,
      ]),
    ]);
    toast.success('تم تصدير تشغيلات الإيراد إلى CSV بنجاح');
  };

  const handleExportPreview = () => {
    if (!preview.data?.lines?.length) return;
    downloadCsv(`revenue-preview-${periodId || today()}.csv`, [
      ['الموظف', 'المشروع', 'الأساس', 'الوحدات', 'التخصيص%', 'الإيراد بالعملة الأساسية'],
      ...preview.data.lines.map((l: any) => [
        l.employeeName, l.projectName, l.pricingBasis, l.units, l.allocationPct, l.grossRevenueBase,
      ]),
    ]);
    toast.success('تم تصدير خطوط معاينة الإيراد إلى CSV بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="محرك الإيرادات التشغيلي"
        subtitle="يحسب ويرحّل إيرادات الخدمات بناءً على تخصيصات الموظفين وأسعار الخدمات (السعر × التخصيص % × الفترة)."
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
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="الفترة المالية">
              <PeriodSelect value={periodId} onChange={setPeriodId} />
            </Field>
            <button
              className="btn-primary"
              disabled={!preview.data || !!preview.data.existingRunId || preview.data.lineCount === 0}
              onClick={doRun}
            >
              <Play className="size-4" /> ترحيل الإيرادات
            </button>
          </div>
          {preview.data?.lines && preview.data.lines.length > 0 && (
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportPreview}>
              <Download className="size-3.5" /> تصدير معاينة الفترة الحالية (CSV)
            </button>
          )}
        </div>
        {preview.isLoading && <Loading />}
        {preview.data && (
          <div className="space-y-3">
            {preview.data.existingRunId && (
              <p className="text-amber-600 text-sm">تم ترحيل إيرادات هذه الفترة مسبقًا.</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="خطوط الإيراد" value={String(preview.data.lineCount ?? 0)} />
              <Stat label="المشاريع" value={String(preview.data.projectCount ?? 0)} />
              <Stat label="الموظفون" value={String(preview.data.employeeCount ?? 0)} />
              <Stat label="إجمالي الإيراد" value={money(preview.data.totalRevenueBase)} tone="green" />
            </div>
            {preview.data.lines && preview.data.lines.length > 0 && (
              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>المشروع</th>
                      <th>الأساس</th>
                      <th>الوحدات</th>
                      <th>التخصيص%</th>
                      <th>الإيراد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td>{l.employeeName}</td>
                        <td>{l.projectName}</td>
                        <td>{l.pricingBasis === 'MONTHLY' ? 'شهري' : l.pricingBasis === 'DAILY' ? 'يومي' : 'ساعي'}</td>
                        <td className="num">{Number(l.units).toFixed(2)}</td>
                        <td className="num">{Number(l.allocationPct).toFixed(1)}%</td>
                        <td className="num font-medium">{money(l.grossRevenueBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2.5 font-semibold dark:border-slate-800">
          تشغيلات الإيراد السابقة
        </div>
        {runs.isLoading ? (
          <Loading />
        ) : runs.data?.data.length === 0 ? (
          <EmptyState text="لم يتم ترحيل أي إيرادات بعد." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>الفترة</th>
                <th>إجمالي الإيراد</th>
                <th>القيد المحاسبي</th>
                <th>الحالة</th>
                <th className="text-end">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {runs.data?.data.map((r: any) => (
                <tr key={r.id}>
                  <td className="num">{r.runNo}</td>
                  <td>{r.periodName}</td>
                  <td className="num font-medium text-green-600">{money(r.totalRevenueBase)}</td>
                  <td>
                    {r.journalEntryId ? (
                      <Link to={`/acc/journals/${r.journalEntryId}`} className="text-brand-600 hover:underline">
                        {r.journalEntryNo}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Badge color={r.status === 'POSTED' ? 'green' : r.status === 'CANCELLED' ? 'red' : 'slate'}>
                      {r.status === 'POSTED' ? 'مرحّل' : r.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}
                    </Badge>
                  </td>
                  <td className="text-end">
                    <div className="flex gap-1 justify-end">
                      <button className="btn-ghost h-7 px-2 text-xs" onClick={() => setViewId(r.id)}>
                        تفاصيل
                      </button>
                      {r.status === 'POSTED' && (
                        <button className="btn-ghost h-7 px-2 text-xs text-rose-600" onClick={() => setCancelId(r.id)}>
                          إلغاء
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Details Modal */}
      {viewId && (
        <Modal open={!!viewId} onClose={() => setViewId(null)} wide title={`تفاصيل تشغيل الإيراد #${detail.data?.runNo}`}>
          {detail.isLoading && <Loading />}
          {detail.data && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg">
                <div><strong>الفترة:</strong> {detail.data.periodName}</div>
                <div><strong>الحالة:</strong> {detail.data.status}</div>
                <div><strong>إجمالي الإيراد:</strong> {money(detail.data.totalRevenueBase)}</div>
              </div>
              <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="table w-full">
                  <thead>
                    <tr>
                      <th>الموظف</th><th>المشروع</th><th>العميل</th><th>الأساس</th><th>السعر</th><th>الوحدات</th><th>التخصيص%</th><th>الإيراد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.data.lines?.map((l: any) => (
                      <tr key={l.id}>
                        <td>{l.employeeName}</td>
                        <td>{l.projectName}</td>
                        <td>{l.clientName}</td>
                        <td>{l.pricingBasis}</td>
                        <td className="num">{money(l.unitPrice)}</td>
                        <td className="num">{Number(l.units).toFixed(2)}</td>
                        <td className="num">{Number(l.allocationPct).toFixed(1)}%</td>
                        <td className="num font-bold text-emerald-600">{money(l.grossRevenueBase)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Cancel Dialog */}
      <ReasonDialog
        open={!!cancelId}
        title="إلغاء تشغيل الإيراد"
        confirmText="تأكيد الإلغاء"
        danger
        onClose={() => setCancelId(null)}
        onConfirm={doCancel}
      />
    </div>
  );
}

// ============================================================================
// Profitability Dashboard: 3 Levels (Project, Employee, Client) + Retroactive + Overhead
// (Full Implementation of Business Process Sections 18, 19, 20, 21, 22)
// ============================================================================
export function ProfitabilityPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as any) || 'projects';
  const [periodId, setPeriodId] = useState('');
  const [activeTab, setActiveTab] = useState<'projects' | 'employees' | 'clients' | 'retroactive' | 'overhead'>(initialTab);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && ['projects', 'employees', 'clients', 'retroactive', 'overhead'].includes(t)) {
      setActiveTab(t as any);
    }
  }, [searchParams]);

  const handleTabChange = (tabKey: typeof activeTab) => {
    setActiveTab(tabKey);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tabKey);
      return next;
    });
  };
  const [projectSearch, setProjectSearch] = useState('');
  const [empSearch, setEmpSearch] = useState('');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [showRetroModal, setShowRetroModal] = useState(false);

  // Queries
  const projectProf = useQuery({
    queryKey: ['/profitability/projects', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any[]>('/profitability/projects', { periodId }),
  });

  const empProf = useQuery({
    queryKey: ['/profitability/employees', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any>('/profitability/employees', { periodId }),
  });

  const clientProf = useQuery({
    queryKey: ['/profitability/clients', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any[]>('/profitability/clients', { periodId }),
  });

  const retroAdjustments = useQuery({
    queryKey: ['/revenue-adjustments/retroactive', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any[]>('/revenue-adjustments/retroactive', { periodId }),
  });

  const overheadPolicy = useQuery({
    queryKey: ['/overhead-policy'],
    queryFn: () => api.get<any>('/overhead-policy'),
  });

  // Filtered lists
  const filteredProjects = (projectProf.data ?? []).filter((p) =>
    !projectSearch || p.projectName?.toLowerCase().includes(projectSearch.toLowerCase()) || p.projectCode?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredEmps = (empProf.data?.employees ?? []).filter((e: any) =>
    !empSearch || e.employeeName?.toLowerCase().includes(empSearch.toLowerCase()) || e.employeeCode?.toLowerCase().includes(empSearch.toLowerCase())
  );

  const handleExportCurrentTab = () => {
    const periodLabel = periodId ? `period-${periodId}` : today();
    if (activeTab === 'projects') {
      if (!filteredProjects.length) return;
      downloadCsv(`project-profitability-${periodLabel}.csv`, [
        ['كود المشروع', 'اسم المشروع', 'العميل', 'الإيراد', 'تكلفة الموظفين', 'متغيرات المشروع', 'المصروفات العامة', 'إجمالي التكلفة', 'الربح', 'الهامش%', 'المستهدف%'],
        ...filteredProjects.map((p: any) => [
          p.projectCode, p.projectName, p.clientName || '', p.revenueBase, p.employeeCostBase, p.projectVariablesBase, p.overheadBase, p.totalCostBase, p.grossProfitBase, p.grossMarginPct != null ? `${p.grossMarginPct}%` : '', p.requiredMarginPct != null ? `${p.requiredMarginPct}%` : '',
        ]),
      ]);
      toast.success('تم تصدير كشف ربحية المشاريع إلى CSV بنجاح');
    } else if (activeTab === 'employees') {
      if (!filteredEmps.length) return;
      downloadCsv(`employee-profitability-and-unutilized-${periodLabel}.csv`, [
        ['كود الموظف', 'اسم الموظف', 'القسم', 'المسمى الوظيفي', 'التخصيص%', 'غير المستغل%', 'تكلفة الوقت غير المستغل', 'التكلفة المباشرة', 'المصروفات العامة', 'الإيراد المولد', 'صافي الربح', 'الهامش%'],
        ...filteredEmps.map((e: any) => [
          e.employeeCode, e.employeeName, e.departmentName || '', e.positionTitle || '', `${e.allocatedPct}%`, `${e.unutilizedPct}%`, e.unutilizedCostBase, e.directCostBase, e.overheadBase, e.revenueBase, e.grossProfitBase, e.grossMarginPct != null ? `${e.grossMarginPct}%` : '',
        ]),
      ]);
      toast.success('تم تصدير كشف ربحية الموظفين والوقت غير المستغل إلى CSV بنجاح');
    } else if (activeTab === 'clients') {
      if (!clientProf.data?.length) return;
      downloadCsv(`client-profitability-${periodLabel}.csv`, [
        ['كود العميل', 'اسم العميل', 'عدد المشاريع', 'إجمالي الإيراد', 'التكلفة المباشرة', 'المصروفات العامة', 'إجمالي التكلفة', 'صافي الربح', 'الهامش%'],
        ...clientProf.data.map((c: any) => [
          c.clientCode, c.clientName, c.projectCount, c.revenueBase, c.directCostBase, c.overheadBase, c.totalCostBase, c.grossProfitBase, c.grossMarginPct != null ? `${c.grossMarginPct}%` : '',
        ]),
      ]);
      toast.success('تم تصدير كشف ربحية العملاء إلى CSV بنجاح');
    } else if (activeTab === 'retroactive') {
      if (!retroAdjustments.data?.length) return;
      downloadCsv(`retroactive-adjustments-${periodLabel}.csv`, [
        ['الموظف', 'المشروع', 'العميل', 'الفترة الأصلية', 'فترة التسجيل', 'أساس الاحتساب', 'الوحدات', 'السعر', 'الإيراد المسوى', 'سبب التسوية'],
        ...retroAdjustments.data.map((r: any) => [
          r.employeeName, r.projectName, r.clientName || '', r.originalPeriodName, r.periodName, r.pricingBasis, r.units, r.unitPrice, r.grossRevenueBase, r.adjustmentReason || '',
        ]),
      ]);
      toast.success('تم تصدير كشف تسويات الأثر الرجعي إلى CSV بنجاح');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="لوحة الربحية الشاملة والمصروفات الإدارية"
        subtitle="تحليل الربحية متعدد المستويات (المشاريع، الموظفين مع الوقت غير المستغل، والعملاء) وفق وثيقة دورة العمل Business Process."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCurrentTab} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير التبويب الحالي (CSV)
            </button>
            <button
              className="btn-secondary flex items-center gap-1.5 text-xs"
              onClick={() => setShowRetroModal(true)}
            >
              <History className="size-3.5 text-brand-600" /> إضافة تسوية إيراد بأثر رجعي
            </button>
          </div>
        }
      />

      {/* Period Selection & Tab Bar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Field label="الفترة المالية">
            <PeriodSelect value={periodId} onChange={setPeriodId} className="w-52 h-9 text-xs" />
          </Field>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium">
            <button
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === 'projects' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => handleTabChange('projects')}
            >
              <Briefcase className="size-3.5" /> ربحية المشاريع
            </button>
            <button
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === 'employees' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => handleTabChange('employees')}
            >
              <Users className="size-3.5" /> ربحية الموظفين والوقت الضائع
            </button>
            <button
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === 'clients' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => handleTabChange('clients')}
            >
              <Building2 className="size-3.5" /> ربحية العملاء
            </button>
            <button
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === 'retroactive' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => handleTabChange('retroactive')}
            >
              <History className="size-3.5" /> تسويات الأثر الرجعي
            </button>
            <button
              className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${
                activeTab === 'overhead' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-semibold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
              onClick={() => handleTabChange('overhead')}
            >
              <Settings className="size-3.5" /> سياسة المصروفات (Overhead)
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================== TAB 1: PROJECTS */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          {projectProf.isLoading && <Loading />}
          {projectProf.isError && <ErrorState error={projectProf.error} />}
          {projectProf.data && (
            <>
              {/* Filter */}
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  className="input text-xs w-64 py-1.5"
                  placeholder="بحث باسم المشروع أو الكود..."
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                />
                <span className="text-xs text-slate-500 font-mono">
                  إجمالي المشاريع: <strong>{filteredProjects.length}</strong>
                </span>
              </div>

              <div className="card overflow-hidden">
                {filteredProjects.length === 0 ? (
                  <EmptyState text="لا توجد بيانات ربحية للمشاريع في هذه الفترة." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table w-full text-xs">
                      <thead>
                        <tr>
                          <th>المشروع</th>
                          <th>العميل</th>
                          <th className="num">الإيراد</th>
                          <th className="num">تكلفة الموظفين</th>
                          <th className="num">متغيرات المشروع</th>
                          <th className="num">المصروفات العامة</th>
                          <th className="num">إجمالي التكلفة</th>
                          <th className="num">الربح</th>
                          <th className="num">الهامش%</th>
                          <th className="num">المستهدف%</th>
                          <th>التقييم</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.map((p: any) => {
                          const margin = p.grossMarginPct != null ? Number(p.grossMarginPct) : null;
                          const target = p.requiredMarginPct != null ? Number(p.requiredMarginPct) : null;
                          const ok = p.meetsTarget;
                          const isExpanded = expandedProject === p.id;
                          return (
                            <>
                              <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                <td>
                                  <Link to={`/prj/projects/${p.projectId}`} className="text-brand-600 hover:underline font-bold">
                                    {p.projectCode} — {p.projectName}
                                  </Link>
                                </td>
                                <td>{p.clientName}</td>
                                <td className="num font-bold text-emerald-600">{money(p.revenueBase)}</td>
                                <td className="num">{money(p.employeeCostBase)}</td>
                                <td className="num text-purple-600">{money(p.projectVariablesBase)}</td>
                                <td className="num text-slate-500">{money(p.overheadBase)}</td>
                                <td className="num font-medium">{money(p.totalCostBase)}</td>
                                <td className={`num font-bold ${Number(p.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                                  {money(p.grossProfitBase)}
                                </td>
                                <td className="num font-bold">{margin != null ? `${margin.toFixed(1)}%` : '—'}</td>
                                <td className="num text-slate-500">{target != null ? `${target.toFixed(1)}%` : '—'}</td>
                                <td>
                                  {ok === null ? (
                                    <Badge>غير محدد</Badge>
                                  ) : ok ? (
                                    <Badge color="green">يحقق الهدف</Badge>
                                  ) : (
                                    <Badge color="red">دون الهدف</Badge>
                                  )}
                                </td>
                                <td className="text-center">
                                  {p.teamMembers?.length > 0 && (
                                    <button
                                      className="text-slate-400 hover:text-slate-600 p-1"
                                      onClick={() => setExpandedProject(isExpanded ? null : p.id)}
                                      title="فريق عمل المشروع"
                                    >
                                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                    </button>
                                  )}
                                </td>
                              </tr>
                              {/* Team details row */}
                              {isExpanded && (
                                <tr className="bg-slate-50/80 dark:bg-slate-800/60">
                                  <td colSpan={12} className="p-3">
                                    <div className="space-y-1.5">
                                      <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                                        فريق العمل وتوزيع التكلفة على المشروع ({p.teamCount} موظف):
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        {p.teamMembers.map((tm: any, idx: number) => (
                                          <div key={idx} className="card p-2 bg-white dark:bg-slate-900 border text-[11px] flex justify-between items-center">
                                            <div>
                                              <span className="font-mono text-brand-600 font-semibold">{tm.employeeCode}</span>
                                              <span className="ms-1.5 font-medium">{tm.employeeName}</span>
                                            </div>
                                            <div className="text-end">
                                              <div className="font-bold text-slate-800 dark:text-slate-200">{money(tm.costBase)}</div>
                                              <div className="text-[10px] text-slate-400">تخصيص: {tm.effectivePct}%</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================================== TAB 2: EMPLOYEES & UNUTILIZED TIME */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          {empProf.isLoading && <Loading />}
          {empProf.isError && <ErrorState error={empProf.error} />}
          {empProf.data && (
            <>
              {/* KPI Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="إجمالي الموظفين" value={String(empProf.data.summary.employeeCount)} tone="blue" />
                <Stat label="إجمالي إيراد الموظفين" value={money(empProf.data.summary.totalRevenueBase)} tone="green" />
                <Stat label="إجمالي تكلفة الموظفين" value={money(empProf.data.summary.totalCostBase)} />
                <Stat
                  label="تكلفة الوقت الضائع (غير المستغل)"
                  value={money(empProf.data.summary.totalUnutilizedCostBase)}
                  tone="amber"
                  hint="تكلفة الشركة للموظفين دون تخصيص مشاريع"
                />
                <Stat
                  label="صافي أرباح الموظفين"
                  value={money(empProf.data.summary.totalProfitBase)}
                  tone={Number(empProf.data.summary.totalProfitBase) >= 0 ? 'green' : 'red'}
                />
              </div>

              {/* Filter */}
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  className="input text-xs w-64 py-1.5"
                  placeholder="بحث باسم الموظف أو الكود..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                />
                <span className="text-xs text-slate-500 font-mono">
                  متوسط هامش الموظفين: <strong>{empProf.data.summary.averageMarginPct ?? '—'}%</strong>
                </span>
              </div>

              {/* Table */}
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table w-full text-xs">
                    <thead>
                      <tr>
                        <th>الموظف</th>
                        <th>القسم / الوظيفة</th>
                        <th className="num">التخصيص%</th>
                        <th className="num">غير مستغل%</th>
                        <th className="num">تكلفة الوقت الضائع</th>
                        <th className="num">التكلفة المباشرة</th>
                        <th className="num">المصروفات العامة</th>
                        <th className="num">الإيراد المولد</th>
                        <th className="num">صافي الربح</th>
                        <th className="num">الهامش%</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmps.map((e: any) => {
                        const isExpanded = expandedEmp === e.employeeId;
                        const unutilized = Number(e.unutilizedPct || 0);
                        return (
                          <>
                            <tr key={e.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td>
                                <Link to={`/hr/employees/${e.employeeId}`} className="text-brand-600 hover:underline font-bold">
                                  {e.employeeCode} — {e.employeeName}
                                </Link>
                              </td>
                              <td className="text-slate-500">
                                {e.departmentName || '—'} {e.positionTitle ? `(${e.positionTitle})` : ''}
                              </td>
                              <td className="num font-mono font-medium">{e.allocatedPct}%</td>
                              <td className="num font-mono">
                                <span className={unutilized > 20 ? 'text-amber-600 font-bold' : 'text-slate-500'}>
                                  {e.unutilizedPct}%
                                </span>
                              </td>
                              <td className="num font-mono text-amber-700 dark:text-amber-400 font-semibold">
                                {money(e.unutilizedCostBase)}
                              </td>
                              <td className="num">{money(e.directCostBase)}</td>
                              <td className="num text-slate-500">{money(e.overheadBase)}</td>
                              <td className="num font-bold text-emerald-600">{money(e.revenueBase)}</td>
                              <td className={`num font-bold ${Number(e.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                                {money(e.grossProfitBase)}
                              </td>
                              <td className="num font-bold">
                                {e.grossMarginPct != null ? `${Number(e.grossMarginPct).toFixed(1)}%` : '—'}
                              </td>
                              <td className="text-center">
                                {e.projects?.length > 0 && (
                                  <button
                                    className="text-slate-400 hover:text-slate-600 p-1"
                                    onClick={() => setExpandedEmp(isExpanded ? null : e.employeeId)}
                                    title="المشاريع المسندة"
                                  >
                                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50/80 dark:bg-slate-800/60">
                                <td colSpan={11} className="p-3">
                                  <div className="space-y-1.5">
                                    <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300">
                                      مشاريع الموظف وتوزيع الإيراد والتكلفة:
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {e.projects.map((pr: any, i: number) => (
                                        <div key={i} className="card p-2 bg-white dark:bg-slate-900 border text-[11px] flex justify-between items-center">
                                          <div>
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">{pr.projectName} ({pr.projectCode})</div>
                                            <div className="text-[10px] text-slate-400">تخصيص: {pr.effectiveAllocationPct}%</div>
                                          </div>
                                          <div className="text-end">
                                            <div className="text-emerald-600 font-bold">إيراد: {money(pr.revenueBase)}</div>
                                            <div className="text-slate-500">تكلفة: {money(pr.costBase)}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ================================================================== TAB 3: CLIENTS */}
      {activeTab === 'clients' && (
        <div className="space-y-4">
          {clientProf.isLoading && <Loading />}
          {clientProf.isError && <ErrorState error={clientProf.error} />}
          {clientProf.data && (
            <div className="card overflow-hidden">
              <table className="table w-full text-xs">
                <thead>
                  <tr>
                    <th>العميل</th>
                    <th className="num">عدد المشاريع</th>
                    <th className="num">إجمالي الإيراد</th>
                    <th className="num">التكلفة المباشرة</th>
                    <th className="num">المصروفات العامة</th>
                    <th className="num">إجمالي التكلفة</th>
                    <th className="num">صافي الربح</th>
                    <th className="num">هامش العميل%</th>
                  </tr>
                </thead>
                <tbody>
                  {clientProf.data.map((c: any) => {
                    const margin = c.grossMarginPct != null ? Number(c.grossMarginPct) : null;
                    return (
                      <tr key={c.clientId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{c.clientName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{c.clientCode}</div>
                        </td>
                        <td className="num font-mono font-semibold">{c.projectCount}</td>
                        <td className="num font-bold text-emerald-600">{money(c.revenueBase)}</td>
                        <td className="num">{money(c.directCostBase)}</td>
                        <td className="num text-slate-500">{money(c.overheadBase)}</td>
                        <td className="num font-medium">{money(c.totalCostBase)}</td>
                        <td className={`num font-bold ${Number(c.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                          {money(c.grossProfitBase)}
                        </td>
                        <td className="num font-bold">
                          {margin != null ? `${margin.toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================================================================== TAB 4: RETROACTIVE ADJUSTMENTS */}
      {activeTab === 'retroactive' && (
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-3 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2">
            <History className="size-4 shrink-0 text-blue-600 mt-0.5" />
            <div>
              <strong>مفهوم الإيراد بأثر رجعي (Section 18):</strong>
              <p className="mt-0.5">
                عند اكتشاف ساعات أو أيام عمل لموظف على مشروع في شهر سابق مغلق، لا يتم فتح الشهر المغلق أو تعديل أرقامه التاريخية. بدلاً من ذلك، يتم تسجيل تسوية إيراد بأثر رجعي في الشهر الحالي كبند منفصل ثابت يحافظ على سلامة السجلات التاريخية.
              </p>
            </div>
          </div>

          <div className="card overflow-hidden">
            {retroAdjustments.isLoading ? (
              <Loading />
            ) : retroAdjustments.data?.length === 0 ? (
              <EmptyState text="لا توجد تسويات إيرادات بأثر رجعي مسجلة لهذه الفترة." />
            ) : (
              <table className="table w-full text-xs">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>المشروع</th>
                    <th>العميل</th>
                    <th>الفترة الأصلية</th>
                    <th>فترة التسجيل</th>
                    <th>الأساس</th>
                    <th className="num">الوحدات</th>
                    <th className="num">السعر</th>
                    <th className="num">الإيراد المسوى</th>
                    <th>سبب التسوية</th>
                  </tr>
                </thead>
                <tbody>
                  {retroAdjustments.data?.map((r: any) => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.employeeName}</td>
                      <td>{r.projectName}</td>
                      <td>{r.clientName}</td>
                      <td className="font-mono text-purple-600 font-medium">{r.originalPeriodName}</td>
                      <td className="font-mono">{r.periodName}</td>
                      <td>{r.pricingBasis === 'MONTHLY' ? 'شهري' : r.pricingBasis === 'DAILY' ? 'يومي' : 'ساعي'}</td>
                      <td className="num font-mono">{Number(r.units).toFixed(2)}</td>
                      <td className="num font-mono">{money(r.unitPrice)}</td>
                      <td className="num font-bold text-emerald-600">{money(r.grossRevenueBase)}</td>
                      <td className="max-w-xs truncate" title={r.adjustmentReason}>{r.adjustmentReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== TAB 5: OVERHEAD POLICY */}
      {activeTab === 'overhead' && (
        <OverheadPolicyEditor
          policy={overheadPolicy.data}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['/overhead-policy'] });
            qc.invalidateQueries({ queryKey: ['/profitability/projects', periodId] });
            qc.invalidateQueries({ queryKey: ['/profitability/employees', periodId] });
            qc.invalidateQueries({ queryKey: ['/profitability/clients', periodId] });
          }}
        />
      )}

      {/* Retroactive Adjustment Modal */}
      <CreateRetroactiveAdjustmentModal
        open={showRetroModal}
        currentPeriodId={periodId}
        onClose={() => setShowRetroModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/revenue-adjustments/retroactive', periodId] });
          qc.invalidateQueries({ queryKey: ['/profitability/projects', periodId] });
          qc.invalidateQueries({ queryKey: ['/profitability/employees', periodId] });
        }}
      />
    </div>
  );
}

// ============================================================================
// Create Retroactive Revenue Adjustment Modal
// ============================================================================
function CreateRetroactiveAdjustmentModal({
  open,
  currentPeriodId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  currentPeriodId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [originalPeriodId, setOriginalPeriodId] = useState('');
  const [fiscalPeriodId, setFiscalPeriodId] = useState(currentPeriodId);
  const [pricingBasis, setPricingBasis] = useState<'MONTHLY' | 'DAILY' | 'HOURLY'>('DAILY');
  const [units, setUnits] = useState('2');
  const [unitPrice, setUnitPrice] = useState('1000');
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [busy, setBusy] = useState(false);

  const employees = useQuery({
    queryKey: ['/employees-list'],
    queryFn: () => api.get<Page<any>>('/employees', { pageSize: 100 }),
  });
  const projects = useQuery({
    queryKey: ['/projects-list'],
    queryFn: () => api.get<Page<any>>('/projects', { pageSize: 100 }),
  });

  const handleSubmit = async () => {
    if (!employeeId || !projectId || !originalPeriodId || !fiscalPeriodId) {
      toast.error(new Error('يرجى استكمال اختيار الموظف والمشروع والفترات المالية'));
      return;
    }
    if (!adjustmentReason.trim()) {
      toast.error(new Error('يرجى كتابة سبب التسوية بأثر رجعي'));
      return;
    }

    setBusy(true);
    try {
      await api.post('/revenue-adjustments/retroactive', {
        employeeId,
        projectId,
        originalPeriodId,
        fiscalPeriodId,
        pricingBasis,
        units,
        unitPrice,
        currencyCode,
        adjustmentReason,
      });

      toast.success('تم تسجيل تسوية الإيراد بأثر رجعي بنجاح');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إضافة تسوية إيراد بأثر رجعي (Retroactive Revenue)"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'حفظ التسوية'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الموظف *">
            <select className="input w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">-- اختر الموظف --</option>
              {employees.data?.data.map((e) => (
                <option key={e.id} value={e.id}>{e.code} — {e.fullNameAr}</option>
              ))}
            </select>
          </Field>
          <Field label="المشروع *">
            <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">-- اختر المشروع --</option>
              {projects.data?.data.map((p) => (
                <option key={p.id} value={p.id}>{p.code} — {p.nameAr}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الفترة المالية الأصلية (تاريخ العمل الفعلي) *">
            <PeriodSelect value={originalPeriodId} onChange={setOriginalPeriodId} className="w-full" />
          </Field>
          <Field label="فترة التسجيل والاعتراف (الشهر الحالي المفتوح) *">
            <PeriodSelect value={fiscalPeriodId} onChange={setFiscalPeriodId} className="w-full" />
          </Field>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label="أساس التسعير">
            <select className="input w-full" value={pricingBasis} onChange={(e) => setPricingBasis(e.target.value as any)}>
              <option value="DAILY">يومي (Daily)</option>
              <option value="HOURLY">ساعي (Hourly)</option>
              <option value="MONTHLY">شهري (Monthly)</option>
            </select>
          </Field>
          <Field label="العملة">
            <select className="input w-full font-mono" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="SAR">SAR</option>
              <option value="EGP">EGP</option>
              <option value="USD">USD</option>
            </select>
          </Field>
          <Field label="عدد الوحدات (أيام/ساعات)">
            <input type="number" step="0.5" className="input w-full font-mono" value={units} onChange={(e) => setUnits(e.target.value)} />
          </Field>
          <Field label="سعر الوحدة">
            <input type="number" step="1" className="input w-full font-mono" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
        </div>

        <Field label="سبب التسوية بأثر رجعي (إلزامي للرقابة والتدقيق) *">
          <textarea
            className="input w-full h-16 py-1.5"
            placeholder="مثال: اكتشاف أيام عمل غير مفوترة في الشهر السابق بعد تسليم متطلبات إضافية للعميل..."
            value={adjustmentReason}
            onChange={(e) => setAdjustmentReason(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ============================================================================
// Overhead Policy Settings Editor
// ============================================================================
function OverheadPolicyEditor({ policy, onSuccess }: { policy: any; onSuccess: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState(policy?.method || 'PERCENTAGE');
  const [rate, setRate] = useState(policy?.rate || '15');
  const [notes, setNotes] = useState(policy?.notes || '');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await api.put('/overhead-policy', { method, rate, notes: notes || undefined });
      toast.success('تم تحديث سياسة المصروفات العمومية بنجاح');
      onSuccess();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 max-w-xl space-y-4 text-xs">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <Settings className="size-5 text-brand-600" />
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            سياسة المصروفات الإدارية والعمومية (Overhead Policy - Section 19)
          </h3>
          <p className="text-slate-500">
            تحديد طريقة ونسبة تحميل التكاليف غير المباشرة للشركة على ربحية الموظفين والمشاريع.
          </p>
        </div>
      </div>

      <Field label="طريقة احتساب المصروفات العامة">
        <select className="input w-full text-xs" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="PERCENTAGE">نسبة مئوية من التكلفة المباشرة (% of Direct Cost)</option>
          <option value="FIXED_PER_EMPLOYEE">مبلغ ثابت شهري لكل موظف (Fixed per Employee)</option>
          <option value="FIXED_PER_PROJECT">مبلغ ثابت يوزع على المشاريع (Fixed per Project)</option>
        </select>
      </Field>

      <Field label={method === 'PERCENTAGE' ? 'النسبة المئوية (%)' : 'المبلغ بالعملة الأساسية'}>
        <input
          type="number"
          step="0.5"
          className="input w-full font-mono text-xs"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </Field>

      <Field label="ملاحظات وتوجيهات المحاسب">
        <textarea
          className="input w-full h-20 text-xs py-1.5"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <button className="btn-primary" onClick={handleSave} disabled={busy}>
        {busy ? 'جارٍ الحفظ...' : 'حفظ وتحديث سياسة المصروفات'}
      </button>
    </div>
  );
}
