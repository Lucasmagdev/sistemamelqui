import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type UserRole = 'cliente' | 'admin';

interface AuthContextType {
  role: UserRole | null;
  loginAs: (nextRole: UserRole) => void;
  logout: () => void;
}

const STORAGE_KEY = 'imperial-flow-role';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getInitialRole = (): UserRole | null => {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'cliente' || saved === 'admin' ? saved : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole | null>(getInitialRole);

  const loginAs = (nextRole: UserRole) => {
    setRole(nextRole);
    window.localStorage.setItem(STORAGE_KEY, nextRole);
  };

  const logout = () => {
    setRole(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(() => ({ role, loginAs, logout }), [role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
