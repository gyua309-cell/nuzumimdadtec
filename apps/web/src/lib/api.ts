import { getDemoFallback } from './demo-fallback';

/**
 * API client. The browser talks only to the NestJS REST API.
 * - Access token is kept in memory only (never localStorage).
 * - Refresh token is an httpOnly cookie managed by the API.
 * - 401 => single-flight silent refresh, then the request is retried once.
 * - Errors follow RFC 7807: { title (Arabic), code, status, errors[] }.
 */
export interface Problem {
  type?: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: Array<{ path: string; message: string }>;
  requestId?: string;
}

export class ApiError extends Error {
  constructor(public readonly problem: Problem) {
    super(problem.title || problem.code);
  }
  get status() {
    return this.problem.status;
  }
  get code() {
    return this.problem.code;
  }
}

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

let accessToken: string | null = null;
let companyId: string | null = localStorage.getItem('idham.company'); // UI preference (selected company)
let onUnauthenticated: (() => void) | null = null;

export const session = {
  setToken(t: string | null) {
    accessToken = t;
  },
  hasToken: () => !!accessToken,
  setCompany(id: string | null) {
    companyId = id;
    if (id) localStorage.setItem('idham.company', id);
    else localStorage.removeItem('idham.company');
  },
  company: () => companyId,
  onUnauthenticated(fn: () => void) {
    onUnauthenticated = fn;
  },
};

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('idham.api_url');
    if (custom) return custom.replace(/\/$/, '') + '/api/v1';
  }
  const envUrl = (import.meta.env.VITE_API_URL as string) || '';
  if (envUrl) return envUrl.replace(/\/$/, '') + '/api/v1';
  return '/api/v1';
}

export function isDemoFallbackEnabled(): boolean {
  const flag = String(import.meta.env.VITE_ENABLE_DEMO_FALLBACK ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') return true;
  // When VITE_API_URL is configured (live backend) and no explicit opt-in is set, disable offline demo fallback.
  const envUrl = String(import.meta.env.VITE_API_URL ?? '').trim();
  if (envUrl) return false;
  if (typeof window !== 'undefined' && localStorage.getItem('idham.api_url')) return false;
  return true;
}

const OFFLINE_COOLDOWN_MS = 60_000;
const offlineBaseUntil = new Map<string, number>();

export function resetApiOfflineCache(): void {
  offlineBaseUntil.clear();
}

export function setCustomApiUrl(url: string | null): void {
  offlineBaseUntil.clear();
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem('idham.api_url');
  } else {
    localStorage.setItem('idham.api_url', url.trim().replace(/\/api\/v1\/?$/, '').replace(/\/$/, ''));
  }
}

export function getCustomApiUrl(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('idham.api_url') || (import.meta.env.VITE_API_URL as string) || '';
}

let refreshing: Promise<boolean> | null = null;

export async function refreshToken(): Promise<boolean> {
  const base = getApiBaseUrl();
  const demoAllowed = isDemoFallbackEnabled();
  if (demoAllowed && (offlineBaseUntil.get(base) || 0) > Date.now()) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        try {
          const r = await fetch(`${base}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            signal: ctrl.signal,
          });
          if (!r.ok) return false;
          const body = await r.json();
          accessToken = body.accessToken;
          return true;
        } finally {
          clearTimeout(t);
        }
      } catch {
        if (demoAllowed) offlineBaseUntil.set(base, Date.now() + OFFLINE_COOLDOWN_MS);
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, opts: { query?: Query; headers?: Record<string, string>; retry?: boolean; raw?: boolean } = {}): Promise<T> {
  const fullPath = `${path}${qs(opts.query)}`;
  const base = getApiBaseUrl();
  const demoAllowed = isDemoFallbackEnabled();
  if (demoAllowed && (offlineBaseUntil.get(base) || 0) > Date.now()) {
    const cachedFallback = getDemoFallback(fullPath, method, body);
    if (cachedFallback !== undefined) return cachedFallback as T;
  }
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (companyId) headers['X-Company-Id'] = companyId;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (path.startsWith('/auth/')) headers['X-Requested-With'] = 'XMLHttpRequest';
  let res: Response;
  const ctrl = new AbortController();
  const timeoutMs = base.startsWith('http') ? 4500 : 2500;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    res = await fetch(`${base}${fullPath}`, { method, headers, body: payload, credentials: 'include', signal: ctrl.signal });
  } catch (err: any) {
    if (demoAllowed) {
      offlineBaseUntil.set(base, Date.now() + OFFLINE_COOLDOWN_MS);
      const fallback = getDemoFallback(fullPath, method, body);
      if (fallback !== undefined) return fallback as T;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  // Catch offline gateway or static-host 404/405/500 responses only when demo fallback is permitted
  if (demoAllowed && !res.ok && (res.status === 404 || res.status === 405 || res.status >= 500)) {
    const contentType = res.headers.get('content-type') || '';
    const isStaticHost = res.status === 404 && !contentType.includes('application/json');
    if (isStaticHost || res.status === 405 || res.status === 502 || res.status === 503 || res.status === 504 || res.status === 530) {
      offlineBaseUntil.set(base, Date.now() + OFFLINE_COOLDOWN_MS);
    }
    const fallback = getDemoFallback(fullPath, method, body);
    if (fallback !== undefined) return fallback as T;
  }
  if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/login')) {
    if (await refreshToken()) return request<T>(method, path, body, { ...opts, retry: false });
    onUnauthenticated?.();
  }
  if (res.status === 204) return undefined as T;
  if (opts.raw && res.ok) return (await res.blob()) as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) {
    const p = (data ?? {}) as Partial<Problem>;
    throw new ApiError({
      title: p.title ?? (res.status === 403 ? 'ليست لديك صلاحية لهذه العملية' : 'حدث خطأ غير متوقع'),
      status: res.status,
      code: p.code ?? `HTTP_${res.status}`,
      detail: p.detail,
      errors: p.errors,
      requestId: p.requestId,
    });
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, { query }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, { headers }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),
  blob: (path: string) => request<Blob>('GET', path, undefined, { raw: true }),
};
