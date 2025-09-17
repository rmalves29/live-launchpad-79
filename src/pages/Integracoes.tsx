import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, ExternalLink, AlertCircle, CheckCircle, Clock, X, Copy } from "lucide-react";
import { CallbackInfo } from "@/components/CallbackInfo";

interface WebhookLog {
  id: string;
  webhook_type: string;
  status_code: number;
  error_message?: string;
  payload: any;
  response?: string;
  created_at: string;
  tenant_id?: string;
}

interface OrderIntegration {
  id: number;
  customer_name?: string;
  customer_phone: string;
  total_amount: number;
  created_at: string;
  is_paid: boolean;
  tenant_id: string;
  bling_status?: string;
  melhor_envio_status?: string;
  bling_logs: WebhookLog[];
  me_logs: WebhookLog[];
}

export default function Integracoes() {
  const [orders, setOrders] = useState<OrderIntegration[]>([]);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryLoading, setRetryLoading] = useState<{ [key: number]: boolean }>({});
  const [blingIntegration, setBlingIntegration] = useState<any>(null);
  const [tenantId, setTenantId] = useState('08f2b1b9-3988-489e-8186-c60f0c0b0622');
  const [allTenants, setAllTenants] = useState<any[]>([]);
  const [replicating, setReplicating] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      // Carregar integração Bling
      const { data: blingData, error: blingError } = await supabase
        .from('bling_integrations')
        .select('*')
        .single();
      
      if (!blingError && blingData) {
        setBlingIntegration(blingData);
      }

      // Carregar todos os tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');

      if (!tenantsError && tenantsData) {
        setAllTenants(tenantsData);
      }

      // Carregar pedidos pagos
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('is_paid', true)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Carregar logs de webhook
      const { data: logsData, error: logsError } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsError) throw logsError;

      // Processar dados
      const processedOrders = ordersData?.map(order => {
        const blingLogs = logsData?.filter(log => 
          log.webhook_type === 'bling' && 
          (log.payload as any)?.order_id === order.id
        ) || [];
        
        const meLogs = logsData?.filter(log => 
          log.webhook_type === 'melhor_envio' && 
          (log.payload as any)?.order_id === order.id
        ) || [];

        return {
          ...order,
          bling_status: getBlingStatus(blingLogs),
          melhor_envio_status: getMelhorEnvioStatus(meLogs),
          bling_logs: blingLogs,
          me_logs: meLogs
        };
      }) || [];

      setOrders(processedOrders);
      setLogs(logsData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados das integrações.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getBlingStatus = (logs: WebhookLog[]) => {
    if (!logs.length) return 'pending';
    const lastLog = logs[0];
    if (lastLog.status_code === 200) return 'success';
    if (lastLog.status_code >= 400) return 'error';
    return 'processing';
  };

  const getMelhorEnvioStatus = (logs: WebhookLog[]) => {
    if (!logs.length) return 'pending';
    const lastLog = logs[0];
    if (lastLog.status_code === 200) return 'success';
    if (lastLog.status_code >= 400) return 'error';
    return 'processing';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Erro</Badge>;
      case 'processing':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Processando</Badge>;
      case 'pending':
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Pendente</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const retryIntegration = async (orderId: number, type: 'bling' | 'melhor_envio') => {
    setRetryLoading(prev => ({ ...prev, [orderId]: true }));
    
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) throw new Error('Pedido não encontrado');

      const functionName = type === 'bling' ? 'bling-integration' : 'melhor-envio-labels';
      const action = type === 'bling' ? 'create_order' : 'create_shipment';

      const { error } = await supabase.functions.invoke(functionName, {
        body: {
          action,
          order_id: orderId,
          customer_phone: order.customer_phone,
          tenant_id: order.tenant_id
        }
      });

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: `Integração ${type} reenviada com sucesso.`,
      });

      // Recarregar dados após alguns segundos
      setTimeout(() => {
        loadData();
      }, 2000);

    } catch (error) {
      console.error(`Erro ao reenviar ${type}:`, error);
      toast({
        title: "Erro",
        description: `Erro ao reenviar integração ${type}.`,
        variant: "destructive",
      });
    } finally {
      setRetryLoading(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const refreshBlingToken = async () => {
    try {
      toast({
        title: "Renovando token...",
        description: "Renovando token de acesso do Bling",
      });
      
      const { error } = await supabase.functions.invoke('bling-oauth', {
        body: {
          action: 'refresh_token',
          tenant_id: '08f2b1b9-3988-489e-8186-c60f0c0b0622'
        }
      });
      
      if (error) {
        console.error('Erro ao renovar token:', error);
        toast({
          title: "Erro",
          description: `Erro ao renovar token: ${error.message}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sucesso!",
          description: "Token do Bling renovado com sucesso!",
        });
        // Recarregar dados para atualizar status
        setTimeout(() => loadData(), 1000);
      }
    } catch (error) {
      console.error('Erro ao renovar token:', error);
      toast({
        title: "Erro",
        description: "Erro ao renovar token do Bling",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadData();
    
    // Verificar se houve sucesso na integração Bling
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('bling') === 'ok') {
      toast({
        title: "Sucesso!",
        description: "Integração com Bling configurada com sucesso.",
        variant: "default",
      });
      
      // Limpar parâmetro da URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [toast]);

  const generateBlingAuthUrl = (tenantId: string) => {
    const clientId = 'd1f9ca5c5ceb91ca4c1e81c037b4e6b5ac4f2f1f';
    const redirectUri = 'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa';
    const state = tenantId;
    
    return `https://api.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  };

  const copyBlingAuthUrl = (tenantId: string) => {
    const url = generateBlingAuthUrl(tenantId);
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copiado!",
      description: "Link de autorização Bling copiado para a área de transferência.",
      variant: "default",
    });
  };

  const openBlingAuth = () => {
    if (!tenantId.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, insira um Tenant ID válido.",
        variant: "destructive",
      });
      return;
    }
    window.open(generateBlingAuthUrl(tenantId.trim()), '_blank');
  };

  const copyBlingAuth = () => {
    if (!tenantId.trim()) {
      toast({
        title: "Erro", 
        description: "Por favor, insira um Tenant ID válido.",
        variant: "destructive",
      });
      return;
    }
    copyBlingAuthUrl(tenantId.trim());
  };

  const replicateBlingToAllTenants = async () => {
    if (!blingIntegration) {
      toast({
        title: "Erro",
        description: "Nenhuma configuração Bling encontrada para replicar.",
        variant: "destructive",
      });
      return;
    }

    setReplicating(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const tenant of allTenants) {
        try {
          const { error } = await supabase
            .from('bling_integrations')
            .upsert({
              tenant_id: tenant.id,
              client_id: blingIntegration.client_id,
              client_secret: blingIntegration.client_secret,
              access_token: blingIntegration.access_token,
              refresh_token: blingIntegration.refresh_token,
              environment: blingIntegration.environment,
              token_type: blingIntegration.token_type,
              is_active: true,
              updated_at: new Date().toISOString()
            });

          if (error) {
            console.error(`Erro ao replicar para ${tenant.name}:`, error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (error) {
          console.error(`Erro ao replicar para ${tenant.name}:`, error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: "Sucesso!",
          description: `Configuração Bling replicada para ${successCount} empresa(s). ${errorCount > 0 ? `${errorCount} erro(s).` : ''}`,
          variant: successCount === allTenants.length ? "default" : "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Não foi possível replicar para nenhuma empresa.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erro geral ao replicar:', error);
      toast({
        title: "Erro",
        description: "Erro geral ao replicar configurações.",
        variant: "destructive",
      });
    } finally {
      setReplicating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Integrações</h1>
          <p className="text-muted-foreground">
            Acompanhe o status das integrações com Bling e Melhor Envio
          </p>
        </div>
        <Button onClick={loadData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Seção de Configuração Bling */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Configuração Bling</span>
            {blingIntegration?.access_token ? (
              <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                Conectado
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">
                <AlertCircle className="w-3 h-3 mr-1" />
                Não conectado
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure a integração com o Bling para sincronização de pedidos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Link de Autorização para Tenant:</h4>
            <div className="space-y-3">
              <div>
                <label htmlFor="tenantId" className="text-sm font-medium mb-1 block">
                  Tenant ID:
                </label>
                <input
                  id="tenantId"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="Digite o Tenant ID"
                  className="w-full p-2 border rounded-md text-sm font-mono bg-background"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={openBlingAuth}
                  className="flex items-center gap-2"
                  disabled={!tenantId.trim()}
                >
                  <ExternalLink className="w-4 h-4" />
                  Autorizar Bling
                </Button>
                <Button 
                  variant="outline"
                  onClick={copyBlingAuth}
                  disabled={!tenantId.trim()}
                >
                  Copiar Link
                </Button>
                <Button 
                  variant="secondary"
                  onClick={refreshBlingToken}
                  disabled={!blingIntegration?.refresh_token}
                >
                  Renovar Token
                </Button>
                {blingIntegration && allTenants.length > 0 && (
                  <Button 
                    variant="secondary"
                    onClick={replicateBlingToAllTenants}
                    disabled={replicating}
                    className="flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    {replicating ? 'Replicando...' : `Replicar p/ ${allTenants.length} Empresas`}
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {blingIntegration?.access_token && (
            <div className="text-sm text-muted-foreground">
              <p>✓ Token de acesso configurado</p>
              <p>✓ Ambiente: {blingIntegration.environment}</p>
              {blingIntegration.expires_at && (
                <p>⏰ Expira em: {new Date(blingIntegration.expires_at).toLocaleString('pt-BR')}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="callbacks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="callbacks">URLs de Callback</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="logs">Logs Detalhados</TabsTrigger>
        </TabsList>

        <TabsContent value="callbacks">
          <CallbackInfo />
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Status das Integrações por Pedido</CardTitle>
              <CardDescription>
                Acompanhe o status de cada integração para pedidos pagos
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Bling</TableHead>
                    <TableHead>Melhor Envio</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customer_name || 'N/A'}</div>
                          <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
                        </div>
                      </TableCell>
                      <TableCell>R$ {order.total_amount?.toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(order.bling_status || 'pending')}</TableCell>
                      <TableCell>{getStatusBadge(order.melhor_envio_status || 'pending')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryIntegration(order.id, 'bling')}
                            disabled={retryLoading[order.id]}
                          >
                            {retryLoading[order.id] ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              'Bling'
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryIntegration(order.id, 'melhor_envio')}
                            disabled={retryLoading[order.id]}
                          >
                            {retryLoading[order.id] ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              'M. Envio'
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Logs Detalhados</CardTitle>
              <CardDescription>
                Logs completos de todas as integrações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Resposta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {log.webhook_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.status_code === 200 ? "default" : "destructive"}>
                          {log.status_code}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        #{(log.payload as any)?.order_id || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {log.error_message && (
                          <span className="text-red-500 text-sm">
                            {log.error_message.substring(0, 50)}...
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.response && (
                          <Button size="sm" variant="ghost">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}