import { useState } from 'react';
import { useQuery, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Loader2, 
  ShoppingCart, 
  Upload,
  Download,
  Info,
  CheckCircle2
} from 'lucide-react';

interface BlingOrdersSyncPanelProps {
  tenantId: string;
  queryClient: QueryClient;
  setScopeError: (error: string | null) => void;
}

export default function BlingOrdersSyncPanel({ tenantId, queryClient, setScopeError }: BlingOrdersSyncPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  // Buscar contagem de pedidos pendentes de sincronização
  const { data: pendingCount, refetch: refetchPending } = useQuery({
    queryKey: ['bling-pending-orders', tenantId],
    queryFn: async () => {
      // Primeiro tenta com bling_order_id (se a coluna existir)
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .is('bling_order_id', null);
      
      if (error) {
        // Se a coluna não existe, retorna contagem de todos os pagos
        console.log('bling_order_id column may not exist, counting all paid orders');
        const { count: totalPaid } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_paid', true);
        return totalPaid || 0;
      }
      
      return count || 0;
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // Buscar contagem de pedidos já sincronizados
  const { data: syncedCount } = useQuery({
    queryKey: ['bling-synced-orders', tenantId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .not('bling_order_id', 'is', null);
      
      if (error) {
        return 0;
      }
      
      return count || 0;
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      setScopeError(null);
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
        // Check for scope errors in failed items
        const scopeIssue = data.details?.find((d: any) => 
          d.error?.includes('escopo') || d.error?.includes('scope') || d.error?.includes('permissão')
        );
        if (scopeIssue) {
          setScopeError(scopeIssue.error);
        }
        
        if (data.synced === 0 && data.failed === 0) {
          toast.info('Nenhum pedido pendente para sincronizar!');
        } else {
          toast.success(`Sincronização concluída! ${data.synced} pedido(s) enviado(s), ${data.failed} falha(s).`);
        }
        
        queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
        refetchPending();
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar pedidos:', error);
      if (error.message?.includes('escopo') || error.message?.includes('scope') || error.message?.includes('permissão')) {
        setScopeError(error.message);
      }
      toast.error(error.message || 'Erro ao sincronizar pedidos');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFetchFromBling = async () => {
    setIsFetching(true);
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
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Sincronização de Pedidos
            </CardTitle>
            <CardDescription>
              Envie pedidos do sistema para o Bling ou busque pedidos do Bling
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {typeof syncedCount === 'number' && syncedCount > 0 && (
              <Badge variant="default" className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {syncedCount} sincronizado(s)
              </Badge>
            )}
            {typeof pendingCount === 'number' && pendingCount > 0 && (
              <Badge variant="secondary" className="bg-orange-500 text-white">
                {pendingCount} pendente(s)
              </Badge>
            )}
            {typeof pendingCount === 'number' && pendingCount === 0 && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Tudo sincronizado
              </Badge>
            )}
          </div>
        </div>
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
              Envia pedidos pagos <strong>ainda não sincronizados</strong> para o Bling ERP.
            </p>
            <Button
              onClick={handleSyncAll}
              disabled={isSyncing || pendingCount === 0}
              className="w-full"
            >
              {isSyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {pendingCount === 0 ? 'Nenhum Pendente' : `Enviar ${pendingCount} Pedido(s)`}
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
              onClick={handleFetchFromBling}
              disabled={isFetching}
              className="w-full"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Buscar Pedidos do Bling
            </Button>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Dica:</strong> A sincronização envia até 50 pedidos por vez e marca cada um como sincronizado,
            evitando duplicatas em futuras sincronizações.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
