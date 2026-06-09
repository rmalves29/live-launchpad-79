import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENTRY_API_BASE = "https://sentry.io/api/0";

// Simple in-memory cache for slugs (persists within isolate)
let orgSlugCache: string | null = null;
let projectSlugCache: string | null = null;

async function resolveSlugs(authToken: string): Promise<{ orgSlug: string; projectSlug: string }> {
  if (orgSlugCache && projectSlugCache) {
    return { orgSlug: orgSlugCache, projectSlug: projectSlugCache };
  }

  // List organizations
  const orgsRes = await fetch(`${SENTRY_API_BASE}/organizations/`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!orgsRes.ok) throw new Error(`Failed to list orgs: ${orgsRes.status}`);
  const orgs = await orgsRes.json();

  // Find org by numeric ID from DSN: 4511536610607104
  const org = orgs.find((o: any) => o.id === "4511536610607104");
  if (!org) throw new Error("Sentry organization not found");
  orgSlugCache = org.slug;

  // List projects in org
  const projectsRes = await fetch(`${SENTRY_API_BASE}/organizations/${org.slug}/projects/`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!projectsRes.ok) throw new Error(`Failed to list projects: ${projectsRes.status}`);
  const projects = await projectsRes.json();

  // Find project by numeric ID from DSN: 4511536728637440
  const project = projects.find((p: any) => p.id === "4511536728637440");
  if (!project) throw new Error("Sentry project not found");
  projectSlugCache = project.slug;

  return { orgSlug: orgSlugCache, projectSlug: projectSlugCache };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authToken = Deno.env.get("SENTRY_AUTH_TOKEN");
  if (!authToken) {
    return new Response(
      JSON.stringify({ success: false, error: "SENTRY_AUTH_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (!action || action !== "issues") {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid action. Use ?action=issues" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { orgSlug, projectSlug } = await resolveSlugs(authToken);

    // Build Sentry API URL with query params forwarded
    const sentryUrl = new URL(`${SENTRY_API_BASE}/projects/${orgSlug}/${projectSlug}/issues/`);

    // Forward useful query params
    const forwardParams = ["query", "statsPeriod", "status", "sort", "cursor", "limit"];
    for (const param of forwardParams) {
      const value = url.searchParams.get(param);
      if (value) sentryUrl.searchParams.set(param, value);
    }
    if (!sentryUrl.searchParams.has("limit")) {
      sentryUrl.searchParams.set("limit", "50");
    }

    const response = await fetch(sentryUrl.toString(), {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({ success: false, error: `Sentry API error: ${response.status}`, details: text }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract Link header for pagination
    const linkHeader = response.headers.get("Link") || "";

    return new Response(
      JSON.stringify({ success: true, data, pagination: linkHeader }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[sentry-proxy] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
