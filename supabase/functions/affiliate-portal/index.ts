// Página da afiliada (Loja da Live). Acesso por link secreto (affiliates.access_token), sem login do sistema.
// Tudo passa por aqui com a service role e é sempre escopado à afiliada do token: ela só enxerga e mexe no que é dela,
// e as permissões (oferta relâmpago, cupons, frete grátis) e os limites vêm do lojista (colunas allow_* e *_max_* da afiliada).
// Ações: get | save_products | create_coupon | toggle_coupon | start_flash | end_flash | set_free_ship | set_pix
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const fail = (error: string, code = 'ERROR') => json({ ok: false, error, code });
const num = (v: unknown, d = 0) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : d; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function authorize(body: any) {
  const token = String(body.token ?? '').trim();
  if (token.length < 20 || token.length > 100) return null;
  const { data: aff } = await sb.from('affiliates').select('*').eq('access_token', token).eq('is_active', true).maybeSingle();
  if (!aff) return null;
  const { data: tenant } = await sb.from('tenants')
    .select('id, name, slug, logo_url, primary_color, is_active, enable_afiliados, enable_loja_live')
    .eq('id', aff.tenant_id).maybeSingle();
  if (!tenant || !tenant.is_active || tenant.enable_afiliados !== true) return null;
  return { aff: aff as any, tenant: tenant as any };
}

// Produtos que a afiliada pode escolher: os que o lojista já deixou na live (produto principal; variações vêm junto).
async function loadPool(tenantId: string) {
  const { data: parents } = await sb.from('products')
    .select('id, code, name, price, promotional_price, stock, image_url, sale_type')
    .eq('tenant_id', tenantId).eq('is_active', true).is('parent_product_id', null).in('sale_type', ['LIVE', 'AMBOS'])
    .order('code', { ascending: true }).range(0, 2999);
  const list = (parents || []) as any[];
  const stockOf = new Map<number, { sum: number; n: number }>();
  for (const ids of chunk(list.map((p) => p.id), 150)) {
    const { data: kids } = await sb.from('products').select('parent_product_id, stock, sale_type')
      .eq('tenant_id', tenantId).eq('is_active', true).in('parent_product_id', ids);
    for (const k of (kids || []) as any[]) {
      if (!['LIVE', 'AMBOS'].includes(k.sale_type)) continue;
      const cur = stockOf.get(k.parent_product_id) || { sum: 0, n: 0 };
      cur.sum += num(k.stock); cur.n += 1;
      stockOf.set(k.parent_product_id, cur);
    }
  }
  return list.map((p) => {
    const k = stockOf.get(p.id);
    return {
      id: p.id, code: p.code, name: p.name, image_url: p.image_url,
      price: num(p.price), promotional_price: p.promotional_price != null ? num(p.promotional_price) : null,
      stock: k ? k.sum : num(p.stock), variations: k?.n || 0,
    };
  });
}

function firstName(v: unknown) { return String(v ?? '').trim().split(/\s+/)[0] || 'Cliente'; }

