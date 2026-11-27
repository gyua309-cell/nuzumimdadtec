import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, isDemoFallbackEnabled, refreshToken, session } from './api';
import { getStoredCompany } from './storage-company';

export interface Me {
  user: { id: string; username: string; email: string | null; fullName: string; isSystemAdmin: boolean; preferredLocale: string; mustChangePassword: boolean };
  companies: Array<{ id: string; code: string; nameAr: string; nameEn: string | null; baseCurrency: string }>;
}

type Status = 'loading' | 'setup' | 'anonymous' | 'authenticated';

interface AuthState {
  status: Status;
  me: Me | null;
  companyId: string | null;
  company: Me['companies'][number] | null;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  switchCompany: (id: string) => void;
  markSetupDone: () => void;
}

const SESSION_USER_KEY = 'idham.session.user';
const Ctx = createContext<AuthState | null>(null);

function getSavedLocalUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_USER_KEY) || sessionStorage.getItem(SESSION_USER_KEY) || null;
}

function saveLocalUsername(username: string | null, remember = true) {
  if (typeof window === 'undefined') return;
  if (!username) {
    localStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    return;
  }
  if (remember) {
    localStorage.setItem(SESSION_USER_KEY, username);
    sessionStorage.removeItem(SESSION_USER_KEY);
  } else {
    sessionStorage.setItem(SESSION_USER_KEY, username);
    localStorage.removeItem(SESSION_USER_KEY);
  }
}

function getDemoUser(usernameInput?: string | null): Me {
  const c = getStoredCompany();
  const u = (usernameInput || getSavedLocalUsername() || 'admin').toLowerCase();
  const roleMap: Record<string, { fullName: string; email: string; isAdmin: boolean }> = {
    admin: { fullName: 'المدير التنفيذي', email: 'admin@idham.net', isAdmin: true },
    accountant: { fullName: 'المدير المالي والمحاسب', email: 'finance@idham.net', isAdmin: false },
    pmo: { fullName: 'مدير المشاريع والعمليات', email: 'pmo@idham.net', isAdmin: false },
  };
  const meta = roleMap[u] || { fullName: usernameInput || 'المدير التنفيذي', email: `${u}@idham.net`, isAdmin: u === 'admin' };

  return {
    user: {
      id: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
      username: u,
      email: meta.email,
      fullName: meta.fullName,
      isSystemAdmin: meta.isAdmin,
      preferredLocale: 'ar',
      mustChangePassword: false,
    },
    companies: [
      {
        id: c.id,
        code: c.code,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        baseCurrency: c.baseCurrency || 'SAR',
      },
    ],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(session.company());

  const loadMe = useCallback(async (preferredUsername?: string | null) => {
    try {
      const m = await api.get<Me>('/auth/me');
      if (m && Array.isArray(m.companies) && m.companies.length > 0 && !preferredUsername) {
        setMe(m);
        const current = session.company();
        const valid = m.companies.find((c) => c.id === current) ?? m.companies[0] ?? null;
        session.setCompany(valid?.id ?? null);
        setCompanyId(valid?.id ?? null);
        setStatus('authenticated');
        return;
      }
    } catch (err) {
      if (!isDemoFallbackEnabled()) {
        session.setToken(null);
        setMe(null);
        setStatus('anonymous');
        throw err;
      }
    }
    if (!isDemoFallbackEnabled()) {
      session.setToken(null);
      setMe(null);
      setStatus('anonymous');
      return;
    }
    const demo = getDemoUser(preferredUsername);
    setMe(demo);
    const demoCompId = demo.companies?.[0]?.id ?? null;
    session.setCompany(demoCompId);
    setCompanyId(demoCompId);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    const handleCompanyUpdate = () => {
      loadMe().catch(() => undefined);
    };
    window.addEventListener('azm_company_updated', handleCompanyUpdate);
    return () => window.removeEventListener('azm_company_updated', handleCompanyUpdate);
  }, [loadMe]);

  useEffect(() => {
    session.onUnauthenticated(() => {
      session.setToken(null);
      saveLocalUsername(null);
      setMe(null);
      setStatus('anonymous');
    });
    (async () => {
      try {
        const s = await api.get<{ initialized: boolean }>('/setup/status');
        if (!s.initialized) return setStatus('setup');
        if (await refreshToken()) {
          await loadMe();
          return;
        }
        if (isDemoFallbackEnabled()) {
          const savedUser = getSavedLocalUsername();
          if (savedUser) {
            await loadMe(savedUser);
            return;
          }
        }
        setStatus('anonymous');
      } catch {
        if (isDemoFallbackEnabled()) {
          const savedUser = getSavedLocalUsername();
          if (savedUser) {
            await loadMe(savedUser).catch(() => setStatus('anonymous'));
            return;
          }
        }
        setStatus('anonymous');
      }
    })();
  }, [loadMe]);

  const value: AuthState = {
    status,
    me,
    companyId,
    company: me?.companies.find((c) => c.id === companyId) ?? null,
    login: async (username, password, remember = true) => {
      if (isDemoFallbackEnabled()) {
        saveLocalUsername(username, remember);
        if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
          await loadMe(username);
          return;
        }
      }
      try {
        const t = await api.post<{ accessToken: string }>('/auth/login', { username, password });
        if (t?.accessToken && t.accessToken !== 'demo-jwt-token-idham-2026') {
          session.setToken(t.accessToken);
          await loadMe();
          return;
        }
        if (!isDemoFallbackEnabled()) {
          throw new Error('بيانات الدخول غير صحيحة أو الخادم غير متصل');
        }
      } catch (err) {
        if (!isDemoFallbackEnabled()) {
          saveLocalUsername(null);
          session.setToken(null);
          throw err;
        }
      }

      await loadMe(username);
    },
    logout: async () => {
      await api.post('/auth/logout').catch(() => undefined);
      session.setToken(null);
      saveLocalUsername(null);
      setMe(null);
      setStatus('anonymous');
    },
    reload: () => loadMe(),
    switchCompany: (id) => {
      session.setCompany(id);
      setCompanyId(id);
    },
    markSetupDone: () => setStatus('anonymous'),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}

/** Base currency of the active company (for labels only). */
export function useBaseCurrency() {
  const { company } = useAuth();
  return company?.baseCurrency ?? 'SAR';
}
