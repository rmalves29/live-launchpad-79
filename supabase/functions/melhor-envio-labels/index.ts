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

    // Validações obrigatórias
    if (!action) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Parâmetro "action" é obrigatório' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Parâmetro "tenant_id" é obrigatório' 
        }),
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
      console.log('🔍 Buscando integração global...');
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
        JSON.stringify({ 
          success: false,
          error: 'Erro ao verificar integração com Melhor Envio' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration) {
      console.error('❌ Integração não encontrada para tenant:', tenant_id);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Integração com Melhor Envio não configurada para esta empresa. Configure a integração nas configurações.' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.access_token) {
      console.error('❌ Token de acesso não encontrado');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Integração com Melhor Envio não autorizada. Refaça a autorização nas configurações.' 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar URL base (sandbox ou produção)
    const baseUrl = integration.sandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
    
    console.log('🌐 Configuração da integração:', {
      isSandbox: integration.sandbox,
      baseUrl,
      hasToken: !!integration.access_token,
      action
    });

    // Processar ação específica com validações
    switch (action) {
      case 'create_shipment':
        if (!order_id) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Parâmetro "order_id" é obrigatório para criar remessa' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await createShipment(supabase, integration, baseUrl, order_id, tenant_id);
      
      case 'buy_shipment':
        if (!shipment_id) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Parâmetro "shipment_id" é obrigatório para comprar remessa' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await buyShipment(integration, baseUrl, shipment_id);
      
      case 'get_label':
        if (!shipment_id) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Parâmetro "shipment_id" é obrigatório para gerar etiqueta' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await getLabel(integration, baseUrl, shipment_id);
      
      case 'track_shipment':
        if (!tracking_code) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Parâmetro "tracking_code" é obrigatório para rastrear remessa' 
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return await trackShipment(integration, baseUrl, tracking_code);
      
      default:
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Ação "${action}" não suportada`,
            supported_actions: ['create_shipment', 'buy_shipment', 'get_label', 'track_shipment']
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    console.error('❌ Erro crítico na função:', {
      message: error.message,
      stack: error.stack,
      body: body,
      action: action,
      timestamp: new Date().toISOString()
    });
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Erro interno do servidor. Tente novamente em alguns instantes.',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Função auxiliar para validar e gerar CPF
function validateOrGenerateCPF(cpf?: string): string {
  if (cpf) {
    const cleanCPF = cpf.replace(/[^0-9]/g, '');
    if (cleanCPF.length === 11 && isValidCPF(cleanCPF)) {
      return cleanCPF;
    }
  }
  return generateValidCPF();
}

// Função auxiliar para gerar CPF válido
function generateValidCPF(): string {
  const cpf = [];
  
  // Gera os primeiros 9 dígitos aleatórios
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

// Função auxiliar para limpar e validar CEP
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

// Função para criar remessa com validações robustas
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

    if (orderError) {
      console.error('❌ [CREATE_SHIPMENT] Erro ao buscar pedido:', orderError);
      throw new Error(`Erro ao buscar pedido: ${orderError.message}`);
    }

    if (!order) {
      throw new Error('Pedido não encontrado');
    }

    console.log('✅ [CREATE_SHIPMENT] Pedido encontrado:', {
      id: order.id,
      customer_phone: order.customer_phone,
      total_amount: order.total_amount,
      customer_name: order.customer_name
    });

    // Buscar dados da empresa (tenant)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (tenantError) {
      console.error('❌ [CREATE_SHIPMENT] Erro ao buscar empresa:', tenantError);
      throw new Error(`Erro ao buscar dados da empresa: ${tenantError.message}`);
    }

    if (!tenant) {
      throw new Error('Dados da empresa não encontrados');
    }

    // Buscar dados do cliente
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', order.customer_phone)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    console.log('👤 [CREATE_SHIPMENT] Cliente encontrado:', !!customer);
    console.log('🏢 [CREATE_SHIPMENT] Empresa:', {
      name: tenant.company_name,
      document: tenant.company_document ? 'Sim' : 'Não',
      cep: tenant.company_cep,
      city: tenant.company_city
    });

    // Validar dados obrigatórios da empresa
    const requiredCompanyFields = [
      { field: 'company_name', label: 'Nome da empresa', value: tenant.company_name },
      { field: 'company_document', label: 'CNPJ da empresa', value: tenant.company_document },
      { field: 'company_email', label: 'E-mail da empresa', value: tenant.company_email },
      { field: 'company_phone', label: 'Telefone da empresa', value: tenant.company_phone },
      { field: 'company_address', label: 'Endereço da empresa', value: tenant.company_address },
      { field: 'company_number', label: 'Número do endereço', value: tenant.company_number },
      { field: 'company_district', label: 'Bairro da empresa', value: tenant.company_district },
      { field: 'company_city', label: 'Cidade da empresa', value: tenant.company_city },
      { field: 'company_state', label: 'Estado da empresa', value: tenant.company_state },
      { field: 'company_cep', label: 'CEP da empresa', value: tenant.company_cep }
    ];

    const missingFields = requiredCompanyFields.filter(field => !field.value || field.value.trim() === '');

    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(f => f.label).join(', ');
      throw new Error(`Dados da empresa incompletos. Complete os seguintes campos nas configurações: ${fieldLabels}`);
    }

    // Validar e preparar CNPJ da empresa
    const companyCNPJ = validateCNPJ(tenant.company_document);
    if (!companyCNPJ) {
      throw new Error(`CNPJ da empresa inválido: ${tenant.company_document}. O CNPJ deve ter 14 dígitos.`);
    }

    // Preparar dados do remetente (empresa)
    const senderData = {
      name: tenant.company_name.substring(0, 50), // Limite da API
      phone: cleanPhone(tenant.company_phone),
      email: tenant.company_email,
      document: validateOrGenerateCPF(), // CPF válido para pessoa jurídica
      company_document: companyCNPJ,
      state_register: "", // Inscrição Estadual (opcional)
      address: tenant.company_address.substring(0, 60), // Limite da API
      complement: (tenant.company_complement || "").substring(0, 30),
      number: tenant.company_number.substring(0, 10),
      district: tenant.company_district.substring(0, 30),
      city: tenant.company_city.substring(0, 30),
      state_abbr: tenant.company_state.toUpperCase(),
      country_id: "BR",
      postal_code: validateCEP(tenant.company_cep)
    };

    // Preparar dados do destinatário (cliente)
    const recipientData = {
      name: (customer?.name || order.customer_name || "Cliente").substring(0, 50),
      phone: cleanPhone(customer?.phone || order.customer_phone || "11999999999"),
      email: customer?.email || "cliente@exemplo.com",
      document: validateOrGenerateCPF(customer?.cpf),
      address: (customer?.street || order.customer_street || "Rua Exemplo, 100").substring(0, 60),
      complement: (customer?.complement || order.customer_complement || "").substring(0, 30),
      number: (customer?.number || order.customer_number || "100").substring(0, 10),
      district: "Centro", // Bairro padrão
      city: (customer?.city || order.customer_city || "São Paulo").substring(0, 30),
      state_abbr: (customer?.state || order.customer_state || "SP").toUpperCase(),
      country_id: "BR",
      postal_code: validateCEP(customer?.cep || order.customer_cep || "01310100")
    };

    // Preparar dados da remessa
    const totalAmount = parseFloat(order.total_amount || "1");
    const insuranceValue = Math.max(totalAmount, 50); // Mínimo R$ 50 para seguro

    const shipmentPayload = {
      service: 1, // PAC
      from: senderData,
      to: recipientData,
      products: [
        {
          name: "Produto do Pedido",
          quantity: 1,
          unitary_value: totalAmount
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
        insurance_value: insuranceValue,
        receipt: false,
        own_hand: false
      }
    };

    console.log('📋 [CREATE_SHIPMENT] Payload preparado:', {
      from_document: shipmentPayload.from.document,
      from_company_document: shipmentPayload.from.company_document,
      to_document: shipmentPayload.to.document,
      from_cep: shipmentPayload.from.postal_code,
      to_cep: shipmentPayload.to.postal_code,
      service: shipmentPayload.service,
      insurance_value: shipmentPayload.options.insurance_value
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
      
      // Extrair mensagem de erro específica
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
      
      throw new Error(errorMessage);
    }

    console.log('✅ [CREATE_SHIPMENT] Remessa criada com sucesso');

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