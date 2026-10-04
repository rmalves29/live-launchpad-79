// API pública da "Loja da Live" (página /t/:slug/live aberta pelo link da live do Instagram).
// Todas as ações usam a service role e validam o tenant pelo slug. Nada de segredo sai daqui.
// Ações: catalog | customer_lookup | customer_save | coupon_check | reserve | create_order | cancel_order
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

function json(data: unknown) {
  // Erros de negócio voltam com status 200 e { ok:false, error, code } para o cliente tratar sem exceção.
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const fail = (error: string, code = 'ERROR', extra: Record<string, unknown> = {}) => json({ ok: false, error, code, ...extra });
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown, d = 0) => { const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN; return Number.isFinite(n) ? n : d; };

function digits(v: unknown) { return String(v ?? '').replace(/\D/g, ''); }
function normPhone(v: unknown) {
  let d = digits(v).replace(/^0+/, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}
const phoneVariants = (p: string) => [p, '55' + p];
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}
// Mesma tabela e mesmo hash da vitrine antiga (storefront_visitors): quem for reconhecido lá é reconhecido aqui.
async function touchVisitor(tenantId: string, ip: string, phone: string, customerId?: number | null) {
  try {
    if (!ip || ip === 'unknown') return;
    const ipHash = await sha256Hex(`${tenantId}:${ip}`);
    await sb.from('storefront_visitors').upsert(
      { tenant_id: tenantId, ip_hash: ipHash, customer_id: customerId ?? null, customer_phone: phone, last_seen_at: new Date().toISOString() },
      { onConflict: 'tenant_id,ip_hash' },
    );
  } catch (e: any) { console.warn('[live-shop] touchVisitor:', e?.message); }
}
const RECOGNIZE_MAX_AGE_DAYS = 60;

function brtToday() { return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); }

