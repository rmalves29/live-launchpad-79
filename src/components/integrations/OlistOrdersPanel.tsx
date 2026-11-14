/**
 * Olist ERP: envio de pedidos pagos (contato, endereço, itens, frete), nota fiscal e rastreio de volta.
 * Tudo vem desligado. "Enviar sozinho" manda o pedido à Olist assim que ele fica pago (a cada 2 minutos o Cartzy confere),
 * só pedidos pagos a partir do momento em que a opção é ligada.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Send, AlertTriangle, RefreshCw } from 'lucide-react';

type Settings = {
  send_orders: boolean; auto_send: boolean; order_situacao: number; issue_invoice: boolean; invoice_model: number; sync_tracking: boolean; send_from: string | null;
};
type Status = { pending: number; sent: number; errors_count: number; errors: Array<{ id: number; olist_sync_error: string }> };

const selectCls = 'h-10 rounded-md border bg-background px-3 text-sm';

export default function OlistOrdersPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string>('');
  const [orderId, setOrderId] = useState('');

  async function call(body: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase.functions.invoke('olist-orders', { body: { tenant_id: tenantId, ...body } });
    if (error) throw new Error((data as any)?.error || error.message || 'Erro ao falar com o servidor');
    if (data?.success === false && !data?.skipped) throw new Error(data?.error || 'A Olist recusou');
    return data;
  }

  const { data: cfg } = useQuery({
    queryKey: ['olist-order-settings', tenantId],
    queryFn: async () => ((await call({ action: 'settings' })).settings as Settings),
    enabled: !!tenantId, retry: false,
  });
  const { data: st, refetch: refetchStatus } = useQuery({
    queryKey: ['olist-order-status', tenantId],
    queryFn: async () => (await call({ action: 'status' })) as Status,
    enabled: !!tenantId && !!cfg, retry: false, refetchInterval: 60_000,
  });

  async function save(settings: Partial<Settings>) {
    try {
      const r = await call({ action: 'save_settings', settings });
      qc.setQueryData(['olist-order-settings', tenantId], r.settings);
      toast.success('Salvo.');
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setBusy(''); void refetchStatus(); }
  }

  const sendPending = () => run('pending', async () => {
    const r = await call({ action: 'send_pending' });
    toast.success(r.found ? `${r.sent} enviado(s) à Olist${r.failed ? `, ${r.failed} com erro` : ''}.` : 'Nenhum pedido pago pendente.');
    if (r.errors?.length) toast.error(r.errors[0]);
  });
  const sendOne = () => run('one', async () => {
    const id = Number(orderId);
    if (!id) { toast.error('Informe o número do pedido do Cartzy.'); return; }
    const r = await call({ action: 'send_order', order_id: id });
    if (r.reason === 'ja_enviado') toast.message('Esse pedido já foi enviado à Olist.');
    else if (r.success) toast.success(r.invoice?.ok ? 'Pedido enviado e nota emitida.' : 'Pedido enviado à Olist.');
    else toast.error(r.error || 'Não foi possível enviar.');
    if (r.invoice && !r.invoice.ok) toast.error(`Nota fiscal: ${r.invoice.error}`);
  });
  const syncTracking = () => run('track', async () => {
    const r = await call({ action: 'sync_tracking' });
    toast.success(`${r.checked} pedido(s) conferido(s), ${r.updated} com rastreio novo.`);
  });

  if (!cfg) return null;
  const sw = (label: string, hint: string, key: keyof Settings, disabled = false) => (
    <label className="flex items-start gap-3 text-sm">
      <Switch checked={!!cfg[key]} disabled={disabled} onCheckedChange={(v) => save({ [key]: v } as Partial<Settings>)} />
      <span><span className="font-medium">{label}</span><br /><span className="text-xs text-muted-foreground">{hint}</span></span>
    </label>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> Pedidos, nota fiscal e rastreio</CardTitle>
          {st && (
            <div className="flex gap-2">
              <Badge variant="secondary">{st.sent} enviados</Badge>
              <Badge variant={st.pending ? 'default' : 'secondary'}>{st.pending} pendentes</Badge>
              {st.errors_count > 0 && <Badge variant="destructive">{st.errors_count} com erro</Badge>}
            </div>
          )}
        </div>
        <CardDescription>
          Pedido pago no Cartzy vira pedido de venda na Olist (cliente, endereço, itens e frete). A Olist baixa o estoque; o Cartzy não baixa por fora.
          Tudo começa desligado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sw('Permitir enviar pedidos à Olist', 'Sem isso nada é enviado, nem manualmente.', 'send_orders')}
        {sw('Enviar sozinho quando o pedido ficar pago', 'O Cartzy confere a cada 2 minutos. Só entram pedidos pagos a partir de quando você liga esta opção.', 'auto_send', !cfg.send_orders)}
        {cfg.auto_send && cfg.send_from && <p className="text-xs text-muted-foreground pl-12">Enviando pedidos pagos desde {new Date(cfg.send_from).toLocaleString('pt-BR')}.</p>}
        {sw('Emitir a nota fiscal depois de enviar', 'Gera e autoriza a nota na Olist logo após o envio. Só ligue se o fiscal da Olist já está configurado.', 'issue_invoice', !cfg.send_orders)}
        {cfg.issue_invoice && (
          <div className="pl-12">
            <select className={selectCls} value={cfg.invoice_model} onChange={(e) => save({ invoice_model: Number(e.target.value) })}>
              <option value={55}>NF-e (modelo 55)</option>
              <option value={65}>NFC-e (modelo 65)</option>
            </select>
          </div>
        )}
        {sw('Trazer o rastreio de volta', 'Quando a Olist tiver o código de rastreio, o Cartzy grava no pedido (e avisa a cliente como já faz hoje).', 'sync_tracking', !cfg.send_orders)}

        <div className="flex items-center gap-3 text-sm pt-1">
          <span className="font-medium">Entra na Olist como</span>
          <select className={selectCls} value={cfg.order_situacao} disabled={!cfg.send_orders} onChange={(e) => save({ order_situacao: Number(e.target.value) })}>
            <option value={3}>Aprovado (baixa o estoque)</option>
            <option value={0}>Em aberto</option>
            <option value={4}>Preparando envio</option>
          </select>
        </div>

        {cfg.send_orders && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={sendPending} disabled={!!busy}>
                {busy === 'pending' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar pedidos pagos pendentes
              </Button>
              <Button variant="outline" onClick={syncTracking} disabled={!!busy}>
                {busy === 'track' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Buscar rastreios
              </Button>
              <Button variant="ghost" size="icon" onClick={() => refetchStatus()} aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-[220px]" placeholder="Nº do pedido (Cartzy)" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
              <Button variant="outline" onClick={sendOne} disabled={!!busy || !orderId.trim()}>
                {busy === 'one' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar este pedido
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">O botão de pendentes envia os pagos desde a data acima (ou de todo o histórico se o automático nunca foi ligado). Até 15 por clique.</p>
            {st && st.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Últimos erros (o Cartzy tenta de novo sozinho até 5 vezes):</p>
                  {st.errors.map((e) => <p key={e.id} className="text-xs">Pedido #{e.id}: {e.olist_sync_error}</p>)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
