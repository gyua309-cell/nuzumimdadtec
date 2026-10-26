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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(session.company());

  const loadMe = useCallback(async () => {
    const m = await api.get<Me>('/auth/me');
    setMe(m);
    const current = session.company();
    const valid = m.companies.find((c) => c.id === current) ?? m.companies[0] ?? null;
    session.setCompany(valid?.id ?? null);
    setCompanyId(valid?.id ?? null);
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
      const t = await api.post<{ accessToken: string }>('/auth/login', { username, password });
      session.setToken(t.accessToken);
      await loadMe();
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
