import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USER_AGENT = "OrderZap (suporte@orderzaps.com)";

async function saveLog(
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
      webhook_type: `superfrete_${action}`,
      status_code,
      payload: { order_id, action, request: request_payload },
      response: response_body?.substring(0, 10000),
      error_message,
    });
  } catch (e) {
    console.error("[superfrete-labels] log error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, tenant_id } = await req.json();
    console.log("[superfrete-labels] Request:", { action, order_id, tenant_id });

    if (!tenant_id || !order_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id e order_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "superfrete")
      .eq("is_active", true)
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração SuperFrete não encontrada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (!order) {
      return new Response(
        JSON.stringify({ success: false, error: "Pedido não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenant_id)
      .single();

    if (!tenant) {
      return new Response(
        JSON.stringify({ success: false, error: "Dados do remetente não encontrados" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = integration.sandbox
      ? "https://sandbox.superfrete.com/api/v0"
      : "https://api.superfrete.com/api/v0";

    const baseUrlV1 = integration.sandbox
      ? "https://sandbox.superfrete.com/api/v1"
      : "https://api.superfrete.com/api/v1";

    const authHeaders = {
      Authorization: `Bearer ${integration.access_token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    switch (action) {
      case "create_order":
        return await createOrder(supabase, integration, order, tenant, baseUrl, baseUrlV1, authHeaders);
      case "get_tracking":
      case "get_status":
        return await getStatus(supabase, order, baseUrl, authHeaders);
      case "cancel_order":
      case "cancel_shipment":
        return await cancelOrder(supabase, order, baseUrl, authHeaders);
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("[superfrete-labels] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

const cleanPhone = (p: string) => p?.replace(/\D/g, "") || "";
const cleanCep = (c: string) => c?.replace(/\D/g, "") || "";

const SERVICE_NAME_TO_ID: Record<string, number> = {
  "PAC": 1,
  "SEDEX": 2,
  ".PACKAGE": 3,
  "JADLOG": 3,
  "JADLOG .PACKAGE": 3,
  "MINI ENVIOS": 17,
  "MINI": 17,
};

function detectServiceId(observation: string | null | undefined): number {
  if (!observation) return 1;
  const obs = observation.toUpperCase();
  if (obs.includes("SEDEX")) return 2;
  if (obs.includes("MINI")) return 17;
  if (obs.includes("JADLOG") || obs.includes(".PACKAGE")) return 3;
  return 1; // PAC default
}

async function createOrder(
  supabase: any,
  integration: any,
  order: any,
  tenant: any,
  baseUrl: string,
  baseUrlV1: string,
  authHeaders: Record<string, string>
) {
  // Buscar itens
  const { data: items } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", order.cart_id);

  // Buscar bairro do cliente
  const phoneClean = cleanPhone(order.customer_phone);
  const { data: customer } = await supabase
    .from("customers")
    .select("neighborhood, email, name")
    .eq("phone", phoneClean)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  const totalValueReais = Math.max(Math.round(order.total_amount) / 100, 1);
  const totalWeight = items && items.length > 0
    ? Math.max(items.reduce((s: number, it: any) => s + 0.3 * it.qty, 0), 0.3)
    : 0.3;

  const serviceId = detectServiceId(order.observation);
  console.log("[superfrete-labels] Detected service_id:", serviceId);

  const productsArr = (items && items.length > 0)
    ? items.map((it: any) => ({
        name: it.product_name || `Item #${it.product_id}`,
        quantity: String(it.qty),
        unitary_value: Number((it.unit_price / 100).toFixed(2)),
      }))
    : [{ name: `Pedido #${order.id}`, quantity: "1", unitary_value: totalValueReais }];

  const payload = {
    from: {
      name: tenant.company_name || tenant.name,
      address: tenant.company_address || "",
      district: tenant.company_district || "",
      city: tenant.company_city || "",
      state_abbr: tenant.company_state || "",
      postal_code: cleanCep(integration.from_cep),
      complement: tenant.company_complement || "",
    },
    to: {
      name: order.customer_name || customer?.name || "Cliente",
      address: order.customer_street || "",
      complement: "",
      district: customer?.neighborhood || "",
      city: order.customer_city || "",
      state_abbr: order.customer_state || "",
      postal_code: cleanCep(order.customer_cep),
      email: customer?.email || tenant.email || "no-reply@orderzaps.com",
    },
    service: serviceId,
    products: productsArr,
    volumes: { height: 2, width: 16, length: 20, weight: totalWeight },
    options: {
      insurance_value: totalValueReais,
      receipt: false,
      own_hand: false,
      reverse: false,
      non_commercial: true,
      tags: [{ tag: String(order.id), url: "" }],
    },
    platform: "OrderZap",
  };

  console.log("[superfrete-labels] Cart payload:", JSON.stringify(payload).substring(0, 500));

  // 1. Adicionar ao carrinho (gera a etiqueta)
  const cartResp = await fetch(`${baseUrl}/cart`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(payload),
  });
  const cartText = await cartResp.text();
  console.log("[superfrete-labels] Cart response:", cartResp.status, cartText.substring(0, 500));

  await saveLog(
    supabase,
    order.tenant_id,
    order.id,
    "create_order",
    cartResp.status,
    payload,
    cartText,
    cartResp.ok ? undefined : cartText.substring(0, 500)
  );

  if (!cartResp.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Erro ao criar etiqueta no SuperFrete",
        details: cartText,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const cartData = JSON.parse(cartText);
  const sfId = cartData.id;

  if (!sfId) {
    return new Response(
      JSON.stringify({ success: false, error: "SuperFrete não retornou id da etiqueta", details: cartText }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Finalizar (paga a etiqueta com saldo da carteira)
  const finalizeResp = await fetch(`${baseUrlV1}/orders/finalize`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ id: sfId }),
  });
  const finalizeText = await finalizeResp.text();
  console.log("[superfrete-labels] Finalize:", finalizeResp.status, finalizeText.substring(0, 300));

  await saveLog(
    supabase,
    order.tenant_id,
    order.id,
    "finalize_order",
    finalizeResp.status,
    { id: sfId },
    finalizeText,
    finalizeResp.ok ? undefined : finalizeText.substring(0, 500)
  );

  // Buscar info para obter tracking + url da etiqueta (mesmo se finalize falhar por saldo)
  const infoResp = await fetch(`${baseUrl}/order/info/${sfId}`, {
    method: "GET",
    headers: authHeaders,
  });
  const infoText = await infoResp.text();
  let infoData: any = {};
  try { infoData = JSON.parse(infoText); } catch {}

  const trackingCode = infoData.tracking || cartData.tracking || null;
  const labelUrl = infoData.print?.url || cartData.print?.url || null;

  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: `superfrete_${sfId}`,
      melhor_envio_tracking_code: trackingCode,
      observation: `${order.observation || ""}\n[SuperFrete: ${sfId}]${labelUrl ? `\n[Etiqueta: ${labelUrl}]` : ""}`.trim(),
    })
    .eq("id", order.id);

  return new Response(
    JSON.stringify({
      success: true,
      superfrete_order_id: sfId,
      tracking_code: trackingCode,
      label_url: labelUrl,
      finalized: finalizeResp.ok,
      message: finalizeResp.ok
        ? "Etiqueta criada e paga no SuperFrete"
        : "Etiqueta criada (pagamento pendente — verifique saldo)",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getStatus(
  supabase: any,
  order: any,
  baseUrl: string,
  authHeaders: Record<string, string>
) {
  const shipId = order.melhor_envio_shipment_id;
  if (!shipId || !shipId.startsWith("superfrete_")) {
    return new Response(
      JSON.stringify({ success: false, error: "Pedido não possui ID SuperFrete" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const sfId = shipId.replace("superfrete_", "");

  const resp = await fetch(`${baseUrl}/order/info/${sfId}`, {
    method: "GET",
    headers: authHeaders,
  });
  const text = await resp.text();
  console.log("[superfrete-labels] Info:", resp.status, text.substring(0, 300));

  if (!resp.ok) {
    return new Response(
      JSON.stringify({ success: false, error: "Erro ao buscar status", details: text }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const data = JSON.parse(text);
  if (data.tracking && data.tracking !== order.melhor_envio_tracking_code) {
    await supabase
      .from("orders")
      .update({ melhor_envio_tracking_code: data.tracking })
      .eq("id", order.id);
  }

  return new Response(
    JSON.stringify({
      success: true,
      tracking: data.tracking,
      status: data.status,
      label_url: data.print?.url || null,
      raw: data,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function cancelOrder(
  supabase: any,
  order: any,
  baseUrl: string,
  authHeaders: Record<string, string>
) {
  const shipId = order.melhor_envio_shipment_id;
  if (!shipId || !shipId.startsWith("superfrete_")) {
    return new Response(
      JSON.stringify({ success: false, error: "Pedido não possui ID SuperFrete" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const sfId = shipId.replace("superfrete_", "");

  const resp = await fetch(`${baseUrl}/order/cancel`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      order: { id: sfId },
      reason_id: "2",
      description: "Cancelado via OrderZap",
    }),
  });
  const text = await resp.text();
  console.log("[superfrete-labels] Cancel:", resp.status, text.substring(0, 300));

  // Limpa local independente
  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: null,
      melhor_envio_tracking_code: null,
    })
    .eq("id", order.id);

  return new Response(
    JSON.stringify({ success: true, message: "Pedido cancelado no SuperFrete", details: text }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
