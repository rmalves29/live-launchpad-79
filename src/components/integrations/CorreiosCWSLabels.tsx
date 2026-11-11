import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { baixarEtiquetasCorreios, lerFormatoSalvo, salvarFormato, type FormatoEtiqueta } from '@/lib/correios-labels-download';
import { Loader2, Download, Clock, Package, Info, RefreshCcw, Copy } from 'lucide-react';

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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [formato, setFormato] = useState<FormatoEtiqueta>(lerFormatoSalvo);
  const trocarFormato = (f: FormatoEtiqueta) => {
    setFormato(f);
    salvarFormato(f);
  };

  const invokeLabels = (body: Record<string, unknown>) => supabase.functions.invoke('correios-labels', { body });

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const baixarVarias = async (ids: number[]) => {
    if (ids.length === 0) return;
    setBulkDownloading(true);
    try {
      const n = await baixarEtiquetasCorreios(invokeLabels, tenantId, ids, (prontas, total) =>
        toast({ title: 'Aguardando os Correios', description: `Gerando as etiquetas… ${prontas} de ${total} prontas.` }),
        formato,
        (pedidos) =>
          toast({
            title: 'Pedidos já postados',
            description: `${pedidos.length} pedido(s) ficaram fora do PDF porque já foram postados nos Correios (eles não imprimem mais a etiqueta depois da postagem): ${pedidos.map((p) => `#${p}`).join(', ')}`,
            duration: 15000,
          }),
      );
      toast({ title: 'Etiquetas baixadas', description: `${n} etiqueta(s) em PDF.` });
      setSelected(new Set());
    } catch (err: any) {
      toast({ title: 'Erro ao baixar etiquetas', description: err.message || 'Erro desconhecido', variant: 'destructive' });
    } finally {
      setBulkDownloading(false);
    }
  };

  const copiarCodigos = (lista: OrderRow[]) => {
    const comCodigo = lista.filter((o) => o.melhor_envio_tracking_code);
    if (comCodigo.length === 0) {
      toast({ title: 'Nenhum código para copiar', variant: 'destructive' });
      return;
    }
    navigator.clipboard.writeText(comCodigo.map((o) => o.melhor_envio_tracking_code).join('\n'));
    toast({ title: 'Códigos copiados', description: `${comCodigo.length} código(s), um por linha.` });
  };

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
        .like('melhor_envio_shipment_id', 'PR%')
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
      await baixarEtiquetasCorreios(invokeLabels, tenantId, [order.id], undefined, formato);
      toast({ title: 'Etiqueta baixada', description: `Pedido #${order.id}` });
    } catch (err: any) {
      toast({ title: 'Erro ao baixar etiqueta', description: err.message || 'Erro desconhecido', variant: 'destructive' });
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

            {orders && orders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  Formato:
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={formato}
                    onChange={(e) => trocarFormato(e.target.value as FormatoEtiqueta)}
                  >
                    <option value="a4">A4 (folha)</option>
                    <option value="zebra">Zebra (100 x 150 mm)</option>
                  </select>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(selected.size === orders.length ? new Set() : new Set(orders.map((o) => o.id)))}
                >
                  {selected.size === orders.length ? 'Limpar seleção' : 'Selecionar todas'}
                </Button>
                <Button size="sm" onClick={() => baixarVarias([...selected])} disabled={selected.size === 0 || bulkDownloading}>
                  {bulkDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                  Baixar selecionadas{selected.size > 0 && ` (${selected.size})`}
                </Button>
                <Button variant="outline" size="sm" onClick={() => baixarVarias(orders.map((o) => o.id))} disabled={bulkDownloading}>
                  Baixar todas ({orders.length})
                </Button>
                <Button variant="outline" size="sm" onClick={() => copiarCodigos(selected.size > 0 ? orders.filter((o) => selected.has(o.id)) : orders)}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar códigos{selected.size > 0 ? ` (${selected.size})` : ''}
                </Button>
              </div>
            )}

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
                      <Checkbox
                        checked={selected.has(order.id)}
                        onCheckedChange={() => toggle(order.id)}
                        disabled={bulkDownloading}
                        aria-label={`Selecionar pedido ${order.id}`}
                      />
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
