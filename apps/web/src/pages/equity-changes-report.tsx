import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight, BarChart3, CheckCircle2, Landmark, Printer, RefreshCw, Scale, Settings2, TrendingUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, money, today, yearStart } from '../lib/format';
import { EQUITY_SECTION_LABELS, JOURNAL_TYPE } from '../lib/labels';
import { ExecutiveBarChart, ExecutiveChartCard } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { ExportEngine } from '../engine/export-engine';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import { Badge, EmptyState, ErrorState, Field, Loading, PageHeader, Stat } from '../components/ui';
import { useBranchesList } from './reports';

function shiftYear(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export function EquityChangesReportPage() {
  const base = useBaseCurrency();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [branchId, setBranchId] = useState('ALL');
  const [compare, setCompare] = useState(false);
  const [compareFrom, setCompareFrom] = useState(shiftYear(yearStart(), -1));
  const [compareTo, setCompareTo] = useState(shiftYear(today(), -1));

  const branchesQ = useBranchesList();
  const q = useQuery({
    queryKey: ['eq', from, to, branchId, compare ? compareFrom : '', compare ? compareTo : ''],
    queryFn: () =>
      api.get<any>('/ledger/equity-changes', {
        from,
        to,
        ...(branchId !== 'ALL' ? { branchId } : {}),
        ...(compare ? { compareFrom, compareTo } : {}),
      }),
  });

  const data = q.data;
  const components: any[] = data?.components ?? [];
  const unclosed = data?.unclosedEarnings ?? { opening: '0.00', periodNetProfit: '0.00', closingTransfers: '0.00', ending: '0.00' };
  const summary = data?.summary ?? {
    openingEquity: '0.00',
    netProfit: '0.00',
    capitalAdditions: '0.00',
    distributionsAndReductions: '0.00',
    closingAdjustments: '0.00',
    endingEquity: '0.00',
  };
  const movements: any[] = data?.movements ?? [];

  const matrixRows = [
    {
      label: `الرصيد الافتتاحي في ${date(from)}`,
      values: components.map((c) => Number(c.opening)),
      earnings: Number(unclosed.opening),
      total: Number(summary.openingEquity),
      tone: 'bg-slate-50/90 dark:bg-slate-900/60 font-bold',
    },
    {
      label: 'صافي ربح / (خسارة) الفترة (مرتبط مباشرة بقائمة الدخل)',
      values: components.map(() => 0),
      earnings: Number(unclosed.periodNetProfit),
      total: Number(summary.netProfit),
      tone: 'bg-emerald-50/50 dark:bg-emerald-950/20 font-bold text-emerald-900 dark:text-emerald-200',
    },
    {
      label: 'الإضافات والزيادات في رأس المال والاحتياطيات',
      values: components.map((c) => Number(c.additions)),
      earnings: 0,
      total: Number(summary.capitalAdditions),
      tone: '',
    },
    {
      label: 'التوزيعات والمسحوبات والتخفيضات',
      values: components.map((c) => Number(c.reductions)),
      earnings: 0,
      total: Number(summary.distributionsAndReductions),
      tone: 'text-rose-700 dark:text-rose-400',
    },
    {
      label: 'قيود الإقفال والتحويل للأرباح المبقاة',
      values: components.map((c) => Number(c.closingTransfers)),
      earnings: Number(unclosed.closingTransfers),
      total: Number(summary.closingAdjustments),
      tone: '',
    },
    {
      label: `الرصيد الختامي لحقوق الملكية في ${date(to)}`,
      values: components.map((c) => Number(c.ending)),
      earnings: Number(unclosed.ending),
      total: Number(summary.endingEquity),
      tone: 'bg-slate-900 text-white dark:bg-slate-950 font-black',
    },
  ];

  const exportColumns = [
    { key: 'item', header: 'البيان / حركة حقوق الملكية', width: 34 },
    ...components.map((c) => ({ key: `c_${c.accountId}`, header: `${c.nameAr} (${c.code})`, width: 18, type: 'currency' as const })),
    { key: 'earnings', header: 'أرباح/(خسائر) الفترة', width: 18, type: 'currency' as const },
    { key: 'total', header: `إجمالي حقوق الملكية (${base})`, width: 20, type: 'currency' as const },
  ];

  const exportRows = matrixRows.map((r) => {
    const obj: Record<string, any> = { item: r.label, earnings: r.earnings, total: r.total };
    components.forEach((c, idx) => { obj[`c_${c.accountId}`] = r.values[idx]; });
    return obj;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="قائمة التغيرات في حقوق الملكية (Statement of Changes in Equity)"
        subtitle={`بالعملة الأساسية (${base}). مرتبطة تلقائياً بشجرة حسابات حقوق الملكية وصافي الربح من قائمة الدخل، ومطابقة للرصيد الختامي في المركز المالي.`}
        icon={Scale}
        badge={
          <Badge color="purple" dot>
            {components.length} حساب حقوق ملكية
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/acc/accounts?tab=mapping" className="btn-secondary text-xs flex items-center gap-1.5">
              <Settings2 className="size-3.5 text-indigo-600" /> ربط الحسابات بالقوائم
            </Link>
            <button onClick={() => q.refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" /> تحديث
            </button>
            <ExportMenu
              title="قائمة التغيرات في حقوق الملكية"
              subtitle={`ربط مباشر بين رأس المال والأرباح المبقاة وصافي ربح الفترة (${base})`}
              filename={`equity-changes-${from}-${to}`}
              periodLabel={`من ${from} إلى ${to}`}
              currency={base}
              summaryKpis={[
                { label: 'حقوق الملكية أول المدة', value: `${money(summary.openingEquity)} ${base}`, tone: 'navy' },
                { label: 'صافي ربح/(خسارة) الفترة', value: `${money(summary.netProfit)} ${base}`, tone: Number(summary.netProfit) >= 0 ? 'emerald' : 'rose' },
                { label: 'حقوق الملكية آخر المدة', value: `${money(summary.endingEquity)} ${base}`, tone: 'indigo' },
              ]}
              columns={exportColumns}
              data={exportRows}
            />
            <button
              type="button"
              className="btn-primary text-xs flex items-center gap-1.5"
              onClick={() =>
                void ExportEngine.exportPdf({
                  title: 'قائمة التغيرات في حقوق الملكية',
                  subtitle: `متابعة تطور رأس المال والاحتياطيات والأرباح المبقاة وصافي ربح الفترة (${base})`,
                  periodLabel: `من ${from} إلى ${to}`,
                  currency: base,
                  summaryKpis: [
                    { label: 'رصيد أول المدة', value: `${money(summary.openingEquity)} ${base}`, tone: 'navy' },
                    { label: 'صافي ربح الفترة', value: `${money(summary.netProfit)} ${base}`, tone: Number(summary.netProfit) >= 0 ? 'emerald' : 'rose' },
                    { label: 'الإضافات / التوزيعات', value: `${money(Number(summary.capitalAdditions) + Number(summary.distributionsAndReductions))} ${base}`, tone: 'amber' },
                    { label: 'رصيد آخر المدة', value: `${money(summary.endingEquity)} ${base}`, tone: 'indigo' },
                  ],
                  columns: exportColumns,
                  data: exportRows,
                })
              }
            >
              <Printer className="size-3.5" /> طباعة ملكية (A4)
            </button>
          </div>
        }
      />

      {/* Period & Comparison Controls */}
      <div className="card p-4 flex flex-wrap items-end gap-3.5 bg-white/95 dark:bg-[#0c1324]/95">
        <Field label="من تاريخ"><input type="date" className="input w-36 font-mono text-xs" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى تاريخ"><input type="date" className="input w-36 font-mono text-xs" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
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
            <Field label="مقارنة من"><input type="date" className="input w-36 font-mono text-xs" value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)} /></Field>
            <Field label="مقارنة إلى"><input type="date" className="input w-36 font-mono text-xs" value={compareTo} onChange={(e) => setCompareTo(e.target.value)} /></Field>
          </>
        )}
      </div>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <>
          {/* KPI Ribbon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <Stat
              label="حقوق الملكية في بداية الفترة"
              value={`${money(summary.openingEquity)} ${base}`}
              tone="blue"
              icon={Landmark}
              hint={`كما في ${date(from)}`}
            />
            <Stat
              label="صافي ربح / (خسارة) الفترة"
              value={`${money(summary.netProfit)} ${base}`}
              tone={Number(summary.netProfit) >= 0 ? 'green' : 'red'}
              icon={TrendingUp}
              hint="مرتبط تلقائياً بقائمة الدخل"
            />
            <Stat
              label="صافي الإضافات والتوزيعات"
              value={`${money(Number(summary.capitalAdditions) + Number(summary.distributionsAndReductions))} ${base}`}
              tone="amber"
              icon={ArrowLeftRight}
              hint={`إضافات ${money(summary.capitalAdditions)} • توزيعات ${money(summary.distributionsAndReductions)}`}
            />
            <Stat
              label="حقوق الملكية في نهاية الفترة"
              value={`${money(summary.endingEquity)} ${base}`}
              tone="purple"
              icon={CheckCircle2}
              hint={
                data?.comparative
                  ? `فترة المقارنة: ${money(data.comparative.endingEquity.previousAmount)} (${Number(data.comparative.endingEquity.variancePct) >= 0 ? '+' : ''}${data.comparative.endingEquity.variancePct}%)`
                  : 'مطابق 100% لقائمة المركز المالي'
              }
            />
          </div>

          {/* Visual Equity Waterfall Chart */}
          <ExecutiveChartCard
            title="تحليل تطور حقوق الملكية خلال الفترة"
            subtitle={`من الرصيد الافتتاحي وحتى الرصيد الختامي بالعملة الأساسية (${base})`}
            icon={BarChart3}
            accent="indigo"
          >
            <ExecutiveBarChart
              categories={['رصيد أول المدة', 'صافي ربح الفترة', 'إضافات رأس المال', 'التوزيعات والتخفيضات', 'رصيد آخر المدة']}
              series={[
                {
                  name: `المبلغ (${base})`,
                  data: [
                    Number(summary.openingEquity),
                    Number(summary.netProfit),
                    Number(summary.capitalAdditions),
                    Number(summary.distributionsAndReductions),
                    Number(summary.endingEquity),
                  ],
                  color: '#4f46e5',
                  colorEnd: '#10b981',
                },
              ]}
              height={210}
              unit={base}
              emptyText="لا توجد حركات مسجلة على حقوق الملكية خلال الفترة"
            />
          </ExecutiveChartCard>

          {/* Multi-Column Roll-Forward Matrix */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-slate-900 text-white dark:bg-slate-950 flex items-center justify-between">
              <span className="font-extrabold text-sm">جدول التغيرات في حقوق الملكية — تفصيلي حسب الحسابات</span>
              <span className="font-mono text-xs text-amber-300">العملة: {base}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full text-xs">
                <thead>
                  <tr>
                    <th className="min-w-[240px]">البيان</th>
                    {components.map((c) => (
                      <th key={c.accountId} className="num">
                        <Link
                          to={`/reports/account-statement?accountId=${c.accountId}&from=${from}&to=${to}`}
                          className="hover:underline text-indigo-700 dark:text-indigo-300 block"
                        >
                          <div>{c.nameAr}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {c.code} • {EQUITY_SECTION_LABELS[c.equitySection] || c.equitySection}
                          </div>
                        </Link>
                      </th>
                    ))}
                    <th className="num">أرباح/(خسائر) الفترة غير المقفلة</th>
                    <th className="num font-black">الإجمالي ({base})</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row, idx) => (
                    <tr key={idx} className={row.tone}>
                      <td className={idx === matrixRows.length - 1 ? 'text-white font-black py-3' : 'py-2.5'}>{row.label}</td>
                      {row.values.map((val, cIdx) => (
                        <td key={cIdx} className={`num font-mono ${idx === matrixRows.length - 1 ? 'text-white font-black' : ''}`}>
                          {money(val)}
                        </td>
                      ))}
                      <td className={`num font-mono ${idx === matrixRows.length - 1 ? 'text-amber-300 font-black' : ''}`}>
                        {money(row.earnings)}
                      </td>
                      <td className={`num font-mono font-black ${idx === matrixRows.length - 1 ? 'text-emerald-300 text-sm' : ''}`}>
                        {money(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drill-down Movements Table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                الحركات والقيود المرحّلة على حسابات حقوق الملكية ({movements.length})
              </h3>
              <span className="text-xs text-slate-500">اضغط على رقم القيد أو الحساب لاستعراض التفاصيل</span>
            </div>
            {movements.length === 0 ? (
              <EmptyState text="لا توجد حركات مباشرة على حسابات رأس المال أو الاحتياطيات خلال الفترة — التغير ناتج بالكامل عن صافي ربح/خسارة الفترة." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>رقم القيد</th>
                      <th>نوع القيد</th>
                      <th>الحساب</th>
                      <th>البيان</th>
                      <th className="num">الأثر على حقوق الملكية ({base})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m, i) => (
                      <tr key={i}>
                        <td className="font-mono">{date(m.entryDate)}</td>
                        <td><JournalLinkBadge entryId={m.entryId} entryNo={m.entryNo} compact /></td>
                        <td><Badge color="blue">{JOURNAL_TYPE[m.journalType] || m.journalType}</Badge></td>
                        <td>
                          <Link to={`/reports/account-statement?accountId=${m.accountId}&from=${from}&to=${to}`} className="font-bold text-indigo-700 dark:text-indigo-300 hover:underline">
                            <span className="font-mono me-1">{m.code}</span> {m.nameAr}
                          </Link>
                        </td>
                        <td>{m.description}</td>
                        <td className={`num font-mono font-bold ${Number(m.amount) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                          {Number(m.amount) >= 0 ? `+${money(m.amount)}` : money(m.amount)}
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
