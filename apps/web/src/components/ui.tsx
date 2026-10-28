import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from 'lucide-react';
import { ApiError } from '../lib/api';

// ------------------------------------------------------------------ toast
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string; detail?: string };
const ToastCtx = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), t.kind === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 start-4 z-[100] flex w-96 max-w-[90vw] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`card flex items-start gap-2 p-3 text-sm shadow-lg ${t.kind === 'error' ? 'border-rose-300 dark:border-rose-800' : t.kind === 'success' ? 'border-emerald-300 dark:border-emerald-800' : ''}`}
          >
            {t.kind === 'error' ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t.text}</div>
              {t.detail && <div className="mt-0.5 break-words text-xs text-slate-500">{t.detail}</div>}
            </div>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
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
        push({ kind: 'error', text: e.problem.title, detail: fieldErrors || (e.problem.code !== e.problem.title ? e.problem.code : undefined) });
      } else push({ kind: 'error', text: (e as Error)?.message ?? 'حدث خطأ' });
    },
  };
}

// ------------------------------------------------------------------ layout bits
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`size-4 animate-spin ${className}`} />;
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-16 text-sm text-slate-500 animate-fade-in">
      <div className="relative flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
        <Spinner className="size-6 text-brand-600 dark:text-brand-400" />
      </div>
      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">جارٍ التحميل ومعالجة البيانات…</span>
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className="card flex flex-col items-center gap-3 p-12 text-center text-sm border-rose-200 dark:border-rose-900/40 animate-fade-in">
      <div className="size-14 rounded-2xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center shadow-xs">
        <AlertTriangle className="size-7 text-rose-600 dark:text-rose-400" />
      </div>
      <div className="font-bold text-base text-slate-900 dark:text-slate-100">
        {forbidden ? 'ليست لديك صلاحية لعرض هذه البيانات' : error instanceof ApiError ? error.problem.title : 'تعذر تحميل البيانات'}
      </div>
      {error instanceof ApiError && !forbidden && <div className="text-xs text-slate-500 font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg">{error.code}</div>}
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 p-14 text-center text-sm text-slate-500 animate-fade-in">
      <div className="size-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-2xs">
        <Inbox className="size-8 text-slate-400 dark:text-slate-500" />
      </div>
      <div className="font-bold text-slate-700 dark:text-slate-300 max-w-md">{text}</div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  green:  'bg-emerald-50 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700/60',
  red:    'bg-rose-50 text-rose-800 border border-rose-300/80 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700/60',
  amber:  'bg-amber-50 text-amber-800 border border-amber-300/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700/60',
  blue:   'bg-blue-50 text-blue-800 border border-blue-300/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-700/60',
  purple: 'bg-purple-50 text-purple-800 border border-purple-300/80 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700/60',
  cyan:   'bg-cyan-50 text-cyan-800 border border-cyan-300/80 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-700/60',
  teal:   'bg-teal-50 text-teal-800 border border-teal-300/80 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-700/60',
  slate:  'bg-slate-100 text-slate-800 border border-slate-300/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
};

