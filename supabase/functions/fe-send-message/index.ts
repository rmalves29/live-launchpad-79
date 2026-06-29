import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendText as evoSendText,
  sendImageByUrl as evoSendImageByUrl,
  sendAudio as evoSendAudio,
  sendVideo as evoSendVideo,
  getGroupParticipants as evoGetGroupParticipants,
} from "../_shared/evolution-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface SendRequest {
  tenant_id: string;
  group_ids: string[];
  message_ids?: string[];
  content_type: "text" | "image" | "audio" | "video" | "video_note";
  content_text?: string;
  media_url?: string;
  mention_all?: boolean;
  async?: boolean;
}

async function getCredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, evolution_instance_name, provider")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  const provider = data.provider || "zapi";

  if (provider === "evolution") {
    if (!data.evolution_instance_name) return null;
    return { provider: "evolution", instanceName: data.evolution_instance_name };
  }

  if (!data.zapi_instance_id || !data.zapi_token) return null;
  return {
    provider: "zapi",
    instanceId: data.zapi_instance_id,
    token: data.zapi_token,
    clientToken: data.zapi_client_token || "",
  };
}

// ─── Z-API ───────────────────────────────────────────────────────────────────

async function getZapiGroupParticipants(baseUrl: string, clientToken: string, groupJid: string): Promise<string[]> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientToken) headers["Client-Token"] = clientToken;
    const phone = groupJid.replace("@g.us", "");
    const res = await fetch(baseUrl + "/group-metadata/" + phone, { method: "GET", headers });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.participants || [])
      .map((p: any) => (p.phone || p.id || "").replace("@c.us", "").replace(/\D/g, ""))
      .filter((p: string) => p.length > 0);
  } catch { return []; }
}

async function sendToGroupZapi(
  baseUrl: string,
  clientToken: string,
  groupJid: string,
  contentType: string,
  contentText?: string,
  mediaUrl?: string,
  mentionAll?: boolean
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;
  const phone = groupJid;

  let mentioned: string[] | undefined;
  if (mentionAll) {
    mentioned = await getZapiGroupParticipants(baseUrl, clientToken, groupJid);
    if (mentioned.length === 0) mentioned = undefined;
  }

  switch (contentType) {
    case "text": {
      const body: any = { phone, message: contentText };
      if (mentioned) body.mentioned = mentioned;
      return fetch(baseUrl + "/send-text", { method: "POST", headers, body: JSON.stringify(body) });
    }
    case "image": {
      const imgRes = await fetch(baseUrl + "/send-image", {
        method: "POST", headers, body: JSON.stringify({ phone, image: mediaUrl }),
      });
      if (contentText && contentText.trim()) {
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
        const txtBody: any = { phone, message: contentText };
        if (mentioned) txtBody.mentioned = mentioned;
        await fetch(baseUrl + "/send-text", { method: "POST", headers, body: JSON.stringify(txtBody) });
      }
      return imgRes;
    }
    case "audio":
      return fetch(baseUrl + "/send-audio", { method: "POST", headers, body: JSON.stringify({ phone, audio: mediaUrl }) });
    case "video": {
      const body: any = { phone, video: mediaUrl, caption: contentText || "" };
      if (mentioned) body.mentioned = mentioned;
      return fetch(baseUrl + "/send-video", { method: "POST", headers, body: JSON.stringify(body) });
    }
    case "video_note": {
      const ptvRes = await fetch(baseUrl + "/send-ptv", { method: "POST", headers, body: JSON.stringify({ phone, ptv: mediaUrl }) });
      if (contentText && contentText.trim()) {
        await new Promise((r) => setTimeout(r, 800));
        const body: any = { phone, message: contentText };
        if (mentioned) body.mentioned = mentioned;
        await fetch(baseUrl + "/send-text", { method: "POST", headers, body: JSON.stringify(body) });
      }
      return ptvRes;
    }
    default:
      throw new Error("Tipo de conteudo nao suportado: " + contentType);
  }
}

// ─── EVOLUTION API ────────────────────────────────────────────────────────────

