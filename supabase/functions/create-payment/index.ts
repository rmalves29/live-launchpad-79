import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id, cartItems, customerData, addressData, shippingCost, shippingData, total, coupon_discount, tenant_id } = await req.json();

    console.log('Creating payment with data:', { order_id, cartItems, customerData, addressData, shippingCost, shippingData, total, coupon_discount, tenant_id });

    // Initialize Supabase client first
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tenant information and MP integration
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        tenant_key,
        integration_mp (
          access_token
        )
      `)
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenantData?.tenant_key) {
      console.error('Error fetching tenant:', tenantError);
      return new Response(
        JSON.stringify({ error: 'Tenant não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantKey = tenantData.tenant_key;

    // Use tenant-specific access token if available, otherwise fallback to global
    const mpAccessToken = tenantData.integration_mp?.access_token || Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
      console.error('MP_ACCESS_TOKEN not found for tenant');
      return new Response(
        JSON.stringify({ error: 'Mercado Pago não configurado para este tenant' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save or update customer with address data
    try {
      const customerUpdateData: any = {
        name: customerData.name,
        phone: customerData.phone,
        tenant_id: tenant_id,
        updated_at: new Date().toISOString()
      };
      
      // Add address data if provided
      if (addressData) {
        customerUpdateData.cep = addressData.cep;
        customerUpdateData.street = addressData.street;
        customerUpdateData.number = addressData.number;
        customerUpdateData.complement = addressData.complement || '';
        customerUpdateData.city = addressData.city;
        customerUpdateData.state = addressData.state;
      }
      
      const { error: customerError } = await supabase
        .from('customers')
        .upsert(customerUpdateData, {
          onConflict: 'tenant_id,phone',
          ignoreDuplicates: false
        });
        
      if (customerError) {
        console.error('Error updating customer:', customerError);
      } else {
        console.log('Customer address updated successfully');
      }
    } catch (error) {
      console.error('Error saving customer data:', error);
    }

    // Create items for MercadoPago with coupon discount applied to products only
    const subtotalProducts = (cartItems || []).reduce((sum: number, item: any) => sum + Number(item.unit_price) * Number(item.qty), 0);
    const discountAmount = Math.min(Number(coupon_discount || 0), subtotalProducts);
    const targetProductsTotal = Math.max(0, subtotalProducts - discountAmount);
    const factor = subtotalProducts > 0 ? targetProductsTotal / subtotalProducts : 1;

    let items = (cartItems || []).map((item: any) => ({
      title: item.product_name || `${item.product_code} Produto`,
      quantity: Number(item.qty),
      unit_price: parseFloat((Number(item.unit_price) * factor).toFixed(2)),
      currency_id: 'BRL'
    }));

    // Fix rounding differences by adjusting the last product unit_price if necessary
    const currentProductsTotal = items.reduce((sum: number, it: any) => sum + it.unit_price * it.quantity, 0);
    let diff = parseFloat((targetProductsTotal - currentProductsTotal).toFixed(2));
    if (items.length > 0 && Math.abs(diff) >= 0.01) {
      const last = items[items.length - 1];
      const perUnitAdjustment = parseFloat((diff / last.quantity).toFixed(2));
      last.unit_price = parseFloat((last.unit_price + perUnitAdjustment).toFixed(2));
    }

    // Add shipping as item if cost > 0
    if (Number(shippingCost) > 0) {
      items.push({
        title: 'Frete',
        quantity: 1,
        unit_price: parseFloat(Number(shippingCost).toFixed(2)),
        currency_id: 'BRL'
      });
    }

    // Remove zero-priced items (Mercado Pago não aceita unit_price = 0)
    items = items.filter((it: any) => Number(it.unit_price) > 0);

    // Valor final após desconto e frete
    const finalAmount = parseFloat(
      items.reduce((sum: number, it: any) => sum + Number(it.unit_price) * Number(it.quantity), 0).toFixed(2)
    );

    // Se foi passado um order_id específico, usar esse pedido
    let existingOrder = null;
    let existingOrders = null;
    const today = new Date().toISOString().split('T')[0];
    
    if (order_id) {
      const { data: specificOrder, error: specificOrderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .eq('tenant_id', tenant_id)
        .single();
      
      if (specificOrderError) {
        console.error('Error finding specific order:', specificOrderError);
      } else {
        existingOrder = specificOrder;
        console.log('Using specific order:', existingOrder.id);
      }
    }
    
    // Se não foi passado order_id ou não foi encontrado, verificar pedidos existentes do cliente no mesmo dia
    if (!existingOrder) {
      const { data: ordersData, error: orderSearchError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_phone', customerData.phone)
        .eq('event_date', today)
        .eq('is_paid', false)
        .order('created_at', { ascending: false });

      if (orderSearchError) {
        console.error('Error searching for existing order:', orderSearchError);
      }

      existingOrders = ordersData;
      existingOrder = existingOrders && existingOrders.length > 0 ? existingOrders[0] : null;
    }

    
    // Se não for um pedido específico e houver múltiplos pedidos não pagos do mesmo dia, consolidar em um só
    if (!order_id && existingOrders && existingOrders.length > 1) {
      const mainOrder = existingOrders[0];
      const ordersToMerge = existingOrders.slice(1);
      
      // Consolidar carrinho se existir
      for (const order of ordersToMerge) {
        if (order.cart_id && order.cart_id !== mainOrder.cart_id) {
          // Move cart items to main cart
          if (mainOrder.cart_id) {
            await supabase
              .from('cart_items')
              .update({ cart_id: mainOrder.cart_id })
              .eq('cart_id', order.cart_id);
          }
          
          // Delete old cart
          await supabase
            .from('carts')
            .delete()
            .eq('id', order.cart_id);
        }
        
        // Delete duplicate order
        await supabase
          .from('orders')
          .delete()
          .eq('id', order.id);
      }
      
      // Update main order total
      if (mainOrder.cart_id) {
        const { data: cartItems } = await supabase
          .from('cart_items')
          .select('qty, unit_price')
          .eq('cart_id', mainOrder.cart_id);
        
        const total = (cartItems || []).reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
        
        await supabase
          .from('orders')
          .update({ total_amount: total })
          .eq('id', mainOrder.id);
      }
    }

    // Se total final for zero, cria ou atualiza pedido gratuito e não chama o Mercado Pago
    if (finalAmount <= 0) {
      try {
        if (existingOrder) {
          // Atualiza pedido existente
          const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .update({
              total_amount: 0,
              payment_link: null,
              is_paid: true
            })
            .eq('id', existingOrder.id)
            .select()
            .single();

          if (orderError) {
            console.error('Error updating free order:', orderError);
          } else {
            console.log('Free order updated successfully:', orderData);
          }
        } else {
          // Cria novo pedido
          const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert({
              tenant_id: tenant_id,
              customer_phone: customerData.phone,
              event_type: 'BAZAR',
              event_date: today,
              total_amount: 0,
              payment_link: null,
              is_paid: true
            })
            .select()
            .single();

          if (orderError) {
            console.error('Error saving free order:', orderError);
          } else {
            console.log('Free order saved successfully:', orderData);
          }
        }
      } catch (error) {
        console.error('Error saving free order:', error);
      }

      return new Response(
        JSON.stringify({ free_order: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure we have an order id to tie back via external_reference
    let orderId = existingOrder?.id as number | undefined;
    if (!orderId) {
      const { data: newOrder, error: newOrderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenant_id,
          customer_phone: customerData.phone,
          customer_name: customerData.name,
          customer_cep: addressData?.cep,
          customer_street: addressData?.street,
          customer_number: addressData?.number,
          customer_complement: addressData?.complement,
          customer_city: addressData?.city,
          customer_state: addressData?.state,
          event_type: 'BAZAR',
          event_date: today,
          total_amount: parseFloat(total),
          payment_link: null,
          is_paid: false
        })
        .select()
        .single();
      if (newOrderError) {
        console.error('Error creating order before preference:', newOrderError);
        return new Response(
          JSON.stringify({ error: 'Falha ao criar pedido' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      orderId = newOrder!.id;
    }

    const preference = {
      items: items,
      payer: {
        name: customerData.name,
        email: `${customerData.phone}@checkout.com`,
        phone: {
          area_code: customerData.phone?.substring(2, 4) || '',
          number: customerData.phone?.substring(4) || ''
        },
        address: {
          zip_code: addressData.cep?.replace(/\D/g, '') || '',
          street_name: addressData.street || '',
          street_number: addressData.number || ''
        }
      },
      back_urls: {
        success: `${Deno.env.get('PUBLIC_BASE_URL') || 'https://live-launchpad-79.lovable.app'}/mp/return?status=success`,
        failure: `${Deno.env.get('PUBLIC_BASE_URL') || 'https://live-launchpad-79.lovable.app'}/mp/return?status=failure`,
        pending: `${Deno.env.get('PUBLIC_BASE_URL') || 'https://live-launchpad-79.lovable.app'}/mp/return?status=pending`
      },
      notification_url: `https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/mercadopago-webhook/${tenantKey}`,
      external_reference: String(orderId),
      auto_return: 'approved',
      binary_mode: true,
      statement_descriptor: 'MANIA DEMULHER'
    };

    console.log('Creating MP preference:', JSON.stringify(preference, null, 2));

    // Create preference in MercadoPago
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preference)
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text();
      console.error('MercadoPago API error:', mpResponse.status, errorData);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar preferência no MercadoPago', details: errorData }),
        { status: mpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mpData = await mpResponse.json();
    console.log('MP Response:', mpData);

    // Save or update order in database with shipping information
    try {
      const targetId = (existingOrder?.id ?? orderId)!;
      
      // Preparar dados para atualizar o pedido
      const updateData: any = {
        total_amount: parseFloat(total),
        payment_link: mpData.init_point,
        is_paid: false,
        customer_name: customerData.name,
        customer_cep: addressData?.cep,
        customer_street: addressData?.street,
        customer_number: addressData?.number,
        customer_complement: addressData?.complement,
        customer_city: addressData?.city,
        customer_state: addressData?.state
      };
      
      // Se há informações de frete, salvar no campo observation ou criar um campo específico
      if (shippingData) {
        const shippingInfo = `Frete: ${shippingData.company_name} - ${shippingData.service_name} - R$ ${shippingData.price.toFixed(2)} - ${shippingData.delivery_time} dias`;
        updateData.observation = existingOrder?.observation ? 
          `${existingOrder.observation}\n${shippingInfo}` : 
          shippingInfo;
      } else if (Number(shippingCost) === 0) {
        updateData.observation = existingOrder?.observation ? 
          `${existingOrder.observation}\nFrete: Retirada no local` : 
          'Frete: Retirada no local';
      }
      
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', targetId)
        .select()
        .single();

      
      // Salvar informações detalhadas do frete na tabela frete_cotacoes se disponível
      if (shippingData && shippingData.price > 0) {
        try {
          await supabase
            .from('frete_cotacoes')
            .insert({
              pedido_id: targetId,
              cep_destino: addressData?.cep,
              peso: 0.3, // Peso padrão
              largura: 16, // Dimensões padrão
              altura: 2,
              comprimento: 20,
              valor_declarado: parseFloat(total),
              valor_frete: shippingData.price,
              servico_escolhido: shippingData.service_name,
              transportadora: shippingData.company_name,
              prazo: shippingData.delivery_time,
              raw_response: shippingData
            });
          console.log('Shipping info saved to frete_cotacoes');
        } catch (freightError) {
          console.error('Error saving freight info:', freightError);
        }
      }
    } catch (error) {
      console.error('Error saving order:', error);
    }

    return new Response(
      JSON.stringify({ 
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        preference_id: mpData.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-payment function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});