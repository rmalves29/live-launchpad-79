import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { simulateTyping } from "../_shared/anti-block-delay.ts";
import {
  sendText as uazSendText,
  sendImage as uazSendImage,
  sendDocument as uazSendDocument,
  sendPresenceAvailable,
  sendPresenceComposing,
  calcTypingDuration,
  type UazapiConfig,
} from "../_shared/uazapi-api.ts";

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

type Credentials =
  | { provider: "uazapi"; cfg: UazapiConfig }
  | { provider: "zapi"; instanceId: string; token: string; clientToken: string }
  | { error: string };

async function getCredentials(supabase: any, tenantId: string): Promise<Credentials> {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, provider, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { error: "Erro ao buscar credenciais" };
  if (!data) return { error: "Integração WhatsApp não configurada" };

  const provider = data.provider || "zapi";
  if (provider === "uazapi") {
    if (!data.uazapi_url || !data.uazapi_token) return { error: "Credenciais uazapi incompletas" };
    return { provider: "uazapi", cfg: { url: data.uazapi_url, token: data.uazapi_token } };
  }
  if (!data.zapi_instance_id || !data.zapi_token) return { error: "Credenciais Z-API incompletas" };
  return {
    provider: "zapi",
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

function isGroupJid(phone: string): boolean {
  return phone.includes("@g.us") || /-group$/i.test(phone);
}

function normalizeGroupJid(phone: string, provider: "zapi" | "uazapi"): string {
  const id = phone.replace("@g.us", "").replace(/-group$/i, "");
  if (provider === "uazapi") return id + "@g.us";
  return id + "-group"; // Z-API native format
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: SendMessageRequest = await req.json();
    const { tenant_id, phone, message, mediaUrl, caption, messageType = "text" } = body;

    if (!tenant_id || !phone || !message) {
      return new Response(JSON.stringify({ error: "tenant_id, phone e message são obrigatórios" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const isGroup = isGroupJid(phone);
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

    const formattedPhone = isGroup
      ? normalizeGroupJid(phone, credentials.provider)
      : formatPhoneNumber(phone);
    let sendOk = false;
    let zapiMessageId: string | null = null;
    let zapiZaapId: string | null = null;

    if (credentials.provider === "uazapi") {
      if (!isGroup) {
        await sendPresenceAvailable(credentials.cfg, formattedPhone);
        await (await import("../_shared/uazapi-api.ts")).runTypingSegments(credentials.cfg, formattedPhone, message.length);
      }
      let result: { success: boolean; messageId?: string; error?: string };
      if (messageType === "image" && mediaUrl) {
        result = await uazSendImage(credentials.cfg, formattedPhone, mediaUrl, caption);
      } else if (messageType === "document" && mediaUrl) {
        result = await uazSendDocument(credentials.cfg, formattedPhone, mediaUrl);
      } else {
        result = await uazSendText(credentials.cfg, formattedPhone, message);
      }
      sendOk = result.success;
      zapiMessageId = result.messageId || null;
      if (!sendOk) console.error("[zapi-send-message] uazapi error:", result.error, "| phone:", formattedPhone);
      else console.log("[zapi-send-message] uazapi OK | phone:", formattedPhone);
    } else {
      await simulateTyping(credentials.instanceId, credentials.token, credentials.clientToken, formattedPhone, message.length, true);
      const baseUrl = ZAPI_BASE_URL + "/instances/" + credentials.instanceId + "/token/" + credentials.token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (credentials.clientToken) headers["Client-Token"] = credentials.clientToken;

      let response: Response;
      if (messageType === "image") {
        if (!mediaUrl) return new Response(JSON.stringify({ error: "mediaUrl obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        response = await fetch(baseUrl + "/send-image", { method: "POST", headers, body: JSON.stringify({ phone: formattedPhone, image: mediaUrl, caption: caption || "" }) });
      } else if (messageType === "document") {
        if (!mediaUrl) return new Response(JSON.stringify({ error: "mediaUrl obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      } catch { /* ignore */ }
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
