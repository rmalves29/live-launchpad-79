import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Função helper para salvar logs de integração
async function saveIntegrationLog(
  supabase: any,
  tenant_id: string,
  order_id: number,
  action: string,
  status_code: number,
  request_payload: any,
  response_body: string,
  error_message?: string
) {
  try {
    await supabase.from("webhook_logs").insert({
      tenant_id,
      webhook_type: `melhor_envio_${action}`,
      status_code,
      payload: { order_id, action, request: request_payload },
      response: response_body?.substring(0, 10000), // Limitar tamanho
      error_message
    });
    console.log(`[melhor-envio-labels] Log salvo: ${action} - Status ${status_code}`);
  } catch (logError) {
    console.error("[melhor-envio-labels] Erro ao salvar log:", logError);
  }
}

// Mapeamento de transportadoras para service IDs do Melhor Envio
const CARRIER_SERVICE_MAP: Record<string, number> = {
  // Correios
  "pac": 1,
  "sedex": 2,
  "mini envios": 17,
  "pac mini": 17,
  // Jadlog
  "jadlog": 3,
  ".package": 3,
  "package": 3,
  "jadlog package": 3,
  ".com": 4,
  "jadlog .com": 4,
  "jadlog.com": 4,
  // Azul Cargo
  "azul amanhã": 11,
  "azul e-fácil": 31,
  // Latam
  "latam": 12,
  // Via Brasil
  "via brasil": 13,
};

