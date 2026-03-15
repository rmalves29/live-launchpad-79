import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Send, Clock, Image, Music, Video, FileText, Loader2, Upload, X, Ban, Eye, Circle, Pencil } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contentType, setContentType] = useState<'text' | 'image' | 'audio' | 'video' | 'video_note'>('text');
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [contentText, setContentText] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendMode, setSendMode] = useState<'instant' | 'scheduled'>('instant');
  const [scheduledAt, setScheduledAt] = useState('');
  const [targetType, setTargetType] = useState<'groups' | 'campaign'>('groups');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [viewMessage, setViewMessage] = useState<any>(null);

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

  const acceptMap: Record<string, string> = {
    image: 'image/*',
    audio: 'audio/*',
    video: 'video/*',
    video_note: 'video/*',
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;

    setMediaFile(file);
    setUploading(true);

    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${tenant.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(path);

      setMediaUrl(urlData.publicUrl);
      toast({ title: 'Arquivo enviado com sucesso' });
    } catch (err: any) {
      toast({ title: 'Erro ao enviar arquivo', description: err.message, variant: 'destructive' });
      setMediaFile(null);
    }
    setUploading(false);
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cancelPendingMessage = async (messageId: string) => {
    const { error, count } = await supabase
      .from('fe_messages' as any)
      .delete({ count: 'exact' } as any)
      .eq('id', messageId)
      .eq('status', 'pending');

    if (error) {
      toast({ title: 'Erro ao cancelar', description: error.message, variant: 'destructive' });
      return;
    }

    if (!count) {
      toast({ title: 'A mensagem já começou a ser enviada', variant: 'destructive' });
      fetchData();
      return;
    }

    if (viewMessage?.id === messageId) {
      setViewMessage(null);
    }

    toast({ title: 'Envio cancelado' });
    fetchData();
  };

  const handleSend = async () => {
    if (!tenant) return;
    if (contentType === 'text' && !contentText.trim()) {
      toast({ title: 'Escreva uma mensagem', variant: 'destructive' });
      return;
    }

    if (contentType !== 'text' && !mediaUrl) {
      toast({ title: 'Anexe um arquivo para enviar', variant: 'destructive' });
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
        const { error: fnError } = await supabase.functions.invoke('fe-send-message', {
          body: {
            tenant_id: tenant.id,
            group_ids: targetGroupIds,
            content_type: contentType,
            content_text: contentText,
            media_url: mediaUrl,
          },
        });
        if (fnError) throw fnError;
      } else {
        // Trigger scheduled processor immediately so messages don't wait for cron
        const scheduledTime = new Date(scheduledAt).getTime();
        const now = Date.now();
        if (scheduledTime <= now + 60000) {
          // If scheduled within the next minute, trigger processor right away
          setTimeout(async () => {
            try {
              await supabase.functions.invoke('fe-process-scheduled', { body: {} });
            } catch (e) { console.warn('Auto-trigger fe-process-scheduled failed:', e); }
          }, Math.max(0, scheduledTime - now));
        }
      }

      toast({ title: sendMode === 'instant' ? 'Mensagens enviadas!' : 'Mensagens agendadas!' });
      setContentText('');
      clearMedia();
      setSelectedGroupIds([]);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err.message, variant: 'destructive' });
    }
    setSending(false);
  };

  const contentTypeIcon: Record<string, React.ReactNode> = {
    text: <FileText className="h-4 w-4" />,
    image: <Image className="h-4 w-4" />,
    audio: <Music className="h-4 w-4" />,
    video: <Video className="h-4 w-4" />,
    video_note: <Circle className="h-4 w-4" />,
  };

  const startEditMessage = (m: any) => {
    setEditingMessage(m);
    setContentType(m.content_type);
    setContentText(m.content_text || '');
    setMediaUrl(m.media_url || '');
    setSendMode(m.scheduled_at ? 'scheduled' : 'instant');
    if (m.scheduled_at) {
      const d = new Date(m.scheduled_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduledAt(local);
    }
    toast({ title: 'Editando mensagem pendente' });
  };

  const saveEditMessage = async () => {
    if (!editingMessage) return;
    setSending(true);
    try {
      const updateData: any = {
        content_type: contentType,
        content_text: contentText || null,
        media_url: mediaUrl || null,
        scheduled_at: sendMode === 'scheduled' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      };
      const { error } = await supabase.from('fe_messages' as any).update(updateData).eq('id', editingMessage.id).eq('status', 'pending');
      if (error) throw error;
      toast({ title: 'Mensagem atualizada!' });
      setEditingMessage(null);
      setContentText('');
      clearMedia();
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    }
    setSending(false);
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
        <Card>
          <CardContent className="pt-6 space-y-4">
            {/* Content type */}
            <div>
              <Label>Tipo de conteúdo</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {([
                  { key: 'text', label: 'Texto' },
                  { key: 'image', label: 'Imagem' },
                  { key: 'audio', label: 'Áudio' },
                  { key: 'video', label: 'Vídeo' },
                  { key: 'video_note', label: 'Vídeo Redondo' },
                ] as const).map(t => (
                  <Button key={t.key} variant={contentType === t.key ? 'default' : 'outline'} size="sm"
                    onClick={() => { setContentType(t.key); clearMedia(); }}>
                    {contentTypeIcon[t.key]}
                    <span className="ml-1">{t.label}</span>
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

            {/* File upload for media */}
            {contentType !== 'text' && (
              <div>
                <Label>{contentType === 'image' ? 'Imagem' : contentType === 'audio' ? 'Áudio' : 'Vídeo'}</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptMap[contentType]}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {mediaFile ? (
                  <div className="flex items-center gap-2 mt-1 p-3 rounded-lg border border-border bg-muted/30">
                    {contentTypeIcon[contentType]}
                    <span className="text-sm text-foreground truncate flex-1">{mediaFile.name}</span>
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearMedia}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button variant="outline" className="w-full mt-1" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    Selecionar {contentType === 'image' ? 'imagem' : contentType === 'audio' ? 'áudio' : 'vídeo'}
                  </Button>
                )}
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

            <Button onClick={handleSend} disabled={sending || uploading} className="w-full">
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
                    <div className="flex gap-1 mt-2">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewMessage(m)}>
                        <Eye className="h-3 w-3 mr-1" />Ver
                      </Button>
                      {m.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => cancelPendingMessage(m.id)}
                        >
                          <Ban className="h-3 w-3 mr-1" />Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View message dialog */}
        <Dialog open={!!viewMessage} onOpenChange={() => setViewMessage(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Detalhes da Mensagem</DialogTitle></DialogHeader>
            {viewMessage && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {contentTypeIcon[viewMessage.content_type as keyof typeof contentTypeIcon]}
                  <Badge className={statusColors[viewMessage.status] || ''}>{viewMessage.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(viewMessage.created_at).toLocaleString('pt-BR')}</span>
                </div>
                {viewMessage.content_text && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Mensagem</Label>
                    <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg mt-1">{viewMessage.content_text}</p>
                  </div>
                )}
                {viewMessage.media_url && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Mídia</Label>
                    {viewMessage.content_type === 'image' ? (
                      <img src={viewMessage.media_url} alt="Mídia" className="mt-1 rounded-lg max-h-64 object-contain" />
                    ) : viewMessage.content_type === 'video' ? (
                      <video src={viewMessage.media_url} controls className="mt-1 rounded-lg max-h-64" />
                    ) : viewMessage.content_type === 'audio' ? (
                      <audio src={viewMessage.media_url} controls className="mt-1 w-full" />
                    ) : (
                      <a href={viewMessage.media_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-1 block">{viewMessage.media_url}</a>
                    )}
                  </div>
                )}
                {viewMessage.scheduled_at && (
                  <p className="text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 inline mr-1" />
                    Agendado: {new Date(viewMessage.scheduled_at).toLocaleString('pt-BR')}
                  </p>
                )}
                {viewMessage.sent_at && (
                  <p className="text-xs text-muted-foreground">
                    <Send className="h-3 w-3 inline mr-1" />
                    Enviado: {new Date(viewMessage.sent_at).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
