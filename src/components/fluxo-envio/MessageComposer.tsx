import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Send, Clock, Image, Music, Video, FileText, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

interface FeGroup {
  id: string;
  group_name: string;
  group_jid: string;
}

interface FeCampaign {
  id: string;
  name: string;
}

export default function MessageComposer() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [groups, setGroups] = useState<FeGroup[]>([]);
  const [campaigns, setCampaigns] = useState<FeCampaign[]>([]);
  const [loading, setLoading] = useState(false);

  const [contentType, setContentType] = useState<'text' | 'image' | 'audio' | 'video'>('text');
  const [contentText, setContentText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [sendMode, setSendMode] = useState<'instant' | 'scheduled'>('instant');
  const [scheduledAt, setScheduledAt] = useState('');
  const [targetType, setTargetType] = useState<'groups' | 'campaign'>('groups');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [sending, setSending] = useState(false);

  // Messages history
  const [messages, setMessages] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    const [grp, cmp, msgs] = await Promise.all([
      supabase.from('fe_groups' as any).select('id, group_name, group_jid').eq('tenant_id', tenant.id).eq('is_active', true).order('group_name'),
      supabase.from('fe_campaigns' as any).select('id, name').eq('tenant_id', tenant.id).eq('is_active', true).order('name'),
      supabase.from('fe_messages' as any).select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (grp.data) setGroups(grp.data as any);
    if (cmp.data) setCampaigns(cmp.data as any);
    if (msgs.data) setMessages(msgs.data as any);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleGroup = (id: string) => {
    setSelectedGroupIds(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const handleSend = async () => {
    if (!tenant) return;
    if (!contentText && !mediaUrl) {
      toast({ title: 'Escreva uma mensagem ou adicione uma mídia', variant: 'destructive' });
      return;
    }

    let targetGroupIds: string[] = [];

    if (targetType === 'groups') {
      if (selectedGroupIds.length === 0) {
        toast({ title: 'Selecione pelo menos um grupo', variant: 'destructive' });
        return;
      }
      targetGroupIds = selectedGroupIds;
    } else {
      if (!selectedCampaignId) {
        toast({ title: 'Selecione uma campanha', variant: 'destructive' });
        return;
      }
      // Fetch campaign groups
      const { data: cgs } = await supabase
        .from('fe_campaign_groups' as any)
        .select('group_id')
        .eq('campaign_id', selectedCampaignId);
      targetGroupIds = (cgs || []).map((cg: any) => cg.group_id);
      if (targetGroupIds.length === 0) {
        toast({ title: 'Campanha sem grupos associados', variant: 'destructive' });
        return;
      }
    }

    if (sendMode === 'scheduled' && !scheduledAt) {
      toast({ title: 'Defina data/hora do agendamento', variant: 'destructive' });
      return;
    }

    setSending(true);

    try {
      // Create message records
      const messagesToInsert = targetGroupIds.map(gid => ({
        tenant_id: tenant.id,
        group_id: gid,
        campaign_id: targetType === 'campaign' ? selectedCampaignId : null,
        content_type: contentType,
        content_text: contentText || null,
        media_url: mediaUrl || null,
        status: sendMode === 'scheduled' ? 'pending' : 'sending',
        scheduled_at: sendMode === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
      }));

      const { error } = await supabase.from('fe_messages' as any).insert(messagesToInsert as any);
      if (error) throw error;

      if (sendMode === 'instant') {
        // Call edge function to send immediately
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        await fetch(`https://${projectId}.supabase.co/functions/v1/fe-send-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
          body: JSON.stringify({
            tenant_id: tenant.id,
            group_ids: targetGroupIds,
            content_type: contentType,
            content_text: contentText,
            media_url: mediaUrl,
          }),
        });
      }

      toast({ title: sendMode === 'instant' ? 'Mensagens enviadas!' : 'Mensagens agendadas!' });
      setContentText('');
      setMediaUrl('');
      setSelectedGroupIds([]);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    }
    setSending(false);
  };

  const contentTypeIcon = {
    text: <FileText className="h-4 w-4" />,
    image: <Image className="h-4 w-4" />,
    audio: <Music className="h-4 w-4" />,
    video: <Video className="h-4 w-4" />,
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    sending: 'bg-warning/20 text-warning',
    sent: 'bg-success/20 text-success',
    failed: 'bg-destructive/20 text-destructive',
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Envio de Mensagens</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composer */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Content type */}
            <div>
              <Label>Tipo de conteúdo</Label>
              <div className="flex gap-2 mt-1">
                {(['text', 'image', 'audio', 'video'] as const).map(t => (
                  <Button key={t} variant={contentType === t ? 'default' : 'outline'} size="sm"
                    onClick={() => setContentType(t)}>
                    {contentTypeIcon[t]}
                    <span className="ml-1 capitalize">{t === 'text' ? 'Texto' : t === 'image' ? 'Imagem' : t === 'audio' ? 'Áudio' : 'Vídeo'}</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Text */}
            <div>
              <Label>Mensagem</Label>
              <Textarea placeholder="Digite sua mensagem..." value={contentText}
                onChange={(e) => setContentText(e.target.value)} rows={4} />
            </div>

            {/* Media URL */}
            {contentType !== 'text' && (
              <div>
                <Label>URL da mídia</Label>
                <Input placeholder="https://..." value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)} />
              </div>
            )}

            {/* Target */}
            <div>
              <Label>Enviar para</Label>
              <Select value={targetType} onValueChange={(v: any) => setTargetType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="groups">Grupos específicos</SelectItem>
                  <SelectItem value="campaign">Campanha</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType === 'groups' ? (
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {groups.map(g => (
                  <div key={g.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                    <Checkbox checked={selectedGroupIds.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                    <span className="text-sm">{g.group_name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger><SelectValue placeholder="Selecione campanha" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {/* Send mode */}
            <div>
              <Label>Modo de envio</Label>
              <div className="flex gap-2 mt-1">
                <Button variant={sendMode === 'instant' ? 'default' : 'outline'} size="sm"
                  onClick={() => setSendMode('instant')}>
                  <Send className="h-4 w-4 mr-1" />Imediato
                </Button>
                <Button variant={sendMode === 'scheduled' ? 'default' : 'outline'} size="sm"
                  onClick={() => setSendMode('scheduled')}>
                  <Clock className="h-4 w-4 mr-1" />Agendado
                </Button>
              </div>
            </div>

            {sendMode === 'scheduled' && (
              <div>
                <Label>Data e hora</Label>
                <Input type="datetime-local" value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            )}

            <Button onClick={handleSend} disabled={sending} className="w-full">
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {sendMode === 'instant' ? 'Enviar Agora' : 'Agendar Envio'}
            </Button>
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardContent className="pt-6">
            <h4 className="font-medium mb-3 text-foreground">Histórico de Envios</h4>
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum envio realizado</p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {messages.map((m: any) => (
                  <div key={m.id} className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 mb-1">
                      {contentTypeIcon[m.content_type as keyof typeof contentTypeIcon]}
                      <Badge className={statusColors[m.status] || ''}>{m.status}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(m.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {m.content_text && <p className="text-sm text-foreground line-clamp-2">{m.content_text}</p>}
                    {m.scheduled_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Agendado: {new Date(m.scheduled_at).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