function isValidCPF(cpf: string) {
  const d = digits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let d1 = 11 - (sum % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  let d2 = 11 - (sum % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(d[10]);
}

async function getTenant(slugRaw: unknown) {
  let slug = String(slugRaw ?? '');
  try { slug = decodeURIComponent(slug); } catch { /* mantém */ }
  slug = slug.replace(/[​-‍﻿]/g, '').trim().toLowerCase();
  if (!slug) return null;
  const { data } = await sb
    .from('tenants')
    .select('id, name, slug, logo_url, primary_color, is_active, live_reserve_mode, live_cart_minutes, live_shop_enabled')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data as any;
}

const effectivePrice = (p: any) => (num(p.promotional_price) > 0 ? num(p.promotional_price) : num(p.price));
const wasPrice = (p: any) => (num(p.promotional_price) > 0 && num(p.price) > num(p.promotional_price) ? num(p.price) : null);
const isPromo = (p: any) => num(p.promotional_price) > 0;

// ------------------------------- cupom -------------------------------
type Line = { unit_price: number; qty: number; promotional: boolean };

function couponActive(c: any) {
  const now = Date.now();
  if (!c || c.is_active === false) return false;
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
  if (c.expires_at && new Date(c.expires_at).getTime() < now) return false;
  if (c.usage_limit != null && num(c.used_count) >= num(c.usage_limit)) return false;
  return true;
}

function computeCoupon(coupon: any, lines: Line[]): { ok: boolean; discount: number; message?: string } {
  if (!couponActive(coupon)) return { ok: false, discount: 0, message: 'Cupom inválido ou expirado.' };
  const eligible = coupon.apply_to_promotional === false ? lines.filter((l) => !l.promotional) : lines;
  const base = eligible.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const itemCount = eligible.reduce((s, l) => s + l.qty, 0);
  if (base <= 0) return { ok: false, discount: 0, message: 'Este cupom não vale para produtos em promoção.' };

  const type = String(coupon.discount_type);
  if (type !== 'progressive') {
    const min = num(coupon.min_purchase_amount);
    if (min > 0 && base < min) return { ok: false, discount: 0, message: `Este cupom vale em compras acima de R$ ${min.toFixed(2).replace('.', ',')}.` };
    const minItems = num(coupon.min_items_quantity);
    if (minItems > 0 && itemCount < minItems) return { ok: false, discount: 0, message: `Este cupom vale a partir de ${minItems} item(ns).` };
  }

  let discount = 0;
  if (type === 'percentage') discount = (base * num(coupon.discount_value)) / 100;
  else if (type === 'fixed') discount = Math.min(num(coupon.discount_value), base);
  else if (type === 'progressive') {
    const tiers: any[] = Array.isArray(coupon.progressive_tiers) ? coupon.progressive_tiers : [];
    const tier = tiers.find((t) => base >= num(t.min_value) && (t.max_value == null || base <= num(t.max_value)));
    if (!tier) return { ok: false, discount: 0, message: 'Seu pedido ainda não atingiu a faixa de desconto deste cupom.' };
    discount = (base * num(tier.discount)) / 100;
  } else return { ok: false, discount: 0, message: 'Cupom inválido.' };

  discount = round2(Math.min(discount, base));
  return discount > 0 ? { ok: true, discount } : { ok: false, discount: 0, message: 'Cupom sem desconto para este pedido.' };
}

async function loadCoupon(tenantId: string, code: unknown) {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return null;
  const { data } = await sb.from('coupons').select('*').eq('tenant_id', tenantId).eq('channel', 'live').eq('code', c).eq('is_active', true).maybeSingle();
  return data as any;
}

async function loadProducts(tenantId: string, ids: number[]) {
  if (!ids.length) return new Map<number, any>();
  const { data } = await sb
    .from('products')
    .select('id, code, name, price, promotional_price, stock, image_url, color, size, parent_product_id, is_active, sale_type')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  return new Map<number, any>((data || []).map((p: any) => [p.id, p]));
}

function sanitizeItems(raw: unknown): Array<{ product_id: number; qty: number }> {
  const merged = new Map<number, number>();
  for (const it of Array.isArray(raw) ? raw : []) {
    const id = Number((it as any)?.product_id);
    const qty = Math.floor(num((it as any)?.qty, 0));
    if (!Number.isFinite(id) || id <= 0 || qty < 1) continue;
    merged.set(id, Math.min(99, (merged.get(id) || 0) + qty));
  }
  return Array.from(merged, ([product_id, qty]) => ({ product_id, qty }));
}

// ------------------------------- ações -------------------------------

async function catalog(body: any, tenant: any) {
  const offset = Math.max(0, Math.floor(num(body.offset, 0)));
  const limit = Math.min(100, Math.max(1, Math.floor(num(body.limit, 60))));
  const q = String(body.q ?? '').replace(/[%_\\,()]/g, ' ').trim().slice(0, 40);

  let query = sb
    .from('products')
    .select('id, code, name, price, promotional_price, stock, image_url, color, size, parent_product_id, is_live', { count: 'exact' })
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .in('sale_type', ['LIVE', 'AMBOS'])
    .gt('stock', 0);
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data: rows, count, error } = await query
    .order('is_live', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return fail('Não foi possível carregar a vitrine.', 'CATALOG_ERROR');

  const list = rows || [];
  const inPage = new Set(list.map((p: any) => p.id));
  const parentIds = Array.from(new Set(list.map((p: any) => p.parent_product_id).filter((id: any) => id && !inPage.has(id))));
  const parents = new Map<number, any>();
  if (parentIds.length) {
    const { data: ps } = await sb.from('products').select('id, code, name, image_url').eq('tenant_id', tenant.id).in('id', parentIds as number[]);
    for (const p of ps || []) parents.set(p.id, p);
  }
  for (const p of list) if (inPage.has(p.id)) parents.set(p.id, p);

  const groups = new Map<string, any>();
  for (const p of list) {
    const pid = p.parent_product_id && (parents.has(p.parent_product_id) || inPage.has(p.parent_product_id)) ? p.parent_product_id : null;
    if (pid) {
      const parent = parents.get(pid) || p;
      const key = `g${pid}`;
      const g = groups.get(key) || { key, id: pid, code: parent.code, name: parent.name, image_url: parent.image_url || p.image_url, is_live: false, variants: [] };
      g.is_live = g.is_live || !!p.is_live;
      g.variants.push({
        id: p.id,
        label: [p.color, p.size].filter(Boolean).join(' / ') || p.code,
        stock: p.stock,
        price: effectivePrice(p),
        was: wasPrice(p),
        image_url: p.image_url,
      });
      groups.set(key, g);
    } else if (!list.some((c: any) => c.parent_product_id === p.id)) {
      groups.set(`p${p.id}`, { key: `p${p.id}`, id: p.id, code: p.code, name: p.name, image_url: p.image_url, is_live: !!p.is_live, variants: [], stock: p.stock, price: effectivePrice(p), was: wasPrice(p) });
    }
  }
  const items = Array.from(groups.values()).map((g) => {
    if (g.variants.length) {
      const prices = g.variants.map((v: any) => v.price);
      g.price = Math.min(...prices);
      g.price_from = Math.min(...prices) !== Math.max(...prices);
      g.was = g.variants.find((v: any) => v.price === g.price)?.was ?? null;
      g.stock = g.variants.reduce((s: number, v: any) => s + v.stock, 0);
    }
    return g;
  });

  const result: any = { ok: true, items, total: count ?? items.length, offset, limit };

  if (offset === 0) {
    const nowIso = new Date().toISOString();
    const [couponsRes, giftsRes, shipRes, pagarme, appmax, mp, infinite] = await Promise.all([
      sb.from('coupons').select('code, discount_type, discount_value, min_purchase_amount, min_items_quantity, progressive_tiers, apply_to_promotional, starts_at, expires_at, usage_limit, used_count, is_active').eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true).limit(50),
      sb.from('gifts').select('name, description, minimum_purchase_amount, auto_apply').eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true).order('minimum_purchase_amount', { ascending: true }),
      sb.from('custom_shipping_options').select('name, price, delivery_days, free_shipping_min_order, coverage_type').eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true),
      sb.from('integration_pagarme').select('is_active, pix_discount_percent').eq('tenant_id', tenant.id).maybeSingle(),
      sb.from('integration_appmax').select('is_active, pix_discount_percent').eq('tenant_id', tenant.id).maybeSingle(),
      sb.from('integration_mp').select('is_active, pix_discount_percent').eq('tenant_id', tenant.id).maybeSingle(),
      sb.from('integration_infinitepay').select('is_active, enable_pix, enable_credit_card, pix_discount_percent').eq('tenant_id', tenant.id).maybeSingle(),
    ]);

    result.coupons = (couponsRes.data || [])
      .filter((c: any) => couponActive(c))
      .map((c: any) => ({
        code: c.code, discount_type: c.discount_type, discount_value: num(c.discount_value),
        min_purchase_amount: num(c.min_purchase_amount), min_items_quantity: num(c.min_items_quantity),
        progressive_tiers: c.progressive_tiers, apply_to_promotional: c.apply_to_promotional !== false, expires_at: c.expires_at,
      }));
    result.gifts = (giftsRes.data || []).filter((g: any) => g.auto_apply !== false).map((g: any) => ({ name: g.name, minimum_purchase_amount: num(g.minimum_purchase_amount) }));
    result.shipping_hints = (shipRes.data || [])
      .filter((s: any) => (s.coverage_type || 'national') === 'national')
      .map((s: any) => ({ name: s.name, price: num(s.price), free_min: s.free_shipping_min_order != null ? num(s.free_shipping_min_order) : null, pickup: s.delivery_days === 0 }));

    // gateway ativo (mesma prioridade do create-payment): InfinitePay > AppMax > Pagar.me > Mercado Pago
    let pix = true, card = true, pixDiscount = 0;
    const inf: any = infinite.data;
    if (inf?.is_active) { pix = inf.enable_pix !== false; card = inf.enable_credit_card !== false; pixDiscount = num(inf.pix_discount_percent); }
    else {
      const first: any = [appmax.data, pagarme.data, mp.data].find((x: any) => x?.is_active);
      pixDiscount = num(first?.pix_discount_percent);
    }
    result.payment = { pix, card, pix_discount_percent: pixDiscount, requires_email: !!inf?.is_active };
    result.tenant = { id: tenant.id, name: tenant.name, slug: tenant.slug, logo_url: tenant.logo_url, primary_color: tenant.primary_color };
    result.settings = { reserve_mode: tenant.live_reserve_mode, cart_minutes: tenant.live_cart_minutes };
    result.now = nowIso;
  }
  return json(result);
}

