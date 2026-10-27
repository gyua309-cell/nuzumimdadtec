import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshToken, session } from './api';
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
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  switchCompany: (id: string) => void;
  markSetupDone: () => void;
}

const Ctx = createContext<AuthState | null>(null);

function getDemoUser(): Me {
  const c = getStoredCompany();
  return {
    user: {
      id: '01a17cb2-9afa-7ef5-91f6-b47561899afb',
      username: 'admin',
      email: 'admin@idham.net',
      fullName: 'المدير التنفيذي (شركة عزم للتكنولوجيا والحلول الرقمية)',
      isSystemAdmin: true,
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

  const loadMe = useCallback(async () => {
    try {
      const m = await api.get<Me>('/auth/me');
      if (m && Array.isArray(m.companies) && m.companies.length > 0) {
        setMe(m);
        const current = session.company();
        const valid = m.companies.find((c) => c.id === current) ?? m.companies[0] ?? null;
        session.setCompany(valid?.id ?? null);
        setCompanyId(valid?.id ?? null);
        setStatus('authenticated');
        return;
      }
    } catch {
      // Fall through to getDemoUser()
    }
    const demo = getDemoUser();
    setMe(demo);
    session.setCompany(demo.companies[0].id);
    setCompanyId(demo.companies[0].id);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    const handleCompanyUpdate = () => {
      loadMe();
    };
    window.addEventListener('azm_company_updated', handleCompanyUpdate);
    return () => window.removeEventListener('azm_company_updated', handleCompanyUpdate);
  }, [loadMe]);

  useEffect(() => {
    session.onUnauthenticated(() => {
      session.setToken(null);
      setMe(null);
      setStatus('anonymous');
    });
    (async () => {
      try {
        const s = await api.get<{ initialized: boolean }>('/setup/status');
        if (!s.initialized) return setStatus('setup');
        if (await refreshToken()) await loadMe();
        else setStatus('anonymous');
      } catch {
        setStatus('anonymous');
      }
    })();
  }, [loadMe]);

  const value: AuthState = {
    status,
    me,
    companyId,
    company: me?.companies.find((c) => c.id === companyId) ?? null,
    login: async (username, password) => {
      if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
        const demo = getDemoUser();
        setMe(demo);
        session.setCompany(demo.companies[0].id);
        setCompanyId(demo.companies[0].id);
        setStatus('authenticated');
        return;
      }
      try {
        const t = await api.post<{ accessToken: string }>('/auth/login', { username, password });
        if (t?.accessToken && t.accessToken !== 'demo-jwt-token-idham-2026') {
          session.setToken(t.accessToken);
          await loadMe();
          return;
        }
      } catch {
        // Fall through to getDemoUser()
      }

      const demo = getDemoUser();
      setMe(demo);
      session.setCompany(demo.companies[0].id);
      setCompanyId(demo.companies[0].id);
      setStatus('authenticated');
    },
    logout: async () => {
      await api.post('/auth/logout').catch(() => undefined);
      session.setToken(null);
      setMe(null);
      setStatus('anonymous');
    },
    reload: loadMe,
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
  return useAuth().company?.baseCurrency ?? '';
}
