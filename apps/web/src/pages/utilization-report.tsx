import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  ExternalLink,
  Filter,
  Lightbulb,
  PieChart,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { ReportFilterBar, useReportFilters } from '../components/ReportFilterBar';
import { api } from '../lib/api';
import { date, money, today } from '../lib/format';
import { useBaseCurrency } from '../lib/auth';
import { useReportCurrency } from '../lib/fx-display';
import { ExportMenu } from '../components/ExportMenu';
import { ExportColumnDef } from '../engine/export-engine';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { FormModal, REF } from '../components/forms';
import { FieldDef } from '../components/CrudPage';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat, useToast } from '../components/ui';

type UtilizationTier = 'FULL' | 'PARTIAL' | 'IDLE' | 'OVER';

interface ProjectSlice {
  assignmentId?: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId?: string | null;
  clientName: string;
  roleTitle?: string;
  startDate?: string;
  endDate?: string | null;
  allocationBasis?: string;
  allocationPct: number;
  allocatedDays: number;
  pricingBasis?: string;
  billableRate: number;
  revenueBase: number;
  directCostBase: number;
  overheadShareBase: number;
  totalCostShareBase: number;
  profitBase: number;
  marginPct: number;
}

interface EmployeeRecommendation {
  severity: 'critical' | 'warning' | 'opportunity' | 'optimal';
  badge: string;
  headline: string;
  detail: string;
  actionLabel?: string;
  actionType?: 'ASSIGN_REMAINING' | 'REBALANCE' | 'REVIEW_PRICING' | 'VIEW_PROFILE';
}

interface NormalizedUtilRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string;
  positionTitle: string;
  workingDaysInMonth: number;
  allocatedPct: number;
  unutilizedPct: number;
  overAllocatedPct: number;
  allocatedDays: number;
  unutilizedDays: number;
  overAllocatedDays: number;
  utilizationTier: UtilizationTier;
  isOverAllocated: boolean;
  directCostBase: number;
  overheadBase: number;
  totalCostBase: number;
  unutilizedCostBase: number;
  revenueBase: number;
  grossProfitBase: number;
  grossMarginPct: number;
  targetMarginPct: number;
  dailyDirectCostBase: number;
  effectiveDailyRateBase: number;
  potentialRevenueBase: number;
  potentialProfitBase: number;
  projects: ProjectSlice[];
  projectNames: string[];
  recommendation: EmployeeRecommendation;
}

const TIER_META: Record<
  UtilizationTier,
  { label: string; shortLabel: string; badgeColor: string; barColor: string; desc: string }
> = {
  FULL: {
    label: 'مستغل كلياً (100%)',
    shortLabel: 'مستغل كلياً',
    badgeColor: 'green',
    barColor: 'from-emerald-500 to-teal-500',
    desc: 'استغلال كامل للطاقة التشغيلية (100%) على المشاريع التعاقدية',
  },
  PARTIAL: {
    label: 'استغلال جزئي',
    shortLabel: 'استغلال جزئي',
    badgeColor: 'amber',
    barColor: 'from-amber-500 to-orange-500',
    desc: 'مخصص جزئياً على مشروع أو أكثر ولديه أيام شاغرة قابلة للاستثمار',
  },
  IDLE: {
    label: 'غير مستغل (Bench 0%)',
    shortLabel: 'غير مستغل (Bench)',
    badgeColor: 'red',
    barColor: 'from-rose-500 to-red-600',
    desc: 'غير مسند لأي مشروع حالياً وتتحمل الشركة كامل تكلفته الشهرية',
  },
  OVER: {
    label: 'فائض تخصيص (>100%)',
    shortLabel: 'فائض تخصيص',
    badgeColor: 'purple',
    barColor: 'from-purple-600 to-rose-600',
    desc: 'تجاوز الطاقة الاستيعابية (أكثر من 100%) ويحتاج إعادة توزيع عبء العمل',
  },
};

function buildEmployeeRecommendation(
  row: Omit<NormalizedUtilRow, 'recommendation'>,
  baseCurrency: string,
): EmployeeRecommendation {
  const cur = baseCurrency || 'SAR';

  if (row.utilizationTier === 'IDLE') {
    const rate = row.effectiveDailyRateBase > 0 ? money(row.effectiveDailyRateBase) : '1,500.00';
    return {
      severity: 'critical',
      badge: 'تسكين عاجل',
      headline: `كادر متفرغ بالكامل (${row.workingDaysInMonth} يوم Bench) — تكلفة هدر ${money(row.unutilizedCostBase)} ${cur}`,
      detail: `الموظف غير مسند لأي مشروع خلال هذه الفترة، مما يسبب تكلفة غير مستردة قدرها ${money(row.totalCostBase)} ${cur}. يُوصى بتسكينه فوراً على أحد المشاريع المفتوحة بسعر يومي مقترح ${rate} ${cur}/يوم لتوليد إيراد شهري يُقدّر بـ ${money(row.potentialRevenueBase)} ${cur}.`,
      actionLabel: 'تسكين الكادر بمشروع الآن',
      actionType: 'ASSIGN_REMAINING',
    };
  }

  if (row.utilizationTier === 'OVER') {
    return {
      severity: 'critical',
      badge: 'تحذير تجاوز طاقة',
      headline: `إجهاد تشغيلي بنسبة ${row.allocatedPct.toFixed(1)}% (فائض +${row.overAllocatedPct.toFixed(1)}% / +${row.overAllocatedDays.toFixed(1)} يوم)`,
      detail: `الموظف موزّع على ${row.projects.length} مشاريع بإجمالي يتجاوز 100%، ما قد يؤثر على جودة التسليم ودقة توزيع التكلفة. يُوصى بنقل ${row.overAllocatedPct.toFixed(0)}% (${row.overAllocatedDays.toFixed(1)} يوم) إلى كادر في فئة الاستغلال الجزئي أو الـ Bench.`,
      actionLabel: 'مراجعة توزيع المشاريع',
      actionType: 'REBALANCE',
    };
  }

  if (row.utilizationTier === 'PARTIAL') {
    const projectListTxt = row.projects.map((p) => `${p.projectName} (${p.allocationPct}%)`).join('، ');
    const marginWarn =
      row.revenueBase > 0 && row.grossProfitBase < 0
        ? ` كما أن الإيراد الحالي (${money(row.revenueBase)} ${cur}) أقل من إجمالي التكلفة المحمّلة (${money(row.totalCostBase)} ${cur}).`
        : '';
    return {
      severity: row.unutilizedPct >= 40 ? 'warning' : 'opportunity',
      badge: `متاح ${row.unutilizedPct.toFixed(0)}% (${row.unutilizedDays.toFixed(1)} يوم)`,
      headline: `استغلال جزئي ${row.allocatedPct.toFixed(1)}% — فرصة إيراد إضافي +${money(row.potentialRevenueBase)} ${cur}`,
      detail: `مخصص حالياً على: ${projectListTxt || 'مشروع نشط'} بإجمالي ${row.allocatedDays.toFixed(1)} يوم، ويتبقى له ${row.unutilizedDays.toFixed(1)} يوم شاغر (${row.unutilizedPct.toFixed(1)}%) بتكلفة وقت ضائع ${money(row.unutilizedCostBase)} ${cur}.${marginWarn} يُوصى بتسكين المتبقي على مشروع رديف أو مهام استشارية لتعظيم الربحية.`,
      actionLabel: `تسكين المتبقي (${row.unutilizedPct.toFixed(0)}%)`,
      actionType: 'ASSIGN_REMAINING',
    };
  }

  // FULL (100%)
  if (row.revenueBase > 0 && row.grossMarginPct < row.targetMarginPct) {
    const neededRev = row.totalCostBase / Math.max(0.1, 1 - row.targetMarginPct / 100);
    const neededDaily = row.workingDaysInMonth > 0 ? neededRev / row.workingDaysInMonth : 0;
    return {
      severity: 'warning',
      badge: 'مراجعة التسعير',
      headline: `استغلال كلي 100% ولكن الهامش (${row.grossMarginPct}%) أقل من المستهدف (${row.targetMarginPct}%)`,
      detail: `الكادر يعمل بكامل طاقته (${row.allocatedDays.toFixed(1)} يوم) لكن سعر الفوترة الحالي يحقق ربحاً قدره ${money(row.grossProfitBase)} ${cur} بهامش ${row.grossMarginPct}%. يُوصى برفع السعر التعاقدي عند التجديد إلى ${money(neededDaily)} ${cur}/يوم لتحقيق الهامش المستهدف.`,
      actionLabel: 'عرض ملف الربحية',
      actionType: 'REVIEW_PRICING',
    };
  }

  return {
    severity: 'optimal',
    badge: 'أداء مثالي 100%',
    headline: `استغلال كلي مثالي (100%) بهامش ربح ${row.grossMarginPct.toFixed(1)}% وصافي ربح ${money(row.grossProfitBase)} ${cur}`,
    detail: `الكادر مستغل بكامل طاقته على ${row.projects.length} ${row.projects.length === 1 ? 'مشروع' : 'مشاريع'} دون أي وقت ضائع، مع تغطية كاملة للتكاليف المباشرة والإدارية. يُوصى بالمحافظة على استمرارية العقد ومتابعة مواعيد التجديد مسبقاً.`,
    actionLabel: 'ملف الموظف 360°',
    actionType: 'VIEW_PROFILE',
  };
}

