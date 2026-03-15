import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  MousePointerClick, ArrowRightToLine, Percent, Users, Copy,
  CheckSquare, Square, Settings, LogOut,
} from 'lucide-react';

interface CampaignDetailDialogProps {
  campaignId: string | null;
  campaignName: string;
  campaignSlug: string;
  onClose: () => void;
  onRefresh: () => void;
}

interface CampaignGroup {
  id: string;
  group_id: string;
}

interface FeGroup {
  id: string;
  group_name: string;
  participant_count: number;
  max_participants: number | null;
  is_entry_open: boolean;
  is_active: boolean;
}

interface Stats {
  clicks: number;
  entries: number;
  entryRate: number;
  exits: number;
  participants: number;
  totalGroups: number;
  fullGroups: number;
  availableGroups: number;
}

export default function CampaignDetailDialog({
  campaignId, campaignName, campaignSlug, onClose, onRefresh,
}: CampaignDetailDialogProps) {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({
    clicks: 0, entries: 0, entryRate: 0, exits: 0,
    participants: 0, totalGroups: 0, fullGroups: 0, availableGroups: 0,
  });
  const [campaignGroups, setCampaignGroups] = useState<CampaignGroup[]>([]);
  const [allGroups, setAllGroups] = useState<FeGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!campaignId || !tenant) return;
    setLoading(true);

    // Fetch campaign groups
    const { data: cgData } = await supabase
      .from('fe_campaign_groups' as any)
      .select('id, group_id')
      .eq('campaign_id', campaignId);
    const cgs = (cgData || []) as any as CampaignGroup[];
    setCampaignGroups(cgs);

    // Fetch all tenant groups
    const { data: gData } = await supabase
      .from('fe_groups' as any)
      .select('id, group_name, participant_count, max_participants, is_entry_open, is_active')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('group_name');
    const groups = (gData || []) as any as FeGroup[];
    setAllGroups(groups);

    // Compute stats
    const { count: clickCount } = await supabase
      .from('fe_link_clicks' as any)
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    const { count: entryCount } = await supabase
      .from('fe_link_clicks' as any)
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not('redirected_group_id', 'is', null);

    const cgGroupIds = cgs.map(c => c.group_id);
    const linkedGroups = groups.filter(g => cgGroupIds.includes(g.id));
    const totalParticipants = linkedGroups.reduce((s, g) => s + (g.participant_count || 0), 0);
    const fullGroups = linkedGroups.filter(g => g.max_participants && (g.participant_count || 0) >= g.max_participants).length;
    const availableGroups = linkedGroups.filter(g => g.is_entry_open && g.is_active && (!g.max_participants || (g.participant_count || 0) < g.max_participants)).length;

    const clicks = clickCount || 0;
    const entries = entryCount || 0;

    setStats({
      clicks,
      entries,
      entryRate: clicks > 0 ? (entries / clicks) * 100 : 0,
      exits: 0,
      participants: totalParticipants,
      totalGroups: linkedGroups.length,
      fullGroups,
      availableGroups,
    });

    setLoading(false);
  }, [campaignId, tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleGroupInCampaign = async (groupId: string) => {
    if (!campaignId) return;
    const existing = campaignGroups.find(cg => cg.group_id === groupId);
    if (existing) {
      await supabase.from('fe_campaign_groups' as any).delete().eq('id', existing.id);
    } else {
      await supabase.from('fe_campaign_groups' as any).insert({
        campaign_id: campaignId,
        group_id: groupId,
      } as any);
    }
    fetchData();
    onRefresh();
  };

  const getCampaignLink = () => {
    if (!tenant) return '';
    return `https://app.orderzaps.com/fluxo/${tenant.slug}/${campaignSlug}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(getCampaignLink());
    toast({ title: 'Link copiado!' });
  };

  const statCards = [
    { icon: MousePointerClick, value: stats.clicks.toLocaleString(), label: 'Clicks', color: 'text-primary' },
    { icon: ArrowRightToLine, value: stats.entries.toLocaleString(), label: 'Entraram', color: 'text-green-500' },
    { icon: Percent, value: stats.entryRate.toFixed(0), label: 'Percentual de entrada', color: 'text-yellow-500' },
    { icon: LogOut, value: stats.exits.toLocaleString(), label: 'Saíram', color: 'text-red-500' },
    { icon: Users, value: stats.participants.toLocaleString(), label: 'Participantes', color: 'text-primary' },
    { icon: Users, value: stats.totalGroups.toLocaleString(), label: 'Grupos', color: 'text-green-500' },
    { icon: CheckSquare, value: stats.fullGroups.toLocaleString(), label: 'Grupos cheios', color: 'text-yellow-500' },
    { icon: Square, value: stats.availableGroups.toLocaleString(), label: 'Grupos disponíveis', color: 'text-green-500' },
  ];

  return (
    <Dialog open={!!campaignId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{campaignName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {statCards.map((s, i) => (
                <div key={i} className="bg-muted/50 rounded-xl p-4 flex items-center gap-3 border border-border">
                  <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
                  <div>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Campaign Link */}
            <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-2">
              <Label className="text-sm font-semibold">Link de convite</Label>
              <div className="flex items-center gap-2">
                <Input value={getCampaignLink()} readOnly className="text-xs font-mono bg-background" />
                <Button size="sm" onClick={copyLink} variant="default">
                  <Copy className="h-4 w-4 mr-1" /> Copiar
                </Button>
              </div>
            </div>

            {/* Groups Manager */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Grupos vinculados ({campaignGroups.length})</Label>
                <Button size="sm" variant="outline" onClick={() => setShowGroupManager(!showGroupManager)}>
                  <Settings className="h-4 w-4 mr-1" /> {showGroupManager ? 'Fechar' : 'Gerenciar'}
                </Button>
              </div>

              {showGroupManager && (
                <div className="border border-border rounded-xl p-3 space-y-2">
                  <Input
                    placeholder="Buscar grupo por nome..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                  />
                  <div className="space-y-1 max-h-[250px] overflow-y-auto">
                    {allGroups
                      .filter(g => g.group_name.toLowerCase().includes(groupSearch.toLowerCase()))
                      .map(g => (
                        <div key={g.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <Checkbox
                            checked={campaignGroups.some(cg => cg.group_id === g.id)}
                            onCheckedChange={() => toggleGroupInCampaign(g.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{g.group_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {g.participant_count || 0} participantes
                              {g.max_participants ? ` / ${g.max_participants}` : ''}
                            </p>
                          </div>
                          {!g.is_entry_open && (
                            <Badge variant="outline" className="text-xs">Fechado</Badge>
                          )}
                        </div>
                      ))}
                    {allGroups.filter(g => g.group_name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum grupo encontrado</p>
                    )}
                  </div>
                </div>
              )}

              {/* Quick list of linked groups */}
              {!showGroupManager && campaignGroups.length > 0 && (
                <div className="space-y-1">
                  {allGroups
                    .filter(g => campaignGroups.some(cg => cg.group_id === g.id))
                    .map(g => (
                      <div key={g.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-sm">
                        <span className="font-medium truncate">{g.group_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {g.participant_count || 0}{g.max_participants ? `/${g.max_participants}` : ''} participantes
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
