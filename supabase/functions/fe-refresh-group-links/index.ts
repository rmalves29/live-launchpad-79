import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function parallelLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = currentIndex++;
      if (index >= items.length) break;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Endpoint confirmado via OpenAPI spec (docs.uazapi.com/openapi-bundled.json):
// POST /group/info com { groupjid, getInviteLink: true } retorna o campo invite_link.
async function fetchUazapiInviteLink(
  uazUrl: string, uazH: Record<string, string>, groupJid: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${uazUrl}/group/info`, {
      method: "POST",
      headers: uazH,
      body: JSON.stringify({ groupjid: groupJid, getInviteLink: true }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const grp = data?.group || data;
    const code = grp?.invite_link;
    if (!code) return null;
    return String(code).startsWith("http") ? String(code) : `https://chat.whatsapp.com/${code}`;
  } catch {
    return null;
  }
}

async function fetchZapiInviteLink(
  baseUrl: string, zapiHeaders: Record<string, string>, groupPhone: string,
): Promise<string | null> {
  try {
    let res = await fetch(`${baseUrl}/group-metadata/${groupPhone}`, { headers: zapiHeaders });
    if (!res.ok) {
      res = await fetch(`${baseUrl}/light-group-metadata/${groupPhone}`, { headers: zapiHeaders });
    }
    if (!res.ok) return null;
    const meta = await res.json().catch(() => null);
    return meta?.invitationLink || meta?.inviteLink || null;
  } catch {
    return null;
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

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: waConfig } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, provider, uazapi_url, uazapi_token")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!waConfig) {
      return new Response(JSON.stringify({ error: "Integração WhatsApp não configurada" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só grupos onde o número conectado é admin conseguem ter o link consultado/gerado.
    const { data: groups, error: groupsError } = await supabase
      .from("fe_groups")
      .select("id, group_jid, group_name, invite_link, is_admin")
      .eq("tenant_id", tenant_id)
      .eq("is_admin", true);

    if (groupsError) {
      return new Response(JSON.stringify({ error: groupsError.message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!groups || groups.length === 0) {
      return new Response(JSON.stringify({ updated: 0, checked: 0, message: "Nenhum grupo (onde você é admin) encontrado para atualizar" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provider = (waConfig as any).provider || "zapi";
    let updated = 0;
    let failed = 0;

    if (provider === "uazapi") {
      const uazUrl = ((waConfig as any).uazapi_url || "").replace(/\/+$/, "");
      const uazTok = (waConfig as any).uazapi_token || "";
      if (!uazUrl || !uazTok) {
        return new Response(JSON.stringify({ error: "uazapi não configurada (url/token ausentes)" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const uazH: Record<string, string> = { "Content-Type": "application/json", token: uazTok };

      await parallelLimit(groups, 10, async (g) => {
        const link = await fetchUazapiInviteLink(uazUrl, uazH, g.group_jid);
        if (link && link !== g.invite_link) {
          const { error } = await supabase.from("fe_groups").update({ invite_link: link }).eq("id", g.id);
          if (error) { failed++; console.error(`[fe-refresh-group-links] update error ${g.group_jid}: ${error.message}`); }
          else updated++;
        } else if (!link) {
          failed++;
          console.warn(`[fe-refresh-group-links] não obteve link para ${g.group_jid} (${g.group_name})`);
        }
      });
    } else {
      if (!waConfig.zapi_instance_id || !waConfig.zapi_token) {
        return new Response(JSON.stringify({ error: "Z-API não configurada para este tenant" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const baseUrl = `https://api.z-api.io/instances/${waConfig.zapi_instance_id}/token/${waConfig.zapi_token}`;
      const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (waConfig.zapi_client_token) zapiHeaders["Client-Token"] = waConfig.zapi_client_token;

      await parallelLimit(groups, 15, async (g) => {
        // group_jid está no formato "<numero>@g.us"; a Z-API espera só o número.
        const groupPhone = g.group_jid.replace(/@g\.us$/i, "");
        const link = await fetchZapiInviteLink(baseUrl, zapiHeaders, groupPhone);
        if (link && link !== g.invite_link) {
          const { error } = await supabase.from("fe_groups").update({ invite_link: link }).eq("id", g.id);
          if (error) { failed++; console.error(`[fe-refresh-group-links] update error ${g.group_jid}: ${error.message}`); }
          else updated++;
        } else if (!link) {
          failed++;
          console.warn(`[fe-refresh-group-links] não obteve link para ${g.group_jid} (${g.group_name})`);
        }
      });
    }

    return new Response(JSON.stringify({
      checked: groups.length,
      updated,
      failed,
      provider,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[fe-refresh-group-links] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
