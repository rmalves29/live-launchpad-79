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
  content_type: "text" | "image" | "audio" | "video";
  content_text?: string;
  media_url?: string;
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

async function sendToGroup(
  baseUrl: string,
  clientToken: string,
  groupJid: string,
  contentType: string,
  contentText?: string,
  mediaUrl?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  // Z-API uses the group JID as the "phone" parameter for group messages
  const phone = groupJid;

  switch (contentType) {
    case "text": {
      const res = await fetch(`${baseUrl}/send-text`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, message: contentText }),
      });
      return res;
    }
    case "image": {
      const res = await fetch(`${baseUrl}/send-image`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, image: mediaUrl, caption: contentText || "" }),
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
      const res = await fetch(`${baseUrl}/send-video`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone, video: mediaUrl, caption: contentText || "" }),
      });
      return res;
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
    const { tenant_id, group_ids, content_type, content_text, media_url } = body;

    if (!tenant_id || !group_ids?.length) {
      return new Response(JSON.stringify({ error: "tenant_id e group_ids são obrigatórios" }), {
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

    const results: Array<{ group_id: string; group_name: string; success: boolean; error?: string }> = [];

    for (const group of groups) {
      try {
        // Add delay between groups to avoid rate limiting
        if (results.length > 0) {
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
        }

        const res = await sendToGroup(baseUrl, creds.clientToken, group.group_jid, content_type, content_text, media_url);
        const resText = await res.text();
        console.log(`[fe-send-message] Group ${group.group_name}: status=${res.status}, response=${resText.substring(0, 200)}`);

        results.push({ group_id: group.id, group_name: group.group_name, success: res.status >= 200 && res.status < 300 });

        // Update message status
        await supabase
          .from("fe_messages")
          .update({ status: res.status >= 200 && res.status < 300 ? "sent" : "failed", sent_at: new Date().toISOString() })
          .eq("tenant_id", tenant_id)
          .eq("group_id", group.id)
          .eq("status", "sending");
      } catch (err: any) {
        console.error(`[fe-send-message] Error sending to ${group.group_name}:`, err.message);
        results.push({ group_id: group.id, group_name: group.group_name, success: false, error: err.message });

        await supabase
          .from("fe_messages")
          .update({ status: "failed" })
          .eq("tenant_id", tenant_id)
          .eq("group_id", group.id)
          .eq("status", "sending");
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
