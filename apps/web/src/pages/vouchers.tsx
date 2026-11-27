import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Landmark,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useBaseCurrency } from '../lib/auth';
import { ExportEngine, type RoyalDetailDocumentOptions } from '../engine/export-engine';
import { ExportMenu } from '../components/ExportMenu';
import { RowActionBar } from '../components/RowActionBar';
import { JournalLinkBadge } from '../components/JournalPreviewPill';
import { SearchableSelect } from '../components/SearchableSelect';
import { clearFormDraft, handleErpFormKeyDown, loadFormDraft, saveFormDraft } from '../lib/form-draft';
import { date, money, today } from '../lib/format';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Field, FormSection, Loading, Modal, PageHeader, ReasonDialog, Spinner, Stat, useToast } from '../components/ui';

type VoucherMode = 'RECEIPT' | 'PAYMENT';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي بالخزينة',
  BANK_TRANSFER: 'تحويل بنكي',
  CHEQUE: 'شيك مصرفي',
  CARD: 'بطاقة / شبكة',
};

const PARTY_LABELS: Record<string, string> = {
  CLIENT: 'عميل / فاتورة مبيعات',
  VENDOR: 'مورد / فاتورة مشتريات',
  EMPLOYEE: 'موظف (مركز تكلفة)',
  ACCOUNT: 'حساب مالي عام',
  PROJECT: 'مشروع',
};

