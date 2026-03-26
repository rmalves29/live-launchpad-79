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
    const { tenant_id } = await req.json();
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

    // Try /picture endpoint first (returns image directly)
    const picUrl = `https://graph.facebook.com/v21.0/${accountId}/picture?type=normal&access_token=${encodeURIComponent(token)}`;
    const picRes = await fetch(picUrl, { redirect: "follow" });

    if (picRes.ok) {
      const blob = await picRes.blob();
      if (blob.size > 0) {
        return new Response(blob, {
          headers: {
            ...corsHeaders,
            "Content-Type": blob.type || "image/jpeg",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    }

    // Fallback: get profile_picture_url and proxy it
    const profileRes = await fetch(
      `https://graph.facebook.com/v21.0/${accountId}?fields=profile_picture_url&access_token=${encodeURIComponent(token)}`
    );
    const profileData = await profileRes.json();

    if (profileData?.profile_picture_url) {
      const imgRes = await fetch(profileData.profile_picture_url);
      if (imgRes.ok) {
        const imgBlob = await imgRes.blob();
        return new Response(imgBlob, {
          headers: {
            ...corsHeaders,
            "Content-Type": imgBlob.type || "image/jpeg",
            "Cache-Control": "public, max-age=3600",
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
