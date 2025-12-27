/**
 * Componente de integração com Bling ERP
 * Permite configurar credenciais, autorizar via OAuth2 e selecionar módulos para sincronização
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { 
  Loader2, 
  Save, 
  CheckCircle2, 
  XCircle, 
  ShoppingCart, 
  Package, 
  FileText, 
  Store, 
  ShoppingBag, 
  Truck,
  ExternalLink,
  Info,
  Key,
  RefreshCw,
  AlertTriangle,
  Upload,
  Download
} from 'lucide-react';

interface BlingIntegrationProps {
  tenantId: string;
}

interface BlingIntegrationData {
  id: string;
  tenant_id: string;
  client_id: string | null;
  client_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  sync_orders: boolean;
  sync_products: boolean;
  sync_stock: boolean;
  sync_invoices: boolean;
  sync_marketplaces: boolean;
  sync_ecommerce: boolean;
  sync_logistics: boolean;
  environment: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface OAuthStatus {
  authorized: boolean;
  is_active: boolean;
  is_expired: boolean;
  expires_at: string | null;
}

const SYNC_MODULES = [
  {
    key: 'sync_orders',
    label: 'Gestão de Pedidos',
    description: 'Sincronizar pedidos do site, marketplaces e vendas manuais',
    icon: ShoppingCart,
  },
  {
    key: 'sync_products',
    label: 'Produtos',
    description: 'Sincronizar catálogo de produtos e variações',
    icon: Package,
  },
  {
    key: 'sync_stock',
    label: 'Controle de Estoque',
    description: 'Sincronizar estoque em tempo real',
    icon: Package,
  },
  {
    key: 'sync_invoices',
    label: 'Notas Fiscais',
    description: 'Emissão de NF-e e NFC-e',
    icon: FileText,
  },
  {
    key: 'sync_marketplaces',
    label: 'Marketplaces',
    description: 'Integração com Shopee, Mercado Livre, Magalu, Amazon, etc.',
    icon: Store,
  },
  {
    key: 'sync_ecommerce',
    label: 'E-commerces',
    description: 'Integração com Tray, Shopify, WooCommerce, Nuvemshop...',
    icon: ShoppingBag,
  },
  {
    key: 'sync_logistics',
    label: 'Logística',
    description: 'Integração com Correios, Melhor Envio, transportadoras',
    icon: Truck,
  },
] as const;

export default function BlingIntegration({ tenantId }: BlingIntegrationProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean>>({
    sync_orders: false,
    sync_products: false,
    sync_stock: false,
    sync_invoices: false,
    sync_marketplaces: false,
    sync_ecommerce: false,
    sync_logistics: false,
  });

  // Verificar resultado do callback OAuth
  useEffect(() => {
    const blingResult = searchParams.get('bling');
    const reason = searchParams.get('reason');

    if (blingResult === 'success') {
      toast.success('Bling ERP autorizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['bling-oauth-status', tenantId] });
      // Limpar query params
      window.history.replaceState({}, '', window.location.pathname);
    } else if (blingResult === 'error') {
      toast.error(`Erro na autorização do Bling: ${reason || 'Erro desconhecido'}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, tenantId, queryClient]);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['bling-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_bling')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        setClientId(data.client_id || '');
        setClientSecret(data.client_secret || '');
        setModules({
          sync_orders: data.sync_orders,
          sync_products: data.sync_products,
          sync_stock: data.sync_stock,
          sync_invoices: data.sync_invoices,
          sync_marketplaces: data.sync_marketplaces,
          sync_ecommerce: data.sync_ecommerce,
          sync_logistics: data.sync_logistics,
        });
      }
      
      return data as BlingIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Verificar status OAuth
  const { data: oauthStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['bling-oauth-status', tenantId],
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-oauth?action=status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Erro ao verificar status OAuth:', errorData);
        throw new Error('Falha ao verificar status OAuth');
      }

      return await response.json() as OAuthStatus;
    },
    enabled: !!tenantId && !!integration,
    refetchInterval: 30000, // Verificar a cada 30 segundos
  });

  // Mutation para salvar/atualizar credenciais
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        client_id: clientId || null,
        client_secret: clientSecret || null,
        sync_orders: modules.sync_orders,
        sync_products: modules.sync_products,
        sync_stock: modules.sync_stock,
        sync_invoices: modules.sync_invoices,
        sync_marketplaces: modules.sync_marketplaces,
        sync_ecommerce: modules.sync_ecommerce,
        sync_logistics: modules.sync_logistics,
        updated_at: new Date().toISOString(),
      };

      if (integration?.id) {
        const { error } = await supabase
          .from('integration_bling')
          .update(payload)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_bling')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
      toast.success('Credenciais do Bling salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar integração Bling:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  // Mutation para iniciar OAuth
  const authorizeMutation = useMutation({
    mutationFn: async () => {
      setIsAuthorizing(true);

      const response = await fetch(
        `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-oauth?action=authorize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao gerar URL de autorização');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      if (data.authorization_url) {
        // Redirecionar para a página de autorização do Bling
        window.location.href = data.authorization_url;
      }
    },
    onError: (error) => {
      setIsAuthorizing(false);
      console.error('Erro ao iniciar autorização:', error);
      toast.error(error.message || 'Erro ao iniciar autorização');
    },
  });

  // Mutation para renovar token
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-oauth?action=refresh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao renovar token');
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bling-oauth-status', tenantId] });
      toast.success('Token renovado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao renovar token:', error);
      toast.error(error.message || 'Erro ao renovar token');
    },
  });

  // Toggle módulo
  const toggleModule = (key: string) => {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Contagem de módulos ativos
  const activeModulesCount = Object.values(modules).filter(Boolean).length;

  // Verificar se as credenciais estão preenchidas
  const hasCredentials = !!(clientId && clientSecret);
  const isAuthorized = oauthStatus?.authorized;
  const isExpired = oauthStatus?.is_expired;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-blue-600">B</span>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Bling ERP
                  {isAuthorized && !isExpired ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Autorizado
                    </Badge>
                  ) : isAuthorized && isExpired ? (
                    <Badge variant="secondary" className="bg-yellow-600 text-white">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Token Expirado
                    </Badge>
                  ) : hasCredentials ? (
                    <Badge variant="secondary" className="bg-orange-500 text-white">
                      <Key className="h-3 w-3 mr-1" />
                      Aguardando Autorização
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Não configurado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Sistema de gestão empresarial completo
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://developer.bling.com.br/aplicativos', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Portal Bling
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais da API</CardTitle>
          <CardDescription>
            Obtenha suas credenciais no{' '}
            <a 
              href="https://developer.bling.com.br/aplicativos" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Portal de Desenvolvedores do Bling
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                type="text"
                placeholder="Seu Client ID do Bling"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_secret">Client Secret</Label>
              <Input
                id="client_secret"
                type="password"
                placeholder="Seu Client Secret do Bling"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Ao criar o aplicativo no Bling, configure a URL de Callback como:<br />
              <code className="bg-muted px-2 py-1 rounded text-sm">
                https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-oauth-callback
              </code>
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !clientId || !clientSecret}
              variant="outline"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Credenciais
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Autorização OAuth */}
      {hasCredentials && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Autorização OAuth2</CardTitle>
            <CardDescription>
              Autorize o acesso ao Bling para sincronizar dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAuthorized && !isExpired ? (
              <div className="space-y-4">
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    <strong>Conectado!</strong> A integração com o Bling está ativa.
                    {oauthStatus?.expires_at && (
                      <span className="block text-sm mt-1">
                        Token expira em: {new Date(oauthStatus.expires_at).toLocaleString('pt-BR')}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                    variant="outline"
                  >
                    {refreshMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Renovar Token
                  </Button>
                  <Button
                    onClick={() => authorizeMutation.mutate()}
                    disabled={isAuthorizing || authorizeMutation.isPending}
                    variant="outline"
                  >
                    {isAuthorizing || authorizeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4 mr-2" />
                    )}
                    Reautorizar
                  </Button>
                </div>
              </div>
            ) : isAuthorized && isExpired ? (
              <div className="space-y-4">
                <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                    <strong>Token Expirado!</strong> O token de acesso expirou. Renove ou reautorize.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button
                    onClick={() => refreshMutation.mutate()}
                    disabled={refreshMutation.isPending}
                  >
                    {refreshMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Renovar Token
                  </Button>
                  <Button
                    onClick={() => authorizeMutation.mutate()}
                    disabled={isAuthorizing || authorizeMutation.isPending}
                    variant="outline"
                  >
                    {isAuthorizing || authorizeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Key className="h-4 w-4 mr-2" />
                    )}
                    Reautorizar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <Key className="h-4 w-4" />
                  <AlertDescription>
                    Clique no botão abaixo para autorizar o acesso ao Bling. Você será redirecionado 
                    para o site do Bling para confirmar a autorização.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={() => authorizeMutation.mutate()}
                  disabled={isAuthorizing || authorizeMutation.isPending}
                  size="lg"
                >
                  {isAuthorizing || authorizeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Autorizar Bling ERP
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Painel de Sincronização de Pedidos */}
      {isAuthorized && !isExpired && modules.sync_orders && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Sincronização de Pedidos
            </CardTitle>
            <CardDescription>
              Envie pedidos do sistema para o Bling ou busque pedidos do Bling
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Enviar todos os pedidos pagos */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  <h4 className="font-medium">Exportar para Bling</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Envia todos os pedidos pagos para o Bling ERP. Útil para sincronizar pedidos existentes.
                </p>
                <Button
                  onClick={async () => {
                    try {
                      toast.info('Iniciando sincronização...');
                      const session = await supabase.auth.getSession();
                      const response = await fetch(
                        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-sync-orders',
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.data.session?.access_token}`,
                          },
                          body: JSON.stringify({
                            action: 'sync_all',
                            tenant_id: tenantId,
                          }),
                        }
                      );
                      
                      const result = await response.json();
                      
                      if (!response.ok) {
                        throw new Error(result.error || 'Erro ao sincronizar');
                      }
                      
                      if (result.success) {
                        const data = result.data;
                        toast.success(`Sincronização concluída! ${data.synced} pedido(s) enviado(s), ${data.failed} falha(s).`);
                        queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
                      } else {
                        throw new Error(result.error || 'Erro desconhecido');
                      }
                    } catch (error: any) {
                      console.error('Erro ao sincronizar pedidos:', error);
                      toast.error(error.message || 'Erro ao sincronizar pedidos');
                    }
                  }}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar Pedidos Pagos
                </Button>
              </div>

              {/* Buscar pedidos do Bling */}
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  <h4 className="font-medium">Importar do Bling</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Busca os últimos pedidos cadastrados no Bling para visualização.
                </p>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      toast.info('Buscando pedidos do Bling...');
                      const session = await supabase.auth.getSession();
                      const response = await fetch(
                        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-sync-orders',
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session.data.session?.access_token}`,
                          },
                          body: JSON.stringify({
                            action: 'fetch_orders',
                            tenant_id: tenantId,
                          }),
                        }
                      );
                      
                      const result = await response.json();
                      
                      if (!response.ok) {
                        throw new Error(result.error || 'Erro ao buscar pedidos');
                      }
                      
                      if (result.success) {
                        const orders = result.data?.data || [];
                        toast.success(`${orders.length} pedido(s) encontrado(s) no Bling`);
                        console.log('Pedidos do Bling:', orders);
                      } else {
                        throw new Error(result.error || 'Erro desconhecido');
                      }
                    } catch (error: any) {
                      console.error('Erro ao buscar pedidos:', error);
                      toast.error(error.message || 'Erro ao buscar pedidos do Bling');
                    }
                  }}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Buscar Pedidos do Bling
                </Button>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Dica:</strong> A sincronização automática envia até 50 pedidos pagos por vez.
                Para enviar um pedido específico, use o botão na página de pedidos.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Módulos de Sincronização */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Módulos de Integração</span>
            <Badge variant="outline">
              {activeModulesCount} de {SYNC_MODULES.length} ativos
            </Badge>
          </CardTitle>
          <CardDescription>
            Selecione quais funcionalidades você deseja sincronizar com o Bling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {SYNC_MODULES.map((module, index) => (
              <div key={module.key}>
                {index > 0 && <Separator className="my-4" />}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                      <module.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <Label htmlFor={module.key} className="text-base font-medium cursor-pointer">
                        {module.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {module.description}
                      </p>
                    </div>
                  </div>
                  <Switch
                    id={module.key}
                    checked={modules[module.key]}
                    onCheckedChange={() => toggleModule(module.key)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Última sincronização */}
      {integration?.last_sync_at && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>
            Última sincronização: {new Date(integration.last_sync_at).toLocaleString('pt-BR')}
          </AlertDescription>
        </Alert>
      )}

      {/* Botão de salvar módulos */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          size="lg"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configuração
        </Button>
      </div>
    </div>
  );
}
