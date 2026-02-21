import { createContext, useContext, useState, ReactNode } from 'react';

interface TenantConfig {
  nomeEmpresa: string;
  corPrimaria: string;
  logoUrl?: string;
  tenantId: string;
}

interface TenantContextType {
  config: TenantConfig;
  updateConfig: (partial: Partial<TenantConfig>) => void;
}

const defaultConfig: TenantConfig = {
  nomeEmpresa: 'Sabor Imperial',
  corPrimaria: '#D4AF37',
  logoUrl: '/brand/logo-sabor-imperial.png',
  tenantId: 'tenant-001',
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig>(defaultConfig);
  const updateConfig = (partial: Partial<TenantConfig>) =>
    setConfig((prev) => ({ ...prev, ...partial }));
  return (
    <TenantContext.Provider value={{ config, updateConfig }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
