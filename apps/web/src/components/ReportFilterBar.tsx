import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Coins, Filter, GitCompare, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import { useReportCurrency } from '../lib/fx-display';
import { COST_CENTER_TYPE_LABELS } from '../lib/reports-analytics-engine';
import { usePeriods } from './forms';
import { SearchableSelect, type SelectOption } from './SearchableSelect';

export interface ReportFilterValues {
  periodId: string;
  from: string;
  to: string;
  asOf: string;
  compareEnabled: boolean;
  compareFrom: string;
  compareTo: string;
  compareAsOf: string;
  clientId: string;
  projectId: string;
  employeeId: string;
  costCenterId: string;
  branchId: string;
  departmentId: string;
  ledger: string;
  ccType: string;
  currencyCode: string;
  search: string;
}

const FILTER_URL_KEYS: Array<keyof ReportFilterValues> = [
  'periodId',
  'from',
  'to',
  'asOf',
  'compareFrom',
  'compareTo',
  'compareAsOf',
  'clientId',
  'projectId',
  'employeeId',
  'costCenterId',
  'branchId',
  'departmentId',
  'ledger',
  'ccType',
  'currencyCode',
];

function extractList(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildFilterQueryString(
  filters: Partial<ReportFilterValues>,
  extra?: Record<string, string | undefined | null>,
): string {
  const sp = new URLSearchParams();
  for (const k of FILTER_URL_KEYS) {
    const val = filters[k];
    if (typeof val === 'string' && val.trim() !== '') {
      if (k === 'compareFrom' || k === 'compareTo' || k === 'compareAsOf') {
        if (!filters.compareEnabled) continue;
      }
      sp.set(k, val.trim());
    }
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && String(v).trim() !== '') sp.set(k, String(v).trim());
    }
  }
  return sp.toString();
}

export function useReportFilters(options?: {
  syncUrl?: boolean;
  defaultLedger?: string;
  singleDateAsOf?: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const y = new Date().getFullYear();

  const readInitial = useCallback((): ReportFilterValues => {
    const compareFrom = searchParams.get('compareFrom') || '';
    const compareTo = searchParams.get('compareTo') || '';
    const compareAsOf = searchParams.get('compareAsOf') || '';
    return {
      periodId: searchParams.get('periodId') || '',
      from: searchParams.get('from') || `${y}-01-01`,
      to: searchParams.get('to') || `${y}-12-31`,
      asOf: searchParams.get('asOf') || new Date().toISOString().slice(0, 10),
      compareEnabled: Boolean(compareFrom || compareTo || compareAsOf),
      compareFrom,
      compareTo,
      compareAsOf,
      clientId: searchParams.get('clientId') || '',
      projectId: searchParams.get('projectId') || '',
      employeeId: searchParams.get('employeeId') || '',
      costCenterId: searchParams.get('costCenterId') || '',
      branchId: searchParams.get('branchId') || '',
      departmentId: searchParams.get('departmentId') || '',
      ledger: searchParams.get('ledger') || options?.defaultLedger || 'FINANCIAL',
      ccType: searchParams.get('ccType') || '',
      currencyCode: searchParams.get('currencyCode') || '',
      search: searchParams.get('search') || '',
    };
  }, [searchParams, y, options?.defaultLedger]);

  const [filters, setFiltersState] = useState<ReportFilterValues>(readInitial);

  useEffect(() => {
    if (options?.syncUrl === false) return;
    const next = new URLSearchParams();
    searchParams.forEach((v, k) => {
      if (!FILTER_URL_KEYS.includes(k as any)) next.set(k, v);
    });
    for (const k of FILTER_URL_KEYS) {
      const val = filters[k];
      if (typeof val === 'string' && val.trim() !== '') {
        if ((k === 'compareFrom' || k === 'compareTo' || k === 'compareAsOf') && !filters.compareEnabled) continue;
        if (k === 'from' && val === `${y}-01-01` && !searchParams.get('from') && !filters.periodId) continue;
        if (k === 'to' && val === `${y}-12-31` && !searchParams.get('to') && !filters.periodId) continue;
        if (k === 'ledger' && val === (options?.defaultLedger || 'FINANCIAL') && !searchParams.get('ledger')) continue;
        next.set(k, val.trim());
      }
    }
    const nextStr = next.toString();
    const curStr = searchParams.toString();
    if (nextStr !== curStr) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, options?.syncUrl, options?.defaultLedger, setSearchParams, searchParams, y]);

  const setFilters = useCallback((patch: Partial<ReportFilterValues>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetAll = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    setFiltersState({
      periodId: '',
      from: `${y}-01-01`,
      to: `${y}-12-31`,
      asOf: today,
      compareEnabled: false,
      compareFrom: '',
      compareTo: '',
      compareAsOf: '',
      clientId: '',
      projectId: '',
      employeeId: '',
      costCenterId: '',
      branchId: '',
      departmentId: '',
      ledger: options?.defaultLedger || 'FINANCIAL',
      ccType: '',
      currencyCode: '',
      search: '',
    });
  }, [y, options?.defaultLedger]);

  const queryParams = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    if (filters.periodId) out.periodId = filters.periodId;
    if (options?.singleDateAsOf) {
      out.asOf = filters.asOf;
      if (filters.compareEnabled && filters.compareAsOf) out.compareAsOf = filters.compareAsOf;
    } else {
      out.from = filters.from;
      out.to = filters.to;
      if (filters.compareEnabled && filters.compareFrom && filters.compareTo) {
        out.compareFrom = filters.compareFrom;
        out.compareTo = filters.compareTo;
      }
    }
    if (filters.clientId) out.clientId = filters.clientId;
    if (filters.projectId) out.projectId = filters.projectId;
    if (filters.employeeId) out.employeeId = filters.employeeId;
    if (filters.costCenterId) out.costCenterId = filters.costCenterId;
    if (filters.branchId) out.branchId = filters.branchId;
    if (filters.departmentId) out.departmentId = filters.departmentId;
    if (filters.ledger && filters.ledger !== 'FINANCIAL') out.ledger = filters.ledger;
    else if (filters.ledger) out.ledger = filters.ledger;
    if (filters.ccType) out.ccType = filters.ccType;
    if (filters.currencyCode) out.currencyCode = filters.currencyCode;
    return out;
  }, [filters, options?.singleDateAsOf]);

  return { filters, setFilters, resetAll, queryParams };
}

