import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Pin, Search, ShoppingBag, Timer, X } from 'lucide-react';
import { LiveCameraPreview } from './LiveCameraPreview';

/** Teste exclusivo Mania de Mulher. Só deve ser renderizado quando isManiaDeMulherTenant() for true. */
export function isManiaDeMulherTenant(t?: { name?: string | null; slug?: string | null } | null): boolean {
  if (!t) return false;
  const norm = (s?: string | null) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = norm(t.name);
  const s = norm(t.slug);
  return n === 'maniademulher' || s === 'maniadmulher' || s === 'maniademulher';
}

interface P { id: number; code: string; name: string; price: number; promotional_price: number | null; image_url: string | null; stock: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function LiveOfferPinTest({ tenantId }: { tenantId: string }) {
  const [products, setProducts] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<P | null>(null);
  const [discount, setDiscount] = useState(10);
  const [minutes, setMinutes] = useState(5);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('products')
        .select('id, code, name, price, promotional_price, image_url, stock')
        .eq('tenant_id', tenantId).eq('is_active', true).gt('stock', 0)
        .order('name').limit(1000);
      if (!cancel) { setProducts((data as P[]) || []); setLoading(false); }
    })();
    return () => { cancel = true; };
  }, [tenantId]);

  useEffect(() => {
    if (!endsAt) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [endsAt]);

  const remaining = endsAt ? Math.max(0, Math.round((endsAt - now) / 1000)) : 0;
  useEffect(() => { if (endsAt && remaining === 0) setEndsAt(null); }, [endsAt, remaining]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t ? products.filter(p => p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)) : products;
    return list.slice(0, 50);
  }, [q, products]);

  const base = selected ? Number(selected.promotional_price && selected.promotional_price > 0 ? selected.promotional_price : selected.price) : 0;
  const pct = Math.min(90, Math.max(0, Number(discount) || 0));
  const offer = Math.round(base * (1 - pct / 100) * 100) / 100;
  const active = !!endsAt && remaining > 0;

  const show = () => {
    if (!selected) return;
    const m = Math.min(120, Math.max(1, Number(minutes) || 1));
    setNow(Date.now());
    setEndsAt(Date.now() + m * 60_000);
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 border-amber-500/40 bg-amber-500/10 flex gap-2 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <div>
          <strong>Teste exclusivo Mania de Mulher.</strong> Esta prévia ainda <strong>não transmite</strong> o card de oferta para a live real do Instagram — serve apenas para validar o visual e o funcionamento.
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="p-4 space-y-4">
          <div>
            <Label>Buscar produto (ativos com estoque)</Label>
            <div className="relative mt-1">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="Código ou nome" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto border rounded-md divide-y">
              {loading && <p className="p-3 text-sm text-muted-foreground">Carregando produtos...</p>}
              {!loading && filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
              {filtered.map(p => (
                <button key={p.id} type="button" onClick={() => setSelected(p)}
                  className={`w-full flex items-center gap-3 p-2 text-left hover:bg-muted ${selected?.id === p.id ? 'bg-muted' : ''}`}>
                  {p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-muted" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.code} · {p.name}</p>
                    <p className="text-xs text-muted-foreground">{brl(Number(p.promotional_price || p.price))} · estoque {p.stock}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Desconto (%)</Label>
              <Input type="number" min={0} max={90} value={discount} onChange={e => setDiscount(Number(e.target.value))} />
            </div>
            <div>
              <Label>Duração (minutos)</Label>
              <Input type="number" min={1} max={120} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={show} disabled={!selected}><Pin className="h-4 w-4 mr-1" />Exibir na Live</Button>
            {active && <Button variant="outline" onClick={() => setEndsAt(null)}><X className="h-4 w-4 mr-1" />Remover</Button>}
            {active && <Badge variant="secondary"><Timer className="h-3 w-3 mr-1" />{fmt(remaining)}</Badge>}
            {!selected && <span className="text-xs text-muted-foreground">Selecione um produto.</span>}
          </div>
        </Card>

        {/* Prévia 9:16 */}
        <div className="mx-auto w-full max-w-[320px]">
          <div className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-gradient-to-b from-muted to-foreground/80 border">
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <Badge className="bg-destructive text-destructive-foreground">AO VIVO</Badge>
              <span className="text-xs text-background/90">Prévia</span>
            </div>
            {active && selected ? (
              <div className="absolute left-2 right-2 bottom-3 rounded-xl bg-background/95 shadow-lg p-2 flex gap-2 items-center animate-in slide-in-from-bottom-4">
                {selected.image_url ? <img src={selected.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="h-16 w-16 rounded-lg bg-muted" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{selected.name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-destructive">{brl(offer)}</span>
                    {pct > 0 && <span className="text-[10px] line-through text-muted-foreground">{brl(base)}</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {pct > 0 && <Badge variant="destructive" className="h-4 px-1 text-[10px]">-{pct}%</Badge>}
                    <span className="text-[10px] text-muted-foreground flex items-center"><Timer className="h-3 w-3 mr-0.5" />{fmt(remaining)}</span>
                  </div>
                </div>
                <Button size="sm" className="h-8 px-3"><ShoppingBag className="h-3 w-3 mr-1" />Comprar</Button>
              </div>
            ) : (
              <p className="absolute bottom-4 inset-x-0 text-center text-xs text-background/80">Nenhuma oferta fixada</p>
            )}
          </div>
        </div>
      </div>

      <LiveCameraPreview offer={active && selected ? {
        name: selected.name, imageUrl: selected.image_url, basePrice: base, offerPrice: offer, pct, remaining,
      } : null} />
    </div>
  );
}
