import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessMessageRequest {
  tenant_id: string;
  customer_phone: string;
  message: string;
  group_name?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ProcessMessageRequest = await req.json();
    const { tenant_id, customer_phone, message, group_name } = body;

    console.log('📱 Processing message from:', customer_phone, 'Message:', message);

    // Regex para detectar códigos de produtos (C seguido de números)
    const productCodeRegex = /C(\d+)/gi;
    const matches = message.matchAll(productCodeRegex);
    const codes: string[] = [];
    
    for (const match of matches) {
      codes.push(match[0].toUpperCase()); // C101, C202, etc
    }

    if (codes.length === 0) {
      console.log('❌ Nenhum código de produto detectado na mensagem');
      return new Response(
        JSON.stringify({ message: 'Nenhum código de produto detectado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Códigos detectados:', codes);

    // Normalizar telefone (remover caracteres especiais)
    const phoneClean = customer_phone.replace(/\D/g, '');
    const phoneNormalized = phoneClean.startsWith('55') ? phoneClean.substring(2) : phoneClean;

    // Processar cada código detectado
    const results = [];
    for (const code of codes) {
      console.log(`🔎 Buscando produto com código: ${code}`);

      // Buscar produto no banco
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('code', code)
        .eq('is_active', true)
        .maybeSingle();

      if (productError || !product) {
        console.error(`❌ Produto ${code} não encontrado:`, productError);
        results.push({ code, success: false, error: 'Produto não encontrado' });
        continue;
      }

      console.log(`✅ Produto encontrado: ${product.name} (${product.code})`);

      // Verificar estoque
      if (product.stock <= 0) {
        console.error(`❌ Produto ${code} sem estoque`);
        results.push({ code, success: false, error: 'Produto sem estoque' });
        continue;
      }

      // Obter data atual (Brasília timezone)
      const today = new Date().toISOString().split('T')[0];

      // Buscar ou criar pedido
      let orderId: number;
      let cartId: number | null = null;
      let orderTotal = 0;

      // Buscar pedido existente não pago
      const { data: existingOrders, error: orderSearchError } = await supabase
        .from('orders')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('customer_phone', phoneNormalized)
        .eq('event_date', today)
        .eq('is_paid', false)
        .order('created_at', { ascending: false })
        .limit(1);

      if (orderSearchError) {
        console.error('Erro ao buscar pedido:', orderSearchError);
        results.push({ code, success: false, error: 'Erro ao buscar pedido' });
        continue;
      }

      const qty = 1; // Quantidade padrão
      const subtotal = product.price * qty;

      if (existingOrders && existingOrders.length > 0) {
        // Usar pedido existente
        const existingOrder = existingOrders[0];
        orderId = existingOrder.id;
        cartId = existingOrder.cart_id;
        orderTotal = existingOrder.total_amount + subtotal;

        // Atualizar total do pedido
        const { error: updateError } = await supabase
          .from('orders')
          .update({ total_amount: orderTotal })
          .eq('id', orderId);

        if (updateError) {
          console.error('Erro ao atualizar pedido:', updateError);
          results.push({ code, success: false, error: 'Erro ao atualizar pedido' });
          continue;
        }

        console.log(`📝 Pedido existente atualizado: ${orderId}`);
      } else {
        // Criar novo pedido
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert([{
            tenant_id,
            customer_phone: phoneNormalized,
            event_type: group_name ? 'GRUPO' : 'WHATSAPP',
            event_date: today,
            total_amount: subtotal,
            is_paid: false,
            whatsapp_group_name: group_name || null
          }])
          .select()
          .single();

        if (orderError) {
          console.error('Erro ao criar pedido:', orderError);
          results.push({ code, success: false, error: 'Erro ao criar pedido' });
          continue;
        }

        orderId = newOrder.id;
        orderTotal = subtotal;
        console.log(`📝 Novo pedido criado: ${orderId}`);
      }

      // Criar carrinho se não existir
      if (!cartId) {
        const { data: newCart, error: cartError } = await supabase
          .from('carts')
          .insert({
            tenant_id,
            customer_phone: phoneNormalized,
            event_type: group_name ? 'GRUPO' : 'WHATSAPP',
            event_date: today,
            status: 'OPEN',
            whatsapp_group_name: group_name || null
          })
          .select()
          .single();

        if (cartError) {
          console.error('Erro ao criar carrinho:', cartError);
          results.push({ code, success: false, error: 'Erro ao criar carrinho' });
          continue;
        }

        cartId = newCart.id;

        // Atualizar pedido com cart_id
        await supabase
          .from('orders')
          .update({ cart_id: cartId })
          .eq('id', orderId);

        console.log(`🛒 Carrinho criado: ${cartId}`);
      }

      // Verificar se o produto já está no carrinho
      const { data: existingCartItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cartId)
        .eq('product_id', product.id)
        .maybeSingle();

      if (existingCartItem) {
        // Atualizar quantidade do item existente
        const { error: updateCartError } = await supabase
          .from('cart_items')
          .update({
            qty: existingCartItem.qty + qty,
            unit_price: product.price
          })
          .eq('id', existingCartItem.id);

        if (updateCartError) {
          console.error('Erro ao atualizar item do carrinho:', updateCartError);
          results.push({ code, success: false, error: 'Erro ao atualizar carrinho' });
          continue;
        }

        console.log(`🛒 Item do carrinho atualizado`);
      } else {
        // Adicionar novo item ao carrinho
        const { error: cartItemError } = await supabase
          .from('cart_items')
          .insert({
            tenant_id,
            cart_id: cartId,
            product_id: product.id,
            qty: qty,
            unit_price: product.price
          });

        if (cartItemError) {
          console.error('Erro ao adicionar item ao carrinho:', cartItemError);
          results.push({ code, success: false, error: 'Erro ao adicionar ao carrinho' });
          continue;
        }

        console.log(`🛒 Item adicionado ao carrinho`);
      }

      // Atualizar estoque do produto
      const { error: stockError } = await supabase
        .from('products')
        .update({ stock: product.stock - qty })
        .eq('id', product.id);

      if (stockError) {
        console.error('Erro ao atualizar estoque:', stockError);
        // Não bloquear o fluxo por erro de estoque
      }

      // Chamar edge function para enviar mensagem WhatsApp
      try {
        const sendMessageResponse = await supabase.functions.invoke('whatsapp-send-item-added', {
          body: {
            tenant_id,
            customer_phone: phoneNormalized,
            product_name: product.name,
            product_code: product.code,
            quantity: qty,
            unit_price: product.price
          }
        });

        if (sendMessageResponse.error) {
          console.error('Erro ao enviar mensagem WhatsApp:', sendMessageResponse.error);
        } else {
          console.log('✅ Mensagem WhatsApp enviada com sucesso');
        }
      } catch (error) {
        console.error('Erro ao chamar função de envio de WhatsApp:', error);
      }

      results.push({
        code,
        success: true,
        product: product.name,
        orderId,
        quantity: qty,
        total: subtotal
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${codes.length} código(s) processado(s)`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
