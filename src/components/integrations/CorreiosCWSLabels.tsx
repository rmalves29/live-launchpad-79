import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Download, Clock, Package, Info, RefreshCcw } from 'lucide-react';

interface CorreiosCWSLabelsProps {
  tenantId: string;
}

interface OrderRow {
  id: number;
  customer_name: string | null;
  customer_phone: string;
  customer_city: string | null;
  customer_state: string | null;
  total_amount: number;
  melhor_envio_shipment_id: string | null;
  melhor_envio_tracking_code: string | null;
  created_at: string | null;
  is_paid: boolean;
}

export default function CorreiosCWSLabels({ tenantId }: CorreiosCWSLabelsProps) {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['correios-labels-history', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, customer_name, customer_phone, customer_city, customer_state, total_amount, melhor_envio_shipment_id, melhor_envio_tracking_code, created_at, is_paid',
        )
        .eq('tenant_id', tenantId)
        .not('melhor_envio_shipment_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as OrderRow[];
    },
    enabled: !!tenantId,
  });

  const handleDownload = async (order: OrderRow) => {
    if (!order.melhor_envio_shipment_id) return;
    setDownloadingId(String(order.id));

    try {
      const { data, error } = await supabase.functions.invoke('correios-labels', {
        body: {
          action: 'download_label',
          tenant_id: tenantId,
          prePostagem_id: order.melhor_envio_shipment_id,
        },
      });

      if (error) throw error;

      if (data?.success && data?.labelPdfBase64) {
        // Abrir PDF base64 em nova aba
        const byteChars = atob(data.labelPdfBase64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        toast({ title: 'Etiqueta baixada', description: `Pedido #${order.id}` });
      } else if (data?.pending) {
        toast({
          title: 'Em processamento',
          description: 'Rótulo ainda em processamento, tente novamente em 1 minuto',
        });
      } else {
        toast({
          title: 'Erro',
          description: data?.error || 'Falha desconhecida ao baixar etiqueta',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao baixar etiqueta',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const isPending = (order: OrderRow) => {
    const id = order.melhor_envio_shipment_id || '';
    return id.startsWith('PR') && !order.melhor_envio_tracking_code;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Etiquetas Correios — Histórico
            </CardTitle>
            <CardDescription>
              Baixe etiquetas geradas via contrato direto. O PDF pode levar alguns segundos para
              ficar disponível após a criação.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="historico">
          <TabsList>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="historico" className="space-y-3 mt-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Pedidos com ⏳ ainda estão em processamento na API dos Correios. Tente baixar
                novamente em 1 minuto.
              </AlertDescription>
            </Alert>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : !orders || orders.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhuma pré-postagem encontrada.
              </p>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => {
                  const pending = isPending(order);
                  const isDownloading = downloadingId === String(order.id);
                  return (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-3 p-3 border rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">Pedido #{order.id}</span>
                          {pending && (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="h-3 w-3" /> Pendente
                            </Badge>
                          )}
                          {order.melhor_envio_tracking_code && (
                            <Badge variant="outline">{order.melhor_envio_tracking_code}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {order.customer_name || order.customer_phone} —{' '}
                          {order.customer_city || '?'}/{order.customer_state || '?'}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">
                          ID: {order.melhor_envio_shipment_id}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {pending && <Clock className="h-4 w-4 text-muted-foreground" />}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(order)}
                          disabled={isDownloading}
                        >
                          {isDownloading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-1" />
                          )}
                          Baixar etiqueta
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
