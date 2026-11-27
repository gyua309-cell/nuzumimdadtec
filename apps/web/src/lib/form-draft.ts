import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

const DRAFT_PREFIX = 'idham.form.draft.v1:';

export function loadFormDraft<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined' || !key) return null;
    const raw = window.sessionStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveFormDraft<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined' || !key) return;
    window.sessionStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore quota or serialization issues cleanly
  }
}

export function clearFormDraft(key: string): void {
  try {
    if (typeof window === 'undefined' || !key) return;
    window.sessionStorage.removeItem(`${DRAFT_PREFIX}${key}`);
  } catch {
    // Ignore
  }
}

/**
 * Preserves unsaved form state across errors or accidental closes while `enabled` is true.
 * Automatically restores any previously interrupted draft for the same `draftKey`.
 */
export function useFormDraft<T>(draftKey: string, initialValue: T, enabled = true) {
  const initialRef = useRef(initialValue);
  const [restoredFromDraft, setRestoredFromDraft] = useState<boolean>(() => {
    if (!enabled) return false;
    return loadFormDraft<T>(draftKey) !== null;
  });

  const [state, setState] = useState<T>(() => {
    if (!enabled) return initialValue;
    const saved = loadFormDraft<T>(draftKey);
    return saved !== null ? saved : initialValue;
  });

  useEffect(() => {
    if (!enabled || !draftKey) return;
    const timer = window.setTimeout(() => {
      saveFormDraft(draftKey, state);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draftKey, enabled, state]);

  const clearDraft = useCallback(() => {
    clearFormDraft(draftKey);
    setRestoredFromDraft(false);
  }, [draftKey]);

  const resetWithDraftClear = useCallback(
    (next?: T) => {
      clearFormDraft(draftKey);
      setRestoredFromDraft(false);
      setState(next !== undefined ? next : initialRef.current);
    },
    [draftKey]
  );

  return {
    state,
    setState,
    clearDraft,
    resetWithDraftClear,
    restoredFromDraft,
  };
}

/**
 * Moves focus between fields on Enter (instead of premature form submit),
 * triggers Alt+Enter to add a line row, and Ctrl+S to save cleanly.
 */
export function handleErpFormKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  options?: {
    onSave?: () => void;
    onAddRow?: () => void;
    allowEnterNext?: boolean;
  }
) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    if (options?.onSave) {
      e.preventDefault();
      options.onSave();
    }
    return;
  }

  if (e.altKey && e.key === 'Enter' && options?.onAddRow) {
    e.preventDefault();
    options.onAddRow();
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (options?.allowEnterNext === false) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || target.closest('[data-allow-enter="true"]')) return;
    if (target instanceof HTMLInputElement && (target.type === 'submit' || target.type === 'button' || target.type === 'checkbox')) return;

    const form = target.closest('form');
    if (!form) return;

    // Prevent Enter inside single-line inputs from prematurely submitting incomplete invoices/vouchers
    e.preventDefault();
    const focusables = Array.from(
      form.querySelectorAll<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button[data-erp-focusable="true"]:not([disabled])'
      )
    ).filter((el) => el.offsetParent !== null);

    const idx = focusables.indexOf(target);
    if (idx >= 0 && idx + 1 < focusables.length) {
      focusables[idx + 1]?.focus();
    }
  }
}
