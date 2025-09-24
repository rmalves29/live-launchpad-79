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

  let body;
  let action;
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Configuração do Supabase não encontrada');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Configuração do servidor incompleta' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse do body com tratamento de erro
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do JSON:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Formato de dados inválido' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action: requestAction, order_id, tenant_id, shipment_id, tracking_code } = body;
    action = requestAction;

    console.log('🏷️ Melhor Envio Labels - Request:', {
      action,
      order_id,
      tenant_id,
      shipment_id,
      tracking_code,
      timestamp: new Date().toISOString()
    });

    // Validação dos parâmetros obrigatórios
    if (!action) {
      throw new Error('Parâmetro "action" é obrigatório');
    }

    if (!tenant_id) {
      throw new Error('Parâmetro "tenant_id" é obrigatório');
    }

    // Buscar configuração da integração do Melhor Envio
    const { data: integration, error: integrationError } = await supabase
      .from('shipping_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'melhor_envio')
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      console.error('❌ Integração não encontrada:', integrationError);
      throw new Error('Integração com Melhor Envio não encontrada ou inativa');
    }

    if (!integration.access_token) {
      throw new Error('Token de acesso do Melhor Envio não configurado');
    }

    // Configurar URL base (sandbox ou produção)
    const isSandbox = integration.sandbox === true;
    const baseUrl = isSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';

    console.log('🌐 Configuração da integração:', {
      isSandbox,
      baseUrl,
      hasToken: !!integration.access_token,
      action
    });

    // Roteamento das ações
    switch (action) {
      case 'create_shipment':
        if (!order_id) {
          throw new Error('Parâmetro "order_id" é obrigatório para criar remessa');
        }
        return await createShipment(supabase, integration, baseUrl, order_id, tenant_id);

      case 'buy_shipment':
        if (!order_id && !shipment_id) {
          throw new Error('Parâmetro "order_id" ou "shipment_id" é obrigatório para comprar remessa');
        }
        return await buyShipment(integration, baseUrl, shipment_id || order_id);

      case 'get_label':
        if (!order_id && !shipment_id) {
          throw new Error('Parâmetro "order_id" ou "shipment_id" é obrigatório para obter etiqueta');
        }
        return await getLabel(integration, baseUrl, shipment_id || order_id);

      case 'track_shipment':
        if (!tracking_code && !shipment_id) {
          throw new Error('Parâmetro "tracking_code" ou "shipment_id" é obrigatório para rastreamento');
        }
        return await trackShipment(integration, baseUrl, tracking_code || shipment_id);

      default:
        throw new Error(`Ação não suportada: ${action}`);
    }

  } catch (error) {
    console.error('❌ Erro na função:', {
      message: error.message,
      stack: error.stack,
      action: action || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    // SEMPRE retornar 200 para mostrar erro real no front-end
    return new Response(
      JSON.stringify({ 
        success: false,
        stage: action || 'unknown',
        error: error.message || 'Erro interno do servidor',
        details: error.stack
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Função auxiliar para validar e identificar tipo de documento
function validateDocument(document?: string): { document: string, company: boolean } {
  if (!document) {
    return { document: '12345678909', company: false }; // CPF genérico
  }
  
  const cleanDoc = document.replace(/[^0-9]/g, '');
  
  if (cleanDoc.length === 11) {
    // CPF - Pessoa Física
    return { document: cleanDoc, company: false };
  } else if (cleanDoc.length === 14) {
    // CNPJ - Pessoa Jurídica  
    return { document: cleanDoc, company: true };
  } else {
    // Documento inválido, usar CPF genérico
    console.warn(`Documento inválido: ${document}. Usando CPF genérico.`);
    return { document: '12345678909', company: false };
  }
}

// Função auxiliar para gerar CPF válido aleatório
function validateOrGenerateCPF(cpf?: string): string {
  if (cpf) {
    const cleanCPF = cpf.replace(/[^0-9]/g, '');
    if (cleanCPF.length === 11) {
      return cleanCPF;
    }
  }
  
  // Gerar CPF válido genérico para testes
  return '12345678909';
}

// Função auxiliar para validar CEP
function validateCEP(cep: string): string {
  const cleanCEP = cep.replace(/[^0-9]/g, '');
  return cleanCEP.length === 8 ? cleanCEP : '01310100'; // CEP de São Paulo como fallback
}

// Função auxiliar para limpar telefone
function cleanPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 10 ? cleaned : '11999999999'; // Telefone genérico como fallback
}

// Função auxiliar para validar CNPJ
function validateCNPJ(cnpj: string): string {
  const cleanCNPJ = cnpj.replace(/[^0-9]/g, '');
  return cleanCNPJ.length === 14 ? cleanCNPJ : null;
}

// Função para criar remessa com payload correto conforme Melhor Envio
async function createShipment(supabase: any, integration: any, baseUrl: string, orderId: string, tenantId: string) {
  try {
    console.log('📦 [CREATE_SHIPMENT] Iniciando criação de remessa:', { orderId, tenantId });
    
    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('tenant_id', tenantId)
      .single();

    if (orderError || !order) {
      throw new Error(`Pedido não encontrado: ${orderError?.message || 'ID inválido'}`);
    }

    console.log('✅ [CREATE_SHIPMENT] Pedido encontrado:', {
      id: order.id,
      customer_phone: order.customer_phone,
      total_amount: order.total_amount,
      customer_name: order.customer_name
    });

    // Buscar itens do pedido se cart_id existir
    let orderItems = [];
    if (order.cart_id) {
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select(`
          id,
          qty,
          unit_price,
          product:products(name, code, price)
        `)
        .eq('cart_id', order.cart_id);
      
      orderItems = cartItems || [];
    }

    console.log('📦 [CREATE_SHIPMENT] Itens do pedido:', orderItems.length);

    // Buscar dados do cliente
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    console.log('👤 [CREATE_SHIPMENT] Cliente encontrado:', !!customer);

    // Buscar dados da empresa (tenant)
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      throw new Error('Dados da empresa não encontrados');
    }

    console.log('🏢 [CREATE_SHIPMENT] Empresa:', {
      name: tenant.company_name,
      document: tenant.company_document ? 'Sim' : 'Não',
      cep: tenant.company_cep,
      city: tenant.company_city
    });

    // Validação de dados obrigatórios
    if (!tenant.company_name || !tenant.company_cep || !tenant.company_city) {
      throw new Error('Dados da empresa incompletos. Verifique nome, CEP e cidade.');
    }

    // Primeiro fazer cotação para obter service_id válido
    const fromCEP = validateCEP(tenant.company_cep);
    const toCEP = validateCEP(customer?.cep || order.customer_cep || "01310100");
    
    const quotePayload = {
      from: { postal_code: fromCEP },
      to: { postal_code: toCEP },
      package: {
        height: 4,
        width: 16,
        length: 24,
        weight: 0.3
      }
    };

    console.log('💰 [CREATE_SHIPMENT] Fazendo cotação primeiro:', quotePayload);

    const quoteResponse = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      },
      body: JSON.stringify(quotePayload)
    });

    let quoteResult = [];
    if (quoteResponse.ok) {
      quoteResult = await quoteResponse.json();
      console.log('✅ [CREATE_SHIPMENT] Cotação obtida:', quoteResult.length, 'serviços');
    } else {
      console.log('⚠️  [CREATE_SHIPMENT] Erro na cotação, usando serviço padrão');
    }

    // Escolher service_id da cotação (preferir SEDEX=2, depois PAC=1, depois primeiro disponível)
    let serviceId = 1; // PAC como fallback
    if (quoteResult.length > 0) {
      const sedex = quoteResult.find(s => s.id === 2);
      const pac = quoteResult.find(s => s.id === 1);
      
      if (sedex) {
        serviceId = 2;
      } else if (pac) {
        serviceId = 1;
      } else {
        serviceId = quoteResult[0].id;
      }
    }

    console.log('🚚 [CREATE_SHIPMENT] Service ID escolhido:', serviceId);

    // Preparar produtos com base nos itens do pedido
    const totalAmount = parseFloat(order.total_amount || "1");
    let products = [];
    
    // Sempre usar produto genérico conforme solicitado
    products = [{
      name: "Acessórios", // Campo obrigatório é "name", não "description"
      quantity: 1,
      unitary_value: 20.00,
      weight: 0.3
    }];

    // Validar documentos do remetente e destinatário
    const fromDoc = validateDocument(tenant.company_document);
    const toDoc = validateDocument(customer?.cpf);

    console.log('📋 [CREATE_SHIPMENT] Documentos validados:', {
      from: fromDoc,
      to: toDoc,
      tenant_doc: tenant.company_document,
      customer_cpf: customer?.cpf
    });

    // Montar payload correto conforme especificação do Melhor Envio
    const shipmentPayload = {
      service: serviceId,
      from: {
        name: (tenant.company_name || "Empresa").substring(0, 50),
        email: tenant.company_email || "loja@exemplo.com",
        phone: cleanPhone(tenant.company_phone || "11999999999"),
        postal_code: fromCEP,
        address: (tenant.company_address || "Rua Exemplo").substring(0, 60),
        number: (tenant.company_number || "123").substring(0, 10),
        district: (tenant.company_district || "Centro").substring(0, 30),
        city: (tenant.company_city || "São Paulo").substring(0, 30),
        state_abbr: (tenant.company_state || "SP").toUpperCase().substring(0, 2),
        country_id: "BR",
        company: fromDoc.company,
        ...(fromDoc.company ? 
          { company_document: fromDoc.document } : 
          { document: fromDoc.document }
        )
      },
      to: {
        name: (customer?.name || order.customer_name || "Cliente").substring(0, 50),
        email: customer?.email || "cliente@exemplo.com", 
        phone: cleanPhone(customer?.phone || order.customer_phone || "11999999999"),
        postal_code: toCEP,
        address: (customer?.street || order.customer_street || "Rua Destino").substring(0, 60),
        number: (customer?.number || order.customer_number || "100").substring(0, 10),
        district: "Centro",
        city: (customer?.city || order.customer_city || "São Paulo").substring(0, 30),
        state_abbr: (customer?.state || order.customer_state || "SP").toUpperCase().substring(0, 2),
        country_id: "BR",
        company: toDoc.company,
        ...(toDoc.company ? 
          { company_document: toDoc.document } : 
          { document: toDoc.document }
        )
      },
      volumes: [{
        weight: Math.max(0.3, products.reduce((sum, p) => sum + (p.weight || 0), 0)),
        width: 16,
        height: 4, 
        length: 24
      }],
      options: {
        insurance_value: Math.max(50, totalAmount),
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true
      },
      products: products
    };

    console.log('📋 [CREATE_SHIPMENT] Payload final:', {
      service: shipmentPayload.service,
      from_cep: shipmentPayload.from.postal_code,
      to_cep: shipmentPayload.to.postal_code,
      products_count: shipmentPayload.products.length,
      total_weight: shipmentPayload.volumes[0].weight,
      insurance_value: shipmentPayload.options.insurance_value,
      non_commercial: shipmentPayload.options.non_commercial
    });

    // Fazer requisição para criar remessa
    const apiUrl = `${baseUrl}/api/v2/me/cart`;
    console.log('🌐 [CREATE_SHIPMENT] Fazendo requisição para:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      },
      body: JSON.stringify(shipmentPayload)
    });

    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      console.error('❌ [CREATE_SHIPMENT] Erro ao fazer parse da resposta:', jsonError);
      throw new Error('Resposta inválida da API do Melhor Envio');
    }
    
    console.log('📡 [CREATE_SHIPMENT] Resposta da API:', {
      status: response.status,
      ok: response.ok,
      hasResult: !!result,
      resultKeys: result ? Object.keys(result) : []
    });
    
    if (!response.ok) {
      console.error('❌ [CREATE_SHIPMENT] Erro na API do Melhor Envio:', {
        status: response.status,
        statusText: response.statusText,
        body: result
      });
      
      // Propagar o corpo de erro do ME quando der 400 para ver a mensagem exata
      let errorMessage = 'Erro ao criar remessa no Melhor Envio';
      
      if (result?.message) {
        errorMessage = result.message;
      } else if (result?.errors && typeof result.errors === 'object') {
        const errorMessages = [];
        for (const [field, messages] of Object.entries(result.errors)) {
          if (Array.isArray(messages)) {
            errorMessages.push(`${field}: ${messages.join(', ')}`);
          } else {
            errorMessages.push(`${field}: ${messages}`);
          }
        }
        if (errorMessages.length > 0) {
          errorMessage = errorMessages.join('; ');
        }
      } else if (result?.error) {
        errorMessage = result.error;
      }
      
      // Log completo do erro para debug (conforme instruções)
      console.error('❌ [CREATE_SHIPMENT] Erro completo da API:', JSON.stringify(result, null, 2));
      console.error('❌ [CREATE_SHIPMENT] Payload enviado:', JSON.stringify(shipmentPayload, null, 2));
      
      // SEMPRE retornar 200 para mostrar erro real no front-end
      return new Response(
        JSON.stringify({ 
          success: false,
          stage: 'create_shipment',
          error: errorMessage,
          details: result,
          payload_sent: shipmentPayload,
          api_status: response.status
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ [CREATE_SHIPMENT] Remessa criada com sucesso');

    return new Response(
      JSON.stringify({ 
        success: true, 
        stage: 'create_shipment',
        shipment: result,
        message: 'Remessa criada com sucesso no Melhor Envio'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ [CREATE_SHIPMENT] Erro crítico:', {
      message: error.message,
      stack: error.stack,
      orderId: orderId,
      tenantId: tenantId,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        stage: 'create_shipment',
        error: error.message || 'Erro interno ao criar remessa',
        details: error.stack
      }),
      { 
        status: 200, 
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
      
      // SEMPRE retornar 200 para mostrar erro real no front-end
      return new Response(
        JSON.stringify({ 
          success: false,
          stage: 'buy_shipment', 
          error: errorMessage,
          details: result,
          api_status: response.status
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        stage: 'buy_shipment', 
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
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        stage: 'buy_shipment',
        error: error.message || 'Erro interno ao comprar remessa',
        details: error.stack
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Função para obter etiqueta
async function getLabel(integration: any, baseUrl: string, shipmentId: string) {
  try {
    console.log('🏷️ Obtendo etiqueta:', { shipmentId, baseUrl });
    
    if (!shipmentId) {
      throw new Error('shipment_id é obrigatório para obter etiqueta');
    }

    const cleanShipmentId = String(shipmentId).trim();
    
    if (!cleanShipmentId || cleanShipmentId.length < 10) {
      throw new Error(`shipment_id inválido: ${shipmentId}. Deve ser um UUID válido.`);
    }

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/print?orders=${cleanShipmentId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`,
        'User-Agent': 'Aplicacao (contato@empresa.com)'
      }
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
      
      let errorMessage = 'Erro ao obter etiqueta';
      if (result.message) {
        errorMessage = result.message;
      } else if (result.errors) {
        const errors = Object.entries(result.errors).map(([key, value]) => `${key}: ${value}`);
        errorMessage = errors.join('; ');
      }
      
      // SEMPRE retornar 200 para mostrar erro real no front-end
      return new Response(
        JSON.stringify({ 
          success: false,
          stage: 'get_label',
          error: errorMessage,
          details: result,
          api_status: response.status
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        stage: 'get_label', 
        data: result,
        message: 'Etiqueta obtida com sucesso'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('❌ Erro ao obter etiqueta:', {
      message: error.message,
      shipmentId: shipmentId,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        stage: 'get_label',
        error: error.message || 'Erro interno ao obter etiqueta',
        details: error.stack
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Função para rastrear remessa
async function trackShipment(integration: any, baseUrl: string, trackingCode: string) {
  try {
    console.log('📍 Rastreando remessa:', { trackingCode, baseUrl });
    
    if (!trackingCode) {
      throw new Error('tracking_code é obrigatório para rastreamento');
    }

    const cleanTrackingCode = String(trackingCode).trim();
    
    if (!cleanTrackingCode) {
      throw new Error(`tracking_code inválido: ${trackingCode}`);
    }

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/tracking?orders=${cleanTrackingCode}`, {
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
      
      // SEMPRE retornar 200 para mostrar erro real no front-end
      return new Response(
        JSON.stringify({ 
          success: false,
          stage: 'track_shipment',
          error: errorMessage,
          details: result,
          api_status: response.status
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        stage: 'track_shipment', 
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
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        stage: 'track_shipment',
        error: error.message || 'Erro interno ao rastrear remessa',
        details: error.stack
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}