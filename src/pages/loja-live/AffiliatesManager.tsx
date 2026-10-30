import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Copy, ExternalLink, Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { LIVE_SHOP_PUBLIC_BASE, liveShopUrl } from '@/lib/live-shop';

type Affiliate = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  pix_key: string | null;
  commission_percent: number;
  is_active: boolean;
  access_token: string;
  allow_flash: boolean;
  allow_coupons: boolean;
  allow_free_shipping: boolean;
  flash_max_concurrent: number;
  flash_max_minutes: number;
  flash_max_discount_pct: number;
  coupon_max_active: number;
  coupon_max_discount_pct: number;
  coupon_min_order: number;
  ship_min_order: number;
};

type OrderRow = {
  id: number;
  affiliate_id: string;
  created_at: string;
  customer_name: string | null;
  total_amount: number | null;
  coupon_discount: number | null;
  is_paid: boolean;
  is_cancelled: boolean;
  affiliate_commission_amount: number | null;
  affiliate_paid_at: string | null;
};

type Form = {
  id?: string;
  name: string;
  code: string;
  phone: string;
  pix_key: string;
  commission_percent: string;
  is_active: boolean;
  allow_flash: boolean;
  allow_coupons: boolean;
  allow_free_shipping: boolean;
  flash_max_concurrent: string;
  flash_max_minutes: string;
  flash_max_discount_pct: string;
  coupon_max_active: string;
  coupon_max_discount_pct: string;
  coupon_min_order: string;
  ship_min_order: string;
};

const EMPTY: Form = {
  name: '', code: '', phone: '', pix_key: '', commission_percent: '10', is_active: true,
  allow_flash: false, allow_coupons: false, allow_free_shipping: false,
  flash_max_concurrent: '1', flash_max_minutes: '30', flash_max_discount_pct: '30',
  coupon_max_active: '3', coupon_max_discount_pct: '10', coupon_min_order: '0', ship_min_order: '150',
};

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const n = (v: string, d = 0) => { const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : d; };
const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado`, description: text });
  } catch {
    toast({ title: 'Copie manualmente', description: text });
  }
}

function PermissionRow({ title, hint, checked, onChange, children }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      </div>
      <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${checked ? '' : 'opacity-40'}`}>{children}</div>
    </div>
  );
}

const Num = ({ value, onChange, w = 'w-16' }: { value: string; onChange: (v: string) => void; w?: string }) => (
  <Input className={`h-8 ${w} px-1 text-center text-xs`} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
);

