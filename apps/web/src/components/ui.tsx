import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { ApiError } from '../lib/api';

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
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/85 bg-white px-5 py-4 shadow-2xs dark:border-slate-800/90 dark:bg-[#0c1427]">
      <div className="flex items-start gap-3.5 min-w-0">
        <div className="mt-1 h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-amber-400 via-amber-500 to-cyan-500 shadow-xs" />
        <div className="space-y-0.5 min-w-0">
          <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`size-4 animate-spin ${className}`} />;
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3.5 p-16 text-sm text-slate-500 animate-fade-in">
      <div className="relative flex size-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-500 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-400 shadow-sm">
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
        <Inbox className="size-7 text-amber-500/80 dark:text-cyan-400/80" />
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
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
  maxWidth,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  maxWidth?: string;
  centered?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/75 backdrop-blur-sm p-3 sm:p-6 transition-all animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className={`relative flex w-full ${
          maxWidth ? maxWidth : wide ? 'max-w-5xl' : 'max-w-3xl'
        } max-h-[90vh] flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0c1427] overflow-hidden animate-scale-up`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Signature IDHAM Top Accent Gradient Bar */}
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-cyan-500 to-emerald-500 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/90 px-6 py-4 bg-slate-50/70 dark:bg-[#091020] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight truncate">
                {title}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              ESC
            </span>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white transition-all"
              onClick={onClose}
              title="إغلاق (Esc)"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar">{children}</div>

        {/* Modal Footer */}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 dark:border-slate-800/90 px-6 py-3.5 bg-slate-50/80 dark:bg-[#091020] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  maxWidth?: string;
}) {
  return <Modal {...props} />;
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
  className = '',
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
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
        <span className="num rounded-lg bg-amber-500/12 border border-amber-500/30 px-2.5 py-1 font-extrabold text-amber-700 dark:text-amber-300">
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
    iconBox: 'bg-sky-500/12 text-sky-600 border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/35',
    glow: 'bg-sky-500/10',
    accentLine: 'bg-sky-500',
  },
  green: {
    cyberClass: 'cyber-card-emerald',
    iconBox: 'bg-emerald-500/12 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/35',
    glow: 'bg-emerald-500/10',
    accentLine: 'bg-emerald-500',
  },
  red: {
    cyberClass: 'cyber-card-rose',
    iconBox: 'bg-rose-500/12 text-rose-600 border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/35',
    glow: 'bg-rose-500/10',
    accentLine: 'bg-rose-500',
  },
  amber: {
    cyberClass: 'cyber-card-amber',
    iconBox: 'bg-amber-500/12 text-amber-600 border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/35',
    glow: 'bg-amber-500/10',
    accentLine: 'bg-amber-500',
  },
  purple: {
    cyberClass: 'cyber-card-purple',
    iconBox: 'bg-purple-500/12 text-purple-600 border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/35',
    glow: 'bg-purple-500/10',
    accentLine: 'bg-purple-500',
  },
  cyan: {
    cyberClass: 'cyber-card-cyan',
    iconBox: 'bg-cyan-500/12 text-cyan-600 border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/35',
    glow: 'bg-cyan-500/10',
    accentLine: 'bg-cyan-500',
  },
  teal: {
    cyberClass: 'cyber-card-teal',
    iconBox: 'bg-teal-500/12 text-teal-600 border-teal-500/30 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/35',
    glow: 'bg-teal-500/10',
    accentLine: 'bg-teal-500',
  },
  slate: {
    cyberClass: 'cyber-card-slate',
    iconBox: 'bg-slate-100 text-slate-600 border-slate-300/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    glow: 'bg-slate-500/5',
    accentLine: 'bg-slate-400',
  },
};

export function Stat({
  label,
  value,
  hint,
  tone = 'slate',
  icon: Icon,
  trend,
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'cyan' | 'teal' | 'slate';
  icon?: any;
  trend?: { text: string; positive?: boolean };
  className?: string;
}) {
  const theme = TONES[tone] || TONES.slate;
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-[#0c1427] ${theme.cyberClass} transition-all duration-200 hover:-translate-y-0.5 animate-count-up ${className}`}
    >
      {/* Subtle Ambient Corner Glow */}
      <div className={`pointer-events-none absolute -top-8 -end-8 size-24 rounded-full ${theme.glow} blur-2xl`} />

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2.5">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-snug">{label}</span>
          {Icon && (
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${theme.iconBox} transition-transform duration-200 group-hover:scale-105`}
            >
              <Icon className="size-4.5" />
            </div>
          )}
        </div>

        <div className="num mt-2.5 text-start text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
          {value}
        </div>

        {(hint || trend) && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5 min-w-0 truncate">{hint}</div>
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
