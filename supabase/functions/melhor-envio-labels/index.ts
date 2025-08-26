import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, shipment_id, customer_phone } = await req.json();
    
    console.log('Labels action:', action);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get configuration
    const { data: configData, error: configError } = await supabase
      .from('frete_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !configData) {
      return new Response(
        JSON.stringify({ error: 'Configuração de frete não encontrada' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!configData.access_token) {
      return new Response(
        JSON.stringify({ error: 'Token de acesso não configurado' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const baseUrl = configData.api_base_url;
    const accessToken = configData.access_token;

    if (action === 'create_shipment') {
      if (!order_id || !customer_phone) {
        return new Response(
          JSON.stringify({ error: 'order_id e customer_phone são obrigatórios' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (orderError || !orderData) {
        return new Response(
          JSON.stringify({ error: 'Pedido não encontrado' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get customer details (you might need to adapt this based on your customer data structure)
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', customer_phone)
        .limit(1)
        .single();

      // Get freight quotation or use default values
      const { data: cotacaoData } = await supabase
        .from('frete_cotacoes')
        .select('*')
        .eq('pedido_id', order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Get app settings for default dimensions and weight
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      // Use cotacao data if available, otherwise use app settings defaults
      const freight = cotacaoData || {
        cep_destino: customerData?.cep || '01000000',
        peso: appSettings?.default_weight_kg || 0.3,
        altura: appSettings?.default_height_cm || 2,
        largura: appSettings?.default_width_cm || 16,
        comprimento: appSettings?.default_length_cm || 20,
        valor_declarado: orderData.total_amount,
        raw_response: { service_id: 1 } // Default PAC service
      };

      // Create cart payload following Melhor Envio documentation
      const cartPayload = {
        service: freight.raw_response?.service_id || 1,
        from: {
          name: configData.remetente_nome || "Remetente",
          company_document: configData.remetente_documento || "00000000000",
          phone: configData.remetente_telefone || "1199999999",
          email: configData.remetente_email || "contato@empresa.com",
          address: configData.remetente_endereco_rua || "Rua do Remetente",
          number: configData.remetente_endereco_numero || "123",
          complement: configData.remetente_endereco_comp || "",
          district: configData.remetente_bairro || "Centro",
          city: configData.remetente_cidade || "Belo Horizonte",
          state_abbr: configData.remetente_uf || "MG",
          country_id: "BR",
          postal_code: configData.cep_origem || "31575060"
        },
        to: {
          name: customerData?.name || "Cliente",
          document: customerData?.cpf || "00000000000",
          phone: customer_phone,
          email: customerData?.email || "cliente@email.com",
          address: customerData?.street || "Rua do Cliente",
          number: customerData?.number || "123",
          complement: customerData?.complement || "",
          district: customerData?.neighborhood || "Centro",
          city: customerData?.city || "São Paulo",
          state_abbr: customerData?.state || "SP",
          country_id: "BR",
          postal_code: freight.cep_destino || customerData?.cep || "01000000"
        },
        volumes: [
          {
            height: freight.altura || 4,
            width: freight.largura || 12,
            length: freight.comprimento || 17,
            weight: freight.peso || 0.3
          }
        ],
        options: {
          insurance_value: freight.valor_declarado || orderData.total_amount,
          receipt: false,
          own_hand: false,
          non_commercial: true, // Using true to avoid invoice key requirement for now
          platform: "SeuSistema",
          tags: [
            { 
              tag: `PEDIDO-${orderData.id}`, 
              url: `https://app/pedido/${orderData.id}` 
            }
          ]
        }
      };

      console.log('Adding to cart with payload:', JSON.stringify(cartPayload, null, 2));

      // Step 1: Add to cart
      const cartResponse = await fetch(`${baseUrl}/v2/me/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        },
        body: JSON.stringify(cartPayload)
      });

      if (!cartResponse.ok) {
        const errorData = await cartResponse.text();
        console.error('Cart creation error:', cartResponse.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao adicionar ao carrinho',
            details: errorData 
          }),
          { 
            status: cartResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const cartData = await cartResponse.json();
      console.log('Added to cart successfully:', cartData);
      
      const cartId = cartData.id;
      
      // Step 2: Checkout (purchase)
      console.log('Processing checkout for cart ID:', cartId);
      
      const checkoutResponse = await fetch(`${baseUrl}/v2/me/shipment/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        },
        body: JSON.stringify({ orders: [cartId] })
      });

      if (!checkoutResponse.ok) {
        const errorData = await checkoutResponse.text();
        console.error('Checkout error:', checkoutResponse.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro no checkout',
            details: errorData 
          }),
          { 
            status: checkoutResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const checkoutData = await checkoutResponse.json();
      console.log('Checkout completed successfully:', checkoutData);
      
      const shipmentId = checkoutData.purchase?.id;
      
      // Step 3: Generate label
      if (shipmentId) {
        console.log('Generating label for shipment ID:', shipmentId);
        
        const generateResponse = await fetch(`${baseUrl}/v2/me/shipment/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'FreteApp (contato@empresa.com)'
          },
          body: JSON.stringify({ orders: [shipmentId] })
        });

        if (!generateResponse.ok) {
          console.error('Label generation error:', generateResponse.status, await generateResponse.text());
        } else {
          const generateData = await generateResponse.json();
          console.log('Label generated successfully:', generateData);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          cart_id: cartId,
          shipment_id: shipmentId,
          data: {
            cart: cartData,
            checkout: checkoutData
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'pay_shipment') {
      if (!shipment_id) {
        return new Response(
          JSON.stringify({ error: 'shipment_id é obrigatório' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Paying shipment:', shipment_id);

      const response = await fetch(`${baseUrl}/v2/me/shipment/${shipment_id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Shipment payment error:', response.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao pagar envio',
            details: errorData 
          }),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const responseData = await response.json();
      console.log('Shipment paid successfully:', responseData);

      return new Response(
        JSON.stringify({ 
          success: true,
          data: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'download_label') {
      if (!shipment_id) {
        return new Response(
          JSON.stringify({ error: 'shipment_id é obrigatório' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Getting label for shipment:', shipment_id);

      const response = await fetch(`${baseUrl}/v2/me/shipment/${shipment_id}/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Label download error:', response.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao obter etiqueta',
            details: errorData 
          }),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const responseData = await response.json();
      console.log('Label URL obtained:', responseData);

      return new Response(
        JSON.stringify({ 
          success: true,
          label_url: responseData.url,
          data: responseData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in melhor-envio-labels function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});