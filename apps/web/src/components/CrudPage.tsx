import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, AlignJustify, Download, FileSpreadsheet, List, Pencil,
  Printer, RefreshCw, Save, Search, Upload, X,
} from 'lucide-react';
import { api, ApiError, Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { downloadCsv, parseCsv, today } from '../lib/format';
import { ExportMenu } from './ExportMenu';
import { ExportColumnDef, ExportEngine } from '../engine/export-engine';
import { SearchableSelect } from './SearchableSelect';
import {
  FormSection,
  ModalSize,
  formatDecimalOnBlur,
  formatPhoneOnBlur,
  validateFieldValue,
} from './FormPrimitives';
import {
  ActionButton, ActionGroup, AddButton, Badge, ConfirmDialog, Drawer, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pager, Spinner, useToast,
} from './ui';

export type Option = { value: string; label: string };

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'decimal' | 'bool' | 'date' | 'select' | 'ref' | 'textarea' | 'weekdays' | 'email' | 'tel';
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
  /** Optional progressive UI/UX enhancements (100% backwards-compatible) */
  section?: string;
  sectionSubtitle?: string;
  sectionIcon?: ReactNode;
  sectionCollapsible?: boolean;
  defaultOpen?: boolean;
  icon?: ReactNode;
  placeholder?: string;
  cols?: 1 | 2 | 3;
  min?: number;
  max?: number;
  validate?: (value: any, all?: Record<string, any>) => string | null;
  autoFocus?: boolean;
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async () => {
      const r = await api.get<Page<any> | any[]>(ref!.path, { pageSize: 200, ...(ref!.query ?? {}) });
      const rows = Array.isArray(r) ? r : r.data;
      return rows.map((x) => ({ value: x.id ?? x.code, label: ref!.label(x) })) as Option[];
    },
  });
}

const WEEKDAYS = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

