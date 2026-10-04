import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { CouponsManager } from '@/components/CouponsManager';
import { GiftsManager } from '@/components/GiftsManager';
import { ShippingOptionsManager } from '@/components/ShippingOptionsManager';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Store } from 'lucide-react';
import { liveShopUrl } from '@/lib/live-shop';


type Settings = {
  live_shop_enabled: boolean;
  live_reserve_mode: 'order' | 'cart';
  live_cart_minutes: number;
};

type Readiness = { products: number; coupons: number; gifts: number; shipping: number };

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado`, description: text });
  } catch {
    toast({ title: 'Copie manualmente', description: text });
  }
}

export default function LojaDaLive() {
  const { tenant } = useTenant();
  const { profile } = useAuth();
  // A visão "todas as empresas" é só do super admin e some quando ele está visualizando uma empresa específica.
  const previewingTenant = (() => { try { return !!localStorage.getItem('previewTenantId'); } catch { return false; } })();
  const isSuperAdmin = profile?.role === 'super_admin' && !previewingTenant;

  const [settings, setSettings] = useState<Settings>({ live_shop_enabled: true, live_reserve_mode: 'order', live_cart_minutes: 15 });
  const [cartMinutes, setCartMinutes] = useState(15);
  const [ready, setReady] = useState<Readiness | null>(null);
  const [saving, setSaving] = useState(false);
  const [allTenants, setAllTenants] = useState<Array<{ id: string; name: string; slug: string; live_shop_enabled: boolean }>>([]);

  const slug = tenant?.slug || '';
  const link = slug ? liveShopUrl(slug) : '';

  const load = useCallback(async () => {
    if (!tenant?.id) return;
    const [t, prods, coupons, gifts, ship] = await Promise.all([
      supabase.from('tenants').select('live_shop_enabled, live_reserve_mode, live_cart_minutes').eq('id', tenant.id).maybeSingle(),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('is_active', true).in('sale_type', ['LIVE', 'AMBOS']).gt('stock', 0),
      supabase.from('coupons').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true),
      supabase.from('gifts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true),
      supabase.from('custom_shipping_options').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true),
    ]);
    const d: any = t.data;
    if (d) {
      setSettings({
        live_shop_enabled: d.live_shop_enabled !== false,
        live_reserve_mode: d.live_reserve_mode === 'cart' ? 'cart' : 'order',
        live_cart_minutes: Math.max(1, Number(d.live_cart_minutes) || 15),
      });
      setCartMinutes(Math.max(1, Number(d.live_cart_minutes) || 15));
    }
    setReady({ products: prods.count || 0, coupons: coupons.count || 0, gifts: gifts.count || 0, shipping: ship.count || 0 });

    if (isSuperAdmin) {
      const { data: all } = await supabase.from('tenants').select('id, name, slug, live_shop_enabled').eq('is_active', true).order('name');
      setAllTenants(((all as any[]) || []).filter((x) => x.slug));
    }
  }, [tenant?.id, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<Settings>) {
    if (!tenant?.id) return;
    setSaving(true);
    const next = { ...settings, ...patch };
    const { error } = await supabase
      .from('tenants')
      .update({ live_shop_enabled: next.live_shop_enabled, live_reserve_mode: next.live_reserve_mode, live_cart_minutes: Math.max(1, Math.min(240, Math.round(next.live_cart_minutes))) } as any)
      .eq('id', tenant.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    setSettings(next);
    toast({ title: 'Configuração salva' });
  }

  async function toggleTenant(id: string, enabled: boolean) {
    const { error } = await supabase.from('tenants').update({ live_shop_enabled: enabled } as any).eq('id', id);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    setAllTenants((prev) => prev.map((t) => (t.id === id ? { ...t, live_shop_enabled: enabled } : t)));
    if (id === tenant?.id) setSettings((s) => ({ ...s, live_shop_enabled: enabled }));
  }

  const check = (ok: boolean, text: string, hint?: string, to?: string) => (
    <div className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />}
      <div>
        <span>{text}</span>
        {!ok && hint && (
          <span className="block text-xs text-muted-foreground">
            {hint}{to ? <> · <Link className="underline" to={to}>abrir</Link></> : null}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><Store className="h-6 w-6 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-semibold">Loja da Live</h1>
          <p className="text-sm text-muted-foreground">Página de compra para o link da live do Instagram: vitrine, carrinho, cupom, brinde, frete e pagamento.</p>
        </div>
      </div>

      <Tabs defaultValue="link">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="link">Link e ajustes</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
          <TabsTrigger value="gifts">Brindes</TabsTrigger>
          <TabsTrigger value="shipping">Frete</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="tenants">Links de todas as empresas</TabsTrigger>}
        </TabsList>

        <TabsContent value="link" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold">Link da sua loja</h3>
                <p className="text-xs text-muted-foreground">Cole no link da live do Instagram. É o mesmo link para todos os clientes: cada um se identifica pelo celular.</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="live-enabled" className="text-sm">{settings.live_shop_enabled ? 'Ativada' : 'Desativada'}</Label>
                <Switch id="live-enabled" checked={settings.live_shop_enabled} disabled={saving} onCheckedChange={(v) => save({ live_shop_enabled: v })} />
              </div>
            </div>
            {link ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-sm break-all">{link}</code>
                <Button size="sm" variant="outline" onClick={() => copy(link, 'Link')}><Copy className="h-4 w-4 mr-1" />Copiar</Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" />Abrir</a>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-destructive">Esta empresa ainda não tem um endereço (slug) definido.</p>
            )}
            {!settings.live_shop_enabled && <Badge variant="secondary">O link mostra "indisponível" enquanto estiver desativada</Badge>}
          </Card>

          <Card className="p-4 space-y-2">
            <h3 className="font-semibold">Pronta para a live?</h3>
            {ready ? (
              <div className="space-y-2">
                {check(ready.products > 0, `${ready.products} peça(s) de venda LIVE ou AMBOS com estoque`, 'Cadastre ou marque produtos como LIVE/AMBOS e com estoque', '/produtos')}
                {check(ready.shipping > 0, `${ready.shipping} opção(ões) de frete cadastrada(s)`, 'Sem frete cadastrado o cliente só vê as transportadoras integradas', '/integracoes')}
                {check(ready.coupons > 0, `${ready.coupons} cupom(ns) ativo(s)`, 'Opcional: cupons aparecem na vitrine')}
                {check(ready.gifts > 0, `${ready.gifts} brinde(s) ativo(s)`, 'Opcional: brindes aparecem na vitrine')}
              </div>
            ) : <p className="text-sm text-muted-foreground">Verificando…</p>}
          </Card>

          <Card className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold">Quando reservar a peça no estoque</h3>
              <p className="text-xs text-muted-foreground">Define se o carrinho segura a peça ou só o pedido feito.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" role="radio" aria-checked={settings.live_reserve_mode === 'order'} disabled={saving}
                onClick={() => save({ live_reserve_mode: 'order' })}
                className={`rounded-lg border p-3 text-left text-sm ${settings.live_reserve_mode === 'order' ? 'border-primary bg-primary/5' : ''}`}>
                <b>Só ao fazer o pedido</b>
                <span className="block text-xs text-muted-foreground">Carrinho abandonado não trava peça. Recomendado.</span>
              </button>
              <button type="button" role="radio" aria-checked={settings.live_reserve_mode === 'cart'} disabled={saving}
                onClick={() => save({ live_reserve_mode: 'cart' })}
                className={`rounded-lg border p-3 text-left text-sm ${settings.live_reserve_mode === 'cart' ? 'border-primary bg-primary/5' : ''}`}>
                <b>Ao adicionar no carrinho</b>
                <span className="block text-xs text-muted-foreground">Reserva na hora e devolve ao estoque se o cliente sumir.</span>
              </button>
            </div>
            {settings.live_reserve_mode === 'cart' && (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="cart-min" className="text-xs">Tempo do carrinho (minutos)</Label>
                  <Input id="cart-min" type="number" min={1} max={240} className="w-32" value={cartMinutes} onChange={(e) => setCartMinutes(Number(e.target.value))} />
                </div>
                <Button size="sm" disabled={saving} onClick={() => save({ live_cart_minutes: cartMinutes })}>Salvar tempo</Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              O prazo para o cliente pagar o pedido (e a peça voltar ao estoque) fica em <Link className="underline" to="/fila-espera">Fila de Espera</Link>, com um campo próprio para pedidos de live.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="coupons" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">Cupons criados aqui valem <b>somente na Loja da Live</b>. Eles não aparecem nem funcionam nas compras do bazar.</p>
          <CouponsManager channel="live" />
        </TabsContent>
        <TabsContent value="gifts" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">Brindes criados aqui valem <b>somente na Loja da Live</b>. Eles não são oferecidos nas compras do bazar.</p>
          <GiftsManager channel="live" />
        </TabsContent>
        <TabsContent value="shipping" className="mt-4">
          <p className="text-xs text-muted-foreground mb-3">
            Fretes criados aqui valem <b>somente na Loja da Live</b> (não aparecem no bazar). Cada opção tem o seu "frete grátis acima de"; a vitrine mostra "Frete grátis" quando alguma tiver esse valor mínimo.
          </p>
          <ShippingOptionsManager channel="live" />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="tenants" className="mt-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground mb-3">Cada empresa tem o seu link. Use o interruptor para liberar ou bloquear a Loja da Live de uma empresa.</p>
              <div className="divide-y">
                {allTenants.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium text-sm w-48 truncate">{t.name}</span>
                    <code className="text-xs text-muted-foreground flex-1 break-all">{liveShopUrl(t.slug)}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(liveShopUrl(t.slug), 'Link')}><Copy className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" asChild><a href={liveShopUrl(t.slug)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                    <Switch checked={t.live_shop_enabled !== false} onCheckedChange={(v) => toggleTenant(t.id, v)} aria-label={`Loja da Live de ${t.name}`} />
                  </div>
                ))}
                {allTenants.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhuma empresa encontrada.</p>}
              </div>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
