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

// Tenant autorizado (Mania de Mulher)
const MANIA_DE_MULHER_TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622';

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
    // Formato esperado do Manychat External Request:
    // {
    //   "product_code": "ABC123",
    //   "instagram_username": "@usuario",
    //   "subscriber_id": "12345",
    //   "first_name": "Nome",
    //   "phone": "5511999999999" (opcional)
    // }
    const {
      product_code,
      instagram_username,
      subscriber_id,
      first_name,
      phone,
      comment_text, // Texto do comentário original (opcional)
    } = body;

    // Validação básica
    if (!product_code) {
      console.log('[Manychat Webhook] Código do produto não fornecido');
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
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', MANIA_DE_MULHER_TENANT_ID)
      .ilike('code', `%${normalizedCode}%`)
      .eq('is_active', true)
      .maybeSingle();

    if (productError) {
      console.error('[Manychat Webhook] Erro ao buscar produto:', productError);
      throw productError;
    }

    if (!product) {
      console.log('[Manychat Webhook] Produto não encontrado:', normalizedCode);
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

    // Identificador do cliente (Instagram username ou subscriber_id)
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
      // Criar novo carrinho
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
      // Incrementar quantidade
      itemQty = existingItem.qty + 1;
      await supabase
        .from('cart_items')
        .update({ qty: itemQty })
        .eq('id', existingItem.id);
      console.log('[Manychat Webhook] Item incrementado:', product.code, 'qty:', itemQty);
    } else {
      // Adicionar novo item
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
