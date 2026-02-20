/**
 * Instagram Graph API Webhook Handler
 * 
 * Recebe notificações oficiais do Instagram para Live Commerce multitenant.
 * 
 * Fluxo:
 * 1. GET: Validação do webhook pela Meta (hub.mode, hub.verify_token, hub.challenge)
 * 2. POST: Processa comentários de lives
 *    - Identifica tenant pelo page_id
 *    - Busca produto pelo código no comentário
 *    - Cria/atualiza carrinho e pedido
 *    - Envia DM de confirmação via Graph API
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('INSTAGRAM_WEBHOOK_VERIFY_TOKEN') || 'orderzap_instagram_verify';

// Regex para extrair códigos de produto (ex: ABC123, MM-456, C001)
const PRODUCT_CODE_REGEX = /\b([A-Za-z]{1,4}[-]?[0-9]{1,6})\b/i;

interface InstagramWebhookEntry {
  id: string; // Page/Account ID
  time: number;
  changes?: Array<{
    field: string;
    value: {
      from: {
        id: string;
        username?: string;
      };
      media?: {
        id: string;
        media_product_type?: string;
      };
      id: string; // Comment ID
      text: string;
      timestamp?: string;
    };
  }>;
}

interface InstagramWebhookPayload {
  object: string;
  entry: InstagramWebhookEntry[];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const timestamp = new Date().toISOString();

  // ========================
  // GET: Validação do Webhook
  // ========================
  if (req.method === 'GET') {
    const hubMode = url.searchParams.get('hub.mode');
    const hubVerifyToken = url.searchParams.get('hub.verify_token');
    const hubChallenge = url.searchParams.get('hub.challenge');

    console.log(`[${timestamp}] [instagram-webhook] GET validation request`);
    console.log(`[${timestamp}] [instagram-webhook] hub.mode: ${hubMode}`);
    console.log(`[${timestamp}] [instagram-webhook] hub.verify_token: ${hubVerifyToken ? '***' : 'missing'}`);

    if (hubMode === 'subscribe' && hubVerifyToken === WEBHOOK_VERIFY_TOKEN) {
      console.log(`[${timestamp}] [instagram-webhook] ✅ Validation successful, returning challenge`);
      return new Response(hubChallenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    console.log(`[${timestamp}] [instagram-webhook] ❌ Validation failed`);
    return new Response('Forbidden', { status: 403 });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ========================
  // POST: Processar Eventos
  // ========================
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body: InstagramWebhookPayload = await req.json();
    console.log(`[${timestamp}] [instagram-webhook] POST received:`, JSON.stringify(body, null, 2));

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log do webhook recebido
    await supabase.from('webhook_logs').insert({
      webhook_type: 'instagram_graph_api',
      payload: body,
      status_code: 200,
    }).catch(() => {}); // Ignorar erro se tabela não existir

    // Verificar se é um evento do Instagram
    if (body.object !== 'instagram') {
      console.log(`[${timestamp}] [instagram-webhook] Ignoring non-instagram object: ${body.object}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Processar cada entry
    for (const entry of body.entry) {
      const pageId = entry.id;
      console.log(`[${timestamp}] [instagram-webhook] Processing entry for page: ${pageId}`);

      // Buscar tenant pelo page_id ou instagram_account_id
      const { data: integration, error: integrationError } = await supabase
        .from('integration_instagram')
        .select('*, tenants!inner(id, slug, name)')
        .or(`page_id.eq.${pageId},instagram_account_id.eq.${pageId}`)
        .eq('is_active', true)
        .maybeSingle();

      if (integrationError) {
        console.error(`[${timestamp}] [instagram-webhook] Error fetching integration:`, integrationError);
        continue;
      }

      if (!integration) {
        console.log(`[${timestamp}] [instagram-webhook] No active integration found for page: ${pageId}`);
        continue;
      }

      const tenantId = integration.tenant_id;
      const tenantSlug = (integration.tenants as any)?.slug || '';
      const pageAccessToken = integration.page_access_token;

      console.log(`[${timestamp}] [instagram-webhook] Found tenant: ${tenantId} (${tenantSlug})`);

      // Processar cada change (comentário)
      if (!entry.changes) continue;

      for (const change of entry.changes) {
        if (change.field !== 'comments') {
          console.log(`[${timestamp}] [instagram-webhook] Ignoring field: ${change.field}`);
          continue;
        }

        const { value } = change;
        const buyerId = value.from.id;
        const buyerUsername = value.from.username || '';
        const commentId = value.id;
        const commentText = value.text;
        const mediaId = value.media?.id;
        const isLiveComment = value.media?.media_product_type === 'LIVE';

        console.log(`[${timestamp}] [instagram-webhook] Comment from @${buyerUsername} (${buyerId}): "${commentText}"`);

        // Extrair código do produto
        const codeMatch = commentText.match(PRODUCT_CODE_REGEX);
        if (!codeMatch) {
          console.log(`[${timestamp}] [instagram-webhook] No product code found in comment`);
          continue;
        }

        const productCode = codeMatch[1].toUpperCase().replace(/-/g, '');
        console.log(`[${timestamp}] [instagram-webhook] Extracted product code: ${productCode}`);

        // Buscar produto
        let product = null;
        
        // Busca exata primeiro
        const { data: exactProduct, error: exactError } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .ilike('code', productCode)
          .maybeSingle();

        if (!exactError && exactProduct) {
          product = exactProduct;
        } else {
          // Busca parcial
          const { data: fuzzyProduct } = await supabase
            .from('products')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .ilike('code', `%${productCode}%`)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();

          product = fuzzyProduct;
        }

        if (!product) {
          console.log(`[${timestamp}] [instagram-webhook] Product not found: ${productCode}`);
          
          // Enviar DM informando que produto não foi encontrado
          if (pageAccessToken) {
            await sendInstagramDM(
              buyerId,
              pageAccessToken,
              `❌ Produto "${codeMatch[1]}" não encontrado. Verifique o código e tente novamente!`
            ).catch(e => console.error(`[${timestamp}] [instagram-webhook] DM error:`, e));
          }
          continue;
        }

        console.log(`[${timestamp}] [instagram-webhook] Product found: ${product.name} (${product.code})`);

        // Verificar estoque
        if (product.stock <= 0) {
          console.log(`[${timestamp}] [instagram-webhook] Product out of stock: ${product.code}`);
          
          if (pageAccessToken) {
            await sendInstagramDM(
              buyerId,
              pageAccessToken,
              `😔 O produto "${product.name}" está esgotado. Fique de olho nas próximas lives!`
            ).catch(e => console.error(`[${timestamp}] [instagram-webhook] DM error:`, e));
          }
          continue;
        }

        // Identificador do cliente: usar Instagram ID
        const customerIdentifier = `ig_${buyerId}`;
        const today = new Date().toISOString().split('T')[0];

        // Buscar ou criar carrinho
        let { data: cart } = await supabase
          .from('carts')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('customer_instagram', buyerId)
          .eq('status', 'OPEN')
          .maybeSingle();

        if (!cart) {
          const { data: newCart, error: cartError } = await supabase
            .from('carts')
            .insert({
              tenant_id: tenantId,
              customer_phone: customerIdentifier,
              customer_instagram: buyerId,
              event_date: today,
              event_type: isLiveComment ? 'INSTAGRAM_LIVE' : 'INSTAGRAM_COMMENT',
              status: 'OPEN',
            })
            .select()
            .single();

          if (cartError) {
            console.error(`[${timestamp}] [instagram-webhook] Cart creation error:`, cartError);
            continue;
          }
          cart = newCart;
          console.log(`[${timestamp}] [instagram-webhook] New cart created: ${cart.id}`);
        }

        // STOCK VALIDATION: Check current stock before adding to cart
        const { data: freshProduct } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product.id)
          .single();

        if (!freshProduct || freshProduct.stock < 1) {
          console.log(`[${timestamp}] [instagram-webhook] ❌ Product ${product.code} out of stock (stock=${freshProduct?.stock || 0})`);
          continue;
        }

        // Verificar se item já existe no carrinho
        const { data: existingItem } = await supabase
          .from('cart_items')
          .select('*')
          .eq('cart_id', cart.id)
          .eq('product_id', product.id)
          .maybeSingle();

        let itemQty = 1;
        if (existingItem) {
          itemQty = existingItem.qty + 1;
          if (itemQty > freshProduct.stock) {
            console.log(`[${timestamp}] [instagram-webhook] ❌ Product ${product.code} insufficient stock for qty=${itemQty} (stock=${freshProduct.stock})`);
            continue;
          }
          await supabase
            .from('cart_items')
            .update({ qty: itemQty })
            .eq('id', existingItem.id);
          console.log(`[${timestamp}] [instagram-webhook] Item quantity updated: ${product.code} qty=${itemQty}`);
        } else {
          await supabase
            .from('cart_items')
            .insert({
              tenant_id: tenantId,
              cart_id: cart.id,
              product_id: product.id,
              product_code: product.code,
              product_name: product.name,
              product_image_url: product.image_url,
              unit_price: product.price,
              qty: 1,
            });
          console.log(`[${timestamp}] [instagram-webhook] New item added: ${product.code}`);
        }

        // ATOMIC stock decrement
        const { error: stockDecErr } = await supabase
          .from('products')
          .update({ stock: freshProduct.stock - itemQty + (existingItem ? existingItem.qty : 0) })
          .eq('id', product.id)
          .gt('stock', 0);

        if (stockDecErr) {
          console.log(`[${timestamp}] [instagram-webhook] ❌ Stock decrement failed for ${product.code}:`, stockDecErr);
          // Rollback cart item
          if (existingItem) {
            await supabase.from('cart_items').update({ qty: existingItem.qty }).eq('id', existingItem.id);
          } else {
            await supabase.from('cart_items').delete().eq('cart_id', cart.id).eq('product_id', product.id);
          }
          continue;
        }

        // Calcular total do carrinho
        const { data: cartItems } = await supabase
          .from('cart_items')
          .select('unit_price, qty, product_name')
          .eq('cart_id', cart.id);

        const total = cartItems?.reduce((sum, item) => sum + (item.unit_price * item.qty), 0) || 0;

        // Criar ou atualizar pedido
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('cart_id', cart.id)
          .maybeSingle();

        let order = existingOrder;

        if (existingOrder) {
          const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({ total_amount: total })
            .eq('id', existingOrder.id)
            .select()
            .single();

          if (!updateError) {
            order = updatedOrder;
            console.log(`[${timestamp}] [instagram-webhook] Order updated: ${order.id}, total: ${total}`);
          }
        } else {
          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert({
              tenant_id: tenantId,
              cart_id: cart.id,
              customer_phone: customerIdentifier,
              customer_name: buyerUsername ? `@${buyerUsername}` : 'Instagram',
              event_date: today,
              event_type: isLiveComment ? 'INSTAGRAM_LIVE' : 'INSTAGRAM_COMMENT',
              total_amount: total,
              is_paid: false,
              printed: false,
              item_added_message_sent: false,
              payment_confirmation_sent: false,
              is_cancelled: false,
            })
            .select()
            .single();

          if (!orderError) {
            order = newOrder;
            console.log(`[${timestamp}] [instagram-webhook] New order created: ${order.id}, total: ${total}`);
          }
        }

        // Enviar DM de confirmação
        if (pageAccessToken) {
          const checkoutUrl = `https://app.orderzaps.com/t/${tenantSlug}/checkout`;
          const priceFormatted = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
          const totalFormatted = `R$ ${total.toFixed(2).replace('.', ',')}`;

          const dmMessage = 
            `✅ *${product.name}* adicionado!\n\n` +
            `💰 Valor: ${priceFormatted}\n` +
            `🛒 Total do carrinho: ${totalFormatted}\n\n` +
            `Para finalizar seu pedido, acesse:\n${checkoutUrl}`;

          const dmResult = await sendInstagramDM(buyerId, pageAccessToken, dmMessage);
          
          if (dmResult.success) {
            console.log(`[${timestamp}] [instagram-webhook] DM sent successfully to ${buyerId}`);
          } else {
            console.error(`[${timestamp}] [instagram-webhook] DM failed:`, dmResult.error);
          }
        } else {
          console.log(`[${timestamp}] [instagram-webhook] No page_access_token, skipping DM`);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error(`[${timestamp}] [instagram-webhook] Error:`, error.message || error);
    
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Envia mensagem direta via Instagram Graph API
 */
async function sendInstagramDM(
  recipientId: string,
  accessToken: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
        }),
      }
    );

    if (response.ok) {
      return { success: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
    
    // Verificar se é erro de token expirado
    if (errorData?.error?.code === 190) {
      console.error('[instagram-webhook] Token expired or invalid');
      return { success: false, error: 'Token expirado ou inválido' };
    }

    return { success: false, error: errorMsg };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