const CUSTOMER_FIELDS = 'id, name, phone, cpf, email, cep, street, number, complement, neighborhood, city, state, is_blocked';

async function findCustomer(tenantId: string, phone: string) {
  const { data } = await sb.from('customers').select(CUSTOMER_FIELDS).eq('tenant_id', tenantId).in('phone', phoneVariants(phone)).limit(1);
  return (data && data[0]) as any;
}

// Reconhecimento automático: o aparelho (telefone salvo) é verificado no cliente; aqui o IP (vitrine antiga).
async function recognize(tenant: any, ip: string) {
  if (!ip || ip === 'unknown') return json({ ok: true, found: false });
  const ipHash = await sha256Hex(`${tenant.id}:${ip}`);
  const { data: v } = await sb.from('storefront_visitors').select('customer_phone, last_seen_at').eq('tenant_id', tenant.id).eq('ip_hash', ipHash).maybeSingle();
  if (!v?.customer_phone) return json({ ok: true, found: false });
  if (v.last_seen_at && Date.now() - new Date(v.last_seen_at).getTime() > RECOGNIZE_MAX_AGE_DAYS * 86400_000) return json({ ok: true, found: false });
  const phone = normPhone(v.customer_phone);
  const c = await findCustomer(tenant.id, phone);
  if (!c || c.is_blocked) return json({ ok: true, found: false });
  const { is_blocked: _b, id: _id, ...customer } = c;
  const complete = !!(customer.cep && customer.street && customer.number && customer.neighborhood && customer.city && customer.state);
  return json({ ok: true, found: true, complete, customer, via: 'ip' });
}

