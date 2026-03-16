import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { fetchAllTenantGroupEvents, summarizeFlowEvents } from '@/lib/fluxo-envio-metrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MousePointerClick, UserPlus, UserMinus, RefreshCw, TrendingUp, Calendar } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type CampaignStat = {
  id: string;
  name: string;
  clicks: number;
};

type GroupStat = {
  jid: string;
  name: string;
  joins: number;
  leaves: number;
  net: number;
};

export default function ReportsPanel() {
  const { tenant } = useTenant();
  const [clicksCount, setClicksCount] = useState(0);
  const [joinsCount, setJoinsCount] = useState(0);
  const [leavesCount, setLeavesCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [campaignStats, setCampaignStats] = useState<CampaignStat[]>([]);
  const [groupStats, setGroupStats] = useState<GroupStat[]>([]);
  const [period, setPeriod] = useState('7d');
  const [loading, setLoading] = useState(true);

  const getPeriodDate = () => {
    const now = new Date();
    switch (period) {
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    try {
      const since = getPeriodDate();

      const [{ data: campaigns }, allEventsResult, { data: feGroups }, { data: campaignGroups }] = await Promise.all([
        supabase
          .from('fe_campaigns' as any)
          .select('id, name, slug')
          .eq('tenant_id', tenant.id),
        fetchAllTenantGroupEvents(tenant.id, since),
        supabase
          .from('fe_groups' as any)
          .select('id, group_jid, group_name')
          .eq('tenant_id', tenant.id),
        supabase
          .from('fe_campaign_groups' as any)
          .select('group_id')
          .then((res: any) => res),
      ]);

      // Only consider groups that belong to at least one campaign
      const campaignGroupIds = new Set(((campaignGroups?.data || campaignGroups || []) as any[]).map((cg: any) => cg.group_id));
      const campaignGroupJids = new Set(
        ((feGroups || []) as any[])
          .filter((g: any) => campaignGroupIds.has(g.id))
          .map((g: any) => g.group_jid)
      );

      const campaignIds = (campaigns || []).map((c: any) => c.id);
      const events = allEventsResult || [];

      // Filter events to only groups in campaigns
      const filteredEvents = events.filter((e) => {
        const matchId = !!e.group_id && campaignGroupIds.has(e.group_id);
        const matchJid = !!e.group_jid && campaignGroupJids.has(e.group_jid);
        return matchId || matchJid;
      });

      const summary = summarizeFlowEvents(filteredEvents);

      setJoinsCount(summary.entries);
      setLeavesCount(summary.exits);
      setRecentEvents(filteredEvents.slice(0, 30));

      if (campaignIds.length > 0) {
        const { data: clicks, count } = await supabase
          .from('fe_link_clicks' as any)
          .select('campaign_id, clicked_at', { count: 'exact' })
          .in('campaign_id', campaignIds)
          .gte('clicked_at', since)
          .order('clicked_at', { ascending: false })
          .limit(200);

        setClicksCount(count || 0);

        const stats = campaignIds.map((cid: string) => {
          const camp = (campaigns || []).find((c: any) => c.id === cid);
          const campClicks = ((clicks || []) as any[]).filter((cl: any) => cl.campaign_id === cid);
          return { id: cid, name: (camp as any)?.name || cid, clicks: campClicks.length };
        }).filter((stat) => stat.clicks > 0).sort((a, b) => b.clicks - a.clicks);

        setCampaignStats(stats);
      } else {
        setClicksCount(0);
        setCampaignStats([]);
      }

      const groupJids = [...new Set(filteredEvents.map((event) => event.group_jid).filter(Boolean))] as string[];
      const gStats = groupJids.map((jid) => {
        const grp = ((feGroups || []) as any[]).find((group) => group.group_jid === jid);
        const gJoins = filteredEvents.filter((event) => event.group_jid === jid && event.event_type === 'join').length;
        const gLeaves = filteredEvents.filter((event) => event.group_jid === jid && event.event_type === 'leave').length;
        return { jid, name: grp?.group_name || jid, joins: gJoins, leaves: gLeaves, net: gJoins - gLeaves };
      }).sort((a, b) => b.net - a.net);

      setGroupStats(gStats);
    } finally {
      setLoading(false);
    }
  }, [tenant, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Relatórios</h3>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px]">
              <Calendar className="mr-1 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-xl bg-primary/10 p-3">
              <MousePointerClick className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{clicksCount}</p>
              <p className="text-sm text-muted-foreground">Clicks em links</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-xl bg-primary/10 p-3">
              <UserPlus className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{joinsCount}</p>
              <p className="text-sm text-muted-foreground">Entradas reais</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-xl bg-destructive/10 p-3">
              <UserMinus className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{leavesCount}</p>
              <p className="text-sm text-muted-foreground">Saídas reais</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {campaignStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Clicks por Campanha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {campaignStats.map((campaignStat) => (
                <div key={campaignStat.id} className="flex items-center justify-between rounded-lg border border-border p-2">
                  <span className="text-sm font-medium text-foreground">{campaignStat.name}</span>
                  <Badge variant="secondary">{campaignStat.clicks} clicks</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {groupStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movimentação por Grupo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {groupStats.map((groupStat) => (
                <div key={groupStat.jid} className="flex items-center justify-between rounded-lg border border-border p-2">
                  <span className="max-w-[200px] truncate text-sm font-medium text-foreground">{groupStat.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <UserPlus className="h-3 w-3" />{groupStat.joins}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <UserMinus className="h-3 w-3" />{groupStat.leaves}
                    </span>
                    <Badge variant={groupStat.net >= 0 ? 'default' : 'destructive'}>
                      {groupStat.net >= 0 ? '+' : ''}{groupStat.net}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum evento registrado no período</p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {recentEvents.map((event: any) => (
                <div key={event.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                  {event.event_type === 'join' ? (
                    <UserPlus className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <UserMinus className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{event.phone || 'Desconhecido'}</p>
                    <p className="truncate text-xs text-muted-foreground">{event.group_jid}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString('pt-BR')}
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