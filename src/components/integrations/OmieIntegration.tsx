/**
 * Componente de integração com Omie ERP
 * Autenticação via App Key + App Secret (sem OAuth)
 * Permite configurar credenciais, testar conexão, selecionar empresa e módulos
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
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
  Upload,
  Download,
  Wifi,
  WifiOff,
  Building2,
  Store,
} from 'lucide-react';

interface OmieIntegrationProps {
  tenantId: string;
}

interface OmieIntegrationData {
  id: string;
  tenant_id: string;
  app_key: string | null;
  app_secret: string | null;
  sync_orders: boolean;
  sync_products: boolean;
  sync_stock: boolean;
  sync_invoices: boolean;
  environment: string;
  is_active: boolean;
  last_sync_at: string | null;
  omie_empresa_id: number | null;
  omie_empresa_nome: string | null;
  created_at: string;
  updated_at: string;
}

interface OmieEmpresa {
  codigo_empresa: number;
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  cidade: string;
  estado: string;
}

const SYNC_MODULES = [
  {
    key: 'sync_orders',
    label: 'Gestão de Pedidos',
    description: 'Enviar pedidos pagos para o Omie automaticamente',
    icon: ShoppingCart,
  },
  {
    key: 'sync_products',
    label: 'Produtos',
    description: 'Importar catálogo de produtos do Omie',
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

export default function OmieIntegration({ tenantId }: OmieIntegrationProps) {
  const queryClient = useQueryClient();
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [loadingStores, setLoadingStores] = useState(false);
  const [empresas, setEmpresas] = useState<OmieEmpresa[]>([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>('');
  const [modules, setModules] = useState<Record<string, boolean>>({
    sync_orders: true,
    sync_products: true,
    sync_stock: false,
    sync_invoices: false,
  });

  // Buscar integração existente
  const { data: integration, isLoading } = useQuery({
    queryKey: ['omie-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_omie' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const d = data as any;
        setAppKey(d.app_key || '');
        setAppSecret(d.app_secret || '');
        setSelectedEmpresaId(d.omie_empresa_id?.toString() || '');
        setModules({
          sync_orders: d.sync_orders,
          sync_products: d.sync_products,
          sync_stock: d.sync_stock,
          sync_invoices: d.sync_invoices,
        });
      }

      return data as OmieIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  // Carregar lojas quando tiver credenciais e integração
  const loadStores = async () => {
    if (!appKey || !appSecret) {
      toast.error('Preencha App Key e App Secret antes de buscar empresas');
      return;
    }

    setLoadingStores(true);
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/omie-list-stores`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId, app_key: appKey, app_secret: appSecret }),
        }
      );

      const data = await response.json();

      if (data.success && data.empresas) {
        setEmpresas(data.empresas);
        if (data.empresas.length === 0) {
          toast.info('Nenhuma empresa encontrada no Omie');
        } else {
          toast.success(`${data.empresas.length} empresa(s) encontrada(s)`);
        }
      } else {
        toast.error(data.error || 'Erro ao buscar empresas');
      }
    } catch (error) {
      toast.error('Erro ao buscar empresas do Omie');
    } finally {
      setLoadingStores(false);
    }
  };

  // Salvar credenciais
  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedEmpresa = empresas.find(e => e.codigo_empresa.toString() === selectedEmpresaId);
      
      const payload: any = {
        tenant_id: tenantId,
        app_key: appKey || null,
        app_secret: appSecret || null,
        sync_orders: modules.sync_orders,
        sync_products: modules.sync_products,
        sync_stock: modules.sync_stock,
        sync_invoices: modules.sync_invoices,
        updated_at: new Date().toISOString(),
      };

      if (integration?.id) {
        const { error } = await supabase
          .from('integration_omie' as any)
          .update(payload)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_omie' as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['omie-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['omie-status', tenantId] });
      toast.success('Configuração do Omie salva com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar integração Omie:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  // Testar conexão
  const testConnection = async () => {
    if (!appKey || !appSecret) {
      toast.error('Preencha App Key e App Secret antes de testar');
      return;
    }

    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/omie-test-connection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId, app_key: appKey, app_secret: appSecret }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setConnectionStatus('success');
        toast.success(`Conexão OK! Empresa: ${data.company_name || 'Identificada'}`);
        // Auto-carregar empresas após teste bem sucedido
        loadStores();
      } else {
        setConnectionStatus('error');
        toast.error(data.error || 'Falha na conexão com Omie');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Erro ao testar conexão');
    } finally {
      setTestingConnection(false);
    }
  };

  // Ativar/desativar
  const toggleActiveMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      if (!integration?.id) return;
      const { error } = await supabase
        .from('integration_omie' as any)
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: (_, newActive) => {
      queryClient.invalidateQueries({ queryKey: ['omie-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['omie-status', tenantId] });
      toast.success(newActive ? 'Omie ERP ativado!' : 'Omie ERP desativado');
    },
    onError: () => {
      toast.error('Erro ao alterar status da integração');
    },
  });

  // Sync pedidos
  const syncOrdersMutation = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/omie-sync-orders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Falha ao sincronizar pedidos');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['omie-integration', tenantId] });
      toast.success(`Pedidos sincronizados! ${data.synced || 0} pedido(s) processado(s).`);
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao sincronizar pedidos');
    },
  });

  // Sync produtos
  const syncProductsMutation = useMutation({
    mutationFn: async () => {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/omie-sync-products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        }
      );
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Falha ao sincronizar produtos');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['omie-integration', tenantId] });
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
  const hasCredentials = !!(appKey && appSecret);
  const selectedEmpresaNome = integration?.omie_empresa_nome || 
    empresas.find(e => e.codigo_empresa.toString() === selectedEmpresaId)?.nome_fantasia || '';

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
                <span className="text-2xl font-bold text-blue-600">Om</span>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Omie ERP
                  {integration?.is_active && hasCredentials ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Conectado
                    </Badge>
                  ) : hasCredentials ? (
                    <Badge variant="secondary" className="bg-orange-500 text-white">
                      <Key className="h-3 w-3 mr-1" />
                      Configurado (inativo)
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Não configurado
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Sistema ERP completo — Autenticação por App Key + App Secret
                  {selectedEmpresaNome && (
                    <span className="ml-2 text-primary font-medium">
                      • Empresa: {selectedEmpresaNome}
                    </span>
                  )}
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
                onClick={() => window.open('https://app.omie.com.br/api/portal/', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Portal API Omie
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Credenciais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Credenciais da API
          </CardTitle>
          <CardDescription>
            Obtenha suas credenciais no{' '}
            <a
              href="https://app.omie.com.br/api/portal/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Portal de API do Omie
            </a>
            . Registre um aplicativo e copie a App Key e App Secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="omie-app-key">App Key</Label>
              <Input
                id="omie-app-key"
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="omie-app-secret">App Secret</Label>
              <div className="relative">
                <Input
                  id="omie-app-secret"
                  type={showSecret ? 'text' : 'password'}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="abc123def456..."
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Credenciais
            </Button>

            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testingConnection || !hasCredentials}
            >
              {testingConnection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : connectionStatus === 'success' ? (
                <Wifi className="h-4 w-4 mr-2 text-green-600" />
              ) : connectionStatus === 'error' ? (
                <WifiOff className="h-4 w-4 mr-2 text-red-600" />
              ) : (
                <Wifi className="h-4 w-4 mr-2" />
              )}
              Testar Conexão
            </Button>
          </div>

          {connectionStatus === 'success' && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>Conexão com Omie estabelecida com sucesso!</AlertDescription>
            </Alert>
          )}

          {connectionStatus === 'error' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>Falha na conexão. Verifique suas credenciais.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Seleção de Empresa */}
      {hasCredentials && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Empresa / Loja
            </CardTitle>
            <CardDescription>
              Selecione para qual empresa do Omie os pedidos e produtos serão sincronizados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={loadStores}
                disabled={loadingStores}
              >
                {loadingStores ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Building2 className="h-4 w-4 mr-2" />
                )}
                Buscar Empresas do Omie
              </Button>
            </div>

            {empresas.length > 0 && (
              <div className="space-y-3">
                <Label>Selecione a empresa</Label>
                <Select
                  value={selectedEmpresaId}
                  onValueChange={setSelectedEmpresaId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma empresa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((emp) => (
                      <SelectItem key={emp.codigo_empresa} value={emp.codigo_empresa.toString()}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {emp.nome_fantasia || emp.razao_social}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {emp.cnpj && `CNPJ: ${emp.cnpj}`}
                            {emp.cidade && ` • ${emp.cidade}/${emp.estado}`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedEmpresaId && (
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    size="sm"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Empresa Selecionada
                  </Button>
                )}
              </div>
            )}

            {integration?.omie_empresa_nome && !empresas.length && (
              <Alert>
                <Building2 className="h-4 w-4" />
                <AlertDescription>
                  Empresa selecionada: <strong>{integration.omie_empresa_nome}</strong>
                  {integration.omie_empresa_id && ` (ID: ${integration.omie_empresa_id})`}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Módulos de sincronização */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Módulos de Sincronização
            <Badge variant="secondary">{activeModulesCount} ativo(s)</Badge>
          </CardTitle>
          <CardDescription>
            Selecione quais módulos deseja sincronizar entre o OrderZap e o Omie
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SYNC_MODULES.map((mod) => {
            const Icon = mod.icon;
            const isActive = modules[mod.key];
            return (
              <div
                key={mod.key}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="font-medium">{mod.label}</p>
                    <p className="text-sm text-muted-foreground">{mod.description}</p>
                  </div>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={() => toggleModule(mod.key)}
                />
              </div>
            );
          })}

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="mt-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Módulos
          </Button>
        </CardContent>
      </Card>

      {/* Ações de sincronização */}
      {integration?.is_active && hasCredentials && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Sincronização Manual
            </CardTitle>
            <CardDescription>
              Execute a sincronização manualmente quando necessário
              {integration.omie_empresa_nome && (
                <span className="ml-1">
                  — enviando para <strong>{integration.omie_empresa_nome}</strong>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modules.sync_orders && (
                <Button
                  variant="outline"
                  onClick={() => syncOrdersMutation.mutate()}
                  disabled={syncOrdersMutation.isPending}
                  className="justify-start"
                >
                  {syncOrdersMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Enviar Pedidos para Omie
                </Button>
              )}

              {modules.sync_products && (
                <Button
                  variant="outline"
                  onClick={() => syncProductsMutation.mutate()}
                  disabled={syncProductsMutation.isPending}
                  className="justify-start"
                >
                  {syncProductsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Importar Produtos do Omie
                </Button>
              )}
            </div>

            {integration.last_sync_at && (
              <p className="text-sm text-muted-foreground mt-4">
                Última sincronização: {new Date(integration.last_sync_at).toLocaleString('pt-BR')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Informações */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Como obter as credenciais:</strong> Acesse o{' '}
          <a
            href="https://app.omie.com.br/api/portal/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Portal de API do Omie
          </a>
          , crie um aplicativo e copie a <strong>App Key</strong> e <strong>App Secret</strong> geradas.
          Após salvar, clique em <strong>Buscar Empresas</strong> para selecionar a loja desejada.
        </AlertDescription>
      </Alert>
    </div>
  );
}
