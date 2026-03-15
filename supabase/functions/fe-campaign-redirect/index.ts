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

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const tenantSlug = url.searchParams.get("tenant");

    if (!slug || !tenantSlug) {
      return new Response("<h1>Link inválido</h1>", {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Fetch tenant by slug
    const { data: tenantData } = await supabase
      .rpc("get_tenant_by_slug", { slug_param: tenantSlug });

    const tenant = tenantData?.[0] || tenantData;
    if (!tenant) {
      return new Response("<h1>Empresa não encontrada</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Fetch campaign scoped to tenant
    const { data: campaign, error: campErr } = await supabase
      .from("fe_campaigns")
      .select("id, tenant_id, name, is_entry_open, is_active")
      .eq("slug", slug)
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .maybeSingle();

    if (campErr || !campaign) {
      return new Response("<h1>Campanha não encontrada</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (!campaign.is_entry_open) {
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
          <h1>🚫 Entrada fechada</h1>
          <p>Esta campanha não está aceitando novos participantes no momento.</p>
        </body></html>`,
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Fetch campaign groups with their group details
    const { data: campaignGroups } = await supabase
      .from("fe_campaign_groups")
      .select("group_id, fe_groups!inner(id, group_name, invite_link, participant_count, max_participants, is_entry_open, is_active)")
      .eq("campaign_id", campaign.id);

    if (!campaignGroups?.length) {
      return new Response("<h1>Nenhum grupo disponível</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Filter: only active groups with entry open and below max capacity
    const availableGroups = campaignGroups
      .map((cg: any) => cg.fe_groups)
      .filter((g: any) => g && g.is_active && g.is_entry_open && g.invite_link)
      .filter((g: any) => !g.max_participants || (g.participant_count || 0) < g.max_participants)
      .sort((a: any, b: any) => (a.participant_count || 0) - (b.participant_count || 0));

    if (!availableGroups.length) {
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
          <h1>😔 Grupos lotados</h1>
          <p>Todos os grupos desta campanha estão cheios no momento. Tente novamente mais tarde.</p>
        </body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Pick the group with fewest participants (balancing)
    const selectedGroup = availableGroups[0];

    // Record click
    const userAgent = req.headers.get("user-agent") || "";
    const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const encoder = new TextEncoder();
    const data = encoder.encode(forwarded + "salt_fe_clicks");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const ipHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);

    await supabase.from("fe_link_clicks").insert({
      campaign_id: campaign.id,
      ip_hash: ipHash,
      user_agent: userAgent.substring(0, 500),
      redirected_group_id: selectedGroup.id,
    });

    // Increment participant_count optimistically
    await supabase
      .from("fe_groups")
      .update({ participant_count: (selectedGroup.participant_count || 0) + 1 })
      .eq("id", selectedGroup.id);

    // Redirect to WhatsApp group invite link
    return new Response(null, {
      status: 302,
      headers: {
        Location: selectedGroup.invite_link,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("[fe-campaign-redirect] Error:", error.message);
    return new Response(`<h1>Erro interno</h1><p>${error.message}</p>`, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
});
