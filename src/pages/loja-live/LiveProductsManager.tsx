import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { ChevronDown, ChevronRight, Loader2, Package, Pencil, Search, X, Zap } from 'lucide-react';
import { LiveProductEditDialog } from './LiveProductEditDialog';
import { LiveFlashOfferDialog, type FlashTarget } from './LiveFlashOfferDialog';

type ActiveOffer = { id: string; product_id: number; flash_price: number; ends_at: string; product: { name: string; code: string | null } | null };

const hms = (s: number) => {
  const x = Math.max(0, s);
  return [Math.floor(x / 3600), Math.floor((x % 3600) / 60), x % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

// Um produto está "na live" quando o tipo de venda é LIVE ou AMBOS (é o que a vitrine do link usa).
// Marcar = vira AMBOS (continua no bazar); desmarcar = vira BAZAR (sai da live).
// Produto com variações: cada variação (tamanho/cor) entra ou sai sozinha; o produto "pai" acompanha.
const IN_LIVE = ['LIVE', 'AMBOS'];
const PAGE_SIZES = [25, 50, 100];
const MAX_OFFERS = 2;
const readPageSize = () => {
  try { const n = Number(localStorage.getItem('live-products-page-size')); return PAGE_SIZES.includes(n) ? n : 50; } catch { return 50; }
};

type Child = {
  id: number;
  code: string | null;
  label: string;        // "G", "Azul / M" ou o código
  stock: number;
  sale_type: string | null;
  inLive: boolean;      // estado salvo no banco
};

type Row = {
  id: number;
  code: string | null;
  name: string;
  price: number | null;
  promotional_price: number | null;
  stock: number | null;
  image_url: string | null;
  sale_type: string | null;
  children: Child[];    // vazio = produto sem variações
  inLive: boolean;      // estado salvo no banco (com variações: alguma variação na live)
};

type Filter = 'all' | 'in' | 'out';

const money = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

export function LiveProductsManager({ onChanged }: { onChanged?: () => void }) {
  const { tenant } = useTenant();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [inLiveCount, setInLiveCount] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<number>>(new Set());
  // alterações ainda não salvas: id do produto SEM variações ou da VARIAÇÃO -> quer estar na live?
  const [pending, setPending] = useState<Map<number, boolean>>(new Map());
  // estado salvo de tudo que já apareceu na tela (vale mesmo depois de trocar de busca/página)
  const [known, setKnown] = useState<Map<number, Row>>(new Map());
  // produto aberto no diálogo de edição (sem sair da página)
  const [editingId, setEditingId] = useState<number | null>(null);
  // oferta relâmpago: a que está no ar e o produto escolhido para disparar uma nova
  const [offers, setOffers] = useState<ActiveOffer[]>([]);
  const [pageSize, setPageSize] = useState(readPageSize);
  // posição digitada na vitrine (id do produto -> texto) enquanto o lojista edita
  const [posDraft, setPosDraft] = useState<Map<number, string>>(new Map());
  const [movingId, setMovingId] = useState<number | null>(null);
  const [offerTarget, setOfferTarget] = useState<FlashTarget | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [endingOffer, setEndingOffer] = useState<string | null>(null);

  const loadOffer = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('live_flash_offers' as any)
      .select('id, product_id, flash_price, ends_at, product:products(name, code)')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active')
      .gt('ends_at', new Date().toISOString())
      .order('ends_at', { ascending: true });
    setOffers(((data as any[]) || []).slice(0, MAX_OFFERS) as ActiveOffer[]);
  }, [tenant?.id]);
  useEffect(() => { loadOffer(); }, [loadOffer]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // oferta que chegou ao fim some da faixa sozinha
  const offerLeft = (o: ActiveOffer) => Math.floor((Date.parse(o.ends_at) - now) / 1000);
  const liveOffers = offers.filter((o) => offerLeft(o) > 0);
  useEffect(() => { if (offers.length !== liveOffers.length) setOffers(liveOffers); }, [offers, liveOffers]);

  async function endOffer(offer: ActiveOffer) {
    setEndingOffer(offer.id);
    const { error } = await supabase.from('live_flash_offers' as any).update({ status: 'cancelled' } as any).eq('id', offer.id);
    setEndingOffer(null);
    if (error) { toast({ title: 'Erro ao encerrar a oferta', description: error.message, variant: 'destructive' }); return; }
    setOffers((prev) => prev.filter((o) => o.id !== offer.id));
    toast({ title: 'Oferta encerrada', description: 'O produto voltou ao preço normal na vitrine.' });
  }

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const countInLive = useCallback(async () => {
    if (!tenant?.id) return;
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .is('parent_product_id', null)
      .in('sale_type', IN_LIVE);
    setInLiveCount(count ?? 0);
  }, [tenant?.id]);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const q = debounced.replace(/[%_\\,()]/g, ' ').trim().slice(0, 40);
    let query = supabase
      .from('products')
      .select('id, code, name, price, promotional_price, stock, image_url, sale_type', { count: 'exact' })
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .is('parent_product_id', null);
    if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    if (filter === 'in') query = query.in('sale_type', IN_LIVE);
    if (filter === 'out') query = query.not('sale_type', 'in', `(${IN_LIVE.join(',')})`);
    // No filtro "Na live" a lista segue a ordem da vitrine (posição escolhida; sem posição, ordem de entrada)
    if (filter === 'in') {
      query = query.order('live_position', { ascending: true, nullsFirst: false }).order('live_added_at', { ascending: true }).order('id', { ascending: true });
    } else {
      query = query.order('code', { ascending: true });
    }
    const { data, count, error } = await query.range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) {
      setLoading(false);
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
      return;
    }
    const list = (data as any[]) || [];
    const ids = list.map((p) => p.id);
    const kids = new Map<number, Child[]>();
    if (ids.length) {
      const { data: ch } = await supabase
        .from('products')
        .select('id, parent_product_id, code, color, size, stock, sale_type')
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .in('parent_product_id', ids)
        .order('code', { ascending: true });
      for (const c of (ch as any[]) || []) {
        const arr = kids.get(c.parent_product_id) || [];
        arr.push({
          id: c.id, code: c.code,
          label: [c.color, c.size].filter(Boolean).join(' / ') || c.code || `#${c.id}`,
          stock: Number(c.stock) || 0, sale_type: c.sale_type, inLive: IN_LIVE.includes(c.sale_type),
        });
        kids.set(c.parent_product_id, arr);
      }
    }
    const mapped: Row[] = list.map((p) => {
      const children = kids.get(p.id) || [];
      return {
        id: p.id, code: p.code, name: p.name, price: p.price, promotional_price: p.promotional_price,
        stock: children.length ? children.reduce((s, c) => s + c.stock, 0) : p.stock,
        image_url: p.image_url, sale_type: p.sale_type, children,
        inLive: children.length ? children.some((c) => c.inLive) : IN_LIVE.includes(p.sale_type),
      };
    });
    setRows(mapped);
    setTotal(count ?? mapped.length);
    setKnown((prev) => { const n = new Map(prev); mapped.forEach((r) => n.set(r.id, r)); return n; });
    setLoading(false);
  }, [tenant?.id, debounced, filter, page, pageSize]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { countInLive(); }, [countInLive]);

  // estado "quer estar na live?" de uma variação ou de um produto sem variações
  const wantedLeaf = (id: number, saved: boolean) => (pending.has(id) ? pending.get(id)! : saved);

  // estado do produto na tela: true / false / 'indeterminate' (só algumas variações)
  function rowState(r: Row): boolean | 'indeterminate' {
    if (r.children.length === 0) return wantedLeaf(r.id, r.inLive);
    const on = r.children.filter((c) => wantedLeaf(c.id, c.inLive)).length;
    if (on === 0) return false;
    return on === r.children.length ? true : 'indeterminate';
  }

  function setLeaf(map: Map<number, boolean>, id: number, saved: boolean, value: boolean) {
    if (value === saved) map.delete(id); else map.set(id, value);
  }

  function setRow(r: Row, value: boolean) {
    setPending((prev) => {
      const n = new Map(prev);
      if (r.children.length === 0) setLeaf(n, r.id, r.inLive, value);
      else r.children.forEach((c) => setLeaf(n, c.id, c.inLive, value));
      return n;
    });
  }

  function setChild(c: Child, value: boolean) {
    setPending((prev) => { const n = new Map(prev); setLeaf(n, c.id, c.inLive, value); return n; });
  }

  function toggleOpen(id: number) {
    setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const allOnPage = rows.length > 0 && rows.every((r) => rowState(r) === true);
  const someOnPage = rows.some((r) => rowState(r) !== false);
  function toggleAllOnPage(value: boolean) {
    setPending((prev) => {
      const n = new Map(prev);
      rows.forEach((r) => {
        if (r.children.length === 0) setLeaf(n, r.id, r.inLive, value);
        else r.children.forEach((c) => setLeaf(n, c.id, c.inLive, value));
      });
      return n;
    });
  }

  const summary = useMemo(() => {
    let add = 0, remove = 0;
    pending.forEach((want) => { if (want) add++; else remove++; });
    return { add, remove };
  }, [pending]);

  async function save() {
    if (!tenant?.id || pending.size === 0) return;
    setSaving(true);

    // estado salvo de cada folha (produto sem variação ou variação), e de qual produto ela é
    const savedLeaf = new Map<number, { live: boolean; parent?: Row }>();
    known.forEach((r) => {
      if (r.children.length === 0) savedLeaf.set(r.id, { live: r.inLive });
      else r.children.forEach((c) => savedLeaf.set(c.id, { live: c.inLive, parent: r }));
    });

    const toLive: number[] = [];
    const toOut: number[] = [];
    const touchedParents = new Map<number, Row>();
    pending.forEach((want, id) => {
      const s = savedLeaf.get(id);
      if (!s || s.live === want) return;
      (want ? toLive : toOut).push(id);
      if (s.parent) touchedParents.set(s.parent.id, s.parent);
    });

    // o produto "pai" acompanha as variações: fica na live se alguma variação ficar
    const parentLive: number[] = [];
    const parentOut: number[] = [];
    touchedParents.forEach((p) => {
      const anyOn = p.children.some((c) => wantedLeaf(c.id, c.inLive));
      if (anyOn && !IN_LIVE.includes(p.sale_type || '')) parentLive.push(p.id);
      if (!anyOn && IN_LIVE.includes(p.sale_type || '')) parentOut.push(p.id);
    });

    const chunk = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / 150) }, (_, i) => a.slice(i * 150, i * 150 + 150));
    try {
      for (const ids of chunk([...toLive, ...parentLive])) {
        // só quem hoje é BAZAR vira AMBOS; quem já é LIVE/AMBOS fica como está
        const a = await supabase.from('products').update({ sale_type: 'AMBOS' } as any).eq('tenant_id', tenant.id).in('id', ids).eq('sale_type', 'BAZAR');
        if (a.error) throw a.error;
      }
      for (const ids of chunk([...toOut, ...parentOut])) {
        const a = await supabase.from('products').update({ sale_type: 'BAZAR' } as any).eq('tenant_id', tenant.id).in('id', ids);
        if (a.error) throw a.error;
      }
      toast({
        title: 'Produtos da live atualizados',
        description: `${toLive.length} entrou(aram) na live · ${toOut.length} saiu(íram) da live. O link já reflete a mudança.`,
      });
      setPending(new Map());
      await Promise.all([load(), countInLive()]);
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function changePageSize(n: number) {
    setPageSize(n);
    setPage(0);
    try { localStorage.setItem('live-products-page-size', String(n)); } catch { /* sem armazenamento: vale só nesta visita */ }
  }

  // só dá para numerar com o filtro "Na live" e sem busca: aí a posição na tela é a posição real na vitrine
  const canOrder = filter === 'in' && !debounced;

  async function movePosition(r: Row, rank: number) {
    const raw = posDraft.get(r.id);
    setPosDraft((prev) => { const n = new Map(prev); n.delete(r.id); return n; });
    if (raw === undefined) return;
    const want = Math.floor(Number(raw));
    if (!Number.isFinite(want) || want < 1 || want === rank) return;
    setMovingId(r.id);
    const { error } = await supabase.rpc('set_live_position' as any, { p_product_id: r.id, p_position: want } as any);
    setMovingId(null);
    if (error) { toast({ title: 'Erro ao mudar a posição', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Posição atualizada', description: `${r.code || r.name} agora é o nº ${want} da vitrine.` });
    await load();
    onChanged?.();
  }
  const dirty = pending.size > 0;

  const handleEditOpenChange = useCallback((o: boolean) => { if (!o) setEditingId(null); }, []);
  const handleEditSaved = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);
  const handleOfferOpenChange = useCallback((o: boolean) => { if (!o) setOfferTarget(null); }, []);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Produtos da live</h3>
            <p className="text-xs text-muted-foreground">
              Marque os produtos que aparecem no link da live e clique em <b>Salvar</b>. Desmarque e salve para tirar da live. Produtos com variações abrem na setinha: marque só os tamanhos ou cores que quer vender na live. Os produtos continuam cadastrados e à venda no bazar.
            </p>
          </div>
          {inLiveCount !== null && <Badge variant="secondary">{inLiveCount} na live</Badge>}
        </div>

        {liveOffers.map((offer) => (
          <div key={offer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="flex items-center gap-1.5">
              <Zap className="h-4 w-4" />
              Oferta no ar: <b>{offer.product?.name || `produto #${offer.product_id}`}</b> por {money(Number(offer.flash_price))} · termina em <b className="tabular-nums">{hms(offerLeft(offer))}</b>
            </span>
            <Button size="sm" variant="outline" disabled={endingOffer === offer.id} onClick={() => endOffer(offer)}>Encerrar agora</Button>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pelo código (ex.: C100) ou pelo nome"
              className="pl-9 pr-9"
              aria-label="Buscar produto"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Limpar busca">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="inline-flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Filtrar produtos">
            {([['all', 'Todos'], ['in', 'Na live'], ['out', 'Fora da live']] as [Filter, string][]).map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={filter === v}
                onClick={() => { setFilter(v); setPage(0); }}
                className={`rounded-md px-3 py-1.5 transition ${filter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Checkbox
              checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
              onCheckedChange={(v) => toggleAllOnPage(v === true)}
              aria-label="Marcar ou desmarcar todos desta página"
              disabled={loading || rows.length === 0}
            />
            {canOrder && <span className="w-14 text-center" title="Posição na vitrine">Nº</span>}
            <span className="flex-1">Produto</span>
            <span className="hidden w-20 text-right sm:block">Estoque</span>
            <span className="hidden w-24 text-right sm:block">Preço</span>
            <span className="w-24 text-right">Na live?</span>
            <span className="w-[72px]" aria-hidden="true" />
          </div>

          {loading ? (
            <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {debounced ? `Nenhum produto encontrado para "${debounced}".` : 'Nenhum produto neste filtro.'}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r, idx) => {
                const rank = page * pageSize + idx + 1;
                const st = rowState(r);
                const hasKids = r.children.length > 0;
                const isOpen = open.has(r.id);
                const onKids = r.children.filter((c) => wantedLeaf(c.id, c.inLive)).length;
                const changed = hasKids ? r.children.some((c) => pending.has(c.id)) : pending.has(r.id);
                const noStock = (r.stock ?? 0) <= 0;
                return (
                  <li key={r.id} className={changed ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                    <div className="flex items-center gap-3 px-3 py-2">
                      {canOrder && (
                        <Input
                          type="number" min={1} max={total} inputMode="numeric"
                          className="h-8 w-14 px-1 text-center tabular-nums"
                          aria-label={`Posição de ${r.code || r.name} na vitrine`}
                          disabled={movingId !== null}
                          value={posDraft.get(r.id) ?? String(rank)}
                          onChange={(e) => setPosDraft((prev) => new Map(prev).set(r.id, e.target.value))}
                          onBlur={() => movePosition(r, rank)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setPosDraft((prev) => { const n = new Map(prev); n.delete(r.id); return n; });
                          }}
                        />
                      )}
                      <Checkbox checked={st} onCheckedChange={(v) => setRow(r, v === true)} aria-label={`${st === true ? 'Tirar' : 'Colocar'} ${r.code || r.name} ${st === true ? 'da' : 'na'} live`} />
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {r.image_url
                          ? <img src={r.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : <div className="grid h-full w-full place-items-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{r.code || 'sem código'}</span>
                          {hasKids && (
                            <button type="button" onClick={() => toggleOpen(r.id)} className="ml-2 inline-flex items-center gap-0.5 rounded px-1 text-primary hover:underline" aria-expanded={isOpen}>
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {r.children.length} variações{st === 'indeterminate' ? ` · ${onKids} na live` : ''}
                            </button>
                          )}
                          {noStock && <span className="ml-2 text-amber-700">sem estoque: não aparece no link</span>}
                        </p>
                      </div>
                      <span className="hidden w-20 text-right text-sm tabular-nums sm:block">{r.stock ?? 0}</span>
                      <span className="hidden w-24 text-right text-sm tabular-nums sm:block">{money(r.promotional_price ?? r.price)}</span>
                      <span className="w-24 text-right">
                        {st === true && <Badge className="bg-emerald-600 hover:bg-emerald-600">Na live</Badge>}
                        {st === 'indeterminate' && <Badge className="bg-amber-500 hover:bg-amber-500">Parcial</Badge>}
                        {st === false && <Badge variant="outline">Fora</Badge>}
                      </span>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Oferta relâmpago de ${r.code || r.name}`}
                        title={r.inLive && (r.stock ?? 0) > 0 ? 'Oferta relâmpago' : 'Coloque o produto na live (e com estoque) para fazer oferta relâmpago'}
                        disabled={!r.inLive || (r.stock ?? 0) <= 0}
                        onClick={() => {
                          if (liveOffers.some((o) => o.product_id === r.id)) { toast({ title: 'Este produto já está em oferta', description: 'Encerre a oferta dele antes de disparar outra.', variant: 'destructive' }); return; }
                          if (liveOffers.length >= MAX_OFFERS) { toast({ title: `Já existem ${MAX_OFFERS} ofertas no ar`, description: 'Encerre uma delas antes de disparar outra.', variant: 'destructive' }); return; }
                          setOfferTarget({ id: r.id, name: r.name, code: r.code, price: r.price, stock: r.stock, inLive: r.inLive });
                        }}>
                        <Zap className={`h-4 w-4 ${liveOffers.some((o) => o.product_id === r.id) ? 'text-red-600' : ''}`} />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Editar ${r.code || r.name}`} onClick={() => setEditingId(r.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>

                    {hasKids && isOpen && (
                      <ul className="border-t bg-muted/20 py-1 pl-14 pr-3">
                        {r.children.map((c) => {
                          const on = wantedLeaf(c.id, c.inLive);
                          return (
                            <li key={c.id} className={`flex items-center gap-3 py-1.5 ${pending.has(c.id) ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                              <Checkbox checked={on} onCheckedChange={(v) => setChild(c, v === true)} aria-label={`${on ? 'Tirar' : 'Colocar'} ${r.name} ${c.label} ${on ? 'da' : 'na'} live`} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">{c.label}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  <span className="font-mono">{c.code || ''}</span>
                                  {c.stock <= 0 && <span className="ml-2 text-amber-700">sem estoque</span>}
                                </p>
                              </div>
                              <span className="w-20 text-right text-sm tabular-nums">{c.stock}</span>
                              <span className="w-24 text-right">
                                {on ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Na live</Badge> : <Badge variant="outline">Fora</Badge>}
                              </span>
                              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Editar ${r.name} ${c.label}`} onClick={() => setEditingId(c.id)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} produto(s){debounced ? ' encontrados' : ''}</span>
          <label className="flex items-center gap-1.5">
            Por página
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              aria-label="Produtos por página"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
            <span>Página {page + 1} de {pages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </Card>

      <LiveFlashOfferDialog
        target={offerTarget}
        open={offerTarget !== null}
        onOpenChange={handleOfferOpenChange}
        onStarted={loadOffer}
      />

      <LiveProductEditDialog
        productId={editingId}
        open={editingId !== null}
        onOpenChange={handleEditOpenChange}
        onSaved={handleEditSaved}
      />

      <div className="sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t bg-background/95 px-1 py-3 backdrop-blur">
        {dirty && (
          <span className="mr-auto text-xs text-amber-700">
            Alterações não salvas: {summary.add > 0 && <>{summary.add} para entrar</>}{summary.add > 0 && summary.remove > 0 && ' · '}{summary.remove > 0 && <>{summary.remove} para sair</>}
          </span>
        )}
        <Button variant="outline" disabled={!dirty || saving} onClick={() => setPending(new Map())}>Descartar</Button>
        <Button disabled={!dirty || saving} onClick={save}>
          {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}
