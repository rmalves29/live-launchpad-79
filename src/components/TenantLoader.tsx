import { ReactNode } from 'react';
import { useTenantContext } from '@/contexts/TenantContext';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Building2 } from 'lucide-react';
import { useEffect } from 'react';

interface TenantLoaderProps {
  children: ReactNode;
}

/**
 * Componente que carrega os dados do tenant e configura o cliente Supabase
 * Deve envolver toda a aplicação após o TenantProvider
 */
export const TenantLoader = ({ children }: TenantLoaderProps) => {
  const { tenant, loading, error, isValidSubdomain, tenantId, isMainSite } = useTenantContext();

  // Configurar o cliente Supabase com o tenant atual
  useEffect(() => {
    supabaseTenant.setTenantId(tenantId);
  }, [tenantId]);

  // Loading state
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

  // Error state - subdomínio inválido
  if (!isValidSubdomain) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-4 text-center">Empresa não encontrada</h2>
            
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {error || 'Esta empresa não existe ou está inativa'}
              </AlertDescription>
            </Alert>

            <div className="text-sm text-muted-foreground text-center space-y-2">
              <p>Verifique se o endereço está correto:</p>
              <code className="bg-muted px-2 py-1 rounded text-xs">
                https://sua-empresa.seudominio.com
              </code>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Site principal (sem tenant)
  if (isMainSite) {
    console.log('🏢 Renderizando site principal');
    return <>{children}</>;
  }

  // Site do tenant
  if (tenant) {
    console.log(`🏢 Renderizando site do tenant: ${tenant.name}`);
    return <>{children}</>;
  }

  // Fallback - não deveria acontecer
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-8">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Estado inesperado</h2>
          <p className="text-muted-foreground text-center">
            Por favor, recarregue a página
          </p>
        </CardContent>
      </Card>
    </div>
  );
};