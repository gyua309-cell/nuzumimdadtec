import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, CheckCircle2,
  Clock, Download, Eye, FileCheck, FileText, Layers,
  Plus, Printer, Trash2, Wallet
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { date, downloadCsv, money, today } from '../lib/format';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';

export interface Custody {
  id: string;
  company_id: string;
  custody_no: string;
  employee_id: string;
  employeeCode: string;
  employeeNameAr: string;
  employeeNameEn: string | null;
  title_ar: string;
  title_en: string | null;
  purpose: string | null;
  source_currency: string;
  requested_amount: string;
  disbursed_amount: string;
  disbursed_amount_base: string;
  disbursed_at: string | null;
  disbursed_from_account_id: string | null;
  disbursedFromAccountNameAr: string | null;
  disbursement_journal_entry_id: string | null;
  disbursementEntryNo: string | null;
  target_currency: string;
  conversion_rate: string;
  converted_amount_source: string;
  converted_amount_target: string;
  converted_at: string | null;
  conversion_receipt_no: string | null;
  conversion_notes: string | null;
  total_settled_amount_target: string;
  remaining_balance_target: string;
  status: 'DRAFT' | 'DISBURSED' | 'CONVERTED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'CLOSED' | 'CANCELLED';
  closure_date: string | null;
  closure_notes: string | null;
  closure_journal_entry_id: string | null;
  closureEntryNo: string | null;
  notes: string | null;
  created_at: string;
  lines?: CustodySettlementLine[];
}

export interface CustodySettlementLine {
  id: string;
  company_id: string;
  custody_id: string;
  line_no: number;
  expense_date: string;
  receipt_no: string | null;
  expense_account_id: string;
  expenseAccountCode: string;
  expenseAccountNameAr: string;
  project_id: string | null;
  projectCode: string | null;
  projectNameAr: string | null;
  cost_center_id: string | null;
  costCenterNameAr: string | null;
  vendor_name: string | null;
  description: string;
  currency_code: string;
  exchange_rate: string;
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total_amount: string;
  journal_entry_id: string | null;
  journalEntryNo: string | null;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  receipt_file_url: string | null;
  notes: string | null;
}

const CUSTODY_STATUS_CONFIG: Record<string, { label: string; color: 'slate' | 'blue' | 'cyan' | 'amber' | 'green' | 'red' }> = {
  DRAFT: { label: 'مسودة طلب', color: 'slate' },
  DISBURSED: { label: 'منصرفة بالريال', color: 'blue' },
  CONVERTED: { label: 'محولة للجنيه', color: 'cyan' },
  PARTIALLY_SETTLED: { label: 'تسوية جزئية', color: 'amber' },
  SETTLED: { label: 'مسواة بالكامل', color: 'green' },
  CLOSED: { label: 'مغلقة ومستردة', color: 'slate' },
  CANCELLED: { label: 'ملغاة', color: 'red' },
};

