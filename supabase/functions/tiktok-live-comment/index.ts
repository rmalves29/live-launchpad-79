// Automação de live do TikTok.
// Recebe os comentários lidos pelo programa "tiktok-live-reader" (roda no computador da loja durante a live)
// e transforma "C200" em pedido no Cartzy, como na live do Instagram.
//
// Autenticação: header "x-reader-key" com a chave da empresa (tiktok_live_settings.reader_key).
// Ações (campo "action" no corpo):
//   start   { live_username }                                    -> abre a sessão e devolve session_id
//   comment { session_id, tiktok_username, tiktok_user_id?, comment, comment_id? }
//   end     { session_id }                                       -> encerra a sessão
//
// Cliente com @ cadastrado: o item entra no pedido dela e o WhatsApp sai pelo número da empresa
// conectado no Cartzy (gatilho send_whatsapp_on_item_added, o mesmo da live do Instagram).
// Cliente sem cadastro: o pedido fica guardado no @ (customer_phone = "@tiktok:usuario") com reserva
// de X horas; ao se cadastrar pelo link da bio, o pedido passa para o telefone dela (tiktok-register).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reader-key',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Mesmas regras de código do Instagram: "C200", "2x C200", "C200 2x".
const PRODUCT_WITH_QTY_REGEX = /\b(\d{1,3})\s*[xX]\s*([A-Za-z]{1,4}[-]?[0-9]{1,6})\b|\b([A-Za-z]{1,4}[-]?[0-9]{1,6})\s*(\d{1,3})\s*[xX]\b|\b([A-Za-z]{1,4}[-]?[0-9]{1,6})\b/i;

function extractProductCode(text: string): { normalized: string; qty: number } | null {
  const m = String(text || '').match(PRODUCT_WITH_QTY_REGEX);
  if (!m) return null;
  const code = (m[2] || m[3] || m[5] || '').toUpperCase().replace('-', '');
  if (!code) return null;
  const qty = Math.min(Math.max(Number(m[1] || m[4] || 1) || 1, 1), 99);
  return { normalized: code, qty };
}

