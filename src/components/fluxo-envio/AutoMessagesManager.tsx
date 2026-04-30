import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, UserPlus, UserMinus, MessageSquare, Upload, X, Pencil } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

interface AutoMessage {
  id: string;
  tenant_id: string;
  group_id: string | null;
  campaign_id: string | null;
  event_type: string;
  content_type: string;
  content_text: string | null;
  media_url: string | null;
  is_active: boolean;
}

interface FeGroup {
  id: string;
  group_name: string;
}

interface FeCampaign {
  id: string;
  name: string;
}

interface FormState {
  event_type: string;
  content_type: string;
  content_text: string;
  media_url: string;
  scope_type: 'all' | 'group' | 'campaign';
  scope_id: string;
}

const defaultForm: FormState = {
  event_type: 'join',
  content_type: 'text',
  content_text: '',
  media_url: '',
  scope_type: 'all',
  scope_id: '',
};

export default function AutoMessagesManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [autoMessages, setAutoMessages] = useState<AutoMessage[]>([]);
  const [groups, setGroups] = useState<FeGroup[]>([]);
  const [campaigns, setCampaigns] = useState<FeCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>({ ...defaultForm });

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const [{ data: msgs }, { data: grps }, { data: camps }] = await Promise.all([
      supabase
        .from('fe_auto_messages' as any)
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fe_groups' as any)
        .select('id, group_name')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('group_name'),
      supabase
        .from('fe_campaigns' as any)
        .select('id, name')
        .eq('tenant_id', tenant.id)
        .order('name'),
    ]);

    if (msgs) setAutoMessages(msgs as any);
    if (grps) setGroups(grps as any);
    if (camps) setCampaigns(camps as any);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: 'Formato inválido', description: 'Use JPG, PNG, WebP ou GIF', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 5MB', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${tenant.id}/auto-messages/${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('product-images')
      .upload(path, file, { upsert: true });

    if (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } else {
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      setForm(p => ({ ...p, media_url: urlData.publicUrl }));
      toast({ title: 'Imagem enviada!' });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm });
    setDialogOpen(true);
  };

  const openEdit = (msg: AutoMessage) => {
    setEditingId(msg.id);
    let scope_type: 'all' | 'group' | 'campaign' = 'all';
    let scope_id = '';
    if (msg.campaign_id) {
      scope_type = 'campaign';
      scope_id = msg.campaign_id;
    } else if (msg.group_id) {
      scope_type = 'group';
      scope_id = msg.group_id;
    }
    setForm({
      event_type: msg.event_type,
      content_type: msg.content_type,
      content_text: msg.content_text || '',
      media_url: msg.media_url || '',
      scope_type,
      scope_id,
    });
    setDialogOpen(true);
  };

  const saveAutoMessage = async () => {
    if (!tenant || !form.content_text.trim()) {
      toast({ title: 'Preencha o texto da mensagem', variant: 'destructive' });
      return;
    }
    if (form.content_type === 'image' && !form.media_url) {
      toast({ title: 'Anexe uma imagem', variant: 'destructive' });
      return;
    }
    if (form.scope_type !== 'all' && !form.scope_id) {
      toast({ title: `Selecione um ${form.scope_type === 'group' ? 'grupo' : 'campanha'}`, variant: 'destructive' });
      return;
    }

    const payload = {
      tenant_id: tenant.id,
      event_type: form.event_type,
      content_type: form.content_type,
      content_text: form.content_text,
      media_url: form.media_url || null,
      group_id: form.scope_type === 'group' ? form.scope_id : null,
      campaign_id: form.scope_type === 'campaign' ? form.scope_id : null,
      is_active: true,
    } as any;

    let error;
    if (editingId) {
      const { tenant_id, ...updatePayload } = payload;
      ({ error } = await supabase.from('fe_auto_messages' as any).update(updatePayload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('fe_auto_messages' as any).insert(payload));
    }

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editingId ? 'Automação atualizada' : 'Automação criada' });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...defaultForm });
      fetchData();
    }
  };

  const toggleActive = async (msg: AutoMessage) => {
    await supabase
      .from('fe_auto_messages' as any)
      .update({ is_active: !msg.is_active } as any)
      .eq('id', msg.id);
    fetchData();
  };

  const deleteMsg = async (id: string) => {
    if (!confirm('Remover esta mensagem automática?')) return;
    await supabase.from('fe_auto_messages' as any).delete().eq('id', id);
    fetchData();
  };

  const getScopeName = (msg: AutoMessage) => {
    if (msg.campaign_id) {
      const c = campaigns.find(c => c.id === msg.campaign_id);
      return c ? `Campanha: ${c.name}` : 'Campanha';
    }
    if (msg.group_id) {
      const g = groups.find(g => g.id === msg.group_id);
      return g ? g.group_name : 'Grupo';
    }
    return 'Todos os grupos';
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Mensagens Automáticas</h3>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Nova Mensagem</Button>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingId(null); setForm({ ...defaultForm }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Automação' : 'Nova Mensagem Automática'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Evento</Label>
              <Select value={form.event_type} onValueChange={v => setForm(p => ({ ...p, event_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="join">Entrada no grupo</SelectItem>
                  <SelectItem value="leave">Saída do grupo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Escopo</Label>
              <Select value={form.scope_type} onValueChange={v => setForm(p => ({ ...p, scope_type: v as any, scope_id: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os grupos</SelectItem>
                  <SelectItem value="group">Grupo específico</SelectItem>
                  <SelectItem value="campaign">Campanha específica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.scope_type === 'group' && (
              <div>
                <Label>Grupo</Label>
                <Select value={form.scope_id} onValueChange={v => setForm(p => ({ ...p, scope_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um grupo" /></SelectTrigger>
                  <SelectContent>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.group_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.scope_type === 'campaign' && (
              <div>
                <Label>Campanha</Label>
                <Select value={form.scope_id} onValueChange={v => setForm(p => ({ ...p, scope_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma campanha" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Tipo de conteúdo</Label>
              <Select value={form.content_type} onValueChange={v => setForm(p => ({ ...p, content_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem + legenda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Texto da mensagem</Label>
              <Textarea
                placeholder="Bem-vindo ao grupo! 🎉 Use {{phone}} para o telefone."
                value={form.content_text}
                onChange={e => setForm(p => ({ ...p, content_text: e.target.value }))}
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">Variáveis: {'{{phone}}'}, {'{{group}}'}</p>
            </div>

            {form.content_type === 'image' && (
              <div className="space-y-2">
                <Label>Imagem</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                {form.media_url ? (
                  <div className="relative rounded-lg border border-border overflow-hidden">
                    <img src={form.media_url} alt="Preview" className="w-full h-32 object-cover" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => setForm(p => ({ ...p, media_url: '' }))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed flex flex-col gap-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <span className="text-sm text-muted-foreground">Enviando...</span>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Clique para enviar imagem</span>
                        <span className="text-xs text-muted-foreground">JPG, PNG, WebP ou GIF (max 5MB)</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            <Button onClick={saveAutoMessage} className="w-full" disabled={uploading}>
              {editingId ? 'Salvar Alterações' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {autoMessages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhuma mensagem automática</p>
            <p className="text-sm mt-1">Configure mensagens de boas-vindas ou despedida para seus grupos.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {autoMessages.map(msg => (
            <Card key={msg.id}>
              <CardContent className="py-4 flex items-start gap-4">
                <div className="p-2 rounded-lg bg-muted">
                  {msg.event_type === 'join' ? (
                    <UserPlus className="h-5 w-5 text-primary" />
                  ) : (
                    <UserMinus className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant={msg.event_type === 'join' ? 'default' : 'destructive'}>
                      {msg.event_type === 'join' ? 'Entrada' : 'Saída'}
                    </Badge>
                    <Badge variant="outline">{getScopeName(msg)}</Badge>
                    <Badge variant="secondary">{msg.content_type}</Badge>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{msg.content_text}</p>
                  {msg.media_url && (
                    <div className="mt-2 flex items-center gap-2">
                      <img src={msg.media_url} alt="" className="h-10 w-10 rounded object-cover border border-border" />
                      <span className="text-xs text-muted-foreground">Imagem anexada</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(msg)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Switch checked={msg.is_active} onCheckedChange={() => toggleActive(msg)} />
                  <Button variant="ghost" size="icon" onClick={() => deleteMsg(msg.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
