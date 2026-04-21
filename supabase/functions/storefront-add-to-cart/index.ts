// Adiciona produto ao pedido da vitrine pública (anônimo)
// - Resolve/cria cliente
// - Garante pedido LIVE/hoje/aberto
// - Valida estoque atomicamente
// - Faz upsert em cart_items (trigger envia WhatsApp)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}
function normalizePhone(p: string): string {
  let clean = (p || '').replace(/\D/g, '');
  if (clean.startsWith('55') && clean.length > 11) clean = clean.slice(2);
  return clean;
}
function normalizeInstagram(ig: string | null | undefined): string | null {
  if (!ig) return null;
  const t = ig.trim().replace(/^@+/, '').replace(/\s+/g, '');
  return t || null;
}
function todayBR(): string {
  // Data no fuso de Brasília (UTC-3)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const br = new Date(utc + (-3 * 3600000));
  return br.toISOString().slice(0, 10);
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const tenant_slug: string = body.tenant_slug;
    const product_id: number = Number(body.product_id);
    const qty: number = Math.max(1, Math.floor(Number(body.qty) || 1));
    const customer_phone_raw: string = body.customer_phone;
    const customer_instagram_raw: string | null = body.customer_instagram ?? null;

    if (!tenant_slug || !product_id || !customer_phone_raw) {
      return jsonResp({ error: 'Campos obrigatórios ausentes' }, 400);
    }

    const customer_phone = normalizePhone(customer_phone_raw);
    if (customer_phone.length < 10 || customer_phone.length > 13) {
      return jsonResp({ error: 'Telefone inválido' }, 400);
    }
    const customer_instagram = normalizeInstagram(customer_instagram_raw);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Tenant
    const { data: tenant, error: tErr } = await supabase
      .from('tenants').select('id, is_active')
      .eq('slug', tenant_slug).eq('is_active', true).maybeSingle();
    if (tErr || !tenant) return jsonResp({ error: 'Loja não encontrada' }, 404);
    const tenant_id = tenant.id as string;

    // 2) Produto
    const { data: product, error: pErr } = await supabase
      .from('products')
      .select('id, name, code, price, promotional_price, image_url, stock, is_active, tenant_id')
      .eq('id', product_id).eq('tenant_id', tenant_id).maybeSingle();
    if (pErr || !product) return jsonResp({ error: 'Produto não encontrado' }, 404);
    if (!product.is_active) return jsonResp({ error: 'Produto indisponível' }, 400);
    if ((product.stock ?? 0) <= 0) return jsonResp({ error: 'Produto esgotado', code: 'OUT_OF_STOCK' }, 409);
    if ((product.stock ?? 0) < qty) {
      return jsonResp({ error: `Apenas ${product.stock} unidade(s) disponível(is)`, code: 'INSUFFICIENT_STOCK', stock: product.stock }, 409);
    }

    const unit_price = (product.promotional_price && Number(product.promotional_price) > 0)
      ? Number(product.promotional_price) : Number(product.price);

    // 3) Cliente: busca por telefone no tenant
    let customerId: number | null = null;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, instagram, name, is_blocked')
      .eq('tenant_id', tenant_id).eq('phone', customer_phone).maybeSingle();

    if (existingCustomer) {
      if (existingCustomer.is_blocked) {
        return jsonResp({ error: 'Cliente bloqueado. Entre em contato com a loja.' }, 403);
      }
      customerId = existingCustomer.id;
      // Atualiza Instagram se vazio
      if (customer_instagram && !existingCustomer.instagram) {
        await supabase.from('customers')
          .update({ instagram: customer_instagram, updated_at: new Date().toISOString() })
          .eq('id', existingCustomer.id);
      }
    } else {
      const { data: created, error: cErr } = await supabase.from('customers').insert({
        tenant_id, phone: customer_phone,
        instagram: customer_instagram,
        name: customer_instagram || customer_phone,
      }).select('id').single();
      if (cErr) {
        console.error('[add-to-cart] create customer:', cErr);
        return jsonResp({ error: 'Não foi possível criar cliente' }, 500);
      }
      customerId = created.id;
    }

    // 4) Pedido aberto LIVE/hoje
    const today = todayBR();
    let orderId: number | null = null;
    let cartId: number | null = null;

    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, cart_id, is_paid, is_cancelled')
      .eq('tenant_id', tenant_id)
      .eq('customer_phone', customer_phone)
      .eq('event_date', today)
      .eq('event_type', 'LIVE')
      .eq('is_paid', false)
      .or('is_cancelled.is.null,is_cancelled.eq.false')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder) {
      orderId = existingOrder.id;
      cartId = existingOrder.cart_id;
    } else {
      // Cria pedido novo
      const { data: newOrder, error: oErr } = await supabase.from('orders').insert({
        tenant_id, customer_phone, event_date: today, event_type: 'LIVE',
        total_amount: 0, is_paid: false,
      }).select('id').single();
      if (oErr) {
        console.error('[add-to-cart] create order:', oErr);
        return jsonResp({ error: 'Não foi possível criar pedido' }, 500);
      }
      orderId = newOrder.id;
    }

    // 5) Carrinho
    if (!cartId) {
      const { data: newCart, error: ccErr } = await supabase.from('carts').insert({
        tenant_id, customer_phone,
        customer_instagram: customer_instagram,
        event_type: 'LIVE', event_date: today, status: 'OPEN',
      }).select('id').single();
      if (ccErr) {
        console.error('[add-to-cart] create cart:', ccErr);
        return jsonResp({ error: 'Não foi possível criar carrinho' }, 500);
      }
      cartId = newCart.id;
      await supabase.from('orders').update({ cart_id: cartId }).eq('id', orderId);
    }

    // 6) Upsert cart_items (snapshot)
    const { data: existingItem } = await supabase
      .from('cart_items')
      .select('id, qty')
      .eq('cart_id', cartId).eq('product_id', product.id).maybeSingle();

    if (existingItem) {
      const { error: upErr } = await supabase.from('cart_items').update({
        qty: existingItem.qty + qty,
        unit_price,
        product_name: product.name,
        product_code: product.code,
        product_image_url: product.image_url,
      }).eq('id', existingItem.id);
      if (upErr) {
        console.error('[add-to-cart] update item:', upErr);
        return jsonResp({ error: 'Erro ao atualizar item' }, 500);
      }
    } else {
      const { error: insErr } = await supabase.from('cart_items').insert({
        tenant_id, cart_id: cartId, product_id: product.id, qty, unit_price,
        product_name: product.name, product_code: product.code, product_image_url: product.image_url,
      });
      if (insErr) {
        console.error('[add-to-cart] insert item:', insErr);
        return jsonResp({ error: 'Erro ao inserir item' }, 500);
      }
    }

    // 7) Decremento atômico de estoque (fresh read + condicional)
    const { data: fresh } = await supabase.from('products').select('stock').eq('id', product.id).single();
    if (!fresh || fresh.stock < qty) {
      // rollback
      if (existingItem) {
        await supabase.from('cart_items').update({ qty: existingItem.qty }).eq('id', existingItem.id);
      } else {
        await supabase.from('cart_items').delete().eq('cart_id', cartId).eq('product_id', product.id);
      }
      return jsonResp({ error: 'Estoque esgotado nesse instante. Tente outro produto.', code: 'OUT_OF_STOCK' }, 409);
    }

    const { data: stockUpd, error: stockErr } = await supabase
      .from('products')
      .update({ stock: fresh.stock - qty })
      .eq('id', product.id)
      .gt('stock', 0)
      .select('stock').single();

    if (stockErr || !stockUpd) {
      if (existingItem) {
        await supabase.from('cart_items').update({ qty: existingItem.qty }).eq('id', existingItem.id);
      } else {
        await supabase.from('cart_items').delete().eq('cart_id', cartId).eq('product_id', product.id);
      }
      return jsonResp({ error: 'Estoque esgotado.', code: 'OUT_OF_STOCK' }, 409);
    }

    // 8) Recalcular total do pedido
    const { data: items } = await supabase
      .from('cart_items').select('qty, unit_price').eq('cart_id', cartId);
    const total = (items || []).reduce((s, it: any) => s + Number(it.qty) * Number(it.unit_price), 0);
    await supabase.from('orders').update({ total_amount: total }).eq('id', orderId);

    // 9) Atualiza storefront_visitors
    const ip = getClientIp(req);
    const ipHash = await sha256Hex(`${tenant_id}:${ip}`);
    await supabase.from('storefront_visitors').upsert({
      tenant_id, ip_hash: ipHash,
      customer_id: customerId, customer_phone,
      customer_instagram: customer_instagram,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,ip_hash' });

    return jsonResp({
      success: true,
      order_id: orderId,
      cart_id: cartId,
      remaining_stock: stockUpd.stock,
    });
  } catch (e) {
    console.error('[storefront-add-to-cart] FATAL', e);
    return jsonResp({ error: 'Erro interno' }, 500);
  }
});