async function getAll(aff: any, tenant: any) {
  const nowIso = new Date().toISOString();
  const [pool, selRes, couponsRes, flashRes, ordersRes] = await Promise.all([
    loadPool(tenant.id),
    sb.from('affiliate_products').select('product_id, position').eq('affiliate_id', aff.id).order('position', { ascending: true }),
    sb.from('coupons').select('id, code, discount_value, min_purchase_amount, is_active, used_count, created_at')
      .eq('tenant_id', tenant.id).eq('affiliate_id', aff.id).order('created_at', { ascending: false }),
    sb.from('live_flash_offers').select('id, product_id, flash_price, ends_at, product:products(name, code, price)')
      .eq('tenant_id', tenant.id).eq('affiliate_id', aff.id).eq('status', 'active').gt('ends_at', nowIso).order('ends_at', { ascending: true }),
    sb.from('orders').select('id, created_at, customer_name, total_amount, coupon_discount, is_paid, is_cancelled, affiliate_commission_amount, affiliate_commission_percent, affiliate_paid_at')
      .eq('tenant_id', tenant.id).eq('affiliate_id', aff.id).order('id', { ascending: false }).range(0, 299),
  ]);

  const orders = ((ordersRes.data || []) as any[]).map((o) => {
    const status = o.is_cancelled ? 'cancelado' : o.is_paid ? (o.affiliate_paid_at ? 'comissao_paga' : 'confirmado') : 'aguardando';
    return {
      // pedido pago grava o total sem o cupom (o desconto fica em coupon_discount): a venda da afiliada é o valor depois do desconto
      id: o.id, created_at: o.created_at, customer: firstName(o.customer_name), total: o.is_paid ? Math.max(0, round2(num(o.total_amount) - num(o.coupon_discount))) : num(o.total_amount),
      commission: num(o.affiliate_commission_amount), percent: num(o.affiliate_commission_percent), status,
    };
  });
  const brtMonth = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  const monthOf = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 7);
  let sales = 0, commission = 0, toReceive = 0, received = 0, salesMonth = 0, commissionMonth = 0;
  for (const o of orders) {
    if (o.status === 'confirmado' || o.status === 'comissao_paga') {
      sales += o.total; commission += o.commission;
      if (o.status === 'confirmado') toReceive += o.commission; else received += o.commission;
      if (monthOf(o.created_at) === brtMonth) { salesMonth += o.total; commissionMonth += o.commission; }
    }
  }

  return {
    ok: true,
    affiliate: {
      name: aff.name, code: aff.code, commission_percent: num(aff.commission_percent), pix_key: aff.pix_key || '',
      allow_flash: aff.allow_flash, allow_coupons: aff.allow_coupons, allow_free_shipping: aff.allow_free_shipping,
      flash_max_concurrent: aff.flash_max_concurrent, flash_max_minutes: aff.flash_max_minutes, flash_max_discount_pct: num(aff.flash_max_discount_pct),
      coupon_max_active: aff.coupon_max_active, coupon_max_discount_pct: num(aff.coupon_max_discount_pct), coupon_min_order: num(aff.coupon_min_order),
      ship_min_order: num(aff.ship_min_order), free_ship_min: aff.free_ship_min != null ? num(aff.free_ship_min) : null,
    },
    tenant: { name: tenant.name, slug: tenant.slug, logo_url: tenant.logo_url, primary_color: tenant.primary_color },
    pool,
    selected: ((selRes.data || []) as any[]).map((r) => ({ product_id: r.product_id, position: r.position })),
    coupons: ((couponsRes.data || []) as any[]).map((c) => ({
      id: c.id, code: c.code, percent: num(c.discount_value), min_order: num(c.min_purchase_amount), is_active: c.is_active, used: num(c.used_count),
    })),
    flashes: ((flashRes.data || []) as any[]).map((f) => ({
      id: f.id, product_id: f.product_id, price: num(f.flash_price), ends_at: f.ends_at,
      name: f.product?.name || `Produto #${f.product_id}`, code: f.product?.code || null, normal_price: num(f.product?.price),
    })),
    summary: { sales, commission, to_receive: toReceive, received, sales_month: salesMonth, commission_month: commissionMonth, orders: orders.filter((o) => o.status !== 'cancelado').length },
    orders,
    now: nowIso,
  };
}

async function saveProducts(aff: any, tenant: any, body: any) {
  const raw: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const wanted: number[] = [];
  const seen = new Set<number>();
  for (const v of raw.slice(0, 3000)) {
    const id = Math.floor(num(v, 0));
    if (id > 0 && !seen.has(id)) { seen.add(id); wanted.push(id); }
  }
  // só entram produtos que estão na live do lojista
  const valid = new Set<number>();
  for (const ids of chunk(wanted, 150)) {
    const { data } = await sb.from('products').select('id').eq('tenant_id', tenant.id).eq('is_active', true)
      .is('parent_product_id', null).in('sale_type', ['LIVE', 'AMBOS']).in('id', ids);
    for (const r of (data || []) as any[]) valid.add(r.id);
  }
  const kept = wanted.filter((id) => valid.has(id));
  const nowIso = new Date().toISOString();
  if (kept.length) {
    for (const part of chunk(kept.map((id) => ({ affiliate_id: aff.id, product_id: id, position: kept.indexOf(id) + 1, updated_at: nowIso })), 200)) {
      const { error } = await sb.from('affiliate_products').upsert(part, { onConflict: 'affiliate_id,product_id' });
      if (error) return fail('Não foi possível salvar sua vitrine. Tente novamente.');
    }
  }
  const { data: current } = await sb.from('affiliate_products').select('product_id').eq('affiliate_id', aff.id);
  const keepSet = new Set(kept);
  const drop = ((current || []) as any[]).map((r) => r.product_id).filter((id) => !keepSet.has(id));
  for (const ids of chunk(drop, 150)) await sb.from('affiliate_products').delete().eq('affiliate_id', aff.id).in('product_id', ids);
  return json({ ok: true, saved: kept.length, ignored: wanted.length - kept.length });
}

