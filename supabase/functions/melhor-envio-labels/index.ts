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

    // Buscar dados completos da empresa (tenant) para o remetente
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new Error('Dados da empresa não encontrados');
    }

    // Buscar dados completos do cliente para o destinatário
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    console.log('👤 Dados do cliente encontrados:', customer ? 'Sim' : 'Não', {
      phone: order.customer_phone,
      customerData: customer ? {
        name: customer.name,
        email: customer.email,
        cpf: customer.cpf,
        cep: customer.cep,
        city: customer.city,
        state: customer.state
      } : null
    });

    console.log('📦 Criando remessa para pedido:', orderId);
    console.log('🏢 Dados da empresa:', {
      name: tenant.company_name,
      document: tenant.company_document,
      cep: tenant.company_cep,
      city: tenant.company_city,
      email: tenant.company_email,
      phone: tenant.company_phone
    });

    // Validar dados obrigatórios da empresa
    const missingFields = [];
    if (!tenant.company_name) missingFields.push('Nome da empresa');
    if (!tenant.company_document) missingFields.push('CNPJ da empresa');
    if (!tenant.company_email) missingFields.push('E-mail da empresa');
    if (!tenant.company_phone) missingFields.push('Telefone da empresa');
    if (!tenant.company_address) missingFields.push('Endereço da empresa');
    if (!tenant.company_number) missingFields.push('Número do endereço');
    if (!tenant.company_district) missingFields.push('Bairro da empresa');
    if (!tenant.company_city) missingFields.push('Cidade da empresa');
    if (!tenant.company_state) missingFields.push('Estado da empresa');
    if (!tenant.company_cep) missingFields.push('CEP da empresa');

    if (missingFields.length > 0) {
      throw new Error(`Dados da empresa incompletos. Campos obrigatórios faltando: ${missingFields.join(', ')}. Por favor, complete os dados da empresa nas configurações.`);
    }

    // Payload completo para criar remessa com dados reais da empresa
    const shipmentData = {
      service: 1, // ID do serviço (ex: PAC = 1, SEDEX = 2)
      from: {
        name: tenant.admin_email || tenant.company_email, // Nome do responsável ou email da empresa
        phone: tenant.company_phone.replace(/[^0-9]/g, ''), // Remove formatação do telefone
        email: tenant.company_email,
        document: tenant.company_document.replace(/[^0-9]/g, ''), // Remove formatação do CNPJ
        company_document: tenant.company_document.replace(/[^0-9]/g, ''),
        state_register: "", // Inscrição Estadual (opcional)
        address: tenant.company_address,
        complement: tenant.company_complement || "",
        number: tenant.company_number,
        district: tenant.company_district,
        city: tenant.company_city,
        state_abbr: tenant.company_state,
        country_id: "BR",
        postal_code: tenant.company_cep.replace(/[^0-9]/g, '') // Remove formatação do CEP
      },
      to: {
        name: customer?.name || order.customer_name || "Cliente",
        phone: (customer?.phone || order.customer_phone || "11999999999").replace(/[^0-9]/g, ''), // Remove formatação
        email: customer?.email || "cliente@exemplo.com", // Email real do cliente ou genérico
        document: customer?.cpf?.replace(/[^0-9]/g, '') || "00000000000", // CPF real ou genérico
        address: customer?.street || order.customer_street || "Endereço não informado",
        complement: customer?.complement || order.customer_complement || "",
        number: customer?.number || order.customer_number || "S/N",
        district: customer?.city || order.customer_city || "Centro", // Usa cidade como bairro se não tiver bairro
        city: customer?.city || order.customer_city || "São Paulo",
        state_abbr: customer?.state || order.customer_state || "SP",
        country_id: "BR",
        postal_code: (customer?.cep || order.customer_cep || "01310100").replace(/[^0-9]/g, '') // Remove formatação
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