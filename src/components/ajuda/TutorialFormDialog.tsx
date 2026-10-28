import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ALL_HELP_PAGES, HELP_GROUPS, extractYoutubeId } from '@/lib/help-page-key';

export interface TutorialRow {
  id: string;
  page_key: string;
  title: string;
  youtube_url: string;
  description: string | null;
  sort_order: number;
}

const EMPTY = { page_key: 'dashboard', title: '', youtube_url: '', description: '', sort_order: 0 };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vídeo a editar; sem ele, cadastra um novo. */
  editing: TutorialRow | null;
  onSaved: () => void;
}

export function TutorialFormDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const [form, setForm] = useState<Omit<TutorialRow, 'id'>>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            page_key: editing.page_key,
            title: editing.title,
            youtube_url: editing.youtube_url,
            description: editing.description ?? '',
            sort_order: editing.sort_order,
          }
        : EMPTY
    );
  }, [open, editing]);

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
    toast.success(editing ? 'Vídeo atualizado!' : 'Vídeo adicionado!');
    onOpenChange(false);
    onSaved();
  }

  const labelOf = (key: string) => ALL_HELP_PAGES.find((p) => p.key === key)?.label || key;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar vídeo' : 'Novo vídeo'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Categoria</Label>
            <Select value={form.page_key} onValueChange={(v) => setForm((f) => ({ ...f, page_key: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HELP_GROUPS.map((g) => (
                  <SelectGroup key={g.id}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.keys.map((k) => (
                      <SelectItem key={k} value={k}>
                        {labelOf(k)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
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
            <Label>Descrição</Label>
            <Textarea
              value={form.description || ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              placeholder="O que a cliente vai aprender neste vídeo"
            />
          </div>
          <div>
            <Label>Ordem (menor aparece primeiro)</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
