import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EMPTY = { nome: '', empresa: '', whatsapp: '', instagram: '', observacao: '' };

/** Painel do afiliado: indicar empresa (lead origem "afiliado") e, opcionalmente, mandar o link de agendamento. */
export function IndicateDialog({ disabled, onDone }: { disabled?: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [sendLink, setSendLink] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null); setSaving(true);
    try {
      const { data } = await supabase.functions.invoke('affiliate-booking', { body: { action: 'indicate', ...form, send_link: sendLink } });
      if (!data?.success) { setError(data?.error || 'Não foi possível salvar'); return; }
      toast.success(sendLink ? (data.whatsapp_sent ? 'Indicação salva e link enviado' : 'Indicação salva, mas o WhatsApp não foi enviado') : 'Indicação salva');
      setOpen(false); setForm(EMPTY); onDone();
    } catch { setError('Não foi possível salvar'); } finally { setSaving(false); }
  };

  return (
    <>
      <Button size="sm" disabled={disabled} title={disabled ? 'Disponível após a aprovação' : ''} onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1" />Indicar empresa
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Indicar empresa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome da pessoa</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Empresa / loja</Label><Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
            <div><Label>WhatsApp com DDD</Label><Input inputMode="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
            <div><Label>@ do Instagram</Label><Input placeholder="@loja" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} /></div>
            <div><Label>Observação</Label><Textarea rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendLink} onCheckedChange={(v) => setSendLink(v === true)} />
              Enviar meu link de agendamento para ela pelo WhatsApp da Cartzy
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar indicação'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
