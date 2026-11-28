import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowUpRight, Award,
  CheckCircle2, Clock, Lock, Sparkles,
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { money } from '../lib/format';
import { useReportCurrency } from '../lib/fx-display';
import { ExportMenu } from '../components/ExportMenu';
import { PeriodSelect } from '../components/forms';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader } from '../components/ui';

export function OperatingCycleHubPage() {
  const [periodId, setPeriodId] = useState('fp-2026-11');
  const [currencyCode, setCurrencyCode] = useState('');
  const fx = useReportCurrency(currencyCode);
  const cv = (v: any) => fx.convert(v);
  const fm = (v: any) => money(cv(v));

  const qEmps = useQuery({ queryKey: ['cycle-emps'], queryFn: () => api.get<Page<any>>('/employees', { pageSize: 200 }) });
  const qCostSheet = useQuery({ queryKey: ['cycle-cost', periodId], queryFn: () => api.get<any>('/cost-sheet', periodId ? { periodId } : {}) });
  const qPrices = useQuery({ queryKey: ['cycle-prices'], queryFn: () => api.get<Page<any>>('/service-prices', { pageSize: 200 }) });
  const qAllocs = useQuery({ queryKey: ['cycle-allocs'], queryFn: () => api.get<Page<any>>('/assignments', { pageSize: 200 }) });
  const qVars = useQuery({ queryKey: ['cycle-vars', periodId], queryFn: () => api.get<Page<any>>('/monthly-variables', { periodId, pageSize: 200 }) });
  const qEmpProf = useQuery({ queryKey: ['cycle-emp-prof', periodId], queryFn: () => api.get<any>('/profitability/employees', periodId ? { periodId } : {}) });
  const qPrjProf = useQuery({ queryKey: ['cycle-prj-prof', periodId], queryFn: () => api.get<any[]>('/profitability/projects', periodId ? { periodId } : {}) });
  const qCliProf = useQuery({ queryKey: ['cycle-cli-prof', periodId], queryFn: () => api.get<any[]>('/profitability/clients', periodId ? { periodId } : {}) });
  const qOverhead = useQuery({ queryKey: ['cycle-overhead'], queryFn: () => api.get<any>('/overhead-policy') });
  const qRetro = useQuery({ queryKey: ['cycle-retro', periodId], queryFn: () => api.get<any>('/revenue-adjustments/retroactive', periodId ? { periodId } : {}) });
  const qRuns = useQuery({ queryKey: ['cycle-runs'], queryFn: () => api.get<Page<any>>('/payroll-runs', { pageSize: 50 }) });
  const qRev = useQuery({ queryKey: ['cycle-rev'], queryFn: () => api.get<Page<any>>('/revenue-runs', { pageSize: 50 }) });
  const qChecks = useQuery({ queryKey: ['cycle-checks', periodId], enabled: !!periodId, queryFn: () => api.get<any>(`/closing/periods/${periodId}/checks`) });

  const empList: any[] = Array.isArray(qEmps.data) ? qEmps.data : (qEmps.data?.data ?? []);
  const costRows: any[] = Array.isArray(qCostSheet.data?.rows) ? qCostSheet.data.rows : (Array.isArray(qCostSheet.data) ? qCostSheet.data : []);
  const priceRows: any[] = Array.isArray(qPrices.data) ? qPrices.data : (qPrices.data?.data ?? []);
  const allocRows: any[] = Array.isArray(qAllocs.data) ? qAllocs.data : (qAllocs.data?.data ?? []);
  const varRows: any[] = Array.isArray(qVars.data) ? qVars.data : (qVars.data?.data ?? []);
  const empProfRows: any[] = qEmpProf.data?.employees ?? [];
  const empSummary = qEmpProf.data?.summary ?? {};
  const prjProfRows: any[] = Array.isArray(qPrjProf.data) ? qPrjProf.data : ((qPrjProf.data as any)?.data ?? []);
  const cliProfRows: any[] = Array.isArray(qCliProf.data) ? qCliProf.data : ((qCliProf.data as any)?.data ?? []);
  const retroRows: any[] = Array.isArray(qRetro.data) ? qRetro.data : ((qRetro.data as any)?.data ?? []);
  const runsList: any[] = Array.isArray(qRuns.data) ? qRuns.data : (qRuns.data?.data ?? []);
  const revRunsList: any[] = Array.isArray(qRev.data) ? qRev.data : (qRev.data?.data ?? []);
  const overhead = qOverhead.data ?? {};

  const activeEmps = empList.filter((e) => e.status === 'ACTIVE');
  const overAllocs = allocRows.filter((a) => a.status === 'ACTIVE' && a.isOverAllocated);
  const draftVars = varRows.filter((v) => v.status === 'DRAFT');
  const projectLinkedVars = varRows.filter((v) => v.projectId && (v.status === 'APPROVED' || v.status === 'POSTED'));
  const totalProjectVars = projectLinkedVars.reduce((s, v) => s + Number(v.computedAmount || 0), 0);
  const postedPayrollCount = runsList.filter((r) => r.fiscalPeriodId === periodId && r.status === 'POSTED').length;
  const periodRevCount = revRunsList.filter((r) => r.fiscalPeriodId === periodId && r.status !== 'CANCELLED').length;

  // Section 32 Question #8: Service Price Adequacy Analysis per active pricing rule
  const adequacyRows = useMemo(() => {
    const costByEmp = new Map<string, any>(costRows.map((c) => [c.employeeId, c]));
    const overheadPool = Number(overhead?.totalPoolAmount || 0);
    const totalCostBase = Number(qCostSheet.data?.totals?.distributableCostBase || 0);
    const overheadRatio = totalCostBase > 0 && overheadPool > 0 ? Math.min(0.4, overheadPool / totalCostBase) : 0.1;

    return priceRows
      .filter((sp) => !sp.effectiveTo)
      .map((sp) => {
        const c = costByEmp.get(sp.employeeId);
        const monthlyDirect = Number(c?.distributableCostBase ?? c?.totalCostBase ?? 0);
        const monthlyOverhead = monthlyDirect * overheadRatio;
        const monthlyFullCost = monthlyDirect + monthlyOverhead;

        const basis = sp.pricingBasis ?? sp.basis ?? 'DAILY';
        const rawPrice = Number(sp.price || 0);
        const monthlyEquivBilling = basis === 'DAILY' ? rawPrice * 22 : basis === 'HOURLY' ? rawPrice * 176 : rawPrice;
        const projectedNet = monthlyEquivBilling - monthlyFullCost;
        const projectedMarginPct = monthlyEquivBilling > 0 ? (projectedNet / monthlyEquivBilling) * 100 : 0;
        const targetMargin = 20;
        const recommendedMonthly = monthlyFullCost / (1 - targetMargin / 100);
        const recommendedDaily = recommendedMonthly / 22;

        const status: 'ADEQUATE' | 'LOW_MARGIN' | 'LOSS' =
          monthlyEquivBilling <= 0 || monthlyFullCost <= 0
            ? 'LOW_MARGIN'
            : projectedNet < 0
              ? 'LOSS'
              : projectedMarginPct >= targetMargin
                ? 'ADEQUATE'
                : 'LOW_MARGIN';

        return {
          ...sp,
          basis,
          monthlyDirect,
          monthlyFullCost,
          monthlyEquivBilling,
          projectedNet,
          projectedMarginPct,
          recommendedDaily,
          status,
        };
      });
  }, [priceRows, costRows, overhead, qCostSheet.data]);

  const belowTargetPrices = adequacyRows.filter((r) => r.status !== 'ADEQUATE');
  const topProject = [...prjProfRows].sort((a, b) => Number(b.grossProfitBase || 0) - Number(a.grossProfitBase || 0))[0];
  const topClient = [...cliProfRows].sort((a, b) => Number(b.grossProfitBase || 0) - Number(a.grossProfitBase || 0))[0];
  const profitableEmps = empProfRows.filter((e) => Number(e.grossProfitBase || 0) >= 0).length;
  const losingEmps = empProfRows.filter((e) => Number(e.grossProfitBase || 0) < 0).length;
  const totalCostSheet = Number(qCostSheet.data?.totals?.distributableCostBase || 0);
  const avgEmpCost = costRows.length > 0 ? totalCostSheet / costRows.length : 0;
  const avgDailyCost = avgEmpCost / 22;

  const isLoading = qEmps.isLoading || qCostSheet.isLoading || qEmpProf.isLoading;

  // Section 31: 4-Stage Guided Monthly Operating Cycle
  const cycleStages = [
    {
      stage: 'المرحلة 1: بداية الشهر — التهيئة والتسعير',
      color: 'indigo',
      steps: [
        { label: 'بيانات الموظفين والرواتب وتاريخ الخروج', ok: activeEmps.length > 0, info: `${activeEmps.length} موظف نشط`, to: '/hr/employees' },
        { label: 'ملفات التكلفة وإهلاك الأصول والعهد', ok: costRows.length > 0, info: `${costRows.length} كشف تكلفة محسوب`, to: '/cost/profiles' },
        { label: 'أسعار الخدمة الافتراضية وتجاوزات المشاريع', ok: priceRows.length > 0 && belowTargetPrices.length === 0, info: `${priceRows.length} تسعير (${belowTargetPrices.length} يحتاج مراجعة)`, to: '/prj/prices' },
      ],
    },
    {
      stage: 'المرحلة 2: أثناء الشهر — التخصيص والمتغيرات',
      color: 'cyan',
      steps: [
        { label: 'توزيع الكوادر ومنع تجاوز الطاقة (>100%)', ok: allocRows.length > 0 && overAllocs.length === 0, info: overAllocs.length > 0 ? `${overAllocs.length} تخصيص متجاوز!` : `${allocRows.filter((a) => a.status === 'ACTIVE').length} تخصيص منضبط`, to: '/prj/utilization' },
        { label: 'تسجيل ساعات الإضافي والمكافآت والأجر الإضافي', ok: draftVars.length === 0, info: draftVars.length > 0 ? `${draftVars.length} مسودة بانتظار الاعتماد` : `${varRows.length} متغير معتمد`, to: '/pay/variables' },
        { label: 'متابعة السلف وأقساط الشهر والتأجيلات', ok: true, info: 'مفصولة عن تكلفة المشاريع تلقائياً', to: '/pay/loans' },
      ],
    },
    {
      stage: 'المرحلة 3: نهاية الشهر — الاعتماد والربحية',
      color: 'emerald',
      steps: [
        { label: 'اعتماد المتغيرات وترحيل مسيّر الرواتب', ok: postedPayrollCount > 0, info: postedPayrollCount > 0 ? `${postedPayrollCount} مسيّر مرحّل` : 'بانتظار ترحيل المسيّر', to: '/pay/runs' },
        { label: 'تشغيل دورة الإيرادات والتسويات بأثر رجعي', ok: periodRevCount > 0, info: `${periodRevCount} دورة إيراد • ${retroRows.length} تسوية`, to: '/rev/revenue' },
        { label: 'مراجعة الربحية ثلاثية المستويات والأوفرهيد', ok: prjProfRows.length > 0 || empProfRows.length > 0, info: `صافي ${fm(empSummary.totalNetProfit ?? 0)} ${fx.targetCurrency}`, to: '/rev/profitability' },
      ],
    },
    {
      stage: 'المرحلة 4: الإقفال — التحقق واللقطة التاريخية',
      color: 'amber',
      steps: [
        { label: 'مراجعة المجالات الـ 9 وفحوصات ما قبل الإقفال', ok: Boolean(qChecks.data?.canClose), info: qChecks.data?.canClose ? 'جميع الفحوصات جاهزة' : 'راجع ملاحظات الإقفال', to: '/closing' },
        { label: 'إقفال الشهر وإنشاء لقطة SHA-256 غير قابلة للتعديل', ok: Boolean(qChecks.data?.isClosed), info: qChecks.data?.isClosed ? 'الفترة مقفلة ومؤرشفة' : 'مفتوحة — بانتظار الإقفال', to: '/closing/snapshots' },
      ],
    },
  ];

  // Section 32: The 10 Executive Questions Scorecard
  const tenQuestions = [
    { qNo: '1', q: 'كم يكلفنا الموظف فعلياً شهرياً؟', a: `متوسط ${fm(avgEmpCost)} ${fx.targetCurrency}`, sub: `الإجمالي ${fm(totalCostSheet)} (راتب + تأمينات + إهلاك + متغيرات)`, to: '/cost/sheet' },
    { qNo: '2', q: 'ما تكلفة يوم العمل وساعة العمل؟', a: `${fm(avgDailyCost)} / يوم`, sub: `ساعة العمل القياسية ≈ ${fm(avgDailyCost / 8)} ${fx.targetCurrency}`, to: '/cost/sheet' },
    { qNo: '3', q: 'أي موظف يحقق ربحاً وأيهم يحقق خسارة؟', a: `${profitableEmps} رابح / ${losingEmps} خاسر`, sub: `من إجمالي ${empProfRows.length} كادر في الفترة`, to: '/rev/profitability?tab=employees' },
    { qNo: '4', q: 'ما حجم وتكلفة الوقت غير المستغل (Bench)؟', a: `${fm(empSummary.totalUnutilizedCostBase ?? empSummary.totalUnutilizedCost ?? 0)} ${fx.targetCurrency}`, sub: 'رواتب كوادر غير مخصصة على مشاريع', to: '/prj/utilization' },
    { qNo: '5', q: 'أي مشروع أعلى/أقل ربحية ومطابقة للهدف؟', a: topProject ? topProject.projectName : 'لا توجد مشاريع مفوترة', sub: topProject ? `صافي ${fm(topProject.grossProfitBase)} (${Number(topProject.grossMarginPct || 0).toFixed(1)}%)` : 'راجع تخصيص المشاريع', to: '/rev/profitability?tab=projects' },
    { qNo: '6', q: 'أي عميل أعلى مساهمة في الأرباح؟', a: topClient ? topClient.clientName : 'لا توجد بيانات عملاء', sub: topClient ? `صافي ربح العميل ${fm(topClient.grossProfitBase)} ${fx.targetCurrency}` : '—', to: '/rev/profitability?tab=clients' },
    { qNo: '7', q: 'ما حجم فائض التخصيص (Over-Allocation)؟', a: overAllocs.length > 0 ? `${overAllocs.length} تعارض >100%` : '0 تعارضات — منضبط 100%', sub: 'يُطبع نظامياً عند التوزيع لضمان عدم تخطي 100%', to: '/prj/assignments' },
    { qNo: '8', q: 'هل سعر الخدمة يكفي لتغطية التكلفة والهامش؟', a: belowTargetPrices.length > 0 ? `${belowTargetPrices.length} تسعير دون المستهدف` : `كل الأسعار كافية (${adequacyRows.length})`, sub: 'مقارنة السعر المعادل مقابل التكلفة الكلية + هامش 20%', to: '/prj/prices' },
    { qNo: '9', q: 'ما أثر الإضافي والأجر المرتبط بمشروع على الربحية؟', a: `${fm(totalProjectVars)} ${fx.targetCurrency}`, sub: `${projectLinkedVars.length} بند محمّل مباشرة على تكلفة المشاريع`, to: '/pay/variables' },
    { qNo: '10', q: 'ما وضع التسويات بأثر رجعي واللقطات المقفلة؟', a: `${retroRows.length} تسوية مسجلة`, sub: 'دون المساس بالأشهر التاريخية المقفلة', to: '/rev/profitability?tab=retroactive' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="دورة التشغيل الشهرية والأسئلة الإدارية الـ 10"
        subtitle="التنفيذ المتكامل لدليل الأعمال لشركات الموارد البشرية والتقنية (Sections 31, 32 & 33) — متابعة دورة الشهر وكفاية تسعير الخدمة."
        icon={Sparkles}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="مصفوفة كفاية أسعار الخدمات والأسئلة الـ 10"
              periodLabel={periodId}
              currency={fx.targetCurrency}
              columns={[
                { key: 'employeeName', header: 'الموظف', width: 22 },
                { key: 'basis', header: 'أساس التسعير', width: 12 },
                { key: 'monthlyEquivBilling', header: `الفوترة الشهرية المعادلة (${fx.targetCurrency})`, width: 18, type: 'currency', isTotal: true },
                { key: 'monthlyFullCost', header: `التكلفة + الأوفرهيد (${fx.targetCurrency})`, width: 18, type: 'currency', isTotal: true },
                { key: 'projectedNet', header: `صافي العائد المتوقع`, width: 16, type: 'currency', isTotal: true },
                { key: 'recommendedDaily', header: `السعر اليومي المقترح (20% هامش)`, width: 18, type: 'currency' },
              ]}
              data={adequacyRows.map((r) => ({
                ...r,
                monthlyEquivBilling: cv(r.monthlyEquivBilling),
                monthlyFullCost: cv(r.monthlyFullCost),
                projectedNet: cv(r.projectedNet),
                recommendedDaily: cv(r.recommendedDaily),
              }))}
            />
            <Link to="/closing" className="btn-primary text-xs flex items-center gap-1.5">
              <Lock className="size-3.5" /> الذهاب لإقفال الفترة
            </Link>
          </div>
        }
      />

      <div className="card p-3 flex flex-wrap items-end gap-3">
        <Field label="الفترة المالية"><PeriodSelect value={periodId} onChange={setPeriodId} className="w-56" /></Field>
        <Field label="عملة العرض (Sec 25)">
          <select
            className="input h-9 text-xs font-mono w-48"
            value={currencyCode || fx.baseCurrency}
            onChange={(e) => setCurrencyCode(e.target.value === fx.baseCurrency ? '' : e.target.value)}
            title={fx.rateLabel}
          >
            {fx.currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.nameAr}</option>)}
          </select>
        </Field>
        <div className="ms-auto flex items-center gap-2 text-xs text-slate-500">
          <Badge color="blue">{fx.rateLabel}</Badge>
        </div>
      </div>

      {isLoading ? <Loading /> : qEmpProf.error ? <ErrorState error={qEmpProf.error} /> : (
        <>
          {/* Section 31: 4-Phase Monthly Operating Cycle */}
          <div className="space-y-2">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="size-4 text-indigo-600" />
              دورة التشغيل الشهرية المترابطة لشركة الموارد البشرية (Section 31)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
              {cycleStages.map((st) => (
                <div key={st.stage} className="card p-3.5 space-y-2.5 border-t-2 border-t-brand-500">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{st.stage}</div>
                  <div className="space-y-1.5">
                    {st.steps.map((s) => (
                      <Link
                        key={s.label}
                        to={s.to}
                        className="flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-xs"
                      >
                        {s.ok ? (
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="size-4 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800 dark:text-slate-200 leading-snug">{s.label}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{s.info}</div>
                        </div>
                        <ArrowUpRight className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 32: 10 Managerial Questions Live Scorecard */}
          <div className="space-y-2">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="size-4 text-emerald-600" />
              إجابات الأسئلة الإدارية الـ 10 الحرجة مباشرةً من البيانات (Section 32)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {tenQuestions.map((item) => (
                <Link
                  key={item.qNo}
                  to={item.to}
                  className="card p-3 hover:border-brand-400 transition flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="size-5 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {item.qNo}
                    </span>
                    <ArrowUpRight className="size-3.5 text-slate-400 shrink-0" />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-snug">{item.q}</div>
                    <div className="text-sm font-black font-mono text-slate-900 dark:text-white mt-1.5">{item.a}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{item.sub}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Section 32 #8: Service Price Adequacy Matrix */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  مصفوفة كفاية أسعار الخدمات مقابل التكلفة الفعلية + الأوفرهيد (Section 32 #8)
                </h3>
                <p className="text-xs text-slate-500">
                  تقارن التسعيرات السارية المعادلة شهرياً مقابل تكلفة الكادر المباشرة + نصيبه من المصروفات الإدارية، وتقترح السعر اليومي لتحقيق هامش 20%
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge color={belowTargetPrices.length === 0 ? 'green' : 'amber'}>
                  {belowTargetPrices.length === 0 ? 'كل الأسعار تغطي التكلفة والهدف' : `${belowTargetPrices.length} تسعير أقل من المستهدف`}
                </Badge>
                <Link to="/prj/prices" className="btn-secondary text-xs">تحديث أسعار الخدمات</Link>
              </div>
            </div>
            {adequacyRows.length === 0 ? (
              <EmptyState text="لا توجد أسعار خدمة مسجلة حالياً." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>الأساس والنطاق</th>
                      <th className="num">سعر الخدمة الخام</th>
                      <th className="num">المعادل الشهري ({fx.targetCurrency})</th>
                      <th className="num">التكلفة الشهرية الكلية</th>
                      <th className="num">الربح المتوقع</th>
                      <th className="num">الهامش%</th>
                      <th className="num">اليومي المقترح (20%)</th>
                      <th>حكم الكفاية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adequacyRows.map((r) => (
                      <tr key={r.id}>
                        <td className="font-semibold">
                          <Link to={`/hr/employees/${r.employeeId}`} className="text-brand-600 hover:underline">{r.employeeName}</Link>
                        </td>
                        <td>
                          <span>{r.basis === 'DAILY' ? 'يومي' : r.basis === 'HOURLY' ? 'ساعي' : 'شهري'}</span>
                          {' • '}
                          <Badge color={r.projectId ? 'blue' : 'slate'}>{r.projectId ? 'مشروع محدد' : 'افتراضي'}</Badge>
                        </td>
                        <td className="num font-mono">{money(r.price)} {r.currencyCode}</td>
                        <td className="num font-mono font-semibold text-emerald-600">{fm(r.monthlyEquivBilling)}</td>
                        <td className="num font-mono">{fm(r.monthlyFullCost)}</td>
                        <td className={`num font-mono font-bold ${r.projectedNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fm(r.projectedNet)}
                        </td>
                        <td className="num font-mono font-bold">{r.projectedMarginPct.toFixed(1)}%</td>
                        <td className="num font-mono text-indigo-600 font-semibold">{fm(r.recommendedDaily)} / يوم</td>
                        <td>
                          {r.status === 'ADEQUATE' ? (
                            <Badge color="green">كافٍ ويحقق الهدف</Badge>
                          ) : r.status === 'LOSS' ? (
                            <Badge color="red">خاسر — دون التكلفة!</Badge>
                          ) : (
                            <Badge color="amber">هامشي — دون 20%</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
