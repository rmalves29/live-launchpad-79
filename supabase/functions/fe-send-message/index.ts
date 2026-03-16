import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data?.zapi_instance_id || !data?.zapi_token) return null;
  return { instanceId: data.zapi_instance_id, token: data.zapi_token, clientToken: data.zapi_client_token || "" };
}

async function getGroupParticipants(
  baseUrl: string,
  clientToken: string,
  groupJid: string
): Promise<string[]> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (clientToken) headers["Client-Token"] = clientToken;

    const phone = groupJid.replace("@g.us", "");
    const res = await fetch(`${baseUrl}/group-metadata/${phone}`, { method: "GET", headers });
    if (!res.ok) {
      console.log(`[fe-send-message] Failed to get group metadata: ${res.status}`);
      return [];
    }
    const data = await res.json();
    const participants: string[] = (data.participants || [])
      .map((p: any) => (p.phone || p.id || "").replace("@c.us", "").replace(/\D/g, ""))
      .filter((p: string) => p.length > 0);
    console.log(`[fe-send-message] Group ${groupJid}: ${participants.length} participants for mention`);
    return participants;
  } catch (err: any) {
    console.error(`[fe-send-message] Error fetching participants for mention:`, err.message);
    return [];
  }
}

async function sendToGroup(
  baseUrl: string,
  clientToken: string,
  groupJid: string,
  contentType: string,
  contentText?: string,
  mediaUrl?: string,
  mentionAll?: boolean
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const phone = groupJid;

  // Get participants for mention if requested
  let mentioned: string[] | undefined;
  if (mentionAll) {
    mentioned = await getGroupParticipants(baseUrl, clientToken, groupJid);
    if (mentioned.length === 0) {
      console.log(`[fe-send-message] No participants found for mention, sending without mention`);
      mentioned = undefined;
    }
  }

  switch (contentType) {
    case "text": {
      const body: any = { phone, message: contentText };
      if (mentioned) body.mentioned = mentioned;
      const res = await fetch(`${baseUrl}/send-text`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return res;
    }
    case "image": {
      const body: any = { phone, image: mediaUrl, caption: contentText || "" };
      if (mentioned) body.mentioned = mentioned;
      const res = await fetch(`${baseUrl}/send-image`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return res;
    }
    case "audio": {
      const res = await fetch(`${baseUrl}/send-audio`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, audio: mediaUrl }),
      });
      return res;
    }
    case "video": {
      const body: any = { phone, video: mediaUrl, caption: contentText || "" };
      if (mentioned) body.mentioned = mentioned;
      const res = await fetch(`${baseUrl}/send-video`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return res;
    }
    case "video_note": {
      const ptvRes = await fetch(`${baseUrl}/send-ptv`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, ptv: mediaUrl }),
      });
      if (contentText && contentText.trim()) {
        await new Promise((r) => setTimeout(r, 800));
        const body: any = { phone, message: contentText };
        if (mentioned) body.mentioned = mentioned;
        await fetch(`${baseUrl}/send-text`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
      }
      return ptvRes;
    }
    default:
      throw new Error(`Tipo de conteúdo não suportado: ${contentType}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SendRequest = await req.json();
    const { tenant_id, group_ids, message_ids, content_type, content_text, media_url, mention_all } = body;

    if (!tenant_id || !group_ids?.length) {
      return new Response(JSON.stringify({ error: "tenant_id e group_ids são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (content_type !== "text" && !media_url) {
      return new Response(JSON.stringify({ error: "media_url é obrigatório para imagem, áudio e vídeo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creds = await getZAPICredentials(supabase, tenant_id);
    if (!creds) {
      return new Response(JSON.stringify({ error: "Z-API não configurada" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = `${ZAPI_BASE_URL}/instances/${creds.instanceId}/token/${creds.token}`;

    // Fetch group JIDs from fe_groups
    const { data: groups } = await supabase
      .from("fe_groups")
      .select("id, group_jid, group_name")
      .in("id", group_ids)
      .eq("tenant_id", tenant_id);

    if (!groups?.length) {
      return new Response(JSON.stringify({ error: "Nenhum grupo encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groupToMessageId = new Map<string, string>();
    if (Array.isArray(message_ids)) {
      group_ids.forEach((gid, idx) => {
        const mid = message_ids[idx];
        if (gid && mid) groupToMessageId.set(gid, mid);
      });
    }

    const results: Array<{ group_id: string; group_name: string; success: boolean; error?: string }> = [];

    for (const group of groups) {
      try {
        // Small delay between groups to avoid rate limiting
        if (results.length > 0) {
          await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
        }

        const res = await sendToGroup(baseUrl, creds.clientToken, group.group_jid, content_type, content_text, media_url, mention_all);
        const resText = await res.text();
        const sent = res.status >= 200 && res.status < 300;
        console.log(`[fe-send-message] Group ${group.group_name}: status=${res.status}, response=${resText.substring(0, 200)}`);

        results.push({
          group_id: group.id,
          group_name: group.group_name,
          success: sent,
          error: sent ? undefined : resText.substring(0, 300),
        });

        const messageId = groupToMessageId.get(group.id);
        let statusUpdate = supabase
          .from("fe_messages")
          .update({ status: sent ? "sent" : "failed", sent_at: new Date().toISOString() });

        if (messageId) {
          statusUpdate = statusUpdate.eq("id", messageId).eq("status", "sending");
        } else {
          statusUpdate = statusUpdate
            .eq("tenant_id", tenant_id)
            .eq("group_id", group.id)
            .eq("status", "sending");
        }

        await statusUpdate;
      } catch (err: any) {
        console.error(`[fe-send-message] Error sending to ${group.group_name}:`, err.message);
        results.push({ group_id: group.id, group_name: group.group_name, success: false, error: err.message });

        const messageId = groupToMessageId.get(group.id);
        let failUpdate = supabase.from("fe_messages").update({ status: "failed" });

        if (messageId) {
          failUpdate = failUpdate.eq("id", messageId).eq("status", "sending");
        } else {
          failUpdate = failUpdate
            .eq("tenant_id", tenant_id)
            .eq("group_id", group.id)
            .eq("status", "sending");
        }

        await failUpdate;
      }
    }

    return new Response(JSON.stringify({ results, total: results.length, sent: results.filter((r) => r.success).length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fe-send-message] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