export function UtilizationPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const companyBaseCurrency = useBaseCurrency() || 'SAR';

  const { filters, setFilters, resetAll, queryParams } = useReportFilters({
    syncUrl: true,
  });
  const fx = useReportCurrency(filters.currencyCode, filters.to || filters.asOf);
  const baseCurrency = fx.targetCurrency || companyBaseCurrency;
  const periodId = filters.periodId;
  const searchQuery = filters.search;
  const [tierFilter, setTierFilter] = useState<'ALL' | UtilizationTier>('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [expandedEmpIds, setExpandedEmpIds] = useState<Record<string, boolean>>({});
  const [quickAssignTarget, setQuickAssignTarget] = useState<NormalizedUtilRow | null>(null);

  // Fetch fiscal periods so we auto-select the active period immediately on mount
  const periodsQ = useQuery({
    queryKey: ['/fiscal-periods', 'utilization-auto'],
    queryFn: () => api.get<any>('/fiscal-periods'),
  });

  const periodList: any[] = useMemo(() => {
    const raw = periodsQ.data;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.data)) return raw.data;
    return [];
  }, [periodsQ.data]);

  useEffect(() => {
    if (!periodId && !filters.from && !filters.to && periodList.length > 0) {
      const t = today();
      const current =
        periodList.find((p) => !p.isAdjustmentPeriod && p.startDate <= t && p.endDate >= t) ||
        periodList.find((p) => p.status === 'OPEN') ||
        periodList[0];
      if (current?.id) {
        setFilters({
          periodId: current.id,
          from: String(current.startDate).slice(0, 10),
          to: String(current.endDate).slice(0, 10),
        });
      }
    }
  }, [periodId, filters.from, filters.to, periodList, setFilters]);

  const activePeriod = useMemo(
    () => periodList.find((p) => p.id === periodId) || null,
    [periodList, periodId],
  );

  // Primary live query
  const report = useQuery({
    queryKey: ['utilization', periodId, queryParams],
    enabled: Boolean(periodId || queryParams.from || queryParams.to),
    queryFn: () => api.get<any>('/assignments/utilization', { ...queryParams, ...(periodId ? { periodId } : {}) }),
  });

  // Normalize rows from both fallback-engine & NestJS backend
  const allRows: NormalizedUtilRow[] = useMemo(() => {
    const raw = report.data;
    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.rows)
          ? raw.rows
          : [];

    return list.map((r: any) => {
      const workingDays = Number(r.workingDaysInMonth || 22);
      const allocatedPct = Number(r.allocatedPct ?? 0);
      const unutilizedPct = Number(r.unutilizedPct ?? Math.max(0, 100 - allocatedPct));
      const overAllocatedPct = Number(r.overAllocatedPct ?? Math.max(0, allocatedPct - 100));
      const allocatedDays = Number(r.allocatedDays ?? ((allocatedPct / 100) * workingDays));
      const unutilizedDays = Number(r.unutilizedDays ?? Math.max(0, workingDays - allocatedDays));
      const overAllocatedDays = Number(r.overAllocatedDays ?? Math.max(0, allocatedDays - workingDays));

      const utilizationTier: UtilizationTier =
        r.utilizationTier ||
        (allocatedPct > 100.05
          ? 'OVER'
          : allocatedPct >= 99.5
            ? 'FULL'
            : allocatedPct > 0.05
              ? 'PARTIAL'
              : 'IDLE');

      const projects: ProjectSlice[] = Array.isArray(r.projects)
        ? r.projects.map((p: any) => ({
            assignmentId: p.assignmentId || p.id,
            projectId: p.projectId || p.id || '',
            projectCode: p.projectCode || p.code || '',
            projectName: p.projectName || p.projectNameAr || p.nameAr || 'مشروع',
            clientId: p.clientId || null,
            clientName: p.clientName || p.clientNameAr || 'العميل',
            roleTitle: p.roleTitle || r.positionTitle || 'كادر تقني',
            startDate: p.startDate || activePeriod?.startDate || '',
            endDate: p.endDate || null,
            allocationBasis: p.allocationBasis || 'PERCENTAGE',
            allocationPct: Number(p.allocationPct ?? p.effectivePct ?? 0),
            allocatedDays: Number(p.allocatedDays ?? ((Number(p.allocationPct ?? 0) / 100) * workingDays)),
            pricingBasis: p.pricingBasis || 'DAILY',
            billableRate: fx.convert(Number(p.billableRate ?? 0)),
            revenueBase: fx.convert(Number(p.revenueBase ?? 0)),
            directCostBase: fx.convert(Number(p.directCostBase ?? 0)),
            overheadShareBase: fx.convert(Number(p.overheadShareBase ?? 0)),
            totalCostShareBase: fx.convert(Number(p.totalCostShareBase ?? p.directCostBase ?? 0)),
            profitBase: fx.convert(Number(p.profitBase ?? (Number(p.revenueBase ?? 0) - Number(p.totalCostShareBase ?? p.directCostBase ?? 0)))),
            marginPct: Number(p.marginPct ?? 0),
          }))
        : [];

      const projectNames: string[] =
        Array.isArray(r.projectNames) && r.projectNames.length > 0
          ? r.projectNames
          : projects.map((p) => `${p.projectCode ? `${p.projectCode} — ` : ''}${p.projectName} (${p.allocationPct}%)`);

      const directCostBase = fx.convert(Number(r.directCostBase ?? r.distributableCostBase ?? 0));
      const overheadBase = fx.convert(Number(r.overheadBase ?? r.overheadCostBase ?? 0));
      const totalCostBase = fx.convert(Number(r.totalCostBase ?? (Number(r.directCostBase ?? r.distributableCostBase ?? 0) + Number(r.overheadBase ?? r.overheadCostBase ?? 0))));
      const unutilizedCostBase = fx.convert(Number(r.unutilizedCostBase ?? Math.round(Number(r.directCostBase ?? 0) * (unutilizedPct / 100))));
      const revenueBase = fx.convert(Number(r.revenueBase ?? 0));
      const grossProfitBase = fx.convert(Number(r.grossProfitBase ?? (Number(r.revenueBase ?? 0) - Number(r.totalCostBase ?? 0))));
      const grossMarginPct = Number(
        r.grossMarginPct ?? (revenueBase > 0 ? Number(((grossProfitBase / revenueBase) * 100).toFixed(1)) : 0),
      );
      const targetMarginPct = Number(r.targetMarginPct ?? r.requiredMarginPct ?? 25);
      const dailyDirectCostBase = fx.convert(Number(
        r.dailyDirectCostBase ?? (workingDays > 0 ? Number(r.directCostBase ?? 0) / workingDays : 0),
      ));
      const effectiveDailyRateBase = fx.convert(Number(
        r.effectiveDailyRateBase ?? (allocatedDays > 0 && Number(r.revenueBase ?? 0) > 0 ? Number(r.revenueBase ?? 0) / allocatedDays : 1500),
      ));
      const potentialRevenueBase = fx.convert(Number(
        r.potentialRevenueBase ?? (unutilizedDays > 0 ? unutilizedDays * Number(r.effectiveDailyRateBase ?? 1500) : 0),
      ));
      const potentialProfitBase = fx.convert(Number(
        r.potentialProfitBase ?? (unutilizedDays > 0 ? (unutilizedDays * Number(r.effectiveDailyRateBase ?? 1500)) - Number(r.unutilizedCostBase ?? 0) : 0),
      ));

      const baseRow: Omit<NormalizedUtilRow, 'recommendation'> = {
        employeeId: r.employeeId || r.id,
        employeeCode: r.employeeCode || r.code || '',
        employeeName: r.employeeName || r.fullNameAr || r.nameAr || 'موظف',
        departmentName: r.departmentName || 'تقنية المعلومات',
        positionTitle: r.positionTitle || 'مهندس برمجيات',
        workingDaysInMonth: workingDays,
        allocatedPct: Number(allocatedPct.toFixed(1)),
        unutilizedPct: Number(unutilizedPct.toFixed(1)),
        overAllocatedPct: Number(overAllocatedPct.toFixed(1)),
        allocatedDays: Number(allocatedDays.toFixed(2)),
        unutilizedDays: Number(unutilizedDays.toFixed(2)),
        overAllocatedDays: Number(overAllocatedDays.toFixed(2)),
        utilizationTier,
        isOverAllocated: utilizationTier === 'OVER',
        directCostBase,
        overheadBase,
        totalCostBase,
        unutilizedCostBase,
        revenueBase,
        grossProfitBase,
        grossMarginPct,
        targetMarginPct,
        dailyDirectCostBase,
        effectiveDailyRateBase,
        potentialRevenueBase,
        potentialProfitBase,
        projects,
        projectNames,
      };

      return {
        ...baseRow,
        recommendation: buildEmployeeRecommendation(baseRow, baseCurrency),
      };
    });
  }, [report.data, activePeriod, baseCurrency, fx]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allRows.filter((r) => {
      if (tierFilter !== 'ALL' && r.utilizationTier !== tierFilter) return false;
      if (deptFilter !== 'ALL' && r.departmentName !== deptFilter) return false;
      if (projectFilter !== 'ALL' && !r.projects.some((p) => p.projectId === projectFilter)) return false;
      if (q) {
        const hay = [
          r.employeeName,
          r.employeeCode,
          r.positionTitle,
          r.departmentName,
          ...r.projects.flatMap((p) => [p.projectName, p.projectCode, p.clientName]),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, tierFilter, deptFilter, projectFilter, searchQuery]);

  // Aggregate KPIs across allRows (for top summary & tier tab counters)
  const stats = useMemo(() => {
    const total = allRows.length;
    const full = allRows.filter((r) => r.utilizationTier === 'FULL');
    const partial = allRows.filter((r) => r.utilizationTier === 'PARTIAL');
    const idle = allRows.filter((r) => r.utilizationTier === 'IDLE');
    const over = allRows.filter((r) => r.utilizationTier === 'OVER');

    const totalAvailDays = allRows.reduce((s, r) => s + r.workingDaysInMonth, 0);
    const totalAllocDays = allRows.reduce((s, r) => s + r.allocatedDays, 0);
    const totalIdleDays = allRows.reduce((s, r) => s + r.unutilizedDays, 0);
    const avgUtilization = total > 0 ? Number((allRows.reduce((s, r) => s + Math.min(r.allocatedPct, 100), 0) / total).toFixed(1)) : 0;
    const rawAvgUtilization = total > 0 ? Number((allRows.reduce((s, r) => s + r.allocatedPct, 0) / total).toFixed(1)) : 0;

    const totalBenchCost = allRows.reduce((s, r) => s + r.unutilizedCostBase, 0);
    const totalPotentialRevenue = allRows.reduce((s, r) => s + r.potentialRevenueBase, 0);
    const totalPotentialProfit = allRows.reduce((s, r) => s + Math.max(0, r.potentialProfitBase), 0);
    const totalRevenue = allRows.reduce((s, r) => s + r.revenueBase, 0);
    const totalCost = allRows.reduce((s, r) => s + r.totalCostBase, 0);
    const totalProfit = allRows.reduce((s, r) => s + r.grossProfitBase, 0);

    return {
      total,
      full,
      partial,
      idle,
      over,
      totalAvailDays,
      totalAllocDays,
      totalIdleDays,
      avgUtilization,
      rawAvgUtilization,
      totalBenchCost,
      totalPotentialRevenue,
      totalPotentialProfit,
      totalRevenue,
      totalCost,
      totalProfit,
    };
  }, [allRows]);

  // Executive Strategic Recommendations Panel
  const executiveRecommendations = useMemo(() => {
    const recs: Array<{
      id: string;
      tone: 'rose' | 'amber' | 'indigo' | 'emerald';
      tag: string;
      title: string;
      body: string;
      metric?: string;
      targetRow?: NormalizedUtilRow;
    }> = [];

    // 1. Rebalance Over-Allocated onto Partial/Idle
    if (stats.over.length > 0) {
      const overloaded = stats.over[0];
      const candidate = stats.partial[0] || stats.idle[0];
      recs.push({
        id: 'rebalance-over',
        tone: 'rose',
        tag: 'إعادة توازن فورية',
        title: `تخفيف الضغط عن ${stats.over.length} كادر متجاوز للطاقة (>100%)`,
        body: candidate
          ? `الموظف (${overloaded.employeeName}) مخصص بنسبة ${overloaded.allocatedPct}% بفائض +${overloaded.overAllocatedDays.toFixed(1)} يوم. يُوصى بنقل جزء من مهامه إلى (${candidate.employeeName}) المتاح لديه ${candidate.unutilizedDays.toFixed(1)} يوم شاغر (${candidate.unutilizedPct}%).`
          : `يوجد ${stats.over.length} كادر مخصص بأكثر من 100% — يُوصى بتقسيم التكليفات أو الاستعانة بكادر إضافي لتفادي الإرهاق وتأخر التسليم.`,
        metric: `+${stats.over.reduce((s, x) => s + x.overAllocatedDays, 0).toFixed(1)} يوم فائض`,
      });
    }

    // 2. Idle Bench Employees (0%)
    if (stats.idle.length > 0) {
      const idleCost = stats.idle.reduce((s, x) => s + x.unutilizedCostBase, 0);
      const idlePotential = stats.idle.reduce((s, x) => s + x.potentialRevenueBase, 0);
      recs.push({
        id: 'capture-idle',
        tone: 'rose',
        tag: 'أولوية قصوى — Bench 0%',
        title: `تسكين ${stats.idle.length} كادر غير مستغل بالكامل لوقف هدر ${money(idleCost)} ${baseCurrency}`,
        body: `الكوادر غير المسندة (${stats.idle.map((x) => x.employeeName).slice(0, 3).join('، ')}${stats.idle.length > 3 ? '…' : ''}) تستهلك تكلفة شهرية دون إيراد. تسكينهم على مشاريع نشطة يرفع الإيراد الشهري بنحو +${money(idlePotential)} ${baseCurrency}.`,
        metric: `هدر ${money(idleCost)} ${baseCurrency}`,
        targetRow: stats.idle[0],
      });
    }

    // 3. Partial Utilization Opportunity (1% - 99%)
    if (stats.partial.length > 0) {
      const partialIdleDays = stats.partial.reduce((s, x) => s + x.unutilizedDays, 0);
      const partialBenchCost = stats.partial.reduce((s, x) => s + x.unutilizedCostBase, 0);
      const partialPotential = stats.partial.reduce((s, x) => s + x.potentialRevenueBase, 0);
      const topPartial = [...stats.partial].sort((a, b) => b.unutilizedDays - a.unutilizedDays)[0];
      recs.push({
        id: 'capture-partial',
        tone: 'amber',
        tag: 'تعظيم الاستغلال الجزئي',
        title: `استثمار ${partialIdleDays.toFixed(1)} يوم شاغر لدى ${stats.partial.length} ${stats.partial.length === 1 ? 'موظف' : 'موظفين'} في الاستغلال الجزئي`,
        body: `يتصدرهم (${topPartial.employeeName}) المستغل بنسبة ${topPartial.allocatedPct}% فقط (${topPartial.projects.map((p) => p.projectName).join('، ') || 'مشروع نشط'}) والمتبقي له ${topPartial.unutilizedDays.toFixed(1)} يوم (${topPartial.unutilizedPct}%). استثمار الأيام الشاغرة يوقف هدراً قدره ${money(partialBenchCost)} ${baseCurrency} ويضيف إيراداً تقديرياً +${money(partialPotential)} ${baseCurrency}.`,
        metric: `+${money(partialPotential)} ${baseCurrency}`,
        targetRow: topPartial,
      });
    }

    // 4. Margin / Pricing Optimization
    const lowMarginEmps = allRows.filter((r) => r.revenueBase > 0 && (r.grossProfitBase < 0 || r.grossMarginPct < r.targetMarginPct));
    if (lowMarginEmps.length > 0) {
      const worst = [...lowMarginEmps].sort((a, b) => a.grossMarginPct - b.grossMarginPct)[0];
      recs.push({
        id: 'pricing-review',
        tone: 'indigo',
        tag: 'تحسين التسعير والربحية',
        title: `مراجعة أسعار الفوترة لـ ${lowMarginEmps.length} ${lowMarginEmps.length === 1 ? 'كادر' : 'كوادر'} دون هامش الربح المستهدف`,
        body: `الكادر (${worst.employeeName}) يحقق حالياً هامش ربح ${worst.grossMarginPct.toFixed(1)}% مقابل مستهدف ${worst.targetMarginPct}% (إيراد ${money(worst.revenueBase)} مقابل تكلفة ${money(worst.totalCostBase)} ${baseCurrency}). يُوصى برفع نسبة استغلاله أو تحديث سعر الخدمة التعاقدي في دليل الأسعار.`,
        metric: `هامش ${worst.grossMarginPct.toFixed(1)}%`,
      });
    }

    // 5. Healthy Full Utilization Benchmark
    if (stats.full.length > 0) {
      recs.push({
        id: 'full-retention',
        tone: 'emerald',
        tag: 'كفاءة تشغيلية مثالية',
        title: `${stats.full.length} ${stats.full.length === 1 ? 'كادر مستغل' : 'كوادر مستغلة'} كلياً بنسبة 100% دون وقت ضائع`,
        body: `الكوادر (${stats.full.map((x) => x.employeeName).slice(0, 4).join('، ')}${stats.full.length > 4 ? '…' : ''}) تعمل بطاقتها الكاملة. يُوصى بمتابعة تواريخ انتهاء عقودهم قبل 30 يوماً لضمان استمرارية الفوترة وعدم انتقالهم للـ Bench.`,
        metric: `${stats.total > 0 ? Math.round((stats.full.length / stats.total) * 100) : 0}% من الفريق`,
      });
    }

    return recs;
  }, [allRows, stats, baseCurrency]);

  // Chart data
  const tierDonutData = useMemo(
    () => [
      { name: 'مستغل كلياً (100%)', value: stats.full.length, color: '#10b981' },
      { name: 'استغلال جزئي (1–99%)', value: stats.partial.length, color: '#f59e0b' },
      { name: 'غير مستغل (Bench 0%)', value: stats.idle.length, color: '#f43f5e' },
      { name: 'فائض تخصيص (>100%)', value: stats.over.length, color: '#8b5cf6' },
    ],
    [stats],
  );

  const empBarChart = useMemo(() => {
    const top = [...filteredRows].slice(0, 12);
    return {
      categories: top.map((r) => r.employeeName),
      series: [
        {
          name: 'نسبة الاستغلال الفعلي (%)',
          data: top.map((r) => Math.min(100, r.allocatedPct)),
          color: '#4f46e5',
          colorEnd: '#6366f1',
          stack: 'util',
        },
        {
          name: 'الوقت غير المستغل (%)',
          data: top.map((r) => r.unutilizedPct),
          color: '#f59e0b',
          colorEnd: '#fbbf24',
          stack: 'util',
        },
        ...(top.some((r) => r.overAllocatedPct > 0)
          ? [
              {
                name: 'فائض التخصيص (>100%)',
                data: top.map((r) => r.overAllocatedPct),
                color: '#e11d48',
                colorEnd: '#f43f5e',
                stack: 'util',
              },
            ]
          : []),
      ],
    };
  }, [filteredRows]);

  // Export columns for ExportMenu (Royal PDF / Excel / CSV / Print)
  const exportColumns: ExportColumnDef[] = useMemo(
    () => [
      { key: 'employeeCode', header: 'الرمز', width: 14 },
      { key: 'employeeName', header: 'الموظف', width: 24 },
      { key: 'positionTitle', header: 'الوظيفة', width: 22 },
      { key: 'departmentName', header: 'القسم', width: 20 },
      { key: 'tierLabel', header: 'تصنيف الاستغلال', width: 22 },
      { key: 'allocatedPctText', header: 'نسبة الاستغلال%', width: 16 },
      { key: 'allocatedDaysText', header: 'الأيام المستغلة', width: 18 },
      { key: 'unutilizedPctText', header: 'الوقت غير المستغل%', width: 16 },
      { key: 'unutilizedDaysText', header: 'الأيام الشاغرة', width: 16 },
      { key: 'projectsSummary', header: 'المشاريع المسندة ونسبتها', width: 38 },
      { key: 'revenueBase', header: `الإيراد التعاقدي (${baseCurrency})`, type: 'currency', isTotal: true, width: 20 },
      { key: 'totalCostBase', header: `إجمالي التكلفة (${baseCurrency})`, type: 'currency', isTotal: true, width: 20 },
      { key: 'unutilizedCostBase', header: `تكلفة الوقت الضائع (${baseCurrency})`, type: 'currency', isTotal: true, width: 22 },
      { key: 'grossProfitBase', header: `صافي الربح (${baseCurrency})`, type: 'currency', isTotal: true, width: 20 },
      { key: 'potentialRevenueBase', header: `الفرصة الإيرادية (${baseCurrency})`, type: 'currency', isTotal: true, width: 22 },
      { key: 'recommendationText', header: 'التوصية الإدارية', width: 45 },
    ],
    [baseCurrency],
  );

  const exportRows = useMemo(
    () =>
      filteredRows.map((r) => ({
        employeeCode: r.employeeCode || '—',
        employeeName: r.employeeName,
        positionTitle: r.positionTitle,
        departmentName: r.departmentName,
        tierLabel: TIER_META[r.utilizationTier].label,
        allocatedPctText: `${r.allocatedPct.toFixed(1)}%`,
        allocatedDaysText: `${r.allocatedDays.toFixed(1)} / ${r.workingDaysInMonth} يوم`,
        unutilizedPctText: `${r.unutilizedPct.toFixed(1)}%`,
        unutilizedDaysText: `${r.unutilizedDays.toFixed(1)} يوم`,
        projectsSummary:
          r.projects.length > 0
            ? r.projects.map((p) => `${p.projectCode ? `${p.projectCode} — ` : ''}${p.projectName} (${p.allocationPct}% / ${p.allocatedDays} يوم)`).join(' | ')
            : 'غير مسند لمشروع (Bench)',
        revenueBase: r.revenueBase,
        totalCostBase: r.totalCostBase,
        unutilizedCostBase: r.unutilizedCostBase,
        grossProfitBase: r.grossProfitBase,
        potentialRevenueBase: r.potentialRevenueBase,
        recommendationText: `${r.recommendation.headline} — ${r.recommendation.detail}`,
      })),
    [filteredRows],
  );

  // Quick-Assign Modal fields (pre-filled for selected employee's remaining capacity)
  const quickAssignFields: FieldDef[] = useMemo(() => {
    const emp = quickAssignTarget;
    const remDays = emp ? Math.max(1, Number(emp.unutilizedDays.toFixed(1))) : 22;
    const remPct = emp ? Math.max(5, Math.min(100, Number(emp.unutilizedPct.toFixed(1)))) : 100;
    const defaultRate = emp && emp.effectiveDailyRateBase > 0 ? String(Math.round(emp.effectiveDailyRateBase)) : '1500';
    return [
      {
        name: 'employeeId',
        label: 'الموظف المستهدف *',
        type: 'ref',
        ref: REF.employee,
        required: true,
        default: emp?.employeeId || '',
      },
      {
        name: 'projectId',
        label: 'المشروع التعاقدي *',
        type: 'ref',
        ref: REF.project,
        required: true,
      },
      {
        name: 'allocationBasis',
        label: 'أساس التوزيع *',
        type: 'select',
        options: [
          { value: 'PERCENTAGE', label: `نسبة مئوية % (المتبقي المتاح: ${remPct}%)` },
          { value: 'DAYS', label: `أيام عمل محددة (المتبقي المتاح: ${remDays} يوم)` },
        ],
        default: 'PERCENTAGE',
        required: true,
      },
      {
        name: 'allocationPct',
        label: 'نسبة التخصيص %',
        type: 'decimal',
        default: String(remPct),
        hint: emp ? `نسبة الوقت الشاغر المتاح للموظف هي ${remPct}% لإتمام 100%` : 'مثال: 25 أو 50 أو 100',
      },
      {
        name: 'allocatedDays',
        label: 'عدد أيام العمل المخصصة',
        type: 'decimal',
        default: String(remDays),
        hint: `من إجمالي ${emp?.workingDaysInMonth || 22} يوم عمل شهرياً`,
      },
      {
        name: 'billingBasis',
        label: 'أساس سعر الفوترة للعميل',
        type: 'select',
        options: [
          { value: 'DAILY', label: 'سعر يومية للعميل (Daily Rate)' },
          { value: 'MONTHLY', label: 'مبلغ مقطوع شهرياً (Monthly Rate)' },
          { value: 'HOURLY', label: 'سعر ساعة عمل (Hourly Rate)' },
        ],
        default: 'DAILY',
      },
      {
        name: 'billableRate',
        label: `سعر البيع / الفوترة (${baseCurrency})`,
        type: 'decimal',
        default: defaultRate,
      },
      {
        name: 'startDate',
        label: 'من تاريخ *',
        type: 'date',
        required: true,
        default: activePeriod?.startDate || today(),
      },
      {
        name: 'endDate',
        label: 'إلى تاريخ',
        type: 'date',
        default: activePeriod?.endDate || '',
      },
      {
        name: 'notes',
        label: 'ملاحظات التكليف',
        type: 'textarea',
        default: emp ? `تسكين الطاقة الشاغرة (${remPct}% / ${remDays} يوم) بناءً على توصية تقرير الاستغلال` : '',
      },
    ];
  }, [quickAssignTarget, activePeriod, baseCurrency]);

  const toggleExpand = (empId: string) => {
    setExpandedEmpIds((prev) => ({ ...prev, [empId]: !prev[empId] }));
  };

  const expandAll = () => {
    const anyCollapsed = filteredRows.some((r) => !expandedEmpIds[r.employeeId]);
    if (anyCollapsed) {
      const next: Record<string, boolean> = {};
      for (const r of filteredRows) next[r.employeeId] = true;
      setExpandedEmpIds(next);
    } else {
      setExpandedEmpIds({});
    }
  };

  return (
    <div id="utilization-executive-report" className="space-y-5 animate-fade-in">
      {/* 1. Executive Header + Export Suite */}
      <PageHeader
        title="تقرير استغلال الكوادر والموظفين والوقت الضائع"
        subtitle="تحليل تنفيذي شامل يوضح الموظفين المستغلين كلياً (100%) والجزئي وغير المستغلين (Bench) وتفصيل مشاريع كل موظف ونسبتها وأيامها والأثر المالي مع توصيات ذكية فورية."
        icon={UserCheck}
        badge={
          activePeriod && (
            <Badge color="indigo" dot>
              {activePeriod.name}
            </Badge>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setQuickAssignTarget(stats.partial[0] || stats.idle[0] || allRows[0] || null)}
              disabled={allRows.length === 0}
              className="btn-primary text-xs gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>تسكين / تخصيص كادر</span>
            </button>
            <Link to="/prj/allocation-days" className="btn-secondary text-xs gap-1.5">
              <Briefcase className="size-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>توزيع الأيام والفوترة</span>
            </Link>
            <ExportMenu
              title="تقرير استغلال الكوادر والموظفين والوقت الضائع والتوصيات"
              columns={exportColumns}
              data={exportRows}
              filename={`employee-utilization-${periodId || today()}`}
              periodLabel={activePeriod ? `${activePeriod.name} (${activePeriod.startDate} إلى ${activePeriod.endDate})` : undefined}
              currency={baseCurrency}
              elementIdToPrint="utilization-executive-report"
              orientation="landscape"
            />
          </div>
        }
      />

      {/* 2. Period, Multi-Dimensional Filters & Tier Tabs Command Bar */}
      <ReportFilterBar
        filters={filters}
        onChange={setFilters}
        onReset={() => {
          resetAll();
          setTierFilter('ALL');
          setDeptFilter('ALL');
          setProjectFilter('ALL');
        }}
        showPeriod
        showDateRange
        showCostCenter
        showClient
        showProject
        showEmployee
        showDepartment
        showCurrency
        showSearch
        searchPlaceholder="اسم موظف، مشروع، عميل..."
      />

      <div className="card p-4 space-y-3.5">

        {/* Tier Segmented Tabs with Live Counters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-300 me-1">
              <Filter className="size-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>تصنيف الاستغلال:</span>
            </span>
            {[
              { key: 'ALL' as const, label: 'الكل', count: stats.total, activeCls: 'bg-indigo-600 text-white border-indigo-600' },
              { key: 'FULL' as const, label: 'مستغل كلياً (100%)', count: stats.full.length, activeCls: 'bg-emerald-600 text-white border-emerald-600' },
              { key: 'PARTIAL' as const, label: 'استغلال جزئي', count: stats.partial.length, activeCls: 'bg-amber-500 text-slate-950 border-amber-500' },
              { key: 'IDLE' as const, label: 'غير مستغل (Bench 0%)', count: stats.idle.length, activeCls: 'bg-rose-600 text-white border-rose-600' },
              { key: 'OVER' as const, label: 'فائض تخصيص (>100%)', count: stats.over.length, activeCls: 'bg-purple-600 text-white border-purple-600' },
            ].map((tab) => {
              const isSelected = tierFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setTierFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? `${tab.activeCls} shadow-xs`
                      : 'border-slate-200/90 bg-slate-50/90 text-slate-700 hover:bg-white hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.2 font-mono text-[11px] font-extrabold ${
                      isSelected ? 'bg-black/15 text-current' : 'bg-slate-200/80 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={expandAll}
            className="text-xs font-bold text-indigo-700 hover:underline dark:text-indigo-400 cursor-pointer"
          >
            {filteredRows.some((r) => !expandedEmpIds[r.employeeId]) ? 'توسيع تفاصيل مشاريع الكل ↓' : 'طي التفاصيل ↑'}
          </button>
        </div>
      </div>

      {report.isLoading ? (
        <Loading />
      ) : report.error ? (
        <ErrorState error={report.error} />
      ) : (
        <>
          {/* 3. Six Executive KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
            <Stat
              label="متوسط الاستغلال العام"
              value={`${stats.avgUtilization}%`}
              hint={`${stats.totalAllocDays.toFixed(1)} يوم من ${stats.totalAvailDays} يوم متاح`}
              tone={stats.avgUtilization >= 85 ? 'green' : stats.avgUtilization >= 60 ? 'amber' : 'red'}
              icon={Activity}
              progress={stats.avgUtilization}
            />
            <Stat
              label="مستغل كلياً (100%)"
              value={`${stats.full.length} كادر`}
              hint={stats.total > 0 ? `${Math.round((stats.full.length / stats.total) * 100)}% من إجمالي الفريق` : 'لا يوجد كوادر'}
              tone="green"
              icon={CheckCircle2}
            />
            <Stat
              label="استغلال جزئي (1%–99%)"
              value={`${stats.partial.length} كادر`}
              hint={`${stats.partial.reduce((s, r) => s + r.unutilizedDays, 0).toFixed(1)} يوم شاغر قابل للتسكين`}
              tone="amber"
              icon={Clock}
            />
            <Stat
              label="غير مستغل (Bench 0%)"
              value={`${stats.idle.length} كادر`}
              hint={stats.over.length > 0 ? `+ ${stats.over.length} فائض تخصيص (>100%)` : 'على قوة الشركة دون مشروع'}
              tone={stats.idle.length > 0 ? 'red' : 'teal'}
              icon={Users}
            />
            <Stat
              label={`تكلفة الوقت الضائع (${baseCurrency})`}
              value={money(stats.totalBenchCost)}
              hint={`${stats.totalIdleDays.toFixed(1)} يوم غير مستغل إجمالاً`}
              tone={stats.totalBenchCost > 0 ? 'red' : 'green'}
              icon={AlertTriangle}
            />
            <Stat
              label={`الفرصة الإيرادية المتاحة`}
              value={`+${money(stats.totalPotentialRevenue)}`}
              hint={`صافي ربح محتمل +${money(stats.totalPotentialProfit)} ${baseCurrency}`}
              tone="indigo"
              icon={TrendingUp}
            />
          </div>

          {/* 4. Interactive Executive Charts (Donut + Per-Employee Bar) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <ExecutiveChartCard
              className="lg:col-span-5"
              title="توزيع الكوادر حسب فئة الاستغلال"
              subtitle="مقارنة الكوادر المستغلة كلياً مقابل الاستغلال الجزئي والوقت غير المستغل"
              icon={PieChart}
              accent="emerald"
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300 font-semibold">
                  <span>إجمالي الكوادر النشطة: <strong className="num text-slate-900 dark:text-white">{stats.total}</strong></span>
                  <span>متوسط الاستغلال: <strong className="num text-emerald-700 dark:text-emerald-400">{stats.avgUtilization}%</strong></span>
                </div>
              }
            >
              <ExecutiveDonutChart
                data={tierDonutData}
                centerValue={`${stats.avgUtilization}%`}
                centerLabel="متوسط الاستغلال"
                unit="موظف"
                height={235}
              />
            </ExecutiveChartCard>

            <ExecutiveChartCard
              className="lg:col-span-7"
              title="نسبة الاستغلال مقابل الوقت الشاغر لكل موظف (%)"
              subtitle="رسم تفاعلي مكدس يوضح حصة المشاريع مقارنة بالوقت غير المستغل لكل كادر"
              icon={BarChart3}
              accent="indigo"
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-600 dark:text-slate-300 font-semibold">
                  <span>إجمالي الأيام المخصصة: <strong className="num text-indigo-700 dark:text-indigo-300">{stats.totalAllocDays.toFixed(1)} يوم</strong></span>
                  <span>إجمالي الأيام الشاغرة: <strong className="num text-amber-700 dark:text-amber-300">{stats.totalIdleDays.toFixed(1)} يوم</strong></span>
                </div>
              }
            >
              <ExecutiveBarChart
                categories={empBarChart.categories}
                series={empBarChart.series}
                horizontal
                unit="%"
                height={235}
                emptyText="لا توجد بيانات موظفين في هذه الفترة"
              />
            </ExecutiveChartCard>
          </div>

          {/* 5. Smart Executive Recommendations Engine Panel */}
          {executiveRecommendations.length > 0 && (
            <div className="card cyber-card-purple p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-sm">
                    <Sparkles className="size-4.5" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white leading-snug">
                      التوصيات التنفيذية الذكية لتعظيم استغلال الكوادر والربحية
                    </h2>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      تحليل تلقائي لحظي للفجوات التشغيلية، تكلفة الـ Bench، وإعادة توزيع الكوادر والأسعار
                    </p>
                  </div>
                </div>
                <Badge color="purple" dot>
                  {executiveRecommendations.length} توصيات نشطة
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {executiveRecommendations.map((rec) => {
                  const toneStyles = {
                    rose: 'border-rose-300/80 bg-rose-50/70 dark:border-rose-500/35 dark:bg-rose-950/25',
                    amber: 'border-amber-300/85 bg-amber-50/75 dark:border-amber-500/35 dark:bg-amber-950/25',
                    indigo: 'border-indigo-300/80 bg-indigo-50/70 dark:border-indigo-500/35 dark:bg-indigo-950/25',
                    emerald: 'border-emerald-300/80 bg-emerald-50/70 dark:border-emerald-500/35 dark:bg-emerald-950/25',
                  }[rec.tone];
                  const badgeColor = {
                    rose: 'red',
                    amber: 'amber',
                    indigo: 'indigo',
                    emerald: 'green',
                  }[rec.tone];

                  return (
                    <div
                      key={rec.id}
                      className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 ${toneStyles}`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge color={badgeColor}>{rec.tag}</Badge>
                          {rec.metric && (
                            <span className="num font-mono text-xs font-extrabold text-slate-900 dark:text-white bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700">
                              {rec.metric}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-start gap-1.5 leading-snug">
                          <Lightbulb className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <span>{rec.title}</span>
                        </h3>
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                          {rec.body}
                        </p>
                      </div>

                      {rec.targetRow && (
                        <div className="flex items-center justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setQuickAssignTarget(rec.targetRow!)}
                            className="btn-primary h-7.5 px-3 text-[11.5px] gap-1"
                          >
                            <Zap className="size-3.5 text-amber-300" />
                            <span>تسكين المتبقي لـ {rec.targetRow.employeeName} الآن</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. Comprehensive Master Employee Utilization & Projects Breakdown Table */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-[#091020]">
              <div className="flex items-center gap-2">
                <Target className="size-4.5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                  الجدول التفصيلي لاستغلال الكوادر والمشاريع والتوصيات ({filteredRows.length} من أصل {allRows.length} موظف)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                <span>اضغط على سهم التفاصيل لعرض تفصيل كل مشروع والربحية والتوصية الكاملة</span>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState
                text={
                  allRows.length === 0
                    ? 'لا يوجد موظفون نشطون في هذه الفترة المالية بعد.'
                    : 'لا يوجد موظفون مطابقون لمعايير التصفية المختارة.'
                }
                action={
                  tierFilter !== 'ALL' || searchQuery || filters.costCenterId || filters.clientId || filters.projectId || filters.employeeId || filters.departmentId || deptFilter !== 'ALL' || projectFilter !== 'ALL' ? (
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => {
                        resetAll();
                        setTierFilter('ALL');
                        setDeptFilter('ALL');
                        setProjectFilter('ALL');
                      }}
                    >
                      إعادة ضبط جميع الفلاتر
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-10 text-center">#</th>
                      <th>الموظف والقسم</th>
                      <th>تصنيف الاستغلال</th>
                      <th>نسبة الاستغلال والأيام</th>
                      <th>المشاريع المسندة ونسبة كل مشروع</th>
                      <th className="text-end">الإيراد / التكلفة / الهدر ({baseCurrency})</th>
                      <th>التوصية الفورية والإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => {
                      const tier = TIER_META[r.utilizationTier];
                      const isExpanded = Boolean(expandedEmpIds[r.employeeId]);
                      const barPct = Math.min(100, Math.max(0, r.allocatedPct));

                      return (
                        <Fragment key={r.employeeId}>
                          <tr className={isExpanded ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : undefined}>
                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() => toggleExpand(r.employeeId)}
                                className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                                title={isExpanded ? 'إخفاء التفصيل الكامل' : 'عرض تفصيل المشاريع والربحية'}
                              >
                                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                              </button>
                            </td>

                            {/* Employee + Position + Dept */}
                            <td className="min-w-[175px]">
                              <Link
                                to={`/hr/employees/${r.employeeId}`}
                                className="font-bold text-indigo-700 hover:underline dark:text-indigo-300 inline-flex items-center gap-1"
                              >
                                <span>{r.employeeName}</span>
                                <ExternalLink className="size-3 opacity-60" />
                              </Link>
                              <div className="text-[11.5px] font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                                {r.positionTitle}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {r.employeeCode && (
                                  <span className="font-mono text-[10.5px] font-bold rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    {r.employeeCode}
                                  </span>
                                )}
                                <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                                  {r.departmentName}
                                </span>
                              </div>
                            </td>

                            {/* Utilization Tier Classification */}
                            <td className="min-w-[140px]">
                              <Badge color={tier.badgeColor} dot>
                                {tier.label}
                              </Badge>
                              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1">
                                {r.projects.length === 0
                                  ? '0 مشاريع مسندة'
                                  : r.projects.length === 1
                                    ? 'مسند لمشروع واحد'
                                    : `موزّع على ${r.projects.length} مشاريع`}
                              </div>
                            </td>

                            {/* Allocation % + Visual Bar + Days */}
                            <td className="min-w-[190px]">
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="num font-mono font-extrabold text-slate-900 dark:text-white">
                                  {r.allocatedPct.toFixed(1)}%
                                </span>
                                <span className="num font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                  {r.allocatedDays.toFixed(1)} / {r.workingDaysInMonth} يوم
                                </span>
                              </div>
                              <div className="mt-1.5 h-2 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full bg-gradient-to-l ${tier.barColor} transition-all duration-500`}
                                  style={{ width: `${barPct}%` }}
                                />
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                                {r.unutilizedPct > 0 ? (
                                  <span className="font-bold text-amber-700 dark:text-amber-400">
                                    شاغر: <span className="num font-mono">{r.unutilizedPct.toFixed(1)}%</span> ({r.unutilizedDays.toFixed(1)} يوم)
                                  </span>
                                ) : (
                                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                                    وقت ضائع: 0%
                                  </span>
                                )}
                                {r.overAllocatedPct > 0 && (
                                  <span className="font-bold text-rose-600 dark:text-rose-400">
                                    فائض: +{r.overAllocatedPct.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Full Assigned Projects Breakdown Chips */}
                            <td className="min-w-[260px]">
                              {r.projects.length === 0 ? (
                                <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/75 bg-rose-50/80 px-2.5 py-1.5 text-xs font-bold text-rose-700 dark:border-rose-500/35 dark:bg-rose-950/30 dark:text-rose-300">
                                  <AlertTriangle className="size-3.5 shrink-0" />
                                  <span>غير مسند لأي مشروع (على قوة الشركة — Bench)</span>
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {r.projects.map((p, idx) => (
                                    <Link
                                      key={`${p.projectId}-${idx}`}
                                      to={p.projectId ? `/prj/projects/${p.projectId}` : '/prj/projects'}
                                      className="flex items-center justify-between gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/60 hover:bg-indigo-100/70 px-2.5 py-1.5 transition-colors dark:border-indigo-500/30 dark:bg-indigo-950/35 dark:hover:bg-indigo-900/40"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                          {p.projectCode ? `${p.projectCode} — ` : ''}{p.projectName}
                                        </div>
                                        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                          العميل: {p.clientName}
                                        </div>
                                      </div>
                                      <div className="shrink-0 text-end">
                                        <span className="num font-mono text-xs font-extrabold text-indigo-700 dark:text-indigo-300 block">
                                          {p.allocationPct.toFixed(1)}%
                                        </span>
                                        <span className="num font-mono text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                                          {p.allocatedDays.toFixed(1)} يوم
                                        </span>
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Financial Impact */}
                            <td className="min-w-[180px] text-end">
                              <div className="space-y-1 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-500 dark:text-slate-400">الإيراد:</span>
                                  <span className="num font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                    {money(r.revenueBase)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-500 dark:text-slate-400">التكلفة:</span>
                                  <span className="num font-mono font-bold text-slate-800 dark:text-slate-200">
                                    {money(r.totalCostBase)}
                                  </span>
                                </div>
                                {r.unutilizedCostBase > 0 && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-rose-600 dark:text-rose-400 font-bold">هدر الشاغر:</span>
                                    <span className="num font-mono font-extrabold text-rose-600 dark:text-rose-400">
                                      {money(r.unutilizedCostBase)}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-2 border-t border-slate-200/70 dark:border-slate-700/70 pt-1">
                                  <span className="text-slate-600 dark:text-slate-300 font-bold">صافي الربح:</span>
                                  <span
                                    className={`num font-mono font-extrabold ${
                                      r.grossProfitBase >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-400'
                                    }`}
                                  >
                                    {money(r.grossProfitBase)}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Per-Employee Recommendation + Direct Action */}
                            <td className="min-w-[240px]">
                              <div className="space-y-2">
                                <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                                  {r.recommendation.headline}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {r.recommendation.actionType === 'ASSIGN_REMAINING' ? (
                                    <button
                                      type="button"
                                      onClick={() => setQuickAssignTarget(r)}
                                      className="btn-primary h-7 px-2.5 text-[11px] gap-1"
                                    >
                                      <Plus className="size-3" />
                                      <span>{r.recommendation.actionLabel}</span>
                                    </button>
                                  ) : r.recommendation.actionType === 'REBALANCE' ? (
                                    <Link to="/prj/assignments" className="btn-secondary h-7 px-2.5 text-[11px] gap-1 border-purple-400/50 text-purple-700 dark:text-purple-300">
                                      <ArrowUpRight className="size-3" />
                                      <span>{r.recommendation.actionLabel}</span>
                                    </Link>
                                  ) : (
                                    <Link to={`/hr/employees/${r.employeeId}`} className="btn-secondary h-7 px-2.5 text-[11px] gap-1">
                                      <ArrowUpRight className="size-3" />
                                      <span>{r.recommendation.actionLabel || 'التفاصيل'}</span>
                                    </Link>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(r.employeeId)}
                                    className="btn-ghost h-7 px-2 text-[11px] text-indigo-700 dark:text-indigo-300"
                                  >
                                    {isExpanded ? 'إخفاء التفصيل' : 'التفصيل والتوصية'}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Full Breakdown Drawer Row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/95 dark:bg-[#081020]">
                              <td colSpan={7} className="p-4">
                                <div className="space-y-4">
                                  {/* Detailed Recommendation Card */}
                                  <div className="rounded-xl border border-indigo-200/80 bg-white p-3.5 shadow-2xs dark:border-indigo-500/30 dark:bg-[#0d162c] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                          color={
                                            r.recommendation.severity === 'critical'
                                              ? 'red'
                                              : r.recommendation.severity === 'warning'
                                                ? 'amber'
                                                : r.recommendation.severity === 'opportunity'
                                                  ? 'indigo'
                                                  : 'green'
                                          }
                                        >
                                          {r.recommendation.badge}
                                        </Badge>
                                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                          توصية الذكاء التشغيلي للموظف: {r.employeeName}
                                        </span>
                                      </div>
                                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                                        {r.recommendation.detail}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap shrink-0 items-center gap-2">
                                      {r.unutilizedPct > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setQuickAssignTarget(r)}
                                          className="btn-primary h-8 px-3 text-xs gap-1.5"
                                        >
                                          <Zap className="size-3.5 text-amber-300" />
                                          <span>تسكين {r.unutilizedDays.toFixed(1)} يوم ({r.unutilizedPct.toFixed(0)}%)</span>
                                        </button>
                                      )}
                                      <Link
                                        to={`/hr/employees/${r.employeeId}`}
                                        className="btn-secondary h-8 px-3 text-xs gap-1"
                                      >
                                        <span>ملف الموظف 360°</span>
                                        <ArrowUpRight className="size-3.5" />
                                      </Link>
                                    </div>
                                  </div>

                                  {/* Employee Cost & Opportunity Breakdown Strip */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 dark:border-slate-800 dark:bg-[#0d162c]">
                                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">التكلفة المباشرة الشهرية</div>
                                      <div className="num font-mono text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                                        {money(r.directCostBase)} {baseCurrency}
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 dark:border-slate-800 dark:bg-[#0d162c]">
                                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">المصروفات الإدارية (Overhead)</div>
                                      <div className="num font-mono text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                                        {money(r.overheadBase)} {baseCurrency}
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 dark:border-slate-800 dark:bg-[#0d162c]">
                                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">التكلفة اليومية المباشرة</div>
                                      <div className="num font-mono text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                                        {money(r.dailyDirectCostBase)} / يوم
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 dark:border-slate-800 dark:bg-[#0d162c]">
                                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">متوسط سعر الفوترة اليومي</div>
                                      <div className="num font-mono text-sm font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
                                        {money(r.effectiveDailyRateBase)} / يوم
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-rose-200/80 bg-rose-50/50 p-2.5 dark:border-rose-500/30 dark:bg-rose-950/20">
                                      <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">تكلفة الوقت الضائع</div>
                                      <div className="num font-mono text-sm font-extrabold text-rose-700 dark:text-rose-400 mt-0.5">
                                        {money(r.unutilizedCostBase)} {baseCurrency}
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-2.5 dark:border-indigo-500/30 dark:bg-indigo-950/20">
                                      <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">إيراد محتمل للأيام الشاغرة</div>
                                      <div className="num font-mono text-sm font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5">
                                        +{money(r.potentialRevenueBase)} {baseCurrency}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Projects Table for this Employee */}
                                  {r.projects.length > 0 && (
                                    <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden dark:border-slate-800 dark:bg-[#0d162c]">
                                      <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                          <DollarSign className="size-3.5 text-emerald-600" />
                                          <span>تفصيل توزيع {r.employeeName} على المشاريع التعاقدية ({r.projects.length})</span>
                                        </span>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <table className="table table-compact">
                                          <thead>
                                            <tr>
                                              <th>المشروع</th>
                                              <th>العميل</th>
                                              <th>فترة التخصيص</th>
                                              <th className="num">النسبة%</th>
                                              <th className="num">الأيام</th>
                                              <th className="num">سعر الخدمة</th>
                                              <th className="num text-end">الإيراد ({baseCurrency})</th>
                                              <th className="num text-end">حصة التكلفة ({baseCurrency})</th>
                                              <th className="num text-end">الربح ({baseCurrency})</th>
                                              <th className="num text-end">الهامش%</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {r.projects.map((p, idx) => (
                                              <tr key={`${p.projectId}-detail-${idx}`}>
                                                <td>
                                                  <Link
                                                    to={p.projectId ? `/prj/projects/${p.projectId}` : '/prj/projects'}
                                                    className="font-bold text-indigo-700 hover:underline dark:text-indigo-300"
                                                  >
                                                    {p.projectCode ? `${p.projectCode} — ` : ''}{p.projectName}
                                                  </Link>
                                                </td>
                                                <td>{p.clientName}</td>
                                                <td className="num text-[11px]">
                                                  {p.startDate ? date(p.startDate) : '—'} ← {p.endDate ? date(p.endDate) : 'مفتوح'}
                                                </td>
                                                <td className="num font-bold text-indigo-700 dark:text-indigo-300">
                                                  {p.allocationPct.toFixed(1)}%
                                                </td>
                                                <td className="num font-bold">{p.allocatedDays.toFixed(1)} يوم</td>
                                                <td className="num">
                                                  {money(p.billableRate)} / {p.pricingBasis === 'MONTHLY' ? 'شهر' : p.pricingBasis === 'HOURLY' ? 'ساعة' : 'يوم'}
                                                </td>
                                                <td className="num text-end font-bold text-emerald-700 dark:text-emerald-400">
                                                  {money(p.revenueBase)}
                                                </td>
                                                <td className="num text-end">{money(p.totalCostShareBase)}</td>
                                                <td
                                                  className={`num text-end font-bold ${
                                                    p.profitBase >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                                  }`}
                                                >
                                                  {money(p.profitBase)}
                                                </td>
                                                <td className="num text-end font-bold">
                                                  <Badge color={p.marginPct >= r.targetMarginPct ? 'green' : p.marginPct >= 0 ? 'amber' : 'red'}>
                                                    {p.marginPct.toFixed(1)}%
                                                  </Badge>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="font-extrabold">
                        الإجمالي العام ({filteredRows.length} موظف)
                      </td>
                      <td className="num">
                        متوسط:{' '}
                        {filteredRows.length > 0
                          ? (filteredRows.reduce((s, r) => s + r.allocatedPct, 0) / filteredRows.length).toFixed(1)
                          : '0.0'}
                        % •{' '}
                        {filteredRows.reduce((s, r) => s + r.allocatedDays, 0).toFixed(1)} يوم مخصص /{' '}
                        {filteredRows.reduce((s, r) => s + r.unutilizedDays, 0).toFixed(1)} يوم شاغر
                      </td>
                      <td>
                        {filteredRows.filter((r) => r.utilizationTier === 'FULL').length} كلي •{' '}
                        {filteredRows.filter((r) => r.utilizationTier === 'PARTIAL').length} جزئي •{' '}
                        {filteredRows.filter((r) => r.utilizationTier === 'IDLE').length} متفرغ
                      </td>
                      <td className="num text-end">
                        إيراد: {money(filteredRows.reduce((s, r) => s + r.revenueBase, 0))} | هدر:{' '}
                        {money(filteredRows.reduce((s, r) => s + r.unutilizedCostBase, 0))}
                      </td>
                      <td className="num">
                        فرصة إيراد إضافية: +{money(filteredRows.reduce((s, r) => s + r.potentialRevenueBase, 0))} {baseCurrency}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 7. Quick-Assign Modal (1-Click Action from Any Recommendation or Row) */}
      <FormModal
        open={quickAssignTarget !== null}
        wide
        title={
          quickAssignTarget
            ? `تسكين الطاقة الشاغرة للموظف: ${quickAssignTarget.employeeName}`
            : 'تخصيص كادر على مشروع'
        }
        fields={quickAssignFields}
        onClose={() => setQuickAssignTarget(null)}
        onSubmit={async (body) => {
          const payload = {
            ...body,
            workingDaysInMonth: quickAssignTarget?.workingDaysInMonth || 22,
            billingCurrency: baseCurrency,
            isBillable: true,
          };
          await api.post('/assignments', payload);
          qc.invalidateQueries({ queryKey: ['utilization'] });
          qc.invalidateQueries({ queryKey: ['/assignments'] });
          qc.invalidateQueries({ queryKey: ['/assignments/employee-days-report'] });
          qc.invalidateQueries({ queryKey: ['employee-profitability'] });
          qc.invalidateQueries({ queryKey: ['project-profitability'] });
          toast.success('تم تسكين الموظف على المشروع وتحديث نسب الاستغلال والربحية فوراً!');
        }}
      />
    </div>
  );
}
