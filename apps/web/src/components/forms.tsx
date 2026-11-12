import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api } from '../lib/api';
import { cleanPayload, EntityForm, FieldDef, fieldErrors, validateFormFields } from './CrudPage';
import { ModalSize } from './FormPrimitives';
import { SearchableSelect } from './SearchableSelect';
import { Modal, Spinner, useToast } from './ui';

/** Modal form driven by FieldDefs; validates, guards unsaved changes, and submits the cleaned payload. */
export function FormModal({
  open,
  title,
  subtitle,
  fields,
  initial,
  onClose,
  onSubmit,
  submitText = 'حفظ',
  wide,
  size,
  columns,
  layout,
  note,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  fields: FieldDef[];
  initial?: Record<string, any>;
  onClose: () => void;
  onSubmit: (body: Record<string, any>) => Promise<unknown>;
  submitText?: string;
  wide?: boolean;
  size?: ModalSize;
  columns?: 2 | 3;
  layout?: 'auto' | 'sections' | 'tabs';
  note?: ReactNode;
}) {
  const toast = useToast();
  const [value, setValue] = useState<Record<string, any>>({});
  const [initialSnapshot, setInitialSnapshot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors({});
      const seed = {
        ...Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'bool' ? false : '')])),
        ...(initial ?? {}),
      };
      setValue(seed);
      setInitialSnapshot(JSON.stringify(seed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isDirty = open && JSON.stringify(value) !== initialSnapshot;

  const submit = useCallback(async () => {
    if (busy) return;
    const clientErrs = validateFormFields(fields, value, false);
    if (Object.keys(clientErrs).length > 0) {
      setErrors(clientErrs);
      toast.error('يرجى مراجعة الحقول الإلزامية قبل الحفظ');
      return;
    }
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
  }, [busy, fields, onClose, onSubmit, toast, value]);

  const resolvedSize: ModalSize =
    size ?? (fields.length >= 10 ? 'xl' : wide || fields.length >= 5 ? 'lg' : 'md');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      wide={wide}
      size={resolvedSize}
      dirty={isDirty}
      saving={busy}
      onSaveShortcut={submit}
      footer={
        <>
          <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="btn-primary flex items-center gap-1.5" disabled={busy} onClick={submit}>
            {busy ? <Spinner /> : <Save className="size-3.5" />} {submitText}
          </button>
        </>
      }
    >
      {note && (
        <div className="mb-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/50 p-3.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {note}
        </div>
      )}
      <EntityForm
        fields={fields}
        value={value}
        onChange={setValue}
        errors={errors}
        columns={columns}
        layout={layout}
      />
    </Modal>
  );
}

export interface PeriodOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  isAdjustmentPeriod: boolean;
  periodNo: number;
}

export function usePeriods(enabled = true) {
  return useQuery({
    queryKey: ['fiscal-periods'],
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: () => api.get<PeriodOption[]>('/fiscal-periods'),
  });
}

/** Regular (monthly) fiscal period picker; defaults to the period containing today. */
export function PeriodSelect({
  value,
  onChange,
  className = 'w-56',
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const periods = usePeriods();
  const list = useMemo(
    () => (periods.data ?? []).filter((p) => !p.isAdjustmentPeriod),
    [periods.data]
  );

  useEffect(() => {
    if (!value && list.length) {
      const t = new Date().toISOString().slice(0, 10);
      const cur = list.find((p) => p.startDate <= t && p.endDate >= t) ?? list[list.length - 1];
      onChange(cur.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, value]);

  const options = useMemo(
    () =>
      list.map((p) => ({
        value: p.id,
        label: `${p.name}${p.status !== 'OPEN' ? ` (${p.status === 'CLOSED' ? 'مقفلة' : p.status})` : ''}`,
      })),
    [list]
  );

  return (
    <SearchableSelect
      className={className}
      options={options}
      loading={periods.isLoading}
      value={value}
      onChange={(v) => onChange(v)}
      clearable={false}
      placeholder={list.length === 0 ? 'لا توجد فترات مالية — أنشئ سنة مالية أولاً' : '— اختر الفترة المالية —'}
    />
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
