import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Youtube, ExternalLink } from 'lucide-react';
import { ALL_HELP_PAGES, extractYoutubeId } from '@/lib/help-page-key';

interface Tutorial {
  id: string;
  page_key: string;
  title: string;
  youtube_url: string;
  description: string | null;
  sort_order: number;
}

const EMPTY: Omit<Tutorial, 'id'> = {
  page_key: 'dashboard',
  title: '',
  youtube_url: '',
  description: '',
  sort_order: 0,
};

export default function Tutoriais() {
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tutorial | null>(null);
  const [form, setForm] = useState<Omit<Tutorial, 'id'>>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('help_tutorials')
      .select('*')
      .order('page_key')
      .order('sort_order');
    if (error) toast.error(error.message);
    else setItems((data as Tutorial[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(t: Tutorial) {
    setEditing(t);
    setForm({
      page_key: t.page_key,
      title: t.title,
      youtube_url: t.youtube_url,
      description: t.description ?? '',
      sort_order: t.sort_order,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.youtube_url.trim()) {
      toast.error('Preencha título e link do YouTube.');
      return;
    }
    if (!extractYoutubeId(form.youtube_url)) {
      toast.error('Link do YouTube inválido.');
      return;
    }
    setSaving(true);
    const payload = { ...form, description: form.description || null };
    const { error } = editing
      ? await supabase.from('help_tutorials').update(payload).eq('id', editing.id)
      : await supabase.from('help_tutorials').insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Tutorial salvo!');
    setOpen(false);
    load();
  }

  async function remove(t: Tutorial) {
    if (!confirm(`Excluir "${t.title}"?`)) return;
    const { error } = await supabase.from('help_tutorials').delete().eq('id', t.id);
    if (error) return toast.error(error.message);
    toast.success('Excluído.');
    load();
  }

  const grouped = items.reduce<Record<string, Tutorial[]>>((acc, t) => {
    (acc[t.page_key] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Central de Tutoriais</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre vídeos do YouTube que serão exibidos em cada página do sistema.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Novo tutorial
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum tutorial cadastrado ainda.
        </Card>
      ) : (
        Object.entries(grouped).map(([key, list]) => {
          const label = ALL_HELP_PAGES.find((p) => p.key === key)?.label || key;
          return (
            <Card key={key} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{key}</Badge>
                <h2 className="font-semibold">{label}</h2>
              </div>
              <div className="grid gap-2">
                {list.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 border rounded p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Youtube className="h-5 w-5 text-red-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{t.title}</p>
                        <a
                          href={t.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:underline truncate flex items-center gap-1"
                        >
                          {t.youtube_url} <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(t)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tutorial' : 'Novo tutorial'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Página</Label>
              <Select
                value={form.page_key}
                onValueChange={(v) => setForm((f) => ({ ...f, page_key: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_HELP_PAGES.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label} <span className="text-muted-foreground">({p.key})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Como cadastrar um novo produto"
              />
            </div>
            <div>
              <Label>Link do YouTube</Label>
              <Input
                value={form.youtube_url}
                onChange={(e) => setForm((f) => ({ ...f, youtube_url: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
