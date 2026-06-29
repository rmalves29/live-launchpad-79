// Processa a próxima cliente da fila de espera quando estoque volta.
// Cria pedido reservado, decrementa estoque atomicamente, envia WhatsApp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function todayBR(): string {
  const now = new Date();
  const br = new Date(now.getTime() + (-3 - now.getTimezoneOffset() / 60) * 3600000);
  return br.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tenant_id: string | undefined = body.tenant_id;
    const product_id: number | undefined = body.product_id ? Number(body.product_id) : undefined;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Carrega lista de produtos a processar
    let productsToProcess: Array<{ id: number; tenant_id: string }> = [];

    if (tenant_id && product_id) {
      const { data: p } = await supabase.from('products')
        .select('id, tenant_id, stock').eq('id', product_id).eq('tenant_id', tenant_id).maybeSingle();
      if (p && (p.stock ?? 0) > 0) productsToProcess = [{ id: p.id, tenant_id: p.tenant_id }];
    } else {
      // Modo varredura: pega waitlists 'waiting' cujos produtos têm estoque
      const { data: waiting } = await supabase
        .from('product_waitlist')
        .select('product_id, tenant_id')
        .eq('status', 'waiting')
        .limit(200);
      const seen = new Set<string>();
      for (const w of waiting || []) {
        const key = `${w.tenant_id}:${w.product_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { data: p } = await supabase.from('products').select('id, tenant_id, stock')
          .eq('id', w.product_id).maybeSingle();
        if (p && (p.stock ?? 0) > 0) productsToProcess.push({ id: p.id, tenant_id: p.tenant_id });
      }
    }

    const results: any[] = [];
    for (const p of productsToProcess) {
      const r = await processOne(supabase, p.tenant_id, p.id);
      results.push(r);
    }

    return jsonResp({ success: true, processed: results.length, results });
  } catch (e) {
    console.error('[waitlist-process-next] FATAL', e);
    return jsonResp({ error: 'Erro interno' }, 500);
  }
});

async function processOne(supabase: any, tenant_id: string, product_id: number) {
  // Próxima da fila
  const { data: next } = await supabase
    .from('product_waitlist')
    .select('*')
    .eq('tenant_id', tenant_id).eq('product_id', product_id)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(1).maybeSingle();
  if (!next) return { tenant_id, product_id, skipped: 'no-waiting' };

  // Produto + estoque atual
  const { data: product } = await supabase.from('products')
    .select('id, name, code, price, promotional_price, image_url, stock')
    .eq('id', product_id).maybeSingle();
  if (!product || (product.stock ?? 0) < next.qty) return { tenant_id, product_id, skipped: 'no-stock' };

  // Tenant + tempo de reserva
  const { data: tenant } = await supabase.from('tenants')
    .select('slug, name, waitlist_reserve_minutes, waitlist_enabled').eq('id', tenant_id).maybeSingle();
  if (!tenant?.waitlist_enabled) return { tenant_id, product_id, skipped: 'disabled' };
  const reserveMin = tenant.waitlist_reserve_minutes || 120;

  // Decremento atômico
  const newStock = product.stock - next.qty;
  const { data: stockUpd, error: stockErr } = await supabase
    .from('products')
    .update({ stock: newStock })
    .eq('id', product.id).gte('stock', next.qty)
    .select('stock').single();
  if (stockErr || !stockUpd) return { tenant_id, product_id, skipped: 'stock-race' };

  const unit_price = product.promotional_price && Number(product.promotional_price) > 0
    ? Number(product.promotional_price) : Number(product.price);
  const today = todayBR();

  // Cria carrinho + pedido
  const { data: cart, error: cartErr } = await supabase.from('carts').insert({
    tenant_id, customer_phone: next.customer_phone,
    customer_instagram: next.customer_instagram,
    event_type: 'LIVE', event_date: today, status: 'OPEN',
  }).select('id').single();
  if (cartErr || !cart) {
    await supabase.from('products').update({ stock: product.stock }).eq('id', product.id);
    return { tenant_id, product_id, error: 'create-cart-failed' };
  }

  await supabase.from('cart_items').insert({
    tenant_id, cart_id: cart.id, product_id: product.id, qty: next.qty,
    unit_price, product_name: product.name, product_code: product.code,
    product_image_url: product.image_url,
  });

  const total = unit_price * next.qty;
  const reservedUntil = new Date(Date.now() + reserveMin * 60_000).toISOString();

  const { data: order, error: orderErr } = await supabase.from('orders').insert({
    tenant_id,
    customer_phone: next.customer_phone,
    customer_name: next.customer_name,
    event_date: today, event_type: 'LIVE',
    total_amount: total, is_paid: false,
    source: 'waitlist', cart_id: cart.id,
    observation: `[FILA_ESPERA] Reservado até ${new Date(reservedUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  }).select('id').single();
  if (orderErr || !order) {
    await supabase.from('products').update({ stock: product.stock }).eq('id', product.id);
    return { tenant_id, product_id, error: 'create-order-failed' };
  }

  // Atualiza waitlist -> notified
  await supabase.from('product_waitlist').update({
    status: 'notified', notified_at: new Date().toISOString(),
    reserved_until: reservedUntil, order_id: order.id,
  }).eq('id', next.id);

  // Envia WhatsApp (template WAITLIST_AVAILABLE)
  try {
    const { data: tpl } = await supabase.from('whatsapp_templates')
      .select('content').eq('tenant_id', tenant_id).eq('type', 'WAITLIST_AVAILABLE')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const { data: settings } = await supabase.from('app_settings').select('public_base_url').limit(1).maybeSingle();
    const baseUrl = settings?.public_base_url || 'https://live-launchpad-79.lovable.app';
    const link = `${baseUrl}/t/${tenant.slug}/checkout`;
    const prazo = new Date(reservedUntil).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    const fallback = `🎉 *Boa notícia!*\n\nO produto *${product.name}* (cód. ${product.code}) voltou ao estoque e separamos uma unidade para você!\n\n⏰ Você tem até *${prazo}* para finalizar o pagamento.\n💳 Link: ${link}\n\nCaso não pague no prazo, o produto passa para a próxima cliente da fila.`;
    const message = (tpl?.content || fallback)
      .replace(/\{\{\s*produto\s*\}\}/g, product.name)
      .replace(/\{\{\s*codigo\s*\}\}/g, product.code || '')
      .replace(/\{\{\s*prazo\s*\}\}/g, prazo)
      .replace(/\{\{\s*link\s*\}\}/g, link);

    await supabase.functions.invoke('zapi-send-message', {
      body: { tenant_id, phone: next.customer_phone, message },
    });
  } catch (msgErr) {
    console.error('[waitlist-process-next] msg err', msgErr);
  }

  return { tenant_id, product_id, waitlist_id: next.id, order_id: order.id, reserved_until: reservedUntil };
}