async function customerLookup(body: any, tenant: any, ip: string) {
  const phone = normPhone(body.phone);
  if (phone.length < 10 || phone.length > 11) return fail('Informe o celular com DDD.', 'INVALID_PHONE');
  const c = await findCustomer(tenant.id, phone);
  if (!c) return json({ ok: true, found: false, phone });
  if (c.is_blocked) return fail('Não foi possível continuar com este número. Fale com a loja.', 'BLOCKED');
  const { is_blocked: _b, id: cid, ...customer } = c;
  await touchVisitor(tenant.id, ip, phone, cid);
  const complete = !!(customer.cep && customer.street && customer.number && customer.neighborhood && customer.city && customer.state);
  return json({ ok: true, found: true, complete, customer });
}

async function customerSave(body: any, tenant: any, ip: string) {
  const c = body.customer || {};
  const phone = normPhone(c.phone);
  const name = String(c.name ?? '').trim().slice(0, 200);
  const cep = digits(c.cep);
  const state = String(c.state ?? '').trim().toUpperCase().slice(0, 2);
  const cpf = digits(c.cpf);
  const email = String(c.email ?? '').trim().slice(0, 200);
  if (phone.length < 10 || phone.length > 11) return fail('Informe o celular com DDD.', 'INVALID_PHONE');
  if (name.length < 2 || /^[\d\s\-.\/()+]+$/.test(name)) return fail('Digite seu nome completo.', 'INVALID_NAME');
  if (!isValidCPF(cpf)) return fail('CPF inválido. Confira os números.', 'INVALID_CPF');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('E-mail inválido.', 'INVALID_EMAIL');
  const street = String(c.street ?? '').trim().slice(0, 200);
  const number = String(c.number ?? '').trim().slice(0, 20);
  const neighborhood = String(c.neighborhood ?? '').trim().slice(0, 120);
  const city = String(c.city ?? '').trim().slice(0, 120);
  if (cep.length !== 8 || !street || !number || !neighborhood || !city || state.length !== 2) {
    return fail('Preencha CEP, rua, número, bairro, cidade e estado.', 'INVALID_ADDRESS');
  }

  const existing = await findCustomer(tenant.id, phone);
  if (existing?.is_blocked) return fail('Não foi possível continuar com este número. Fale com a loja.', 'BLOCKED');

  const payload: Record<string, unknown> = {
    name, cpf, email: email || null, cep, street, number,
    complement: String(c.complement ?? '').trim().slice(0, 120) || null, neighborhood, city, state,
    updated_at: new Date().toISOString(),
  };
  let error;
  if (existing) {
    ({ error } = await sb.from('customers').update(payload).eq('tenant_id', tenant.id).in('phone', phoneVariants(phone)));
  } else {
    ({ error } = await sb.from('customers').insert({ tenant_id: tenant.id, phone, ...payload }));
  }
  if (error) { console.error('[live-shop] customer_save:', error.message); return fail('Não foi possível salvar seus dados. Tente novamente.', 'SAVE_ERROR'); }
  const saved = await findCustomer(tenant.id, phone);
  await touchVisitor(tenant.id, ip, phone, saved?.id);
  return json({ ok: true, phone });
}

