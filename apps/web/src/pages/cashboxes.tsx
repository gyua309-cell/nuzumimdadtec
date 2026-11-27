import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Plus,
  RefreshCw,
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

export function CashboxesPage() {
  const base = useBaseCurrency();
  const qc = useQueryClient();
  const toast = useToast();
  const [newCashModal, setNewCashModal] = useState(false);
  const [selectedCashId, setSelectedCashId] = useState('');

  const accountsQ = useQuery({
    queryKey: ['treasury-cashboxes'],
    queryFn: () => api.get<any[]>('/treasury/accounts', { kind: 'CASH' }),
  });
  const vouchersQ = useQuery({
    queryKey: ['treasury-vouchers-cash'],
    queryFn: () => api.get<any[]>('/treasury/vouchers'),
  });
  const empsQ = useQuery({
    queryKey: ['employees-cashboxes-ref'],
    queryFn: () => api.get<any>('/employees', { pageSize: '200' }),
  });
  const branchesQ = useQuery({
    queryKey: ['branches-cashboxes-ref'],
    queryFn: () => api.get<any>('/branches'),
  });
  const glAccountsQ = useQuery({
    queryKey: ['accounts-posting-cash'],
    queryFn: () => api.get<any[]>('/accounts', { postingOnly: 'true' }),
  });

  const cashboxes: any[] = accountsQ.data ?? [];
  const allVouchers: any[] = vouchersQ.data ?? [];
  const emps: any[] = Array.isArray(empsQ.data) ? empsQ.data : (empsQ.data?.data ?? []);
  const branches: any[] = Array.isArray(branchesQ.data) ? branchesQ.data : (branchesQ.data?.data ?? []);
  const glAccounts: any[] = Array.isArray(glAccountsQ.data) ? glAccountsQ.data : [];

  const cashVouchers = useMemo(
    () =>
      allVouchers.filter((v) => {
        if (selectedCashId) return v.treasuryAccountId === selectedCashId;
        return v.treasuryAccountKind === 'CASH' || cashboxes.some((c) => c.id === v.treasuryAccountId);
      }),
    [allVouchers, cashboxes, selectedCashId],
  );

  const totalCashBalance = useMemo(() => cashboxes.reduce((s, c) => s + Number(c.balance || 0), 0), [cashboxes]);
  const totalInflows = useMemo(() => cashboxes.reduce((s, c) => s + Number(c.totalInflows || 0), 0), [cashboxes]);
  const totalOutflows = useMemo(() => cashboxes.reduce((s, c) => s + Number(c.totalOutflows || 0), 0), [cashboxes]);

  if (accountsQ.isLoading) return <Loading />;
  if (accountsQ.error) return <ErrorState error={accountsQ.error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الخزائن والصناديق النقدية (Cashboxes & Safes)"
        subtitle="إدارة الخزائن الرئيسية والفرعية، أمناء الصناديق (الموظفين)، الجرد النقدي اليومي، والربط التلقائي بدليل الحسابات (101xx)"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { void accountsQ.refetch(); void vouchersQ.refetch(); }} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <ExportMenu
              title="كشف الخزائن النقدية وحركة الصندوق"
              currency={base}
              columns={[
                { key: 'code', header: 'كود الخزينة', width: 14 },
                { key: 'name', header: 'اسم الخزينة', width: 26 },
                { key: 'glAccountCode', header: 'حساب الأستاذ', width: 14 },
                { key: 'treasurerName', header: 'أمين الصندوق (الموظف)', width: 22 },
                { key: 'currencyCode', header: 'العملة', width: 10 },
                { key: 'totalInflows', header: 'إجمالي المقبوضات', width: 16, type: 'currency', isTotal: true },
                { key: 'totalOutflows', header: 'إجمالي المصروفات', width: 16, type: 'currency', isTotal: true },
                { key: 'balance', header: 'الرصيد النقدي', width: 16, type: 'currency', isTotal: true },
              ]}
              data={cashboxes}
              summaryKpis={[
                { label: 'إجمالي رصيد الخزائن', value: `${money(totalCashBalance)} ${base}`, tone: 'emerald' },
                { label: 'عدد الخزائن', value: String(cashboxes.length), tone: 'navy' },
              ]}
            />
            <Link to="/treasury/receipts" className="btn-secondary text-xs flex items-center gap-1.5 text-emerald-700">
              <ArrowDownCircle className="size-3.5" />
              سند قبض نقدي
            </Link>
            <Link to="/treasury/payments" className="btn-secondary text-xs flex items-center gap-1.5 text-rose-700">
              <ArrowUpCircle className="size-3.5" />
              سند صرف نقدي
            </Link>
            <button onClick={() => setNewCashModal(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="size-3.5" />
              إضافة خزينة جديدة
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="الرصيد الفعلي بالخزائن" value={`${money(totalCashBalance)} ${base}`} icon={Vault} tone="green" hint={`${cashboxes.length} خزائن نشطة`} />
        <Stat label="إجمالي الوارد النقدي" value={`${money(totalInflows)} ${base}`} icon={ArrowDownCircle} tone="blue" />
        <Stat label="إجمالي المنصرف النقدي" value={`${money(totalOutflows)} ${base}`} icon={ArrowUpCircle} tone="red" />
        <Stat label="حركات السندات النقدية" value={cashVouchers.length} icon={Wallet} tone="amber" />
      </div>

      {/* Cashbox Directory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cashboxes.map((c) => (
          <div
            key={c.id}
            onClick={() => setSelectedCashId((prev) => (prev === c.id ? '' : c.id))}
            className={`card p-5 cursor-pointer transition-all ${selectedCashId === c.id ? 'ring-2 ring-indigo-500 border-indigo-400' : 'hover:border-indigo-300'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Badge color="green">خزينة نقدية</Badge>
                  <span className="font-mono text-xs font-bold text-slate-500">{c.code}</span>
                </div>
                <div className="text-base font-black text-slate-900 dark:text-white mt-2">{c.name}</div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                  <Users className="size-3.5 text-indigo-500" />
                  <span>أمين الصندوق: <strong>{c.treasurerName || 'غير محدد'}</strong></span>
                </div>
              </div>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">{c.currencyCode}</span>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-end justify-between">
              <div>
                <div className="text-[11px] text-slate-500">الرصيد الدفتري</div>
                <div className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-400">
                  {money(c.balance)} <span className="text-xs font-bold">{c.currencyCode}</span>
                </div>
              </div>
              <Link to={`/reports/account-statement?accountId=${c.glAccountId}`} onClick={(e) => e.stopPropagation()} className="text-xs font-bold text-indigo-600 hover:underline">
                حساب {c.glAccountCode} ←
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Daily Cashbox Ledger Table */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-emerald-600" />
            سجل حركات الخزائن النقدية (Daily Cashbox Movements)
          </h3>
          {selectedCashId && (
            <button onClick={() => setSelectedCashId('')} className="btn-secondary text-xs">
              عرض كل الخزائن
            </button>
          )}
        </div>

        {cashVouchers.length === 0 ? (
          <EmptyState
            text="لا توجد سندات نقدية مسجلة في الخزائن بعد."
            action={
              <div className="flex gap-2 justify-center">
                <Link to="/treasury/receipts" className="btn-primary text-xs">إصدار سند قبض نقدي</Link>
                <Link to="/treasury/payments" className="btn-secondary text-xs">إصدار سند صرف نقدي</Link>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3">رقم السند</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">الخزينة</th>
                  <th className="py-2.5 px-3">العملية</th>
                  <th className="py-2.5 px-3">الطرف / الموظف (مركز التكلفة)</th>
                  <th className="py-2.5 px-3">البيان</th>
                  <th className="py-2.5 px-3">وارد (مدين)</th>
                  <th className="py-2.5 px-3">منصرف (دائن)</th>
                  <th className="py-2.5 px-3">قيد اليومية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {cashVouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="py-2.5 px-3 font-mono font-bold">{v.voucherNo}</td>
                    <td className="py-2.5 px-3 font-mono">{date(v.voucherDate)}</td>
                    <td className="py-2.5 px-3 font-bold">{v.treasuryAccountName}</td>
                    <td className="py-2.5 px-3">
                      <Badge color={v.voucherType === 'RECEIPT' ? 'green' : 'red'}>
                        {v.voucherType === 'RECEIPT' ? 'سند قبض' : 'سند صرف'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold">{v.beneficiaryName || '—'}</div>
                      {v.employeeName && <div className="text-[10.5px] text-indigo-600 font-bold">مركز تكلفة: {v.employeeName}</div>}
                    </td>
                    <td className="py-2.5 px-3 max-w-xs truncate">{v.description}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-600">
                      {v.voucherType === 'RECEIPT' ? `${money(v.amountTx)} ${v.currencyCode}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-rose-600">
                      {v.voucherType === 'PAYMENT' ? `${money(v.amountTx)} ${v.currencyCode}` : '—'}
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

      {newCashModal && (
        <AddCashboxModal
          defaultCurrency={base}
          employees={emps}
          branches={branches}
          glAccounts={glAccounts}
          onClose={() => setNewCashModal(false)}
          onSuccess={() => {
            setNewCashModal(false);
            qc.invalidateQueries({ queryKey: ['treasury-cashboxes'] });
            qc.invalidateQueries({ queryKey: ['treasury-overview'] });
            toast.success('تم إنشاء الخزينة النقدية وربطها بدليل الحسابات بنجاح');
          }}
        />
      )}
    </div>
  );
}

function AddCashboxModal({
  defaultCurrency,
  employees,
  branches,
  glAccounts,
  onClose,
  onSuccess,
}: {
  defaultCurrency: string;
  employees: any[];
  branches: any[];
  glAccounts: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency || 'SAR');
  const [autoCreateGlAccount, setAutoCreateGlAccount] = useState(true);
  const [glAccountId, setGlAccountId] = useState(() => glAccounts.find((a) => a.code === '10101')?.id || glAccounts[0]?.id || '');
  const [treasurerEmployeeId, setTreasurerEmployeeId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingDate, setOpeningDate] = useState(today());

  const mut = useMutation({
    mutationFn: () =>
      api.post('/treasury/accounts', {
        kind: 'CASH',
        code: code || `CSH-${Date.now().toString().slice(-4)}`,
        name,
        bankName: 'الخزينة النقدية',
        currencyCode,
        autoCreateGlAccount,
        glAccountId: autoCreateGlAccount ? undefined : glAccountId,
        treasurerEmployeeId: treasurerEmployeeId || undefined,
        branchId: branchId || undefined,
        openingBalance: Number(openingBalance || 0),
        openingDate,
      }),
    onSuccess,
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إضافة خزينة / صندوق نقدي جديد"
      size="lg"
      saving={mut.isPending}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button type="button" className="btn-primary text-xs flex items-center gap-1.5" disabled={mut.isPending || !name.trim()} onClick={() => mut.mutate()}>
            {mut.isPending && <Spinner className="size-3.5" />}
            حفظ الخزينة وإنشاء الربط المحاسبي
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="كود الخزينة">
            <input dir="ltr" className="input w-full font-mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CSH-02" />
          </Field>
          <Field label="اسم الخزينة / الصندوق *" required className="md:col-span-2">
            <input autoFocus className="input w-full font-bold" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: خزينة الإدارة الرئيسية / خزينة المصروفات النثرية" />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="العملة">
            <select className="input w-full font-mono font-bold" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="SAR">SAR — ريال سعودي</option>
              <option value="EGP">EGP — جنيه مصري</option>
              <option value="USD">USD — دولار أمريكي</option>
            </select>
          </Field>
          <Field label="أمين الصندوق / الموظف المسؤول (مركز تكلفة)">
            <SearchableSelect
              value={treasurerEmployeeId}
              onChange={setTreasurerEmployeeId}
              placeholder="— اختر الموظف أمين الصندوق —"
              options={employees.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullNameAr}` }))}
            />
          </Field>
          <Field label="الفرع">
            <SearchableSelect
              value={branchId}
              onChange={setBranchId}
              placeholder="— كل الفروع / المركز الرئيسي —"
              options={branches.map((b) => ({ value: b.id, label: b.nameAr }))}
            />
          </Field>
        </div>

        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/70 dark:bg-slate-900/50">
          <label className="flex items-center gap-2 font-bold cursor-pointer">
            <input type="checkbox" checked={autoCreateGlAccount} onChange={(e) => setAutoCreateGlAccount(e.target.checked)} />
            إنشاء حساب أستاذ فرعي تلقائياً لهذه الخزينة داخل شجرة الحسابات (تحت 1101 النقدية والبنوك)
          </label>
          {!autoCreateGlAccount && (
            <Field label="اختر حساب الأستاذ العام المرتبط">
              <SearchableSelect
                clearable={false}
                value={glAccountId}
                onChange={setGlAccountId}
                options={glAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.nameAr}` }))}
              />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="الرصيد الافتتاحي (اختياري — يولد قيداً افتتاحياً متزناً)">
            <input type="number" step="any" min="0" className="input w-full font-mono font-bold" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
          </Field>
          <Field label="تاريخ القيد الافتتاحي">
            <input type="date" className="input w-full font-mono" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
