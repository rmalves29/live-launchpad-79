// fe-spawn-group: cria automaticamente um novo grupo de WhatsApp e o vincula
// a uma campanha do Fluxo de Envio, replicando o "molde" (group_template).
// Equivalente ao "group spawn" do SendFlow (disabledGroupSpawn / margin).
//
// Chamada de duas formas:
//  1) fire-and-forget pelo fe-campaign-redirect quando os grupos disponíveis
//     de uma campanha estão perto de lotar (spawn_margin).
//  2) manualmente pela UI ("Criar novo grupo agora").
//
// IMPORTANTE: o endpoint exato de criação de grupo na uazapi não está
// confirmado na documentação pública — tentamos algumas variantes de
// path/payload em sequência e logamos qual funcionou, para consolidar
// depois em _shared/uazapi-api.ts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GroupTemplate {
  name_base?: string;
  description?: string;
  image_url?: string;
  max_participants?: number;
  seed_numbers?: string[];
}

interface SpawnResult {
  success: boolean;
  groupJid?: string;
  inviteLink?: string;
  error?: string;
  attemptsLog?: string[];
}

function normalizePhone(v: string): string {
  const d = (v || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : "55" + d;
}

async function createGroupOnUazapi(
  uazUrl: string,
  uazTok: string,
  name: string,
  seedNumbers: string[],
): Promise<SpawnResult> {
  const headers = { "Content-Type": "application/json", token: uazTok };
  const participants = seedNumbers.map(normalizePhone).filter(Boolean);
  const attemptsLog: string[] = [];

  const attempts: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: "/group/create", body: { name, participants } },
    { path: "/group/create", body: { name, participants: participants.map((p) => ({ id: `${p}@s.whatsapp.net` })) } },
    { path: "/group/new", body: { name, participants } },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(`${uazUrl}${attempt.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(attempt.body),
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

      if (res.ok && data) {
        const groupJid: string | undefined =
          data?.JID || data?.jid || data?.groupjid || data?.group?.JID || data?.group?.jid;
        if (groupJid) {
          attemptsLog.push(`${attempt.path} -> OK (${groupJid})`);
          return { success: true, groupJid, inviteLink: data?.invite_link || data?.inviteLink, attemptsLog };
        }
      }
      attemptsLog.push(`${attempt.path} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
    } catch (e: any) {
      attemptsLog.push(`${attempt.path} -> exceção: ${e?.message ?? e}`);
    }
  }

  return { success: false, error: `Nenhuma variante de criação de grupo funcionou. Detalhes: ${attemptsLog.join(" | ")}`, attemptsLog };
}

// Endpoint confirmado via OpenAPI spec (docs.uazapi.com/openapi-bundled.json):
// POST /group/info com { groupjid, getInviteLink: true } retorna o campo invite_link.
async function fetchInviteLink(uazUrl: string, uazTok: string, groupJid: string): Promise<string | null> {
  try {
    const res = await fetch(`${uazUrl}/group/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: uazTok },
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

async function applyGroupSettings(uazUrl: string, uazTok: string, groupJid: string, template: GroupTemplate) {
  const headers = { "Content-Type": "application/json", token: uazTok };
  if (template.description) {
    await fetch(`${uazUrl}/group/description`, {
      method: "POST", headers,
      body: JSON.stringify({ groupjid: groupJid, description: template.description }),
    }).catch(() => {});
  }
  if (template.image_url) {
    await fetch(`${uazUrl}/group/image`, {
      method: "POST", headers,
      body: JSON.stringify({ groupjid: groupJid, image: template.image_url }),
    }).catch(() => {});
  }
  // Só admin fala — comportamento padrão do SendFlow (onlyAdminsSpeak)
  await fetch(`${uazUrl}/group/settings`, {
    method: "POST", headers,
    body: JSON.stringify({ groupjid: groupJid, announce: true }),
  }).catch(() => {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, campaign_id } = await req.json();
    if (!tenant_id || !campaign_id) {
      return new Response(JSON.stringify({ error: "tenant_id e campaign_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: campaign, error: campErr } = await supabase
      .from("fe_campaigns")
      .select("id, tenant_id, name, group_template, spawn_margin, auto_spawn_enabled, last_spawn_at")
      .eq("id", campaign_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();
    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campanha não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Debounce: não criar dois grupos em menos de 2 minutos por cliques concorrentes
    if (campaign.last_spawn_at) {
      const elapsedMs = Date.now() - new Date(campaign.last_spawn_at).getTime();
      if (elapsedMs < 2 * 60 * 1000) {
        return new Response(JSON.stringify({ skipped: "debounce", elapsedMs }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const template: GroupTemplate = campaign.group_template || {};
    const nameBase = template.name_base || campaign.name || "Grupo";
    const groupName = `${nameBase} #${Date.now().toString().slice(-4)}`;

    const { data: waConfig } = await supabase
      .from("integration_whatsapp")
      .select("provider, uazapi_url, uazapi_token")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!waConfig || waConfig.provider !== "uazapi" || !waConfig.uazapi_url || !waConfig.uazapi_token) {
      return new Response(JSON.stringify({ error: "Auto-clonagem de grupo só é suportada com provider uazapi configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uazUrl = (waConfig.uazapi_url as string).replace(/\/+$/, "");
    const uazTok = waConfig.uazapi_token as string;

    // Marca o debounce ANTES de chamar a API (evita corrida em cliques simultâneos)
    await supabase.from("fe_campaigns").update({ last_spawn_at: new Date().toISOString() }).eq("id", campaign_id);

    const seedNumbers = template.seed_numbers?.length ? template.seed_numbers : [];
    const created = await createGroupOnUazapi(uazUrl, uazTok, groupName, seedNumbers);

    if (!created.success || !created.groupJid) {
      console.error(`[fe-spawn-group] Falha ao criar grupo: ${created.error}`);
      return new Response(JSON.stringify({ error: created.error, attemptsLog: created.attemptsLog }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await applyGroupSettings(uazUrl, uazTok, created.groupJid, template);

    let inviteLink = created.inviteLink || null;
    if (!inviteLink) inviteLink = await fetchInviteLink(uazUrl, uazTok, created.groupJid);

    const { data: newGroup, error: insertErr } = await supabase
      .from("fe_groups")
      .insert({
        tenant_id,
        group_jid: created.groupJid,
        group_name: groupName,
        invite_link: inviteLink,
        participant_count: seedNumbers.length,
        max_participants: template.max_participants || 1000,
        is_entry_open: true,
        is_active: true,
        is_admin: true,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    const { count: existingLinks } = await supabase
      .from("fe_campaign_groups")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id);

    await supabase.from("fe_campaign_groups").insert({
      campaign_id,
      group_id: newGroup.id,
      sort_order: existingLinks || 0,
    });

    console.log(`[fe-spawn-group] ✅ Grupo criado: ${groupName} (${created.groupJid}) para campanha ${campaign.name}`);

    return new Response(JSON.stringify({
      success: true,
      group_id: newGroup.id,
      group_jid: created.groupJid,
      group_name: groupName,
      invite_link: inviteLink,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[fe-spawn-group] Error:", error?.message || error);
    return new Response(JSON.stringify({ error: error?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