function TreasuryVouchersPage({ mode }: { mode: VoucherMode }) {
  const base = useBaseCurrency();
  const qc = useQueryClient();
  const toast = useToast();
  const isReceipt = mode === 'RECEIPT';

  const [createOpen, setCreateOpen] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState<any | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<any | null>(null);
  const [cancellingVoucher, setCancellingVoucher] = useState<any | null>(null);
  const [deletingVoucher, setDeletingVoucher] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [empFilter, setEmpFilter] = useState('');
  const [accFilter, setAccFilter] = useState('');

  const vouchersQ = useQuery({
    queryKey: ['treasury-vouchers', mode, methodFilter, empFilter, accFilter, search],
    queryFn: () =>
      api.get<any[]>('/treasury/vouchers', {
        voucherType: mode,
        paymentMethod: methodFilter || undefined,
        employeeId: empFilter || undefined,
        treasuryAccountId: accFilter || undefined,
        search: search || undefined,
      }),
  });

  const accountsQ = useQuery({
    queryKey: ['treasury-accounts-vouchers'],
    queryFn: () => api.get<any[]>('/treasury/accounts'),
  });
  const empsQ = useQuery({
    queryKey: ['employees-vouchers-ref'],
    queryFn: () => api.get<any>('/employees', { pageSize: '200' }),
  });
  const clientsQ = useQuery({
    queryKey: ['clients-vouchers-ref'],
    queryFn: () => api.get<any>('/clients', { pageSize: '200' }),
  });
  const vendorsQ = useQuery({
    queryKey: ['vendors-vouchers-ref'],
    queryFn: () => api.get<any>('/vendors', { pageSize: '200' }),
  });
  const projectsQ = useQuery({
    queryKey: ['projects-vouchers-ref'],
    queryFn: () => api.get<any>('/projects', { pageSize: '200' }),
  });
  const salesInvQ = useQuery({
    queryKey: ['invoices-vouchers-ref'],
    queryFn: () => api.get<any>('/invoices'),
  });
  const purInvQ = useQuery({
    queryKey: ['purchase-invoices-vouchers-ref'],
    queryFn: () => api.get<any>('/purchase-invoices'),
  });
  const glQ = useQuery({
    queryKey: ['accounts-vouchers-ref'],
    queryFn: () => api.get<any[]>('/accounts', { postingOnly: 'true' }),
  });

  const vouchers: any[] = vouchersQ.data ?? [];
  const treasuryAccs: any[] = accountsQ.data ?? [];
  const emps: any[] = Array.isArray(empsQ.data) ? empsQ.data : (empsQ.data?.data ?? []);
  const clients: any[] = Array.isArray(clientsQ.data) ? clientsQ.data : (clientsQ.data?.data ?? []);
  const vendors: any[] = Array.isArray(vendorsQ.data) ? vendorsQ.data : (vendorsQ.data?.data ?? []);
  const projects: any[] = Array.isArray(projectsQ.data) ? projectsQ.data : (projectsQ.data?.data ?? []);
  const salesInvoices: any[] = Array.isArray(salesInvQ.data) ? salesInvQ.data : (salesInvQ.data?.data ?? []);
  const purchaseInvoices: any[] = Array.isArray(purInvQ.data) ? purInvQ.data : (purInvQ.data?.data ?? []);
  const glAccounts: any[] = Array.isArray(glQ.data) ? glQ.data : [];

  const stats = useMemo(() => {
    const posted = vouchers.filter((v) => v.status === 'POSTED');
    const total = posted.reduce((s, v) => s + Number(v.amountBase || 0), 0);
    const cash = posted.filter((v) => v.paymentMethod === 'CASH').reduce((s, v) => s + Number(v.amountBase || 0), 0);
    const bank = posted.filter((v) => v.paymentMethod === 'BANK_TRANSFER' || v.paymentMethod === 'CARD').reduce((s, v) => s + Number(v.amountBase || 0), 0);
    const empLinked = posted.filter((v) => Boolean(v.employeeId)).reduce((s, v) => s + Number(v.amountBase || 0), 0);
    return { count: posted.length, total, cash, bank, empLinked };
  }, [vouchers]);

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/treasury/vouchers/${id}/cancel`, { reason: reason || `إلغاء ${isReceipt ? 'سند القبض' : 'سند الصرف'} وعكس القيد` }),
    onSuccess: () => {
      setCancellingVoucher(null);
      qc.invalidateQueries({ queryKey: ['treasury-vouchers'] });
      qc.invalidateQueries({ queryKey: ['treasury-overview'] });
      qc.invalidateQueries({ queryKey: ['journals'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('تم إلغاء السند وعكس قيده المحاسبي بنجاح');
    },
    onError: (e) => toast.error(e),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/treasury/vouchers/${id}`),
    onSuccess: () => {
      setDeletingVoucher(null);
      qc.invalidateQueries({ queryKey: ['treasury-vouchers'] });
      qc.invalidateQueries({ queryKey: ['treasury-overview'] });
      toast.success('تم حذف مسودة السند بنجاح');
    },
    onError: (e) => toast.error(e),
  });

  const buildVoucherDoc = (v: any): RoyalDetailDocumentOptions => ({
    title: isReceipt ? 'سند قبض مالي معتمد (Receipt Voucher)' : 'سند صرف مالي معتمد (Payment Voucher)',
    subtitle: `${METHOD_LABELS[v.paymentMethod] || v.paymentMethod} — ${v.treasuryAccountName}`,
    filename: `${v.voucherNo}-${v.voucherDate}`,
    docNo: v.voucherNo,
    docDate: date(v.voucherDate),
    currency: v.currencyCode,
    statusLabel: v.status === 'POSTED' ? 'مرحّل بالأستاذ العام' : v.status === 'CANCELLED' ? 'ملغي ومعكوس' : 'مسودة',
    statusTone: v.status === 'POSTED' ? 'green' : v.status === 'CANCELLED' ? 'red' : 'amber',
    watermark: v.status === 'CANCELLED' ? 'CANCELLED' : v.status === 'DRAFT' ? 'DRAFT' : 'NONE',
    kpis: [
      { label: isReceipt ? 'المبلغ المقبوض' : 'المبلغ المصروف', value: `${money(v.amountTx)} ${v.currencyCode}`, tone: isReceipt ? 'emerald' : 'rose' },
      { label: 'طريقة السداد', value: METHOD_LABELS[v.paymentMethod] || v.paymentMethod, tone: 'sky' },
      { label: 'الخزينة / البنك', value: v.treasuryAccountName, tone: 'navy' },
      { label: 'رقم القيد المحاسبي', value: v.journalEntryNo || '—', tone: 'amber' },
    ],
    metaFields: [
      { label: 'رقم السند', value: v.voucherNo },
      { label: 'تاريخ السند', value: date(v.voucherDate) },
      { label: isReceipt ? 'استلمنا من' : 'صُرف إلى', value: v.beneficiaryName || '—' },
      { label: 'الموظف (مركز التكلفة)', value: v.employeeName ? `${v.employeeCode || ''} — ${v.employeeName}` : '—' },
      { label: 'المشروع المرتبط', value: v.projectName || '—' },
      { label: 'الحساب المقابل', value: `${v.counterAccountCode || ''} — ${v.counterAccountName || ''}` },
      { label: 'البيان والتفاصيل', value: v.description || '—' },
    ],
    totalAmountForTafqeet: Number(v.amountTx || 0),
    signatureLabels: ['أمين الصندوق / المحاسب', isReceipt ? 'المودِع / المسلّم' : 'المستلم', 'اعتماد المدير المالي'],
  });

  const handlePrintVoucherPdf = (v: any) => {
    void ExportEngine.exportDetailPdf(buildVoucherDoc(v));
  };

  if (vouchersQ.isLoading) return <Loading />;
  if (vouchersQ.error) return <ErrorState error={vouchersQ.error} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isReceipt ? 'سندات القبض (Receipt Vouchers)' : 'سندات الصرف (Payment Vouchers)'}
        subtitle={
          isReceipt
            ? 'تحصيل نقدي بالخزينة أو تحويل بنكي أو شيك وارد — مع تسوية فواتير العملاء وسلف الموظفين وترحيل القيود تلقائياً'
            : 'صرف نقدي أو بنكي أو بشيك — مرتبط بالموظف كمركز تكلفة، الموردين، فواتير المشتريات، العهد، والسلف مع قيد آلي متزن'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void vouchersQ.refetch()} className="btn-secondary text-xs flex items-center gap-1.5">
              <RefreshCw className="size-3.5" />
              تحديث
            </button>
            <ExportMenu
              title={isReceipt ? 'سجل سندات القبض' : 'سجل سندات الصرف'}
              currency={base}
              columns={[
                { key: 'voucherNo', header: 'رقم السند', width: 14 },
                { key: 'voucherDate', header: 'التاريخ', width: 12 },
                { key: 'paymentMethod', header: 'الطريقة', width: 14 },
                { key: 'treasuryAccountName', header: 'الخزينة / البنك', width: 22 },
                { key: 'beneficiaryName', header: 'الطرف المستفيد', width: 22 },
                { key: 'employeeName', header: 'الموظف (مركز التكلفة)', width: 22 },
                { key: 'counterAccountName', header: 'الحساب المقابل', width: 22 },
                { key: 'amountBase', header: `المبلغ (${base})`, width: 16, type: 'currency', isTotal: true },
                { key: 'journalEntryNo', header: 'القيد', width: 14 },
              ]}
              data={vouchers}
              summaryKpis={[
                { label: 'عدد السندات المرحلة', value: String(stats.count), tone: 'navy' },
                { label: isReceipt ? 'إجمالي المقبوضات' : 'إجمالي المصروفات', value: `${money(stats.total)} ${base}`, tone: isReceipt ? 'emerald' : 'rose' },
              ]}
            />
            <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="size-3.5" />
              {isReceipt ? 'إصدار سند قبض جديد' : 'إصدار سند صرف جديد'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label={isReceipt ? 'إجمالي المقبوضات المرحلة' : 'إجمالي المصروفات المرحلة'}
          value={`${money(stats.total)} ${base}`}
          icon={isReceipt ? ArrowDownCircle : ArrowUpCircle}
          tone={isReceipt ? 'green' : 'red'}
          hint={`${stats.count} سند مرحّل`}
        />
        <Stat label="حركات الخزينة النقدية" value={`${money(stats.cash)} ${base}`} icon={Banknote} tone="amber" />
        <Stat label="حركات البنوك والتحويلات" value={`${money(stats.bank)} ${base}`} icon={Landmark} tone="blue" />
        <Stat label="مرتبط بالموظفين (مراكز تكلفة)" value={`${money(stats.empLinked)} ${base}`} icon={Users} tone="indigo" />
      </div>

      {/* Filters Bar */}
      <div className="card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <div className="relative">
          <Search className="size-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input className="input w-full ps-8" placeholder="ابحث برقم السند، البيان، المستفيد..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-full" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
          <option value="">كل طرق الدفع والتحصيل</option>
          <option value="CASH">نقدي بالخزينة</option>
          <option value="BANK_TRANSFER">تحويل بنكي</option>
          <option value="CHEQUE">شيك مصرفي</option>
          <option value="CARD">بطاقة</option>
        </select>
        <SearchableSelect
          value={accFilter}
          onChange={setAccFilter}
          placeholder="— كل الخزائن والبنوك —"
          options={treasuryAccs.map((a) => ({ value: a.id, label: `${a.kind === 'CASH' ? 'خزينة' : 'بنك'}: ${a.name}` }))}
        />
        <SearchableSelect
          value={empFilter}
          onChange={setEmpFilter}
          placeholder="— كل الموظفين (مراكز التكلفة) —"
          options={emps.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullNameAr}` }))}
        />
      </div>

      {/* Vouchers Table */}
      <div className="card p-5">
        {vouchers.length === 0 ? (
          <EmptyState
            text={isReceipt ? 'لا توجد سندات قبض مسجلة حتى الآن.' : 'لا توجد سندات صرف مسجلة حتى الآن.'}
            action={
              <button onClick={() => setCreateOpen(true)} className="btn-primary text-xs">
                {isReceipt ? '+ إصدار أول سند قبض' : '+ إصدار أول سند صرف'}
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2.5 px-3">رقم السند</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">الطريقة</th>
                  <th className="py-2.5 px-3">الخزينة / البنك</th>
                  <th className="py-2.5 px-3">الطرف المستفيد</th>
                  <th className="py-2.5 px-3">مركز التكلفة (الموظف) / المشروع</th>
                  <th className="py-2.5 px-3">الحساب المقابل</th>
                  <th className="py-2.5 px-3">المبلغ</th>
                  <th className="py-2.5 px-3">القيد</th>
                  <th className="py-2.5 px-3">الحالة</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">{v.voucherNo}</td>
                    <td className="py-2.5 px-3 font-mono">{date(v.voucherDate)}</td>
                    <td className="py-2.5 px-3">
                      <Badge color={v.paymentMethod === 'CHEQUE' ? 'purple' : v.paymentMethod === 'CASH' ? 'green' : 'blue'}>
                        {METHOD_LABELS[v.paymentMethod] || v.paymentMethod}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-bold">{v.treasuryAccountName}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold">{v.beneficiaryName || '—'}</div>
                      <div className="text-[10.5px] text-slate-500">{PARTY_LABELS[v.partyType] || v.partyType}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {v.employeeName ? (
                        <div className="font-bold text-indigo-700 dark:text-indigo-300">{v.employeeCode ? `${v.employeeCode} — ` : ''}{v.employeeName}</div>
                      ) : <span className="text-slate-400">—</span>}
                      {v.projectName && <div className="text-[10.5px] text-slate-500">مشروع: {v.projectName}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono text-slate-500">{v.counterAccountCode}</span> {v.counterAccountName}
                    </td>
                    <td className={`py-2.5 px-3 font-mono font-black ${isReceipt ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {money(v.amountTx)} {v.currencyCode}
                    </td>
                    <td className="py-2.5 px-3">
                      <JournalLinkBadge entryId={v.journalEntryId} entryNo={v.journalEntryNo} compact />
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge color={v.status === 'POSTED' ? 'green' : v.status === 'CANCELLED' ? 'red' : 'amber'}>
                        {v.status === 'POSTED' ? 'مرحّل' : v.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handlePrintVoucherPdf(v)} className="btn-ghost p-1.5 text-slate-600 hover:text-indigo-600" title="طباعة السند PDF ملكي">
                          <Printer className="size-4" />
                        </button>
                        <RowActionBar
                          onView={() => setViewingVoucher(v)}
                          viewTitle="عرض تفاصيل السند والقيد"
                          onPreview={() => ExportEngine.openDetailPreview(buildVoucherDoc(v))}
                          onPrint={() => void ExportEngine.printDetail(buildVoucherDoc(v))}
                          onPdf={() => handlePrintVoucherPdf(v)}
                          onExcel={() => void ExportEngine.exportDetailExcel(buildVoucherDoc(v))}
                          onEdit={
                            v.status !== 'CANCELLED'
                              ? () => {
                                  setEditingVoucher(v);
                                  setCreateOpen(true);
                                }
                              : undefined
                          }
                          editTitle="تعديل بيانات السند"
                          onDelete={
                            v.status === 'DRAFT'
                              ? () => setDeletingVoucher(v)
                              : v.status === 'POSTED'
                                ? () => setCancellingVoucher(v)
                                : undefined
                          }
                          deleteTitle={v.status === 'DRAFT' ? 'حذف مسودة السند' : 'إلغاء وعكس السند'}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateVoucherModal
          mode={mode}
          editingVoucher={editingVoucher}
          treasuryAccounts={treasuryAccs}
          employees={emps}
          clients={clients}
          vendors={vendors}
          projects={projects}
          salesInvoices={salesInvoices}
          purchaseInvoices={purchaseInvoices}
          glAccounts={glAccounts}
          onClose={() => {
            setCreateOpen(false);
            setEditingVoucher(null);
          }}
          onSuccess={() => {
            const wasEdit = Boolean(editingVoucher);
            setCreateOpen(false);
            setEditingVoucher(null);
            qc.invalidateQueries({ queryKey: ['treasury-vouchers'] });
            qc.invalidateQueries({ queryKey: ['treasury-overview'] });
            qc.invalidateQueries({ queryKey: ['journals'] });
            qc.invalidateQueries({ queryKey: ['accounts'] });
            toast.success(
              wasEdit
                ? `تم تعديل ${isReceipt ? 'سند القبض' : 'سند الصرف'} وتحديث قيده المحاسبي آلياً`
                : `تم إصدار وترحيل ${isReceipt ? 'سند القبض' : 'سند الصرف'} وتحديث الخزينة والأستاذ العام بنجاح`,
            );
          }}
        />
      )}

      <Modal
        open={Boolean(viewingVoucher)}
        onClose={() => setViewingVoucher(null)}
        title={`تفاصيل السند: ${viewingVoucher?.voucherNo || ''}`}
        size="lg"
        footer={
          viewingVoucher && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => setViewingVoucher(null)}>إغلاق</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => ExportEngine.openDetailPreview(buildVoucherDoc(viewingVoucher))}>معاينة A4</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => void ExportEngine.printDetail(buildVoucherDoc(viewingVoucher))}>طباعة A4</button>
              <button type="button" className="btn-primary text-xs" onClick={() => handlePrintVoucherPdf(viewingVoucher)}>تصدير PDF</button>
            </div>
          )
        }
      >
        {viewingVoucher && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">رقم السند والتاريخ</div>
              <div className="font-mono font-bold text-sm mt-0.5">{viewingVoucher.voucherNo} — {date(viewingVoucher.voucherDate)}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">المبلغ والعملة</div>
              <div className="font-mono font-black text-sm mt-0.5 text-emerald-700">{money(viewingVoucher.amountTx)} {viewingVoucher.currencyCode}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">الخزينة / البنك</div>
              <div className="font-bold mt-0.5">{viewingVoucher.treasuryAccountName}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">المستفيد / الطرف</div>
              <div className="font-bold mt-0.5">{viewingVoucher.beneficiaryName || PARTY_LABELS[viewingVoucher.partyType] || '—'}</div>
            </div>
            <div className="sm:col-span-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
              <div className="text-slate-500">البيان</div>
              <div className="font-medium mt-0.5">{viewingVoucher.description || '—'}</div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingVoucher)}
        title={`حذف مسودة السند ${deletingVoucher?.voucherNo || ''}`}
        message="هل أنت متأكد من حذف هذه المسودة نهائياً؟"
        danger
        busy={deleteMut.isPending}
        onClose={() => setDeletingVoucher(null)}
        onConfirm={() => deletingVoucher && deleteMut.mutate(deletingVoucher.id)}
      />

      <ReasonDialog
        open={Boolean(cancellingVoucher)}
        title={`إلغاء وعكس السند ${cancellingVoucher?.voucherNo || ''}`}
        confirmText="إلغاء السند وعكس القيد والأرصدة"
        danger
        onClose={() => setCancellingVoucher(null)}
        onConfirm={async (reason) => {
          if (cancellingVoucher) {
            await cancelMut.mutateAsync({ id: cancellingVoucher.id, reason });
          }
        }}
      />
    </div>
  );
}

