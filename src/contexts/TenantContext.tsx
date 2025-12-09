import { createContext, useContext, ReactNode } from 'react';
import { useTenant } from '@/hooks/useTenant';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  enable_live?: boolean;
  enable_sendflow?: boolean;
  max_whatsapp_groups?: number | null;
}

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  isValidSubdomain: boolean;
  tenantId: string | null;
  isMainSite: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider = ({ children }: TenantProviderProps) => {
  const { tenant, loading, error, isValidSubdomain } = useTenant();

  const tenantId = tenant?.id || null;
  const isMainSite = !tenant; // true se estiver no site principal (sem subdomínio)

  const value: TenantContextType = {
    tenant,
    loading,
    error,
    isValidSubdomain,
    tenantId,
    isMainSite,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenantContext = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenantContext deve ser usado dentro de um TenantProvider');
  }
  return context;
};