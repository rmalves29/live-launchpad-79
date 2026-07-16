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
      .select("id, tenant_id, name, is_entry_open, is_active, facebook_pixel_id, auto_spawn_enabled, spawn_margin")
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

    // Fetch campaign groups with their group details + weight
    const { data: campaignGroups } = await supabase
      .from("fe_campaign_groups")
      .select("group_id, weight_percent, fe_groups!inner(id, group_name, invite_link, participant_count, max_participants, is_entry_open, is_active)")
      .eq("campaign_id", campaign.id);

    if (!campaignGroups?.length) {
      return new Response("<h1>Nenhum grupo disponível</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Filter: only active groups with entry open and below max capacity.
    // Keep weight_percent attached to each candidate for weighted selection below.
    const availableGroups = campaignGroups
      .map((cg: any) => ({ ...cg.fe_groups, weight_percent: cg.weight_percent }))
      .filter((g: any) => g && g.is_active && g.is_entry_open && g.invite_link)
      .filter((g: any) => !g.max_participants || (g.participant_count || 0) < g.max_participants);

    if (!availableGroups.length) {
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:40px;">
          <h1>😔 Grupos lotados</h1>
          <p>Todos os grupos desta campanha estão cheios no momento. Tente novamente mais tarde.</p>
        </body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    // Weighted random pick. Groups sem weight_percent explícito recebem peso
    // igual (distribuição uniforme). Se todos têm peso 0/null, cai para uniforme.
    const weighted = availableGroups.map((g: any) => ({
      g,
      w: Number.isFinite(g.weight_percent) && g.weight_percent !== null ? Math.max(0, Number(g.weight_percent)) : -1,
    }));
    const hasExplicit = weighted.some((x) => x.w >= 0);
    const finalWeights = hasExplicit
      ? weighted.map((x) => (x.w >= 0 ? x.w : 0))
      : weighted.map(() => 1);
    const totalWeight = finalWeights.reduce((s, w) => s + w, 0);
    let selectedGroup: any;
    if (totalWeight <= 0) {
      // fallback: menor lotação
      selectedGroup = [...availableGroups].sort((a: any, b: any) => (a.participant_count || 0) - (b.participant_count || 0))[0];
    } else {
      let r = Math.random() * totalWeight;
      selectedGroup = availableGroups[availableGroups.length - 1];
      for (let i = 0; i < availableGroups.length; i++) {
        r -= finalWeights[i];
        if (r <= 0) { selectedGroup = availableGroups[i]; break; }
      }
    }


    // Auto-clonagem (equivalente ao "group spawn" do SendFlow): soma de vagas
    // restantes entre os grupos abertos da campanha. Se estiver perto de lotar,
    // dispara a criação do próximo grupo em background — sem bloquear o redirect
    // do visitante atual.
    if (campaign.auto_spawn_enabled) {
      const remainingSlots = availableGroups.reduce((sum: number, g: any) => {
        const cap = g.max_participants ? g.max_participants - (g.participant_count || 0) : Infinity;
        return sum + (Number.isFinite(cap) ? cap : 0);
      }, 0);
      if (remainingSlots <= (campaign.spawn_margin ?? 3)) {
        fetch(`${supabaseUrl}/functions/v1/fe-spawn-group`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ tenant_id: campaign.tenant_id, campaign_id: campaign.id }),
        }).catch((e) => console.warn("[fe-campaign-redirect] auto-spawn fire-and-forget falhou:", e?.message));
      }
    }

    // Record click
    const userAgent = req.headers.get("user-agent") || "";
    const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const encoder = new TextEncoder();
    const data = encoder.encode(forwarded + "salt_fe_clicks");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const ipHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16);

    // Fire-and-forget: gravar clique e incrementar contador NÃO devem bloquear o 302.
    // @ts-ignore EdgeRuntime está disponível no Deno Deploy da Supabase
    const bg = Promise.all([
      supabase.from("fe_link_clicks").insert({
        campaign_id: campaign.id,
        ip_hash: ipHash,
        user_agent: userAgent.substring(0, 500),
        redirected_group_id: selectedGroup.id,
      }),
      supabase
        .from("fe_groups")
        .update({ participant_count: (selectedGroup.participant_count || 0) + 1 })
        .eq("id", selectedGroup.id),
    ]).catch((e) => console.warn("[fe-campaign-redirect] bg write falhou:", e?.message));
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(bg);

    const pixelId = campaign.facebook_pixel_id?.trim();
    const redirectUrl = selectedGroup.invite_link;
    const groupName = selectedGroup.group_name || "";

    // If pixel is configured, fire the Facebook tracking pixel server-side
    // (image beacon endpoint) in background and STILL respond with a 302.
    // Isso evita a tela intermediária que quebrava em alguns in-app browsers
    // (WhatsApp/Instagram) exibindo o HTML como texto puro.
    if (pixelId) {
      const pixelUrl = `https://www.facebook.com/tr/?id=${encodeURIComponent(pixelId)}`
        + `&ev=Lead&noscript=1`
        + `&cd[content_name]=${encodeURIComponent(groupName)}`;
      const pixelFetch = fetch(pixelUrl, {
        method: "GET",
        headers: {
          "User-Agent": userAgent || "Mozilla/5.0",
          "X-Forwarded-For": forwarded,
        },
      }).catch((e) => console.warn("[fe-campaign-redirect] pixel beacon falhou:", e?.message));
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(pixelFetch);
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
