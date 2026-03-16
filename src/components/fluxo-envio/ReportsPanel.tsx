import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MousePointerClick, UserPlus, UserMinus, RefreshCw, TrendingUp, Calendar } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export default function ReportsPanel() {
  const { tenant } = useTenant();
  const [clicksCount, setClicksCount] = useState(0);
  const [joinsCount, setJoinsCount] = useState(0);
  const [leavesCount, setLeavesCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [recentClicks, setRecentClicks] = useState<any[]>([]);
  const [campaignStats, setCampaignStats] = useState<any[]>([]);
  const [groupStats, setGroupStats] = useState<any[]>([]);
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
    const since = getPeriodDate();

    // Campaigns for this tenant
    const { data: campaigns } = await supabase
      .from('fe_campaigns' as any)
      .select('id, name, slug')
      .eq('tenant_id', tenant.id);

    const campaignIds = (campaigns || []).map((c: any) => c.id);

    // Clicks
    if (campaignIds.length > 0) {
      const { data: clicks, count } = await supabase
        .from('fe_link_clicks' as any)
        .select('*', { count: 'exact' })
        .in('campaign_id', campaignIds)
        .gte('clicked_at', since)
        .order('clicked_at', { ascending: false })
        .limit(50);

      setClicksCount(count || 0);
      setRecentClicks((clicks || []) as any[]);

      // Per-campaign stats
      const stats = campaignIds.map((cid: string) => {
        const camp = (campaigns || []).find((c: any) => c.id === cid);
        const campClicks = ((clicks || []) as any[]).filter((cl: any) => cl.campaign_id === cid);
        return { id: cid, name: (camp as any)?.name || cid, clicks: campClicks.length };
      }).filter(s => s.clicks > 0).sort((a, b) => b.clicks - a.clicks);
      setCampaignStats(stats);
    } else {
      setClicksCount(0);
      setRecentClicks([]);
      setCampaignStats([]);
    }

    // Entries = clicks that resulted in a redirect (redirected_group_id not null)
    if (campaignIds.length > 0) {
      const { count: entriesCount } = await supabase
        .from('fe_link_clicks' as any)
        .select('id', { count: 'exact', head: true })
        .in('campaign_id', campaignIds)
        .not('redirected_group_id', 'is', null)
        .gte('clicked_at', since);
      setJoinsCount(entriesCount || 0);
    } else {
      setJoinsCount(0);
    }

    // Group events (leaves)
    const { data: events } = await supabase
      .from('fe_group_events' as any)
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    const evts = (events || []) as any[];
    const leaves = evts.filter(e => e.event_type === 'leave');
    setLeavesCount(leaves.length);
    setRecentEvents(evts.slice(0, 30));

    // Per-group stats
    const groupJids = [...new Set(evts.map(e => e.group_jid))];
    const { data: feGroups } = await supabase
      .from('fe_groups' as any)
      .select('id, group_jid, group_name')
      .eq('tenant_id', tenant.id);

    const gStats = groupJids.map(jid => {
      const grp = ((feGroups || []) as any[]).find(g => g.group_jid === jid);
      const gJoins = evts.filter(e => e.group_jid === jid && e.event_type === 'join').length;
      const gLeaves = evts.filter(e => e.group_jid === jid && e.event_type === 'leave').length;
      return { jid, name: grp?.group_name || jid, joins: gJoins, leaves: gLeaves, net: gJoins - gLeaves };
    }).sort((a, b) => b.net - a.net);
    setGroupStats(gStats);

    setLoading(false);
  }, [tenant, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Relatórios</h3>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px]">
              <Calendar className="h-4 w-4 mr-1" />
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10">
              <MousePointerClick className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{clicksCount}</p>
              <p className="text-sm text-muted-foreground">Clicks em links</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10">
              <UserPlus className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{joinsCount}</p>
              <p className="text-sm text-muted-foreground">Entradas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10">
              <UserMinus className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{leavesCount}</p>
              <p className="text-sm text-muted-foreground">Saídas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Stats */}
      {campaignStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Clicks por Campanha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {campaignStats.map((cs: any) => (
                <div key={cs.id} className="flex items-center justify-between p-2 rounded-lg border border-border">
                  <span className="text-sm font-medium text-foreground">{cs.name}</span>
                  <Badge variant="secondary">{cs.clicks} clicks</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Group Stats */}
      {groupStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Movimentação por Grupo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {groupStats.map((gs: any) => (
                <div key={gs.jid} className="flex items-center justify-between p-2 rounded-lg border border-border">
                  <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{gs.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <UserPlus className="h-3 w-3" />{gs.joins}
                    </span>
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <UserMinus className="h-3 w-3" />{gs.leaves}
                    </span>
                    <Badge variant={gs.net >= 0 ? 'default' : 'destructive'}>
                      {gs.net >= 0 ? '+' : ''}{gs.net}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado no período</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {recentEvents.map((e: any) => (
                <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                  {e.event_type === 'join' ? (
                    <UserPlus className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <UserMinus className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{e.phone || 'Desconhecido'}</p>
                    <p className="text-xs text-muted-foreground truncate">{e.group_jid}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleString('pt-BR')}
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