export interface ReportFilterBarProps {
  filters: ReportFilterValues;
  onChange: (patch: Partial<ReportFilterValues>) => void;
  onReset?: () => void;
  showPeriod?: boolean;
  showDateRange?: boolean;
  singleDateAsOf?: boolean;
  showCompare?: boolean;
  showClient?: boolean;
  showProject?: boolean;
  showEmployee?: boolean;
  showCostCenter?: boolean;
  showBranch?: boolean;
  showDepartment?: boolean;
  showLedger?: boolean;
  showCcType?: boolean;
  showCurrency?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  extraRight?: React.ReactNode;
}

export function ReportFilterBar({
  filters,
  onChange,
  onReset,
  showPeriod = true,
  showDateRange = true,
  singleDateAsOf = false,
  showCompare = false,
  showClient = true,
  showProject = true,
  showEmployee = true,
  showCostCenter = true,
  showBranch = false,
  showDepartment = false,
  showLedger = false,
  showCcType = false,
  showCurrency = false,
  showSearch = false,
  searchPlaceholder = 'ابحث بالرمز أو الاسم أو الوصف...',
  extraRight,
}: ReportFilterBarProps) {
  const fx = useReportCurrency(filters.currencyCode, filters.to || filters.asOf);
  const { data: periodsRes } = usePeriods(showPeriod);
  const periods = useMemo(() => extractList(periodsRes), [periodsRes]);

  const { data: clientsRes } = useQuery({
    queryKey: ['filter-ref-clients'],
    queryFn: () => api.get<any>('/clients?pageSize=200'),
    enabled: showClient,
    staleTime: 60_000,
  });
  const { data: projectsRes } = useQuery({
    queryKey: ['filter-ref-projects'],
    queryFn: () => api.get<any>('/projects?pageSize=200'),
    enabled: showProject || showClient,
    staleTime: 60_000,
  });
  const { data: employeesRes } = useQuery({
    queryKey: ['filter-ref-employees'],
    queryFn: () => api.get<any>('/employees?pageSize=200'),
    enabled: showEmployee,
    staleTime: 60_000,
  });
  const { data: ccRes } = useQuery({
    queryKey: ['filter-ref-cost-centers'],
    queryFn: () => api.get<any>('/cost-centers?pageSize=200'),
    enabled: showCostCenter,
    staleTime: 60_000,
  });
  const { data: branchesRes } = useQuery({
    queryKey: ['filter-ref-branches'],
    queryFn: () => api.get<any>('/branches?pageSize=200'),
    enabled: showBranch,
    staleTime: 60_000,
  });
  const { data: deptsRes } = useQuery({
    queryKey: ['filter-ref-departments'],
    queryFn: () => api.get<any>('/departments?pageSize=200'),
    enabled: showDepartment,
    staleTime: 60_000,
  });

  const clients = useMemo(() => extractList(clientsRes), [clientsRes]);
  const projects = useMemo(() => extractList(projectsRes), [projectsRes]);
  const employees = useMemo(() => extractList(employeesRes), [employeesRes]);
  const costCenters = useMemo(() => extractList(ccRes), [ccRes]);
  const branches = useMemo(() => extractList(branchesRes), [branchesRes]);
  const departments = useMemo(() => extractList(deptsRes), [deptsRes]);

  const [expanded, setExpanded] = useState(true);

  const clientOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'جميع العملاء' },
      ...clients.map((c: any) => ({
        value: c.id,
        label: c.nameAr || c.nameEn || c.code,
        subLabel: c.code,
      })),
    ],
    [clients],
  );

  const filteredProjects = useMemo(
    () => (filters.clientId ? projects.filter((p: any) => p.clientId === filters.clientId) : projects),
    [projects, filters.clientId],
  );

  const projectOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: filters.clientId ? 'جميع مشاريع العميل المحدد' : 'جميع المشاريع' },
      ...filteredProjects.map((p: any) => ({
        value: p.id,
        label: p.nameAr || p.nameEn || p.code,
        subLabel: p.code,
      })),
    ],
    [filteredProjects, filters.clientId],
  );

  const employeeOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'جميع الموظفين' },
      ...employees.map((e: any) => ({
        value: e.id,
        label: e.fullNameAr || e.nameAr || e.code,
        subLabel: e.code,
      })),
    ],
    [employees],
  );

  const costCenterOptions = useMemo<SelectOption[]>(() => {
    const byId = new Map(costCenters.map((c: any) => [c.id, c]));
    const depthOf = (c: any) => {
      let d = 0;
      let cur = c.parentId;
      const seen = new Set([c.id]);
      while (cur && byId.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        d++;
        cur = byId.get(cur)?.parentId;
      }
      return d;
    };
    const sorted = [...costCenters].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    return [
      { value: '', label: 'جميع مراكز التكلفة' },
      ...sorted.map((c: any) => {
        const d = depthOf(c);
        const prefix = d > 0 ? `${'↳ '.repeat(d)}` : '';
        return {
          value: c.id,
          label: `${prefix}${c.code} — ${c.nameAr}`,
          subLabel: COST_CENTER_TYPE_LABELS[c.ccType] || c.ccType || undefined,
        };
      }),
    ];
  }, [costCenters]);

  const branchOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'جميع الفروع' },
      ...branches.map((b: any) => ({ value: b.id, label: `${b.code} — ${b.nameAr}` })),
    ],
    [branches],
  );

  const deptOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'جميع الأقسام' },
      ...departments.map((d: any) => ({ value: d.id, label: `${d.code} — ${d.nameAr}` })),
    ],
    [departments],
  );

  const applyPeriodChange = (periodId: string) => {
    if (!periodId) {
      const y = new Date().getFullYear();
      onChange({
        periodId: '',
        ...(singleDateAsOf ? { asOf: new Date().toISOString().slice(0, 10) } : { from: `${y}-01-01`, to: `${y}-12-31` }),
      });
      return;
    }
    const p = periods.find((x: any) => x.id === periodId);
    if (p) {
      const start = String(p.startDate).slice(0, 10);
      const end = String(p.endDate).slice(0, 10);
      onChange({
        periodId,
        ...(singleDateAsOf ? { asOf: end } : { from: start, to: end }),
      });
    } else {
      onChange({ periodId });
    }
  };

  const applyPreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'YTD' | 'FULL_YEAR') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let f = `${y}-01-01`;
    let t = `${y}-12-31`;
    if (preset === 'THIS_MONTH') {
      f = isoDate(new Date(Date.UTC(y, m, 1)));
      t = isoDate(new Date(Date.UTC(y, m + 1, 0)));
    } else if (preset === 'LAST_MONTH') {
      f = isoDate(new Date(Date.UTC(y, m - 1, 1)));
      t = isoDate(new Date(Date.UTC(y, m, 0)));
    } else if (preset === 'THIS_QUARTER') {
      const qStart = Math.floor(m / 3) * 3;
      f = isoDate(new Date(Date.UTC(y, qStart, 1)));
      t = isoDate(new Date(Date.UTC(y, qStart + 3, 0)));
    } else if (preset === 'YTD') {
      f = `${y}-01-01`;
      t = isoDate(now);
    }
    const matched = periods.find(
      (p: any) => String(p.startDate).slice(0, 10) === f && String(p.endDate).slice(0, 10) === t,
    );
    onChange({
      periodId: matched?.id || '',
      ...(singleDateAsOf ? { asOf: t } : { from: f, to: t }),
    });
  };

  const applyAutoComparePrevious = () => {
    if (singleDateAsOf) {
      const base = new Date(`${filters.asOf || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      base.setUTCMonth(base.getUTCMonth() - 1);
      onChange({ compareEnabled: true, compareAsOf: isoDate(base) });
      return;
    }
    const f = new Date(`${filters.from}T00:00:00Z`);
    const t = new Date(`${filters.to}T00:00:00Z`);
    const diffDays = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1);
    const prevTo = new Date(f.getTime() - 86_400_000);
    const prevFrom = new Date(prevTo.getTime() - (diffDays - 1) * 86_400_000);
    onChange({
      compareEnabled: true,
      compareFrom: isoDate(prevFrom),
      compareTo: isoDate(prevTo),
    });
  };

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.periodId) {
      const p = periods.find((x: any) => x.id === filters.periodId);
      chips.push({ key: 'periodId', label: `الفترة: ${p?.name || filters.periodId}`, clear: () => applyPeriodChange('') });
    }
    if (filters.costCenterId) {
      const c = costCenters.find((x: any) => x.id === filters.costCenterId);
      chips.push({ key: 'costCenterId', label: `مركز التكلفة: ${c ? `${c.code} — ${c.nameAr}` : filters.costCenterId}`, clear: () => onChange({ costCenterId: '' }) });
    }
    if (filters.clientId) {
      const c = clients.find((x: any) => x.id === filters.clientId);
      chips.push({ key: 'clientId', label: `العميل: ${c?.nameAr || filters.clientId}`, clear: () => onChange({ clientId: '' }) });
    }
    if (filters.projectId) {
      const p = projects.find((x: any) => x.id === filters.projectId);
      chips.push({ key: 'projectId', label: `المشروع: ${p?.nameAr || filters.projectId}`, clear: () => onChange({ projectId: '' }) });
    }
    if (filters.employeeId) {
      const e = employees.find((x: any) => x.id === filters.employeeId);
      chips.push({ key: 'employeeId', label: `الموظف: ${e?.fullNameAr || filters.employeeId}`, clear: () => onChange({ employeeId: '' }) });
    }
    if (filters.branchId) {
      const b = branches.find((x: any) => x.id === filters.branchId);
      chips.push({ key: 'branchId', label: `الفرع: ${b?.nameAr || filters.branchId}`, clear: () => onChange({ branchId: '' }) });
    }
    if (filters.departmentId) {
      const d = departments.find((x: any) => x.id === filters.departmentId);
      chips.push({ key: 'departmentId', label: `القسم: ${d?.nameAr || filters.departmentId}`, clear: () => onChange({ departmentId: '' }) });
    }
    if (filters.ccType) {
      chips.push({ key: 'ccType', label: `نوع المركز: ${COST_CENTER_TYPE_LABELS[filters.ccType] || filters.ccType}`, clear: () => onChange({ ccType: '' }) });
    }
    if (filters.currencyCode && filters.currencyCode !== fx.baseCurrency) {
      chips.push({ key: 'currencyCode', label: `عملة العرض: ${filters.currencyCode} (${fx.rateLabel})`, clear: () => onChange({ currencyCode: '' }) });
    }
    return chips;
  }, [filters, periods, costCenters, clients, projects, employees, branches, departments, fx.baseCurrency, fx.rateLabel]);

  return (
    <div className="card p-3.5 sm:p-4 space-y-3 border border-indigo-200/70 dark:border-indigo-900/50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60 hover:bg-indigo-100/80 transition"
          >
            <SlidersHorizontal className="size-3.5" />
            الفلاتر التحليلية المتعددة
            {activeChips.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px]">
                {activeChips.length}
              </span>
            )}
          </button>

          {(showPeriod || showDateRange) && (
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'THIS_MONTH' as const, label: 'هذا الشهر' },
                { id: 'LAST_MONTH' as const, label: 'الشهر السابق' },
                { id: 'THIS_QUARTER' as const, label: 'هذا الربع' },
                { id: 'YTD' as const, label: 'منذ بداية العام' },
                { id: 'FULL_YEAR' as const, label: 'العام كاملاً' },
              ].map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => applyPreset(pr.id)}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showCompare && (
            <button
              type="button"
              onClick={() => {
                if (!filters.compareEnabled) applyAutoComparePrevious();
                else onChange({ compareEnabled: false });
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                filters.compareEnabled
                  ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-300'
                  : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 hover:border-amber-400'
              }`}
            >
              <GitCompare className="size-3.5" />
              {filters.compareEnabled ? 'إيقاف المقارنة' : 'مقارنة فترتين'}
            </button>
          )}

          {onReset && activeChips.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 transition"
            >
              <RotateCcw className="size-3.5" />
              إعادة ضبط
            </button>
          )}
          {extraRight}
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-2.5 pt-1">
          {showPeriod && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                <Calendar className="size-3 inline ml-1 text-indigo-500" />
                الفترة المالية
              </label>
              <select
                className="input h-9 text-xs"
                value={filters.periodId}
                onChange={(e) => applyPeriodChange(e.target.value)}
              >
                <option value="">نطاق تواريخ حر / كل الفترات</option>
                {periods.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({String(p.startDate).slice(0, 10)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {showDateRange && !singleDateAsOf && (
            <>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">من تاريخ</label>
                <input
                  type="date"
                  className="input h-9 text-xs"
                  dir="ltr"
                  value={filters.from}
                  onChange={(e) => onChange({ from: e.target.value, periodId: '' })}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">إلى تاريخ</label>
                <input
                  type="date"
                  className="input h-9 text-xs"
                  dir="ltr"
                  value={filters.to}
                  onChange={(e) => onChange({ to: e.target.value, periodId: '' })}
                />
              </div>
            </>
          )}

          {showDateRange && singleDateAsOf && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">كما في تاريخ</label>
              <input
                type="date"
                className="input h-9 text-xs"
                dir="ltr"
                value={filters.asOf}
                onChange={(e) => onChange({ asOf: e.target.value, periodId: '' })}
              />
            </div>
          )}

          {showCostCenter && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">مركز التكلفة</label>
              <SearchableSelect
                options={costCenterOptions}
                value={filters.costCenterId}
                onChange={(v) => onChange({ costCenterId: v })}
                placeholder="جميع مراكز التكلفة"
                clearable
              />
            </div>
          )}

          {showClient && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">العميل</label>
              <SearchableSelect
                options={clientOptions}
                value={filters.clientId}
                onChange={(v) => {
                  const belongs = filteredProjects.some((p: any) => p.id === filters.projectId && (!v || p.clientId === v));
                  onChange({ clientId: v, ...(filters.projectId && !belongs ? { projectId: '' } : {}) });
                }}
                placeholder="جميع العملاء"
                clearable
              />
            </div>
          )}

          {showProject && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">المشروع</label>
              <SearchableSelect
                options={projectOptions}
                value={filters.projectId}
                onChange={(v) => onChange({ projectId: v })}
                placeholder="جميع المشاريع"
                clearable
              />
            </div>
          )}

          {showEmployee && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">الموظف / الكادر</label>
              <SearchableSelect
                options={employeeOptions}
                value={filters.employeeId}
                onChange={(v) => onChange({ employeeId: v })}
                placeholder="جميع الموظفين"
                clearable
              />
            </div>
          )}

          {showBranch && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">الفرع</label>
              <SearchableSelect
                options={branchOptions}
                value={filters.branchId}
                onChange={(v) => onChange({ branchId: v })}
                placeholder="جميع الفروع"
                clearable
              />
            </div>
          )}

          {showDepartment && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">القسم / الإدارة</label>
              <SearchableSelect
                options={deptOptions}
                value={filters.departmentId}
                onChange={(v) => onChange({ departmentId: v })}
                placeholder="جميع الأقسام"
                clearable
              />
            </div>
          )}

          {showCcType && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">نوع مركز التكلفة</label>
              <select
                className="input h-9 text-xs"
                value={filters.ccType}
                onChange={(e) => onChange({ ccType: e.target.value })}
              >
                <option value="">كل الأنواع (مباشر + غير مباشر + إداري)</option>
                <option value="DIRECT">تشغيلي مباشر (DIRECT)</option>
                <option value="INDIRECT">تشغيلي غير مباشر (INDIRECT)</option>
                <option value="ADMIN">إداري وعمومي (ADMIN)</option>
              </select>
            </div>
          )}

          {showLedger && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">دفتر الأستاذ</label>
              <select
                className="input h-9 text-xs"
                value={filters.ledger}
                onChange={(e) => onChange({ ledger: e.target.value })}
              >
                <option value="FINANCIAL">الدفتر المالي (FINANCIAL)</option>
                <option value="MANAGEMENT">الدفتر الإداري (MANAGEMENT)</option>
                <option value="ALL">كلا الدفترين (ALL)</option>
              </select>
            </div>
          )}

          {showCurrency && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">
                <Coins className="size-3 inline ml-1 text-emerald-500" />
                عملة العرض (Sec 25)
              </label>
              <select
                className="input h-9 text-xs font-mono"
                value={filters.currencyCode || fx.baseCurrency}
                onChange={(e) => onChange({ currencyCode: e.target.value === fx.baseCurrency ? '' : e.target.value })}
                title={fx.rateLabel}
              >
                {fx.currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.nameAr}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showSearch && (
            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1 block">بحث نصي</label>
              <div className="relative">
                <Search className="size-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  className="input h-9 text-xs pr-8"
                  placeholder={searchPlaceholder}
                  value={filters.search}
                  onChange={(e) => onChange({ search: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showCompare && filters.compareEnabled && (
        <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50">
          <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
            <GitCompare className="size-3.5" />
            فترة المقارنة:
          </span>
          {singleDateAsOf ? (
            <input
              type="date"
              className="input h-8 text-xs w-40"
              dir="ltr"
              value={filters.compareAsOf}
              onChange={(e) => onChange({ compareAsOf: e.target.value })}
            />
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">من</span>
                <input
                  type="date"
                  className="input h-8 text-xs w-36"
                  dir="ltr"
                  value={filters.compareFrom}
                  onChange={(e) => onChange({ compareFrom: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">إلى</span>
                <input
                  type="date"
                  className="input h-8 text-xs w-36"
                  dir="ltr"
                  value={filters.compareTo}
                  onChange={(e) => onChange({ compareTo: e.target.value })}
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={applyAutoComparePrevious}
            className="text-[11px] font-bold text-amber-700 dark:text-amber-300 underline hover:no-underline"
          >
            حساب الفترة السابقة تلقائياً
          </button>
        </div>
      )}

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
            <Filter className="size-3" />
            المحدد:
          </span>
          {activeChips.map((ch) => (
            <button
              key={ch.key}
              type="button"
              onClick={ch.clear}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition"
            >
              <span>{ch.label}</span>
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
