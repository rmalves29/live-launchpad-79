import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MousePointerClick, UserPlus, UserMinus, RefreshCw, TrendingUp,
  Calendar, Percent, Download, Users, Sigma,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import ReportsCharts, { type TimelinePoint } from './ReportsCharts';

type PeriodKey = '24h' | '7d' | '30d' | '90d' | 'all';

interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  clicks: number;
  entries: number;
  exits: number;
  net: number;
  conversion: number;
}

interface GroupRow {
  id: string;
  jid: string;
  name: string;
  participants: number;
  entries: number;
  exits: number;
  net: number;
}

interface EventRow {
  id: string;
  event_type: string;
  phone: string | null;
  group_id: string | null;
  group_jid: string | null;
  group_name: string;
  campaign_name: string | null;
  created_at: string;
}

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: '24h', label: 'Últimas 24 horas' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o histórico' },
];

function periodSince(p: PeriodKey): string | null {
  if (p === 'all') return null;
  const now = Date.now();
  const map: Record<Exclude<PeriodKey, 'all'>, number> = {
    '24h': 24 * 3_600_000,
    '7d': 7 * 24 * 3_600_000,
    '30d': 30 * 24 * 3_600_000,
    '90d': 90 * 24 * 3_600_000,
  };
  return new Date(now - map[p]).toISOString();
}

