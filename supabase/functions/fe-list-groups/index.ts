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

const normalizePhone = (value?: string | null) => value?.replace(/\D/g, "") || "";

const parseParticipantsCount = (source: any) => {
  const raw = source?.participantsCount ?? source?.participants_count ?? source?.participantsSize ?? source?.size;
  return raw !== undefined && raw !== null && !Number.isNaN(Number(raw)) ? Number(raw) : 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tenant_id, admin_only } = await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: waConfig } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, connected_phone")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapi")
      .eq("is_active", true)
      .maybeSingle();

    if (!waConfig?.zapi_instance_id || !waConfig?.zapi_token) {
      return new Response(JSON.stringify({ error: "Z-API não configurada para este tenant" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = `https://api.z-api.io/instances/${waConfig.zapi_instance_id}/token/${waConfig.zapi_token}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (waConfig.zapi_client_token) headers["Client-Token"] = waConfig.zapi_client_token;

    let connectedPhone = normalizePhone(waConfig.connected_phone);

    if (admin_only && !connectedPhone) {
      try {
        const statusRes = await fetch(`${baseUrl}/status`, { headers });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          connectedPhone = normalizePhone(statusData?.phoneConnected);

          if (connectedPhone) {
            await supabase
              .from("integration_whatsapp")
              .update({ connected_phone: statusData.phoneConnected, last_status_check: new Date().toISOString() })
              .eq("tenant_id", tenant_id)
              .eq("provider", "zapi");
          }
        }
      } catch (error: any) {
        console.warn(`[fe-list-groups] Status lookup failed: ${error.message}`);
      }
    }

    if (admin_only && !connectedPhone) {
      return new Response(JSON.stringify({
        error: "Não foi possível identificar o número conectado para filtrar grupos de admin. Desative o filtro ou atualize a conexão do WhatsApp.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let allGroups: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const response = await fetch(`${baseUrl}/groups?page=${page}&pageSize=${pageSize}`, { headers });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[fe-list-groups] Z-API /groups error: ${response.status} ${errText}`);
        return new Response(JSON.stringify({ error: `Z-API retornou ${response.status}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pageGroups = await response.json();
      if (!Array.isArray(pageGroups) || pageGroups.length === 0) break;

      allGroups = allGroups.concat(pageGroups);
      if (pageGroups.length < pageSize) break;
      page++;
    }

    console.log(`[fe-list-groups] Fetched ${allGroups.length} groups from Z-API`);

    let filteredGroups: any[] = [];

    if (admin_only) {
      const enrichedGroups = await parallelLimit(allGroups, 20, async (group: any) => {
        try {
          let metadataResponse = await fetch(`${baseUrl}/group-metadata/${group.phone}`, { headers });
          if (!metadataResponse.ok) {
            metadataResponse = await fetch(`${baseUrl}/light-group-metadata/${group.phone}`, { headers });
          }

          if (!metadataResponse.ok) return null;

          const metadata = await metadataResponse.json();
          const participants = Array.isArray(metadata.participants) ? metadata.participants : [];
          const participantsCount = parseParticipantsCount(metadata) || participants.length || parseParticipantsCount(group);

          const isAdmin = participants.some((participant: any) => {
            const participantPhone = normalizePhone(participant.phone);
            return participantPhone === connectedPhone && participant.isAdmin === true;
          });

          if (!isAdmin) return null;

          return {
            group_jid: group.phone,
            group_name: group.name || group.subject || group.phone,
            participant_count: participantsCount,
            invite_link: metadata.invitationLink || metadata.inviteLink || null,
          };
        } catch (error: any) {
          console.warn(`[fe-list-groups] Metadata error for ${group.phone}: ${error.message}`);
          return null;
        }
      });

      filteredGroups = enrichedGroups.filter(Boolean);
    } else {
      filteredGroups = allGroups.map((group: any) => ({
        group_jid: group.phone,
        group_name: group.name || group.subject || group.phone,
        participant_count: parseParticipantsCount(group),
        invite_link: group.invitationLink || group.inviteLink || null,
      }));
    }

    console.log(`[fe-list-groups] ${filteredGroups.length}/${allGroups.length} groups after filter (admin_only=${admin_only})`);

    const { data: existingGroups } = await supabase
      .from("fe_groups")
      .select("group_jid, invite_link")
      .eq("tenant_id", tenant_id);

    const existingInviteLinks = new Map((existingGroups || []).map((group) => [group.group_jid, group.invite_link]));

    const upsertPayload = filteredGroups.map((group) => ({
      tenant_id,
      group_jid: group.group_jid,
      group_name: group.group_name,
      participant_count: group.participant_count || 0,
      invite_link: group.invite_link || existingInviteLinks.get(group.group_jid) || null,
    }));

    let added = 0;
    if (upsertPayload.length > 0) {
      const { error } = await supabase
        .from("fe_groups")
        .upsert(upsertPayload, { onConflict: "tenant_id,group_jid" });

      if (error) {
        console.error("[fe-list-groups] Upsert error:", error.message);
        return new Response(JSON.stringify({ error: `Erro ao salvar grupos: ${error.message}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      added = upsertPayload.length;
    }

    const { data: groups } = await supabase
      .from("fe_groups")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("group_name");

    return new Response(JSON.stringify({
      added,
      total_found: allGroups.length,
      synced: filteredGroups.length,
      admin_only: !!admin_only,
      groups,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fe-list-groups] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
