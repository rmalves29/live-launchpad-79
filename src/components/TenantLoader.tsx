import { ReactNode, useContext, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { TenantContext } from '@/contexts/TenantContext';

interface TenantLoaderProps {
  children: ReactNode;
}

/**
 * Componente que apenas sincroniza o tenantId atual com o cliente Supabase.
 * NÃO bloqueia renderização — rotas privadas usam RequireTenantAuth para isso.
 */
export const TenantLoader = ({ children }: TenantLoaderProps) => {
  const contextValue = useContext(TenantContext);

  useEffect(() => {
    if (contextValue?.tenantId) {
      supabaseTenant.setTenantId(contextValue.tenantId);
    }
  }, [contextValue?.tenantId]);

  return <>{children}</>;
};
