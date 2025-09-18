import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

// Utils: sanitização
function onlyDigits(v: string | number | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '');
}

// Auto-refresh token if expires in < 60 seconds
async function ensureValidToken(supabase: any, integration: any) {
  if (!integration.access_token) {
    throw new Error('Token de acesso não configurado');
  }

  const now = Date.now();
  const expiresAt = integration.updated_at ? new Date(integration.updated_at).getTime() + (3600 * 1000) : 0; // Assume 1h if no expires_at
  const timeUntilExpiry = expiresAt - now;
  
  // If token expires in less than 60 seconds, refresh it
  if (timeUntilExpiry < 60000) {
    console.log('Token expires soon, refreshing...');
    
    if (!integration.refresh_token) {
      throw new Error('Refresh token ausente. Reautorize a integração ME no painel de Integrações.');
    }
    
    if (!integration.client_id || !integration.client_secret) {
      throw new Error('Client ID/Secret do ME ausentes. Configure nas Integrações.');
    }

    // Determine correct OAuth URL based on environment
    const isProduction = integration.environment === 'production';
    const authBase = isProduction 
      ? 'https://melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';
    
    // Use Basic auth and form-urlencoded as ME requires
    const basic = btoa(`${integration.client_id}:${integration.client_secret}`);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token
    });

    console.log(`Refreshing token at: ${authBase}/oauth/token`);

    const refreshResponse = await fetch(`${authBase}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
      },
      body: body.toString()
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { raw: errorText };
      }
      console.error('Token refresh failed:', refreshResponse.status, errorData);
      throw new Error(`Falha ao renovar token (${refreshResponse.status}): ${JSON.stringify(errorData)}. Reautorize a integração ME.`);
    }

    const refreshData = await refreshResponse.json();
    const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000);

    // CRITICAL: Save the NEW refresh_token (ME rotates them)
    const { error: updateError } = await supabase
      .from('integration_me')
      .update({
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token, // Always save the new one!
        updated_at: newExpiresAt.toISOString()
      })
      .eq('id', integration.id);

    if (updateError) {
      console.error('Error saving refreshed token:', updateError);
      throw new Error('Erro ao salvar novo token: ' + updateError.message);
    }

    console.log('Token refreshed successfully');
    return refreshData.access_token;
  }

  return integration.access_token;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, order_id, tenant_id } = await req.json();
    
    console.log('ME Labels action:', action, 'order_id:', order_id, 'tenant_id:', tenant_id);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tenant and ME integration
    const { data: integration, error: integrationError } = await supabase
      .from('integration_me')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (integrationError) {
      console.error('Integration query error:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar integração ME: ' + integrationError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ 
          error: 'Integração Melhor Envio não encontrada',
          details: 'Configure a integração ME no painel de Integrações'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.refresh_token) {
      return new Response(
        JSON.stringify({ 
          error: 'Integração ME não autorizada',
          details: 'Acesse o painel de Integrações e complete a autorização OAuth do Melhor Envio'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure valid token
    const accessToken = await ensureValidToken(supabase, integration);
    
    // Determine API URLs
    const isProduction = integration.environment === 'production';
    const baseUrl = isProduction 
      ? 'https://api.melhorenvio.com'
      : 'https://sandbox.melhorenvio.com.br/api';

    if (action === 'create_shipment') {
      // Check for existing shipment (idempotency)
      const { data: existingShipment } = await supabase
        .from('frete_envios')
        .select('*')
        .eq('pedido_id', order_id)
        .single();

      if (existingShipment && existingShipment.shipment_id) {
        console.log('Shipment already exists:', existingShipment.shipment_id);
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Envio já existe',
            shipment: existingShipment
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get order details
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .eq('tenant_id', tenant_id)
        .single();

      if (orderError || !order) {
        return new Response(
          JSON.stringify({ error: 'Pedido não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get app settings for dimensions
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      // Validate order data
      if (!order.customer_name || !order.customer_cep || !order.customer_street || !order.customer_city) {
        return new Response(
          JSON.stringify({ 
            error: 'Dados de endereço do cliente incompletos',
            details: 'Nome, CEP, rua e cidade são obrigatórios'
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // STEP 1: Quote services (cotação)
      const quotePayload = {
        from: { postal_code: onlyDigits(integration.from_cep) },
        to: { postal_code: onlyDigits(order.customer_cep) },
        package: {
          weight: (appSettings?.default_weight_kg || 0.3),
          width: appSettings?.default_width_cm || 16,
          height: appSettings?.default_height_cm || 4,
          length: appSettings?.default_length_cm || 24
        }
      };

      console.log('Step 1: Quoting services with:', quotePayload);

      const quoteResponse = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
        },
        body: JSON.stringify(quotePayload)
      });

      if (!quoteResponse.ok) {
        const errorData = await quoteResponse.text();
        console.error('Quote error:', quoteResponse.status, errorData);
        
        // Log error to webhook_logs with request ID
        const requestId = quoteResponse.headers.get('x-request-id') || 'unknown';
        await supabase.from('webhook_logs').insert({
          tenant_id,
          webhook_type: 'melhor_envio_quote',
          status_code: quoteResponse.status,
          payload: quotePayload,
          response: errorData,
          error_message: 'Erro na cotação: ' + errorData,
          created_at: new Date().toISOString()
        });

        return new Response(
          JSON.stringify({ error: 'Erro na cotação', details: errorData }),
          { status: quoteResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const quoteData = await quoteResponse.json();
      console.log('Quote successful:', quoteData.length, 'services found');

      // Find available service (prefer SEDEX id=2, then PAC id=1)
      let selectedService = quoteData.find((s: any) => !s.error && s.id === 2); // SEDEX
      if (!selectedService) {
        selectedService = quoteData.find((s: any) => !s.error && s.id === 1); // PAC
      }
      if (!selectedService) {
        selectedService = quoteData.find((s: any) => !s.error); // Any available
      }

      if (!selectedService) {
        const errors = quoteData.map((s: any) => s.error).filter(Boolean);
        return new Response(
          JSON.stringify({ 
            error: 'Nenhum serviço disponível',
            details: errors.join('; ') 
          }),
          { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Selected service:', selectedService.id, selectedService.name);

      // STEP 2: Add to cart (payload mínimo conforme especificação)
      const cartPayload = {
        from: {
          name: integration.from_name,
          phone: onlyDigits(integration.from_phone),
          email: integration.from_email,
          address: {
            postal_code: onlyDigits(integration.from_cep),
            address: integration.from_address,
            number: integration.from_number || "S/N",
            complement: integration.from_complement || "",
            district: integration.from_district,
            city: integration.from_city,
            state_abbr: integration.from_state
          }
        },
        to: {
          name: order.customer_name,
          phone: onlyDigits(order.customer_phone),
          email: `${onlyDigits(order.customer_phone)}@checkout.com`,
          address: {
            postal_code: onlyDigits(order.customer_cep),
            address: order.customer_street,
            number: order.customer_number || "S/N",
            complement: order.customer_complement || "",
            district: order.customer_neighborhood || "Centro",
            city: order.customer_city,
            state_abbr: order.customer_state || "MG"
          }
        },
        service: selectedService.id,
        options: {
          insurance_value: parseFloat(order.total_amount?.toString() || '0'),
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: true,
          platform: "OrderZaps",
          tags: [{ 
            tag: `pedido_${order.id}`, 
            url: `https://app.orderzaps.com/pedidos/${order.id}` 
          }]
        },
        package: {
          weight: (appSettings?.default_weight_kg || 0.3),
          width: appSettings?.default_width_cm || 16,
          height: appSettings?.default_height_cm || 4,
          length: appSettings?.default_length_cm || 24
        }
      };

      console.log('Step 2: Adding to cart with:', JSON.stringify(cartPayload, null, 2));

      const cartResponse = await fetch(`${baseUrl}/v2/me/cart`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
        },
        body: JSON.stringify(cartPayload)
      });

      if (!cartResponse.ok) {
        const errorData = await cartResponse.text();
        console.error('Cart error:', cartResponse.status, errorData);
        
        // Handle 401 with retry
        if (cartResponse.status === 401) {
          console.log('Token invalid, trying to refresh and retry...');
          try {
            const newToken = await ensureValidToken(supabase, integration);
            // Retry the request with new token
            const retryResponse = await fetch(`${baseUrl}/v2/me/cart`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${newToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
              },
              body: JSON.stringify(cartPayload)
            });

            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              console.log('Retry successful after token refresh');
              // Continue with checkout...
              return await proceedWithCheckout(supabase, baseUrl, newToken, retryData.id, order_id, selectedService, tenant_id);
            }
          } catch (refreshError) {
            console.error('Refresh and retry failed:', refreshError);
          }
        }

        const requestId = cartResponse.headers.get('x-request-id') || 'unknown';
        await supabase.from('webhook_logs').insert({
          tenant_id,
          webhook_type: 'melhor_envio_cart',
          status_code: cartResponse.status,
          payload: cartPayload,
          response: errorData,
          error_message: 'Erro ao adicionar ao carrinho: ' + errorData,
          created_at: new Date().toISOString()
        });

        return new Response(
          JSON.stringify({ error: 'Erro ao adicionar ao carrinho', details: errorData }),
          { status: cartResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const cartData = await cartResponse.json();
      console.log('Added to cart:', cartData.id);

      // Continue with checkout
      return await proceedWithCheckout(supabase, baseUrl, accessToken, cartData.id, order_id, selectedService, tenant_id);

    } else if (action === 'generate_payment_link') {
      // Gerar link de pagamento para etiqueta já criada
      const { data: shipment } = await supabase
        .from('frete_envios')
        .select('*')
        .eq('pedido_id', order_id)
        .single();

      if (!shipment || !shipment.cart_id) {
        return new Response(
          JSON.stringify({ error: 'Envio não encontrado ou não adicionado ao carrinho' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Use Mercado Pago para gerar link de pagamento
      // TODO: Implementar integração com MP para pagamento de etiquetas

      return new Response(
        JSON.stringify({ 
          success: true,
          payment_link: `https://app.orderzaps.com/payment/shipping/${order_id}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'download_label') {
      // Download PDF da etiqueta
      const { data: shipment } = await supabase
        .from('frete_envios')
        .select('*')
        .eq('pedido_id', order_id)
        .single();

      if (!shipment || !shipment.shipment_id) {
        return new Response(
          JSON.stringify({ error: 'Envio não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const labelResponse = await fetch(`${baseUrl}/v2/me/shipment/labels?orders[]=${shipment.shipment_id}&format=pdf`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
        },
      });

      if (!labelResponse.ok) {
        const errorData = await labelResponse.text();
        return new Response(
          JSON.stringify({ error: 'Erro ao baixar etiqueta', details: errorData }),
          { status: labelResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const labelUrl = labelResponse.url;
      
      // Update shipment with label URL
      await supabase
        .from('frete_envios')
        .update({ label_url: labelUrl })
        .eq('id', shipment.id);

      return new Response(
        JSON.stringify({ success: true, label_url: labelUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'track_shipment') {
      // Rastrear envio
      const { data: shipment } = await supabase
        .from('frete_envios')
        .select('*')
        .eq('pedido_id', order_id)
        .single();

      if (!shipment || !shipment.shipment_id) {
        return new Response(
          JSON.stringify({ error: 'Envio não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const trackingResponse = await fetch(`${baseUrl}/v2/me/shipment/tracking/${shipment.shipment_id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
        },
      });

      if (!trackingResponse.ok) {
        const errorData = await trackingResponse.text();
        return new Response(
          JSON.stringify({ error: 'Erro ao rastrear envio', details: errorData }),
          { status: trackingResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const trackingData = await trackingResponse.json();
      
      // Update tracking info if available
      if (trackingData.tracking_code) {
        await supabase
          .from('frete_envios')
          .update({ 
            tracking_code: trackingData.tracking_code,
            status: trackingData.status || 'in_transit'
          })
          .eq('id', shipment.id);
      }

      return new Response(
        JSON.stringify({ success: true, tracking: trackingData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in melhor-envio-labels:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function for checkout process
async function proceedWithCheckout(supabase: any, baseUrl: string, accessToken: string, cartId: string, orderId: number, selectedService: any, tenantId: string) {
  console.log('Step 3: Checkout cart ID:', cartId);

  const checkoutPayload = { orders: [cartId] };
  
  const checkoutResponse = await fetch(`${baseUrl}/v2/me/shipment/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Lovable Platform (integracoes@lovable.dev)',
    },
    body: JSON.stringify(checkoutPayload)
  });

  // Save shipment info regardless of checkout result
  const shipmentData = {
    pedido_id: orderId,
    cart_id: cartId,
    service_price: selectedService.price,
    status: 'pending_payment',
    raw_response: { service: selectedService, cart_id: cartId }
  };

  if (!checkoutResponse.ok) {
    const checkoutError = await checkoutResponse.text();
    console.log('Checkout failed, but cart created:', checkoutError);
    
    shipmentData.status = 'cart_created';
    shipmentData.raw_response = { 
      ...shipmentData.raw_response, 
      checkout_error: checkoutError 
    };
    
    await supabase.from('frete_envios').upsert(shipmentData, { 
      onConflict: 'pedido_id' 
    });

    return new Response(JSON.stringify({
      success: true,
      message: 'Adicionado ao carrinho. Aguardando pagamento.',
      cart_id: cartId,
      service: selectedService,
      warning: 'Checkout falhou: ' + checkoutError
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }

  const checkoutData = await checkoutResponse.json();
  console.log('Checkout successful:', checkoutData);

  // Update with successful checkout
  shipmentData.status = 'paid';
  shipmentData.raw_response = { 
    ...shipmentData.raw_response, 
    checkout: checkoutData 
  };

  if (checkoutData.purchase?.orders?.[0]) {
    shipmentData.shipment_id = checkoutData.purchase.orders[0].id;
    shipmentData.tracking_code = checkoutData.purchase.orders[0].tracking;
  }

  await supabase.from('frete_envios').upsert(shipmentData, { 
    onConflict: 'pedido_id' 
  });

  return new Response(JSON.stringify({
    success: true,
    message: 'Etiqueta comprada com sucesso!',
    shipment: shipmentData,
    checkout: checkoutData
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}