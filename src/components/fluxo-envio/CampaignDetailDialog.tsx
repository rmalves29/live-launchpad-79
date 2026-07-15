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
import { Textarea } from '@/components/ui/textarea';
import {
  MousePointerClick, ArrowRightToLine, Percent, Users, Copy,
  CheckSquare, Square, Settings, LogOut, Sparkles, PlusCircle, Loader2,
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
  is_admin: boolean | null;
  invite_link: string | null;
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

  // Auto-clonagem de grupo
  const [autoSpawnEnabled, setAutoSpawnEnabled] = useState(false);
  const [spawnMargin, setSpawnMargin] = useState(3);
  const [templateNameBase, setTemplateNameBase] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateImageUrl, setTemplateImageUrl] = useState('');
  const [templateMaxParticipants, setTemplateMaxParticipants] = useState(1000);
  const [savingSpawn, setSavingSpawn] = useState(false);
  const [spawningNow, setSpawningNow] = useState(false);
  const fetchData = useCallback(async () => {
    if (!campaignId || !tenant) return;
    setLoading(true);

    try {
      const [{ data: cgData }, { data: gData }, { count: clickCount }, allEvents, { data: campData }] = await Promise.all([
        supabase
          .from('fe_campaign_groups' as any)
          .select('id, group_id')
          .eq('campaign_id', campaignId),
        supabase
          .from('fe_groups' as any)
          .select('id, group_jid, group_name, participant_count, max_participants, is_entry_open, is_active, is_admin, invite_link')
          .eq('tenant_id', tenant.id)
          .eq('is_admin', true)
          .eq('is_active', true)
          .order('group_name'),
        supabase
          .from('fe_link_clicks' as any)
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId),
        fetchAllTenantGroupEvents(tenant.id),
        supabase
          .from('fe_campaigns' as any)
          .select('facebook_pixel_id, auto_spawn_enabled, spawn_margin, group_template')
          .eq('id', campaignId)
          .maybeSingle(),
      ]);

      setFacebookPixelId((campData as any)?.facebook_pixel_id || '');
      setAutoSpawnEnabled((campData as any)?.auto_spawn_enabled ?? false);
      setSpawnMargin((campData as any)?.spawn_margin ?? 3);
      const tpl = (campData as any)?.group_template || {};
      setTemplateNameBase(tpl.name_base || campaignName);
      setTemplateDescription(tpl.description || '');
      setTemplateImageUrl(tpl.image_url || '');
      setTemplateMaxParticipants(tpl.max_participants || 1000);

      const cgs = (cgData || []) as CampaignGroup[];
      const groups = (gData || []) as FeGroup[];
      const visibleGroupIds = new Set(groups.map((group) => group.id));
      const visibleCampaignGroups = cgs.filter((campaignGroup) => visibleGroupIds.has(campaignGroup.group_id));

      setCampaignGroups(visibleCampaignGroups);
      setAllGroups(groups);
      setPendingGroupIds(new Set(visibleCampaignGroups.map(cg => cg.group_id)));
      setHasPendingChanges(false);

      const cgGroupIds = visibleCampaignGroups.map((campaignGroup) => campaignGroup.group_id);
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

  const savePixelId = async () => {
    if (!campaignId) return;
    setSavingPixel(true);
    await supabase
      .from('fe_campaigns' as any)
      .update({ facebook_pixel_id: facebookPixelId.trim() || null } as any)
      .eq('id', campaignId);
    toast({ title: 'Pixel do Facebook salvo!' });
    setSavingPixel(false);
  };

  const saveSpawnConfig = async () => {
    if (!campaignId) return;
    setSavingSpawn(true);
    try {
      const group_template = {
        name_base: templateNameBase.trim() || campaignName,
        description: templateDescription.trim() || null,
        image_url: templateImageUrl.trim() || null,
        max_participants: templateMaxParticipants || 1000,
      };
      const { error } = await supabase
        .from('fe_campaigns' as any)
        .update({
          auto_spawn_enabled: autoSpawnEnabled,
          spawn_margin: spawnMargin,
          group_template,
        } as any)
        .eq('id', campaignId);
      if (error) throw error;
      toast({ title: 'Configuração de auto-clonagem salva!' });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSpawn(false);
    }
  };

  const spawnGroupNow = async () => {
    if (!campaignId || !tenant) return;
    setSpawningNow(true);
    try {
      // Salva o molde atual antes de criar, para o grupo novo já sair com a config certa
      await supabase
        .from('fe_campaigns' as any)
        .update({
          group_template: {
            name_base: templateNameBase.trim() || campaignName,
            description: templateDescription.trim() || null,
            image_url: templateImageUrl.trim() || null,
            max_participants: templateMaxParticipants || 1000,
          },
        } as any)
        .eq('id', campaignId);

      const { data, error } = await supabase.functions.invoke('fe-spawn-group', {
        body: { tenant_id: tenant.id, campaign_id: campaignId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.skipped) {
        toast({ title: 'Aguarde um pouco', description: 'Um grupo foi criado há menos de 2 minutos.' });
      } else {
        toast({ title: 'Grupo criado!', description: data?.group_name });
        fetchData();
        onRefresh();
      }
    } catch (err: any) {
      toast({ title: 'Erro ao criar grupo', description: err.message, variant: 'destructive' });
    } finally {
      setSpawningNow(false);
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

            <div className="space-y-2 rounded-xl border border-border bg-muted/50 p-4">
              <Label className="text-sm font-semibold">ID do Pixel do Facebook</Label>
              <p className="text-xs text-muted-foreground">
                Insira o ID do Pixel para rastrear conversões (evento Lead) nos links de redirecionamento desta campanha.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Ex: 123456789012345"
                  value={facebookPixelId}
                  onChange={(e) => setFacebookPixelId(e.target.value)}
                  className="bg-background font-mono text-xs"
                />
                <Button size="sm" onClick={savePixelId} disabled={savingPixel} variant="default">
                  {savingPixel ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <Label className="text-sm font-semibold">Auto-clonagem de grupo</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Quando os grupos abertos desta campanha estiverem perto de lotar, um grupo novo é criado
                      automaticamente com o mesmo molde — o link nunca fica sem vaga.
                    </p>
                  </div>
                </div>
                <Switch checked={autoSpawnEnabled} onCheckedChange={setAutoSpawnEnabled} />
              </div>

              {autoSpawnEnabled && (
                <div className="space-y-3 pl-[30px]">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Criar novo grupo quando restarem</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={spawnMargin}
                          onChange={(e) => setSpawnMargin(Math.max(1, Number(e.target.value) || 1))}
                          className="bg-background"
                        />
                        <span className="whitespace-nowrap text-xs text-muted-foreground">vagas somadas</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Limite de participantes do clone</Label>
                      <Input
                        type="number"
                        min={1}
                        value={templateMaxParticipants}
                        onChange={(e) => setTemplateMaxParticipants(Math.max(1, Number(e.target.value) || 1000))}
                        className="bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Nome base do grupo clonado</Label>
                    <Input
                      placeholder={campaignName}
                      value={templateNameBase}
                      onChange={(e) => setTemplateNameBase(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Descrição do grupo (opcional)</Label>
                    <Textarea
                      placeholder="Descrição aplicada a cada grupo novo..."
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      className="bg-background"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">URL da imagem do grupo (opcional)</Label>
                    <Input
                      placeholder="https://..."
                      value={templateImageUrl}
                      onChange={(e) => setTemplateImageUrl(e.target.value)}
                      className="bg-background"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={spawnGroupNow} disabled={spawningNow}>
                      {spawningNow ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <PlusCircle className="mr-1 h-4 w-4" />
                      )}
                      Criar grupo agora
                    </Button>
                    <Button size="sm" onClick={saveSpawnConfig} disabled={savingSpawn}>
                      {savingSpawn ? 'Salvando...' : 'Salvar configuração'}
                    </Button>
                  </div>
                </div>
              )}
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
                          <div className="min-w-0">
                            <span className="truncate font-medium block">{group.group_name}</span>
                            {!group.invite_link && (
                              <span className="text-[11px] text-destructive">Falta adicionar o link</span>
                            )}
                          </div>
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