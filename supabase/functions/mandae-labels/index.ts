import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Salvar logs na tabela webhook_logs (para aparecer em "Logs de Integração")
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
      webhook_type: `mandae_${action}`,
      status_code,
      payload: { order_id, action, request: request_payload },
      response: response_body?.substring(0, 10000),
      error_message,
    });
    console.log(`[mandae-labels] Log salvo: ${action} - Status ${status_code}`);
  } catch (logError) {
    console.error("[mandae-labels] Erro ao salvar log:", logError);
  }
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, tenant_id, debugShippingService, omitShippingService } = await req.json();
    
    console.log("[mandae-labels] Request:", { action, order_id, tenant_id, debugShippingService, omitShippingService });

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar integração Mandae
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "mandae")
      .eq("is_active", true)
      .single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Mandae não encontrada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: "Pedido não encontrado" }),
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
      return new Response(
        JSON.stringify({ success: false, error: "Dados do remetente não encontrados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  const baseUrl = integration.sandbox 
    ? "https://sandbox.api.mandae.com.br/v2" 
    : "https://api.mandae.com.br/v2";

  // Mandae API v2: Authorization header usa o token diretamente (sem Bearer)
  const authHeader = integration.access_token;

    switch (action) {
      case "create_order":
        return await createMandaeOrder(supabase, integration, order, tenant, baseUrl, authHeader, debugShippingService, omitShippingService);
      
      case "get_tracking":
        return await getTracking(supabase, integration, order, baseUrl, authHeader);
      
      case "cancel_order":
        return await cancelOrder(supabase, integration, order, baseUrl, authHeader);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error("[mandae-labels] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function createMandaeOrder(supabase: any, integration: any, order: any, tenant: any, baseUrl: string, authHeader: string, debugShippingService?: string, omitShippingService?: boolean) {
  console.log("[mandae-labels] Creating order for:", order.id, "| debugShippingService:", debugShippingService, "| omitShippingService:", omitShippingService);

  // Buscar itens do pedido
  const { data: items } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", order.cart_id);

  // Funções auxiliares
  const cleanPhone = (phone: string) => phone?.replace(/\D/g, '') || '';
  const cleanCep = (cep: string) => cep?.replace(/\D/g, '') || '';

  // Buscar dados do cliente para obter o bairro e e-mail (obrigatório no Mandae)
  const cleanPhoneForQuery = order.customer_phone?.replace(/\D/g, '') || '';
  const { data: customer } = await supabase
    .from("customers")
    .select("neighborhood, email, name")
    .eq("phone", cleanPhoneForQuery)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const customerNeighborhood = customer?.neighborhood || "";
  const recipientEmail = customer?.email || tenant.email || "no-reply@orderzap.app";
  const recipientName = order.customer_name || customer?.name || "Cliente";
  const recipientPhone = cleanPhone(order.customer_phone);

  console.log("[mandae-labels] Customer neighborhood:", customerNeighborhood);
  console.log("[mandae-labels] Recipient contact:", { recipientEmail, recipientName, recipientPhone });

  // Calcular peso e valor
  let totalWeight = 0.3;
  // total_amount já está em centavos, converter para reais (ex: 15000 centavos = 150.00 reais)
  let totalValue = Math.round(order.total_amount) / 100;
  // Garantir valor mínimo para evitar rejeição da API
  if (totalValue < 1) totalValue = 1;

  if (items && items.length > 0) {
    totalWeight = items.reduce((sum: number, item: any) => sum + (0.3 * item.qty), 0);
  }

  // Buscar ID dinâmico do serviço de frete via Rates API
  // A API Mandae exige o ID exato retornado pela cotação, não valores hardcoded
  const destinoCep = cleanCep(order.customer_cep);
  
  console.log("[mandae-labels] Fetching rates for CEP:", destinoCep);
  
  const ratesResponse = await fetch(`${baseUrl}/postalcodes/${destinoCep}/rates`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      postalCode: destinoCep,
      declaredValue: totalValue,
      weight: totalWeight,
      height: 2,
      width: 16,
      length: 20
    })
  });

  const ratesText = await ratesResponse.text();
  console.log("[mandae-labels] Rates API FULL response:", ratesText);

  // Parsear resposta da cotação
  // IMPORTANTE: A resposta tem formato { postalCode, shippingServices: [...] }
  // Cada shippingService tem: id (pode ser null), name ("Econômico" ou "Rápido"), days, price
  let ratesData: any = null;
  try {
    ratesData = JSON.parse(ratesText);
    console.log("[mandae-labels] Parsed rates:", JSON.stringify(ratesData, null, 2));
  } catch (e) {
    console.log("[mandae-labels] Could not parse rates response");
  }

  // Detectar se o pedido é Econômico ou Rápido pela observation
  const obs = (order.observation || "").toLowerCase();
  const isRapido = obs.includes("rápido") || obs.includes("rapido") || obs.includes("expresso");
  
  // ========== FUNÇÃO PARA CONVERTER shippingService ==========
  // Baseado no código Magento: usar minúsculo com acento
  function toMandaeShippingService(raw: string): string {
    return raw.trim().toLowerCase(); // "econômico" / "rápido"
  }
  
  // ========== DEBUG OVERRIDE ==========
  // Se debugShippingService for passado no body, usa ele diretamente (para testes)
  let shippingServiceValue: string;
  
  if (debugShippingService) {
    shippingServiceValue = debugShippingService;
    console.log("[mandae-labels] 🔧 DEBUG OVERRIDE shippingService:", shippingServiceValue);
  } else {
    // A API de cotação retorna { shippingServices: [...] }
    // Cada item tem: name ("Econômico" ou "Rápido")
    // Convertemos para minúsculo com acento como o Magento faz
    
    const shippingServices = ratesData?.shippingServices || [];
    const targetService = isRapido ? "rápido" : "econômico";
    
    const matchedService = shippingServices.find((s: any) => 
      s.name?.toLowerCase().includes(targetService)
    );
    
    console.log("[mandae-labels] Matched service:", JSON.stringify(matchedService));
    
    if (matchedService?.name) {
      // Converter para formato Magento: minúsculo com acento
      shippingServiceValue = toMandaeShippingService(matchedService.name);
      console.log("[mandae-labels] Using service name (lowercase):", shippingServiceValue);
    } else {
      // Fallback: usar valor padrão em minúsculo com acento
      shippingServiceValue = isRapido ? "rápido" : "econômico";
      console.log("[mandae-labels] Fallback shippingService:", shippingServiceValue);
    }
  }
  
  console.log("[mandae-labels] Final shippingService:", shippingServiceValue, "| isRapido:", isRapido);

  // Construir item do pedido - se omitShippingService=true, não inclui o campo
  const itemPayload: any = {
    skus: [{
      id: `order-${order.id}`,
      skuId: `order-${order.id}`,
      description: `Pedido #${order.id}`,
      quantity: 1,
      price: totalValue,
      freight: 0
    }],
    recipient: {
      fullName: recipientName,
      phone: recipientPhone,
      email: recipientEmail,
      receiptEmail: recipientEmail,
      address: {
        postalCode: cleanCep(order.customer_cep),
        street: order.customer_street || "",
        number: order.customer_number || "S/N",
        neighborhood: customerNeighborhood,
        city: order.customer_city || "",
        state: order.customer_state || "",
        country: "BR"
      }
    },
    dimensions: {
      height: 2,
      width: 16,
      length: 20,
      weight: totalWeight
    },
    channel: "ECOMMERCE"
  };

  // Só adiciona shippingService se não for omitido
  if (!omitShippingService) {
    itemPayload.shippingService = shippingServiceValue;
  } else {
    console.log("[mandae-labels] 🔧 OMITTING shippingService field from payload");
  }

  const orderPayload = {
    customerId: integration.client_id || tenant.id,
    scheduling: new Date().toISOString().split('T')[0],
    items: [itemPayload],
    sender: {
      fullName: tenant.company_name || tenant.name,
      phone: cleanPhone(tenant.company_phone || tenant.phone),
      address: {
        postalCode: cleanCep(integration.from_cep),
        street: tenant.company_address || "",
        number: tenant.company_number || "S/N",
        neighborhood: tenant.company_district || "",
        city: tenant.company_city || "",
        state: tenant.company_state || "",
        country: "BR"
      }
    }
  };

  console.log("[mandae-labels] Order payload:", JSON.stringify(orderPayload, null, 2));

  // CORRIGIDO: Usar endpoint /orders/add-parcel como o Magento faz
  const response = await fetch(`${baseUrl}/orders/add-parcel`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(orderPayload)
  });

  console.log("[mandae-labels] Using endpoint: /orders/add-parcel");

  const responseText = await response.text();
  console.log("[mandae-labels] Create response:", response.status, responseText.substring(0, 500));

  await saveIntegrationLog(
    supabase,
    order.tenant_id,
    order.id,
    "create_order",
    response.status,
    orderPayload,
    responseText,
    response.ok ? undefined : responseText.substring(0, 500)
  );

  if (!response.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Erro ao criar pedido no Mandae",
        details: responseText,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const result = JSON.parse(responseText);

  // Salvar ID do Mandae no pedido
  // Mandae retorna o ID do pedido criado
  const mandaeOrderId = result.id || result.orderId || result.trackingCode;
  const trackingCode = result.trackingCode || result.tracking || null;

  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: `mandae_${mandaeOrderId}`,
      melhor_envio_tracking_code: trackingCode,
      observation: `${order.observation || ''}\n[Mandae: ${mandaeOrderId}]`.trim()
    })
    .eq("id", order.id);

  return new Response(
    JSON.stringify({ 
      success: true, 
      mandae_order_id: mandaeOrderId,
      tracking_code: trackingCode,
      message: "Pedido criado no Mandae com sucesso"
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getTracking(supabase: any, integration: any, order: any, baseUrl: string, authHeader: string) {
  const shipmentId = order.melhor_envio_shipment_id;
  
  if (!shipmentId || !shipmentId.startsWith('mandae_')) {
    return new Response(
      JSON.stringify({ success: false, error: "Pedido não possui ID Mandae" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mandaeId = shipmentId.replace('mandae_', '');

  const response = await fetch(`${baseUrl}/trackings/${mandaeId}`, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json"
    }
  });

  const responseText = await response.text();
  console.log("[mandae-labels] Tracking response:", response.status, responseText.substring(0, 500));

  if (!response.ok) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Erro ao buscar rastreamento",
        details: responseText
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const result = JSON.parse(responseText);

  // Atualizar tracking code se disponível
  if (result.trackingCode && result.trackingCode !== order.melhor_envio_tracking_code) {
    await supabase
      .from("orders")
      .update({ melhor_envio_tracking_code: result.trackingCode })
      .eq("id", order.id);
  }

  return new Response(
    JSON.stringify({ 
      success: true, 
      tracking: result
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function cancelOrder(supabase: any, integration: any, order: any, baseUrl: string, authHeader: string) {
  const shipmentId = order.melhor_envio_shipment_id;
  
  if (!shipmentId || !shipmentId.startsWith('mandae_')) {
    return new Response(
      JSON.stringify({ success: false, error: "Pedido não possui ID Mandae" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const mandaeId = shipmentId.replace('mandae_', '');

  // Mandae usa DELETE para cancelar
  const response = await fetch(`${baseUrl}/orders/${mandaeId}`, {
    method: "DELETE",
    headers: {
      "Authorization": authHeader,
      "Accept": "application/json"
    }
  });

  console.log("[mandae-labels] Cancel response:", response.status);

  // Limpar dados do pedido independente do resultado
  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: null,
      melhor_envio_tracking_code: null
    })
    .eq("id", order.id);

  return new Response(
    JSON.stringify({ 
      success: true, 
      message: "Pedido cancelado no Mandae"
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
