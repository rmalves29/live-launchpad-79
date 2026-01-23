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
  CheckCircle2,
  Wrench
} from 'lucide-react';

interface BlingOrdersSyncPanelProps {
  tenantId: string;
  queryClient: QueryClient;
  setScopeError: (error: string | null) => void;
}

export default function BlingOrdersSyncPanel({ tenantId, queryClient, setScopeError }: BlingOrdersSyncPanelProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isFixingFreight, setIsFixingFreight] = useState(false);

  // Buscar contagem de pedidos pendentes de sincronização
  const { data: pendingCount = 0, refetch: refetchPending, isLoading: isLoadingCount } = useQuery({
    queryKey: ['bling-pending-orders', tenantId],
    queryFn: async () => {
      // Busca os pedidos pagos para contar
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true);
      
      if (error) {
        console.error('Erro ao buscar pedidos:', error);
        throw error;
      }
      
      return data?.length || 0;
    },
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  // Por enquanto, não temos contagem de sincronizados (coluna não existe)
  const syncedCount = 0;

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

  const handleFixFreight = async () => {
    setIsFixingFreight(true);
    try {
      // Primeiro, fazer dry run para ver quantos pedidos serão afetados
      toast.info('Verificando pedidos para correção...');
      const session = await supabase.auth.getSession();
      
      const dryRunResponse = await fetch(
        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-fix-freight',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            dry_run: true,
          }),
        }
      );
      
      const dryRunResult = await dryRunResponse.json();
      
      if (!dryRunResponse.ok) {
        throw new Error(dryRunResult.error || 'Erro ao verificar pedidos');
      }
      
      if (dryRunResult.total_orders === 0) {
        toast.info('Nenhum pedido encontrado para corrigir');
        return;
      }
      
      // Confirmar com o usuário
      const confirmMessage = `Foram encontrados ${dryRunResult.total_orders} pedido(s) com frete para corrigir. Deseja continuar?`;
      if (!confirm(confirmMessage)) {
        toast.info('Correção cancelada');
        return;
      }
      
      // Executar correção real
      toast.info('Corrigindo fretes no Bling...');
      const response = await fetch(
        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-fix-freight',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            dry_run: false,
          }),
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao corrigir fretes');
      }
      
      toast.success(`Correção concluída! ${result.corrected} corrigido(s), ${result.errors} erro(s).`);
      console.log('Resultado da correção:', result);
      
    } catch (error: any) {
      console.error('Erro ao corrigir fretes:', error);
      toast.error(error.message || 'Erro ao corrigir fretes');
    } finally {
      setIsFixingFreight(false);
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

        {/* Corrigir fretes */}
        <div className="border rounded-lg p-4 space-y-3 border-dashed border-orange-400">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-500" />
            <h4 className="font-medium">Corrigir Fretes no Bling</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Corrige pedidos já enviados ao Bling que tiveram o valor do frete enviado incorretamente.
          </p>
          <Button
            variant="outline"
            onClick={handleFixFreight}
            disabled={isFixingFreight}
            className="w-full border-orange-400 text-orange-600 hover:bg-orange-50"
          >
            {isFixingFreight ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4 mr-2" />
            )}
            Corrigir Fretes
          </Button>
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
