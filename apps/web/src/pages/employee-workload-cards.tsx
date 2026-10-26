import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Download, LayoutGrid, Plus, Printer, RefreshCw,
  Search, Table, UserCheck, Users, Wallet
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';

export interface EmployeeCardData {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  jobTitle: string;
  departmentName: string;
  branchName: string;
  branchCountry: 'SA' | 'EG';
  currency: string;
  monthlyCost: number;
  monthlyCostSar: number;
  monthlyCostEgp: number;
  hourlyCost: number;
  dailyCost: number;
  totalAllocatedPct: number;
  freeCapacityPct: number;
  allocatedDays: number;
  freeDays: number;
  status: 'BENCH' | 'PARTIAL' | 'FULL' | 'OVERALLOCATED';
  unutilizedCost: number;
  unutilizedCostSar: number;
  unutilizedCostEgp: number;
  assignments: {
    id: string;
    projectId: string;
    projectCode: string;
    projectNameAr: string;
    clientNameAr: string;
    allocationPct: number;
    allocatedDays: number;
    roleTitle?: string;
    isBillable: boolean;
  }[];
}

const safeArray = (r: any): any[] => {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.data)) return r.data;
  return [];
};

// Official reciprocal exchange rates
const SAR_TO_EGP = 13.15;
const EGP_TO_SAR = 0.0760456;

