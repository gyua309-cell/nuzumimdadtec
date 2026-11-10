import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Award, BarChart3, Calculator, Download,
  Printer, RefreshCw, Search, TrendingUp, Users, Briefcase, Building2
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { Badge, Loading, PageHeader, useToast } from '../components/ui';

export function EmployeeProfitabilityReportPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'employees' | 'projects' | 'clients'>('employees');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'TOP_PERFORMER' | 'PROFITABLE' | 'LOSS_MAKER'>('ALL');
  const [search, setSearch] = useState('');

  // 1. Employees Profitability Query (Level 1)
  const empQ = useQuery({
    queryKey: ['/profitability/employees'],
    queryFn: () => api.get<any>('/profitability/employees').then((r: any) => r?.data || r || {}),
  });

  // 2. Projects Profitability Query (Level 2)
  const prjQ = useQuery({
    queryKey: ['/profitability/projects'],
    queryFn: () => api.get<any[]>('/profitability/projects').then((r: any) => Array.isArray(r) ? r : (r?.data || [])),
  });

  // 3. Clients Profitability Query (Level 3)
  const cliQ = useQuery({
    queryKey: ['/profitability/clients'],
    queryFn: () => api.get<any[]>('/profitability/clients').then((r: any) => Array.isArray(r) ? r : (r?.data || [])),
  });

  const isLoading = empQ.isLoading || prjQ.isLoading || cliQ.isLoading;

  const employees: any[] = Array.isArray(empQ.data?.employees) ? empQ.data.employees : (Array.isArray(empQ.data?.data) ? empQ.data.data : (Array.isArray(empQ.data) ? empQ.data : []));
  const empSummary = empQ.data?.summary || {
    totalRevenueBase: '0.00',
    totalCostBase: '0.00',
    totalUnutilizedCostBase: '0.00',
    totalProfitBase: '0.00',
    averageMarginPct: '0.00',
    employeeCount: employees.length,
  };

  const projects: any[] = Array.isArray(prjQ.data) ? prjQ.data : (prjQ.data?.data || []);
  const clients: any[] = Array.isArray(cliQ.data) ? cliQ.data : (cliQ.data?.data || []);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (search) {
        const q = search.trim().toLowerCase();
        const name = (e.employeeName || e.nameAr || '').toLowerCase();
        const code = (e.employeeCode || e.code || '').toLowerCase();
        const pos = (e.positionTitle || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !pos.includes(q)) return false;
      }
      return true;
    });
  }, [employees, statusFilter, search]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (search) {
        const q = search.trim().toLowerCase();
        const name = (p.projectName || p.nameAr || '').toLowerCase();
        const code = (p.projectCode || p.code || '').toLowerCase();
        const client = (p.clientName || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !client.includes(q)) return false;
      }
      return true;
    });
  }, [projects, search]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const q = search.trim().toLowerCase();
        const name = (c.clientName || c.nameAr || '').toLowerCase();
        const code = (c.clientCode || c.code || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }
      return true;
    });
  }, [clients, search]);

  const handleExportCsv = () => {
    if (activeTab === 'employees') {
      const rows = [
        ['تقرير مصفوفة ربحية الكوادر البشرية والوقت غير المستغل (Business Process L1)'],
        ['تاريخ الاستخراج:', today()],
        [],
        ['كود الموظف', 'اسم الموظف', 'القسم', 'المسمى الوظيفي', 'التخصيص%', 'غير المستغل%', 'تكلفة التفرغ (Bench)', 'التكلفة المباشرة', 'المصروفات الإدارية 10%', 'إجمالي التكلفة', 'الإيراد المفوتر', 'صافي الربح', 'هامش الربح%', 'المستهدف%', 'الحالة'],
        ...filteredEmployees.map((e) => [
          e.employeeCode || e.code,
          e.employeeName || e.nameAr,
          e.departmentName || '',
          e.positionTitle || '',
          `${e.allocatedPct}%`,
          `${e.unutilizedPct}%`,
          e.unutilizedCostBase,
          e.directCostBase,
          e.overheadBase || e.overheadCostBase,
          e.totalCostBase,
          e.revenueBase,
          e.grossProfitBase,
          `${e.grossMarginPct}%`,
          `${e.targetMarginPct}%`,
          e.status === 'TOP_PERFORMER' ? 'ممتاز (فوق المستهدف)' : e.status === 'PROFITABLE' ? 'رابح' : 'خاسر',
        ]),
      ];
      downloadCsv(`Employee_Profitability_${today()}.csv`, rows);
      toast.success('تم تصدير تقرير ربحية الكوادر بنجاح');
    } else if (activeTab === 'projects') {
      const rows = [
        ['تقرير ربحية المشاريع التعاقدية (Business Process L2)'],
        ['تاريخ الاستخراج:', today()],
        [],
        ['كود المشروع', 'اسم المشروع', 'العميل', 'عدد الكوادر', 'إيرادات المشروع', 'تكلفة الكوادر المحملة', 'المصروفات الإدارية', 'إجمالي التكلفة', 'صافي الربح', 'هامش الربح%', 'المستهدف%', 'الحالة'],
        ...filteredProjects.map((p) => [
          p.projectCode || p.code,
          p.projectName || p.nameAr,
          p.clientName || '',
          p.teamCount,
          p.revenueBase,
          p.directCostBase || p.employeeCostBase,
          p.overheadBase || p.overheadCostBase,
          p.totalCostBase,
          p.grossProfitBase,
          `${p.grossMarginPct}%`,
          `${p.requiredMarginPct || p.targetMarginPct}%`,
          p.profitabilityStatus || p.status,
        ]),
      ];
      downloadCsv(`Project_Profitability_${today()}.csv`, rows);
      toast.success('تم تصدير تقرير ربحية المشاريع بنجاح');
    } else {
      const rows = [
        ['تقرير ربحية حسابات العملاء (Business Process L3)'],
        ['تاريخ الاستخراج:', today()],
        [],
        ['كود العميل', 'اسم العميل', 'عدد المشاريع', 'إجمالي الإيرادات', 'التكلفة المباشرة', 'المصروفات الإدارية', 'إجمالي التكلفة', 'صافي الربح', 'هامش الربح%'],
        ...filteredClients.map((c) => [
          c.clientCode || c.code,
          c.clientName || c.nameAr,
          c.projectCount || c.projectsCount,
          c.revenueBase,
          c.directCostBase,
          c.overheadBase,
          c.totalCostBase,
          c.grossProfitBase,
          `${c.grossMarginPct}%`,
        ]),
      ];
      downloadCsv(`Client_Profitability_${today()}.csv`, rows);
      toast.success('تم تصدير تقرير ربحية العملاء بنجاح');
    }
  };

  const refetchAll = () => {
    empQ.refetch();
    prjQ.refetch();
    cliQ.refetch();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="مصفوفة الربحية ثلاثية المستويات (Profitability Intelligence Hub)"
        subtitle="تحليل اقتصادي متكامل يربط (العميل ← المشروع ← الموظف ← التخصيص ← الإيراد والتكلفة ← الربحية الفعلية) وفق وثيقة Business Process."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={refetchAll} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" /> تحديث
            </button>
            <button onClick={handleExportCsv} className="btn-secondary text-xs flex items-center gap-1.5">
              <Download className="size-3.5" /> تصدير CSV
            </button>
            <button onClick={() => window.print()} className="btn-primary text-xs flex items-center gap-1.5">
              <Printer className="size-3.5" /> طباعة التقرير
            </button>
          </div>
        }
      />

      {/* Tabs Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'employees' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="size-4" />
            المستوى 1: ربحية الكوادر البشرية ({employees.length})
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'projects' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Briefcase className="size-4" />
            المستوى 2: ربحية المشاريع التعاقدية ({projects.length})
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition flex items-center gap-2 ${
              activeTab === 'clients' ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 className="size-4" />
            المستوى 3: ربحية حسابات العملاء ({clients.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute start-3 top-2.5 size-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالرمز أو الاسم..."
              className="input ps-8.5 h-8 text-xs w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {activeTab === 'employees' && (
            <select
              className="input h-8 text-xs w-44"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="ALL">كل حالات الربحية</option>
              <option value="TOP_PERFORMER">فوق المستهدف (Top)</option>
              <option value="PROFITABLE">رابح (Profitable)</option>
              <option value="LOSS_MAKER">خاسر لا يغطي تكلفته</option>
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <>
          {/* TAB 1: EMPLOYEES PROFITABILITY */}
          {activeTab === 'employees' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>إجمالي إيرادات أعمال الكوادر</span>
                    <BarChart3 className="size-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 mt-2">
                    {money(Number(empSummary.totalRevenueBase))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">مفوترة لعقود ومشاريع العملاء</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>التكلفة الكلية المحملة</span>
                    <Calculator className="size-4 text-slate-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 mt-2">
                    {money(Number(empSummary.totalCostBase))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">الرواتب المباشرة + 10% Overhead</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>تكلفة الوقت غير المستغل (Bench)</span>
                    <TrendingUp className="size-4 text-rose-500" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-rose-600 mt-2">
                    {money(Number(empSummary.totalUnutilizedCostBase))}
                  </div>
                  <div className="text-[11px] text-rose-600 font-medium mt-1">تكلفة رواتب كوادر دون تخصيص</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                    <span>صافي أرباح الكوادر (الهامش)</span>
                    <Award className="size-4 text-brand-600" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-brand-600 mt-2">
                    {money(Number(empSummary.totalProfitBase))}
                  </div>
                  <div className="text-[11px] text-brand-600 font-bold mt-1">
                    متوسط الهامش: {empSummary.averageMarginPct}%
                  </div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <h3 className="font-semibold text-sm">سجل ربحية وتخصيص الكوادر الفردية</h3>
                  <span className="text-xs text-slate-500">
                    عدد الكوادر المعروضة: <strong className="font-mono text-slate-900 dark:text-white">{filteredEmployees.length}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>كود الكادر</th>
                        <th>اسم الموظف</th>
                        <th>القسم والمسمى</th>
                        <th>التخصيص%</th>
                        <th>غير المستغل%</th>
                        <th>تكلفة التفرغ</th>
                        <th>التكلفة المباشرة</th>
                        <th>الإيراد المولد</th>
                        <th>صافي الربح</th>
                        <th>الهامش%</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="text-center text-slate-500 py-8">
                            لا توجد بيانات كوادر مسجلة بعد.
                          </td>
                        </tr>
                      ) : (
                        filteredEmployees.map((e) => (
                          <tr key={e.employeeId || e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="font-mono font-bold text-xs">{e.employeeCode || e.code}</td>
                            <td>
                              <Link to={`/hr/employees/${e.employeeId || e.id}`} className="font-bold text-brand-600 hover:underline">
                                {e.employeeName || e.nameAr}
                              </Link>
                            </td>
                            <td>
                              <div className="text-xs font-medium">{e.positionTitle || 'مهندس برمجيات'}</div>
                              <div className="text-[11px] text-slate-400">{e.departmentName}</div>
                            </td>
                            <td className="num font-mono">
                              <span className={e.allocatedPct >= 100 ? 'text-emerald-600 font-bold' : 'text-slate-600'}>
                                {e.allocatedPct}%
                              </span>
                            </td>
                            <td className="num font-mono">
                              <span className={e.unutilizedPct > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                                {e.unutilizedPct}%
                              </span>
                            </td>
                            <td className="num font-mono text-rose-600 font-medium">
                              {money(e.unutilizedCostBase)}
                            </td>
                            <td className="num font-mono">{money(e.directCostBase)}</td>
                            <td className="num font-mono font-bold text-emerald-600">{money(e.revenueBase)}</td>
                            <td className={`num font-mono font-bold ${e.grossProfitBase >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {money(e.grossProfitBase)}
                            </td>
                            <td className="num font-mono font-bold">
                              <span className={e.grossMarginPct >= e.targetMarginPct ? 'text-emerald-600' : e.grossProfitBase >= 0 ? 'text-amber-600' : 'text-rose-600'}>
                                {e.grossMarginPct}%
                              </span>
                            </td>
                            <td>
                              <Badge color={e.status === 'TOP_PERFORMER' ? 'green' : e.status === 'PROFITABLE' ? 'blue' : 'red'}>
                                {e.status === 'TOP_PERFORMER' ? 'فوق المستهدف' : e.status === 'PROFITABLE' ? 'رابح' : 'خاسر'}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PROJECTS PROFITABILITY */}
          {activeTab === 'projects' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">إجمالي إيرادات المشاريع</div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 mt-2">
                    {money(projects.reduce((acc, p) => acc + Number(p.revenueBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">عقود العملاء المفوترة</div>
                </div>

                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">تكاليف الكوادر المحملة</div>
                  <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 mt-2">
                    {money(projects.reduce((acc, p) => acc + Number(p.directCostBase || p.employeeCostBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">حصة المشاريع من رواتب الفريق</div>
                </div>

                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">المصروفات الإدارية المحملة (10%)</div>
                  <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 mt-2">
                    {money(projects.reduce((acc, p) => acc + Number(p.overheadBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">أوفر هيد عام للمشاريع</div>
                </div>

                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">إجمالي أرباح المشاريع</div>
                  <div className="text-2xl font-bold font-mono text-brand-600 mt-2">
                    {money(projects.reduce((acc, p) => acc + Number(p.grossProfitBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-brand-600 font-bold mt-1">صافي الأرباح التعاقدية</div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <h3 className="font-semibold text-sm">سجل ربحية المشاريع التعاقدية</h3>
                  <span className="text-xs text-slate-500">
                    عدد المشاريع: <strong className="font-mono text-slate-900 dark:text-white">{filteredProjects.length}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>كود المشروع</th>
                        <th>اسم المشروع</th>
                        <th>العميل</th>
                        <th>فريق العمل</th>
                        <th>إيراد المشروع</th>
                        <th>تكلفة الفريق المحملة</th>
                        <th>الأوفر هيد (10%)</th>
                        <th>إجمالي التكلفة</th>
                        <th>صافي الربح</th>
                        <th>الهامش%</th>
                        <th>المستهدف%</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="text-center text-slate-500 py-8">
                            لا توجد مشاريع مسجلة بعد.
                          </td>
                        </tr>
                      ) : (
                        filteredProjects.map((p) => (
                          <tr key={p.id || p.projectId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="font-mono font-bold text-xs">{p.projectCode || p.code}</td>
                            <td>
                              <Link to={`/prj/projects/${p.id || p.projectId}`} className="font-bold text-brand-600 hover:underline">
                                {p.projectName || p.nameAr}
                              </Link>
                            </td>
                            <td><span className="badge-slate text-xs">{p.clientName}</span></td>
                            <td className="num font-mono">{p.teamCount} كوادر</td>
                            <td className="num font-mono font-bold text-emerald-600">{money(p.revenueBase)}</td>
                            <td className="num font-mono">{money(p.directCostBase || p.employeeCostBase)}</td>
                            <td className="num font-mono text-slate-500">{money(p.overheadBase)}</td>
                            <td className="num font-mono text-slate-800 dark:text-slate-200">{money(p.totalCostBase)}</td>
                            <td className={`num font-mono font-bold ${p.grossProfitBase >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {money(p.grossProfitBase)}
                            </td>
                            <td className="num font-mono font-bold">
                              <span className={p.grossMarginPct >= (p.requiredMarginPct || p.targetMarginPct || 25) ? 'text-emerald-600' : 'text-amber-600'}>
                                {p.grossMarginPct}%
                              </span>
                            </td>
                            <td className="num font-mono text-slate-500">{p.requiredMarginPct || p.targetMarginPct || 25}%</td>
                            <td>
                              <Badge color={p.grossMarginPct >= (p.requiredMarginPct || p.targetMarginPct || 25) ? 'green' : p.grossProfitBase > 0 ? 'amber' : 'red'}>
                                {p.grossMarginPct >= (p.requiredMarginPct || p.targetMarginPct || 25) ? 'محقق للمستهدف' : p.grossProfitBase > 0 ? 'هامشي' : 'خاسر'}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CLIENTS PROFITABILITY */}
          {activeTab === 'clients' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">إجمالي إيرادات العملاء</div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 mt-2">
                    {money(clients.reduce((acc, c) => acc + Number(c.revenueBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">مبيعات العقود المباشرة</div>
                </div>

                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">إجمالي تكاليف خدمة العملاء</div>
                  <div className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 mt-2">
                    {money(clients.reduce((acc, c) => acc + Number(c.totalCostBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">رواتب الكوادر + الأوفر هيد</div>
                </div>

                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">صافي أرباح حسابات العملاء</div>
                  <div className="text-2xl font-bold font-mono text-brand-600 mt-2">
                    {money(clients.reduce((acc, c) => acc + Number(c.grossProfitBase || 0), 0))}
                  </div>
                  <div className="text-[11px] text-brand-600 font-bold mt-1">عائد العقود الاستثماري</div>
                </div>

                <div className="card p-4">
                  <div className="text-xs text-slate-500 font-medium">إجمالي عملاء الشركة</div>
                  <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-2">
                    {clients.length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">حسابات نشطة ومسجلة</div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <h3 className="font-semibold text-sm">سجل ربحية حسابات العملاء</h3>
                  <span className="text-xs text-slate-500">
                    عدد العملاء: <strong className="font-mono text-slate-900 dark:text-white">{filteredClients.length}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>كود العميل</th>
                        <th>اسم العميل</th>
                        <th>عدد المشاريع</th>
                        <th>عدد الكوادر المخصصة</th>
                        <th>إجمالي الإيرادات</th>
                        <th>التكلفة المباشرة</th>
                        <th>المصروفات الإدارية</th>
                        <th>إجمالي التكلفة</th>
                        <th>صافي أرباح العميل</th>
                        <th>هامش الربح%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center text-slate-500 py-8">
                            لا توجد بيانات عملاء مسجلة بعد.
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((c) => (
                          <tr key={c.id || c.clientId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                            <td className="font-mono font-bold text-xs">{c.clientCode || c.code}</td>
                            <td className="font-bold text-slate-900 dark:text-white">{c.clientName || c.nameAr}</td>
                            <td className="num font-mono">{c.projectCount || c.projectsCount || 0} مشاريع</td>
                            <td className="num font-mono">{c.teamCount || 0} كوادر</td>
                            <td className="num font-mono font-bold text-emerald-600">{money(c.revenueBase)}</td>
                            <td className="num font-mono">{money(c.directCostBase)}</td>
                            <td className="num font-mono text-slate-500">{money(c.overheadBase)}</td>
                            <td className="num font-mono text-slate-800 dark:text-slate-200">{money(c.totalCostBase)}</td>
                            <td className={`num font-mono font-bold ${c.grossProfitBase >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {money(c.grossProfitBase)}
                            </td>
                            <td className="num font-mono font-bold">
                              <span className={c.grossMarginPct >= 25 ? 'text-emerald-600' : c.grossProfitBase >= 0 ? 'text-amber-600' : 'text-rose-600'}>
                                {c.grossMarginPct}%
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
