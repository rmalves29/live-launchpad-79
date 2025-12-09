import { useTenantContext } from '@/contexts/TenantContext';
import { TenantInfo } from './TenantInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Building2, 
  Globe, 
  ExternalLink, 
  Shield, 
  Users, 
  Database,
  CheckCircle2
} from 'lucide-react';

/**
 * Componente de demonstração do sistema multi-domínio
 * Mostra as diferenças entre site principal e sites de tenant
 */
export const MultiDomainDemo = () => {
  const { tenant, isMainSite, tenantId } = useTenantContext();

  const openSubdomain = (slug: string) => {
    const currentDomain = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port ? `:${window.location.port}` : '';
    
    let newUrl;
    if (currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
      // Em desenvolvimento, usar query parameter como fallback
      newUrl = `${protocol}//${currentDomain}${port}?tenant=${slug}`;
    } else {
      // Em produção, usar subdomínio real
      newUrl = `${protocol}//${slug}.${currentDomain}${port}`;
    }
    
    window.open(newUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Status Atual */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isMainSite ? (
              <>
                <Globe className="h-5 w-5" />
                Site Principal - Área Administrativa
              </>
            ) : (
              <>
                <Building2 className="h-5 w-5" />
                Site da Empresa: {tenant?.name}
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status Atual:</span>
            <TenantInfo />
          </div>
          
          {tenantId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Tenant ID:</span>
              <Badge variant="outline" className="font-mono text-xs">
                {tenantId}
              </Badge>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">URL:</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {window.location.hostname}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Funcionalidades por Contexto */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Dados e Funcionalidades Disponíveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isMainSite ? (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Funcionalidades de Administração
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Gerenciar empresas (tenants)
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Criar usuários administradores
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Visualizar dados globais
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Configurações do sistema
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Dados Isolados da Empresa "{tenant?.name}"
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Produtos próprios
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Clientes próprios
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Pedidos próprios
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Integração WhatsApp própria
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Configurações de frete próprias
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Relatórios isolados
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Simulação de Subdomínios (em desenvolvimento) */}
      {(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Simulação Multi-Domínio (Desenvolvimento)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Globe className="h-4 w-4" />
              <AlertDescription>
                Em desenvolvimento local, use os botões abaixo para simular diferentes subdomínios.
                Em produção, cada empresa terá seu próprio subdomínio automático.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = window.location.origin}
                className="justify-start"
              >
                <Globe className="h-4 w-4 mr-2" />
                Site Principal
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openSubdomain('demo1')}
                className="justify-start"
              >
                <Building2 className="h-4 w-4 mr-2" />
                demo1.site.com
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => openSubdomain('demo2')}
                className="justify-start"
              >
                <Building2 className="h-4 w-4 mr-2" />
                demo2.site.com
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};