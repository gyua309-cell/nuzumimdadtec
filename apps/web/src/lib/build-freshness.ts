export const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

const RELOAD_MARKER_KEY = 'idham.cloud_build_reloaded';

/**
 * Checks `./build-meta.json` in hosted web environments (such as GitHub Pages)
 * to detect if the current browser tab is running a stale cached HTML shell
 * and triggers a one-time hard reload to sync the latest cloud release.
 */
export async function checkLiveBuildFreshness(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !import.meta.env.PROD) return;
    if (!window.location.protocol.startsWith('http')) return;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return;
    if (!CURRENT_BUILD_ID || CURRENT_BUILD_ID === 'dev') return;

    const base = import.meta.env.BASE_URL || './';
    const metaUrl = `${base.replace(/\/$/, '')}/build-meta.json?_ts=${Date.now()}`;
    const res = await fetch(metaUrl, { cache: 'no-store' });
    if (!res.ok) return;

    const payload = (await res.json()) as { buildId?: string };
    const remoteBuildId = String(payload?.buildId || '').trim();
    if (!remoteBuildId || remoteBuildId === CURRENT_BUILD_ID) return;

    if (sessionStorage.getItem(RELOAD_MARKER_KEY) === remoteBuildId) return;
    sessionStorage.setItem(RELOAD_MARKER_KEY, remoteBuildId);

    if ('caches' in window) {
      const keys = await window.caches.keys().catch(() => [] as string[]);
      await Promise.all(keys.map((k) => window.caches.delete(k).catch(() => false)));
    }

    const url = new URL(window.location.href);
    url.searchParams.set('_v', remoteBuildId);
    window.location.replace(url.toString());
  } catch {
    // Offline or network hiccup: never block app startup
  }
}
