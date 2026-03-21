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

const parseCount = (source: any) => {
  const raw = source?.participantsCount ?? source?.participants_count ?? source?.participantsSize ?? source?.size;
  return raw != null && !isNaN(Number(raw)) ? Number(raw) : 0;
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
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = `https://api.z-api.io/instances/${waConfig.zapi_instance_id}/token/${waConfig.zapi_token}`;
    const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (waConfig.zapi_client_token) zapiHeaders["Client-Token"] = waConfig.zapi_client_token;

    // --- Resolve connected phone ---
    let connectedPhone = normalizePhone(waConfig.connected_phone);

    if (!connectedPhone) {
      // Try multiple Z-API endpoints to discover the connected phone number
      const phoneEndpoints = [
        { url: `${baseUrl}/phone`, fields: ["phone", "number"] },
        { url: `${baseUrl}/profile`, fields: ["phone", "number", "phoneNumber"] },
        { url: `${baseUrl}/status`, fields: ["phoneConnected", "phone", "number"] },
      ];

      for (const ep of phoneEndpoints) {
        if (connectedPhone) break;
        try {
          const res = await fetch(ep.url, { headers: zapiHeaders });
          if (res.ok) {
            const data = await res.json();
            console.log(`[fe-list-groups] ${ep.url.split('/').pop()} response: ${JSON.stringify(data)}`);
            for (const field of ep.fields) {
              const val = normalizePhone(data?.[field]);
              if (val && val.length >= 10) {
                connectedPhone = val;
                break;
              }
            }
          }
        } catch (err: any) {
          console.warn(`[fe-list-groups] ${ep.url.split('/').pop()} error: ${err.message}`);
        }
      }

      // Fallback: extract from the first group metadata where we appear as admin
      if (!connectedPhone && allGroups.length === 0) {
        console.warn("[fe-list-groups] Could not resolve connected phone from any endpoint");
      }

      if (connectedPhone) {
        await supabase
          .from("integration_whatsapp")
          .update({ connected_phone: connectedPhone, last_status_check: new Date().toISOString() })
          .eq("tenant_id", tenant_id)
          .eq("provider", "zapi");
        console.log(`[fe-list-groups] Saved connected_phone: ${connectedPhone}`);
      }
    }

    // --- Fetch groups ---
    let allGroups: any[] = [];
    let page = 1;
    const pageSize = 100;

    while (true) {
      const response = await fetch(`${baseUrl}/groups?page=${page}&pageSize=${pageSize}`, { headers: zapiHeaders });
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[fe-list-groups] /groups error: ${response.status} ${errText}`);
        return new Response(JSON.stringify({ error: `Z-API retornou ${response.status}` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pageGroups = await response.json();
      if (!Array.isArray(pageGroups) || pageGroups.length === 0) break;
      allGroups = allGroups.concat(pageGroups);
      if (pageGroups.length < pageSize) break;
      page++;
    }

    console.log(`[fe-list-groups] Fetched ${allGroups.length} groups from Z-API`);

    // --- Fallback: discover phone from first group's metadata if still unknown ---
    if (!connectedPhone && admin_only && allGroups.length > 0) {
      console.log("[fe-list-groups] Attempting phone discovery from group metadata...");
      const sampleGroup = allGroups[0];
      try {
        const metaRes = await fetch(`${baseUrl}/group-metadata/${sampleGroup.phone}`, { headers: zapiHeaders });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const participants = Array.isArray(meta.participants) ? meta.participants : [];
          // Look for any admin/superadmin participant - the connected number is likely one of them
          const admins = participants.filter((p: any) => p.isAdmin === true || p.isSuperAdmin === true);
          if (admins.length > 0) {
            // The superAdmin is usually the instance owner
            const superAdmin = admins.find((p: any) => p.isSuperAdmin === true) || admins[0];
            connectedPhone = normalizePhone(superAdmin.phone);
            console.log(`[fe-list-groups] Discovered phone from group metadata: ${connectedPhone}`);
            if (connectedPhone) {
              await supabase
                .from("integration_whatsapp")
                .update({ connected_phone: connectedPhone, last_status_check: new Date().toISOString() })
                .eq("tenant_id", tenant_id)
                .eq("provider", "zapi");
            }
          }
        }
      } catch (err: any) {
        console.warn(`[fe-list-groups] Phone discovery from metadata failed: ${err.message}`);
      }
    }

    // If admin_only requested but no phone found, fall back to ALL groups with a warning
    const effectiveAdminOnly = admin_only && !!connectedPhone;
    if (admin_only && !connectedPhone) {
      console.warn("[fe-list-groups] admin_only requested but no connected phone found, syncing ALL groups");
    }

    // --- Enrich groups with metadata (parallel, concurrency 15) ---
    const enrichedGroups = await parallelLimit(allGroups, 15, async (group: any) => {
      const baseCount = parseCount(group);

      try {
        let metaRes = await fetch(`${baseUrl}/group-metadata/${group.phone}`, { headers: zapiHeaders });
        if (!metaRes.ok) {
          metaRes = await fetch(`${baseUrl}/light-group-metadata/${group.phone}`, { headers: zapiHeaders });
        }

        if (metaRes.ok) {
          const meta = await metaRes.json();
          const participants = Array.isArray(meta.participants) ? meta.participants : [];
          const count = parseCount(meta) || participants.length || baseCount;

          let isAdmin = false;
          if (connectedPhone && participants.length > 0) {
            isAdmin = participants.some((p: any) => {
              const pPhone = normalizePhone(p.phone);
              const phoneMatch = pPhone === connectedPhone || pPhone.endsWith(connectedPhone) || connectedPhone.endsWith(pPhone);
              return phoneMatch && (p.isAdmin === true || p.isSuperAdmin === true);
            });
            if (!isAdmin) {
              console.log(`[fe-list-groups] ${group.phone}: NOT admin. connectedPhone=${connectedPhone}, participants sample=${JSON.stringify(participants.slice(0, 3).map((p: any) => ({ phone: normalizePhone(p.phone), isAdmin: p.isAdmin, isSuperAdmin: p.isSuperAdmin })))}`);
            }
          }

          return {
            group_jid: group.phone,
            group_name: group.name || group.subject || group.phone,
            participant_count: count,
            invite_link: meta.invitationLink || meta.inviteLink || group.invitationLink || group.inviteLink || null,
            _isAdmin: isAdmin,
            _include: effectiveAdminOnly ? isAdmin : true,
          };
        }
      } catch (err: any) {
        console.warn(`[fe-list-groups] Metadata error ${group.phone}: ${err.message}`);
      }

      // Fallback: no metadata available
      return {
        group_jid: group.phone,
        group_name: group.name || group.subject || group.phone,
        participant_count: baseCount,
        invite_link: group.invitationLink || group.inviteLink || null,
        _isAdmin: false,
        _include: !effectiveAdminOnly,
      };
    });

    const filteredGroups = enrichedGroups.filter((g) => g._include);
    console.log(`[fe-list-groups] ${filteredGroups.length}/${allGroups.length} groups after filter (admin_only=${effectiveAdminOnly})`);

    // --- Preserve existing invite links ---
    const { data: existingGroups } = await supabase
      .from("fe_groups")
      .select("group_jid, invite_link")
      .eq("tenant_id", tenant_id);

    const existingLinks = new Map((existingGroups || []).map((g) => [g.group_jid, g.invite_link]));

    // --- Upsert in batch ---
    const upsertPayload = filteredGroups.map((g) => ({
      tenant_id,
      group_jid: g.group_jid,
      group_name: g.group_name,
      participant_count: g.participant_count || 0,
      invite_link: g.invite_link || existingLinks.get(g.group_jid) || null,
    }));

    let added = 0;
    if (upsertPayload.length > 0) {
      // Batch in chunks of 50 to avoid payload limits
      for (let i = 0; i < upsertPayload.length; i += 50) {
        const chunk = upsertPayload.slice(i, i + 50);
        const { error } = await supabase
          .from("fe_groups")
          .upsert(chunk, { onConflict: "tenant_id,group_jid" });
        if (error) {
          console.error(`[fe-list-groups] Upsert chunk error: ${error.message}`);
        } else {
          added += chunk.length;
        }
      }
    }

    // --- Return updated list ---
    const { data: groups } = await supabase
      .from("fe_groups")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("group_name");

    const warningMsg = (admin_only && !connectedPhone)
      ? "Número conectado não encontrado. Todos os grupos foram sincronizados sem filtro de admin."
      : undefined;

    return new Response(JSON.stringify({
      added,
      total_found: allGroups.length,
      synced: filteredGroups.length,
      admin_only: effectiveAdminOnly,
      warning: warningMsg,
      groups,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fe-list-groups] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