function formatDateBR(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

async function fetchAllRange<T>(builder: () => any, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data || []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export default function ReportsPanel() {
  const { tenant } = useTenant();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [loading, setLoading] = useState(true);

  const [totals, setTotals] = useState({ clicks: 0, entries: 0, exits: 0 });
  const [campaignRows, setCampaignRows] = useState<CampaignRow[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [recentEvents, setRecentEvents] = useState<EventRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const since = periodSince(period);

      // 1. Base data (campanhas, grupos, vínculos) — leve
      const [{ data: campaignsData }, { data: groupsData }, { data: cgData }] = await Promise.all([
        supabase
          .from('fe_campaigns' as any)
          .select('id, name, slug')
          .eq('tenant_id', tenant.id),
        supabase
          .from('fe_groups' as any)
          .select('id, group_jid, group_name, participant_count, is_admin')
          .eq('tenant_id', tenant.id),
        supabase
          .from('fe_campaign_groups' as any)
          .select('campaign_id, group_id'),
      ]);

      const campaigns = (campaignsData || []) as any[];
      const allGroups = (groupsData || []) as any[];
      const links = (cgData || []) as any[];

      const campaignIds = campaigns.map((c) => c.id);
      const campaignById = new Map(campaigns.map((c) => [c.id, c]));
      const linkedGroupIds = new Set(
        links.filter((l) => campaignIds.includes(l.campaign_id)).map((l) => l.group_id),
      );

      // groupId -> campanhas às quais pertence
      const groupToCampaigns = new Map<string, string[]>();
      for (const l of links) {
        if (!campaignIds.includes(l.campaign_id)) continue;
        const arr = groupToCampaigns.get(l.group_id) || [];
        arr.push(l.campaign_id);
        groupToCampaigns.set(l.group_id, arr);
      }

      const groupsInCampaigns = allGroups.filter((g) => linkedGroupIds.has(g.id));
      const groupById = new Map(groupsInCampaigns.map((g) => [g.id, g]));
      const groupByJid = new Map(groupsInCampaigns.map((g) => [g.group_jid, g]));
      const groupIdList = groupsInCampaigns.map((g) => g.id);
      const groupJidList = groupsInCampaigns.map((g) => g.group_jid).filter(Boolean);

      // 2. Eventos filtrados por grupos vinculados às campanhas
      let events: any[] = [];
      if (groupIdList.length > 0 || groupJidList.length > 0) {
        const orFilter = [
          groupIdList.length > 0 ? `group_id.in.(${groupIdList.join(',')})` : null,
          groupJidList.length > 0 ? `group_jid.in.(${groupJidList.map((j) => `"${j}"`).join(',')})` : null,
        ].filter(Boolean).join(',');

        events = await fetchAllRange<any>(() => {
          let q: any = supabase
            .from('fe_group_events' as any)
            .select('id, event_type, phone, group_id, group_jid, created_at')
            .eq('tenant_id', tenant.id)
            .or(orFilter)
            .order('created_at', { ascending: false });
          if (since) q = q.gte('created_at', since);
          return q;
        });
      }

      // 3. Clicks
      let clicks: any[] = [];
      if (campaignIds.length > 0) {
        clicks = await fetchAllRange<any>(() => {
          let q: any = supabase
            .from('fe_link_clicks' as any)
            .select('campaign_id, clicked_at')
            .in('campaign_id', campaignIds)
            .order('clicked_at', { ascending: false });
          if (since) q = q.gte('clicked_at', since);
          return q;
        });
      }

      // 4. Agregações
      let totalEntries = 0;
      let totalExits = 0;
      const perCampaign = new Map<string, { entries: number; exits: number; clicks: number }>();
      const perGroup = new Map<string, { entries: number; exits: number }>();

      for (const c of campaigns) {
        perCampaign.set(c.id, { entries: 0, exits: 0, clicks: 0 });
      }

      for (const e of events) {
        const grp = (e.group_id && groupById.get(e.group_id))
          || (e.group_jid && groupByJid.get(e.group_jid));
        if (!grp) continue;

        const isJoin = e.event_type === 'join';
        const isLeave = e.event_type === 'leave';
        if (isJoin) totalEntries += 1;
        if (isLeave) totalExits += 1;

        const gAgg = perGroup.get(grp.id) || { entries: 0, exits: 0 };
        if (isJoin) gAgg.entries += 1;
        if (isLeave) gAgg.exits += 1;
        perGroup.set(grp.id, gAgg);

        const campIds = groupToCampaigns.get(grp.id) || [];
        for (const cid of campIds) {
          const cAgg = perCampaign.get(cid)!;
          if (isJoin) cAgg.entries += 1;
          if (isLeave) cAgg.exits += 1;
        }
      }

      for (const cl of clicks) {
        const cAgg = perCampaign.get(cl.campaign_id);
        if (cAgg) cAgg.clicks += 1;
      }

      // 5. Rankings
      const campaignRowsBuilt: CampaignRow[] = campaigns.map((c) => {
        const agg = perCampaign.get(c.id)!;
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          clicks: agg.clicks,
          entries: agg.entries,
          exits: agg.exits,
          net: agg.entries - agg.exits,
          conversion: agg.clicks > 0 ? (agg.entries / agg.clicks) * 100 : 0,
        };
      }).sort((a, b) => (b.clicks + b.entries) - (a.clicks + a.entries));

      const groupRowsBuilt: GroupRow[] = Array.from(perGroup.entries())
        .map(([gid, agg]) => {
          const grp = groupById.get(gid);
          return {
            id: gid,
            jid: grp?.group_jid || '',
            name: grp?.group_name || grp?.group_jid || gid,
            participants: grp?.participant_count || 0,
            entries: agg.entries,
            exits: agg.exits,
            net: agg.entries - agg.exits,
          };
        })
        .filter((r) => r.entries + r.exits > 0)
        .sort((a, b) => b.net - a.net);

      const recent: EventRow[] = events.slice(0, 50).map((e) => {
        const grp = (e.group_id && groupById.get(e.group_id))
          || (e.group_jid && groupByJid.get(e.group_jid));
        const campIds = grp ? (groupToCampaigns.get(grp.id) || []) : [];
        const campName = campIds.length > 0
          ? (campaignById.get(campIds[0]) as any)?.name || null
          : null;
        return {
          id: e.id,
          event_type: e.event_type,
          phone: e.phone,
          group_id: e.group_id,
          group_jid: e.group_jid,
          group_name: grp?.group_name || grp?.group_jid || 'Grupo desconhecido',
          campaign_name: campName,
          created_at: e.created_at,
        };
      });

      setTotals({ clicks: clicks.length, entries: totalEntries, exits: totalExits });
      setCampaignRows(campaignRowsBuilt);
      setGroupRows(groupRowsBuilt);
      setRecentEvents(recent);
    } finally {
      setLoading(false);
    }
  }, [tenant, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const conversion = useMemo(
    () => (totals.clicks > 0 ? (totals.entries / totals.clicks) * 100 : 0),
    [totals],
  );
  const net = totals.entries - totals.exits;

  const exportCsv = () => {
    const rows = [
      ['Tipo', 'Nome', 'Clicks', 'Entradas', 'Saídas', 'Saldo', 'Taxa conversão (%)'],
      ...campaignRows.map((c) => ['Campanha', c.name, c.clicks, c.entries, c.exits, c.net, c.conversion.toFixed(1)]),
      ...groupRows.map((g) => ['Grupo', g.name, '', g.entries, g.exits, g.net, '']),
    ];
    const csv = rows.map((r) => r.map((cell) => {
      const s = String(cell ?? '');
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-fluxo-envio-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kpiCards = [
    { icon: MousePointerClick, label: 'Clicks em links', value: totals.clicks, tone: 'primary' },
    { icon: UserPlus, label: 'Entradas em grupos', value: totals.entries, tone: 'primary' },
    { icon: UserMinus, label: 'Saídas de grupos', value: totals.exits, tone: 'destructive' },
    { icon: Sigma, label: 'Saldo líquido', value: (net >= 0 ? '+' : '') + net, tone: net >= 0 ? 'primary' : 'destructive' },
    { icon: Percent, label: 'Taxa de conversão', value: `${conversion.toFixed(1)}%`, tone: 'primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Relatórios</h3>
          <p className="text-sm text-muted-foreground">
            Desempenho consolidado das campanhas do Fluxo de Envio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="w-[190px]">
              <Calendar className="mr-1 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <div className={`rounded-xl p-3 ${k.tone === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                <k.icon className={`h-5 w-5 ${k.tone === 'destructive' ? 'text-destructive' : 'text-primary'}`} />
              </div>
              <div className="min-w-0">
                <p className={`text-xl font-bold ${k.tone === 'destructive' ? 'text-destructive' : 'text-foreground'}`}>
                  {loading ? '—' : k.value}
                </p>
                <p className="truncate text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ranking de Campanhas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Desempenho por Campanha
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaignRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {loading ? 'Carregando…' : 'Nenhuma campanha cadastrada.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Saídas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Conversão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignRows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.clicks}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.entries}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{c.exits}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={c.net >= 0 ? 'default' : 'destructive'}>
                          {c.net >= 0 ? '+' : ''}{c.net}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.clicks > 0 ? `${c.conversion.toFixed(1)}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Movimentação por Grupo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Movimentação por Grupo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {groupRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {loading ? 'Carregando…' : 'Nenhuma movimentação no período.'}
            </p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Grupo</TableHead>
                    <TableHead className="text-right">Participantes</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Saídas</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupRows.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="max-w-[260px] truncate font-medium">{g.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.participants}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.entries}</TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{g.exits}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant={g.net >= 0 ? 'default' : 'destructive'}>
                          {g.net >= 0 ? '+' : ''}{g.net}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Eventos Recentes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {loading ? 'Carregando…' : 'Nenhum evento registrado no período.'}
            </p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {recentEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                  {e.event_type === 'join' ? (
                    <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <UserMinus className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {e.phone || 'Contato desconhecido'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.group_name}{e.campaign_name ? ` • ${e.campaign_name}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateBR(e.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
