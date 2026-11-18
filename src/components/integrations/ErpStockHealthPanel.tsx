/**
 * Saúde do estoque ERP → Cartzy (Bling, Olist, Bagy).
 * Mostra quando o estoque chegou do ERP pela última vez, a última conferência automática (a cada 15 min),
 * produtos sem ligação e alertas: sem avisos do ERP há mais de 24h, conferência pausada por segurança, erro.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

type Erp = 'bling' | 'olist' | 'bagy';
type State = {
  last_run_at: string | null;
  last_full_cycle_at: string | null;
  last_event_at: string | null;
  last_change_at: string | null;
  changes_last_run: number;
  linked_last_run: number;
  unlinked_count: number | null;
  deposit_source: string | null;
  paused_reason: string | null;
  last_error: string | null;
};

const NOMES: Record<Erp, string> = { bling: 'Bling', olist: 'Olist', bagy: 'Bagy' };
const DIA = 24 * 60 * 60 * 1000;

function quando(iso: string | null): string {
  if (!iso) return 'nunca';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ErpStockHealthPanel({ tenantId, erp }: { tenantId: string; erp: Erp }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const key = ['erp-stock-health', tenantId, erp];

  const { data: st, isLoading } = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('erp_stock_sync_state')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('erp', erp)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as State | null;
    },
  });

  const conferirAgora = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('erp-stock-reconcile', { body: { tenant_id: tenantId, erp } });
      if (error) throw error;
      const r = (data as any)?.result?.[0] || {};
      if (r.paused) toast.warning('Conferência pausada por segurança. Veja o aviso no painel.');
      else if (r.last_error || r.error) toast.error(r.last_error || r.error);
      else toast.success(`Conferência feita: ${r.changes_last_run || 0} estoque(s) corrigido(s), ${r.linked_last_run || 0} produto(s) ligado(s).`);
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível conferir agora.');
    } finally {
      setRunning(false);
      qc.invalidateQueries({ queryKey: key });
    }
  };

  const liberar = async () => {
    const { error } = await (supabase as any)
      .from('erp_stock_sync_state')
      .update({ paused_reason: null, safety_ack: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('erp', erp);
    if (error) toast.error(error.message);
    else { toast.success('Conferência liberada. O estoque do ERP passa a valer no Cartzy.'); qc.invalidateQueries({ queryKey: key }); }
  };

  const nome = NOMES[erp];
  const ultimoEstoque = [st?.last_event_at, st?.last_change_at].filter(Boolean).sort().pop() || null;
  const semAvisos = erp === 'bling' && (!st?.last_event_at || Date.now() - new Date(st.last_event_at).getTime() > DIA);
  const conferenciaAtrasada = !!st?.last_run_at && Date.now() - new Date(st.last_run_at).getTime() > 60 * 60 * 1000;
  const tudoCerto = st && !st.paused_reason && !st.last_error && !semAvisos && !conferenciaAtrasada && !(st.unlinked_count && st.unlinked_count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Saúde do estoque {nome} → Cartzy
        </CardTitle>
        <CardDescription>
          O Cartzy confere o saldo do {nome} a cada 15 minutos e corrige as diferenças sozinho
          {erp === 'bling' ? ', além de receber os avisos de estoque na hora' : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Último estoque recebido do {nome}: </span>
                <strong>{quando(ultimoEstoque)}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Última conferência automática: </span>
                <strong>{quando(st?.last_run_at ?? null)}</strong>
              </div>
              {erp === 'bling' && (
                <div>
                  <span className="text-muted-foreground">Último aviso do Bling: </span>
                  <strong>{quando(st?.last_event_at ?? null)}</strong>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Produtos sem ligação com o {nome}: </span>
                <strong>{st?.unlinked_count ?? '—'}</strong>
              </div>
              {st?.deposit_source === 'padrao_bling' || st?.deposit_source === 'padrao_erp' ? (
                <div className="sm:col-span-2 text-muted-foreground">
                  Nenhum depósito escolhido: usando o depósito padrão do {nome}.
                </div>
              ) : null}
            </div>

            {st?.paused_reason && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p><strong>Conferência pausada por segurança.</strong> {st.paused_reason}</p>
                  <Button size="sm" variant="outline" onClick={liberar}>Está certo, liberar a conferência</Button>
                </AlertDescription>
              </Alert>
            )}
            {st?.last_error && !st.paused_reason && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{st.last_error}</AlertDescription>
              </Alert>
            )}
            {semAvisos && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Nenhum aviso do Bling nas últimas 24 horas. Confira no aplicativo do Bling (aba Webhooks) se os avisos de
                  <strong> Estoque</strong> e <strong>Produto</strong> estão ligados para
                  {' '}<code className="text-xs">https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/bling-webhook</code>.
                  Enquanto isso, a conferência a cada 15 minutos mantém o estoque certo.
                </AlertDescription>
              </Alert>
            )}
            {conferenciaAtrasada && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>A última conferência foi há mais de 1 hora. Se continuar assim, avise o suporte.</AlertDescription>
              </Alert>
            )}
            {!!st?.unlinked_count && st.unlinked_count > 0 && (
              <p className="text-xs text-muted-foreground">
                Produtos sem ligação não recebem o estoque do {nome}. O Cartzy liga sozinho quando o SKU ERP ou o código do
                produto é igual ao código no {nome}; confira os que continuarem sem ligação.
              </p>
            )}
            {tudoCerto && (
              <p className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" /> Estoque sincronizando normalmente.
              </p>
            )}
            {!st && <p className="text-sm text-muted-foreground">A primeira conferência roda em até 15 minutos.</p>}

            <Button size="sm" variant="outline" onClick={conferirAgora} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Conferir agora
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
