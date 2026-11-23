import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowLeftRight, BarChart3, CheckCircle2, ChevronDown, ChevronLeft,
  PieChart, Printer, RefreshCw, Settings2, TrendingUp, Wallet, XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { money, today, yearStart } from '../lib/format';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { ExportEngine } from '../engine/export-engine';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, Stat } from '../components/ui';
import { useBranchesList } from './reports';

function shiftYear(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function CashFlowReportPage() {
  const base = useBaseCurrency();
  const [fromDate, setFromDate] = useState(yearStart());
  const [toDate, setToDate] = useState(today());
  const [branchId, setBranchId] = useState('ALL');
  const [compare, setCompare] = useState(false);
  const [compareFrom, setCompareFrom] = useState(shiftYear(yearStart(), -1));
  const [compareTo, setCompareTo] = useState(shiftYear(today(), -1));
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['OPERATING_ACTIVITIES', 'INVESTING_ACTIVITIES', 'FINANCING_ACTIVITIES']),
  );

  const branchesQ = useBranchesList();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cf', fromDate, toDate, branchId, compare ? compareFrom : '', compare ? compareTo : ''],
    queryFn: () =>
      api.get<any>('/ledger/cash-flow', {
        from: fromDate,
        to: toDate,
        ...(branchId !== 'ALL' ? { branchId } : {}),
        ...(compare ? { compareFrom, compareTo } : {}),
      }),
  });

  const sections: any[] = data?.sections ?? [];
  const operatingTotal = Number(data?.operating?.total ?? 0);
  const investingTotal = Number(data?.investing?.total ?? 0);
  const financingTotal = Number(data?.financing?.total ?? 0);
  const openingCash = Number(data?.openingCash ?? 0);
  const netCashChange = Number(data?.netCashChange ?? 0);
  const endingCash = Number(data?.endingCash ?? 0);
  const reconciled = data ? Boolean(data.reconciled) : true;
  const cashAccounts: any[] = data?.cashAccounts ?? [];
  const nonCashAdjustments: any[] = data?.nonCashAdjustments ?? [];

  const toggleSec = (code: string) => {
    const next = new Set(expanded);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setExpanded(next);
  };

  const flatExportRows = [
    ...sections.flatMap((sec) =>
      (sec.accounts || []).map((a: any) => ({
        section: sec.nameAr,
        code: a.code,
        nameAr: a.nameAr,
        inflow: Number(a.inflow || 0),
        outflow: Number(a.outflow || 0),
        amount: Number(a.amount || 0),
        txCount: a.txCount || 0,
      })),
    ),
  ];

  const exportCols = [
    { key: 'section', header: 'نشاط التدفق النقدي', width: 26 },
    { key: 'code', header: 'كود الحساب', width: 14 },
    { key: 'nameAr', header: 'الحساب المقابل', width: 28 },
    { key: 'inflow', header: `تدفق داخل (${base})`, width: 16, type: 'currency' as const, isTotal: true },
    { key: 'outflow', header: `تدفق خارج (${base})`, width: 16, type: 'currency' as const, isTotal: true },
    { key: 'amount', header: `صافي التدفق (${base})`, width: 18, type: 'currency' as const, isTotal: true },
  ];

  const handlePrint = () => {
    void ExportEngine.exportPdf({
      title: 'قائمة التدفقات النقدية (IAS 7)',
      subtitle: `مشتقة تلقائياً من شجرة الحسابات والقيود المرحّلة (${reconciled ? 'متطابقة 100% مع أرصدة النقدية' : 'يوجد فرق مطابقة'})`,
      periodLabel: `من ${fromDate} إلى ${toDate}`,
      currency: base,
      summaryKpis: [
        { label: 'التدفق التشغيلي', value: `${money(operatingTotal)} ${base}`, tone: operatingTotal >= 0 ? 'emerald' : 'rose' },
        { label: 'التدفق الاستثماري', value: `${money(investingTotal)} ${base}`, tone: 'indigo' },
        { label: 'التدفق التمويلي', value: `${money(financingTotal)} ${base}`, tone: 'sky' },
        { label: 'نقدية آخر المدة', value: `${money(endingCash)} ${base}`, tone: 'navy' },
      ],
      columns: exportCols,
      data: flatExportRows.length > 0
        ? flatExportRows
        : cashAccounts.map((c) => ({
            section: 'النقدية وما في حكمها',
            code: c.code,
            nameAr: c.nameAr,
            inflow: Number(c.openingBalance),
            outflow: 0,
            amount: Number(c.endingBalance),
          })),
    });
  };

  const sectionAccent = (code: string) =>
    code === 'OPERATING_ACTIVITIES'
      ? 'bg-emerald-500'
      : code === 'INVESTING_ACTIVITIES'
      ? 'bg-indigo-500'
      : 'bg-amber-500';

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="قائمة التدفقات النقدية الديناميكية (IAS 7 Cash Flow Statement)"
        subtitle={`مبنية مباشرة على تصنيفات التدفق النقدي في شجرة الحسابات والقيود المرحّلة فقط (${base}). اضغط على أي نشاط لاستعراض الحسابات ثم كشف الحساب.`}
        icon={Wallet}
        badge={
          reconciled ? (
            <Badge color="green" dot>متطابقة 100% مع النقدية</Badge>
          ) : (
            <Badge color="red" dot>فرق مطابقة {money(data?.reconciliationDiff ?? 0)}</Badge>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/acc/accounts?tab=mapping" className="btn-secondary text-xs flex items-center gap-1.5">
              <Settings2 className="size-3.5 text-indigo-600" /> ربط تصنيفات التدفق النقدي
            </Link>
            <button onClick={() => refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" /> تحديث
            </button>
            <ExportMenu
              title="قائمة التدفقات النقدية (IAS 7)"
              subtitle="التدفقات النقدية التشغيلية والاستثمارية والتمويلية ومطابقة النقدية"
              filename={`cash-flow-${fromDate}-${toDate}`}
              periodLabel={`من ${fromDate} إلى ${toDate}`}
              currency={base}
              summaryKpis={[
                { label: 'التدفق التشغيلي', value: `${money(operatingTotal)} ${base}`, tone: operatingTotal >= 0 ? 'emerald' : 'rose' },
                { label: 'التدفق الاستثماري', value: `${money(investingTotal)} ${base}`, tone: 'indigo' },
                { label: 'التدفق التمويلي', value: `${money(financingTotal)} ${base}`, tone: 'sky' },
                { label: 'نقدية آخر المدة', value: `${money(endingCash)} ${base}`, tone: 'navy' },
              ]}
              columns={exportCols}
              data={flatExportRows}
            />
            <button onClick={handlePrint} className="btn-primary text-xs flex items-center gap-1.5">
              <Printer className="size-3.5" /> طباعة ملكية (A4)
            </button>
          </div>
        }
      />

      {/* Period & Comparison Bar */}
      <div className="card p-4 bg-white/95 dark:bg-[#0c1324]/95 border border-slate-200 dark:border-slate-800 flex flex-wrap items-end gap-3.5">
        <Field label="من تاريخ">
          <input type="date" className="input text-xs py-1.5 w-36 font-mono" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="إلى تاريخ">
          <input type="date" className="input text-xs py-1.5 w-36 font-mono" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="الفرع / المركز المالي">
          <select className="input min-w-[13rem] text-xs font-medium" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="ALL">الكل (قوائم موحدة - {base})</option>
            {(branchesQ.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.nameAr}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-xs font-bold cursor-pointer select-none">
          <input type="checkbox" className="rounded text-indigo-600" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          <ArrowLeftRight className="size-3.5 text-indigo-600" />
          <span>مقارنة بفترة سابقة</span>
        </label>
        {compare && (
          <>
            <Field label="مقارنة من"><input type="date" className="input text-xs py-1.5 w-36 font-mono" value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)} /></Field>
            <Field label="مقارنة إلى"><input type="date" className="input text-xs py-1.5 w-36 font-mono" value={compareTo} onChange={(e) => setCompareTo(e.target.value)} /></Field>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : error ? (
        <div className="p-8"><ErrorState error={error} /></div>
      ) : (
        <div className="space-y-5">
          {/* Top 5 Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <Stat
              label="التدفق من الأنشطة التشغيلية"
              value={`${money(operatingTotal)} ${base}`}
              tone={operatingTotal >= 0 ? 'green' : 'red'}
              icon={Activity}
              hint={data?.comparative ? `السابق: ${money(data.comparative.operating.previousAmount)}` : 'تحصيلات ومدفوعات تشغيلية'}
            />
            <Stat
              label="التدفق من الأنشطة الاستثمارية"
              value={`${money(investingTotal)} ${base}`}
              tone="blue"
              icon={BarChart3}
              hint={data?.comparative ? `السابق: ${money(data.comparative.investing.previousAmount)}` : 'الأصول الثابتة والاستثمارات'}
            />
            <Stat
              label="التدفق من الأنشطة التمويلية"
              value={`${money(financingTotal)} ${base}`}
              tone="amber"
              icon={TrendingUp}
              hint={data?.comparative ? `السابق: ${money(data.comparative.financing.previousAmount)}` : 'رأس المال والتمويل والتوزيعات'}
            />
            <Stat
              label="صافي التغير في النقدية"
              value={`${netCashChange >= 0 ? `+${money(netCashChange)}` : money(netCashChange)} ${base}`}
              tone={netCashChange >= 0 ? 'cyan' : 'red'}
              icon={ArrowLeftRight}
              hint={`نقدية أول المدة: ${money(openingCash)}`}
            />
            <Stat
              label="رصيد النقدية وما في حكمها آخر المدة"
              value={`${money(endingCash)} ${base}`}
              tone="purple"
              icon={Wallet}
              hint={reconciled ? 'مطابق 100% لأرصدة البنوك والصناديق' : 'يرجى مراجعة المطابقة'}
            />
          </div>

          {/* Interactive Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:hidden">
            <ExecutiveChartCard
              title="ملخص التدفقات النقدية حسب نوع النشاط (IAS 7)"
              subtitle={`مقارنة الأنشطة التشغيلية والاستثمارية والتمويلية (${base})`}
              icon={BarChart3}
              accent="indigo"
              className="lg:col-span-2"
            >
              <ExecutiveBarChart
                categories={['نقدية أول المدة', 'الأنشطة التشغيلية', 'الأنشطة الاستثمارية', 'الأنشطة التمويلية', 'نقدية آخر المدة']}
                series={[
                  {
                    name: `المبلغ (${base})`,
                    data: [openingCash, operatingTotal, investingTotal, financingTotal, endingCash],
                    color: '#4f46e5',
                    colorEnd: '#10b981',
                  },
                ]}
                height={210}
                unit={base}
                emptyText="لا توجد تدفقات نقدية مرحّلة للفترة"
              />
            </ExecutiveChartCard>

            <ExecutiveChartCard
              title="توزيع أرصدة النقدية وما في حكمها"
              subtitle={`الأرصدة الختامية في حسابات النقدية والبنوك (${base})`}
              icon={PieChart}
              accent="emerald"
            >
              <ExecutiveDonutChart
                data={cashAccounts
                  .filter((c) => Number(c.endingBalance) > 0)
                  .map((c) => ({ name: `${c.code} — ${c.nameAr}`, value: Number(c.endingBalance) }))}
                centerValue={money(endingCash)}
                centerLabel={`نقدية آخر المدة (${base})`}
                height={210}
                unit={base}
                emptyText="لا توجد أرصدة نقدية موجبة"
              />
            </ExecutiveChartCard>
          </div>

          {/* Interactive Expandable IAS 7 Statement Table */}
          <div className="card overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-slate-900 text-white dark:bg-slate-950 flex items-center justify-between">
              <span className="font-extrabold text-sm">قائمة التدفقات النقدية التفصيلية — اضغط على أي نشاط لعرض الحسابات</span>
              <div className="flex items-center gap-2 text-xs">
                {reconciled ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle2 className="size-4" /> معادلة النقدية متطابقة 100%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
                    <XCircle className="size-4" /> فرق: {money(data?.reconciliationDiff ?? 0)}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr>
                    <th>النشاط / الحساب المقابل</th>
                    <th className="num">تدفق نقدي داخل</th>
                    <th className="num">تدفق نقدي خارج</th>
                    <th className="num">صافي التدفق ({base})</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((sec) => {
                    const isOpen = expanded.has(sec.sectionCode);
                    const accs: any[] = sec.accounts ?? [];
                    return (
                      <Fragment key={sec.sectionCode}>
                        <tr
                          className="bg-slate-100/90 dark:bg-slate-800/70 font-extrabold cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                          onClick={() => toggleSec(sec.sectionCode)}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {isOpen ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronLeft className="size-4 text-slate-500" />}
                              <span className={`inline-block size-2.5 rounded-full ${sectionAccent(sec.sectionCode)}`} />
                              <span className="text-slate-900 dark:text-white">{sec.nameAr}</span>
                              <Badge color="slate">{accs.length} حساب</Badge>
                            </div>
                          </td>
                          <td className="num font-mono text-emerald-700 dark:text-emerald-400">
                            {money(accs.reduce((s, a) => s + Number(a.inflow || 0), 0))}
                          </td>
                          <td className="num font-mono text-rose-700 dark:text-rose-400">
                            {money(accs.reduce((s, a) => s + Number(a.outflow || 0), 0))}
                          </td>
                          <td className={`num font-mono font-black ${Number(sec.total) >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                            {money(sec.total)}
                          </td>
                        </tr>
                        {isOpen && accs.length === 0 && (
                          <tr key={`${sec.sectionCode}-empty`}>
                            <td colSpan={4} className="ps-10 py-2.5 text-slate-400 italic">
                              لا توجد تدفقات نقدية مصنفة ضمن هذا النشاط خلال الفترة المحددة.
                            </td>
                          </tr>
                        )}
                        {isOpen && accs.map((a) => (
                          <tr key={`${sec.sectionCode}-${a.accountId}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="ps-10 py-2">
                              <Link
                                to={`/reports/account-statement?accountId=${a.accountId}&from=${fromDate}&to=${toDate}`}
                                className="flex items-center gap-2 hover:underline"
                              >
                                <span className="font-mono font-bold text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{a.code}</span>
                                <span className="font-semibold text-slate-900 dark:text-slate-100">{a.nameAr}</span>
                                <span className="text-[10px] text-slate-400">({a.txCount} حركة)</span>
                              </Link>
                            </td>
                            <td className="num font-mono text-emerald-700 dark:text-emerald-400">{money(a.inflow)}</td>
                            <td className="num font-mono text-rose-700 dark:text-rose-400">{money(a.outflow)}</td>
                            <td className={`num font-mono font-bold ${Number(a.amount) >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
                              {money(a.amount)}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}

                  {/* Reconciliation Summary Rows */}
                  <tr className="bg-indigo-50/80 dark:bg-indigo-950/40 font-extrabold border-t-2 border-indigo-200 dark:border-indigo-800">
                    <td colSpan={3} className="px-4 py-2.5 text-indigo-950 dark:text-indigo-200">
                      صافي الزيادة / (النقص) في النقدية وما في حكمها خلال الفترة
                    </td>
                    <td className="num px-4 font-mono font-black text-indigo-950 dark:text-indigo-100">{money(netCashChange)}</td>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 font-bold">
                    <td colSpan={3} className="px-4 py-2 text-slate-700 dark:text-slate-300">
                      (+) رصيد النقدية وما في حكمها في بداية الفترة ({fromDate})
                    </td>
                    <td className="num px-4 font-mono font-bold">{money(openingCash)}</td>
                  </tr>
                  <tr className="bg-slate-900 text-white dark:bg-slate-950 font-black text-sm">
                    <td colSpan={3} className="px-4 py-3 text-white">
                      (=) رصيد النقدية وما في حكمها في نهاية الفترة ({toDate})
                    </td>
                    <td className="num px-4 font-mono text-emerald-300 font-black">{money(endingCash)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Cash Accounts Reconciliation + Non-Cash Items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-extrabold text-sm text-slate-900 dark:text-white">
                كشف مطابقة حسابات النقدية والبنوك ({cashAccounts.length})
              </div>
              {cashAccounts.length === 0 ? (
                <EmptyState text="لا توجد حسابات مصنفة كـ 'نقدية وما في حكمها' في شجرة الحسابات." />
              ) : (
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>الحساب النقدي</th>
                      <th className="num">أول المدة</th>
                      <th className="num">حركة الفترة</th>
                      <th className="num">آخر المدة ({base})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashAccounts.map((c) => (
                      <tr key={c.accountId}>
                        <td>
                          <Link
                            to={`/reports/account-statement?accountId=${c.accountId}&from=${fromDate}&to=${toDate}`}
                            className="font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
                          >
                            <span className="font-mono me-1.5">{c.code}</span> {c.nameAr}
                          </Link>
                        </td>
                        <td className="num font-mono">{money(c.openingBalance)}</td>
                        <td className={`num font-mono font-bold ${Number(c.periodChange) >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {money(c.periodChange)}
                        </td>
                        <td className="num font-mono font-black">{money(c.endingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 font-extrabold text-sm text-slate-900 dark:text-white">
                إفصاح البنود غير النقدية (الإهلاك والمخصصات — Non-Cash Items)
              </div>
              {nonCashAdjustments.length === 0 ? (
                <EmptyState text="لا توجد حركات غير نقدية (إهلاك أو مخصصات) خلال الفترة المحددة." />
              ) : (
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>الحساب غير النقدي</th>
                      <th className="num">أثر الفترة ({base})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonCashAdjustments.map((n) => (
                      <tr key={n.accountId}>
                        <td>
                          <Link
                            to={`/reports/account-statement?accountId=${n.accountId}&from=${fromDate}&to=${toDate}`}
                            className="font-bold text-slate-900 dark:text-white hover:underline"
                          >
                            <span className="font-mono me-1.5">{n.code}</span> {n.nameAr}
                          </Link>
                        </td>
                        <td className="num font-mono font-bold text-amber-700 dark:text-amber-400">{money(n.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
