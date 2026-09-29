import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import { api, ApiError } from '../lib/api';

export interface Me {
  profile: any;
  plan: any;
  quota: { used: number; limit: number };
  admin_role: string | null;
  unread: number;
  email_verified: boolean;
  last_sign_in_at?: string;
  provider?: string;
}

interface AuthValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  me: Me | null;
  meError: ApiError | null;
  refreshMe: () => Promise<void>;
  setUnread: (n: number) => void;
  signOut: (scope?: 'local' | 'global') => Promise<void>;
}

const AuthContext = createContext<AuthValue>({ user: null, session: null, loading: true, me: null, meError: null, refreshMe: async () => {}, setUnread: () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<ApiError | null>(null);
  const uidRef = useRef<string | null>(null);

  const refreshMe = useCallback(async () => {
    try {
      const data = await api<Me>('/api/me?action=session');
      setMe(data);
      setMeError(null);
    } catch (e: any) {
      if (e instanceof ApiError) setMeError(e);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const uid = user?.id ?? null;
    if (uid === uidRef.current) return;
    uidRef.current = uid;
    if (uid) { setMe(null); refreshMe(); } else { setMe(null); setMeError(null); }
  }, [user, refreshMe]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') refreshMe(); }, 60000);
    return () => clearInterval(t);
  }, [user, refreshMe]);

  const signOut = useCallback(async (scope: 'local' | 'global' = 'local') => {
    await supabase.auth.signOut({ scope }).catch(() => supabase.auth.signOut({ scope: 'local' }));
    setMe(null);
  }, []);

  const setUnread = useCallback((n: number) => setMe((m) => (m ? { ...m, unread: n } : m)), []);

  return <AuthContext.Provider value={{ user, session, loading, me, meError, refreshMe, setUnread, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
