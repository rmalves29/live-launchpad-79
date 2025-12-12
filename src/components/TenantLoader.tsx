import { ReactNode, useContext, useEffect } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';
import { TenantContext } from '@/contexts/TenantContext';

interface TenantLoaderProps {
  children: ReactNode;
}

/**
 * Componente que carrega os dados do tenant e configura o cliente Supabase
 * Deve envolver toda a aplicação após o TenantProvider
 */
export const TenantLoader = ({ children }: TenantLoaderProps) => {
  // Usar useContext diretamente para evitar throw durante HMR
  const contextValue = useContext(TenantContext);
  
  // Se o contexto não está disponível, renderiza loading state
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

  const { tenant, loading, tenantId } = contextValue;

  // Configurar o cliente Supabase com o tenant atual
  useEffect(() => {
    supabaseTenant.setTenantId(tenantId);
  }, [tenantId]);

  // Loading state - apenas se authLoading também (loading já inclui authLoading)
  if (loading) {
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

  // Sempre renderizar children - o controle de acesso é feito pelas rotas (RequireAuth, RequireTenantAuth)
  // Isso permite que a página /auth seja acessível mesmo sem estar logado
  if (tenant) {
    console.log(`🏢 Renderizando com tenant: ${tenant.name}`);
  } else {
    console.log('🏢 Renderizando sem tenant (usuário pode precisar fazer login)');
  }
  
  return <>{children}</>;
};