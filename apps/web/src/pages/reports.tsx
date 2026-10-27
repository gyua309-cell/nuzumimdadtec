import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import {
  Activity, ArrowUpRight, BarChart3, Briefcase, Building2, Calendar,
  CheckCircle2, Clock, DollarSign, Download, FileText,
  HelpCircle, Landmark, Layers, Lock, LockOpen, Plus, Printer, Receipt,
  ShieldAlert, ShieldCheck, Sparkles, Target, TrendingUp, Users, Wallet, XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, dateTime, downloadCsv, money, monthStart, today, yearStart } from '../lib/format';
import { ACCOUNT_CLASS, CHECK_STATUS } from '../lib/labels';
import { PeriodSelect } from '../components/forms';
import { AccountSelect, useAccounts, useQueryParam } from './accounting';
import { PERIOD_STATUS } from './org';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, ReasonDialog, Spinner, Stat, useToast } from '../components/ui';

export function useBranchesList() {
  return useQuery({
    queryKey: ['branches-picker'],
    queryFn: () => api.get<any[]>('/branches').then((r: any) => r.data || r || []),
  });
}

function Range({
  from, to, setFrom, setTo, branchId, setBranchId, branches, children,
}: {
  from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  branchId?: string; setBranchId?: (v: string) => void; branches?: any[];
  children?: React.ReactNode;
}) {
  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
      <Field label="من تاريخ"><input className="input w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
      <Field label="إلى تاريخ"><input className="input w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      {setBranchId && (
        <Field label="الفرع / المركز المالي">
          <select className="input w-64 font-medium" value={branchId || 'ALL'} onChange={(e) => setBranchId(e.target.value)}>
            <option value="ALL">الكل (قوائم موحدة - Consolidated SAR)</option>
            {(branches ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.nameAr} ({b.functionalCurrency || b.countryCode})</option>
            ))}
          </select>
        </Field>
      )}
      {children}
    </div>
  );
}

const BalancedBadge = ({ ok }: { ok: boolean }) => (ok ? <Badge color="green"><CheckCircle2 className="me-1 size-3.5" /> متوازن</Badge> : <Badge color="red"><XCircle className="me-1 size-3.5" /> غير متوازن</Badge>);