function escapeLikeExact(value: string) {
  return value.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

function cleanUsername(value: unknown) {
  return String(value ?? '').trim().replace(/^@+/, '').replace(/\s+/g, '').toLowerCase().slice(0, 60);
}

function brasiliaToday() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    const readerKey = (req.headers.get('x-reader-key') || '').trim();
    if (!readerKey || readerKey.length < 20) return json({ error: 'Chave do leitor ausente' }, 401);

    const { data: settings } = await supabase
      .from('tiktok_live_settings')
      .select('tenant_id, enabled, reserve_hours')
      .eq('reader_key', readerKey)
      .maybeSingle();
    if (!settings) return json({ error: 'Chave do leitor inválida' }, 401);
    if (!settings.enabled) return json({ error: 'Automação TikTok desligada para esta empresa' }, 403);

    const tenantId: string = settings.tenant_id;
    const body = await req.json().catch(() => ({} as any));
    const action = String(body?.action || '');

    if (action === 'start') {
      const liveUsername = cleanUsername(body?.live_username);
      if (!liveUsername) return json({ error: 'Informe o @ da live' }, 400);
      // Uma sessão ativa por empresa: a anterior é encerrada.
      await supabase.from('tiktok_live_sessions')
        .update({ status: 'encerrada', ended_at: new Date().toISOString() })
        .eq('tenant_id', tenantId).eq('status', 'ativa');
      const { data: session, error } = await supabase.from('tiktok_live_sessions')
        .insert({ tenant_id: tenantId, tiktok_live_username: liveUsername })
        .select('id').single();
      if (error) return json({ error: 'Não foi possível abrir a sessão' }, 500);
      const { data: tenant } = await supabase.from('tenants').select('name, slug').eq('id', tenantId).maybeSingle();
      return json({ success: true, session_id: session.id, tenant_name: tenant?.name ?? null, tenant_slug: tenant?.slug ?? null });
    }

    const sessionId = String(body?.session_id || '');
    const { data: session } = await supabase.from('tiktok_live_sessions')
      .select('id, status').eq('id', sessionId).eq('tenant_id', tenantId).maybeSingle();
    if (!session) return json({ error: 'Sessão não encontrada' }, 404);

    if (action === 'end') {
      await supabase.from('tiktok_live_sessions')
        .update({ status: 'encerrada', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
      return json({ success: true });
    }

    if (action !== 'comment') return json({ error: 'Ação inválida' }, 400);
    if (session.status !== 'ativa') return json({ success: false, status: 'session_closed' });

    const username = cleanUsername(body?.tiktok_username);
    const commentText = String(body?.comment ?? '').slice(0, 500);
    if (!username || !commentText) return json({ error: 'Comentário incompleto' }, 400);

    const code = extractProductCode(commentText);
    if (!code) return json({ success: true, status: 'no_code' });

    await supabase.from('tiktok_live_sessions').update({ last_comment_at: new Date().toISOString() }).eq('id', sessionId);

    // Idempotência: o índice único (session_id, comment_key) garante que um comentário reenviado não vira dois pedidos.
    const commentKey = String(body?.comment_id || '').slice(0, 120) || `${username}:${commentText}:${Math.floor(Date.now() / 1000)}`;
    const { data: row, error: insertErr } = await supabase.from('tiktok_live_comments').insert({
      tenant_id: tenantId,
      session_id: sessionId,
      comment_key: commentKey,
      tiktok_user_id: body?.tiktok_user_id ? String(body.tiktok_user_id).slice(0, 60) : null,
      tiktok_username: username,
      comment_text: commentText,
      product_code: code.normalized,
      qty: code.qty,
      status: 'not_found',
    }).select('id').single();
    if (insertErr) {
      if ((insertErr as any).code === '23505') return json({ success: true, status: 'duplicate' });
      console.error('[tiktok-live-comment] insert comment:', insertErr.message);
      return json({ error: 'Erro ao registrar comentário' }, 500);
    }
    const setStatus = (fields: Record<string, unknown>) =>
      supabase.from('tiktok_live_comments').update(fields).eq('id', row.id);

    // Produto: só código EXATO, de venda na live; se houver repetidos, prefere o que tem estoque.
    const { data: products } = await supabase.from('products')
      .select('*')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .ilike('code', escapeLikeExact(code.normalized))
      .in('sale_type', ['LIVE', 'AMBOS'])
      .order('id', { ascending: false }).limit(10);
    const product = products?.find((p: any) => Number(p.stock) > 0) || products?.[0] || null;

    if (!product) {
      const { data: anyProduct } = await supabase.from('products').select('id')
        .eq('tenant_id', tenantId).eq('is_active', true)
        .ilike('code', escapeLikeExact(code.normalized)).limit(1);
      const status = anyProduct && anyProduct.length > 0 ? 'not_for_live' : 'not_found';
      await setStatus({ status });
      return json({ success: true, status });
    }

    const { data: customer } = await supabase.from('customers')
      .select('id, name, phone, is_blocked, cep, street, number, complement, neighborhood, city, state')
      .eq('tenant_id', tenantId).ilike('tiktok', escapeLikeExact(username)).limit(1).maybeSingle();

    if (customer?.is_blocked) {
      await setStatus({ status: 'blocked', product_id: product.id, product_name: product.name });
      return json({ success: true, status: 'blocked' });
    }

    // Reserva atômica do estoque: o primeiro comentário leva a peça.
    const { data: reserved, error: reserveErr } = await supabase.rpc('reserve_product_stock', {
      p_product_id: product.id, p_qty: code.qty,
    });
    if (reserveErr || reserved === null || reserved === undefined) {
      await setStatus({ status: 'out_of_stock', product_id: product.id, product_name: product.name });
      return json({ success: true, status: 'out_of_stock' });
    }
    const releaseStock = () => supabase.rpc('release_product_stock', { p_product_id: product.id, p_qty: code.qty });

    const registered = !!customer?.phone;
    const cartPhone = registered ? customer!.phone : `@tiktok:${username}`;
    const today = brasiliaToday();
    const unitPrice = product.promotional_price && product.promotional_price > 0 ? product.promotional_price : product.price;

    // Carrinho aberto do @ na live de hoje.
    let { data: cart } = await supabase.from('carts').select('*')
      .eq('tenant_id', tenantId).eq('status', 'OPEN').eq('event_type', 'TIKTOK_LIVE')
      .eq('event_date', today).eq('customer_tiktok', username)
      .order('id', { ascending: false }).limit(1).maybeSingle();
    if (!cart) {
      const { data: newCart, error: cartErr } = await supabase.from('carts').insert({
        tenant_id: tenantId, customer_phone: cartPhone, customer_tiktok: username,
        event_date: today, event_type: 'TIKTOK_LIVE', status: 'OPEN',
      }).select().single();
      if (cartErr) {
        await releaseStock();
        console.error('[tiktok-live-comment] cart:', cartErr.message);
        await setStatus({ status: 'not_found' });
        return json({ error: 'Erro ao criar carrinho' }, 500);
      }
      cart = newCart;
    } else if (registered && cart.customer_phone !== cartPhone) {
      await supabase.from('carts').update({ customer_phone: cartPhone }).eq('id', cart.id);
    }

    // O pedido nasce antes do item para que a mensagem de WhatsApp (gatilho do item) já saia com o número do pedido.
    let { data: order } = await supabase.from('orders').select('*')
      .eq('tenant_id', tenantId).eq('cart_id', cart.id).maybeSingle();
    if (!order) {
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        tenant_id: tenantId,
        cart_id: cart.id,
        customer_phone: cartPhone,
        customer_name: customer?.name || `@${username}`,
        event_date: today,
        event_type: 'TIKTOK_LIVE',
        total_amount: 0,
        is_paid: false,
        printed: false,
        item_added_message_sent: false,
        payment_confirmation_sent: false,
        is_cancelled: false,
        source: 'tiktok',
        ...(customer ? {
          customer_cep: customer.cep || null,
          customer_street: customer.street || null,
          customer_number: customer.number || null,
          customer_neighborhood: customer.neighborhood || null,
          customer_city: customer.city || null,
          customer_state: customer.state || null,
          customer_complement: customer.complement || null,
        } : {}),
      }).select().single();
      if (orderErr) {
        await releaseStock();
        console.error('[tiktok-live-comment] order:', orderErr.message);
        return json({ error: 'Erro ao criar pedido' }, 500);
      }
      order = newOrder;
    }

    const { data: existingItem } = await supabase.from('cart_items').select('id, qty')
      .eq('cart_id', cart.id).eq('product_id', product.id).maybeSingle();
    const itemResult = existingItem
      ? await supabase.from('cart_items').update({ qty: existingItem.qty + code.qty, unit_price: unitPrice }).eq('id', existingItem.id)
      : await supabase.from('cart_items').insert({
          tenant_id: tenantId, cart_id: cart.id, product_id: product.id,
          product_code: product.code, product_name: product.name, product_image_url: product.image_url,
          unit_price: unitPrice, qty: code.qty,
        });
    if (itemResult.error) {
      await releaseStock();
      console.error('[tiktok-live-comment] item:', itemResult.error.message);
      return json({ error: 'Erro ao adicionar item' }, 500);
    }

    const { data: items } = await supabase.from('cart_items').select('unit_price, qty').eq('cart_id', cart.id);
    const total = (items || []).reduce((s: number, i: any) => s + Number(i.unit_price) * Number(i.qty), 0);
    await supabase.from('orders').update({ total_amount: total }).eq('id', order.id);

    const reserveHours = Number(settings.reserve_hours) || 3;
    const status = registered ? 'added' : 'pendente';
    await setStatus({
      status,
      product_id: product.id,
      product_name: product.name,
      order_id: order.id,
      expires_at: registered ? null : new Date(Date.now() + reserveHours * 3600_000).toISOString(),
    });

    return json({ success: true, status, product: product.name, order_id: order.id, registered });
  } catch (e: any) {
    console.error('[tiktok-live-comment] erro:', e?.message || e);
    return json({ error: 'Erro inesperado' }, 500);
  }
});