async function couponCheck(body: any, tenant: any) {
  const coupon = await loadCoupon(tenant.id, body.code);
  if (!coupon) return json({ ok: true, valid: false, message: 'Cupom inválido ou expirado.' });
  const items = sanitizeItems(body.items);
  const products = await loadProducts(tenant.id, items.map((i) => i.product_id));
  const lines: Line[] = items.filter((i) => products.get(i.product_id)).map((i) => {
    const p = products.get(i.product_id);
    return { unit_price: effectivePrice(p), qty: i.qty, promotional: isPromo(p) };
  });
  const r = computeCoupon(coupon, lines);
  return json({ ok: true, valid: r.ok, discount: r.discount, message: r.message, code: coupon.code });
}

// Modo "reservar ao adicionar no carrinho": define a quantidade ABSOLUTA reservada para a sessão.
async function reserve(body: any, tenant: any) {
  if (tenant.live_reserve_mode !== 'cart') return json({ ok: true, skipped: true });
  const sessionId = String(body.session_id ?? '').slice(0, 80);
  const productId = Number(body.product_id);
  const want = Math.max(0, Math.min(99, Math.floor(num(body.qty, 0))));
  if (!sessionId || !Number.isFinite(productId)) return fail('Requisição inválida.', 'BAD_REQUEST');

  const products = await loadProducts(tenant.id, [productId]);
  const p = products.get(productId);
  if (!p || !p.is_active || !['LIVE', 'AMBOS'].includes(p.sale_type)) return fail('Produto indisponível.', 'NOT_AVAILABLE');

  const { data: cur } = await sb.from('live_cart_reservations').select('qty').eq('tenant_id', tenant.id).eq('session_id', sessionId).eq('product_id', productId).maybeSingle();
  const have = num(cur?.qty);
  const delta = want - have;

  if (delta > 0) {
    const { data: left, error } = await sb.rpc('reserve_product_stock', { p_product_id: productId, p_qty: delta });
    if (error || left === null || left === undefined) {
      const fresh = (await loadProducts(tenant.id, [productId])).get(productId);
      return fail('Estoque insuficiente para essa quantidade.', 'INSUFFICIENT_STOCK', { stock: num(fresh?.stock), reserved: have });
    }
  } else if (delta < 0) {
    await sb.rpc('release_product_stock', { p_product_id: productId, p_qty: -delta });
  }

  const expiresAt = new Date(Date.now() + Math.max(1, num(tenant.live_cart_minutes, 15)) * 60_000).toISOString();
  if (want === 0) {
    await sb.from('live_cart_reservations').delete().eq('tenant_id', tenant.id).eq('session_id', sessionId).eq('product_id', productId);
  } else {
    await sb.from('live_cart_reservations').upsert({ tenant_id: tenant.id, session_id: sessionId, product_id: productId, qty: want, expires_at: expiresAt }, { onConflict: 'tenant_id,session_id,product_id' });
  }
  // renova o prazo de todo o carrinho da sessão
  await sb.from('live_cart_reservations').update({ expires_at: expiresAt }).eq('tenant_id', tenant.id).eq('session_id', sessionId);
  return json({ ok: true, qty: want, expires_at: want === 0 ? null : expiresAt });
}

async function cancelPending(tenantId: string, orderId: number, phone: string) {
  const { data: o } = await sb.from('orders').select('id, customer_phone, is_paid, is_cancelled, source').eq('tenant_id', tenantId).eq('id', orderId).maybeSingle();
  if (!o || o.is_paid || o.is_cancelled || o.source !== 'live_shop') return false;
  if (!phoneVariants(phone).includes(digits(o.customer_phone))) return false;
  await sb.rpc('restore_order_stock', { p_order_id: orderId });
  await sb.from('orders').update({ is_cancelled: true, cancellation_reason: 'Pedido da Loja da Live substituído ou cancelado pelo cliente' }).eq('id', orderId).eq('is_paid', false);
  return true;
}

async function cancelOrder(body: any, tenant: any) {
  const phone = normPhone(body.phone);
  const ok = await cancelPending(tenant.id, Number(body.order_id), phone);
  return json({ ok: true, cancelled: ok });
}

