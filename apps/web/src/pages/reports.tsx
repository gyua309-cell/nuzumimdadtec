import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import {
  Activity, ArrowUpRight, BarChart3, Briefcase, Building2, Calendar,
  CheckCircle2, Clock, DollarSign, FileText,
  HelpCircle, Landmark, Layers, Lock, LockOpen, PieChart, Plus, Printer, Receipt,
  ShieldAlert, ShieldCheck, Sparkles, Target, TrendingUp, Users, Wallet, XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, dateTime, money, monthStart, today, yearStart } from '../lib/format';
import { ACCOUNT_CLASS, CHECK_STATUS } from '../lib/labels';
import { PeriodSelect } from '../components/forms';
import { ExecutiveBarChart, ExecutiveChartCard, ExecutiveDonutChart } from '../components/ExecutiveCharts';
import { ExportMenu } from '../components/ExportMenu';
import { ExportEngine } from '../engine/export-engine';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
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
    <div className="card mb-5 p-4 relative z-40 overflow-visible bg-white/95 dark:bg-[#0c1324]/95 border border-slate-200/80 dark:border-slate-800 shadow-xs">
      <div className="flex flex-wrap items-end gap-3.5">
        <Field label="من تاريخ"><input className="input w-36 sm:w-40" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى تاريخ"><input className="input w-36 sm:w-40" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        {setBranchId && (
          <Field label="الفرع / المركز المالي">
            <select
              className="input min-w-[14rem] sm:w-72 font-medium"
              value={branchId || 'ALL'}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="ALL">الكل (قوائم موحدة - Consolidated SAR)</option>
              {(branches ?? []).map((b: any) => (
                <option key={b.id} value={b.id}>{b.nameAr} ({b.functionalCurrency || b.countryCode})</option>
              ))}
            </select>
          </Field>
        )}
        {children}
      </div>
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
  const isBalanced = Boolean(q.data?.balanced ?? q.data?.isBalanced);

  return (
    <div>
      <PageHeader
        title="ميزان المراجعة"
        subtitle={`المبالغ بالعملة الأساسية (${base}) من القيود المرحّلة فقط. اضغط على حساب لعرض كشفه.`}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              title="ميزان المراجعة"
              subtitle={`ميزان المراجعة الموحد — دفتر ${ledger === 'FINANCIAL' ? 'مالي' : 'إداري'} (${isBalanced ? 'متوازن 100%' : 'غير متوازن'})`}
              filename={`trial-balance-${from}-${to}`}
              periodLabel={`${from} إلى ${to}`}
              currency={base}
              summaryKpis={[
                { label: 'عدد الحسابات', value: String(rows.length), tone: 'indigo' },
                { label: 'مدين ختامي', value: `${money(q.data?.totals?.closingDebit ?? 0)} ${base}`, tone: 'emerald' },
                { label: 'دائن ختامي', value: `${money(q.data?.totals?.closingCredit ?? 0)} ${base}`, tone: 'rose' },
                { label: 'التوازن', value: isBalanced ? 'متوازن 100%' : 'غير متوازن', tone: isBalanced ? 'emerald' : 'rose' },
              ]}
              columns={[
                { key: 'code', header: 'الرمز', type: 'text', width: 14 },
                { key: 'nameAr', header: 'الحساب', type: 'text', width: 28 },
                { key: 'openingDebit', header: 'مدين افتتاحي', type: 'currency', width: 16, isTotal: true },
                { key: 'openingCredit', header: 'دائن افتتاحي', type: 'currency', width: 16, isTotal: true },
                { key: 'periodDebit', header: 'مدين الفترة', type: 'currency', width: 16, isTotal: true },
                { key: 'periodCredit', header: 'دائن الفترة', type: 'currency', width: 16, isTotal: true },
                { key: 'closingDebit', header: 'مدين ختامي', type: 'currency', width: 16, isTotal: true },
                { key: 'closingCredit', header: 'دائن ختامي', type: 'currency', width: 16, isTotal: true },
              ]}
              data={rows}
            />
            <button
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() =>
                void ExportEngine.exportPdf({
                  title: 'ميزان المراجعة',
                  subtitle: `ميزان المراجعة الموحد — دفتر ${ledger === 'FINANCIAL' ? 'مالي' : 'إداري'}`,
                  periodLabel: `${from} إلى ${to}`,
                  currency: base,
                  summaryKpis: [
                    { label: 'عدد الحسابات', value: String(rows.length), tone: 'indigo' },
                    { label: 'مدين ختامي', value: `${money(q.data?.totals?.closingDebit ?? 0)} ${base}`, tone: 'emerald' },
                    { label: 'دائن ختامي', value: `${money(q.data?.totals?.closingCredit ?? 0)} ${base}`, tone: 'rose' },
                    { label: 'حالة التوازن', value: isBalanced ? 'متوازن' : 'غير متوازن', tone: isBalanced ? 'emerald' : 'rose' },
                  ],
                  columns: [
                    { key: 'code', header: 'الرمز', type: 'text', width: 14 },
                    { key: 'nameAr', header: 'الحساب', type: 'text', width: 28 },
                    { key: 'openingDebit', header: 'مدين افتتاحي', type: 'currency', width: 16, isTotal: true },
                    { key: 'openingCredit', header: 'دائن افتتاحي', type: 'currency', width: 16, isTotal: true },
                    { key: 'periodDebit', header: 'مدين الفترة', type: 'currency', width: 16, isTotal: true },
                    { key: 'periodCredit', header: 'دائن الفترة', type: 'currency', width: 16, isTotal: true },
                    { key: 'closingDebit', header: 'مدين ختامي', type: 'currency', width: 16, isTotal: true },
                    { key: 'closingCredit', header: 'دائن ختامي', type: 'currency', width: 16, isTotal: true },
                  ],
                  data: rows,
                })
              }
              title="طباعة ملكية A4 لميزان المراجعة"
            >
              <Printer className="size-3.5" /> طباعة ملكية (A4)
            </button>
          </div>
        }
      />

      <Range from={from} to={to} setFrom={setFrom} setTo={setTo} branchId={branchId} setBranchId={setBranchId} branches={branchesQ.data}>
        <Field label="الدفتر"><select className="input w-32" value={ledger} onChange={(e) => setLedger(e.target.value)}><option value="FINANCIAL">مالي</option><option value="MANAGEMENT">إداري</option></select></Field>
        <label className="flex items-center gap-2 pb-2 text-sm cursor-pointer select-none">
          <input type="checkbox" className="rounded text-brand-600" checked={postingOnly} onChange={(e) => setPostingOnly(e.target.checked)} />
          <span>الحسابات التفصيلية فقط</span>
        </label>
        {q.data && (
          <div className="ms-auto pb-1 flex items-center gap-2">
            <BalancedBadge ok={isBalanced} />
          </div>
        )}
      </Range>

      {/* Executive KPI Cards */}
      {q.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
          <div className="card p-3.5 border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#0c1324] dark:to-[#080d19]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">الأرصدة الافتتاحية</span>
              <Calendar className="size-3.5 text-slate-400" />
            </div>
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-slate-600 dark:text-slate-400">مدين: <strong className="num text-slate-900 dark:text-white font-mono">{money(q.data?.totals?.openingDebit ?? '0.00')}</strong></span>
              <span className="text-slate-600 dark:text-slate-400">دائن: <strong className="num text-slate-900 dark:text-white font-mono">{money(q.data?.totals?.openingCredit ?? '0.00')}</strong></span>
            </div>
          </div>

          <div className="card p-3.5 border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#0c1324] dark:to-[#080d19]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">حركات الفترة (النشاط)</span>
              <Activity className="size-3.5 text-blue-500" />
            </div>
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-emerald-700 dark:text-emerald-400">مدين: <strong className="num font-mono">{money(q.data?.totals?.periodDebit ?? '0.00')}</strong></span>
              <span className="text-rose-700 dark:text-rose-400">دائن: <strong className="num font-mono">{money(q.data?.totals?.periodCredit ?? '0.00')}</strong></span>
            </div>
          </div>

          <div className="card p-3.5 border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-[#0c1324] dark:to-[#080d19]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">الأرصدة الختامية</span>
              <Wallet className="size-3.5 text-indigo-500" />
            </div>
            <div className="flex items-center justify-between text-xs mt-2">
              <span className="text-slate-800 dark:text-slate-200">مدين: <strong className="num font-mono">{money(q.data?.totals?.closingDebit ?? '0.00')}</strong></span>
              <span className="text-slate-800 dark:text-slate-200">دائن: <strong className="num font-mono">{money(q.data?.totals?.closingCredit ?? '0.00')}</strong></span>
            </div>
          </div>

          <div className={`card p-3.5 border transition-all ${isBalanced ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-950/20'}`}>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">التوازن المحاسبي العام</span>
              {isBalanced ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-rose-600" />}
            </div>
            <div className="text-base font-black mt-1 font-mono text-slate-900 dark:text-white">
              {isBalanced ? 'متوازن 100% (0.00 SAR)' : `فارق: ${money(q.data?.difference ?? '0.00')}`}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {isBalanced ? 'إجمالي المدين يطابق إجمالي الدائن تماماً' : 'يوجد تباين بحاجة لمراجعة القيود'}
            </div>
          </div>
        </div>
      )}

      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : rows.length === 0 ? <div className="card"><EmptyState text="لا توجد حركات مرحّلة في هذه الفترة." /></div> : (
        <div className="card max-h-[70vh] overflow-auto shadow-sm">
          <table className="table">
            <thead>
              <tr className="bg-slate-900 text-white dark:bg-slate-950">
                <th rowSpan={2} className="text-white">الرمز</th>
                <th rowSpan={2} className="text-white">الحساب</th>
                <th colSpan={2} className="text-center text-white border-inline border-slate-700">الرصيد الافتتاحي</th>
                <th colSpan={2} className="text-center text-white border-inline border-slate-700">حركة الفترة</th>
                <th colSpan={2} className="text-center text-white border-inline border-slate-700">الرصيد الختامي</th>
              </tr>
              <tr className="bg-slate-800 text-slate-200 text-xs">
                <th className="text-slate-200">مدين</th>
                <th className="text-slate-200">دائن</th>
                <th className="text-slate-200">مدين</th>
                <th className="text-slate-200">دائن</th>
                <th className="text-slate-200">مدين</th>
                <th className="text-slate-200">دائن</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.accountId} className={`${r.isPosting ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'bg-slate-50/70 font-semibold dark:bg-slate-800/40'}`} onClick={() => r.isPosting && nav(`/reports/account-statement?accountId=${r.accountId}&from=${from}&to=${to}`)}>
                  <td className="num text-start font-mono font-bold text-slate-600 dark:text-slate-400">{r.code}</td>
                  <td style={{ paddingInlineStart: `${(r.level - 1) * 16 + 12}px` }} className="font-medium text-slate-900 dark:text-slate-100">{r.nameAr}</td>
                  {cols.map((c) => <td key={c} className="num font-mono text-xs">{money(r[c])}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="sticky bottom-0 bg-slate-100 dark:bg-slate-800/90 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-slate-950 dark:text-white">
                <td colSpan={2} className="px-3 py-2.5">الإجمالي (الحسابات التفصيلية)</td>
                {cols.map((c) => <td key={c} className="num px-3 font-mono font-black">{money(q.data?.totals?.[c] ?? '0.00')}</td>)}
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
  const statementRows: any[] = Array.isArray(q.data?.lines)
    ? q.data.lines
    : (Array.isArray(q.data?.data)
      ? q.data.data
      : (Array.isArray(q.data) ? q.data : []));

  const acc = q.data?.account;
  const isDebitNormal = acc?.normalBalance !== 'CREDIT';
  const openBal = parseFloat(q.data?.openingBalance ?? '0');
  const pDebit = parseFloat(q.data?.periodDebit ?? '0');
  const pCredit = parseFloat(q.data?.periodCredit ?? '0');
  const closeBal = parseFloat(q.data?.closingBalance ?? '0');
  const netMovement = isDebitNormal ? (pDebit - pCredit) : (pCredit - pDebit);

  return (
    <div>
      <PageHeader
        title="كشف حساب تفصيلي"
        subtitle="الرصيد الافتتاحي + الحركات المدينة والدائنة + الرصيد الجاري التراكمي. اضغط على أي حركة لعرض قيد اليومية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {q.data && (
              <>
                <ExportMenu
                  title={`كشف حساب - ${acc?.nameAr || ''} (${acc?.code || ''})`}
                  subtitle={`حركات الأستاذ العام والرصيد الجاري التراكمي — الرصيد الختامي: ${money(closeBal)} ${acc?.currencyCode || 'SAR'}`}
                  filename={`statement-${acc?.code || 'acc'}-${from}-${to}`}
                  periodLabel={`من ${from} إلى ${to}`}
                  currency={acc?.currencyCode || 'SAR'}
                  summaryKpis={[
                    { label: 'إجمالي المدين', value: `${money(pDebit)} ${acc?.currencyCode || 'SAR'}`, tone: 'emerald' },
                    { label: 'إجمالي الدائن', value: `${money(pCredit)} ${acc?.currencyCode || 'SAR'}`, tone: 'rose' },
                    { label: 'صافي الحركة', value: `${money(netMovement)} ${acc?.currencyCode || 'SAR'}`, tone: 'indigo' },
                    { label: 'الرصيد الختامي', value: `${money(closeBal)} ${acc?.currencyCode || 'SAR'}`, tone: 'navy' },
                  ]}
                  columns={[
                    { key: 'entryDate', header: 'التاريخ', width: 14, type: 'date' },
                    { key: 'entryNo', header: 'رقم القيد', width: 14 },
                    { key: 'lineDescription', header: 'البيان والتفاصيل', width: 34 },
                    { key: 'currencyCode', header: 'العملة', width: 10 },
                    { key: 'debitBase', header: 'مدين (SAR)', width: 16, type: 'currency', isTotal: true },
                    { key: 'creditBase', header: 'دائن (SAR)', width: 16, type: 'currency', isTotal: true },
                    { key: 'runningBalance', header: 'الرصيد الجاري', width: 18, type: 'currency' },
                  ]}
                  data={statementRows.map((l: any) => ({
                    ...l,
                    lineDescription: l.lineDescription ?? l.description ?? '',
                  }))}
                />
                <button
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  onClick={() =>
                    void ExportEngine.exportPdf({
                      title: `كشف حساب - ${acc?.nameAr || ''} (${acc?.code || ''})`,
                      subtitle: `الرصيد الافتتاحي + الحركات المدينة والدائنة + الرصيد الختامي: ${money(closeBal)}`,
                      periodLabel: `من ${from} إلى ${to}`,
                      currency: acc?.currencyCode || 'SAR',
                      summaryKpis: [
                        { label: 'إجمالي المدين', value: `${money(pDebit)} ${acc?.currencyCode || 'SAR'}`, tone: 'emerald' },
                        { label: 'إجمالي الدائن', value: `${money(pCredit)} ${acc?.currencyCode || 'SAR'}`, tone: 'rose' },
                        { label: 'الرصيد الختامي', value: `${money(closeBal)} ${acc?.currencyCode || 'SAR'}`, tone: 'navy' },
                      ],
                      columns: [
                        { key: 'entryDate', header: 'التاريخ', width: 14, type: 'date' },
                        { key: 'entryNo', header: 'رقم القيد', width: 14 },
                        { key: 'lineDescription', header: 'البيان والتفاصيل', width: 34 },
                        { key: 'currencyCode', header: 'العملة', width: 10 },
                        { key: 'debitBase', header: 'مدين (SAR)', width: 16, type: 'currency', isTotal: true },
                        { key: 'creditBase', header: 'دائن (SAR)', width: 16, type: 'currency', isTotal: true },
                        { key: 'runningBalance', header: 'الرصيد الجاري', width: 18, type: 'currency' },
                      ],
                      data: statementRows.map((l: any) => ({
                        ...l,
                        lineDescription: l.lineDescription ?? l.description ?? '',
                      })),
                    })
                  }
                  title="طباعة ملكية A4 لكشف الحساب"
                >
                  <Printer className="size-3.5" /> طباعة ملكية (A4)
                </button>
              </>
            )}
          </div>
        }
      />

      <Range from={from} to={to} setFrom={setFrom} setTo={setTo} branchId={branchId} setBranchId={setBranchId} branches={branchesQ.data}>
        <Field label="الحساب المحاسبي" className="w-80 sm:w-96">
          <AccountSelect
            accounts={accounts.data ?? []}
            value={accountId}
            onChange={(v) => { setAccountId(v); setPage(1); }}
          />
        </Field>
      </Range>

      {!accountId ? (
        <div className="card p-10 text-center">
          <div className="mx-auto size-16 rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-4 shadow-inner">
            <Wallet className="size-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">اختر حساباً مالياً لعرض كشفه</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            قم باختيار الحساب من القائمة المنسدلة أعلاه لعرض رصيده الافتتاحي وحركاته اليومية مع تتبع الرصيد التراكمي وتصدير كشف الحساب كملف Excel أو PDF معتمد.
          </p>
        </div>
      ) : q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : (
        <>
          {/* Executive Account Banner & KPI Cards */}
          <div className="card mb-5 p-4 border border-slate-200/90 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50/70 dark:from-[#0c1324] dark:to-[#080d19]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-brand-600 text-white font-mono font-black text-sm flex items-center justify-center shadow-md">
                  {acc?.code}
                </div>
                <div>
                  <div className="text-base font-black text-slate-900 dark:text-slate-50">{acc?.nameAr}</div>
                  {acc?.nameEn && <div className="text-xs text-slate-400">{acc.nameEn}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${isDebitNormal ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800' : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800'}`}>
                  طبيعة الحساب: {isDebitNormal ? 'مدين (Debit)' : 'دائن (Credit)'}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {acc?.accountClass || 'حساب عام'}
                </span>
              </div>
            </div>

            {/* 5 Executive KPI Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3">
              <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-[11px] font-semibold text-slate-500">الرصيد الافتتاحي</div>
                <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">{money(openBal)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">قبل {from}</div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/60">
                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">إجمالي مدين الفترة (+)</div>
                <div className="text-base font-black font-mono text-emerald-800 dark:text-emerald-300 mt-1">{money(pDebit)}</div>
                <div className="text-[10px] text-emerald-600/70 mt-0.5">حركات زيادة/إضافة</div>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/60">
                <div className="text-[11px] font-semibold text-rose-700 dark:text-rose-400">إجمالي دائن الفترة (-)</div>
                <div className="text-base font-black font-mono text-rose-800 dark:text-rose-300 mt-1">{money(pCredit)}</div>
                <div className="text-[10px] text-rose-600/70 mt-0.5">حركات خصم/صرف</div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/60">
                <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400">صافي تغير الفترة</div>
                <div className="text-base font-black font-mono text-indigo-800 dark:text-indigo-300 mt-1">
                  {netMovement >= 0 ? `+${money(netMovement)}` : money(netMovement)}
                </div>
                <div className="text-[10px] text-indigo-600/70 mt-0.5">فرق النشاط الدوري</div>
              </div>

              <div className="p-3 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white shadow-sm col-span-2 sm:col-span-1">
                <div className="text-[11px] font-bold text-white/80">الرصيد الختامي الصافي</div>
                <div className="text-lg font-black font-mono text-white mt-1">{money(closeBal)}</div>
                <div className="text-[10px] text-white/70 mt-0.5">{closeBal >= 0 ? 'رصيد مطابق لطبيعة الحساب' : 'رصيد عكس طبيعة الحساب'}</div>
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="card overflow-hidden shadow-sm">
            {!statementRows.length ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                لا توجد حركات مقيدة لهذا الحساب خلال الفترة المحددة ({from} إلى {to}).
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table w-full">
                    <thead>
                      <tr className="bg-slate-900 text-white dark:bg-slate-950">
                        <th className="text-white">التاريخ</th>
                        <th className="text-white">رقم القيد</th>
                        <th className="text-white">البيان والتفاصيل</th>
                        <th className="text-white">العملة</th>
                        <th className="num text-white">مدين (عملة)</th>
                        <th className="num text-white">دائن (عملة)</th>
                        <th className="num text-white">مدين (SAR)</th>
                        <th className="num text-white">دائن (SAR)</th>
                        <th className="num text-white">الرصيد الجاري</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening Balance Row */}
                      <tr className="bg-slate-100/80 dark:bg-slate-800/60 font-bold border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                        <td>{date(from)}</td>
                        <td>—</td>
                        <td colSpan={6} className="font-bold">رصيد ما قبل الفترة (الرصيد الافتتاحي المرحّل)</td>
                        <td className="num font-mono font-black">{money(openBal)}</td>
                      </tr>

                      {statementRows.map((l: any, i: number) => (
                        <tr
                          key={i}
                          className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                          onClick={() => nav(`/acc/journals/${l.entryId}`)}
                        >
                          <td className="text-xs whitespace-nowrap">{date(l.entryDate)}</td>
                          <td className="num text-start whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <JournalLinkBadge entryId={l.entryId} entryNo={l.entryNo} compact />
                          </td>
                          <td className="max-w-md text-xs text-slate-900 dark:text-slate-100 font-medium leading-relaxed">
                            {l.lineDescription ?? l.description}
                          </td>
                          <td className="text-xs font-mono text-slate-500">{l.currencyCode}</td>
                          <td className="num font-mono text-xs text-slate-600 dark:text-slate-400">{money(l.debitTx)}</td>
                          <td className="num font-mono text-xs text-slate-600 dark:text-slate-400">{money(l.creditTx)}</td>
                          <td className="num font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">{money(l.debitBase)}</td>
                          <td className="num font-mono text-xs font-semibold text-rose-700 dark:text-rose-400">{money(l.creditBase)}</td>
                          <td className="num font-mono text-xs font-black text-slate-900 dark:text-white bg-slate-50/50 dark:bg-slate-800/30">
                            {money(l.runningBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800/90 font-bold border-t-2 border-slate-300 dark:border-slate-700 text-slate-950 dark:text-white">
                        <td colSpan={6} className="px-3 py-2.5 font-bold">إجمالي حركة الفترة والرصيد الختامي</td>
                        <td className="num px-3 font-mono font-black text-emerald-800 dark:text-emerald-300">{money(pDebit)}</td>
                        <td className="num px-3 font-mono font-black text-rose-800 dark:text-rose-300">{money(pCredit)}</td>
                        <td className="num px-3 font-mono font-black text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-950/40">
                          {money(closeBal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <Pager {...(q.data?.meta ?? { page: 1, pageSize: 50, total: statementRows.length })} onPage={setPage} />
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

  const rev = parseFloat(q.data?.revenue || '0');
  const dc = parseFloat(q.data?.directCost || '0');
  const gp = parseFloat(q.data?.grossProfit || '0');
  const opex = parseFloat(q.data?.operatingExpenses || '0');
  const np = parseFloat(q.data?.netProfit || '0');
  const gpMargin = rev > 0 ? ((gp / rev) * 100).toFixed(1) + '%' : '0.0%';
  const netMargin = rev > 0 ? ((np / rev) * 100).toFixed(1) + '%' : '0.0%';

  const section = (cls: string[], title: string, total: string, badgeColor: string) => {
    const lines = (q.data?.lines ?? []).filter((l: any) => cls.includes(l.accountClass));
    return (
      <>
        <tr className="bg-slate-100/80 font-bold dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700">
          <td colSpan={2} className="px-4 py-2.5">
            <span className={`inline-block size-2 rounded-full ${badgeColor} me-2`} />
            {title}
          </td>
        </tr>
        {lines.map((l: any) => (
          <tr key={l.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
            <td className="ps-8 py-2">
              <Link className="hover:underline flex items-center gap-2" to={`/reports/account-statement?accountId=${l.accountId}&from=${from}&to=${to}`}>
                <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{l.code}</span>
                <span className="text-slate-900 dark:text-slate-100 text-xs font-medium">{l.nameAr}</span>
              </Link>
            </td>
            <td className="num font-mono text-xs font-semibold px-4">{money(l.amount)}</td>
          </tr>
        ))}
        <tr className="font-bold bg-slate-50 dark:bg-slate-800/30 text-slate-800 dark:text-slate-200">
          <td className="px-4 py-2">إجمالي {title}</td>
          <td className="num px-4 font-mono font-bold">{money(total)}</td>
        </tr>
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title="قائمة الدخل (الأرباح والخسائر)"
        subtitle={`بالعملة الأساسية (${base}). قياس الأداء التشغيلي والربحية للفترة المحددة. اضغط على أي حساب لعرض كشفه.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {q.data && (
              <>
                <ExportMenu
                  title="قائمة الدخل - الأرباح والخسائر"
                  subtitle={`قياس الأداء التشغيلي والربحية بالعملة الأساسية (${base})`}
                  filename={`income-statement-${from}-${to}`}
                  periodLabel={`من ${from} إلى ${to}`}
                  currency={base}
                  summaryKpis={[
                    { label: 'إجمالي الإيرادات', value: `${money(rev)} ${base}`, tone: 'emerald' },
                    { label: 'التكاليف المباشرة', value: `${money(dc)} ${base}`, tone: 'rose' },
                    { label: 'مجمل الربح', value: `${money(gp)} ${base}`, tone: 'indigo' },
                    { label: 'صافي الربح', value: `${money(q.data?.netProfit ?? 0)} ${base}`, tone: Number(q.data?.netProfit ?? 0) >= 0 ? 'emerald' : 'rose' },
                  ]}
                  columns={[
                    { key: 'code', header: 'رمز الحساب', width: 14 },
                    { key: 'nameAr', header: 'الحساب', width: 30 },
                    { key: 'classLabel', header: 'التصنيف المالي', width: 22 },
                    { key: 'amount', header: `المبلغ (${base})`, width: 18, type: 'currency', isTotal: true },
                  ]}
                  data={(q.data?.lines ?? []).map((l: any) => ({
                    ...l,
                    classLabel: ACCOUNT_CLASS[l.accountClass] || l.accountClass,
                  }))}
                />
                <button
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  onClick={() =>
                    void ExportEngine.exportPdf({
                      title: 'قائمة الدخل (الأرباح والخسائر)',
                      subtitle: `قياس الأداء التشغيلي والربحية للفترة المحددة (${base})`,
                      periodLabel: `من ${from} إلى ${to}`,
                      currency: base,
                      summaryKpis: [
                        { label: 'إجمالي الإيرادات', value: `${money(rev)} ${base}`, tone: 'emerald' },
                        { label: 'التكاليف المباشرة', value: `${money(dc)} ${base}`, tone: 'rose' },
                        { label: 'مجمل الربح', value: `${money(gp)} ${base}`, tone: 'indigo' },
                        { label: 'صافي الربح', value: `${money(q.data?.netProfit ?? 0)} ${base}`, tone: Number(q.data?.netProfit ?? 0) >= 0 ? 'emerald' : 'rose' },
                      ],
                      columns: [
                        { key: 'code', header: 'رمز الحساب', width: 14 },
                        { key: 'nameAr', header: 'الحساب', width: 30 },
                        { key: 'classLabel', header: 'التصنيف المالي', width: 22 },
                        { key: 'amount', header: `المبلغ (${base})`, width: 18, type: 'currency', isTotal: true },
                      ],
                      data: (q.data?.lines ?? []).map((l: any) => ({
                        ...l,
                        classLabel: ACCOUNT_CLASS[l.accountClass] || l.accountClass,
                      })),
                    })
                  }
                  title="طباعة ملكية A4 لقائمة الدخل"
                >
                  <Printer className="size-3.5" /> طباعة ملكية (A4)
                </button>
              </>
            )}
          </div>
        }
      />

      <Range from={from} to={to} setFrom={setFrom} setTo={setTo} branchId={branchId} setBranchId={setBranchId} branches={branchesQ.data} />

      {/* 5 Executive KPI Cards */}
      {q.data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-5">
          <div className="card p-3.5 border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/20">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">إجمالي الإيرادات</div>
            <div className="text-lg font-black font-mono text-emerald-900 dark:text-emerald-200 mt-1">{money(rev)}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">مبيعات وخدمات تشغيلية</div>
          </div>

          <div className="card p-3.5 border-rose-200/80 dark:border-rose-800/50 bg-rose-50/30 dark:bg-rose-950/20">
            <div className="text-[11px] font-semibold text-rose-800 dark:text-rose-400">التكاليف المباشرة</div>
            <div className="text-lg font-black font-mono text-rose-900 dark:text-rose-200 mt-1">{money(dc)}</div>
            <div className="text-[10px] text-rose-600 mt-0.5">رواتب المطورين وتكلفة الخدمات</div>
          </div>

          <div className="card p-3.5 border-indigo-200/80 dark:border-indigo-800/50 bg-indigo-50/30 dark:bg-indigo-950/20">
            <div className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-400">مجمل الربح (Gross Profit)</div>
            <div className="text-lg font-black font-mono text-indigo-900 dark:text-indigo-200 mt-1">{money(gp)}</div>
            <div className="text-[10px] text-indigo-600 font-bold mt-0.5">هامش مجمل: {gpMargin}</div>
          </div>

          <div className="card p-3.5 border-amber-200/80 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/20">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">المصروفات التشغيلية</div>
            <div className="text-lg font-black font-mono text-amber-900 dark:text-amber-200 mt-1">{money(opex)}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">إيجار، عموميات، إهلاك</div>
          </div>

          <div className={`card p-3.5 border col-span-2 sm:col-span-1 shadow-sm ${np >= 0 ? 'border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-600 to-teal-700 text-white' : 'border-rose-300 dark:border-rose-700 bg-gradient-to-br from-rose-600 to-red-700 text-white'}`}>
            <div className="text-[11px] font-bold text-white/80">صافي الربح / (الخسارة)</div>
            <div className="text-xl font-black font-mono text-white mt-1">{money(np)}</div>
            <div className="text-[10px] text-white/80 font-bold mt-0.5">صافي الهامش: {netMargin}</div>
          </div>
        </div>
      )}

      {/* Interactive P&L Visual Breakdown */}
      {q.data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-5 print:hidden">
          <ExecutiveChartCard
            title="هيكل الإيرادات والتكاليف وصافي الربحية"
            subtitle={`تدرج الأداء المالي خلال الفترة بالعملة الأساسية (${base})`}
            icon={BarChart3}
            accent="emerald"
            className="lg:col-span-2"
          >
            <ExecutiveBarChart
              categories={['الإيرادات', 'التكاليف المباشرة', 'مجمل الربح', 'المصروفات التشغيلية', 'صافي الربح']}
              series={[
                {
                  name: `القيمة (${base})`,
                  data: [rev, dc, gp, opex, np],
                  color: '#4f46e5',
                  colorEnd: '#0ea5e9',
                },
              ]}
              height={220}
              unit={base}
              emptyText="لا توجد حركات مالية مرحّلة للفترة"
            />
          </ExecutiveChartCard>

          <ExecutiveChartCard
            title="توزيع مكونات الإيراد والتكلفة"
            subtitle="نسبة التكاليف والمصروفات مقابل صافي الربح"
            icon={PieChart}
            accent="indigo"
          >
            <ExecutiveDonutChart
              data={[
                { name: 'التكاليف المباشرة', value: Math.max(0, dc), color: '#f43f5e' },
                { name: 'المصروفات التشغيلية', value: Math.max(0, opex), color: '#f59e0b' },
                { name: 'صافي الربح', value: Math.max(0, np), color: '#10b981' },
              ]}
              centerValue={netMargin}
              centerLabel="هامش صافي الربح"
              height={220}
              unit={base}
              emptyText="لا توجد بيانات"
            />
          </ExecutiveChartCard>
        </div>
      )}

      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="card max-w-4xl overflow-hidden shadow-sm">
          <table className="table w-full">
            <tbody>
              {section(['REVENUE'], ACCOUNT_CLASS.REVENUE, q.data?.revenue ?? '0.00', 'bg-emerald-500')}
              {section(['DIRECT_COST'], ACCOUNT_CLASS.DIRECT_COST, q.data?.directCost ?? '0.00', 'bg-rose-500')}

              {/* Milestone Row: Gross Profit */}
              <tr className="bg-brand-50/90 font-black dark:bg-brand-950/40 text-brand-950 dark:text-brand-200 border-y-2 border-brand-200 dark:border-brand-800">
                <td className="px-4 py-3 flex items-center justify-between">
                  <span>مجمل الربح التشغيلي (Gross Profit)</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-900/60 font-bold">الهامش: {gpMargin}</span>
                </td>
                <td className="num px-4 font-mono text-base font-black">{money(q.data?.grossProfit ?? '0.00')}</td>
              </tr>

              {section(['OPERATING_EXPENSE'], ACCOUNT_CLASS.OPERATING_EXPENSE, q.data?.operatingExpenses ?? '0.00', 'bg-amber-500')}

              {/* Milestone Row: Operating Profit */}
              <tr className="bg-blue-50/90 font-bold dark:bg-blue-950/40 text-blue-950 dark:text-blue-200 border-y border-blue-200 dark:border-blue-800">
                <td className="px-4 py-2.5">الربح التشغيلي قبل الفوائد والضرائب (Operating Profit - EBIT)</td>
                <td className="num px-4 font-mono font-bold">{money(q.data?.operatingProfit ?? '0.00')}</td>
              </tr>

              {section(['OTHER_INCOME'], ACCOUNT_CLASS.OTHER_INCOME, q.data?.otherIncome ?? '0.00', 'bg-sky-500')}
              {section(['OTHER_EXPENSE'], ACCOUNT_CLASS.OTHER_EXPENSE, q.data?.otherExpenses ?? '0.00', 'bg-purple-500')}

              {/* Grand Final Row: Net Profit */}
              <tr className="bg-slate-900 text-white dark:bg-slate-950 border-t-2 border-slate-950 font-black text-base">
                <td className="px-4 py-3.5 text-white flex items-center justify-between">
                  <span>صافي الربح / (الخسارة) للفترة</span>
                  <span className="text-xs px-2.5 py-0.5 rounded bg-white/10 font-bold">صافي الهامش: {netMargin}</span>
                </td>
                <td className="num px-4 font-mono text-lg font-black text-white">{money(q.data?.netProfit ?? '0.00')}</td>
              </tr>
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

  const isBalanced = Boolean(q.data?.balanced ?? q.data?.isBalanced);

  const Section = ({ title, s, badgeColor }: { title: string; s: any; badgeColor: string }) => (
    <>
      <tr className="bg-slate-100/80 font-bold dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 border-t border-slate-200 dark:border-slate-700">
        <td colSpan={2} className="px-4 py-2.5">
          <span className={`inline-block size-2 rounded-full ${badgeColor} me-2`} />
          {title}
        </td>
      </tr>
      {(s?.lines ?? []).map((l: any) => (
        <tr key={l.accountId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
          <td className="ps-8 py-2">
            <Link className="hover:underline flex items-center gap-2" to={`/reports/account-statement?accountId=${l.accountId}&to=${asOf}`}>
              <span className="font-mono text-xs font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{l.code}</span>
              <span className="text-slate-900 dark:text-slate-100 text-xs font-medium">{l.nameAr}</span>
            </Link>
          </td>
          <td className="num font-mono text-xs font-semibold px-4">{money(l.amount)}</td>
        </tr>
      ))}
      <tr className="font-bold bg-slate-50 dark:bg-slate-800/30 text-slate-800 dark:text-slate-200">
        <td className="px-4 py-2">إجمالي {title}</td>
        <td className="num px-4 font-mono font-bold">{money(s?.total ?? '0.00')}</td>
      </tr>
    </>
  );

  return (
    <div>
      <PageHeader
        title="قائمة المركز المالي (الميزانية العمومية)"
        subtitle={`بالعملة الأساسية (${base}). المعادلة المحاسبية: الأصول = الالتزامات + حقوق الملكية + أرباح الفترة غير المقفلة.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {q.data && (
              <>
                <ExportMenu
                  title="قائمة المركز المالي (الميزانية العمومية)"
                  subtitle={`الأصول = الالتزامات + حقوق الملكية (${isBalanced ? 'المعادلة متوازنة 100%' : 'يوجد فرق'})`}
                  filename={`balance-sheet-${asOf}`}
                  periodLabel={`كما في ${asOf}`}
                  currency={base}
                  summaryKpis={[
                    { label: 'إجمالي الأصول', value: `${money(q.data?.assets?.total ?? 0)} ${base}`, tone: 'indigo' },
                    { label: 'إجمالي الالتزامات', value: `${money(q.data?.liabilities?.total ?? 0)} ${base}`, tone: 'amber' },
                    { label: 'حقوق الملكية', value: `${money(q.data?.equity?.total ?? 0)} ${base}`, tone: 'emerald' },
                    { label: 'توازن الميزانية', value: isBalanced ? 'متوازنة 100%' : 'غير متوازنة', tone: isBalanced ? 'emerald' : 'rose' },
                  ]}
                  columns={[
                    { key: 'section', header: 'القسم', width: 20 },
                    { key: 'code', header: 'رمز الحساب', width: 14 },
                    { key: 'nameAr', header: 'الحساب', width: 30 },
                    { key: 'amount', header: `المبلغ (${base})`, width: 18, type: 'currency', isTotal: true },
                  ]}
                  data={[
                    ...(q.data?.assets?.lines ?? []).map((l: any) => ({ ...l, section: 'الأصول' })),
                    ...(q.data?.liabilities?.lines ?? []).map((l: any) => ({ ...l, section: 'الالتزامات' })),
                    ...(q.data?.equity?.lines ?? []).map((l: any) => ({ ...l, section: 'حقوق الملكية' })),
                  ]}
                />
                <button
                  className="btn-secondary text-xs flex items-center gap-1.5"
                  onClick={() =>
                    void ExportEngine.exportPdf({
                      title: 'قائمة المركز المالي (الميزانية العمومية)',
                      subtitle: `الأصول = الالتزامات + حقوق الملكية (${base})`,
                      periodLabel: `كما في ${asOf}`,
                      currency: base,
                      summaryKpis: [
                        { label: 'إجمالي الأصول', value: `${money(q.data?.assets?.total ?? 0)} ${base}`, tone: 'indigo' },
                        { label: 'إجمالي الالتزامات', value: `${money(q.data?.liabilities?.total ?? 0)} ${base}`, tone: 'amber' },
                        { label: 'حقوق الملكية', value: `${money(q.data?.equity?.total ?? 0)} ${base}`, tone: 'emerald' },
                      ],
                      columns: [
                        { key: 'section', header: 'القسم', width: 20 },
                        { key: 'code', header: 'رمز الحساب', width: 14 },
                        { key: 'nameAr', header: 'الحساب', width: 30 },
                        { key: 'amount', header: `المبلغ (${base})`, width: 18, type: 'currency', isTotal: true },
                      ],
                      data: [
                        ...(q.data?.assets?.lines ?? []).map((l: any) => ({ ...l, section: 'الأصول' })),
                        ...(q.data?.liabilities?.lines ?? []).map((l: any) => ({ ...l, section: 'الالتزامات' })),
                        ...(q.data?.equity?.lines ?? []).map((l: any) => ({ ...l, section: 'حقوق الملكية' })),
                      ],
                    })
                  }
                  title="طباعة ملكية A4 للميزانية العمومية"
                >
                  <Printer className="size-3.5" /> طباعة ملكية (A4)
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="card mb-5 p-4 relative z-30 overflow-visible bg-white/95 dark:bg-[#0c1324]/95 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-end gap-3.5">
        <Field label="كما في تاريخ"><input className="input w-40" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></Field>
        <Field label="الفرع / المركز المالي">
          <select className="input min-w-[14rem] sm:w-72 font-medium" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="ALL">الكل (قوائم موحدة - Consolidated SAR)</option>
            {(branchesQ.data ?? []).map((b: any) => (
              <option key={b.id} value={b.id}>{b.nameAr} ({b.functionalCurrency || b.countryCode})</option>
            ))}
          </select>
        </Field>
        {branchId === 'ALL' && (
          <div className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="font-bold">قوائم موحدة:</span> تشمل المركز الرئيسي وفرع مصر مع تسوية القيود المتبادلة.
          </div>
        )}
        {q.data && (
          <div className="ms-auto flex items-center gap-2 pb-1">
            {!isBalanced && (
              <span className="text-sm text-rose-600 font-bold">الفرق: <span className="num font-mono">{money(q.data.difference ?? '0.00')}</span></span>
            )}
            <BalancedBadge ok={isBalanced} />
          </div>
        )}
      </div>

      {/* Executive KPI Cards */}
      {q.data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
          <div className="card p-3.5 border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-950/20">
            <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">إجمالي الأصول (Assets)</div>
            <div className="text-xl font-black font-mono text-emerald-900 dark:text-emerald-200 mt-1">{money(q.data?.assets?.total ?? '0.00')}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5">نقدية، بنوك، عملاء، أصول ثابتة</div>
          </div>

          <div className="card p-3.5 border-amber-200/80 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-950/20">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">إجمالي الالتزامات (Liabilities)</div>
            <div className="text-xl font-black font-mono text-amber-900 dark:text-amber-200 mt-1">{money(q.data?.liabilities?.total ?? '0.00')}</div>
            <div className="text-[10px] text-amber-600 mt-0.5">موردين، ضريبة VAT، مستحقات</div>
          </div>

          <div className="card p-3.5 border-indigo-200/80 dark:border-indigo-800/50 bg-indigo-50/30 dark:bg-indigo-950/20">
            <div className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-400">حقوق الملكية + أرباح الفترة</div>
            <div className="text-xl font-black font-mono text-indigo-900 dark:text-indigo-200 mt-1">
              {money(parseFloat(q.data?.equity?.total ?? '0') + parseFloat(q.data?.currentEarnings ?? '0'))}
            </div>
            <div className="text-[10px] text-indigo-600 mt-0.5">
              رأس المال + أرباح الفترة ({money(q.data?.currentEarnings ?? '0.00')})
            </div>
          </div>

          <div className={`card p-3.5 border transition-all ${isBalanced ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-950/20'}`}>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-semibold">توازن المعادلة المحاسبية</span>
              {isBalanced ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-rose-600" />}
            </div>
            <div className="text-base font-black font-mono text-slate-900 dark:text-white mt-1">
              {isBalanced ? 'الأصول = الالتزامات + الملكية' : `عدم توازن: ${money(q.data?.difference ?? '0.00')}`}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
              المجموع: {money(q.data?.liabilitiesAndEquity ?? '0.00')}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Balance Sheet Visual Structure */}
      {q.data && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-5 print:hidden">
          <ExecutiveChartCard
            title="هيكل المركز المالي والتوازن المحاسبي"
            subtitle={`الأصول مقابل الالتزامات وحقوق الملكية والأرباح غير المقفلة (${base})`}
            icon={BarChart3}
            accent="indigo"
            className="lg:col-span-2"
          >
            <ExecutiveBarChart
              categories={['إجمالي الأصول', 'إجمالي الالتزامات', 'حقوق الملكية', 'أرباح الفترة', 'الالتزامات والملكية']}
              series={[
                {
                  name: `الرصيد (${base})`,
                  data: [
                    Number(q.data?.assets?.total ?? 0),
                    Number(q.data?.liabilities?.total ?? 0),
                    Number(q.data?.equity?.total ?? 0),
                    Number(q.data?.currentEarnings ?? 0),
                    Number(q.data?.liabilitiesAndEquity ?? 0),
                  ],
                  color: '#4f46e5',
                  colorEnd: '#10b981',
                },
              ]}
              height={220}
              unit={base}
              emptyText="لا توجد أرصدة مسجلة في الميزانية بعد"
            />
          </ExecutiveChartCard>

          <ExecutiveChartCard
            title="توزيع مكونات الأصول"
            subtitle="أبرز حسابات الأصول المساهمة في المركز المالي"
            icon={PieChart}
            accent="emerald"
          >
            <ExecutiveDonutChart
              data={(q.data?.assets?.lines ?? [])
                .filter((l: any) => Number(l.amount) > 0)
                .slice(0, 6)
                .map((l: any) => ({ name: l.nameAr, value: Number(l.amount) }))}
              centerValue={money(q.data?.assets?.total ?? 0)}
              centerLabel={`الأصول (${base})`}
              height={220}
              unit={base}
              emptyText="لا توجد أصول"
            />
          </ExecutiveChartCard>
        </div>
      )}

      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Assets Side */}
          <div className="card overflow-hidden shadow-sm">
            <div className="bg-slate-900 text-white dark:bg-slate-950 px-4 py-3 font-bold text-sm flex items-center justify-between">
              <span>الأصول والموجودات (Assets)</span>
              <span className="font-mono text-xs font-bold text-emerald-400">{money(q.data?.assets?.total ?? '0.00')}</span>
            </div>
            <table className="table w-full">
              <tbody>
                <Section title="الأصول المتداولة والثابتة" s={q.data?.assets} badgeColor="bg-emerald-500" />
              </tbody>
            </table>
          </div>

          {/* Liabilities & Equity Side */}
          <div className="card overflow-hidden shadow-sm">
            <div className="bg-slate-900 text-white dark:bg-slate-950 px-4 py-3 font-bold text-sm flex items-center justify-between">
              <span>الالتزامات وحقوق الملكية (Liabilities & Equity)</span>
              <span className="font-mono text-xs font-bold text-indigo-400">{money(q.data?.liabilitiesAndEquity ?? '0.00')}</span>
            </div>
            <table className="table w-full">
              <tbody>
                <Section title="الالتزامات والخصوم" s={q.data?.liabilities} badgeColor="bg-amber-500" />
                <Section title="حقوق الملكية ورأس المال" s={q.data?.equity} badgeColor="bg-indigo-500" />
                <tr className="bg-slate-50/80 font-bold dark:bg-slate-800/40 text-slate-900 dark:text-slate-100">
                  <td className="px-4 py-2.5">أرباح (خسائر) الفترة الحالية غير المقفلة</td>
                  <td className="num px-4 font-mono font-bold text-emerald-700 dark:text-emerald-400">{money(q.data?.currentEarnings ?? '0.00')}</td>
                </tr>
                <tr className="bg-slate-800 text-white dark:bg-slate-900 font-black text-sm border-t-2 border-slate-700">
                  <td className="px-4 py-3 text-white">إجمالي الالتزامات وحقوق الملكية</td>
                  <td className="num px-4 font-mono font-black text-white text-base">{money(q.data?.liabilitiesAndEquity ?? '0.00')}</td>
                </tr>
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
  const periods = useQuery({
    queryKey: ['periods'],
    queryFn: () => api.get<any>('/fiscal-periods').then((r: any) => (Array.isArray(r) ? r : (r?.data ?? []))),
  });
  const [sel, setSel] = useState<string>('');
  const rawPeriods: any = periods.data;
  const periodItems: any[] = Array.isArray(rawPeriods) ? rawPeriods : (rawPeriods?.data ?? []);
  const firstOpen = periodItems.find((p) => p.status === 'OPEN' && !p.isAdjustmentPeriod);
  const periodId = sel || firstOpen?.id || '';
  const checks = useQuery({ queryKey: ['close-checks', periodId], enabled: !!periodId, queryFn: () => api.get<any>(`/closing/periods/${periodId}/checks`) });
  const [reopen, setReopen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['periods'] }); qc.invalidateQueries({ queryKey: ['close-checks'] }); qc.invalidateQueries({ queryKey: ['snapshots'] }); qc.invalidateQueries({ queryKey: ['fiscal-year'] }); };
  const close = useMutation({ mutationFn: () => api.post(`/closing/periods/${periodId}/close`, {}), onSuccess: () => { toast.success('تم إقفال الفترة وحفظ اللقطة'); setConfirmClose(false); refresh(); }, onError: (e) => toast.error(e) });
  if (periods.isLoading) return <Loading />;
  if (periods.error) return <ErrorState error={periods.error} />;
  const p = periodItems.find((x) => x.id === periodId);
  return (
    <div>
      <PageHeader
        title="إقفال الفترات"
        subtitle="الإقفال يتم بالترتيب بعد اجتياز الفحوصات، وينشئ لقطة تاريخية محمية ببصمة SHA-256. إعادة الفتح تتطلب صلاحية وسببًا."
        actions={
          <ExportMenu
            title={`تقرير فحوصات إقفال الفترة — ${p?.name || ''}`}
            columns={[
              { key: 'code', header: 'الرمز', width: 16 },
              { key: 'titleAr', header: 'الفحص', width: 28 },
              { key: 'status', header: 'النتيجة', width: 14 },
              { key: 'message', header: 'التفاصيل', width: 34 },
            ]}
            data={checks.data?.results ?? []}
          />
        }
      />
      {periodItems.length === 0 ? <div className="card"><EmptyState text="لا توجد فترات مالية. أنشئ سنة مالية أولًا." /></div> : (
        <div className="grid grid-cols-[260px_1fr] gap-4">
          <div className="card max-h-[70vh] overflow-y-auto p-2">
            {periodItems.filter((x) => !x.isAdjustmentPeriod).map((x) => (
              <button key={x.id} onClick={() => setSel(x.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm ${x.id === periodId ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                <span>{x.name}</span><Badge color={PERIOD_STATUS[x.status]?.color}>{PERIOD_STATUS[x.status]?.label ?? x.status}</Badge>
              </button>
            ))}
          </div>
          <div>
            {p && (
              <div className="card mb-4 flex flex-wrap items-center gap-4 p-4">
                <div><div className="text-xs text-slate-500">الفترة</div><div className="text-lg font-bold">{p.name}</div></div>
                <div><div className="text-xs text-slate-500">من - إلى</div><div>{date(p.startDate)} — {date(p.endDate)}</div></div>
                <Badge color={PERIOD_STATUS[p.status]?.color}>{PERIOD_STATUS[p.status]?.label ?? p.status}</Badge>
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
                    {(checks.data?.results ?? []).map((r: any) => (
                      <tr key={r.code}><td className="font-mono text-xs">{r.code}</td><td>{r.titleAr}</td><td><Badge color={CHECK_STATUS[r.status]?.color}>{CHECK_STATUS[r.status]?.label ?? r.status}</Badge></td><td className="text-xs text-slate-600 dark:text-slate-400">{r.message ?? ''}</td></tr>
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
  const q = useQuery({ queryKey: ['snapshots'], queryFn: () => api.get<any[]>('/snapshots') });
  const [sel, setSel] = useState<string | null>(null);
  const snap = useQuery({ queryKey: ['snapshot', sel], enabled: !!sel, queryFn: () => api.get<any>(`/snapshots/${sel}`) });

  const rawQ: any = q.data;
  const snapshotsList: any[] = Array.isArray(rawQ) ? rawQ : (rawQ?.data ?? []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="لقطات الإقفال التاريخية (Snapshots)"
        subtitle="لقطة رقمية لكل فترة تم إقفالها لحفظ الأرقام التاريخية. البيانات محمية ببصمة تشفير SHA-256 يتحقق منها النظام لمنع أي تعديل لاحق."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="سجل لقطات الإقفال التاريخية (Snapshots)"
              columns={[
                { key: 'periodName', header: 'الفترة المالية', width: 20 },
                { key: 'version', header: 'الإصدار', width: 10 },
                { key: 'kind', header: 'النوع', width: 14 },
                { key: 'dataHash', header: 'بصمة البيانات SHA-256', width: 32 },
                { key: 'createdAt', header: 'التاريخ', width: 18 },
                { key: 'createdBy', header: 'بواسطة', width: 16 },
              ]}
              data={snapshotsList}
            />
          </div>
        }
      />
      <div className="card overflow-hidden">
        {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} /> : snapshotsList.length === 0 ? <EmptyState text="لا توجد لقطات بعد؛ تنشأ تلقائيًا عند إقفال أول فترة." /> : (
          <table className="table">
            <thead><tr><th>الفترة</th><th>الإصدار</th><th>النوع</th><th>البصمة (SHA-256)</th><th>التاريخ</th><th>بواسطة</th></tr></thead>
            <tbody>{snapshotsList.map((s) => <tr key={s.id} className="cursor-pointer" onClick={() => setSel(s.id)}><td>{s.periodName}</td><td className="num">{s.version}</td><td>{s.kind}</td><td className="font-mono text-xs" dir="ltr">{s.dataHash.slice(0, 24)}…</td><td>{dateTime(s.createdAt)}</td><td>{s.createdBy}</td></tr>)}</tbody>
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

  const rawPeriodsList: any = periods.data;
  const periodList: any[] = Array.isArray(rawPeriodsList) ? rawPeriodsList : (rawPeriodsList?.data ?? []);
  const open = periodList.filter((p) => p.status === 'OPEN' && !p.isAdjustmentPeriod);
  const current = periodList.find((p) => !p.isAdjustmentPeriod && p.startDate <= today() && p.endDate >= today());

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
            onClick={() =>
              void ExportEngine.exportDetailPdf({
                title: 'الملخص التنفيذي للوحة المؤشرات المالية',
                subtitle: 'تقرير حي للأداء المالي والمركز المالي والقيود المحاسبية للعام الجاري',
                filename: `executive-dashboard-${today()}`,
                docDate: today(),
                periodLabel: `من ${yearStart()} إلى ${today()}`,
                currency: base,
                kpis: [
                  { label: `إجمالي الأصول (${base})`, value: money(bs.data?.assets?.total ?? 0), tone: 'indigo' },
                  { label: `إيرادات العام (${base})`, value: money(ytd.data?.revenue ?? 0), tone: 'emerald' },
                  { label: `صافي الربح (${base})`, value: money(ytd.data?.netProfit ?? 0), tone: Number(ytd.data?.netProfit ?? 0) >= 0 ? 'emerald' : 'rose' },
                  { label: 'الموظفون / المشاريع', value: `${emps.data?.meta?.total ?? 0} موظف • ${prjs.data?.meta?.total ?? 0} مشروع`, tone: 'sky' },
                ],
                sections: [
                  {
                    title: 'ملخص مؤشرات الأداء المالي والمركز المالي',
                    columns: [
                      { key: 'metric', header: 'المؤشر المالي / التشغيلي', width: 32 },
                      { key: 'category', header: 'التصنيف', width: 18 },
                      { key: 'value', header: `القيمة (${base})`, width: 20, type: 'currency' },
                    ],
                    data: [
                      { metric: 'إجمالي الأصول', category: 'المركز المالي', value: Number(bs.data?.assets?.total ?? 0) },
                      { metric: 'إجمالي الالتزامات', category: 'المركز المالي', value: Number(bs.data?.liabilities?.total ?? 0) },
                      { metric: 'إجمالي حقوق الملكية', category: 'المركز المالي', value: Number(bs.data?.equity?.total ?? 0) },
                      { metric: 'إيرادات السنة حتى تاريخه (YTD)', category: 'قائمة الدخل', value: Number(ytd.data?.revenue ?? 0) },
                      { metric: 'التكاليف المباشرة (YTD)', category: 'قائمة الدخل', value: Number(ytd.data?.directCost ?? 0) },
                      { metric: 'مجمل الربح (Gross Profit)', category: 'قائمة الدخل', value: Number(ytd.data?.grossProfit ?? 0) },
                      { metric: 'المصروفات التشغيلية (OpEx)', category: 'قائمة الدخل', value: Number(ytd.data?.operatingExpenses ?? 0) },
                      { metric: 'صافي الربح التشغيلي (Net Profit)', category: 'قائمة الدخل', value: Number(ytd.data?.netProfit ?? 0) },
                    ],
                  },
                ],
                signatureLabels: ['إعداد الإدارة المالية', 'مراجعة المدير المالي', 'اعتماد الإدارة العليا'],
              })
            }
            title="طباعة / PDF ملكي للملخص التنفيذي"
          >
            <Printer className="size-3.5 text-slate-600 dark:text-slate-300" /> طباعة الملخص الملكي
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

  // Queries (Unconditional loading with period filtering)
  const empProf = useQuery({
    queryKey: ['/profitability/employees', periodId],
    queryFn: () => api.get<any>('/profitability/employees', periodId ? { periodId } : {}),
  });

  const projectProf = useQuery({
    queryKey: ['/profitability/projects', periodId],
    queryFn: () => api.get<any[]>('/profitability/projects', periodId ? { periodId } : {}),
  });

  const clientProf = useQuery({
    queryKey: ['/profitability/clients', periodId],
    queryFn: () => api.get<any[]>('/profitability/clients', periodId ? { periodId } : {}),
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

  const rawProj: any = projectProf.data;
  const rawClient: any = clientProf.data;
  const rawPrices: any = servicePrices.data;
  const projects = Array.isArray(rawProj) ? rawProj : (rawProj?.data ?? []);
  const clients = Array.isArray(rawClient) ? rawClient : (rawClient?.data ?? []);
  const prices = Array.isArray(rawPrices) ? rawPrices : (rawPrices?.data ?? []);

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="لوحة الرقابة والذكاء المالي والتنفيذي (Executive Intelligence)"
        subtitle="مؤشرات الأداء المالي والتشغيلي المباشر للكوادر والمشاريع وهوامش الربحية واستغلال الطاقة الاستيعابية وفق أفضل الممارسات المحاسبية العالمية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title="تقرير الذكاء المالي والتنفيذي (Executive Intelligence)"
              columns={
                activeTab === 'feasibility'
                  ? [
                      { key: 'employeeCode', header: 'الكود', width: 12 },
                      { key: 'employeeName', header: 'الموظف', width: 22 },
                      { key: 'monthlyCost', header: 'التكلفة الشهرية', width: 15, type: 'currency', isTotal: true },
                      { key: 'monthlyBillingRate', header: 'السعر الشهري', width: 15, type: 'currency', isTotal: true },
                      { key: 'status', header: 'الجدوى', width: 14 },
                    ]
                  : activeTab === 'margin-gap'
                    ? [
                        { key: 'projectCode', header: 'الكود', width: 12 },
                        { key: 'projectName', header: 'المشروع', width: 22 },
                        { key: 'revenueBase', header: 'الإيراد', width: 15, type: 'currency', isTotal: true },
                        { key: 'totalCostBase', header: 'التكلفة', width: 15, type: 'currency', isTotal: true },
                        { key: 'grossProfitBase', header: 'الربح', width: 15, type: 'currency', isTotal: true },
                        { key: 'actualMargin', header: 'الهامش الفعلي %', width: 14, type: 'percent' },
                      ]
                    : [
                        { key: 'employeeCode', header: 'الكود', width: 12 },
                        { key: 'employeeName', header: 'الموظف', width: 22 },
                        { key: 'allocatedPct', header: 'التخصيص %', width: 12, type: 'percent' },
                        { key: 'unutilizedPct', header: 'غير المستغل %', width: 12, type: 'percent' },
                        { key: 'unutilizedCostBase', header: 'تكلفة التفرغ', width: 15, type: 'currency', isTotal: true },
                        { key: 'revenueBase', header: 'الإيراد', width: 15, type: 'currency', isTotal: true },
                      ]
              }
              data={activeTab === 'feasibility' ? feasibilityList : activeTab === 'margin-gap' ? targetGapProjects : employees}
            />
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
              <div className="card cyber-card-cyan p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-black tracking-wide text-amber-600 dark:text-amber-400">
                      <Sparkles className="size-4" /> الرقابة المالية الإستراتيجية
                    </div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">مصفوفة الرقابة التنفيذية ومؤشرات الأداء المالي</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
                      منظومة محاسبية متقدمة تربط التكلفة المحملة للكوادر والمطورين مع إيرادات المشاريع وهوامش الربحية التعاقدية بدقة تامة.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-end bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/25">
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">معدل العائد على تكلفة الموظف</div>
                      <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{costRevenueRatio}x</div>
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
              <div className="card cyber-card-cyan p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-sm">تحليل كفاءة وجدوى أسعار الخدمات ومقارنة التكلفة المباشرة بالأسعار البيعية</h4>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    يقارن هذا التقرير التكلفة الشهرية الكاملة لكل مطور مع سعر بيع خدمته للعميل (شهري، يومي، أو ساعي) لتحديد ما إذا كان السعر يغطي التكلفة ويحقق هامش ربح مقبول.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 px-2.5 py-1 rounded-lg font-extrabold">
                    {healthyEmployees.length} رابح
                  </span>
                  {losingEmployees.length > 0 && (
                    <span className="bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/25 px-2.5 py-1 rounded-lg font-extrabold">
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
