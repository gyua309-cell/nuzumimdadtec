import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cleanPayload, EntityForm, FieldDef, fieldErrors } from './CrudPage';
import { Modal, Spinner, useToast } from './ui';

/** Modal form driven by FieldDefs; submits the cleaned payload. */
export function FormModal({
  open, title, fields, initial, onClose, onSubmit, submitText = 'حفظ', wide, note,
}: {
  open: boolean; title: string; fields: FieldDef[]; initial?: Record<string, any>; onClose: () => void;
  onSubmit: (body: Record<string, any>) => Promise<unknown>; submitText?: string; wide?: boolean; note?: React.ReactNode;
}) {
  const toast = useToast();
  const [value, setValue] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setErrors({});
      setValue({ ...Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'bool' ? false : '')])), ...(initial ?? {}) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(cleanPayload(fields, value, false));
      toast.success('تم الحفظ');
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      wide={wide}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Spinner />} {submitText}</button>
        </>
      }
    >
      {note && <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{note}</div>}
      <EntityForm fields={fields} value={value} onChange={setValue} errors={errors} />
    </Modal>
  );
}

export interface PeriodOption { id: string; name: string; startDate: string; endDate: string; status: string; isAdjustmentPeriod: boolean; periodNo: number }

export function usePeriods() {
  return useQuery({ queryKey: ['fiscal-periods'], queryFn: () => api.get<PeriodOption[]>('/fiscal-periods') });
}

/** Regular (monthly) fiscal period picker; defaults to the period containing today. */
export function PeriodSelect({ value, onChange, className = 'w-56' }: { value: string; onChange: (id: string) => void; className?: string }) {
  const periods = usePeriods();
  const list = (periods.data ?? []).filter((p) => !p.isAdjustmentPeriod);
  useEffect(() => {
    if (!value && list.length) {
      const t = new Date().toISOString().slice(0, 10);
      const cur = list.find((p) => p.startDate <= t && p.endDate >= t) ?? list[list.length - 1];
      onChange(cur.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, value]);
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {list.length === 0 && <option value="">لا توجد فترات مالية — أنشئ سنة مالية أولًا</option>}
      {list.map((p) => (
        <option key={p.id} value={p.id}>{p.name} {p.status !== 'OPEN' ? `(${p.status === 'CLOSED' ? 'مقفلة' : p.status})` : ''}</option>
      ))}
    </select>
  );
}

/** Common reference definitions for forms. */
export const REF = {
  currency: { path: '/company-currencies', label: (c: any) => `${c.code} — ${c.nameAr}` },
  department: { path: '/departments', label: (d: any) => `${d.code} — ${d.nameAr}` },
  branch: { path: '/branches', label: (d: any) => `${d.code} — ${d.nameAr}` },
  costCenter: { path: '/cost-centers', label: (d: any) => `${d.code} — ${d.nameAr}` },
  position: { path: '/positions', label: (d: any) => `${d.code} — ${d.titleAr}` },
  employee: { path: '/employees', label: (e: any) => `${e.code} — ${e.fullNameAr}` },
  profile: { path: '/cost-profiles', label: (p: any) => `${p.code} — ${p.nameAr}` },
  component: { path: '/cost-components', label: (c: any) => `${c.code} — ${c.nameAr}` },
  postingAccount: { path: '/accounts', label: (a: any) => `${a.code} — ${a.nameAr}`, query: { postingOnly: 'true', activeOnly: 'true' } },
  bank: { path: '/bank-accounts', label: (b: any) => `${b.code} — ${b.name} (${b.currencyCode})` },
  assetCategory: { path: '/asset-categories', label: (c: any) => `${c.code} — ${c.nameAr}` },
  calendar: { path: '/work-calendars', label: (c: any) => `${c.code} — ${c.nameAr}` },
  client: { path: '/clients', label: (c: any) => `${c.code} — ${c.nameAr}` },
  project: { path: '/projects', label: (p: any) => `${p.code} — ${p.nameAr}` },
};