async function sendToGroupEvolution(
  instanceName: string,
  groupJid: string,
  contentType: string,
  contentText?: string,
  mediaUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Evolution API expects WhatsApp JID format "<id>@g.us"; convert from Z-API "<id>-group" if needed
    const evoJid = groupJid.includes("@g.us")
      ? groupJid
      : groupJid.replace(/-group$/i, "") + "@g.us";

    switch (contentType) {
      case "text": {
        return await evoSendText(instanceName, evoJid, contentText || "");
      }
      case "image": {
        const imgResult = await evoSendImageByUrl(instanceName, evoJid, mediaUrl || "", contentText || "");
        if (!imgResult.success && contentText?.trim()) {
          console.warn(`[fe-send-message] Evolution media failed for group ${evoJid}; falling back to text. Error: ${imgResult.error}`);
          const textResult = await evoSendText(instanceName, evoJid, contentText);
          if (textResult.success) return textResult;
        }
        return imgResult;
      }
      case "audio":
        return await evoSendAudio(instanceName, evoJid, mediaUrl || "");
      case "video":
        return await evoSendVideo(instanceName, evoJid, mediaUrl || "", contentText);
      case "video_note": {
        const res = await evoSendVideo(instanceName, evoJid, mediaUrl || "");
        if (contentText && contentText.trim()) {
          await new Promise((r) => setTimeout(r, 800));
          await evoSendText(instanceName, evoJid, contentText);
        }
        return res;
      }
      default:
        return { success: false, error: "Tipo de conteudo nao suportado: " + contentType };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ─── SERVE ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SendRequest = await req.json();
    const { tenant_id, group_ids, message_ids, content_type, content_text, media_url, mention_all } = body;

    if (!tenant_id || !group_ids?.length) {
      return new Response(JSON.stringify({ error: "tenant_id e group_ids sao obrigatorios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (content_type !== "text" && !media_url) {
      return new Response(JSON.stringify({ error: "media_url e obrigatorio para imagem, audio e video" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creds = await getCredentials(supabase, tenant_id);
    if (!creds) {
      return new Response(JSON.stringify({ error: "WhatsApp nao configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zapiBaseUrl = creds.provider === "zapi"
      ? ZAPI_BASE_URL + "/instances/" + creds.instanceId + "/token/" + creds.token
      : "";

    const { data: groups } = await supabase
      .from("fe_groups")
      .select("id, group_jid, group_name")
      .in("id", group_ids)
      .eq("tenant_id", tenant_id);

    if (!groups?.length) {
      return new Response(JSON.stringify({ error: "Nenhum grupo encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groupToMessageId = new Map<string, string>();
    if (Array.isArray(message_ids)) {
      group_ids.forEach((gid, idx) => { if (gid && message_ids[idx]) groupToMessageId.set(gid, message_ids[idx]); });
    }

    const processGroups = async () => {
      const results: Array<{ group_id: string; group_name: string; success: boolean; error?: string }> = [];

      for (const group of groups) {
        try {
          if (results.length > 0) {
            await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
          }

          let sent = false;
          let errMsg: string | undefined;

          if (creds.provider === "evolution") {
            const result = await sendToGroupEvolution(creds.instanceName!, group.group_jid, content_type, content_text, media_url);
            sent = result.success;
            errMsg = result.error;
            console.log("[fe-send-message] Evolution - Group " + group.group_name + ": sent=" + sent);
          } else {
            const res = await sendToGroupZapi(zapiBaseUrl, creds.clientToken!, group.group_jid, content_type, content_text, media_url, mention_all);
            const resText = await res.text();
            sent = res.status >= 200 && res.status < 300;
            errMsg = sent ? undefined : resText.substring(0, 300);
            console.log("[fe-send-message] ZAPI - Group " + group.group_name + ": status=" + res.status);
          }

          results.push({ group_id: group.id, group_name: group.group_name, success: sent, error: errMsg });

          const messageId = groupToMessageId.get(group.id);
          let statusUpdate = supabase.from("fe_messages").update({ status: sent ? "sent" : "failed", sent_at: new Date().toISOString() });
          if (messageId) {
            statusUpdate = statusUpdate.eq("id", messageId).eq("status", "sending");
          } else {
            statusUpdate = statusUpdate.eq("tenant_id", tenant_id).eq("group_id", group.id).eq("status", "sending");
          }
          await statusUpdate;
        } catch (err: any) {
          console.error("[fe-send-message] Error sending to " + group.group_name + ":", err.message);
          results.push({ group_id: group.id, group_name: group.group_name, success: false, error: err.message });

          const messageId = groupToMessageId.get(group.id);
          let failUpdate = supabase.from("fe_messages").update({ status: "failed" });
          if (messageId) {
            failUpdate = failUpdate.eq("id", messageId).eq("status", "sending");
          } else {
            failUpdate = failUpdate.eq("tenant_id", tenant_id).eq("group_id", group.id).eq("status", "sending");
          }
          await failUpdate;
        }
      }

      return results;
    };

    if (body.async) {
      EdgeRuntime.waitUntil(
        processGroups().catch((err) => console.error("[fe-send-message] Async processing error:", err?.message || err))
      );
      return new Response(
        JSON.stringify({ queued: true, total: groups.length, sent: 0 }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = await processGroups();

    return new Response(
      JSON.stringify({ results, total: results.length, sent: results.filter((r) => r.success).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[fe-send-message] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});