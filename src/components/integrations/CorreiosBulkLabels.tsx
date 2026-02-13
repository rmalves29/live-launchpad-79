import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer, CheckCircle2, XCircle, AlertTriangle, Download, Send, RefreshCw } from 'lucide-react';
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
  error_type?: string;
  failed_service_code?: string;
  failed_service_name?: string;
  service_name?: string;
  service_code?: string;
}

export default function CorreiosBulkLabels({ tenantId }: CorreiosBulkLabelsProps) {
  const { toast } = useToast();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<OrderResult[] | null>(null);
  const [availableServices, setAvailableServices] = useState<Record<string, string>>({});
  // Manual service overrides per order_id
  const [serviceOverrides, setServiceOverrides] = useState<Record<string, string>>({});

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

  // Track which orders had service errors
  const serviceErrorOrders = useMemo(() => {
    if (!results) return new Set<number>();
    return new Set(results.filter(r => r.error_type === 'invalid_service').map(r => r.order_id));
  }, [results]);

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

  const handleSetServiceOverride = (orderId: number, serviceCode: string) => {
    setServiceOverrides(prev => ({
      ...prev,
      [String(orderId)]: serviceCode === '__auto__' ? '' : serviceCode,
    }));
  };

  const getDetectedService = (obs: string | null) => {
    if (!obs) return 'PAC';
    const upper = obs.toUpperCase();
    if (upper.includes('SEDEX 12') || upper.includes('SEDEX12')) return 'SEDEX 12';
    if (upper.includes('SEDEX')) return 'SEDEX';
    if (upper.includes('MINI')) return 'MINI ENVIOS';
    return 'PAC';
  };

  const handleProcess = async () => {
    if (selectedIds.size === 0) {
      toast({ title: 'Selecione pedidos', description: 'Nenhum pedido selecionado.', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setResults(null);

    try {
      // Clean overrides: remove empty values
      const cleanOverrides: Record<string, string> = {};
      for (const [k, v] of Object.entries(serviceOverrides)) {
        if (v) cleanOverrides[k] = v;
      }

      const { data, error } = await supabase.functions.invoke('process-meus-correios', {
        body: {
          tenant_id: tenantId,
          order_ids: Array.from(selectedIds),
          service_overrides: Object.keys(cleanOverrides).length > 0 ? cleanOverrides : undefined,
        },
      });

      if (error) throw error;

      setResults(data.results || []);
      if (data.available_services) setAvailableServices(data.available_services);

      const { summary } = data;
      const hasServiceErrors = (data.results || []).some((r: OrderResult) => r.error_type === 'invalid_service');

      toast({
        title: 'Processamento concluído',
        description: `✅ ${summary.success} sucesso | ❌ ${summary.errors} erros | ⏭️ ${summary.skipped} ignorados${hasServiceErrors ? ' — Alguns pedidos precisam de outro serviço' : ''}`,
        variant: hasServiceErrors ? 'destructive' : 'default',
      });

      refetch();
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryWithOverrides = async () => {
    if (!results) return;
    const errorIds = results.filter(r => r.error_type === 'invalid_service').map(r => r.order_id);
    if (errorIds.length === 0) return;

    // Check all error orders have overrides
    const missing = errorIds.filter(id => !serviceOverrides[String(id)]);
    if (missing.length > 0) {
      toast({ title: 'Selecione os serviços', description: `Escolha um serviço alternativo para ${missing.length} pedido(s) com erro.`, variant: 'destructive' });
      return;
    }

    setSelectedIds(new Set(errorIds));
    setIsProcessing(true);

    try {
      const cleanOverrides: Record<string, string> = {};
      for (const id of errorIds) {
        if (serviceOverrides[String(id)]) cleanOverrides[String(id)] = serviceOverrides[String(id)];
      }

      const { data, error } = await supabase.functions.invoke('process-meus-correios', {
        body: { tenant_id: tenantId, order_ids: errorIds, service_overrides: cleanOverrides },
      });

      if (error) throw error;

      // Merge new results with previous
      const newResults = data.results || [];
      const updatedResults = (results || []).map(r => {
        const updated = newResults.find((nr: OrderResult) => nr.order_id === r.order_id);
        return updated || r;
      });
      setResults(updatedResults);

      toast({ title: 'Reprocessamento concluído', description: `${data.summary.success} sucesso, ${data.summary.errors} erros` });
      refetch();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
      setSelectedIds(new Set());
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

  const serviceOptions = Object.entries(availableServices);

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
                Gerar Etiquetas ({selectedIds.size})
              </Button>
            </div>

            <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
              {pendingOrders.map(order => {
                const detectedService = getDetectedService(order.observation);
                const hasAddress = order.customer_cep && order.customer_city && order.customer_state;
                const hasServiceError = serviceErrorOrders.has(order.id);
                const override = serviceOverrides[String(order.id)];

                return (
                  <div
                    key={order.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${
                      !hasAddress ? 'bg-destructive/5' : hasServiceError ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-l-amber-500' : ''
                    }`}
                  >
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

                    {/* Service selector - show dropdown if there are available services and order had error */}
                    {hasServiceError && serviceOptions.length > 0 ? (
                      <Select
                        value={override || '__auto__'}
                        onValueChange={v => handleSetServiceOverride(order.id, v)}
                      >
                        <SelectTrigger className="w-36 h-7 text-xs border-amber-500">
                          <SelectValue placeholder="Trocar serviço" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__auto__">Auto ({detectedService})</SelectItem>
                          {serviceOptions.map(([name, code]) => (
                            <SelectItem key={code} value={code}>
                              {name} ({code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={hasServiceError ? 'destructive' : 'outline'} className="text-xs">
                        {override
                          ? serviceOptions.find(([_, c]) => c === override)?.[0] || override
                          : detectedService}
                      </Badge>
                    )}

                    <span className="text-xs text-muted-foreground">
                      R$ {Number(order.total_amount || 0).toFixed(2)}
                    </span>
                    {!hasAddress && (
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" title="Endereço incompleto" />
                    )}
                    {hasServiceError && (
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" title="Serviço inválido" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Results */}
        {results && results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Resultado do Processamento</h4>
              <div className="flex gap-2">
                {results.some(r => r.error_type === 'invalid_service') && (
                  <Button size="sm" variant="outline" onClick={handleRetryWithOverrides} disabled={isProcessing}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reprocessar com Serviço Alternativo
                  </Button>
                )}
                {results.some(r => r.label_base64) && (
                  <Button size="sm" variant="outline" onClick={handleDownloadAll}>
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Etiquetas
                  </Button>
                )}
              </div>
            </div>

            {/* Service error alert */}
            {results.some(r => r.error_type === 'invalid_service') && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Alguns pedidos falharam por <strong>código de serviço inválido</strong> para seu cartão de postagem.
                  Selecione um serviço alternativo no dropdown ao lado do pedido e clique em "Reprocessar".
                  Você também pode ajustar os códigos no <strong>Dicionário de Serviços</strong> acima.
                </AlertDescription>
              </Alert>
            )}

            <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
              {results.map((r, i) => (
                <div key={i} className={`flex items-center gap-3 px-3 py-2 text-sm ${r.error_type === 'invalid_service' ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  {r.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : r.status === 'skipped' ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                  ) : r.error_type === 'invalid_service' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <span className="font-medium">#{r.order_id}</span>
                  {r.service_name && (
                    <Badge variant="outline" className="text-xs">{r.service_name}</Badge>
                  )}
                  <span className="flex-1 text-muted-foreground truncate">
                    {r.status === 'success'
                      ? `${r.tracking_code}${r.whatsapp_sent ? ' ✅ WhatsApp' : ''}`
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
