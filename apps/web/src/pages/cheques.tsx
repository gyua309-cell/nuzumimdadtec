import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  Plus,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { ExportMenu } from '../components/ExportMenu';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import { SearchableSelect } from '../components/SearchableSelect';
import { date, money, today } from '../lib/format';
import { Badge, EmptyState, ErrorState, Field, FormSection, Loading, Modal, PageHeader, Spinner, Stat, useToast } from '../components/ui';

type ChequeTab = 'ALL' | 'INCOMING' | 'OUTGOING' | 'DUE_SOON';

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  RECEIVED: { label: 'مستلم بالحافظة', color: 'blue' },
  UNDER_COLLECTION: { label: 'برسم التحصيل بالبنك', color: 'amber' },
  COLLECTED: { label: 'محصّل بالبنك', color: 'green' },
  ISSUED: { label: 'صادر مستحق الدفع', color: 'indigo' },
  PAID: { label: 'مصروف من البنك', color: 'green' },
  BOUNCED: { label: 'مرتد / مرفوض', color: 'red' },
  CANCELLED: { label: 'ملغي', color: 'slate' },
};

export function ChequesPage() {
  const base = useBaseCurrency();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<ChequeTab>('ALL');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const chequesQ = useQuery({
    queryKey: ['treasury-cheques', search],
    queryFn: () => api.get<any[]>('/treasury/cheques', { search: search || undefined }),
  });
  const banksQ = useQuery({
    queryKey: ['treasury-banks-cheques'],
    queryFn: () => api.get<any[]>('/treasury/accounts', { kind: 'BANK' }),
  });
  const empsQ = useQuery({
    queryKey: ['employees-cheques-ref'],
    queryFn: () => api.get<any>('/employees', { pageSize: '200' }),
  });
  const clientsQ = useQuery({
    queryKey: ['clients-cheques-ref'],
    queryFn: () => api.get<any>('/clients', { pageSize: '200' }),
  });
  const vendorsQ = useQuery({
    queryKey: ['vendors-cheques-ref'],
    queryFn: () => api.get<any>('/vendors', { pageSize: '200' }),
  });
  const projectsQ = useQuery({
    queryKey: ['projects-cheques-ref'],
    queryFn: () => api.get<any>('/projects', { pageSize: '200' }),
  });

  const cheques: any[] = chequesQ.data ?? [];
  const banks: any[] = banksQ.data ?? [];
  const emps: any[] = Array.isArray(empsQ.data) ? empsQ.data : (empsQ.data?.data ?? []);
  const clients: any[] = Array.isArray(clientsQ.data) ? clientsQ.data : (clientsQ.data?.data ?? []);
  const vendors: any[] = Array.isArray(vendorsQ.data) ? vendorsQ.data : (vendorsQ.data?.data ?? []);
  const projects: any[] = Array.isArray(projectsQ.data) ? projectsQ.data : (projectsQ.data?.data ?? []);

  const visibleCheques = useMemo(() => {
    const todayStr = today();
    const soon = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    if (tab === 'INCOMING') return cheques.filter((c) => c.direction === 'INCOMING');
    if (tab === 'OUTGOING') return cheques.filter((c) => c.direction === 'OUTGOING');
    if (tab === 'DUE_SOON') {
      return cheques.filter(
        (c) => ['RECEIVED', 'UNDER_COLLECTION', 'ISSUED'].includes(c.status) && String(c.dueDate) <= soon && String(c.dueDate) >= '1970-01-01',
      );
    }
    return cheques.map((c) => ({ ...c, isOverdue: ['RECEIVED', 'UNDER_COLLECTION', 'ISSUED'].includes(c.status) && String(c.dueDate) < todayStr }));
  }, [cheques, tab]);

  const stats = useMemo(() => {
    const incomingPending = cheques.filter((c) => c.direction === 'INCOMING' && ['RECEIVED', 'UNDER_COLLECTION'].includes(c.status));
    const outgoingPending = cheques.filter((c) => c.direction === 'OUTGOING' && c.status === 'ISSUED');
    const cleared = cheques.filter((c) => c.status === 'COLLECTED' || c.status === 'PAID');
    const bounced = cheques.filter((c) => c.status === 'BOUNCED');
    return {
      incomingTotal: incomingPending.reduce((s, c) => s + Number(c.amountBase || 0), 0),
      incomingCount: incomingPending.length,
      outgoingTotal: outgoingPending.reduce((s, c) => s + Number(c.amountBase || 0), 0),
      outgoingCount: outgoingPending.length,
      clearedTotal: cleared.reduce((s, c) => s + Number(c.amountBase || 0), 0),
      bouncedCount: bounced.length,
    };
  }, [cheques]);

  const depositMut = useMutation({
    mutationFn: ({ id, bankAccountId }: { id: string; bankAccountId: string }) =>
      api.post(`/treasury/cheques/${id}/deposit`, { bankAccountId, depositDate: today() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury-cheques'] });
      toast.success('تم إيداع الشيك برسم التحصيل بالبنك');
    },
    onError: (e) => toast.error(e),
  });

  const collectMut = useMutation({
    mutationFn: ({ id, bankAccountId }: { id: string; bankAccountId?: string }) =>
      api.post(`/treasury/cheques/${id}/collect`, { bankAccountId, collectDate: today() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury-cheques'] });
      toast.success('تم تحصيل/صرف الشيك وترحيل القيد لحساب البنك');
    },
    onError: (e) => toast.error(e),
  });

  const bounceMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/treasury/cheques/${id}/bounce`, { reason, bounceDate: today() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treasury-cheques'] });
      toast.success('تم إثبات ارتداد الشيك وعكس القيد المحاسبي');
    },
    onError: (e) => toast.error(e),
  });

  if (chequesQ.isLoading) return <Loading />;
  if (chequesQ.error) return <ErrorState error={chequesQ.error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="حافظة الشيكات وأوراق القبض والدفع (Cheques Portfolio)"
        subtitle="إدارة دورة حياة الشيكات الواردة (10305) والصادرة (20105): استلام، إيداع بالبنك، تحصيل فعلي، صرف، وارتداد مع القيود الآلية"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void chequesQ.refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <ExportMenu
              title="تقرير حافظة الشيكات وأوراق القبض والدفع"
              currency={base}
              columns={[
                { key: 'chequeNo', header: 'رقم الشيك', width: 14 },
                { key: 'direction', header: 'الاتجاه', width: 12 },
                { key: 'issueDate', header: 'تاريخ التحرير', width: 12 },
                { key: 'dueDate', header: 'تاريخ الاستحقاق', width: 12 },
                { key: 'bankName', header: 'البنك المسحوب عليه', width: 20 },
                { key: 'drawerName', header: 'الساحب / المستفيد', width: 22 },
                { key: 'employeeName', header: 'الموظف (مركز التكلفة)', width: 20 },
                { key: 'amountBase', header: `القيمة (${base})`, width: 15, type: 'currency', isTotal: true },
                { key: 'status', header: 'الحالة', width: 16 },
              ]}
              data={visibleCheques}
            />
            <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="size-3.5" />
              تسجيل شيك وارد / صادر
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="أوراق قبض تحت التحصيل (10305)" value={`${money(stats.incomingTotal)} ${base}`} icon={ArrowDownLeft} tone="blue" hint={`${stats.incomingCount} شيك وارد نشط`} />
        <Stat label="أوراق دفع مستحقة السداد (20105)" value={`${money(stats.outgoingTotal)} ${base}`} icon={ArrowUpRight} tone="amber" hint={`${stats.outgoingCount} شيك صادر مفتوح`} />
        <Stat label="شيكات محصّلة / مصروفة" value={`${money(stats.clearedTotal)} ${base}`} icon={CheckCircle2} tone="green" />
        <Stat label="شيكات مرتدة / مرفوضة" value={stats.bouncedCount} icon={AlertTriangle} tone="red" />
      </div>

      {/* Tabs + Search */}
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { k: 'ALL', label: `الكل (${cheques.length})` },
            { k: 'INCOMING', label: 'شيكات واردة (أوراق قبض)' },
            { k: 'OUTGOING', label: 'شيكات صادرة (أوراق دفع)' },
            { k: 'DUE_SOON', label: 'مستحقة خلال 7 أيام / متأخرة' },
          ].map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k as ChequeTab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                tab === t.k ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64 text-xs">
          <Search className="size-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input className="input w-full ps-8" placeholder="بحث برقم الشيك، البنك، الموظف..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card p-5">
        {visibleCheques.length === 0 ? (
          <EmptyState
            text="لا توجد شيكات في هذا التصنيف."
            action={<button onClick={() => setCreateOpen(true)} className="btn-primary text-xs">+ تسجيل أول شيك</button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3">رقم الشيك</th>
                  <th className="py-2.5 px-3">الاتجاه</th>
                  <th className="py-2.5 px-3">الاستحقاق</th>
                  <th className="py-2.5 px-3">البنك / الحساب</th>
                  <th className="py-2.5 px-3">الجهة / مركز التكلفة (الموظف)</th>
                  <th className="py-2.5 px-3">القيمة</th>
                  <th className="py-2.5 px-3">الحالة</th>
                  <th className="py-2.5 px-3">القيود المحاسبية</th>
                  <th className="py-2.5 px-3 text-center">دورة التحصيل والصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {visibleCheques.map((c) => {
                  const st = STATUS_BADGE[c.status] || STATUS_BADGE.RECEIVED;
                  const targetBankId = c.bankAccountId || banks[0]?.id;
                  return (
                    <tr key={c.id}>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">{c.chequeNo}</td>
                      <td className="py-2.5 px-3">
                        <Badge color={c.direction === 'INCOMING' ? 'blue' : 'purple'}>
                          {c.direction === 'INCOMING' ? 'وارد (قبض)' : 'صادر (دفع)'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">{date(c.dueDate)}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold">{c.bankName}</div>
                        {c.bankAccountName && <div className="text-[10.5px] text-slate-500">حساب: {c.bankAccountName}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold">{c.drawerName || c.clientName || c.vendorName || '—'}</div>
                        {c.employeeName && <div className="text-[10.5px] text-indigo-600 font-bold">مركز تكلفة: {c.employeeName}</div>}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black">{money(c.amountTx)} {c.currencyCode}</td>
                      <td className="py-2.5 px-3">
                        <Badge color={st.color}>{st.label}</Badge>
                        {c.bounceReason && <div className="text-[10px] text-rose-600 mt-0.5">{c.bounceReason}</div>}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {c.initialJournalEntryId && <JournalLinkBadge entryId={c.initialJournalEntryId} entryNo={c.initialJournalEntryNo} compact />}
                          {c.clearingJournalEntryId && <JournalLinkBadge entryId={c.clearingJournalEntryId} entryNo={c.clearingJournalEntryNo} compact />}
                          {c.bounceJournalEntryId && <JournalLinkBadge entryId={c.bounceJournalEntryId} entryNo={c.bounceJournalEntryNo} compact />}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {c.direction === 'INCOMING' && c.status === 'RECEIVED' && targetBankId && (
                            <button
                              onClick={() => depositMut.mutate({ id: c.id, bankAccountId: targetBankId })}
                              className="btn-secondary text-[11px] px-2 py-1"
                              disabled={depositMut.isPending}
                            >
                              إيداع بالبنك
                            </button>
                          )}
                          {((c.direction === 'INCOMING' && (c.status === 'RECEIVED' || c.status === 'UNDER_COLLECTION')) ||
                            (c.direction === 'OUTGOING' && c.status === 'ISSUED')) && (
                            <button
                              onClick={() => collectMut.mutate({ id: c.id, bankAccountId: targetBankId })}
                              className="btn-primary text-[11px] px-2 py-1"
                              disabled={collectMut.isPending}
                            >
                              {c.direction === 'INCOMING' ? 'تحصيل بالبنك' : 'صرف من البنك'}
                            </button>
                          )}
                          {!['BOUNCED', 'CANCELLED'].includes(c.status) && (
                            <button
                              onClick={() => {
                                const reason = prompt('سبب الارتداد / الإلغاء:', 'عدم كفاية الرصيد / إلغاء') || 'ارتداد شيك';
                                bounceMut.mutate({ id: c.id, reason });
                              }}
                              className="btn-ghost text-[11px] px-2 py-1 text-rose-600 hover:bg-rose-50"
                              title="ارتداد / عكس"
                            >
                              <XCircle className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateChequeModal
          banks={banks}
          employees={emps}
          clients={clients}
          vendors={vendors}
          projects={projects}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ['treasury-cheques'] });
            toast.success('تم تسجيل الشيك وترحيل قيده الأولي بالحافظة بنجاح');
          }}
        />
      )}
    </div>
  );
}

function CreateChequeModal({
  banks,
  employees,
  clients,
  vendors,
  projects,
  onClose,
  onSuccess,
}: {
  banks: any[];
  employees: any[];
  clients: any[];
  vendors: any[];
  projects: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [direction, setDirection] = useState<'INCOMING' | 'OUTGOING'>('INCOMING');
  const [chequeNo, setChequeNo] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [bankAccountId, setBankAccountId] = useState(banks[0]?.id || '');
  const [bankName, setBankName] = useState(banks[0]?.bankName || '');
  const [amount, setAmount] = useState('');
  const [partyType, setPartyType] = useState<'CLIENT' | 'VENDOR' | 'EMPLOYEE' | 'ACCOUNT'>('CLIENT');
  const [clientId, setClientId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [notes, setNotes] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      api.post('/treasury/cheques', {
        chequeNo: chequeNo || `CHQ-${Date.now().toString().slice(-5)}`,
        direction,
        issueDate,
        dueDate,
        bankName: bankName || 'بنك تجاري',
        drawerName: drawerName || undefined,
        bankAccountId: bankAccountId || undefined,
        amount: Number(amount),
        partyType,
        clientId: clientId || undefined,
        vendorId: vendorId || undefined,
        employeeId: employeeId || undefined,
        projectId: projectId || undefined,
        notes: notes || undefined,
      }),
    onSuccess,
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="تسجيل شيك وارد أو صادر في حافظة الشيكات"
      size="lg"
      saving={mut.isPending}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button type="button" className="btn-primary text-xs flex items-center gap-1.5" disabled={mut.isPending || Number(amount || 0) <= 0} onClick={() => mut.mutate()}>
            {mut.isPending && <Spinner className="size-3.5" />}
            حفظ الشيك وترحيل القيد المحاسبي
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <FormSection title="بيانات الشيك الأساسية" columns={3}>
          <Field label="نوع الشيك" required>
            <select
              className="input w-full font-bold"
              value={direction}
              onChange={(e) => {
                const d = e.target.value as 'INCOMING' | 'OUTGOING';
                setDirection(d);
                setPartyType(d === 'INCOMING' ? 'CLIENT' : 'VENDOR');
              }}
            >
              <option value="INCOMING">شيك وارد — أوراق قبض (10305)</option>
              <option value="OUTGOING">شيك صادر — أوراق دفع (20105)</option>
            </select>
          </Field>
          <Field label="رقم الشيك *" required>
            <input className="input w-full font-mono font-bold" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="CHQ-2026-01" />
          </Field>
          <Field label="المبلغ *" required>
            <input type="number" step="any" min="0.01" className="input w-full font-mono font-black" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="تاريخ التحرير" required>
            <input type="date" className="input w-full font-mono" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="تاريخ الاستحقاق" required>
            <input type="date" className="input w-full font-mono" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="البنك المستهدف للتحصيل / الصرف">
            <SearchableSelect
              value={bankAccountId}
              onChange={(v) => {
                setBankAccountId(v);
                const b = banks.find((x) => x.id === v);
                if (b?.bankName) setBankName(b.bankName);
              }}
              placeholder="— اختر البنك —"
              options={banks.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Field>
        </FormSection>

        <FormSection title="ربط الأطراف ومركز التكلفة (الموظف)" columns={2}>
          <Field label="اسم البنك المسحوب عليه">
            <input className="input w-full" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="اسم المصرف" />
          </Field>
          {direction === 'INCOMING' ? (
            <Field label="العميل (إن وجد)">
              <SearchableSelect
                value={clientId}
                onChange={(v) => {
                  setClientId(v);
                  const c = clients.find((x) => x.id === v);
                  if (c) setDrawerName(c.nameAr);
                }}
                placeholder="— اختر العميل —"
                options={clients.map((c) => ({ value: c.id, label: c.nameAr }))}
              />
            </Field>
          ) : (
            <Field label="المورد (إن وجد)">
              <SearchableSelect
                value={vendorId}
                onChange={(v) => {
                  setVendorId(v);
                  const vn = vendors.find((x) => x.id === v);
                  if (vn) setDrawerName(vn.nameAr);
                }}
                placeholder="— اختر المورد —"
                options={vendors.map((v) => ({ value: v.id, label: v.nameAr }))}
              />
            </Field>
          )}
          <Field label="الموظف (مركز التكلفة الرئيسي)">
            <SearchableSelect
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="— اختر الموظف كمركز تكلفة —"
              options={employees.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullNameAr}` }))}
            />
          </Field>
          <Field label="المشروع المرتبط">
            <SearchableSelect
              value={projectId}
              onChange={setProjectId}
              placeholder="— اختياري —"
              options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.nameAr}` }))}
            />
          </Field>
          <Field label="ملاحظات الشيك" className="md:col-span-2">
            <input className="input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات أو رقم العقد المرتبط..." />
          </Field>
        </FormSection>

        <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-sans font-bold text-cyan-300">
            <Layers className="size-3.5" />
            {direction === 'INCOMING' ? 'القيد التلقائي: مدين 10305 (أوراق قبض) / دائن 10301 (العميل/الحساب)' : 'القيد التلقائي: مدين (المورد/المصروف/الموظف) / دائن 20105 (أوراق دفع)'}
          </span>
          <span className="font-bold text-emerald-400">{money(Number(amount || 0))}</span>
        </div>
      </div>
    </Modal>
  );
}
