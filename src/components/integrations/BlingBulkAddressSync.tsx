import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Loader2, MapPin } from 'lucide-react';

interface BlingBulkAddressSyncProps {
  tenantId: string;
}

export default function BlingBulkAddressSync({ tenantId }: BlingBulkAddressSyncProps) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);

  const syncAllAddresses = async () => {
    setSyncing(true);
    setProgress(0);
    setProcessed(0);

    try {
      // Buscar pedidos com integração Bling
      const { data: orders, error } = await supabaseTenant
        .from('orders')
        .select('id, tenant_id, bling_order_id, customer_phone')
        .eq('is_cancelled', false)
        .not('bling_order_id', 'is', null);

      if (error) throw error;

      if (!orders || orders.length === 0) {
        toast.info('Nenhum pedido com integração Bling encontrado.');
        setSyncing(false);
        return;
      }

      setTotal(orders.length);
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        try {
          const { data, error: fnError } = await supabase.functions.invoke('sync-address-bling', {
            body: { order_id: order.id, tenant_id: order.tenant_id }
          });

          if (fnError) throw fnError;
          if (data?.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (err) {
          console.error(`Erro ao sincronizar pedido #${order.id}:`, err);
          errorCount++;
        }

        setProcessed(i + 1);
        setProgress(Math.round(((i + 1) / orders.length) * 100));
      }

      if (errorCount === 0) {
        toast.success(`${successCount} endereço(s) atualizado(s) com sucesso!`);
      } else {
        toast.warning(`${successCount} atualizado(s), ${errorCount} com erro.`);
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
          Atualiza o endereço de todos os pedidos e contatos no Bling com os dados mais recentes do sistema.
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
