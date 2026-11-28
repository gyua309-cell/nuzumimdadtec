import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, Briefcase, Building2, CheckCircle2, ChevronDown, ChevronRight, Download,
  History, PieChart, Play, Plus, Printer, Send, Settings, Users, XCircle,
} from 'lucide-react';
import { ReportFilterBar, useReportFilters } from '../components/ReportFilterBar';
import { api, Page } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { useReportCurrency } from '../lib/fx-display';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { ExportEngine } from '../engine/export-engine';
import { PeriodSelect } from '../components/forms';
import { SearchableSelect } from '../components/SearchableSelect';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import {
  Badge, EmptyState, ErrorState, Field, FormSection, Loading, Modal, PageHeader, ReasonDialog, Stat, useToast,
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

  const runList = Array.isArray(runs.data) ? runs.data : (runs.data?.data ?? []);

  const handleExportPreview = () => {
    const lines = preview.data?.lines;
    if (!lines || !Array.isArray(lines) || !lines.length) return;
    downloadCsv(`revenue-preview-${periodId || today()}.csv`, [
      ['الموظف', 'المشروع', 'الأساس', 'الوحدات', 'التخصيص%', 'الإيراد بالعملة الأساسية'],
      ...lines.map((l: any) => [
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
            <ExportMenu
              title="سجل تشغيلات محرك الإيرادات التشغيلي"
              columns={[
                { key: 'runNo', header: 'رقم التشغيل', width: 16 },
                { key: 'periodName', header: 'الفترة المالية', width: 18 },
                { key: 'projectCount', header: 'المشاريع', width: 10, type: 'number' },
                { key: 'employeeCount', header: 'الموظفون', width: 10, type: 'number' },
                { key: 'lineCount', header: 'الخطوط', width: 10, type: 'number' },
                { key: 'totalRevenueBase', header: 'إجمالي الإيراد', width: 16, type: 'currency', isTotal: true },
                { key: 'journalEntryNo', header: 'القيد المحاسبي', width: 16 },
                { key: 'status', header: 'الحالة', width: 12 },
              ]}
              data={runList}
            />
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
        ) : runList.length === 0 ? (
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
              {runList.map((r: any) => (
                <tr key={r.id}>
                  <td className="num">{r.runNo}</td>
                  <td>{r.periodName}</td>
                  <td className="num font-medium text-green-600">{money(r.totalRevenueBase)}</td>
                  <td>
                    <JournalLinkBadge entryId={r.journalEntryId} entryNo={r.journalEntryNo} compact />
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as any) || 'projects';
  const { filters, setFilters, resetAll, queryParams } = useReportFilters({
    syncUrl: true,
  });
  const periodId = filters.periodId;
  const fx = useReportCurrency(filters.currencyCode, filters.to || filters.asOf);
  const cv = (v: any) => fx.convert(v);
  const fm = (v: any) => money(cv(v));
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
  const projectSearch = filters.search;
  const empSearch = filters.search;
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [showRetroModal, setShowRetroModal] = useState(false);

  // Queries (Multi-dimensional filtering)
  const projectProf = useQuery({
    queryKey: ['/profitability/projects', queryParams],
    queryFn: () => api.get<any[]>('/profitability/projects', queryParams),
  });

  const empProf = useQuery({
    queryKey: ['/profitability/employees', queryParams],
    queryFn: () => api.get<any>('/profitability/employees', queryParams),
  });

  const clientProf = useQuery({
    queryKey: ['/profitability/clients', queryParams],
    queryFn: () => api.get<any[]>('/profitability/clients', queryParams),
  });

  const retroAdjustments = useQuery({
    queryKey: ['/revenue-adjustments/retroactive', periodId],
    queryFn: () => api.get<any>('/revenue-adjustments/retroactive', periodId ? { periodId } : {}),
  });
  const retroRows: any[] = Array.isArray(retroAdjustments.data) ? retroAdjustments.data : (retroAdjustments.data?.data ?? []);

  const overheadPolicy = useQuery({
    queryKey: ['/overhead-policy'],
    queryFn: () => api.get<any>('/overhead-policy'),
  });

  // Filtered lists
  const rawProjects: any[] = Array.isArray(projectProf.data)
    ? projectProf.data
    : ((projectProf.data as any)?.data ?? []);
  const filteredProjects = rawProjects.filter((p) =>
    !projectSearch || p.projectName?.toLowerCase().includes(projectSearch.toLowerCase()) || p.projectCode?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  const filteredEmps = (empProf.data?.employees ?? []).filter((e: any) =>
    !empSearch || e.employeeName?.toLowerCase().includes(empSearch.toLowerCase()) || e.employeeCode?.toLowerCase().includes(empSearch.toLowerCase())
  );

  const rawClients: any[] = Array.isArray(clientProf.data)
    ? clientProf.data
    : ((clientProf.data as any)?.data ?? []);

  const activeExportData =
    activeTab === 'projects'
      ? {
          title: 'تقرير ربحية المشاريع التعاقدية',
          columns: [
            { key: 'projectCode', header: 'كود المشروع', width: 14 },
            { key: 'projectName', header: 'اسم المشروع', width: 26 },
            { key: 'clientName', header: 'العميل', width: 22 },
            { key: 'revenueBase', header: 'الإيراد', width: 16, type: 'currency' as const, isTotal: true },
            { key: 'totalCostBase', header: 'إجمالي التكلفة', width: 16, type: 'currency' as const, isTotal: true },
            { key: 'grossProfitBase', header: 'صافي الربح', width: 16, type: 'currency' as const, isTotal: true },
          ],
          data: filteredProjects.map((r: any) => ({
            ...r,
            revenueBase: cv(r.revenueBase),
            totalCostBase: cv(r.totalCostBase),
            grossProfitBase: cv(r.grossProfitBase),
          })),
        }
      : activeTab === 'employees'
      ? {
          title: 'تقرير ربحية الكوادر والوقت غير المستغل',
          columns: [
            { key: 'employeeCode', header: 'الرمز', width: 12 },
            { key: 'employeeName', header: 'الموظف', width: 24 },
            { key: 'revenueBase', header: 'الإيراد المولد', width: 16, type: 'currency' as const, isTotal: true },
            { key: 'directCostBase', header: 'التكلفة المباشرة', width: 16, type: 'currency' as const, isTotal: true },
            { key: 'grossProfitBase', header: 'صافي الربح', width: 16, type: 'currency' as const, isTotal: true },
          ],
          data: filteredEmps.map((r: any) => ({
            ...r,
            revenueBase: cv(r.revenueBase),
            directCostBase: cv(r.directCostBase),
            grossProfitBase: cv(r.grossProfitBase),
          })),
        }
      : {
          title: 'تقرير ربحية العملاء',
          columns: [
            { key: 'clientCode', header: 'الكود', width: 12 },
            { key: 'clientName', header: 'العميل', width: 26 },
            { key: 'revenueBase', header: 'الإيراد', width: 16, type: 'currency' as const, isTotal: true },
            { key: 'totalCostBase', header: 'إجمالي التكلفة', width: 16, type: 'currency' as const, isTotal: true },
            { key: 'grossProfitBase', header: 'صافي الربح', width: 16, type: 'currency' as const, isTotal: true },
          ],
          data: rawClients.map((r: any) => ({
            ...r,
            revenueBase: cv(r.revenueBase),
            totalCostBase: cv(r.totalCostBase),
            grossProfitBase: cv(r.grossProfitBase),
          })),
        };

  return (
    <div className="space-y-5">
      <PageHeader
        title="لوحة الربحية الشاملة والمصروفات الإدارية"
        subtitle="تحليل الربحية متعدد المستويات (المشاريع، الموظفين مع الوقت غير المستغل، والعملاء) وفق وثيقة دورة العمل Business Process."
        icon={BarChart3}
        badge={
          <Badge color="emerald" dot>
            {fx.isConverted ? `تحليل 360° — ${fx.rateLabel}` : `تحليل 360° (${fx.targetCurrency})`}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title={activeExportData.title}
              filename={`profitability-${activeTab}-${periodId || today()}`}
              currency={fx.targetCurrency}
              columns={activeExportData.columns}
              data={activeExportData.data}
            />
            <button
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() =>
                void ExportEngine.exportPdf({
                  title: activeExportData.title,
                  subtitle: `تحليل الربحية الشامل متعدد المستويات بعملة العرض (${fx.rateLabel})`,
                  currency: fx.targetCurrency,
                  columns: activeExportData.columns,
                  data: activeExportData.data,
                })
              }
              title="طباعة ملكية A4 لتقرير الربحية"
            >
              <Printer className="size-3.5" /> طباعة ملكية
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

      {/* Interactive Profitability Overview Charts (Dynamic per Tab) */}
      {(activeTab === 'projects' || activeTab === 'employees' || activeTab === 'clients') && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:hidden">
          <ExecutiveChartCard
            title={
              activeTab === 'projects'
                ? 'مقارنة الإيراد مقابل التكلفة وصافي الربح للمشاريع'
                : activeTab === 'employees'
                ? 'مقارنة الإيراد مقابل التكلفة والربح لكل كادر'
                : 'مقارنة الإيراد مقابل التكلفة والربح لكل عميل'
            }
            subtitle={`تحليل بياني مباشر لأداء الربحية بعملة العرض (${fx.targetCurrency})`}
            icon={BarChart3}
            accent="emerald"
            className="lg:col-span-2"
          >
            <ExecutiveBarChart
              categories={(activeTab === 'projects'
                ? filteredProjects
                : activeTab === 'employees'
                ? filteredEmps
                : rawClients
              )
                .slice(0, 8)
                .map((item: any) => item.projectName || item.employeeName || item.clientName || '—')}
              series={[
                {
                  name: 'الإيراد',
                  data: (activeTab === 'projects' ? filteredProjects : activeTab === 'employees' ? filteredEmps : rawClients)
                    .slice(0, 8)
                    .map((item: any) => cv(item.revenueBase || 0)),
                  color: '#4f46e5',
                  colorEnd: '#6366f1',
                },
                {
                  name: 'إجمالي التكلفة',
                  data: (activeTab === 'projects' ? filteredProjects : activeTab === 'employees' ? filteredEmps : rawClients)
                    .slice(0, 8)
                    .map((item: any) => cv(item.totalCostBase ?? item.directCostBase ?? 0)),
                  color: '#f59e0b',
                  colorEnd: '#d97706',
                },
                {
                  name: 'صافي الربح',
                  data: (activeTab === 'projects' ? filteredProjects : activeTab === 'employees' ? filteredEmps : rawClients)
                    .slice(0, 8)
                    .map((item: any) => cv(item.grossProfitBase || 0)),
                  color: '#10b981',
                  colorEnd: '#059669',
                },
              ]}
              height={225}
              unit={fx.targetCurrency}
              emptyText="لا توجد بيانات ربحية مسجلة للفترة المختارة"
            />
          </ExecutiveChartCard>

          <ExecutiveChartCard
            title="توزيع حصة الإيرادات"
            subtitle={`أعلى العناصر مساهمة في إجمالي الإيراد (${fx.targetCurrency})`}
            icon={PieChart}
            accent="indigo"
          >
            <ExecutiveDonutChart
              data={(activeTab === 'projects' ? filteredProjects : activeTab === 'employees' ? filteredEmps : rawClients)
                .filter((item: any) => Number(item.revenueBase || 0) > 0)
                .slice(0, 6)
                .map((item: any) => ({
                  name: item.projectName || item.employeeName || item.clientName || '—',
                  value: cv(item.revenueBase || 0),
                }))}
              centerValue={fm(
                (activeTab === 'projects' ? filteredProjects : activeTab === 'employees' ? filteredEmps : rawClients).reduce(
                  (s: number, item: any) => s + Number(item.revenueBase || 0),
                  0,
                ),
              )}
              centerLabel="إجمالي الإيراد"
              height={225}
              unit={fx.targetCurrency}
              emptyText="لا توجد إيرادات"
            />
          </ExecutiveChartCard>
        </div>
      )}

      {/* Period Selection & Tab Bar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Field label="الفترة المالية">
            <ReportFilterBar
            filters={filters}
            onChange={setFilters}
            onReset={resetAll}
            showPeriod
            showDateRange
            showCostCenter
            showClient
            showProject
            showEmployee
            showDepartment
            showCurrency
            showSearch
            searchPlaceholder="ابحث باسم المشروع أو الكادر أو العميل..."
          />
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
              <History className="size-3.5" /> التسويات والأثر الرجعي (Sec 18 & 29)
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
                  onChange={(e) => setFilters({ search: e.target.value })}
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
                                <td className="num font-bold text-emerald-600">{fm(p.revenueBase)}</td>
                                <td className="num">{fm(p.employeeCostBase)}</td>
                                <td className="num text-purple-600">{fm(p.projectVariablesBase)}</td>
                                <td className="num text-slate-500">{fm(p.overheadBase)}</td>
                                <td className="num font-medium">{fm(p.totalCostBase)}</td>
                                <td className={`num font-bold ${Number(p.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                                  {fm(p.grossProfitBase)}
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
                                        {(p.teamMembers ?? []).map((tm: any, idx: number) => (
                                          <div key={idx} className="card p-2 bg-white dark:bg-slate-900 border text-[11px] flex justify-between items-center">
                                            <div>
                                              <span className="font-mono text-brand-600 font-semibold">{tm.employeeCode}</span>
                                              <span className="ms-1.5 font-medium">{tm.employeeName}</span>
                                            </div>
                                            <div className="text-end">
                                              <div className="font-bold text-slate-800 dark:text-slate-200">{fm(tm.costBase)}</div>
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
                <Stat label={`إجمالي إيراد الموظفين (${fx.targetCurrency})`} value={fm(empProf.data.summary.totalRevenueBase)} tone="green" />
                <Stat label={`إجمالي تكلفة الموظفين (${fx.targetCurrency})`} value={fm(empProf.data.summary.totalCostBase)} />
                <Stat
                  label={`تكلفة الوقت الضائع (${fx.targetCurrency})`}
                  value={fm(empProf.data.summary.totalUnutilizedCostBase)}
                  tone="amber"
                  hint="تكلفة الشركة للموظفين دون تخصيص مشاريع"
                />
                <Stat
                  label={`صافي أرباح الموظفين (${fx.targetCurrency})`}
                  value={fm(empProf.data.summary.totalProfitBase)}
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
                  onChange={(e) => setFilters({ search: e.target.value })}
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
                                {fm(e.unutilizedCostBase)}
                              </td>
                              <td className="num">{fm(e.directCostBase)}</td>
                              <td className="num text-slate-500">{fm(e.overheadBase)}</td>
                              <td className="num font-bold text-emerald-600">{fm(e.revenueBase)}</td>
                              <td className={`num font-bold ${Number(e.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                                {fm(e.grossProfitBase)}
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
                                      {(e.projects ?? []).map((pr: any, i: number) => (
                                        <div key={i} className="card p-2 bg-white dark:bg-slate-900 border text-[11px] flex justify-between items-center">
                                          <div>
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">{pr.projectName} ({pr.projectCode})</div>
                                            <div className="text-[10px] text-slate-400">تخصيص: {pr.effectiveAllocationPct}%</div>
                                          </div>
                                          <div className="text-end">
                                            <div className="text-emerald-600 font-bold">إيراد: {fm(pr.revenueBase)}</div>
                                            <div className="text-slate-500">تكلفة: {fm(pr.costBase)}</div>
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
                  {(Array.isArray(clientProf.data) ? clientProf.data : (clientProf.data as any)?.data || [])
                .filter((c: any) => !filters.search || c.clientName?.toLowerCase().includes(filters.search.toLowerCase()) || c.clientCode?.toLowerCase().includes(filters.search.toLowerCase()))
                .map((c: any) => {
                    const margin = c.grossMarginPct != null ? Number(c.grossMarginPct) : null;
                    return (
                      <tr key={c.clientId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{c.clientName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{c.clientCode}</div>
                        </td>
                        <td className="num font-mono font-semibold">{c.projectCount}</td>
                        <td className="num font-bold text-emerald-600">{fm(c.revenueBase)}</td>
                        <td className="num">{fm(c.directCostBase)}</td>
                        <td className="num text-slate-500">{fm(c.overheadBase)}</td>
                        <td className="num font-medium">{fm(c.totalCostBase)}</td>
                        <td className={`num font-bold ${Number(c.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                          {fm(c.grossProfitBase)}
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
        <AdjustmentsAndRetroTab
          periodId={periodId}
          rows={retroRows}
          loading={retroAdjustments.isLoading}
          onOpenModal={() => setShowRetroModal(true)}
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: ['/revenue-adjustments/retroactive', periodId] });
            qc.invalidateQueries({ queryKey: ['/profitability/projects', periodId] });
            qc.invalidateQueries({ queryKey: ['/profitability/employees', periodId] });
            qc.invalidateQueries({ queryKey: ['/profitability/clients', periodId] });
            qc.invalidateQueries({ queryKey: ['/audit-log'] });
          }}
        />
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

      {/* Retroactive & General Result Adjustment Modal */}
      <CreateRetroactiveAdjustmentModal
        open={showRetroModal}
        currentPeriodId={periodId}
        onClose={() => setShowRetroModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/revenue-adjustments/retroactive', periodId] });
          qc.invalidateQueries({ queryKey: ['/profitability/projects', periodId] });
          qc.invalidateQueries({ queryKey: ['/profitability/employees', periodId] });
          qc.invalidateQueries({ queryKey: ['/profitability/clients', periodId] });
          qc.invalidateQueries({ queryKey: ['/audit-log'] });
        }}
      />
    </div>
  );
}

const ADJ_KIND_META: Record<string, { label: string; color: string; sign: '+' | '-' }> = {
  RETROACTIVE_REVENUE: { label: 'إيراد بأثر رجعي (Sec 18)', color: 'blue', sign: '+' },
  REVENUE: { label: 'تسوية إيراد مباشرة (Sec 29)', color: 'green', sign: '+' },
  DIRECT_COST: { label: 'تسوية تكلفة مباشرة (Sec 29)', color: 'amber', sign: '-' },
  OVERHEAD: { label: 'تسوية مصروفات إدارية (Sec 29)', color: 'purple', sign: '-' },
};

function AdjustmentsAndRetroTab({
  periodId,
  rows,
  loading,
  onOpenModal,
  onRefresh,
}: {
  periodId: string;
  rows: any[];
  loading: boolean;
  onOpenModal: () => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);

  const getAdjAmountBase = (r: any) =>
    Number(
      r.adjustmentAmountBase ??
      (r.adjustmentKind === 'DIRECT_COST'
        ? r.directCostBase
        : r.adjustmentKind === 'OVERHEAD'
          ? r.overheadBase
          : r.grossRevenueBase) ??
      0,
    );

  const filtered = rows.filter((r: any) => kindFilter === 'ALL' || (r.adjustmentKind || 'RETROACTIVE_REVENUE') === kindFilter);
  const approvedRows = filtered.filter((r: any) => !r.status || r.status === 'APPROVED' || r.status === 'RECORDED');
  const pendingCount = filtered.filter((r: any) => r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL').length;
  const revAdjTotal = approvedRows
    .filter((r: any) => (r.adjustmentKind || 'RETROACTIVE_REVENUE') === 'RETROACTIVE_REVENUE' || r.adjustmentKind === 'REVENUE')
    .reduce((s: number, r: any) => s + getAdjAmountBase(r), 0);
  const costAdjTotal = approvedRows
    .filter((r: any) => r.adjustmentKind === 'DIRECT_COST' || r.adjustmentKind === 'OVERHEAD')
    .reduce((s: number, r: any) => s + getAdjAmountBase(r), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 p-3 text-xs text-blue-900 dark:text-blue-200 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 max-w-4xl">
          <History className="size-4 shrink-0 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <strong>تسويات الإيراد بأثر رجعي وتسويات النتائج الإدارية (Sections 18 & 29):</strong>
            <p>
              لا يتم المساس بأرقام الفترات التاريخية المغلقة مطلقاً؛ بل تُسجل تسويات الإيراد بأثر رجعي (Section 18) أو تسويات النتائج المعتمدة — إيراد / تكلفة مباشرة / مصروفات عامة (Section 29) داخل الفترة المفتوحة مع دورة اعتماد كاملة (Draft → Pending → Approved/Rejected) وقيد محاسبي تلقائي وسجل تدقيق.
            </p>
          </div>
        </div>
        <button className="btn-primary text-xs flex items-center gap-1.5 shrink-0" onClick={onOpenModal}>
          <Plus className="size-4" /> إضافة تسوية جديدة
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="صافي تسويات الإيراد المعتمدة" value={money(revAdjTotal)} tone="green" hint="أثر رجعي + تسويات إيراد" />
        <Stat label="تسويات التكاليف والأوفرهيد" value={money(costAdjTotal)} tone={costAdjTotal > 0 ? 'amber' : undefined} hint="تكاليف مباشرة ومصروفات عامة" />
        <Stat label="تسويات قيد المراجعة" value={String(pendingCount)} tone={pendingCount > 0 ? 'amber' : undefined} hint="مسودات وبانتظار الاعتماد" />
        <div className="card p-3 flex flex-col justify-center">
          <span className="text-[11px] font-bold text-slate-500 mb-1">تصفية حسب نوع التسوية</span>
          <select className="input h-8 text-xs" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
            <option value="ALL">جميع التسويات ({rows.length})</option>
            <option value="RETROACTIVE_REVENUE">أثر رجعي للإيراد (Sec 18)</option>
            <option value="REVENUE">تسوية إيراد مباشرة (Sec 29)</option>
            <option value="DIRECT_COST">تسوية تكلفة مباشرة (Sec 29)</option>
            <option value="OVERHEAD">تسوية مصروفات إدارية (Sec 29)</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <EmptyState text="لا توجد تسويات مسجلة لهذه الفترة." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr>
                  <th>نوع التسوية</th>
                  <th>الموظف / المشروع / العميل</th>
                  <th>الفترة الأصلية → التسجيل</th>
                  <th>البيان والوحدات</th>
                  <th className="num">المبلغ المسوى</th>
                  <th>القيد الآلي</th>
                  <th>الحالة (Workflow)</th>
                  <th>سبب التسوية والتدقيق</th>
                  <th>إجراءات الاعتماد</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const kindKey = r.adjustmentKind || 'RETROACTIVE_REVENUE';
                  const kindMeta = ADJ_KIND_META[kindKey] || ADJ_KIND_META.RETROACTIVE_REVENUE;
                  const st = r.status || 'APPROVED';
                  const statusBadge = st === 'DRAFT'
                    ? <Badge color="slate">مسودة (Draft)</Badge>
                    : st === 'PENDING_APPROVAL'
                      ? <Badge color="amber">بانتظار الاعتماد (Pending)</Badge>
                      : st === 'REJECTED'
                        ? <Badge color="red">مرفوضة (Rejected)</Badge>
                        : <Badge color="green">معتمدة (Approved)</Badge>;

                  return (
                    <tr key={r.id}>
                      <td><Badge color={kindMeta.color}>{kindMeta.label}</Badge></td>
                      <td>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{r.employeeName || '— (على مستوى المشروع/الشركة)'}</div>
                        <div className="text-[11px] text-slate-500">
                          {r.projectName || 'بدون مشروع محدد'} {r.clientName ? `• ${r.clientName}` : ''}
                        </div>
                      </td>
                      <td className="font-mono text-[11px]">
                        <span className="text-purple-600 font-medium">{r.originalPeriodName || periodId}</span>
                        <span className="mx-1 text-slate-400">←</span>
                        <span>{r.periodName || periodId}</span>
                      </td>
                      <td>
                        {kindKey === 'RETROACTIVE_REVENUE' ? (
                          <span>
                            {r.pricingBasis === 'MONTHLY' ? 'شهري' : r.pricingBasis === 'DAILY' ? 'يومي' : 'ساعي'} ({Number(r.units || 0).toFixed(2)} × {money(r.unitPrice || 0)})
                          </span>
                        ) : (
                          <span className="text-slate-500">تسوية إدارية مباشرة</span>
                        )}
                      </td>
                      <td className={`num font-bold ${kindMeta.sign === '+' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {kindMeta.sign} {money(getAdjAmountBase(r))}
                      </td>
                      <td><JournalLinkBadge entryId={r.journalEntryId} entryNo={r.journalEntryNo} compact /></td>
                      <td>{statusBadge}</td>
                      <td className="max-w-xs">
                        <div className="truncate font-medium" title={r.adjustmentReason}>{r.adjustmentReason}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {r.createdByName ? `أنشأها: ${r.createdByName}` : ''}
                          {r.approvedByName ? ` • اعتمدها: ${r.approvedByName}` : ''}
                          {r.rejectionReason ? ` • سبب الرفض: ${r.rejectionReason}` : ''}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {st === 'DRAFT' && (
                            <button
                              className="btn-secondary text-[11px] px-2 py-0.5 font-bold flex items-center gap-1"
                              onClick={async () => {
                                await api.post(`/revenue-adjustments/${r.id}/submit`, {});
                                toast.success('تم إرسال التسوية للاعتماد (Pending Approval)');
                                onRefresh();
                              }}
                            >
                              <Send className="size-3" /> إرسال للاعتماد
                            </button>
                          )}
                          {(st === 'DRAFT' || st === 'PENDING_APPROVAL') && (
                            <>
                              <button
                                className="btn-primary text-[11px] px-2 py-0.5 font-bold flex items-center gap-1"
                                onClick={async () => {
                                  await api.post(`/revenue-adjustments/${r.id}/approve`, {});
                                  toast.success('تم اعتماد التسوية وترحيل قيدها وتحديث الربحية');
                                  onRefresh();
                                }}
                              >
                                <CheckCircle2 className="size-3" /> اعتماد
                              </button>
                              <button
                                className="btn-danger text-[11px] px-2 py-0.5 font-bold flex items-center gap-1"
                                onClick={() => setRejectTarget(r)}
                              >
                                <XCircle className="size-3" /> رفض
                              </button>
                            </>
                          )}
                          {(st === 'APPROVED' || st === 'RECORDED' || st === 'REJECTED') && (
                            <span className="text-[11px] text-slate-400">مكتمل وموثّق</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReasonDialog
        open={!!rejectTarget}
        danger
        title="رفض التسوية (مع التوثيق في سجل التدقيق)"
        confirmText="تأكيد الرفض"
        onClose={() => setRejectTarget(null)}
        onConfirm={async (reason) => {
          if (!rejectTarget) return;
          await api.post(`/revenue-adjustments/${rejectTarget.id}/reject`, { reason });
          toast.success('تم رفض التسوية وتوثيق السبب');
          setRejectTarget(null);
          onRefresh();
        }}
      />
    </div>
  );
}

// ============================================================================
// Create Retroactive Revenue OR Sec 29 Management Result Adjustment Modal
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
  const [adjustmentKind, setAdjustmentKind] = useState<'RETROACTIVE_REVENUE' | 'REVENUE' | 'DIRECT_COST' | 'OVERHEAD'>('RETROACTIVE_REVENUE');
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [originalPeriodId, setOriginalPeriodId] = useState('fp-2026-10');
  const [fiscalPeriodId, setFiscalPeriodId] = useState(currentPeriodId || 'fp-2026-11');
  const [pricingBasis, setPricingBasis] = useState<'MONTHLY' | 'DAILY' | 'HOURLY'>('DAILY');
  const [units, setUnits] = useState('2');
  const [unitPrice, setUnitPrice] = useState('1000');
  const [amount, setAmount] = useState('2000');
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [busy, setBusy] = useState(false);

  const employees = useQuery({
    queryKey: ['ref', '/employees', undefined],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Page<any>>('/employees', { pageSize: 200 }),
  });
  const projects = useQuery({
    queryKey: ['ref', '/projects', undefined],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => api.get<Page<any>>('/projects', { pageSize: 200 }),
  });

  useEffect(() => {
    if (open && currentPeriodId) setFiscalPeriodId(currentPeriodId);
  }, [open, currentPeriodId]);

  const handleSubmit = async (initialStatus: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' = 'APPROVED') => {
    if (busy) return;
    if (!fiscalPeriodId) {
      toast.error(new Error('يرجى اختيار فترة التسجيل'));
      return;
    }
    if (adjustmentKind === 'RETROACTIVE_REVENUE' && (!employeeId || !projectId || !originalPeriodId)) {
      toast.error(new Error('يرجى استكمال اختيار الموظف والمشروع والفترة الأصلية'));
      return;
    }
    if (adjustmentKind !== 'RETROACTIVE_REVENUE' && (!amount || Number(amount) <= 0)) {
      toast.error(new Error('يرجى إدخال مبلغ التسوية الموجب'));
      return;
    }
    if (!adjustmentReason.trim()) {
      toast.error(new Error('يرجى كتابة سبب التسوية للرقابة والتدقيق'));
      return;
    }

    setBusy(true);
    try {
      if (adjustmentKind === 'RETROACTIVE_REVENUE') {
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
          status: initialStatus,
        });
      } else {
        await api.post('/revenue-adjustments/general', {
          adjustmentKind,
          employeeId: employeeId || undefined,
          projectId: projectId || undefined,
          fiscalPeriodId,
          amount: Number(amount),
          currencyCode,
          adjustmentReason,
          status: initialStatus,
        });
      }

      toast.success(
        initialStatus === 'DRAFT'
          ? 'تم حفظ التسوية كمسودة (Draft) للمراجعة'
          : initialStatus === 'PENDING_APPROVAL'
            ? 'تم رفع التسوية لبانتظار الاعتماد (Pending Approval)'
            : 'تم تسجيل واعتماد التسوية وترحيل أثرها في الربحية والقيود',
      );
      setAdjustmentReason('');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const employeeOpts = (Array.isArray(employees.data) ? employees.data : (employees.data?.data ?? [])).map((e: any) => ({
    value: e.id,
    label: `${e.code} — ${e.fullNameAr}`,
  }));
  const projectOpts = (Array.isArray(projects.data) ? projects.data : (projects.data?.data ?? [])).map((p: any) => ({
    value: p.id,
    label: `${p.code} — ${p.nameAr}`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dirty={Boolean(employeeId || projectId || adjustmentReason)}
      saving={busy}
      onSaveShortcut={() => handleSubmit('APPROVED')}
      title="تسجيل تسوية إيراد أثر رجعي / تسوية نتائج إدارية (Sec 18 & 29)"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>إلغاء</button>
          <button type="button" className="btn-secondary" onClick={() => handleSubmit('DRAFT')} disabled={busy}>
            حفظ كمسودة (Draft)
          </button>
          <button type="button" className="btn-secondary border-amber-500/40 text-amber-700 dark:text-amber-300" onClick={() => handleSubmit('PENDING_APPROVAL')} disabled={busy}>
            إرسال للاعتماد (Pending)
          </button>
          <button type="button" className="btn-primary" onClick={() => handleSubmit('APPROVED')} disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'اعتماد فوري'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <FormSection title="تصنيف التسوية ونطاقها" subtitle="تحديد هل هي تسوية أثر رجعي أم تسوية نتائج إدارية (Section 29)" columns={2}>
          <Field label="نوع التسوية" required>
            <select className="input w-full" value={adjustmentKind} onChange={(e) => setAdjustmentKind(e.target.value as any)}>
              <option value="RETROACTIVE_REVENUE">تسوية إيراد بأثر رجعي لشهر سابق مغلق (Sec 18)</option>
              <option value="REVENUE">تسوية إيراد إضافية مباشرة (Sec 29)</option>
              <option value="DIRECT_COST">تسوية تكلفة مباشرة لمشروع/موظف (Sec 29)</option>
              <option value="OVERHEAD">تسوية مصروفات إدارية وعامة Overhead (Sec 29)</option>
            </select>
          </Field>
          <Field label="فترة التسجيل والاعتراف (الفترة المفتوحة)" required>
            <PeriodSelect value={fiscalPeriodId} onChange={setFiscalPeriodId} className="w-full" />
          </Field>
        </FormSection>

        <FormSection title="الأطراف المرتبطة" subtitle={adjustmentKind === 'OVERHEAD' ? 'اختياري لتسويات المصروفات العامة' : 'تحديد الموظف والمشروع والفترة الأصلية'} columns={2}>
          <Field label={adjustmentKind === 'RETROACTIVE_REVENUE' ? 'الموظف' : 'الموظف (اختياري)'} required={adjustmentKind === 'RETROACTIVE_REVENUE'}>
            <SearchableSelect
              clearable={adjustmentKind !== 'RETROACTIVE_REVENUE'}
              loading={employees.isLoading}
              options={employeeOpts}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="— ابحث واختر الموظف —"
            />
          </Field>
          <Field label={adjustmentKind === 'RETROACTIVE_REVENUE' ? 'المشروع' : 'المشروع (اختياري)'} required={adjustmentKind === 'RETROACTIVE_REVENUE'}>
            <SearchableSelect
              clearable={adjustmentKind !== 'RETROACTIVE_REVENUE'}
              loading={projects.isLoading}
              options={projectOpts}
              value={projectId}
              onChange={setProjectId}
              placeholder="— ابحث واختر المشروع —"
            />
          </Field>
          {adjustmentKind === 'RETROACTIVE_REVENUE' && (
            <Field label="الفترة المالية الأصلية (تاريخ العمل الفعلي)" required>
              <PeriodSelect value={originalPeriodId} onChange={setOriginalPeriodId} className="w-full" />
            </Field>
          )}
        </FormSection>

        <FormSection title="تفاصيل القيمة والعملة" columns={2}>
          {adjustmentKind === 'RETROACTIVE_REVENUE' ? (
            <>
              <Field label="أساس التسعير">
                <select className="input w-full" value={pricingBasis} onChange={(e) => setPricingBasis(e.target.value as any)}>
                  <option value="DAILY">يومي (Daily)</option>
                  <option value="HOURLY">ساعي (Hourly)</option>
                  <option value="MONTHLY">شهري (Monthly)</option>
                </select>
              </Field>
              <Field label="عدد الوحدات (أيام/ساعات)">
                <input type="number" step="0.5" min="0" className="input w-full font-mono" value={units} onChange={(e) => setUnits(e.target.value)} />
              </Field>
              <Field label="سعر الوحدة">
                <input type="number" step="1" min="0" className="input w-full font-mono" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="مبلغ التسوية" required>
              <input type="number" step="0.01" min="0" className="input w-full font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          )}
          <Field label="العملة">
            <select className="input w-full font-mono" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="SAR">SAR</option>
              <option value="EGP">EGP</option>
              <option value="USD">USD</option>
              <option value="AED">AED</option>
              <option value="EUR">EUR</option>
            </select>
          </Field>
        </FormSection>

        <FormSection title="مبررات التسوية والمراجعة (Audit Trail)" columns={1}>
          <Field label="سبب التسوية (إلزامي للرقابة والتدقيق)" required>
            <textarea
              className="input w-full min-h-[76px] py-2"
              placeholder="مثال: تعديل متفق عليه مع العميل أو تسوية فرق تكلفة مباشرة..."
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
            />
          </Field>
        </FormSection>
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
