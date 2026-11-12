import React, { useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export type SelectOption = {
  value: string;
  label: string;
  subLabel?: string;
  disabled?: boolean;
};

type SearchableSelectProps = {
  options: SelectOption[];
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  error?: boolean;
  clearable?: boolean;
  ltr?: boolean;
  id?: string;
  name?: string;
  className?: string;
  maxVisible?: number;
  autoFocus?: boolean;
  onBlur?: () => void;
  ariaLabel?: string;
};

const NORM_RE = /[\u064B-\u065F\u0670]|[أإآ]|ة|ى|[٠-٩]|[۰-۹]/g;
const NORM_MAP: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ة: 'ه',
  ى: 'ي',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Normalize Arabic & Latin text + digits for forgiving fast search (أ/إ/آ -> ا, ة -> ه, ى -> ي, ٠-٩ -> 0-9). */
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(NORM_RE, (ch) => NORM_MAP[ch] ?? '')
    .trim();
}

const searchIndexCache = new WeakMap<SelectOption[], string[]>();

function getNormalizedHaystacks(options: SelectOption[]): string[] {
  const cached = searchIndexCache.get(options);
  if (cached && cached.length === options.length) return cached;
  const indexed = new Array<string>(options.length);
  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    indexed[i] = normalizeSearchText(`${opt.label}\u0000${opt.subLabel ?? ''} ${opt.value}`);
  }
  searchIndexCache.set(options, indexed);
  return indexed;
}

export function filterSelectOptions(options: SelectOption[], rawQuery: string, limit = 80): {
  items: SelectOption[];
  totalMatched: number;
} {
  const normQuery = normalizeSearchText(rawQuery);
  if (!normQuery) {
    return {
      items: options.slice(0, limit),
      totalMatched: options.length,
    };
  }
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  const haystacks = getNormalizedHaystacks(options);
  const prefixMatches: SelectOption[] = [];
  const otherMatches: SelectOption[] = [];
  for (let i = 0; i < options.length; i++) {
    const haystack = haystacks[i];
    let allFound = true;
    for (let t = 0; t < tokens.length; t++) {
      if (!haystack.includes(tokens[t])) {
        allFound = false;
        break;
      }
    }
    if (allFound) {
      if (haystack.startsWith(normQuery)) prefixMatches.push(options[i]);
      else otherMatches.push(options[i]);
    }
  }
  const matched = prefixMatches.length ? [...prefixMatches, ...otherMatches] : otherMatches;
  return {
    items: matched.slice(0, limit),
    totalMatched: matched.length,
  };
}

export const SearchableSelect = React.memo(function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = '— اختر —',
  searchPlaceholder = 'ابحث بالاسم أو الرمز...',
  emptyText = 'لا توجد نتائج مطابقة',
  loading = false,
  disabled = false,
  error = false,
  clearable = true,
  ltr = false,
  id,
  name,
  className = '',
  maxVisible = 80,
  autoFocus = false,
  onBlur,
  ariaLabel,
}: SearchableSelectProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; flipUp: boolean; maxHeight: number } | null>(null);

  const currentVal = value == null ? '' : String(value);

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === currentVal) ?? null,
    [options, currentVal]
  );

  const filtered = useMemo(
    () => filterSelectOptions(options, deferredQuery, maxVisible),
    [options, deferredQuery, maxVisible]
  );

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const flipUp = spaceBelow < 230 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(310, Math.max(160, flipUp ? spaceAbove - 54 : spaceBelow - 54));
    const width = Math.max(rect.width, 220);
    // Keep within horizontal viewport bounds
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.min(Math.max(8, rect.left), maxLeft);
    setCoords({
      top: flipUp ? rect.top - 6 : rect.bottom + 6,
      left,
      width: Math.min(width, window.innerWidth - 16),
      flipUp,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onResizeOrScroll = () => updatePosition();
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    return () => {
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    const idx = filtered.items.findIndex((o) => String(o.value) === currentVal);
    setActiveIndex(idx >= 0 ? idx : 0);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
      onBlur?.();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, onBlur]);

  const selectItem = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      setQuery('');
      requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [onChange]
  );

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange('');
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setOpen(true);
        setQuery(e.key);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setQuery('');
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      setOpen(false);
      setQuery('');
      onBlur?.();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = filtered.items.length === 0 ? 0 : (prev + 1) % filtered.items.length;
        const el = listRef.current?.querySelector(`[data-option-idx="${next}"]`) as HTMLElement | undefined;
        el?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const len = filtered.items.length;
        const next = len === 0 ? 0 : (prev - 1 + len) % len;
        const el = listRef.current?.querySelector(`[data-option-idx="${next}"]`) as HTMLElement | undefined;
        el?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered.items[activeIndex];
      if (target) selectItem(target);
    }
  };

  const displayLabel = selectedOption
    ? selectedOption.label
    : currentVal && !loading
    ? currentVal
    : '';

  return (
    <div className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={currentVal} />}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        dir={ltr ? 'ltr' : 'rtl'}
        className={`input w-full flex items-center justify-between gap-2 text-start transition-all ${
          error ? 'border-rose-500 ring-2 ring-rose-500/15 dark:border-rose-500' : ''
        } ${open ? 'border-brand-500 ring-2 ring-brand-500/20 dark:border-brand-400' : ''} ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-slate-400 dark:hover:border-slate-600'
        }`}
      >
        <span
          className={`truncate flex-1 ${
            displayLabel ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-400 dark:text-slate-500'
          }`}
        >
          {loading && !displayLabel ? 'جاري التحميل...' : displayLabel || placeholder}
        </span>

        <span className="flex items-center gap-1 shrink-0 text-slate-400">
          {clearable && currentVal && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="مسح الاختيار"
              onClick={handleClear}
              className="rounded p-0.5 hover:bg-slate-200/80 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown className={`size-4 transition-transform duration-150 ${open ? 'rotate-180 text-brand-600 dark:text-brand-400' : ''}`} />
        </span>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            dir="rtl"
            style={{
              position: 'fixed',
              top: coords.flipUp ? undefined : coords.top,
              bottom: coords.flipUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
              zIndex: 9999,
            }}
            onKeyDown={handleKeyDown}
            className="rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#0c1427] overflow-hidden animate-fade-in"
          >
            {/* Fast search input inside dropdown */}
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 px-3 py-2 bg-slate-50/80 dark:bg-slate-900/60">
              <Search className="size-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="مسح البحث"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Option items */}
            <div
              style={{ maxHeight: coords.maxHeight }}
              className="overflow-y-auto custom-scrollbar p-1.5 space-y-0.5"
            >
              {loading && filtered.items.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">جاري تحميل القائمة...</div>
              ) : filtered.items.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">{emptyText}</div>
              ) : (
                filtered.items.map((opt, idx) => {
                  const isSelected = String(opt.value) === currentVal;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={`${opt.value}-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      data-option-idx={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => selectItem(opt)}
                      className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-xs transition-colors ${
                        opt.disabled
                          ? 'opacity-45 cursor-not-allowed'
                          : isSelected
                          ? 'bg-brand-50 text-brand-800 font-semibold dark:bg-brand-950/60 dark:text-brand-200'
                          : isActive
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{opt.label}</span>
                        {opt.subLabel && (
                          <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {opt.subLabel}
                          </span>
                        )}
                      </span>
                      {isSelected && <Check className="size-3.5 text-brand-600 dark:text-brand-400 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {filtered.totalMatched > filtered.items.length && (
              <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>
                  عرض {filtered.items.length} من أصل {filtered.totalMatched}
                </span>
                <span>اكتب لتضييق النتائج</span>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
});