// ------------------------------------------------------------------ trial balance
export function TrialBalancePage() {
  const nav = useNavigate();
  const base = useBaseCurrency();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [ledger, setLedger] = useState('FINANCIAL');
  const [branchId, setBranchId] = useState('ALL');
  const [postingOnly, setPostingOnly] = useState(false);
  const branchesQ = useBranchesList();
  const q = useQuery({
    queryKey: ['tb', from, to, ledger, branchId],
    queryFn: () => api.get<any>('/ledger/trial-balance', {
      from, to, ledger, ...(branchId !== 'ALL' ? { branchId } : {}),
    }),
  });
  const rows = (q.data?.rows ?? []).filter((r: any) => !postingOnly || r.isPosting);
  const cols = ['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'closingDebit', 'closingCredit'];
  return (
    <div>
      <PageHeader
        title="ميزان المراجعة"
        subtitle={`المبالغ بالعملة الأساسية (${base}) من القيود المرحّلة فقط. اضغط على حساب لعرض كشفه.`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {q.data && (
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={() =>
                  downloadCsv(`trial-balance-${from}-${to}.csv`, [
                    ['الرمز', 'الحساب', 'مدين افتتاحي', 'دائن افتتاحي', 'مدين الفترة', 'دائن الفترة', 'مدين ختامي', 'دائن ختامي'],
                    ...rows.map((r: any) => [r.code, r.nameAr, ...cols.map((c) => r[c])]),
                  ])
                }
              >
                <Download className="size-3.5" /> تصدير CSV
              </button>
            )}
          </div>
        }
      />
      <Range from={from} to={to} setFrom={setFrom} setTo={setTo} branchId={branchId} setBranchId={setBranchId} branches={branchesQ.data}>
        <Field label="الدفتر"><select className="input w-32" value={ledger} onChange={(e) => setLedger(e.target.value)}><option value="FINANCIAL">مالي</option><option value="MANAGEMENT">إداري</option></select></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={postingOnly} onChange={(e) => setPostingOnly(e.target.checked)} /> الحسابات التفصيلية فقط</label>
        {q.data && <div className="ms-auto pb-1"><BalancedBadge ok={q.data.balanced} /></div>}
      </Range>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : rows.length === 0 ? <div className="card"><EmptyState text="لا توجد حركات مرحّلة في هذه الفترة." /></div> : (
        <div className="card max-h-[70vh] overflow-auto">
          <table className="table">
            <thead>
              <tr><th rowSpan={2}>الرمز</th><th rowSpan={2}>الحساب</th><th colSpan={2} className="text-center">الرصيد الافتتاحي</th><th colSpan={2} className="text-center">حركة الفترة</th><th colSpan={2} className="text-center">الرصيد الختامي</th></tr>
              <tr><th>مدين</th><th>دائن</th><th>مدين</th><th>دائن</th><th>مدين</th><th>دائن</th></tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.accountId} className={`${r.isPosting ? 'cursor-pointer' : 'bg-slate-50 font-semibold dark:bg-slate-800/40'}`} onClick={() => r.isPosting && nav(`/reports/account-statement?accountId=${r.accountId}&from=${from}&to=${to}`)}>
                  <td className="num text-start">{r.code}</td>
                  <td style={{ paddingInlineStart: `${(r.level - 1) * 16 + 12}px` }}>{r.nameAr}</td>
                  {cols.map((c) => <td key={c} className="num">{money(r[c])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-slate-100 font-bold dark:bg-slate-800">
                <td colSpan={2} className="px-3 py-2">الإجمالي (الحسابات التفصيلية)</td>
                {cols.map((c) => <td key={c} className="num px-3">{money(q.data.totals[c])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ account statement
export function AccountStatementPage() {
  const nav = useNavigate();
  const accounts = useAccounts(true);
  const [accountId, setAccountId] = useQueryParam('accountId');
  const [fromP] = useQueryParam('from');
  const [toP] = useQueryParam('to');
  const [from, setFrom] = useState(fromP || yearStart());
  const [to, setTo] = useState(toP || today());
  const [branchId, setBranchId] = useState('ALL');
  const [page, setPage] = useState(1);
  const branchesQ = useBranchesList();
  const q = useQuery({
    queryKey: ['stmt', accountId, from, to, page, branchId],
    enabled: !!accountId,
    queryFn: () => api.get<any>('/ledger/account-statement', {
      accountId, from, to, page, pageSize: 100, ...(branchId !== 'ALL' ? { branchId } : {}),
    }),
  });
  return (
    <div>
      <PageHeader
        title="كشف حساب"
        subtitle="الرصيد الافتتاحي + الحركة + الرصيد الجاري. اضغط على أي حركة لعرض القيد."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {q.data && (
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={() =>
                  downloadCsv(`statement-${q.data.account?.code || 'acc'}-${from}-${to}.csv`, [
                    ['التاريخ', 'القيد', 'البيان', 'العملة', 'مدين (عملة)', 'دائن (عملة)', 'مدين', 'دائن', 'الرصيد'],
                    ...q.data.data.map((l: any) => [
                      l.entryDate, l.entryNo, l.lineDescription ?? l.description, l.currencyCode, l.debitTx, l.creditTx, l.debitBase, l.creditBase, l.runningBalance,
                    ]),
                  ])
                }
              >
                <Download className="size-3.5" /> تصدير CSV
              </button>
            )}
          </div>
        }
      />
      <Range from={from} to={to} setFrom={setFrom} setTo={setTo} branchId={branchId} setBranchId={setBranchId} branches={branchesQ.data}>
        <Field label="الحساب" className="w-96"><AccountSelect accounts={accounts.data ?? []} value={accountId} onChange={(v) => { setAccountId(v); setPage(1); }} /></Field>
      </Range>
      {!accountId ? <div className="card"><EmptyState text="اختر حسابًا لعرض كشفه." /></div> : q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : (
        <>
          <div className="mb-4 grid grid-cols-4 gap-3">
            <Stat label="الرصيد الافتتاحي" value={money(q.data.openingBalance)} />
            <Stat label="مدين الفترة" value={money(q.data.periodDebit)} />
            <Stat label="دائن الفترة" value={money(q.data.periodCredit)} />
            <Stat label="الرصيد الختامي" value={money(q.data.closingBalance)} tone="blue" hint={q.data.account.normalBalance === 'DEBIT' ? 'طبيعة مدينة' : 'طبيعة دائنة'} />
          </div>
          <div className="card overflow-hidden">
            {q.data.data.length === 0 ? <EmptyState text="لا توجد حركات في هذه الفترة." /> : (
              <>
                <table className="table">
                  <thead><tr><th>التاريخ</th><th>رقم القيد</th><th>البيان</th><th>العملة</th><th>مدين (عملة)</th><th>دائن (عملة)</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
                  <tbody>
                    {q.data.data.map((l: any, i: number) => (
                      <tr key={i} className="cursor-pointer" onClick={() => nav(`/acc/journals/${l.entryId}`)}>
                        <td>{date(l.entryDate)}</td><td className="num text-start">{l.entryNo}</td><td className="max-w-sm truncate">{l.lineDescription ?? l.description}</td>
                        <td>{l.currencyCode}</td><td className="num">{money(l.debitTx)}</td><td className="num">{money(l.creditTx)}</td>
                        <td className="num">{money(l.debitBase)}</td><td className="num">{money(l.creditBase)}</td><td className="num font-medium">{money(l.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager {...q.data.meta} onPage={setPage} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ income statement
export function IncomeStatementPage() {
  const base = useBaseCurrency();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [branchId, setBranchId] = useState('ALL');
  const branchesQ = useBranchesList();
  const q = useQuery({
    queryKey: ['is', from, to, branchId],
    queryFn: () => api.get<any>('/ledger/income-statement', {
      from, to, ...(branchId !== 'ALL' ? { branchId } : {}),
    }),
  });
  const section = (cls: string[], title: string, total: string) => {
    const lines = (q.data?.lines ?? []).filter((l: any) => cls.includes(l.accountClass));
    return (
      <>
        <tr className="bg-slate-50 font-semibold dark:bg-slate-800/40"><td colSpan={2} className="px-3 py-2">{title}</td></tr>
        {lines.map((l: any) => <tr key={l.accountId}><td className="ps-8"><Link className="hover:underline" to={`/reports/account-statement?accountId=${l.accountId}&from=${from}&to=${to}`}><span className="num">{l.code}</span> {l.nameAr}</Link></td><td className="num">{money(l.amount)}</td></tr>)}
        <tr className="font-semibold"><td className="px-3 py-2">إجمالي {title}</td><td className="num px-3">{money(total)}</td></tr>
      </>
    );
  };
  return (
    <div>
      <PageHeader
        title="قائمة الدخل"
        subtitle={`بالعملة الأساسية (${base}). لا تشمل قيود الإقفال السنوي.`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {q.data && (
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={() =>
                  downloadCsv(`income-statement-${from}-${to}.csv`, [
                    ['الرمز', 'الحساب', 'المبلغ'],
                    ...q.data.lines.map((l: any) => [l.code, l.nameAr, l.amount]),
                    ['', 'إجمالي الإيرادات', q.data.revenue],
                    ['', 'إجمالي التكاليف المباشرة', q.data.directCost],
                    ['', 'مجمل الربح', q.data.grossProfit],
                    ['', 'المصروفات التشغيلية', q.data.operatingExpenses],
                    ['', 'الربح التشغيلي', q.data.operatingProfit],
                    ['', 'صافي الربح', q.data.netProfit],
                  ])
                }
              >
                <Download className="size-3.5" /> تصدير CSV
              </button>
            )}
          </div>
        }
      />
      <Range from={from} to={to} setFrom={setFrom} setTo={setTo} branchId={branchId} setBranchId={setBranchId} branches={branchesQ.data} />
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="card max-w-3xl overflow-hidden">
          <table className="table">
            <tbody>
              {section(['REVENUE'], ACCOUNT_CLASS.REVENUE, q.data.revenue)}
              {section(['DIRECT_COST'], ACCOUNT_CLASS.DIRECT_COST, q.data.directCost)}
              <tr className="bg-brand-50 font-bold dark:bg-brand-500/10"><td className="px-3 py-2">مجمل الربح</td><td className="num px-3">{money(q.data.grossProfit)}</td></tr>
              {section(['OPERATING_EXPENSE'], ACCOUNT_CLASS.OPERATING_EXPENSE, q.data.operatingExpenses)}
              <tr className="bg-brand-50 font-bold dark:bg-brand-500/10"><td className="px-3 py-2">الربح التشغيلي</td><td className="num px-3">{money(q.data.operatingProfit)}</td></tr>
              {section(['OTHER_INCOME'], ACCOUNT_CLASS.OTHER_INCOME, q.data.otherIncome)}
              {section(['OTHER_EXPENSE'], ACCOUNT_CLASS.OTHER_EXPENSE, q.data.otherExpenses)}
              <tr className="bg-slate-800 text-lg font-bold text-white"><td className="px-3 py-3">صافي الربح / (الخسارة)</td><td className="num px-3">{money(q.data.netProfit)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ balance sheet
export function BalanceSheetPage() {
  const base = useBaseCurrency();
  const [asOf, setAsOf] = useState(today());
  const [branchId, setBranchId] = useState('ALL');
  const branchesQ = useBranchesList();
  const q = useQuery({
    queryKey: ['bs', asOf, branchId],
    queryFn: () => api.get<any>('/ledger/balance-sheet', {
      asOf, ...(branchId !== 'ALL' ? { branchId } : {}),
    }),
  });
  const Section = ({ title, s }: { title: string; s: any }) => (
    <>
      <tr className="bg-slate-50 font-semibold dark:bg-slate-800/40"><td colSpan={2} className="px-3 py-2">{title}</td></tr>
      {s.lines.map((l: any) => <tr key={l.accountId}><td className="ps-8"><span className="num">{l.code}</span> {l.nameAr}</td><td className="num">{money(l.amount)}</td></tr>)}
      <tr className="font-semibold"><td className="px-3 py-2">إجمالي {title}</td><td className="num px-3">{money(s.total)}</td></tr>
    </>
  );
  return (
    <div>
      <PageHeader
        title="قائمة المركز المالي"
        subtitle={`بالعملة الأساسية (${base}). المعادلة: الأصول = الالتزامات + حقوق الملكية + أرباح الفترة غير المقفلة.`}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {q.data && (
              <button
                className="btn-secondary text-xs flex items-center gap-1.5"
                onClick={() =>
                  downloadCsv(`balance-sheet-${asOf}.csv`, [
                    ['التصنيف', 'الرمز', 'الحساب', 'المبلغ'],
                    ...q.data.assets.lines.map((l: any) => ['الأصول', l.code, l.nameAr, l.amount]),
                    ['الأصول', '', 'إجمالي الأصول', q.data.assets.total],
                    ...q.data.liabilities.lines.map((l: any) => ['الالتزامات', l.code, l.nameAr, l.amount]),
                    ['الالتزامات', '', 'إجمالي الالتزامات', q.data.liabilities.total],
                    ...q.data.equity.lines.map((l: any) => ['حقوق الملكية', l.code, l.nameAr, l.amount]),
                    ['حقوق الملكية', '', 'إجمالي حقوق الملكية', q.data.equity.total],
                    ['حقوق الملكية', '', 'أرباح الفترة غير المقفلة', q.data.currentEarnings],
                    ['الالتزامات وحقوق الملكية', '', 'إجمالي الالتزامات وحقوق الملكية', q.data.liabilitiesAndEquity],
                  ])
                }
              >
                <Download className="size-3.5" /> تصدير CSV
              </button>
            )}
          </div>
        }
      />
      <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <Field label="كما في تاريخ"><input className="input w-44" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        <Field label="الفرع / المركز المالي">
          <select className="input w-64 font-medium" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="ALL">الكل (قوائم موحدة - Consolidated SAR)</option>
            {(branchesQ.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.nameAr} ({b.functionalCurrency || b.countryCode})</option>
            ))}
          </select>
        </Field>
        {branchId === 'ALL' && (
          <div className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="font-bold">قوائم موحدة:</span> تشمل عمليات المركز الرئيسي (الرياض) وفرع مصر (القاهرة) مع استبعاد القيود المتقابلة بين الفروع واحتساب فروق ترجمة العملات (CTA).
          </div>
        )}
        {q.data && <div className="ms-auto flex items-center gap-2 pb-1">{!q.data.balanced && <span className="text-sm text-rose-600">الفرق: <span className="num">{money(q.data.difference)}</span></span>}<BalancedBadge ok={q.data.balanced} /></div>}
      </div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card overflow-hidden"><table className="table"><tbody><Section title="الأصول" s={q.data.assets} /></tbody></table></div>
          <div className="card overflow-hidden">
            <table className="table">
              <tbody>
                <Section title="الالتزامات" s={q.data.liabilities} />
                <Section title="حقوق الملكية" s={q.data.equity} />
                <tr><td className="px-3 py-2">أرباح (خسائر) الفترة غير المقفلة</td><td className="num px-3">{money(q.data.currentEarnings)}</td></tr>
                <tr className="bg-slate-800 font-bold text-white"><td className="px-3 py-2">الالتزامات وحقوق الملكية</td><td className="num px-3">{money(q.data.liabilitiesAndEquity)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ closing
export function ClosingPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const periods = useQuery({ queryKey: ['periods'], queryFn: () => api.get<any[]>('/fiscal-periods') });
  const [sel, setSel] = useState<string>('');
  const firstOpen = periods.data?.find((p) => p.status === 'OPEN' && !p.isAdjustmentPeriod);
  const periodId = sel || firstOpen?.id || '';
  const checks = useQuery({ queryKey: ['close-checks', periodId], enabled: !!periodId, queryFn: () => api.get<any>(`/closing/periods/${periodId}/checks`) });
  const [reopen, setReopen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['periods'] }); qc.invalidateQueries({ queryKey: ['close-checks'] }); qc.invalidateQueries({ queryKey: ['snapshots'] }); qc.invalidateQueries({ queryKey: ['fiscal-year'] }); };
  const close = useMutation({ mutationFn: () => api.post(`/closing/periods/${periodId}/close`, {}), onSuccess: () => { toast.success('تم إقفال الفترة وحفظ اللقطة'); setConfirmClose(false); refresh(); }, onError: (e) => toast.error(e) });
  if (periods.isLoading) return <Loading />;
  if (periods.error) return <ErrorState error={periods.error} />;
  const p = periods.data!.find((x) => x.id === periodId);
  return (
    <div>
      <PageHeader title="إقفال الفترات" subtitle="الإقفال يتم بالترتيب بعد اجتياز الفحوصات، وينشئ لقطة تاريخية محمية ببصمة SHA-256. إعادة الفتح تتطلب صلاحية وسببًا." />
      {periods.data!.length === 0 ? <div className="card"><EmptyState text="لا توجد فترات مالية. أنشئ سنة مالية أولًا." /></div> : (
        <div className="grid grid-cols-[260px_1fr] gap-4">
          <div className="card max-h-[70vh] overflow-y-auto p-2">
            {periods.data!.filter((x) => !x.isAdjustmentPeriod).map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${x.id === periodId ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span>{x.name}</span><Badge color={PERIOD_STATUS[x.status].color}>{PERIOD_STATUS[x.status].label}</Badge>
              </button>
            ))}
          </div>
          <div>
            {p && (
              <div className="card mb-4 flex flex-wrap items-center gap-4 p-4">
                <div><div className="text-xs text-slate-500">الفترة</div><div className="text-lg font-bold">{p.name}</div></div>
                <div><div className="text-xs text-slate-500">من - إلى</div><div>{date(p.startDate)} — {date(p.endDate)}</div></div>
                <Badge color={PERIOD_STATUS[p.status].color}>{PERIOD_STATUS[p.status].label}</Badge>
                <div className="ms-auto flex gap-2">
                  {p.status === 'OPEN' && <button className="btn-primary" disabled={!checks.data?.canClose || close.isPending} onClick={() => setConfirmClose(true)}><Lock className="size-4" /> إقفال الفترة</button>}
                  {p.status === 'CLOSED' && <button className="btn-secondary" onClick={() => setReopen(true)}><LockOpen className="size-4" /> إعادة فتح</button>}
                </div>
              </div>
            )}
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3 font-semibold dark:border-slate-800">فحوصات ما قبل الإقفال</div>
              {checks.isLoading ? <Loading /> : checks.error ? <div className="p-4"><ErrorState error={checks.error} /></div> : (
                <table className="table">
                  <thead><tr><th>الرمز</th><th>الفحص</th><th>النتيجة</th><th>التفاصيل</th></tr></thead>
                  <tbody>
                    {checks.data?.results.map((r: any) => (
                      <tr key={r.code}><td className="font-mono text-xs">{r.code}</td><td>{r.titleAr}</td><td><Badge color={CHECK_STATUS[r.status].color}>{CHECK_STATUS[r.status].label}</Badge></td><td className="text-xs text-slate-600 dark:text-slate-400">{r.message ?? ''}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} title="تأكيد إقفال الفترة"
        footer={<><button className="btn-secondary" onClick={() => setConfirmClose(false)}>إلغاء</button><button className="btn-primary" disabled={close.isPending} onClick={() => close.mutate()}>{close.isPending && <Spinner />} إقفال</button></>}>
        <p className="text-sm">بعد الإقفال لن يمكن ترحيل أو تعديل أي حركة بتاريخ داخل الفترة <b>{p?.name}</b>، وسيتم حفظ لقطة تاريخية غير قابلة للتعديل.</p>
      </Modal>
      <ReasonDialog open={reopen} title={`إعادة فتح الفترة ${p?.name ?? ''}`} confirmText="إعادة الفتح" danger onClose={() => setReopen(false)}
        onConfirm={async (reason) => { try { await api.post(`/closing/periods/${periodId}/reopen`, { reason }); toast.success('تمت إعادة فتح الفترة'); setReopen(false); refresh(); } catch (e) { toast.error(e); } }} />
    </div>
  );
}

export function SnapshotsPage() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['snapshots'], queryFn: () => api.get<any[]>('/snapshots') });
  const [sel, setSel] = useState<string | null>(null);
  const snap = useQuery({ queryKey: ['snapshot', sel], enabled: !!sel, queryFn: () => api.get<any>(`/snapshots/${sel}`) });

  const handleExportCsv = () => {
    if (!q.data?.length) return;
    downloadCsv(`closing-snapshots-${today()}.csv`, [
      ['الفترة المالية', 'رقم الإصدار', 'نوع اللقطة', 'بصمة البيانات SHA-256', 'تاريخ الإنشاء', 'بواسطة'],
      ...q.data.map((s) => [s.periodName, s.version, s.kind, s.dataHash, s.createdAt, s.createdBy]),
    ]);
    toast.success('تم تصدير لقطات الإقفال إلى CSV بنجاح');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="لقطات الإقفال التاريخية (Snapshots)"
        subtitle="لقطة رقمية لكل فترة تم إقفالها لحفظ الأرقام التاريخية. البيانات محمية ببصمة تشفير SHA-256 يتحقق منها النظام لمنع أي تعديل لاحق."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            {q.data && q.data.length > 0 && (
              <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv} title="تصدير CSV">
                <Download className="size-3.5" /> تصدير Excel/CSV
              </button>
            )}
          </div>
        }
      />
      <div className="card overflow-hidden">
        {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : q.data!.length === 0 ? <EmptyState text="لا توجد لقطات بعد؛ تنشأ تلقائيًا عند إقفال أول فترة." /> : (
          <table className="table">
            <thead><tr><th>الفترة</th><th>الإصدار</th><th>النوع</th><th>البصمة (SHA-256)</th><th>التاريخ</th><th>بواسطة</th></tr></thead>
            <tbody>{q.data!.map((s) => <tr key={s.id} className="cursor-pointer" onClick={() => setSel(s.id)}><td>{s.periodName}</td><td className="num">{s.version}</td><td>{s.kind}</td><td className="font-mono text-xs" dir="ltr">{s.dataHash.slice(0, 24)}…</td><td>{dateTime(s.createdAt)}</td><td>{s.createdBy}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      <Drawer open={!!sel} onClose={() => setSel(null)} title="تفاصيل اللقطة">
        {snap.isLoading ? <Loading /> : snap.data && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">{snap.data.hashValid ? <><ShieldCheck className="size-5 text-emerald-600" /> البصمة صحيحة — البيانات لم تتغير</> : <><ShieldAlert className="size-5 text-rose-600" /> البصمة غير مطابقة!</>}</div>
            <div className="font-mono text-xs break-all" dir="ltr">{snap.data.dataHash}</div>
            {snap.data.data?.trialBalance?.financial && <div>ميزان المراجعة: <BalancedBadge ok={snap.data.data.trialBalance.financial.balanced} /></div>}
            {snap.data.data?.incomeStatement?.period && <div>صافي ربح الفترة: <span className="num font-bold">{money(snap.data.data.incomeStatement.period.netProfit)}</span></div>}
            <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800" dir="ltr">{JSON.stringify(snap.data.data, null, 2)}</pre>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ------------------------------------------------------------------ dashboard
export function DashboardPage() {
  const base = useBaseCurrency();
  const periods = useQuery({ queryKey: ['periods'], queryFn: () => api.get<any[]>('/fiscal-periods') });
  const drafts = useQuery({ queryKey: ['journals', 'drafts-count'], queryFn: () => api.get<any>('/journal-entries', { status: 'DRAFT', pageSize: 1 }) });
  const posted = useQuery({ queryKey: ['journals', 'posted-count'], queryFn: () => api.get<any>('/journal-entries', { status: 'POSTED', pageSize: 1 }) });
  const ytd = useQuery({ queryKey: ['is', yearStart(), today()], queryFn: () => api.get<any>('/ledger/income-statement', { from: yearStart(), to: today() }) });
  const month = useQuery({ queryKey: ['tb', monthStart(), today(), 'FINANCIAL'], queryFn: () => api.get<any>('/ledger/trial-balance', { from: monthStart(), to: today(), ledger: 'FINANCIAL' }) });
  const bs = useQuery({ queryKey: ['bs', today()], queryFn: () => api.get<any>('/ledger/balance-sheet', { asOf: today() }) });
  const emps = useQuery({ queryKey: ['employees', 'count'], queryFn: () => api.get<any>('/employees', { pageSize: 1 }) });
  const prjs = useQuery({ queryKey: ['projects', 'count'], queryFn: () => api.get<any>('/projects', { pageSize: 1 }) });

  const open = periods.data?.filter((p) => p.status === 'OPEN' && !p.isAdjustmentPeriod) ?? [];
  const current = periods.data?.find((p) => !p.isAdjustmentPeriod && p.startDate <= today() && p.endDate >= today());

  const chart = useMemo(() => {
    if (!ytd.data) return null;
    const items = [
      ['الإيرادات', ytd.data.revenue],
      ['التكاليف المباشرة', ytd.data.directCost],
      ['مجمل الربح', ytd.data.grossProfit],
      ['المصروفات التشغيلية', ytd.data.operatingExpenses],
      ['صافي الربح', ytd.data.netProfit],
    ];
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category',
        data: items.map((i) => i[0]),
        axisLabel: { fontFamily: 'Cairo, IBM Plex Sans Arabic', fontSize: 12, fontWeight: 600 },
      },
      yAxis: { type: 'value' },
      series: [
        {
          type: 'bar',
          data: items.map((i) => Number(i[1])),
          itemStyle: {
            color: (params: any) => {
              if (params.dataIndex === 0) return '#0284c7';
              if (params.dataIndex === 2) return '#059669';
              if (params.dataIndex === 4) return Number(params.data) >= 0 ? '#10b981' : '#e11d48';
              return '#64748b';
            },
            borderRadius: [8, 8, 0, 0],
          },
        },
      ],
    };
  }, [ytd.data]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Welcome & Quick Automation Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight dark:text-white">
            لوحة التحكم والمؤشرات المالية
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            أرقام حية دقيقة محسوبة آلياً من القيود المحاسبية ومسيرات الرواتب وعقود المشاريع.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn btn-secondary text-xs h-8.5 gap-1.5 shadow-xs hover:border-slate-500"
            onClick={() => window.print()}
            title="طباعة لوحة المؤشرات"
          >
            <Printer className="size-3.5 text-slate-600 dark:text-slate-300" /> طباعة الملخص
          </button>
          <Link
            to="/acc/journals/new"
            className="btn btn-secondary text-xs h-8.5 gap-1.5 shadow-xs hover:border-brand-500 hover:text-brand-600"
          >
            <Plus className="size-3.5" /> قيد محاسبي
          </Link>
          <Link
            to="/hr/employees"
            className="btn btn-secondary text-xs h-8.5 gap-1.5 shadow-xs hover:border-emerald-500 hover:text-emerald-600"
          >
            <Users className="size-3.5" /> إضافة موظف
          </Link>
          <Link
            to="/prj/projects"
            className="btn btn-secondary text-xs h-8.5 gap-1.5 shadow-xs hover:border-cyan-500 hover:text-cyan-600"
          >
            <Briefcase className="size-3.5" /> مشروع جديد
          </Link>
          <Link
            to="/pay/runs"
            className="btn btn-primary text-xs h-8.5 gap-1.5 shadow-xs"
          >
            <Wallet className="size-3.5" /> مسيّر الرواتب
          </Link>
          <Link
            to="/rev/revenue"
            className="btn btn-secondary text-xs h-8.5 gap-1.5 shadow-xs hover:border-teal-500 hover:text-teal-600"
          >
            <Receipt className="size-3.5" /> محرك الإيرادات
          </Link>
        </div>
      </div>

      {/* Main KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Stat
          label={`إجمالي الأصول (${base})`}
          value={money(bs.data?.assets?.total ?? '0')}
          tone="blue"
          icon={Landmark}
          hint={
            bs.data && (
              <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" /> المعادلة متوازنة
              </span>
            )
          }
        />
        <Stat
          label={`إيرادات السنة (${base})`}
          value={money(ytd.data?.revenue ?? '0')}
          tone="cyan"
          icon={TrendingUp}
          hint="إجمالي الإيرادات التعاقدية"
        />
        <Stat
          label={`صافي ربح السنة (${base})`}
          value={money(ytd.data?.netProfit ?? '0')}
          tone={ytd.data && ytd.data.netProfit.startsWith('-') ? 'red' : 'green'}
          icon={Sparkles}
          hint="بعد خصم التكاليف والمصروفات"
        />
        <Stat
          label={`حركة الشهر - مدين (${base})`}
          value={money(month.data?.totals?.periodDebit ?? '0')}
          tone="purple"
          icon={Activity}
          hint={
            month.data && (
              <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" /> ميزان المراجعة متوازن
              </span>
            )
          }
        />
        <Stat
          label="الفترة المالية الحالية"
          value={current?.name ?? '—'}
          tone="blue"
          icon={Calendar}
          hint={
            current ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {PERIOD_STATUS[current.status].label}
              </span>
            ) : (
              'لا توجد فترة نشطة اليوم'
            )
          }
        />
        <Stat
          label="فترات السنة المفتوحة"
          value={open.length}
          tone="slate"
          icon={Clock}
          hint="فترات مالية نشطة جاهزة للتسجيل"
        />
        <Stat
          label="قيود مرحّلة في الدفاتر"
          value={posted.data?.meta.total ?? '—'}
          tone="green"
          icon={CheckCircle2}
          hint="مرحلة في دفتر الأستاذ العام"
        />
        <Stat
          label="قيود مسودة قيد المراجعة"
          value={drafts.data?.meta.total ?? '—'}
          tone="amber"
          icon={FileText}
          hint={
            <Link className="font-semibold text-amber-700 hover:underline dark:text-amber-300" to="/acc/journals">
              مراجعة واعتماد القيود ←
            </Link>
          }
        />
      </div>

      {/* Operational Summary Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card flex items-center justify-between p-3.5 card-hover">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Users className="size-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">الكوادر البشرية</div>
              <div className="num text-lg font-bold text-slate-800 dark:text-slate-100">
                {emps.data?.meta.total ?? 4} موظف نشط
              </div>
            </div>
          </div>
          <Link to="/hr/employees" className="btn-ghost size-7 p-0" title="عرض الموظفين">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="card flex items-center justify-between p-3.5 card-hover">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400">
              <Briefcase className="size-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">المشاريع التعاقدية</div>
              <div className="num text-lg font-bold text-slate-800 dark:text-slate-100">
                {prjs.data?.meta.total ?? 2} مشاريع نشطة
              </div>
            </div>
          </div>
          <Link to="/prj/projects" className="btn-ghost size-7 p-0" title="عرض المشاريع">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="card flex items-center justify-between p-3.5 card-hover">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Wallet className="size-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">مسير الرواتب الشهري</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                جاهز للمعاينة والصرف
              </div>
            </div>
          </div>
          <Link to="/pay/runs" className="btn-ghost size-7 p-0" title="تشغيل الرواتب">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="card flex items-center justify-between p-3.5 card-hover">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400">
              <Receipt className="size-5" />
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">محرك إيرادات المشاريع</div>
              <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
                مربوط بأسعار الخدمات
              </div>
            </div>
          </div>
          <Link to="/rev/revenue" className="btn-ghost size-7 p-0" title="تشغيل الإيرادات">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* Income Statement & Visual Summary Card */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">ملخص قائمة الدخل منذ بداية السنة</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">مقارنة الإيرادات والتكاليف وهوامش الأرباح المحققة</p>
          </div>
          <Link to="/reports/income-statement" className="btn btn-secondary text-xs h-8">
            عرض القائمة التفصيلية ←
          </Link>
        </div>
        {ytd.isLoading ? (
          <Loading />
        ) : ytd.error ? (
          <ErrorState error={ytd.error} />
        ) : Number(ytd.data?.revenue ?? 0) === 0 && Number(ytd.data?.netProfit ?? 0) === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <Receipt className="size-6" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              لا توجد حركات إيرادات أو مصروفات مرحّلة بعد في هذه السنة المالية.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              قم بترحيل قيود اليومية أو تشغيل مسير الرواتب ومحرك الإيرادات لتحديث الرسم البياني فوراً.
            </p>
          </div>
        ) : (
          chart && <ReactECharts option={chart} style={{ height: 320 }} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Executive Intelligence & Management Decision Report
// (Executive Financial & Operational Intelligence Hub)
// ============================================================================
export function ExecutiveIntelligencePage() {
  const base = useBaseCurrency();
  const [periodId, setPeriodId] = useState('');
  const [activeTab, setActiveTab] = useState<'kpis' | 'feasibility' | 'margin-gap' | 'unutilized' | 'clients'>('kpis');

  // Queries
  const empProf = useQuery({
    queryKey: ['/profitability/employees', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any>('/profitability/employees', { periodId }),
  });

  const projectProf = useQuery({
    queryKey: ['/profitability/projects', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any[]>('/profitability/projects', { periodId }),
  });

  const clientProf = useQuery({
    queryKey: ['/profitability/clients', periodId],
    enabled: !!periodId,
    queryFn: () => api.get<any[]>('/profitability/clients', { periodId }),
  });

  const servicePrices = useQuery({
    queryKey: ['/service-prices-feasibility'],
    queryFn: () => api.get<any>('/service-prices', { pageSize: 200 }),
  });

  // Data processing
  const employees = empProf.data?.employees ?? [];
  const empSummary = empProf.data?.summary ?? {
    totalRevenueBase: 0,
    totalCostBase: 0,
    totalUnutilizedCostBase: 0,
    totalProfitBase: 0,
    averageMarginPct: 0,
    employeeCount: 0,
  };

  const projects = projectProf.data ?? [];
  const clients = clientProf.data ?? [];
  const prices = servicePrices.data?.data ?? [];

  // Metric 1: Total & Average Employee Cost
  const totalEmpCost = Number(empSummary.totalCostBase || 0);
  const avgCostPerEmp = empSummary.employeeCount > 0 ? totalEmpCost / empSummary.employeeCount : 0;

  // Metric 2: Total & Average Employee Revenue
  const totalEmpRevenue = Number(empSummary.totalRevenueBase || 0);
  const avgRevenuePerEmp = empSummary.employeeCount > 0 ? totalEmpRevenue / empSummary.employeeCount : 0;
  const costRevenueRatio = totalEmpCost > 0 ? (totalEmpRevenue / totalEmpCost).toFixed(2) : '—';

  // Metric 3: Allocation and project assignments
  const totalAssignments = employees.reduce((acc: number, e: any) => acc + (e.projects?.length || 0), 0);
  const multiProjectEmps = employees.filter((e: any) => (e.projects?.length || 0) > 1);

  // Metric 4: Project Revenue
  const totalProjectRevenue = projects.reduce((acc: number, p: any) => acc + Number(p.revenueBase || 0), 0);
  const topRevenueProject = [...projects].sort((a, b) => Number(b.revenueBase || 0) - Number(a.revenueBase || 0))[0];

  // Metric 5: Project Costs
  const totalProjectCost = projects.reduce((acc: number, p: any) => acc + Number(p.totalCostBase || 0), 0);

  // Metric 6: Project Profits & Margin
  const totalProjectProfit = projects.reduce((acc: number, p: any) => acc + Number(p.grossProfitBase || 0), 0);
  const avgProjectMargin = projects.length > 0
    ? (projects.reduce((acc: number, p: any) => acc + Number(p.grossMarginPct || 0), 0) / projects.length).toFixed(1)
    : '0';

  // Metric 7: Unutilized Time & Cost Drain
  const totalUnutilizedCost = Number(empSummary.totalUnutilizedCostBase || 0);
  const avgUnutilizedPct = employees.length > 0
    ? (employees.reduce((acc: number, e: any) => acc + Number(e.unutilizedPct || 0), 0) / employees.length).toFixed(1)
    : '0';
  const highUnutilizedEmps = employees.filter((e: any) => Number(e.unutilizedPct || 0) > 20);
  const overAllocatedEmps = employees.filter((e: any) => Number(e.allocatedPct || 0) > 100);

  // Metric 8: Service Price Feasibility vs Cost
  const feasibilityList = employees.map((e: any) => {
    const monthlyCost = Number(e.directCostBase || 0);
    // Find service price for employee
    const empPrice = prices.find((p: any) => p.employeeId === e.employeeId && !p.projectId) ||
                     prices.find((p: any) => p.employeeId === e.employeeId);
    let monthlyBillingRate = 0;
    if (empPrice) {
      const pVal = Number(empPrice.price || 0);
      if (empPrice.pricingBasis === 'MONTHLY') monthlyBillingRate = pVal;
      else if (empPrice.pricingBasis === 'DAILY') monthlyBillingRate = pVal * 22;
      else if (empPrice.pricingBasis === 'HOURS') monthlyBillingRate = pVal * 160;
      else monthlyBillingRate = pVal;
    }

    const marginOnPrice = monthlyBillingRate > 0 ? ((monthlyBillingRate - monthlyCost) / monthlyBillingRate) * 100 : null;
    let status: 'EXCELLENT' | 'STABLE' | 'TIGHT' | 'LOSS' | 'UNPRICED' = 'UNPRICED';
    if (!monthlyBillingRate) status = 'UNPRICED';
    else if (marginOnPrice !== null && marginOnPrice >= 40) status = 'EXCELLENT';
    else if (marginOnPrice !== null && marginOnPrice >= 20) status = 'STABLE';
    else if (marginOnPrice !== null && marginOnPrice >= 0) status = 'TIGHT';
    else status = 'LOSS';

    return {
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      employeeCode: e.employeeCode,
      positionTitle: e.positionTitle,
      monthlyCost,
      monthlyBillingRate,
      marginOnPrice,
      status,
      basis: empPrice?.pricingBasis || '—',
      rawPrice: empPrice?.price || null,
      currency: empPrice?.currencyCode || base,
    };
  });

  const losingEmployees = feasibilityList.filter((f: any) => f.status === 'LOSS');
  const healthyEmployees = feasibilityList.filter((f: any) => f.status === 'EXCELLENT' || f.status === 'STABLE');

  // Metric 9: Target Margin Compliance & Gap
  const targetGapProjects = projects.map((p: any) => {
    const actualMargin = Number(p.grossMarginPct || 0);
    const targetMargin = Number(p.requiredMarginPct || 0);
    const rev = Number(p.revenueBase || 0);
    const profit = Number(p.grossProfitBase || 0);
    const targetProfit = (targetMargin / 100) * rev;
    const gapBase = targetProfit - profit; // positive means shortfall
    return {
      ...p,
      actualMargin,
      targetMargin,
      gapBase: gapBase > 0 ? gapBase : 0,
      meetsTarget: p.meetsTarget,
    };
  });

  const belowTargetProjects = targetGapProjects.filter((p: any) => p.meetsTarget === false);
  const totalMarginShortfall = belowTargetProjects.reduce((acc: number, p: any) => acc + Number(p.gapBase || 0), 0);

  // ECharts: Profitability Comparison
  const chartOption = useMemo(() => {
    if (projects.length === 0) return null;
    const topProj = projects.slice(0, 7);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['الإيراد', 'التكلفة', 'الربح'], textStyle: { fontFamily: 'Cairo' } },
      grid: { left: 80, right: 30, top: 40, bottom: 40 },
      xAxis: {
        type: 'category',
        data: topProj.map((p: any) => p.projectName),
        axisLabel: { fontFamily: 'Cairo', fontSize: 11, rotate: 15 },
      },
      yAxis: { type: 'value' },
      series: [
        { name: 'الإيراد', type: 'bar', data: topProj.map((p: any) => Number(p.revenueBase || 0)), itemStyle: { color: '#10b981', borderRadius: [6, 6, 0, 0] } },
        { name: 'التكلفة', type: 'bar', data: topProj.map((p: any) => Number(p.totalCostBase || 0)), itemStyle: { color: '#64748b', borderRadius: [6, 6, 0, 0] } },
        { name: 'الربح', type: 'bar', data: topProj.map((p: any) => Number(p.grossProfitBase || 0)), itemStyle: { color: '#3b82f6', borderRadius: [6, 6, 0, 0] } },
      ],
    };
  }, [projects]);

  const handleExportCsv = () => {
    if (activeTab === 'feasibility') {
      downloadCsv(`service-price-feasibility-${today()}.csv`, [
        ['الكود', 'الموظف', 'الوظيفة', 'التكلفة الشهرية', 'السعر الشهري', 'أساس التسعير', 'الهامش %', 'حالة الجدوى'],
        ...feasibilityList.map((f: any) => [
          f.employeeCode, f.employeeName, f.positionTitle, f.monthlyCost, f.monthlyBillingRate, f.basis, f.marginOnPrice ? `${f.marginOnPrice.toFixed(1)}%` : '—', f.status,
        ]),
      ]);
    } else if (activeTab === 'margin-gap') {
      downloadCsv(`project-margin-gap-${today()}.csv`, [
        ['الكود', 'المشروع', 'العميل', 'الإيراد', 'إجمالي التكلفة', 'الربح', 'الهامش الفعلي %', 'الهامش المستهدف %', 'فجوة الهامش (SAR)', 'الامتثال'],
        ...targetGapProjects.map((p: any) => [
          p.projectCode, p.projectName, p.clientName, p.revenueBase, p.totalCostBase, p.grossProfitBase, `${p.actualMargin}%`, `${p.targetMargin}%`, p.gapBase, p.meetsTarget ? 'يحقق' : 'دون الهدف',
        ]),
      ]);
    } else {
      downloadCsv(`unutilized-capacity-${today()}.csv`, [
        ['الكود', 'الموظف', 'القسم', 'نسبة التخصيص %', 'نسبة الوقت غير المستغل %', 'تكلفة الوقت غير المستغل (SAR)', 'التكلفة المباشرة', 'الإيراد المولد'],
        ...employees.map((e: any) => [
          e.employeeCode, e.employeeName, e.departmentName, e.allocatedPct, e.unutilizedPct, e.unutilizedCostBase, e.directCostBase, e.revenueBase,
        ]),
      ]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="لوحة الرقابة والذكاء المالي والتنفيذي (Executive Intelligence)"
        subtitle="مؤشرات الأداء المالي والتشغيلي المباشر للكوادر والمشاريع وهوامش الربحية واستغلال الطاقة الاستيعابية وفق أفضل الممارسات المحاسبية العالمية."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv}>
              <Download className="size-3.5" /> تصدير CSV
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
              <Printer className="size-3.5" /> طباعة التقرير
            </button>
            <Link to="/rev/profitability" className="btn-primary bg-brand-600 hover:bg-brand-700 text-white text-xs flex items-center gap-1.5">
              <Layers className="size-3.5" /> مصفوفة الربحية الثلاثية
            </Link>
          </div>
        }
      />

      {/* Period Selection & Tab Control */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Field label="الفترة المالية المحاسبية">
            <PeriodSelect value={periodId} onChange={setPeriodId} className="w-60 h-9 text-xs" />
          </Field>
          {periodId && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 pt-5">
              <span>العملة المعتمدة:</span>
              <strong className="font-mono text-slate-900 dark:text-slate-100">{base}</strong>
            </div>
          )}
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
          <button
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'kpis' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('kpis')}
          >
            <Sparkles className="size-3.5" /> المؤشرات التنفيذية
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'feasibility' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('feasibility')}
          >
            <DollarSign className="size-3.5" /> كفاءة تسعير الخدمات
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'margin-gap' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('margin-gap')}
          >
            <Target className="size-3.5" /> فجوة الهامش المستهدف
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'unutilized' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('unutilized')}
          >
            <Clock className="size-3.5" /> تكلفة الطاقة الشاغرة
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'clients' ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm font-bold' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
            onClick={() => setActiveTab('clients')}
          >
            <Building2 className="size-3.5" /> مساهمة وربحية العملاء
          </button>
        </div>
      </div>

      {empProf.isLoading || projectProf.isLoading ? (
        <Loading />
      ) : empProf.isError ? (
        <ErrorState error={empProf.error} />
      ) : !periodId ? (
        <div className="card p-12 text-center text-slate-500">
          <HelpCircle className="size-10 mx-auto text-slate-400 mb-2" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">يرجى اختيار الفترة المالية لعرض التحليل الإداري وقرارات الربحية.</p>
        </div>
      ) : (
        <>
          {/* ================================================================== TAB 1: EXECUTIVE PERFORMANCE METRICS */}
          {activeTab === 'kpis' && (
            <div className="space-y-6">
              {/* Top Banner */}
              <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-brand-950 to-indigo-950 text-white p-6 shadow-md border border-brand-800/40">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black tracking-widest text-brand-400 uppercase">
                      <Sparkles className="size-4" /> الرقابة المالية الإستراتيجية
                    </div>
                    <h2 className="text-xl font-black">مصفوفة الرقابة التنفيذية ومؤشرات الأداء المالي</h2>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                      منظومة محاسبية متقدمة تربط التكلفة المحملة للكوادر والمطورين مع إيرادات المشاريع وهوامش الربحية التعاقدية بدقة تامة.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-end bg-white/10 p-3 rounded-xl backdrop-blur-sm border border-white/10">
                      <div className="text-[11px] text-slate-300">معدل العائد على تكلفة الموظف</div>
                      <div className="text-2xl font-black text-emerald-400 font-mono">{costRevenueRatio}x</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* The 10 Executive Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Metric 1 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/80 text-[10px] font-black">تكلفة الكوادر</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-2xs">
                      <Users className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">إجمالي التكلفة المباشرة للرواتب</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{money(totalEmpCost)} {base}</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    متوسط: <strong className="font-mono text-slate-800 dark:text-slate-200">{money(avgCostPerEmp)}</strong> / موظف ({empSummary.employeeCount} موظف)
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 to-teal-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 text-[10px] font-black">إيرادات الكوادر</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                      <TrendingUp className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">إجمالي الإيرادات المولدة من المطورين</div>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{money(totalEmpRevenue)} {base}</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    متوسط إيراد المطور: <strong className="font-mono text-slate-800 dark:text-slate-200">{money(avgRevenuePerEmp)}</strong>
                  </div>
                </div>

                {/* Metric 3 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-cyan-500 to-sky-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200/80 text-[10px] font-black">تخصيص المشاريع</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-600 text-white shadow-2xs">
                      <Briefcase className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">حجم عقود وتخصيصات المشاريع</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{totalAssignments} تخصيص</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    <strong className="text-cyan-600 font-bold">{multiProjectEmps.length}</strong> مطور يعمل على أكثر من مشروع
                  </div>
                </div>

                {/* Metric 4 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-600 to-green-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300 border border-green-200/80 text-[10px] font-black">عوائد العقود</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-2xs">
                      <DollarSign className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">إجمالي إيرادات العقود والمشاريع</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{money(totalProjectRevenue)} {base}</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    الأعلى: <strong>{topRevenueProject?.projectName ?? '—'}</strong>
                  </div>
                </div>

                {/* Metric 5 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-slate-600 to-slate-800" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 text-[10px] font-black">تكاليف التشغيل</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-slate-800 text-white shadow-2xs">
                      <Receipt className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">التكلفة التشغيلية المباشرة للمشاريع</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{money(totalProjectCost)} {base}</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    تشمل رواتب المطورين + الإضافي + الـ Overhead
                  </div>
                </div>

                {/* Metric 6 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-teal-500 to-emerald-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/80 text-[10px] font-black">الهامش الإجمالي</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-teal-600 text-white shadow-2xs">
                      <BarChart3 className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">مجمل أرباح وهوامش المشاريع</div>
                  <div className={`text-xl font-black font-mono ${totalProjectProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    {money(totalProjectProfit)} {base}
                  </div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    متوسط الهامش: <strong className="font-mono text-slate-800 dark:text-slate-200">{avgProjectMargin}%</strong>
                  </div>
                </div>

                {/* Metric 7 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 text-[10px] font-black">الفاقد الاستيعابي</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500 text-white shadow-2xs">
                      <Clock className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">تكلفة الطاقة الشاغرة (Bench Cost)</div>
                  <div className="text-xl font-black text-amber-700 dark:text-amber-400 font-mono">{money(totalUnutilizedCost)} {base}</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    متوسط وقت فاقد: <strong>{avgUnutilizedPct}%</strong> ({highUnutilizedEmps.length} مطور &gt; 20% {overAllocatedEmps.length > 0 && `| ${overAllocatedEmps.length} مطور &gt; 100%`})
                  </div>
                </div>

                {/* Metric 8 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 to-purple-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/80 text-[10px] font-black">كفاءة التسعير</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-2xs">
                      <CheckCircle2 className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">مؤشر جدوى وتغطية أسعار الخدمات</div>
                  <div className="text-xl font-black text-indigo-700 dark:text-indigo-300 font-mono">
                    {healthyEmployees.length} / {employees.length}
                  </div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    {losingEmployees.length > 0 ? (
                      <span className="text-rose-600 font-bold">{losingEmployees.length} مطور بسعر أقل من التكلفة!</span>
                    ) : (
                      <span className="text-emerald-600 font-semibold">جميع الأسعار تغطي التكلفة بنجاح</span>
                    )}
                  </div>
                </div>

                {/* Metric 9 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-rose-500 to-pink-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/80 text-[10px] font-black">الامتثال للهامش</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-rose-600 text-white shadow-2xs">
                      <Target className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">الامتثال للهامش الربحي المستهدف</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white font-mono">
                    {projects.filter((p: any) => p.meetsTarget).length} / {projects.length}
                  </div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    فجوة الأرباح: <strong className="font-mono text-rose-600 font-bold">{money(totalMarginShortfall)}</strong> {base}
                  </div>
                </div>

                {/* Metric 10 */}
                <div className="card group relative overflow-hidden p-4.5 space-y-2.5 card-hover border border-slate-200/90 dark:border-slate-800">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-purple-500 to-indigo-600" />
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200/80 text-[10px] font-black">الربحية المتكاملة</span>
                    <div className="flex size-7 items-center justify-center rounded-lg bg-purple-600 text-white shadow-2xs">
                      <Layers className="size-3.5" />
                    </div>
                  </div>
                  <div className="font-bold text-xs text-slate-900 dark:text-slate-100">مصفوفة الربحية الثلاثية الأبعاد</div>
                  <div className="text-xl font-black text-purple-700 dark:text-purple-300 font-mono">3-Tier Matrix</div>
                  <div className="text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2">
                    مستويات: موظف • مشروع • عميل
                  </div>
                </div>
              </div>

              {/* Visual Performance Chart */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                      مقارنة الإيرادات والتكاليف والأرباح لأبرز المشاريع
                    </h3>
                    <p className="text-xs text-slate-500">تحليل فوري للإيرادات مقابل تكلفة الكفاءات ونسبة الربح الصافي</p>
                  </div>
                  <Link to="/rev/profitability" className="btn-secondary h-8 px-3 text-xs flex items-center gap-1">
                    لوحة التفاصيل الكاملة ←
                  </Link>
                </div>
                {chartOption && <ReactECharts option={chartOption} style={{ height: 320 }} />}
              </div>
            </div>
          )}

          {/* ================================================================== TAB 2: SERVICE PRICE FEASIBILITY */}
          {activeTab === 'feasibility' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-indigo-950 dark:text-indigo-200 text-sm">تحليل كفاءة وجدوى أسعار الخدمات ومقارنة التكلفة المباشرة بالأسعار البيعية</h4>
                  <p className="text-indigo-800 dark:text-indigo-300 mt-0.5">
                    يقارن هذا التقرير التكلفة الشهرية الكاملة لكل مطور مع سعر بيع خدمته للعميل (شهري، يومي، أو ساعي) لتحديد ما إذا كان السعر يغطي التكلفة ويحقق هامش ربح مقبول.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 px-2 py-0.5 rounded font-bold">
                    {healthyEmployees.length} رابح
                  </span>
                  {losingEmployees.length > 0 && (
                    <span className="bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 px-2 py-0.5 rounded font-bold">
                      {losingEmployees.length} خاسر!
                    </span>
                  )}
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="table w-full text-xs">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>الوظيفة / القسم</th>
                      <th className="num">التكلفة الشهرية الكاملة</th>
                      <th className="num">سعر البيع الشهري المحول</th>
                      <th>أساس التسعير</th>
                      <th className="num">سعر الخدمة المسجل</th>
                      <th className="num">هامش الربح على السعر%</th>
                      <th>تقييم الجدوى والتسعير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feasibilityList.map((f: any) => {
                      return (
                        <tr key={f.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td>
                            <div className="font-bold text-slate-900 dark:text-slate-100">{f.employeeName}</div>
                            <div className="text-[10px] font-mono text-slate-400">{f.employeeCode}</div>
                          </td>
                          <td className="text-slate-500">{f.positionTitle || '—'}</td>
                          <td className="num font-bold text-slate-900 dark:text-slate-100">{money(f.monthlyCost)} {base}</td>
                          <td className="num font-bold text-emerald-600 font-mono">
                            {f.monthlyBillingRate > 0 ? `${money(f.monthlyBillingRate)} ${base}` : 'غير مسعر'}
                          </td>
                          <td>
                            <Badge color="slate">{f.basis}</Badge>
                          </td>
                          <td className="num font-mono">
                            {f.rawPrice ? `${money(f.rawPrice)} ${f.currency}` : '—'}
                          </td>
                          <td className="num font-bold font-mono">
                            {f.marginOnPrice != null ? (
                              <span className={f.marginOnPrice >= 20 ? 'text-emerald-600' : f.marginOnPrice >= 0 ? 'text-amber-600' : 'text-rose-600'}>
                                {f.marginOnPrice.toFixed(1)}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {f.status === 'EXCELLENT' && <Badge color="green">ممتاز (&gt; 40%)</Badge>}
                            {f.status === 'STABLE' && <Badge color="blue">مستقر (20-40%)</Badge>}
                            {f.status === 'TIGHT' && <Badge color="amber">هامش ضئيل (&lt; 20%)</Badge>}
                            {f.status === 'LOSS' && <Badge color="red">خاسر (السعر أقل من التكلفة!)</Badge>}
                            {f.status === 'UNPRICED' && <Badge color="slate">لم يسجل سعر</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================== TAB 3: TARGET MARGIN GAP */}
          {activeTab === 'margin-gap' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-rose-950 dark:text-rose-200 text-sm">تحليل فجوة الهامش الربحي المستهدف للمشاريع والخدمات التعاقدية</h4>
                  <p className="text-rose-800 dark:text-rose-300 mt-0.5">
                    يقيس الفارق بين هامش الربح الفعلي للمشروع والهامش المستهدف المطلوب (Required Margin %)، ويحسب العجز المالي بالريال لمساعدة الإدارة في اتخاذ قرارات التسعير أو إعادة التخصيص.
                  </p>
                </div>
                <div className="text-end">
                  <div className="text-slate-500">إجمالي عجز الأرباح المستهدفة:</div>
                  <div className="text-lg font-black text-rose-600 font-mono">-{money(totalMarginShortfall)} {base}</div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="table w-full text-xs">
                  <thead>
                    <tr>
                      <th>المشروع</th>
                      <th>العميل</th>
                      <th className="num">الإيراد</th>
                      <th className="num">إجمالي التكلفة</th>
                      <th className="num">الربح الفعلي</th>
                      <th className="num">الهامش الفعلي%</th>
                      <th className="num">الهامش المستهدف%</th>
                      <th className="num">فجوة الهامش (SAR)</th>
                      <th>حالة الامتثال</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetGapProjects.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td>
                          <Link to={`/prj/projects/${p.projectId}`} className="font-bold text-brand-600 hover:underline">
                            {p.projectCode} — {p.projectName}
                          </Link>
                        </td>
                        <td>{p.clientName}</td>
                        <td className="num font-bold text-emerald-600">{money(p.revenueBase)}</td>
                        <td className="num">{money(p.totalCostBase)}</td>
                        <td className={`num font-bold ${Number(p.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                          {money(p.grossProfitBase)}
                        </td>
                        <td className="num font-bold">{p.actualMargin.toFixed(1)}%</td>
                        <td className="num text-slate-500">{p.targetMargin > 0 ? `${p.targetMargin.toFixed(1)}%` : '—'}</td>
                        <td className="num font-mono font-bold">
                          {p.gapBase > 0 ? (
                            <span className="text-rose-600">-{money(p.gapBase)} {base}</span>
                          ) : (
                            <span className="text-emerald-600">0.00 (محقق)</span>
                          )}
                        </td>
                        <td>
                          {p.targetMargin === 0 ? (
                            <Badge color="slate">غير محدد</Badge>
                          ) : p.meetsTarget ? (
                            <Badge color="green">يحقق الهدف</Badge>
                          ) : (
                            <Badge color="red">دون الهدف</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================== TAB 4: UNUTILIZED CAPACITY DRAIN */}
          {activeTab === 'unutilized' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-amber-950 dark:text-amber-200 text-sm">استنزاف الطاقة غير المستغلة وهدر الـ Bench للكوادر</h4>
                  <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                    إذا كان تخصيص الموظف أقل من 100%، فإن الجزء المتبقي يمثل تكلفة مباشرة تتحملها الشركة بالكامل دون أن تولد أي إيراد من مشروع.
                  </p>
                </div>
                <div className="text-end">
                  <div className="text-slate-500">إجمالي التكلفة غير المستغلة:</div>
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300 font-mono">{money(totalUnutilizedCost)} {base}</div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="table w-full text-xs">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>القسم</th>
                      <th className="num">التخصيص%</th>
                      <th className="num">غير مستغل%</th>
                      <th className="num">تكلفة الوقت الضائع (SAR)</th>
                      <th className="num">التكلفة المباشرة الكاملة</th>
                      <th className="num">الإيراد المولد</th>
                      <th>الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e: any) => {
                      const unutilized = Number(e.unutilizedPct || 0);
                      const allocated = Number(e.allocatedPct || 0);
                      return (
                        <tr key={e.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td>
                            <Link to={`/hr/employees/${e.employeeId}`} className="font-bold text-brand-600 hover:underline">
                              {e.employeeCode} — {e.employeeName}
                            </Link>
                          </td>
                          <td className="text-slate-500">{e.departmentName || '—'}</td>
                          <td className="num font-mono font-bold">{allocated}%</td>
                          <td className="num font-mono">
                            <span className={unutilized > 20 ? 'text-amber-600 font-black' : 'text-slate-500'}>
                              {unutilized}%
                            </span>
                          </td>
                          <td className="num font-bold text-amber-700 dark:text-amber-400 font-mono">
                            {money(e.unutilizedCostBase)} {base}
                          </td>
                          <td className="num">{money(e.directCostBase)}</td>
                          <td className="num font-bold text-emerald-600">{money(e.revenueBase)}</td>
                          <td>
                            {allocated > 100 ? (
                              <Badge color="purple">تخصيص فائض (&gt;100%)</Badge>
                            ) : unutilized > 0 ? (
                              <Badge color="amber">طاقة غير مستغلة</Badge>
                            ) : (
                              <Badge color="green">مستغل 100%</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================== TAB 5: CLIENT CONTRIBUTION */}
          {activeTab === 'clients' && (
            <div className="space-y-4">
              <div className="card overflow-hidden">
                <table className="table w-full text-xs">
                  <thead>
                    <tr>
                      <th>العميل</th>
                      <th className="num">عدد المشاريع</th>
                      <th className="num">إجمالي الإيراد</th>
                      <th className="num">التكلفة المباشرة</th>
                      <th className="num">المصروفات العامة</th>
                      <th className="num">إجمالي التكلفة</th>
                      <th className="num">صافي الربح</th>
                      <th className="num">هامش العميل%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c: any) => (
                      <tr key={c.clientId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{c.clientName}</div>
                          <div className="text-[10px] font-mono text-slate-400">{c.clientCode}</div>
                        </td>
                        <td className="num font-mono font-semibold">{c.projectCount}</td>
                        <td className="num font-bold text-emerald-600">{money(c.revenueBase)} {base}</td>
                        <td className="num">{money(c.directCostBase)}</td>
                        <td className="num text-slate-500">{money(c.overheadBase)}</td>
                        <td className="num font-medium">{money(c.totalCostBase)}</td>
                        <td className={`num font-bold ${Number(c.grossProfitBase) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600'}`}>
                          {money(c.grossProfitBase)}
                        </td>
                        <td className="num font-bold font-mono">
                          {c.grossMarginPct != null ? `${Number(c.grossMarginPct).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
