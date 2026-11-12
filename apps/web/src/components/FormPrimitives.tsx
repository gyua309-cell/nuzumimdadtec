import React, { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';

/** Track active open modals so Esc and Ctrl+S apply only to the top modal and body scroll stays locked properly. */
const activeModalStack: symbol[] = [];

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export type ErpModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  size?: ModalSize;
  maxWidth?: string;
  centered?: boolean;
  dirty?: boolean;
  onSaveShortcut?: () => void;
  saving?: boolean;
  bodyClassName?: string;
};

function resolveModalWidthClass(size?: ModalSize, wide?: boolean, maxWidth?: string): string {
  if (maxWidth) return maxWidth;
  const resolved: ModalSize = size ?? (wide ? 'lg' : 'md');
  switch (resolved) {
    case 'sm':
      return 'w-[95vw] sm:w-full max-w-lg';
    case 'md':
      return 'w-[95vw] sm:w-[90vw] lg:w-[82vw] max-w-4xl';
    case 'lg':
      return 'w-[95vw] sm:w-[92vw] lg:w-[88vw] max-w-6xl';
    case 'xl':
      return 'w-[95vw] sm:w-[94vw] lg:w-[92vw] max-w-[90rem]';
    case 'full':
      return 'w-[96vw] max-w-[96vw]';
    default:
      return 'w-[95vw] sm:w-[90vw] lg:w-[82vw] max-w-4xl';
  }
}

export function ErpModalShell({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  wide = false,
  size,
  maxWidth,
  dirty = false,
  onSaveShortcut,
  saving = false,
  bodyClassName = '',
}: ErpModalProps) {
  const modalTokenRef = useRef<symbol | null>(null);
  const titleId = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const attemptClose = useCallback(() => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }, [dirty, onClose, saving]);

  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      return;
    }

    const token = Symbol('erp-modal');
    modalTokenRef.current = token;
    activeModalStack.push(token);
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      const topToken = activeModalStack[activeModalStack.length - 1];
      if (topToken !== token) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirmDiscard) {
          setConfirmDiscard(false);
        } else {
          attemptClose();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && onSaveShortcut) {
        e.preventDefault();
        if (!saving) onSaveShortcut();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const idx = activeModalStack.indexOf(token);
      if (idx !== -1) activeModalStack.splice(idx, 1);
      if (activeModalStack.length === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [open, attemptClose, confirmDiscard, onSaveShortcut, saving]);

  if (!open) return null;

  const widthClass = resolveModalWidthClass(size, wide, maxWidth);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-2 sm:p-4 lg:p-6 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
      onMouseDown={attemptClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex w-full ${widthClass} max-h-[90vh] min-h-0 my-auto flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-[#0c1427] overflow-hidden animate-scale-up`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Top brand accent */}
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-cyan-500 to-emerald-500 shrink-0" />

        {/* Sticky Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/90 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/85 dark:bg-[#091020] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              {icon ?? <Sparkles className="size-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id={titleId}
                  className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight truncate"
                >
                  {title}
                </h2>
                {dirty && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
                    تعديلات غير محفوظة
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onSaveShortcut && (
              <span
                title="حفظ سريع: Ctrl + S"
                className="hidden md:inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400"
              >
                Ctrl+S حفظ
              </span>
            )}
            <span className="hidden sm:inline-block rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              ESC
            </span>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer"
              onClick={attemptClose}
              disabled={saving}
              title="إغلاق (Esc)"
              aria-label="إغلاق"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Body */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 pb-8 custom-scrollbar ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Sticky Modal Footer */}
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200/80 dark:border-slate-800/90 px-4 sm:px-6 py-3.5 bg-slate-50/95 dark:bg-[#091020] shadow-[0_-4px_12px_-4px_rgba(15,23,42,0.06)] dark:shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.35)] shrink-0">
            {footer}
          </div>
        )}

        {/* Unsaved Changes Confirmation Overlay */}
        {confirmDiscard && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4 animate-fade-in"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-md rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    يوجد تغييرات غير محفوظة
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    قمت بإدخال أو تعديل بيانات داخل النموذج لم يتم حفظها بعد. هل تريد إغلاق النافذة وتجاهل هذه التغييرات؟
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmDiscard(false)}
                >
                  متابعة التعديل
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => {
                    setConfirmDiscard(false);
                    onClose();
                  }}
                >
                  تجاهل وإغلاق النموذج
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Organized visual card/accordion section for multi-group forms. */
export const FormSection = React.memo(function FormSection({
  title,
  subtitle,
  icon,
  badge,
  collapsible = false,
  defaultOpen = true,
  columns,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  const gridClass =
    columns === 1
      ? 'grid grid-cols-1 gap-4'
      : columns === 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
      : columns === 3
      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
      : columns === 4
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
      : '';

  return (
    <section className={`form-section-card ${className}`}>
      <div
        className={`form-section-header ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={collapsible ? () => setExpanded((v) => !v) : undefined}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? expanded : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 border border-brand-200/70 dark:border-brand-800/60">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {collapsible && (
            <span className="flex size-6 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </span>
          )}
        </div>
      </div>

      {(!collapsible || expanded) && (
        <div className={`form-section-body ${gridClass}`}>{children}</div>
      )}
    </section>
  );
});

export function EnhancedField({
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
  const hasStarInLabel = label.includes('*');
  const cleanLabel = hasStarInLabel ? label.replace(/\s*\*\s*/g, '').trim() : label;
  const isRequired = Boolean(required || hasStarInLabel);

  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {icon && <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>}
        <span>{cleanLabel}</span>
        {isRequired && (
          <span className="text-rose-500 font-bold ms-0.5" title="حقل إلزامي">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
        >
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Convert Arabic-Indic numerals to ASCII digits. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/٫/g, '.');
}

export function formatPhoneOnBlur(raw: string): string {
  return toAsciiDigits(raw).replace(/\s+/g, ' ').trim();
}

export function formatDecimalOnBlur(raw: string): string {
  const ascii = toAsciiDigits(raw).replace(/[,٬\s]/g, '').trim();
  if (!ascii) return '';
  const num = Number(ascii);
  return Number.isFinite(num) ? ascii : ascii;
}

export function validateFieldValue(
  value: any,
  opts: {
    name?: string;
    label: string;
    required?: boolean;
    type?: string;
    min?: number;
    max?: number;
    validate?: (v: any, all?: Record<string, any>) => string | null;
  },
  all?: Record<string, any>
): string | null {
  if (opts.validate) {
    const custom = opts.validate(value, all);
    if (custom) return custom;
  }

  const str = value == null ? '' : String(value).trim();

  if (opts.required && opts.type !== 'bool' && str === '') {
    return `يرجى إدخال ${opts.label.replace(/\s*\*\s*/g, '')}`;
  }

  if (str === '') return null;

  if ((opts.type === 'number' || opts.type === 'decimal') && Number.isNaN(Number(toAsciiDigits(str)))) {
    return 'يرجى إدخال قيمة رقمية صحيحة';
  }

  if ((opts.type === 'number' || opts.type === 'decimal') && opts.min !== undefined && Number(toAsciiDigits(str)) < opts.min) {
    return `القيمة يجب ألا تقل عن ${opts.min}`;
  }

  if ((opts.type === 'number' || opts.type === 'decimal') && opts.max !== undefined && Number(toAsciiDigits(str)) > opts.max) {
    return `القيمة يجب ألا تتجاوز ${opts.max}`;
  }

  if ((opts.name === 'email' || opts.type === 'email') && str && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
    return 'صيغة البريد الإلكتروني غير صحيحة';
  }

  return null;
}
