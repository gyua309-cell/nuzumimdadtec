import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Landmark, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { money, today } from '../lib/format';
import { Field, Modal, Spinner, useToast } from './ui';

export function TreasuryPaymentModal({
  open,
  mode,
  invoiceId,
  invoiceNo,
  partyName,
  totalAmount,
  paidAmount,
  currencyCode = 'SAR',
  onClose,
  onSuccess,
}: {
  open: boolean;
  mode: 'RECEIPT' | 'PAYMENT';
  invoiceId: string;
  invoiceNo: string;
  partyName: string;
  totalAmount: number;
  paidAmount: number;
  currencyCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const remaining = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(today());
  const [bankAccountId, setBankAccountId] = useState('');
  const [reference, setReference] = useState(`${mode === 'RECEIPT' ? 'RCPT' : 'PAY'}-${invoiceNo}`);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const banksQuery = useQuery({
    queryKey: ['bank-accounts-picker-modal'],
    enabled: open,
    queryFn: () => api.get<any>('/bank-accounts', { pageSize: '50' }).then((r: any) => (Array.isArray(r) ? r : r?.data ?? [])),
  });
  const banks: any[] = banksQuery.data || [];

  useEffect(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setReference(`${mode === 'RECEIPT' ? 'RCPT' : 'PAY'}-${invoiceNo}`);
      setPaymentDate(today());
      setNotes('');
    }
  }, [open, remaining, mode, invoiceNo]);

  useEffect(() => {
    if (!bankAccountId && banks.length > 0) {
      const preferred = banks.find((b) => b.currencyCode === currencyCode) || banks[0];
      if (preferred) setBankAccountId(preferred.id);
    }
  }, [banks, bankAccountId, currencyCode]);

  const handleSubmit = async () => {
    const val = Number(amount);
    if (!val || val <= 0) {
      toast.error(new Error('يرجى إدخال مبلغ صحيح أكبر من صفر'));
      return;
    }
    if (val > remaining + 0.05) {
      toast.error(new Error(`المبلغ المدخل يتجاوز المتبقي (${money(remaining)} ${currencyCode})`));
      return;
    }
    setBusy(true);
    try {
      const endpoint =
        mode === 'RECEIPT'
          ? `/invoices/${invoiceId}/payments`
          : `/purchase-invoices/${invoiceId}/pay`;
      await api.post(endpoint, {
        amount: val,
        paymentDate,
        bankAccountId: bankAccountId || undefined,
        method,
        reference,
        notes: notes || undefined,
      });
      toast.success(
        mode === 'RECEIPT'
          ? 'تم تسجيل سند القبض وترحيل القيد المحاسبي وتحديث رصيد البنك بنجاح'
          : 'تم تسجيل سند الصرف للمورد وترحيل القيد المحاسبي وتحديث رصيد البنك بنجاح',
      );
      onSuccess();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'RECEIPT'
      ? `سند قبض وتحصيل دفعة — الفاتورة ${invoiceNo}`
      : `سند صرف وسداد فاتورة مورد — ${invoiceNo}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      saving={busy}
      onSaveShortcut={handleSubmit}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button type="button" className="btn-primary flex items-center gap-1.5" onClick={handleSubmit} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            {mode === 'RECEIPT' ? 'اعتماد التحصيل وتوليد القيد' : 'اعتماد السداد وتوليد القيد'}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
          <div className="font-bold flex items-center gap-1.5 mb-1">
            <Wallet className="size-4" />
            {mode === 'RECEIPT' ? `العميل: ${partyName}` : `المورد: ${partyName}`}
          </div>
          <div className="flex flex-wrap gap-4 text-[11px] font-semibold">
            <span>إجمالي الفاتورة: <strong className="font-mono">{money(totalAmount)} {currencyCode}</strong></span>
            <span>المسدد سابقاً: <strong className="font-mono">{money(paidAmount)} {currencyCode}</strong></span>
            <span>المتبقي المستحق: <strong className="font-mono text-indigo-700 dark:text-indigo-300">{money(remaining)} {currencyCode}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={`مبلغ ${mode === 'RECEIPT' ? 'التحصيل' : 'السداد'} (${currencyCode})`} required>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining + 0.01}
              className="input font-mono font-bold"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <Field label="تاريخ السند / الحركة" required>
            <input
              type="date"
              className="input font-mono"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </Field>

          <Field label="الحساب البنكي / الخزينة" required>
            <div className="relative">
              <select
                className="input"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name} ({b.currencyCode})
                  </option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="طريقة التسوية">
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="BANK_TRANSFER">حوالة بنكية (SARIE / IBAN)</option>
              <option value="CASH">سداد نقدي (الخزينة)</option>
              <option value="CHEQUE">شيك مصرفي</option>
            </select>
          </Field>

          <Field label="المرجع / رقم الإشعار البنكي">
            <input
              className="input font-mono"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>

          <Field label="بيان / ملاحظات القيد">
            <input
              className="input"
              placeholder="مثال: دفعة أولى / سداد كامل الفاتورة..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-2.5 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Landmark className="size-4 text-emerald-600 shrink-0" />
          {mode === 'RECEIPT'
            ? 'سيُنشأ قيد مزدوج آلي: من حـ/ البنك أو الصندوق [مدين] ← إلى حـ/ العملاء وحسابات القبض 10301 [دائن].'
            : 'سيُنشأ قيد مزدوج آلي: من حـ/ الموردون وحسابات الدفع 20101 [مدين] ← إلى حـ/ البنك أو الصندوق [دائن].'}
        </div>
      </div>
    </Modal>
  );
}
