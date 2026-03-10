import { useState } from 'react';
import { useQuery, QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  Loader2, 
  ShoppingCart, 
  Upload,
  Download,
  Info,
  CheckCircle2,
  Wrench,
  Calendar,
  Truck
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
  const [isSyncingTracking, setIsSyncingTracking] = useState(false);
  const [isSyncingSingle, setIsSyncingSingle] = useState(false);
  const [isForceResyncing, setIsForceResyncing] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [singleOrderId, setSingleOrderId] = useState('');
  const [forceResyncOrderId, setForceResyncOrderId] = useState('');

  // Buscar contagem de pedidos pendentes de sincronização (pagos E sem bling_order_id)
  const { data: pendingCount = 0, refetch: refetchPending, isLoading: isLoadingCount } = useQuery({
    queryKey: ['bling-pending-orders', tenantId],
    queryFn: async () => {
      // Busca pedidos pagos que AINDA NÃO foram sincronizados com Bling
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .is('bling_order_id', null)
        .or('is_cancelled.is.null,is_cancelled.eq.false');
      
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

  const handleSyncSingle = async () => {
    const orderId = parseInt(singleOrderId.trim(), 10);
    if (isNaN(orderId)) {
      toast.error('Informe um ID de pedido válido.');
      return;
    }

    setIsSyncingSingle(true);
    try {
      setScopeError(null);
      toast.info(`Enviando pedido #${orderId} para o Bling...`);

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
            action: 'send_order',
            tenant_id: tenantId,
            order_id: orderId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao sincronizar pedido');
      }

      if (result.success) {
        const data = result.data;
        if (data.skipped) {
          toast.info(`Pedido #${orderId} já está sincronizado (Bling ID: ${data.bling_order_id || 'N/A'}).`);
        } else if (data.bling_order_id || data.blingOrderId) {
          toast.success(`Pedido #${orderId} enviado ao Bling com sucesso!`);
        } else {
          toast.success(`Pedido #${orderId} processado com sucesso!`);
        }
        queryClient.invalidateQueries({ queryKey: ['bling-integration', tenantId] });
        refetchPending();
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar pedido:', error);
      toast.error(error.message || 'Erro ao sincronizar pedido');
    } finally {
      setIsSyncingSingle(false);
    }
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    try {
      setScopeError(null);
      
      const dateInfo = startDate || endDate 
        ? ` (${startDate || 'início'} até ${endDate || 'hoje'})` 
        : '';
      toast.info(`Iniciando sincronização${dateInfo}...`);
      
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
            start_date: startDate || undefined,
            end_date: endDate || undefined,
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

  const handleSyncTracking = async () => {
    setIsSyncingTracking(true);
    try {
      toast.info('Buscando códigos de rastreio do Bling...');
      const session = await supabase.auth.getSession();
      const response = await fetch(
        'https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/sync-bling-tracking',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
          }),
        }
      );
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao sincronizar rastreios');
      }
      
      if (result.success) {
        if (result.synced === 0) {
          toast.info(`Nenhum código de rastreio novo encontrado.`);
        } else {
          toast.success(`${result.synced} código(s) de rastreio atualizado(s)! ${result.messagesSent} mensagem(ns) WhatsApp enviada(s).`);
        }
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar rastreios:', error);
      toast.error(error.message || 'Erro ao sincronizar rastreios');
    } finally {
      setIsSyncingTracking(false);
    }
  };

  const handleForceResync = async () => {
    const orderId = parseInt(forceResyncOrderId.trim(), 10);
    if (isNaN(orderId)) {
      toast.error('Informe um ID de pedido válido.');
      return;
    }

    if (!confirm(`⚠️ Isso vai criar um NOVO pedido no Bling para o pedido #${orderId}.\nO pedido antigo no Bling NÃO será excluído automaticamente — você precisará excluí-lo manualmente.\n\nDeseja continuar?`)) {
      return;
    }

    setIsForceResyncing(true);
    try {
      toast.info(`Forçando reenvio do pedido #${orderId}...`);
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
            action: 'force_resync_order',
            tenant_id: tenantId,
            order_id: orderId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Erro ao forçar reenvio');

      if (result.success) {
        const data = result.data;
        toast.success(`Pedido #${orderId} reenviado! Novo Bling ID: ${data.new_bling_order_id}. Lembre de excluir o pedido antigo (ID: ${data.old_bling_order_id}) no Bling.`);
        setForceResyncOrderId('');
        refetchPending();
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao forçar reenvio');
    } finally {
      setIsForceResyncing(false);
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
        {/* Filtro por data */}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h4 className="font-medium">Filtrar por Data</h4>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date">Data Inicial</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Data Final</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="dd/mm/aaaa"
              />
            </div>
          </div>
          {(startDate || endDate) && (
            <p className="text-xs text-muted-foreground">
              📅 Filtrando pedidos {startDate ? `de ${new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''} 
              {startDate && endDate ? ' ' : ''}
              {endDate ? `até ${new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
            </p>
          )}
        </div>

        {/* Exportar pedido específico */}
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h4 className="font-medium">Exportar Pedido Específico</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Envie um pedido específico para o Bling informando o ID do pedido.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ID do pedido (ex: 1477)"
              value={singleOrderId}
              onChange={(e) => setSingleOrderId(e.target.value)}
              className="max-w-[200px]"
              disabled={isSyncingSingle}
            />
            <Button
              onClick={handleSyncSingle}
              disabled={isSyncingSingle || !singleOrderId.trim()}
            >
              {isSyncingSingle ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Enviar Pedido
            </Button>
          </div>
        </div>

        {/* Forçar Reenvio de Pedido */}
        <div className="border rounded-lg p-4 space-y-3 border-dashed border-destructive/50 bg-destructive/5">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-destructive" />
            <h4 className="font-medium text-destructive">Forçar Reenvio de Pedido</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Use quando um pedido já foi enviado ao Bling mas com produtos incorretos.
            <strong className="block mt-1 text-destructive">⚠️ Atenção: cria um novo pedido no Bling. O pedido antigo precisa ser excluído manualmente no Bling.</strong>
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="ID do pedido (ex: 1875)"
              value={forceResyncOrderId}
              onChange={(e) => setForceResyncOrderId(e.target.value)}
              className="max-w-[200px]"
              disabled={isForceResyncing}
            />
            <Button
              variant="destructive"
              onClick={handleForceResync}
              disabled={isForceResyncing || !forceResyncOrderId.trim()}
            >
              {isForceResyncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4 mr-2" />
              )}
              Forçar Reenvio
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Enviar todos os pedidos pagos */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <h4 className="font-medium">Exportar para Bling</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Envia pedidos pagos <strong>ainda não sincronizados</strong> para o Bling ERP.
              {(startDate || endDate) && <span className="block mt-1 text-primary font-medium">Usando filtro de data selecionado</span>}
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

        {/* Sincronizar Rastreios do Bling */}
        <div className="border rounded-lg p-4 space-y-3 border-primary/50 bg-primary/5">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h4 className="font-medium">Sincronizar Rastreios do Bling</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Busca códigos de rastreio dos pedidos no Bling e atualiza o sistema.
            Envia WhatsApp automaticamente ao cliente quando um código novo é encontrado.
          </p>
          <Button
            onClick={handleSyncTracking}
            disabled={isSyncingTracking}
            className="w-full"
          >
            {isSyncingTracking ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Truck className="h-4 w-4 mr-2" />
            )}
            Buscar Rastreios do Bling
          </Button>
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
