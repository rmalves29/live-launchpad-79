import { useEffect, useState } from 'react';
import { supabaseTenant } from '@/lib/supabase-tenant';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { History, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { formatBrasiliaDateTime } from '@/lib/date-utils';

interface MsgRow {
  id: number;
  batch_id: string | null;
  message: string | null;
  delivery_status: string | null;
  zapi_message_id: string | null;
  created_at: string;
  sent_at: string | null;
}

interface BatchSummary {
  key: string;
  batch_id: string | null;
  created_at: string;
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  preview: string;
  fullMessage: string;
}

const PREVIEW_LIMIT = 140;

function summarize(rows: MsgRow[]): BatchSummary[] {
  // group by batch_id, fallback: 10-min window
  const withBatch = new Map<string, MsgRow[]>();
  const noBatch: MsgRow[] = [];

  for (const r of rows) {
    if (r.batch_id) {
      const list = withBatch.get(r.batch_id) || [];
      list.push(r);
      withBatch.set(r.batch_id, list);
    } else {
      noBatch.push(r);
    }
  }

  // 10-min window grouping for legacy rows (rows sorted desc by created_at)
  noBatch.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const legacyGroups: MsgRow[][] = [];
  for (const r of noBatch) {
    const last = legacyGroups[legacyGroups.length - 1];
    if (last) {
      const lastTs = new Date(last[last.length - 1].created_at).getTime();
      const curTs = new Date(r.created_at).getTime();
      if (Math.abs(lastTs - curTs) <= 10 * 60 * 1000) {
        last.push(r);
        continue;
      }
    }
    legacyGroups.push([r]);
  }

  const summaries: BatchSummary[] = [];

  for (const [batchId, list] of withBatch.entries()) {
    summaries.push(makeSummary(batchId, list));
  }
  for (const list of legacyGroups) {
    summaries.push(makeSummary(null, list));
  }

  summaries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return summaries.slice(0, 5);
}

function makeSummary(batchId: string | null, list: MsgRow[]): BatchSummary {
  const total = list.length;
  let delivered = 0, failed = 0, pending = 0;
  for (const r of list) {
    const s = (r.delivery_status || '').toUpperCase();
    if (s === 'SENT' || s === 'DELIVERED' || s === 'READ' || s === 'PLAYED' || r.zapi_message_id) {
      delivered++;
    } else if (s === 'FAILED' || s === 'ERROR') {
      failed++;
    } else {
      pending++;
    }
  }
  const earliest = list.reduce((a, b) =>
    new Date(a.created_at).getTime() < new Date(b.created_at).getTime() ? a : b
  );
  const sample = list.find((r) => r.message)?.message || '';
  return {
    key: batchId || `legacy-${earliest.created_at}`,
    batch_id: batchId,
    created_at: earliest.created_at,
    total,
    delivered,
    failed,
    pending,
    preview: sample.length > PREVIEW_LIMIT ? sample.slice(0, PREVIEW_LIMIT) + '…' : sample,
    fullMessage: sample,
  };
}

export default function BulkSendHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const { tenant } = useTenant();
  const [summaries, setSummaries] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<BatchSummary | null>(null);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      // Pega últimas ~500 mensagens bulk para conseguir agrupar até 5 envios
      const { data, error } = await supabaseTenant
        .from('whatsapp_messages')
        .select('id, batch_id, message, delivery_status, zapi_message_id, created_at, sent_at')
        .eq('tenant_id', tenant.id)
        .eq('type', 'bulk')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      setSummaries(summarize((data || []) as MsgRow[]));
    } catch (e) {
      console.error('[BulkSendHistory] erro ao carregar:', e);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenant?.id, refreshKey]);

  const renderBadge = (s: BatchSummary) => {
    if (s.total === 0) return null;
    const deliveredRatio = s.delivered / s.total;
    if (s.delivered === s.total) {
      return <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Concluído</Badge>;
    }
    if (deliveredRatio < 0.5) {
      return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
    }
    return <Badge className="bg-amber-500 hover:bg-amber-500 text-white"><AlertTriangle className="w-3 h-3 mr-1" />Parcial</Badge>;
  };

  return (
    <>
      <Card className="rounded-2xl border-[#e5e7eb] shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-lg font-semibold">Últimos envios em massa</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading && summaries.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">Carregando…</div>
          )}
          {!loading && summaries.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Nenhum disparo de cobrança em massa registrado ainda.
            </div>
          )}
          {summaries.length > 0 && (
            <div className="space-y-3">
              {summaries.map((s) => (
                <div
                  key={s.key}
                  className="rounded-xl border border-[#e5e7eb] p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="text-sm font-medium">
                      {formatBrasiliaDateTime(s.created_at)}
                    </div>
                    {renderBadge(s)}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
                    <span><strong className="text-foreground">{s.total}</strong> destinatários</span>
                    <span className="text-green-700">✓ {s.delivered} entregues</span>
                    {s.pending > 0 && <span className="text-amber-600">⏳ {s.pending} pendentes</span>}
                    {s.failed > 0 && <span className="text-red-600">✗ {s.failed} falhas</span>}
                  </div>
                  {s.preview && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 whitespace-pre-wrap break-words">
                      {s.preview}
                      {s.fullMessage.length > PREVIEW_LIMIT && (
                        <button
                          type="button"
                          onClick={() => setModal(s)}
                          className="ml-1 text-primary underline underline-offset-2 hover:opacity-80"
                        >
                          ver completo
                        </button>
                      )}
                    </div>
                  )}
                  {!s.batch_id && (
                    <div className="mt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                      Envio antigo (agrupado por horário)
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!modal} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem enviada</DialogTitle>
          </DialogHeader>
          {modal && (
            <>
              <div className="text-xs text-muted-foreground mb-2">
                {formatBrasiliaDateTime(modal.created_at)} · {modal.total} destinatários
              </div>
              <div className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
                {modal.fullMessage}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
