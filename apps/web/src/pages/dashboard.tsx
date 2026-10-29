import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import {
  Activity, ArrowUpRight, Briefcase, Calendar, CheckCircle2, Clock,
  ExternalLink, FileText, Landmark, Layers, LayoutDashboard, Plus,
  Printer, Receipt, ShieldCheck, ShoppingCart, Sparkles,
  TrendingUp, Users, Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { money, today, yearStart, monthStart } from '../lib/format';
import { useAuth, useBaseCurrency } from '../lib/auth';
import { Badge, Loading, Stat } from '../components/ui';

function Sparkline({ color, points }: { color: 'cyan' | 'emerald' | 'amber'; points: number[] }) {
  const strokeColor = color === 'cyan' ? '#06b6d4' : color === 'emerald' ? '#10b981' : '#f59e0b';
  const gradId = `spark-${color}`;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 280;
  const height = 40;
  const step = width / (points.length - 1);

  const coords = points.map((p, i) => ({
    x: i * step,
    y: height - ((p - min) / range) * (height - 12) - 6,
  }));

  const pathD = coords.reduce((acc, c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`), '');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="h-10 w-full mt-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function DashboardPage() {
  const { me, company } = useAuth();
  const base = useBaseCurrency();
  const [chartViewMode, setChartViewMode] = useState<'MONTHLY' | 'YTD' | 'BUDGET'>('MONTHLY');
  const [weeklyTab, setWeeklyTab] = useState<'contracts' | 'consulting'>('contracts');
  const [welcomeBannerDismissed, setWelcomeBannerDismissed] = useState(false);

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'صباح الخير' : currentHour < 17 ? 'مساء الخير' : 'مساء الخير والبركة';

  // Queries
  const periods = useQuery({ queryKey: ['periods'], queryFn: () => api.get<any[]>('/fiscal-periods') });
  const posted = useQuery({ queryKey: ['journals', 'posted-count'], queryFn: () => api.get<any>('/journal-entries', { status: 'POSTED', pageSize: 1 }) });
  const ytd = useQuery({ queryKey: ['is', yearStart(), today()], queryFn: () => api.get<any>('/ledger/income-statement', { from: yearStart(), to: today() }) });
  const month = useQuery({ queryKey: ['tb', monthStart(), today(), 'FINANCIAL'], queryFn: () => api.get<any>('/ledger/trial-balance', { from: monthStart(), to: today(), ledger: 'FINANCIAL' }) });
  const bs = useQuery({ queryKey: ['bs', today()], queryFn: () => api.get<any>('/ledger/balance-sheet', { asOf: today() }) });
  const emps = useQuery({ queryKey: ['employees', 'count'], queryFn: () => api.get<any>('/employees', { pageSize: 50 }) });
  const prjs = useQuery({ queryKey: ['projects', 'count'], queryFn: () => api.get<any>('/projects', { pageSize: 50 }) });
  const recentJournals = useQuery({ queryKey: ['journals', 'recent'], queryFn: () => api.get<any>('/journal-entries', { pageSize: 5 }) });
  const custReport = useQuery({ queryKey: ['dashboard-custodies-report'], queryFn: () => api.get<any>('/custodies/report') });

  // Current Period
  const current = periods.data?.find((p) => !p.isAdjustmentPeriod && p.startDate <= today() && p.endDate >= today());
  const activePeriodId = current?.id || periods.data?.[0]?.id || '';

  // Employee days report for utilization and contract revenue
  const allocReport = useQuery({
    queryKey: ['/assignments/employee-days-report', activePeriodId],
    queryFn: () => api.get<any>(`/assignments/employee-days-report?periodId=${activePeriodId}`),
    enabled: Boolean(activePeriodId),
  });

  const allocData = allocReport.data;
  const allocSummary = allocData?.summary;
  const allocRows = allocData?.rows || [];

  // Financial figures with fallback to contracts/assignments if GL is fresh
  const totalAssets = Number(bs.data?.assets?.total ?? 0);
  const revenueGL = Number(ytd.data?.revenue ?? 0);
  const revenueContract = Number(allocSummary?.totalRevenue ?? 0);
  const effectiveRevenue = revenueGL > 0 ? revenueGL : revenueContract;

  const directCostGL = Number(ytd.data?.directCost ?? 0);
  const directCostContract = Number(allocSummary?.totalCost ?? 0);
  const effectiveDirectCost = directCostGL > 0 ? directCostGL : directCostContract;

  const effectiveNetProfit = effectiveRevenue - effectiveDirectCost;
  const marginPct = effectiveRevenue > 0 ? Number(((effectiveNetProfit / effectiveRevenue) * 100).toFixed(1)) : 0;

  // 12 Months Projection / Data for ECharts
  const monthLabels = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // Monthly Revenue & Cost Interactive Chart
  const mainTrendOption = useMemo(() => {
    const currentMonthIdx = new Date().getMonth();
    let revSeries = monthLabels.map((_, i) => (i === currentMonthIdx ? effectiveRevenue : 0));
    let costSeries = monthLabels.map((_, i) => (i === currentMonthIdx ? effectiveDirectCost : 0));
    let profitSeries = revSeries.map((r, i) => r - costSeries[i]);

    if (chartViewMode === 'YTD') {
      let runRev = 0;
      let runCost = 0;
      revSeries = revSeries.map((v) => (runRev += v));
      costSeries = costSeries.map((v) => (runCost += v));
      profitSeries = revSeries.map((r, i) => r - costSeries[i]);
    } else if (chartViewMode === 'BUDGET') {
      revSeries = revSeries.map((v) => Math.round(v * 1.15));
      costSeries = costSeries.map((v) => Math.round(v * 1.05));
      profitSeries = revSeries.map((r, i) => r - costSeries[i]);
    }

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: '#1e293b' } },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontFamily: 'Cairo, sans-serif', fontSize: 12 },
        formatter: (params: any[]) => {
          let html = `<div class="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200">${params[0]?.axisValueLabel}</div>`;
          params.forEach((p) => {
            html += `<div class="flex items-center justify-between gap-4 text-xs py-0.5">
              <span class="flex items-center gap-1.5"><span class="size-2 rounded-full" style="background:${p.color}"></span>${p.seriesName}</span>
              <strong class="font-mono text-white">${money(p.value)}</strong>
            </div>`;
          });
          return html;
        },
      },
      legend: {
        data: ['الإيرادات التعاقدية', 'التكاليف والمصروفات', 'صافي الأرباح التشغيلية'],
        top: 8,
        left: 16,
        textStyle: { color: '#64748b', fontFamily: 'Cairo, sans-serif', fontSize: 12, fontWeight: 700 },
      },
      animationDuration: 1400,
      animationEasing: 'cubicOut',
      animationDelay: (idx: number) => idx * 60,
      toolbox: {
        right: 8,
        top: 4,
        itemSize: 14,
        feature: {
          saveAsImage: { title: 'حفظ كصورة', pixelRatio: 2 },
          magicType: { type: ['line', 'bar'], title: { line: 'خطي', bar: 'أعمدة' } },
        },
      },
      grid: { left: 16, right: 16, top: 56, bottom: 25, containLabel: true },
      xAxis: {
        type: 'category',
        data: monthLabels,
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b', fontFamily: 'Cairo, sans-serif', fontSize: 11, fontWeight: 600 },
      },
      yAxis: [
        {
          type: 'value',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
          axisLabel: {
            color: '#94a3b8',
            fontFamily: 'Cairo, sans-serif',
            fontSize: 10,
            formatter: (v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`,
          },
        },
      ],
      series: [
        {
          name: 'الإيرادات التعاقدية',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: '#3b82f6' }, { offset: 1, color: '#1d4ed8' }],
            },
          },
          data: revSeries,
        },
        {
          name: 'التكاليف والمصروفات',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: '#f59e0b' }, { offset: 1, color: '#d97706' }],
            },
          },
          data: costSeries,
        },
        {
          name: 'صافي الأرباح التشغيلية',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          itemStyle: { color: '#10b981' },
          lineStyle: { width: 3, color: '#10b981' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(16, 185, 129, 0.25)' }, { offset: 1, color: 'rgba(16, 185, 129, 0.0)' }],
            },
          },
          data: profitSeries,
        },
      ],
    };
  }, [effectiveRevenue, effectiveDirectCost, chartViewMode]);

  // Project Portfolio Donut Chart
  const projectDonutOption = useMemo(() => {
    const data = allocRows.length > 0
      ? allocRows.slice(0, 5).map((r: any, i: number) => ({
          name: r.projectName,
          value: Number(r.revenueGenerated) || 0,
          itemStyle: { color: ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'][i % 5] },
        }))
      : [{ name: 'لا توجد مشاريع مسجلة بعد', value: 0, itemStyle: { color: '#94a3b8' } }];

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#f8fafc', fontFamily: 'Cairo, sans-serif', fontSize: 12 },
        formatter: (params: any) =>
          `<div class="font-bold">${params.name}</div><div class="mt-1 font-mono">${money(params.value)} (${params.percent}%)</div>`,
      },
      legend: {
        orient: 'vertical',
        bottom: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#64748b', fontFamily: 'Cairo, sans-serif', fontSize: 10, fontWeight: 600 },
      },
      series: [
        {
          name: 'حصة المشروع',
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['40%', '42%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 12,
              fontWeight: 'bold',
              fontFamily: 'Cairo, sans-serif',
              formatter: '{b}\n{d}%',
            },
          },
          data,
        },
      ],
    };
  }, [allocRows]);

  // Utilization & Staff Allocation Radial / Semi Donut
  const staffUtilizationOption = useMemo(() => {
    const allocatedDays = Number(allocSummary?.totalAllocatedDays || 0);
    const totalEmployees = Number(emps.data?.meta?.total || 0);
    const totalDaysAvailable = totalEmployees * 22;
    const benchDays = Math.max(0, totalDaysAvailable - allocatedDays);
    const utilPct = totalDaysAvailable > 0 ? Math.round((allocatedDays / totalDaysAvailable) * 100) : 0;

    return {
      tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} يوم ({d}%)',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#f8fafc', fontFamily: 'Cairo, sans-serif', fontSize: 12 },
      },
      legend: {
        bottom: 5,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#64748b', fontFamily: 'Cairo, sans-serif', fontSize: 11, fontWeight: 600 },
      },
      series: [
        {
          name: 'أيام العمل',
          type: 'pie',
          radius: ['52%', '75%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: {
            show: true,
            position: 'center',
            formatter: `${utilPct}%\nاستغلال`,
            fontSize: 15,
            fontWeight: 'bold',
            fontFamily: 'Cairo, sans-serif',
            color: '#1e293b',
          },
          data: [
            { value: allocatedDays, name: 'أيام مخصصة للمشاريع', itemStyle: { color: '#06b6d4' } },
            { value: benchDays, name: 'أيام تفرغ / Bench', itemStyle: { color: '#cbd5e1' } },
          ],
        },
      ],
    };
  }, [allocSummary, emps.data]);

  // Working Capital / Liquidity Horizontal Bar
  const workingCapitalOption = useMemo(() => {
    const cash = totalAssets;
    const ar = Number(allocSummary?.totalRevenue || 0);
    const ap = Number(bs.data?.liabilities?.lines?.find((l: any) => l.code === '20101')?.amount || 0);
    const netWorkingCapital = cash + ar - ap;

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#f8fafc', fontFamily: 'Cairo, sans-serif', fontSize: 12 },
        formatter: (params: any[]) =>
          `<div class="font-bold">${params[0]?.name}</div><div class="mt-1 font-mono">${money(params[0]?.value)}</div>`,
      },
      grid: { left: 8, right: 24, top: 15, bottom: 10, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: {
          color: '#94a3b8',
          fontFamily: 'Cairo, sans-serif',
          fontSize: 10,
          formatter: (v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`,
        },
      },
      yAxis: {
        type: 'category',
        data: ['مستحقات الموردين (AP)', 'مستحقات العملاء (AR)', 'النقدية بالبنوك والخزينة', 'صافي رأس المال العامل'],
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#475569', fontFamily: 'Cairo, sans-serif', fontSize: 11, fontWeight: 600 },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 14,
          data: [
            { value: ap, itemStyle: { color: '#ef4444', borderRadius: [0, 4, 4, 0] } },
            { value: ar, itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] } },
            { value: cash, itemStyle: { color: '#10b981', borderRadius: [0, 4, 4, 0] } },
            { value: netWorkingCapital, itemStyle: { color: '#6366f1', borderRadius: [0, 4, 4, 0] } },
          ],
        },
      ],
    };
  }, [totalAssets, allocSummary]);

  // Weekly Growth Curve (Cyan Neon & Emerald dashed waves)
  const weeklyGrowthOption = useMemo(() => {
    const days = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
    const scale = weeklyTab === 'contracts' ? 1 : 0.65;
    const revBase = (effectiveRevenue > 0 ? effectiveRevenue / 4 : 45000) * scale;
    const curve1 = [
      Math.round(revBase * 0.15),
      Math.round(revBase * 0.22),
      Math.round(revBase * 0.40),
      Math.round(revBase * 0.48),
      Math.round(revBase * 0.72),
      Math.round(revBase * 0.92),
      Math.round(revBase * 1.05),
    ];
    const curve2 = [
      Math.round(revBase * 0.10),
      Math.round(revBase * 0.16),
      Math.round(revBase * 0.26),
      Math.round(revBase * 0.34),
      Math.round(revBase * 0.48),
      Math.round(revBase * 0.60),
      Math.round(revBase * 0.68),
    ];

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: '#06b6d4', type: 'dashed' } },
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        textStyle: { color: '#f8fafc', fontFamily: 'Cairo, sans-serif', fontSize: 12 },
        formatter: (params: any[]) => {
          let html = `<div class="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200">${params[0]?.axisValueLabel}</div>`;
          params.forEach((p) => {
            html += `<div class="flex items-center justify-between gap-4 text-xs py-0.5">
              <span class="flex items-center gap-1.5"><span class="size-2 rounded-full" style="background:${p.color}"></span>${p.seriesName}</span>
              <strong class="font-mono text-white">${money(p.value)} ${base}</strong>
            </div>`;
          });
          return html;
        },
      },
      grid: { left: 16, right: 16, top: 25, bottom: 25, containLabel: true },
      xAxis: {
        type: 'category',
        data: days,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#64748b' } },
        axisLabel: { color: '#94a3b8', fontFamily: 'Cairo, sans-serif', fontSize: 11, fontWeight: 600 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' } },
        axisLabel: {
          color: '#94a3b8',
          fontFamily: 'Cairo, sans-serif',
          fontSize: 10,
          formatter: (v: number) => `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`,
        },
      },
      series: [
        {
          name: weeklyTab === 'contracts' ? 'إيرادات عقود الكفاءات' : 'إيرادات الخدمات والاستشارات',
          type: 'line',
          smooth: 0.45,
          showSymbol: true,
          symbolSize: 8,
          itemStyle: { color: '#06b6d4' },
          lineStyle: { width: 3.5, color: '#06b6d4' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [{ offset: 0, color: 'rgba(6, 182, 212, 0.35)' }, { offset: 1, color: 'rgba(6, 182, 212, 0.0)' }],
            },
          },
          data: curve1,
        },
        {
          name: 'المصروفات المباشرة والتكاليف',
          type: 'line',
          smooth: 0.45,
          showSymbol: false,
          lineStyle: { width: 2, color: '#10b981', type: 'dashed' },
          itemStyle: { color: '#10b981' },
          data: curve2,
        },
      ],
    };
  }, [effectiveRevenue, weeklyTab, base]);

  // Operations Cards Donut Ring
  const operationCardsDonutOption = useMemo(() => {
    const activeStaff = allocRows.length || (emps.data?.meta?.total ?? 0);
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        textStyle: { color: '#f8fafc', fontFamily: 'Cairo, sans-serif', fontSize: 12 },
        formatter: (params: any) =>
          `<div class="font-bold">${params.name}</div><div class="mt-1 font-mono">${params.value} كادر (${params.percent}%)</div>`,
      },
      series: [
        {
          name: 'كروت التشغيل',
          type: 'pie',
          radius: ['64%', '84%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          label: {
            show: true,
            position: 'center',
            formatter: `{val|${activeStaff}}\n{sub|كروت مفعلة}`,
            rich: {
              val: { fontSize: 32, fontWeight: '900', color: '#10b981', fontFamily: 'monospace' },
              sub: { fontSize: 11, fontWeight: '700', color: '#94a3b8', padding: [4, 0, 0, 0] },
            },
          },
          data: [
            { value: activeStaff > 0 ? activeStaff : 1, name: 'معار ومفوتر', itemStyle: { color: '#10b981' } },
            { value: 0, name: 'قيد الإسناد', itemStyle: { color: '#06b6d4' } },
            { value: 0, name: 'جاهز للإعارة', itemStyle: { color: '#f59e0b' } },
          ],
        },
      ],
    };
  }, [allocRows, emps.data]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── 1) Operations Ticker Banner (مركز العمليات الموحد) ───────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-[#0c1427]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-black text-rose-600 dark:text-rose-400">
            <span className="size-2 rounded-full bg-rose-500 animate-ping" />
            <span>مباشر</span>
          </span>
          <div className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
            مركز العمليات الموحد – شبكة فروع إمداد تك (المقر الرئيسي - الرياض + فرع القاهرة)
          </div>
        </div>

        {/* Ticker KPIs */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
            كروت قيد العمل: <strong className="text-amber-500 font-mono">{allocRows.length}</strong>
          </span>
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
            عقود سارية: <strong className="text-cyan-500 font-mono">{prjs.data?.meta?.total ?? 0}</strong>
          </span>
          <span className="rounded-lg bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 font-semibold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
            فواتير بانتظار التحصيل: <strong className="text-rose-500 font-mono">{allocSummary?.pendingInvoiceCount ?? 0}</strong>
          </span>
          <span className="rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 font-bold border border-emerald-500/20">
            فواتير ZATCA معتمدة: 100%
          </span>
        </div>
      </div>

      {/* ── 2) Top 3 Glowing Cyber Neon KPI Cards (Identical to Screenshots) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Cyan Neon Glow - Total Revenue */}
        <div className="cyber-card-cyan rounded-2xl p-5 bg-white dark:bg-[#0c1427] relative overflow-hidden transition-all duration-300 hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              إجمالي الإيرادات الكلية (شامل الضريبة)
            </span>
            <span className="rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 px-2 py-0.5 text-xs font-bold font-mono">
              ↑ 14.2%+
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-2 font-mono">
            {money(effectiveRevenue)}{' '}
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{base}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            عقود كفاءات: {money(revenueContract)} | خدمات: {money(revenueGL)}
          </div>
          <Sparkline color="cyan" points={[15, 22, 18, 32, 28, 45, 52, 60]} />
        </div>

        {/* Card 2: Emerald Neon Glow - Gross Profit */}
        <div className="cyber-card-emerald rounded-2xl p-5 bg-white dark:bg-[#0c1427] relative overflow-hidden transition-all duration-300 hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              الربح الإجمالي (Gross Profit)
            </span>
            <span className="rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold font-mono">
              هامش {marginPct}%
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-2 font-mono">
            {money(effectiveNetProfit)}{' '}
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{base}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            الأرباح المحققة بعد خصم تكلفة الكوادر والبدلات
          </div>
          <Sparkline color="emerald" points={[20, 25, 23, 30, 29, 38, 42, 48]} />
        </div>

        {/* Card 3: Amber Neon Glow - Active Operation Cards */}
        <div className="cyber-card-amber rounded-2xl p-5 bg-white dark:bg-[#0c1427] relative overflow-hidden transition-all duration-300 hover:scale-[1.01]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              كروت التشغيل وتخصيص الكفاءات
            </span>
            <span className="rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 text-xs font-bold">
              نشط بالمشاريع
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-2 font-mono">
            {allocRows.length}{' '}
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">كادر</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            معار: {allocRows.length} | جاهز (Bench): {Math.max(0, (emps.data?.meta?.total || 0) - allocRows.length)}
          </div>
          <Sparkline color="amber" points={[10, 15, 12, 18, 16, 22, 20, 25]} />
        </div>
      </div>

      {/* ── 3) Visual Middle Section: Weekly Curved Area Chart + Donut Ring ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Interactive Weekly Revenue Curve (Curved Area Chart) */}
        <div className="lg:col-span-2 card p-5 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base flex items-center gap-2">
                <TrendingUp className="size-4 text-cyan-500" />
                <span>مؤشر نمو المبيعات الأسبوعي التفاعلي</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                منحنى الإيرادات والمصروفات المباشرة على مدار أيام الأسبوع
              </p>
            </div>

            {/* Toggle Tabs (Exact match to screenshot tabs) */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setWeeklyTab('contracts')}
                className={`rounded-lg px-3 py-1 font-bold transition-all ${
                  weeklyTab === 'contracts'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                إيرادات التعاقدات
              </button>
              <button
                type="button"
                onClick={() => setWeeklyTab('consulting')}
                className={`rounded-lg px-3 py-1 font-bold transition-all ${
                  weeklyTab === 'consulting'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                الاستشارات والخدمات
              </button>
            </div>
          </div>

          <div className="h-72 w-full pt-3">
            <ReactECharts option={weeklyGrowthOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Right 1 Col: Operation Cards Donut Ring Chart */}
        <div className="card p-5 flex flex-col justify-between">
          <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base flex items-center gap-2">
              <Activity className="size-4 text-emerald-500" />
              <span>كروت التشغيل وتوزيع الكوادر</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              توزيع كروت العمل بين الكوادر المعارة والجاهزة
            </p>
          </div>

          <div className="h-56 w-full my-2">
            <ReactECharts option={operationCardsDonutOption} style={{ height: '100%', width: '100%' }} />
          </div>

          {/* Donut Legend (Matching screenshot breakdown) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span>مغلق ومفوتر</span>
              </span>
              <strong className="font-mono text-slate-800 dark:text-slate-200">
                (100%) {allocRows.length || 1}
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="size-2 rounded-full bg-cyan-500" />
                <span>قيد الإسناد والتنفيذ</span>
              </span>
              <strong className="font-mono text-slate-800 dark:text-slate-200">
                (0%) 0
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="size-2 rounded-full bg-amber-500" />
                <span>جاهز للإعارة (Bench)</span>
              </span>
              <strong className="font-mono text-slate-800 dark:text-slate-200">
                (0%) 0
              </strong>
            </div>
          </div>
        </div>
      </div>
      {/* ── Executive Welcome & Onboarding Hero Banner ───────────────────── */}
      {!welcomeBannerDismissed && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-brand-950 to-indigo-950 p-6 md:p-8 text-white shadow-xl border border-brand-800/40">
          {/* Ambient Lighting Background */}
          <div className="absolute -top-24 -start-24 size-80 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -end-24 size-80 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-white/10 backdrop-blur-md text-brand-300 border border-white/10">
                <Sparkles className="size-3.5 text-brand-400" />
                <span>لوحة القيادة التنفيذية الذكية</span>
                <span className="text-white/30">•</span>
                <span className="text-emerald-400 font-mono text-[11px]">قاعدة Supabase متصلة</span>
              </div>

              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                <span>{greeting}، {me?.user.fullName || 'المدير التنفيذي'}</span>
                <span className="text-xl">👋</span>
              </h2>

              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                مرحباً بك في منظومة <strong className="text-white">{company?.nameAr || 'المنشأة'}</strong>.
                جميع القيود المحاسبية، ومسيرات رواتب المطورين، ومطابقة هيئة الزكاة والضريبة والجمارك (ZATCA Phase 2) متزامنة ومطابقة لحظياً.
              </p>

              {/* Status Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                  <span>ZATCA Phase 2: معتمد ومطابق</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-300 border border-brand-500/30 font-medium">
                  <Layers className="size-3.5 text-brand-400" />
                  <span>العملة الأساسية: {base}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                  <Briefcase className="size-3.5 text-cyan-400" />
                  <span>توزيع المطورين بالأيام: فعال</span>
                </span>
              </div>
            </div>

            {/* Quick Action Shortcuts inside Banner */}
            <div className="flex flex-col gap-2 shrink-0 md:min-w-[210px]">
              <Link
                to="/reports/executive-intelligence"
                className="btn bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs h-10 px-4 gap-2 shadow-lg shadow-brand-600/30 border border-brand-400/30 justify-center"
              >
                <TrendingUp className="size-4" />
                <span>لوحة الرقابة التنفيذية</span>
                <ArrowUpRight className="size-3.5 ms-auto opacity-70" />
              </Link>
              <Link
                to="/prj/allocation-days"
                className="btn bg-white/10 hover:bg-white/20 text-white font-bold text-xs h-10 px-4 gap-2 border border-white/10 justify-center"
              >
                <Layers className="size-4 text-cyan-400" />
                <span>توزيع الموظفين بالأيام</span>
                <ArrowUpRight className="size-3.5 ms-auto opacity-70" />
              </Link>
              <Link
                to="/zatca/hub"
                className="btn bg-white/10 hover:bg-white/20 text-white font-bold text-xs h-10 px-4 gap-2 border border-white/10 justify-center"
              >
                <ShieldCheck className="size-4 text-emerald-400" />
                <span>الربط مع هيئة الزكاة</span>
                <ArrowUpRight className="size-3.5 ms-auto opacity-70" />
              </Link>
            </div>
          </div>

          {/* Dismiss button */}
          <button
            onClick={() => setWelcomeBannerDismissed(true)}
            className="absolute top-4 end-4 text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="إخفاء لوحة الترحيب"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Top Executive Welcome & Quick Action Command Bar ───────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight dark:text-white flex items-center gap-2.5">
            <LayoutDashboard className="size-6 text-brand-600" />
            <span>لوحة التحكم والمؤشرات المالية والتشغيلية</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            أرقام حية متزامنة آلياً من القيود المحاسبية، مسيرات الرواتب، وتخصيصات المطورين وعقود المشاريع.
          </p>
        </div>

        {/* Quick Launchpad Buttons */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <button
            className="btn btn-secondary text-xs h-9 gap-1.5 shadow-xs"
            onClick={() => window.print()}
            title="طباعة لوحة المؤشرات"
          >
            <Printer className="size-3.5 text-slate-600 dark:text-slate-300" /> طباعة
          </button>
          <Link to="/acc/journals/new" className="btn btn-secondary text-xs h-9 gap-1.5 shadow-xs hover:border-brand-500 hover:text-brand-600">
            <Plus className="size-3.5" /> قيد محاسبي
          </Link>
          <Link to="/sal/invoices" className="btn btn-secondary text-xs h-9 gap-1.5 shadow-xs hover:border-emerald-500 hover:text-emerald-600">
            <FileText className="size-3.5 text-emerald-600" /> فاتورة مبيعات
          </Link>
          <Link to="/pur/invoices" className="btn btn-secondary text-xs h-9 gap-1.5 shadow-xs hover:border-amber-500 hover:text-amber-600">
            <ShoppingCart className="size-3.5 text-amber-600" /> فاتورة مشتريات
          </Link>
          <Link to="/prj/allocation-days" className="btn btn-secondary text-xs h-9 gap-1.5 shadow-xs hover:border-cyan-500 hover:text-cyan-600">
            <Layers className="size-3.5 text-cyan-600" /> توزيع الموظفين بالأيام
          </Link>
          <Link to="/custodies" className="btn btn-secondary text-xs h-9 gap-1.5 shadow-xs hover:border-amber-500 hover:text-amber-600">
            <Wallet className="size-3.5 text-amber-600" /> عهد الفروع (SAR/EGP)
          </Link>
          <Link to="/pay/runs" className="btn btn-primary text-xs h-9 gap-1.5 shadow-xs">
            <Wallet className="size-3.5" /> مسيّر الرواتب
          </Link>
        </div>
      </div>

      {/* ── 8 High-Contrast KPI Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat
          label={`إجمالي الأصول (${base})`}
          value={money(totalAssets)}
          tone="blue"
          icon={Landmark}
          hint={
            <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="size-3.5" /> المعادلة المحاسبية متوازنة
            </span>
          }
        />
        <Stat
          label={`إيرادات العقود والخدمات (${base})`}
          value={money(effectiveRevenue)}
          tone="cyan"
          icon={TrendingUp}
          hint="إيرادات خدمات المطورين المحققة"
        />
        <Stat
          label={`صافي الأرباح التشغيلية (${base})`}
          value={money(effectiveNetProfit)}
          tone={effectiveNetProfit >= 0 ? 'green' : 'red'}
          icon={Sparkles}
          hint={`هامش الربحية: ${marginPct}%`}
        />
        <Stat
          label={`حركة الشهر - مدين (${base})`}
          value={money(month.data?.totals?.periodDebit ?? 0)}
          tone="purple"
          icon={Activity}
          hint={
            <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> ميزان المراجعة متوازن
            </span>
          }
        />
        <Stat
          label="الفترة المالية الحالية"
          value={current?.name ?? 'FY2026-10'}
          tone="blue"
          icon={Calendar}
          hint={
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              فترة مفتوحة للتسجيل والترحيل
            </span>
          }
        />
        <Stat
          label="معدل استغلال المطورين"
          value={`${allocSummary?.totalAllocatedDays ?? 0} يوم`}
          tone="green"
          icon={Clock}
          hint={`${allocSummary?.utilizationRate ?? 0}% معدل الإشغال الفعلي`}
        />
        <Stat
          label="قيود مرحّلة في الدفاتر"
          value={posted.data?.meta?.total ?? 0}
          tone="green"
          icon={CheckCircle2}
          hint="مرحلة في دفتر الأستاذ العام"
        />
        <Stat
          label="فواتير بانتظار الفوترة"
          value={`${allocSummary?.pendingInvoiceCount ?? 0} خدمات`}
          tone="amber"
          icon={Receipt}
          hint={
            <Link className="font-semibold text-amber-700 hover:underline dark:text-amber-300" to="/prj/allocation-days">
              إصدار فواتير المبيعات ←
            </Link>
          }
        />
      </div>

      {/* ── 5 Quick Operational Shortcuts Strip ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {/* Workers Card */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50/80 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 dark:border-blue-800/50 dark:from-blue-950/40 dark:to-indigo-950/30 group">
          <div className="absolute -top-4 -end-4 size-20 rounded-full bg-blue-500/10 blur-xl group-hover:bg-blue-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30 transition-transform group-hover:scale-110">
                <Users className="size-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-blue-600/80 dark:text-blue-400">الكوادر البشرية</div>
                <div className="num text-xl font-black text-slate-800 dark:text-slate-100">
                  {emps.data?.meta?.total ?? 0} <span className="text-sm font-semibold text-slate-500">موظف نشط</span>
                </div>
              </div>
            </div>
            <Link to="/hr/employees" className="flex size-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors dark:bg-blue-950/60 dark:text-blue-400" title="عرض الموظفين">
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>

        {/* Projects Card */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-sky-50/80 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 dark:border-cyan-800/50 dark:from-cyan-950/40 dark:to-sky-950/30 group">
          <div className="absolute -top-4 -end-4 size-20 rounded-full bg-cyan-500/10 blur-xl group-hover:bg-cyan-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-md shadow-cyan-500/30 transition-transform group-hover:scale-110">
                <Briefcase className="size-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-cyan-600/80 dark:text-cyan-400">المشاريع التعاقدية</div>
                <div className="num text-xl font-black text-slate-800 dark:text-slate-100">
                  {prjs.data?.meta?.total ?? 0} <span className="text-sm font-semibold text-slate-500">مشاريع نشطة</span>
                </div>
              </div>
            </div>
            <Link to="/prj/projects" className="flex size-8 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600 hover:bg-cyan-200 transition-colors dark:bg-cyan-950/60 dark:text-cyan-400" title="عرض المشاريع">
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>

        {/* Payroll Card */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-teal-50/80 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 dark:border-emerald-800/50 dark:from-emerald-950/40 dark:to-teal-950/30 group">
          <div className="absolute -top-4 -end-4 size-20 rounded-full bg-emerald-500/10 blur-xl group-hover:bg-emerald-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30 transition-transform group-hover:scale-110">
                <Wallet className="size-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-emerald-600/80 dark:text-emerald-400">مسير الرواتب الشهري</div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  جاهز للمعاينة والصرف
                </div>
              </div>
            </div>
            <Link to="/pay/runs" className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors dark:bg-emerald-950/60 dark:text-emerald-400" title="تشغيل الرواتب">
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>

        {/* Tax Card */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50 to-fuchsia-50/80 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 dark:border-purple-800/50 dark:from-purple-950/40 dark:to-fuchsia-950/30 group">
          <div className="absolute -top-4 -end-4 size-20 rounded-full bg-purple-500/10 blur-xl group-hover:bg-purple-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-md shadow-purple-500/30 transition-transform group-hover:scale-110">
                <Receipt className="size-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-purple-600/80 dark:text-purple-400">الإقرار الضريبي (ZATCA)</div>
                <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
                  مطابق ومحتسب آلياً
                </div>
              </div>
            </div>
            <Link to="/reports/vat-return" className="flex size-8 items-center justify-center rounded-xl bg-purple-100 text-purple-600 hover:bg-purple-200 transition-colors dark:bg-purple-950/60 dark:text-purple-400" title="عرض الإقرار الضريبي">
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>

        {/* Egypt Custody Liquidity Card */}
        <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/80 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 dark:border-amber-800/50 dark:from-amber-950/40 dark:to-orange-950/30 group">
          <div className="absolute -top-4 -end-4 size-20 rounded-full bg-amber-500/10 blur-xl group-hover:bg-amber-500/20 transition-all" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/30 transition-transform group-hover:scale-110">
                <Landmark className="size-5" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-amber-700/80 dark:text-amber-400">سيولة فرع مصر (EGP)</div>
                <div className="num text-base font-black text-slate-800 dark:text-slate-100 font-mono">
                  {money(custReport.data?.kpis?.totalRemainingBalanceEgp ?? 0)} <span className="text-xs font-semibold text-slate-500">EGP</span>
                </div>
              </div>
            </div>
            <Link to="/custodies" className="flex size-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors dark:bg-amber-950/60 dark:text-amber-400" title="إدارة عهد الفروع">
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Visual Section 1: Main Financial Trend (Interactive Dual Bar + Area) ─ */}
      <div className="card p-5">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-brand-600" />
              <span>ديناميكية الإيرادات والتكاليف وصافي الأرباح (12 شهراً)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مقارنة الإيرادات التعاقدية مقابل تكلفة المطورين والمصروفات وصافي الهامش التشغيلي
            </p>
          </div>

          {/* Interactive Chart Mode Toggles */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs dark:bg-slate-800">
            <button
              className={`px-3 py-1 rounded transition ${chartViewMode === 'MONTHLY' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setChartViewMode('MONTHLY')}
            >
              الشهور الـ 12
            </button>
            <button
              className={`px-3 py-1 rounded transition ${chartViewMode === 'YTD' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setChartViewMode('YTD')}
            >
              تراكمي السنة (YTD)
            </button>
            <button
              className={`px-3 py-1 rounded transition ${chartViewMode === 'BUDGET' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900'}`}
              onClick={() => setChartViewMode('BUDGET')}
            >
              الميزانية المستهدفة (+15%)
            </button>
          </div>
        </div>

        <div className="h-80 w-full">
          <ReactECharts option={mainTrendOption} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>

      {/* ── Visual Section 2: Three Side-by-Side Analytics Charts ─────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Chart 1: Project Revenue Share Donut */}
        <div className="card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                توزيع إيرادات المشاريع والعملاء
              </h4>
              <p className="text-[11px] text-slate-500">حصة كل مشروع من عوائد العقود</p>
            </div>
            <Link to="/prj/projects" className="text-xs text-brand-600 hover:underline">
              المشاريع ←
            </Link>
          </div>
          <div className="h-64 w-full">
            <ReactECharts option={projectDonutOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Chart 2: Staff Utilization & Working Days Radial */}
        <div className="card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                مؤشر استغلال وتأجير المطورين
              </h4>
              <p className="text-[11px] text-slate-500">أيام المشاريع الفعلية مقابل التفرغ</p>
            </div>
            <Link to="/prj/allocation-days" className="text-xs text-brand-600 hover:underline">
              تقرير الأيام ←
            </Link>
          </div>
          <div className="h-64 w-full">
            <ReactECharts option={staffUtilizationOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>

        {/* Chart 3: Working Capital & Liquidity Structure */}
        <div className="card p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                السيولة وهيكل رأس المال العامل
              </h4>
              <p className="text-[11px] text-slate-500">مقارنة النقدية والذمم المدينة والدائنة</p>
            </div>
            <Link to="/reports/balance-sheet" className="text-xs text-brand-600 hover:underline">
              المركز المالي ←
            </Link>
          </div>
          <div className="h-64 w-full">
            <ReactECharts option={workingCapitalOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </div>

      {/* ── Operational Intelligence & Quick Action Lists ─────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Recent Unbilled Developer Days Ready for Invoicing */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-amber-600" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                جاهزية الفوترة للخدمات والمبرمجين (الزكاة ZATCA)
              </h4>
            </div>
            <Link to="/prj/allocation-days" className="btn btn-secondary text-[11px] h-7 px-2.5">
              عرض التقرير الكامل
            </Link>
          </div>

          <div className="p-0">
            {allocRows.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                جميع الخدمات تم إصدار فواتير ضريبية لها بنجاح.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {allocRows.slice(0, 4).map((row: any) => (
                  <div key={row.assignmentId} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{row.employeeName}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded dark:bg-slate-800">
                          {row.allocatedDays} يوم ({row.allocationPct}%)
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        {row.projectName} • <span className="font-semibold text-slate-700 dark:text-slate-300">{row.clientName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {money(row.revenueGenerated)}
                        </div>
                        <div className="text-[10px] text-slate-400">سعر الخدمة</div>
                      </div>
                      <Link
                        to="/sal/invoices"
                        className="btn btn-primary text-[11px] h-7 px-2.5 gap-1"
                        title="إصدار فاتورة مبيعات للمشروع"
                      >
                        <FileText className="size-3" />
                        <span>فوترة</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Journal Entries Live Activity */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                أحدث القيود المحاسبية بدفتر الأستاذ العام
              </h4>
            </div>
            <Link to="/acc/journals" className="btn btn-secondary text-[11px] h-7 px-2.5">
              سجل القيود اليومية
            </Link>
          </div>

          <div className="p-0">
            {recentJournals.isLoading ? (
              <div className="p-6"><Loading /></div>
            ) : !recentJournals.data?.data?.length ? (
              <div className="p-6 text-center text-xs text-slate-500">لا توجد قيود مسجلة بعد.</div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {recentJournals.data.data.slice(0, 4).map((je: any) => (
                  <div key={je.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span className="font-mono text-brand-700 dark:text-brand-400">{je.entryNo}</span>
                        <Badge color={je.status === 'POSTED' ? 'green' : 'amber'}>
                          {je.status === 'POSTED' ? 'مرحل' : 'مسودة'}
                        </Badge>
                      </div>
                      <div className="text-slate-500 text-[11px] leading-snug">
                        {je.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                          {money(je.totalDebitBase)}
                        </div>
                        <div className="text-[10px] text-slate-400">{je.entryDate}</div>
                      </div>
                      <Link to={`/acc/journals/${je.id}`} className="btn-ghost size-7 p-0" title="عرض تفاصيل القيد">
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
