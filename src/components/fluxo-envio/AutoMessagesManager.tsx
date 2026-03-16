import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, UserPlus, UserMinus, MessageSquare, Upload, X, Image } from 'lucide-react';
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

export default function AutoMessagesManager() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [autoMessages, setAutoMessages] = useState<AutoMessage[]>([]);
  const [groups, setGroups] = useState<FeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    event_type: 'join',
    content_type: 'text',
    content_text: '',
    media_url: '',
    group_id: 'all',
  });

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);

    const [{ data: msgs }, { data: grps }] = await Promise.all([
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
    ]);

    if (msgs) setAutoMessages(msgs as any);
    if (grps) setGroups(grps as any);
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addAutoMessage = async () => {
    if (!tenant || !form.content_text.trim()) {
      toast({ title: 'Preencha o texto da mensagem', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('fe_auto_messages' as any).insert({
      tenant_id: tenant.id,
      event_type: form.event_type,
      content_type: form.content_type,
      content_text: form.content_text,
      media_url: form.media_url || null,
      group_id: form.group_id === 'all' ? null : form.group_id,
      is_active: true,
    } as any);

    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Mensagem automática criada' });
      setForm({ event_type: 'join', content_type: 'text', content_text: '', media_url: '', group_id: 'all' });
      setAddOpen(false);
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

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return 'Todos os grupos';
    const g = groups.find(g => g.id === groupId);
    return g ? g.group_name : groupId;
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Mensagens Automáticas</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova Mensagem</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nova Mensagem Automática</DialogTitle></DialogHeader>
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
                <Label>Grupo</Label>
                <Select value={form.group_id} onValueChange={v => setForm(p => ({ ...p, group_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os grupos</SelectItem>
                    {groups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.group_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                <div>
                  <Label>URL da imagem</Label>
                  <Input
                    placeholder="https://..."
                    value={form.media_url}
                    onChange={e => setForm(p => ({ ...p, media_url: e.target.value }))}
                  />
                </div>
              )}

              <Button onClick={addAutoMessage} className="w-full">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={msg.event_type === 'join' ? 'default' : 'destructive'}>
                      {msg.event_type === 'join' ? 'Entrada' : 'Saída'}
                    </Badge>
                    <Badge variant="outline">{getGroupName(msg.group_id)}</Badge>
                    <Badge variant="secondary">{msg.content_type}</Badge>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">{msg.content_text}</p>
                  {msg.media_url && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">📎 {msg.media_url}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
