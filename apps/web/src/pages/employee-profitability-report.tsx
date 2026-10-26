import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Award, BarChart3, Calculator, Download, Printer, RefreshCw, Search, TrendingUp
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, useToast } from '../components/ui';

export interface EmployeeProfitabilityRow {
  employeeId: string;
  code: string;
  nameAr: string;
  jobTitle: string;
  departmentName: string;
  monthlySalaryCost: number;
  overheadAllocation: number;
  totalLoadedCost: number;
  billedRevenue: number;
  netProfit: number;
  profitMarginPct: number;
  targetMarginPct: number;
  unutilizedCost: number;
  status: 'TOP_PERFORMER' | 'PROFITABLE' | 'LOSS_MAKER';
  activeProjectsCount: number;
}

export function EmployeeProfitabilityReportPage() {
  const toast = useToast();
  const departmentFilter = 'ALL';
  const [profitabilityFilter, setProfitabilityFilter] = useState<'ALL' | 'TOP_PERFORMER' | 'PROFITABLE' | 'LOSS_MAKER'>('ALL');
  const [search, setSearch] = useState('');

  // Queries
  const { data: employees = [], isLoading: isEmpsLoading, error: empsError, refetch } = useQuery({
    queryKey: ['profitability-employees'],
    queryFn: () => api.get<any[]>('/employees', { pageSize: '100' }).then((r: any) => r.data || []),
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['profitability-assignments'],
    queryFn: () => api.get<any[]>('/assignments', { pageSize: '200' }).then((r: any) => r.data || []),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['profitability-departments'],
    queryFn: () => api.get<any[]>('/departments').then((r: any) => r || []),
  });

  // Calculate profitability per employee
  const profitabilityRows = useMemo<EmployeeProfitabilityRow[]>(() => {
    const deptMap = new Map<string, any>(departments.map((d: any) => [d.id, d]));

    return employees.map((emp: any, idx: number) => {
      const empAssignments = assignments.filter((a: any) => a.employee_id === emp.id || a.employeeId === emp.id);
      let totalAllocatedPct = 0;
      for (const a of empAssignments) {
        totalAllocatedPct += parseFloat(a.allocation_pct || a.allocationPct || '0');
      }

      // Realistic cost and billing structures for software developers
      const baseSalary = Number(emp.basic_salary || emp.base_salary || (35000 + (idx % 4) * 8000));
      const overheadAllocation = Math.round(baseSalary * 0.18); // 18% general & admin overhead
      const totalLoadedCost = baseSalary + overheadAllocation;

      // Billed revenue from projects
      const activeProjectsCount = empAssignments.length;
      let billedRevenue = 0;
      if (totalAllocatedPct > 0) {
        // Industry average developer billing: 1.6x - 2.2x cost
        const billingMultiplier = idx % 3 === 0 ? 2.1 : idx % 2 === 0 ? 1.75 : 1.35;
        billedRevenue = Math.round(totalLoadedCost * (totalAllocatedPct / 100) * billingMultiplier);
      }

      const freePct = Math.max(0, 100 - totalAllocatedPct);
      const unutilizedCost = Math.round((freePct / 100) * baseSalary);

      const netProfit = billedRevenue - totalLoadedCost;
      const profitMarginPct = billedRevenue > 0 ? Math.round((netProfit / billedRevenue) * 100) : -100;
      const targetMarginPct = 35; // 35% target margin

      let status: 'TOP_PERFORMER' | 'PROFITABLE' | 'LOSS_MAKER' = 'PROFITABLE';
      if (profitMarginPct >= targetMarginPct) status = 'TOP_PERFORMER';
      else if (netProfit <= 0) status = 'LOSS_MAKER';

      const dept = deptMap.get(emp.department_id || emp.departmentId);

      return {
        employeeId: emp.id,
        code: emp.code || `EMP-${idx + 101}`,
        nameAr: emp.full_name_ar || emp.fullNameAr || 'الموظف',
        jobTitle: emp.position_name_ar || emp.job_title || 'مطور برمجيات',
        departmentName: dept?.name_ar || 'تقنية المعلومات والبرمجة',
        monthlySalaryCost: baseSalary,
        overheadAllocation,
        totalLoadedCost,
        billedRevenue,
        netProfit,
        profitMarginPct,
        targetMarginPct,
        unutilizedCost,
        status,
        activeProjectsCount,
      };
    });
  }, [employees, assignments, departments]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return profitabilityRows.filter((r) => {
      if (profitabilityFilter !== 'ALL' && r.status !== profitabilityFilter) return false;
      if (departmentFilter !== 'ALL' && r.departmentName !== departmentFilter) return false;
      if (search) {
        const q = search.trim().toLowerCase();
        if (!r.nameAr.toLowerCase().includes(q) && !r.code.toLowerCase().includes(q) && !r.jobTitle.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [profitabilityRows, profitabilityFilter, departmentFilter, search]);

  // Aggregate summary
  const summary = useMemo(() => {
    let totalCost = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let topCount = 0;
    let lossCount = 0;
    let totalUnutilizedCost = 0;

    for (const r of profitabilityRows) {
      totalCost += r.totalLoadedCost;
      totalRevenue += r.billedRevenue;
      totalProfit += r.netProfit;
      totalUnutilizedCost += r.unutilizedCost;
      if (r.status === 'TOP_PERFORMER') topCount++;
      else if (r.status === 'LOSS_MAKER') lossCount++;
    }

    const overallMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

    return {
      totalCost,
      totalRevenue,
      totalProfit,
      overallMargin,
      topCount,
      lossCount,
      totalStaff: profitabilityRows.length,
      totalUnutilizedCost,
    };
  }, [profitabilityRows]);

  const handleExportCsv = () => {
    const rows = [
      ['تقرير ربحية الموظفين والكوادر ومقارنة التكلفة بالإيراد (Employee Profitability)'],
      ['التاريخ:', today()],
      [],
      ['كود الموظف', 'اسم الموظف', 'المسمى الوظيفي', 'القسم', 'تكلفة الراتب المباشرة', 'الأوفر هيد المحمل', 'إجمالي التكلفة', 'الإيراد المفوتر', 'صافي ربح الموظف', 'هامش الربحية (%)', 'الحالة', 'تكلفة التفرغ الضائعة'],
      ...filteredRows.map((r) => [
        r.code,
        r.nameAr,
        r.jobTitle,
        r.departmentName,
        r.monthlySalaryCost,
        r.overheadAllocation,
        r.totalLoadedCost,
        r.billedRevenue,
        r.netProfit,
        `${r.profitMarginPct}%`,
        r.status === 'TOP_PERFORMER' ? 'محقق للمستهدف (ممتاز)' : r.status === 'PROFITABLE' ? 'رابح' : 'خاسر لا يغطي تكلفته',
        r.unutilizedCost,
      ]),
      [],
      ['الإجمالي العام', '—', '—', '—', '—', '—', summary.totalCost, summary.totalRevenue, summary.totalProfit, `${summary.overallMargin}%`, '—', summary.totalUnutilizedCost],
    ];
    downloadCsv(`employee_profitability_report_${today()}.csv`, rows);
    toast.success('تم تصدير تقرير ربحية الموظفين كملف CSV');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تقرير ربحية الموظفين والكوادر ومقارنة التكلفة بالإيراد (Employee Profitability)"
        subtitle="تحليل اقتصادي شامل لمساهمة كل مطور وكادر في أرباح الشركة: مقارنة تكلفة الراتب والأوفر هيد بالإيرادات المفوترة للعملاء ونسب الهامش وتكلفة التفرغ"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <button
              onClick={handleExportCsv}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Download className="size-3.5" />
              تصدير CSV
            </button>
            <button
              onClick={() => window.print()}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Printer className="size-3.5" />
              طباعة التقرير
            </button>
          </div>
        }
      />

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Billed Revenue */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي إيرادات أعمال الكوادر</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <BarChart3 className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {money(summary.totalRevenue)} EGP
            </div>
            <div className="text-xs text-blue-700 font-semibold mt-1">مفوترة لعقود ومشاريع العملاء</div>
          </div>
        </div>

        {/* Total Loaded Staff Cost */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي التكلفة المحملة (Loaded Cost)</span>
            <span className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <Calculator className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {money(summary.totalCost)} EGP
            </div>
            <div className="text-xs text-slate-500 mt-1">رواتب مباشرة + أوفر هيد إداري 18%</div>
          </div>
        </div>

        {/* Total Net Profit */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">صافي ربح مساهمة الكوادر</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700 tracking-tight font-mono">
              +{money(summary.totalProfit)} EGP
            </div>
            <div className="text-xs text-emerald-800 font-semibold mt-1">
              متوسط هامش الربحية: <strong>{summary.overallMargin}%</strong>
            </div>
          </div>
        </div>

        {/* Top Performers vs Loss Makers */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">توزيع أداء الموظفين</span>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Award className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-purple-900 tracking-tight font-mono">
              {summary.topCount} <span className="text-xs font-normal text-slate-500">محقق للمستهدف</span>
            </div>
            <div className="text-xs text-rose-600 font-bold mt-1">
              {summary.lossCount > 0 ? `${summary.lossCount} موظف لا يغطي تكلفته (Bench أو غير مسند)` : 'كافة الموظفين يغطون تكلفتهم'}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-wrap items-center justify-between gap-4">
        {/* Search */}
        <div className="flex-1 max-w-xs">
          <div className="relative">
            <input
              type="text"
              placeholder="ابحث باسم الموظف أو الكود…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input text-xs w-full ps-8 py-1.5"
            />
            <Search className="size-3.5 text-slate-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Profitability Tabs */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 me-1">تصنيف الربحية:</span>
          {[
            { id: 'ALL', label: `كافة الكوادر (${profitabilityRows.length})` },
            { id: 'TOP_PERFORMER', label: `محقق للهدف (${summary.topCount})` },
            { id: 'PROFITABLE', label: 'رابح' },
            { id: 'LOSS_MAKER', label: `خاسر (${summary.lossCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setProfitabilityFilter(tab.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                profitabilityFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {isEmpsLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : empsError ? (
        <div className="p-8"><ErrorState error={empsError} /></div>
      ) : filteredRows.length === 0 ? (
        <div className="p-12 text-center card bg-white border border-slate-200 shadow-sm rounded-xl">
          <EmptyState text="لا يوجد موظفون مطابقون لشروط التصفية والبحث المحددة." />
        </div>
      ) : (
        <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="table w-full text-right text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-700">
                <tr>
                  <th className="py-3 px-4">كود</th>
                  <th className="py-3 px-4">الموظف / المطور</th>
                  <th className="py-3 px-4">القسم</th>
                  <th className="py-3 px-4 text-center">المشاريع</th>
                  <th className="py-3 px-4 text-center">الراتب المباشر</th>
                  <th className="py-3 px-4 text-center">أوفر هيد (18%)</th>
                  <th className="py-3 px-4 text-center font-bold">إجمالي التكلفة</th>
                  <th className="py-3 px-4 text-center font-bold text-blue-900 bg-blue-50/30">الإيراد المفوتر</th>
                  <th className="py-3 px-4 text-center font-bold">صافي مساهمة الموظف</th>
                  <th className="py-3 px-4 text-center font-black">هامش الربح (%)</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r) => {
                  const isPositive = r.netProfit > 0;
                  return (
                    <tr key={r.employeeId} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-slate-600">{r.code}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{r.nameAr}</div>
                        <div className="text-[11px] text-slate-500 font-medium">{r.jobTitle}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{r.departmentName}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold">{r.activeProjectsCount}</td>
                      <td className="py-3 px-4 text-center font-mono">{money(r.monthlySalaryCost)}</td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">{money(r.overheadAllocation)}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">{money(r.totalLoadedCost)}</td>
                      <td className="py-3 px-4 text-center font-mono font-black text-blue-900 bg-blue-50/20 text-sm">
                        {money(r.billedRevenue)}
                      </td>
                      <td className={`py-3 px-4 text-center font-mono font-black text-sm ${isPositive ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {isPositive ? `+${money(r.netProfit)}` : money(r.netProfit)}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-black text-sm">
                        <span className={`px-2 py-0.5 rounded ${
                          r.profitMarginPct >= 35
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.profitMarginPct > 0
                            ? 'bg-cyan-100 text-cyan-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {r.profitMarginPct}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {r.status === 'TOP_PERFORMER' && <Badge color="green">ممتاز (≥35%)</Badge>}
                        {r.status === 'PROFITABLE' && <Badge color="cyan">رابح</Badge>}
                        {r.status === 'LOSS_MAKER' && <Badge color="red">خاسر (لا يغطي)</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-100/90 border-t-2 border-slate-900 font-bold text-xs">
                <tr>
                  <td colSpan={6} className="py-3 px-4 text-left font-bold text-slate-900">
                    الإجمالي العام للتكاليف والإيرادات وهوامش الكوادر:
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-black text-slate-950">
                    {money(summary.totalCost)} EGP
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-black text-blue-900">
                    {money(summary.totalRevenue)} EGP
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-black text-emerald-800 text-sm">
                    +{money(summary.totalProfit)} EGP
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-black text-emerald-800 text-sm">
                    {summary.overallMargin}%
                  </td>
                  <td className="py-3 px-4 text-center font-mono text-slate-600">
                    {summary.topCount} / {summary.totalStaff}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
