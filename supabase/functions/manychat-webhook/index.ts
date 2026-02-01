/**
 * Manychat Webhook Handler
 * 
 * Processa eventos do Manychat para automação de vendas via Instagram Live
 * 
 * Fluxo:
 * 1. Manychat detecta comentário na live com código do produto
 * 2. Envia dados para este webhook
 * 3. Sistema identifica o produto no catálogo
 * 4. Cria/atualiza carrinho do cliente
 * 5. Retorna dados para Manychat continuar o fluxo de DM
 * 6. **NOVO**: Reseta o subscriber via API para permitir múltiplos comentários
 * 
 * VISIBILIDADE: Inicialmente apenas para tenant "mania-de-mulher"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const manychatApiKey = Deno.env.get('MANYCHAT_API_KEY');

// Tenant autorizado (Mania de Mulher)
const MANIA_DE_MULHER_TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

/**
 * Reseta o subscriber no Manychat para permitir que o trigger funcione novamente
 * Isso é feito via API do Manychat, removendo e re-adicionando uma tag
 */
async function resetManychatSubscriber(subscriberId: string): Promise<void> {
  if (!manychatApiKey || !subscriberId) {
    console.log('[Manychat Webhook] Não foi possível resetar subscriber - API key ou ID ausente');
    return;
  }

  try {
    // Técnica: Adicionar uma tag temporária e remover imediatamente
    // Isso "atualiza" o subscriber e pode resetar o estado do trigger
    const resetTagName = 'RESET_TRIGGER_TEMP';
    
    // Primeiro, tenta adicionar a tag
    const addTagResponse = await fetch(`https://api.manychat.com/fb/subscriber/addTagByName`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${manychatApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        tag_name: resetTagName,
      }),
    });

    console.log('[Manychat Webhook] Add tag response:', addTagResponse.status);

    // Aguardar um momento
    await new Promise(resolve => setTimeout(resolve, 100));

    // Depois remove a tag
    const removeTagResponse = await fetch(`https://api.manychat.com/fb/subscriber/removeTagByName`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${manychatApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        tag_name: resetTagName,
      }),
    });

    console.log('[Manychat Webhook] Remove tag response:', removeTagResponse.status);
    console.log('[Manychat Webhook] Subscriber resetado com sucesso:', subscriberId);

  } catch (error) {
    console.error('[Manychat Webhook] Erro ao resetar subscriber:', error);
    // Não propagamos o erro - o reset é best-effort
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Apenas POST é aceito
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('[Manychat Webhook] Received:', JSON.stringify(body, null, 2));

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log do webhook
    await supabase.from('webhook_logs').insert({
      webhook_type: 'manychat',
      payload: body,
      status_code: 200,
      tenant_id: MANIA_DE_MULHER_TENANT_ID,
    });

    // Extrair dados do Manychat
    const {
      product_code,
      instagram_username,
      subscriber_id,
      first_name,
      phone,
      comment_text,
    } = body;

    // Validação básica
    if (!product_code) {
      console.log('[Manychat Webhook] Código do produto não fornecido');
      
      // Mesmo sem produto, resetar subscriber para próximo comentário
      if (subscriber_id) {
        resetManychatSubscriber(subscriber_id).catch(console.error);
      }
      
      return new Response(JSON.stringify({
        success: false,
        message: 'Código do produto não fornecido',
        product_found: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalizar código do produto
    const normalizedCode = product_code.toUpperCase().replace(/[-\s]/g, '');
    console.log('[Manychat Webhook] Buscando produto:', normalizedCode);

    // Buscar produto pelo código
    // IMPORTANTE: evitar PGRST116 ("JSON object requested, multiple rows") quando o código não é único.
    // Estratégia:
    // 1) tentar match exato (normalmente é o esperado)
    // 2) fallback para match parcial com LIMIT 1 (best-effort)

    let product: any = null;

    const { data: exactProduct, error: exactProductError } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', MANIA_DE_MULHER_TENANT_ID)
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .maybeSingle();

    if (exactProductError) {
      console.error('[Manychat Webhook] Erro ao buscar produto (match exato):', exactProductError);
      throw exactProductError;
    }

    product = exactProduct;

    if (!product) {
      const { data: fuzzyProduct, error: fuzzyProductError } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', MANIA_DE_MULHER_TENANT_ID)
        .ilike('code', `%${normalizedCode}%`)
        .eq('is_active', true)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fuzzyProductError) {
        console.error('[Manychat Webhook] Erro ao buscar produto (match parcial):', fuzzyProductError);
        throw fuzzyProductError;
      }

      product = fuzzyProduct;
    }

    if (!product) {
      console.log('[Manychat Webhook] Produto não encontrado:', normalizedCode);
      
      // Resetar subscriber para próximo comentário
      if (subscriber_id) {
        resetManychatSubscriber(subscriber_id).catch(console.error);
      }
      
      return new Response(JSON.stringify({
        success: false,
        message: `Produto "${product_code}" não encontrado`,
        product_found: false,
        product_code: product_code,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[Manychat Webhook] Produto encontrado:', product.name, product.code);

    // Verificar estoque
    if (product.stock <= 0) {
      console.log('[Manychat Webhook] Produto sem estoque:', product.code);
      
      // Resetar subscriber para próximo comentário
      if (subscriber_id) {
        resetManychatSubscriber(subscriber_id).catch(console.error);
      }
      
      return new Response(JSON.stringify({
        success: false,
        message: `Produto "${product.name}" está esgotado`,
        product_found: true,
        out_of_stock: true,
        product_name: product.name,
        product_code: product.code,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Identificador do cliente
    const customerIdentifier = instagram_username 
      ? (instagram_username.startsWith('@') ? instagram_username : `@${instagram_username}`)
      : `manychat_${subscriber_id}`;
    
    const today = new Date().toISOString().split('T')[0];

    // Buscar ou criar carrinho
    let { data: cart } = await supabase
      .from('carts')
      .select('*')
      .eq('tenant_id', MANIA_DE_MULHER_TENANT_ID)
      .eq('customer_phone', customerIdentifier)
      .eq('status', 'OPEN')
      .maybeSingle();

    if (!cart) {
      const { data: newCart, error: cartError } = await supabase
        .from('carts')
        .insert({
          tenant_id: MANIA_DE_MULHER_TENANT_ID,
          customer_phone: phone || customerIdentifier,
          customer_instagram: instagram_username?.replace('@', '') || subscriber_id,
          event_date: today,
          event_type: 'INSTAGRAM_LIVE_MANYCHAT',
          status: 'OPEN',
        })
        .select()
        .single();

      if (cartError) {
        console.error('[Manychat Webhook] Erro ao criar carrinho:', cartError);
        throw cartError;
      }
      cart = newCart;
      console.log('[Manychat Webhook] Novo carrinho criado:', cart.id);
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
      await supabase
        .from('cart_items')
        .update({ qty: itemQty })
        .eq('id', existingItem.id);
      console.log('[Manychat Webhook] Item incrementado:', product.code, 'qty:', itemQty);
    } else {
      await supabase
        .from('cart_items')
        .insert({
          tenant_id: MANIA_DE_MULHER_TENANT_ID,
          cart_id: cart.id,
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          product_image_url: product.image_url,
          unit_price: product.price,
          qty: 1,
        });
      console.log('[Manychat Webhook] Novo item adicionado:', product.code);
    }

    // Calcular total do carrinho
    const { data: cartItems } = await supabase
      .from('cart_items')
      .select('unit_price, qty, product_name')
      .eq('cart_id', cart.id);

    const total = cartItems?.reduce((sum: number, item: any) => 
      sum + (item.unit_price * item.qty), 0) || 0;

    const itemsList = cartItems?.map((item: any) => 
      `${item.qty}x ${item.product_name}`
    ).join(', ') || '';

    console.log('[Manychat Webhook] Carrinho atualizado - Total:', total);

    // =====================================================
    // CRIAR OU ATUALIZAR PEDIDO (orders) AUTOMATICAMENTE
    // Similar ao fluxo de grupos WhatsApp - usa @instagram como chave
    // =====================================================
    let order: any = null;

    // Buscar pedido existente para esse carrinho
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', MANIA_DE_MULHER_TENANT_ID)
      .eq('cart_id', cart.id)
      .maybeSingle();

    if (existingOrder) {
      // Atualizar total do pedido existente
      const { data: updatedOrder, error: updateOrderError } = await supabase
        .from('orders')
        .update({ total_amount: total })
        .eq('id', existingOrder.id)
        .select()
        .single();

      if (updateOrderError) {
        console.error('[Manychat Webhook] Erro ao atualizar pedido:', updateOrderError);
      } else {
        order = updatedOrder;
        console.log('[Manychat Webhook] Pedido atualizado:', order.id, 'Total:', total);
      }
    } else {
      // Criar novo pedido
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: MANIA_DE_MULHER_TENANT_ID,
          cart_id: cart.id,
          customer_phone: customerIdentifier, // @instagram
          customer_name: first_name || instagram_username || 'Instagram',
          event_date: today,
          event_type: 'INSTAGRAM_LIVE_MANYCHAT',
          total_amount: total,
          is_paid: false,
          printed: false,
          item_added_message_sent: false,
          payment_confirmation_sent: false,
          is_cancelled: false,
        })
        .select()
        .single();

      if (orderError) {
        console.error('[Manychat Webhook] Erro ao criar pedido:', orderError);
      } else {
        order = newOrder;
        console.log('[Manychat Webhook] Novo pedido criado:', order.id, 'Total:', total);
      }
    }

    // **IMPORTANTE**: Resetar subscriber para permitir próximo comentário
    if (subscriber_id) {
      console.log('[Manychat Webhook] Iniciando reset do subscriber:', subscriber_id);
      // Executar em background para não atrasar a resposta
      resetManychatSubscriber(subscriber_id).catch(console.error);
    }

    // Retornar dados para o Manychat usar no fluxo
    return new Response(JSON.stringify({
      success: true,
      product_found: true,
      out_of_stock: false,
      
      // Dados do produto adicionado
      product_name: product.name,
      product_code: product.code,
      product_price: product.price,
      product_price_formatted: `R$ ${product.price.toFixed(2).replace('.', ',')}`,
      product_image_url: product.image_url || '',
      
      // Dados do carrinho
      cart_id: cart.id,
      item_quantity: itemQty,
      cart_total: total,
      cart_total_formatted: `R$ ${total.toFixed(2).replace('.', ',')}`,
      cart_items_count: cartItems?.length || 1,
      cart_items_list: itemsList,
      
      // Identificação
      customer_identifier: customerIdentifier,
      
      // Mensagem de confirmação
      message: `✅ ${product.name} adicionado! Total: R$ ${total.toFixed(2).replace('.', ',')}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Manychat Webhook] Error:', error);
    
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      message: 'Erro ao processar pedido',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});