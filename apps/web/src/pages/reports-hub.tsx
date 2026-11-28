import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpLeft,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Layers,
  Network,
  PieChart,
  Receipt,
  RefreshCw,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { money } from '../lib/format';
import { useReportCurrency } from '../lib/fx-display';
import { COST_CENTER_TYPE_LABELS } from '../lib/reports-analytics-engine';
import { ExportMenu } from '../components/ExportMenu';
import {
  ExecutiveBarChart,
  ExecutiveChartCard,
} from '../components/ExecutiveCharts';
import {
  ReportFilterBar,
  buildFilterQueryString,
  useReportFilters,
} from '../components/ReportFilterBar';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat } from '../components/ui';

export function ReportsHubPage() {
  const baseDefault = useBaseCurrency();
  const { filters, setFilters, resetAll, queryParams } = useReportFilters({
    syncUrl: true,
    defaultLedger: 'FINANCIAL',
  });
  const fx = useReportCurrency(filters.currencyCode, filters.to || filters.asOf);
  const base = fx.targetCurrency || baseDefault;
  const cv = (v: any) => fx.convert(v);
  const fm = (v: any) => money(cv(v));

  const q = useQuery({
    queryKey: ['report-multi-level-hub', queryParams],
    queryFn: () => api.get<any>('/reports/multi-level', queryParams),
  });

  const data = q.data;
  const company = data?.companyLevel ?? {};
  const ccLevel = data?.costCentersLevel ?? { summary: {}, reconciliation: {}, rows: [] };
  const ccRows: any[] = ccLevel.rows ?? [];
  const projectsLevel: any[] = data?.projectsLevel ?? [];
  const employeesLevel: any[] = data?.employeesLevel ?? [];
  const accountsLevel: any[] = data?.accountsLevel ?? [];

  const qsAll = buildFilterQueryString(filters);
  const qsAsOf = buildFilterQueryString({
    ...filters,
    asOf: filters.to,
    compareAsOf: filters.compareEnabled ? filters.compareTo : '',
  });
  const suffix = qsAll ? `?${qsAll}` : '';
  const suffixAsOf = qsAsOf ? `?${qsAsOf}` : '';

  const netProfit = Number(company.netProfit || 0);
  const ccReconciled = ccLevel.reconciliation?.reconciled !== false;

  const statementCards = [
    { to: `/reports/trial-balance${suffix}`, title: 'ميزان المراجعة', desc: 'أرصدة افتتاحية وحركة الفترة والأرصدة الختامية', icon: Scale, tone: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50' },
    { to: `/reports/income-statement${suffix}`, title: 'قائمة الدخل', desc: `صافي الربح: ${fm(company.netProfit || 0)} ${base}`, icon: TrendingUp, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50' },
    { to: `/reports/balance-sheet${suffixAsOf}`, title: 'المركز المالي', desc: `الأصول: ${fm(company.totalAssets || 0)} ${base}`, icon: Landmark, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-950/50' },
    { to: `/reports/cash-flow${suffix}`, title: 'التدفقات النقدية', desc: 'تحليل تشغيلي واستثماري وتمويلي (IAS 7)', icon: Wallet, tone: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50' },
    { to: `/reports/equity-changes${suffix}`, title: 'التغيرات في حقوق الملكية', desc: 'رأس المال والاحتياطيات وصافي أرباح الفترة', icon: FileSpreadsheet, tone: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50' },
    { to: `/reports/account-statement${suffix}`, title: 'كشف حساب الأستاذ', desc: 'تفصيل الحركات مع أبعاد المراكز والعملاء', icon: Layers, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50' },
    { to: `/reports/vat-return${suffix}`, title: 'ضريبة القيمة المضافة', desc: 'إقرار ZATCA 15% مخرجات ومدخلات', icon: Receipt, tone: 'text-rose-600 bg-rose-50 dark:bg-rose-950/50' },
    { to: `/reports/zakat${suffix}`, title: 'الوعاء الزكوي', desc: 'حساب الزكاة الشرعية وتكوين المخصص', icon: Coins, tone: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50' },
  ];

  const opsCards = [
    { to: `/reports/cost-centers${suffix}`, title: 'تقرير مراكز التكلفة الشامل', desc: 'الشجرة الهرمية × الحسابات × المشاريع × الموظفين', icon: Network },
    { to: `/rev/profitability${suffix}`, title: 'ربحية المشاريع والعملاء', desc: 'هامش كل عميل ومشروع مقابل التكاليف المباشرة والأوفرهيد', icon: Briefcase },
    { to: `/reports/ar-aging${suffix}`, title: 'أعمار الذمم المدينة والتحصيل', desc: 'متابعة استحقاقات العملاء والفواتير المتأخرة', icon: Receipt },
    { to: `/reports/employee-profitability${suffix}`, title: 'ربحية ومساهمة الموظفين', desc: 'إيراد كل موظف مقارنة براتبه واستغلاله', icon: Users },
    { to: `/prj/utilization${suffix}`, title: 'استغلال الكوادر والوقت غير المستغل', desc: 'نسب التخصيص وتكلفة الجاهزية (Bench)', icon: Activity },
    { to: `/prj/allocation-days${suffix}`, title: 'توزيع أيام العمل والفوترة', desc: 'الأيام المسندة وحالة إصدار الفواتير لكل كادر', icon: FolderTree },
    { to: `/reports/custody-movement${suffix}`, title: 'تقرير العهد النقدية والمصاريف', desc: 'عهد الموظفين والتسويات وفروق العملات', icon: Wallet },
    { to: `/reports/multi-currency-payroll${suffix}`, title: 'الرواتب متعددة العملات', desc: 'تكلفة الرواتب حسب العملة وتغيرات الصرف', icon: Coins },
    { to: `/reports/executive-intelligence${suffix}`, title: 'ذكاء الأعمال والمؤشرات التنفيذية', desc: 'رسوم بيانية متقدمة ومؤشرات استراتيجية', icon: BarChart3 },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="مركز التقارير الموحد على كافة المستويات"
        subtitle={`لوحة تقارير شاملة تربط المستوى القيادي والقوائم المالية ومراكز التكلفة والعملاء والمشاريع والموظفين تحت فلاتر موحدة (${base}).`}
        icon={PieChart}
        badge={
          company.trialBalanceBalanced !== false && ccReconciled ? (
            <Badge color="green" dot>متوازن ومتطابق مع الأستاذ العام</Badge>
          ) : (
            <Badge color="amber" dot>تحقق من التوازن والمطابقة</Badge>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/reports/cost-centers${suffix}`} className="btn-primary text-xs flex items-center gap-1.5">
              <Network className="size-3.5" /> تقرير مراكز التكلفة
            </Link>
            <button type="button" onClick={() => q.refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" /> تحديث
            </button>
            <ExportMenu
              title="التقرير التنفيذي متعدد المستويات"
              subtitle={`ملخص الشركة، مراكز التكلفة، المشاريع والعملاء، والموظفين (${base})`}
              filename={`multi-level-report-${filters.from}-${filters.to}`}
              periodLabel={`من ${filters.from} إلى ${filters.to}`}
              currency={base}
              summaryKpis={[
                { label: 'الإيرادات', value: `${fm(company.revenue || 0)} ${base}`, tone: 'emerald' },
                { label: 'مجمل الربح', value: `${fm(company.grossProfit || 0)} ${base}`, tone: 'sky' },
                { label: 'صافي الربح', value: `${fm(company.netProfit || 0)} ${base}`, tone: netProfit >= 0 ? 'indigo' : 'rose' },
                { label: 'إجمالي الأصول', value: `${fm(company.totalAssets || 0)} ${base}`, tone: 'navy' },
              ]}
              columns={[
                { key: 'code', header: 'رمز المركز', width: 14 },
                { key: 'nameAr', header: 'مركز التكلفة', width: 28 },
                { key: 'revenue', header: 'الإيرادات', width: 16, type: 'currency' as const },
                { key: 'totalCost', header: 'إجمالي التكاليف', width: 16, type: 'currency' as const },
                { key: 'netContribution', header: 'صافي المساهمة', width: 16, type: 'currency' as const },
                { key: 'marginPct', header: 'الهامش %', width: 12, type: 'percent' as const },
              ]}
              data={ccRows.map((r) => ({
                code: r.code,
                nameAr: r.nameAr,
                revenue: cv(r.revenue || 0),
                totalCost: cv(r.totalCost || 0),
                netContribution: cv(r.netContribution || 0),
                marginPct: Number(r.marginPct || 0),
              }))}
              additionalSheets={[
                {
                  sheetName: 'المشاريع والعملاء',
                  title: 'ربحية المشاريع والعملاء',
                  columns: [
                    { key: 'clientName', header: 'العميل', width: 24 },
                    { key: 'projectName', header: 'المشروع', width: 24 },
                    { key: 'costCenterName', header: 'مركز التكلفة', width: 22 },
                    { key: 'revenue', header: 'الإيراد', width: 14, type: 'currency' as const },
                    { key: 'totalCost', header: 'التكلفة', width: 14, type: 'currency' as const },
                    { key: 'netProfit', header: 'الربح', width: 14, type: 'currency' as const },
                  ],
                  data: projectsLevel.map((r) => ({ ...r, revenue: cv(r.revenue), totalCost: cv(r.totalCost), netProfit: cv(r.netProfit) })),
                },
                {
                  sheetName: 'الموظفون',
                  title: 'مساهمة وتكاليف الموظفين',
                  columns: [
                    { key: 'employeeCode', header: 'الكود', width: 12 },
                    { key: 'employeeName', header: 'الموظف', width: 24 },
                    { key: 'costCenterName', header: 'مركز التكلفة', width: 22 },
                    { key: 'revenueGenerated', header: 'الإيراد', width: 14, type: 'currency' as const },
                    { key: 'totalCost', header: 'التكلفة', width: 14, type: 'currency' as const },
                    { key: 'netContribution', header: 'المساهمة', width: 14, type: 'currency' as const },
                  ],
                  data: employeesLevel.map((r) => ({ ...r, revenueGenerated: cv(r.revenueGenerated), totalCost: cv(r.totalCost), netContribution: cv(r.netContribution) })),
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
        showClient
        showProject
        showEmployee
        showBranch
        showDepartment
        showLedger
        showCurrency
      />

      {q.isLoading && <Loading />}
      {q.error && <ErrorState error={q.error} />}

      {!q.isLoading && !q.error && (
        <>
          {/* Level 1: Company / Executive Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="size-4 text-indigo-600" />
                المستوى 1: المؤشرات المالية على مستوى الشركة (وفق الفلاتر النشطة)
              </h2>
              <span className="text-[11px] text-slate-500">
                كل الروابط بالأسفل تنقل معها جميع الفلاتر المحددة تلقائياً
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
              <Stat label="الإيرادات التشغيلية" value={fm(company.revenue || 0)} hint={base} tone="green" icon={TrendingUp} />
              <Stat label="التكلفة المباشرة" value={fm(company.directCost || 0)} hint={`مجمل الربح: ${fm(company.grossProfit || 0)}`} tone="amber" icon={Layers} />
              <Stat label="المصاريف التشغيلية" value={fm(company.operatingExpenses || 0)} hint={base} tone="red" icon={Coins} />
              <Stat label="صافي الربح / (الخسارة)" value={fm(company.netProfit || 0)} hint={ccReconciled ? 'متطابق مع مراكز التكلفة' : 'راجع مطابقة المراكز'} tone={netProfit >= 0 ? 'indigo' : 'red'} icon={CheckCircle2} />
              <Stat label="إجمالي الأصول" value={fm(company.totalAssets || 0)} hint={`الالتزامات: ${fm(company.totalLiabilities || 0)} | الملكية: ${fm(company.totalEquity || 0)}`} tone="blue" icon={Landmark} />
            </div>
          </div>

          {/* Level 2: Statutory & Financial Statements + Operational Reports Directory */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Scale className="size-4 text-indigo-600" />
                  المستوى 2: القوائم المالية والضرائب والأستاذ العام
                </h3>
                <Badge color="indigo">مفلترة تلقائياً</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {statementCards.map((c) => {
                  const Icon = c.icon;
                  return (
                    <Link
                      key={c.to}
                      to={c.to}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition group"
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${c.tone}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 flex items-center justify-between">
                          <span>{c.title}</span>
                          <ArrowUpLeft className="size-3 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{c.desc}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="size-4 text-emerald-600" />
                  المستويات 3 – 6: تقارير مراكز التكلفة والعملاء والمشاريع والموظفين
                </h3>
                <Badge color="green">تحليلي وعمليات</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {opsCards.map((c) => {
                  const Icon = c.icon;
                  return (
                    <Link
                      key={c.to}
                      to={c.to}
                      className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-700 hover:bg-emerald-50/25 dark:hover:bg-emerald-950/20 transition group"
                    >
                      <div className="p-2 rounded-lg shrink-0 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white group-hover:text-emerald-600 flex items-center justify-between">
                          <span className="truncate">{c.title}</span>
                          <ArrowUpLeft className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{c.desc}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Level 3: Cost Centers Live Overview + Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ExecutiveChartCard
              title="ملخص أداء مراكز التكلفة"
              subtitle="مقارنة الإيرادات والتكاليف وصافي المساهمة للمراكز"
              icon={Network}
              accent="indigo"
              className="lg:col-span-1"
            >
              <ExecutiveBarChart
                categories={ccRows.slice(0, 8).map((c) => c.nameAr)}
                series={[
                  { name: 'الإيراد', data: ccRows.slice(0, 8).map((c) => cv(c.revenue || 0)), color: '#10b981' },
                  { name: 'التكلفة', data: ccRows.slice(0, 8).map((c) => cv(c.totalCost || 0)), color: '#f43f5e' },
                ]}
                horizontal
                height={260}
                unit={base}
              />
            </ExecutiveChartCard>

            <div className="card overflow-hidden lg:col-span-2">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <Network className="size-4 text-indigo-600" />
                  المستوى 3: ملخص مراكز التكلفة ({ccRows.length})
                </h3>
                <Link to={`/reports/cost-centers${suffix}`} className="text-xs font-bold text-indigo-600 hover:underline">
                  عرض التقرير الهرمي الكامل ←
                </Link>
              </div>
              {ccRows.length === 0 ? (
                <EmptyState text="لا توجد بيانات مراكز تكلفة ضمن النطاق المحدد" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>المركز</th>
                        <th>التصنيف</th>
                        <th className="num">الإيرادات</th>
                        <th className="num">التكاليف</th>
                        <th className="num">صافي المساهمة</th>
                        <th className="num">الهامش %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ccRows.map((c) => (
                        <tr key={c.id} className={c.hasChildren ? 'bg-slate-50/80 dark:bg-slate-900/60 font-bold' : ''}>
                          <td>
                            <span className="font-mono text-[10px] text-slate-500 ml-1.5">{c.code}</span>
                            {c.nameAr}
                          </td>
                          <td>
                            <Badge color={c.id === 'UNASSIGNED' ? 'amber' : 'blue'}>
                              {c.id === 'UNASSIGNED' ? 'غير مخصص' : COST_CENTER_TYPE_LABELS[c.ccType] || c.ccType}
                            </Badge>
                          </td>
                          <td className="num text-emerald-700 dark:text-emerald-400">{fm(c.revenue)}</td>
                          <td className="num text-rose-700 dark:text-rose-400">{fm(c.totalCost)}</td>
                          <td className="num font-bold">{fm(c.netContribution)}</td>
                          <td className="num font-mono">{c.marginPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Levels 4, 5, 6 Summaries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <Briefcase className="size-4 text-emerald-600" />
                  المستوى 4 & 5: العملاء والمشاريع حسب مراكز التكلفة ({projectsLevel.length})
                </h3>
                <Link to={`/rev/profitability${suffix}`} className="text-xs font-bold text-indigo-600 hover:underline">
                  تفاصيل الربحية ←
                </Link>
              </div>
              {projectsLevel.length === 0 ? (
                <EmptyState text="لا توجد مشاريع أو عملاء بحركات مالية في الفترة المحددة" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>العميل</th>
                        <th>المشروع</th>
                        <th>مركز التكلفة</th>
                        <th className="num">الإيراد</th>
                        <th className="num">التكلفة</th>
                        <th className="num">صافي الربح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectsLevel.slice(0, 10).map((r, i) => (
                        <tr key={`${r.costCenterId}-${r.projectId || i}`}>
                          <td className="font-semibold">{r.clientName}</td>
                          <td>{r.projectName}</td>
                          <td className="text-slate-500">{r.costCenterName}</td>
                          <td className="num text-emerald-700 dark:text-emerald-400">{fm(r.revenue)}</td>
                          <td className="num text-rose-700 dark:text-rose-400">{fm(r.totalCost)}</td>
                          <td className="num font-bold">{fm(r.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <Users className="size-4 text-sky-600" />
                  المستوى 6: مساهمة وتكاليف الموظفين ({employeesLevel.length})
                </h3>
                <Link to={`/rev/employee-profitability${suffix}`} className="text-xs font-bold text-indigo-600 hover:underline">
                  تفاصيل الكوادر ←
                </Link>
              </div>
              {employeesLevel.length === 0 ? (
                <EmptyState text="لا توجد حركات مالية منسوبة لموظفين في الفترة المحددة" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-erp text-xs">
                    <thead>
                      <tr>
                        <th>الموظف</th>
                        <th>مركز التكلفة</th>
                        <th className="num">الإيراد المحقق</th>
                        <th className="num">التكلفة</th>
                        <th className="num">صافي المساهمة</th>
                        <th className="num">الهامش %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeesLevel.slice(0, 10).map((e) => (
                        <tr key={`${e.costCenterId}-${e.employeeId}`}>
                          <td className="font-semibold">
                            <span className="font-mono text-[10px] text-slate-500 ml-1">{e.employeeCode}</span>
                            {e.employeeName}
                          </td>
                          <td className="text-slate-500">{e.costCenterName}</td>
                          <td className="num text-emerald-700 dark:text-emerald-400">{fm(e.revenueGenerated)}</td>
                          <td className="num text-rose-700 dark:text-rose-400">{fm(e.totalCost)}</td>
                          <td className="num font-bold">{fm(e.netContribution)}</td>
                          <td className="num font-mono">{e.marginPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Account-Level Preview */}
          {accountsLevel.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-extrabold flex items-center gap-2">
                  <Layers className="size-4 text-purple-600" />
                  تفصيل الحسابات حسب مراكز التكلفة (أول 12 حساب)
                </h3>
                <Link to={`/reports/account-statement${suffix}`} className="text-xs font-bold text-indigo-600 hover:underline">
                  كشف حساب تفصيلي ←
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="table-erp text-xs">
                  <thead>
                    <tr>
                      <th>مركز التكلفة</th>
                      <th>الحساب</th>
                      <th>التصنيف</th>
                      <th className="num">مدين</th>
                      <th className="num">دائن</th>
                      <th className="num">الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountsLevel.slice(0, 12).map((a) => (
                      <tr key={`${a.costCenterId}-${a.accountId}`}>
                        <td>{a.costCenterName}</td>
                        <td>
                          <Link
                            to={`/reports/account-statement?${buildFilterQueryString(filters, {
                              accountId: a.accountId,
                              costCenterId: a.costCenterId === 'UNASSIGNED' ? '' : a.costCenterId,
                            })}`}
                            className="font-semibold text-indigo-600 hover:underline"
                          >
                            <span className="font-mono ml-1">{a.accountCode}</span>
                            {a.accountNameAr}
                          </Link>
                        </td>
                        <td><Badge color="slate">{a.sectionNameAr}</Badge></td>
                        <td className="num">{fm(a.debit)}</td>
                        <td className="num">{fm(a.credit)}</td>
                        <td className="num font-bold">{fm(a.netAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
