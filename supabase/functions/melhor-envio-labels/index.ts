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

      // Get freight quotation
      const { data: cotacaoData, error: cotacaoError } = await supabase
        .from('frete_cotacoes')
        .select('*')
        .eq('pedido_id', order_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cotacaoError || !cotacaoData) {
        return new Response(
          JSON.stringify({ error: 'Cotação de frete não encontrada para este pedido' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Create shipment payload
      const shipmentPayload = {
        service: cotacaoData.raw_response?.service_id || 1,
        from: {
          name: configData.remetente_nome,
          phone: "1199999999", // You might want to add this to config
          email: "contato@empresa.com", // You might want to add this to config
          document: configData.remetente_documento,
          company_document: configData.remetente_documento,
          state_register: "123456789",
          postal_code: configData.cep_origem,
          address: configData.remetente_endereco_rua,
          number: configData.remetente_endereco_numero,
          complement: configData.remetente_endereco_comp || "",
          district: configData.remetente_bairro,
          city: configData.remetente_cidade,
          state_abbr: configData.remetente_uf,
          country_id: "BR"
        },
        to: {
          name: customerData?.name || "Cliente",
          phone: customer_phone,
          email: "cliente@email.com", // You might want to get this from customer data
          document: customerData?.cpf || "00000000000",
          postal_code: cotacaoData.cep_destino,
          address: customerData?.street || "Rua do Cliente",
          number: customerData?.number || "123",
          complement: customerData?.complement || "",
          district: customerData?.city || "Centro",
          city: customerData?.city || "São Paulo",
          state_abbr: customerData?.state || "SP",
          country_id: "BR"
        },
        products: [
          {
            name: "Produto",
            quantity: 1,
            unitary_value: orderData.total_amount,
            weight: cotacaoData.peso
          }
        ],
        volumes: [
          {
            height: cotacaoData.altura,
            width: cotacaoData.largura,
            length: cotacaoData.comprimento,
            weight: cotacaoData.peso
          }
        ],
        options: {
          insurance_value: cotacaoData.valor_declarado || orderData.total_amount,
          receipt: false,
          own_hand: false,
          reverse: false,
          non_commercial: false,
          invoice: {
            key: `NFE${orderData.id}${Date.now()}`
          }
        }
      };

      console.log('Creating shipment with payload:', JSON.stringify(shipmentPayload, null, 2));

      const response = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'FreteApp (contato@empresa.com)'
        },
        body: JSON.stringify(shipmentPayload)
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Shipment creation error:', response.status, errorData);
        
        return new Response(
          JSON.stringify({ 
            error: 'Erro ao criar envio',
            details: errorData 
          }),
          { 
            status: response.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const responseData = await response.json();
      console.log('Shipment created successfully:', responseData);

      return new Response(
        JSON.stringify({ 
          success: true,
          shipment_id: responseData[0]?.id,
          data: responseData
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