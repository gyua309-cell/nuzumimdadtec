import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, CheckCircle2, Clock, ExternalLink,
  FileText, Sparkles, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { money, today } from '../lib/format';
import { useReportCurrency } from '../lib/fx-display';
import { ReportFilterBar, useReportFilters } from '../components/ReportFilterBar';
import { ExportMenu } from '../components/ExportMenu';
import { usePeriods } from '../components/forms';
import { Badge, EmptyState, ErrorState, Loading, Modal, PageHeader, Spinner, Stat, useToast } from '../components/ui';

export function EmployeeAllocationDaysReportPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const periodsQuery = usePeriods();
  const periods = periodsQuery.data || [];

  const { filters, setFilters, resetAll, queryParams } = useReportFilters({
    syncUrl: true,
  });
  const fx = useReportCurrency(filters.currencyCode, filters.to || filters.asOf);
  const cv = (v: any) => fx.convert(v);
  const fm = (v: any) => money(cv(v));
  const selectedPeriodId = filters.periodId;
  const searchTerm = filters.search;

  const activePeriodId = useMemo(() => {
    if (selectedPeriodId) return selectedPeriodId;
    if (filters.from || filters.to) return '';
    const t = today();
    const cur = periods.find((p) => p.startDate <= t && p.endDate >= t) || periods.find((p) => p.status === 'OPEN') || periods[0];
    return cur?.id || '';
  }, [selectedPeriodId, filters.from, filters.to, periods]);

  // Filter state
  const [invoiceFilter, setInvoiceFilter] = useState<'ALL' | 'INVOICED' | 'UNINVOICED'>('ALL');
  const [basisFilter, setBasisFilter] = useState<'ALL' | 'DAYS' | 'PERCENTAGE'>('ALL');
  const [invoicingRow, setInvoicingRow] = useState<any | null>(null);

  // Mutation to auto-generate draft sales invoice from allocation
  const createInvoice = useMutation({
    mutationFn: (body: any) => api.post('/invoices', body),
    onSuccess: (res: any) => {
      toast.success(`تم إنشاء مسودة فاتورة المبيعات بنجاح برقم ${res.invoiceNo || ''}`);
      setInvoicingRow(null);
      qc.invalidateQueries({ queryKey: ['/assignments/employee-days-report'] });
      qc.invalidateQueries({ queryKey: ['/invoices'] });
    },
    onError: (e: any) => toast.error(e),
  });

  // Fetch report data from backend
  const reportQuery = useQuery({
    queryKey: ['/assignments/employee-days-report', activePeriodId, queryParams],
    queryFn: () =>
      api.get<{
        period: { id: string; name: string; start: string; end: string };
        summary: {
          totalAssignments: number;
          totalAllocatedDays: number;
          totalRevenue: string;
          totalCost: string;
          totalProfit: string;
          averageMarginPct: number;
          invoicedCount: number;
          pendingInvoiceCount: number;
        };
        rows: Array<{
          assignmentId: string;
          employeeId: string;
          employeeCode: string;
          employeeName: string;
          positionTitle: string;
          projectId: string;
          projectCode: string;
          projectName: string;
          clientId: string;
          clientName: string;
          allocationBasis: 'DAYS' | 'PERCENTAGE' | 'HOURS';
          workingDaysInMonth: number;
          allocatedDays: number;
          allocationPct: number;
          unutilizedDays: number;
          unutilizedPct: number;
          pricingBasis: string;
          unitPrice: string;
          employeeMonthlyCost: string;
          projectCostShare: string;
          revenueGenerated: string;
          grossProfit: string;
          marginPct: number;
          invoiceStatus: 'POSTED' | 'PAID' | 'DRAFT' | 'UNINVOICED';
          invoiceId: string | null;
          invoiceNo: string | null;
        }>;
      }>('/assignments/employee-days-report', {
        ...queryParams,
        ...(activePeriodId ? { periodId: activePeriodId } : {}),
      }),
    enabled: Boolean(activePeriodId || queryParams.from || queryParams.to),
  });

  const data = reportQuery.data;
  const rows = data?.rows || [];
  const summary = data?.summary;

  // Deduplicate Bench metrics by employeeId so employees split across 2+ projects are never double-counted
  const benchEmployees = useMemo(() => {
    const byEmp = new Map<string, any>();
    for (const r of rows) {
      if (Number(r.unutilizedDays || 0) > 0 && !byEmp.has(r.employeeId)) {
        byEmp.set(r.employeeId, r);
      }
    }
    return Array.from(byEmp.values());
  }, [rows]);

  const totalBenchDays = useMemo(() => {
    return benchEmployees.reduce((acc, r) => acc + (Number(r.unutilizedDays) || 0), 0);
  }, [benchEmployees]);

  const totalLostOpportunityCost = useMemo(() => {
    return benchEmployees.reduce((acc, r) => {
      const cost = Number(r.employeeMonthlyCost || 0);
      const unutilizedPct = Number(r.unutilizedPct || 0);
      return acc + (cost * (unutilizedPct / 100));
    }, 0);
  }, [benchEmployees]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = (r.employeeName || '').toLowerCase().includes(q);
        const matchEmpCode = (r.employeeCode || '').toLowerCase().includes(q);
        const matchProject = (r.projectName || '').toLowerCase().includes(q) || (r.projectCode || '').toLowerCase().includes(q);
        const matchClient = (r.clientName || '').toLowerCase().includes(q);
        if (!matchName && !matchEmpCode && !matchProject && !matchClient) return false;
      }
      if (invoiceFilter === 'INVOICED' && r.invoiceStatus === 'UNINVOICED') return false;
      if (invoiceFilter === 'UNINVOICED' && r.invoiceStatus !== 'UNINVOICED') return false;
      if (basisFilter !== 'ALL' && r.allocationBasis !== basisFilter) return false;
      return true;
    });
  }, [rows, searchTerm, invoiceFilter, basisFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="تقرير توزيع الموظفين بالأيام والنسب وربط المبيعات"
        subtitle="تحليل تأجير وتوزيع المبرمجين والموظفين على المشاريع بالأيام الفعلية (مثال: 18 يوم بمشروع A، و3 أيام بمشروع B) ونسب التكلفة والإيرادات وربطها الفوري بفواتير المبيعات."
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <ExportMenu
              title="تقرير توزيع الموظفين بالأيام والنسب وربط المبيعات"
              currency={fx.targetCurrency}
              columns={[
                { key: 'employeeCode', header: 'كود الموظف', width: 14 },
                { key: 'employeeName', header: 'اسم الموظف', width: 22 },
                { key: 'projectName', header: 'المشروع', width: 22 },
                { key: 'clientName', header: 'العميل', width: 20 },
                { key: 'allocatedDays', header: 'الأيام المخصصة', width: 12, type: 'number' },
                { key: 'allocationPct', header: 'نسبة التخصيص %', width: 12, type: 'percent' },
                { key: 'projectCostShare', header: `حصة التكلفة (${fx.targetCurrency})`, width: 15, type: 'currency', isTotal: true },
                { key: 'revenueGenerated', header: `الإيراد التعاقدي (${fx.targetCurrency})`, width: 15, type: 'currency', isTotal: true },
                { key: 'grossProfit', header: `صافي الربح (${fx.targetCurrency})`, width: 15, type: 'currency', isTotal: true },
              ]}
              data={filteredRows.map((r: any) => ({
                ...r,
                projectCostShare: cv(r.projectCostShare),
                revenueGenerated: cv(r.revenueGenerated),
                grossProfit: cv(r.grossProfit),
              }))}
            />
            <Link
              to="/sal/invoices"
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <FileText className="size-3.5" /> مديول فواتير المبيعات
            </Link>
          </div>
        }
      />

      {/* Multi-Dimensional Filter Bar */}
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
        searchPlaceholder="بحث بالموظف، الكود، المشروع، العميل..."
        extraRight={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs dark:bg-slate-800">
              <span className="px-2 text-slate-500 font-medium">الفوترة:</span>
              <button
                className={`px-2 py-1 rounded transition ${invoiceFilter === 'ALL' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setInvoiceFilter('ALL')}
              >
                الكل
              </button>
              <button
                className={`px-2 py-1 rounded transition ${invoiceFilter === 'INVOICED' ? 'bg-white shadow text-emerald-700 font-bold dark:bg-slate-700 dark:text-emerald-400' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setInvoiceFilter('INVOICED')}
              >
                مفوتر
              </button>
              <button
                className={`px-2 py-1 rounded transition ${invoiceFilter === 'UNINVOICED' ? 'bg-white shadow text-amber-700 font-bold dark:bg-slate-700 dark:text-amber-400' : 'text-slate-600 hover:text-slate-900'}`}
                onClick={() => setInvoiceFilter('UNINVOICED')}
              >
                بانتظار الفوترة
              </button>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs dark:bg-slate-800">
              <span className="px-2 text-slate-500 font-medium">التوزيع:</span>
              <button
                className={`px-2 py-1 rounded transition ${basisFilter === 'ALL' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600'}`}
                onClick={() => setBasisFilter('ALL')}
              >
                الكل
              </button>
              <button
                className={`px-2 py-1 rounded transition ${basisFilter === 'DAYS' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600'}`}
                onClick={() => setBasisFilter('DAYS')}
              >
                أيام
              </button>
              <button
                className={`px-2 py-1 rounded transition ${basisFilter === 'PERCENTAGE' ? 'bg-white shadow text-brand-700 font-bold dark:bg-slate-700 dark:text-white' : 'text-slate-600'}`}
                onClick={() => setBasisFilter('PERCENTAGE')}
              >
                نسب %
              </button>
            </div>
          </div>
        }
      />

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat
          label="إجمالي التخصيصات"
          value={String(summary?.totalAssignments ?? 0)}
          hint="إجمالي إسنادات الموظفين"
          tone="blue"
        />
        <Stat
          label="أيام العمل المخصصة"
          value={`${summary?.totalAllocatedDays ?? 0} يوم`}
          hint="أيام المبرمجين الفعلية"
          tone="cyan"
        />
        <Stat
          label={`حصة التكلفة التشغيلية (${fx.targetCurrency})`}
          value={fm(summary?.totalCost ?? 0)}
          hint="الرواتب الموزعة للمشاريع"
          tone="amber"
        />
        <Stat
          label={`الإيرادات التعاقدية (${fx.targetCurrency})`}
          value={fm(summary?.totalRevenue ?? 0)}
          hint="إيرادات خدمات المطورين"
          tone="green"
        />
        <Stat
          label={`مجمل الربح التشغيلي (${fx.targetCurrency})`}
          value={fm(summary?.totalProfit ?? 0)}
          hint={`متوسط الهامش: ${summary?.averageMarginPct ?? 0}%`}
          tone="green"
        />
        <Stat
          label="جاهزية الفوترة"
          value={`${summary?.invoicedCount ?? 0} مفوتر`}
          hint={`${summary?.pendingInvoiceCount ?? 0} بانتظار الفوترة`}
          tone={summary?.pendingInvoiceCount ? 'red' : 'green'}
        />
      </div>

      {/* Educational Architecture Card */}
      <div className="card cyber-card-cyan p-4 text-xs print:hidden">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
              دورة عمل تأجير وتوزيع الكوادر على المشاريع وربطها التلقائي بالفواتير:
            </h4>
            <p className="leading-relaxed text-slate-600 dark:text-slate-300">
              وفقاً لدليل العمليات المعياري، يعمل البرنامج على تخصيص الكوادر بالأيام الفعلية على المشاريع واحتساب أيام التفرغ (Bench).
              يقوم النظام تلقائياً بتحويل الأيام إلى نسبة تكلفة شهرية مقسومة على أيام الشهر (22 يوم)، واحتساب الإيراد التعاقدي وفق سعر الخدمة المعتمد، مع ربط كل حصة بفواتير المبيعات الضريبية (ZATCA).
            </p>
          </div>
        </div>
      </div>

      {/* Bench Intelligence & Revenue Optimization Banner */}
      {totalBenchDays > 0 && (
        <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-l from-indigo-50/70 via-white to-purple-50/50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-purple-950/30 p-4.5 shadow-sm text-xs print:hidden animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3.5 max-w-3xl">
              <div className="size-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
                <Zap className="size-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    توصيات الذكاء التشغيلي لتعظيم الأرباح واستثمار الأيام الشاغرة (Bench Optimization)
                  </h4>
                  <span className="badge-amber text-[10px]">فرصة ربحية متاحة</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  لديك <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{totalBenchDays} يوماً شاغراً</strong> على قوة الشركة (Bench) لدى {benchEmployees.length} كادر، مما يسبب تكلفة غير مستغلة قدرها <strong className="text-rose-600 dark:text-rose-400 font-bold">{money(totalLostOpportunityCost)}</strong> تُدفع كرواتب دون إيراد مقابل.
                  عند تسكين هذه الأيام على مشاريعك بسعر خدمة 1,500 ر.س/اليوم، ستحقق إيراداً إضافياً <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{money(totalBenchDays * 1500)}</strong> وصافي ربح تقديري <strong className="text-emerald-600 dark:text-emerald-400 font-bold">+{money(totalBenchDays * 1500 - totalLostOpportunityCost)}</strong>!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 ms-auto shrink-0">
              <Link
                to="/prj/assignments"
                className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 flex items-center gap-2 shadow-md shadow-indigo-600/20"
              >
                <span>تسكين الأيام الشاغرة بمشروع</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main Report Table Card */}
      <div className="card overflow-hidden">
        {reportQuery.isLoading ? (
          <div className="p-8">
            <Loading />
          </div>
        ) : reportQuery.error ? (
          <div className="p-6">
            <ErrorState error={reportQuery.error} />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8">
            <EmptyState text="لا توجد تخصيصات أو بيانات مطابقة للفترة المحددة. تأكد من إسناد الموظفين للمشاريع في سجل المشاريع." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200">
                  <th>الموظف / المبرمج</th>
                  <th>المشروع التعاقدي والعميل</th>
                  <th>طريقة التوزيع</th>
                  <th className="num">الأيام المخصصة</th>
                  <th className="num">النسبة %</th>
                  <th className="num">أيام التفرغ</th>
                  <th className="num">سعر الخدمة</th>
                  <th className="num">تكلفة الموظف للمشروع</th>
                  <th className="num">الإيراد المحقق</th>
                  <th className="num">مجمل الربح</th>
                  <th className="num">الهامش %</th>
                  <th className="text-center">حالة الفاتورة</th>
                  <th className="text-center print:hidden">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRows.map((r) => {
                  const isPositiveProfit = Number(r.grossProfit) >= 0;
                  const isDays = r.allocationBasis === 'DAYS';

                  return (
                    <tr key={r.assignmentId} className="hover:bg-slate-50/70 transition">
                      {/* Employee Info */}
                      <td>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          <Link
                            to={`/hr/employees/${r.employeeId}`}
                            className="hover:underline text-brand-700 dark:text-brand-400"
                          >
                            {r.employeeName}
                          </Link>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <span className="font-mono">{r.employeeCode}</span>
                          <span>•</span>
                          <span>{r.positionTitle}</span>
                        </div>
                      </td>

                      {/* Project & Client */}
                      <td>
                        {r.projectId ? (
                          <>
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              <Link
                                to={`/prj/projects/${r.projectId}`}
                                className="hover:underline text-brand-600 dark:text-brand-400"
                              >
                                {r.projectName}
                              </Link>
                            </div>
                            <div className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                              <span>{r.projectCode}</span>
                              <span>•</span>
                              <span className="text-slate-600 font-sans">{r.clientName}</span>
                            </div>
                          </>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60">
                              غير مسند (على قوة الشركة - Bench)
                            </span>
                            <div className="text-[11px] text-slate-400 mt-1">
                              تشغيل داخلي • بانتظار تسكينه بمشروع
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Allocation Mode */}
                      <td>
                        {isDays ? (
                          <Badge color="blue">أيام عمل ({r.allocatedDays} يوم)</Badge>
                        ) : (
                          <Badge color="slate">نسبة مئوية ({r.allocationPct}%)</Badge>
                        )}
                      </td>

                      {/* Days Allocated */}
                      <td className="num font-semibold text-slate-900 dark:text-slate-100">
                        {r.allocatedDays} <span className="text-xs text-slate-500 font-normal">/ {r.workingDaysInMonth} يوم</span>
                      </td>

                      {/* Equivalent % */}
                      <td className="num font-mono font-medium text-slate-800 dark:text-slate-200">
                        {r.allocationPct}%
                      </td>

                      {/* Unutilized / Standby Days */}
                      <td className="num text-xs">
                        {r.unutilizedDays > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-mono font-medium dark:bg-amber-950/40 dark:text-amber-300">
                            {r.unutilizedDays} يوم ({r.unutilizedPct}%)
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">0.00</span>
                        )}
                      </td>

                      {/* Unit Price */}
                      <td className="num text-xs font-mono">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{fm(r.unitPrice)}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.pricingBasis === 'DAILY' ? 'يومي' : r.pricingBasis === 'HOURLY' ? 'ساعة' : 'شهري'}
                        </div>
                      </td>

                      {/* Cost Share */}
                      <td className="num font-semibold text-rose-700 dark:text-rose-400">
                        {fm(r.projectCostShare)}
                      </td>

                      {/* Revenue */}
                      <td className="num font-bold text-emerald-700 dark:text-emerald-400">
                        {fm(r.revenueGenerated)}
                      </td>

                      {/* Gross Profit */}
                      <td className={`num font-bold ${isPositiveProfit ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {fm(r.grossProfit)}
                      </td>

                      {/* Margin % */}
                      <td className="num font-bold">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${
                            r.marginPct >= 30
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : r.marginPct > 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                          }`}
                        >
                          {r.marginPct}%
                        </span>
                      </td>

                      {/* Invoice Link & Status */}
                      <td className="text-center">
                        {r.invoiceStatus !== 'UNINVOICED' && r.invoiceNo ? (
                          <Link
                            to={`/sal/invoices/${r.invoiceId}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                            title="عرض فاتورة المبيعات"
                          >
                            <CheckCircle2 className="size-3 text-emerald-600" />
                            <span>{r.invoiceNo}</span>
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900">
                            <Clock className="size-3 text-amber-600" />
                            <span>بانتظار الفوترة</span>
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="text-center print:hidden">
                        {r.projectId ? (
                          r.invoiceStatus === 'UNINVOICED' ? (
                            <button
                              className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1 mx-auto"
                              onClick={() => setInvoicingRow(r)}
                              title="توليد مسودة فاتورة مبيعات تلقائياً"
                            >
                              <FileText className="size-3.5" />
                              <span>توليد فاتورة</span>
                            </button>
                          ) : (
                            <Link
                              to={`/sal/invoices/${r.invoiceId}`}
                              className="btn-ghost text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 mx-auto"
                              title="عرض تفاصيل الفاتورة"
                            >
                              <ExternalLink className="size-3.5" />
                              <span>عرض</span>
                            </Link>
                          )
                        ) : (
                          <Link
                            to="/prj/assignments"
                            className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1 px-2.5 flex items-center gap-1 mx-auto shadow-xs"
                            title="تسكين وتخصيص الموظف في مشروع الآن"
                          >
                            <Sparkles className="size-3.5" />
                            <span>تسكين في مشروع</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cross-module Invoice Generation Modal */}
      {invoicingRow && (
        <Modal
          open={true}
          onClose={() => setInvoicingRow(null)}
          title="توليد مسودة فاتورة مبيعات من أيام التشغيل"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button className="btn-secondary text-xs" onClick={() => setInvoicingRow(null)} disabled={createInvoice.isPending}>إلغاء</button>
              <button
                className="btn-primary text-xs flex items-center gap-1.5"
                disabled={createInvoice.isPending}
                onClick={() => {
                  createInvoice.mutate({
                    invoiceType: 'TAX_INVOICE',
                    invoiceSubType: 'STANDARD',
                    clientId: invoicingRow.clientId,
                    projectId: invoicingRow.projectId,
                    fiscalPeriodId: activePeriodId,
                    issueDate: today(),
                    currencyCode: 'SAR',
                    lines: [
                      {
                        description: `خدمات برمجية وتشغيل كوادر تقنية - ${invoicingRow.employeeName} (${invoicingRow.positionTitle}) - مشروع: ${invoicingRow.projectName}`,
                        quantity: invoicingRow.allocatedDays,
                        unitPrice: invoicingRow.unitPrice,
                        vatRate: '15.00',
                      },
                    ],
                  });
                }}
              >
                {createInvoice.isPending && <Spinner className="size-3.5" />}
                تأكيد إصدار مسودة الفاتورة
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 leading-relaxed">
              سيتم إنشاء فاتورة مبيعات ضريبية مسودة (متوافقة مع هيئة الزكاة والضريبة ZATCA) للعميل مباشرة بناءً على أيام تشغيل الكادر التقني وأسعار الإسناد المعتمدة.
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500">العميل:</span>
                <div className="font-bold text-slate-900 mt-0.5">{invoicingRow.clientName}</div>
              </div>
              <div>
                <span className="text-slate-500">المشروع:</span>
                <div className="font-bold text-slate-900 mt-0.5">{invoicingRow.projectName}</div>
              </div>
              <div>
                <span className="text-slate-500">الكادر المهني:</span>
                <div className="font-bold text-slate-900 mt-0.5">{invoicingRow.employeeName} ({invoicingRow.positionTitle})</div>
              </div>
              <div>
                <span className="text-slate-500">أيام التشغيل والفوترة:</span>
                <div className="font-bold text-slate-900 font-mono mt-0.5">{invoicingRow.allocatedDays} يوم × {money(invoicingRow.unitPrice)} SAR</div>
              </div>
            </div>

            <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between font-mono">
              <span className="text-xs text-slate-300 font-sans">إجمالي الإيراد قبل الضريبة (15%):</span>
              <span className="text-base font-bold text-emerald-400">{money(invoicingRow.revenueGenerated)} SAR</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Official Signatures Section for Printing */}
      <div className="hidden print:block pt-10 border-t border-slate-300">
        <div className="grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <div className="font-bold mb-10">إعداد / مدير الموارد البشرية</div>
            <div className="border-t border-slate-400 w-36 mx-auto pt-1">التوقيع والتاريخ</div>
          </div>
          <div>
            <div className="font-bold mb-10">مراجعة / مدير العمليات والمشاريع</div>
            <div className="border-t border-slate-400 w-36 mx-auto pt-1">التوقيع والتاريخ</div>
          </div>
          <div>
            <div className="font-bold mb-10">اعتماد / المدير المالي (CFO)</div>
            <div className="border-t border-slate-400 w-36 mx-auto pt-1">التوقيع والختم</div>
          </div>
        </div>
      </div>
    </div>
  );
}