function CreateVoucherModal({
  mode,
  editingVoucher,
  treasuryAccounts,
  employees,
  clients,
  vendors,
  projects,
  salesInvoices,
  purchaseInvoices,
  glAccounts,
  onClose,
  onSuccess,
}: {
  mode: VoucherMode;
  editingVoucher?: any | null;
  treasuryAccounts: any[];
  employees: any[];
  clients: any[];
  vendors: any[];
  projects: any[];
  salesInvoices: any[];
  purchaseInvoices: any[];
  glAccounts: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const isReceipt = mode === 'RECEIPT';
  const isEdit = Boolean(editingVoucher?.id);
  const draftKey = `voucher-${mode}-new`;
  const draft = !isEdit ? loadFormDraft<any>(draftKey) : null;

  const [voucherDate, setVoucherDate] = useState(editingVoucher?.voucherDate ?? draft?.voucherDate ?? today());
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD'>(editingVoucher?.paymentMethod ?? draft?.paymentMethod ?? 'CASH');
  const [treasuryAccountId, setTreasuryAccountId] = useState(() => {
    if (editingVoucher?.treasuryAccountId) return editingVoucher.treasuryAccountId;
    if (draft?.treasuryAccountId) return draft.treasuryAccountId;
    const cash = treasuryAccounts.find((a) => a.kind === 'CASH');
    return cash?.id || treasuryAccounts[0]?.id || '';
  });
  const [partyType, setPartyType] = useState<'CLIENT' | 'VENDOR' | 'EMPLOYEE' | 'ACCOUNT'>(editingVoucher?.partyType ?? draft?.partyType ?? (isReceipt ? 'CLIENT' : 'EMPLOYEE'));
  const [partySubType, setPartySubType] = useState(editingVoucher?.partySubType ?? draft?.partySubType ?? (isReceipt ? '' : 'EXPENSE'));
  const [clientId, setClientId] = useState(editingVoucher?.clientId ?? draft?.clientId ?? '');
  const [vendorId, setVendorId] = useState(editingVoucher?.vendorId ?? draft?.vendorId ?? '');
  const [invoiceId, setInvoiceId] = useState(editingVoucher?.invoiceId ?? draft?.invoiceId ?? '');
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState(editingVoucher?.purchaseInvoiceId ?? draft?.purchaseInvoiceId ?? '');
  const [employeeId, setEmployeeId] = useState(editingVoucher?.employeeId ?? draft?.employeeId ?? '');
  const [projectId, setProjectId] = useState(editingVoucher?.projectId ?? draft?.projectId ?? '');
  const [counterAccountId, setCounterAccountId] = useState(editingVoucher?.counterAccountId ?? draft?.counterAccountId ?? '');
  const [amount, setAmount] = useState(editingVoucher ? String(editingVoucher.amountTx ?? editingVoucher.amount ?? '') : (draft?.amount ?? ''));
  const [beneficiaryName, setBeneficiaryName] = useState(editingVoucher?.beneficiaryName ?? draft?.beneficiaryName ?? '');
  const [description, setDescription] = useState(editingVoucher?.description ?? draft?.description ?? '');
  const [chequeNo, setChequeNo] = useState(draft?.chequeNo ?? '');
  const [chequeDueDate, setChequeDueDate] = useState(draft?.chequeDueDate ?? today());
  const [chequeBankName, setChequeBankName] = useState(draft?.chequeBankName ?? '');

  const persistDraft = (patch: Record<string, any>) => {
    if (isEdit) return;
    saveFormDraft(draftKey, {
      voucherDate, paymentMethod, treasuryAccountId, partyType, partySubType, clientId, vendorId,
      invoiceId, purchaseInvoiceId, employeeId, projectId, counterAccountId, amount, beneficiaryName,
      description, chequeNo, chequeDueDate, chequeBankName, ...patch,
    });
  };

  const selectedTreasury = treasuryAccounts.find((a) => a.id === treasuryAccountId) || treasuryAccounts[0];

  const handleMethodChange = (m: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD') => {
    setPaymentMethod(m);
    let nextAccId = treasuryAccountId;
    if (m === 'CASH') {
      const cash = treasuryAccounts.find((a) => a.kind === 'CASH');
      if (cash) nextAccId = cash.id;
    } else {
      const bank = treasuryAccounts.find((a) => a.kind === 'BANK');
      if (bank) nextAccId = bank.id;
    }
    setTreasuryAccountId(nextAccId);
    persistDraft({ paymentMethod: m, treasuryAccountId: nextAccId });
  };

  const openSalesInvs = useMemo(
    () => salesInvoices.filter((i) => i.status !== 'CANCELLED' && i.paymentStatus !== 'PAID' && (!clientId || i.clientId === clientId)),
    [salesInvoices, clientId],
  );
  const openPurInvs = useMemo(
    () => purchaseInvoices.filter((i) => i.status === 'POSTED' && i.paymentStatus !== 'PAID' && (!vendorId || i.vendorId === vendorId)),
    [purchaseInvoices, vendorId],
  );

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        voucherType: mode,
        voucherDate,
        paymentMethod,
        treasuryAccountId,
        currencyCode: selectedTreasury?.currencyCode || 'SAR',
        amount: Number(amount),
        partyType,
        partySubType: partyType === 'EMPLOYEE' ? partySubType || undefined : undefined,
        clientId: clientId || undefined,
        vendorId: vendorId || undefined,
        invoiceId: invoiceId || undefined,
        purchaseInvoiceId: purchaseInvoiceId || undefined,
        employeeId: employeeId || undefined,
        projectId: projectId || undefined,
        counterAccountId: counterAccountId || undefined,
        beneficiaryName: beneficiaryName || undefined,
        description: description || (isReceipt ? 'سند قبض مالي' : 'سند صرف مالي'),
        chequeNo: paymentMethod === 'CHEQUE' ? (chequeNo || undefined) : undefined,
        chequeDueDate: paymentMethod === 'CHEQUE' ? chequeDueDate : undefined,
        chequeBankName: paymentMethod === 'CHEQUE' ? (chequeBankName || undefined) : undefined,
        autoPost: true,
      };
      if (isEdit && editingVoucher) {
        return api.patch(`/treasury/vouchers/${editingVoucher.id}`, body);
      }
      return api.post('/treasury/vouchers', body);
    },
    onSuccess: () => {
      if (!isEdit) clearFormDraft(draftKey);
      onSuccess();
    },
    onError: (e) => toast.error(e),
  });

  const counterHint = useMemo(() => {
    if (counterAccountId) {
      const a = glAccounts.find((x) => x.id === counterAccountId || x.code === counterAccountId);
      if (a) return `${a.code} — ${a.nameAr}`;
    }
    if (partyType === 'CLIENT') return '10301 — العملاء وحسابات القبض';
    if (partyType === 'VENDOR') return '20101 — الموردون وحسابات الدفع';
    if (partyType === 'EMPLOYEE') {
      if (partySubType === 'LOAN' || partySubType === 'LOAN_REPAYMENT') return '10401 — سلف الموظفين';
      if (partySubType === 'CUSTODY' || partySubType === 'CUSTODY_REFUND') return '1320 — العهد النقدية للموظفين';
      if (partySubType === 'PAYROLL') return '20401 — رواتب وأجور مستحقة';
      return isReceipt ? '40101 — إيرادات الخدمات' : '50401 — مصروفات تشغيلية على الموظف';
    }
    return isReceipt ? '40101 — إيرادات' : '50401 — مصروفات تشغيلية';
  }, [counterAccountId, glAccounts, partyType, partySubType, isReceipt]);

  const methodOptions = [
    { value: 'CASH', label: 'نقدي بالخزينة (Cash)' },
    { value: 'BANK_TRANSFER', label: 'تحويل بنكي (Bank Transfer)' },
    { value: 'CHEQUE', label: 'شيك مصرفي (يُسجّل آلياً بحافظة الشيكات)' },
    { value: 'CARD', label: 'شبكة / بطاقة' },
  ];

  const partyOptions = isReceipt
    ? [
        { value: 'CLIENT', label: 'عميل / تحصيل فاتورة مبيعات' },
        { value: 'EMPLOYEE', label: 'موظف (سداد سلفة / رد عهدة)' },
        { value: 'ACCOUNT', label: 'حساب إيراد أو حساب أستاذ عام' },
      ]
    : [
        { value: 'EMPLOYEE', label: 'موظف — مركز التكلفة الرئيسي (مصروف/سلفة/عهدة/مستحق)' },
        { value: 'VENDOR', label: 'مورد / سداد فاتورة مشتريات' },
        { value: 'ACCOUNT', label: 'حساب مصروف / أستاذ عام' },
      ];

  const empSubTypeOptions = isReceipt
    ? [
        { value: 'LOAN_REPAYMENT', label: 'سداد سلفة موظف (10401)' },
        { value: 'CUSTODY_REFUND', label: 'رد فائض عهدة نقدية (1320)' },
        { value: 'GENERAL', label: 'تحصيل / تسوية عامة' },
      ]
    : [
        { value: 'EXPENSE', label: 'مصروف تشغيلي محمّل على الموظف مركز تكلفة (50401)' },
        { value: 'LOAN', label: 'صرف سلفة موظف (10401)' },
        { value: 'CUSTODY', label: 'صرف عهدة نقدية للموظف (1320)' },
        { value: 'PAYROLL', label: 'صرف مستحقات / راتب موظف (20401)' },
      ];

  return (
    <Modal
      open
      onClose={onClose}
      title={
        isEdit
          ? `تعديل ${isReceipt ? 'سند القبض' : 'سند الصرف'} ${editingVoucher?.voucherNo} (تحديث القيد والأرصدة آلياً)`
          : isReceipt
            ? 'إصدار سند قبض وترحيله آلياً'
            : 'إصدار سند صرف وربطه بمركز التكلفة'
      }
      size="xl"
      dirty={Boolean(amount || description)}
      saving={mut.isPending}
      onSaveShortcut={() => !mut.isPending && treasuryAccountId && Number(amount || 0) > 0 && mut.mutate()}
      footer={
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button
            type="button"
            className="btn-primary text-xs flex items-center gap-1.5"
            disabled={mut.isPending || !treasuryAccountId || Number(amount || 0) <= 0}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            {isEdit ? 'حفظ التعديل وتحديث القيد المحاسبي' : 'حفظ وترحيل السند والقيد المحاسبي'}
          </button>
        </div>
      }
    >
      <form
        data-erp-form
        onSubmit={(e) => {
          e.preventDefault();
          if (treasuryAccountId && Number(amount || 0) > 0) mut.mutate();
        }}
        onKeyDown={(e) =>
          handleErpFormKeyDown(e, {
            onSave: () => !mut.isPending && treasuryAccountId && Number(amount || 0) > 0 && mut.mutate(),
          })
        }
        className="space-y-4 text-xs"
      >
        <FormSection title="بيانات الخزينة / البنك وطريقة الدفع" columns={3}>
          <Field label="طريقة الدفع / التحصيل" required>
            <SearchableSelect
              clearable={false}
              value={paymentMethod}
              onChange={(v) => handleMethodChange((v || 'CASH') as any)}
              options={methodOptions}
            />
          </Field>
          <Field label={paymentMethod === 'CASH' ? 'الخزينة النقدية' : 'الحساب البنكي'} required>
            <SearchableSelect
              clearable={false}
              value={treasuryAccountId}
              onChange={(v) => { setTreasuryAccountId(v); persistDraft({ treasuryAccountId: v }); }}
              options={treasuryAccounts.map((a) => ({
                value: a.id,
                label: `${a.kind === 'CASH' ? 'خزينة' : 'بنك'}: ${a.name} (${money(a.balance)} ${a.currencyCode})`,
              }))}
            />
          </Field>
          <Field label="تاريخ السند" required>
            <input type="date" className="input w-full font-mono" value={voucherDate} onChange={(e) => { setVoucherDate(e.target.value); persistDraft({ voucherDate: e.target.value }); }} />
          </Field>
        </FormSection>

        {paymentMethod === 'CHEQUE' && !isEdit && (
          <div className="p-3 rounded-xl border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="رقم الشيك" required>
              <input className="input w-full font-mono" value={chequeNo} onChange={(e) => { setChequeNo(e.target.value); persistDraft({ chequeNo: e.target.value }); }} placeholder="CHQ-1001" />
            </Field>
            <Field label="تاريخ استحقاق الشيك" required>
              <input type="date" className="input w-full font-mono" value={chequeDueDate} onChange={(e) => { setChequeDueDate(e.target.value); persistDraft({ chequeDueDate: e.target.value }); }} />
            </Field>
            <Field label="البنك المسحوب عليه">
              <input className="input w-full" value={chequeBankName} onChange={(e) => { setChequeBankName(e.target.value); persistDraft({ chequeBankName: e.target.value }); }} placeholder="اسم البنك" />
            </Field>
          </div>
        )}

        <FormSection title="الطرف المقابل والربط بمركز التكلفة (الموظف)" columns={3}>
          <Field label="نوع الطرف" required>
            <SearchableSelect
              clearable={false}
              value={partyType}
              onChange={(v) => { const pt = (v || 'CLIENT') as any; setPartyType(pt); persistDraft({ partyType: pt }); }}
              options={partyOptions}
            />
          </Field>

          <Field label={`المبلغ (${selectedTreasury?.currencyCode || 'SAR'})`} required>
            <input type="number" step="any" min="0.01" className="input w-full font-mono font-black text-base" value={amount} onChange={(e) => { setAmount(e.target.value); persistDraft({ amount: e.target.value }); }} placeholder="0.00" />
          </Field>

          {partyType === 'EMPLOYEE' && (
            <Field label={isReceipt ? 'نوع التحصيل من الموظف' : 'الغرض من الصرف للموظف (مركز التكلفة)'}>
              <SearchableSelect
                clearable={false}
                value={partySubType}
                onChange={(v) => { setPartySubType(v); persistDraft({ partySubType: v }); }}
                options={empSubTypeOptions}
              />
            </Field>
          )}

          {partyType === 'CLIENT' && (
            <>
              <Field label="العميل">
                <SearchableSelect
                  value={clientId}
                  onChange={(val) => {
                    setClientId(val);
                    const c = clients.find((x) => x.id === val);
                    if (c) setBeneficiaryName(c.nameAr);
                    persistDraft({ clientId: val, beneficiaryName: c?.nameAr || beneficiaryName });
                  }}
                  placeholder="— اختر العميل —"
                  options={clients.map((c) => ({ value: c.id, label: c.nameAr }))}
                />
              </Field>
              <Field label="ربط بفاتورة مبيعات مفتوحة (لتحديث سدادها آلياً)">
                <SearchableSelect
                  value={invoiceId}
                  onChange={(val) => {
                    setInvoiceId(val);
                    const inv = salesInvoices.find((x) => x.id === val);
                    let nextAmt = amount;
                    let nextDesc = description;
                    if (inv) {
                      const due = Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0));
                      if (!amount && due > 0) { nextAmt = due.toFixed(2); setAmount(nextAmt); }
                      if (!description) { nextDesc = `تحصيل الفاتورة ${inv.invoiceNo}`; setDescription(nextDesc); }
                    }
                    persistDraft({ invoiceId: val, amount: nextAmt, description: nextDesc });
                  }}
                  placeholder="— اختياري —"
                  options={openSalesInvs.map((i) => ({
                    value: i.id,
                    label: `${i.invoiceNo} — ${i.clientName || ''} (متبقي: ${money(Number(i.totalAmount || 0) - Number(i.paidAmount || 0))})`,
                  }))}
                />
              </Field>
            </>
          )}

          {partyType === 'VENDOR' && (
            <>
              <Field label="المورد">
                <SearchableSelect
                  value={vendorId}
                  onChange={(val) => {
                    setVendorId(val);
                    const v = vendors.find((x) => x.id === val);
                    if (v) setBeneficiaryName(v.nameAr);
                    persistDraft({ vendorId: val, beneficiaryName: v?.nameAr || beneficiaryName });
                  }}
                  placeholder="— اختر المورد —"
                  options={vendors.map((v) => ({ value: v.id, label: v.nameAr }))}
                />
              </Field>
              <Field label="ربط بفاتورة مشتريات">
                <SearchableSelect
                  value={purchaseInvoiceId}
                  onChange={(val) => {
                    setPurchaseInvoiceId(val);
                    const inv = purchaseInvoices.find((x) => x.id === val);
                    let nextAmt = amount;
                    let nextDesc = description;
                    if (inv) {
                      if (!amount) { nextAmt = String(inv.totalAmount || ''); setAmount(nextAmt); }
                      if (!description) { nextDesc = `سداد فاتورة مشتريات ${inv.invoiceNo}`; setDescription(nextDesc); }
                    }
                    persistDraft({ purchaseInvoiceId: val, amount: nextAmt, description: nextDesc });
                  }}
                  placeholder="— اختياري —"
                  options={openPurInvs.map((i) => ({ value: i.id, label: `${i.invoiceNo} — ${money(i.totalAmount)} ${i.currencyCode}` }))}
                />
              </Field>
            </>
          )}

          <Field label="الموظف (مركز التكلفة الرئيسي) — Employee Cost Center">
            <SearchableSelect
              value={employeeId}
              onChange={(val) => {
                setEmployeeId(val);
                const emp = employees.find((x) => x.id === val);
                const nextBen = (emp && !beneficiaryName) ? emp.fullNameAr : beneficiaryName;
                if (emp && !beneficiaryName) setBeneficiaryName(emp.fullNameAr);
                persistDraft({ employeeId: val, beneficiaryName: nextBen });
              }}
              placeholder="— اختر الموظف لربط الحركة بمركز تكلفته —"
              options={employees.map((e) => ({ value: e.id, label: `${e.code} — ${e.fullNameAr}` }))}
            />
          </Field>

          <Field label="المشروع (اختياري)">
            <SearchableSelect
              value={projectId}
              onChange={(v) => { setProjectId(v); persistDraft({ projectId: v }); }}
              placeholder="— بدون مشروع —"
              options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.nameAr}` }))}
            />
          </Field>

          <Field label="حساب الأستاذ المقابل (تلقائي أو مخصص)">
            <SearchableSelect
              value={counterAccountId}
              onChange={(v) => { setCounterAccountId(v); persistDraft({ counterAccountId: v }); }}
              placeholder={`تلقائي: ${counterHint}`}
              options={glAccounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.nameAr}` }))}
            />
          </Field>

          <Field label="اسم المستفيد / المسلّم (اختياري)" className="md:col-span-3">
            <input className="input w-full" value={beneficiaryName} onChange={(e) => { setBeneficiaryName(e.target.value); persistDraft({ beneficiaryName: e.target.value }); }} placeholder="يُستكمل تلقائياً من الطرف المختار" />
          </Field>
        </FormSection>

        <Field label="البيان والشرح" required>
          <input className="input w-full" value={description} onChange={(e) => { setDescription(e.target.value); persistDraft({ description: e.target.value }); }} placeholder={isReceipt ? 'مثال: تحصيل دفعة من العميل / سداد سلفة موظف' : 'مثال: صرف مصروف تشغيل لمأمورية الموظف على المشروع'} />
        </Field>

        {/* Live Balanced Journal Entry Preview */}
        <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-300 font-sans border-b border-slate-700 pb-1.5">
            <span className="font-bold flex items-center gap-1.5">
              <Layers className="size-3.5 text-cyan-400" />
              معاينة القيد المحاسبي الآلي المتوازن:
            </span>
            <span className="text-[11px] text-emerald-400">ترحيل فوري للأستاذ ومركز التكلفة</span>
          </div>
          {isReceipt ? (
            <>
              <div className="flex justify-between text-emerald-400">
                <span>من حـ/ {paymentMethod === 'CHEQUE' ? '10305 — أوراق قبض وشيكات تحت التحصيل' : `${selectedTreasury?.glAccountCode} — ${selectedTreasury?.name}`} [مدين]</span>
                <span>+{money(Number(amount || 0))} {selectedTreasury?.currencyCode || 'SAR'}</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>إلى حـ/ {counterHint} [دائن]</span>
                <span>-{money(Number(amount || 0))} {selectedTreasury?.currencyCode || 'SAR'}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-emerald-400">
                <span>من حـ/ {counterHint} [مدين]</span>
                <span>+{money(Number(amount || 0))} {selectedTreasury?.currencyCode || 'SAR'}</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>إلى حـ/ {paymentMethod === 'CHEQUE' ? '20105 — أوراق دفع وشيكات صادرة' : `${selectedTreasury?.glAccountCode} — ${selectedTreasury?.name}`} [دائن]</span>
                <span>-{money(Number(amount || 0))} {selectedTreasury?.currencyCode || 'SAR'}</span>
              </div>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

export function ReceiptVouchersPage() {
  return <TreasuryVouchersPage mode="RECEIPT" />;
}

export function PaymentVouchersPage() {
  return <TreasuryVouchersPage mode="PAYMENT" />;
}
