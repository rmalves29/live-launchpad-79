import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let tenant_id: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      tenant_id = url.searchParams.get("tenant_id");
    } else {
      const body = await req.json();
      tenant_id = body?.tenant_id ?? null;
    }

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: config, error } = await supabase
      .from("integration_instagram")
      .select("instagram_account_id, page_access_token, access_token")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (error || !config) {
      return new Response(JSON.stringify({ error: "config not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = config.page_access_token || config.access_token;
    const accountId = config.instagram_account_id;

    if (!token || !accountId) {
      return new Response(JSON.stringify({ error: "no token or account" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use graph.instagram.com (required for Instagram Login tokens)
    let profileData: { profile_picture_url?: string } | null = null;

    const accountProfileRes = await fetch(
      `https://graph.instagram.com/v21.0/${accountId}?fields=profile_picture_url&access_token=${encodeURIComponent(token)}`
    );

    if (accountProfileRes.ok) {
      profileData = await accountProfileRes.json();
    }

    if (!profileData?.profile_picture_url) {
      const meProfileRes = await fetch(
        `https://graph.instagram.com/me?fields=profile_picture_url&access_token=${encodeURIComponent(token)}`
      );

      if (meProfileRes.ok) {
        profileData = await meProfileRes.json();
      }
    }

    if (profileData?.profile_picture_url) {
      const imgRes = await fetch(profileData.profile_picture_url);
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob();
        return new Response(imgBlob, {
          headers: {
            ...corsHeaders,
            "Content-Type": imgBlob.type || "image/jpeg",
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": "inline",
          },
        });
      }
    }

    return new Response(JSON.stringify({ error: "image not available" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[instagram-profile-avatar]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
