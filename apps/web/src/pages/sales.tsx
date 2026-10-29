import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, Building2, Code2, Cpu, Download, FileCheck2,
  FileSpreadsheet, FileText, Filter, Plus, Printer, RotateCcw, Send, ShieldCheck, Sparkles,
  Terminal, Trash2, User, Wallet,
} from 'lucide-react';
import { api, Page } from '../lib/api';
import { downloadCsv, money, tafqeetArabic, tafqeetEnglish, today } from '../lib/format';
import { PeriodSelect } from '../components/forms';
import { ZatcaTaxInvoiceTemplate, exportInvoiceToExcel } from '../components/ZatcaTaxInvoiceTemplate';
import { PrintEngine } from '../engine/print-engine';
import {
  Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader,
  ReasonDialog, Stat, useToast,
} from '../components/ui';

// ============================================================================
// Types
// ============================================================================
export interface InvoiceLine {
  id?: string;
  lineNo?: number;
  revenueLineId?: string | null;
  employeeId?: string | null;
  employeeName?: string;
  employeeCode?: string;
  positionTitle?: string;
  pricingBasis?: string;
  units?: string | number;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
  discountPct?: string | number;
  subtotal?: string | number;
  vatRate?: string | number;
  vatAmount?: string | number;
  total?: string | number;
}

export interface InvoiceDetail {
  id: string;
  companyId: string;
  invoiceNo: string;
  invoiceType: 'TAX_INVOICE' | 'SIMPLIFIED' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
  invoiceSubType: string;
  clientId: string;
  clientName: string;
  clientNameEn?: string;
  clientVatNumber?: string;
  clientCrNumber?: string;
  clientAddress?: string;
  clientCity?: string;
  projectId?: string;
  projectName?: string;
  projectCode?: string;
  fiscalPeriodId: string;
  periodName?: string;
  issueDate: string;
  issueTime: string;
  dueDate?: string;
  currencyCode: string;
  exchangeRate: string;
  originalInvoiceId?: string;
  originalInvoiceNo?: string;
  returnReason?: string;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  subtotalBase: string;
  vatAmountBase: string;
  totalAmountBase: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  paidAmount: string;
  journalEntryId?: string;
  journalEntryNo?: string;
  notes?: string;
  zatcaUuid?: string;
  zatcaIcv?: number;
  zatcaPih?: string;
  zatcaHash?: string;
  zatcaQrCode?: string;
  zatcaStatus: 'PENDING' | 'REPORTED' | 'CLEARED' | 'REJECTED';
  zatcaComplianceStatus: string;
  zatcaSubmittedAt?: string;
  sellerName?: string;
  sellerLegalName?: string;
  sellerVatNumber?: string;
  sellerAddress?: string;
  sellerCrNumber?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIban?: string;
  bankCurrency?: string;
  lines: InvoiceLine[];
}

