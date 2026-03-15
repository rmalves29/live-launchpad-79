import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Get Z-API credentials
    const { data: waConfig } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, connected_phone")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapi")
      .eq("is_active", true)
      .maybeSingle();

    if (!waConfig?.zapi_instance_id || !waConfig?.zapi_token) {
      return new Response(JSON.stringify({ error: "Z-API não configurada para este tenant" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = `https://api.z-api.io/instances/${waConfig.zapi_instance_id}/token/${waConfig.zapi_token}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (waConfig.zapi_client_token) headers["Client-Token"] = waConfig.zapi_client_token;

    // Fetch ALL groups using the /groups endpoint with pagination
    let allGroups: any[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `${baseUrl}/groups?page=${page}&pageSize=${pageSize}`,
        { headers }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[fe-list-groups] Z-API /groups error: ${response.status} ${errText}`);
        return new Response(JSON.stringify({ error: `Z-API retornou ${response.status}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pageGroups = await response.json();
      if (!Array.isArray(pageGroups) || pageGroups.length === 0) {
        hasMore = false;
      } else {
        allGroups = allGroups.concat(pageGroups);
        if (pageGroups.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    console.log(`[fe-list-groups] Fetched ${allGroups.length} groups from Z-API`);

    // Get connected phone to check admin status
    const connectedPhone = waConfig.connected_phone?.replace(/\D/g, "") || "";

    // Fetch metadata for all groups (to get participant count and admin status)
    let filteredGroups = allGroups;

    if (connectedPhone) {
      console.log(`[fe-list-groups] Filtering admin-only groups for phone ${connectedPhone}`);
      const adminGroups: any[] = [];

      for (const g of allGroups) {
        try {
          // Use light-group-metadata (faster, no invite link fetch)
          const metaRes = await fetch(
            `${baseUrl}/light-group-metadata/${g.phone}`,
            { headers }
          );

          if (metaRes.ok) {
            const meta = await metaRes.json();
            const participants = meta.participants || [];
            const isAdmin = participants.some(
              (p: any) =>
                (p.phone?.replace(/\D/g, "") === connectedPhone ||
                  p.phone?.includes(connectedPhone)) &&
                p.isAdmin === true
            );

            if (isAdmin) {
              // Also grab invite link and participant count from metadata
              adminGroups.push({
                ...g,
                participantsCount: participants.length,
                invitationLink: meta.invitationLink || null,
              });
            }
          }

          // Small delay to avoid rate limiting
          await new Promise((r) => setTimeout(r, 200));
        } catch (err: any) {
          console.warn(`[fe-list-groups] Metadata error for ${g.phone}: ${err.message}`);
        }
      }

      filteredGroups = adminGroups;
      console.log(`[fe-list-groups] ${adminGroups.length}/${allGroups.length} groups where we are admin`);
    }

    // Upsert into fe_groups
    let added = 0;
    for (const g of filteredGroups) {
      const upsertData: any = {
        tenant_id,
        group_jid: g.phone,
        group_name: g.name || g.subject || g.phone,
        participant_count: g.participantsCount || g.size || 0,
      };

      // Save invite link if available
      if (g.invitationLink) {
        upsertData.invite_link = g.invitationLink;
      }

      const { error } = await supabase
        .from("fe_groups")
        .upsert(upsertData, { onConflict: "tenant_id,group_jid" });
      if (!error) added++;
    }

    // Return updated list
    const { data: groups } = await supabase
      .from("fe_groups")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("group_name");

    return new Response(
      JSON.stringify({
        added,
        total_found: allGroups.length,
        synced: filteredGroups.length,
        admin_only: !!admin_only,
        groups,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[fe-list-groups] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
