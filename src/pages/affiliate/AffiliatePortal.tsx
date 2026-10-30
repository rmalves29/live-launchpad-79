/**
 * Página da afiliada (Loja da Live): /t/:slug/afiliada/:token
 * Acesso por link secreto. A afiliada escolhe os produtos da vitrine dela, vê o link, as vendas e a comissão e, se o lojista
 * liberou, dispara oferta relâmpago, cria cupons e define frete grátis. Tudo passa pela função `affiliate-portal`, que confere
 * permissões e limites no servidor.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Copy, Loader2, Lock, Package, Search, X, Zap } from 'lucide-react';
import { LIVE_SHOP_PUBLIC_BASE } from '@/lib/live-shop';

type PoolItem = { id: number; code: string | null; name: string; image_url: string | null; price: number; promotional_price: number | null; stock: number; variations: number };
type Portal = {
  ok: true;
  affiliate: {
    name: string; code: string; commission_percent: number; pix_key: string;
    allow_flash: boolean; allow_coupons: boolean; allow_free_shipping: boolean;
    flash_max_concurrent: number; flash_max_minutes: number; flash_max_discount_pct: number;
    coupon_max_active: number; coupon_max_discount_pct: number; coupon_min_order: number;
    ship_min_order: number; free_ship_min: number | null;
  };
  tenant: { name: string; slug: string; logo_url: string | null; primary_color: string | null };
  pool: PoolItem[];
  selected: { product_id: number; position: number }[];
  coupons: { id: number; code: string; percent: number; min_order: number; is_active: boolean; used: number }[];
  flashes: { id: string; product_id: number; price: number; ends_at: string; name: string; code: string | null; normal_price: number }[];
  summary: { sales: number; commission: number; to_receive: number; received: number; sales_month: number; commission_month: number; orders: number };
  orders: { id: number; created_at: string; customer: string; total: number; commission: number; percent: number; status: string }[];
  now: string;
};

const PAGE_SIZES = [25, 50, 100];
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: string) => { const x = Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hms = (s: number) => { const x = Math.max(0, s); return [Math.floor(x / 3600), Math.floor((x % 3600) / 60), x % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
const STATUS: Record<string, [string, 'default' | 'secondary' | 'outline']> = {
  aguardando: ['Aguardando pagamento', 'outline'], confirmado: ['Confirmada', 'default'], comissao_paga: ['Comissão paga', 'default'], cancelado: ['Cancelado', 'secondary'],
};

async function api(token: string, action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('affiliate-portal', { body: { action, token, ...extra } });
  if (error) throw new Error(error.message || 'Falha de conexão');
  return data as any;
}

function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const Locked = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground"><Lock className="h-4 w-4" />{text}</div>
);

export default function AffiliatePortal() {
  const { token = '' } = useParams<{ slug: string; token: string }>();
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [clock, setClock] = useState(0);

  // vitrine
  const [chosen, setChosen] = useState<number[] | null>(null); // ids na ordem; null = ainda igual ao salvo
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'in'>('in');
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [pos, setPos] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);

  // formulários
  const [fProduct, setFProduct] = useState('');
  const [fPrice, setFPrice] = useState('');
  const [fMinutes, setFMinutes] = useState(15);
  const [cCode, setCCode] = useState('');
  const [cPct, setCPct] = useState('10');
  const [cMin, setCMin] = useState('');
  const [shipMin, setShipMin] = useState('');
  const [pix, setPix] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api(token, 'get');
      if (!r?.ok) { setError(r?.error || 'Link inválido.'); setData(null); return; }
      setError(null);
      setData(r as Portal);
      setClock(new Date(r.now).getTime() - Date.now());
      setPix(r.affiliate.pix_key || '');
      setShipMin(r.affiliate.free_ship_min != null ? String(r.affiliate.free_ship_min).replace('.', ',') : '');
    } catch (e: any) {
      setError(e?.message || 'Não foi possível carregar. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setPage(0); }, [search, filter, pageSize]);

  const savedIds = useMemo(() => (data ? [...data.selected].sort((a, b) => a.position - b.position).map((r) => r.product_id) : []), [data]);
  const ids = chosen ?? savedIds;
  const idSet = useMemo(() => new Set(ids), [ids]);
  const dirty = chosen !== null && JSON.stringify(chosen) !== JSON.stringify(savedIds);
  const byId = useMemo(() => new Map((data?.pool || []).map((p) => [p.id, p])), [data]);

  const visible = useMemo(() => {
    if (!data) return [] as PoolItem[];
    const words = norm(search).split(/\s+/).filter(Boolean);
    const base = filter === 'in' ? ids.map((id) => byId.get(id)).filter(Boolean) as PoolItem[] : data.pool;
    return words.length ? base.filter((p) => { const t = `${norm(p.name)} ${norm(p.code || '')}`; return words.every((w) => t.includes(w)); }) : base;
  }, [data, ids, byId, search, filter]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const pageRows = visible.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const canOrder = filter === 'in' && !search.trim();

  const toggle = (id: number, on: boolean) => setChosen((prev) => {
    const cur = prev ?? savedIds;
    return on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id);
  });
  const move = (id: number, want: number) => setChosen((prev) => {
    const cur = (prev ?? savedIds).filter((x) => x !== id);
    cur.splice(Math.max(0, Math.min(cur.length, want - 1)), 0, id);
    return cur;
  });
  const commitPos = (id: number, rank: number) => {
    const raw = pos.get(id);
    setPos((p) => { const n = new Map(p); n.delete(id); return n; });
    if (raw === undefined) return;
    const want = Math.floor(Number(raw));
    if (Number.isFinite(want) && want >= 1 && want !== rank) move(id, want);
  };

  async function run(label: string, fn: () => Promise<any>, okMsg: string, after?: () => void) {
    setBusy(label);
    try {
      const r = await fn();
      if (!r?.ok) { toast.error(r?.error || 'Não foi possível concluir.'); return false; }
      toast.success(okMsg);
      after?.();
      await load();
      return true;
    } catch (e: any) {
      toast.error(e?.message || 'Sem conexão. Tente novamente.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveProducts() {
    setSaving(true);
    try {
      const r = await api(token, 'save_products', { ids });
      if (!r?.ok) { toast.error(r?.error || 'Não foi possível salvar.'); return; }
      toast.success(`Vitrine salva: ${r.saved} produto(s). O seu link já mostra a mudança.`);
      setChosen(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Sem conexão. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-3xl space-y-3 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (error || !data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center space-y-2">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Página indisponível</h1>
        <p className="text-sm text-muted-foreground">{error || 'Link inválido ou desativado. Peça um novo link ao lojista.'}</p>
      </div>
    );
  }

  const a = data.affiliate;
  const shopUrl = `${LIVE_SHOP_PUBLIC_BASE}/t/${data.tenant.slug}/live/a/${a.code}`;
  const selectedProducts = ids.map((id) => byId.get(id)).filter(Boolean) as PoolItem[];

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
        <header className="flex items-center gap-3">
          {data.tenant.logo_url
            ? <img src={data.tenant.logo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
            : <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{data.tenant.name.slice(0, 1)}</div>}
          <div className="flex-1">
            <h1 className="text-lg font-semibold">Olá, {a.name.split(' ')[0]}</h1>
            <p className="text-xs text-muted-foreground">Afiliada da {data.tenant.name} · comissão de {a.commission_percent}%</p>
          </div>
          <Badge variant="secondary">{ids.length} na sua vitrine</Badge>
        </header>

        <Section title="Seu link para divulgar" hint="É a sua vitrine: só aparecem os produtos que você marcar abaixo.">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 text-xs">{shopUrl}</code>
            <Button size="sm" onClick={() => navigator.clipboard.writeText(shopUrl).then(() => toast.success('Link copiado'), () => toast.message(shopUrl))}><Copy className="mr-1.5 h-4 w-4" />Copiar</Button>
          </div>
        </Section>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ['Vendas no mês', money(data.summary.sales_month), ''],
            ['Minha comissão no mês', money(data.summary.commission_month), ''],
            ['A receber', money(data.summary.to_receive), 'text-amber-600'],
            ['Já recebi', money(data.summary.received), 'text-emerald-600'],
          ].map(([l, v, c]) => (
            <div key={l} className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className={`text-lg font-medium tabular-nums ${c}`}>{v}</p>
            </div>
          ))}
        </div>

        <Section
          title="Produtos da minha vitrine"
          hint="Marque o que quer vender e defina a ordem. Preço e estoque são da loja. Clique em Salvar para o seu link mostrar a mudança."
          right={dirty ? <Badge className="bg-amber-500 hover:bg-amber-500">Alterações não salvas</Badge> : undefined}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pelo código ou nome" className="pl-9 pr-9" aria-label="Buscar produto" />
              {search && <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground" aria-label="Limpar busca"><X className="h-4 w-4" /></button>}
            </div>
            <div className="inline-flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Filtrar produtos">
              {([['in', 'Na minha vitrine'], ['all', 'Todos']] as const).map(([v, label]) => (
                <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}
                  className={`rounded-md px-3 py-1.5 ${filter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border">
            {pageRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {data.pool.length === 0 ? 'A loja ainda não deixou produtos disponíveis para você.' : filter === 'in' && !search ? 'Você ainda não marcou produtos. Troque para "Todos" e marque os que quiser vender.' : 'Nenhum produto encontrado.'}
              </p>
            ) : (
              <ul className="divide-y">
                {pageRows.map((p, i) => {
                  const on = idSet.has(p.id);
                  const rank = safePage * pageSize + i + 1;
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      {canOrder && (
                        <Input type="number" min={1} max={ids.length} inputMode="numeric" className="h-8 w-14 px-1 text-center tabular-nums" aria-label={`Posição de ${p.name}`}
                          value={pos.get(p.id) ?? String(rank)}
                          onChange={(e) => setPos((m) => new Map(m).set(p.id, e.target.value))}
                          onBlur={() => commitPos(p.id, rank)}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                      )}
                      <Checkbox checked={on} onCheckedChange={(v) => toggle(p.id, v === true)} aria-label={`${on ? 'Tirar' : 'Colocar'} ${p.name} ${on ? 'da' : 'na'} vitrine`} />
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {p.image_url ? <img src={p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{p.code || 'sem código'}</span>{p.variations > 0 ? ` · ${p.variations} variações` : ''}
                          {p.stock <= 0 && <span className="ml-2 text-amber-700">sem estoque: não aparece no link</span>}
                        </p>
                      </div>
                      <span className="hidden w-16 text-right text-sm tabular-nums sm:block">{p.stock}</span>
                      <span className="w-24 text-right text-sm tabular-nums">{money(p.promotional_price ?? p.price)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{visible.length} produto(s)</span>
            <label className="flex items-center gap-1.5">Por página
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" aria-label="Produtos por página">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</Button>
              <span>Página {safePage + 1} de {pages}</span>
              <Button size="sm" variant="outline" disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)}>Próxima</Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setChosen(null)}>Descartar</Button>
            <Button disabled={!dirty || saving} onClick={saveProducts}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando…</> : 'Salvar minha vitrine'}</Button>
          </div>
        </Section>

        {a.allow_flash ? (
          <Section title="Oferta relâmpago" hint={`Até ${a.flash_max_concurrent} por vez, duração de até ${a.flash_max_minutes} min e desconto de até ${a.flash_max_discount_pct}%. Vale só no seu link.`}>
            {data.flashes.map((f) => {
              const left = Math.floor((Date.parse(f.ends_at) - (now + clock)) / 1000);
              if (left <= 0) return null;
              return (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="flex items-center gap-1.5"><Zap className="h-4 w-4" /><b>{f.name}</b> por {money(f.price)} · termina em <b className="tabular-nums">{hms(left)}</b></span>
                  <Button size="sm" variant="outline" disabled={busy === `end${f.id}`} onClick={() => run(`end${f.id}`, () => api(token, 'end_flash', { id: f.id }), 'Oferta encerrada')}>Encerrar agora</Button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="fl-prod">Produto da sua vitrine</label>
                <select id="fl-prod" value={fProduct} onChange={(e) => setFProduct(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="">Escolha…</option>
                  {selectedProducts.filter((p) => p.stock > 0).map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name} ({money(p.price)})</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="fl-price">Preço da oferta</label>
                <Input id="fl-price" className="w-28" inputMode="decimal" placeholder="39,90" value={fPrice} onChange={(e) => setFPrice(e.target.value)} />
              </div>
              <div className="flex gap-1">
                {[5, 10, 15, 30].filter((m) => m <= a.flash_max_minutes).map((m) => (
                  <button key={m} type="button" aria-pressed={fMinutes === m} onClick={() => setFMinutes(m)} className={`rounded-md border px-3 py-2 text-sm ${fMinutes === m ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`}>{m} min</button>
                ))}
              </div>
              <Button disabled={busy === 'flash'} onClick={() => {
                const price = num(fPrice);
                if (!fProduct) return toast.error('Escolha o produto da oferta.');
                if (!(price > 0)) return toast.error('Informe o preço da oferta, por exemplo 39,90.');
                run('flash', () => api(token, 'start_flash', { product_id: Number(fProduct), price, minutes: fMinutes }), 'Oferta relâmpago no ar', () => { setFPrice(''); });
              }}><Zap className="mr-1.5 h-4 w-4" />Disparar</Button>
            </div>
          </Section>
        ) : <Locked text="Oferta relâmpago: não liberada pelo lojista." />}

        {a.allow_coupons ? (
          <Section title="Meus cupons" hint={`Até ${a.coupon_max_active} ativos, desconto de até ${a.coupon_max_discount_pct}% e pedido mínimo de pelo menos ${money(a.coupon_min_order)}. Valem só no seu link.`}>
            {data.coupons.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {data.coupons.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span><b className="font-medium">{c.code}</b> · {c.percent}%{c.min_order > 0 ? ` acima de ${money(c.min_order)}` : ''} · {c.used} uso(s)</span>
                    <Button size="sm" variant="outline" disabled={busy === `c${c.id}`} onClick={() => run(`c${c.id}`, () => api(token, 'toggle_coupon', { id: c.id, active: !c.is_active }), c.is_active ? 'Cupom desativado' : 'Cupom ativado')}>{c.is_active ? 'Desativar' : 'Ativar'}</Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="cp-code">Código</label><Input id="cp-code" className="w-36" value={cCode} onChange={(e) => setCCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="MARINA10" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="cp-pct">Desconto (%)</label><Input id="cp-pct" className="w-24" inputMode="decimal" value={cPct} onChange={(e) => setCPct(e.target.value)} /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="cp-min">Pedido mínimo (R$)</label><Input id="cp-min" className="w-32" inputMode="decimal" value={cMin} onChange={(e) => setCMin(e.target.value)} placeholder={String(a.coupon_min_order).replace('.', ',')} /></div>
              <Button disabled={busy === 'coupon'} onClick={() => {
                const pct = num(cPct); const min = cMin.trim() ? num(cMin) : a.coupon_min_order;
                if (cCode.length < 3) return toast.error('O código precisa ter de 3 a 20 letras ou números.');
                if (!(pct > 0)) return toast.error('Informe o desconto.');
                run('coupon', () => api(token, 'create_coupon', { code: cCode, percent: pct, min_order: Number.isFinite(min) ? min : 0 }), 'Cupom criado', () => { setCCode(''); });
              }}>Criar cupom</Button>
            </div>
          </Section>
        ) : <Locked text="Cupons: não liberados pelo lojista." />}

        {a.allow_free_shipping ? (
          <Section title="Frete grátis" hint={`Frete grátis no seu link a partir de um valor de pedido que você escolhe (mínimo de ${money(a.ship_min_order)}).`}>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor="sh-min">Frete grátis a partir de (R$)</label><Input id="sh-min" className="w-36" inputMode="decimal" value={shipMin} onChange={(e) => setShipMin(e.target.value)} placeholder={String(a.ship_min_order).replace('.', ',')} /></div>
              <Button disabled={busy === 'ship'} onClick={() => {
                const v = num(shipMin);
                if (!(v >= 0)) return toast.error('Informe o valor do pedido, por exemplo 200,00.');
                run('ship', () => api(token, 'set_free_ship', { min: v }), 'Frete grátis salvo');
              }}>Salvar</Button>
              {a.free_ship_min != null && <Button variant="outline" disabled={busy === 'shipoff'} onClick={() => run('shipoff', () => api(token, 'set_free_ship', { min: null }), 'Frete grátis desligado', () => setShipMin(''))}>Desligar</Button>}
            </div>
            <p className="text-xs text-muted-foreground">{a.free_ship_min != null ? `Ligado: frete grátis em pedidos a partir de ${money(a.free_ship_min)}.` : 'Desligado.'}</p>
          </Section>
        ) : <Locked text="Frete grátis: não liberado pelo lojista." />}

        <Section title="Minhas vendas" hint="Aparecem pelo primeiro nome do cliente. A comissão é confirmada quando o pagamento é aprovado.">
          {data.orders.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Ainda não há vendas pelo seu link. Divulgue o link acima.</p>
          ) : (
            <ul className="divide-y">
              {data.orders.slice(0, 100).map((o) => {
                const [label, variant] = STATUS[o.status] || STATUS.aguardando;
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{o.customer}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{money(o.total)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">comissão {money(o.commission)}</p>
                    </div>
                    <Badge variant={variant}>{label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Meu Pix" hint="A chave que o lojista usa para pagar a sua comissão.">
          <div className="flex flex-wrap items-end gap-2">
            <Input className="max-w-xs" value={pix} onChange={(e) => setPix(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" aria-label="Chave Pix" />
            <Button variant="outline" disabled={busy === 'pix'} onClick={() => run('pix', () => api(token, 'set_pix', { pix_key: pix }), 'Pix salvo')}>Salvar Pix</Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