// ============================================================================
// Invoices List Page
// ============================================================================
export function InvoicesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  const invoices = useQuery({
    queryKey: ['/invoices', typeFilter, statusFilter],
    queryFn: () =>
      api.get<Page<any>>('/invoices', {
        pageSize: 100,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const list = invoices.data?.data ?? [];

  // Summary Metrics
  const totalCount = list.length;
  const postedCount = list.filter((x) => x.status === 'POSTED').length;
  const draftCount = list.filter((x) => x.status === 'DRAFT').length;
  const totalGross = list
    .filter((x) => x.status !== 'CANCELLED')
    .reduce((acc, x) => acc + (x.invoiceType === 'CREDIT_NOTE' ? -Number(x.totalAmount) : Number(x.totalAmount)), 0);
  const totalVat = list
    .filter((x) => x.status !== 'CANCELLED')
    .reduce((acc, x) => acc + (x.invoiceType === 'CREDIT_NOTE' ? -Number(x.vatAmount) : Number(x.vatAmount)), 0);

  const doCancel = async (reason: string) => {
    if (!cancelTargetId) return;
    try {
      await api.post(`/invoices/${cancelTargetId}/cancel`, { reason });
      toast.success('تم إلغاء الفاتورة وعكس القيد المحاسبي');
      qc.invalidateQueries({ queryKey: ['/invoices'] });
      setCancelTargetId(null);
    } catch (e) {
      toast.error(e);
    }
  };

  const doPost = async (id: string) => {
    if (!confirm('ترحيل هذه الفاتورة وتوليد قيدها المحاسبي؟ (الإرسال لهيئة الزكاة منفصل ولم يُفعَّل بعد)')) return;
    try {
      await api.post(`/invoices/${id}/post`);
      toast.success('تم ترحيل الفاتورة وتوليد القيد المحاسبي');
      qc.invalidateQueries({ queryKey: ['/invoices'] });
    } catch (e) {
      toast.error(e);
    }
  };

  const doRepair = async (id: string) => {
    if (!confirm('هذه الفاتورة مرحّلة بلا قيد محاسبي، فلا تظهر إيراداتها وضريبتها في الدفاتر. توليد القيد الآن؟')) return;
    try {
      await api.post(`/invoices/${id}/repair-journal`);
      toast.success('تم توليد القيد المحاسبي للفاتورة');
      qc.invalidateQueries({ queryKey: ['/invoices'] });
    } catch (e) {
      toast.error(e);
    }
  };

  const handleExport = () => {
    downloadCsv(`invoices-${today()}.csv`, [
      ['رقم الفاتورة', 'النوع', 'العميل', 'الرقم الضريبي للعميل', 'المشروع', 'تاريخ الإصدار', 'المبلغ قبل الضريبة', 'الضريبة 15%', 'الإجمالي شامل الضريبة', 'حالة الزكاة', 'الحالة'],
      ...list.map((inv: any) => [
        inv.invoiceNo, inv.invoiceType, inv.clientName, inv.clientVatNumber || '', inv.projectName || '', inv.issueDate, inv.subtotal, inv.vatAmount, inv.totalAmount, inv.zatcaStatus, inv.status,
      ]),
    ]);
    toast.success('تم تصدير الفواتير إلى ملف CSV بنجاح');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="فواتير المبيعات الضريبية (الربط مع الزكاة ZATCA)"
        subtitle="إدارة فواتير العملاء وإصدار الفواتير الآلية من إيرادات وساعات الموظفين بالمشاريع المتوافقة مع متطلبات الفاتورة الإلكترونية."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
              onClick={() => setShowAutoModal(true)}
            >
              <Sparkles className="size-4" /> توليد الفواتير من المشاريع تلقائياً
            </button>
            <button
              className="btn-secondary flex items-center gap-1.5"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="size-4" /> إنشاء فاتورة يدوية
            </button>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Stat label="إجمالي الفواتير" value={String(totalCount)} tone="blue" icon={FileText} hint="سجلات الفوترة الإلكترونية" />
        <Stat label="فواتير معتمدة ومرحّلة" value={String(postedCount)} tone="green" icon={ShieldCheck} hint="معتمدة في دفاتر الحسابات" />
        <Stat label="مسودات قيد المراجعة" value={String(draftCount)} tone="amber" icon={FileCheck2} hint="بانتظار الاعتماد والترحيل" />
        <Stat label="صافي المبيعات (مع الضريبة)" value={money(totalGross)} tone="cyan" icon={Wallet} hint="الإجمالي التعاقدي الفعلي" />
      </div>

      {/* Filters Bar */}
      <div className="card p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <Filter className="size-4 text-slate-400" /> تصفية:
          </div>
          <select
            className="input h-8 text-xs py-1 px-2.5 w-44"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">جميع الأنواع</option>
            <option value="TAX_INVOICE">فاتورة ضريبية قياسية (B2B)</option>
            <option value="SIMPLIFIED">فاتورة ضريبية مبسطة (B2C)</option>
            <option value="CREDIT_NOTE">إشعار دائن (مردودات)</option>
          </select>
          <select
            className="input h-8 text-xs py-1 px-2.5 w-36"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">جميع الحالات</option>
            <option value="DRAFT">مسودة</option>
            <option value="POSTED">مرحّلة ومعتمدة</option>
            <option value="CANCELLED">ملغاة</option>
          </select>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          إجمالي الضريبة 15%: <strong className="text-emerald-700 dark:text-emerald-400">{money(totalVat)}</strong>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="card overflow-hidden">
        {invoices.isLoading ? (
          <Loading />
        ) : invoices.isError ? (
          <ErrorState error={invoices.error} />
        ) : list.length === 0 ? (
          <EmptyState
            text="لا توجد فواتير مبيعات مسجلة حتى الآن."
            action={
              <button className="btn-primary text-xs" onClick={() => setShowAutoModal(true)}>
                توليد فواتير المشاريع الآن
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>رقم الفاتورة</th>
                  <th>النوع</th>
                  <th>العميل</th>
                  <th>المشروع</th>
                  <th>تاريخ الإصدار</th>
                  <th>قبل الضريبة</th>
                  <th>ضريبة 15%</th>
                  <th>الإجمالي شامل الضريبة</th>
                  <th>الزكاة ZATCA</th>
                  <th>الحالة</th>
                  <th className="text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((inv) => {
                  const isCredit = inv.invoiceType === 'CREDIT_NOTE';
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="font-mono font-medium">
                        <Link
                          to={`/sal/invoices/${inv.id}`}
                          className="text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                        >
                          {inv.invoiceNo}
                        </Link>
                      </td>
                      <td>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          isCredit
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                            : inv.invoiceType === 'SIMPLIFIED'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        }`}>
                          {isCredit ? 'إشعار دائن (مردود)' : inv.invoiceType === 'SIMPLIFIED' ? 'مبسطة B2C' : 'ضريبية B2B'}
                        </span>
                      </td>
                      <td>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{inv.clientName}</div>
                        {inv.clientVatNumber && (
                          <div className="text-[11px] font-mono text-slate-400">الرقم الضريبي: {inv.clientVatNumber}</div>
                        )}
                      </td>
                      <td>
                        {inv.projectName ? (
                          <span className="text-xs text-slate-700 dark:text-slate-300">{inv.projectName}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-xs font-mono">{inv.issueDate}</td>
                      <td className="num text-xs">{money(inv.subtotal)}</td>
                      <td className="num text-xs text-amber-700 dark:text-amber-400">{money(inv.vatAmount)}</td>
                      <td className="num font-bold text-slate-900 dark:text-slate-100">
                        {isCredit ? `-${money(inv.totalAmount)}` : money(inv.totalAmount)}
                      </td>
                      <td>
                        {inv.status === 'POSTED' ? (
                          <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded">
                            <ShieldCheck className="size-3.5" /> معتمد ZATCA
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">مسودة</span>
                        )}
                      </td>
                      <td>
                        <Badge
                          color={
                            inv.status === 'POSTED'
                              ? 'green'
                              : inv.status === 'CANCELLED'
                              ? 'red'
                              : 'slate'
                          }
                        >
                          {inv.status === 'POSTED' ? 'مرحّل' : inv.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}
                        </Badge>
                      </td>
                      <td className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="btn-ghost h-7 px-2 text-xs"
                            onClick={() => navigate(`/sal/invoices/${inv.id}`)}
                            title="عرض تفاصيل الفاتورة"
                          >
                            عرض
                          </button>
                          {inv.status === 'DRAFT' && (
                            <button
                              className="btn-ghost h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700"
                              onClick={() => doPost(inv.id)}
                              title="ترحيل واعتماد الزكاة"
                            >
                              ترحيل
                            </button>
                          )}
                          {inv.status === 'POSTED' && !inv.journalEntryId && (
                            <button
                              className="btn-ghost h-7 px-2 text-xs text-amber-700 hover:text-amber-800"
                              onClick={() => doRepair(inv.id)}
                              title="الفاتورة مرحّلة بلا قيد محاسبي: توليد القيد الآن"
                            >
                              توليد القيد
                            </button>
                          )}
                          {inv.status !== 'CANCELLED' && (
                            <button
                              className="btn-ghost h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                              onClick={() => setCancelTargetId(inv.id)}
                              title="إلغاء الفاتورة"
                            >
                              إلغاء
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

      {/* Auto-generate from Revenue Modal */}
      <AutoGenerateInvoicesModal
        open={showAutoModal}
        onClose={() => setShowAutoModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/invoices'] });
        }}
      />

      {/* Manual Invoice Creation Modal */}
      <CreateInvoiceModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/invoices'] });
        }}
      />

      {/* Cancel Dialog */}
      <ReasonDialog
        open={!!cancelTargetId}
        title="إلغاء الفاتورة الضريبية"
        confirmText="تأكيد الإلغاء وعكس القيد"
        danger
        onClose={() => setCancelTargetId(null)}
        onConfirm={doCancel}
      />
    </div>
  );
}

// ============================================================================
// Auto-Generate Invoices Modal
// ============================================================================
function AutoGenerateInvoicesModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [periodId, setPeriodId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [autoPost, setAutoPost] = useState(true);
  const [busy, setBusy] = useState(false);

  const projects = useQuery({
    queryKey: ['/projects-list'],
    queryFn: () => api.get<Page<any>>('/projects', { pageSize: 100 }),
  });

  const handleGenerate = async () => {
    if (!periodId) {
      toast.error(new Error('يرجى اختيار الفترة المالية أولاً'));
      return;
    }
    setBusy(true);
    try {
      const res: any = await api.post('/invoices/auto-generate', {
        fiscalPeriodId: periodId,
        projectId: projectId || undefined,
        issueDate: issueDate || undefined,
        autoPost,
      });

      toast.success(
        `تم توليد ${res.count} فاتورة ضريبية بنجاح بإجمالي ${money(res.totalAmount)}!`
      );
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="توليد فواتير المشاريع تلقائياً من محرك الإيرادات"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button
            className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleGenerate}
            disabled={busy || !periodId}
          >
            {busy ? 'جارٍ التوليد والربط...' : 'بدء توليد الفواتير'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3.5 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
          <Sparkles className="size-5 shrink-0 text-emerald-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">دورة الفوترة الآلية للمشاريع:</p>
            <p>
              يقوم النظام بجلب خطوط الإيراد المعتمدة للموظفين والمبرمجين (وفق أيام العمل أو نسبة التخصيص وأسعار الخدمات)، وتجميعها آلياً لكل عميل ومشروع، وإصدار فواتير ضريبية مفصلة بالبنود مع حساب ضريبة القيمة المضافة 15% وإنشاء شفرة الاستجابة السريعة لهيئة الزكاة ZATCA.
            </p>
          </div>
        </div>

        <Field label="الفترة المالية المعتمدة للفوترة">
          <PeriodSelect value={periodId} onChange={setPeriodId} className="w-full" />
        </Field>

        <Field label="المشروع (اختياري - اتركه فارغاً لفوترة جميع المشاريع)">
          <select
            className="input w-full"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">جميع المشاريع والعملاء</option>
            {projects.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.nameAr}
              </option>
            ))}
          </select>
        </Field>

        <Field label="تاريخ إصدار الفواتير">
          <input
            type="date"
            className="input w-full font-mono"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </Field>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={autoPost}
            onChange={(e) => setAutoPost(e.target.checked)}
          />
          <span className="font-medium text-slate-800 dark:text-slate-200">
            ترحيل الفواتير فوراً واعتماد تشفير هيئة الزكاة وإنشاء القيود المحاسبية تلقائياً
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ============================================================================
// Tech Track Presets & Software Engineering Service Definitions
// ============================================================================
const TECH_TRACK_PRESETS = [
  {
    track: 'تطوير Full-Stack',
    badgeColor: 'blue',
    icon: '💻',
    defaultDesc: 'تطوير واجهات المستخدم التفاعلية وربطها بالواجهات الخلفية وقواعد البيانات',
    defaultBasis: 'HOURS' as const,
    defaultRate: 250,
  },
  {
    track: 'تطوير Backend & APIs',
    badgeColor: 'emerald',
    icon: '⚡',
    defaultDesc: 'بناء وتأمين واجهات برمجة التطبيقات REST/GraphQL وهندسة قواعد البيانات والخدمات السحابية',
    defaultBasis: 'HOURS' as const,
    defaultRate: 260,
  },
  {
    track: 'هندسة Frontend & UI/UX',
    badgeColor: 'indigo',
    icon: '🌐',
    defaultDesc: 'تصميم وبناء شاشات النظام التفاعلية المتجاوبة والأنيميشن وتحسين الأداء وSEO',
    defaultBasis: 'HOURS' as const,
    defaultRate: 230,
  },
  {
    track: 'هندسة سحاب DevOps & Infra',
    badgeColor: 'purple',
    icon: '☁️',
    defaultDesc: 'إعداد خطوط النشر المؤتمتة CI/CD، إدارة خوادم Docker/Kubernetes وتأمين الشبكات والمراقبة',
    defaultBasis: 'HOURS' as const,
    defaultRate: 280,
  },
  {
    track: 'تطبيقات الجوال Mobile Apps',
    badgeColor: 'amber',
    icon: '📱',
    defaultDesc: 'برمجة وبناء تطبيقات الهواتف الذكية (iOS / Android / Flutter) والمزامنة الحية',
    defaultBasis: 'HOURS' as const,
    defaultRate: 240,
  },
  {
    track: 'ذكاء اصطناعي وهندسة بيانات AI',
    badgeColor: 'rose',
    icon: '🤖',
    defaultDesc: 'دمج نماذج الذكاء الاصطناعي وبناء خطوط معالجة وتدقيق وتحليل البيانات الضخمة',
    defaultBasis: 'HOURS' as const,
    defaultRate: 300,
  },
  {
    track: 'ضمان جودة وأتمتة QA Testing',
    badgeColor: 'cyan',
    icon: '🧪',
    defaultDesc: 'إعداد سيناريوهات اختبارات الأتمتة الشاملة E2E واختبارات الأمان واختبار الضغط والأداء',
    defaultBasis: 'HOURS' as const,
    defaultRate: 200,
  },
];

interface SoftwareLineItem {
  employeeId?: string;
  employeeCode?: string;
  employeeName?: string;
  positionTitle?: string;
  track: string;
  description: string;
  pricingBasis: 'HOURS' | 'DAYS' | 'MONTH' | 'FIXED';
  units: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
}

// ============================================================================
// Create Manual Invoice Modal - Expanded Software Engineering Canvas
// ============================================================================
function CreateInvoiceModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [invoiceType, setInvoiceType] = useState<'TAX_INVOICE' | 'SIMPLIFIED'>('TAX_INVOICE');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [currencyCode, setCurrencyCode] = useState('SAR');
  const [notes, setNotes] = useState('شروط السداد: التحويل البنكي خلال 30 يوماً من تاريخ استلام الفاتورة الضريبية.');
  const [busy, setBusy] = useState(false);

  const [lines, setLines] = useState<SoftwareLineItem[]>([
    {
      track: 'تطوير Full-Stack',
      description: 'تطوير وبناء الميزات البرمجية للواجهات الأمامية والخلفية للنظام',
      pricingBasis: 'HOURS',
      units: 160,
      unitPrice: 250,
      discountPct: 0,
      vatRate: 15,
    },
  ]);

  const clients = useQuery({
    queryKey: ['/clients-list'],
    queryFn: () => api.get<Page<any>>('/clients', { pageSize: 100 }),
  });

  const projects = useQuery({
    queryKey: ['/projects-list'],
    queryFn: () => api.get<Page<any>>('/projects', { pageSize: 100 }),
  });

  const employees = useQuery({
    queryKey: ['/employees-invoice-selection'],
    queryFn: () => api.get<Page<any>>('/employees', { pageSize: 200 }),
  });

  const employeeList = employees.data?.data ?? [];

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        track: 'تطوير Full-Stack',
        description: '',
        pricingBasis: 'HOURS',
        units: 40,
        unitPrice: 250,
        discountPct: 0,
        vatRate: 15,
      },
    ]);
  };

  const addPresetLine = (preset: (typeof TECH_TRACK_PRESETS)[0]) => {
    setLines((prev) => [
      ...prev,
      {
        track: preset.track,
        description: preset.defaultDesc,
        pricingBasis: preset.defaultBasis,
        units: 160,
        unitPrice: preset.defaultRate,
        discountPct: 0,
        vatRate: 15,
      },
    ]);
    toast.success(`تمت إضافة بند: ${preset.track}`);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<SoftwareLineItem>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };

        // If employee selected, set employee name and code
        if (patch.employeeId !== undefined) {
          const emp = employeeList.find((e) => e.id === patch.employeeId);
          if (emp) {
            next.employeeName = emp.fullNameAr || emp.fullNameEn;
            next.employeeCode = emp.code;
            if (emp.positionTitle) {
              next.positionTitle = emp.positionTitle;
            }
          } else {
            next.employeeName = undefined;
            next.employeeCode = undefined;
            next.positionTitle = undefined;
          }
        }
        return next;
      }),
    );
  };

  // Live Calculations
  const totalUnits = lines.reduce((acc, l) => acc + (Number(l.units) || 0), 0);
  const subtotal = lines.reduce((acc, l) => {
    const gross = (Number(l.units) || 0) * (Number(l.unitPrice) || 0);
    const disc = gross * ((Number(l.discountPct) || 0) / 100);
    return acc + (gross - disc);
  }, 0);
  const totalDiscount = lines.reduce((acc, l) => {
    const gross = (Number(l.units) || 0) * (Number(l.unitPrice) || 0);
    return acc + gross * ((Number(l.discountPct) || 0) / 100);
  }, 0);
  const vatAmount = lines.reduce((acc, l) => {
    const gross = (Number(l.units) || 0) * (Number(l.unitPrice) || 0);
    const net = gross * (1 - (Number(l.discountPct) || 0) / 100);
    return acc + net * ((Number(l.vatRate) || 15) / 100);
  }, 0);
  const totalAmount = subtotal + vatAmount;

  const handleSubmit = async () => {
    if (!clientId) {
      toast.error(new Error('يرجى اختيار العميل لإصدار الفاتورة'));
      return;
    }
    if (!periodId) {
      toast.error(new Error('يرجى تحديد الفترة المالية المحاسبية'));
      return;
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.description.trim() && !l.track) {
        toast.error(new Error(`يرجى كتابة وصف أو تحديد مسار للخدمة في البند رقم ${i + 1}`));
        return;
      }
      if (l.units <= 0 || l.unitPrice < 0) {
        toast.error(new Error(`الوحدات / الساعات وسعر الوحدة يجب أن تكون أرقاماً موجبة (البند ${i + 1})`));
        return;
      }
    }

    setBusy(true);
    try {
      await api.post('/invoices', {
        invoiceType,
        invoiceSubType: 'STANDARD',
        clientId,
        projectId: projectId || undefined,
        fiscalPeriodId: periodId,
        issueDate,
        dueDate: dueDate || undefined,
        currencyCode,
        notes: notes || undefined,
        lines: lines.map((l) => {
          const basisLabel =
            l.pricingBasis === 'HOURS'
              ? `${l.units} ساعة`
              : l.pricingBasis === 'DAYS'
              ? `${l.units} يوم`
              : l.pricingBasis === 'MONTH'
              ? `تفرغ شهري ${l.units} شهر`
              : 'مهمة برمجية محددة';

          const trackPrefix = l.track ? `[${l.track}]` : '';
          const devPart = l.employeeName ? `المبرمج: ${l.employeeName} (${l.employeeCode || ''})` : '';
          const fullDesc = [trackPrefix, devPart, l.description, `[${basisLabel}]`]
            .filter(Boolean)
            .join(' | ');

          return {
            employeeId: l.employeeId || undefined,
            description: fullDesc || l.description || 'خدمات برمجية واستشارية',
            quantity: l.units,
            unitPrice: l.unitPrice,
            discountPct: l.discountPct,
            vatRate: l.vatRate,
          };
        }),
      });

      toast.success('تم إنشاء الفاتورة الضريبية وتشفير بياناتها بنجاح');
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="max-w-7xl"
      title="إنشاء فاتورة ضريبية للخدمات البرمجية وتأجير الكفاءات (ZATCA Tax Invoice)"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 hidden sm:block">
            <span>المجموع الكلي: </span>
            <strong className="text-emerald-700 dark:text-emerald-400 font-mono text-sm">
              {money(totalAmount)} {currencyCode}
            </strong>
            <span className="text-slate-400 ms-2">({tafqeetArabic(totalAmount, currencyCode)})</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={busy}>
              إلغاء
            </button>
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
              onClick={handleSubmit}
              disabled={busy}
            >
              <Sparkles className="size-4" />
              {busy ? 'جارٍ الحفظ وتوليد ZATCA...' : 'حفظ الفاتورة كمسودة معتمدة'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 text-sm max-h-[80vh] overflow-y-auto px-1">
        {/* Banner Alert */}
        <div className="rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-slate-900 border border-emerald-200 dark:border-emerald-800 p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow">
              <Code2 className="size-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                نظام فوترة الكفاءات البرمجية والحلول الرقمية
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                تسجيل ساعات وأيام عمل المطورين، تخصيص نسب العمل لكل مشروع، وحساب ضريبة القيمة المضافة 15% وتشفير هيئة الزكاة تلقائياً.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 px-2.5 py-1 rounded-full font-semibold border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
              <ShieldCheck className="size-3.5" /> جاهزية الربط مع ZATCA
            </span>
          </div>
        </div>

        {/* Section 1: Parties & Contract Details */}
        <div className="card p-4 bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-2">
            <Building2 className="size-4 text-emerald-600" />
            بيانات العميل والمشروع والفترة المالية
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="العميل / المشتري (Buyer) *">
              <select
                className="input w-full"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">-- اختر العميل من القائمة --</option>
                {clients.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameAr} {c.vatNumber ? `(ضريبي: ${c.vatNumber})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="المشروع المرتبط (Project)">
              <select
                className="input w-full"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">-- خدمات عامة غير مرتبطة بمشروع --</option>
                {projects.data?.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.nameAr}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="الفترة المالية المحاسبية *">
              <PeriodSelect value={periodId} onChange={setPeriodId} className="w-full" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
            <Field label="نوع الفاتورة الضريبية">
              <select
                className="input w-full"
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as any)}
              >
                <option value="TAX_INVOICE">فاتورة ضريبية قياسية (B2B الشركات والمؤسسات)</option>
                <option value="SIMPLIFIED">فاتورة ضريبية مبسطة (B2C الأفراد)</option>
              </select>
            </Field>

            <Field label="العملة الرسمية">
              <select
                className="input w-full font-mono"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                <option value="SAR">SAR - ريال سعودي (الأساس)</option>
                <option value="USD">USD - دولار أمريكي</option>
                <option value="EUR">EUR - يورو أوروبي</option>
                <option value="EGP">EGP - جنيه مصري</option>
              </select>
            </Field>

            <Field label="تاريخ الإصدار والتوريد">
              <input
                type="date"
                className="input w-full font-mono"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </Field>

            <Field label="تاريخ الاستحقاق">
              <input
                type="date"
                className="input w-full font-mono"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Section 2: Quick Tech Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Terminal className="size-4 text-emerald-600" />
              إضافة سريعة لمسارات برمجية متخصصة (Software Engineering Tracks):
            </span>
            <span className="text-[11px] text-slate-400">انقر لإضافة بند مسبق الإعداد للجدول</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {TECH_TRACK_PRESETS.map((p) => (
              <button
                key={p.track}
                type="button"
                onClick={() => addPresetLine(p)}
                className="btn-secondary h-8 px-2.5 text-xs flex items-center gap-1.5 border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 transition"
              >
                <span>{p.icon}</span>
                <span className="font-medium">{p.track}</span>
                <Plus className="size-3 text-emerald-600" />
              </button>
            ))}
          </div>
        </div>

        {/* Section 3: Engineering Services Lines Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
            <div>
              <span className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Cpu className="size-4 text-emerald-600" />
                تفاصيل بنود الخدمات البرمجية وساعات المهندسين (Line Items)
              </span>
              <p className="text-xs text-slate-500">
                حدد المهندس أو المبرمج، نوع الخدمة، أساس الاحتساب وسعر الوحدة والخصم.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 flex items-center gap-1.5 shadow-sm"
              onClick={addLine}
            >
              <Plus className="size-3.5" /> إضافة بند برمجي مخصص
            </button>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-xs">
            <table className="table w-full text-xs">
              <thead className="bg-slate-100/80 dark:bg-slate-800">
                <tr>
                  <th style={{ width: '22%' }}>المبرمج / المهندس التقني</th>
                  <th style={{ width: '18%' }}>المسار البرمجي</th>
                  <th style={{ width: '20%' }}>الوصف الفني للمهمة</th>
                  <th style={{ width: '10%' }} className="text-center">أساس الاحتساب</th>
                  <th style={{ width: '7%' }} className="text-center">الوقت/الكمية</th>
                  <th style={{ width: '9%' }} className="text-end">سعر الوحدة</th>
                  <th style={{ width: '5%' }} className="text-center">الخصم %</th>
                  <th style={{ width: '4%' }} className="text-center">الضريبة</th>
                  <th style={{ width: '10%' }} className="text-end">الإجمالي</th>
                  <th style={{ width: '3%' }}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {lines.map((line, idx) => {
                  const gross = (line.units || 0) * (line.unitPrice || 0);
                  const net = gross * (1 - (line.discountPct || 0) / 100);
                  const vat = net * ((line.vatRate || 15) / 100);
                  const lineTotal = net + vat;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      {/* Developer Selector */}
                      <td>
                        <div className="space-y-1">
                          <select
                            className="input w-full text-xs py-1"
                            value={line.employeeId || ''}
                            onChange={(e) => updateLine(idx, { employeeId: e.target.value || undefined })}
                          >
                            <option value="">-- مهندس / مطور خارجي --</option>
                            {employeeList.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                [{emp.code}] {emp.fullNameAr || emp.fullNameEn}
                              </option>
                            ))}
                          </select>
                          {line.employeeName && (
                            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                              <User className="size-3" /> {line.employeeName}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Technical Track */}
                      <td>
                        <select
                          className="input w-full text-xs py-1 font-medium"
                          value={line.track}
                          onChange={(e) => updateLine(idx, { track: e.target.value })}
                        >
                          <option value="تطوير Full-Stack">💻 تطوير Full-Stack</option>
                          <option value="تطوير Backend & APIs">⚡ تطوير Backend & APIs</option>
                          <option value="هندسة Frontend">🌐 هندسة Frontend & React</option>
                          <option value="هندسة سحاب DevOps">☁️ هندسة سحاب DevOps & Infra</option>
                          <option value="تطبيقات هواتف Mobile">📱 تطبيقات الهواتف Mobile</option>
                          <option value="ذكاء اصطناعي وبيانات AI">🤖 ذكاء اصطناعي وهندسة بيانات</option>
                          <option value="ضمان جودة وأتمتة QA">🧪 ضمان جودة وأتمتة QA</option>
                          <option value="استشارات معمارية وتأمين">🔒 استشارات معمارية وتأمين</option>
                          <option value="خدمات برمجية عامة">⚙️ خدمات برمجية عامة</option>
                        </select>
                      </td>

                      {/* Detailed Description */}
                      <td>
                        <input
                          type="text"
                          className="input w-full text-xs py-1"
                          placeholder="مثال: تطوير واجهات الدفع الإلكتروني وتأمين الـ APIs..."
                          value={line.description}
                          onChange={(e) => updateLine(idx, { description: e.target.value })}
                        />
                      </td>

                      {/* Basis */}
                      <td>
                        <select
                          className="input w-full text-xs py-1 text-center font-mono"
                          value={line.pricingBasis}
                          onChange={(e) => updateLine(idx, { pricingBasis: e.target.value as any })}
                        >
                          <option value="HOURS">ساعات عمل (Hourly)</option>
                          <option value="DAYS">أيام عمل (Daily)</option>
                          <option value="MONTH">تفرغ شهري (Monthly)</option>
                          <option value="FIXED">مهمة محددة (Milestone)</option>
                        </select>
                      </td>

                      {/* Quantity / Units */}
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          min="0.1"
                          className="input w-full text-xs py-1 text-center font-mono font-bold"
                          value={line.units}
                          onChange={(e) => updateLine(idx, { units: parseFloat(e.target.value) || 0 })}
                        />
                      </td>

                      {/* Unit Price */}
                      <td>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          className="input w-full text-xs py-1 text-end font-mono font-medium"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </td>

                      {/* Discount % */}
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="100"
                          className="input w-full text-xs py-1 text-center font-mono"
                          value={line.discountPct}
                          onChange={(e) => updateLine(idx, { discountPct: parseFloat(e.target.value) || 0 })}
                        />
                      </td>

                      {/* VAT % */}
                      <td className="text-center font-mono font-medium text-slate-500">
                        15%
                      </td>

                      {/* Line Total */}
                      <td className="text-end font-mono font-bold text-emerald-800 dark:text-emerald-300">
                        {money(lineTotal)}
                      </td>

                      {/* Delete */}
                      <td className="text-center">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600 p-1 transition"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length <= 1}
                          title="حذف هذا البند"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Live Summary & Tafqeet */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Notes & Bank Transfer terms */}
          <div className="space-y-3">
            <Field label="شروط الدفع وبيانات التحويل البنكي المعتمدة">
              <textarea
                className="input w-full h-24 py-2 text-xs leading-relaxed"
                placeholder="شروط الدفع، رقم الحساب أو الآيبان، شروط التوريد والتسليم..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            {/* Tafqeet Preview Card */}
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-1.5 text-xs">
              <div className="font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                <FileCheck2 className="size-4 text-emerald-600" />
                المبلغ الإجمالي كتابة (Tafqeet):
              </div>
              <div className="text-slate-800 dark:text-slate-200 font-medium">
                <strong>بالعربية: </strong> {tafqeetArabic(totalAmount, currencyCode)}
              </div>
              <div className="text-slate-600 dark:text-slate-400 text-[11px] font-sans">
                <strong>In Words: </strong> {tafqeetEnglish(totalAmount, currencyCode)}
              </div>
            </div>
          </div>

          {/* Totals Table */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs shadow-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>إجمالي ساعات / أيام العمل:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {totalUnits.toFixed(2)} وحدة
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>المجموع الفرعي (غير شامل الضريبة):</span>
              <span className="font-mono font-medium">{money(subtotal + totalDiscount)} {currencyCode}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>إجمالي الخصم التجاري:</span>
                <span className="font-mono font-medium">-{money(totalDiscount)} {currencyCode}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>المبلغ الخاضع للضريبة (Net Taxable):</span>
              <span className="font-mono font-medium">{money(subtotal)} {currencyCode}</span>
            </div>
            <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
              <span>ضريبة القيمة المضافة (15%):</span>
              <span className="font-mono">{money(vatAmount)} {currencyCode}</span>
            </div>
            <div className="pt-2 border-t border-slate-300 dark:border-slate-700 flex justify-between font-black text-base text-slate-900 dark:text-slate-100">
              <span>المجموع الكلي المستحق:</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-400">
                {money(totalAmount)} {currencyCode}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// Invoice Detail & Official Saudi ZATCA Tax Invoice Printable Page
// ============================================================================
export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);
  const [printMode, setPrintMode] = useState<'A4' | 'THERMAL_80MM'>('A4');

  const invoice = useQuery({
    queryKey: ['/invoices', id],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`),
    enabled: !!id,
  });

  const inv = invoice.data;

  const doPost = async () => {
    if (!inv || !confirm('ترحيل هذه الفاتورة وتثبيت القيد المحاسبي؟ (الإرسال لهيئة الزكاة منفصل ولم يُفعَّل بعد)')) return;
    try {
      await api.post(`/invoices/${inv.id}/post`);
      toast.success('تم ترحيل الفاتورة وتوليد القيد المحاسبي');
      qc.invalidateQueries({ queryKey: ['/invoices', id] });
    } catch (e) {
      toast.error(e);
    }
  };

  const doRepair = async () => {
    if (!inv || !confirm('هذه الفاتورة مرحّلة بلا قيد محاسبي. توليد القيد الآن؟')) return;
    try {
      await api.post(`/invoices/${inv.id}/repair-journal`);
      toast.success('تم توليد القيد المحاسبي للفاتورة');
      qc.invalidateQueries({ queryKey: ['/invoices', id] });
    } catch (e) {
      toast.error(e);
    }
  };

  const doCancel = async (reason: string) => {
    if (!inv) return;
    try {
      await api.post(`/invoices/${inv.id}/cancel`, { reason });
      toast.success('تم إلغاء الفاتورة وعكس القيد بنجاح');
      qc.invalidateQueries({ queryKey: ['/invoices', id] });
      setCancelOpen(false);
    } catch (e) {
      toast.error(e);
    }
  };

  const copyIban = (ibanStr: string) => {
    navigator.clipboard.writeText(ibanStr);
    setCopiedIban(true);
    toast.success('تم نسخ رقم الآيبان إلى الحافظة');
    setTimeout(() => setCopiedIban(false), 2500);
  };

  if (invoice.isLoading) return <Loading />;
  if (invoice.isError || !inv) return <ErrorState error={invoice.error} />;

  const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';

  return (
    <div className="space-y-6">
      {/* Non-printed Executive Action Bar */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            to="/sal/invoices"
            className="btn-ghost flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
          >
            <ArrowRight className="size-4" /> العودة للقائمة
          </Link>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 dark:text-slate-100 font-mono">
              {inv.invoiceNo}
            </span>
            <Badge
              color={
                inv.status === 'POSTED' ? 'green' : inv.status === 'CANCELLED' ? 'red' : 'slate'
              }
            >
              {inv.status === 'POSTED' ? 'مرحّلة ومعتمدة لدى الزكاة' : inv.status === 'CANCELLED' ? 'ملغاة' : 'مسودة'}
            </Badge>
            {inv.journalEntryId && (
              <Link
                to={`/acc/journals/${inv.journalEntryId}`}
                className="text-xs text-brand-600 hover:underline font-mono bg-brand-50 dark:bg-brand-950/60 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-800 flex items-center gap-1"
              >
                <FileText className="size-3" /> قيد اليومية: {inv.journalEntryNo}
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {inv.status === 'DRAFT' && (
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-xs shadow-sm"
              onClick={doPost}
            >
              <Send className="size-3.5" /> ترحيل الفاتورة وتوليد القيد المحاسبي
            </button>
          )}

          {inv.status === 'POSTED' && !inv.journalEntryId && (
            <button
              className="btn-primary bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 text-xs shadow-sm"
              onClick={doRepair}
            >
              <RotateCcw className="size-3.5" /> توليد القيد المحاسبي المفقود
            </button>
          )}

          {inv.status === 'POSTED' && !isCreditNote && (
            <button
              className="btn-secondary flex items-center gap-1.5 text-xs"
              onClick={() => setCreditNoteOpen(true)}
            >
              <RotateCcw className="size-3.5" /> إصدار إشعار دائن (مردود)
            </button>
          )}

          {/* Print Format Switcher */}
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 text-xs">
            <button
              type="button"
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${printMode === 'A4' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}
              onClick={() => setPrintMode('A4')}
            >
              A4 معيارية
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-lg font-semibold transition ${printMode === 'THERMAL_80MM' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`}
              onClick={() => setPrintMode('THERMAL_80MM')}
            >
              حراري 80mm
            </button>
          </div>

          <button
            className="btn-primary bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5 text-xs shadow-sm"
            onClick={async () => {
              await PrintEngine.print({
                elementId: 'tax-invoice-printable',
                title: `فاتورة ضريبية - ${inv.invoiceNo}`,
                pageSize: printMode === 'THERMAL_80MM' ? '80mm' : 'A4',
                orientation: 'portrait',
              });
            }}
          >
            <Printer className="size-3.5" /> طباعة ({printMode === 'THERMAL_80MM' ? 'إيصال حراري' : 'A4'})
          </button>

          <button
            className="btn-secondary flex items-center gap-1.5 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
            onClick={async () => {
              const ok = await exportInvoiceToExcel(inv);
              if (ok) toast.success('تم تصدير الفاتورة كملف Excel (.xlsx) بنجاح');
            }}
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600" /> تصدير Excel (.xlsx)
          </button>

          {inv.status !== 'CANCELLED' && (
            <button
              className="btn-ghost text-rose-600 hover:bg-rose-50 text-xs"
              onClick={() => setCancelOpen(true)}
            >
              إلغاء الفاتورة
            </button>
          )}
        </div>
      </div>

      {/* Official Executive ZATCA Tax Invoice Document (Print Ready) */}
      <ZatcaTaxInvoiceTemplate
        invoice={inv}
        mode={printMode}
        copiedIban={copiedIban}
        onCopyIban={copyIban}
      />

      {/* Credit Note Modal */}
      <CreateCreditNoteModal
        open={creditNoteOpen}
        invoice={inv}
        onClose={() => setCreditNoteOpen(false)}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['/invoices', id] });
          qc.invalidateQueries({ queryKey: ['/invoices'] });
        }}
      />

      {/* Cancel Reason Dialog */}
      <ReasonDialog
        open={cancelOpen}
        title="إلغاء الفاتورة الضريبية"
        confirmText="تأكيد إلغاء الفاتورة وعكس القيد"
        danger
        onClose={() => setCancelOpen(false)}
        onConfirm={doCancel}
      />
    </div>
  );
}