export function Badge({ color = 'slate', dot, children }: { color?: keyof typeof badgeColors; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-0.5 text-xs font-bold shadow-2xs ${badgeColors[color] ?? badgeColors.slate}`}>
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
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/75 backdrop-blur-md p-4 sm:p-6 transition-all animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        className={`relative flex w-full ${
          maxWidth ? maxWidth : wide ? 'max-w-5xl' : 'max-w-4xl'
        } max-h-[90vh] flex-col rounded-3xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden animate-scale-up`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Top Accent Gradient Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-500 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 px-7 py-5 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-md">
              <span className="size-2 rounded-full bg-white animate-pulse" />
            </div>
            <div>
              <h2 className="font-extrabold text-lg text-slate-900 dark:text-white tracking-tight">{title}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">نافذة إدخال وتحديث البيانات الموسعة</p>
            </div>
          </div>
          <button
            className="flex size-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white transition-all"
            onClick={onClose}
            title="إغلاق (Esc)"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {children}
        </div>

        {/* Modal Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800/80 px-7 py-4 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md shrink-0">
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

/** Prompt that requires a reason (cancel, reverse, reopen…). */
export function ReasonDialog({
  open, title, confirmText, danger, onClose, onConfirm, extra,
}: {
  open: boolean; title: string; confirmText: string; danger?: boolean; onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void; extra?: ReactNode;
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
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button
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
      <label className="label">السبب (إلزامي)</label>
      <textarea className="input h-24 py-2" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
    </Modal>
  );
}

// ------------------------------------------------------------------ form helpers
export function Field({ label, children, error, hint, className = '' }: { label: string; children: ReactNode; error?: string; hint?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 rounded-b-2xl">
      <span className="text-slate-600 dark:text-slate-400 font-medium">
        إجمالي <span className="num font-bold text-slate-900 dark:text-white">{total}</span> سجل
      </span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost h-7 px-2 text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>السابق</button>
        <span className="num px-2 font-bold text-slate-700 dark:text-slate-300">{page} / {pages}</span>
        <button className="btn-ghost h-7 px-2 text-xs" disabled={page >= pages} onClick={() => onPage(page + 1)}>التالي</button>
      </div>
    </div>
  );
}

const TONES = {
  blue: {
    bar: 'from-blue-500 via-brand-500 to-indigo-600',
    iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
    glow: 'from-blue-500/12 to-transparent',
    cardBg: 'card-gradient-blue',
    border: 'border-blue-200/70 dark:border-blue-800/40',
    shadowHover: 'hover:shadow-blue-200/60 dark:hover:shadow-blue-950/50',
  },
  green: {
    bar: 'from-emerald-500 via-teal-500 to-green-500',
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    glow: 'from-emerald-500/12 to-transparent',
    cardBg: 'card-gradient-emerald',
    border: 'border-emerald-200/70 dark:border-emerald-800/40',
    shadowHover: 'hover:shadow-emerald-200/60 dark:hover:shadow-emerald-950/50',
  },
  red: {
    bar: 'from-rose-500 via-red-500 to-pink-600',
    iconBg: 'bg-gradient-to-br from-rose-500 to-red-600 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
    glow: 'from-rose-500/12 to-transparent',
    cardBg: 'card-gradient-rose',
    border: 'border-rose-200/70 dark:border-rose-800/40',
    shadowHover: 'hover:shadow-rose-200/60 dark:hover:shadow-rose-950/50',
  },
  amber: {
    bar: 'from-amber-400 via-orange-500 to-amber-500',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    glow: 'from-amber-500/12 to-transparent',
    cardBg: 'card-gradient-amber',
    border: 'border-amber-200/70 dark:border-amber-800/40',
    shadowHover: 'hover:shadow-amber-200/60 dark:hover:shadow-amber-950/50',
  },
  purple: {
    bar: 'from-purple-500 via-fuchsia-500 to-indigo-500',
    iconBg: 'bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300',
    glow: 'from-purple-500/12 to-transparent',
    cardBg: 'card-gradient-purple',
    border: 'border-purple-200/70 dark:border-purple-800/40',
    shadowHover: 'hover:shadow-purple-200/60 dark:hover:shadow-purple-950/50',
  },
  cyan: {
    bar: 'from-cyan-500 via-sky-500 to-blue-500',
    iconBg: 'bg-gradient-to-br from-cyan-500 to-sky-600 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300',
    glow: 'from-cyan-500/12 to-transparent',
    cardBg: 'card-gradient-cyan',
    border: 'border-cyan-200/70 dark:border-cyan-800/40',
    shadowHover: 'hover:shadow-cyan-200/60 dark:hover:shadow-cyan-950/50',
  },
  teal: {
    bar: 'from-teal-500 via-emerald-500 to-cyan-500',
    iconBg: 'bg-gradient-to-br from-teal-500 to-emerald-600 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
    glow: 'from-teal-500/12 to-transparent',
    cardBg: 'card-gradient-teal',
    border: 'border-teal-200/70 dark:border-teal-800/40',
    shadowHover: 'hover:shadow-teal-200/60 dark:hover:shadow-teal-950/50',
  },
  slate: {
    bar: 'from-slate-600 via-slate-700 to-slate-800',
    iconBg: 'bg-gradient-to-br from-slate-700 to-slate-800 text-white',
    val: 'text-slate-900 dark:text-white',
    badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
    glow: 'from-slate-500/5 to-transparent',
    cardBg: 'bg-white dark:bg-slate-900',
    border: 'border-slate-200/90 dark:border-slate-800/90',
    shadowHover: 'hover:shadow-slate-200/60 dark:hover:shadow-slate-950/50',
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
    <div className={`group relative overflow-hidden rounded-2xl border ${theme.border} ${theme.cardBg} shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 animate-count-up ${theme.shadowHover ?? ''} ${className}`}>
      {/* Top Accent Bar */}
      <div className={`absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r ${theme.bar}`} />

      {/* Ambient glow in corner */}
      <div className={`pointer-events-none absolute -top-6 -end-6 size-24 rounded-full bg-gradient-to-bl ${theme.glow} blur-2xl opacity-60`} />

      {/* Watermark background icon */}
      {Icon && (
        <Icon className="pointer-events-none absolute -bottom-3 -start-3 size-24 opacity-[0.04] transition-all duration-500 group-hover:scale-110 group-hover:opacity-[0.08]" />
      )}

      <div className="relative p-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide leading-snug">{label}</span>
          {Icon && (
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${theme.iconBg} shadow-md transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
              <Icon className="size-5" />
            </div>
          )}
        </div>
        <div className={`num mt-3 text-start text-[26px] font-black tracking-tight leading-none ${theme.val}`}>
          {value}
        </div>
        {(hint || trend) && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-black/5 dark:border-white/5 pt-2.5">
            <div className="flex items-center gap-1.5 min-w-0">{hint}</div>
            {trend && (
              <span className={`inline-flex shrink-0 items-center rounded-lg px-2 py-0.5 text-[10px] font-bold ${trend.positive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'}`}>
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
