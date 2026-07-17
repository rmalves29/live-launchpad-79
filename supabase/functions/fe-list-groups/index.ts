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

// Normalize any group JID variant (e.g. "12345-group", "12345@g.us", "12345") to canonical "<id>@g.us"
const canonicalGroupJid = (raw?: string | null): string => {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  // Strip suffix variants
  const base = s
    .replace(/@g\.us$/i, "")
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/-group$/i, "");
  if (!base) return "";
  return `${base}@g.us`;
};

// Extract core number (DDD + subscriber) stripping country code and normalizing 9th digit
const coreNumber = (phone: string): string => {
  let n = phone.replace(/\D/g, "");
  // Strip country code 55
  if (n.startsWith("55") && n.length >= 12) n = n.slice(2);
  // Now n = DDD + number. Normalize: if 11 digits and starts with 9 after DDD, also produce 10-digit version
  return n;
};

const phonesMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const na = a.replace(/\D/g, "");
  const nb = b.replace(/\D/g, "");
  if (na === nb) return true;
  
  const ca = coreNumber(na);
  const cb = coreNumber(nb);
  if (ca === cb) return true;
  
  // Handle 9th digit: one might have 11 digits (DDD+9+8digits) and other 10 (DDD+8digits)
  const strip9 = (n: string) => n.length === 11 && n[2] === "9" ? n.slice(0, 2) + n.slice(3) : n;
  const add9 = (n: string) => n.length === 10 ? n.slice(0, 2) + "9" + n.slice(2) : n;
  
  if (strip9(ca) === strip9(cb)) return true;
  if (add9(ca) === cb || ca === add9(cb)) return true;
  
  // endsWith fallback for edge cases
  if (na.endsWith(nb) || nb.endsWith(na)) return true;
  
  return false;
};

const parseCount = (source: any) => {
  const raw = source?.participantsCount ?? source?.participants_count ?? source?.participantsSize ?? source?.size;
  return raw != null && !isNaN(Number(raw)) ? Number(raw) : 0;
};

