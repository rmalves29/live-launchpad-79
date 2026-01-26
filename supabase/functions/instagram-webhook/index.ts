/**
 * Instagram Webhook Handler
 * 
 * Processa eventos do Instagram:
 * - Comentários em lives (live_comments)
 * - Menções em stories
 * - Mensagens diretas
 * 
 * Fluxo:
 * 1. Recebe comentário com código do produto
 * 2. Identifica o produto no catálogo
 * 3. Cria/atualiza carrinho do cliente
 * 4. Envia DM confirmando o item adicionado
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Webhook Verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('[Instagram Webhook] Verification request:', { mode, token });

    // Verificar token - buscar de qualquer integração ativa
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: integrations } = await supabase
      .from('integration_instagram')
      .select('webhook_verify_token')
      .eq('is_active', true);

    const validTokens = integrations?.map(i => i.webhook_verify_token) || ['orderzap_instagram_verify'];

    if (mode === 'subscribe' && validTokens.includes(token)) {
      console.log('[Instagram Webhook] Verification successful');
      return new Response(challenge, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      });
    }

    console.log('[Instagram Webhook] Verification failed');
    return new Response('Forbidden', { status: 403, headers: corsHeaders });
  }

  // Process webhook events (POST request)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[Instagram Webhook] Received event:', JSON.stringify(body, null, 2));

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Log do webhook
      await supabase.from('webhook_logs').insert({
        webhook_type: 'instagram',
        payload: body,
        status_code: 200,
      });

      // Processar entradas do webhook
      const entries = body.entry || [];

      for (const entry of entries) {
        const instagramAccountId = entry.id;
        
        // Buscar integração pelo instagram_account_id
        const { data: integration } = await supabase
          .from('integration_instagram')
          .select('*, tenants!inner(id, slug, name)')
          .eq('instagram_account_id', instagramAccountId)
          .eq('is_active', true)
          .maybeSingle();

        if (!integration) {
          console.log('[Instagram Webhook] No active integration for account:', instagramAccountId);
          continue;
        }

        const tenantId = integration.tenant_id;
        console.log('[Instagram Webhook] Processing for tenant:', tenantId);

        // Processar diferentes tipos de eventos
        const changes = entry.changes || [];
        const messaging = entry.messaging || [];

        // 1. Processar comentários (incluindo live comments)
        for (const change of changes) {
          if (change.field === 'comments' || change.field === 'live_comments') {
            await processComment(supabase, tenantId, integration, change.value);
          }
        }

        // 2. Processar mensagens diretas
        for (const message of messaging) {
          if (message.message) {
            await processDirectMessage(supabase, tenantId, integration, message);
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error) {
      console.error('[Instagram Webhook] Error:', error);
      
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});

/**
 * Processa comentário de live ou post
 */
