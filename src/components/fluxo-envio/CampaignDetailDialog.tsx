import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { fetchAllTenantGroupEvents, summarizeFlowEvents } from '@/lib/fluxo-envio-metrics';
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
  group_jid: string;
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
  const [pendingGroupIds, setPendingGroupIds] = useState<Set<string>>(new Set());
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [facebookPixelId, setFacebookPixelId] = useState('');
  const [savingPixel, setSavingPixel] = useState(false);
  const fetchData = useCallback(async () => {
    if (!campaignId || !tenant) return;
    setLoading(true);

    try {
      const [{ data: cgData }, { data: gData }, { count: clickCount }, allEvents] = await Promise.all([
        supabase
          .from('fe_campaign_groups' as any)
          .select('id, group_id')
          .eq('campaign_id', campaignId),
        supabase
          .from('fe_groups' as any)
          .select('id, group_jid, group_name, participant_count, max_participants, is_entry_open, is_active')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .order('group_name'),
        supabase
          .from('fe_link_clicks' as any)
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId),
        fetchAllTenantGroupEvents(tenant.id),
      ]);

      const cgs = (cgData || []) as CampaignGroup[];
      const groups = (gData || []) as FeGroup[];
      setCampaignGroups(cgs);
      setAllGroups(groups);
      setPendingGroupIds(new Set(cgs.map(cg => cg.group_id)));
      setHasPendingChanges(false);

      const cgGroupIds = cgs.map((campaignGroup) => campaignGroup.group_id);
      const linkedGroups = groups.filter((group) => cgGroupIds.includes(group.id));
      const totalParticipants = linkedGroups.reduce((sum, group) => sum + (group.participant_count || 0), 0);
      const fullGroups = linkedGroups.filter((group) => group.max_participants && (group.participant_count || 0) >= group.max_participants).length;
      const availableGroups = linkedGroups.filter((group) => group.is_entry_open && group.is_active && (!group.max_participants || (group.participant_count || 0) < group.max_participants)).length;
      const eventSummary = summarizeFlowEvents(allEvents || [], linkedGroups.map((group) => ({ id: group.id, group_jid: group.group_jid })));

      const clicks = clickCount || 0;
      const entries = eventSummary.entries || 0;
      const exits = eventSummary.exits || 0;

      setStats({
        clicks,
        entries,
        entryRate: clicks > 0 ? (entries / clicks) * 100 : 0,
        exits,
        participants: totalParticipants,
        totalGroups: linkedGroups.length,
        fullGroups,
        availableGroups,
      });
    } finally {
      setLoading(false);
    }
  }, [campaignId, tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleGroupLocally = (groupId: string) => {
    setPendingGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
    setHasPendingChanges(true);
  };

  const saveGroupChanges = async () => {
    if (!campaignId) return;
    setSaving(true);
    try {
      // Remove all existing links
      await supabase.from('fe_campaign_groups' as any).delete().eq('campaign_id', campaignId);

      // Insert new links
      if (pendingGroupIds.size > 0) {
        const inserts = Array.from(pendingGroupIds).map(groupId => ({
          campaign_id: campaignId,
          group_id: groupId,
        }));
        await supabase.from('fe_campaign_groups' as any).insert(inserts as any);
      }

      toast({ title: 'Grupos salvos com sucesso!' });
      setHasPendingChanges(false);
      fetchData();
      onRefresh();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleEntryOpen = async (group: FeGroup) => {
    const newValue = !group.is_entry_open;
    await supabase
      .from('fe_groups' as any)
      .update({ is_entry_open: newValue } as any)
      .eq('id', group.id);
    setAllGroups(prev => prev.map(g => g.id === group.id ? { ...g, is_entry_open: newValue } : g));
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
    { icon: ArrowRightToLine, value: stats.entries.toLocaleString(), label: 'Entraram', color: 'text-primary' },
    { icon: Percent, value: stats.entryRate.toFixed(0), label: 'Percentual de entrada', color: 'text-primary' },
    { icon: LogOut, value: stats.exits.toLocaleString(), label: 'Saíram', color: 'text-destructive' },
    { icon: Users, value: stats.participants.toLocaleString(), label: 'Participantes', color: 'text-primary' },
    { icon: Users, value: stats.totalGroups.toLocaleString(), label: 'Grupos', color: 'text-primary' },
    { icon: CheckSquare, value: stats.fullGroups.toLocaleString(), label: 'Grupos cheios', color: 'text-primary' },
    { icon: Square, value: stats.availableGroups.toLocaleString(), label: 'Grupos disponíveis', color: 'text-primary' },
  ];

  return (
    <Dialog open={!!campaignId} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{campaignName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statCards.map((statCard, index) => (
                <div key={index} className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
                  <statCard.icon className={`h-5 w-5 shrink-0 ${statCard.color}`} />
                  <div>
                    <p className={`text-xl font-bold ${statCard.color}`}>{statCard.value}</p>
                    <p className="text-xs text-muted-foreground">{statCard.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-muted/50 p-4">
              <Label className="text-sm font-semibold">Link de convite</Label>
              <div className="flex items-center gap-2">
                <Input value={getCampaignLink()} readOnly className="bg-background font-mono text-xs" />
                <Button size="sm" onClick={copyLink} variant="default">
                  <Copy className="mr-1 h-4 w-4" /> Copiar
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Grupos vinculados ({campaignGroups.length})</Label>
                <Button size="sm" variant="outline" onClick={() => setShowGroupManager(!showGroupManager)}>
                  <Settings className="mr-1 h-4 w-4" /> {showGroupManager ? 'Fechar' : 'Gerenciar'}
                </Button>
              </div>

              {showGroupManager && (
                <div className="space-y-2 rounded-xl border border-border p-3">
                  <Input
                    placeholder="Buscar grupo por nome..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                  />
                  <div className="max-h-[250px] space-y-1 overflow-y-auto">
                    {allGroups
                      .filter((group) => group.group_name.toLowerCase().includes(groupSearch.toLowerCase()))
                      .map((group) => (
                        <div key={group.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50">
                          <Checkbox
                            checked={pendingGroupIds.has(group.id)}
                            onCheckedChange={() => toggleGroupLocally(group.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{group.group_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {group.participant_count || 0} participantes
                              {group.max_participants ? ` / ${group.max_participants}` : ''}
                            </p>
                          </div>
                          {!group.is_entry_open && (
                            <Badge variant="outline" className="text-xs">Fechado</Badge>
                          )}
                        </div>
                      ))}
                    {allGroups.filter((group) => group.group_name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && (
                      <p className="py-4 text-center text-sm text-muted-foreground">Nenhum grupo encontrado</p>
                    )}
                  </div>
                  {hasPendingChanges && (
                    <div className="flex justify-end pt-2 border-t border-border">
                      <Button size="sm" onClick={saveGroupChanges} disabled={saving}>
                        {saving ? 'Salvando...' : `Salvar (${pendingGroupIds.size} grupos)`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!showGroupManager && campaignGroups.length > 0 && (
                <div className="space-y-1">
                  {allGroups
                    .filter((group) => campaignGroups.some((campaignGroup) => campaignGroup.group_id === group.id))
                    .map((group) => (
                      <div key={group.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-2 text-sm">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <Switch
                            checked={group.is_entry_open}
                            onCheckedChange={() => toggleEntryOpen(group)}
                            title="Enviar pessoas para este grupo"
                          />
                          <span className="truncate font-medium">{group.group_name}</span>
                        </div>
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {group.participant_count || 0}/{group.max_participants || 1024} participantes
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