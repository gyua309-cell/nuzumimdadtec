import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'idham_chunk_reloaded_v1';
const RELOAD_WINDOW_MS = 15_000;

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError|Unable to preload CSS/i.test(
    msg,
  );
}

/**
 * Triggers a single cache-busted reload when a stale cached SPA shell requests
 * hashed JS/CSS chunks removed by a newer deployment.
 */
export function tryRecoverChunkError(err: unknown): boolean {
  if (!isChunkLoadError(err)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    const now = Date.now();
    if (!last || now - last > RELOAD_WINDOW_MS) {
      sessionStorage.setItem(RELOAD_KEY, String(now));
      const url = new URL(window.location.href);
      url.searchParams.set('_cb', String(now));
      window.location.replace(url.toString());
      return true;
    }
  } catch {
    // Fallback if sessionStorage or URL manipulation is unavailable
  }
  return false;
}

export function clearChunkRecoveryFlag(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('_cb')) {
      url.searchParams.delete('_cb');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    // Ignore history API restrictions
  }
}

export function installChunkErrorRecovery(): void {
  if (typeof window === 'undefined') return;
  clearChunkRecoveryFlag();
  window.addEventListener('vite:preloadError', (event) => {
    const raw = event as unknown as { payload?: unknown; detail?: unknown };
    const payload = raw?.payload ?? raw?.detail ?? new Error('Unable to preload CSS/JS chunk');
    if (tryRecoverChunkError(payload)) {
      event.preventDefault();
    }
  });
}

export function lazyWithRetry<T extends Record<string, any>>(
  loader: () => Promise<T>,
  name: keyof T,
) {
  return lazy(async () => {
    try {
      const mod = await loader();
      clearChunkRecoveryFlag();
      return { default: mod[name] as ComponentType<any> };
    } catch (err) {
      if (tryRecoverChunkError(err)) {
        // Keep Suspense visible while browser completes cache-busted navigation
        return new Promise<{ default: ComponentType<any> }>(() => {});
      }
      throw err;
    }
  });
}
