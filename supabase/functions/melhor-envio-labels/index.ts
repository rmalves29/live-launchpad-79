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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const body = await req.json().catch(() => ({}));
    const { action, order_id, tenant_id } = body;

    console.log('🏷️ Melhor Envio Labels:', { action, order_id, tenant_id });

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar integração do Melhor Envio para o tenant
    let { data: integration, error: integrationError } = await supabase
      .from('shipping_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'melhor_envio')
      .eq('is_active', true)
      .maybeSingle();

    // Se não encontrou integração específica do tenant, buscar global
    if (!integration && !integrationError) {
      const { data: globalIntegration, error: globalError } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('tenant_id', null)
        .eq('provider', 'melhor_envio')
        .eq('is_active', true)
        .maybeSingle();
      
      if (globalError) {
        console.error('❌ Erro ao buscar integração global:', globalError);
      } else {
        integration = globalIntegration;
      }
    }

    if (integrationError) {
      console.error('❌ Erro ao buscar integração:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar integração' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ error: 'Integração ME não encontrada para este tenant' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ error: 'Integração ME não autorizada - token não encontrado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar URL base (sandbox ou produção)
    const baseUrl = integration.sandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
    
    console.log('🌐 Configuração:', {
      isSandbox: integration.sandbox,
      baseUrl,
      hasToken: !!integration.access_token,
      action
    });

    // Processar ação específica
    switch (action) {
      case 'create_shipment':
        return await createShipment(supabase, integration, baseUrl, order_id, tenant_id);
      
      case 'buy_shipment':
        return await buyShipment(integration, baseUrl, body.shipment_id);
      
      case 'get_label':
        return await getLabel(integration, baseUrl, body.shipment_id);
      
      case 'track_shipment':
        return await trackShipment(integration, baseUrl, body.tracking_code);
      
      default:
        return new Response(
          JSON.stringify({ error: 'Ação não suportada', supported_actions: ['create_shipment', 'buy_shipment', 'get_label', 'track_shipment'] }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ Erro na função de labels:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno no processamento de etiquetas' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Função para criar remessa
async function createShipment(supabase: any, integration: any, baseUrl: string, orderId: string, tenantId: string) {
  try {
    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (orderError || !order) {
      throw new Error('Pedido não encontrado');
    }

    // Aqui você implementaria a lógica para criar a remessa no Melhor Envio
    // Usando os dados do pedido e a API do Melhor Envio
    
    console.log('📦 Criando remessa para pedido:', orderId);
    
    // Exemplo de payload para criar remessa (adapte conforme sua necessidade)
    const shipmentData = {
      service: 1, // ID do serviço (ex: PAC = 1, SEDEX = 2)
      from: {
        name: "Remetente",
        phone: "11999999999",
        email: "contato@empresa.com",
        document: "12345678901",
        company_document: "12345678000123",
        state_register: "123456789",
        address: integration.from_cep || "31575060",
        complement: "",
        number: "123",
        district: "Centro",
        city: "Belo Horizonte",
        state_abbr: "MG",
        country_id: "BR",
        postal_code: integration.from_cep || "31575060"
      },
      to: {
        name: order.customer_name || "Cliente",
        phone: order.customer_phone || "11999999999",  
        email: "cliente@email.com",
        document: "12345678901",
        address: order.customer_street || "Rua do Cliente",
        complement: order.customer_complement || "",
        number: order.customer_number || "123",
        district: "Centro",
        city: order.customer_city || "São Paulo",
        state_abbr: order.customer_state || "SP",
        country_id: "BR",
        postal_code: order.customer_cep || "01310100"
      },
      products: [
        {
          name: "Produto",
          quantity: 1,
          unitary_value: parseFloat(order.total_amount || "0")
        }
      ],
      volumes: [
        {
          height: 4,
          width: 16,
          length: 24,
          weight: 0.3
        }
      ],
      options: {
        insurance_value: parseFloat(order.total_amount || "0"),
        receipt: false,
        own_hand: false
      }
    };

    const response = await fetch(`${baseUrl}/api/v2/me/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      },
      body: JSON.stringify(shipmentData)
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ Erro na API do Melhor Envio:', result);
      throw new Error(result.message || 'Erro ao criar remessa');
    }

    console.log('✅ Remessa criada:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        shipment: result,
        message: 'Remessa criada com sucesso'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao criar remessa:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao criar remessa: ' + error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Função para comprar remessa
async function buyShipment(integration: any, baseUrl: string, shipmentId: string) {
  try {
    const response = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      },
      body: JSON.stringify({
        orders: [shipmentId]
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Erro ao comprar remessa');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        purchase: result,
        message: 'Remessa comprada com sucesso'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao comprar remessa:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao comprar remessa: ' + error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Função para obter etiqueta
async function getLabel(integration: any, baseUrl: string, shipmentId: string) {
  try {
    const response = await fetch(`${baseUrl}/api/v2/me/shipment/print?orders[]=${shipmentId}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      }
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Erro ao gerar etiqueta');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        label: result,
        message: 'Etiqueta gerada com sucesso'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao gerar etiqueta:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao gerar etiqueta: ' + error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Função para rastrear remessa
async function trackShipment(integration: any, baseUrl: string, trackingCode: string) {
  try {
    const response = await fetch(`${baseUrl}/api/v2/me/shipment/tracking?orders[]=${trackingCode}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      }
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Erro ao rastrear remessa');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        tracking: result,
        message: 'Rastreamento obtido com sucesso'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao rastrear remessa:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro ao rastrear remessa: ' + error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}