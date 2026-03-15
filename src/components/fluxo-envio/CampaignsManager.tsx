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
import { Plus, Trash2, Link2, Users, Copy, Megaphone } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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

  useEffect(() => { fetchCampaigns(); fetchAllGroups(); }, [fetchCampaigns, fetchAllGroups]);

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
    // Refresh
    const { data } = await supabase
      .from('fe_campaign_groups' as any)
      .select('id, group_id')
      .eq('campaign_id', manageGroupsOpen);
    setCampaignGroups((data || []) as any);
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
      <Dialog open={!!manageGroupsOpen} onOpenChange={() => setManageGroupsOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Grupos da Campanha</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {allGroups.map(g => (
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
            {allGroups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum grupo cadastrado</p>
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead className="text-center">Entrada</TableHead>
                  <TableHead className="text-center">Ativa</TableHead>
                  <TableHead className="text-center">Link</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{c.name}</p>
                        {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                        <p className="text-xs text-muted-foreground font-mono">/{c.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={c.is_entry_open} onCheckedChange={() => toggleCampaignEntry(c)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={c.is_active} onCheckedChange={() => toggleCampaignActive(c)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" onClick={() => copyLink(c.slug)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => openManageGroups(c.id)}>
                          <Users className="h-4 w-4 mr-1" />Grupos
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteCampaign(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
