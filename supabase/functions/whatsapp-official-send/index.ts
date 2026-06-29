import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v21.0";

interface SendBody {
  tenant_id: string;
  phone: string; // E.164 sem '+' ou com — normalizamos
  message?: string;
  template_name?: string;
  template_language?: string;
  template_components?: any[];
  mediaUrl?: string;
  caption?: string;
  messageType?: "text" | "image" | "document" | "template";
}

function normalizePhone(phone: string): string {
  let p = (phone || "").replace(/\D/g, "");
  p = p.replace(/^0+/, "");
  if (!p.startsWith("55")) p = "55" + p;
  return p;
}

async function isWithin24h(supabase: any, tenantId: string, phone: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("whatsapp_messages")
    .select("id, created_at")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .eq("type", "incoming")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as SendBody;
    const { tenant_id, phone } = body;
    let { messageType = "text", message, template_name, template_language, template_components, mediaUrl, caption } = body;

    if (!tenant_id || !phone) {
      return new Response(JSON.stringify({ success: false, error: "tenant_id e phone são obrigatórios" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: integ } = await supabase
      .from("integration_whatsapp_official")
      .select("phone_number_id, access_token, is_active")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!integ || !integ.is_active) {
      return new Response(JSON.stringify({ success: false, error: "Integração WhatsApp Oficial não configurada/ativa" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const to = normalizePhone(phone);

    // Janela 24h: se for envio livre e estiver fora da janela, tentamos template
    if (messageType !== "template") {
      const within = await isWithin24h(supabase, tenant_id, to);
      if (!within && !template_name) {
        return new Response(JSON.stringify({
          success: false,
          error: "Fora da janela de 24h. É necessário usar template aprovado.",
          requires_template: true,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!within && template_name) {
        messageType = "template";
      }
    }

    let payload: any;
    if (messageType === "text") {
      payload = { messaging_product: "whatsapp", to, type: "text", text: { body: message || "" } };
    } else if (messageType === "image") {
      payload = { messaging_product: "whatsapp", to, type: "image", image: { link: mediaUrl, caption: caption || "" } };
    } else if (messageType === "document") {
      payload = { messaging_product: "whatsapp", to, type: "document", document: { link: mediaUrl, caption: caption || "" } };
    } else if (messageType === "template") {
      payload = {
        messaging_product: "whatsapp", to, type: "template",
        template: {
          name: template_name,
          language: { code: template_language || "pt_BR" },
          components: template_components || [],
        },
      };
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${integ.phone_number_id}/messages`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${integ.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const respText = await resp.text();
    let data: any;
    try { data = JSON.parse(respText); } catch { data = { raw: respText }; }

    const ok = resp.ok && !data?.error;
    const waMsgId = data?.messages?.[0]?.id || null;

    try {
      await supabase.from("whatsapp_messages").insert({
        tenant_id, phone: to,
        message: (message || caption || template_name || "").toString().substring(0, 500),
        type: "outgoing",
        sent_at: new Date().toISOString(),
        zapi_message_id: waMsgId,
        delivery_status: ok ? "SENT" : "FAILED",
      });
    } catch (e) { console.error("[whatsapp-official-send] log error", e); }

    return new Response(JSON.stringify({
      success: ok, sent: ok, status: resp.status, phone: to,
      messageId: waMsgId, response: data,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[whatsapp-official-send] error", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
