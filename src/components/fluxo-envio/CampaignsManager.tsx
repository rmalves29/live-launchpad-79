import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Users, Copy, Megaphone, MousePointerClick, ArrowRightToLine, Percent, Settings } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface FeCampaign {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_entry_open: boolean;
  is_active: boolean;
  created_at: string;
}

interface FeGroup {
  id: string;
  group_name: string;
  participant_count: number;
  is_entry_open: boolean;
}

interface CampaignGroup {
  id: string;
  group_id: string;
  group_name?: string;
}

interface CampaignStats {
  clicks: number;
  entries: number;
  entryRate: number;
  groupCount: number;
}

export default function CampaignsManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<FeCampaign[]>([]);
  const [allGroups, setAllGroups] = useState<FeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [manageGroupsOpen, setManageGroupsOpen] = useState<string | null>(null);
  const [campaignGroups, setCampaignGroups] = useState<CampaignGroup[]>([]);
  const [newCampaign, setNewCampaign] = useState({ name: '', slug: '', description: '' });
  const [campaignStats, setCampaignStats] = useState<Record<string, CampaignStats>>({});
  const [campaignGroupCounts, setCampaignGroupCounts] = useState<Record<string, number>>({});

  const fetchCampaigns = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const { data } = await supabase
      .from('fe_campaigns' as any)
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false });
    if (data) setCampaigns(data as any);
    setLoading(false);
  }, [tenant]);

  const fetchAllGroups = useCallback(async () => {
    if (!tenant) return;
    const { data } = await supabase
      .from('fe_groups' as any)
      .select('id, group_name, participant_count, is_entry_open')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('group_name');
    if (data) setAllGroups(data as any);
  }, [tenant]);

  const fetchStats = useCallback(async () => {
    if (!tenant || campaigns.length === 0) return;

    const stats: Record<string, CampaignStats> = {};
    const groupCounts: Record<string, number> = {};

    for (const c of campaigns) {
      // Get clicks
      const { count: clickCount } = await supabase
        .from('fe_link_clicks' as any)
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id);

      // Get entries (clicks that resulted in a group redirect)
      const { count: entryCount } = await supabase
        .from('fe_link_clicks' as any)
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .not('redirected_group_id', 'is', null);

      // Get group count
      const { count: gCount } = await supabase
        .from('fe_campaign_groups' as any)
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id);

      const clicks = clickCount || 0;
      const entries = entryCount || 0;
      const entryRate = clicks > 0 ? (entries / clicks) * 100 : 0;

      stats[c.id] = { clicks, entries, entryRate, groupCount: gCount || 0 };
      groupCounts[c.id] = gCount || 0;
    }

    setCampaignStats(stats);
    setCampaignGroupCounts(groupCounts);
  }, [tenant, campaigns]);

  useEffect(() => { fetchCampaigns(); fetchAllGroups(); }, [fetchCampaigns, fetchAllGroups]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  const addCampaign = async () => {
    if (!tenant || !newCampaign.name || !newCampaign.slug) {
      toast({ title: 'Preencha nome e slug', variant: 'destructive' });
      return;
    }
    const { error } = await supabase
      .from('fe_campaigns' as any)
      .insert({
        tenant_id: tenant.id,
        name: newCampaign.name,
        slug: newCampaign.slug,
        description: newCampaign.description || null,
      } as any);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Campanha criada' });
      setNewCampaign({ name: '', slug: '', description: '' });
      setAddOpen(false);
      fetchCampaigns();
    }
  };

  const toggleCampaignEntry = async (c: FeCampaign) => {
    await supabase.from('fe_campaigns' as any).update({ is_entry_open: !c.is_entry_open } as any).eq('id', c.id);
    fetchCampaigns();
  };

  const toggleCampaignActive = async (c: FeCampaign) => {
    await supabase.from('fe_campaigns' as any).update({ is_active: !c.is_active } as any).eq('id', c.id);
    fetchCampaigns();
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Excluir esta campanha?')) return;
    await supabase.from('fe_campaigns' as any).delete().eq('id', id);
    fetchCampaigns();
  };

  const openManageGroups = async (campaignId: string) => {
    setManageGroupsOpen(campaignId);
    const { data } = await supabase
      .from('fe_campaign_groups' as any)
      .select('id, group_id')
      .eq('campaign_id', campaignId);
    setCampaignGroups((data || []) as any);
  };

  const toggleGroupInCampaign = async (groupId: string) => {
    if (!manageGroupsOpen) return;
    const existing = campaignGroups.find(cg => cg.group_id === groupId);
    if (existing) {
      await supabase.from('fe_campaign_groups' as any).delete().eq('id', existing.id);
    } else {
      await supabase.from('fe_campaign_groups' as any).insert({
        campaign_id: manageGroupsOpen,
        group_id: groupId,
      } as any);
    }
    const { data } = await supabase
      .from('fe_campaign_groups' as any)
      .select('id, group_id')
      .eq('campaign_id', manageGroupsOpen);
    setCampaignGroups((data || []) as any);
    fetchStats();
  };

  const getCampaignLink = (slug: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/fe-campaign-redirect?slug=${slug}`;
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(getCampaignLink(slug));
    toast({ title: 'Link copiado!' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Campanhas</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova Campanha</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input placeholder="Campanha Black Friday" value={newCampaign.name}
                  onChange={(e) => {
                    setNewCampaign(p => ({ ...p, name: e.target.value, slug: generateSlug(e.target.value) }));
                  }} />
              </div>
              <div>
                <Label>Slug (link)</Label>
                <Input value={newCampaign.slug}
                  onChange={(e) => setNewCampaign(p => ({ ...p, slug: e.target.value }))} />
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Textarea placeholder="Descrição da campanha..." value={newCampaign.description}
                  onChange={(e) => setNewCampaign(p => ({ ...p, description: e.target.value }))} />
              </div>
              <Button onClick={addCampaign} className="w-full">Criar Campanha</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Manage Groups Dialog */}
      <Dialog open={!!manageGroupsOpen} onOpenChange={() => { setManageGroupsOpen(null); setGroupSearch(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grupos da Campanha</DialogTitle></DialogHeader>
          <Input
            placeholder="Buscar grupo por nome..."
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            className="mb-2"
          />
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {allGroups
              .filter(g => g.group_name.toLowerCase().includes(groupSearch.toLowerCase()))
              .map(g => (
              <div key={g.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                <Checkbox
                  checked={campaignGroups.some(cg => cg.group_id === g.id)}
                  onCheckedChange={() => toggleGroupInCampaign(g.id)}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{g.group_name}</p>
                  <p className="text-xs text-muted-foreground">{g.participant_count} participantes</p>
                </div>
              </div>
            ))}
            {allGroups.filter(g => g.group_name.toLowerCase().includes(groupSearch.toLowerCase())).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum grupo encontrado</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma campanha criada</p>
            <p className="text-sm mt-1">Crie uma campanha para agrupar grupos e gerar links de entrada balanceados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const stats = campaignStats[c.id] || { clicks: 0, entries: 0, entryRate: 0, groupCount: 0 };
            return (
              <Card key={c.id} className="relative overflow-hidden border border-border hover:border-primary/40 transition-colors">
                <CardContent className="p-0">
                  {/* Stats bar */}
                  <div className="flex items-center gap-4 px-4 py-2 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1" title="Cliques">
                      <MousePointerClick className="h-3.5 w-3.5" />
                      {stats.clicks.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1" title="Entradas">
                      <ArrowRightToLine className="h-3.5 w-3.5" />
                      {stats.entries.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1" title="% de entrada">
                      <Percent className="h-3.5 w-3.5" />
                      {stats.entryRate.toFixed(2)}
                    </span>
                    <span className="flex items-center gap-1" title="Grupos">
                      <Users className="h-3.5 w-3.5" />
                      {stats.groupCount}
                    </span>
                  </div>

                  {/* Campaign info */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Status dot */}
                      <div className="mt-1">
                        <div className={`h-3 w-3 rounded-full ${c.is_active ? 'bg-green-500' : 'bg-destructive'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-foreground truncate">{c.name}</h4>
                        {c.description && (
                          <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">/{c.slug}</p>
                      </div>

                      {/* Arrow / navigate */}
                      <Button variant="ghost" size="icon" className="shrink-0" onClick={() => openManageGroups(c.id)}>
                        <Settings className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch checked={c.is_entry_open} onCheckedChange={() => toggleCampaignEntry(c)} />
                          Entrada
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch checked={c.is_active} onCheckedChange={() => toggleCampaignActive(c)} />
                          Ativa
                        </label>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => copyLink(c.slug)} title="Copiar link">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCampaign(c.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
