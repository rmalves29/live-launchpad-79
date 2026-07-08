// Webhook Frenet: recebe notificações de etiqueta gerada / rastreio atualizado.
// Ao preencher melhor_envio_tracking_code, o trigger trg_send_tracking_whatsapp
// dispara automaticamente a mensagem de "pedido enviado".
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-frenet-signature, token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extrai valores de campos aceitando várias grafias possíveis do payload Frenet
function pick(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    const lower = k.toLowerCase();
    for (const kk of Object.keys(obj)) {
      if (kk.toLowerCase() === lower && obj[kk] !== undefined && obj[kk] !== null && obj[kk] !== "") {
        return obj[kk];
      }
    }
  }
  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Health-check
    if (req.method === "GET") {
      return json({ ok: true, service: "frenet-webhook" });
    }

    const bodyText = await req.text();
    console.log("[frenet-webhook] body:", bodyText.substring(0, 800));

    let payload: any = {};
    try { payload = JSON.parse(bodyText); } catch { payload = {}; }

    // Frenet pode enviar um objeto simples ou array de eventos
    const events: any[] = Array.isArray(payload) ? payload : [payload];

    const results: any[] = [];

    for (const ev of events) {
      // Nós do payload podem estar aninhados em Data / Order / Shipment
      const root = ev || {};
      const nested = pick(root, ["Data", "data", "Order", "order", "Shipment", "shipment"]) || {};
      const merged = { ...nested, ...root };

      const orderNumberRaw = pick(merged, [
        "OrderNumber", "orderNumber", "OrderId", "orderId", "Id", "id",
        "PlatformOrderId", "ExternalOrderId", "OrderReference", "orderReference",
      ]);
      const trackingCode = pick(merged, [
        "TrackingNumber", "trackingNumber", "Tracking", "tracking",
        "TrackingCode", "trackingCode",
      ]);
      const shipmentId = pick(merged, [
        "ShipmentId", "shipmentId", "ShipmentNumber", "shipmentNumber",
        "FrenetOrderId", "InvoiceNumber",
      ]);
      const labelUrl = pick(merged, [
        "LabelUrl", "labelUrl", "PrintUrl", "printUrl", "Url", "url",
      ]);
      const status = pick(merged, ["Status", "status", "Event", "event"]);

      // Casar pedido por prefixo PED-{id} ou por shipment_id salvo
      let orderId: number | null = null;
      if (typeof orderNumberRaw === "string") {
        const m = orderNumberRaw.match(/(\d+)/);
        if (m) orderId = Number(m[1]);
      } else if (typeof orderNumberRaw === "number") {
        orderId = orderNumberRaw;
      }

      let order: any = null;
      if (orderId) {
        const { data } = await supabase
          .from("orders")
          .select("id, tenant_id, melhor_envio_tracking_code, melhor_envio_shipment_id, observation")
          .eq("id", orderId)
          .maybeSingle();
        order = data;
      }
      if (!order && shipmentId) {
        const { data } = await supabase
          .from("orders")
          .select("id, tenant_id, melhor_envio_tracking_code, melhor_envio_shipment_id, observation")
          .in("melhor_envio_shipment_id", [`frenet_${shipmentId}`, `frenet_manual_${shipmentId}`])
          .maybeSingle();
        order = data;
      }
      if (!order && trackingCode) {
        const { data } = await supabase
          .from("orders")
          .select("id, tenant_id, melhor_envio_tracking_code, melhor_envio_shipment_id, observation")
          .eq("melhor_envio_tracking_code", trackingCode)
          .maybeSingle();
        order = data;
      }

      if (!order) {
        await supabase.from("webhook_logs").insert({
          webhook_type: "frenet_webhook_orphan",
          status_code: 200,
          payload: { orderNumberRaw, shipmentId, trackingCode, status },
          response: bodyText.substring(0, 4000),
        });
        results.push({ matched: false, orderNumberRaw, shipmentId });
        continue;
      }

      const updates: Record<string, any> = {};
      if (trackingCode && trackingCode !== order.melhor_envio_tracking_code) {
        updates.melhor_envio_tracking_code = String(trackingCode);
      }
      if (shipmentId && (!order.melhor_envio_shipment_id || order.melhor_envio_shipment_id.startsWith("frenet_manual_"))) {
        updates.melhor_envio_shipment_id = `frenet_${shipmentId}`;
      }
      if (labelUrl && !(order.observation || "").includes(labelUrl)) {
        const clean = (order.observation || "").replace(/\n?\[Frenet: gerar etiqueta manualmente[^\]]*\]/g, "").trim();
        updates.observation = `${clean}\n[Frenet: ${shipmentId || order.id} | ${labelUrl}]`.trim();
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("orders").update(updates).eq("id", order.id);
      }

      await supabase.from("webhook_logs").insert({
        tenant_id: order.tenant_id,
        webhook_type: `frenet_${status || "update"}`,
        status_code: 200,
        payload: { order_id: order.id, trackingCode, shipmentId, status, labelUrl },
        response: bodyText.substring(0, 4000),
      });

      results.push({ matched: true, order_id: order.id, tracking_updated: !!updates.melhor_envio_tracking_code });
    }

    return json({ success: true, results });
  } catch (e: any) {
    console.error("[frenet-webhook] erro:", e);
    return json({ success: false, error: e.message }, 200);
  }
});
