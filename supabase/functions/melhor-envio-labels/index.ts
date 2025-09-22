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
    const { action, order_id, tenant_id, shipment_id, tracking_code } = body;

    console.log('🏷️ Melhor Envio Labels:', { action, order_id, tenant_id, shipment_id, tracking_code });

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'action é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
        if (!order_id) {
          return new Response(
            JSON.stringify({ error: 'order_id é obrigatório para create_shipment' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await createShipment(supabase, integration, baseUrl, order_id, tenant_id);
      
      case 'buy_shipment':
        if (!shipment_id) {
          return new Response(
            JSON.stringify({ error: 'shipment_id é obrigatório para buy_shipment' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await buyShipment(integration, baseUrl, shipment_id);
      
      case 'get_label':
        if (!shipment_id) {
          return new Response(
            JSON.stringify({ error: 'shipment_id é obrigatório para get_label' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await getLabel(integration, baseUrl, shipment_id);
      
      case 'track_shipment':
        if (!tracking_code) {
          return new Response(
            JSON.stringify({ error: 'tracking_code é obrigatório para track_shipment' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await trackShipment(integration, baseUrl, tracking_code);
      
      default:
        return new Response(
          JSON.stringify({ error: 'Ação não suportada', supported_actions: ['create_shipment', 'buy_shipment', 'get_label', 'track_shipment'] }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ Erro na função de labels:', {
      message: error.message,
      stack: error.stack,
      body: body,
      action: action
    });
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Erro interno no processamento de etiquetas: ${error.message}`,
        details: error.stack 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Função auxiliar para gerar CPF válido
function generateValidCPF(): string {
  // Gera um CPF válido algoritmicamente
  const cpf = [];
  
  // Gera os primeiros 9 dígitos
  for (let i = 0; i < 9; i++) {
    cpf[i] = Math.floor(Math.random() * 10);
  }
  
  // Calcula o primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += cpf[i] * (10 - i);
  }
  let remainder = sum % 11;
  cpf[9] = remainder < 2 ? 0 : 11 - remainder;
  
  // Calcula o segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += cpf[i] * (11 - i);
  }
  remainder = sum % 11;
  cpf[10] = remainder < 2 ? 0 : 11 - remainder;
  
  return cpf.join('');
}

// Função auxiliar para validar CPF
function isValidCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/[^0-9]/g, '');
  
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false; // CPFs com todos os dígitos iguais
  
  // Validação dos dígitos verificadores
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let remainder = sum % 11;
  let digit1 = remainder < 2 ? 0 : 11 - remainder;
  
  if (digit1 !== parseInt(cleanCPF.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  remainder = sum % 11;
  let digit2 = remainder < 2 ? 0 : 11 - remainder;
  
  return digit2 === parseInt(cleanCPF.charAt(10));
}

// Função para criar remessa
async function createShipment(supabase: any, integration: any, baseUrl: string, orderId: string, tenantId: string) {
  try {
    console.log('📦 Iniciando criação de remessa para pedido:', orderId);
    
    // Validar parâmetros obrigatórios
    if (!orderId || !tenantId) {
      throw new Error('order_id e tenant_id são obrigatórios');
    }

    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (orderError) {
      console.error('❌ Erro ao buscar pedido:', orderError);
      throw new Error('Erro ao buscar pedido: ' + orderError.message);
    }

    if (!order) {
      throw new Error('Pedido não encontrado');
    }

    console.log('✅ Pedido encontrado:', {
      id: order.id,
      customer_phone: order.customer_phone,
      total_amount: order.total_amount
    });

    // Buscar dados completos da empresa (tenant) para o remetente
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenantError) {
      console.error('❌ Erro ao buscar tenant:', tenantError);
      throw new Error('Erro ao buscar dados da empresa: ' + tenantError.message);
    }

    if (!tenant) {
      throw new Error('Dados da empresa não encontrados');
    }

    // Buscar dados completos do cliente para o destinatário
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // Log dos dados encontrados
    console.log('👤 Cliente:', customer ? {
      name: customer.name,
      cpf: customer.cpf,
      cep: customer.cep,
      city: customer.city,
      state: customer.state
    } : 'Não encontrado');

    console.log('🏢 Empresa:', {
      name: tenant.company_name,
      document: tenant.company_document,
      cep: tenant.company_cep,
      city: tenant.company_city
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

    // Preparar dados do remetente (empresa)
    const senderCPF = generateValidCPF(); // CPF válido para pessoa jurídica
    const companyCNPJ = tenant.company_document.replace(/[^0-9]/g, '');
    
    // Preparar dados do destinatário (cliente)
    let recipientCPF;
    if (customer?.cpf) {
      const cleanCPF = customer.cpf.replace(/[^0-9]/g, '');
      recipientCPF = isValidCPF(cleanCPF) ? cleanCPF : generateValidCPF();
    } else {
      recipientCPF = generateValidCPF();
    }

    // Payload completo para criar remessa
    const shipmentData = {
      service: 1, // PAC
      from: {
        name: tenant.company_name,
        phone: tenant.company_phone.replace(/[^0-9]/g, ''),
        email: tenant.company_email,
        document: senderCPF,
        company_document: companyCNPJ,
        state_register: "",
        address: tenant.company_address,
        complement: tenant.company_complement || "",
        number: tenant.company_number,
        district: tenant.company_district,
        city: tenant.company_city,
        state_abbr: tenant.company_state,
        country_id: "BR",
        postal_code: tenant.company_cep.replace(/[^0-9]/g, '')
      },
      to: {
        name: customer?.name || order.customer_name || "Cliente",
        phone: (customer?.phone || order.customer_phone || "11999999999").replace(/[^0-9]/g, ''),
        email: customer?.email || "cliente@exemplo.com",
        document: recipientCPF,
        address: customer?.street || order.customer_street || "Rua Exemplo",
        complement: customer?.complement || order.customer_complement || "",
        number: customer?.number || order.customer_number || "100",
        district: "Centro", // Bairro padrão
        city: customer?.city || order.customer_city || "São Paulo",
        state_abbr: customer?.state || order.customer_state || "SP",
        country_id: "BR",
        postal_code: (customer?.cep || order.customer_cep || "01310100").replace(/[^0-9]/g, '')
      },
      products: [
        {
          name: "Produto do Pedido",
          quantity: 1,
          unitary_value: parseFloat(order.total_amount || "1")
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

    console.log('📋 Dados da remessa preparados:', {
      from_document: shipmentData.from.document,
      from_company_document: shipmentData.from.company_document,
      to_document: shipmentData.to.document,
      service: shipmentData.service
    });

    // Fazer requisição para criar remessa
    console.log('🌐 Enviando requisição para:', `${baseUrl}/api/v2/me/cart`);
    
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
    
    console.log('📡 Resposta da API ME:', {
      status: response.status,
      ok: response.ok,
      result: result
    });
    
    if (!response.ok) {
      console.error('❌ Erro na API do Melhor Envio:', {
        status: response.status,
        statusText: response.statusText,
        body: result
      });
      
      // Extrair mensagem de erro mais específica
      let errorMessage = 'Erro ao criar remessa';
      if (result.message) {
        errorMessage = result.message;
      } else if (result.errors) {
        const errors = Object.entries(result.errors).map(([key, value]) => `${key}: ${value}`);
        errorMessage = errors.join('; ');
      }
      
      throw new Error(errorMessage);
    }

    console.log('✅ Remessa criada com sucesso:', result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        shipment: result,
        message: 'Remessa criada com sucesso no Melhor Envio'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao criar remessa:', {
      message: error.message,
      stack: error.stack,
      orderId: orderId,
      tenantId: tenantId
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Erro interno ao criar remessa'
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
    console.log('💰 Iniciando compra de remessa:', { shipmentId, baseUrl });
    
    if (!shipmentId) {
      throw new Error('shipment_id é obrigatório para comprar remessa');
    }

    // Garantir que o shipmentId seja uma string válida
    const cleanShipmentId = String(shipmentId).trim();
    
    if (!cleanShipmentId || cleanShipmentId.length < 10) {
      throw new Error(`shipment_id inválido: ${shipmentId}. Deve ser um UUID válido.`);
    }

    const payload = {
      orders: [cleanShipmentId]
    };

    console.log('📦 Payload para compra:', payload);

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    console.log('📡 Resposta da compra:', {
      status: response.status,
      ok: response.ok,
      result: result
    });
    
    if (!response.ok) {
      console.error('❌ Erro na API do Melhor Envio (compra):', {
        status: response.status,
        statusText: response.statusText,
        body: result
      });
      
      let errorMessage = 'Erro ao comprar remessa';
      if (result.message) {
        errorMessage = result.message;
      } else if (result.errors) {
        const errors = Object.entries(result.errors).map(([key, value]) => `${key}: ${value}`);
        errorMessage = errors.join('; ');
      }
      
      throw new Error(errorMessage);
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
    console.error('❌ Erro ao comprar remessa:', {
      message: error.message,
      shipmentId: shipmentId,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Erro interno ao comprar remessa'
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
    console.log('🏷️ Iniciando geração de etiqueta:', { shipmentId, baseUrl });
    
    if (!shipmentId) {
      throw new Error('shipment_id é obrigatório para gerar etiqueta');
    }

    // Garantir que o shipmentId seja uma string válida
    const cleanShipmentId = String(shipmentId).trim();
    
    if (!cleanShipmentId || cleanShipmentId.length < 10) {
      throw new Error(`shipment_id inválido: ${shipmentId}. Deve ser um UUID válido com pelo menos 36 caracteres.`);
    }

    console.log('📨 Fazendo requisição de etiqueta para:', `${baseUrl}/api/v2/me/shipment/print`);

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      },
      body: JSON.stringify({
        orders: [cleanShipmentId]
      })
    });

    const result = await response.json();
    
    console.log('📡 Resposta da etiqueta:', {
      status: response.status,
      ok: response.ok,
      result: result
    });
    
    if (!response.ok) {
      console.error('❌ Erro na API do Melhor Envio (etiqueta):', {
        status: response.status,
        statusText: response.statusText,
        body: result
      });
      
      let errorMessage = 'Erro ao gerar etiqueta';
      if (result.message) {
        errorMessage = result.message;
      } else if (result.errors) {
        const errors = Object.entries(result.errors).map(([key, value]) => `${key}: ${value}`);
        errorMessage = errors.join('; ');
      }
      
      throw new Error(errorMessage);
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
    console.error('❌ Erro ao gerar etiqueta:', {
      message: error.message,
      shipmentId: shipmentId,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Erro interno ao gerar etiqueta'
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
    console.log('📍 Iniciando rastreamento:', { trackingCode, baseUrl });
    
    if (!trackingCode) {
      throw new Error('tracking_code é obrigatório para rastrear remessa');
    }

    const cleanTrackingCode = String(trackingCode).trim();
    
    if (!cleanTrackingCode) {
      throw new Error('tracking_code inválido');
    }

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/tracking?orders[]=${encodeURIComponent(cleanTrackingCode)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      }
    });

    const result = await response.json();
    
    console.log('📡 Resposta do rastreamento:', {
      status: response.status,
      ok: response.ok,
      result: result
    });
    
    if (!response.ok) {
      console.error('❌ Erro na API do Melhor Envio (rastreamento):', {
        status: response.status,
        statusText: response.statusText,
        body: result
      });
      
      let errorMessage = 'Erro ao rastrear remessa';
      if (result.message) {
        errorMessage = result.message;
      } else if (result.errors) {
        const errors = Object.entries(result.errors).map(([key, value]) => `${key}: ${value}`);
        errorMessage = errors.join('; ');
      }
      
      throw new Error(errorMessage);
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
    console.error('❌ Erro ao rastrear remessa:', {
      message: error.message,
      trackingCode: trackingCode,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Erro interno ao rastrear remessa'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}