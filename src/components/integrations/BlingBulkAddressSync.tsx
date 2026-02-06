import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Loader2, MapPin, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getBrasiliaDayBoundsISO, toBrasiliaDateISO } from '@/lib/date-utils';

const DELAY_MS = 1500;

interface BlingBulkAddressSyncProps {
  tenantId: string;
}

interface SyncResult {
  success: number;
  errors: number;
  skipped: number;
  details: string[];
}

export default function BlingBulkAddressSync({ tenantId }: BlingBulkAddressSyncProps) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const fetchOrders = async () => {
    let query = supabaseTenant
      .from('orders')
      .select('id, tenant_id, bling_order_id, customer_phone')
      .eq('is_cancelled', false)
      .eq('is_paid', true);

    if (startDate) {
      const { start } = getBrasiliaDayBoundsISO(toBrasiliaDateISO(startDate));
      query = query.gte('created_at', start);
    }
    if (endDate) {
      const { end } = getBrasiliaDayBoundsISO(toBrasiliaDateISO(endDate));
      query = query.lte('created_at', end);
    }

    const { data: orders, error } = await query.order('id', { ascending: true });
    if (error) throw error;
    return orders || [];
  };

  const startSync = async () => {
    setLastResult(null);

    try {
      const orders = await fetchOrders();
      if (!orders.length) {
        toast.info('Nenhum pedido encontrado no período selecionado.');
        return;
      }

      setSyncing(true);
      setTotal(orders.length);
      setProcessed(0);
      setProgress(0);

      toast.info(`${orders.length} pedido(s) encontrado(s). Processando todos sequencialmente...`);

      const result: SyncResult = { success: 0, errors: 0, skipped: 0, details: [] };

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        setCurrentOrderId(order.id);

        try {
          const { data, error: fnError } = await supabase.functions.invoke('sync-address-bling', {
            body: { order_id: order.id, tenant_id: order.tenant_id },
          });

          if (fnError) throw new Error(fnError.message || 'Erro na chamada da função');

          if (data?.success) {
            result.success++;
          } else if (!data?.had_order_id && !data?.resolved_order_id) {
            result.skipped++;
            result.details.push(`#${order.id}: Pedido não encontrado no Bling (skip)`);
          } else {
            result.errors++;
            result.details.push(`#${order.id}: ${data?.message || data?.error || 'Erro desconhecido'}`);
          }
        } catch (err: any) {
          result.errors++;
          result.details.push(`#${order.id}: ${err?.message || 'Falha na requisição'}`);
        }

        setProcessed(i + 1);
        setProgress(Math.round(((i + 1) / orders.length) * 100));

        if (i < orders.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
      }

      setCurrentOrderId(null);
      setLastResult({ ...result, details: result.details.slice(0, 50) });
      setSyncing(false);

      if (result.errors === 0 && result.skipped === 0) {
        toast.success(`Todos os ${result.success} endereço(s) atualizados com sucesso!`);
      } else {
        toast.warning(`${result.success} OK, ${result.errors} erro(s), ${result.skipped} não encontrado(s).`);
      }
    } catch (err) {
      console.error('Erro ao buscar pedidos:', err);
      toast.error('Erro ao buscar pedidos para sincronização.');
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
          Atualiza o endereço de todos os pedidos pagos no Bling sequencialmente com intervalo de {DELAY_MS}ms.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-sm">Data inicial</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex-1 space-y-1.5">
            <Label className="text-sm">Data final</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {(startDate || endDate) && (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={() => { setStartDate(undefined); setEndDate(undefined); }}>
                Limpar
              </Button>
            </div>
          )}
        </div>

        {/* Progress */}
        {syncing && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              Processando pedido <strong>#{currentOrderId}</strong> — {processed} de {total}
            </p>
          </div>
        )}

        {/* Results */}
        {lastResult && !syncing && (
          <Alert variant={lastResult.errors > 0 ? 'destructive' : 'default'}>
            {lastResult.errors > 0 && <AlertTriangle className="h-4 w-4" />}
            <AlertDescription>
              <div className="space-y-1">
                <p>
                  <strong>{lastResult.success}</strong> atualizado(s),{' '}
                  <strong>{lastResult.errors}</strong> com erro,{' '}
                  <strong>{lastResult.skipped}</strong> não encontrado(s) no Bling.
                </p>
                {lastResult.details.length > 0 && (
                  <details className="text-xs mt-2">
                    <summary className="cursor-pointer text-muted-foreground">Ver detalhes</summary>
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

        {/* Actions */}
        <Button onClick={startSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4 mr-2" />
          )}
          {syncing ? 'Atualizando...' : 'Atualizar Endereços no Bling'}
        </Button>
      </CardContent>
    </Card>
  );
}