// ============================================================================
// Create Credit Note (Return) Modal
// ============================================================================
function CreateCreditNoteModal({
  open,
  invoice,
  onClose,
  onSuccess,
}: {
  open: boolean;
  invoice: InvoiceDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [returnReason, setReturnReason] = useState('إرجاع خدمات أو تعديل ساعات العمل');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!returnReason.trim()) {
      toast.error(new Error('يرجى تحديد سبب الإشعار الدائن / الإرجاع'));
      return;
    }

    setBusy(true);
    try {
      const res: any = await api.post('/credit-notes', {
        originalInvoiceId: invoice.id,
        returnReason,
        issueDate,
        notes: notes || undefined,
      });

      toast.success(`تم إنشاء الإشعار الدائن برقم ${res.invoiceNo} بنجاح`);
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`إصدار إشعار دائن (مردود مبيعات) للفاتورة ${invoice.invoiceNo}`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button className="btn-primary bg-purple-600 hover:bg-purple-700 text-white" onClick={handleCreate} disabled={busy}>
            {busy ? 'جارٍ الإصدار...' : 'إصدار الإشعار الدائن'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-3 text-xs text-purple-900 dark:text-purple-200 space-y-1">
          <p className="font-semibold">إشعار دائن ضريبي معتمد (Credit Note - ZATCA):</p>
          <p>
            سيتم إنشاء إشعار دائن ضريبي مرتبط برقم الفاتورة الأصلية ومبلغها ({money(invoice.totalAmount)} {invoice.currencyCode})، وتوليد شفرة ZATCA وعكس قيد الإيرادات والضريبة في الحسابات العامة.
          </p>
        </div>

        <Field label="سبب الإرجاع / التعديل (إلزامي للزكاة) *">
          <input
            type="text"
            className="input w-full"
            placeholder="مثال: إلغاء عقد، تخفيض ساعات، تعديل خطأ في الفاتورة..."
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
        </Field>

        <Field label="تاريخ الإصدار">
          <input
            type="date"
            className="input w-full font-mono"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </Field>

        <Field label="ملاحظات إضافية">
          <textarea
            className="input w-full h-16 py-1 text-xs"
            placeholder="أي تفاصيل تود إضافتها..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ============================================================================
// Credit Notes Page
// ============================================================================
export function CreditNotesPage() {
  const invoices = useQuery({
    queryKey: ['/invoices', 'CREDIT_NOTE'],
    queryFn: () => api.get<Page<any>>('/credit-notes', { pageSize: 100 }),
  });

  const list = invoices.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="المردودات والإشعارات الدائنة (Credit Notes)"
        subtitle="سجل الإشعارات الدائنة المعتمدة لدى هيئة الزكاة والضريبة والجمارك ومردودات المبيعات المرتبطة بالفواتير الأصلية."
      />

      <div className="card overflow-hidden">
        {invoices.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyState text="لا توجد إشعارات دائنة أو مردودات مسجلة." />
        ) : (
          <table className="table w-full">
            <thead>
              <tr>
                <th>رقم الإشعار</th>
                <th>العميل</th>
                <th>المشروع</th>
                <th>تاريخ الإصدار</th>
                <th>المبلغ المردود</th>
                <th>الضريبة 15%</th>
                <th>الإجمالي الدائن</th>
                <th>الحالة</th>
                <th className="text-end">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="font-mono font-medium">
                    <Link
                      to={`/sal/invoices/${inv.id}`}
                      className="text-purple-600 hover:underline flex items-center gap-1"
                    >
                      {inv.invoiceNo}
                    </Link>
                  </td>
                  <td>{inv.clientName}</td>
                  <td>{inv.projectName || '—'}</td>
                  <td className="font-mono text-xs">{inv.issueDate}</td>
                  <td className="num font-mono text-xs">{money(inv.subtotal)}</td>
                  <td className="num font-mono text-xs text-amber-700 dark:text-amber-400">{money(inv.vatAmount)}</td>
                  <td className="num font-bold text-purple-700 dark:text-purple-300">
                    -{money(inv.totalAmount)}
                  </td>
                  <td>
                    <Badge color={inv.status === 'POSTED' ? 'green' : inv.status === 'CANCELLED' ? 'red' : 'slate'}>
                      {inv.status === 'POSTED' ? 'معتمد ومرحل' : inv.status === 'CANCELLED' ? 'ملغى' : 'مسودة'}
                    </Badge>
                  </td>
                  <td className="text-end">
                    <Link to={`/sal/invoices/${inv.id}`} className="btn-ghost h-7 px-2 text-xs">
                      عرض وطباعة
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