// Extrair service_id da observation do pedido
function extractServiceIdFromObservation(observation: string | null): number | null {
  if (!observation) return null;
  
  // Formato: [FRETE] Transportadora - Serviço | R$ XX.XX
  const match = observation.match(/\[FRETE\]\s*([^-]+)\s*-\s*([^|]+)/i);
  if (!match) return null;
  
  const carrier = match[1].trim().toLowerCase();
  const service = match[2].trim().toLowerCase();
  
  // Tentar encontrar por serviço específico primeiro
  const fullKey = `${carrier} ${service}`.toLowerCase();
  if (CARRIER_SERVICE_MAP[fullKey]) return CARRIER_SERVICE_MAP[fullKey];
  if (CARRIER_SERVICE_MAP[service]) return CARRIER_SERVICE_MAP[service];
  if (CARRIER_SERVICE_MAP[carrier]) return CARRIER_SERVICE_MAP[carrier];
  
  // Verificar se é Jadlog
  if (carrier.includes("jadlog") || service.includes("package") || service.includes(".com")) {
    if (service.includes(".com") || service.includes("com")) return 4;
    return 3; // Jadlog Package
  }
  
  // Verificar se é Correios
  if (carrier.includes("correio") || carrier.includes("pac") || carrier.includes("sedex")) {
    if (service.includes("sedex")) return 2;
    if (service.includes("mini")) return 17;
    return 1; // PAC
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action, order_id, tenant_id, service_id: overrideServiceId } = body;
    
    console.log(`[melhor-envio-labels] Action: ${action}, Order: ${order_id}, Tenant: ${tenant_id}`);

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "order_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar integração do Melhor Envio
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "melhor_envio")
      .single();

    if (integrationError || !integration) {
      console.error("[melhor-envio-labels] Integração não encontrada:", integrationError);
      const errorMsg = "Configuração de frete não encontrada";
      await saveIntegrationLog(supabase, tenant_id, order_id, action, 404, {}, "", errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      const errorMsg = "Token do Melhor Envio não configurado";
      await saveIntegrationLog(supabase, tenant_id, order_id, action, 400, {}, "", errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (orderError || !order) {
      console.error("[melhor-envio-labels] Pedido não encontrado:", orderError);
      const errorMsg = "Pedido não encontrado";
      await saveIntegrationLog(supabase, tenant_id, order_id, action, 404, {}, "", errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar dados do tenant (remetente)
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenant_id)
      .single();

    if (tenantError || !tenant) {
      console.error("[melhor-envio-labels] Tenant não encontrado:", tenantError);
      const errorMsg = "Dados da empresa não encontrados";
      await saveIntegrationLog(supabase, tenant_id, order_id, action, 404, {}, "", errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = integration.sandbox 
      ? "https://sandbox.melhorenvio.com.br/api/v2" 
      : "https://melhorenvio.com.br/api/v2";

    const headers = {
      "Authorization": `Bearer ${integration.access_token}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "OrderZaps/1.0"
    };

    // Processar a ação solicitada
    switch (action) {
      case "create_shipment":
        return await createShipment(baseUrl, headers, order, tenant, integration, supabase, overrideServiceId);
      
      case "buy_shipment":
        return await buyShipment(baseUrl, headers, order, supabase, tenant_id);
      
      case "get_label":
        return await getLabel(baseUrl, headers, order, supabase, tenant_id);
      
      case "get_status":
        return await getShipmentStatus(baseUrl, headers, order, supabase, tenant_id);
      
      case "cancel_shipment":
        return await cancelShipment(baseUrl, headers, order, supabase, tenant_id);
      
      default:
        const errorMsg = `Ação desconhecida: ${action}`;
        await saveIntegrationLog(supabase, tenant_id, order_id, action, 400, {}, "", errorMsg);
        return new Response(
          JSON.stringify({ success: false, error: errorMsg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error("[melhor-envio-labels] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createShipment(
  baseUrl: string, 
  headers: Record<string, string>, 
  order: any, 
  tenant: any, 
  integration: any,
  supabase: any,
  overrideServiceId?: number
) {
  console.log("[melhor-envio-labels] Criando remessa para pedido:", order.id);

  // Validar dados do remetente
  if (!tenant.company_cep || !tenant.company_name) {
    const errorMsg = "Dados da empresa incompletos. Configure o CEP e nome da empresa nas configurações.";
    await saveIntegrationLog(supabase, tenant.id, order.id, "create_shipment", 400, {}, "", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validar dados do destinatário e listar campos faltantes
  const missingFields = [];
  if (!order.customer_name) missingFields.push("Nome do cliente");
  if (!order.customer_cep) missingFields.push("CEP");
  if (!order.customer_street) missingFields.push("Rua");
  if (!order.customer_city) missingFields.push("Cidade");
  if (!order.customer_state) missingFields.push("Estado");

  if (missingFields.length > 0) {
    const errorMsg = `Dados de endereço incompletos. Campos faltando: ${missingFields.join(", ")}`;
    await saveIntegrationLog(supabase, tenant.id, order.id, "create_shipment", 400, {}, "", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Buscar CPF do cliente na tabela customers pelo telefone
  let customerCpf = "";
  const { data: customer } = await supabase
    .from("customers")
    .select("cpf")
    .eq("phone", order.customer_phone)
    .eq("tenant_id", tenant.id)
    .single();
  
  if (customer?.cpf) {
    customerCpf = cleanDocument(customer.cpf);
  }

  // CPF/CNPJ do destinatário é opcional - enviar mesmo sem documento
  if (!customerCpf) {
    console.log("[melhor-envio-labels] ⚠️ CPF do cliente não encontrado - tentando enviar sem documento");
  } else if (customerCpf.length !== 11 && customerCpf.length !== 14) {
    console.log("[melhor-envio-labels] ⚠️ CPF/CNPJ inválido - tentando enviar sem documento");
    customerCpf = ""; // Limpar documento inválido
  }

  // Buscar itens do pedido para calcular peso/dimensões
  let totalWeight = 0.3; // Peso mínimo padrão
  let totalVolumes = 1;

  if (order.cart_id) {
    const { data: cartItems } = await supabase
      .from("cart_items")
      .select("qty")
      .eq("cart_id", order.cart_id);
    
    if (cartItems && cartItems.length > 0) {
      totalVolumes = cartItems.reduce((sum: number, item: any) => sum + item.qty, 0);
      totalWeight = Math.max(0.3, totalVolumes * 0.15); // Estimativa de peso
    }
  }

  // Determinar CPF/CNPJ do remetente
  const cleanedDocument = cleanDocument(tenant.company_document);
  const isCNPJ = cleanedDocument.length === 14;
  const isCPF = cleanedDocument.length === 11;
  
  // Melhor Envio: document = CPF (11 dígitos), company_document = CNPJ (14 dígitos)
  const fromDocument = isCPF ? cleanedDocument : "";
  const fromCompanyDocument = isCNPJ ? cleanedDocument : "";

  // Determinar CPF/CNPJ do destinatário
  const toDocument = customerCpf.length === 11 ? customerCpf : "";
  const toCompanyDocument = customerCpf.length === 14 ? customerCpf : "";

  // Determinar service_id: prioridade para override > shipping_service_id > extrair da observation > fallback PAC
  let serviceId = 1; // Fallback: PAC
  
  if (overrideServiceId && overrideServiceId > 0) {
    serviceId = overrideServiceId;
    console.log("[melhor-envio-labels] Usando service_id override:", serviceId);
  } else if (order.shipping_service_id && order.shipping_service_id > 0) {
    serviceId = order.shipping_service_id;
    console.log("[melhor-envio-labels] Usando service_id do pedido:", serviceId);
  } else {
    const extractedServiceId = extractServiceIdFromObservation(order.observation);
    if (extractedServiceId) {
      serviceId = extractedServiceId;
      console.log("[melhor-envio-labels] Service_id extraído da observation:", serviceId, "de:", order.observation);
    } else {
      console.log("[melhor-envio-labels] ⚠️ Usando service_id padrão (PAC):", serviceId, "Observation:", order.observation);
    }
  }

  // Montar payload da remessa
  const shipmentPayload = {
    service: serviceId,
    agency: null,
    from: {
      name: tenant.company_name,
      phone: cleanPhone(tenant.company_phone || tenant.phone),
      email: tenant.company_email || tenant.email || "",
      document: fromDocument,
      company_document: fromCompanyDocument,
      state_register: "",
      address: tenant.company_address || tenant.address || "",
      complement: tenant.company_complement || "",
      number: tenant.company_number || "S/N",
      district: tenant.company_district || "",
      city: tenant.company_city || "",
      country_id: "BR",
      postal_code: cleanCep(tenant.company_cep),
      note: ""
    },
    to: {
      name: order.customer_name,
      phone: cleanPhone(order.customer_phone),
      email: "",
      document: toDocument,
      company_document: toCompanyDocument,
      state_register: "",
      address: order.customer_street,
      complement: order.customer_complement || "",
      number: order.customer_number || "S/N",
      district: order.customer_neighborhood || "",
      city: order.customer_city,
      state_abbr: order.customer_state,
      country_id: "BR",
      postal_code: cleanCep(order.customer_cep),
      note: ""
    },
    products: [
      {
        name: `Pedido #${order.unique_order_id || order.id}`,
        quantity: totalVolumes,
        unitary_value: parseFloat((Number(order.total_amount) / totalVolumes).toFixed(2))
      }
    ],
    volumes: [
      {
        height: 10,
        width: 15,
        length: 20,
        weight: totalWeight
      }
    ],
    options: {
      insurance_value: parseFloat(Number(order.total_amount).toFixed(2)),
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: false,
      invoice: {
        key: ""
      },
      platform: "OrderZaps",
      tags: [
        {
          tag: `Pedido ${order.unique_order_id || order.id}`,
          url: null
        }
      ]
    }
  };

  console.log("[melhor-envio-labels] Payload:", JSON.stringify(shipmentPayload, null, 2));

  // Criar remessa no carrinho do Melhor Envio
  const response = await fetch(`${baseUrl}/me/cart`, {
    method: "POST",
    headers,
    body: JSON.stringify(shipmentPayload)
  });

  const responseText = await response.text();
  console.log("[melhor-envio-labels] Response status:", response.status);
  console.log("[melhor-envio-labels] Response:", responseText);

  // Salvar log da integração
  await saveIntegrationLog(
    supabase, 
    tenant.id, 
    order.id, 
    "create_shipment", 
    response.status, 
    shipmentPayload, 
    responseText,
    !response.ok ? responseText : undefined
  );

  if (!response.ok) {
    let errorMessage = "Erro ao criar remessa";
    try {
      const errorData = JSON.parse(responseText);
      if (errorData.errors) {
        errorMessage = Object.values(errorData.errors).flat().join(", ");
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = responseText;
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const shipmentData = JSON.parse(responseText);
  
  // Salvar o melhor_envio_shipment_id no pedido para rastreamento
  const melhorEnvioShipmentId = shipmentData.id;
  if (melhorEnvioShipmentId) {
    await supabase
      .from("orders")
      .update({ melhor_envio_shipment_id: melhorEnvioShipmentId })
      .eq("id", order.id);
    console.log("[melhor-envio-labels] Shipment ID salvo no pedido:", melhorEnvioShipmentId);
  }

  console.log("[melhor-envio-labels] Remessa criada:", shipmentData);

  return new Response(
    JSON.stringify({ 
      success: true, 
      shipment: shipmentData,
      shipment_id: melhorEnvioShipmentId,
      message: "Remessa adicionada ao carrinho do Melhor Envio"
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function buyShipment(
  baseUrl: string, 
  headers: Record<string, string>, 
  order: any,
  supabase: any,
  tenant_id: string
) {
  console.log("[melhor-envio-labels] Comprando frete para pedido:", order.id);

  // Verificar se o pedido tem um shipment_id salvo
  const savedShipmentId = order.melhor_envio_shipment_id;
  
  if (savedShipmentId) {
    // Comprar apenas a remessa específica deste pedido
    console.log("[melhor-envio-labels] Usando shipment_id salvo:", savedShipmentId);
    
    const checkoutResponse = await fetch(`${baseUrl}/me/shipment/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orders: [savedShipmentId] })
    });

    const checkoutText = await checkoutResponse.text();
    console.log("[melhor-envio-labels] Checkout response:", checkoutText);

    // Salvar log
    await saveIntegrationLog(
      supabase,
      tenant_id,
      order.id,
      "buy_shipment",
      checkoutResponse.status,
      { orders: [savedShipmentId] },
      checkoutText,
      !checkoutResponse.ok ? checkoutText : undefined
    );

    if (!checkoutResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao finalizar compra: " + checkoutText }),
        { status: checkoutResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutData = JSON.parse(checkoutText);
    
    // Extrair código de rastreio da resposta
    let trackingCode = "";
    if (checkoutData.purchase && checkoutData.purchase.orders) {
      const orderInfo = Object.values(checkoutData.purchase.orders)[0] as any;
      trackingCode = orderInfo?.tracking || "";
    }
    
    // Salvar código de rastreio no pedido
    if (trackingCode) {
      await supabase
        .from("orders")
        .update({ melhor_envio_tracking_code: trackingCode })
        .eq("id", order.id);
      console.log("[melhor-envio-labels] Código de rastreio salvo:", trackingCode);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: checkoutData,
        tracking_code: trackingCode,
        message: "Frete comprado com sucesso!"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Fallback: buscar no carrinho (comportamento antigo)
  const cartResponse = await fetch(`${baseUrl}/me/cart`, {
    method: "GET",
    headers
  });

  if (!cartResponse.ok) {
    const errorText = await cartResponse.text();
    await saveIntegrationLog(supabase, tenant_id, order.id, "buy_shipment", cartResponse.status, {}, errorText, errorText);
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao buscar carrinho" }),
      { status: cartResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const cartData = await cartResponse.json();
  console.log("[melhor-envio-labels] Carrinho:", cartData);

  if (!cartData || cartData.length === 0) {
    const errorMsg = "Carrinho vazio. Crie uma remessa primeiro.";
    await saveIntegrationLog(supabase, tenant_id, order.id, "buy_shipment", 400, {}, "", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Pegar IDs das remessas no carrinho
  const orderIds = cartData.map((item: any) => item.id);

  // Fazer checkout
  const checkoutResponse = await fetch(`${baseUrl}/me/shipment/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orders: orderIds })
  });

  const checkoutText = await checkoutResponse.text();
  console.log("[melhor-envio-labels] Checkout response:", checkoutText);

  // Salvar log
  await saveIntegrationLog(
    supabase,
    tenant_id,
    order.id,
    "buy_shipment",
    checkoutResponse.status,
    { orders: orderIds },
    checkoutText,
    !checkoutResponse.ok ? checkoutText : undefined
  );

  if (!checkoutResponse.ok) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao finalizar compra: " + checkoutText }),
      { status: checkoutResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const checkoutData = JSON.parse(checkoutText);

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: checkoutData,
      message: "Frete comprado com sucesso!"
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getLabel(
  baseUrl: string, 
  headers: Record<string, string>, 
  order: any,
  supabase: any,
  tenant_id: string
) {
  console.log("[melhor-envio-labels] Gerando etiqueta para pedido:", order.id);

  // Usar o shipment_id salvo no pedido (OBRIGATÓRIO - não usar fallback)
  const shipmentId = order.melhor_envio_shipment_id;
  
  if (!shipmentId) {
    const errorMsg = "Este pedido não tem uma remessa criada. Clique em 'Criar Remessa' primeiro.";
    await saveIntegrationLog(supabase, tenant_id, order.id, "get_label", 400, {}, "", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[melhor-envio-labels] Usando shipment_id salvo:", shipmentId);

  // Gerar etiqueta
  const generateResponse = await fetch(`${baseUrl}/me/shipment/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orders: [shipmentId] })
  });

  const generateText = await generateResponse.text();
  
  // Salvar log do generate
  await saveIntegrationLog(
    supabase,
    tenant_id,
    order.id,
    "get_label_generate",
    generateResponse.status,
    { orders: [shipmentId] },
    generateText,
    !generateResponse.ok ? generateText : undefined
  );

  if (!generateResponse.ok) {
    console.log("[melhor-envio-labels] Erro ao gerar:", generateText);
    // Tentar continuar mesmo com erro (pode já estar gerada)
  }

  // Imprimir etiqueta (obter URL)
  const printResponse = await fetch(`${baseUrl}/me/shipment/print`, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      mode: "public",
      orders: [shipmentId] 
    })
  });

  const printText = await printResponse.text();

  // Salvar log do print
  await saveIntegrationLog(
    supabase,
    tenant_id,
    order.id,
    "get_label_print",
    printResponse.status,
    { mode: "public", orders: [shipmentId] },
    printText,
    !printResponse.ok ? printText : undefined
  );

  if (!printResponse.ok) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao imprimir etiqueta: " + printText }),
      { status: printResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const printData = JSON.parse(printText);
  console.log("[melhor-envio-labels] Print response:", printData);

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: { url: printData.url },
      message: "Etiqueta gerada com sucesso!"
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Consultar status da remessa
async function getShipmentStatus(
  baseUrl: string,
  headers: Record<string, string>,
  order: any,
  supabase: any,
  tenant_id: string
) {
  const shipmentId = order.melhor_envio_shipment_id;
  
  if (!shipmentId) {
    return new Response(
      JSON.stringify({ success: false, error: "Pedido não possui remessa no Melhor Envio" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[melhor-envio-labels] Consultando status da remessa:", shipmentId);

  const response = await fetch(`${baseUrl}/me/shipment/tracking`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orders: [shipmentId] })
  });

  const responseText = await response.text();
  console.log("[melhor-envio-labels] Response status:", response.status);
  console.log("[melhor-envio-labels] Response:", responseText);

  await saveIntegrationLog(
    supabase,
    tenant_id,
    order.id,
    "get_status",
    response.status,
    { shipment_id: shipmentId },
    responseText,
    !response.ok ? responseText : undefined
  );

  if (!response.ok) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao consultar status: " + responseText }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const data = JSON.parse(responseText);
  
  // Verificar se tem tracking e atualizar pedido
  const shipmentData = data[shipmentId];
  if (shipmentData?.tracking) {
    console.log("[melhor-envio-labels] Tracking encontrado:", shipmentData.tracking);
    
    await supabase
      .from("orders")
      .update({ melhor_envio_tracking_code: shipmentData.tracking })
      .eq("id", order.id);
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      data: shipmentData,
      tracking: shipmentData?.tracking || null,
      status: shipmentData?.status || null
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Funções auxiliares para limpar dados
function cleanPhone(phone: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

function cleanCep(cep: string | null): string {
  if (!cep) return "";
  return cep.replace(/\D/g, "");
}

function cleanDocument(doc: string | null): string {
  if (!doc) return "";
  return doc.replace(/\D/g, "");
}

// Cancelar remessa no Melhor Envio
async function cancelShipment(
  baseUrl: string,
  headers: Record<string, string>,
  order: any,
  supabase: any,
  tenant_id: string
) {
  const shipmentId = order.melhor_envio_shipment_id;
  
  if (!shipmentId) {
    return new Response(
      JSON.stringify({ success: false, error: "Pedido não possui remessa no Melhor Envio para cancelar" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[melhor-envio-labels] Cancelando remessa:", shipmentId);

  const cancelPayload = {
    order: {
      id: shipmentId,
      reason_id: 2, // Motivo padrão para cancelamento via API
      description: "Cancelamento solicitado pelo sistema OrderZaps"
    }
  };

  const response = await fetch(`${baseUrl}/me/shipment/cancel`, {
    method: "POST",
    headers,
    body: JSON.stringify(cancelPayload)
  });

  const responseText = await response.text();
  console.log("[melhor-envio-labels] Cancel response status:", response.status);
  console.log("[melhor-envio-labels] Cancel response:", responseText);

  await saveIntegrationLog(
    supabase,
    tenant_id,
    order.id,
    "cancel_shipment",
    response.status,
    cancelPayload,
    responseText,
    !response.ok ? responseText : undefined
  );

  if (!response.ok) {
    let errorMessage = "Erro ao cancelar remessa";
    try {
      const errorData = JSON.parse(responseText);
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      errorMessage = responseText || errorMessage;
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Limpar o shipment_id do pedido para permitir nova remessa
  await supabase
    .from("orders")
    .update({ 
      melhor_envio_shipment_id: null,
      melhor_envio_tracking_code: null 
    })
    .eq("id", order.id);

  console.log("[melhor-envio-labels] Remessa cancelada e pedido atualizado");

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Remessa cancelada com sucesso. Você pode criar uma nova remessa."
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
