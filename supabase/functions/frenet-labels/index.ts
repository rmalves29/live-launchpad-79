import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function log(
  supabase: any,
  tenant_id: string,
  order_id: number | null,
  action: string,
  status_code: number,
  request_payload: any,
  response_body: string,
  error_message?: string,
) {
  try {
    await supabase.from("webhook_logs").insert({
      tenant_id,
      webhook_type: `frenet_${action}`,
      status_code,
      payload: { order_id, action, request: request_payload },
      response: response_body?.substring(0, 10000),
      error_message,
    });
  } catch (e) {
    console.error("[frenet-labels] Log error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, order_id, tenant_id, service_code } = body;
    console.log("[frenet-labels] Request:", { action, order_id, tenant_id, service_code });

    if (!tenant_id) return json({ success: false, error: "tenant_id obrigatório" }, 400);
    if (!action) return json({ success: false, error: "action obrigatório" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "frenet")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) return json({ success: false, error: "Integração Frenet não encontrada" }, 200);
    if (!integration.access_token) return json({ success: false, error: "Token Frenet ausente" }, 200);

    const token = integration.access_token;

    if (action === "list_services") {
      const r = await fetch("https://api.frenet.com.br/shipping/info", {
        method: "GET",
        headers: { token, Accept: "application/json" },
      });
      const text = await r.text();
      if (!r.ok) return json({ success: false, error: "Erro Frenet /shipping/info", details: text }, 200);
      const data = JSON.parse(text);
      return json({ success: true, services: data?.Services || data?.services || [] }, 200);
    }

    if (!order_id) return json({ success: false, error: "order_id obrigatório" }, 400);

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (!order) return json({ success: false, error: "Pedido não encontrado" }, 404);

    const { data: tenant } = await supabase.from("tenants").select("*").eq("id", tenant_id).single();

    switch (action) {
      case "create_shipping":
        return await createShipping(supabase, integration, order, tenant, token, service_code);
      case "get_tracking":
        return await getTracking(supabase, integration, order, token);
      case "cancel_shipping":
        return await cancelShipping(supabase, order);
      default:
        return json({ success: false, error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (error: any) {
    console.error("[frenet-labels] Error:", error);
    return json({ success: false, error: error.message }, 200);
  }
});

async function createShipping(
  supabase: any,
  integration: any,
  order: any,
  tenant: any,
  token: string,
  serviceCodeOverride?: string,
) {
  const cleanCep = (v: string) => (v || "").replace(/\D/g, "");
  const cleanPhone = (v: string) => (v || "").replace(/\D/g, "");

  const { data: items } = await supabase.from("cart_items").select("*").eq("cart_id", order.cart_id);

  let totalWeight = 0.3;
  if (items && items.length) totalWeight = items.reduce((s: number, i: any) => s + 0.3 * (i.qty || 1), 0);
  const totalValue = Math.max(Math.round(order.total_amount) / 100, 1);

  // Detectar service code — do override, ou do prefixo em observation, ou primeiro da cotação
  let serviceCode = serviceCodeOverride;
  if (!serviceCode) {
    const m = (order.observation || "").match(/\[FRENET_SERVICE:([^\]]+)\]/);
    if (m) serviceCode = m[1];
  }

  if (!serviceCode) {
    // Fallback: cotar e pegar o mais barato
    const quoteResp = await fetch("https://api.frenet.com.br/shipping/quote", {
      method: "POST",
      headers: { token, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        SellerCEP: cleanCep(integration.from_cep),
        RecipientCEP: cleanCep(order.customer_cep),
        ShipmentInvoiceValue: totalValue,
        ShippingItemArray: [{ Height: 2, Length: 20, Width: 16, Weight: totalWeight, Quantity: 1 }],
        RecipientCountry: "BR",
      }),
    });
    const qt = await quoteResp.text();
    try {
      const qd = JSON.parse(qt);
      const arr = qd.ShippingSevicesArray || qd.ShippingServicesArray || [];
      const valid = arr.filter((s: any) => s.ShippingPrice && s.Error !== true);
      valid.sort((a: any, b: any) => Number(String(a.ShippingPrice).replace(",", ".")) - Number(String(b.ShippingPrice).replace(",", ".")));
      serviceCode = valid[0]?.ServiceCode;
    } catch {}
  }

  if (!serviceCode) {
    return json({ success: false, error: "Não foi possível determinar o serviço Frenet" }, 200);
  }

  // Dispatch (criação de envio)
  const payload = {
    ShippingSeviceCode: serviceCode, // Frenet usa esta grafia
    ShipmentInvoice: `PED-${order.id}`,
    ShipmentInvoiceValue: totalValue,
    ShippingItemArray: [{ Height: 2, Length: 20, Width: 16, Weight: totalWeight, Quantity: 1 }],
    Sender: {
      CompanyName: tenant.company_name || tenant.name,
      Address: tenant.company_address || "",
      AddressNumber: tenant.company_number || "S/N",
      AddressComplement: "",
      District: tenant.company_district || "",
      City: tenant.company_city || "",
      State: tenant.company_state || "",
      PostalCode: cleanCep(integration.from_cep),
      Country: "BR",
      Email: tenant.email || "",
      Phone: cleanPhone(tenant.company_phone || tenant.phone),
    },
    Recipient: {
      Name: order.customer_name || "Cliente",
      Address: order.customer_street || "",
      AddressNumber: order.customer_number || "S/N",
      AddressComplement: order.customer_complement || "",
      District: order.customer_neighborhood || "",
      City: order.customer_city || "",
      State: order.customer_state || "",
      PostalCode: cleanCep(order.customer_cep),
      Country: "BR",
      Phone: cleanPhone(order.customer_phone),
    },
  };

  const resp = await fetch("https://api.frenet.com.br/shipping/dispatch", {
    method: "POST",
    headers: { token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  console.log("[frenet-labels] Dispatch status:", resp.status, "body:", text.substring(0, 500));

  await log(supabase, order.tenant_id, order.id, "create_shipping", resp.status, payload, text, resp.ok ? undefined : text.substring(0, 500));

  if (!resp.ok) {
    return json({ success: false, error: "Erro ao criar envio Frenet", details: text }, 200);
  }

  let result: any = {};
  try {
    result = JSON.parse(text);
  } catch {}

  const shipmentId = result.ShippingId || result.OrderNumber || result.TrackingNumber || `${order.id}`;
  const trackingCode = result.TrackingNumber || result.Tracking || null;
  const labelUrl = result.LabelUrl || result.PrintUrl || null;

  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: `frenet_${shipmentId}`,
      melhor_envio_tracking_code: trackingCode,
      observation: `${order.observation || ""}\n[Frenet: ${shipmentId}${labelUrl ? ` | ${labelUrl}` : ""}]`.trim(),
    })
    .eq("id", order.id);

  return json(
    { success: true, shipment_id: shipmentId, tracking_code: trackingCode, label_url: labelUrl, message: "Envio criado no Frenet" },
    200,
  );
}

async function getTracking(supabase: any, integration: any, order: any, token: string) {
  const shipmentId: string = order.melhor_envio_shipment_id || "";
  const tracking: string = order.melhor_envio_tracking_code || "";
  if (!shipmentId.startsWith("frenet_") && !tracking) {
    return json({ success: false, error: "Pedido sem envio Frenet" }, 400);
  }

  const payload = {
    ShippingServiceCode: (order.observation?.match(/\[FRENET_SERVICE:([^\]]+)\]/) || [])[1] || "",
    TrackingNumber: tracking || shipmentId.replace("frenet_", ""),
  };

  const resp = await fetch("https://api.frenet.com.br/tracking/trackinginfo", {
    method: "POST",
    headers: { token, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();

  if (!resp.ok) return json({ success: false, error: "Erro rastreio Frenet", details: text }, 200);

  const data = JSON.parse(text);
  const events = data.TrackingEvents || data.trackingEvents || [];

  // Atualizar tracking code se retornou algo diferente
  const newTracking = data.TrackingNumber || tracking;
  if (newTracking && newTracking !== order.melhor_envio_tracking_code) {
    await supabase.from("orders").update({ melhor_envio_tracking_code: newTracking }).eq("id", order.id);
  }

  return json({ success: true, tracking: { code: newTracking, events, raw: data } }, 200);
}

async function cancelShipping(supabase: any, order: any) {
  // Frenet não expõe cancelamento público — limpar dados localmente
  await supabase
    .from("orders")
    .update({ melhor_envio_shipment_id: null, melhor_envio_tracking_code: null })
    .eq("id", order.id);
  return json({ success: true, message: "Envio Frenet cancelado localmente. Cancele também no painel Frenet se necessário." }, 200);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
