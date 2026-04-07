import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { backendRequest } from '@/lib/backendClient';

interface TenantConfig {
  nomeEmpresa: string;
  corPrimaria: string;
  logoUrl?: string;
  tenantId: string;
}

interface TenantContextType {
  config: TenantConfig;
  loading: boolean;
  refreshConfig: () => Promise<void>;
  updateConfig: (partial: Partial<TenantConfig>) => Promise<TenantConfig>;
}

const defaultConfig: TenantConfig = {
  nomeEmpresa: 'Sabor Imperial',
  corPrimaria: '#D4AF37',
  logoUrl: '/brand/logo-sabor-imperial.png',
  tenantId: 'tenant-001',
};

const TenantContext = createContext<TenantContextType | undefined>(undefined);

type BrandingResponse = {
  ok: true;
  branding: {
    nomeEmpresa?: string;
    corPrimaria?: string;
    logoUrl?: string;
  };
};

export function TenantProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);

  const refreshConfig = async () => {
    const response = await backendRequest<BrandingResponse>('/api/storefront/branding');
    setConfig((current) => ({
      ...current,
      nomeEmpresa: response?.branding?.nomeEmpresa || defaultConfig.nomeEmpresa,
      corPrimaria: response?.branding?.corPrimaria || defaultConfig.corPrimaria,
      logoUrl: response?.branding?.logoUrl || defaultConfig.logoUrl,
    }));
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await refreshConfig();
      } catch {
        if (!active) return;
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const updateConfig = async (partial: Partial<TenantConfig>) => {
    const payload = {
      nomeEmpresa: partial.nomeEmpresa ?? config.nomeEmpresa,
      corPrimaria: partial.corPrimaria ?? config.corPrimaria,
      logoUrl: partial.logoUrl ?? config.logoUrl,
    };

    const response = await backendRequest<BrandingResponse>('/api/admin/storefront/branding', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const nextConfig = {
      ...config,
      nomeEmpresa: response?.branding?.nomeEmpresa || defaultConfig.nomeEmpresa,
      corPrimaria: response?.branding?.corPrimaria || defaultConfig.corPrimaria,
      logoUrl: response?.branding?.logoUrl || defaultConfig.logoUrl,
    };
    setConfig(nextConfig);
    return nextConfig;
  };

  const value = useMemo(
    () => ({ config, loading, refreshConfig, updateConfig }),
    [config, loading],
  );

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
