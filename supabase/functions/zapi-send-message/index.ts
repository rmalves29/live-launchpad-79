import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { simulateTyping } from "../_shared/anti-block-delay.ts";
import {
  sendText as evoSendText,
  sendImage as evoSendImage,
  sendDocument as evoSendDocument,
  sendPresenceAvailable,
  sendPresenceComposing,
  calcTypingDuration,
} from "../_shared/evolution-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface SendMessageRequest {
  tenant_id: string;
  phone: string;
  message: string;
  mediaUrl?: string;
  caption?: string;
  messageType?: "text" | "image" | "document";
}

async function getCredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, evolution_instance_name, provider, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[zapi-send-message] Error fetching credentials:", error);
    return { error: "Erro ao buscar credenciais" };
  }
  if (!data) return { error: "Integracao WhatsApp nao configurada" };

  const provider = data.provider || "zapi";
  if (provider === "evolution") {
    if (!data.evolution_instance_name) return { error: "evolution_instance_name nao configurado" };
    return { provider: "evolution" as const, instanceName: data.evolution_instance_name };
  }
  if (!data.zapi_instance_id || !data.zapi_token) return { error: "Credenciais Z-API incompletas" };
  return {
    provider: "zapi" as const,
    instanceId: data.zapi_instance_id,
    token: data.zapi_token,
    clientToken: data.zapi_client_token || "",
  };
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
  return cleaned;
}

// Detect group identifiers (Z-API: "<id>-group", Evolution/WA: "<id>@g.us")
function isGroupJid(phone: string): boolean {
  return phone.includes("@g.us") || /-group$/i.test(phone);
}

// Normalize group JID for each provider
function normalizeGroupJid(phone: string, provider: "zapi" | "evolution"): string {
  const id = phone.replace("@g.us", "").replace(/-group$/i, "");
  if (provider === "evolution") return id + "@g.us";
  return id + "-group"; // Z-API native format
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const timestamp = new Date().toISOString();

  try {
    const body: SendMessageRequest = await req.json();
    const { tenant_id, phone, message, mediaUrl, caption, messageType = "text" } = body;

    if (!tenant_id || !phone || !message) {
      return new Response(JSON.stringify({ error: "tenant_id, phone e message sao obrigatorios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const isGroup = phone.includes("@g.us") || phone.includes("-");
    if (!isGroup) {
      const { data: tenantRow } = await supabase.from("tenants").select("whatsapp_provider, slug").eq("id", tenant_id).maybeSingle();
      const slug = (tenantRow as any)?.slug;
      const wp = (tenantRow as any)?.whatsapp_provider;
      if (wp === "official" && slug === "orderzap") {
        const { data: routed, error: routedErr } = await supabase.functions.invoke("whatsapp-official-send", { body: { tenant_id, phone, message, mediaUrl, caption, messageType } });
        if (!routedErr && routed) return new Response(JSON.stringify(routed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        console.error("[zapi-send-message] Official API failed:", routedErr?.message);
      }
    }

    const credentials = await getCredentials(supabase, tenant_id);
    if ("error" in credentials) {
      return new Response(JSON.stringify({ error: credentials.error, sent: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const formattedPhone = formatPhoneNumber(phone);
    let sendOk = false;
    let zapiMessageId: string | null = null;
    let zapiZaapId: string | null = null;

    if (credentials.provider === "evolution") {
      await sendPresenceAvailable(credentials.instanceName, formattedPhone);
      await sendPresenceComposing(credentials.instanceName, formattedPhone, calcTypingDuration(message.length));
      let result: { success: boolean; error?: string };
      if (messageType === "image" && mediaUrl) {
        result = await evoSendImage(credentials.instanceName, formattedPhone, mediaUrl, caption);
      } else if (messageType === "document" && mediaUrl) {
        result = await evoSendDocument(credentials.instanceName, formattedPhone, mediaUrl);
      } else {
        result = await evoSendText(credentials.instanceName, formattedPhone, message);
      }
      sendOk = result.success;
    } else {
      await simulateTyping(credentials.instanceId, credentials.token, credentials.clientToken, formattedPhone);
      const baseUrl = ZAPI_BASE_URL + "/instances/" + credentials.instanceId + "/token/" + credentials.token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (credentials.clientToken) headers["Client-Token"] = credentials.clientToken;

      let response: Response;
      if (messageType === "image") {
        if (!mediaUrl) return new Response(JSON.stringify({ error: "mediaUrl obrigatorio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        response = await fetch(baseUrl + "/send-image", { method: "POST", headers, body: JSON.stringify({ phone: formattedPhone, image: mediaUrl, caption: caption || "" }) });
      } else if (messageType === "document") {
        if (!mediaUrl) return new Response(JSON.stringify({ error: "mediaUrl obrigatorio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        response = await fetch(baseUrl + "/send-document", { method: "POST", headers, body: JSON.stringify({ phone: formattedPhone, document: mediaUrl }) });
      } else {
        response = await fetch(baseUrl + "/send-text", { method: "POST", headers, body: JSON.stringify({ phone: formattedPhone, message }) });
      }

      const responseText = await response.text();
      sendOk = response.ok;
      try {
        const rd = JSON.parse(responseText);
        zapiMessageId = rd.messageId || rd.zapiMessageId || null;
        zapiZaapId = rd.zaapId || rd.id || null;
      } catch {}
    }

    try {
      await supabase.from("whatsapp_messages").insert({
        tenant_id,
        phone: formattedPhone,
        message: message.substring(0, 500),
        type: "outgoing",
        sent_at: new Date().toISOString(),
        zapi_message_id: zapiMessageId,
        zapi_zaap_id: zapiZaapId,
        delivery_status: sendOk ? "SENT" : "FAILED",
      });
    } catch (logError) {
      console.error("[zapi-send-message] Error logging:", logError);
    }

    return new Response(
      JSON.stringify({ sent: sendOk, phone: formattedPhone, messageId: zapiMessageId, zaapId: zapiZaapId }),
      { status: sendOk ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Erro interno: " + error.message, sent: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
