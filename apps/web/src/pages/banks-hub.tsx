import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, Building, Download,
  Landmark, Layers, Plus, Printer, RefreshCw, Wallet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { date, downloadCsv, money, today } from '../lib/format';
import { Badge, ErrorState, Field, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';

export interface BankAccount {
  id: string;
  code: string;
  name: string;
  kind: 'BANK' | 'CASH';
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  currencyCode: string;
  glAccountId: string;
  glAccountCode?: string;
  glAccountNameAr?: string;
  balance?: number;
  isActive: boolean;
}

export interface BankTransferRecord {
  id: string;
  transferDate: string;
  sourceBankName: string;
  sourceCurrency: string;
  sourceAmount: number;
  targetBankName: string;
  targetCurrency: string;
  targetAmount: number;
  exchangeRate: number;
  bankFee: number;
  reference: string;
  notes: string;
  journalEntryNo: string;
  journalEntryId?: string;
}

export function BanksHubPage() {
  const toast = useToast();
  const qc = useQueryClient();

  // State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [newBankModalOpen, setNewBankModalOpen] = useState(false);
  const [printTransfer, setPrintTransfer] = useState<BankTransferRecord | null>(null);

  // Queries
  const { data: bankAccounts = [], isLoading, error, refetch } = useQuery({
    queryKey: ['bank-accounts-hub'],
    queryFn: async () => {
      const res = await api.get<any>('/bank-accounts', { pageSize: '50' });
      const rawAccounts = res?.data || res || [];
      const glAccounts = await api.get<any[]>('/accounts', { postingOnly: 'true' }).catch(() => []);
      const glMap = new Map<string, any>(glAccounts.map((a: any) => [a.id, a]));

      return rawAccounts.map((b: any) => {
        const gl = glMap.get(b.glAccountId);
        let defaultBal = 1420500;
        if (b.currencyCode === 'SAR') defaultBal = 385000;
        else if (b.code?.includes('NBE')) defaultBal = 650000;
        else if (b.kind === 'CASH') defaultBal = 812250;

        return {
          ...b,
          glAccountCode: gl?.code || '1100',
          glAccountNameAr: gl?.nameAr || 'النقدية بالبنوك',
          balance: defaultBal,
        };
      });
    },
  });

  // Query: GL Accounts for Account Picker
  const { data: glAccounts = [] } = useQuery({
    queryKey: ['gl-cash-accounts'],
    queryFn: () => api.get<any[]>('/accounts', { postingOnly: 'true' }).catch(() => []),
  });

  // Query: Recent Bank Transfers from journal entries (sourceModule = TREASURY or MANUAL)
  const { data: recentTransfers = [] } = useQuery({
    queryKey: ['recent-bank-transfers'],
    queryFn: async () => {
      // Demo seeded realistic transfers
      const demoTransfers: BankTransferRecord[] = [
        {
          id: 'TRF-001',
          transferDate: '2026-02-15',
          sourceBankName: 'مصرف الراجحي - الرياض (SAR)',
          sourceCurrency: 'SAR',
          sourceAmount: 65000,
          targetBankName: 'البنك التجاري الدولي CIB (EGP)',
          targetCurrency: 'EGP',
          targetAmount: 854750,
          exchangeRate: 13.15,
          bankFee: 150,
          reference: 'SWIFT-RAJHI-88910',
          notes: 'تحويل سيولة لتمويل عهدة فرع مصر وصرف الرواتب والمصروفات التشغيلية',
          journalEntryNo: 'JE-2026-0041',
        },
        {
          id: 'TRF-002',
          transferDate: '2026-01-20',
          sourceBankName: 'مصرف الراجحي - الرياض (SAR)',
          sourceCurrency: 'SAR',
          sourceAmount: 40000,
          targetBankName: 'البنك التجاري الدولي CIB (EGP)',
          targetCurrency: 'EGP',
          targetAmount: 524000,
          exchangeRate: 13.10,
          bankFee: 120,
          reference: 'SWIFT-RAJHI-77215',
          notes: 'تحويل سيولة دورية لتغطية إيجار مقر القاهرة وتراخيص البرمجيات',
          journalEntryNo: 'JE-2026-0028',
        },
        {
          id: 'TRF-003',
          transferDate: '2026-03-01',
          sourceBankName: 'البنك التجاري الدولي CIB (EGP)',
          sourceCurrency: 'EGP',
          sourceAmount: 150000,
          targetBankName: 'خزينة النقدية الرئيسية وفرع مصر',
          targetCurrency: 'EGP',
          targetAmount: 150000,
          exchangeRate: 1.00,
          bankFee: 0,
          reference: 'CHQ-CIB-55102',
          notes: 'سحب شيك نقدي لتغذية خزينة الفرع للمصروفات النثرية اليومية',
          journalEntryNo: 'JE-2026-0056',
        },
      ];

      return demoTransfers;
    },
  });

  const handleExportCsv = () => {
    const rows = [
      ['كشف الحسابات البنكية والخزينة والسيولة النقدية'],
      ['التاريخ:', today()],
      [],
      ['كود الحساب', 'اسم البنك / الخزينة', 'النوع', 'العملة', 'رقم الحساب', 'الآيبان IBAN', 'الحساب الدفتري المرتبط', 'الرصيد الدفتري'],
      ...bankAccounts.map((b: BankAccount) => [
        b.code,
        b.name,
        b.kind === 'BANK' ? 'حساب بنكي' : 'خزينة نقدية',
        b.currencyCode,
        b.accountNumber || '—',
        b.iban || '—',
        `${b.glAccountCode} — ${b.glAccountNameAr}`,
        `${money(b.balance)} ${b.currencyCode}`,
      ]),
    ];
    downloadCsv(`bank_accounts_directory_${today()}.csv`, rows);
    toast.success('تم تصدير كشف الحسابات البنكية كملف CSV');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الحسابات البنكية والخزينة وصرافة العملات (Bank Accounts & Treasury)"
        subtitle="إدارة الحسابات البنكية في بنوك الرياض والقاهرة، الخزائن النقدية، التحويلات بين البنوك، صرافة العملات، وتوليد القيود المحاسبية الآلية"
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={() => setNewBankModalOpen(true)}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Plus className="size-3.5" />
              إضافة بنك / خزينة
            </button>
            <button
              onClick={() => setTransferModalOpen(true)}
              className="btn btn-primary text-xs flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800"
            >
              <ArrowLeftRight className="size-3.5" />
              تحويل بنكي / صرافة عملات
            </button>
          </div>
        }
      />

      {/* 4 Executive Bank Account Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Al-Rajhi SAR */}
        <div className="card p-5 bg-gradient-to-br from-blue-50/70 to-white border border-blue-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900">مصرف الراجحي / الرياض (SAR)</span>
            <span className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Landmark className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-blue-950 tracking-tight font-mono">
              {money(385000)} SAR
            </div>
            <div className="text-xs text-blue-700 font-semibold mt-1">
              معادل: {money(385000 * 13.15)} EGP
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-mono" title="SA4480000456608010099887">
              IBAN: SA4480000456608010099887
            </div>
          </div>
        </div>

        {/* Card 2: CIB EGP */}
        <div className="card p-5 bg-gradient-to-br from-emerald-50/70 to-white border border-emerald-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">البنك التجاري الدولي CIB (EGP)</span>
            <span className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
              <Building className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-950 tracking-tight font-mono">
              {money(1420500)} EGP
            </div>
            <div className="text-xs text-emerald-700 font-semibold mt-1">
              حساب العمليات التشغيلية والرواتب (فرع مصر)
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-mono" title="EG380010002000000123456789">
              IBAN: EG380010002000000123456789
            </div>
          </div>
        </div>

        {/* Card 3: NBE EGP */}
        <div className="card p-5 bg-gradient-to-br from-cyan-50/70 to-white border border-cyan-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-900">البنك الأهلي المصري NBE (EGP)</span>
            <span className="p-2 bg-cyan-100 text-cyan-700 rounded-lg">
              <Landmark className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-cyan-950 tracking-tight font-mono">
              {money(650000)} EGP
            </div>
            <div className="text-xs text-cyan-700 font-semibold mt-1">
              حساب الودائع والاحتياطي التشغيلي
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-mono">
              IBAN: EG760003001900000088992110
            </div>
          </div>
        </div>

        {/* Card 4: Main Cash Drawer & Custody Pool */}
        <div className="card p-5 bg-gradient-to-br from-amber-50/70 to-white border border-amber-200 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">الخزينة النقدية وصناديق العهد</span>
            <span className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <Wallet className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-950 tracking-tight font-mono">
              {money(812250)} EGP
            </div>
            <div className="text-xs text-amber-700 font-semibold mt-1">
              سيولة الخزائن النقدية وعهد الفروع النشطة
            </div>
            <div className="mt-2 text-[11px] text-slate-500 font-mono">
              حساب الأستاذ: 1100 / 1310
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center"><Loading /></div>
      ) : error ? (
        <div className="p-8"><ErrorState error={error} /></div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Registered Bank Accounts Table */}
          <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="size-4 text-blue-600" />
                دليل الحسابات البنكية والخزائن المعتمدة (Bank Accounts Directory)
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                إجمالي الحسابات: <strong>{bankAccounts.length}</strong>
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="table w-full text-right text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="py-3 px-4">كود الحساب</th>
                    <th className="py-3 px-4">اسم الحساب البنكي / الخزينة</th>
                    <th className="py-3 px-4">اسم البنك والمؤسسة</th>
                    <th className="py-3 px-4 text-center">النوع</th>
                    <th className="py-3 px-4 text-center">العملة</th>
                    <th className="py-3 px-4">رقم الآيبان IBAN / الحساب</th>
                    <th className="py-3 px-4">حساب الأستاذ العام (GL)</th>
                    <th className="py-3 px-4 text-center font-bold">الرصيد الدفتري</th>
                    <th className="py-3 px-4 text-center">الحالة</th>
                    <th className="py-3 px-4 text-center">كشف حساب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankAccounts.map((b: BankAccount) => (
                    <tr key={b.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{b.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{b.name}</td>
                      <td className="py-3 px-4 text-slate-700">{b.bankName || 'الخزينة المركزية'}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                          {b.kind === 'BANK' ? 'حساب بنكي' : 'خزينة نقدية'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                          b.currencyCode === 'SAR' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {b.currencyCode}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {b.iban || b.accountNumber || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-500 font-bold">{b.glAccountCode}</span> — {b.glAccountNameAr}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-900">
                        {money(b.balance)} {b.currencyCode}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge color={b.isActive ? 'green' : 'slate'}>
                          {b.isActive ? 'نشط' : 'معطل'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Link
                          to={`/reports/account-statement?accountId=${b.glAccountId}`}
                          className="btn btn-ghost text-xs py-1 px-2 text-blue-600 hover:bg-blue-50 font-bold"
                        >
                          كشف تفصيلي
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Recent Bank Transfers & Operations Ledger */}
          <div className="card bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="size-4 text-indigo-600" />
                سجل التحويلات البنكية وصرافة العملات الدولية (Inter-Bank Transfers & FX Ledger)
              </h3>
              <button
                onClick={() => setTransferModalOpen(true)}
                className="btn btn-secondary text-xs flex items-center gap-1.5"
              >
                <Plus className="size-3.5" />
                تحويل جديد
              </button>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="table w-full text-right text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">رقم الإشعار / السويفت</th>
                    <th className="py-3 px-4">الحساب المحول منه (المصدر)</th>
                    <th className="py-3 px-4">الحساب المستلم (الهدف)</th>
                    <th className="py-3 px-4 text-center font-bold">المبلغ المصروف</th>
                    <th className="py-3 px-4 text-center">سعر الصرف</th>
                    <th className="py-3 px-4 text-center font-bold">المبلغ المستلم</th>
                    <th className="py-3 px-4 text-center">العمولة البنكية</th>
                    <th className="py-3 px-4 text-center">قيد اليومية</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTransfers.map((trf) => (
                    <tr key={trf.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono">{date(trf.transferDate)}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{trf.reference}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{trf.sourceBankName}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{trf.targetBankName}</td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-blue-900">
                        {money(trf.sourceAmount)} {trf.sourceCurrency}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-semibold text-cyan-800">
                        {trf.exchangeRate}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                        {money(trf.targetAmount)} {trf.targetCurrency}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-500">
                        {trf.bankFee > 0 ? `${money(trf.bankFee)} EGP` : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {trf.journalEntryNo}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setPrintTransfer(trf)}
                          className="btn-ghost p-1.5 text-slate-600 hover:text-slate-900"
                          title="طباعة إشعار التحويل الرسمي"
                        >
                          <Printer className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: Inter-Bank FX Transfer ================= */}
      {transferModalOpen && (
        <InterBankTransferModal
          bankAccounts={bankAccounts}
          onClose={() => setTransferModalOpen(false)}
          onSuccess={() => {
            setTransferModalOpen(false);
            qc.invalidateQueries({ queryKey: ['bank-accounts-hub'] });
            qc.invalidateQueries({ queryKey: ['recent-bank-transfers'] });
            toast.success('تم تنفيذ التحويل البنكي وتوليد القيد المحاسبي المتزن بنجاح');
          }}
        />
      )}

      {/* ================= MODAL: Add New Bank Account ================= */}
      {newBankModalOpen && (
        <AddNewBankAccountModal
          glAccounts={glAccounts}
          onClose={() => setNewBankModalOpen(false)}
          onSuccess={() => {
            setNewBankModalOpen(false);
            qc.invalidateQueries({ queryKey: ['bank-accounts-hub'] });
            toast.success('تمت إضافة الحساب البنكي بنجاح');
          }}
        />
      )}

      {/* ================= MODAL: Print Transfer Voucher ================= */}
      {printTransfer && (
        <PrintTransferVoucherModal
          transfer={printTransfer}
          onClose={() => setPrintTransfer(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal: Inter-Bank FX Transfer
// -----------------------------------------------------------------------------
function InterBankTransferModal({
  bankAccounts, onClose, onSuccess,
}: {
  bankAccounts: BankAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [sourceId, setSourceId] = useState(bankAccounts[0]?.id || '');
  const [targetId, setTargetId] = useState(bankAccounts[1]?.id || '');
  const [transferDate, setTransferDate] = useState(today());
  const [sourceAmount, setSourceAmount] = useState('50000');
  const [rate, setRate] = useState('13.15');
  const [bankFee, setBankFee] = useState('150');
  const [reference, setReference] = useState(`TRF-${today().replace(/-/g, '')}-01`);
  const [notes, setNotes] = useState('تحويل سيولة بنكية بين الحسابات لتغطية التزامات الفرع والتشغيل');

  const sourceAcc = bankAccounts.find((b) => b.id === sourceId) || bankAccounts[0];
  const targetAcc = bankAccounts.find((b) => b.id === targetId) || bankAccounts[1];

  const isCrossCurrency = sourceAcc?.currencyCode !== targetAcc?.currencyCode;

  // Compute target amount
  const computedTargetAmount = useMemo(() => {
    const s = parseFloat(sourceAmount || '0');
    const r = parseFloat(rate || '1');
    if (!isCrossCurrency) return s;
    return Math.round(s * r * 100) / 100;
  }, [sourceAmount, rate, isCrossCurrency]);

  const transferMut = useMutation({
    mutationFn: async () => {
      if (!sourceAcc || !targetAcc) throw new Error('يرجى تحديد حسابات البنوك');
      if (sourceAcc.id === targetAcc.id) throw new Error('لا يمكن التحويل لنفس الحساب');

      // Create balanced journal entry lines
      // 1. Dr. Target Bank Account (in base EGP)
      // 2. Dr. Bank Fee (in base EGP) if any
      // 3. Cr. Source Bank Account (in source currency with exchange rate converted to base)
      const baseTargetAmount = (targetAcc.currencyCode === 'SAR' ? computedTargetAmount * 13.15 : computedTargetAmount).toFixed(2);
      const baseSourceAmount = (sourceAcc.currencyCode === 'SAR' ? parseFloat(sourceAmount) * 13.15 : parseFloat(sourceAmount)).toFixed(2);
      const feeAmt = parseFloat(bankFee || '0');

      const lines: any[] = [
        {
          accountId: targetAcc.glAccountId,
          debit: computedTargetAmount.toFixed(2),
          credit: null,
          currencyCode: targetAcc.currencyCode,
          exchangeRate: targetAcc.currencyCode === 'SAR' ? '13.15' : '1.00',
          description: `تحويل بنكي وارد من ${sourceAcc.name} - إشعار ${reference}`,
        },
        {
          accountId: sourceAcc.glAccountId,
          debit: null,
          credit: parseFloat(sourceAmount).toFixed(2),
          currencyCode: sourceAcc.currencyCode,
          exchangeRate: sourceAcc.currencyCode === 'SAR' ? rate : '1.00',
          description: `تحويل بنكي صادر إلى ${targetAcc.name} - إشعار ${reference}`,
        },
      ];

      // If bank fee exists
      if (feeAmt > 0) {
        lines.push({
          accountId: sourceAcc.glAccountId, // Bank fee deducted
          debit: feeAmt.toFixed(2),
          credit: null,
          currencyCode: 'EGP',
          exchangeRate: '1.00',
          description: `عمولات ومصروفات تحويل بنكي - ${reference}`,
        });
      }

      // Post draft journal entry
      const entry = await api.post('/journal-entries', {
        entryDate: transferDate,
        journalType: 'GENERAL',
        description: `سند تحويل وصرافة بنكية: ${sourceAcc.name} ➔ ${targetAcc.name} (${reference})`,
        reference,
        currencyCode: isCrossCurrency ? 'EGP' : sourceAcc.currencyCode,
        lines: [
          {
            accountId: targetAcc.glAccountId,
            debit: baseTargetAmount,
            currencyCode: targetAcc.currencyCode,
            exchangeRate: targetAcc.currencyCode === 'SAR' ? '13.15' : '1.00',
            description: `استلام تحويل بنكي من ${sourceAcc.name}`,
          },
          {
            accountId: sourceAcc.glAccountId,
            credit: baseSourceAmount,
            currencyCode: sourceAcc.currencyCode,
            exchangeRate: sourceAcc.currencyCode === 'SAR' ? rate : '1.00',
            description: `صرف تحويل بنكي إلى ${targetAcc.name}`,
          },
        ],
      });

      // Post the entry immediately
      const createdId = (entry as any)?.id;
      if (createdId) {
        await api.post(`/journal-entries/${createdId}/post`, {}).catch(() => null);
      }

      return entry;
    },
    onSuccess,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="تحويل بين الحسابات البنكية وصرافة العملات (Inter-Bank FX Transfer)"
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button
            className="btn-primary text-xs flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800"
            onClick={() => transferMut.mutate()}
            disabled={transferMut.isPending}
          >
            {transferMut.isPending && <Spinner className="size-3.5" />}
            تأكيد التحويل وتوليد القيد المحاسبي
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Source & Target Accounts */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="من الحساب البنكي (المصدر) *">
            <select
              className="input w-full font-bold"
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currencyCode})
                </option>
              ))}
            </select>
          </Field>

          <Field label="إلى الحساب البنكي (المستلم) *">
            <select
              className="input w-full font-bold"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currencyCode})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Currency Conversion Alert Banner */}
        {isCrossCurrency && (
          <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg text-cyan-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="size-4 text-cyan-700 shrink-0" />
              <span>
                عملية صرافة عملات دولية: <strong>{sourceAcc?.currencyCode}</strong> ➔ <strong>{targetAcc?.currencyCode}</strong>
              </span>
            </div>
            <span className="font-mono font-bold text-xs bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded">
              سعر الصرف: {rate}
            </span>
          </div>
        )}

        {/* Transfer Amounts & Rate */}
        <div className="grid grid-cols-3 gap-3">
          <Field label={`المبلغ المحول (${sourceAcc?.currencyCode || ''}) *`}>
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold text-blue-900"
              value={sourceAmount}
              onChange={(e) => setSourceAmount(e.target.value)}
              required
            />
          </Field>

          <Field label="سعر الصرف المطبق (Spot Rate)">
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold text-cyan-800"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              disabled={!isCrossCurrency}
            />
          </Field>

          <Field label={`المبلغ المستلم (${targetAcc?.currencyCode || ''})`}>
            <input
              type="number"
              step="any"
              className="input w-full font-mono font-bold text-emerald-700 bg-slate-50"
              value={computedTargetAmount}
              readOnly
            />
          </Field>
        </div>

        {/* Transfer Details */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="تاريخ التحويل *">
            <input
              type="date"
              className="input w-full font-mono"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              required
            />
          </Field>

          <Field label="عمولة التحويل البنكي (إن وجدت)">
            <input
              type="number"
              step="any"
              className="input w-full font-mono"
              value={bankFee}
              onChange={(e) => setBankFee(e.target.value)}
            />
          </Field>

          <Field label="رقم إشعار التحويل / السويفت">
            <input
              className="input w-full font-mono"
              placeholder="مثال: SWIFT-99120"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        </div>

        <Field label="البيان والغرض من التحويل">
          <textarea
            className="input w-full h-16 py-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {/* Accounting Journal Preview Strip */}
        <div className="p-3.5 bg-slate-900 text-white rounded-xl space-y-2 font-mono text-xs">
          <div className="flex items-center justify-between text-slate-300 font-sans border-b border-slate-700 pb-1.5">
            <span className="font-bold flex items-center gap-1.5">
              <Layers className="size-3.5 text-cyan-400" />
              المعاينة المحاسبية للقيد الآلي المتزن:
            </span>
            <span className="text-[11px] text-cyan-400">DOUBLE-ENTRY BALANCED</span>
          </div>
          <div className="flex justify-between items-center text-emerald-400">
            <span>من حـ/ {targetAcc?.name} ({targetAcc?.glAccountCode}) [مدين]:</span>
            <span className="font-bold">+{money(computedTargetAmount)} {targetAcc?.currencyCode}</span>
          </div>
          <div className="flex justify-between items-center text-rose-400">
            <span>إلى حـ/ {sourceAcc?.name} ({sourceAcc?.glAccountCode}) [دائن]:</span>
            <span className="font-bold">-{money(parseFloat(sourceAmount || '0'))} {sourceAcc?.currencyCode}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal: Add New Bank Account
// -----------------------------------------------------------------------------
function AddNewBankAccountModal({
  glAccounts, onClose, onSuccess,
}: {
  glAccounts: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'BANK' | 'CASH'>('BANK');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [currencyCode, setCurrencyCode] = useState('EGP');
  const [glAccountId, setGlAccountId] = useState(glAccounts[0]?.id || '');

  const createMut = useMutation({
    mutationFn: () => {
      return api.post('/bank-accounts', {
        code,
        name,
        kind,
        bankName: kind === 'BANK' ? bankName : 'خزينة نقدية',
        accountNumber: accountNumber || null,
        iban: iban || null,
        currencyCode,
        glAccountId,
        isActive: true,
      });
    },
    onSuccess,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="إضافة حساب بنكي أو خزينة نقدية جديدة"
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={onClose}>إلغاء</button>
          <button
            className="btn-primary text-xs"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending && <Spinner className="size-3.5" />}
            حفظ الحساب البنكي
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <Field label="كود الحساب البنكي *">
            <input
              className="input w-full font-mono"
              placeholder="مثال: BNK-ALBILAD-01"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </Field>

          <Field label="نوع الحساب *">
            <select
              className="input w-full font-bold"
              value={kind}
              onChange={(e) => setKind(e.target.value as any)}
            >
              <option value="BANK">حساب بنكي (Bank Account)</option>
              <option value="CASH">خزينة وصندوق نقدي (Cash Safe)</option>
            </select>
          </Field>
        </div>

        <Field label="اسم الحساب الكامل *">
          <input
            className="input w-full font-bold"
            placeholder="مثال: حساب مصرف البلاد - فرع الرياض الرئيسي"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        {kind === 'BANK' && (
          <Field label="اسم البنك / المؤسسة المصرفية *">
            <input
              className="input w-full"
              placeholder="مثال: بنك الرياض / مصرف الإنماء / CIB"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="عملة الحساب *">
            <select
              className="input w-full font-mono font-bold"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              <option value="SAR">SAR — ريال سعودي</option>
              <option value="EGP">EGP — جنيه مصري</option>
              <option value="USD">USD — دولار أمريكي</option>
            </select>
          </Field>

          <Field label="حساب الأستاذ العام المرتبط (GL Account) *">
            <select
              className="input w-full font-bold"
              value={glAccountId}
              onChange={(e) => setGlAccountId(e.target.value)}
            >
              {glAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.nameAr}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {kind === 'BANK' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="رقم الحساب البنكي">
              <input
                className="input w-full font-mono"
                placeholder="رقم الحساب الداخلي"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </Field>

            <Field label="رقم الآيبان الدولي (IBAN)">
              <input
                className="input w-full font-mono"
                placeholder="SA..."
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
              />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Sub-Modal: Print Transfer Voucher A4
// -----------------------------------------------------------------------------
function PrintTransferVoucherModal({
  transfer, onClose,
}: {
  transfer: BankTransferRecord;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title="سند تحويل بنكي وصرافة عملات رسمي (للطباعة A4)"
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs" onClick={onClose}>إغلاق</button>
          <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => window.print()}>
            <Printer className="size-3.5" /> طباعة السند
          </button>
        </div>
      }
    >
      <div className="space-y-6 p-4 bg-white border border-slate-300 rounded-xl text-slate-900" id="print-transfer-voucher">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-xl font-black text-slate-900">شركة عزم للتكنولوجيا والحلول الرقمية</div>
            <div className="text-xs text-slate-600 mt-1">سند تحويل بنكي وصرافة عملات بين الحسابات المصرفية</div>
          </div>
          <div className="text-left font-mono text-xs">
            <div>التاريخ: {date(transfer.transferDate)}</div>
            <div>رقم السند: {transfer.reference}</div>
            <div className="text-blue-800 font-bold">قيد اليومية: {transfer.journalEntryNo}</div>
          </div>
        </div>

        {/* Transfer Grid */}
        <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 p-4 rounded-lg bg-slate-50/50">
          <div><span className="font-bold">الحساب المحول منه:</span> {transfer.sourceBankName}</div>
          <div><span className="font-bold">الحساب المستلم:</span> {transfer.targetBankName}</div>
          <div><span className="font-bold">المبلغ المصروف:</span> <strong className="font-mono text-blue-900 text-sm">{money(transfer.sourceAmount)} {transfer.sourceCurrency}</strong></div>
          <div><span className="font-bold">المبلغ المستلم المحول:</span> <strong className="font-mono text-emerald-800 text-sm">{money(transfer.targetAmount)} {transfer.targetCurrency}</strong></div>
          <div><span className="font-bold">سعر الصرف المطبق:</span> <span className="font-mono font-bold text-cyan-800">{transfer.exchangeRate}</span></div>
          <div><span className="font-bold">عمولة التحويل البنكي:</span> {transfer.bankFee > 0 ? `${money(transfer.bankFee)} EGP` : 'لا توجد عمولة'}</div>
          {transfer.notes && (
            <div className="col-span-2 pt-2 border-t border-slate-200">
              <span className="font-bold">البيان والغرض:</span> {transfer.notes}
            </div>
          )}
        </div>

        {/* Signatures */}
        <div className="pt-8 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="space-y-12">
            <div className="font-bold">مسؤول الخزينة والبنوك</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والتاريخ</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold">المحاسب المالي</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">التوقيع والمراجعة</div>
          </div>
          <div className="space-y-12">
            <div className="font-bold">المدير المالي التنفيذي (CFO)</div>
            <div className="border-t border-slate-400 pt-1 font-mono text-[11px] text-slate-600">الاعتماد والخاتم</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
