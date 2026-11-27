import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  CheckCircle2,
  Coins,
  FolderTree,
  Layers,
  ListChecks,
  Network,
  PieChart,
  RefreshCw,
  Settings2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, money } from '../lib/format';
import { COST_CENTER_TYPE_LABELS } from '../lib/reports-analytics-engine';
import { ExportMenu } from '../components/ExportMenu';
import {
  ExecutiveBarChart,
  ExecutiveChartCard,
  ExecutiveDonutChart,
  ROYAL_PALETTE,
} from '../components/ExecutiveCharts';
import {
  ReportFilterBar,
  buildFilterQueryString,
  useReportFilters,
} from '../components/ReportFilterBar';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat } from '../components/ui';

type LevelTab = 'hierarchy' | 'accounts' | 'projects' | 'employees' | 'movements';

export function CostCentersReportPage() {
  const base = useBaseCurrency();
  const [tab, setTab] = useState<LevelTab>('hierarchy');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [showAllExpanded, setShowAllExpanded] = useState(true);

  const { filters, setFilters, resetAll, queryParams } = useReportFilters({
    syncUrl: true,
    defaultLedger: 'FINANCIAL',
  });

  const q = useQuery({
    queryKey: ['report-cost-centers', queryParams],
    queryFn: () => api.get<any>('/reports/cost-centers', queryParams),
  });

  const data = q.data;
  const summary = data?.summary ?? {};
  const reconciliation = data?.reconciliation ?? {};
  const hierarchy: any[] = data?.hierarchy ?? [];
  const byAccount: any[] = data?.byAccount ?? [];
  const byProjectAndClient: any[] = data?.byProjectAndClient ?? [];
  const byEmployee: any[] = data?.byEmployee ?? [];
  const movements: any[] = data?.movements ?? [];

  const searchQ = (filters.search || '').trim().toLowerCase();
  const matchText = (...parts: any[]) =>
    !searchQ || parts.some((p) => String(p ?? '').toLowerCase().includes(searchQ));

  const visibleHierarchy = useMemo(() => {
    const baseList = hierarchy.filter((r) =>
      matchText(r.code, r.nameAr, r.nameEn, COST_CENTER_TYPE_LABELS[r.ccType]),
    );
    if (showAllExpanded || searchQ) return baseList;
    const byId = new Map(hierarchy.map((r) => [r.id, r]));
    return baseList.filter((r) => {
      let cur = r.parentId;
      while (cur && byId.has(cur)) {
        if (!expandedIds.has(cur)) return false;
        cur = byId.get(cur).parentId;
      }
      return true;
    });
  }, [hierarchy, showAllExpanded, expandedIds, searchQ]);

  const filteredAccounts = useMemo(
    () =>
      byAccount.filter((r) =>
        matchText(r.costCenterCode, r.costCenterName, r.accountCode, r.accountNameAr, r.sectionNameAr),
      ),
    [byAccount, searchQ],
  );

  const filteredProjects = useMemo(
    () =>
      byProjectAndClient.filter((r) =>
        matchText(r.costCenterCode, r.costCenterName, r.projectCode, r.projectName, r.clientName),
      ),
    [byProjectAndClient, searchQ],
  );

  const filteredEmployees = useMemo(
    () =>
      byEmployee.filter((r) =>
        matchText(r.costCenterCode, r.costCenterName, r.employeeCode, r.employeeName, ...(r.projectNames || [])),
      ),
    [byEmployee, searchQ],
  );

  const filteredMovements = useMemo(
    () =>
      movements.filter((m) =>
        matchText(
          m.entryNo,
          m.accountCode,
          m.accountNameAr,
          m.costCenterCode,
          m.costCenterName,
          m.projectName,
          m.clientName,
          m.employeeName,
          m.description,
        ),
      ),
    [movements, searchQ],
  );

  const toggleExpand = (id: string) => {
    if (showAllExpanded) {
      const next = new Set(hierarchy.filter((x) => x.hasChildren && x.id !== id).map((x) => x.id));
      setShowAllExpanded(false);
      setExpandedIds(next);
      return;
    }
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  // Charts Data (use leaf/non-duplicate rows so visual totals don't double-count parents + children)
  const leafOrVisibleCenters = useMemo(() => {
    const nonParent = hierarchy.filter((r) => !r.hasChildren);
    return (nonParent.length > 0 ? nonParent : hierarchy).slice(0, 12);
  }, [hierarchy]);

  const barCategories = useMemo(
    () => leafOrVisibleCenters.map((c) => `${c.code} — ${c.nameAr}`),
    [leafOrVisibleCenters],
  );

  const barSeries = useMemo(
    () => [
      {
        name: 'الإيرادات',
        data: leafOrVisibleCenters.map((c) => Number(c.revenue || 0)),
        color: '#10b981',
        colorEnd: '#059669',
      },
      {
        name: 'إجمالي التكاليف',
        data: leafOrVisibleCenters.map((c) => Number(c.totalCost || 0)),
        color: '#f43f5e',
        colorEnd: '#e11d48',
      },
      {
        name: 'صافي المساهمة',
        data: leafOrVisibleCenters.map((c) => Number(c.netContribution || 0)),
        color: '#4f46e5',
        colorEnd: '#4338ca',
      },
    ],
    [leafOrVisibleCenters],
  );

  const donutCostSlices = useMemo(() => {
    const slices = leafOrVisibleCenters
      .map((c, idx) => ({
        name: c.nameAr,
        value: Math.max(0, Number(c.totalCost || 0)),
        color: c.id === 'UNASSIGNED' ? '#f59e0b' : ROYAL_PALETTE[idx % ROYAL_PALETTE.length],
      }))
      .filter((s) => s.value > 0);
    return slices;
  }, [leafOrVisibleCenters]);

  const reconciled = reconciliation.reconciled !== false;
  const unassignedPct = Number(summary.unassignedCostPct || 0);
  const netContrib = Number(summary.netContribution || 0);

  const exportCols = [
    { key: 'code', header: 'رمز المركز', width: 14 },
    { key: 'nameAr', header: 'مركز التكلفة', width: 28 },
    { key: 'ccTypeLabel', header: 'التصنيف', width: 16 },
    { key: 'revenue', header: `الإيرادات (${base})`, width: 16, type: 'currency' as const },
    { key: 'directCost', header: `تكلفة مباشرة (${base})`, width: 16, type: 'currency' as const },
    { key: 'operatingExpense', header: `مصروفات تشغيلية (${base})`, width: 16, type: 'currency' as const },
    { key: 'totalCost', header: `إجمالي التكلفة (${base})`, width: 16, type: 'currency' as const },
    { key: 'netContribution', header: `صافي المساهمة (${base})`, width: 16, type: 'currency' as const },
    { key: 'marginPct', header: 'الهامش %', width: 11, type: 'percent' as const },
    { key: 'shareOfTotalCostPct', header: 'حصة التكلفة %', width: 12, type: 'percent' as const },
  ];

  const exportRows = useMemo(
    () =>
      hierarchy.map((r) => ({
        code: r.code,
        nameAr: `${r.level > 1 ? `${'— '.repeat(r.level - 1)}` : ''}${r.nameAr}`,
        ccTypeLabel: r.id === 'UNASSIGNED' ? 'غير مرتبط بمركز' : COST_CENTER_TYPE_LABELS[r.ccType] || r.ccType,
        revenue: Number(r.revenue || 0),
        directCost: Number(r.directCost || 0),
        operatingExpense: Number(r.operatingExpense || 0),
        totalCost: Number(r.totalCost || 0),
        netContribution: Number(r.netContribution || 0),
        marginPct: Number(r.marginPct || 0),
        shareOfTotalCostPct: Number(r.shareOfTotalCostPct || 0),
      })),
    [hierarchy],
  );

  const tabsList: Array<{ id: LevelTab; label: string; count?: number; icon: any }> = [
    { id: 'hierarchy', label: 'المستوى 1: التسلسل الهرمي للمراكز', count: hierarchy.length, icon: FolderTree },
    { id: 'accounts', label: 'المستوى 2: المراكز × الحسابات', count: filteredAccounts.length, icon: Layers },
    { id: 'projects', label: 'المستوى 3: المراكز × المشاريع والعملاء', count: filteredProjects.length, icon: Briefcase },
    { id: 'employees', label: 'المستوى 4: المراكز × الموظفين', count: filteredEmployees.length, icon: Users },
    { id: 'movements', label: 'المستوى 5: تفاصيل القيود التحليلية', count: filteredMovements.length, icon: ListChecks },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="تقرير مراكز التكلفة التحليلي على كل المستويات"
        subtitle={`تجميع هرمي بدون ازدواجية حساب مع مطابقة 100% لقائمة الدخل (${base}) وتحليل المشاريع والعملاء والموظفين والحسابات.`}
        icon={Network}
        badge={
          reconciled ? (
            <Badge color="green" dot>متطابق 100% مع قائمة الدخل</Badge>
          ) : (
            <Badge color="amber" dot>فرق {money(reconciliation.difference)} (بحسب فلتر النوع)</Badge>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/reports/hub" className="btn-secondary text-xs flex items-center gap-1.5">
              <PieChart className="size-3.5 text-indigo-600" /> مركز التقارير الموحد
            </Link>
            <Link to="/org/cost-centers" className="btn-secondary text-xs flex items-center gap-1.5">
              <Settings2 className="size-3.5 text-slate-600" /> إدارة مراكز التكلفة
            </Link>
            <button type="button" onClick={() => q.refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" /> تحديث
            </button>
            <ExportMenu
              title="تقرير مراكز التكلفة على كل المستويات"
              subtitle={`التسلسل الهرمي للمراكز والحسابات والمشاريع والعملاء والموظفين (${base})`}
              filename={`cost-centers-report-${filters.from}-${filters.to}`}
              periodLabel={`من ${filters.from} إلى ${filters.to}`}
              currency={base}
              summaryKpis={[
                { label: 'إجمالي الإيرادات', value: `${money(summary.totalRevenue || 0)} ${base}`, tone: 'emerald' },
                { label: 'إجمالي التكاليف', value: `${money(summary.totalCost || 0)} ${base}`, tone: 'rose' },
                { label: 'صافي المساهمة', value: `${money(summary.netContribution || 0)} ${base}`, tone: netContrib >= 0 ? 'indigo' : 'rose' },
                { label: 'ربح قائمة الدخل (GL)', value: `${money(reconciliation.incomeStatementNetProfit || 0)} ${base}`, tone: 'navy' },
              ]}
              columns={exportCols}
              data={exportRows}
              additionalSheets={[
                {
                  sheetName: 'المراكز × الحسابات',
                  title: 'تحليل مراكز التكلفة حسب الحسابات',
                  columns: [
                    { key: 'costCenterCode', header: 'رمز المركز', width: 14 },
                    { key: 'costCenterName', header: 'مركز التكلفة', width: 24 },
                    { key: 'accountCode', header: 'كود الحساب', width: 14 },
                    { key: 'accountNameAr', header: 'الحساب', width: 26 },
                    { key: 'sectionNameAr', header: 'التصنيف', width: 20 },
                    { key: 'debit', header: 'مدين', width: 14, type: 'currency' as const },
                    { key: 'credit', header: 'دائن', width: 14, type: 'currency' as const },
                    { key: 'netAmount', header: 'الصافي', width: 14, type: 'currency' as const },
                  ],
                  data: filteredAccounts.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit), netAmount: Number(r.netAmount) })),
                },
                {
                  sheetName: 'المراكز × المشاريع',
                  title: 'تحليل مراكز التكلفة حسب المشاريع والعملاء',
                  columns: [
                    { key: 'costCenterName', header: 'مركز التكلفة', width: 24 },
                    { key: 'clientName', header: 'العميل', width: 24 },
                    { key: 'projectName', header: 'المشروع', width: 24 },
                    { key: 'revenue', header: 'الإيرادات', width: 14, type: 'currency' as const },
                    { key: 'totalCost', header: 'التكاليف', width: 14, type: 'currency' as const },
                    { key: 'netProfit', header: 'صافي الربح', width: 14, type: 'currency' as const },
                  ],
                  data: filteredProjects.map((r) => ({ ...r, revenue: Number(r.revenue), totalCost: Number(r.totalCost), netProfit: Number(r.netProfit) })),
                },
                {
                  sheetName: 'المراكز × الموظفين',
                  title: 'تحليل مراكز التكلفة حسب الموظفين',
                  columns: [
                    { key: 'costCenterName', header: 'مركز التكلفة', width: 24 },
                    { key: 'employeeCode', header: 'الكود', width: 12 },
                    { key: 'employeeName', header: 'الموظف', width: 24 },
                    { key: 'revenueGenerated', header: 'الإيراد المحقق', width: 14, type: 'currency' as const },
                    { key: 'totalCost', header: 'التكلفة', width: 14, type: 'currency' as const },
                    { key: 'netContribution', header: 'صافي المساهمة', width: 14, type: 'currency' as const },
                  ],
                  data: filteredEmployees.map((r) => ({ ...r, revenueGenerated: Number(r.revenueGenerated), totalCost: Number(r.totalCost), netContribution: Number(r.netContribution) })),
                },
              ]}
            />
          </div>
        }
      />

      <ReportFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={resetAll}
        showPeriod
        showDateRange
        showCompare
        showCostCenter
        showCcType
        showClient
        showProject
        showEmployee
        showBranch
        showDepartment
        showLedger
        showSearch
        searchPlaceholder="ابحث عن مركز تكلفة، حساب، مشروع، عميل، أو موظف..."
      />

      {q.isLoading && <Loading />}
      {q.error && <ErrorState error={q.error} />}

      {!q.isLoading && !q.error && (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <Stat
              label="إيرادات مراكز التكلفة"
              value={`${money(summary.totalRevenue || 0)}`}
              hint={`إيرادات أخرى: ${money(summary.totalOtherIncome || 0)} ${base}`}
              tone="green"
              icon={Coins}
            />
            <Stat
              label="إجمالي التكاليف"
              value={`${money(summary.totalCost || 0)}`}
              hint={`مباشر: ${money(summary.totalDirectCost || 0)} | تشغيلي: ${money(summary.totalOperatingExpense || 0)}`}
              tone="red"
              icon={Layers}
            />
            <Stat
              label="صافي المساهمة والربحية"
              value={`${money(summary.netContribution || 0)}`}
              hint={`هامش المساهمة الكلي: ${summary.overallMarginPct || '0.0'}%`}
              tone={netContrib >= 0 ? 'indigo' : 'red'}
              icon={PieChart}
            />
            <Stat
              label="ربح قائمة الدخل المرجعي"
              value={`${money(reconciliation.incomeStatementNetProfit || 0)}`}
              hint={
                <span className="flex items-center gap-1">
                  {reconciled ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <AlertTriangle className="size-3.5 text-amber-500" />}
                  فارق التسوية: {money(reconciliation.difference || 0)}
                </span>
              }
              tone={reconciled ? 'teal' : 'amber'}
              icon={CheckCircle2}
            />
            <Stat
              label="غير مصنفة بمركز تكلفة"
              value={`${money(summary.unassignedCost || 0)}`}
              hint={`${unassignedPct}% من إجمالي التكاليف`}
              tone={unassignedPct > 15 ? 'amber' : 'slate'}
              icon={AlertTriangle}
            />
            <Stat
              label="المراكز النشطة"
              value={`${summary.activeCostCentersCount ?? hierarchy.length}`}
              hint={`إجمالي المعرّف: ${summary.costCentersCount ?? hierarchy.length} مركز`}
              tone="blue"
              icon={Network}
            />
          </div>

          {/* Interactive Charts */}
          {hierarchy.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ExecutiveChartCard
                title="الإيرادات والتكاليف وصافي المساهمة حسب المركز"
                subtitle="مقارنة الأداء المالي للمراكز التنفيذية والمستقلة دون تكرار الآباء"
                icon={Network}
                accent="indigo"
                className="lg:col-span-2"
              >
                <ExecutiveBarChart categories={barCategories} series={barSeries} height={260} unit={base} />
              </ExecutiveChartCard>

              <ExecutiveChartCard
                title="التوزيع النسبي لإجمالي التكاليف"
                subtitle="حصة كل مركز تكلفة والوعاء غير المخصص"
                icon={PieChart}
                accent="amber"
              >
                <ExecutiveDonutChart
                  data={donutCostSlices}
                  centerValue={`${money(summary.totalCost || 0)}`}
                  centerLabel={`إجمالي التكلفة (${base})`}
                  height={260}
                  unit={base}
                />
              </ExecutiveChartCard>
            </div>
          )}

          {/* Multi-Level Tabs */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-center gap-1.5">
                {tabsList.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        active
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span>{t.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                          active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {t.count ?? 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              {tab === 'hierarchy' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllExpanded(true);
                      setExpandedIds(new Set());
                    }}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    توسيع الكل
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllExpanded(false);
                      setExpandedIds(new Set());
                    }}
                    className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:underline"
                  >
                    طي الفروع
                  </button>
                </div>
              )}
            </div>

            {/* Level 1: Hierarchy Tree */}
            {tab === 'hierarchy' && (
              visibleHierarchy.length === 0 ? (
                <EmptyState text="لا توجد مراكز تكلفة أو حركات مالية مطابقة للفلاتر المحددة" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>المركز والهيكل الهرمي</th>
                        <th>النوع</th>
                        <th className="num">الإيرادات</th>
                        <th className="num">تكلفة مباشرة</th>
                        <th className="num">مصروف تشغيلي</th>
                        <th className="num">إجمالي التكلفة</th>
                        <th className="num">صافي المساهمة</th>
                        <th className="num">الهامش %</th>
                        <th className="num">حصة التكلفة %</th>
                        <th className="num">مشاريع / موظفين / قيود</th>
                        {filters.compareEnabled && (
                          <>
                            <th className="num">المساهمة السابقة</th>
                            <th className="num">التغير</th>
                          </>
                        )}
                        <th>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHierarchy.map((r) => {
                        const net = Number(r.netContribution || 0);
                        const isParent = Boolean(r.hasChildren);
                        const isSelected = filters.costCenterId === r.id;
                        const ccTypeBadge =
                          r.id === 'UNASSIGNED'
                            ? 'amber'
                            : r.ccType === 'DIRECT'
                              ? 'green'
                              : r.ccType === 'INDIRECT'
                                ? 'blue'
                                : 'purple';
                        return (
                          <tr
                            key={r.id}
                            className={`${isParent ? 'bg-slate-50/90 dark:bg-slate-900/70 font-bold' : ''} ${
                              isSelected ? 'ring-2 ring-inset ring-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30' : ''
                            }`}
                          >
                            <td>
                              <div
                                className="flex items-center gap-1.5"
                                style={{ paddingRight: `${Math.max(0, (r.level || 1) - 1) * 18}px` }}
                              >
                                {isParent ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(r.id)}
                                    className="size-5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center hover:border-indigo-500"
                                  >
                                    {showAllExpanded || expandedIds.has(r.id) ? '−' : '+'}
                                  </button>
                                ) : (
                                  <span className="inline-block w-5 text-center text-slate-400">•</span>
                                )}
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                  {r.code}
                                </span>
                                <span className={isParent ? 'font-extrabold text-slate-900 dark:text-white' : 'font-semibold'}>
                                  {r.nameAr}
                                </span>
                              </div>
                            </td>
                            <td>
                              <Badge color={ccTypeBadge}>
                                {r.id === 'UNASSIGNED' ? 'غير مخصص' : COST_CENTER_TYPE_LABELS[r.ccType] || r.ccType}
                              </Badge>
                            </td>
                            <td className="num text-emerald-700 dark:text-emerald-400 font-semibold">{money(r.revenue)}</td>
                            <td className="num">{money(r.directCost)}</td>
                            <td className="num">{money(r.operatingExpense)}</td>
                            <td className="num font-bold text-rose-700 dark:text-rose-400">{money(r.totalCost)}</td>
                            <td className={`num font-extrabold ${net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                              {money(r.netContribution)}
                            </td>
                            <td className="num font-mono">{r.marginPct}%</td>
                            <td className="num font-mono">{r.shareOfTotalCostPct}%</td>
                            <td className="num font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {r.projectCount} / {r.employeeCount} / {r.txCount}
                            </td>
                            {filters.compareEnabled && (
                              <>
                                <td className="num font-mono">{r.comparativeNet ? money(r.comparativeNet.previous) : '—'}</td>
                                <td className={`num font-mono font-bold ${Number(r.comparativeNet?.variance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {r.comparativeNet ? `${money(r.comparativeNet.variance)} (${r.comparativeNet.variancePct}%)` : '—'}
                                </td>
                              </>
                            )}
                            <td>
                              {r.id !== 'UNASSIGNED' ? (
                                <button
                                  type="button"
                                  onClick={() => setFilters({ costCenterId: isSelected ? '' : r.id })}
                                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
                                >
                                  {isSelected ? 'إلغاء العزل' : 'عزل المركز'}
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Level 2: Cost Center x GL Account */}
            {tab === 'accounts' && (
              filteredAccounts.length === 0 ? (
                <EmptyState text="لا توجد حركات حسابات مطابقة للفلاتر" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>مركز التكلفة</th>
                        <th>كود الحساب</th>
                        <th>اسم الحساب</th>
                        <th>تصنيف القائمة</th>
                        <th className="num">مدين ({base})</th>
                        <th className="num">دائن ({base})</th>
                        <th className="num">الأثر الصافي</th>
                        <th className="num">الحركات</th>
                        <th>كشف الحساب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccounts.map((r) => (
                        <tr key={`${r.costCenterId}::${r.accountId}`}>
                          <td>
                            <div className="font-bold">{r.costCenterName}</div>
                            <div className="font-mono text-[10px] text-slate-500">{r.costCenterCode}</div>
                          </td>
                          <td className="font-mono font-bold">{r.accountCode}</td>
                          <td className="font-semibold">{r.accountNameAr}</td>
                          <td>
                            <Badge color={r.statementSection === 'REVENUE' ? 'green' : r.statementSection === 'COST_OF_SALES' ? 'amber' : 'blue'}>
                              {r.sectionNameAr}
                            </Badge>
                          </td>
                          <td className="num">{money(r.debit)}</td>
                          <td className="num">{money(r.credit)}</td>
                          <td className="num font-bold">{money(r.netAmount)}</td>
                          <td className="num font-mono">{r.txCount}</td>
                          <td>
                            <Link
                              to={`/reports/account-statement?${buildFilterQueryString(filters, {
                                accountId: r.accountId,
                                costCenterId: r.costCenterId === 'UNASSIGNED' ? '' : r.costCenterId,
                              })}`}
                              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline whitespace-nowrap"
                            >
                              كشف الحساب ↗
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Level 3: Cost Center x Project & Client */}
            {tab === 'projects' && (
              filteredProjects.length === 0 ? (
                <EmptyState text="لا توجد مشاريع أو عملاء مسجلين ضمن الحركات المحددة" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>مركز التكلفة</th>
                        <th>العميل</th>
                        <th>المشروع</th>
                        <th className="num">الإيرادات</th>
                        <th className="num">التكلفة المباشرة</th>
                        <th className="num">المصروفات التشغيلية</th>
                        <th className="num">إجمالي التكلفة</th>
                        <th className="num">صافي الربح</th>
                        <th className="num">الهامش %</th>
                        <th className="num">القيود</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((r, i) => {
                        const net = Number(r.netProfit || 0);
                        return (
                          <tr key={`${r.costCenterId}-${r.projectId || i}-${r.clientId || i}`}>
                            <td>
                              <div className="font-bold">{r.costCenterName}</div>
                              <div className="font-mono text-[10px] text-slate-500">{r.costCenterCode}</div>
                            </td>
                            <td className="font-semibold">{r.clientName}</td>
                            <td>
                              {r.projectId ? (
                                <Link to={`/prj/projects/${r.projectId}`} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                                  {r.projectCode} — {r.projectName}
                                </Link>
                              ) : (
                                <span className="text-slate-500">{r.projectName}</span>
                              )}
                            </td>
                            <td className="num text-emerald-700 dark:text-emerald-400 font-semibold">{money(r.revenue)}</td>
                            <td className="num">{money(r.directCost)}</td>
                            <td className="num">{money(r.operatingExpense)}</td>
                            <td className="num font-bold text-rose-700 dark:text-rose-400">{money(r.totalCost)}</td>
                            <td className={`num font-extrabold ${net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                              {money(r.netProfit)}
                            </td>
                            <td className="num font-mono">{r.marginPct}%</td>
                            <td className="num font-mono">{r.txCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Level 4: Cost Center x Employee */}
            {tab === 'employees' && (
              filteredEmployees.length === 0 ? (
                <EmptyState text="لا توجد تكاليف أو إيرادات منسوبة لموظفين ضمن الفلاتر الحالية" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>مركز التكلفة</th>
                        <th>الموظف / الكادر (مركز تكلفة)</th>
                        <th>المشاريع المرتبطة</th>
                        <th className="num">الإيراد المحقق</th>
                        <th className="num">تكلفة الرواتب المباشرة</th>
                        <th className="num">مصروفات أخرى</th>
                        <th className="num">سندات قبض / صرف</th>
                        <th className="num">شيكات</th>
                        <th className="num">إجمالي التكلفة</th>
                        <th className="num">صافي المساهمة</th>
                        <th className="num">الهامش %</th>
                        <th className="num">القيود</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((r) => {
                        const net = Number(r.netContribution || 0);
                        return (
                          <tr key={`${r.costCenterId}::${r.employeeId}`}>
                            <td>
                              <div className="font-bold">{r.costCenterName}</div>
                              <div className="font-mono text-[10px] text-slate-500">{r.costCenterCode}</div>
                            </td>
                            <td>
                              <Link to={`/hr/employees/${r.employeeId}`} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                                {r.employeeCode} — {r.employeeName}
                              </Link>
                            </td>
                            <td className="max-w-[200px] truncate text-slate-600 dark:text-slate-300">
                              {(r.projectNames || []).length > 0 ? r.projectNames.join('، ') : '—'}
                            </td>
                            <td className="num text-emerald-700 dark:text-emerald-400 font-semibold">{money(r.revenueGenerated)}</td>
                            <td className="num">{money(r.payrollAndDirectCost)}</td>
                            <td className="num">{money(r.otherExpense)}</td>
                            <td className="num text-xs font-mono">
                              <span className="text-emerald-600">+{money(r.receiptsTotal || 0)}</span> / <span className="text-rose-600">-{money(r.paymentsTotal || 0)}</span>
                            </td>
                            <td className="num text-xs font-mono">{money(r.chequesTotal || 0)}</td>
                            <td className="num font-bold text-rose-700 dark:text-rose-400">{money(r.totalCost)}</td>
                            <td className={`num font-extrabold ${net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                              {money(r.netContribution)}
                            </td>
                            <td className="num font-mono">{r.marginPct}%</td>
                            <td className="num font-mono">{r.txCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Level 5: Journal Movements */}
            {tab === 'movements' && (
              filteredMovements.length === 0 ? (
                <EmptyState text="لا توجد قيود يومية تحليلية مطابقة للفلاتر" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>رقم القيد</th>
                        <th>مركز التكلفة</th>
                        <th>الحساب</th>
                        <th>المشروع / العميل</th>
                        <th>الموظف</th>
                        <th>البيان</th>
                        <th className="num">مدين</th>
                        <th className="num">دائن</th>
                        <th className="num">الأثر على الربحية</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map((m, idx) => (
                        <tr key={`${m.entryId}-${m.accountId}-${idx}`}>
                          <td className="font-mono whitespace-nowrap">{date(m.entryDate)}</td>
                          <td className="font-mono font-bold whitespace-nowrap">{m.entryNo}</td>
                          <td>
                            <div className="font-semibold">{m.costCenterName}</div>
                            <div className="font-mono text-[10px] text-slate-500">{m.costCenterCode}</div>
                          </td>
                          <td>
                            <div className="font-semibold">{m.accountNameAr}</div>
                            <div className="font-mono text-[10px] text-slate-500">{m.accountCode} • {m.statementSectionAr}</div>
                          </td>
                          <td>
                            <div>{m.projectName}</div>
                            <div className="text-[10px] text-slate-500">{m.clientName}</div>
                          </td>
                          <td>{m.employeeName}</td>
                          <td className="max-w-[220px] truncate">{m.description}</td>
                          <td className="num">{money(m.debitBase)}</td>
                          <td className="num">{money(m.creditBase)}</td>
                          <td className="num font-bold">{money(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