export function EmployeeWorkloadCardsPage() {
  const toast = useToast();
  const qc = useQueryClient();

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'BENCH' | 'PARTIAL' | 'FULL' | 'OVERALLOCATED'>('ALL');
  const [branchFilter, setBranchFilter] = useState<'ALL' | 'SA' | 'EG'>('ALL');
  const departmentFilter = 'ALL';
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Modals state
  const [assignModalEmployee, setAssignModalEmployee] = useState<EmployeeCardData | null>(null);
  const [printModalEmployee, setPrintModalEmployee] = useState<EmployeeCardData | null>(null);

  // Queries
  const { data: rawEmployees, isLoading: isEmpsLoading, error: empsError, refetch } = useQuery({
    queryKey: ['workload-employees'],
    queryFn: () => api.get<any>('/employees', { pageSize: '200' }),
  });

  const { data: rawAssignments, isLoading: isAssignmentsLoading } = useQuery({
    queryKey: ['workload-assignments'],
    queryFn: () => api.get<any>('/assignments', { pageSize: '300' }),
  });

  const { data: rawProjects, isLoading: isProjectsLoading } = useQuery({
    queryKey: ['workload-projects'],
    queryFn: () => api.get<any>('/projects', { pageSize: '200' }),
  });

  const { data: rawClients } = useQuery({
    queryKey: ['workload-clients'],
    queryFn: () => api.get<any>('/clients', { pageSize: '200' }),
  });

  const { data: rawDepartments } = useQuery({
    queryKey: ['workload-departments'],
    queryFn: () => api.get<any>('/departments', { pageSize: '200' }),
  });

  const employees = useMemo(() => safeArray(rawEmployees), [rawEmployees]);
  const assignments = useMemo(() => safeArray(rawAssignments), [rawAssignments]);
  const projects = useMemo(() => safeArray(rawProjects), [rawProjects]);
  const clients = useMemo(() => safeArray(rawClients), [rawClients]);
  const departments = useMemo(() => safeArray(rawDepartments), [rawDepartments]);

  // Combined Loading state to prevent premature rendering before assignments arrive
  const isLoading = isEmpsLoading || isAssignmentsLoading || isProjectsLoading;

  // Build employee cards data
  const employeeCards = useMemo<EmployeeCardData[]>(() => {
    const projMap = new Map<string, any>(projects.map((p: any) => [p.id, p]));
    const clientMap = new Map<string, any>(clients.map((c: any) => [c.id, c]));
    const deptMap = new Map<string, any>(departments.map((d: any) => [d.id, d]));

    return employees.map((emp: any) => {
      // Find active assignments for this employee
      const empAssignments = assignments.filter((a: any) => a.employee_id === emp.id || a.employeeId === emp.id);

      let totalPct = 0;
      const formattedAssignments = empAssignments.map((a: any) => {
        const pct = parseFloat(a.allocation_pct || a.allocationPct || '0');
        totalPct += pct;
        const proj = projMap.get(a.project_id || a.projectId);
        const cl = proj ? clientMap.get(proj.client_id || proj.clientId) : null;
        const workingDays = parseFloat(a.working_days_in_month || a.workingDaysInMonth || '22');
        const days = parseFloat(a.allocated_days || a.allocatedDays || String((pct / 100) * workingDays));

        return {
          id: a.id,
          projectId: a.project_id || a.projectId,
          projectCode: proj?.code || a.projectCode || 'PRJ',
          projectNameAr: proj?.name_ar || proj?.nameAr || a.projectNameAr || 'مشروع برمجي',
          clientNameAr: cl?.name_ar || cl?.nameAr || a.clientNameAr || 'عميل تعاقدي',
          allocationPct: pct,
          allocatedDays: Math.round(days * 10) / 10,
          roleTitle: a.role_title || a.roleTitle || emp.positionTitle || emp.position_name_ar || 'مطور برمجيات',
          isBillable: a.is_billable !== false && a.isBillable !== false,
        };
      });

      // Working month standard: 22 days, 176 hours
      const allocatedDays = Math.round(((totalPct / 100) * 22) * 10) / 10;
      const freeCapacityPct = Math.max(0, 100 - totalPct);
      const freeDays = Math.max(0, Math.round((22 - allocatedDays) * 10) / 10);

      // Branch and country detection
      const branchName = emp.branchName || emp.branch_name || (emp.salaryCurrency === 'SAR' ? 'المركز الرئيسي - الرياض (المملكة العربية السعودية)' : 'فرع مصر - القاهرة (مركز التطوير البرمجي)');
      const isSaudi = branchName.includes('الرياض') || branchName.includes('السعودية') || emp.salaryCurrency === 'SAR' || (emp.code && emp.code.startsWith('EMP-0'));
      const branchCountry: 'SA' | 'EG' = isSaudi ? 'SA' : 'EG';
      const currency = emp.salaryCurrency || (isSaudi ? 'SAR' : 'EGP');

      // Realistic cost estimations based on employee level
      const monthlyCost = Number(emp.basicSalary || emp.basic_salary || emp.base_salary || (isSaudi ? 18500 : 30000));
      const dailyCost = Math.round(monthlyCost / 22);
      const hourlyCost = Math.round(monthlyCost / 176);
      const unutilizedCost = Math.round((freeCapacityPct / 100) * monthlyCost);

      // Dual currency conversion
      let monthlyCostSar = monthlyCost;
      let monthlyCostEgp = monthlyCost;
      let unutilizedCostSar = unutilizedCost;
      let unutilizedCostEgp = unutilizedCost;

      if (currency === 'SAR') {
        monthlyCostSar = monthlyCost;
        monthlyCostEgp = Math.round(monthlyCost * SAR_TO_EGP);
        unutilizedCostSar = unutilizedCost;
        unutilizedCostEgp = Math.round(unutilizedCost * SAR_TO_EGP);
      } else {
        // EGP native
        monthlyCostEgp = monthlyCost;
        monthlyCostSar = Math.round((monthlyCost * EGP_TO_SAR) * 100) / 100;
        unutilizedCostEgp = unutilizedCost;
        unutilizedCostSar = Math.round((unutilizedCost * EGP_TO_SAR) * 100) / 100;
      }

      let status: 'BENCH' | 'PARTIAL' | 'FULL' | 'OVERALLOCATED' = 'FULL';
      if (totalPct === 0) {
        status = 'BENCH';
      } else if (totalPct > 100) {
        status = 'OVERALLOCATED';
      } else if (totalPct < 100) {
        status = 'PARTIAL';
      }

      const dept = deptMap.get(emp.department_id || emp.departmentId);

      return {
        id: emp.id,
        code: emp.code || emp.employeeCode || emp.employee_code || 'EMP',
        nameAr: emp.fullNameAr || emp.full_name_ar || emp.first_name_ar || 'الموظف',
        nameEn: emp.fullNameEn || emp.full_name_en,
        jobTitle: emp.positionTitle || emp.position_name_ar || emp.job_title || 'مطور برمجيات وتطبيقات',
        departmentName: dept?.nameAr || dept?.name_ar || emp.departmentName || 'تقنية المعلومات والبرمجة',
        branchName,
        branchCountry,
        currency,
        monthlyCost,
        monthlyCostSar,
        monthlyCostEgp,
        dailyCost,
        hourlyCost,
        totalAllocatedPct: totalPct,
        freeCapacityPct,
        allocatedDays,
        freeDays,
        status,
        unutilizedCost,
        unutilizedCostSar,
        unutilizedCostEgp,
        assignments: formattedAssignments,
      };
    });
  }, [employees, assignments, projects, clients, departments]);

  // Filtered Cards
  const filteredCards = useMemo(() => {
    return employeeCards.filter((c) => {
      if (branchFilter !== 'ALL' && c.branchCountry !== branchFilter) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (departmentFilter !== 'ALL' && c.departmentName !== departmentFilter) return false;
      if (search) {
        const q = search.trim().toLowerCase();
        const matchesName = c.nameAr.toLowerCase().includes(q) || (c.nameEn || '').toLowerCase().includes(q);
        const matchesCode = c.code.toLowerCase().includes(q);
        const matchesJob = c.jobTitle.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesJob) return false;
      }
      return true;
    });
  }, [employeeCards, branchFilter, statusFilter, departmentFilter, search]);

  // Summary Metrics calculated in Base Currency (SAR) with EGP equivalents
  const summary = useMemo(() => {
    const totalStaff = employeeCards.length;
    if (totalStaff === 0) {
      return {
        totalStaff: 0,
        saudiStaffCount: 0,
        egyptStaffCount: 0,
        avgUtilization: 0,
        benchCount: 0,
        partialCount: 0,
        fullCount: 0,
        overCount: 0,
        totalPayrollSar: 0,
        totalPayrollEgp: 0,
        totalUnutilizedSar: 0,
        totalUnutilizedEgp: 0,
        freeDaysTotal: 0,
      };
    }

    let sumAllocated = 0;
    let saudiStaffCount = 0;
    let egyptStaffCount = 0;
    let benchCount = 0;
    let partialCount = 0;
    let fullCount = 0;
    let overCount = 0;
    let totalPayrollSar = 0;
    let totalPayrollEgp = 0;
    let totalUnutilizedSar = 0;
    let totalUnutilizedEgp = 0;
    let freeDaysTotal = 0;

    for (const c of employeeCards) {
      if (c.branchCountry === 'SA') saudiStaffCount++;
      else egyptStaffCount++;

      sumAllocated += Math.min(100, c.totalAllocatedPct);
      totalPayrollSar += c.monthlyCostSar;
      totalPayrollEgp += c.monthlyCostEgp;
      totalUnutilizedSar += c.unutilizedCostSar;
      totalUnutilizedEgp += c.unutilizedCostEgp;
      freeDaysTotal += c.freeDays;

      if (c.status === 'BENCH') benchCount++;
      else if (c.status === 'PARTIAL') partialCount++;
      else if (c.status === 'FULL') fullCount++;
      else if (c.status === 'OVERALLOCATED') overCount++;
    }

    const avgUtilization = Math.round((sumAllocated / (totalStaff * 100)) * 100);

    return {
      totalStaff,
      saudiStaffCount,
      egyptStaffCount,
      avgUtilization,
      benchCount,
      partialCount,
      fullCount,
      overCount,
      totalPayrollSar: Math.round(totalPayrollSar),
      totalPayrollEgp: Math.round(totalPayrollEgp),
      totalUnutilizedSar: Math.round(totalUnutilizedSar),
      totalUnutilizedEgp: Math.round(totalUnutilizedEgp),
      freeDaysTotal: Math.round(freeDaysTotal * 10) / 10,
    };
  }, [employeeCards]);

  const handleExportCsv = () => {
    const rows = [
      ['تقرير كروت تتبع نسب إسناد وتفرغ وتكاليف الموظفين والمطورين - شركة عزم للتكنولوجيا (المملكة العربية السعودية)'],
      ['العملة الأساسية للنظام:', 'ريال سعودي (SAR)'],
      ['سعر الصرف المعتمد:', `1 SAR = ${SAR_TO_EGP} EGP`],
      ['تاريخ التصدير:', today()],
      [],
      [
        'كود الموظف',
        'اسم الموظف',
        'المسمى الوظيفي',
        'المقر والفرع',
        'العملة التعاقدية',
        'الراتب الشهري التعاقدي',
        'المعادل بالريال SAR',
        'نسبة الإسناد الإجمالية',
        'الأيام المشغولة',
        'نسبة التفرغ المتاحة',
        'الأيام المتاحة',
        'الحالة التشغيلية',
        'هدر التفرغ بالعملة التعاقدية',
        'هدر التفرغ بالريال SAR',
      ],
      ...filteredCards.map((c) => [
        c.code,
        c.nameAr,
        c.jobTitle,
        c.branchCountry === 'SA' ? '🇸🇦 المركز الرئيسي - الرياض' : '🇪🇬 مركز التطوير - القاهرة',
        c.currency,
        c.monthlyCost,
        c.monthlyCostSar,
        `${c.totalAllocatedPct}%`,
        c.allocatedDays,
        `${c.freeCapacityPct}%`,
        c.freeDays,
        c.status === 'BENCH' ? 'متفرغ 100% Bench' : c.status === 'PARTIAL' ? 'متاح للإسناد الجزئي' : c.status === 'FULL' ? 'مشغول 100%' : 'ضغط عمل زائد',
        c.unutilizedCost,
        c.unutilizedCostSar,
      ]),
    ];
    downloadCsv(`employee_workload_capacity_multicurrency_${today()}.csv`, rows);
    toast.success('تم تصدير كشف تتبع الموظفين والتفرغ بنجاح كملف CSV');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="تتبع الموظفين وبطاقات نسب العمل والتفرغ والمشاريع"
        subtitle="متابعة دقيقة لنسب انشغال المطورين، الأيام المتاحة للإسناد (Bench Capacity)، التكاليف التشغيلية ثنائية العملة (SAR / EGP)، وتوزيع الكوادر بين المركز الرئيسي بالرياض وفرع مصر"
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
              طباعة الكروت
            </button>
          </div>
        }
      />

      {/* Top Executive KPI Ribbon (Multi-Currency & Base Currency SAR) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Staff & Dual Branches */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي الكوادر البرمجية</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Users className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {summary.totalStaff} <span className="text-xs font-normal text-slate-500">مهندس ومطور</span>
            </div>
            <div className="mt-1 text-xs text-blue-800 flex items-center gap-1.5 font-semibold">
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-[11px] border border-emerald-200">
                🇸🇦 {summary.saudiStaffCount} الرياض
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded text-[11px] border border-blue-200">
                🇪🇬 {summary.egyptStaffCount} القاهرة
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Overall Utilization */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">معدل الاستغلال العام (Utilization)</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Activity className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-700 tracking-tight font-mono">
              {summary.avgUtilization}%
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all"
                style={{ width: `${summary.avgUtilization}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-between">
              <span>{summary.fullCount} كادر مشغول 100%</span>
              <span className="text-emerald-700 font-bold">{summary.benchCount} على الـ Bench</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Available Bench Capacity */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">طاقة التفرغ المتاحة (Bench Capacity)</span>
            <span className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
              <UserCheck className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-cyan-800 tracking-tight font-mono">
              {summary.freeDaysTotal} <span className="text-xs font-normal text-slate-500">يوم شاغر شهرياً</span>
            </div>
            <div className="mt-1 text-xs text-cyan-900 font-semibold">
              {summary.benchCount} متفرغ بالكامل + {summary.partialCount} متاح جزئياً للتعيين
            </div>
          </div>
        </div>

        {/* KPI 4: Unutilized Waste (Base SAR + EGP Equivalent) */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">تكلفة التفرغ الشهري (Unutilized Waste)</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Wallet className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600 tracking-tight font-mono">
              {money(summary.totalUnutilizedSar)} <span className="text-xs font-bold text-amber-700">SAR</span>
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              ما يعادل: <strong className="text-slate-800">{money(summary.totalUnutilizedEgp)} EGP</strong> (رواتب طاقات شاغرة)
            </div>
          </div>
        </div>
      </div>

      {/* Filter Strip & View Switcher */}
      <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Search */}
          <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-md">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="ابحث بالاسم، الكود، أو المسمى الوظيفي…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-full ps-9 text-xs"
              />
              <Search className="size-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* View Toggle */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-slate-100">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md text-xs font-bold flex items-center gap-1 ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="عرض الكروت"
            >
              <LayoutGrid className="size-4" />
              <span>كروت</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md text-xs font-bold flex items-center gap-1 ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="عرض الجدول"
            >
              <Table className="size-4" />
              <span>جدول</span>
            </button>
          </div>
        </div>

        {/* Dual Filter Rows: Branch / Country & Capacity Status */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          {/* Branch Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 me-1">المقر والفرع:</span>
            {[
              { id: 'ALL', label: `كافة الفروع (${employeeCards.length})` },
              { id: 'SA', label: `🇸🇦 فرع السعودية - الرياض (${employeeCards.filter((c) => c.branchCountry === 'SA').length})` },
              { id: 'EG', label: `🇪🇬 فرع مصر - القاهرة (${employeeCards.filter((c) => c.branchCountry === 'EG').length})` },
            ].map((b) => (
              <button
                key={b.id}
                onClick={() => setBranchFilter(b.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  branchFilter === b.id
                    ? 'bg-blue-900 text-white shadow-sm ring-1 ring-blue-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Status Filter Badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 me-1">حالة التفرغ:</span>
            {[
              { id: 'ALL', label: `الكل (${filteredCards.length})` },
              { id: 'FULL', label: `مشغول 100% (${employeeCards.filter((c) => (branchFilter === 'ALL' || c.branchCountry === branchFilter) && c.status === 'FULL').length})` },
              { id: 'PARTIAL', label: `متاح جزئياً (${employeeCards.filter((c) => (branchFilter === 'ALL' || c.branchCountry === branchFilter) && c.status === 'PARTIAL').length})` },
              { id: 'BENCH', label: `متفرغ 100% (${employeeCards.filter((c) => (branchFilter === 'ALL' || c.branchCountry === branchFilter) && c.status === 'BENCH').length})` },
              { id: 'OVERALLOCATED', label: `ضغط زائد (${employeeCards.filter((c) => (branchFilter === 'ALL' || c.branchCountry === branchFilter) && c.status === 'OVERALLOCATED').length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-12 text-center card bg-white border border-slate-200 rounded-xl">
          <Loading />
          <div className="text-xs text-slate-500 mt-2 font-medium">جاري تحميل بيانات المطورين والتكاليف ونسب إسناد المشاريع…</div>
        </div>
      ) : empsError ? (
        <div className="p-8"><ErrorState error={empsError} /></div>
      ) : filteredCards.length === 0 ? (
        <div className="p-12 text-center card bg-white border border-slate-200 shadow-sm rounded-xl">
          <EmptyState text="لا يوجد موظفون مطابقون لشروط التصفية والبحث المحددة." />
        </div>
      ) : viewMode === 'cards' ? (
        /* ================= CARDS GRID VIEW ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredCards.map((card) => {
            const isBench = card.status === 'BENCH';
            const isOver = card.status === 'OVERALLOCATED';
            const isFull = card.status === 'FULL';
            const isPartial = card.status === 'PARTIAL';

            return (
              <div
                key={card.id}
                className="card bg-white border border-slate-200 shadow-sm hover:shadow-md transition-all rounded-xl p-5 flex flex-col justify-between"
              >
                {/* Card Top: Info & Status Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Avatar with Country Flag Badge */}
                      <div className={`size-11 shrink-0 rounded-xl text-white font-black text-sm flex items-center justify-center shadow-xs relative ${
                        card.branchCountry === 'SA'
                          ? 'bg-gradient-to-br from-emerald-600 to-teal-800 ring-2 ring-emerald-500/20'
                          : 'bg-gradient-to-br from-blue-600 to-indigo-700 ring-2 ring-blue-500/20'
                      }`}>
                        {card.nameAr.slice(0, 1)}
                        <span className="absolute -bottom-1 -end-1 text-xs select-none" title={card.branchCountry === 'SA' ? 'المملكة العربية السعودية' : 'جمهورية مصر العربية'}>
                          {card.branchCountry === 'SA' ? '🇸🇦' : '🇪🇬'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-sm leading-tight">
                            {card.nameAr}
                          </h4>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            card.branchCountry === 'SA'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                          }`}>
                            {card.branchCountry === 'SA' ? '🇸🇦 الرياض' : '🇪🇬 القاهرة'}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-slate-500 mt-0.5 font-medium">{card.jobTitle}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-700 px-1 py-0.2 rounded bg-slate-100">{card.code}</span>
                          <span>•</span>
                          <span className="text-slate-600 font-sans">{card.departmentName}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0 whitespace-nowrap">
                      {isBench && <Badge color="purple">متفرغ 100% Bench</Badge>}
                      {isPartial && <Badge color="cyan">متاح {card.freeCapacityPct}%</Badge>}
                      {isFull && <Badge color="green">مشغول 100%</Badge>}
                      {isOver && <Badge color="red">ضغط زائد {card.totalAllocatedPct}%</Badge>}
                    </div>
                  </div>

                  {/* Segmented Capacity Progress Bar */}
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">نسبة الإسناد والتفرغ:</span>
                      <span className="font-mono font-bold text-slate-900">
                        {card.totalAllocatedPct}% مشغولة / {card.freeCapacityPct}% شاغرة
                      </span>
                    </div>

                    {/* Multi-segment bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2.5 flex overflow-hidden">
                      {card.assignments.map((asgn, i) => {
                        const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-cyan-600', 'bg-amber-600'];
                        const col = colors[i % colors.length];
                        return (
                          <div
                            key={asgn.id}
                            className={`${col} h-full transition-all`}
                            style={{ width: `${Math.min(100, asgn.allocationPct)}%` }}
                            title={`${asgn.projectNameAr}: ${asgn.allocationPct}%`}
                          />
                        );
                      })}
                      {card.freeCapacityPct > 0 && (
                        <div
                          className="bg-slate-300 h-full transition-all"
                          style={{ width: `${card.freeCapacityPct}%` }}
                          title={`طاقة شاغرة: ${card.freeCapacityPct}%`}
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
                      <span>الأيام المسندة: <strong>{card.allocatedDays} يوم</strong></span>
                      <span className={card.freeDays > 0 ? 'text-cyan-700 font-bold' : ''}>
                        الأيام المتاحة: <strong>{card.freeDays} يوم</strong>
                      </span>
                    </div>
                  </div>

                  {/* Assigned Projects List (Zero Truncation) */}
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>المشاريع المسندة حالياً:</span>
                      <span className="text-[11px] text-slate-500 font-mono">({card.assignments.length} مشروع)</span>
                    </div>

                    {card.assignments.length === 0 ? (
                      <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200 text-center text-xs text-purple-800 font-medium">
                        المطور متفرغ بالكامل حالياً (على الـ Bench) ومتاح للإسناد الفوري لمشاريع جديدة.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-52 overflow-y-auto custom-scrollbar pe-1">
                        {card.assignments.map((asgn) => (
                          <div
                            key={asgn.id}
                            className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-all text-xs space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-bold text-slate-900 text-[12px] leading-snug flex-1">
                                {asgn.projectNameAr}
                              </div>
                              <span className="shrink-0 font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] font-bold border border-blue-200/60 whitespace-nowrap">
                                {asgn.allocationPct}% ({asgn.allocatedDays} يوم)
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-1">
                              <span>العميل: <strong className="text-slate-700 font-medium">{asgn.clientNameAr}</strong></span>
                              <span className="font-medium text-slate-600">{asgn.roleTitle}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Dual Currency Rates & Quick Actions */}
                <div className="mt-5 pt-4 border-t border-slate-200 space-y-3">
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200/70">
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">التكلفة الشهرية</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5 text-[11.5px] whitespace-nowrap">
                        {money(card.monthlyCost)} <span className="text-[10px]">{card.currency}</span>
                      </div>
                      <div className="text-[9.5px] text-slate-500 font-mono mt-0.5 whitespace-nowrap">
                        {card.currency === 'SAR' ? `≈ ${money(card.monthlyCostEgp)} EGP` : `≈ ${money(card.monthlyCostSar)} SAR`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">التكلفة اليومية</div>
                      <div className="font-mono font-bold text-slate-700 mt-0.5 text-[11.5px] whitespace-nowrap">
                        {money(card.dailyCost)} <span className="text-[10px]">{card.currency}</span>
                      </div>
                      <div className="text-[9.5px] text-slate-400 font-mono mt-0.5 whitespace-nowrap">
                        (22 يوم عمل)
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium">هدر التفرغ</div>
                      <div className={`font-mono font-bold mt-0.5 text-[11.5px] whitespace-nowrap ${card.unutilizedCost > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {card.unutilizedCost > 0 ? `${money(card.unutilizedCost)} ${card.currency}` : '0 ' + card.currency}
                      </div>
                      <div className={`text-[9.5px] font-mono mt-0.5 whitespace-nowrap ${card.unutilizedCost > 0 ? 'text-amber-700/80 font-bold' : 'text-slate-400'}`}>
                        {card.unutilizedCost > 0
                          ? (card.currency === 'SAR' ? `≈ ${money(card.unutilizedCostEgp)} EGP` : `≈ ${money(card.unutilizedCostSar)} SAR`)
                          : 'مستغل 100%'}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAssignModalEmployee(card)}
                      className="btn btn-secondary flex-1 text-xs py-1.5 flex items-center justify-center gap-1 font-bold"
                    >
                      <Plus className="size-3.5 text-blue-600" />
                      إسناد مشروع
                    </button>
                    <button
                      onClick={() => setPrintModalEmployee(card)}
                      className="btn btn-secondary text-xs p-2"
                      title="طباعة بطاقة الموظف الرسمية A4"
                    >
                      <Printer className="size-3.5 text-slate-600" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= TABLE VIEW ================= */
        <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="table w-full text-right text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-700">
                <tr>
                  <th className="py-3 px-4">كود</th>
                  <th className="py-3 px-4">الموظف / المطور</th>
                  <th className="py-3 px-4">المقر والفرع</th>
                  <th className="py-3 px-4 text-center">المشاريع المسندة</th>
                  <th className="py-3 px-4 text-center">نسبة الإسناد</th>
                  <th className="py-3 px-4 text-center">الأيام المشغولة</th>
                  <th className="py-3 px-4 text-center">الأيام المتاحة</th>
                  <th className="py-3 px-4 text-center">حالة الطاقة</th>
                  <th className="py-3 px-4 text-center font-bold">الراتب التعاقدي</th>
                  <th className="py-3 px-4 text-center font-bold">المعادل (SAR الأساسي)</th>
                  <th className="py-3 px-4 text-center">هدر التفرغ</th>
                  <th className="py-3 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCards.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono font-bold text-slate-600">{c.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{c.nameAr}</div>
                      <div className="text-[11px] text-slate-500">{c.jobTitle}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                        c.branchCountry === 'SA'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}>
                        {c.branchCountry === 'SA' ? '🇸🇦 المركز الرئيسي - الرياض' : '🇪🇬 فرع مصر - القاهرة'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold">{c.assignments.length}</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-blue-700">
                      {c.totalAllocatedPct}%
                    </td>
                    <td className="py-3 px-4 text-center font-mono">{c.allocatedDays} يوم</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-cyan-800">{c.freeDays} يوم</td>
                    <td className="py-3 px-4 text-center">
                      {c.status === 'BENCH' && <Badge color="purple">متفرغ 100%</Badge>}
                      {c.status === 'PARTIAL' && <Badge color="cyan">متاح {c.freeCapacityPct}%</Badge>}
                      {c.status === 'FULL' && <Badge color="green">مشغول 100%</Badge>}
                      {c.status === 'OVERALLOCATED' && <Badge color="red">ضغط زائد {c.totalAllocatedPct}%</Badge>}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                      {money(c.monthlyCost)} {c.currency}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-blue-900 whitespace-nowrap">
                      {c.currency === 'SAR' ? '-' : `${money(c.monthlyCostSar)} SAR`}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold whitespace-nowrap">
                      {c.unutilizedCost > 0 ? (
                        <span className="text-amber-600">
                          {money(c.unutilizedCost)} {c.currency}
                          <span className="block text-[10px] text-amber-700/80 font-normal">
                            ({c.currency === 'SAR' ? `${money(c.unutilizedCostEgp)} EGP` : `${money(c.unutilizedCostSar)} SAR`})
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setAssignModalEmployee(c)}
                          className="btn-ghost p-1.5 text-blue-600"
                          title="إسناد مشروع جديد"
                        >
                          <Plus className="size-4" />
                        </button>
                        <button
                          onClick={() => setPrintModalEmployee(c)}
                          className="btn-ghost p-1.5 text-slate-600"
                          title="طباعة بطاقة الموظف"
                        >
                          <Printer className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL: Quick Assign Project ================= */}
      {assignModalEmployee && (
        <QuickAssignProjectModal
          employee={assignModalEmployee}
          projects={projects}
          onClose={() => setAssignModalEmployee(null)}
          onSuccess={() => {
            setAssignModalEmployee(null);
            qc.invalidateQueries({ queryKey: ['workload-assignments'] });
            toast.success('تم إسناد المشروع وتحديث نسبة التفرغ بنجاح');
          }}
        />
      )}

      {/* ================= MODAL: Printable Official Employee Card A4 ================= */}
      {printModalEmployee && (
        <PrintEmployeeCardModal
          employee={printModalEmployee}
          onClose={() => setPrintModalEmployee(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal: Quick Assign Project
// -----------------------------------------------------------------------------
function QuickAssignProjectModal({
  employee, projects, onClose, onSuccess,
}: {
  employee: EmployeeCardData;
  projects: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [allocationPct, setAllocationPct] = useState(String(Math.min(100, employee.freeCapacityPct || 50)));
  const [startDate, setStartDate] = useState(today());
  const [roleTitle, setRoleTitle] = useState(employee.jobTitle);
  const [isBillable, setIsBillable] = useState(true);
  const [notes, setNotes] = useState('');

  const createMut = useMutation({
    mutationFn: () => {
      return api.post('/assignments', {
        employeeId: employee.id,
        projectId,
        allocationPct,
        allocationBasis: 'PERCENTAGE',
        startDate,
        roleTitle,
        isBillable,
        notes: notes || undefined,
      });
    },
    onSuccess,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`إسناد مشروع وتحديث تفرغ المطور: ${employee.nameAr}`}
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button
            className="btn-primary text-xs"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending && <Spinner className="size-3.5" />}
            تأكيد الإسناد وتحديث النسب
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Availability reminder banner */}
        <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg text-cyan-900 flex items-center justify-between">
          <span>النسبة المشغولة حالياً: <strong>{employee.totalAllocatedPct}%</strong></span>
          <span>طاقة التفرغ المتاحة: <strong className="text-cyan-800 font-mono text-sm">{employee.freeCapacityPct}% ({employee.freeDays} يوم)</strong></span>
        </div>

        <Field label="المشروع المطلوب إسناده *">
          <select
            className="input w-full font-bold"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name_ar || p.nameAr}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="نسبة التخصيص للمشروع (%) *">
            <input
              type="number"
              min="1"
              max="150"
              className="input w-full font-mono font-bold"
              value={allocationPct}
              onChange={(e) => setAllocationPct(e.target.value)}
            />
          </Field>

          <Field label="تاريخ بدء الإسناد *">
            <input
              type="date"
              className="input w-full font-mono"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="الدور التعاقدي على المشروع">
          <input
            className="input w-full"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
          <input
            type="checkbox"
            className="checkbox"
            checked={isBillable}
            onChange={(e) => setIsBillable(e.target.checked)}
          />
          <span>عمل قابل للفوترة للعميل (Billable Resource)</span>
        </label>

        <Field label="ملاحظات وتفاصيل التكليف">
          <textarea
            className="input w-full h-16 py-2"
            placeholder="مهام ومسؤوليات المطور على هذا المشروع…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal: Printable Official Employee Card A4
// -----------------------------------------------------------------------------
function PrintEmployeeCardModal({
  employee, onClose,
}: {
  employee: EmployeeCardData;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="بطاقة الموظف الشاملة ونسب التفرغ والمشاريع (للطباعة A4)"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={onClose}>إغلاق</button>
          <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" /> طباعة البطاقة
          </button>
        </div>
      }
    >
      <div className="space-y-6 p-4 bg-white border border-slate-300 rounded-xl text-slate-900" id="print-employee-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-xl font-black text-slate-900">شركة عزم للتكنولوجيا والحلول الرقمية</div>
            <div className="text-xs text-slate-600 mt-1">
              المملكة العربية السعودية 🇸🇦 • بطاقة تتبع الكوادر البرمجية ومعدلات التفرغ وتكلفة المشاريع
            </div>
          </div>
          <div className="text-left font-mono text-xs">
            <div>التاريخ: {today()}</div>
            <div>رقم البطاقة: CRD-{employee.code}</div>
            <div className="text-[11px] text-slate-500">العملة الأساسية: SAR</div>
          </div>
        </div>

        {/* Employee Info Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 p-4 rounded-lg bg-slate-50/50">
          <div><span className="font-bold">كود الموظف:</span> <strong className="font-mono text-slate-900">{employee.code}</strong></div>
          <div><span className="font-bold">اسم الموظف:</span> <strong className="text-slate-900">{employee.nameAr}</strong></div>
          <div><span className="font-bold">المسمى الوظيفي:</span> {employee.jobTitle}</div>
          <div><span className="font-bold">القسم والإدارة:</span> {employee.departmentName}</div>
          <div>
            <span className="font-bold">مقر العمل والفرع:</span>{' '}
            <strong>
              {employee.branchCountry === 'SA' ? '🇸🇦 المركز الرئيسي - الرياض' : '🇪🇬 مركز التطوير البرمجي - القاهرة'}
            </strong>
          </div>
          <div><span className="font-bold">حالة التفرغ:</span> {employee.status === 'BENCH' ? 'متفرغ 100%' : employee.status === 'FULL' ? 'مشغول 100%' : `متاح بنسبة ${employee.freeCapacityPct}%`}</div>
        </div>

        {/* Capacity & Dual Financial Summary Strip */}
        <div className="grid grid-cols-4 gap-3 text-center text-xs border border-slate-300 p-3 rounded-lg bg-slate-100">
          <div>
            <div className="text-slate-500 font-semibold">نسبة الإسناد الإجمالية</div>
            <div className="font-mono font-black text-base text-blue-900 mt-0.5">{employee.totalAllocatedPct}%</div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold">الأيام المشغولة</div>
            <div className="font-mono font-black text-base text-slate-900 mt-0.5">{employee.allocatedDays} يوم</div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold">الأيام المتاحة للإسناد</div>
            <div className="font-mono font-black text-base text-cyan-800 mt-0.5">{employee.freeDays} يوم</div>
          </div>
          <div>
            <div className="text-slate-500 font-semibold">التكلفة الشهرية</div>
            <div className="font-mono font-black text-base text-slate-900 mt-0.5">
              {money(employee.monthlyCost)} {employee.currency}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {employee.currency === 'SAR' ? `≈ ${money(employee.monthlyCostEgp)} EGP` : `≈ ${money(employee.monthlyCostSar)} SAR`}
            </div>
          </div>
        </div>

        {/* Assigned Projects Table (No Truncation) */}
        <div>
          <h4 className="text-xs font-bold mb-2">المشاريع التعاقدية المسندة:</h4>
          <table className="table w-full text-xs text-right border border-slate-300">
            <thead className="bg-slate-100 border-b border-slate-300 font-bold">
              <tr>
                <th className="py-2 px-3 border-l border-slate-300">كود المشروع</th>
                <th className="py-2 px-3 border-l border-slate-300">اسم المشروع التعاقدي</th>
                <th className="py-2 px-3 border-l border-slate-300">العميل</th>
                <th className="py-2 px-3 border-l border-slate-300 text-center">الدور التعاقدي</th>
                <th className="py-2 px-3 border-l border-slate-300 text-center">نسبة العمل</th>
                <th className="py-2 px-3 text-center">أيام العمل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {employee.assignments.map((asgn) => (
                <tr key={asgn.id}>
                  <td className="py-2 px-3 border-l border-slate-200 font-mono font-bold">{asgn.projectCode}</td>
                  <td className="py-2 px-3 border-l border-slate-200 font-semibold">{asgn.projectNameAr}</td>
                  <td className="py-2 px-3 border-l border-slate-200">{asgn.clientNameAr}</td>
                  <td className="py-2 px-3 border-l border-slate-200 text-center">{asgn.roleTitle}</td>
                  <td className="py-2 px-3 border-l border-slate-200 text-center font-mono font-bold text-blue-700">{asgn.allocationPct}%</td>
                  <td className="py-2 px-3 text-center font-mono font-bold">{asgn.allocatedDays} يوم</td>
                </tr>
              ))}
              {employee.assignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500 font-medium">
                    لا توجد مشاريع مسندة حالياً (المطور على الـ Bench وجاهز للتعيين الفوري).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="pt-8 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="space-y-12">
            <div className="font-bold">المطور / الموظف</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والتاريخ</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold">مدير إدارة المشاريع (PMO)</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والاعتماد</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold">المدير التنفيذي / المالي</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والخاتم</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
