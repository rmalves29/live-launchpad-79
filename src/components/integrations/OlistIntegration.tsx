/**
 * Componente de integração com Olist ERP (antigo Tiny ERP)
 * Permite configurar credenciais, autorizar via OAuth2 e selecionar módulos para sincronização
 * Segue o mesmo padrão do BlingIntegration.tsx
 */

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
  ExternalLink,
  Info,
  Key,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface OlistIntegrationProps {
  tenantId: string;
}

interface OlistIntegrationData {
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
    description: 'Sincronizar pedidos do Olist ERP com o sistema',
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
    description: 'Emissão e consulta de NF-e',
    icon: FileText,
  },
] as const;

const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

export default function OlistIntegration({ tenantId }: OlistIntegrationProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean>>({
    sync_orders: true,
    sync_products: true,
    sync_stock: false,
    sync_invoices: true,
  });

  // Verificar resultado do callback OAuth
  useEffect(() => {
    const olistResult = searchParams.get('olist');
    const reason = searchParams.get('reason');

    if (olistResult === 'success') {
      toast.success('Olist ERP autorizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['olist-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['olist-oauth-status', tenantId] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (olistResult === 'error') {
      toast.error(`Erro na autorização do Olist: ${reason || 'Erro desconhecido'}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams, tenantId, queryClient]);

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['olist-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_olist' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setClientId((data as any).client_id || '');
        setClientSecret((data as any).client_secret || '');
        setModules({
          sync_orders: (data as any).sync_orders,
          sync_products: (data as any).sync_products,
          sync_stock: (data as any).sync_stock,
          sync_invoices: (data as any).sync_invoices,
        });
      }

      return data as OlistIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Verificar status OAuth
  const { data: oauthStatus } = useQuery({
    queryKey: ['olist-oauth-status', tenantId],
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/olist-oauth?action=status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );

      if (!response.ok) throw new Error('Falha ao verificar status OAuth');
      return await response.json() as OAuthStatus;
    },
    enabled: !!tenantId && !!integration,
    refetchInterval: 30000,
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
        updated_at: new Date().toISOString(),
      };

      if (integration?.id) {
        const { error } = await supabase
          .from('integration_olist' as any)
          .update(payload)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_olist' as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['olist-integration', tenantId] });
      toast.success('Credenciais do Olist salvas com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar integração Olist:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  // Mutation para iniciar OAuth
  const authorizeMutation = useMutation({
    mutationFn: async () => {
      setIsAuthorizing(true);
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/olist-oauth?action=authorize`,
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
        `${SUPABASE_URL}/functions/v1/olist-oauth?action=refresh`,
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
      queryClient.invalidateQueries({ queryKey: ['olist-oauth-status', tenantId] });
      toast.success('Token renovado com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao renovar token:', error);
      toast.error(error.message || 'Erro ao renovar token');
    },
  });

  // Mutation para ativar/desativar
  const toggleActiveMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      if (!integration?.id) return;
      const { error } = await supabase
        .from('integration_olist' as any)
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: (_, newActive) => {
      queryClient.invalidateQueries({ queryKey: ['olist-integration', tenantId] });
      toast.success(newActive ? 'Olist ERP ativado!' : 'Olist ERP desativado');
    },
    onError: () => {
      toast.error('Erro ao alterar status da integração');
    },
  });

  // Mutation para sync de pedidos
  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/olist-sync-orders`,
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
        throw new Error(errorData.error || 'Falha ao sincronizar pedidos');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['olist-integration', tenantId] });
      toast.success(`Pedidos sincronizados! ${data.synced || 0} pedido(s) processado(s).`);
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao sincronizar pedidos');
    },
  });

  // Mutation para sync de produtos
  const syncProductsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/olist-sync-products`,
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
        throw new Error(errorData.error || 'Falha ao sincronizar produtos');
      }

      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['olist-integration', tenantId] });
      toast.success(`Produtos sincronizados! ${data.synced || 0} produto(s) processado(s).`);
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao sincronizar produtos');
    },
  });

  const toggleModule = (key: string) => {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const activeModulesCount = Object.values(modules).filter(Boolean).length;
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
              <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-orange-600">O</span>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Olist ERP
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
                  Sistema ERP completo (antigo Tiny ERP) — API v3
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {integration && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {integration.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  <Switch
                    checked={integration.is_active}
                    onCheckedChange={(checked) => toggleActiveMutation.mutate(checked)}
                    disabled={toggleActiveMutation.isPending}
                  />
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('https://erp.tiny.com.br/configuracoes#tabGeral', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Painel Olist
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Credenciais da API</CardTitle>
          <CardDescription>
            Crie um aplicativo em{' '}
            <a
              href="https://erp.tiny.com.br/configuracoes#tabGeral"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Olist ERP → Configurações → Aplicativos
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="olist_client_id">Client ID</Label>
              <Input
                id="olist_client_id"
                type="text"
                placeholder="Seu Client ID do Olist"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="olist_client_secret">Client Secret</Label>
              <div className="relative">
                <Input
                  id="olist_client_secret"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Seu Client Secret do Olist"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> Ao criar o aplicativo no Olist ERP, configure a URL de Redirecionamento como:<br />
              <code className="bg-muted px-2 py-1 rounded text-sm">
                {SUPABASE_URL}/functions/v1/olist-oauth-callback
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
              Autorize o acesso ao Olist ERP para sincronizar dados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAuthorized && !isExpired ? (
              <div className="space-y-4">
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 dark:text-green-200">
                    <strong>Conectado!</strong> A integração com o Olist ERP está ativa.
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
                    <strong>Token Expirado!</strong> O token de acesso expirou (validade: 4h). Renove ou reautorize.
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
                    Clique no botão abaixo para autorizar o acesso ao Olist ERP. Você será redirecionado
                    para o site do Olist para confirmar a autorização.
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
                  Autorizar Olist ERP
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sincronização Manual */}
      {isAuthorized && !isExpired && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sincronização Manual</CardTitle>
            <CardDescription>
              Sincronize pedidos e produtos manualmente com o Olist ERP
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {modules.sync_orders && (
                <Button
                  onClick={() => syncOrdersMutation.mutate()}
                  disabled={syncOrdersMutation.isPending}
                  variant="outline"
                >
                  {syncOrdersMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ShoppingCart className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar Pedidos
                </Button>
              )}
              {modules.sync_products && (
                <Button
                  onClick={() => syncProductsMutation.mutate()}
                  disabled={syncProductsMutation.isPending}
                  variant="outline"
                >
                  {syncProductsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar Produtos
                </Button>
              )}
            </div>
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
            Selecione quais funcionalidades você deseja sincronizar com o Olist ERP
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
          <CheckCircle2 className="h-4 w-4 text-primary" />
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
