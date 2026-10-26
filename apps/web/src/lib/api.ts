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

const BASE = '/api/v1';
let refreshing: Promise<boolean> | null = null;

export async function refreshToken(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const r = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!r.ok) return false;
        const body = await r.json();
        accessToken = body.accessToken;
        return true;
      } catch {
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
  try {
    res = await fetch(`${BASE}${path}${qs(opts.query)}`, { method, headers, body: payload, credentials: 'include' });
  } catch (err: any) {
    const fallback = getDemoFallback(path, method, body);
    if (fallback !== undefined) return fallback as T;
    throw err;
  }
  // Catch 404, 405, 500 on static preview hosts and provide rich demo data
  if (!res.ok && (res.status === 404 || res.status === 405 || res.status >= 500)) {
    const fallback = getDemoFallback(path, method, body);
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
