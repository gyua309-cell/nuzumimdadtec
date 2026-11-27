import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Banknote,
  CheckCircle2,
  Coins,
  FileCheck2,
  Landmark,
  RefreshCw,
  Scale,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { date, money, today } from '../lib/format';
import { ExportMenu } from '../components/ExportMenu';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import { SearchableSelect } from '../components/SearchableSelect';
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner, Stat, useToast } from '../components/ui';

export function TreasuryHubPage() {
  const base = useBaseCurrency();
  const qc = useQueryClient();
  const toast = useToast();
  const [reconModalOpen, setReconModalOpen] = useState(false);

  const overviewQ = useQuery({
    queryKey: ['treasury-overview'],
    queryFn: () => api.get<any>('/treasury/overview'),
  });
  const empsQ = useQuery({
    queryKey: ['employees-ref-treasury'],
    queryFn: () => api.get<any>('/employees', { pageSize: '200' }),
  });

  const data = overviewQ.data;
  const accounts: any[] = data?.accounts ?? [];
  const banks = accounts.filter((a) => a.kind === 'BANK');
  const cashboxes = accounts.filter((a) => a.kind === 'CASH');
  const recentVouchers: any[] = data?.recentVouchers ?? [];
  const emps: any[] = Array.isArray(empsQ.data) ? empsQ.data : (empsQ.data?.data ?? []);

  const totalLiquidity = Number(data?.totalLiquidity ?? (Number(data?.totalBankBalance || 0) + Number(data?.totalCashBalance || 0)));

  const reconQ = useQuery({
    queryKey: ['treasury-reconciliations'],
    queryFn: () => api.get<any[]>('/treasury/reconciliations').catch(() => []),
  });

  const employeeLinkedTotals = useMemo(() => {
    const map = new Map<string, { name: string; code: string; receipts: number; payments: number; count: number }>();
    for (const v of recentVouchers) {
      if (v.status !== 'POSTED' || !v.employeeId) continue;
      const cur = map.get(v.employeeId) ?? {
        name: v.employeeName || 'موظف',
        code: v.employeeCode || '',
        receipts: 0,
        payments: 0,
        count: 0,
      };
      if (v.voucherType === 'RECEIPT') cur.receipts += Number(v.amountBase || 0);
      else cur.payments += Number(v.amountBase || 0);
      cur.count += 1;
      map.set(v.employeeId, cur);
    }
    return Array.from(map.entries()).map(([id, row]) => ({ id, ...row }));
  }, [recentVouchers]);

  if (overviewQ.isLoading) return <Loading />;
  if (overviewQ.error) return <ErrorState error={overviewQ.error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز الخزينة والبنوك والشيكات (Treasury & Cash Command)"
        subtitle="إدارة موحّدة للحسابات البنكية والخزائن النقدية، سندات القبض والصرف، حافظة الشيكات، التسوية البنكية، والربط المباشر بمركز تكلفة الموظف"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void overviewQ.refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <ExportMenu
              title="تقرير أرصدة الخزينة والبنوك والسيولة"
              currency={base}
              columns={[
                { key: 'code', header: 'الكود', width: 14 },
                { key: 'name', header: 'البنك / الخزينة', width: 28 },
                { key: 'kind', header: 'النوع', width: 12 },
                { key: 'currencyCode', header: 'العملة', width: 10 },
                { key: 'glAccountCode', header: 'حساب الأستاذ', width: 14 },
                { key: 'totalInflows', header: 'إجمالي الوارد', width: 16, type: 'currency', isTotal: true },
                { key: 'totalOutflows', header: 'إجمالي المنصرف', width: 16, type: 'currency', isTotal: true },
                { key: 'balance', header: 'الرصيد الحالي', width: 16, type: 'currency', isTotal: true },
              ]}
              data={accounts}
              summaryKpis={[
                { label: 'إجمالي السيولة', value: `${money(totalLiquidity)} ${base}`, tone: 'navy' },
                { label: 'أرصدة البنوك', value: `${money(data?.totalBankBalance || 0)} ${base}`, tone: 'sky' },
                { label: 'أرصدة الخزائن', value: `${money(data?.totalCashBalance || 0)} ${base}`, tone: 'emerald' },
              ]}
            />
            <button onClick={() => setReconModalOpen(true)} className="btn-secondary text-xs flex items-center gap-1.5">
              <Scale className="size-3.5 text-indigo-600" />
              التسوية البنكية
            </button>
            <Link to="/treasury/receipts" className="btn-secondary text-xs flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 border-emerald-400/50">
              <ArrowDownCircle className="size-3.5" />
              + سند قبض
            </Link>
            <Link to="/treasury/payments" className="btn-primary text-xs flex items-center gap-1.5">
              <ArrowUpCircle className="size-3.5" />
              + سند صرف
            </Link>
          </div>
        }
      />

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat
          label="إجمالي السيولة النقدية والبنكية"
          value={`${money(totalLiquidity)} ${base}`}
          icon={Coins}
          tone="indigo"
          hint={`${accounts.length} حساب نشط بالدفاتر`}
        />
        <Stat
          label="أرصدة الحسابات البنكية"
          value={`${money(data?.totalBankBalance || 0)} ${base}`}
          icon={Landmark}
          tone="blue"
          hint={`${banks.length} حساب بنكي مرتبط بالأستاذ`}
        />
        <Stat
          label="أرصدة الخزائن والصناديق"
          value={`${money(data?.totalCashBalance || 0)} ${base}`}
          icon={Vault}
          tone="green"
          hint={`${cashboxes.length} خزينة نقدية`}
        />
        <Stat
          label="سندات القبض / الصرف المرحلة"
          value={`${money(data?.voucherStats?.receiptTotal || 0)} / ${money(data?.voucherStats?.paymentTotal || 0)}`}
          icon={Banknote}
          tone="amber"
          hint={`${data?.voucherStats?.receiptCount || 0} قبض • ${data?.voucherStats?.paymentCount || 0} صرف`}
        />
        <Stat
          label="حافظة الشيكات قيد التحصيل / الصرف"
          value={`${money(data?.chequeStats?.pendingIncomingTotal || 0)} / ${money(data?.chequeStats?.pendingOutgoingTotal || 0)}`}
          icon={FileCheck2}
          tone="purple"
          hint={`مرتدة: ${data?.chequeStats?.bouncedCount || 0} شيك`}
        />
      </div>

      {/* Quick Interconnected Navigation Modules */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { to: '/treasury/banks', label: 'البنوك والتحويلات', sub: `${banks.length} حسابات بنكية`, icon: Landmark, color: 'text-blue-600 bg-blue-500/10 border-blue-400/30' },
          { to: '/treasury/cashboxes', label: 'الخزائن النقدية', sub: `${cashboxes.length} خزائن`, icon: Vault, color: 'text-emerald-600 bg-emerald-500/10 border-emerald-400/30' },
          { to: '/treasury/receipts', label: 'سندات القبض', sub: `${data?.voucherStats?.receiptCount || 0} سند مرحّل`, icon: ArrowDownCircle, color: 'text-teal-600 bg-teal-500/10 border-teal-400/30' },
          { to: '/treasury/payments', label: 'سندات الصرف', sub: `${data?.voucherStats?.paymentCount || 0} سند مرحّل`, icon: ArrowUpCircle, color: 'text-rose-600 bg-rose-500/10 border-rose-400/30' },
          { to: '/treasury/cheques', label: 'حافظة الشيكات', sub: `${(data?.chequeStats?.pendingIncomingCount || 0) + (data?.chequeStats?.pendingOutgoingCount || 0)} شيك نشط`, icon: FileCheck2, color: 'text-purple-600 bg-purple-500/10 border-purple-400/30' },
          { to: '/reports/cost-centers', label: 'تكلفة الموظفين', sub: 'مركز التكلفة = الموظف', icon: Users, color: 'text-indigo-600 bg-indigo-500/10 border-indigo-400/30' },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="card p-3.5 hover:border-indigo-400/70 hover:shadow-md transition-all flex items-center gap-3 group"
          >
            <div className={`size-10 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${item.color}`}>
              <item.icon className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-900 dark:text-white truncate">{item.label}</div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate mt-0.5">{item.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Live Bank & Cashbox Directory Cards */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="size-4 text-indigo-600" />
            الأرصدة الحية للبنوك والخزائن المرتبطة بدفتر الأستاذ
          </h3>
          <div className="flex items-center gap-2">
            <Link to="/treasury/banks" className="btn-secondary text-xs">إدارة البنوك</Link>
            <Link to="/treasury/cashboxes" className="btn-secondary text-xs">إدارة الخزائن</Link>
          </div>
        </div>
        {accounts.length === 0 ? (
          <EmptyState text="لا توجد حسابات بنكية أو خزائن مسجلة حتى الآن." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-900/50 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Badge color={acc.kind === 'CASH' ? 'green' : 'blue'}>
                        {acc.kind === 'CASH' ? 'خزينة نقدية' : 'حساب بنكي'}
                      </Badge>
                      <span className="font-mono text-[11px] font-bold text-slate-500">{acc.code}</span>
                    </div>
                    <div className="text-sm font-black text-slate-900 dark:text-white mt-1.5">{acc.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {acc.bankName || 'الصندوق النقدي'} • GL: <span className="font-mono font-bold">{acc.glAccountCode}</span>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    {acc.currencyCode}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-end justify-between">
                  <div>
                    <div className="text-[10.5px] text-slate-500">الرصيد الدفتري الحالي</div>
                    <div className={`text-xl font-black font-mono ${Number(acc.balance) < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                      {money(acc.balance)} <span className="text-xs font-bold text-slate-500">{acc.currencyCode}</span>
                    </div>
                  </div>
                  <Link
                    to={`/reports/account-statement?accountId=${acc.glAccountId}`}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    كشف الحساب ←
                  </Link>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>وارد: <strong className="font-mono text-emerald-600">{money(acc.totalInflows)}</strong></span>
                  <span>منصرف: <strong className="font-mono text-rose-600">{money(acc.totalOutflows)}</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Split: Recent Vouchers + Employee Cost Center Treasury Summary */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card p-5 xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <ArrowLeftRight className="size-4 text-emerald-600" />
              أحدث سندات القبض والصرف
            </h3>
            <div className="flex gap-2">
              <Link to="/treasury/receipts" className="text-xs font-bold text-emerald-600 hover:underline">الكل (قبض)</Link>
              <Link to="/treasury/payments" className="text-xs font-bold text-rose-600 hover:underline">الكل (صرف)</Link>
            </div>
          </div>
          {recentVouchers.length === 0 ? (
            <EmptyState text="لا توجد سندات قبض أو صرف مسجلة بعد." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="py-2 px-3">رقم السند</th>
                    <th className="py-2 px-3">النوع</th>
                    <th className="py-2 px-3">التاريخ</th>
                    <th className="py-2 px-3">الخزينة / البنك</th>
                    <th className="py-2 px-3">المستفيد / الموظف (مركز التكلفة)</th>
                    <th className="py-2 px-3">المبلغ</th>
                    <th className="py-2 px-3">القيد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {recentVouchers.slice(0, 8).map((v) => (
                    <tr key={v.id}>
                      <td className="py-2.5 px-3 font-mono font-bold">{v.voucherNo}</td>
                      <td className="py-2.5 px-3">
                        <Badge color={v.voucherType === 'RECEIPT' ? 'green' : 'red'}>
                          {v.voucherType === 'RECEIPT' ? 'قبض' : 'صرف'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{date(v.voucherDate)}</td>
                      <td className="py-2.5 px-3">{v.treasuryAccountName}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold">{v.beneficiaryName || '—'}</div>
                        {v.employeeName && (
                          <div className="text-[10.5px] text-indigo-600 font-bold">مركز تكلفة: {v.employeeName}</div>
                        )}
                      </td>
                      <td className={`py-2.5 px-3 font-mono font-extrabold ${v.voucherType === 'RECEIPT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {money(v.amountTx)} {v.currencyCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <JournalLinkBadge entryId={v.journalEntryId} entryNo={v.journalEntryNo} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="size-4 text-indigo-600" />
              الربط بمراكز التكلفة (الموظفون)
            </h3>
            <Link to="/reports/cost-centers" className="text-xs font-bold text-indigo-600 hover:underline">التقرير الشامل</Link>
          </div>
          {employeeLinkedTotals.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              عند تسجيل سندات صرف أو قبض أو شيكات وربطها بموظف كمركز تكلفة ستظهر ملخصاتها هنا فوراً وتصب في قائمة الدخل ومراكز التكلفة.
            </div>
          ) : (
            <div className="space-y-2.5">
              {employeeLinkedTotals.map((e) => (
                <div key={e.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-extrabold text-slate-900 dark:text-white">{e.name}</div>
                    <div className="text-[11px] text-slate-500">{e.code} • {e.count} حركات خزينة</div>
                  </div>
                  <div className="text-end font-mono">
                    <div className="text-emerald-600 font-bold">+{money(e.receipts)}</div>
                    <div className="text-rose-600 font-bold">-{money(e.payments)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {Array.isArray(reconQ.data) && reconQ.data.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">آخر التسويات البنكية:</div>
              <div className="space-y-1.5">
                {reconQ.data.slice(0, 3).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
                    <span className="font-bold">{r.bankAccountName}</span>
                    <span className="font-mono text-slate-500">{date(r.statementDate)}</span>
                    <Badge color={Math.abs(Number(r.difference || 0)) < 0.01 ? 'green' : 'amber'}>
                      فرق: {money(r.difference)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bank Reconciliation Modal */}
      {reconModalOpen && (
        <BankReconciliationModal
          banks={banks.length > 0 ? banks : accounts}
          employees={emps}
          onClose={() => setReconModalOpen(false)}
          onSuccess={() => {
            setReconModalOpen(false);
            qc.invalidateQueries({ queryKey: ['treasury-overview'] });
            qc.invalidateQueries({ queryKey: ['treasury-reconciliations'] });
            toast.success('تمت التسوية البنكية وحفظ المطابقة بنجاح');
          }}
        />
      )}
    </div>
  );
}

function BankReconciliationModal({
  banks,
  employees,
  onClose,
  onSuccess,
}: {
  banks: any[];
  employees: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id || '');
  const [statementDate, setStatementDate] = useState(today());
  const selectedBank = banks.find((b) => b.id === bankAccountId) || banks[0];
  const [statementBalance, setStatementBalance] = useState(() => String(selectedBank?.balance ?? 0));
  const [bankCharges, setBankCharges] = useState('0');
  const [employeeId, setEmployeeId] = useState('');
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      api.post('/treasury/reconciliations', {
        bankAccountId,
        statementDate,
        statementBalance: Number(statementBalance || 0),
        bankCharges: Number(bankCharges || 0),
        employeeId: employeeId || undefined,
        notes: notes || undefined,
      }),
    onSuccess,
    onError: (e) => toast.error(e),
  });

  const bookBal = Number(selectedBank?.balance || 0);
  const afterCharges = bookBal - Number(bankCharges || 0);
  const diff = Number(statementBalance || 0) - afterCharges;

  return (
    <Modal
      open
      onClose={onClose}
      title="التسوية البنكية ومطابقة كشف الحساب (Bank Reconciliation)"
      size="lg"
      saving={mut.isPending}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button type="button" className="btn-primary text-xs flex items-center gap-1.5" disabled={mut.isPending || !bankAccountId} onClick={() => mut.mutate()}>
            {mut.isPending && <Spinner className="size-3.5" />}
            اعتماد التسوية وترحيل الفروقات
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="الحساب البنكي / الخزينة" required>
            <SearchableSelect
              clearable={false}
              value={bankAccountId}
              onChange={(val) => {
                setBankAccountId(val);
                const b = banks.find((x) => x.id === val);
                if (b) setStatementBalance(String(b.balance ?? 0));
              }}
              options={banks.map((b) => ({ value: b.id, label: `${b.name} (${money(b.balance)} ${b.currencyCode})` }))}
            />
          </Field>
          <Field label="تاريخ كشف حساب البنك" required>
            <input type="date" className="input w-full font-mono" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="الرصيد الدفتري الحالي بالنظام">
            <input className="input w-full font-mono font-bold bg-slate-100 dark:bg-slate-800" value={money(bookBal)} readOnly />
          </Field>
          <Field label="رصيد كشف البنك الفعلي *" required>
            <input type="number" step="any" className="input w-full font-mono font-bold" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} />
          </Field>
          <Field label="عمولات/رسوم بنكية غير مسجلة">
            <input type="number" step="any" className="input w-full font-mono" value={bankCharges} onChange={(e) => setBankCharges(e.target.value)} />
          </Field>
        </div>

        <Field label="تحميل العمولة على الموظف / مركز التكلفة (اختياري)">
          <SearchableSelect
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="— بدون تخصيص لموظف —"
            options={employees.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullNameAr}` }))}
          />
        </Field>

        <Field label="ملاحظات التسوية">
          <input className="input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: مطابقة كشف حساب شهر نوفمبر" />
        </Field>

        <div className={`p-3 rounded-xl border flex items-center justify-between font-bold ${Math.abs(diff) < 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'}`}>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4" />
            الفرق بعد تسوية العمولات:
          </span>
          <span className="font-mono text-sm">{money(diff)} {selectedBank?.currencyCode || ''}</span>
        </div>
      </div>
    </Modal>
  );
}
