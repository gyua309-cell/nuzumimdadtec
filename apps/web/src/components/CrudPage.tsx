import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Download, Eye, FileSpreadsheet, Pencil, Plus, Printer,
  Search, Trash2, Upload,
} from 'lucide-react';
import { api, ApiError, Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { downloadCsv, parseCsv, today } from '../lib/format';
import { Badge, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Spinner, useToast } from './ui';

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
    case 'bool':
      input = (
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> نعم
        </label>
      );
      break;
    case 'textarea':
      input = <textarea className="input h-20 py-2" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
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
          {!f.required && <option value="">—</option>}
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case 'ref':
      input = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{opts.isLoading ? 'جارٍ التحميل…' : '—'}</option>
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
            return (
              <label key={n} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={arr.includes(n)} onChange={(e) => onChange(e.target.checked ? [...arr, n].sort() : arr.filter((x) => x !== n))} />
                {d}
              </label>
            );
          })}
        </div>
      );
      break;
    default:
      input = <input {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Field label={`${f.label}${f.required ? ' *' : ''}`} error={error} hint={f.hint} className={f.full || f.type === 'textarea' || f.type === 'weekdays' ? 'col-span-2' : ''}>
      {input}
    </Field>
  );
}

/** Generic form (create/edit) used by CRUD pages and custom screens. */
export function EntityForm({ fields, value, onChange, errors, editing }: { fields: FieldDef[]; value: Record<string, any>; onChange: (v: Record<string, any>) => void; errors?: Record<string, string>; editing?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields
        .filter((f) => !(editing && f.createOnly))
        .map((f) => (
          <FieldInput key={f.name} f={f} value={value[f.name]} error={errors?.[f.name]} onChange={(v) => onChange({ ...value, [f.name]: v })} />
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
  return v ? <Badge color="green">نشط</Badge> : <Badge>غير نشط</Badge>;
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
    const colLabels = importableFields.map((f) => f.label.replace(/\s*\*$/, ''));
    const sampleRow = importableFields.map((f) => {
      if (f.default !== undefined && f.default !== null) return String(f.default);
      if (f.type === 'number' || f.type === 'decimal') return '100';
      if (f.type === 'bool') return 'true';
      if (f.type === 'date') return today();
      return `نموذج ${f.label.replace(/\s*\*$/, '')}`;
    });
    downloadCsv(`template-${title}.csv`, [colLabels, sampleRow]);
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
        <div className="flex items-center justify-between w-full">
          <button className="btn-secondary text-xs" onClick={downloadTemplate}>
            <Download className="size-3.5" /> تنزيل نموذج CSV التجريبي
          </button>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={importing}>
              إلغاء
            </button>
            <button
              className="btn-primary"
              disabled={parsedRows.length === 0 || importing}
              onClick={executeImport}
            >
              {importing ? <Spinner /> : <Upload className="size-4" />}
              {importing ? `جارٍ الاستيراد (${progress.done}/${progress.total})` : `بدء الاستيراد (${parsedRows.length} سجل)`}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-brand-500 transition-colors">
          <input
            type="file"
            id="csv-file-input"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
            disabled={importing}
          />
          <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center gap-2">
            <div className="size-12 rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 flex items-center justify-center">
              <FileSpreadsheet className="size-6" />
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              {file ? file.name : 'انقر لاختيار ملف CSV أو اسحب الملف هنا'}
            </div>
            <p className="text-xs text-slate-500">
              يجب أن يكون الملف بترميز UTF-8 مع فواصل فاصلة (Comma-separated).
            </p>
          </label>
        </div>

        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>معاينة البيانات المقروءة ({parsedRows.length} سجل جاهز للاستيراد):</span>
              <span className="text-emerald-600">الأعمدة المتطابقة: {headers.join(' • ')}</span>
            </div>
            <div className="max-h-60 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="table text-xs">
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
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 max-h-36 overflow-auto space-y-1">
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
  title, subtitle, path, columns, fields, entityLabel, extraActions, onRowClick, deletable = true,
}: {
  title: string; subtitle?: string; path: string; columns: ColumnDef[]; fields: FieldDef[]; entityLabel: string;
  extraActions?: (row: any) => ReactNode; onRowClick?: (row: any) => void; deletable?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { company } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [importingOpen, setImportingOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({ queryKey: [path, page, search], queryFn: () => api.get<Page<any>>(path, { page, pageSize: 50, q: search }) });
  const defaults = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f.default ?? (f.type === 'bool' ? true : '')])), [fields]);

  const save = useMutation({
    mutationFn: async () => {
      const isEdit = editing && editing.id;
      const body = cleanPayload(fields, form, !!isEdit);
      if (isEdit) return api.patch(`${path}/${editing.id}`, { ...body, rowVersion: editing.rowVersion });
      return api.post(path, body);
    },
    onSuccess: () => {
      toast.success('تم الحفظ');
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
      toast.success('تم الحذف');
      qc.invalidateQueries({ queryKey: [path] });
    },
    onError: (e) => toast.error(e),
  });

  const open = (row: any | null) => {
    setErrors({});
    setForm(row ? { ...defaults, ...row } : { ...defaults });
    setEditing(row ?? {});
  };

  const handleExport = () => {
    const colKeys = columns.map((c) => c.key);
    const colLabels = columns.map((c) => c.label);
    const dataRows = Array.isArray(list.data) ? list.data : (list.data?.data ?? []);
    const exportRows = dataRows.map((row) =>
      colKeys.map((k) => {
        const val = row[k];
        if (val === true) return 'نعم';
        if (val === false) return 'لا';
        if (val === null || val === undefined) return '';
        return String(val);
      })
    );
    downloadCsv(`${title}-${today()}.csv`, [colLabels, ...exportRows]);
    toast.success('تم تصدير البيانات إلى ملف CSV بنجاح');
  };

  const rows = Array.isArray(list.data) ? list.data : (list.data?.data ?? []);
  const totalCount = list.data?.meta?.total ?? rows.length;
  const meta = list.data?.meta ?? { page, pageSize: 50, total: totalCount };

  return (
    <div>
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
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => window.print()} title="طباعة">
              <Printer className="size-3.5" /> طباعة
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={handleExport} title="تصدير CSV">
              <Download className="size-3.5" /> تصدير Excel/CSV
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5" onClick={() => setImportingOpen(true)} title="استيراد CSV">
              <Upload className="size-3.5" /> استيراد CSV
            </button>
            <button className="btn-primary text-xs flex items-center gap-1.5" onClick={() => open(null)}>
              <Plus className="size-4" /> إضافة {entityLabel}
            </button>
          </div>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 p-3.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative w-80">
            <Search className="absolute start-3 top-3 size-4 text-slate-400" />
            <input className="input ps-9 h-9.5 text-xs" placeholder="بحث بالرمز أو الاسم…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {totalCount > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              النتائج المعروضة: <strong className="font-mono text-slate-900 dark:text-white font-bold">{totalCount}</strong> سجل
            </div>
          )}
        </div>
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <div className="p-4"><ErrorState error={list.error} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            text={search ? 'لا توجد نتائج مطابقة' : `لا توجد بيانات بعد. ابدأ بإضافة ${entityLabel}.`}
            action={!search && <button className="btn-primary" onClick={() => open(null)}><Plus className="size-4" /> إضافة {entityLabel}</button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th className="w-28 text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={onRowClick ? 'cursor-pointer' : ''} onClick={() => onRowClick?.(row)}>
                      {columns.map((c) => (
                        <td key={c.key} className={c.className}>{c.render ? c.render(row) : row[c.key] ?? '—'}</td>
                      ))}
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          {extraActions?.(row)}
                          <button
                            className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            title="معاينة"
                            onClick={() => (onRowClick ? onRowClick(row) : setViewing(row))}
                          >
                            <Eye className="size-3.5" />
                          </button>
                          <button className="btn-ghost h-7 px-2 text-slate-600 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/40" title="تعديل" onClick={() => open(row)}>
                            <Pencil className="size-3.5" />
                          </button>
                          {deletable && (
                            <button
                              className="btn-ghost h-7 px-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                              title="حذف"
                              onClick={() => confirm(`حذف ${entityLabel}؟`) && remove.mutate(row.id)}
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

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `تعديل ${entityLabel}` : `إضافة ${entityLabel}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(null)}>إلغاء</button>
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Spinner />} حفظ
            </button>
          </>
        }
      >
        <EntityForm fields={fields} value={form} onChange={setForm} errors={errors} editing={!!editing?.id} />
      </Drawer>

      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={`معاينة ${entityLabel}: ${viewing?.nameAr || viewing?.name || viewing?.code || ''}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setViewing(null)}>إغلاق</button>
            <button
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
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">تفاصيل السجل</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              {fields.map((f) => (
                <div key={f.name} className="flex flex-col border-b border-slate-200/60 dark:border-slate-800/60 pb-2">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{f.label}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    {viewing?.[f.name] === true
                      ? 'نعم'
                      : viewing?.[f.name] === false
                      ? 'لا'
                      : viewing?.[f.name] !== undefined && viewing?.[f.name] !== null && viewing?.[f.name] !== ''
                      ? String(viewing[f.name])
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Drawer>

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
