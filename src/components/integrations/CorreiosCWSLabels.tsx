import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Printer, Package, MapPin, Save, Download, CheckCircle2, XCircle, Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CorreiosLabelPrint, { type LabelData } from './CorreiosLabelPrint';

interface CorreiosCWSLabelsProps {
  tenantId: string;
  integrationId: string;
  fromCep: string;
  senderJsonRaw?: string;
}

interface SenderInfo {
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  telefone: string;
}

const DEFAULT_SENDER: SenderInfo = {
  nome: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', telefone: '',
};

interface GenerationResult {
  orderId: number;
  success: boolean;
  trackingCode?: string;
  labelPdfBase64?: string;
  error?: string;
}

export default function CorreiosCWSLabels({ tenantId, integrationId, fromCep, senderJsonRaw }: CorreiosCWSLabelsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sender config
  const [sender, setSender] = useState<SenderInfo>(() => {
    try {
      const parsed = JSON.parse(senderJsonRaw || '{}');
      return { ...DEFAULT_SENDER, ...parsed };
    } catch { return { ...DEFAULT_SENDER }; }
  });
  const [savingSender, setSavingSender] = useState(false);
  const [senderLoaded, setSenderLoaded] = useState(false);

  // Load sender from DB (persisted in webhook_secret)
  const { data: savedSenderData } = useQuery({
    queryKey: ['correios-sender', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_integrations')
        .select('webhook_secret')
        .eq('tenant_id', tenantId)
        .eq('provider', 'correios')
        .maybeSingle();
      if (error) throw error;
      if (data?.webhook_secret) {
        try {
          return JSON.parse(data.webhook_secret as string) as SenderInfo;
        } catch { return null; }
      }
      return null;
    },
    enabled: !!tenantId,
  });

  // Sync DB sender data into state once
  useEffect(() => {
    if (savedSenderData && !senderLoaded) {
      setSender(prev => ({ ...DEFAULT_SENDER, ...savedSenderData }));
      setSenderLoaded(true);
    }
  }, [savedSenderData, senderLoaded]);

  // Order selection
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set());
  const [serviceOverrides, setServiceOverrides] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [labelsForPrint, setLabelsForPrint] = useState<LabelData[]>([]);

  // Fetch orders ready for shipping (paid, no tracking, not cancelled)
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['correios-label-orders', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_name, customer_phone, customer_cep, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, total_amount, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .is('melhor_envio_tracking_code', null)
        .or('is_cancelled.is.null,is_cancelled.eq.false')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch orders with tracking (history)
  const { data: historyOrders = [] } = useQuery({
    queryKey: ['correios-label-history', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_name, melhor_envio_tracking_code, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_paid', true)
        .not('melhor_envio_tracking_code', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const handleSaveSender = async () => {
    setSavingSender(true);
    try {
      const { data, error } = await supabase.functions.invoke('correios-labels', {
        body: { action: 'save_sender', tenant_id: tenantId, sender },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao salvar');
      toast({ title: 'Sucesso', description: 'Dados do remetente salvos!' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSender(false);
    }
  };

  const toggleOrder = (orderId: number) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrders.size === orders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(orders.map(o => o.id)));
    }
  };

  const handleGenerate = async () => {
    if (selectedOrders.size === 0) return;
    setGenerating(true);
    setResults([]);
    setLabelsForPrint([]);

    try {
      const { data, error } = await supabase.functions.invoke('correios-labels', {
        body: {
          action: 'create_prepostagem',
          tenant_id: tenantId,
          order_ids: Array.from(selectedOrders),
          service_overrides: serviceOverrides,
        },
      });
      if (error) throw error;

      const allResults: GenerationResult[] = data?.results || [];
      setResults(allResults);

      // Build labels for print preview
      const successResults = allResults.filter(r => r.success && r.trackingCode);
      const printLabels: LabelData[] = successResults.map(r => {
        const order = orders.find(o => o.id === r.orderId);
        return {
          trackingCode: r.trackingCode!,
          serviceName: serviceOverrides[String(r.orderId)] || 'PAC',
          orderId: r.orderId,
          sender: { ...sender, cep: fromCep },
          recipient: {
            nome: order?.customer_name || '',
            logradouro: order?.customer_street || '',
            numero: order?.customer_number || 'S/N',
            complemento: order?.customer_complement || '',
            bairro: order?.customer_neighborhood || '',
            cep: order?.customer_cep || '',
            cidade: order?.customer_city || '',
            uf: order?.customer_state || '',
          },
        };
      });
      setLabelsForPrint(printLabels);

      toast({
        title: data?.success ? 'Etiquetas geradas' : 'Atenção',
        description: data?.summary || 'Processo concluído',
        variant: data?.success ? 'default' : 'destructive',
      });

      queryClient.invalidateQueries({ queryKey: ['correios-label-orders', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['correios-label-history', tenantId] });
      setSelectedOrders(new Set());
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = (base64: string, orderId: number) => {
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64}`;
    link.download = `etiqueta-pedido-${orderId}.pdf`;
    link.click();
  };

  const isSenderValid = sender.nome && sender.logradouro && sender.cidade && sender.uf;

  return (
    <Tabs defaultValue="orders" className="space-y-4">
      <TabsList>
        <TabsTrigger value="orders" className="gap-2"><Package className="h-4 w-4" />Pedidos</TabsTrigger>
        <TabsTrigger value="sender" className="gap-2"><Settings2 className="h-4 w-4" />Remetente</TabsTrigger>
        <TabsTrigger value="history" className="gap-2"><MapPin className="h-4 w-4" />Histórico</TabsTrigger>
      </TabsList>

      {/* Sender config */}
      <TabsContent value="sender">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do Remetente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Estes dados serão impressos nas etiquetas como endereço do remetente.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nome / Empresa</Label>
                <Input value={sender.nome} onChange={e => setSender({ ...sender, nome: e.target.value })} placeholder="Nome da empresa" />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={sender.telefone} onChange={e => setSender({ ...sender, telefone: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Logradouro</Label>
                <Input value={sender.logradouro} onChange={e => setSender({ ...sender, logradouro: e.target.value })} placeholder="Rua / Av." />
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input value={sender.numero} onChange={e => setSender({ ...sender, numero: e.target.value })} placeholder="Nº" />
              </div>
              <div className="space-y-1">
                <Label>Complemento</Label>
                <Input value={sender.complemento} onChange={e => setSender({ ...sender, complemento: e.target.value })} placeholder="Apto, Sala..." />
              </div>
              <div className="space-y-1">
                <Label>Bairro</Label>
                <Input value={sender.bairro} onChange={e => setSender({ ...sender, bairro: e.target.value })} placeholder="Bairro" />
              </div>
              <div className="space-y-1">
                <Label>Cidade</Label>
                <Input value={sender.cidade} onChange={e => setSender({ ...sender, cidade: e.target.value })} placeholder="Cidade" />
              </div>
              <div className="space-y-1">
                <Label>UF</Label>
                <Input value={sender.uf} onChange={e => setSender({ ...sender, uf: e.target.value })} placeholder="UF" maxLength={2} />
              </div>
              <div className="space-y-1">
                <Label>CEP de Origem</Label>
                <Input value={fromCep} disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Configurado na aba de configuração</p>
              </div>
            </div>
            <Button onClick={handleSaveSender} disabled={savingSender || !isSenderValid}>
              {savingSender ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Remetente
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Orders listing */}
      <TabsContent value="orders">
        {!isSenderValid && (
          <Alert className="mb-4">
            <AlertDescription>
              Configure os dados do remetente na aba "Remetente" antes de gerar etiquetas.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pedidos Prontos para Envio</CardTitle>
              <Button onClick={handleGenerate} disabled={generating || selectedOrders.size === 0 || !isSenderValid}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                Gerar Etiquetas ({selectedOrders.size})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum pedido pago sem rastreio encontrado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-2">
                        <Checkbox checked={selectedOrders.size === orders.length && orders.length > 0} onCheckedChange={toggleAll} />
                      </th>
                      <th className="p-2">Pedido</th>
                      <th className="p-2">Destinatário</th>
                      <th className="p-2">Cidade/UF</th>
                      <th className="p-2">CEP</th>
                      <th className="p-2">Serviço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => (
                      <tr key={order.id} className="border-b hover:bg-muted/50">
                        <td className="p-2">
                          <Checkbox checked={selectedOrders.has(order.id)} onCheckedChange={() => toggleOrder(order.id)} />
                        </td>
                        <td className="p-2 font-medium">#{order.id}</td>
                        <td className="p-2">{order.customer_name || order.customer_phone}</td>
                        <td className="p-2">{order.customer_city}/{order.customer_state}</td>
                        <td className="p-2">{order.customer_cep}</td>
                        <td className="p-2">
                          <Select
                            value={serviceOverrides[String(order.id)] || 'PAC'}
                            onValueChange={v => setServiceOverrides({ ...serviceOverrides, [String(order.id)]: v })}
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PAC">PAC</SelectItem>
                              <SelectItem value="SEDEX">SEDEX</SelectItem>
                              <SelectItem value="Mini Envios">Mini Envios</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {results.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Resultado da Geração</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {results.map(r => (
                <div key={r.orderId} className="flex items-center justify-between rounded border p-3">
                  <div className="flex items-center gap-2">
                    {r.success ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    <span className="font-medium">Pedido #{r.orderId}</span>
                    {r.trackingCode && <Badge variant="secondary">{r.trackingCode}</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.error && <span className="text-xs text-destructive">{r.error}</span>}
                    {r.labelPdfBase64 && (
                      <Button variant="outline" size="sm" onClick={() => downloadPdf(r.labelPdfBase64!, r.orderId)}>
                        <Download className="mr-1 h-3 w-3" /> PDF
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Print preview */}
        {labelsForPrint.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Visualização de Impressão</CardTitle>
            </CardHeader>
            <CardContent>
              <CorreiosLabelPrint labels={labelsForPrint} />
            </CardContent>
          </Card>
        )}
      </TabsContent>

      {/* History */}
      <TabsContent value="history">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Etiquetas Geradas</CardTitle>
          </CardHeader>
          <CardContent>
            {historyOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma etiqueta gerada ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {historyOrders.map(order => (
                  <div key={order.id} className="flex items-center justify-between rounded border p-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">#{order.id}</span>
                      <span className="text-sm text-muted-foreground">{order.customer_name}</span>
                    </div>
                    <Badge variant="secondary">{order.melhor_envio_tracking_code}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