export function CustodiesPage() {
  const toast = useToast();
  const qc = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const currencyFilter = 'ALL';
  const [search, setSearch] = useState('');
  const [selectedCustodyId, setSelectedCustodyId] = useState<string | null>(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [disburseModalCustody, setDisburseModalCustody] = useState<Custody | null>(null);
  const [conversionModalCustody, setConversionModalCustody] = useState<Custody | null>(null);
  const [settlementLineModalCustody, setSettlementLineModalCustody] = useState<Custody | null>(null);
  const [postSettleModalCustody, setPostSettleModalCustody] = useState<Custody | null>(null);
  const [closeModalCustody, setCloseModalCustody] = useState<Custody | null>(null);
  const [printModalCustody, setPrintModalCustody] = useState<Custody | null>(null);

  // Query: Custodies List
  const { data: custodiesData, isLoading, error } = useQuery({
    queryKey: ['custodies', statusFilter, currencyFilter, search],
    queryFn: () => {
      const p: Record<string, string> = { pageSize: '100' };
      if (statusFilter !== 'ALL') p.status = statusFilter;
      if (currencyFilter !== 'ALL') p.currency = currencyFilter;
      if (search) p.q = search;
      return api.get<Page<Custody>>('/custodies', p);
    },
  });

  // Query: Custody Report KPIs
  const { data: reportData } = useQuery({
    queryKey: ['custodies-report-summary'],
    queryFn: () => api.get<any>('/custodies/report'),
  });

  // Query: Employees for assignment
  const { data: employees = [] } = useQuery({
    queryKey: ['employees-picker'],
    queryFn: () => api.get<any[]>('/employees', { pageSize: '100' }).then((r: any) => r.data || []),
  });

  // Query: Bank accounts (class ASSET, parent of 1100/1110/1120)
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bank-accounts-picker'],
    queryFn: () => api.get<any[]>('/accounts', { postingOnly: 'true' }).then((r: any) =>
      (r || []).filter((a: any) => ['1100', '1110', '1120'].includes(a.code) || a.accountClass === 'ASSET' && a.code.startsWith('11'))
    ),
  });

  // Query: Expense accounts for vouchers
  const { data: expenseAccounts = [] } = useQuery({
    queryKey: ['expense-accounts-picker'],
    queryFn: () => api.get<any[]>('/accounts', { postingOnly: 'true' }).then((r: any) =>
      (r || []).filter((a: any) => a.accountClass === 'OPERATING_EXPENSE')
    ),
  });

  // Query: Projects for tagging
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-picker'],
    queryFn: () => api.get<any[]>('/projects', { pageSize: '100' }).then((r: any) => r.data || []),
  });

  // Detail Query when custody is selected
  const { data: custodyDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['custody-detail', selectedCustodyId],
    queryFn: () => api.get<Custody>(`/custodies/${selectedCustodyId}`),
    enabled: !!selectedCustodyId,
  });

  // Mutations
  const createCustody = useMutation({
    mutationFn: (body: any) => api.post('/custodies', body),
    onSuccess: (data: any) => {
      toast.success(`تم إنشاء طلب العهدة بنجاح برقم ${data.custody_no}`);
      setCreateModalOpen(false);
      qc.invalidateQueries({ queryKey: ['custodies'] });
      qc.invalidateQueries({ queryKey: ['custodies-report-summary'] });
    },
    onError: (e: any) => toast.error(e),
  });

  const disburseCustody = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.post(`/custodies/${id}/disburse`, body),
    onSuccess: () => {
      toast.success('تم صرف العهدة النقدية بنجاح وتوليد قيد اليومية في الأستاذ العام');
      setDisburseModalCustody(null);
      qc.invalidateQueries({ queryKey: ['custodies'] });
      qc.invalidateQueries({ queryKey: ['custodies-report-summary'] });
      if (selectedCustodyId) qc.invalidateQueries({ queryKey: ['custody-detail', selectedCustodyId] });
    },
    onError: (e: any) => toast.error(e),
  });

  const convertCustody = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.post(`/custodies/${id}/conversion`, body),
    onSuccess: () => {
      toast.success('تم تسجيل تحويل العملة (SAR -> EGP) بنجاح');
      setConversionModalCustody(null);
      qc.invalidateQueries({ queryKey: ['custodies'] });
      qc.invalidateQueries({ queryKey: ['custodies-report-summary'] });
      if (selectedCustodyId) qc.invalidateQueries({ queryKey: ['custody-detail', selectedCustodyId] });
    },
    onError: (e: any) => toast.error(e),
  });

  const addLine = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.post(`/custodies/${id}/lines`, body),
    onSuccess: () => {
      toast.success('تمت إضافة إيصال المصروف إلى العهدة بنجاح');
      setSettlementLineModalCustody(null);
      qc.invalidateQueries({ queryKey: ['custodies'] });
      qc.invalidateQueries({ queryKey: ['custodies-report-summary'] });
      if (selectedCustodyId) qc.invalidateQueries({ queryKey: ['custody-detail', selectedCustodyId] });
    },
    onError: (e: any) => toast.error(e),
  });

  const removeLine = useMutation({
    mutationFn: ({ custodyId, lineId }: { custodyId: string; lineId: string }) => api.del(`/custodies/${custodyId}/lines/${lineId}`),
    onSuccess: () => {
      toast.success('تم حذف إيصال المصروف من العهدة');
      qc.invalidateQueries({ queryKey: ['custodies'] });
      if (selectedCustodyId) qc.invalidateQueries({ queryKey: ['custody-detail', selectedCustodyId] });
    },
    onError: (e: any) => toast.error(e),
  });

  const postSettlement = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.post(`/custodies/${id}/settle`, body),
    onSuccess: () => {
      toast.success('تم ترحيل قيود تسوية مصروفات العهدة بنجاح إلى الأستاذ العام');
      setPostSettleModalCustody(null);
      qc.invalidateQueries({ queryKey: ['custodies'] });
      qc.invalidateQueries({ queryKey: ['custodies-report-summary'] });
      if (selectedCustodyId) qc.invalidateQueries({ queryKey: ['custody-detail', selectedCustodyId] });
    },
    onError: (e: any) => toast.error(e),
  });

  const closeCustody = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.post(`/custodies/${id}/close`, body),
    onSuccess: () => {
      toast.success('تم إقفال العهدة واسترداد الرصيد المتبقي إلى حساب البنك');
      setCloseModalCustody(null);
      qc.invalidateQueries({ queryKey: ['custodies'] });
      qc.invalidateQueries({ queryKey: ['custodies-report-summary'] });
      if (selectedCustodyId) qc.invalidateQueries({ queryKey: ['custody-detail', selectedCustodyId] });
    },
    onError: (e: any) => toast.error(e),
  });

  const custodies = custodiesData?.data || [];
  const kpis = reportData?.kpis;

  // Export CSV
  const handleExportCsv = () => {
    downloadCsv(`custodies-report-${today()}.csv`, [
      ['رقم العهدة', 'أمين العهدة', 'عنوان العهدة', 'عملة الصرف', 'المبلغ المصروف', 'عملة الهدف', 'سعر التحويل', 'المبلغ المحول', 'المنصرف المسوّى', 'الرصيد المتبقي', 'الحالة', 'تاريخ الإنشاء'],
      ...custodies.map((c) => [
        c.custody_no,
        c.employeeNameAr,
        c.title_ar,
        c.source_currency,
        c.disbursed_amount,
        c.target_currency,
        c.conversion_rate,
        c.converted_amount_target,
        c.total_settled_amount_target,
        c.remaining_balance_target,
        CUSTODY_STATUS_CONFIG[c.status]?.label || c.status,
        c.created_at,
      ]),
    ]);
    toast.success('تم تصدير سجلات العهد بنجاح');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="إدارة العهد النقدية ومصروفات الفروع متعددة العملات"
        subtitle="نظام متكامل لإصدار وتحويل عهد الريال إلى الجنيه لفرع مصر، والصرف المباشر وإثبات الفواتير الضريبية والإقفال"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExportCsv}>
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => setCreateModalOpen(true)}>
              <Plus className="size-4" /> طلب عهدة جديدة
            </button>
          </div>
        }
      />

      {/* KPI Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي العهد المنصرفة (SAR)</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Wallet className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {money(kpis?.totalDisbursedSar ?? 0)} SAR
            </div>
            <div className="mt-1 text-xs text-slate-500 flex items-center gap-1">
              <span>تم تحويلها من المركز الرئيسي بالرياض</span>
            </div>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">المحول للجنيه المصري (EGP)</span>
            <span className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
              <ArrowLeftRight className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {money(kpis?.totalConvertedToEgp ?? 0)} EGP
            </div>
            <div className="mt-1 text-xs text-cyan-700 font-medium">
              سيولة فرع مصر الجاهزة للمصروفات التشغيلية
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي الفواتير المسوّاة</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FileCheck className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              {money(kpis?.totalSettledEgp ?? 0)} EGP
            </div>
            <div className="mt-1 text-xs text-emerald-700 font-medium">
              مصروفات موثقة بإيصالات وفواتير ضريبية
            </div>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="card p-5 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">الرصيد المتبقي طرف الفروع</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600 tracking-tight font-mono">
              {money(kpis?.totalRemainingBalanceEgp ?? 0)} EGP
            </div>
            <div className="mt-1 text-xs text-slate-500">
              عهد تحت التسوية أو بانتظار الإقفال
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Actions Bar */}
      <div className="card p-4 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-wrap items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'كافة العهد' },
            { id: 'DRAFT', label: 'مسودة' },
            { id: 'DISBURSED', label: 'منصرفة (SAR)' },
            { id: 'CONVERTED', label: 'محولة (EGP)' },
            { id: 'PARTIALLY_SETTLED', label: 'تسوية جزئية' },
            { id: 'SETTLED', label: 'مسواة بالكامل' },
            { id: 'CLOSED', label: 'مغلقة' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="بحث برقم العهدة أو اسم الموظف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-64 text-xs py-1.5"
          />
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loading />
          </div>
        ) : error ? (
          <div className="p-8">
            <ErrorState error={error} />
          </div>
        ) : custodies.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyState
              text="لا توجد عهد نقدية مطابقة لمعايير البحث."
              action={
                <button className="btn-primary text-xs" onClick={() => setCreateModalOpen(true)}>
                  <Plus className="size-4" /> إنشاء أول عهدة
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="table w-full text-right">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-700 text-xs font-bold">
                  <th className="py-3 px-4">رقم العهدة</th>
                  <th className="py-3 px-4">أمين العهدة (الموظف)</th>
                  <th className="py-3 px-4">عنوان العهدة والغرض</th>
                  <th className="py-3 px-4 text-center">المبلغ المنصرف</th>
                  <th className="py-3 px-4 text-center">تحويل العملة (FX)</th>
                  <th className="py-3 px-4 text-center">المنصرف المسوّى</th>
                  <th className="py-3 px-4 text-center">المتبقي طرف الفرع</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {custodies.map((c) => {
                  const cfg = CUSTODY_STATUS_CONFIG[c.status] || { label: c.status, tone: 'gray' };
                  const targetPool = Number(c.converted_amount_target) > 0 ? Number(c.converted_amount_target) : Number(c.disbursed_amount);
                  const settled = Number(c.total_settled_amount_target);
                  const pct = targetPool > 0 ? Math.min(100, Math.round((settled / targetPool) * 100)) : 0;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Custody No */}
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setSelectedCustodyId(c.id)}
                          className="hover:text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {c.custody_no}
                        </button>
                        <div className="text-[11px] text-slate-400 font-normal">{date(c.created_at)}</div>
                      </td>

                      {/* Employee */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{c.employeeNameAr}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{c.employeeCode}</div>
                      </td>

                      {/* Title & Purpose */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate" title={c.title_ar}>{c.title_ar}</div>
                        {c.purpose && <div className="text-[11px] text-slate-500 truncate" title={c.purpose}>{c.purpose}</div>}
                      </td>

                      {/* Disbursed Amount */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-900">
                        {money(c.disbursed_amount)} {c.source_currency}
                        {c.disbursedFromAccountNameAr && (
                          <div className="text-[10px] text-slate-400 font-normal truncate max-w-[120px] mx-auto">
                            {c.disbursedFromAccountNameAr}
                          </div>
                        )}
                      </td>

                      {/* FX Conversion */}
                      <td className="py-3.5 px-4 text-center">
                        {Number(c.converted_amount_target) > 0 ? (
                          <div>
                            <span className="font-mono font-bold text-cyan-800">
                              {money(c.converted_amount_target)} {c.target_currency}
                            </span>
                            <div className="text-[10px] text-slate-500">
                              سعر الصرف: <span className="font-mono font-semibold">{c.conversion_rate}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">لم تسجل صرافة</span>
                        )}
                      </td>

                      {/* Settled Amount */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-mono font-bold text-emerald-700">
                          {money(c.total_settled_amount_target)} {c.target_currency}
                        </div>
                        {/* Progress bar */}
                        <div className="w-20 mx-auto bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{pct}% استهلاك</div>
                      </td>

                      {/* Remaining Balance */}
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-600">
                        {money(c.remaining_balance_target)} {c.target_currency}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center">
                        <Badge color={cfg.color}>{cfg.label}</Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View details */}
                          <button
                            onClick={() => setSelectedCustodyId(c.id)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                            title="تفاصيل العهدة والإيصالات"
                          >
                            <Eye className="size-4" />
                          </button>

                          {/* Print voucher */}
                          <button
                            onClick={() => setPrintModalCustody(c)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                            title="طباعة سند صرف وتسوية رسمي"
                          >
                            <Printer className="size-4" />
                          </button>

                          {/* Conditional Actions */}
                          {c.status === 'DRAFT' && (
                            <button
                              onClick={() => setDisburseModalCustody(c)}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold"
                            >
                              صرف
                            </button>
                          )}

                          {['DISBURSED', 'CONVERTED', 'PARTIALLY_SETTLED'].includes(c.status) && (
                            <button
                              onClick={() => setConversionModalCustody(c)}
                              className="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded text-xs font-semibold"
                              title="تسجيل صرافة وتحويل العملة"
                            >
                              صرافة
                            </button>
                          )}

                          {['DISBURSED', 'CONVERTED', 'PARTIALLY_SETTLED'].includes(c.status) && (
                            <button
                              onClick={() => setSettlementLineModalCustody(c)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-xs font-semibold"
                              title="إضافة إيصال مصروف"
                            >
                              + إيصال
                            </button>
                          )}

                          {['PARTIALLY_SETTLED'].includes(c.status) && (
                            <button
                              onClick={() => setPostSettleModalCustody(c)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-xs font-semibold"
                              title="ترحيل قيود التسوية إلى الأستاذ العام"
                            >
                              ترحيل
                            </button>
                          )}

                          {['PARTIALLY_SETTLED', 'SETTLED', 'CONVERTED'].includes(c.status) && (
                            <button
                              onClick={() => setCloseModalCustody(c)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                              title="إقفال العهدة واسترداد الفائض"
                            >
                              إقفال
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

      {/* =========================================================================
          DRAWER: Custody Details & Voucher Audit
      ========================================================================= */}
      <Drawer
        open={!!selectedCustodyId}
        onClose={() => setSelectedCustodyId(null)}
        title={custodyDetail ? `تفاصيل وسندات عهدة: ${custodyDetail.custody_no}` : 'تفاصيل العهدة'}
      >
        {isDetailLoading ? (
          <div className="p-8 text-center"><Loading /></div>
        ) : custodyDetail ? (
          <div className="space-y-6">
            {/* Summary Header */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{custodyDetail.title_ar}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    أمين العهدة: <span className="font-bold text-slate-800">{custodyDetail.employeeNameAr}</span> ({custodyDetail.employeeCode})
                  </div>
                </div>
                <Badge color={CUSTODY_STATUS_CONFIG[custodyDetail.status]?.color || 'slate'}>
                  {CUSTODY_STATUS_CONFIG[custodyDetail.status]?.label || custodyDetail.status}
                </Badge>
              </div>

              {custodyDetail.purpose && (
                <p className="text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200">
                  <span className="font-bold text-slate-800">الغرض من العهدة:</span> {custodyDetail.purpose}
                </p>
              )}

              {/* Financial Metrics Strip */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-center">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-semibold">المبلغ المنصرف</div>
                  <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                    {money(custodyDetail.disbursed_amount)} {custodyDetail.source_currency}
                  </div>
                </div>

                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-semibold">المحول للجنيه (FX)</div>
                  <div className="text-sm font-mono font-bold text-cyan-800 mt-0.5">
                    {money(custodyDetail.converted_amount_target)} {custodyDetail.target_currency}
                  </div>
                </div>

                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-semibold">المصروفات المسوّاة</div>
                  <div className="text-sm font-mono font-bold text-emerald-700 mt-0.5">
                    {money(custodyDetail.total_settled_amount_target)} {custodyDetail.target_currency}
                  </div>
                </div>

                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-[11px] text-slate-500 font-semibold">الرصيد المتبقي</div>
                  <div className="text-sm font-mono font-bold text-amber-600 mt-0.5">
                    {money(custodyDetail.remaining_balance_target)} {custodyDetail.target_currency}
                  </div>
                </div>
              </div>
            </div>

            {/* General Ledger Postings Links */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Layers className="size-3.5 text-blue-600" /> قيود اليومية الآلية المرتبطة بالعهدة
              </h4>
              <div className="flex flex-wrap gap-2 text-xs">
                {custodyDetail.disbursementEntryNo ? (
                  <div className="p-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-blue-600" />
                    <span>قيد صرف العهدة: <strong>{custodyDetail.disbursementEntryNo}</strong></span>
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs">لا يوجد قيد صرف مسجل بعد</span>
                )}

                {custodyDetail.closureEntryNo && (
                  <div className="p-2 bg-green-50 border border-green-200 text-green-800 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-green-600" />
                    <span>قيد إقفال واسترداد العهدة: <strong>{custodyDetail.closureEntryNo}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* Settlement Vouchers Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="size-4 text-emerald-600" />
                  إيصالات وفواتير تسوية المصروفات ({custodyDetail.lines?.length || 0})
                </h4>

                {['DISBURSED', 'CONVERTED', 'PARTIALLY_SETTLED'].includes(custodyDetail.status) && (
                  <button
                    onClick={() => setSettlementLineModalCustody(custodyDetail)}
                    className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                  >
                    <Plus className="size-3.5" /> إضافة إيصال
                  </button>
                )}
              </div>

              {!custodyDetail.lines?.length ? (
                <div className="p-6 text-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-500">
                  لم يتم تسجيل أي إيصالات أو فواتير مصروفات لهذه العهدة بعد.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="table w-full text-xs text-right">
                    <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="py-2 px-3">م</th>
                        <th className="py-2 px-3">التاريخ ورقم الإيصال</th>
                        <th className="py-2 px-3">البيان وحساب المصروف</th>
                        <th className="py-2 px-3">المورد / الجهة</th>
                        <th className="py-2 px-3 text-center">المبلغ قبل الضريبة</th>
                        <th className="py-2 px-3 text-center">الضريبة</th>
                        <th className="py-2 px-3 text-center">الإجمالي</th>
                        <th className="py-2 px-3 text-center">قيد التسوية</th>
                        <th className="py-2 px-3 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {custodyDetail.lines.map((l, idx) => (
                        <tr key={l.id} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <div className="font-semibold">{date(l.expense_date)}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{l.receipt_no || 'بدون إيصال'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-800">{l.description}</div>
                            <div className="text-[10px] text-blue-600 font-mono">
                              {l.expenseAccountCode} — {l.expenseAccountNameAr}
                            </div>
                            {l.projectNameAr && (
                              <div className="text-[10px] text-emerald-600">مشروع: {l.projectNameAr}</div>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{l.vendor_name || '—'}</td>
                          <td className="py-2 px-3 text-center font-mono">{money(l.subtotal)} {l.currency_code}</td>
                          <td className="py-2 px-3 text-center font-mono">
                            {Number(l.vat_amount) > 0 ? (
                              <span className="text-rose-600">+{money(l.vat_amount)} {l.currency_code} ({l.vat_rate}%)</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                            {money(l.total_amount)} {l.currency_code}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-[11px]">
                            {l.journalEntryNo ? (
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                                {l.journalEntryNo}
                              </span>
                            ) : (
                              <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">معلق</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {!l.journal_entry_id && (
                              <button
                                onClick={() => removeLine.mutate({ custodyId: custodyDetail.id, lineId: l.id })}
                                className="text-rose-500 hover:text-rose-700 p-1"
                                title="حذف الإيصال"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* =========================================================================
          MODAL 1: Create Custody Request
      ========================================================================= */}
      <CreateCustodyModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        employees={employees}
        bankAccounts={bankAccounts}
        onSubmit={(body) => createCustody.mutate(body)}
        isPending={createCustody.isPending}
      />

      {/* =========================================================================
          MODAL 2: Disburse Custody Advance
      ========================================================================= */}
      {disburseModalCustody && (
        <DisburseCustodyModal
          custody={disburseModalCustody}
          bankAccounts={bankAccounts}
          onClose={() => setDisburseModalCustody(null)}
          onSubmit={(body) => disburseCustody.mutate({ id: disburseModalCustody.id, body })}
          isPending={disburseCustody.isPending}
        />
      )}

      {/* =========================================================================
          MODAL 3: FX Currency Conversion (SAR -> EGP)
      ========================================================================= */}
      {conversionModalCustody && (
        <ConversionCustodyModal
          custody={conversionModalCustody}
          onClose={() => setConversionModalCustody(null)}
          onSubmit={(body) => convertCustody.mutate({ id: conversionModalCustody.id, body })}
          isPending={convertCustody.isPending}
        />
      )}

      {/* =========================================================================
          MODAL 4: Add Settlement Voucher Line
      ========================================================================= */}
      {settlementLineModalCustody && (
        <AddSettlementLineModal
          custody={settlementLineModalCustody}
          expenseAccounts={expenseAccounts}
          projects={projects}
          onClose={() => setSettlementLineModalCustody(null)}
          onSubmit={(body) => addLine.mutate({ id: settlementLineModalCustody.id, body })}
          isPending={addLine.isPending}
        />
      )}

      {/* =========================================================================
          MODAL 5: Post Settlement to General Ledger
      ========================================================================= */}
      {postSettleModalCustody && (
        <PostSettlementModal
          custody={postSettleModalCustody}
          onClose={() => setPostSettleModalCustody(null)}
          onSubmit={(body) => postSettlement.mutate({ id: postSettleModalCustody.id, body })}
          isPending={postSettlement.isPending}
        />
      )}

      {/* =========================================================================
          MODAL 6: Close Custody & Refund Remainder
      ========================================================================= */}
      {closeModalCustody && (
        <CloseCustodyModal
          custody={closeModalCustody}
          bankAccounts={bankAccounts}
          onClose={() => setCloseModalCustody(null)}
          onSubmit={(body) => closeCustody.mutate({ id: closeModalCustody.id, body })}
          isPending={closeCustody.isPending}
        />
      )}

      {/* =========================================================================
          MODAL 7: Printable Official A4 Voucher
      ========================================================================= */}
      {printModalCustody && (
        <PrintCustodyModal
          custodyId={printModalCustody.id}
          onClose={() => setPrintModalCustody(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 1: Create Custody
// -----------------------------------------------------------------------------
function CreateCustodyModal({
  open, onClose, employees, bankAccounts, onSubmit, isPending,
}: {
  open: boolean; onClose: () => void; employees: any[]; bankAccounts: any[]; onSubmit: (body: any) => void; isPending: boolean;
}) {
  const [employeeId, setEmployeeId] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('SAR');
  const [requestedAmount, setRequestedAmount] = useState('10000');
  const [targetCurrency, setTargetCurrency] = useState('EGP');
  const [disbursedFromAccountId, setDisbursedFromAccountId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !titleAr || !requestedAmount) return;
    onSubmit({
      employeeId,
      titleAr,
      purpose,
      sourceCurrency,
      requestedAmount: parseFloat(requestedAmount),
      targetCurrency,
      disbursedFromAccountId: disbursedFromAccountId || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="طلب عهدة نقدية جديدة"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={isPending}>إلغاء</button>
          <button className="btn-primary text-xs" onClick={handleSubmit} disabled={isPending || !employeeId || !titleAr}>
            {isPending && <Spinner className="size-3.5" />} حفظ طلب العهدة
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <Field label="أمين العهدة المسؤول (الموظف) *">
          <select
            className="input w-full"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
          >
            <option value="">— اختر الموظف أمين العهدة —</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.code} — {emp.full_name_ar || emp.fullNameAr}
              </option>
            ))}
          </select>
        </Field>

        <Field label="مسمى أو عنوان العهدة بالعربية *">
          <input
            className="input w-full"
            placeholder="مثال: عهدة المصروفات التشغيلية لفرع القاهرة - شهر يناير"
            value={titleAr}
            onChange={(e) => setTitleAr(e.target.value)}
            required
          />
        </Field>

        <Field label="الغرض من العهدة والتفاصيل">
          <textarea
            className="input w-full h-16"
            placeholder="مثال: تغطية إيجار المقر، فواتير الاتصالات، ضيافة الاجتماعات، وأدوات مكتبية"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="عملة صرف العهدة من الإدارة">
            <select
              className="input w-full font-bold"
              value={sourceCurrency}
              onChange={(e) => setSourceCurrency(e.target.value)}
            >
              <option value="SAR">ريال سعودي (SAR)</option>
              <option value="EGP">جنيه مصري (EGP)</option>
              <option value="USD">دولار أمريكي (USD)</option>
            </select>
          </Field>

          <Field label="مبلغ العهدة المطلوب *">
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="عملة الصرف في الفرع">
            <select
              className="input w-full font-bold"
              value={targetCurrency}
              onChange={(e) => setTargetCurrency(e.target.value)}
            >
              <option value="EGP">جنيه مصري (EGP) - فرع مصر</option>
              <option value="SAR">ريال سعودي (SAR) - المركز الرئيسي</option>
            </select>
          </Field>

          <Field label="حساب البنك المقترح للصرف">
            <select
              className="input w-full text-xs"
              value={disbursedFromAccountId}
              onChange={(e) => setDisbursedFromAccountId(e.target.value)}
            >
              <option value="">— اختر حساب البنك (اختياري) —</option>
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>{b.code} — {b.nameAr}</option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 2: Disburse Custody Advance
// -----------------------------------------------------------------------------
function DisburseCustodyModal({
  custody, bankAccounts, onClose, onSubmit, isPending,
}: {
  custody: Custody; bankAccounts: any[]; onClose: () => void; onSubmit: (body: any) => void; isPending: boolean;
}) {
  const [disbursedFromAccountId, setDisbursedFromAccountId] = useState(
    custody.disbursed_from_account_id || bankAccounts[0]?.id || ''
  );
  const [disbursedAmount, setDisbursedAmount] = useState(custody.requested_amount);
  const [disbursementDate, setDisbursementDate] = useState(today());
  const [reference, setReference] = useState(`WIRE-${custody.custody_no}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disbursedFromAccountId) return;
    onSubmit({
      disbursedFromAccountId,
      disbursedAmount: parseFloat(disbursedAmount),
      disbursementDate,
      reference,
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`صرف العهدة النقدية: ${custody.custody_no}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={isPending}>إلغاء</button>
          <button className="btn-primary text-xs" onClick={handleSubmit} disabled={isPending || !disbursedFromAccountId}>
            {isPending && <Spinner className="size-3.5" />} اعتماد وصرف وتوليد القيد
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 leading-relaxed">
          <span className="font-bold">سيتم إنشاء قيد يومية آلي في الأستاذ العام:</span>
          <br />• <strong>من حـ/</strong> عهد نقدية ومصروفات تشغيلية ({custody.target_currency === 'EGP' ? '1310 فرع مصر' : '1320 الإدارة'})
          <br />• <strong>إلى حـ/</strong> البنك المصروف منه العهدة
        </div>

        <Field label="الحساب البنكي المصروف منه العهدة *">
          <select
            className="input w-full"
            value={disbursedFromAccountId}
            onChange={(e) => setDisbursedFromAccountId(e.target.value)}
            required
          >
            <option value="">— اختر حساب البنك —</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>{b.code} — {b.nameAr}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ المنصرف">
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold"
              value={disbursedAmount}
              onChange={(e) => setDisbursedAmount(e.target.value)}
              required
            />
          </Field>

          <Field label="تاريخ الصرف والتحويل">
            <input
              type="date"
              className="input w-full font-mono"
              value={disbursementDate}
              onChange={(e) => setDisbursementDate(e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="رقم الحوالة البنكية / المرجع">
          <input
            className="input w-full font-mono"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 3: FX Currency Conversion (SAR -> EGP)
// -----------------------------------------------------------------------------
function ConversionCustodyModal({
  custody, onClose, onSubmit, isPending,
}: {
  custody: Custody; onClose: () => void; onSubmit: (body: any) => void; isPending: boolean;
}) {
  const [sourceAmount, setSourceAmount] = useState(custody.disbursed_amount || custody.requested_amount);
  const [rate, setRate] = useState(custody.conversion_rate || '13.15');
  const [conversionDate, setConversionDate] = useState(today());
  const [receiptNo, setReceiptNo] = useState(custody.conversion_receipt_no || '');
  const [notes, setNotes] = useState(custody.conversion_notes || '');

  const targetAmount = useMemo(() => {
    const s = parseFloat(sourceAmount) || 0;
    const r = parseFloat(rate) || 0;
    return (s * r).toFixed(2);
  }, [sourceAmount, rate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      targetCurrency: custody.target_currency || 'EGP',
      conversionRate: parseFloat(rate),
      convertedAmountSource: parseFloat(sourceAmount),
      convertedAmountTarget: parseFloat(targetAmount),
      conversionDate,
      conversionReceiptNo: receiptNo || null,
      conversionNotes: notes || null,
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`تسجيل صرافة وتحويل العملة: ${custody.custody_no}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={isPending}>إلغاء</button>
          <button className="btn-primary text-xs" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Spinner className="size-3.5" />} حفظ إشعار التحويل والصرافة
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg text-cyan-900 leading-relaxed">
          <span className="font-bold">إثبات تحويل عملة العهدة في فرع مصر:</span>
          <br />تحويل مبلغ العهدة من <strong>الريال السعودي (SAR)</strong> إلى <strong>الجنيه المصري (EGP)</strong> بالبنك أو الصرافة المعتمدة.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ المصروف بالريال (SAR)">
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold"
              value={sourceAmount}
              onChange={(e) => setSourceAmount(e.target.value)}
              required
            />
          </Field>

          <Field label="سعر صرف الريال مقابل الجنيه *">
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold text-cyan-800"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </Field>
        </div>

        {/* Highlighted Result */}
        <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between font-mono">
          <span className="text-xs text-slate-300 font-sans">إجمالي المبلغ المحول المستلم بالجنيه:</span>
          <span className="text-lg font-bold text-cyan-400">{money(targetAmount)} EGP</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ الصرافة / التحويل">
            <input
              type="date"
              className="input w-full font-mono"
              value={conversionDate}
              onChange={(e) => setConversionDate(e.target.value)}
              required
            />
          </Field>

          <Field label="رقم إشعار الصرافة / البنك">
            <input
              className="input w-full font-mono"
              placeholder="مثال: FX-CIB-98214"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
            />
          </Field>
        </div>

        <Field label="ملاحظات الصرافة والبنك">
          <input
            className="input w-full"
            placeholder="مثال: تحويل بنكي وصرف نقدي عبر البنك التجاري الدولي فرع التسعين"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 4: Add Settlement Voucher Line
// -----------------------------------------------------------------------------
function AddSettlementLineModal({
  custody, expenseAccounts, projects, onClose, onSubmit, isPending,
}: {
  custody: Custody; expenseAccounts: any[]; projects: any[]; onClose: () => void; onSubmit: (body: any) => void; isPending: boolean;
}) {
  const [expenseDate, setExpenseDate] = useState(today());
  const [receiptNo, setReceiptNo] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id || '');
  const [projectId, setProjectId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [description, setDescription] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [vatRate, setVatRate] = useState('14'); // Default Egyptian VAT

  const { vatAmount, totalAmount } = useMemo(() => {
    const sub = parseFloat(subtotal) || 0;
    const vr = parseFloat(vatRate) || 0;
    const vat = sub * (vr / 100);
    const tot = sub + vat;
    return { vatAmount: vat.toFixed(2), totalAmount: tot.toFixed(2) };
  }, [subtotal, vatRate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAccountId || !description || !subtotal) return;
    onSubmit({
      expenseDate,
      receiptNo: receiptNo || null,
      expenseAccountId,
      projectId: projectId || null,
      vendorName: vendorName || null,
      description,
      currencyCode: custody.target_currency || 'EGP',
      subtotal: parseFloat(subtotal),
      vatRate: parseFloat(vatRate),
      vatAmount: parseFloat(vatAmount),
      totalAmount: parseFloat(totalAmount),
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`إضافة إيصال / فاتورة تسوية للعهدة: ${custody.custody_no}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={isPending}>إلغاء</button>
          <button className="btn-primary text-xs" onClick={handleSubmit} disabled={isPending || !expenseAccountId || !description || !subtotal}>
            {isPending && <Spinner className="size-3.5" />} إضافة الإيصال للعهدة
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ الفاتورة / الإيصال *">
            <input
              type="date"
              className="input w-full font-mono"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </Field>

          <Field label="رقم الفاتورة الضريبية أو الإيصال">
            <input
              className="input w-full font-mono"
              placeholder="مثال: INV-2026-904"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
            />
          </Field>
        </div>

        <Field label="حساب المصروف التشغيلي *">
          <select
            className="input w-full font-bold"
            value={expenseAccountId}
            onChange={(e) => setExpenseAccountId(e.target.value)}
            required
          >
            <option value="">— اختر حساب المصروف —</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.nameAr}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المورد أو الجهة المصروف لها">
            <input
              className="input w-full"
              placeholder="مثال: شركة المصرية للاتصالات WE"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </Field>

          <Field label="المشروع المرتبط (اختياري)">
            <select
              className="input w-full"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">— عام للمقر والفرع —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.nameAr}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="بيان المصروف بالتفصيل *">
          <input
            className="input w-full"
            placeholder="مثال: سداد فاتورة الإنترنت فايبر فائق السرعة لمقر فرع التجمع"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="المبلغ قبل الضريبة *">
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              required
            />
          </Field>

          <Field label="نسبة الضريبة %">
            <select
              className="input w-full font-mono font-bold"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            >
              <option value="14">14% (ضريبة القيمة المضافة بمصر)</option>
              <option value="15">15% (ضريبة القيمة المضافة بالسعودية)</option>
              <option value="0">0% (معفى / بدون ضريبة)</option>
            </select>
          </Field>

          <Field label="مبلغ الضريبة">
            <input
              readOnly
              className="input w-full font-mono bg-slate-50 text-slate-700"
              value={vatAmount}
            />
          </Field>
        </div>

        {/* Total Pill */}
        <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between font-mono">
          <span className="text-xs text-slate-300 font-sans">إجمالي المنصرف من العهدة:</span>
          <span className="text-lg font-bold text-emerald-400">
            {money(totalAmount)} {custody.target_currency || 'EGP'}
          </span>
        </div>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 5: Post Settlement
// -----------------------------------------------------------------------------
function PostSettlementModal({
  custody, onClose, onSubmit, isPending,
}: {
  custody: Custody; onClose: () => void; onSubmit: (body: any) => void; isPending: boolean;
}) {
  const [settlementDate, setSettlementDate] = useState(today());
  const [reference, setReference] = useState(`SETTLE-${custody.custody_no}`);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ settlementDate, reference });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`ترحيل قيود تسوية مصروفات العهدة: ${custody.custody_no}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={isPending}>إلغاء</button>
          <button className="btn-primary text-xs" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Spinner className="size-3.5" />} اعتماد وترحيل القيود
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 leading-relaxed">
          <span className="font-bold">سيتم إنشاء قيد اليومية المزدوج التالي في الأستاذ العام:</span>
          <br />• <strong>من مذكورين (مدين):</strong> حسابات المصروفات التشغيلية لكل إيصال + ضريبة المدخلات (1250)
          <br />• <strong>إلى حـ/ (دائن):</strong> عهد نقدية ومصروفات تشغيلية ({custody.target_currency === 'EGP' ? '1310 فرع مصر' : '1320 الإدارة'}) لتخفيض رصيد العهدة.
        </div>

        <Field label="تاريخ ترحيل قيد التسوية">
          <input
            type="date"
            className="input w-full font-mono"
            value={settlementDate}
            onChange={(e) => setSettlementDate(e.target.value)}
            required
          />
        </Field>

        <Field label="المرجع المحاسبي">
          <input
            className="input w-full font-mono"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 6: Close Custody & Refund Remainder
// -----------------------------------------------------------------------------
function CloseCustodyModal({
  custody, bankAccounts, onClose, onSubmit, isPending,
}: {
  custody: Custody; bankAccounts: any[]; onClose: () => void; onSubmit: (body: any) => void; isPending: boolean;
}) {
  const [closureDate, setClosureDate] = useState(today());
  const [refundToAccountId, setRefundToAccountId] = useState(bankAccounts[0]?.id || '');
  const [refundAmount, setRefundAmount] = useState(custody.remaining_balance_target || '0');
  const [closureNotes, setClosureNotes] = useState('تم استرداد متبقي العهدة وإقفالها بالكامل.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      closureDate,
      refundToAccountId: parseFloat(refundAmount) > 0 ? refundToAccountId : null,
      refundAmount: parseFloat(refundAmount),
      closureNotes,
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`إقفال العهدة واسترداد الرصيد: ${custody.custody_no}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose} disabled={isPending}>إلغاء</button>
          <button className="btn-primary text-xs" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Spinner className="size-3.5" />} إقفال العهدة وتوليد قيد الاسترداد
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 leading-relaxed">
          <span className="font-bold">إقفال العهدة نهائياً:</span>
          <br />الرصيد المتبقي طرف أمين العهدة: <strong className="font-mono">{money(custody.remaining_balance_target)} {custody.target_currency || 'EGP'}</strong>.
          {parseFloat(custody.remaining_balance_target || '0') > 0 && (
            <span> سيتم توريده وإيداعه في حساب البنك وتوليد قيد استرداد دائن للعهدة ومدين للبنك.</span>
          )}
        </div>

        <Field label="تاريخ الإقفال والاسترداد">
          <input
            type="date"
            className="input w-full font-mono"
            value={closureDate}
            onChange={(e) => setClosureDate(e.target.value)}
            required
          />
        </Field>

        {parseFloat(custody.remaining_balance_target || '0') > 0 && (
          <>
            <Field label="حساب البنك المسترد إليه الفائض">
              <select
                className="input w-full font-bold"
                value={refundToAccountId}
                onChange={(e) => setRefundToAccountId(e.target.value)}
                required
              >
                <option value="">— اختر حساب البنك —</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.nameAr}</option>
                ))}
              </select>
            </Field>

            <Field label="مبلغ الفائض المسترد">
              <input
                type="number"
                step="any"
                className="input w-full font-mono font-bold"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                required
              />
            </Field>
          </>
        )}

        <Field label="ملاحظات الإقفال">
          <textarea
            className="input w-full h-16"
            value={closureNotes}
            onChange={(e) => setClosureNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal 7: Printable Official A4 Voucher
// -----------------------------------------------------------------------------
function PrintCustodyModal({ custodyId, onClose }: { custodyId: string; onClose: () => void }) {
  const { data: custody, isLoading } = useQuery({
    queryKey: ['custody-detail', custodyId],
    queryFn: () => api.get<Custody>(`/custodies/${custodyId}`),
  });

  if (isLoading || !custody) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="طباعة سند صرف وتسوية عهدة رسمية"
      maxWidth="max-w-4xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn-secondary text-xs" onClick={onClose}>إغلاق</button>
          <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" /> طباعة السند (A4)
          </button>
        </div>
      }
    >
      <div className="p-4 bg-white text-slate-900 font-sans print:p-0 space-y-5" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">شركة عزم للاتصالات وتقنية المعلومات</h2>
            <div className="text-xs text-slate-600 mt-1">
              الإدارة المالية والمحاسبية — نظام إدارة العهد النقدية ومصروفات الفروع
            </div>
          </div>
          <div className="text-left font-mono">
            <div className="text-base font-bold text-slate-900">{custody.custody_no}</div>
            <div className="text-xs text-slate-500">{date(custody.created_at)}</div>
          </div>
        </div>

        {/* Voucher Title */}
        <div className="text-center py-2 bg-slate-100 rounded border border-slate-300">
          <h3 className="text-base font-bold text-slate-900">سند صرف وتسوية عهدة تشغيلية لفرع مصر</h3>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 p-3 rounded">
          <div><span className="font-bold">أمين العهدة المسؤول:</span> {custody.employeeNameAr} ({custody.employeeCode})</div>
          <div><span className="font-bold">مسمى العهدة:</span> {custody.title_ar}</div>
          <div><span className="font-bold">المبلغ المصروف بالريال:</span> {money(custody.disbursed_amount)} SAR</div>
          <div><span className="font-bold">المبلغ المحول بالجنيه (سعر {custody.conversion_rate}):</span> {money(custody.converted_amount_target)} EGP</div>
          {custody.purpose && <div className="col-span-2"><span className="font-bold">الغرض:</span> {custody.purpose}</div>}
        </div>

        {/* Vouchers Table */}
        <div>
          <h4 className="text-xs font-bold mb-2">بيان فواتير وإيصالات التسوية المرفقة:</h4>
          <table className="table w-full text-xs text-right border border-slate-300">
            <thead className="bg-slate-100 border-b border-slate-300 font-bold">
              <tr>
                <th className="py-2 px-3 border-l border-slate-300">م</th>
                <th className="py-2 px-3 border-l border-slate-300">التاريخ</th>
                <th className="py-2 px-3 border-l border-slate-300">رقم الإيصال</th>
                <th className="py-2 px-3 border-l border-slate-300">البيان وحساب المصروف</th>
                <th className="py-2 px-3 border-l border-slate-300">المورد / الجهة</th>
                <th className="py-2 px-3 border-l border-slate-300 text-center">المبلغ قبل الضريبة</th>
                <th className="py-2 px-3 border-l border-slate-300 text-center">الضريبة</th>
                <th className="py-2 px-3 text-center">الإجمالي (EGP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {custody.lines?.map((l, idx) => (
                <tr key={l.id}>
                  <td className="py-2 px-3 border-l border-slate-200 font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 border-l border-slate-200 font-mono">{date(l.expense_date)}</td>
                  <td className="py-2 px-3 border-l border-slate-200 font-mono">{l.receipt_no || '—'}</td>
                  <td className="py-2 px-3 border-l border-slate-200">{l.description} ({l.expenseAccountNameAr})</td>
                  <td className="py-2 px-3 border-l border-slate-200">{l.vendor_name || '—'}</td>
                  <td className="py-2 px-3 border-l border-slate-200 text-center font-mono">{money(l.subtotal)} EGP</td>
                  <td className="py-2 px-3 border-l border-slate-200 text-center font-mono">{money(l.vat_amount)} EGP</td>
                  <td className="py-2 px-3 text-center font-mono font-bold">{money(l.total_amount)} EGP</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-900 font-bold">
              <tr>
                <td colSpan={7} className="py-2 px-3 text-left">إجمالي المصروفات المسوّاة بإيصالات:</td>
                <td className="py-2 px-3 text-center font-mono font-black text-slate-900">
                  {money(custody.total_settled_amount_target)} EGP
                </td>
              </tr>
              <tr>
                <td colSpan={7} className="py-2 px-3 text-left text-amber-700">صافي الرصيد المتبقي طرف أمين العهدة:</td>
                <td className="py-2 px-3 text-center font-mono font-black text-amber-700">
                  {money(custody.remaining_balance_target)} EGP
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 4 Official Approvals Signatures */}
        <div className="pt-8 grid grid-cols-4 gap-4 text-center text-xs">
          <div className="space-y-12">
            <div className="font-bold text-slate-800">أمين العهدة المستلم</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والتاريخ</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold text-slate-800">المحاسب المالي المختص</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والتاريخ</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold text-slate-800">المدير المالي (CFO)</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">الاعتماد والتاريخ</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold text-slate-800">المدير العام / المفوض</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">المصادقة والختم</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
