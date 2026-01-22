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
import { formatBrasiliaDateTime, getBrasiliaDateTimeISO } from '@/lib/date-utils';
import { useSearchParams } from 'react-router-dom';
import BlingOrdersSyncPanel from './BlingOrdersSyncPanel';
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
  AlertTriangle
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
  bling_store_id: number | null;
  bling_store_name: string | null;
  created_at: string;
  updated_at: string;
}

interface BlingStore {
  id: number;
  descricao: string;
  tipo: string;
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
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [manualStoreId, setManualStoreId] = useState('');
  const [manualStoreName, setManualStoreName] = useState('');
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
        setStoreId(data.bling_store_id);
        setStoreName(data.bling_store_name);
        setManualStoreId(data.bling_store_id?.toString() || '');
        setManualStoreName(data.bling_store_name || '');
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

  // Query para buscar lojas do Bling
  const { data: blingStores, isLoading: storesLoading, refetch: refetchStores } = useQuery({
    queryKey: ['bling-stores', tenantId],
    queryFn: async () => {
      const response = await fetch(
        `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-list-stores`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );

      if (!response.ok) {
        console.error('Erro ao buscar lojas Bling');
        return [];
      }

      const data = await response.json();
      return (data.canais || []) as BlingStore[];
    },
    enabled: !!tenantId && !!integration?.access_token,
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
        bling_store_id: storeId,
        bling_store_name: storeName,
        updated_at: getBrasiliaDateTimeISO(),
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

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Webhook (opcional):</strong> Para receber atualizações do Bling automaticamente, configure no Bling esta URL de Webhook:<br />
              <code className="bg-muted px-2 py-1 rounded text-sm">
                https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-webhook
              </code>
              <br />
              <span className="text-sm text-muted-foreground mt-1 block">
                Eventos recomendados: pedido.atualizado, pedido.criado
              </span>
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
                        Token expira em: {formatBrasiliaDateTime(oauthStatus.expires_at)}
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

      {/* Alerta de erro de escopo/permissão */}
      {scopeError && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
              Erro de Permissão no Bling
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-red-800 dark:text-red-200">
              {scopeError}
            </p>
            <Alert className="border-red-400 bg-red-100 dark:bg-red-900">
              <Info className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200">
                <strong>Como resolver:</strong>
                <ol className="list-decimal ml-4 mt-2 space-y-1">
                  <li>Acesse o <a href="https://developer.bling.com.br/aplicativos" target="_blank" rel="noopener noreferrer" className="underline font-medium">Portal de Desenvolvedores do Bling</a></li>
                  <li>Edite seu aplicativo e adicione os escopos de <strong>Contatos</strong> e <strong>Vendas/Pedidos</strong> (leitura e escrita)</li>
                  <li>Salve as alterações no Bling</li>
                  <li>Clique em "Reautorizar Bling" abaixo para gerar um novo token com as permissões corretas</li>
                </ol>
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button
                onClick={() => authorizeMutation.mutate()}
                disabled={isAuthorizing || authorizeMutation.isPending}
                variant="destructive"
              >
                {isAuthorizing || authorizeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Key className="h-4 w-4 mr-2" />
                )}
                Reautorizar Bling
              </Button>
              <Button
                variant="outline"
                onClick={() => setScopeError(null)}
              >
                Fechar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuração da Loja Bling */}
      {isAuthorized && !isExpired && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Store className="h-5 w-5" />
              Canal de Venda (Loja)
            </CardTitle>
            <CardDescription>
              Vincule os pedidos a um canal de venda específico no Bling para facilitar a filtragem
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Entrada manual do ID */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                <Label className="font-medium">Configuração Manual</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Insira o ID e nome da loja diretamente (encontrado em Preferências → Integrações → Lojas Virtuais no Bling)
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manual_store_id">ID da Loja</Label>
                  <Input
                    id="manual_store_id"
                    type="text"
                    placeholder="Ex: 205905895"
                    value={manualStoreId}
                    onChange={(e) => setManualStoreId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual_store_name">Nome da Loja</Label>
                  <Input
                    id="manual_store_name"
                    type="text"
                    placeholder="Ex: OrderZap"
                    value={manualStoreName}
                    onChange={(e) => setManualStoreName(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={() => {
                  const id = manualStoreId ? Number(manualStoreId) : null;
                  const name = manualStoreName || null;
                  setStoreId(id);
                  setStoreName(name);
                  toast.success(`Loja "${name}" (ID: ${id}) será salva ao clicar em "Salvar Configuração"`);
                }}
                disabled={!manualStoreId}
                variant="outline"
                size="sm"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aplicar ID Manual
              </Button>
            </div>

            <Separator />

            {/* Seleção via API */}
            <div className="space-y-2">
              <Label>Ou selecione da lista de canais (via API)</Label>
              <div className="flex gap-2">
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={storeId || ''}
                  onChange={(e) => {
                    const selectedId = e.target.value ? Number(e.target.value) : null;
                    setStoreId(selectedId);
                    const selectedStore = blingStores?.find(s => s.id === selectedId);
                    setStoreName(selectedStore?.descricao || null);
                    setManualStoreId(selectedId?.toString() || '');
                    setManualStoreName(selectedStore?.descricao || '');
                  }}
                >
                  <option value="">Nenhum (não vincular)</option>
                  {blingStores?.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.descricao} ({store.tipo})
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => refetchStores()}
                  disabled={storesLoading}
                >
                  {storesLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {storeName && storeId && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Loja configurada: <strong>{storeName}</strong> (ID: {storeId})
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Quando configurado, todos os pedidos sincronizados serão vinculados a este canal de venda.
                Você poderá filtrar no Bling por "N° do pedido na loja virtual".
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Painel de Sincronização de Pedidos */}
      {isAuthorized && !isExpired && modules.sync_orders && (
        <BlingOrdersSyncPanel tenantId={tenantId} queryClient={queryClient} setScopeError={setScopeError} />
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