async function createCoupon(aff: any, tenant: any, body: any) {
  if (!aff.allow_coupons) return fail('Cupons não estão liberados para você.', 'NOT_ALLOWED');
  const code = String(body.code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const percent = num(body.percent);
  const minOrder = Math.max(0, num(body.min_order));
  if (code.length < 3 || code.length > 20) return fail('O código precisa ter de 3 a 20 letras ou números.');
  if (!(percent > 0) || percent > num(aff.coupon_max_discount_pct)) return fail(`O desconto precisa ser de 1% até ${num(aff.coupon_max_discount_pct)}%.`);
  if (minOrder < num(aff.coupon_min_order)) return fail(`O pedido mínimo do cupom precisa ser de pelo menos R$ ${num(aff.coupon_min_order).toFixed(2).replace('.', ',')}.`);
  const { count } = await sb.from('coupons').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('affiliate_id', aff.id).eq('is_active', true);
  if ((count ?? 0) >= aff.coupon_max_active) return fail(`Você já tem ${aff.coupon_max_active} cupons ativos. Desative um para criar outro.`, 'LIMIT');
  const { error } = await sb.from('coupons').insert({
    tenant_id: tenant.id, affiliate_id: aff.id, channel: 'live', code, discount_type: 'percentage', discount_value: round2(percent),
    min_purchase_amount: minOrder, apply_to_promotional: true, auto_apply: false, is_active: true,
    description: `Cupom da afiliada ${aff.name}`,
  });
  if (error) return fail((error as any).code === '23505' ? 'Esse código já existe. Escolha outro.' : 'Não foi possível criar o cupom.');
  return json({ ok: true });
}

async function toggleCoupon(aff: any, tenant: any, body: any) {
  if (!aff.allow_coupons) return fail('Cupons não estão liberados para você.', 'NOT_ALLOWED');
  const id = Math.floor(num(body.id));
  const active = body.active === true;
  if (active) {
    const { count } = await sb.from('coupons').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('affiliate_id', aff.id).eq('is_active', true).neq('id', id);
    if ((count ?? 0) >= aff.coupon_max_active) return fail(`Você já tem ${aff.coupon_max_active} cupons ativos.`, 'LIMIT');
  }
  const { error } = await sb.from('coupons').update({ is_active: active }).eq('id', id).eq('tenant_id', tenant.id).eq('affiliate_id', aff.id);
  if (error) return fail('Não foi possível atualizar o cupom.');
  return json({ ok: true });
}

async function startFlash(aff: any, tenant: any, body: any) {
  if (!aff.allow_flash) return fail('Oferta relâmpago não está liberada para você.', 'NOT_ALLOWED');
  const productId = Math.floor(num(body.product_id));
  const price = round2(num(body.price));
  const minutes = Math.floor(num(body.minutes));
  if (!(price > 0)) return fail('Informe o preço da oferta.');
  if (minutes < 1 || minutes > aff.flash_max_minutes) return fail(`A duração precisa ser de 1 a ${aff.flash_max_minutes} minutos.`);
  const { data: sel } = await sb.from('affiliate_products').select('product_id').eq('affiliate_id', aff.id).eq('product_id', productId).maybeSingle();
  if (!sel) return fail('Esse produto não está na sua vitrine.');
  const { data: prod } = await sb.from('products').select('id, price, stock, is_active, sale_type').eq('tenant_id', tenant.id).eq('id', productId).maybeSingle();
  if (!prod || !prod.is_active || !['LIVE', 'AMBOS'].includes(prod.sale_type)) return fail('Esse produto não está mais na live.');
  const normal = num(prod.price);
  if (price >= normal) return fail('O preço da oferta precisa ser menor que o preço normal.');
  const off = (1 - price / normal) * 100;
  if (off > num(aff.flash_max_discount_pct) + 0.001) return fail(`O desconto máximo da oferta é ${num(aff.flash_max_discount_pct)}%. O preço mínimo é R$ ${(normal * (1 - num(aff.flash_max_discount_pct) / 100)).toFixed(2).replace('.', ',')}.`);
  const nowIso = new Date().toISOString();
  await sb.from('live_flash_offers').update({ status: 'ended' }).eq('tenant_id', tenant.id).eq('affiliate_id', aff.id).eq('status', 'active').lte('ends_at', nowIso);
  const { error } = await sb.from('live_flash_offers').insert({
    tenant_id: tenant.id, affiliate_id: aff.id, product_id: productId, flash_price: price,
    starts_at: nowIso, ends_at: new Date(Date.now() + minutes * 60_000).toISOString(), status: 'active',
  });
  if (error) {
    const msg = String((error as any).message || '');
    if (msg.includes('max_flash_offers')) return fail(`Você já tem ${aff.flash_max_concurrent} oferta(s) no ar. Encerre uma antes de disparar outra.`, 'LIMIT');
    if ((error as any).code === '23505') return fail('Esse produto já está em oferta.');
    return fail('Não foi possível disparar a oferta.');
  }
  return json({ ok: true });
}

async function endFlash(aff: any, tenant: any, body: any) {
  const id = String(body.id ?? '');
  const { error } = await sb.from('live_flash_offers').update({ status: 'cancelled' }).eq('id', id).eq('tenant_id', tenant.id).eq('affiliate_id', aff.id);
  if (error) return fail('Não foi possível encerrar a oferta.');
  return json({ ok: true });
}

async function setFreeShip(aff: any, _tenant: any, body: any) {
  if (!aff.allow_free_shipping) return fail('Frete grátis não está liberado para você.', 'NOT_ALLOWED');
  const raw = body.min;
  const min = raw === null || raw === '' || raw === undefined ? null : round2(num(raw, -1));
  if (min !== null && (min < 0 || min < num(aff.ship_min_order))) return fail(`O pedido mínimo do frete grátis precisa ser de pelo menos R$ ${num(aff.ship_min_order).toFixed(2).replace('.', ',')}.`);
  const { error } = await sb.from('affiliates').update({ free_ship_min: min, updated_at: new Date().toISOString() }).eq('id', aff.id);
  if (error) return fail('Não foi possível salvar.');
  return json({ ok: true });
}

async function setPix(aff: any, body: any) {
  const pix = String(body.pix_key ?? '').trim().slice(0, 120);
  const { error } = await sb.from('affiliates').update({ pix_key: pix || null, updated_at: new Date().toISOString() }).eq('id', aff.id);
  if (error) return fail('Não foi possível salvar.');
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const ctx = await authorize(body);
    if (!ctx) return fail('Link inválido ou desativado. Peça um novo link ao lojista.', 'INVALID_LINK');
    const { aff, tenant } = ctx;
    switch (body.action) {
      case 'get': return json(await getAll(aff, tenant));
      case 'save_products': return await saveProducts(aff, tenant, body);
      case 'create_coupon': return await createCoupon(aff, tenant, body);
      case 'toggle_coupon': return await toggleCoupon(aff, tenant, body);
      case 'start_flash': return await startFlash(aff, tenant, body);
      case 'end_flash': return await endFlash(aff, tenant, body);
      case 'set_free_ship': return await setFreeShip(aff, tenant, body);
      case 'set_pix': return await setPix(aff, body);
      default: return fail('Ação inválida.', 'BAD_ACTION');
    }
  } catch (e: any) {
    console.error('[affiliate-portal] erro inesperado:', e?.message || e);
    return fail('Erro inesperado. Tente novamente.', 'UNEXPECTED');
  }
});
