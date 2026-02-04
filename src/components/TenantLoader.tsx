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
  
  // Se o contexto não está disponível no primeiro load
  if (!contextValue) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Building2 className="h-12 w-12 text-primary animate-pulse mb-4" />
            <h2 className="text-xl font-semibold mb-2">Carregando...</h2>
            <p className="text-muted-foreground text-center">
              Inicializando aplicação
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { loading } = contextValue;

  // Loading state - apenas no primeiro carregamento
  if (loading && !hasRendered.current) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Building2 className="h-12 w-12 text-primary animate-pulse mb-4" />
            <h2 className="text-xl font-semibold mb-2">Carregando...</h2>
            <p className="text-muted-foreground text-center">
              Identificando sua empresa
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Marcar como carregado com sucesso
  hasEverLoaded = true;
  hasRendered.current = true;
  
  return <>{children}</>;
};