// Só admin/superadmin consegue gerar o link de convite de um grupo — por isso
// só chamamos isso para grupos onde o número conectado é admin.
async function fetchUazapiInviteLink(uazUrl: string, uazH: Record<string, string>, groupJid: string): Promise<string | null> {
  try {
    const res = await fetch(`${uazUrl}/group/invitecode`, {
      method: "POST",
      headers: uazH,
      body: JSON.stringify({ groupjid: groupJid }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const code = data?.invite_link || data?.inviteLink || data?.code || data?.InviteCode;
    if (!code) return null;
    return String(code).startsWith("http") ? String(code) : `https://chat.whatsapp.com/${code}`;
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

    const { tenant_id, admin_only } = await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: waConfig } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, connected_phone, provider, uazapi_url, uazapi_token")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    const provider = (waConfig as any)?.provider || "zapi";

    // ─────────── UAZAPI BRANCH ───────────
    if (provider === "uazapi") {
      const uazUrl = ((waConfig as any)?.uazapi_url || "").replace(/\/+$/, "");
      const uazTok = (waConfig as any)?.uazapi_token || "";
      if (!uazUrl || !uazTok) {
        return new Response(JSON.stringify({ error: "uazapi não configurada (url/token ausentes)" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const uazH: Record<string, string> = { "Content-Type": "application/json", token: uazTok };

      // Resolve connected phone (needed for admin detection)
      let connectedPhone = normalizePhone((waConfig as any)?.connected_phone);
      if (!connectedPhone) {
        try {
          const r = await fetch(`${uazUrl}/instance/status`, { headers: uazH });
          if (r.ok) {
            const d = await r.json().catch(() => null);
            const inst = d?.instance || d;
            const p = normalizePhone(inst?.owner || inst?.wid || inst?.phoneconnected);
            if (p && p.length >= 10) {
              connectedPhone = p;
              await supabase
                .from("integration_whatsapp")
                .update({ connected_phone: connectedPhone, last_status_check: new Date().toISOString() })
                .eq("tenant_id", tenant_id)
                .eq("provider", "uazapi");
            }
          }
        } catch (err: any) {
          console.warn(`[fe-list-groups] uazapi status error: ${err.message}`);
        }
      }

      try {
        const res = await fetch(`${uazUrl}/group/list`, { method: "GET", headers: uazH });
        const text = await res.text();
        if (!res.ok) {
          return new Response(JSON.stringify({ error: `uazapi retornou ${res.status}: ${text.slice(0,200)}` }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let data: any = null;
        try { data = JSON.parse(text); } catch { data = null; }
        const uazGroups: any[] = Array.isArray(data) ? data : (data?.groups || data?.data || []);
        console.log(`[fe-list-groups] uazapi parsed ${uazGroups.length} groups; connectedPhone=${connectedPhone || "n/a"}`);

        // Enrich each group with admin detection (parallel, concurrency 10)
        const enriched = await parallelLimit(uazGroups, 10, async (g: any) => {
          const rawJid = g.JID || g.id || g.jid || g.remoteJid || g.groupJid;
          const groupJid = canonicalGroupJid(rawJid);
          if (!groupJid) return null;

          const groupName = g.Name || g.subject || g.name || groupJid;
          const ownerRaw = g.OwnerPN || g.owner || g.OwnerJID || "";
          const ownerPhone = normalizePhone(String(ownerRaw).split("@")[0]);

          let isAdmin = false;
          if (connectedPhone && ownerPhone && phonesMatch(ownerPhone, connectedPhone)) {
            isAdmin = true;
          }
          const hintFields = [g.wa_isAdmin, g.iAmAdmin, g.isAdmin, g.imAdmin, g.owner_is_me];
          if (!isAdmin && hintFields.some((v) => v === true)) isAdmin = true;

          let participants: any[] = Array.isArray(g.Participants) ? g.Participants : (Array.isArray(g.participants) ? g.participants : []);
          let participantCount = g.ParticipantCount || g.size || g.participantsCount || participants.length || 0;

          if (!isAdmin && connectedPhone && participants.length === 0) {
            try {
              const infoRes = await fetch(`${uazUrl}/group/info`, {
                method: "POST",
                headers: uazH,
                body: JSON.stringify({ groupjid: groupJid }),
              });
              if (infoRes.ok) {
                const info = await infoRes.json().catch(() => null);
                const grp = info?.group || info;
                participants = grp?.Participants || grp?.participants || info?.participants || [];
                if (participants.length > 0) participantCount = participants.length;
                const grpOwner = grp?.OwnerPN || grp?.owner;
                if (grpOwner && phonesMatch(normalizePhone(String(grpOwner).split("@")[0]), connectedPhone)) isAdmin = true;
              }
            } catch (err: any) {
              console.warn(`[fe-list-groups] uazapi /group/info ${groupJid} error: ${err.message}`);
            }
          }

          if (!isAdmin && connectedPhone && participants.length > 0) {
            isAdmin = participants.some((p: any) => {
              const phoneRaw = p.PhoneNumber || p.phone || (typeof p === "string" ? p : (p.id || p.jid || ""));
              const pPhone = normalizePhone(String(phoneRaw).split("@")[0]);
              const adminFlag = typeof p === "object" && (
                p.IsAdmin === true || p.IsSuperAdmin === true ||
                p.admin === "admin" || p.admin === "superadmin" ||
                p.isAdmin === true || p.isSuperAdmin === true ||
                p.role === "admin" || p.role === "superadmin"
              );
              return adminFlag && phonesMatch(pPhone, connectedPhone);
            });
          }

          let inviteLink: string | null = null;
          if (isAdmin) {
            inviteLink = await fetchUazapiInviteLink(uazUrl, uazH, groupJid);
          }

          return {
            tenant_id,
            group_jid: groupJid,
            group_name: groupName,
            participant_count: participantCount,
            max_participants: 1024,
            invite_link: inviteLink,
            is_admin: isAdmin,
          };
        });

        const dedupMapUaz = new Map<string, any>();
        for (const g of enriched) {
          if (!g) continue;
          const prev = dedupMapUaz.get(g.group_jid);
          if (!prev || (g.participant_count || 0) > (prev.participant_count || 0)) {
            dedupMapUaz.set(g.group_jid, g);
          }
        }
        const upsertPayload = Array.from(dedupMapUaz.values());

        // Preserva o link já salvo quando a busca do link falhou (não sobrescreve com null)
        const { data: existingUazGroups } = await supabase
          .from("fe_groups")
          .select("group_jid, invite_link")
          .eq("tenant_id", tenant_id);
        const existingUazLinks = new Map((existingUazGroups || []).map((g) => [g.group_jid, g.invite_link]));
        for (const g of upsertPayload) {
          if (!g.invite_link) g.invite_link = existingUazLinks.get(g.group_jid) || null;
        }

        let added = 0;
        if (upsertPayload.length > 0) {
          for (let i = 0; i < upsertPayload.length; i += 50) {
            const chunk = upsertPayload.slice(i, i + 50);
            const { error } = await supabase.from("fe_groups").upsert(chunk, { onConflict: "tenant_id,group_jid" });
            if (error) console.error(`[fe-list-groups] uazapi upsert error: ${error.message}`);
            else added += chunk.length;
          }
        }

        const { data: groups } = await supabase
          .from("fe_groups")
          .select("*")
          .eq("tenant_id", tenant_id)
          .order("group_name");

        const adminCount = upsertPayload.filter((g: any) => g.is_admin).length;
        return new Response(JSON.stringify({
          added,
          total_found: uazGroups.length,
          synced: upsertPayload.length,
          admin_count: adminCount,
          admin_only: !!admin_only,
          provider: "uazapi",
          warning: (!connectedPhone) ? "Número conectado não identificado — nenhum grupo marcado como admin." : undefined,
          groups,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (err: any) {
        console.error(`[fe-list-groups] uazapi error: ${err.message}`);
        return new Response(JSON.stringify({ error: `uazapi: ${err.message}` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // ─────────── /UAZAPI BRANCH ───────────


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

      if (!connectedPhone) {
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
          // Prefer actual participants array length over metadata count fields (which can be stale/inflated)
          const count = participants.length > 0 ? participants.length : (parseCount(meta) || baseCount);

          let isAdmin = false;
          if (connectedPhone && participants.length > 0) {
            isAdmin = participants.some((p: any) => {
              const pPhone = normalizePhone(p.phone);
              return phonesMatch(pPhone, connectedPhone) && (p.isAdmin === true || p.isSuperAdmin === true);
            });
            if (!isAdmin) {
              // Log ALL admin participants for debugging
              const admins = participants.filter((p: any) => p.isAdmin || p.isSuperAdmin).map((p: any) => normalizePhone(p.phone));
              console.log(`[fe-list-groups] ${group.phone}: NOT admin. connectedPhone=${connectedPhone}, core=${coreNumber(connectedPhone)}, adminPhones=[${admins.join(",")}]`);
            }
          }

          return {
            group_jid: canonicalGroupJid(group.phone),
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
        group_jid: canonicalGroupJid(group.phone),
        group_name: group.name || group.subject || group.phone,
        participant_count: baseCount,
        invite_link: group.invitationLink || group.inviteLink || null,
        _isAdmin: false,
        _include: !effectiveAdminOnly,
      };
    });

    // Always sync ALL groups; store is_admin per row so the frontend can filter
    const filteredGroups = enrichedGroups;
    const adminCount = enrichedGroups.filter((g) => g._isAdmin).length;
    console.log(`[fe-list-groups] ${adminCount}/${allGroups.length} groups where connected phone is admin (connectedPhone=${connectedPhone || "n/a"})`);

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
      max_participants: 1024,
      invite_link: g.invite_link || existingLinks.get(g.group_jid) || null,
      is_admin: !!g._isAdmin,
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
      ? "Número conectado não encontrado. Grupos sincronizados sem marcação de admin."
      : undefined;

    return new Response(JSON.stringify({
      added,
      total_found: allGroups.length,
      synced: filteredGroups.length,
      admin_count: adminCount,
      admin_only: !!admin_only,
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
