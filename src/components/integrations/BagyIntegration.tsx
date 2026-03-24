/**
 * Componente de integração com Bagy (Dooca Commerce)
 * Permite configurar Bearer Token, testar conexão, exportar pedidos,
 * importar produtos e sincronizar estoque
 */

import { useState } from 'react';
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
import { toast } from 'sonner';
import {
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Info,
  RefreshCw,
  ShoppingCart,
  Package,
  Wifi,
  Download,
} from 'lucide-react';

interface BagyIntegrationProps {
  tenantId: string;
}

interface BagyIntegrationData {
  id: string;
  tenant_id: string;
  access_token: string | null;
  is_active: boolean;
  sync_orders_out: boolean;
  sync_stock: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';

async function callBagySync(tenantId: string, action: string) {
  const session = await supabase.auth.getSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/bagy-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.data.session?.access_token}`,
    },
    body: JSON.stringify({ tenant_id: tenantId, action }),
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error || 'Falha na operação');
  return data;
}

export default function BagyIntegration({ tenantId }: BagyIntegrationProps) {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [syncOrdersOut, setSyncOrdersOut] = useState(true);
  const [syncStock, setSyncStock] = useState(true);

  const { data: integration, isLoading } = useQuery({
    queryKey: ['bagy-integration', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_bagy' as any)
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setAccessToken((data as any).access_token || '');
        setSyncOrdersOut((data as any).sync_orders_out ?? true);
        setSyncStock((data as any).sync_stock ?? true);
      }
      return data as BagyIntegrationData | null;
    },
    enabled: !!tenantId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        access_token: accessToken || null,
        sync_orders_out: syncOrdersOut,
        sync_stock: syncStock,
        updated_at: new Date().toISOString(),
      };
      if (integration?.id) {
        const { error } = await supabase
          .from('integration_bagy' as any)
          .update(payload)
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('integration_bagy' as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bagy-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['bagy-status', tenantId] });
      toast.success('Configuração da Bagy salva com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao salvar integração Bagy:', error);
      toast.error('Erro ao salvar configuração');
    },
  });

  const testMutation = useMutation({
    mutationFn: () => callBagySync(tenantId, 'test_connection'),
    onSuccess: (data) => toast.success(data.message || 'Conexão estabelecida!'),
    onError: (error) => toast.error(error.message || 'Erro ao testar conexão'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      if (!integration?.id) return;
      const { error } = await supabase
        .from('integration_bagy' as any)
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('id', integration.id);
      if (error) throw error;
    },
    onSuccess: (_, newActive) => {
      queryClient.invalidateQueries({ queryKey: ['bagy-integration', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['bagy-status', tenantId] });
      toast.success(newActive ? 'Bagy ativada!' : 'Bagy desativada');
    },
    onError: () => toast.error('Erro ao alterar status'),
  });

  const syncStockMutation = useMutation({
    mutationFn: () => callBagySync(tenantId, 'sync_stock'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bagy-integration', tenantId] });
      toast.success(data.message || 'Estoque sincronizado!');
    },
    onError: (error) => toast.error(error.message || 'Erro ao sincronizar estoque'),
  });

  const syncProductsMutation = useMutation({
    mutationFn: () => callBagySync(tenantId, 'sync_products'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bagy-integration', tenantId] });
      toast.success(data.message || 'Produtos importados!');
    },
    onError: (error) => toast.error(error.message || 'Erro ao importar produtos'),
  });

  const exportOrdersMutation = useMutation({
    mutationFn: () => callBagySync(tenantId, 'export_pending_orders'),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bagy-integration', tenantId] });
      toast.success(data.message || 'Pedidos exportados!');
    },
    onError: (error) => toast.error(error.message || 'Erro ao exportar pedidos'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <span className="text-2xl font-bold text-purple-600">B</span>
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Bagy (Dooca Commerce)
                  {integration?.is_active ? (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ativa
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" />
                      Inativa
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Exporte pedidos automaticamente ao pagar, importe produtos e sincronize estoque
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
                onClick={() => window.open('https://painel.bagy.com.br', '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Painel Bagy
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Token de Acesso */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Token de Acesso (Bearer)</CardTitle>
          <CardDescription>
            Gere o token no painel da Bagy em Configurações → API / Integrações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bagy-token">Bearer Token</Label>
            <div className="relative">
              <Input
                id="bagy-token"
                type={showToken ? 'text' : 'password'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Cole aqui o token gerado no painel da Bagy"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !accessToken}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !accessToken}
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4 mr-2" />
              )}
              Testar Conexão
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Módulos de Sincronização */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Módulos de Sincronização</CardTitle>
          <CardDescription>
            Configure quais funcionalidades devem ser sincronizadas com a Bagy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Exportar Pedidos Automaticamente</p>
                <p className="text-sm text-muted-foreground">
                  Ao marcar um pedido como pago no OrderZap, ele é enviado automaticamente para a Bagy
                </p>
              </div>
            </div>
            <Switch checked={syncOrdersOut} onCheckedChange={setSyncOrdersOut} />
          </div>

          {!syncOrdersOut && (
            <div className="p-3 border rounded-lg bg-muted/50 space-y-2">
              <p className="text-sm text-muted-foreground">
                A exportação automática está desativada. Use o botão abaixo para exportar pedidos pagos pendentes manualmente.
              </p>
              <Button
                onClick={() => exportOrdersMutation.mutate()}
                disabled={exportOrdersMutation.isPending || !integration?.is_active}
                variant="default"
              >
                {exportOrdersMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-2" />
                )}
                Exportar Pedidos Pagos para Bagy
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Abater Estoque</p>
                <p className="text-sm text-muted-foreground">
                  Abater estoque na Bagy ao exportar pedidos (por SKU/código)
                </p>
              </div>
            </div>
            <Switch checked={syncStock} onCheckedChange={setSyncStock} />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              O mapeamento de produtos é feito pelo <strong>código/SKU</strong>. Certifique-se de que
              os códigos dos produtos no OrderZap correspondem aos SKUs (reference) na Bagy.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Ações Manuais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ações Manuais</CardTitle>
          <CardDescription>
            Execute sincronizações manuais com a Bagy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => syncProductsMutation.mutate()}
              disabled={syncProductsMutation.isPending || !integration?.is_active}
            >
              {syncProductsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Importar Produtos da Bagy
            </Button>
            <Button
              variant="outline"
              onClick={() => syncStockMutation.mutate()}
              disabled={syncStockMutation.isPending || !integration?.is_active}
            >
              {syncStockMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar Estoque
            </Button>
          </div>

          {integration?.last_sync_at && (
            <p className="text-sm text-muted-foreground">
              Última sincronização:{' '}
              {new Date(integration.last_sync_at).toLocaleString('pt-BR')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
