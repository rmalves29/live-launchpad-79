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
      .select("id, tenant_id, name, is_entry_open, is_active, facebook_pixel_id")
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

    const pixelId = campaign.facebook_pixel_id?.trim();
    const redirectUrl = selectedGroup.invite_link;
    const groupName = selectedGroup.group_name || "";

    // If pixel is configured, render an HTML page that fires the pixel then redirects
    if (pixelId) {
      const safeGroupName = groupName.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirecionando...</title>
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');
fbq('track','PageView');
fbq('track','Lead',{content_name:'${safeGroupName}'});
setTimeout(function(){window.location.href='${redirectUrl}';},800);
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=Lead&noscript=1"/></noscript>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.c{text-align:center;padding:2rem}
.s{width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:#25D366;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1.25rem}
@keyframes spin{to{transform:rotate(360deg)}}
h1{color:#f1f5f9;font-size:1.25rem;font-weight:600;margin-bottom:.5rem}
p{color:#64748b;font-size:.875rem}
</style>
</head><body><div class="c"><div class="s"></div><h1>Entrando no grupo...</h1><p>Você será redirecionado em instantes</p></div></body></html>`;

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // No pixel — direct 302 redirect
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
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
