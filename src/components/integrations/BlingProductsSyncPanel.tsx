/**
 * Painel para sincronização de produtos com Bling ERP
 * Exibe estatísticas e permite exportar produtos em lote
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { 
  Package, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface BlingProductsSyncPanelProps {
  tenantId: string;
}

interface SyncCount {
  pending: number;
  synced: number;
  total: number;
}

interface SyncResult {
  success: boolean;
  message: string;
  synced: number;
  errors: number;
  total: number;
  details?: Array<{
    product_id: string;
    product_name: string;
    success: boolean;
    kind?: string;
    bling_product_id?: number;
    error?: string;
  }>;
}

export default function BlingProductsSyncPanel({ tenantId }: BlingProductsSyncPanelProps) {
  const queryClient = useQueryClient();
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Fetch product counts
  const { data: counts, isLoading: countsLoading, refetch: refetchCounts } = useQuery({
    queryKey: ['bling-products-count', tenantId],
    queryFn: async () => {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-sync-products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.data.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'count_pending',
            tenant_id: tenantId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao buscar contagem');
      }

      return await response.json() as SyncCount;
    },
    enabled: !!tenantId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Sync all products mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncProgress(0);
      setLastSyncResult(null);

      const session = await supabase.auth.getSession();
      const response = await fetch(
        `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-sync-products`,
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao sincronizar produtos');
      }

      return await response.json() as SyncResult;
    },
    onSuccess: (data) => {
      setSyncProgress(100);
      setLastSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ['bling-products-count', tenantId] });
      
      if (data.synced > 0) {
        toast.success(`${data.synced} produto(s) exportado(s) para o Bling!`);
      } else if (data.errors > 0) {
        toast.warning(`Sincronização concluída com ${data.errors} erro(s)`);
      } else {
        toast.info('Nenhum produto pendente para sincronizar');
      }
    },
    onError: (error: any) => {
      setSyncProgress(null);
      console.error('Erro ao sincronizar produtos:', error);
      
      if (error.message?.includes('insufficient_scope') || error.message?.includes('permissão')) {
        toast.error('Token do Bling sem permissão para Produtos. Verifique os escopos do aplicativo no Bling e autorize novamente.');
      } else {
        toast.error(error.message || 'Erro ao sincronizar produtos');
      }
    },
    onSettled: () => {
      setTimeout(() => setSyncProgress(null), 2000);
    },
  });

  const pendingCount = counts?.pending || 0;
  const syncedCount = counts?.synced || 0;
  const totalCount = counts?.total || 0;
  const syncPercentage = totalCount > 0 ? Math.round((syncedCount / totalCount) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Sincronização de Produtos</CardTitle>
              <CardDescription>
                Exportar produtos cadastrados para o Bling ERP
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchCounts()}
            disabled={countsLoading}
          >
            <RefreshCw className={`h-4 w-4 ${countsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-foreground">{totalCount}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="text-center p-3 bg-primary/10 rounded-lg">
            <div className="text-2xl font-bold text-primary">{syncedCount}</div>
            <div className="text-xs text-muted-foreground">Sincronizados</div>
          </div>
          <div className="text-center p-3 bg-accent rounded-lg">
            <div className="text-2xl font-bold text-accent-foreground">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Progresso de exportação</span>
            <span>{syncPercentage}%</span>
          </div>
          <Progress value={syncPercentage} className="h-2" />
        </div>

        {/* Sync progress indicator */}
        {syncProgress !== null && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Exportando produtos para o Bling... Aguarde.
            </AlertDescription>
          </Alert>
        )}

        {/* Last sync result */}
        {lastSyncResult && (
          <Alert variant={lastSyncResult.errors > 0 ? 'destructive' : 'default'}>
            {lastSyncResult.errors > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertDescription>
              <div className="font-medium">{lastSyncResult.message}</div>
              {lastSyncResult.details && lastSyncResult.details.length > 0 && (
                <div className="mt-2 space-y-1">
                  {lastSyncResult.details.slice(0, 5).map((detail, idx) => (
                    <div key={idx} className="text-xs flex items-center gap-2">
                      {detail.success ? (
                        <Badge variant="outline" className="text-primary">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {detail.kind === 'already_exists' ? 'Existente' : 'Criado'}
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Erro</Badge>
                      )}
                      <span className="truncate">{detail.product_name}</span>
                    </div>
                  ))}
                  {lastSyncResult.details.length > 5 && (
                    <div className="text-xs text-muted-foreground">
                      ... e mais {lastSyncResult.details.length - 5} produto(s)
                    </div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* No pending products */}
        {pendingCount === 0 && !countsLoading && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <AlertDescription>
              Todos os produtos ativos já foram exportados para o Bling!
            </AlertDescription>
          </Alert>
        )}

        {/* Sync button */}
        <Button
          className="w-full"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || pendingCount === 0}
        >
          {syncMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Exportando...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Exportar {pendingCount} Produto(s) para o Bling
            </>
          )}
        </Button>

        {/* Info about sync */}
        <p className="text-xs text-muted-foreground text-center">
          Apenas produtos ativos sem ID do Bling serão exportados.
          Produtos já sincronizados serão ignorados.
        </p>
      </CardContent>
    </Card>
  );
}
