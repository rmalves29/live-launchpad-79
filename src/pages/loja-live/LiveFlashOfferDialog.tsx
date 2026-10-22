import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, Zap } from 'lucide-react';

export type FlashTarget = { id: number; name: string; code: string | null; price: number | null; stock: number | null; inLive: boolean };

const DURATIONS = [5, 10, 15, 30];
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// "39,90" ou "39.90" -> 39.9 ; inválido -> NaN
function parsePrice(v: string): number {
  const s = v.trim();
  if (!s) return NaN;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
}

export function LiveFlashOfferDialog({ target, open, onOpenChange, onStarted }: {
  target: FlashTarget | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStarted: () => void;
}) {
  const { tenant } = useTenant();
  const [price, setPrice] = useState('');
  const [minutes, setMinutes] = useState<number | 'other'>(15);
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setPrice(''); setMinutes(15); setOther(''); }
  }, [open, target?.id]);

  const normal = target?.price ?? null;
  const p = parsePrice(price);
  const off = normal && Number.isFinite(p) && p > 0 && p < normal ? Math.round((1 - p / normal) * 100) : 0;

  async function start() {
    if (!tenant?.id || !target) return;
    const mins = minutes === 'other' ? Math.floor(Number(other)) : minutes;
    if (!Number.isFinite(p) || p <= 0) return toast({ title: 'Informe o preço da oferta', description: 'Use números, por exemplo 39,90.', variant: 'destructive' });
    if (normal != null && p >= normal) return toast({ title: 'O preço da oferta precisa ser menor que o normal', description: `Preço normal: ${money(normal)}.`, variant: 'destructive' });
    if (!Number.isFinite(mins) || mins < 1 || mins > 1440) return toast({ title: 'Duração inválida', description: 'Informe de 1 a 1440 minutos.', variant: 'destructive' });

    setSaving(true);
    const nowIso = new Date().toISOString();
    // oferta que já passou do prazo deixa de ocupar a vaga (só uma oferta no ar por vez)
    await supabase.from('live_flash_offers' as any).update({ status: 'ended' } as any).eq('tenant_id', tenant.id).eq('status', 'active').lte('ends_at', nowIso);
    const { error } = await supabase.from('live_flash_offers' as any).insert({
      tenant_id: tenant.id,
      product_id: target.id,
      flash_price: Math.round(p * 100) / 100,
      starts_at: nowIso,
      ends_at: new Date(Date.now() + mins * 60_000).toISOString(),
      status: 'active',
    } as any);
    setSaving(false);
    if (error) {
      const dup = (error as any).code === '23505';
      toast({
        title: dup ? 'Já existe uma oferta no ar' : 'Erro ao disparar a oferta',
        description: dup ? 'Encerre a oferta atual antes de disparar outra.' : error.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Oferta relâmpago no ar', description: `${target.name} por ${money(Math.round(p * 100) / 100)} durante ${mins} min. A vitrine atualiza sozinha.` });
    onOpenChange(false);
    onStarted();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Zap className="h-4 w-4 text-red-600" />Oferta relâmpago</DialogTitle>
          <DialogDescription>
            {target?.name}{target?.code ? ` (${target.code})` : ''}{normal != null ? ` · preço normal ${money(normal)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fo-price">Preço da oferta (R$)</Label>
            <div className="flex items-center gap-2">
              <Input id="fo-price" inputMode="decimal" className="w-40" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="39,90" />
              {off > 0 && <span className="text-sm font-medium text-red-600">-{off}%</span>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Duração</Label>
            <div className="flex flex-wrap items-center gap-2">
              {DURATIONS.map((d) => (
                <button key={d} type="button" onClick={() => setMinutes(d)} aria-pressed={minutes === d}
                  className={`rounded-md border px-3 py-1 text-sm ${minutes === d ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                  {d} min
                </button>
              ))}
              <button type="button" onClick={() => setMinutes('other')} aria-pressed={minutes === 'other'}
                className={`rounded-md border px-3 py-1 text-sm ${minutes === 'other' ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                Outro
              </button>
              {minutes === 'other' && <Input className="w-24" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value)} placeholder="minutos" aria-label="Duração em minutos" />}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">A oferta aparece na vitrine, logo abaixo da busca, na hora. Só uma por vez. Vale para o produto e todas as suas variações; ao acabar o tempo o preço volta ao normal, inclusive no carrinho.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} onClick={start}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Disparando…</> : 'Disparar agora'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
