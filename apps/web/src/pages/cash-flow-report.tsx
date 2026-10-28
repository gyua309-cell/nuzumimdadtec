import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, ArrowLeftRight, Download, Plus, Printer, RefreshCw, TrendingUp, Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { downloadCsv, money, today } from '../lib/format';
import { Badge, EmptyState, ErrorState, Loading, PageHeader, useToast } from '../components/ui';

export function CashFlowReportPage() {
  const toast = useToast();
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
        const bal = Math.abs(Number(acc.currentBalance ?? acc.balance ?? 0));

        if (code.startsWith('111') || acc.currencyCode === 'SAR') {
          sarBankBalance += bal;
        } else if (code.startsWith('112') || (acc.currencyCode === 'EGP' && (code.startsWith('11') || acc.accountType === 'ASSET'))) {
          egpBankBalance += bal;
        } else if (code.startsWith('4300') || acc.nameAr?.includes('أرباح فروق')) {
          realizedFxGains += bal;
        } else if (code.startsWith('5700') || acc.nameAr?.includes('خسائر فروق')) {
          realizedFxLosses += bal;
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

  // Cash flow statement lines derived dynamically from journal entries or empty if no activity
  const cashFlowLines = useMemo(() => {
    if (!Array.isArray(journalEntries) || journalEntries.length === 0) {
      return [];
    }

    return journalEntries.map((je: any) => ({
      id: je.id,
      title: je.narrationAr || je.narration || `قيد رقم ${je.entryNo || je.code}`,
      category: je.sourceModule || 'تشغيلي',
      currency: je.currencyCode || 'SAR',
      originalAmount: Number(je.totalDebit || 0),
      baseAmountEgp: Number(je.totalDebitBase || je.totalDebit || 0),
    }));
  }, [journalEntries]);

  const handleExportCsv = () => {
    if (cashFlowLines.length === 0) {
      const rows = [
        ['بيان التدفق النقدي', 'التصنيف', 'العملة الأصلية', 'المبلغ بالعملة الأصلية', 'المبلغ المعادل (EGP)'],
        ['رصيد بنوك الرياض (SAR)', 'أصول نقدية', 'SAR', money(liquidityData.sarBankBalance), money(liquidityData.sarBankBalance * 13.15)],
        ['رصيد بنوك مصر (EGP)', 'أصول نقدية', 'EGP', money(liquidityData.egpBankBalance), money(liquidityData.egpBankBalance)],
        ['أرصدة العهد النقدية (EGP)', 'عهد فروع', 'EGP', money(liquidityData.custodyBalanceEgp), money(liquidityData.custodyBalanceEgp)],
        ['صافي أرباح/خسائر فروق العملات', 'فروق عملة', 'EGP', '—', money(liquidityData.netFxGain)],
      ];
      downloadCsv(`cash_flow_statement_${today()}.csv`, rows);
      toast.success('تم تصدير ملخص التدفقات النقدية الفعلي كملف CSV');
      return;
    }

    const rows = [
      ['بيان التدفق النقدي', 'التصنيف', 'العملة الأصلية', 'المبلغ بالعملة الأصلية', 'المبلغ المعادل (EGP)'],
      ...cashFlowLines.map((l) => [l.title, l.category, l.currency, money(l.originalAmount), money(l.baseAmountEgp)]),
    ];
    downloadCsv(`cash_flow_statement_${today()}.csv`, rows);
    toast.success('تم تصدير تقرير التدفقات النقدية كملف CSV');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="قائمة التدفقات النقدية والسيولة وفروق العملات (Cash Flow & FX Report)"
        subtitle="متابعة السيولة النقدية الفعلية لبنوك الرياض والقاهرة، وأرصدة العهد النقدية، وأثر تقلبات أسعار صرف العملات الأجنبية المحققة"
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
              onClick={handlePrint}
              className="btn btn-primary text-xs flex items-center gap-1.5"
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
          <span>العملة المرجعية للقوائم المالية: <strong>الجنيه المصري (EGP)</strong> مع تتبع حركة الريال السعودي (SAR)</span>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : error ? (
        <div className="p-8"><ErrorState error={error} /></div>
      ) : (
        <div className="space-y-6">
          {/* Executive Liquidity & FX Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Liquidity SAR */}
            <div className="card p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">سيولة بنوك الرياض (SAR)</span>
                <span className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg">
                  <Wallet className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-blue-900 dark:text-blue-300 tracking-tight font-mono">
                  {money(liquidityData.sarBankBalance)} SAR
                </div>
                <div className="text-xs text-slate-500 mt-1">حساب 1110 (النقدية بالبنوك - ريال سعودي)</div>
              </div>
            </div>

            {/* Liquidity EGP */}
            <div className="card p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">سيولة بنوك مصر (EGP)</span>
                <span className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-lg">
                  <Wallet className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-emerald-900 dark:text-emerald-300 tracking-tight font-mono">
                  {money(liquidityData.egpBankBalance)} EGP
                </div>
                <div className="text-xs text-slate-500 mt-1">حساب 1120 (النقدية بالبنوك - جنيه مصري)</div>
              </div>
            </div>

            {/* Custody Pool */}
            <div className="card p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">أرصدة عهد الفروع النقدية</span>
                <span className="p-2 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 rounded-lg">
                  <ArrowLeftRight className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-black text-cyan-900 dark:text-cyan-300 tracking-tight font-mono">
                  {money(liquidityData.custodyBalanceEgp)} EGP
                </div>
                <div className="text-xs text-slate-500 mt-1">حساب 1310 (عهد نقدية طرف الأمناء)</div>
              </div>
            </div>

            {/* Net FX Gain */}
            <div className="card p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">صافي أرباح/خسائر فروق العملات</span>
                <span className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 rounded-lg">
                  <TrendingUp className="size-5" />
                </span>
              </div>
              <div className="mt-3">
                <div className={`text-2xl font-black tracking-tight font-mono ${liquidityData.netFxGain >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-rose-600'}`}>
                  {liquidityData.netFxGain >= 0 ? `+${money(liquidityData.netFxGain)}` : money(liquidityData.netFxGain)} EGP
                </div>
                <div className="text-xs text-slate-500 mt-1">أرباح محققة حـ/ 4300 مقابل حـ/ 5700</div>
              </div>
            </div>
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
                  +{money(liquidityData.realizedFxGains)} EGP
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
                  -{money(liquidityData.realizedFxLosses)} EGP
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
              <Link to="/gl/entries" className="btn btn-secondary text-xs flex items-center gap-1">
                <Plus className="size-3" />
                إضافة قيد محاسبي
              </Link>
            </div>

            {cashFlowLines.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/40">
                <EmptyState
                  text="لا توجد حركات تدفقات نقدية مسجلة لهذه الفترة المالية حتى الآن."
                  action={
                    <Link to="/gl/entries" className="btn-primary text-xs inline-flex items-center gap-1.5 mt-2">
                      <Plus className="size-3.5" />
                      تسجيل حركة نقدية أو قيد يومية
                    </Link>
                  }
                />
              </div>
            ) : (
              <table className="table w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-4">بيان التدفق النقدي</th>
                    <th className="py-2.5 px-4 text-center">التصنيف</th>
                    <th className="py-2.5 px-4 text-center">المبلغ بالعملة الأصلية</th>
                    <th className="py-2.5 px-4 text-center font-bold">المبلغ المعادل (EGP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cashFlowLines.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 px-4 font-medium">{row.title}</td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge color={row.category === 'تشغيلي' ? 'cyan' : 'amber'}>{row.category}</Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                        {money(row.originalAmount)} {row.currency}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-emerald-600">
                        +{money(row.baseAmountEgp)} EGP
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
