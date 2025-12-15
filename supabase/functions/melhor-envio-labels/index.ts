import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, tenant_id } = await req.json();
    
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar integração do Melhor Envio
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "melhor_envio")
      .single();

    if (integrationError || !integration) {
      console.error("[melhor-envio-labels] Integração não encontrada:", integrationError);
      return new Response(
        JSON.stringify({ success: false, error: "Configuração de frete não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token do Melhor Envio não configurado" }),
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
      console.error("[melhor-envio-labels] Tenant não encontrado:", tenantError);
      return new Response(
        JSON.stringify({ success: false, error: "Dados da empresa não encontrados" }),
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
        return await createShipment(baseUrl, headers, order, tenant, integration, supabase);
      
      case "buy_shipment":
        return await buyShipment(baseUrl, headers, order, supabase);
      
      case "get_label":
        return await getLabel(baseUrl, headers, order, supabase);
      
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
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
  supabase: any
) {
  console.log("[melhor-envio-labels] Criando remessa para pedido:", order.id);

  // Validar dados do remetente
  if (!tenant.company_cep || !tenant.company_name) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Dados da empresa incompletos. Configure o CEP e nome da empresa nas configurações." 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validar dados do destinatário
  if (!order.customer_cep || !order.customer_name || !order.customer_street) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Dados de endereço do cliente incompletos." 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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

  // Montar payload da remessa
  const shipmentPayload = {
    service: 1, // PAC (pode ser configurável)
    agency: null,
    from: {
      name: tenant.company_name,
      phone: cleanPhone(tenant.company_phone || tenant.phone),
      email: tenant.company_email || tenant.email || "",
      document: cleanDocument(tenant.company_document),
      company_document: cleanDocument(tenant.company_document),
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
      document: "",
      company_document: "",
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
        unitary_value: Number(order.total_amount) / totalVolumes
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
      insurance_value: Number(order.total_amount),
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

  // Salvar ID da remessa no pedido (se houver campo)
  // Por enquanto apenas retornamos sucesso
  console.log("[melhor-envio-labels] Remessa criada:", shipmentData);

  return new Response(
    JSON.stringify({ 
      success: true, 
      shipment: shipmentData,
      message: "Remessa adicionada ao carrinho do Melhor Envio"
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function buyShipment(
  baseUrl: string, 
  headers: Record<string, string>, 
  order: any,
  supabase: any
) {
  console.log("[melhor-envio-labels] Comprando frete para pedido:", order.id);

  // Buscar remessas no carrinho
  const cartResponse = await fetch(`${baseUrl}/me/cart`, {
    method: "GET",
    headers
  });

  if (!cartResponse.ok) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao buscar carrinho" }),
      { status: cartResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const cartData = await cartResponse.json();
  console.log("[melhor-envio-labels] Carrinho:", cartData);

  if (!cartData || cartData.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "Carrinho vazio. Crie uma remessa primeiro." }),
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
  supabase: any
) {
  console.log("[melhor-envio-labels] Gerando etiqueta para pedido:", order.id);

  // Buscar remessas compradas
  const shipmentsResponse = await fetch(`${baseUrl}/me/orders?status=released,posted`, {
    method: "GET",
    headers
  });

  if (!shipmentsResponse.ok) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao buscar remessas" }),
      { status: shipmentsResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const shipmentsData = await shipmentsResponse.json();
  console.log("[melhor-envio-labels] Remessas:", shipmentsData);

  // Encontrar a remessa relacionada ao pedido (pela tag ou referência)
  let shipmentId = null;
  
  if (shipmentsData.data && shipmentsData.data.length > 0) {
    // Buscar pela tag que contém o ID do pedido
    const matchingShipment = shipmentsData.data.find((s: any) => {
      const tags = s.tags || [];
      return tags.some((tag: any) => 
        tag.tag?.includes(order.unique_order_id) || 
        tag.tag?.includes(`Pedido ${order.id}`)
      );
    });

    if (matchingShipment) {
      shipmentId = matchingShipment.id;
    } else {
      // Pegar a remessa mais recente como fallback
      shipmentId = shipmentsData.data[0]?.id;
    }
  }

  if (!shipmentId) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Nenhuma remessa encontrada. Compre o frete primeiro." 
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Gerar etiqueta
  const generateResponse = await fetch(`${baseUrl}/me/shipment/generate`, {
    method: "POST",
    headers,
    body: JSON.stringify({ orders: [shipmentId] })
  });

  if (!generateResponse.ok) {
    const errorText = await generateResponse.text();
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao gerar etiqueta: " + errorText }),
      { status: generateResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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

  if (!printResponse.ok) {
    const errorText = await printResponse.text();
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao imprimir etiqueta: " + errorText }),
      { status: printResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const printData = await printResponse.json();
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