export function AffiliatesManager() {
  const { tenant } = useTenant();
  const [list, setList] = useState<Affiliate[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [a, o] = await Promise.all([
      supabase.from('affiliates' as any).select('*').eq('tenant_id', tenant.id).order('name', { ascending: true }),
      supabase.from('orders').select('id, affiliate_id, created_at, customer_name, total_amount, coupon_discount, is_paid, is_cancelled, affiliate_commission_amount, affiliate_paid_at' as any)
        .eq('tenant_id', tenant.id).not('affiliate_id' as any, 'is', null).order('id', { ascending: false }).range(0, 4999),
    ]);
    if (a.error) toast({ title: 'Erro ao carregar afiliadas', description: a.error.message, variant: 'destructive' });
    setList(((a.data as any[]) || []) as Affiliate[]);
    setOrders(((o.data as any[]) || []) as OrderRow[]);
    setLoading(false);
  }, [tenant?.id]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const by = new Map<string, { sales: number; commission: number; toPay: number; paid: number; count: number; pending: number }>();
    for (const o of orders) {
      const s = by.get(o.affiliate_id) || { sales: 0, commission: 0, toPay: 0, paid: 0, count: 0, pending: 0 };
      const com = Number(o.affiliate_commission_amount) || 0;
      if (o.is_cancelled) { by.set(o.affiliate_id, s); continue; }
      if (o.is_paid) {
        // pedido pago grava o total sem o cupom: a venda é o valor depois do desconto
        s.sales += Math.max(0, (Number(o.total_amount) || 0) - (Number(o.coupon_discount) || 0)); s.commission += com; s.count += 1;
        if (o.affiliate_paid_at) s.paid += com; else s.toPay += com;
      } else {
        s.pending += 1;
      }
      by.set(o.affiliate_id, s);
    }
    return by;
  }, [orders]);

  const totals = useMemo(() => {
    let sales = 0, commission = 0, toPay = 0, paid = 0;
    stats.forEach((s) => { sales += s.sales; commission += s.commission; toPay += s.toPay; paid += s.paid; });
    return { sales, commission, toPay, paid };
  }, [stats]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  function openNew() { setForm({ ...EMPTY }); }
  function openEdit(a: Affiliate) {
    setForm({
      id: a.id, name: a.name, code: a.code, phone: a.phone || '', pix_key: a.pix_key || '',
      commission_percent: String(a.commission_percent), is_active: a.is_active,
      allow_flash: a.allow_flash, allow_coupons: a.allow_coupons, allow_free_shipping: a.allow_free_shipping,
      flash_max_concurrent: String(a.flash_max_concurrent), flash_max_minutes: String(a.flash_max_minutes), flash_max_discount_pct: String(a.flash_max_discount_pct),
      coupon_max_active: String(a.coupon_max_active), coupon_max_discount_pct: String(a.coupon_max_discount_pct), coupon_min_order: String(a.coupon_min_order),
      ship_min_order: String(a.ship_min_order),
    });
  }

  async function save() {
    if (!form || !tenant?.id) return;
    const name = form.name.trim();
    const code = cleanCode(form.code || form.name);
    const pct = n(form.commission_percent, -1);
    if (name.length < 2) return toast({ title: 'Digite o nome da afiliada', variant: 'destructive' });
    if (code.length < 3) return toast({ title: 'O código do link precisa ter de 3 a 20 letras ou números', variant: 'destructive' });
    if (pct < 0 || pct > 100) return toast({ title: 'A comissão precisa ficar entre 0% e 100%', variant: 'destructive' });
    const payload: any = {
      tenant_id: tenant.id, name, code, phone: form.phone.trim() || null, pix_key: form.pix_key.trim() || null,
      commission_percent: pct, is_active: form.is_active,
      allow_flash: form.allow_flash, allow_coupons: form.allow_coupons, allow_free_shipping: form.allow_free_shipping,
      flash_max_concurrent: Math.max(0, Math.min(10, Math.floor(n(form.flash_max_concurrent, 1)))),
      flash_max_minutes: Math.max(1, Math.min(1440, Math.floor(n(form.flash_max_minutes, 30)))),
      flash_max_discount_pct: Math.max(0, Math.min(100, n(form.flash_max_discount_pct, 30))),
      coupon_max_active: Math.max(0, Math.min(50, Math.floor(n(form.coupon_max_active, 3)))),
      coupon_max_discount_pct: Math.max(0, Math.min(100, n(form.coupon_max_discount_pct, 10))),
      coupon_min_order: Math.max(0, n(form.coupon_min_order, 0)),
      ship_min_order: Math.max(0, n(form.ship_min_order, 150)),
      updated_at: new Date().toISOString(),
    };
    setSaving(true);
    const res = form.id
      ? await supabase.from('affiliates' as any).update(payload).eq('id', form.id)
      : await supabase.from('affiliates' as any).insert(payload);
    setSaving(false);
    if (res.error) {
      const dup = (res.error as any).code === '23505';
      toast({ title: dup ? 'Esse código de link já existe' : 'Erro ao salvar', description: dup ? 'Escolha outro código para a afiliada.' : res.error.message, variant: 'destructive' });
      return;
    }
    toast({ title: form.id ? 'Afiliada atualizada' : 'Afiliada criada', description: form.id ? undefined : 'Copie o link da página dela e envie para ela.' });
    setForm(null);
    load();
  }

  async function toggleActive(a: Affiliate) {
    setBusyId(a.id);
    const { error } = await supabase.from('affiliates' as any).update({ is_active: !a.is_active, updated_at: new Date().toISOString() } as any).eq('id', a.id);
    setBusyId(null);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    load();
  }

  async function renewToken(a: Affiliate) {
    if (!window.confirm(`Gerar um novo link da página de ${a.name}? O link antigo para de funcionar.`)) return;
    setBusyId(a.id);
    const token = (crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''));
    const { error } = await supabase.from('affiliates' as any).update({ access_token: token, updated_at: new Date().toISOString() } as any).eq('id', a.id);
    setBusyId(null);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    toast({ title: 'Novo link gerado', description: 'Envie o novo link para a afiliada.' });
    load();
  }

  async function markPaid(a: Affiliate) {
    const s = stats.get(a.id);
    if (!s || s.toPay <= 0) return;
    if (!window.confirm(`Marcar ${money(s.toPay)} de comissão de ${a.name} como paga?`)) return;
    setBusyId(a.id);
    const { error } = await supabase.from('orders').update({ affiliate_paid_at: new Date().toISOString() } as any)
      .eq('tenant_id', tenant!.id).eq('affiliate_id' as any, a.id).eq('is_paid', true).eq('is_cancelled', false).is('affiliate_paid_at' as any, null);
    setBusyId(null);
    if (error) return toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    toast({ title: 'Comissão marcada como paga', description: `${a.name}: ${money(s.toPay)}` });
    load();
  }

  const shopLink = (a: Affiliate) => `${liveShopUrl(tenant!.slug)}/a/${a.code}`;
  const portalLink = (a: Affiliate) => `${LIVE_SHOP_PUBLIC_BASE}/t/${tenant!.slug}/afiliada/${a.access_token}`;
  const detail = list.find((a) => a.id === detailId) || null;
  const detailOrders = orders.filter((o) => o.affiliate_id === detailId);

  return (
    <div className="space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" />Afiliadas</h3>
            <p className="text-xs text-muted-foreground">
              Cada afiliada tem um link de vitrine para divulgar e uma página própria, onde ela escolhe os produtos e acompanha as vendas. A comissão vale sobre o pedido depois do desconto, quando o pagamento é confirmado.
            </p>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="mr-1.5 h-4 w-4" />Nova afiliada</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ['Vendas pagas', money(totals.sales), ''],
            ['Comissão gerada', money(totals.commission), ''],
            ['A pagar', money(totals.toPay), 'text-amber-600'],
            ['Já paga', money(totals.paid), 'text-emerald-600'],
          ].map(([label, value, cls]) => (
            <div key={label} className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-lg font-medium tabular-nums ${cls}`}>{value}</p>
            </div>
          ))}
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-28 w-full" />
      ) : list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma afiliada cadastrada. Clique em <b>Nova afiliada</b> para começar.</Card>
      ) : (
        <div className="space-y-2">
          {list.map((a) => {
            const s = stats.get(a.id) || { sales: 0, commission: 0, toPay: 0, paid: 0, count: 0, pending: 0 };
            return (
              <Card key={a.id} className={`p-3 space-y-2 ${a.is_active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-medium text-primary">{initials(a.name)}</div>
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {a.name}
                        {!a.is_active && <Badge variant="secondary">Desativada</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Comissão {a.commission_percent}% · {s.count} venda(s){s.pending ? ` · ${s.pending} aguardando pagamento` : ''}
                        {a.allow_flash || a.allow_coupons || a.allow_free_shipping ? ` · pode: ${[a.allow_flash && 'oferta', a.allow_coupons && 'cupom', a.allow_free_shipping && 'frete grátis'].filter(Boolean).join(', ')}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">{money(s.sales)} vendidos</p>
                    <p className={`text-xs tabular-nums ${s.toPay > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{money(s.toPay)} a pagar</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-xs">{shopLink(a)}</code>
                  <Button size="sm" variant="outline" onClick={() => copy(shopLink(a), 'Link da vitrine')}><Copy className="mr-1.5 h-3.5 w-3.5" />Link da vitrine</Button>
                  <Button size="sm" variant="outline" onClick={() => copy(portalLink(a), 'Link da página da afiliada')}><Copy className="mr-1.5 h-3.5 w-3.5" />Link da página dela</Button>
                  <Button size="sm" variant="ghost" asChild><a href={portalLink(a)} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Abrir página</a></Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetailId(a.id)}>Ver pedidos</Button>
                  <Button size="sm" variant="outline" disabled={busyId === a.id || s.toPay <= 0} onClick={() => markPaid(a)}>Marcar comissão como paga</Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button>
                  <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => renewToken(a)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Novo link da página</Button>
                  <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => toggleActive(a)}>{a.is_active ? 'Desativar' : 'Ativar'}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => { if (!o && !saving) setForm(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar afiliada' : 'Nova afiliada'}</DialogTitle>
            <DialogDescription>Dados da afiliada, comissão e o que ela pode fazer na vitrine dela.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label htmlFor="af-name">Nome</Label><Input id="af-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Marina Souza" /></div>
                <div className="space-y-1">
                  <Label htmlFor="af-code">Código do link</Label>
                  <Input id="af-code" value={form.code} onChange={(e) => set('code', cleanCode(e.target.value))} placeholder={cleanCode(form.name) || 'MARINA10'} disabled={!!form.id} />
                </div>
                <div className="space-y-1"><Label htmlFor="af-phone">WhatsApp (opcional)</Label><Input id="af-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="af-pix">Chave Pix (opcional)</Label><Input id="af-pix" value={form.pix_key} onChange={(e) => set('pix_key', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="af-pct">Comissão (%)</Label><Input id="af-pct" inputMode="decimal" value={form.commission_percent} onChange={(e) => set('commission_percent', e.target.value)} /></div>
                <div className="flex items-end gap-2 pb-2"><Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} aria-label="Afiliada ativa" /><span className="text-sm">Afiliada ativa</span></div>
              </div>

              <div>
                <p className="text-sm font-medium">O que ela pode fazer</p>
                <p className="text-xs text-muted-foreground">Tudo o que ela criar vale só no link dela e respeita os limites abaixo.</p>
                <PermissionRow title="Oferta relâmpago" hint="Disparar preço especial por tempo limitado" checked={form.allow_flash} onChange={(v) => set('allow_flash', v)}>
                  <span>Até</span><Num value={form.flash_max_concurrent} onChange={(v) => set('flash_max_concurrent', v)} w="w-12" /><span>por vez · duração máx.</span>
                  <Num value={form.flash_max_minutes} onChange={(v) => set('flash_max_minutes', v)} /><span>min · desconto máx.</span><Num value={form.flash_max_discount_pct} onChange={(v) => set('flash_max_discount_pct', v)} w="w-14" /><span>%</span>
                </PermissionRow>
                <PermissionRow title="Cupons de desconto" hint="Criar cupons que valem só no link dela" checked={form.allow_coupons} onChange={(v) => set('allow_coupons', v)}>
                  <span>Até</span><Num value={form.coupon_max_active} onChange={(v) => set('coupon_max_active', v)} w="w-12" /><span>ativos · desconto máx.</span>
                  <Num value={form.coupon_max_discount_pct} onChange={(v) => set('coupon_max_discount_pct', v)} w="w-14" /><span>% · pedido mín. R$</span><Num value={form.coupon_min_order} onChange={(v) => set('coupon_min_order', v)} />
                </PermissionRow>
                <PermissionRow title="Frete grátis" hint="Oferecer frete grátis no link dela" checked={form.allow_free_shipping} onChange={(v) => set('allow_free_shipping', v)}>
                  <span>Pedido mínimo que ela pode definir: R$</span><Num value={form.ship_min_order} onChange={(v) => set('ship_min_order', v)} w="w-20" /><span>ou mais</span>
                </PermissionRow>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pedidos de {detail?.name}</DialogTitle>
            <DialogDescription>Comissão de {detail?.commission_percent}% sobre o valor depois do desconto.</DialogDescription>
          </DialogHeader>
          {detailOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ainda não há pedidos por esta afiliada.</p>
          ) : (
            <ul className="divide-y">
              {detailOrders.map((o) => {
                const status = o.is_cancelled ? ['Cancelado', 'secondary'] : o.is_paid ? (o.affiliate_paid_at ? ['Comissão paga', 'default'] : ['Pago · a pagar', 'default']) : ['Aguardando pagamento', 'outline'];
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">#{o.id} · {(o.customer_name || 'Cliente').split(' ')[0]}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{money(Math.max(0, (Number(o.total_amount) || 0) - (o.is_paid ? Number(o.coupon_discount) || 0 : 0)))}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">comissão {money(Number(o.affiliate_commission_amount) || 0)}</p>
                    </div>
                    <Badge variant={status[1] as any}>{status[0]}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
