import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { formatBrasiliaDateTime } from '@/lib/date-utils';
import {
  Activity,
  AlertTriangle,
  Crown,
  PackageX,
  Radio,
  RefreshCw,
  Repeat,
  Search,
  Send,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react';

interface LiveRow {
  media_id: string;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
}

interface CommentRow {
  media_id: string | null;
  instagram_user_id: string | null;
  username: string | null;
  product_code: string | null;
  comment_status: string | null;
  matched_qty: number | null;
  order_id: number | null;
  comment_id: string | null;
  created_at: string;
}

interface OrderRow {
  id: number;
  total_amount: number | null;
  is_cancelled: boolean | null;
}

interface DmRow {
  comment_id: string | null;
  status: string;
}

const SOLD = new Set(['added', 'repeat_added']);
const MISSED_LABEL: Record<string, string> = {
  out_of_stock: 'Estoque esgotado',
  not_found: 'Código não encontrado',
  not_for_live: 'Não cadastrado p/ Live',
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Empty({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground">
      <Icon className="mb-3 h-10 w-10 opacity-40" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs">{text}</p>
    </div>
  );
}

export default function InstagramLiveInsights({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [lives, setLives] = useState<LiveRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [orders, setOrders] = useState<Record<number, OrderRow>>({});
  const [dms, setDms] = useState<DmRow[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [selectedLive, setSelectedLive] = useState<string>('auto');
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [{ data: liveRows }, { data: commentRows }, { data: dmRows }] = await Promise.all([
          supabase
            .from('instagram_lives')
            .select('media_id, started_at, ended_at, status')
            .eq('tenant_id', tenantId)
            .order('started_at', { ascending: false })
            .limit(30),
          supabase
            .from('instagram_live_comments')
            .select(
              'media_id, instagram_user_id, username, product_code, comment_status, matched_qty, order_id, comment_id, created_at',
            )
            .eq('tenant_id', tenantId)
            .eq('is_live', true)
            .order('created_at', { ascending: false })
            .limit(5000),
          supabase
            .from('instagram_dm_log')
            .select('comment_id, status')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5000),
        ]);

        const cRows = (commentRows || []) as CommentRow[];
        const orderIds = Array.from(
          new Set(cRows.map((c) => c.order_id).filter((id): id is number => !!id)),
        );

        const orderMap: Record<number, OrderRow> = {};
        for (let i = 0; i < orderIds.length; i += 200) {
          const { data: ords } = await supabase
            .from('orders')
            .select('id, total_amount, is_cancelled')
            .eq('tenant_id', tenantId)
            .in('id', orderIds.slice(i, i + 200));
          for (const o of (ords || []) as OrderRow[]) orderMap[o.id] = o;
        }

        const codes = Array.from(
          new Set(cRows.map((c) => c.product_code).filter((c): c is string => !!c)),
        ).slice(0, 200);
        const names: Record<string, string> = {};
        if (codes.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('code, name')
            .eq('tenant_id', tenantId)
            .in('code', codes);
          for (const p of prods || []) names[String(p.code).toUpperCase()] = p.name as string;
        }

        setLives((liveRows || []) as LiveRow[]);
        setComments(cRows);
        setOrders(orderMap);
        setDms((dmRows || []) as DmRow[]);
        setProductNames(names);
        setNow(Date.now());
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tenantId],
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const activeLive = useMemo(
    () => lives.find((l) => l.status === 'LIVE' && !l.ended_at) || lives[0] || null,
    [lives],
  );
  const liveId = selectedLive === 'auto' ? activeLive?.media_id || 'all' : selectedLive;
  const isOngoing = !!activeLive && liveId === activeLive.media_id && activeLive.status === 'LIVE' && !activeLive.ended_at;

  const liveComments = useMemo(
    () => (liveId === 'all' ? comments : comments.filter((c) => c.media_id === liveId)),
    [comments, liveId],
  );

  const orderRevenue = useCallback(
    (ids: Set<number>) => {
      let total = 0;
      ids.forEach((id) => {
        const o = orders[id];
        if (o && !o.is_cancelled) total += Number(o.total_amount) || 0;
      });
      return total;
    },
    [orders],
  );

  // ---------------------------- Painel da live ----------------------------
  const panel = useMemo(() => {
    const sold = liveComments.filter((c) => SOLD.has(c.comment_status || ''));
    const withCode = liveComments.filter((c) => !!c.product_code);
    const buyers = new Set(sold.map((c) => c.instagram_user_id || c.username || ''));
    const orderIds = new Set(sold.map((c) => c.order_id).filter((id): id is number => !!id));
    const pieces = sold.reduce((sum, c) => sum + (c.matched_qty || 1), 0);

    const commentIds = new Set(liveComments.map((c) => c.comment_id).filter(Boolean));
    const dmRelevant = dms.filter((d) => d.comment_id && commentIds.has(d.comment_id));
    const dmSent = dmRelevant.filter((d) => d.status === 'sent').length;
    const dmFailed = dmRelevant.filter((d) => d.status === 'failed').length;

    // Comentários por minuto nos últimos 30 min.
    const buckets = Array.from({ length: 30 }, () => 0);
    for (const c of liveComments) {
      const minutesAgo = Math.floor((now - new Date(c.created_at).getTime()) / 60000);
      if (minutesAgo >= 0 && minutesAgo < 30) buckets[29 - minutesAgo] += 1;
    }
    const peak = Math.max(1, ...buckets);

    const byProduct = new Map<string, { code: string; qty: number; people: Set<string> }>();
    for (const c of sold) {
      if (!c.product_code) continue;
      const row = byProduct.get(c.product_code) || { code: c.product_code, qty: 0, people: new Set<string>() };
      row.qty += c.matched_qty || 1;
      row.people.add(c.instagram_user_id || c.username || '');
      byProduct.set(c.product_code, row);
    }
    const top = Array.from(byProduct.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    return {
      total: liveComments.length,
      withCode: withCode.length,
      sales: sold.length,
      pieces,
      buyers: buyers.size,
      revenue: orderRevenue(orderIds),
      conversion: withCode.length > 0 ? Math.round((sold.length / withCode.length) * 100) : 0,
      dmSent,
      dmFailed,
      buckets,
      peak,
      top,
    };
  }, [liveComments, dms, now, orderRevenue]);

  // ---------------------------- Ranking de compradores ----------------------------
  const buyers = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        username: string;
        pieces: number;
        orderIds: Set<number>;
        lives: Set<string>;
        last: string;
      }
    >();
    for (const c of comments) {
      if (!SOLD.has(c.comment_status || '')) continue;
      const key = c.instagram_user_id || c.username || '';
      if (!key) continue;
      const row = map.get(key) || {
        key,
        username: c.username || key,
        pieces: 0,
        orderIds: new Set<number>(),
        lives: new Set<string>(),
        last: c.created_at,
      };
      row.pieces += c.matched_qty || 1;
      if (c.order_id) row.orderIds.add(c.order_id);
      row.lives.add(c.media_id || 'sem-midia');
      if (c.created_at > row.last) row.last = c.created_at;
      if (c.username) row.username = c.username;
      map.set(key, row);
    }
    const term = search.trim().toLowerCase().replace(/^@/, '');
    return Array.from(map.values())
      .map((r) => ({ ...r, revenue: orderRevenue(r.orderIds) }))
      .filter((r) => !term || r.username.toLowerCase().includes(term))
      .sort((a, b) => b.revenue - a.revenue || b.pieces - a.pieces);
  }, [comments, search, orderRevenue]);

  const repeatBuyers = buyers.filter((b) => b.lives.size >= 2).length;

  // ---------------------------- Quase vendas ----------------------------
  const missed = useMemo(() => {
    const map = new Map<
      string,
      { code: string; status: string; attempts: number; people: Map<string, string>; last: string }
    >();
    for (const c of comments) {
      const status = c.comment_status || '';
      if (!MISSED_LABEL[status] || !c.product_code) continue;
      const key = `${c.product_code}|${status}`;
      const row = map.get(key) || {
        code: c.product_code,
        status,
        attempts: 0,
        people: new Map<string, string>(),
        last: c.created_at,
      };
      row.attempts += 1;
      row.people.set(c.instagram_user_id || c.username || '', c.username || '');
      if (c.created_at > row.last) row.last = c.created_at;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => {
      // esgotado primeiro (demanda real perdida), depois por tentativas
      const rank = (s: string) => (s === 'out_of_stock' ? 0 : s === 'not_for_live' ? 1 : 2);
      return rank(a.status) - rank(b.status) || b.attempts - a.attempts;
    });
  }, [comments]);

  const lostPeople = new Set(
    missed.filter((m) => m.status === 'out_of_stock').flatMap((m) => Array.from(m.people.keys())),
  ).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Atualiza sozinho a cada 15 segundos. O Instagram não informa espectadores da live pela API;
          usamos comentaristas como referência.
        </p>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="panel">
        <TabsList>
          <TabsTrigger value="panel" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Painel da live
          </TabsTrigger>
          <TabsTrigger value="buyers" className="flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5" />
            Compradores
          </TabsTrigger>
          <TabsTrigger value="missed" className="flex items-center gap-1.5">
            <PackageX className="h-3.5 w-3.5" />
            Quase vendas
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ PAINEL ------------------------------ */}
        <TabsContent value="panel" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedLive}
              onChange={(e) => setSelectedLive(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="auto">Live atual / mais recente</option>
              <option value="all">Todas as lives</option>
              {lives.map((l) => (
                <option key={l.media_id} value={l.media_id}>
                  {l.started_at ? formatBrasiliaDateTime(l.started_at) : l.media_id}
                  {l.status === 'LIVE' && !l.ended_at ? ' • ao vivo' : ''}
                </option>
              ))}
            </select>
            {isOngoing ? (
              <Badge className="gap-1 bg-red-500 text-white hover:bg-red-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                AO VIVO
              </Badge>
            ) : (
              <Badge variant="secondary">Encerrada</Badge>
            )}
          </div>

          {panel.total === 0 ? (
            <Empty
              icon={Radio}
              title="Nenhum comentário nesta live ainda"
              text="Assim que alguém comentar, as vendas, a receita e os produtos mais pedidos aparecem aqui."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi icon={ShoppingBag} label="Vendas registradas" value={panel.sales} hint={`${panel.pieces} peça(s)`} />
                <Kpi icon={Wallet} label="Receita" value={brl(panel.revenue)} hint="pedidos não cancelados" />
                <Kpi icon={Users} label="Compradores" value={panel.buyers} hint={`${panel.total} comentários`} />
                <Kpi
                  icon={Activity}
                  label="Conversão"
                  value={`${panel.conversion}%`}
                  hint={`${panel.sales} de ${panel.withCode} com código`}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Comentários por minuto (30 min)</span>
                    <span>pico: {panel.peak}</span>
                  </div>
                  <div className="flex h-20 items-end gap-0.5">
                    {panel.buckets.map((n, i) => (
                      <div
                        key={i}
                        title={`${n} comentário(s)`}
                        className="flex-1 rounded-t bg-primary/70"
                        style={{ height: `${Math.max(n > 0 ? 6 : 2, (n / panel.peak) * 100)}%`, opacity: n > 0 ? 1 : 0.2 }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <div className="mb-2 text-xs text-muted-foreground">Mais pedidos</div>
                  {panel.top.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sem vendas ainda.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {panel.top.map((p, i) => (
                        <li key={p.code} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                            <code className="rounded bg-muted px-1">{p.code}</code>{' '}
                            <span className="text-muted-foreground">{productNames[p.code.toUpperCase()] || ''}</span>
                          </span>
                          <Badge variant="secondary">
                            {p.qty}x · {p.people.size} pessoa(s)
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
                <Send className="h-4 w-4 text-muted-foreground" />
                <span>
                  DMs enviadas: <strong>{panel.dmSent}</strong>
                </span>
                <span className={panel.dmFailed > 0 ? 'font-medium text-red-600' : 'text-muted-foreground'}>
                  Falhas: <strong>{panel.dmFailed}</strong>
                </span>
                {panel.dmFailed > 0 && (
                  <span className="text-xs text-muted-foreground">
                    (veja o motivo na tabela instagram_dm_log — token expirado e janela de resposta são os casos comuns)
                  </span>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* ---------------------------- COMPRADORES ---------------------------- */}
        <TabsContent value="buyers" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{buyers.length} compradores</Badge>
              <Badge className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100">
                <Repeat className="h-3 w-3" />
                {repeatBuyers} recompraram (2+ lives)
              </Badge>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar @usuário"
                className="h-9 w-56 pl-8"
              />
            </div>
          </div>

          {buyers.length === 0 ? (
            <Empty
              icon={Crown}
              title="Nenhum comprador ainda"
              text="Quem tiver um comentário convertido em venda aparece aqui, ordenado por valor comprado."
            />
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <div className="space-y-2">
                {buyers.map((b, i) => (
                  <div key={b.key} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-6 text-center text-sm font-semibold text-muted-foreground">
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">@{b.username.replace(/^@/, '')}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.pieces} peça(s) · {b.orderIds.size} pedido(s) · última compra{' '}
                          {formatBrasiliaDateTime(b.last)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {b.lives.size >= 2 && (
                        <Badge className="gap-1 bg-blue-100 text-blue-800 hover:bg-blue-100">
                          <Repeat className="h-3 w-3" />
                          {b.lives.size} lives
                        </Badge>
                      )}
                      <span className="text-sm font-semibold tabular-nums">{brl(b.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* ---------------------------- QUASE VENDAS ---------------------------- */}
        <TabsContent value="missed" className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Comentários com código que <strong>não viraram venda</strong>. Estoque esgotado é demanda real
              perdida: <strong>{lostPeople}</strong> pessoa(s) queriam peças que acabaram. Vale repor ou avisar.
            </span>
          </div>

          {missed.length === 0 ? (
            <Empty
              icon={PackageX}
              title="Nenhuma venda perdida"
              text="Quando um código esgotar, não existir ou não estiver cadastrado para live, ele aparece aqui."
            />
          ) : (
            <ScrollArea className="h-[420px] pr-3">
              <div className="space-y-2">
                {missed.map((m) => (
                  <div key={`${m.code}|${m.status}`} className="rounded-lg border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{m.code}</code>
                        <span className="text-sm text-muted-foreground">
                          {productNames[m.code.toUpperCase()] || ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            m.status === 'out_of_stock'
                              ? 'bg-red-100 text-red-800 hover:bg-red-100'
                              : m.status === 'not_for_live'
                                ? 'bg-purple-100 text-purple-800 hover:bg-purple-100'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-100'
                          }
                        >
                          {MISSED_LABEL[m.status]}
                        </Badge>
                        <Badge variant="secondary">
                          {m.attempts}x · {m.people.size} pessoa(s)
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      {Array.from(m.people.values())
                        .filter(Boolean)
                        .slice(0, 8)
                        .map((u) => `@${u.replace(/^@/, '')}`)
                        .join(', ')}
                      {m.people.size > 8 ? ` e mais ${m.people.size - 8}` : ''} · último{' '}
                      {formatBrasiliaDateTime(m.last)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
