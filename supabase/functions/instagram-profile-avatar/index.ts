import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

async function fetchProfileData(token: string, accountId: string | null) {
  const attempts = [
    `https://graph.instagram.com/me?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(token)}`,
    accountId
      ? `https://graph.instagram.com/v21.0/${accountId}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(token)}`
      : null,
  ].filter(Boolean) as string[];

  for (const requestUrl of attempts) {
    const response = await fetch(requestUrl, {
      headers: { Accept: "application/json" },
    });

    const bodyText = await response.text();

    if (!response.ok) {
      console.warn("[instagram-profile-avatar] Instagram API error", {
        status: response.status,
        requestUrl,
        bodyText,
      });
      continue;
    }

    try {
      const data = JSON.parse(bodyText);
      if (data?.profile_picture_url) {
        return data as { profile_picture_url: string; username?: string; id?: string };
      }
    } catch (error) {
      console.warn("[instagram-profile-avatar] Failed to parse profile response", {
        requestUrl,
        error: String(error),
      });
    }
  }

  return null;
}

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
        headers: jsonHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: config, error } = await supabase
      .from("integration_instagram")
      .select("instagram_account_id, page_access_token, access_token, is_active")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (error || !config) {
      return new Response(JSON.stringify({ error: "config not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    if (!config.is_active) {
      return new Response(JSON.stringify({ error: "integration inactive" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const token = config.access_token || config.page_access_token;
    const accountId = config.instagram_account_id;

    if (!token || !accountId) {
      return new Response(JSON.stringify({ error: "no token or account" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    const profileData = await fetchProfileData(token, accountId);

    if (profileData?.profile_picture_url) {
      // Save the profile picture URL to DB for future direct use
      await supabase
        .from("integration_instagram")
        .update({ profile_picture_url: profileData.profile_picture_url })
        .eq("tenant_id", tenant_id)
        .then(() => {});

      const imgRes = await fetch(profileData.profile_picture_url, {
        headers: { Accept: "image/*" },
      });

      if (imgRes.ok) {
        return new Response(imgRes.body, {
          headers: {
            ...corsHeaders,
            "Content-Type": imgRes.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
            "Content-Disposition": "inline",
          },
        });
      }

      const imageErrorText = await imgRes.text();
      console.warn("[instagram-profile-avatar] Failed to fetch profile image", {
        status: imgRes.status,
        imageErrorText,
      });
    }

    return new Response(JSON.stringify({ error: "image not available" }), {
      status: 404,
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error("[instagram-profile-avatar]", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
