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
import { Loader2, Package, Search, X } from 'lucide-react';

// Um produto está "na live" quando o tipo de venda é LIVE ou AMBOS (é o que a vitrine do link usa).
// Marcar = vira AMBOS (continua no bazar); desmarcar = vira BAZAR (sai da live).
const IN_LIVE = ['LIVE', 'AMBOS'];
const PAGE_SIZE = 50;

type Row = {
  id: number;
  code: string | null;
  name: string;
  price: number | null;
  promotional_price: number | null;
  stock: number | null;
  image_url: string | null;
  sale_type: string | null;
  variants: number;     // quantidade de variações (filhos)
  inLive: boolean;      // estado salvo no banco
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
  // alterações ainda não salvas: id do produto -> quer estar na live?
  const [pending, setPending] = useState<Map<number, boolean>>(new Map());
  // guarda o estado salvo de cada produto mexido, para saber o que gravar mesmo depois de trocar de busca/página
  const [known, setKnown] = useState<Map<number, Row>>(new Map());

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
    const { data, count, error } = await query
      .order('code', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      setLoading(false);
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
      return;
    }
    const list = (data as any[]) || [];
    // variações (filhos) desses produtos: somam estoque e acompanham o pai
    const ids = list.map((p) => p.id);
    const kids = new Map<number, { n: number; stock: number; live: boolean }>();
    if (ids.length) {
      const { data: ch } = await supabase.from('products').select('parent_product_id, stock, sale_type').eq('tenant_id', tenant.id).in('parent_product_id', ids);
      for (const c of (ch as any[]) || []) {
        const k = kids.get(c.parent_product_id) || { n: 0, stock: 0, live: false };
        k.n += 1; k.stock += Number(c.stock) || 0; k.live = k.live || IN_LIVE.includes(c.sale_type);
        kids.set(c.parent_product_id, k);
      }
    }
    const mapped: Row[] = list.map((p) => {
      const k = kids.get(p.id);
      return {
        id: p.id, code: p.code, name: p.name, price: p.price, promotional_price: p.promotional_price,
        stock: k ? k.stock : p.stock, image_url: p.image_url, sale_type: p.sale_type,
        variants: k?.n || 0, inLive: IN_LIVE.includes(p.sale_type) || !!k?.live,
      };
    });
    setRows(mapped);
    setTotal(count ?? mapped.length);
    setKnown((prev) => { const n = new Map(prev); mapped.forEach((r) => n.set(r.id, r)); return n; });
    setLoading(false);
  }, [tenant?.id, debounced, filter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { countInLive(); }, [countInLive]);

  const wanted = (r: Row) => (pending.has(r.id) ? pending.get(r.id)! : r.inLive);

  function toggle(r: Row, value: boolean) {
    setPending((prev) => {
      const n = new Map(prev);
      if (value === r.inLive) n.delete(r.id); else n.set(r.id, value);
      return n;
    });
  }

  const allOnPage = rows.length > 0 && rows.every((r) => wanted(r));
  const someOnPage = rows.some((r) => wanted(r));
  function toggleAllOnPage(value: boolean) {
    setPending((prev) => {
      const n = new Map(prev);
      rows.forEach((r) => { if (value === r.inLive) n.delete(r.id); else n.set(r.id, value); });
      return n;
    });
  }

  const summary = useMemo(() => {
    let add = 0, remove = 0;
    pending.forEach((want, id) => { if (want) add++; else remove++; void id; });
    return { add, remove };
  }, [pending]);

  async function save() {
    if (!tenant?.id || pending.size === 0) return;
    setSaving(true);
    const toLive: number[] = [];
    const toOut: number[] = [];
    pending.forEach((want, id) => {
      const saved = known.get(id);
      if (want && !saved?.inLive) toLive.push(id);
      if (!want && saved?.inLive) toOut.push(id);
    });
    const chunk = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / 150) }, (_, i) => a.slice(i * 150, i * 150 + 150));
    try {
      for (const ids of chunk(toLive)) {
        // só quem hoje é BAZAR vira AMBOS; quem já é LIVE/AMBOS fica como está
        const a = await supabase.from('products').update({ sale_type: 'AMBOS' } as any).eq('tenant_id', tenant.id).in('id', ids).eq('sale_type', 'BAZAR');
        if (a.error) throw a.error;
        const b = await supabase.from('products').update({ sale_type: 'AMBOS' } as any).eq('tenant_id', tenant.id).in('parent_product_id', ids).eq('sale_type', 'BAZAR');
        if (b.error) throw b.error;
      }
      for (const ids of chunk(toOut)) {
        const a = await supabase.from('products').update({ sale_type: 'BAZAR' } as any).eq('tenant_id', tenant.id).in('id', ids);
        if (a.error) throw a.error;
        const b = await supabase.from('products').update({ sale_type: 'BAZAR' } as any).eq('tenant_id', tenant.id).in('parent_product_id', ids);
        if (b.error) throw b.error;
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

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dirty = pending.size > 0;

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">Produtos da live</h3>
            <p className="text-xs text-muted-foreground">
              Marque os produtos que aparecem no link da live e clique em <b>Salvar</b>. Desmarque e salve para tirar da live. Os produtos continuam cadastrados e à venda no bazar.
            </p>
          </div>
          {inLiveCount !== null && <Badge variant="secondary">{inLiveCount} na live</Badge>}
        </div>

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
            <span className="flex-1">Produto</span>
            <span className="hidden w-20 text-right sm:block">Estoque</span>
            <span className="hidden w-24 text-right sm:block">Preço</span>
            <span className="w-24 text-right">Na live?</span>
          </div>

          {loading ? (
            <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {debounced ? `Nenhum produto encontrado para "${debounced}".` : 'Nenhum produto neste filtro.'}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => {
                const on = wanted(r);
                const changed = pending.has(r.id);
                const noStock = (r.stock ?? 0) <= 0;
                return (
                  <li key={r.id} className={`flex items-center gap-3 px-3 py-2 ${changed ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                    <Checkbox checked={on} onCheckedChange={(v) => toggle(r, v === true)} aria-label={`${on ? 'Tirar' : 'Colocar'} ${r.code || r.name} ${on ? 'da' : 'na'} live`} />
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {r.image_url
                        ? <img src={r.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <div className="grid h-full w-full place-items-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{r.code || 'sem código'}</span>
                        {r.variants > 0 && <> · {r.variants} variações</>}
                        {noStock && <span className="ml-2 text-amber-700">sem estoque: não aparece no link</span>}
                      </p>
                    </div>
                    <span className="hidden w-20 text-right text-sm tabular-nums sm:block">{r.stock ?? 0}</span>
                    <span className="hidden w-24 text-right text-sm tabular-nums sm:block">{money(r.promotional_price ?? r.price)}</span>
                    <span className="w-24 text-right">
                      {on ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Na live</Badge> : <Badge variant="outline">Fora</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} produto(s){debounced ? ' encontrados' : ''}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
            <span>Página {page + 1} de {pages}</span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </Card>

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
