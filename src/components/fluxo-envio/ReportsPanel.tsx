import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, MousePointerClick, Users, UserPlus, UserMinus } from 'lucide-react';

export default function ReportsPanel() {
  const { tenant } = useTenant();
  const [clicksCount, setClicksCount] = useState(0);
  const [joinsCount, setJoinsCount] = useState(0);
  const [leavesCount, setLeavesCount] = useState(0);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    // Get click count from campaigns
    const { data: campaigns } = await supabase
      .from('fe_campaigns' as any)
      .select('id')
      .eq('tenant_id', tenant.id);

    if (campaigns && campaigns.length > 0) {
      const campaignIds = (campaigns as any[]).map(c => c.id);
      const { count } = await supabase
        .from('fe_link_clicks' as any)
        .select('*', { count: 'exact', head: true })
        .in('campaign_id', campaignIds);
      setClicksCount(count || 0);
    }

    // Group events
    const { data: events } = await supabase
      .from('fe_group_events' as any)
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (events) {
      const evts = events as any[];
      setJoinsCount(evts.filter(e => e.event_type === 'join').length);
      setLeavesCount(evts.filter(e => e.event_type === 'leave').length);
      setRecentEvents(evts.slice(0, 20));
    }

    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando relatórios...</div>;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Relatórios</h3>

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
            <div className="p-3 rounded-xl bg-success/10">
              <UserPlus className="h-6 w-6 text-success" />
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

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eventos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado ainda</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {recentEvents.map((e: any) => (
                <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                  {e.event_type === 'join' ? (
                    <UserPlus className="h-4 w-4 text-success" />
                  ) : (
                    <UserMinus className="h-4 w-4 text-destructive" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{e.phone || 'Desconhecido'}</p>
                    <p className="text-xs text-muted-foreground">{e.group_jid}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
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
