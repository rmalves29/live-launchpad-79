import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ExternalLink, Radio } from 'lucide-react';
import { formatBrasiliaDateTime } from '@/lib/date-utils';

interface LiveRow {
  media_id: string;
  started_at: string | null;
  ended_at: string | null;
  last_seen_at: string | null;
  status: string | null;
  permalink: string | null;
}

interface CommentRow {
  media_id: string | null;
  instagram_user_id: string | null;
  product_code: string | null;
  comment_status: string | null;
  order_id: number | null;
  created_at: string;
}

interface LiveStats {
  media_id: string;
  startedAt: string | null;
  endedAt: string | null;
  status: string | null;
  permalink: string | null;
  totalComments: number;
  uniqueUsers: number;
  withCode: number;
  withOrder: number;
  revenue: number;
}

const formatDuration = (startIso: string | null, endIso: string | null) => {
  if (!startIso) return '—';
  const end = endIso ? new Date(endIso) : new Date();
  const ms = end.getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function InstagramLiveReport({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [lives, setLives] = useState<LiveRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [orderTotals, setOrderTotals] = useState<Record<number, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: liveRows } = await supabase
        .from('instagram_lives')
        .select('media_id, started_at, ended_at, last_seen_at, status, permalink')
        .eq('tenant_id', tenantId)
        .order('started_at', { ascending: false })
        .limit(30);

      const { data: commentRows } = await supabase
        .from('instagram_live_comments')
        .select('media_id, instagram_user_id, product_code, comment_status, order_id, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_live', true)
        .order('created_at', { ascending: false })
        .limit(5000);

      const orderIds = Array.from(
        new Set((commentRows || []).map((c: any) => c.order_id).filter((id: any) => !!id)),
      ) as number[];

      let totals: Record<number, number> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, total_amount')
          .eq('tenant_id', tenantId)
          .in('id', orderIds);
        for (const o of orders || []) {
          totals[o.id as number] = Number(o.total_amount) || 0;
        }
      }

      setLives((liveRows || []) as LiveRow[]);
      setComments((commentRows || []) as CommentRow[]);
      setOrderTotals(totals);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo<LiveStats[]>(() => {
    const byMedia = new Map<string, CommentRow[]>();
    for (const c of comments) {
      const key = c.media_id || 'sem-midia';
      const list = byMedia.get(key) || [];
      list.push(c);
      byMedia.set(key, list);
    }

    const knownIds = new Set(lives.map((l) => l.media_id));
    const extraIds = Array.from(byMedia.keys()).filter((id) => !knownIds.has(id));

    const build = (mediaId: string, live?: LiveRow): LiveStats => {
      const list = byMedia.get(mediaId) || [];
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const orderIds = new Set<number>();
      let withCode = 0;
      let withOrder = 0;
      const users = new Set<string>();
      for (const c of list) {
        if (c.product_code) withCode += 1;
        if (c.order_id) {
          withOrder += 1;
          orderIds.add(c.order_id);
        }
        if (c.instagram_user_id) users.add(c.instagram_user_id);
      }
      let revenue = 0;
      orderIds.forEach((id) => {
        revenue += orderTotals[id] || 0;
      });

      return {
        media_id: mediaId,
        startedAt: live?.started_at || sorted[0]?.created_at || null,
        endedAt: live?.ended_at || (live ? null : sorted[sorted.length - 1]?.created_at || null),
        status: live?.status || (live ? null : 'ENDED'),
        permalink: live?.permalink || null,
        totalComments: list.length,
        uniqueUsers: users.size,
        withCode,
        withOrder,
        revenue,
      };
    };

    const rows = [
      ...lives.map((l) => build(l.media_id, l)),
      ...extraIds.map((id) => build(id)),
    ];

    return rows
      .filter((r) => r.totalComments > 0 || r.status === 'LIVE')
      .sort(
        (a, b) =>
          new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime(),
      );
  }, [lives, comments, orderTotals]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Métricas por transmissão. O Instagram não disponibiliza o número de espectadores da live
          via API — usamos comentaristas únicos como referência de audiência.
        </p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <ScrollArea className="h-[420px] pr-3">
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Radio className="mb-3 h-10 w-10 opacity-40" />
            <p className="text-sm font-medium">Nenhuma live registrada ainda</p>
            <p className="mt-1 text-xs">
              As transmissões aparecem aqui automaticamente enquanto a sincronização roda.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {stats.map((live) => {
              const conversion =
                live.totalComments > 0
                  ? Math.round((live.withOrder / live.totalComments) * 100)
                  : 0;
              const isLive = live.status === 'LIVE' && !live.endedAt;

              return (
                <div key={live.media_id} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">
                      {live.startedAt ? formatBrasiliaDateTime(live.startedAt) : 'Início desconhecido'}
                    </span>
                    {isLive ? (
                      <Badge className="border border-red-200 bg-red-100 px-1.5 py-0 text-[10px] text-red-700">
                        AO VIVO
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        Encerrada
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Duração: {formatDuration(live.startedAt, live.endedAt)}
                    </span>
                    {live.permalink && (
                      <a
                        href={live.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver no Instagram
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Metric label="Comentários" value={String(live.totalComments)} />
                    <Metric label="Pessoas únicas" value={String(live.uniqueUsers)} />
                    <Metric label="Com código" value={String(live.withCode)} />
                    <Metric label="Geraram pedido" value={String(live.withOrder)} />
                    <Metric label="Conversão" value={`${conversion}%`} />
                    <Metric label="Valor gerado" value={formatCurrency(live.revenue)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
