import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowLeftRight, BarChart3, PieChart, Plus, Printer, RefreshCw, TrendingUp, Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { money, today } from '../lib/format';
import { SOURCE_MODULE_LABELS } from '../lib/labels';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, Stat } from '../components/ui';

export function CashFlowReportPage() {
  const base = useBaseCurrency();
  const [fromDate, setFromDate] = useState('2026-01-01');
  const [toDate, setToDate] = useState(today());

  // Query: General Ledger accounts to compute actual bank, custody and FX balances
  const { data: accounts = [], isLoading, error, refetch } = useQuery({
    queryKey: ['cash-flow-accounts', fromDate, toDate],
    queryFn: () => api.get<any[]>('/accounts', { postingOnly: 'true' }).catch(() => []),
  });

  // Query: Custody report for real custody liquidity
  const { data: custodyReport } = useQuery({
    queryKey: ['custody-report-liquidity'],
    queryFn: () => api.get<any>('/custodies/report').catch(() => null),
  });

  // Query: Journal entries / cash flow transactions for the period
  const { data: journalEntries = [] } = useQuery({
    queryKey: ['cash-flow-journals', fromDate, toDate],
    queryFn: () => api.get<any[]>('/journal-entries', { fromDate, toDate, status: 'POSTED' }).catch(() => []),
  });

  // Dynamically compute liquidity and FX balances strictly from real accounts data (Zero-baseline for production)
  const liquidityData = useMemo(() => {
    let sarBankBalance = 0;
    let egpBankBalance = 0;
    let realizedFxGains = 0;
    let realizedFxLosses = 0;

    if (Array.isArray(accounts)) {
      for (const acc of accounts) {
        const code = String(acc.code || '');
        const bal = Number(acc.currentBalance ?? acc.balance ?? 0);
        const cur = acc.currencyCode || acc.currency || 'SAR';
        const isCashOrBank = code.startsWith('101') || code.startsWith('102') || code.startsWith('111') || code.startsWith('112');

        if (isCashOrBank && (code.startsWith('111') || code === '10201' || cur === 'SAR')) {
          sarBankBalance += bal;
        } else if (isCashOrBank && (code.startsWith('112') || code === '10202' || cur === 'EGP')) {
          egpBankBalance += bal;
        } else if (code.startsWith('4300') || acc.nameAr?.includes('أرباح فروق')) {
          realizedFxGains += Math.abs(bal);
        } else if (code.startsWith('5700') || acc.nameAr?.includes('خسائر فروق')) {
          realizedFxLosses += Math.abs(bal);
        }
      }
    }

    const custodyBalanceEgp = Number(custodyReport?.kpis?.totalRemainingBalanceEgp || 0);
    const netFxGain = realizedFxGains - realizedFxLosses;

    return {
      sarBankBalance,
      egpBankBalance,
      custodyBalanceEgp,
      realizedFxGains,
      realizedFxLosses,
      netFxGain,
    };
  }, [accounts, custodyReport]);

  // Cash flow statement lines derived dynamically from journal entries (normalizing paged response)
  const journalArr: any[] = Array.isArray(journalEntries) ? journalEntries : ((journalEntries as any)?.data ?? []);
  const cashFlowLines = useMemo(() => {
    if (!journalArr.length) {
      return [];
    }

    return journalArr.map((je: any) => ({
      id: je.id,
      entryNo: je.entryNo,
      title: je.description || je.narrationAr || je.narration || `قيد رقم ${je.entryNo || je.code}`,
      category: SOURCE_MODULE_LABELS[je.sourceModule] || je.sourceModule || 'تشغيلي',
      currency: je.currencyCode || base,
      originalAmount: Number(je.totalDebitBase || je.totalDebit || 0),
      baseAmount: Number(je.totalDebitBase || je.totalDebit || 0),
    }));
  }, [journalArr, base]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="قائمة التدفقات النقدية والسيولة وفروق العملات (Cash Flow & FX Report)"
        subtitle="متابعة السيولة النقدية الفعلية لبنوك الرياض والقاهرة، وأرصدة العهد النقدية، وأثر تقلبات أسعار صرف العملات الأجنبية المحققة"
        icon={Wallet}
        badge={
          <Badge color="cyan" dot>
            سيولة SAR / EGP
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => refetch()}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <ExportMenu
              title="قائمة التدفقات النقدية والسيولة وفروق العملات"
              filename={`cash-flow-${fromDate}-${toDate}`}
              periodLabel={`من ${fromDate} إلى ${toDate}`}
              currency={base}
              columns={[
                { key: 'entryNo', header: 'رقم القيد', width: 14 },
                { key: 'title', header: 'بيان التدفق النقدي', width: 32 },
                { key: 'category', header: 'التصنيف', width: 16 },
                { key: 'currency', header: 'العملة', width: 10 },
                { key: 'originalAmount', header: 'المبلغ الأصلي', width: 16, type: 'currency', isTotal: true },
                { key: 'baseAmount', header: `المعادل (${base})`, width: 16, type: 'currency', isTotal: true },
              ]}
              data={
                cashFlowLines.length > 0
                  ? cashFlowLines
                  : [
                      { entryNo: '1110', title: 'رصيد بنوك الرياض (SAR)', category: 'أصول نقدية', currency: 'SAR', originalAmount: liquidityData.sarBankBalance, baseAmount: liquidityData.sarBankBalance },
                      { entryNo: '1120', title: 'رصيد بنوك مصر (EGP)', category: 'أصول نقدية', currency: 'EGP', originalAmount: liquidityData.egpBankBalance, baseAmount: liquidityData.egpBankBalance * 0.076 },
                      { entryNo: '1310', title: 'أرصدة العهد النقدية (EGP)', category: 'عهد فروع', currency: 'EGP', originalAmount: liquidityData.custodyBalanceEgp, baseAmount: liquidityData.custodyBalanceEgp * 0.076 },
                    ]
              }
            />
            <button
              onClick={handlePrint}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Printer className="size-3.5" />
              طباعة التقرير
            </button>
          </div>
        }
      />

      {/* Date Filter Strip */}
      <div className="card p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">الفترة المالية للتدفقات:</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">من:</span>
            <input
              type="date"
              className="input text-xs py-1.5 w-36 font-mono"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">إلى:</span>
            <input
              type="date"
              className="input text-xs py-1.5 w-36 font-mono"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-emerald-500" />
          <span>العملة الأساسية للقوائم الموحدة: <strong>الريال السعودي ({base})</strong> مع تتبع سيولة الجنيه المصري (EGP)</span>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : error ? (
        <div className="p-8"><ErrorState error={error} /></div>
      ) : (
        <div className="space-y-6">
          {/* Executive Liquidity & FX Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Stat
              label="سيولة بنوك الرياض (SAR)"
              value={`${money(liquidityData.sarBankBalance)} SAR`}
              tone="indigo"
              icon={Wallet}
              hint="حساب 1110 / 10201 (ريال سعودي)"
            />
            <Stat
              label="سيولة بنوك مصر (EGP)"
              value={`${money(liquidityData.egpBankBalance)} EGP`}
              tone="green"
              icon={Wallet}
              hint="حساب 1120 / 10202 (جنيه مصري)"
            />
            <Stat
              label="أرصدة عهد الفروع النقدية"
              value={`${money(liquidityData.custodyBalanceEgp)} EGP`}
              tone="cyan"
              icon={ArrowLeftRight}
              hint="حساب 1310 (عهد نقدية طرف الأمناء)"
            />
            <Stat
              label="صافي أرباح/خسائر فروق العملات"
              value={`${liquidityData.netFxGain >= 0 ? `+${money(liquidityData.netFxGain)}` : money(liquidityData.netFxGain)} ${base}`}
              tone={liquidityData.netFxGain >= 0 ? 'purple' : 'red'}
              icon={TrendingUp}
              hint="أرباح محققة حـ/ 4300 مقابل حـ/ 5700"
            />
          </div>

          {/* Interactive Cash & Liquidity Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:hidden">
            <ExecutiveChartCard
              title="مقارنة أرصدة السيولة النقدية والفروع"
              subtitle={`القيم المعادلة بالعملة الأساسية (${base}) عبر البنوك والعهد`}
              icon={BarChart3}
              accent="indigo"
              className="lg:col-span-2"
            >
              <ExecutiveBarChart
                categories={['بنوك الرياض (SAR)', 'بنوك مصر (معادل SAR)', 'عهد الفروع (معادل SAR)', 'فروق العملة المحققة']}
                series={[
                  {
                    name: `المعادل (${base})`,
                    data: [
                      Number(liquidityData.sarBankBalance.toFixed(2)),
                      Number((liquidityData.egpBankBalance * 0.076).toFixed(2)),
                      Number((liquidityData.custodyBalanceEgp * 0.076).toFixed(2)),
                      Number(liquidityData.netFxGain.toFixed(2)),
                    ],
                    color: '#4f46e5',
                    colorEnd: '#0ea5e9',
                  },
                ]}
                height={220}
                unit={base}
                emptyText="لا توجد أرصدة نقدية مسجلة بعد"
              />
            </ExecutiveChartCard>

            <ExecutiveChartCard
              title="توزيع محافظ السيولة النقدية"
              subtitle={`هيكل النقدية المتاحة (${base})`}
              icon={PieChart}
              accent="emerald"
            >
              <ExecutiveDonutChart
                data={[
                  { name: 'بنوك الرياض (SAR)', value: Math.max(0, liquidityData.sarBankBalance), color: '#4f46e5' },
                  { name: 'بنوك مصر (معادل)', value: Math.max(0, Number((liquidityData.egpBankBalance * 0.076).toFixed(2))), color: '#10b981' },
                  { name: 'عهد الفروع (معادل)', value: Math.max(0, Number((liquidityData.custodyBalanceEgp * 0.076).toFixed(2))), color: '#0ea5e9' },
                ]}
                centerValue={money(
                  Math.max(0, liquidityData.sarBankBalance) +
                    Math.max(0, liquidityData.egpBankBalance * 0.076) +
                    Math.max(0, liquidityData.custodyBalanceEgp * 0.076),
                )}
                centerLabel={`إجمالي السيولة (${base})`}
                height={220}
                unit={base}
                emptyText="لا توجد سيولة"
              />
            </ExecutiveChartCard>
          </div>

          {/* Section 1: Detailed FX Gains/Losses Revaluation */}
          <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl p-6">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <ArrowLeftRight className="size-4 text-blue-600" />
              أثر تقلبات أسعار صرف العملات الأجنبية المحققة بدفاتر الحسابات (Foreign Exchange Realized P&L)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FX Gains (4300) */}
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-900 dark:text-emerald-300">
                    أرباح فروق العملات الأجنبية المحققة (حساب 4300)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                    إيرادات دائنة
                  </span>
                </div>
                <div className="mt-3 text-xl font-mono font-black text-emerald-700 dark:text-emerald-400">
                  +{money(liquidityData.realizedFxGains)} {base}
                </div>
                <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300/80 leading-relaxed">
                  ناتجة عن تحويل وصرف عهد الريال السعودي لفرع مصر بأسعار صرف تفضيلية أعلى من سعر الأساس الدفتري، وتحصيل إيرادات العقود بالعملة الأجنبية.
                </p>
              </div>

              {/* FX Losses (5700) */}
              <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-rose-900 dark:text-rose-300">
                    خسائر فروق العملات الأجنبية المحققة (حساب 5700)
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                    مصروفات مدينة
                  </span>
                </div>
                <div className="mt-3 text-xl font-mono font-black text-rose-700 dark:text-rose-400">
                  -{money(liquidityData.realizedFxLosses)} {base}
                </div>
                <p className="mt-2 text-xs text-rose-800 dark:text-rose-300/80 leading-relaxed">
                  ناتجة عن عمولات التحويلات البنكية الدولية وتغيرات سعر الصرف عند سداد التزامات الموردين بالعملات الأجنبية.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Cash Flow Statement Table */}
          <div className="card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="size-4 text-emerald-600" />
                حركات وقائمة التدفقات النقدية الفعلية (Cash Flow Statement)
              </h3>
              <Link to="/acc/journals/new" className="btn btn-secondary text-xs flex items-center gap-1">
                <Plus className="size-3" />
                إضافة قيد محاسبي
              </Link>
            </div>

            {cashFlowLines.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40">
                <EmptyState
                  text="لا توجد حركات تدفقات نقدية مسجلة لهذه الفترة المالية حتى الآن."
                  action={
                    <Link to="/acc/journals/new" className="btn-primary text-xs inline-flex items-center gap-1.5 mt-2">
                      <Plus className="size-3.5" />
                      تسجيل حركة نقدية أو قيد يومية
                    </Link>
                  }
                />
              </div>
            ) : (
              <table className="table w-full text-right text-xs">
                <thead>
                  <tr>
                    <th>سند القيد</th>
                    <th>بيان التدفق النقدي</th>
                    <th className="text-center">التصنيف</th>
                    <th className="text-center">المبلغ بالعملة الأصلية</th>
                    <th className="text-center font-bold">المبلغ المعادل ({base})</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlowLines.map((row) => (
                    <tr key={row.id}>
                      <td><JournalLinkBadge entryId={row.id} entryNo={row.entryNo} compact /></td>
                      <td className="font-medium">{row.title}</td>
                      <td className="text-center">
                        <Badge color="cyan">{row.category}</Badge>
                      </td>
                      <td className="text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {money(row.originalAmount)} {row.currency}
                      </td>
                      <td className="text-center font-mono font-bold text-emerald-600">
                        {money(row.baseAmount)} {base}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