async function processComment(
  supabase: any, 
  tenantId: string, 
  integration: any, 
  commentData: any
) {
  console.log('[Instagram Webhook] Processing comment:', commentData);

  const { text, from, id: commentId, media } = commentData;
  const userId = from?.id;
  const username = from?.username;

  if (!text || !userId) {
    console.log('[Instagram Webhook] Invalid comment data');
    return;
  }

  // Extrair código do produto do comentário
  // Suporta formatos: ABC123, abc123, ABC-123
  const productCodeMatch = text.match(/\b([A-Za-z]{2,4}[-]?[0-9]{2,6})\b/i);
  
  if (!productCodeMatch) {
    console.log('[Instagram Webhook] No product code found in comment:', text);
    return;
  }

  const productCode = productCodeMatch[1].toUpperCase().replace('-', '');
  console.log('[Instagram Webhook] Found product code:', productCode);

  // Buscar produto
  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .ilike('code', productCode)
    .eq('is_active', true)
    .maybeSingle();

  if (!product) {
    console.log('[Instagram Webhook] Product not found:', productCode);
    // Enviar DM informando que produto não foi encontrado
    await sendInstagramDM(
      integration,
      userId,
      `❌ Produto "${productCode}" não encontrado. Verifique o código e tente novamente!`
    );
    return;
  }

  // Criar ou atualizar carrinho
  // Usar instagram username como identificador (prefixado com @)
  const customerIdentifier = `@${username}`;
  const today = new Date().toISOString().split('T')[0];

  // Buscar carrinho aberto
  let { data: cart } = await supabase
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', customerIdentifier)
    .eq('status', 'OPEN')
    .maybeSingle();

  if (!cart) {
    // Criar novo carrinho
    const { data: newCart, error: cartError } = await supabase
      .from('carts')
      .insert({
        tenant_id: tenantId,
        customer_phone: customerIdentifier,
        customer_instagram: username,
        event_date: today,
        event_type: 'INSTAGRAM_LIVE',
        status: 'OPEN',
      })
      .select()
      .single();

    if (cartError) {
      console.error('[Instagram Webhook] Error creating cart:', cartError);
      return;
    }
    cart = newCart;
  }

  // Verificar se item já existe no carrinho
  const { data: existingItem } = await supabase
    .from('cart_items')
    .select('*')
    .eq('cart_id', cart.id)
    .eq('product_id', product.id)
    .maybeSingle();

  if (existingItem) {
    // Incrementar quantidade
    await supabase
      .from('cart_items')
      .update({ qty: existingItem.qty + 1 })
      .eq('id', existingItem.id);
  } else {
    // Adicionar novo item
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
  }

  // Calcular total do carrinho
  const { data: cartItems } = await supabase
    .from('cart_items')
    .select('unit_price, qty')
    .eq('cart_id', cart.id);

  const total = cartItems?.reduce((sum: number, item: any) => sum + (item.unit_price * item.qty), 0) || 0;

  // Enviar DM de confirmação
  const message = `🛒 *Item adicionado!*\n\n` +
    `✅ ${product.name}\n` +
    `📦 Código: ${product.code}\n` +
    `💰 Valor: R$ ${product.price.toFixed(2)}\n\n` +
    `🧾 Total do carrinho: R$ ${total.toFixed(2)}\n\n` +
    `Para finalizar, responda "FINALIZAR"`;

  await sendInstagramDM(integration, userId, message);

  console.log('[Instagram Webhook] Item added to cart:', {
    cartId: cart.id,
    productCode: product.code,
    username,
  });
}

/**
 * Processa mensagem direta
 */
async function processDirectMessage(
  supabase: any,
  tenantId: string,
  integration: any,
  messageData: any
) {
  console.log('[Instagram Webhook] Processing DM:', messageData);

  const { sender, message } = messageData;
  const userId = sender?.id;
  const text = message?.text;

  if (!userId || !text) {
    return;
  }

  // Verificar comandos especiais
  const upperText = text.toUpperCase().trim();

  if (upperText === 'FINALIZAR') {
    // Buscar carrinho aberto do usuário
    const { data: cart } = await supabase
      .from('carts')
      .select('*, cart_items(*)')
      .eq('tenant_id', tenantId)
      .eq('customer_phone', `@${userId}`)
      .eq('status', 'OPEN')
      .maybeSingle();

    if (!cart || !cart.cart_items?.length) {
      await sendInstagramDM(
        integration,
        userId,
        '❌ Você não tem itens no carrinho. Comente o código do produto na live para adicionar!'
      );
      return;
    }

    // TODO: Implementar fluxo de checkout
    // Por enquanto, apenas confirma
    const total = cart.cart_items.reduce((sum: number, item: any) => sum + (item.unit_price * item.qty), 0);
    
    await sendInstagramDM(
      integration,
      userId,
      `✅ *Pedido recebido!*\n\n` +
      `📦 Total: R$ ${total.toFixed(2)}\n\n` +
      `Em breve entraremos em contato para finalizar o pagamento e envio!`
    );
  }
}

/**
 * Envia mensagem direta no Instagram
 */
async function sendInstagramDM(
  integration: any,
  recipientId: string,
  message: string
) {
  const pageAccessToken = integration.page_access_token;
  
  if (!pageAccessToken) {
    console.error('[Instagram Webhook] No page access token configured');
    return;
  }

  try {
    // Usar Instagram Messaging API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          access_token: pageAccessToken,
        }),
      }
    );

    const result = await response.json();
    console.log('[Instagram Webhook] DM sent:', result);

    return result;
  } catch (error) {
    console.error('[Instagram Webhook] Error sending DM:', error);
  }
}
