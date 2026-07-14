import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Megaphone } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  type: 'text' | 'image' | 'video';
  media_url: string | null;
  youtube_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

const empty: Partial<Announcement> = {
  title: '',
  body: '',
  type: 'text',
  media_url: '',
  youtube_url: '',
  is_active: true,
  starts_at: null,
  ends_at: null,
};

export default function Comunicados() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Announcement>>(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as Announcement[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setOpen(true); };
  const openEdit = (a: Announcement) => { setForm(a); setOpen(true); };

  const save = async () => {
    if (!form.title?.trim()) return toast.error('Título obrigatório');
    if (form.type === 'image' && !form.media_url) return toast.error('URL da imagem obrigatória');
    if (form.type === 'video' && !form.youtube_url) return toast.error('URL do YouTube obrigatória');
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload: any = {
      title: form.title,
      body: form.body || null,
      type: form.type,
      media_url: form.type === 'image' ? form.media_url : null,
      youtube_url: form.type === 'video' ? form.youtube_url : null,
      is_active: form.is_active ?? true,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };
    let error;
    if (form.id) {
      ({ error } = await supabase.from('announcements').update(payload).eq('id', form.id));
    } else {
      payload.created_by = userData.user?.id;
      ({ error } = await supabase.from('announcements').insert(payload));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Comunicado salvo');
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este comunicado?')) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Excluído');
    load();
  };

  const toggleActive = async (a: Announcement) => {
    const { error } = await supabase.from('announcements').update({ is_active: !a.is_active }).eq('id', a.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Comunicados</h1>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo comunicado</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum comunicado ainda.</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                <div>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tipo: {a.type} · {a.is_active ? 'Ativo' : 'Inativo'} · {new Date(a.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </CardHeader>
              {a.body && <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">{a.body}</CardContent>}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? 'Editar comunicado' : 'Novo comunicado'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título</Label>
              <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo do YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea rows={4} value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            {form.type === 'image' && (
              <div>
                <Label>URL da imagem</Label>
                <Input value={form.media_url || ''} onChange={(e) => setForm({ ...form, media_url: e.target.value })} placeholder="https://..." />
              </div>
            )}
            {form.type === 'video' && (
              <div>
                <Label>URL do YouTube</Label>
                <Input value={form.youtube_url || ''} onChange={(e) => setForm({ ...form, youtube_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início (opcional)</Label>
                <Input type="datetime-local" value={form.starts_at?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
              <div>
                <Label>Fim (opcional)</Label>
                <Input type="datetime-local" value={form.ends_at?.slice(0, 16) || ''} onChange={(e) => setForm({ ...form, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