const FieldInput = React.memo(function FieldInput({
  f,
  value,
  onFieldChange,
  error,
  shouldAutoFocus,
  gridCols = 2,
}: {
  f: FieldDef;
  value: any;
  onFieldChange: (name: string, v: any) => void;
  error?: string;
  shouldAutoFocus?: boolean;
  gridCols?: 2 | 3;
}) {
  const opts = useRefOptions(f.ref);
  const [localError, setLocalError] = useState<string | null>(null);
  const effectiveError = error || localError || undefined;

  const onChange = useCallback((v: any) => {
    setLocalError(null);
    onFieldChange(f.name, v);
  }, [f.name, onFieldChange]);

  const handleBlur = useCallback(() => {
    let nextVal = value;
    if (typeof value === 'string') {
      if (f.type === 'tel' || f.name.toLowerCase().includes('phone') || f.name.toLowerCase().includes('mobile')) {
        const formatted = formatPhoneOnBlur(value);
        if (formatted !== value) {
          nextVal = formatted;
          onFieldChange(f.name, formatted);
        }
      } else if (f.type === 'number' || f.type === 'decimal') {
        const formatted = formatDecimalOnBlur(value);
        if (formatted !== value) {
          nextVal = formatted;
          onFieldChange(f.name, formatted);
        }
      }
    }
    const errMsg = validateFieldValue(nextVal, {
      name: f.name,
      label: f.label,
      required: f.required,
      type: f.type,
      min: f.min,
      max: f.max,
    });
    setLocalError(errMsg);
  }, [f.label, f.max, f.min, f.name, f.required, f.type, onFieldChange, value]);

  const commonClass = `input ${effectiveError ? 'input-error' : ''}`;
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
          className={`flex min-h-10 w-full items-center justify-between rounded-xl border px-3.5 text-xs font-bold transition-all cursor-pointer ${
            checked
              ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 dark:border-slate-700/80 dark:bg-[#080e1c] dark:text-slate-400'
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
      input = (
        <textarea
          className={`${commonClass} h-24 py-2.5`}
          dir={f.ltr ? 'ltr' : undefined}
          placeholder={f.placeholder}
          value={value ?? ''}
          autoFocus={shouldAutoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
        />
      );
      break;
    case 'date':
      input = (
        <input
          className={commonClass}
          dir="ltr"
          type="date"
          value={value ?? ''}
          autoFocus={shouldAutoFocus}
          onChange={(e) => onChange(e.target.value || null)}
          onBlur={handleBlur}
        />
      );
      break;
    case 'number':
    case 'decimal':
      input = (
        <input
          className={`${commonClass} font-mono`}
          dir="ltr"
          inputMode="decimal"
          placeholder={f.placeholder ?? '0.00'}
          value={value ?? ''}
          autoFocus={shouldAutoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
        />
      );
      break;
    case 'select':
      input = (
        <SearchableSelect
          options={f.options ?? []}
          value={value ?? ''}
          onChange={(val) => onChange(val || null)}
          placeholder={f.placeholder ?? '— اختر —'}
          clearable={!f.required}
          error={Boolean(effectiveError)}
          ltr={f.ltr}
          autoFocus={shouldAutoFocus}
        />
      );
      break;
    case 'ref':
      input = (
        <SearchableSelect
          options={opts.data ?? []}
          loading={opts.isLoading}
          value={value ?? ''}
          onChange={(val) => onChange(val || null)}
          placeholder={f.placeholder ?? '— ابحث أو اختر —'}
          clearable={!f.required}
          error={Boolean(effectiveError)}
          ltr={f.ltr}
          autoFocus={shouldAutoFocus}
        />
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
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
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
      input = (
        <input
          className={commonClass}
          dir={f.ltr ? 'ltr' : undefined}
          type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
          placeholder={f.placeholder}
          value={value ?? ''}
          autoFocus={shouldAutoFocus}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
        />
      );
  }

  const colSpanClass =
    f.full || f.type === 'textarea' || f.type === 'weekdays'
      ? gridCols === 3
        ? 'md:col-span-2 xl:col-span-3'
        : 'md:col-span-2'
      : f.cols === 2
      ? 'md:col-span-2'
      : f.cols === 3
      ? 'md:col-span-2 xl:col-span-3'
      : '';

  return (
    <Field
      label={f.label}
      required={f.required}
      icon={f.icon}
      error={effectiveError}
      hint={f.hint}
      className={colSpanClass}
    >
      {input}
    </Field>
  );
});

export function validateFormFields(
  fields: FieldDef[],
  value: Record<string, any>,
  editing?: boolean
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    if (editing && f.createOnly) continue;
    const msg = validateFieldValue(
      value[f.name],
      {
        name: f.name,
        label: f.label,
        required: f.required,
        type: f.type,
        min: f.min,
        max: f.max,
        validate: f.validate,
      },
      value
    );
    if (msg) errs[f.name] = msg;
  }
  return errs;
}

/** Generic form (create/edit) supporting logical section cards, tabs, and 2-3 column grids. */
export function EntityForm({
  fields,
  value,
  onChange,
  errors,
  editing,
  columns,
  layout = 'auto',
  autoFocusFirst = true,
}: {
  fields: FieldDef[];
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  errors?: Record<string, string>;
  editing?: boolean;
  columns?: 2 | 3;
  layout?: 'auto' | 'sections' | 'tabs';
  autoFocusFirst?: boolean;
}) {
  const visibleFields = useMemo(
    () => fields.filter((f) => !(editing && f.createOnly)),
    [fields, editing]
  );

  // Keep latest value in ref so field handlers remain stable across keystrokes
  const latestRef = useRef({ value, onChange });
  latestRef.current = { value, onChange };

  const handleFieldChange = useCallback((name: string, nextVal: any) => {
    const { value: cur, onChange: emit } = latestRef.current;
    if (cur[name] === nextVal) return;
    emit({ ...cur, [name]: nextVal });
  }, []);

  const focusFieldName = useMemo(() => {
    if (!autoFocusFirst) return undefined;
    const explicit = visibleFields.find((f) => f.autoFocus);
    if (explicit) return explicit.name;
    const firstReq = visibleFields.find((f) => f.required && f.type !== 'bool' && f.type !== 'select' && f.type !== 'ref');
    return firstReq?.name ?? visibleFields.find((f) => f.type === 'text')?.name;
  }, [autoFocusFirst, visibleFields]);

  const sections = useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        subtitle?: string;
        icon?: ReactNode;
        collapsible?: boolean;
        defaultOpen?: boolean;
        fields: FieldDef[];
      }
    >();
    let hasCustomSection = false;
    for (const f of visibleFields) {
      const secTitle = f.section ?? 'البيانات الأساسية';
      if (f.section) hasCustomSection = true;
      let grp = map.get(secTitle);
      if (!grp) {
        grp = {
          title: secTitle,
          subtitle: f.sectionSubtitle,
          icon: f.sectionIcon,
          collapsible: f.sectionCollapsible,
          defaultOpen: f.defaultOpen ?? true,
          fields: [],
        };
        map.set(secTitle, grp);
      } else {
        if (!grp.subtitle && f.sectionSubtitle) grp.subtitle = f.sectionSubtitle;
        if (!grp.icon && f.sectionIcon) grp.icon = f.sectionIcon;
        if (grp.collapsible === undefined && f.sectionCollapsible !== undefined) grp.collapsible = f.sectionCollapsible;
      }
      grp.fields.push(f);
    }
    return { hasCustomSection, groups: Array.from(map.values()) };
  }, [visibleFields]);

  const [activeTab, setActiveTab] = useState(0);
  useEffect(() => {
    if (activeTab >= sections.groups.length) setActiveTab(0);
  }, [activeTab, sections.groups.length]);

  const gridCols: 2 | 3 = columns ?? (visibleFields.length >= 9 ? 3 : 2);
  const gridClass =
    gridCols === 3
      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-0.5'
      : 'grid grid-cols-1 md:grid-cols-2 gap-4 p-0.5';

  // Flat clean grid if no section definitions were provided
  if (!sections.hasCustomSection) {
    return (
      <div className={gridClass}>
        {visibleFields.map((f) => (
          <FieldInput
            key={f.name}
            f={f}
            value={value[f.name]}
            error={errors?.[f.name]}
            shouldAutoFocus={focusFieldName === f.name}
            gridCols={gridCols}
            onFieldChange={handleFieldChange}
          />
        ))}
      </div>
    );
  }

  // Tabbed layout when explicitly requested and >= 2 sections
  if (layout === 'tabs' && sections.groups.length > 1) {
    const curGroup = sections.groups[activeTab] ?? sections.groups[0];
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-1.5">
          {sections.groups.map((grp, idx) => {
            const errCount = grp.fields.filter((f) => errors?.[f.name]).length;
            const active = idx === activeTab;
            return (
              <button
                key={grp.title}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#0c1427] text-brand-700 dark:text-brand-300 shadow-sm border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60'
                }`}
              >
                {grp.icon}
                <span>{grp.title}</span>
                {errCount > 0 && (
                  <span className="inline-flex size-4.5 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                    {errCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <FormSection
          title={curGroup.title}
          subtitle={curGroup.subtitle}
          icon={curGroup.icon}
          columns={columns ?? (curGroup.fields.length >= 5 ? 3 : 2)}
        >
          {curGroup.fields.map((f) => (
            <FieldInput
              key={f.name}
              f={f}
              value={value[f.name]}
              error={errors?.[f.name]}
              shouldAutoFocus={focusFieldName === f.name}
              gridCols={columns ?? (curGroup.fields.length >= 5 ? 3 : 2)}
              onFieldChange={handleFieldChange}
            />
          ))}
        </FormSection>
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={activeTab === 0}
            onClick={() => setActiveTab((prev) => Math.max(0, prev - 1))}
          >
            ← الخطوة السابقة
          </button>
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
            القسم {activeTab + 1} من {sections.groups.length}
          </span>
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={activeTab === sections.groups.length - 1}
            onClick={() => setActiveTab((prev) => Math.min(sections.groups.length - 1, prev + 1))}
          >
            الخطوة التالية →
          </button>
        </div>
      </div>
    );
  }

  // Stacked section cards (optionally collapsible)
  return (
    <div className="space-y-4">
      {sections.groups.map((grp) => {
        const secCols: 2 | 3 = columns ?? (grp.fields.length >= 5 ? 3 : 2);
        const errCount = grp.fields.filter((f) => errors?.[f.name]).length;
        return (
          <FormSection
            key={grp.title}
            title={grp.title}
            subtitle={grp.subtitle}
            icon={grp.icon}
            collapsible={grp.collapsible}
            defaultOpen={errCount > 0 ? true : grp.defaultOpen}
            badge={
              errCount > 0 ? (
                <span className="rounded-full bg-rose-100 dark:bg-rose-950/70 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700/60">
                  {errCount} أخطاء
                </span>
              ) : undefined
            }
            columns={secCols}
          >
            {grp.fields.map((f) => (
              <FieldInput
                key={f.name}
                f={f}
                value={value[f.name]}
                error={errors?.[f.name]}
                shouldAutoFocus={focusFieldName === f.name}
                gridCols={secCols}
                onFieldChange={handleFieldChange}
              />
            ))}
          </FormSection>
        );
      })}
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

// ------------------------------------------------------------------ CSV & Excel (.xlsx) Bulk Import Modal
export function CsvImportModal({
  open,
  onClose,
  title,
  fields,
  path,
  onSuccess,
  transformRow,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: FieldDef[];
  path: string;
  onSuccess: () => void;
  transformRow?: (cleaned: Record<string, any>, rawRow: Record<string, any>) => Record<string, any>;
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

  const downloadExcelTemplate = async () => {
    try {
      const { ExportEngine } = await import('../engine/export-engine');
      await ExportEngine.exportExcel({
        title: `قالب استيراد ${title}`,
        filename: `template-${title}`,
        includeHeaderBanner: false,
        columns: importableFields.map((f) => ({
          key: f.name,
          header: f.label.replace(/\s*\*$/, ''),
          width: 22,
          type: f.type === 'decimal' || f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text',
        })),
        data: [],
      });
    } catch (err) {
      toast.error(err);
    }
  };

  const processRawGrid = (raw: string[][]) => {
    if (raw.length < 2) {
      toast.error('الملف فارغ أو لا يحتوي على صفوف بيانات بعد الترويسة');
      return;
    }

    // Smart header row detection (scans first 10 rows to support both plain templates and ExportEngine reports with banners)
    let bestRowIdx = 0;
    let bestMatchCount = -1;
    const scanLimit = Math.min(raw.length, 10);
    for (let r = 0; r < scanLimit; r++) {
      let matches = 0;
      for (const cell of raw[r]) {
        const cleanH = String(cell ?? '').trim().replace(/\s*\*$/, '').toLowerCase();
        if (!cleanH) continue;
        const found = importableFields.some(
          (fd) => fd.label.replace(/\s*\*$/, '').toLowerCase() === cleanH || fd.name.toLowerCase() === cleanH
        );
        if (found) matches++;
      }
      if (matches > bestMatchCount) {
        bestMatchCount = matches;
        bestRowIdx = r;
      }
    }

    const fileHeaders = raw[bestRowIdx].map((h) => String(h ?? '').trim());
    setHeaders(fileHeaders.filter(Boolean));

    const headerMap: Record<number, FieldDef> = {};
    fileHeaders.forEach((h, idx) => {
      const cleanH = h.replace(/\s*\*$/, '').toLowerCase();
      const found = importableFields.find(
        (fd) => fd.label.replace(/\s*\*$/, '').toLowerCase() === cleanH || fd.name.toLowerCase() === cleanH
      );
      if (found) headerMap[idx] = found;
    });

    const parsed: Record<string, any>[] = [];
    for (let i = bestRowIdx + 1; i < raw.length; i++) {
      const rowData = raw[i];
      if (!rowData || rowData.every((c) => !String(c ?? '').trim())) continue;
      const firstCell = String(rowData[0] ?? '').trim();
      if (firstCell.startsWith('الإجمالي') || firstCell.startsWith('إجمالي')) continue;

      const rowObj: Record<string, any> = {};
      rowData.forEach((val, colIdx) => {
        const fieldDef = headerMap[colIdx];
        if (fieldDef) {
          const strVal = String(val ?? '').trim();
          let v: any = strVal;
          if (fieldDef.type === 'bool') {
            v = strVal === 'true' || strVal === '1' || strVal === 'نعم' || strVal === 'نشط' || strVal === 'TRUE';
          } else if (fieldDef.type === 'number' || fieldDef.type === 'decimal') {
            const cleanNum = strVal.replace(/,/g, '');
            v = cleanNum === '' ? null : Number(cleanNum);
          }
          rowObj[fieldDef.name] = v;
        }
      });
      if (Object.keys(rowObj).length > 0) {
        parsed.push(rowObj);
      }
    }
    setParsedRows(parsed);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLogs([]);

    if (f.name.toLowerCase().endsWith('.xlsx')) {
      try {
        const ExcelJSImport = await import('exceljs');
        const ExcelJS = (ExcelJSImport as any).default ?? ExcelJSImport;
        const wb = new ExcelJS.Workbook();
        const buf = await f.arrayBuffer();
        await wb.xlsx.load(buf);
        const ws = wb.worksheets[0];
        if (!ws) {
          toast.error('ملف الإكسل لا يحتوي على أي ورقة عمل');
          return;
        }
        const grid: string[][] = [];
        ws.eachRow({ includeEmpty: false }, (row: any) => {
          const vals: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
            let v = cell.value;
            if (v && typeof v === 'object') {
              if ('result' in v) v = v.result;
              else if ('text' in v) v = v.text;
              else if (v instanceof Date) v = v.toISOString().slice(0, 10);
            }
            vals[colNumber - 1] = v === null || v === undefined ? '' : String(v).trim();
          });
          grid.push(vals);
        });
        processRawGrid(grid);
      } catch (err) {
        toast.error(err);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = (evt.target?.result as string) || '';
      const raw = parseCsv(text);
      processRawGrid(raw);
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
        const cleaned = cleanPayload(fields, row, false);
        const payload = transformRow ? transformRow(cleaned, row) : cleaned;
        await api.post(path, payload);
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
      title={`استيراد بيانات ${title} (Excel .xlsx / CSV)`}
      wide
      maxWidth="max-w-4xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={downloadExcelTemplate}>
              <FileSpreadsheet className="size-3.5 text-emerald-600" /> تنزيل قالب Excel (.xlsx)
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={downloadTemplate}>
              <Download className="size-3.5 text-amber-500" /> تنزيل قالب (CSV)
            </button>
          </div>
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
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleFileChange}
            disabled={importing}
          />
          <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center gap-2.5">
            <div className="size-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <FileSpreadsheet className="size-6" />
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {file ? file.name : 'انقر لاختيار ملف Excel (.xlsx) أو CSV للمعاينة والتحقق قبل الحفظ'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              يدعم ملفات Excel (.xlsx) وملفات CSV (ترميز UTF-8) مع معاينة فورية للبيانات قبل الحفظ.
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
  const [initialFormSnapshot, setInitialFormSnapshot] = useState('');
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
    const next = row ? { ...defaults, ...row } : { ...defaults };
    setForm(next);
    setInitialFormSnapshot(JSON.stringify(next));
    setEditing(row ?? {});
  };

  const isDirty = Boolean(editing) && JSON.stringify(form) !== initialFormSnapshot;

  const handleSave = () => {
    if (save.isPending) return;
    const isEdit = Boolean(editing && editing.id);
    const clientErrs = validateFormFields(fields, form, isEdit);
    if (Object.keys(clientErrs).length > 0) {
      setErrors(clientErrs);
      toast.error('يرجى مراجعة الحقول المطلوبة المميزة باللون الأحمر');
      return;
    }
    save.mutate();
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

  const buildRecordRoyalDoc = (row: any) => {
    const recName = row?.nameAr || row?.fullNameAr || row?.name || row?.code || row?.id || '';
    const metaFields = fields.map((f) => {
      const rawVal = row?.[f.name];
      let display: string;
      if (f.type === 'bool') display = rawVal ? 'نعم (نشط)' : 'لا';
      else if (f.type === 'select' && f.options) display = f.options.find((o) => o.value === rawVal)?.label ?? String(rawVal ?? '—');
      else display = rawVal !== null && rawVal !== undefined && rawVal !== '' ? String(rawVal) : '—';
      return { label: f.label, value: display };
    });
    return {
      title: `بطاقة ${entityLabel}: ${recName}`,
      subtitle: subtitle || `تقرير تفصيلي رسمي من سجل ${title}`,
      filename: `${entityLabel}-${row?.code || row?.id || today()}`,
      docNo: row?.code || row?.employeeCode || row?.id?.slice(0, 8),
      docDate: today(),
      currency: company?.baseCurrency || 'SAR',
      metaFields,
      signatureLabels: ['المعد', 'المراجعة والتدقيق', 'الاعتماد'] as [string, string, string],
    };
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary text-xs flex items-center gap-1.5"
              onClick={() =>
                void ExportEngine.exportPdf({
                  title,
                  subtitle,
                  columns: exportColumns,
                  data: rows,
                  currency: company?.baseCurrency || 'SAR',
                })
              }
              title="طباعة ملكية A4 للجدول والتقرير"
            >
              <Printer className="size-3.5 text-slate-600 dark:text-slate-300" /> طباعة ملكية
            </button>
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
              title="استيراد بيانات من ملف Excel (.xlsx) أو CSV"
            >
              <Upload className="size-3.5 text-cyan-600 dark:text-cyan-400" /> استيراد Excel / CSV
            </button>
            <AddButton
              label={`إضافة ${entityLabel}`}
              onClick={() => open(null)}
            />
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
                <AddButton
                  label={`إضافة ${entityLabel}`}
                  onClick={() => open(null)}
                />
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
                        <ActionGroup>
                          {extraActions?.(row)}
                          <ActionButton
                            variant="view"
                            title="عرض التفاصيل"
                            onClick={() => (onRowClick ? onRowClick(row) : setViewing(row))}
                          />
                          <ActionButton
                            variant="preview"
                            title="معاينة قبل الطباعة (ملكي A4)"
                            onClick={() => ExportEngine.openDetailPreview(buildRecordRoyalDoc(row))}
                          />
                          <ActionButton
                            variant="print"
                            title="طباعة بطاقة السجل (ملكي A4)"
                            onClick={() => void ExportEngine.printDetail(buildRecordRoyalDoc(row))}
                          />
                          <ActionButton
                            variant="pdf"
                            title="تصدير PDF مباشر (ملكي A4)"
                            onClick={() => void ExportEngine.exportDetailPdf(buildRecordRoyalDoc(row))}
                          />
                          <ActionButton
                            variant="edit"
                            title="تعديل السجل"
                            onClick={() => open(row)}
                          />
                          {deletable && (
                            <ActionButton
                              variant="delete"
                              title="حذف السجل"
                              onClick={() => setDeletingRow(row)}
                            />
                          )}
                        </ActionGroup>
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
        size={(fields.length >= 10 ? 'xl' : fields.length >= 5 ? 'lg' : 'md') as ModalSize}
        dirty={isDirty}
        saving={save.isPending}
        onSaveShortcut={handleSave}
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => setEditing(null)}>
              إلغاء
            </button>
            <button type="button" className="btn-primary flex items-center gap-1.5" disabled={save.isPending} onClick={handleSave}>
              {save.isPending ? <Spinner /> : <Save className="size-3.5" />} حفظ البيانات
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
        size={(fields.length >= 8 ? 'lg' : 'md') as ModalSize}
        title={`بطاقة معاينة ${entityLabel}: ${viewing?.nameAr || viewing?.fullNameAr || viewing?.name || viewing?.code || ''}`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setViewing(null)}>
              إغلاق
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-rose-600 to-red-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm hover:brightness-110 transition-all"
              onClick={() => viewing && void ExportEngine.exportDetailPdf(buildRecordRoyalDoc(viewing))}
            >
              <Printer className="size-3.5" /> طباعة / PDF ملكي
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm hover:brightness-110 transition-all"
              onClick={() => viewing && void ExportEngine.exportDetailExcel(buildRecordRoyalDoc(viewing))}
            >
              <FileSpreadsheet className="size-3.5" /> Excel ملكي
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
