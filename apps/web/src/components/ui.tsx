import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  FileDown,
  Inbox,
  Info,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { EnhancedField, ErpModalProps, ErpModalShell, FormSection, ModalSize } from './FormPrimitives';
export { FormSection };
export type { ModalSize, ErpModalProps };

// ------------------------------------------------------------------ Executive Action Buttons
export type ActionVariant = 'view' | 'edit' | 'print' | 'pdf' | 'delete' | 'preview' | 'custom';

export interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionVariant;
  icon?: ReactNode;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  tooltip?: string;
  busy?: boolean;
}

export function ActionButton({
  variant = 'custom',
  icon,
  label,
  size = 'md',
  tooltip,
  busy = false,
  className = '',
  disabled,
  ...props
}: ActionButtonProps) {
  const sizeClasses = {
    sm: 'size-7 text-xs rounded-lg',
    md: 'size-8 text-xs rounded-xl',
    lg: 'size-9 text-sm rounded-xl',
  }[size];

  const variantStyles: Record<ActionVariant, { base: string; icon: ReactNode; defaultTooltip: string }> = {
    view: {
      base: 'text-sky-600 bg-sky-500/10 border-sky-300/70 hover:bg-sky-600 hover:text-white hover:border-transparent dark:text-sky-400 dark:bg-sky-500/15 dark:border-sky-500/30 dark:hover:bg-sky-500 dark:hover:text-white hover:shadow-sm hover:shadow-sky-500/20',
      icon: <Eye className="size-3.5 stroke-[2.2]" />,
      defaultTooltip: 'معاينة وتفاصيل',
    },
    edit: {
      base: 'text-amber-700 bg-amber-500/10 border-amber-300/70 hover:bg-amber-600 hover:text-white hover:border-transparent dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/30 dark:hover:bg-amber-500 dark:hover:text-white hover:shadow-sm hover:shadow-amber-500/20',
      icon: <Pencil className="size-3.5 stroke-[2.2]" />,
      defaultTooltip: 'تعديل البيانات',
    },
    print: {
      base: 'text-emerald-700 bg-emerald-500/10 border-emerald-300/70 hover:bg-emerald-600 hover:text-white hover:border-transparent dark:text-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:hover:bg-emerald-500 dark:hover:text-white hover:shadow-sm hover:shadow-emerald-500/20',
      icon: <Printer className="size-3.5 stroke-[2.2]" />,
      defaultTooltip: 'طباعة بطاقة السجل',
    },
    pdf: {
      base: 'text-rose-600 bg-rose-500/10 border-rose-300/70 hover:bg-rose-600 hover:text-white hover:border-transparent dark:text-rose-400 dark:bg-rose-500/15 dark:border-rose-500/30 dark:hover:bg-rose-500 dark:hover:text-white hover:shadow-sm hover:shadow-rose-500/20',
      icon: <FileDown className="size-3.5 stroke-[2.2]" />,
      defaultTooltip: 'تصدير مستند PDF',
    },
    delete: {
      base: 'text-rose-600 bg-rose-500/10 border-rose-300/70 hover:bg-rose-600 hover:text-white hover:border-transparent dark:text-rose-400 dark:bg-rose-500/15 dark:border-rose-500/30 dark:hover:bg-rose-500 dark:hover:text-white hover:shadow-sm hover:shadow-rose-500/20',
      icon: <Trash2 className="size-3.5 stroke-[2.2]" />,
      defaultTooltip: 'حذف السجل',
    },
    preview: {
      base: 'text-indigo-600 bg-indigo-500/10 border-indigo-300/70 hover:bg-indigo-600 hover:text-white hover:border-transparent dark:text-indigo-400 dark:bg-indigo-500/15 dark:border-indigo-500/30 dark:hover:bg-indigo-500 dark:hover:text-white hover:shadow-sm hover:shadow-indigo-500/20',
      icon: <ExternalLink className="size-3.5 stroke-[2.2]" />,
      defaultTooltip: 'معاينة سريعة',
    },
    custom: {
      base: 'text-slate-600 bg-slate-100 border-slate-300/70 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700',
      icon: null,
      defaultTooltip: '',
    },
  };

  const current = variantStyles[variant];
  const finalTitle = tooltip || current.defaultTooltip || label;

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center border font-bold transition-all duration-150 active:scale-95 focus:outline-hidden disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${
        label ? 'px-3 py-1.5 h-8 gap-1.5 rounded-xl' : sizeClasses
      } ${current.base} ${className}`}
      title={finalTitle}
      aria-label={finalTitle}
      disabled={disabled || busy}
      {...props}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon || current.icon}
      {label && <span>{label}</span>}
    </button>
  );
}

export function ActionGroup({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-1.5 ${className}`}>
      {children}
    </div>
  );
}