async function createOrder(body: any, tenant: any, ip: string) {
  const phone = normPhone(body.phone);
  const sessionId = String(body.session_id ?? '').slice(0, 80);
  const items = sanitizeItems(body.items);
  if (phone.length < 10 || phone.length > 11) return fail('Informe o celular com DDD.', 'INVALID_PHONE');
  if (!items.length) return fail('Seu carrinho está vazio.', 'EMPTY_CART');

  const customer = await findCustomer(tenant.id, phone);
  if (!customer) return fail('Complete seu cadastro para continuar.', 'NO_CUSTOMER');
  if (customer.is_blocked) return fail('Não foi possível continuar com este número. Fale com a loja.', 'BLOCKED');

  if (body.replace_order_id) await cancelPending(tenant.id, Number(body.replace_order_id), phone);

  const products = await loadProducts(tenant.id, items.map((i) => i.product_id));
  for (const it of items) {
    const p = products.get(it.product_id);
    if (!p || !p.is_active || !['LIVE', 'AMBOS'].includes(p.sale_type)) {
      return fail(`${p?.name || 'Um produto'} não está mais disponível.`, 'NOT_AVAILABLE', { product_id: it.product_id });
    }
  }

  // ---- estoque: o primeiro que chega leva (reservas atômicas, com desfazer em caso de falha) ----
  const reservedNow: Array<{ product_id: number; qty: number }> = [];
  const undo = async () => { for (const r of reservedNow) await sb.rpc('release_product_stock', { p_product_id: r.product_id, p_qty: r.qty }); };

  let sessionRows: any[] = [];
  if (tenant.live_reserve_mode === 'cart' && sessionId) {
    const { data } = await sb.from('live_cart_reservations').select('product_id, qty').eq('tenant_id', tenant.id).eq('session_id', sessionId);
    sessionRows = data || [];
  }
  const alreadyReserved = new Map<number, number>(sessionRows.map((r) => [r.product_id, num(r.qty)]));

  for (const it of items) {
    const have = alreadyReserved.get(it.product_id) || 0;
    const need = it.qty - have;
    if (need > 0) {
      const { data: left, error } = await sb.rpc('reserve_product_stock', { p_product_id: it.product_id, p_qty: need });
      if (error || left === null || left === undefined) {
        await undo();
        const fresh = (await loadProducts(tenant.id, [it.product_id])).get(it.product_id);
        return fail(`Estoque insuficiente de ${products.get(it.product_id).name}.`, 'INSUFFICIENT_STOCK', { product_id: it.product_id, stock: num(fresh?.stock) });
      }
      reservedNow.push({ product_id: it.product_id, qty: need });
    } else if (need < 0) {
      await sb.rpc('release_product_stock', { p_product_id: it.product_id, p_qty: -need });
    }
  }
  // sobras de reserva de itens que não foram para o pedido voltam ao estoque
  const inOrder = new Set(items.map((i) => i.product_id));
  for (const r of sessionRows) if (!inOrder.has(r.product_id)) await sb.rpc('release_product_stock', { p_product_id: r.product_id, p_qty: r.qty });

  // ---- valores ----
  const lines = items.map((it) => {
    const p = products.get(it.product_id);
    return { it, p, unit: effectivePrice(p), line: { unit_price: effectivePrice(p), qty: it.qty, promotional: isPromo(p) } as Line };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.unit * l.it.qty, 0));

  let couponCode: string | null = null, couponDiscount = 0, couponMessage: string | undefined, couponRow: any = null;
  if (body.coupon_code) {
    couponRow = await loadCoupon(tenant.id, body.coupon_code);
    const r = couponRow ? computeCoupon(couponRow, lines.map((l) => l.line)) : { ok: false, discount: 0, message: 'Cupom inválido ou expirado.' };
    if (r.ok) { couponCode = couponRow.code; couponDiscount = r.discount; } else { couponMessage = r.message; couponRow = null; }
  }

  let giftName: string | null = null;
  const { data: gifts } = await sb.from('gifts').select('name, minimum_purchase_amount, auto_apply').eq('tenant_id', tenant.id).eq('channel', 'live').eq('is_active', true).order('minimum_purchase_amount', { ascending: false });
  const gift = (gifts || []).find((g: any) => g.auto_apply !== false && subtotal >= num(g.minimum_purchase_amount));
  if (gift) giftName = gift.name;

  // ---- pedido pendente (carrinho + itens + pedido) ----
  const today = brtToday();
  const { data: cart, error: cartErr } = await sb.from('carts').insert({
    tenant_id: tenant.id, customer_phone: phone, event_date: today, event_type: 'INSTAGRAM_LIVE', status: 'OPEN',
  }).select('id').single();
  if (cartErr || !cart) { await undo(); console.error('[live-shop] cart:', cartErr?.message); return fail('Não foi possível criar o pedido. Tente novamente.', 'ORDER_ERROR'); }

  const rollbackAll = async (cartId: number, orderId?: number) => {
    if (orderId) await sb.from('orders').delete().eq('id', orderId);
    await sb.from('cart_items').delete().eq('cart_id', cartId);
    await sb.from('carts').delete().eq('id', cartId);
    await undo();
  };

  const { error: itemsErr } = await sb.from('cart_items').insert(lines.map((l) => ({
    tenant_id: tenant.id, cart_id: cart.id, product_id: l.p.id, product_code: l.p.code, product_name: l.p.name,
    product_image_url: l.p.image_url, unit_price: l.unit, qty: l.it.qty,
  })));
  if (itemsErr) { await rollbackAll(cart.id); console.error('[live-shop] items:', itemsErr.message); return fail('Não foi possível criar o pedido. Tente novamente.', 'ORDER_ERROR'); }

  const note = String(body.note ?? '').trim().slice(0, 300);
  const { data: order, error: orderErr } = await sb.from('orders').insert({
    tenant_id: tenant.id, cart_id: cart.id, customer_phone: phone, customer_name: customer.name,
    event_date: today, event_type: 'INSTAGRAM_LIVE', source: 'live_shop',
    total_amount: round2(Math.max(0, subtotal - couponDiscount)), is_paid: false, printed: false,
    item_added_message_sent: false, payment_confirmation_sent: false, is_cancelled: false,
    coupon_code: couponCode, coupon_discount: couponDiscount || null, gift_name: giftName,
    observation: note ? `Nota do cliente: ${note}` : null,
    customer_cep: customer.cep, customer_street: customer.street, customer_number: customer.number,
    customer_complement: customer.complement, customer_neighborhood: customer.neighborhood,
    customer_city: customer.city, customer_state: customer.state,
  }).select('id').single();
  if (orderErr || !order) { await rollbackAll(cart.id); console.error('[live-shop] order:', orderErr?.message); return fail('Não foi possível criar o pedido. Tente novamente.', 'ORDER_ERROR'); }

  // a reserva do carrinho virou pedido
  if (sessionRows.length) await sb.from('live_cart_reservations').delete().eq('tenant_id', tenant.id).eq('session_id', sessionId);
  if (couponRow) await sb.from('coupons').update({ used_count: num(couponRow.used_count) + 1 }).eq('id', couponRow.id);
  await touchVisitor(tenant.id, ip, phone, customer.id);

  return json({
    ok: true, order_id: order.id, cart_id: cart.id, subtotal, coupon_code: couponCode, coupon_discount: couponDiscount,
    coupon_message: couponMessage, gift_name: giftName, total: round2(Math.max(0, subtotal - couponDiscount)),
    items: lines.map((l) => ({ product_name: l.p.name, product_code: l.p.code, qty: l.it.qty, unit_price: l.unit })),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({} as any));
    const tenant = await getTenant(body.tenant_slug);
    if (!tenant) return fail('Loja não encontrada.', 'TENANT_NOT_FOUND');
    if (tenant.live_shop_enabled === false) return fail('A vitrine da live está indisponível no momento.', 'LIVE_DISABLED');
    switch (body.action) {
      case 'catalog': return await catalog(body, tenant);
      case 'recognize': return await recognize(tenant, clientIp(req));
      case 'customer_lookup': return await customerLookup(body, tenant, clientIp(req));
      case 'customer_save': return await customerSave(body, tenant, clientIp(req));
      case 'coupon_check': return await couponCheck(body, tenant);
      case 'reserve': return await reserve(body, tenant);
      case 'create_order': return await createOrder(body, tenant, clientIp(req));
      case 'cancel_order': return await cancelOrder(body, tenant);
      default: return fail('Ação inválida.', 'BAD_ACTION');
    }
  } catch (e: any) {
    console.error('[live-shop] erro inesperado:', e?.message || e);
    return fail('Erro inesperado. Tente novamente.', 'UNEXPECTED');
  }
});
