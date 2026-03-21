import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type UserRole = 'cliente' | 'admin';

interface AuthContextType {
  role: UserRole | null;
  profileName: string | null;
  profileEmail: string | null;
  loading: boolean;
  loginAs: (nextRole: UserRole) => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = 'imperial-flow-role';
const NAME_STORAGE_KEY = 'imperial-flow-nome';
const EMAIL_STORAGE_KEY = 'imperial-flow-email';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getInitialRole = (): UserRole | null => {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'cliente' || saved === 'admin' ? saved : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(getInitialRole);
  const [profileName, setProfileName] = useState<string | null>(() => (typeof window === 'undefined' ? null : window.localStorage.getItem(NAME_STORAGE_KEY)));
  const [profileEmail, setProfileEmail] = useState<string | null>(() => (typeof window === 'undefined' ? null : window.localStorage.getItem(EMAIL_STORAGE_KEY)));
  const [loading, setLoading] = useState(true);

  const syncLocalStorage = (nextRole: UserRole | null, nextName: string | null, nextEmail: string | null) => {
    if (typeof window === 'undefined') return;
    if (nextRole) window.localStorage.setItem(STORAGE_KEY, nextRole);
    else window.localStorage.removeItem(STORAGE_KEY);

    if (nextName) window.localStorage.setItem(NAME_STORAGE_KEY, nextName);
    else window.localStorage.removeItem(NAME_STORAGE_KEY);

    if (nextEmail) window.localStorage.setItem(EMAIL_STORAGE_KEY, nextEmail);
    else window.localStorage.removeItem(EMAIL_STORAGE_KEY);
  };

  const refreshProfile = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.user) {
        setRole(null);
        setProfileName(null);
        setProfileEmail(null);
        syncLocalStorage(null, null, null);
        return;
      }

      const { data: userData, error } = await supabase
        .from('users')
        .select('tipo, nome, email')
        .eq('auth_user_id', session.user.id)
        .single();

      if (error || !userData) {
        setRole(null);
        setProfileName(null);
        setProfileEmail(session.user.email || null);
        syncLocalStorage(null, null, session.user.email || null);
        return;
      }

      const nextRole: UserRole = userData.tipo === 'admin' ? 'admin' : 'cliente';
      const nextName = userData.nome || session.user.email || null;
      const nextEmail = userData.email || session.user.email || null;
      setRole(nextRole);
      setProfileName(nextName);
      setProfileEmail(nextEmail);
      syncLocalStorage(nextRole, nextName, nextEmail);
    } finally {
      setLoading(false);
    }
  };

  const loginAs = (nextRole: UserRole) => {
    setRole(nextRole);
    syncLocalStorage(nextRole, profileName, profileEmail);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setProfileName(null);
    setProfileEmail(null);
    syncLocalStorage(null, null, null);
  };

  useEffect(() => {
    void refreshProfile();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void refreshProfile();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ role, profileName, profileEmail, loading, loginAs, refreshProfile, logout }), [role, profileName, profileEmail, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