export interface AddButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
}

export function AddButton({
  label,
  icon,
  shortcut = 'Alt+N',
  className = '',
  disabled,
  ...props
}: AddButtonProps) {
  return (
    <button
      type="button"
      className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 px-3.5 py-2 text-xs font-black text-slate-950 shadow-xs shadow-amber-500/20 hover:shadow-md hover:shadow-amber-500/30 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${className}`}
      disabled={disabled}
      {...props}
    >
      <span className="flex size-5 items-center justify-center rounded-lg bg-slate-950/15 text-slate-950 transition-transform duration-200 group-hover:scale-110">
        {icon || <Plus className="size-3.5 stroke-[3]" />}
      </span>
      <span>{label}</span>
      {shortcut && (
        <span className="hidden sm:inline-block rounded-md bg-slate-950/10 px-1.5 py-0.5 text-[9.5px] font-mono font-bold text-slate-900/80">
          {shortcut}
        </span>
      )}
    </button>
  );
}

// ------------------------------------------------------------------ toast
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string; detail?: string };
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.kind === 'error' ? 7000 : 3800);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 start-5 z-[110] flex w-96 max-w-[92vw] flex-col gap-2.5 pointer-events-none">
        {items.map((t) => {
          const isErr = t.kind === 'error';
          const isOk = t.kind === 'success';
          return (
            <div
              key={t.id}
              className={`pointer-events-auto relative overflow-hidden rounded-2xl border bg-white/95 dark:bg-[#0c1427]/95 backdrop-blur-md flex items-start gap-3 p-3.5 text-sm shadow-2xl animate-slide-in ${
                isErr
                  ? 'border-rose-400/70 dark:border-rose-500/60 shadow-rose-500/10'
                  : isOk
                  ? 'border-emerald-400/70 dark:border-emerald-500/60 shadow-emerald-500/10'
                  : 'border-cyan-400/70 dark:border-cyan-500/60 shadow-cyan-500/10'
              }`}
            >
              <div
                className={`absolute inset-y-0 start-0 w-1 ${
                  isErr ? 'bg-rose-500' : isOk ? 'bg-emerald-500' : 'bg-cyan-500'
                }`}
              />
              <div
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${
                  isErr
                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : isOk
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
                }`}
              >
                {isErr ? (
                  <AlertTriangle className="size-4" />
                ) : isOk ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Info className="size-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 dark:text-white leading-snug">{t.text}</div>
                {t.detail && (
                  <div className="mt-0.5 break-words text-xs text-slate-500 dark:text-slate-400">{t.detail}</div>
                )}
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const { push } = useContext(ToastCtx);
  return {
    success: (text: string) => push({ kind: 'success', text }),
    info: (text: string) => push({ kind: 'info', text }),
    error: (e: unknown) => {
      if (e instanceof ApiError) {
        const fieldErrors = e.problem.errors?.map((x) => `${x.path}: ${x.message}`).join(' • ');
        push({
          kind: 'error',
          text: e.problem.title,
          detail: fieldErrors || (e.problem.code !== e.problem.title ? e.problem.code : undefined),
        });
      } else push({ kind: 'error', text: (e as Error)?.message ?? 'حدث خطأ' });
    },
  };
}

// ------------------------------------------------------------------ layout bits
export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
  badge,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: any;
  badge?: ReactNode;
}) {
  const safeTitle =
    typeof title === 'string' && title.trim() && title.trim() !== 'undefined' && title.trim() !== 'null'
      ? title.trim()
      : 'لوحة التحكم والبيانات';
  return (
    <div className="royal-banner mb-5 px-5 py-4.5 animate-fade-in">
      {/* Subtle Top Luminous Hairline */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-indigo-600 via-sky-500 to-emerald-500 opacity-85" />
      {/* Ambient Radial Accents */}
      <div className="pointer-events-none absolute -top-14 -end-10 size-44 rounded-full bg-indigo-500/12 blur-3xl dark:bg-indigo-500/20" />
      <div className="pointer-events-none absolute -bottom-14 start-16 size-36 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/14" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          {Icon ? (
            <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-sky-500 text-white shadow-md shadow-indigo-600/25 ring-1 ring-white/25">
              <Icon className="size-5" />
            </div>
          ) : (
            <div className="mt-0.5 h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-indigo-600 via-sky-500 to-emerald-500 shadow-xs shadow-indigo-500/35" />
          )}
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
                {safeTitle}
              </h1>
              {badge}
            </div>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed font-medium">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
      </div>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`size-4 animate-spin ${className}`} />;
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 p-16 text-sm text-slate-500 animate-fade-in">
      <div className="relative flex size-14 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-600 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-400 shadow-sm">
        <Spinner className="size-6" />
      </div>
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">جارٍ التحميل ومعالجة البيانات…</span>
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className="card cyber-card-rose flex flex-col items-center gap-3 p-12 text-center text-sm animate-fade-in">
      <div className="size-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shadow-xs">
        <AlertTriangle className="size-7 text-rose-600 dark:text-rose-400" />
      </div>
      <div className="font-bold text-base text-slate-900 dark:text-slate-100">
        {forbidden
          ? 'ليست لديك صلاحية لعرض هذه البيانات'
          : error instanceof ApiError
          ? error.problem.title
          : 'تعذر تحميل البيانات'}
      </div>
      {error instanceof ApiError && !forbidden && (
        <div className="text-xs text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">
          {error.code}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3.5 p-14 text-center text-sm text-slate-500 animate-fade-in">
      <div className="size-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080e1c] flex items-center justify-center shadow-2xs">
        <Inbox className="size-7 text-indigo-500/80 dark:text-indigo-400/80" />
      </div>
      <div className="font-bold text-slate-700 dark:text-slate-300 max-w-md leading-relaxed">{text}</div>
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  green:  'bg-emerald-500/12 text-emerald-700 border border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/35',
  red:    'bg-rose-500/12 text-rose-700 border border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/35',
  amber:  'bg-amber-500/12 text-amber-800 border border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/35',
  blue:   'bg-sky-500/12 text-sky-700 border border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/35',
  indigo: 'bg-indigo-500/12 text-indigo-700 border border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/35',
  purple: 'bg-purple-500/12 text-purple-700 border border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/35',
  cyan:   'bg-cyan-500/12 text-cyan-700 border border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/35',
  teal:   'bg-teal-500/12 text-teal-700 border border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/35',
  slate:  'bg-slate-100 text-slate-700 border border-slate-300/80 dark:bg-slate-800/90 dark:text-slate-300 dark:border-slate-700',
};

export function Badge({
  color = 'slate',
  dot,
  children,
}: {
  color?: keyof typeof badgeColors | string;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-[11px] font-bold ${
        badgeColors[color] ?? badgeColors.slate
      }`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ overlays
export function Modal(props: ErpModalProps) {
  return <ErpModalShell {...props} />;
}

export function Drawer(props: ErpModalProps) {
  return <ErpModalShell {...props} />;
}

/** Styled Executive Confirmation Dialog (replaces ugly native browser confirm). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'تأكيد الحذف',
  danger = true,
  busy = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner /> : danger ? <Trash2 className="size-4" /> : null}
            {confirmText}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border ${
            danger
              ? 'bg-rose-500/12 border-rose-500/30 text-rose-600 dark:text-rose-400'
              : 'bg-amber-500/12 border-amber-500/30 text-amber-600 dark:text-amber-400'
          }`}
        >
          <AlertTriangle className="size-5" />
        </div>
        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed pt-1">{message}</div>
      </div>
    </Modal>
  );
}

/** Prompt that requires a reason (cancel, reverse, reopen…). */
export function ReasonDialog({
  open,
  title,
  confirmText,
  danger,
  onClose,
  onConfirm,
  extra,
}: {
  open: boolean;
  title: string;
  confirmText: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  extra?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            إلغاء
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            disabled={reason.trim().length < 3 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Spinner />} {confirmText}
          </button>
        </>
      }
    >
      {extra}
      <label className="label">السبب والمبرر المحاسبي (إلزامي — 3 أحرف على الأقل)</label>
      <textarea
        className="input h-24 py-2.5"
        placeholder="اكتب سبب الإجراء بوضوح لأغراض سجل التدقيق والمراجعة..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
    </Modal>
  );
}

// ------------------------------------------------------------------ form helpers
export function Field({
  label,
  children,
  error,
  hint,
  required,
  icon,
  htmlFor,
  className = '',
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  icon?: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <EnhancedField
      label={label}
      error={error}
      hint={hint}
      required={required}
      icon={icon}
      htmlFor={htmlFor}
      className={className}
    >
      {children}
    </EnhancedField>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/85 px-4 py-3 text-xs dark:border-slate-800/90 bg-slate-50/70 dark:bg-[#091020] rounded-b-2xl">
      <span className="text-slate-500 dark:text-slate-400 font-medium">
        عرض <span className="num font-bold text-slate-800 dark:text-slate-200">{from}–{to}</span> من أصل{' '}
        <span className="num font-bold text-slate-900 dark:text-white">{total}</span> سجل
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-secondary h-7.5 px-2.5 text-xs gap-1"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronRight className="size-3.5" /> السابق
        </button>
        <span className="num rounded-lg bg-indigo-500/12 border border-indigo-500/30 px-2.5 py-1 font-bold text-indigo-700 dark:text-indigo-300">
          {page} / {pages}
        </span>
        <button
          type="button"
          className="btn-secondary h-7.5 px-2.5 text-xs gap-1"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          التالي <ChevronLeft className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Cyber Neon Executive Stat Cards
const TONES = {
  blue: {
    cyberClass: 'cyber-card-blue',
    iconBox: 'bg-gradient-to-br from-sky-500/18 to-indigo-500/12 text-sky-600 border-sky-400/35 dark:text-sky-300 dark:border-sky-400/35 shadow-2xs shadow-sky-500/10',
    glow: 'bg-sky-500/14',
    accentLine: 'bg-gradient-to-l from-sky-500 to-indigo-500',
    stroke: '#0ea5e9',
  },
  green: {
    cyberClass: 'cyber-card-emerald',
    iconBox: 'bg-gradient-to-br from-emerald-500/18 to-teal-500/12 text-emerald-600 border-emerald-400/35 dark:text-emerald-300 dark:border-emerald-400/35 shadow-2xs shadow-emerald-500/10',
    glow: 'bg-emerald-500/14',
    accentLine: 'bg-gradient-to-l from-emerald-500 to-teal-500',
    stroke: '#10b981',
  },
  red: {
    cyberClass: 'cyber-card-rose',
    iconBox: 'bg-gradient-to-br from-rose-500/18 to-pink-500/12 text-rose-600 border-rose-400/35 dark:text-rose-300 dark:border-rose-400/35 shadow-2xs shadow-rose-500/10',
    glow: 'bg-rose-500/14',
    accentLine: 'bg-gradient-to-l from-rose-500 to-pink-500',
    stroke: '#f43f5e',
  },
  amber: {
    cyberClass: 'cyber-card-amber',
    iconBox: 'bg-gradient-to-br from-amber-500/20 to-orange-500/12 text-amber-700 border-amber-400/40 dark:text-amber-300 dark:border-amber-400/35 shadow-2xs shadow-amber-500/10',
    glow: 'bg-amber-500/14',
    accentLine: 'bg-gradient-to-l from-amber-500 to-orange-500',
    stroke: '#f59e0b',
  },
  purple: {
    cyberClass: 'cyber-card-purple',
    iconBox: 'bg-gradient-to-br from-purple-500/18 to-violet-500/12 text-purple-600 border-purple-400/35 dark:text-purple-300 dark:border-purple-400/35 shadow-2xs shadow-purple-500/10',
    glow: 'bg-purple-500/14',
    accentLine: 'bg-gradient-to-l from-purple-500 to-violet-500',
    stroke: '#8b5cf6',
  },
  cyan: {
    cyberClass: 'cyber-card-cyan',
    iconBox: 'bg-gradient-to-br from-cyan-500/18 to-indigo-500/12 text-cyan-700 border-cyan-400/35 dark:text-cyan-300 dark:border-cyan-400/35 shadow-2xs shadow-cyan-500/10',
    glow: 'bg-cyan-500/14',
    accentLine: 'bg-gradient-to-l from-cyan-500 to-indigo-500',
    stroke: '#06b6d4',
  },
  teal: {
    cyberClass: 'cyber-card-teal',
    iconBox: 'bg-gradient-to-br from-teal-500/18 to-emerald-500/12 text-teal-700 border-teal-400/35 dark:text-teal-300 dark:border-teal-400/35 shadow-2xs shadow-teal-500/10',
    glow: 'bg-teal-500/14',
    accentLine: 'bg-gradient-to-l from-teal-500 to-emerald-500',
    stroke: '#14b8a6',
  },
  slate: {
    cyberClass: 'cyber-card-slate',
    iconBox: 'bg-slate-100 text-slate-600 border-slate-300/80 dark:bg-slate-800/90 dark:text-slate-300 dark:border-slate-700',
    glow: 'bg-slate-500/8',
    accentLine: 'bg-slate-400',
    stroke: '#64748b',
  },
  indigo: {
    cyberClass: 'cyber-card-cyan',
    iconBox: 'bg-gradient-to-br from-indigo-500/18 to-violet-500/12 text-indigo-600 border-indigo-400/35 dark:text-indigo-300 dark:border-indigo-400/35 shadow-2xs shadow-indigo-500/10',
    glow: 'bg-indigo-500/15',
    accentLine: 'bg-gradient-to-l from-indigo-600 to-violet-500',
    stroke: '#4f46e5',
  },
};

function MiniStatSpark({ points, stroke }: { points: number[]; stroke: string }) {
  if (!points || points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 120;
  const h = 24;
  const step = w / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * step,
    y: h - ((p - min) / range) * (h - 6) - 3,
  }));
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-20 shrink-0 overflow-visible opacity-90" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'slate',
  icon: Icon,
  trend,
  progress,
  sparkline,
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'cyan' | 'teal' | 'slate' | 'indigo';
  icon?: any;
  trend?: { text: string; positive?: boolean };
  progress?: number;
  sparkline?: number[];
  className?: string;
}) {
  const theme = TONES[tone] || TONES.slate;
  const safeProgress = progress !== undefined ? Math.max(0, Math.min(100, progress)) : undefined;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-b from-white to-slate-50/40 dark:from-[#0d152a] dark:to-[#0a1020] ${theme.cyberClass} transition-all duration-200 hover:-translate-y-0.5 animate-count-up ${className}`}
    >
      {/* Subtle Ambient Corner Glow */}
      <div className={`pointer-events-none absolute -top-10 -end-10 size-28 rounded-full ${theme.glow} blur-2xl transition-opacity duration-300 group-hover:opacity-100 opacity-75`} />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2.5">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-snug">{label}</span>
          {Icon && (
            <div
              className={`flex size-9.5 shrink-0 items-center justify-center rounded-xl border ${theme.iconBox} transition-transform duration-200 group-hover:scale-110`}
            >
              <Icon className="size-4.5" />
            </div>
          )}
        </div>

        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="num text-start text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-tight truncate">
            {value}
          </div>
          {sparkline && sparkline.length >= 2 && <MiniStatSpark points={sparkline} stroke={theme.stroke} />}
        </div>

        {safeProgress !== undefined && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/90">
            <div
              className={`h-full rounded-full ${theme.accentLine} transition-all duration-500`}
              style={{ width: `${safeProgress}%` }}
            />
          </div>
        )}

        {(hint || trend) && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100/90 dark:border-slate-800/80 pt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5 min-w-0 truncate font-medium">{hint}</div>
            {trend && (
              <span
                className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-bold font-mono ${
                  trend.positive
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                }`}
              >
                {trend.text}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { ErrorBoundary } from './ErrorBoundary';
