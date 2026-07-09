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
      return json({ success: true, services: data?.ShippingSeviceAvailableArray || data?.ShippingServiceAvailableArray || data?.Services || data?.services || [] }, 200);
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
      case "get_label":
        return await getLabel(order);
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
  const cleanDoc = (v: string) => (v || "").replace(/\D/g, "");

  const { data: items } = await supabase.from("cart_items").select("*").eq("cart_id", order.cart_id);

  let totalWeight = 0.3;
  if (items && items.length) totalWeight = items.reduce((s: number, i: any) => s + 0.3 * (i.qty || 1), 0);
  const totalValue = Math.max(Math.round(order.total_amount) / 100, 1);

  // Detectar service code — override, prefixo em observation, ou cotação
  let serviceCode = serviceCodeOverride;
  if (!serviceCode) {
    const m = (order.observation || "").match(/\[FRENET_SERVICE:([^\]]+)\]/);
    if (m) serviceCode = m[1];
  }
  if (!serviceCode) {
    try {
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
      const qd = JSON.parse(await quoteResp.text());
      const arr = qd.ShippingSevicesArray || qd.ShippingServicesArray || [];
      const valid = arr.filter((s: any) => s.ShippingPrice && s.Error !== true);
      valid.sort((a: any, b: any) => Number(String(a.ShippingPrice).replace(",", ".")) - Number(String(b.ShippingPrice).replace(",", ".")));
      serviceCode = valid[0]?.ServiceCode;
    } catch {}
  }

  const partnerToken = Deno.env.get("FRENET_PARTNER_TOKEN") || "";

  // Payload no formato Frenet WhiteLabel Orders API (v1)
  const items_arr = (items || []).map((it: any, idx: number) => ({
    ItemId: String(it.id ?? idx + 1),
    ProductId: String(it.product_id ?? it.product_code ?? idx + 1),
    Weight: 0.3,
    Length: 16,
    Height: 2,
    Width: 12,
    Quantity: Number(it.qty || 1),
    Price: Number(it.unit_price || 0) / 100,
    ProductName: it.product_name || "Produto",
    SKU: String(it.product_code || ""),
  }));

  const shipmentPayload = {
    Order: {
      Id: `PED-${order.id}`,
      Value: totalValue,
      Created: new Date().toISOString(),
      UseFrenetRegistration: true,
      Items: items_arr.length ? items_arr : [{
        ItemId: "1", ProductId: "1", Weight: totalWeight, Length: 20, Height: 2, Width: 16,
        Quantity: 1, Price: totalValue, ProductName: "Pedido", SKU: `PED-${order.id}`,
      }],
      To: {
        Name: order.customer_name || "Cliente",
        Email: "",
        Phone: cleanPhone(order.customer_phone),
        Cellphone: cleanPhone(order.customer_phone),
        Document: cleanDoc(order.customer_cpf || ""),
        Address: {
          ZipCode: cleanCep(order.customer_cep),
          City: order.customer_city || "",
          Street: order.customer_street || "",
          AddressNumber: order.customer_number || "S/N",
          AddressComplement: order.customer_complement || "",
          AddressQuarter: order.customer_neighborhood || "Centro",
          AddressState: order.customer_state || "",
          Country: "BR",
        },
      },
    },
    Volumes: {
      Weight: totalWeight,
      Length: 20,
      Height: 2,
      Width: 16,
      Price: totalValue,
      DeclaredValue: totalValue,
    },
    ...(serviceCode ? { Quotation: { ServiceCode: serviceCode } } : {}),
  };

  const payload = [shipmentPayload];

  // Sem partner-token, não é possível gerar etiqueta programaticamente na Frenet.
  // Retornamos sucesso com URL do painel para geração manual.
  if (!partnerToken) {
    const panelUrl = "https://painel.frenet.com.br/Order/List";
    await supabase
      .from("orders")
      .update({
        melhor_envio_shipment_id: `frenet_manual_${order.id}`,
        observation: `${order.observation || ""}\n[Frenet: gerar etiqueta manualmente em ${panelUrl}]`.trim(),
      })
      .eq("id", order.id);
    await log(supabase, order.tenant_id, order.id, "create_shipping", 200, payload, "Sem FRENET_PARTNER_TOKEN — geração manual pelo painel", undefined);
    return json({
      success: true,
      manual: true,
      label_url: panelUrl,
      message: "A Frenet exige geração manual da etiqueta pelo painel. Abra o painel Frenet, localize o pedido e imprima a etiqueta.",
    }, 200);
  }

  const endpoint = integration.sandbox
    ? "https://whitelabel-hml.frenet.dev/v1/orders"
    : "https://whitelabel.frenet.dev/v1/orders";

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      token,
      "x-partner-token": partnerToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();
  console.log("[frenet-labels] Orders status:", resp.status, "body:", text.substring(0, 500));

  await log(supabase, order.tenant_id, order.id, "create_shipping", resp.status, payload, text, resp.ok ? undefined : text.substring(0, 500));

  if (!resp.ok) {
    let msg = `Frenet respondeu ${resp.status}`;
    try {
      const errBody = JSON.parse(text);
      msg = errBody.Message || errBody.message || msg;
      if (errBody.Details?.[0]?.Message) msg += ` — ${errBody.Details[0].Message}`;
    } catch {}
    return json({ success: false, error: msg, details: text.substring(0, 500) }, 200);
  }

  let result: any = {};
  try { result = JSON.parse(text); } catch {}
  const first = Array.isArray(result?.Results) ? result.Results[0] : (Array.isArray(result) ? result[0] : result);
  const shipmentId = first?.ShipmentId || first?.OrderId || `${order.id}`;
  const trackingCode = first?.TrackingNumber || null;
  const labelUrl = first?.LabelUrl || first?.PrintUrl || null;

  await supabase
    .from("orders")
    .update({
      melhor_envio_shipment_id: `frenet_${shipmentId}`,
      melhor_envio_tracking_code: trackingCode,
      observation: `${order.observation || ""}\n[Frenet: ${shipmentId}${labelUrl ? ` | ${labelUrl}` : ""}]`.trim(),
    })
    .eq("id", order.id);

  return json({
    success: true,
    shipment_id: shipmentId,
    tracking_code: trackingCode,
    label_url: labelUrl,
    message: "Envio criado no Frenet",
  }, 200);
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

async function getLabel(order: any) {
  // Extrai URL de etiqueta salva na observação (formato "[Frenet: <id> | <url>]")
  const obs = order.observation || "";
  const match = obs.match(/\[Frenet:[^\]]*\|\s*(https?:\/\/[^\s\]]+)\s*\]/);
  if (match) {
    return json({ success: true, data: { url: match[1] } }, 200);
  }
  // Fallback: painel Frenet para geração manual
  return json({
    success: true,
    data: { url: "https://painel.frenet.com.br/Order/List" },
    manual: true,
    message: "Abra o painel Frenet, localize o pedido e imprima a etiqueta.",
  }, 200);
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
