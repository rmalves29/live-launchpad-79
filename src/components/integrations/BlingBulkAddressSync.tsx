import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, MapPin, AlertTriangle } from 'lucide-react';

interface BlingBulkAddressSyncProps {
  tenantId: string;
}

export default function BlingBulkAddressSync({ tenantId }: BlingBulkAddressSyncProps) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [lastResult, setLastResult] = useState<{ success: number; errors: number; details: string[] } | null>(null);

  const syncAllAddresses = async () => {
    setSyncing(true);
    setProgress(0);
    setProcessed(0);
    setLastResult(null);

    try {
      // Buscar TODOS os pedidos pagos não cancelados (inclui os sem bling_order_id, pois a function tenta resolver)
      const { data: orders, error } = await supabaseTenant
        .from('orders')
        .select('id, tenant_id, bling_order_id, customer_phone')
        .eq('is_cancelled', false)
        .eq('is_paid', true);

      if (error) throw error;

      if (!orders || orders.length === 0) {
        toast.info('Nenhum pedido pago encontrado para sincronizar.');
        setSyncing(false);
        return;
      }

      setTotal(orders.length);
      let successCount = 0;
      let errorCount = 0;
      const errorDetails: string[] = [];

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        try {
          const { data, error: fnError } = await supabase.functions.invoke('sync-address-bling', {
            body: { order_id: order.id, tenant_id: order.tenant_id }
          });

          if (fnError) {
            throw new Error(fnError.message || 'Erro na chamada da função');
          }
          
          if (data?.success) {
            successCount++;
          } else {
            errorCount++;
            errorDetails.push(`#${order.id}: ${data?.message || data?.error || 'Erro desconhecido'}`);
          }
        } catch (err: any) {
          console.error(`Erro ao sincronizar pedido #${order.id}:`, err);
          errorCount++;
          errorDetails.push(`#${order.id}: ${err?.message || 'Falha na requisição'}`);
        }

        setProcessed(i + 1);
        setProgress(Math.round(((i + 1) / orders.length) * 100));

        // Intervalo de 500ms entre pedidos para respeitar rate limit do Bling
        if (i < orders.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      setLastResult({ success: successCount, errors: errorCount, details: errorDetails.slice(0, 10) });

      if (errorCount === 0) {
        toast.success(`${successCount} endereço(s) atualizado(s) com sucesso!`);
      } else {
        toast.warning(`${successCount} atualizado(s), ${errorCount} com erro. Veja os detalhes abaixo.`);
      }
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
      toast.error('Erro ao buscar pedidos para sincronização.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Atualizar Endereços em Massa
        </CardTitle>
        <CardDescription>
          Atualiza o endereço de todos os pedidos pagos e contatos no Bling com os dados mais recentes do sistema.
          Pedidos sem ID do Bling serão buscados automaticamente pelo número (OZ-ID).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {processed} de {total} pedido(s) processado(s)
            </p>
          </div>
        )}

        {lastResult && !syncing && (
          <Alert variant={lastResult.errors > 0 ? 'destructive' : 'default'}>
            {lastResult.errors > 0 && <AlertTriangle className="h-4 w-4" />}
            <AlertDescription>
              <div className="space-y-1">
                <p><strong>{lastResult.success}</strong> atualizado(s) com sucesso, <strong>{lastResult.errors}</strong> com erro.</p>
                {lastResult.details.length > 0 && (
                  <details className="text-xs mt-2">
                    <summary className="cursor-pointer text-muted-foreground">Ver erros detalhados</summary>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      {lastResult.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Button onClick={syncAllAddresses} disabled={syncing}>
          {syncing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4 mr-2" />
          )}
          {syncing ? 'Atualizando...' : 'Atualizar Todos os Endereços no Bling'}
        </Button>
      </CardContent>
    </Card>
  );
}
