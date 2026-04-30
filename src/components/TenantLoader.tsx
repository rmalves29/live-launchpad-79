import { ReactNode, useContext, useEffect, useRef } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { TenantContext } from '@/contexts/TenantContext';

interface TenantLoaderProps {
  children: ReactNode;
}

// Flag global - uma vez carregado, nunca mais mostra loading
let hasEverLoaded = false;

/**
 * Componente que carrega os dados do tenant e configura o cliente Supabase
 * Deve envolver toda a aplicação após o TenantProvider
 */
export const TenantLoader = ({ children }: TenantLoaderProps) => {
  const contextValue = useContext(TenantContext);
  const hasRendered = useRef(false);
  
  // Configurar o cliente Supabase com o tenant atual
  useEffect(() => {
    if (contextValue?.tenantId) {
      supabaseTenant.setTenantId(contextValue.tenantId);
    }
  }, [contextValue?.tenantId]);

  // Se já renderizamos uma vez com sucesso, NUNCA mostrar loading de novo
  if (hasEverLoaded) {
    return <>{children}</>;
  }

  // Se contexto ainda não montou, deixa renderizar (rotas públicas funcionam sem tenant)
  if (!contextValue) {
    return <>{children}</>;
  }

  // NUNCA bloquear o app inteiro com loading screen.
  // Rotas privadas usam RequireAuth/RequireTenantAuth, que tratam o loading individualmente.
  // Rotas públicas (landing, /t/:slug, políticas) precisam renderizar imediatamente.
  hasEverLoaded = true;
  hasRendered.current = true;

  return <>{children}</>;
};