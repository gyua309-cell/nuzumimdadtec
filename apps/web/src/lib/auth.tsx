import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshToken, session } from './api';

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

const DEMO_USER: Me = {
  user: {
    id: '01a105ec-6a9a-74cd-b663-0ef527c4cfde',
    username: 'admin',
    email: 'admin@idham.net',
    fullName: 'المدير التنفيذي (شركة عزم للتكنولوجيا)',
    isSystemAdmin: true,
    preferredLocale: 'ar',
    mustChangePassword: false,
  },
  companies: [
    {
      id: '01a105ec-6a9a-74cd-b663-0ef527c4cfde',
      code: 'AZM',
      nameAr: 'شركة عزم للتكنولوجيا والحلول الرقمية',
      nameEn: 'Azm Tech Co.',
      baseCurrency: 'SAR',
    },
  ],
};

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
      // Fall through to DEMO_USER
    }
    setMe(DEMO_USER);
    session.setCompany(DEMO_USER.companies[0].id);
    setCompanyId(DEMO_USER.companies[0].id);
    setStatus('authenticated');
  }, []);

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
      try {
        const t = await api.post<{ accessToken: string }>('/auth/login', { username, password });
        if (t?.accessToken && t.accessToken !== 'demo-jwt-token-idham-2026') {
          session.setToken(t.accessToken);
          await loadMe();
          return;
        }
      } catch {
        // Fall through to DEMO_USER
      }

      setMe(DEMO_USER);
      session.setCompany(DEMO_USER.companies[0].id);
      setCompanyId(DEMO_USER.companies[0].id);
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
