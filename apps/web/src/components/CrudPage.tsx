import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, AlignJustify, Download, Eye, FileSpreadsheet, List, Pencil, Plus,
  RefreshCw, Search, Trash2, Upload, X,
} from 'lucide-react';
import { api, ApiError, Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { downloadCsv, parseCsv, today } from '../lib/format';
import { ExportMenu } from './ExportMenu';
import { ExportColumnDef } from '../engine/export-engine';
import {
  Badge, ConfirmDialog, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Spinner, useToast,
} from './ui';

export type Option = { value: string; label: string };

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'decimal' | 'bool' | 'date' | 'select' | 'ref' | 'textarea' | 'weekdays';
  options?: Option[];
  /** reference list loaded from the API (e.g. /branches) */
  ref?: { path: string; label: (row: any) => string; query?: Record<string, string> };
  required?: boolean;
  ltr?: boolean;
  hint?: string;
  default?: unknown;
  /** hide on edit (immutable after create) */
  createOnly?: boolean;
  full?: boolean;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: any) => ReactNode;
  className?: string;
}

/** Loads a reference list for selects (max 200 rows, active first). */
export function useRefOptions(ref?: FieldDef['ref']) {
  return useQuery({
    queryKey: ['ref', ref?.path, ref?.query],
    enabled: !!ref,
    queryFn: async () => {
      const r = await api.get<Page<any> | any[]>(ref!.path, { pageSize: 200, ...(ref!.query ?? {}) });
      const rows = Array.isArray(r) ? r : r.data;
      return rows.map((x) => ({ value: x.id ?? x.code, label: ref!.label(x) })) as Option[];
    },
  });
}

const WEEKDAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

