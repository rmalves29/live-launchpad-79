import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, CheckCircle2, XCircle, AlertTriangle, Download, Send } from 'lucide-react';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';

interface CorreiosBulkLabelsProps {
  tenantId: string;
}

interface OrderResult {
  order_id: number;
  status: 'success' | 'error' | 'skipped';
  message?: string;
  tracking_code?: string;
  lote?: string;
  label_base64?: string | null;
  whatsapp_sent?: boolean;
  whatsapp_error?: string;
}

export default function CorreiosBulkLabels({ tenantId }: CorreiosBulkLabelsProps) {
  const { toast } = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<OrderResult[] | null>(null);

  // Fetch paid orders without tracking in date range
  const { data: orders, isLoading, refetch } = useQuery({
    queryKey: ['correios-bulk-orders', tenantId, dateFrom, dateTo],
    queryFn: async () => {
      const from = startOfDay(parseISO(dateFrom)).toISOString();
      const to = endOfDay(parseISO(dateTo)).toISOString();

      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_name, customer_phone, customer_cep, customer_city, customer_state, total_amount, unique_order_id, melhor_envio_tracking_code, is_paid, observation, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId && !!dateFrom && !!dateTo,
  });

  const pendingOrders = useMemo(() =>
    (orders || []).filter(o => !o.melhor_envio_tracking_code),
    [orders]
  );

  const handleToggleAll = () => {
    if (selectedIds.size === pendingOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingOrders.map(o => o.id)));
    }
  };

  const handleToggleOrder = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleProcess = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'Selecione pedidos', description: 'Nenhum pedido selecionado.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('process-meus-correios', {
        body: { tenant_id: tenantId, order_ids: Array.from(selectedIds) },
      });

      if (error) throw error;

      setResults(data.results || []);

      const { summary } = data;
      toast({
        title: 'Processamento concluído',
        description: `✅ ${summary.success} sucesso | ❌ ${summary.errors} erros | ⏭️ ${summary.skipped} ignorados`,
      });

      refetch();
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadLabel = (result: OrderResult) => {
    if (!result.label_base64) return;
    const byteChars = atob(result.label_base64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiqueta_${result.tracking_code || result.order_id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    if (!results) return;
    results.filter(r => r.label_base64).forEach(r => handleDownloadLabel(r));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Gerar Etiquetas em Massa
        </CardTitle>
        <CardDescription>
          Gere pré-postagens no MeusCorreios e notifique os clientes automaticamente via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Filter */}
        <div className="flex gap-3 items-end flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="dateFrom" className="text-xs">Data Início</Label>
            <Input id="dateFrom" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dateTo" className="text-xs">Data Fim</Label>
            <Input id="dateTo" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
        </div>

        {/* Orders list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : pendingOrders.length === 0 ? (
          <Alert>
            <AlertDescription>
              {orders?.length ? `Todos os ${orders.length} pedidos no período já possuem rastreio.` : 'Nenhum pedido pago encontrado no período selecionado.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.size === pendingOrders.length && pendingOrders.length > 0}
                  onCheckedChange={handleToggleAll}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedIds.size} de {pendingOrders.length} selecionados
                  {orders && orders.length > pendingOrders.length && (
                    <span className="ml-1">({orders.length - pendingOrders.length} já com rastreio)</span>
                  )}
                </span>
              </div>
              <Button
                size="sm"
                onClick={handleProcess}
                disabled={isProcessing || selectedIds.size === 0}
              >
                {isProcessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Gerar Etiquetas e Notificar ({selectedIds.size})
              </Button>
            </div>

            <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {pendingOrders.map(order => {
                const obs = order.observation || '';
                let servico = 'PAC';
                if (obs.toUpperCase().includes('SEDEX')) servico = 'SEDEX';
                else if (obs.toUpperCase().includes('MINI')) servico = 'MINI';

                const hasAddress = order.customer_cep && order.customer_city && order.customer_state;

                return (
                  <div key={order.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${!hasAddress ? 'bg-destructive/5' : ''}`}>
                    <Checkbox
                      checked={selectedIds.has(order.id)}
                      onCheckedChange={() => handleToggleOrder(order.id)}
                      disabled={!hasAddress}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">#{order.unique_order_id || order.id}</span>
                      <span className="ml-2 text-muted-foreground truncate">{order.customer_name}</span>
                    </div>
                    <span className="text-muted-foreground text-xs hidden sm:inline">
                      {order.customer_city}/{order.customer_state}
                    </span>
                    <Badge variant="outline" className="text-xs">{servico}</Badge>
                    <span className="text-xs text-muted-foreground">
                      R$ {Number(order.total_amount || 0).toFixed(2)}
                    </span>
                    {!hasAddress && (
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" title="Endereço incompleto" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Resultado do Processamento</h4>
              {results.some(r => r.label_base64) && (
                <Button size="sm" variant="outline" onClick={handleDownloadAll}>
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Todas Etiquetas
                </Button>
              )}
            </div>
            <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {r.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : r.status === 'skipped' ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <span className="font-medium">#{r.order_id}</span>
                  <span className="flex-1 text-muted-foreground truncate">
                    {r.status === 'success'
                      ? `${r.tracking_code}${r.whatsapp_sent ? ' ✅ WhatsApp enviado' : r.whatsapp_error ? ' ⚠️ WhatsApp falhou' : ''}`
                      : r.message}
                  </span>
                  {r.label_base64 && (
                    <Button size="sm" variant="ghost" onClick={() => handleDownloadLabel(r)} title="Baixar etiqueta">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
