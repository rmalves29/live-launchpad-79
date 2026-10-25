import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

type Form = {
  name: string; code: string; price: string; promotional_price: string;
  stock: string; color: string; size: string; image_url: string; observation: string;
};

const EMPTY: Form = { name: '', code: '', price: '', promotional_price: '', stock: '', color: '', size: '', image_url: '', observation: '' };

// Número digitado em pt-BR ("49,90") ou com ponto -> number; vazio -> null
function num(v: string): number | null {
  const s = v.trim().replace(/\./g, v.includes(',') ? '' : '.').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function LiveProductEditDialog({ productId, open, onOpenChange, onSaved }: {
  productId: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { tenant } = useTenant();
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; }, [onOpenChange]);

  useEffect(() => {
    if (!open) { setForm(EMPTY); return; }
    if (!productId || !tenant?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('name, code, price, promotional_price, stock, color, size, image_url, observation')
        .eq('tenant_id', tenant.id)
        .eq('id', productId)
        .maybeSingle();
      if (cancelled) return;
      setLoading(false);
      if (error || !data) {
        toast({ title: 'Não foi possível abrir o produto', description: error?.message, variant: 'destructive' });
        onOpenChangeRef.current(false);
        return;
      }
      const d: any = data;
      const fmt = (v: any) => (v == null ? '' : String(v).replace('.', ','));
      setForm({
        name: d.name || '', code: d.code || '', price: fmt(d.price), promotional_price: fmt(d.promotional_price),
        stock: d.stock == null ? '' : String(d.stock), color: d.color || '', size: d.size || '',
        image_url: d.image_url || '', observation: d.observation || '',
      });
    })();
    return () => { cancelled = true; };
  }, [open, productId, tenant?.id]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!tenant?.id || !productId) return;
    const price = num(form.price);
    const promo = num(form.promotional_price);
    const stock = form.stock.trim() === '' ? 0 : Number(form.stock);
    if (!form.name.trim()) return toast({ title: 'Informe o nome do produto', variant: 'destructive' });
    if (!form.code.trim()) return toast({ title: 'Informe o código do produto', variant: 'destructive' });
    if (price === null || Number.isNaN(price) || price < 0) return toast({ title: 'Preço inválido', description: 'Use números, por exemplo 49,90.', variant: 'destructive' });
    if (promo !== null && (Number.isNaN(promo) || promo < 0)) return toast({ title: 'Preço promocional inválido', variant: 'destructive' });
    if (!Number.isInteger(stock) || stock < 0) return toast({ title: 'Estoque inválido', description: 'Use um número inteiro, sem negativo.', variant: 'destructive' });

    setSaving(true);
    const { error } = await supabase
      .from('products')
      .update({
        name: form.name.trim(), code: form.code.trim(), price, promotional_price: promo, stock,
        color: form.color.trim() || null, size: form.size.trim() || null,
        image_url: form.image_url.trim() || null, observation: form.observation.trim() || null,
      } as any)
      .eq('tenant_id', tenant.id)
      .eq('id', productId);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Produto atualizado' });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          <DialogDescription>As alterações valem também no cadastro de Produtos e no bazar.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label htmlFor="pe-name">Nome</Label><Input id="pe-name" value={form.name} onChange={set('name')} /></div>
            <div className="space-y-1"><Label htmlFor="pe-code">Código</Label><Input id="pe-code" value={form.code} onChange={set('code')} /></div>
            <div className="space-y-1"><Label htmlFor="pe-stock">Estoque</Label><Input id="pe-stock" inputMode="numeric" value={form.stock} onChange={set('stock')} /></div>
            <div className="space-y-1"><Label htmlFor="pe-price">Preço (R$)</Label><Input id="pe-price" inputMode="decimal" value={form.price} onChange={set('price')} /></div>
            <div className="space-y-1"><Label htmlFor="pe-promo">Preço promocional (R$)</Label><Input id="pe-promo" inputMode="decimal" value={form.promotional_price} onChange={set('promotional_price')} placeholder="Sem promoção" /></div>
            <div className="space-y-1"><Label htmlFor="pe-color">Cor</Label><Input id="pe-color" value={form.color} onChange={set('color')} /></div>
            <div className="space-y-1"><Label htmlFor="pe-size">Tamanho</Label><Input id="pe-size" value={form.size} onChange={set('size')} /></div>
            <div className="col-span-2 space-y-1"><Label htmlFor="pe-img">Link da foto</Label><Input id="pe-img" value={form.image_url} onChange={set('image_url')} placeholder="https://" /></div>
            <div className="col-span-2 space-y-1"><Label htmlFor="pe-obs">Observação</Label><Textarea id="pe-obs" rows={2} value={form.observation} onChange={set('observation')} /></div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving || loading} onClick={save}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : 'Salvar alterações'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