function FieldInput({ f, value, onChange, error }: { f: FieldDef; value: any; onChange: (v: any) => void; error?: string }) {
  const opts = useRefOptions(f.ref);
  const common = { className: 'input', dir: f.ltr ? 'ltr' : undefined } as const;
  let input: ReactNode;
  switch (f.type) {
    case 'bool': {
      const checked = !!value;
      input = (
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={`flex h-10 w-full items-center justify-between rounded-xl border px-3.5 text-xs font-bold transition-all ${
            checked
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700/80 dark:bg-[#080e1c] dark:text-slate-400'
          }`}
        >
          <span>{checked ? 'نعم (مفعّل)' : 'لا (غير مفعّل)'}</span>
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block size-3.5 rounded-full bg-white shadow-xs transition-transform ${
                checked ? '-translate-x-4.5 rtl:-translate-x-4.5 ltr:translate-x-4.5' : '-translate-x-0.5 rtl:-translate-x-0.5 ltr:translate-x-0.5'
              }`}
            />
          </span>
        </button>
      );
      break;
    }
    case 'textarea':
      input = <textarea className="input h-22 py-2.5" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'date':
      input = <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case 'number':
    case 'decimal':
      input = <input {...common} dir="ltr" inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'select':
      input = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          {!f.required && <option value="">— اختر —</option>}
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case 'ref':
      input = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{opts.isLoading ? 'جارٍ التحميل…' : '— اختر —'}</option>
          {opts.data?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case 'weekdays':
      input = (
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => {
            const n = i + 1;
            const arr: number[] = value ?? [];
            const active = arr.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(active ? arr.filter((x) => x !== n) : [...arr, n].sort())}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? 'border-amber-500 bg-amber-500 text-slate-950 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#080e1c] dark:text-slate-300'
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
      );
      break;
    default:
      input = <input {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Field
      label={`${f.label}${f.required ? ' *' : ''}`}
      error={error}
      hint={f.hint}
      className={f.full || f.type === 'textarea' || f.type === 'weekdays' ? 'md:col-span-2' : ''}
    >
      {input}
    </Field>
  );
}

/** Generic form (create/edit) used by CRUD pages and custom screens. */
export function EntityForm({
  fields,
  value,
  onChange,
  errors,
  editing,
}: {
  fields: FieldDef[];
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  errors?: Record<string, string>;
  editing?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-0.5">
      {fields
        .filter((f) => !(editing && f.createOnly))
        .map((f) => (
          <FieldInput
            key={f.name}
            f={f}
            value={value[f.name]}
            error={errors?.[f.name]}
            onChange={(v) => onChange({ ...value, [f.name]: v })}
          />
        ))}
    </div>
  );
}

export function cleanPayload(fields: FieldDef[], v: Record<string, any>, editing: boolean) {
  const out: Record<string, any> = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    let x = v[f.name];
    if (x === '' || x === undefined) x = f.type === 'bool' ? false : null;
    if (f.type === 'number' && x !== null) x = Number(x);
    if (x === null && f.required) continue;
    out[f.name] = x;
  }
  return out;
}

export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof ApiError) for (const x of e.problem.errors ?? []) out[x.path.split('.').pop()!] = x.message;
  return out;
}

export function ActiveBadge({ v }: { v: boolean }) {
  return v ? <Badge color="green" dot>نشط</Badge> : <Badge color="slate">غير نشط</Badge>;
}

// ------------------------------------------------------------------ CSV Bulk Import Modal
export function CsvImportModal({
  open,
  onClose,
  title,
  fields,
  path,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: FieldDef[];
  path: string;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [logs, setLogs] = useState<string[]>([]);

  const importableFields = useMemo(() => fields.filter((f) => f.type !== 'weekdays'), [fields]);

  const downloadTemplate = () => {
    // Clean header-only template (zero mock/sample rows per production policy)
    const colLabels = importableFields.map((f) => f.label.replace(/\s*\*$/, ''));
    downloadCsv(`template-${title}.csv`, [colLabels]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLogs([]);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = (evt.target?.result as string) || '';
      const raw = parseCsv(text);
      if (raw.length < 2) {
        toast.error('الملف فارغ أو لا يحتوي على صفوف بيانات بعد الترويسة');
        return;
      }
      const fileHeaders = raw[0].map((h) => h.trim());
      setHeaders(fileHeaders);

      const headerMap: Record<number, FieldDef> = {};
      fileHeaders.forEach((h, idx) => {
        const cleanH = h.replace(/\s*\*$/, '').toLowerCase();
        const found = importableFields.find(
          (fd) => fd.label.replace(/\s*\*$/, '').toLowerCase() === cleanH || fd.name.toLowerCase() === cleanH
        );
        if (found) headerMap[idx] = found;
      });

      const parsed: Record<string, any>[] = [];
      for (let i = 1; i < raw.length; i++) {
        const rowData = raw[i];
        const rowObj: Record<string, any> = {};
        rowData.forEach((val, colIdx) => {
          const fieldDef = headerMap[colIdx];
          if (fieldDef) {
            let v: any = val;
            if (fieldDef.type === 'bool') v = val === 'true' || val === '1' || val === 'نعم' || val === 'TRUE';
            else if (fieldDef.type === 'number' || fieldDef.type === 'decimal') {
              v = val === '' ? null : Number(val);
            }
            rowObj[fieldDef.name] = v;
          }
        });
        parsed.push(rowObj);
      }
      setParsedRows(parsed);
    };
    reader.readAsText(f, 'utf-8');
  };

  const executeImport = async () => {
    if (parsedRows.length === 0) return;
    setImporting(true);
    setProgress({ done: 0, total: parsedRows.length, failed: 0 });
    const newLogs: string[] = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      try {
        await api.post(path, cleanPayload(fields, row, false));
        successCount++;
      } catch (err: any) {
        failCount++;
        const errMsg = err instanceof ApiError ? err.problem.title : err?.message || 'خطأ غير معروف';
        newLogs.push(`السطر ${i + 2}: ${errMsg}`);
      }
      setProgress({ done: i + 1, total: parsedRows.length, failed: failCount });
    }

    setImporting(false);
    setLogs(newLogs);
    if (successCount > 0) {
      toast.success(`تم استيراد ${successCount} سجل بنجاح`);
      onSuccess();
    }
    if (failCount > 0) {
      toast.error(`تعذر استيراد ${failCount} سجل، يرجى مراجعة سجل الأخطاء`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`استيراد بيانات ${title} من ملف CSV`}
      wide
      maxWidth="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <button type="button" className="btn-secondary text-xs" onClick={downloadTemplate}>
            <Download className="size-3.5 text-amber-500" /> تنزيل قالب الأعمدة الفارغ (CSV)
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={importing}>
              إلغاء
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={parsedRows.length === 0 || importing}
              onClick={executeImport}
            >
              {importing ? <Spinner /> : <Upload className="size-4" />}
              {importing ? `جارٍ الاستيراد (${progress.done}/${progress.total})` : `تأكيد وبدء الاستيراد (${parsedRows.length} سجل)`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-7 text-center hover:border-amber-500 dark:hover:border-cyan-400 bg-slate-50/50 dark:bg-[#080e1c]/60 transition-colors">
          <input
            type="file"
            id="csv-file-input"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
            disabled={importing}
          />
          <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center gap-2.5">
            <div className="size-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FileSpreadsheet className="size-6" />
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {file ? file.name : 'انقر لاختيار ملف CSV للمعاينة والتحقق قبل الحفظ'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              يتم التحقق وعرض المعاينة الكاملة للبيانات قبل كتابة أي سجل في قاعدة البيانات (UTF-8).
            </p>
          </label>
        </div>

        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>معاينة البيانات قبل الاعتماد ({parsedRows.length} سجل جاهز):</span>
              <span className="text-emerald-600 dark:text-emerald-400">الأعمدة المتطابقة: {headers.join(' • ')}</span>
            </div>
            <div className="max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th>#</th>
                    {importableFields.map((f) => (
                      <th key={f.name}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 10).map((row, idx) => (
                    <tr key={idx}>
                      <td className="num font-bold">{idx + 1}</td>
                      {importableFields.map((f) => (
                        <td key={f.name}>{String(row[f.name] ?? '—')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 10 && (
              <p className="text-[11px] text-slate-400 text-center">
                يتم عرض أول 10 سجلات للمعاينة من إجمالي {parsedRows.length} سجل.
              </p>
            )}
          </div>
        )}

        {logs.length > 0 && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300 max-h-36 overflow-auto space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="size-4" /> تقرير الأخطاء التي ظهرت أثناء الاستيراد:
            </div>
            {logs.map((log, i) => (
              <div key={i} className="font-mono text-[11px]">{log}</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function CrudPage({
  title,
  subtitle,
  path,
  columns,
  fields,
  entityLabel,
  extraActions,
  onRowClick,
  deletable = true,
}: {
  title: string;
  subtitle?: string;
  path: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  entityLabel: string;
  extraActions?: (row: any) => ReactNode;
  onRowClick?: (row: any) => void;
  deletable?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { company } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [compact, setCompact] = useState(() => localStorage.getItem('idham.table.compact') === 'true');
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [deletingRow, setDeletingRow] = useState<any | null>(null);
  const [importingOpen, setImportingOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 280);
    return () => clearTimeout(t);
  }, [q]);

  const toggleDensity = (next: boolean) => {
    setCompact(next);
    localStorage.setItem('idham.table.compact', String(next));
  };

  const list = useQuery({
    queryKey: [path, page, search],
    queryFn: () => api.get<Page<any>>(path, { page, pageSize: 50, q: search }),
  });
  const defaults = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'bool' ? true : '')])),
    [fields]
  );

  const save = useMutation({
    mutationFn: async () => {
      const isEdit = editing && editing.id;
      const body = cleanPayload(fields, form, !!isEdit);
      if (isEdit) return api.patch(`${path}/${editing.id}`, { ...body, rowVersion: editing.rowVersion });
      return api.post(path, body);
    },
    onSuccess: () => {
      toast.success('تم حفظ البيانات بنجاح');
      setEditing(null);
      qc.invalidateQueries({ queryKey: [path] });
      qc.invalidateQueries({ queryKey: ['ref'] });
    },
    onError: (e) => {
      setErrors(fieldErrors(e));
      toast.error(e);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${path}/${id}`),
    onSuccess: () => {
      toast.success(`تم حذف ${entityLabel} بنجاح`);
      setDeletingRow(null);
      qc.invalidateQueries({ queryKey: [path] });
    },
    onError: (e) => {
      setDeletingRow(null);
      toast.error(e);
    },
  });

  const open = (row: any | null) => {
    setErrors({});
    setForm(row ? { ...defaults, ...row } : { ...defaults });
    setEditing(row ?? {});
  };

  const rows = Array.isArray(list.data) ? list.data : (list.data?.data ?? []);
  const totalCount = list.data?.meta?.total ?? rows.length;
  const meta = list.data?.meta ?? { page, pageSize: 50, total: totalCount };

  const exportColumns: ExportColumnDef[] = columns.map((c) => ({
    key: c.key,
    header: c.label,
    type:
      c.key.toLowerCase().includes('amount') ||
      c.key.toLowerCase().includes('salary') ||
      c.key.toLowerCase().includes('balance') ||
      c.key.toLowerCase().includes('cost')
        ? 'currency'
        : c.key.toLowerCase().includes('date') || c.key.toLowerCase().includes('at')
        ? 'date'
        : 'text',
  }));

  return (
    <div className="animate-fade-in">
      {/* Official Print Header */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900">{company?.nameAr}</h1>
            <div className="text-xs text-slate-600 font-mono">العملة الأساسية: {company?.baseCurrency || '—'}</div>
          </div>
          <div className="text-end">
            <div className="text-base font-bold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500 font-mono">تاريخ الطباعة: {today()}</div>
          </div>
        </div>
      </div>

      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              title={title}
              columns={exportColumns}
              data={rows}
              currency={company?.baseCurrency || 'SAR'}
            />
            <button
              type="button"
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() => setImportingOpen(true)}
              title="استيراد CSV"
            >
              <Upload className="size-3.5 text-cyan-600 dark:text-cyan-400" /> استيراد CSV
            </button>
            <button
              type="button"
              className="btn-primary text-xs flex items-center gap-1.5"
              onClick={() => open(null)}
            >
              <Plus className="size-4 stroke-[2.5]" /> إضافة {entityLabel}
            </button>
          </div>
        }
      />

      <div className="card overflow-hidden">
        {/* Executive Filter & Table Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/85 p-3.5 dark:border-slate-800/90 bg-slate-50/60 dark:bg-[#091020]">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute start-3 top-2.75 size-4 text-slate-400" />
            <input
              className="input ps-9 pe-8 h-9.5 text-xs"
              placeholder={`بحث سريع في ${title} بالرمز أو الاسم…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="absolute end-2.5 top-2.5 rounded-md p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-white"
                title="مسح البحث"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ms-auto">
            <span className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1427] px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              الإجمالي: <strong className="num font-black text-amber-600 dark:text-amber-400">{totalCount}</strong> سجل
            </span>

            {/* Density Toggle */}
            <div className="hidden sm:flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1427] p-0.5">
              <button
                type="button"
                onClick={() => toggleDensity(false)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  !compact
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title="عرض مريح"
              >
                <List className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleDensity(true)}
                className={`rounded-lg px-2 py-1 text-[11px] font-bold flex items-center gap-1 transition-colors ${
                  compact
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                title="عرض مضغوط"
              >
                <AlignJustify className="size-3.5" />
              </button>
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={() => void list.refetch()}
              className="btn-secondary size-9 p-0"
              title="تحديث البيانات"
            >
              <RefreshCw className={`size-3.5 ${list.isFetching ? 'animate-spin text-amber-500' : ''}`} />
            </button>
          </div>
        </div>

        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <div className="p-4">
            <ErrorState error={list.error} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            text={search ? `لا توجد نتائج مطابقة للبحث "${search}"` : `لا توجد سجلات مسجلة بعد. ابدأ بإضافة أول ${entityLabel}.`}
            action={
              search ? (
                <button type="button" className="btn-secondary text-xs" onClick={() => setQ('')}>
                  مسح فلتر البحث
                </button>
              ) : (
                <button type="button" className="btn-primary text-xs" onClick={() => open(null)}>
                  <Plus className="size-4 stroke-[2.5]" /> إضافة {entityLabel}
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={`table ${compact ? 'table-compact' : ''}`}>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th className="w-32 text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={onRowClick ? 'cursor-pointer' : ''}
                      onClick={() => onRowClick?.(row)}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={c.className}>
                          {c.render ? c.render(row) : row[c.key] ?? '—'}
                        </td>
                      ))}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end items-center gap-1">
                          {extraActions?.(row)}
                          <button
                            type="button"
                            className="flex size-7.5 items-center justify-center rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-500/12 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors"
                            title="معاينة التفاصيل"
                            onClick={() => (onRowClick ? onRowClick(row) : setViewing(row))}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="flex size-7.5 items-center justify-center rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-500/12 dark:text-slate-400 dark:hover:text-amber-400 transition-colors"
                            title="تعديل"
                            onClick={() => open(row)}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          {deletable && (
                            <button
                              type="button"
                              className="flex size-7.5 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/12 dark:hover:text-rose-400 transition-colors"
                              title="حذف"
                              onClick={() => setDeletingRow(row)}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...meta} onPage={setPage} />
          </>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `تعديل ${entityLabel}` : `إضافة ${entityLabel} جديد`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              إلغاء
            </button>
            <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Spinner />} حفظ البيانات
            </button>
          </>
        }
      >
        <EntityForm fields={fields} value={form} onChange={setForm} errors={errors} editing={!!editing?.id} />
      </Drawer>

      {/* Executive Record View Modal */}
      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={`بطاقة معاينة ${entityLabel}: ${viewing?.nameAr || viewing?.fullNameAr || viewing?.name || viewing?.code || ''}`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setViewing(null)}>
              إغلاق
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-1.5"
              onClick={() => {
                const r = viewing;
                setViewing(null);
                open(r);
              }}
            >
              <Pencil className="size-3.5" /> تعديل السجل
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {fields.map((f) => {
            const rawVal = viewing?.[f.name];
            return (
              <div
                key={f.name}
                className={`rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#080e1c] p-3.5 ${
                  f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''
                }`}
              >
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{f.label}</div>
                <div className={`mt-1.5 font-bold text-sm text-slate-900 dark:text-slate-100 ${f.ltr ? 'num text-start font-mono' : ''}`}>
                  {typeof rawVal === 'boolean' ? (
                    <ActiveBadge v={rawVal} />
                  ) : rawVal !== undefined && rawVal !== null && rawVal !== '' ? (
                    String(rawVal)
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Drawer>

      {/* Styled Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingRow}
        onClose={() => setDeletingRow(null)}
        title={`تأكيد حذف ${entityLabel}`}
        busy={remove.isPending}
        onConfirm={() => deletingRow && remove.mutate(deletingRow.id)}
        message={
          <div>
            هل أنت متأكد من رغبتك في حذف {entityLabel}{' '}
            <strong className="text-slate-900 dark:text-white">
              {deletingRow?.nameAr || deletingRow?.fullNameAr || deletingRow?.titleAr || deletingRow?.name || deletingRow?.code || ''}
            </strong>
            ؟ لا يمكن التراجع عن هذا الإجراء بعد التنفيذ.
          </div>
        }
      />

      <CsvImportModal
        open={importingOpen}
        onClose={() => setImportingOpen(false)}
        title={title}
        fields={fields}
        path={path}
        onSuccess={() => {
          setImportingOpen(false);
          qc.invalidateQueries({ queryKey: [path] });
        }}
      />
    </div>
  );
}
