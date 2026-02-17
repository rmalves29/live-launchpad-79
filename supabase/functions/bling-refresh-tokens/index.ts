// refresh-all-tokens v2.0 - Proactive token renewal for all integrations (Bling + Melhor Envio)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";
const PROACTIVE_HOURS = 48; // Refresh if expiring within 48h

interface RefreshResult {
  tenant_id: string;
  tenant_name: string;
  provider: string;
  success: boolean;
  error?: string;
  expires_at?: string;
  action?: string; // 'refreshed' | 'skipped' | 'deactivated'
}

function isExpiringSoon(expiresAt: string | null, hoursThreshold: number): boolean {
  if (!expiresAt) return true; // No expiry info = assume needs refresh
  const expiry = new Date(expiresAt).getTime();
  const threshold = Date.now() + hoursThreshold * 60 * 60 * 1000;
  return expiry < threshold;
}

async function logCriticalFailure(
  supabase: any,
  tenantId: string,
  provider: string,
  errorMessage: string
) {
  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      entity: "integration",
      entity_id: provider,
      action: "token_refresh_failed",
      meta: {
        provider,
        error: errorMessage,
        requires_manual_reauth: true,
        timestamp: new Date().toISOString(),
      },
    });
    console.error(`[refresh-tokens] CRITICAL: ${provider} token for tenant ${tenantId} - ${errorMessage}`);
  } catch (e) {
    console.error(`[refresh-tokens] Failed to log audit:`, e);
  }
}

// ======================== BLING REFRESH ========================
async function refreshBlingTokens(supabase: any, tenantMap: Map<string, string>): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  const { data: integrations, error } = await supabase
    .from("integration_bling")
    .select("id, tenant_id, client_id, client_secret, refresh_token, token_expires_at, is_active")
    .eq("is_active", true)
    .not("refresh_token", "is", null);

  if (error || !integrations?.length) {
    console.log(`[refresh-tokens] Bling: ${error ? 'Error: ' + error.message : 'No active integrations'}`);
    return results;
  }

  console.log(`[refresh-tokens] Bling: Found ${integrations.length} active integrations`);

  for (const integration of integrations) {
    const tenantName = tenantMap.get(integration.tenant_id) || "Desconhecido";

    // Skip if token is not expiring soon
    if (!isExpiringSoon(integration.token_expires_at, PROACTIVE_HOURS)) {
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "bling",
        success: true,
        action: "skipped",
        expires_at: integration.token_expires_at,
      });
      continue;
    }

    if (!integration.client_id || !integration.client_secret) {
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "bling",
        success: false,
        error: "Credenciais incompletas",
      });
      continue;
    }

    try {
      console.log(`[refresh-tokens] Bling: Refreshing token for ${tenantName}`);
      const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);

      const tokenResponse = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: integration.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`[refresh-tokens] Bling error for ${tenantName}:`, errorText);

        if (errorText.includes("invalid_grant") || errorText.includes("expired")) {
          // Deactivate - requires manual reauth
          await supabase
            .from("integration_bling")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", integration.id);

          await logCriticalFailure(supabase, integration.tenant_id, "bling",
            "Refresh token expirado - reautorização manual necessária");

          results.push({
            tenant_id: integration.tenant_id,
            tenant_name: tenantName,
            provider: "bling",
            success: false,
            action: "deactivated",
            error: "Refresh token expirado - reautorização necessária",
          });
        } else {
          results.push({
            tenant_id: integration.tenant_id,
            tenant_name: tenantName,
            provider: "bling",
            success: false,
            error: `API error: ${errorText.substring(0, 200)}`,
          });
        }
        continue;
      }

      const tokenData = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000);

      await supabase
        .from("integration_bling")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      console.log(`[refresh-tokens] Bling: ✓ Token renewed for ${tenantName}`);
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "bling",
        success: true,
        action: "refreshed",
        expires_at: expiresAt.toISOString(),
      });

      await new Promise(r => setTimeout(r, 500)); // Rate limit
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "bling",
        success: false,
        error: msg,
      });
    }
  }

  return results;
}

// ======================== MELHOR ENVIO REFRESH ========================
async function refreshMelhorEnvioTokens(supabase: any, tenantMap: Map<string, string>): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];

  const { data: integrations, error } = await supabase
    .from("shipping_integrations")
    .select("id, tenant_id, access_token, refresh_token, client_id, client_secret, expires_at, sandbox, is_active")
    .eq("provider", "melhor_envio")
    .eq("is_active", true)
    .not("refresh_token", "is", null);

  if (error || !integrations?.length) {
    console.log(`[refresh-tokens] Melhor Envio: ${error ? 'Error: ' + error.message : 'No active integrations'}`);
    return results;
  }

  console.log(`[refresh-tokens] Melhor Envio: Found ${integrations.length} active integrations`);

  // Use env-level client credentials as fallback
  const globalClientId = Deno.env.get("ME_CLIENT_ID") || Deno.env.get("MELHOR_ENVIO_CLIENT_ID");
  const globalClientSecret = Deno.env.get("ME_CLIENT_SECRET") || Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET");

  for (const integration of integrations) {
    const tenantName = tenantMap.get(integration.tenant_id) || "Desconhecido";

    if (!isExpiringSoon(integration.expires_at, PROACTIVE_HOURS)) {
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "melhor_envio",
        success: true,
        action: "skipped",
        expires_at: integration.expires_at,
      });
      continue;
    }

    const clientId = integration.client_id || globalClientId;
    const clientSecret = integration.client_secret || globalClientSecret;

    if (!clientId || !clientSecret || !integration.refresh_token) {
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "melhor_envio",
        success: false,
        error: "Credenciais ou refresh_token ausentes",
      });
      continue;
    }

    try {
      console.log(`[refresh-tokens] Melhor Envio: Refreshing token for ${tenantName}`);
      const baseUrl = integration.sandbox
        ? "https://sandbox.melhorenvio.com.br"
        : "https://melhorenvio.com.br";

      const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "OrderZaps/1.0",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: integration.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`[refresh-tokens] Melhor Envio error for ${tenantName}:`, errorText);

        if (tokenResponse.status === 401 || errorText.includes("invalid_grant")) {
          await supabase
            .from("shipping_integrations")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", integration.id);

          await logCriticalFailure(supabase, integration.tenant_id, "melhor_envio",
            "Refresh token expirado - reautorização manual necessária");

          results.push({
            tenant_id: integration.tenant_id,
            tenant_name: tenantName,
            provider: "melhor_envio",
            success: false,
            action: "deactivated",
            error: "Refresh token expirado - reautorização necessária",
          });
        } else {
          results.push({
            tenant_id: integration.tenant_id,
            tenant_name: tenantName,
            provider: "melhor_envio",
            success: false,
            error: `API error: ${errorText.substring(0, 200)}`,
          });
        }
        continue;
      }

      const tokenData = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 2592000) * 1000);

      await supabase
        .from("shipping_integrations")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: expiresAt.toISOString(),
          token_type: tokenData.token_type || "Bearer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      console.log(`[refresh-tokens] Melhor Envio: ✓ Token renewed for ${tenantName}`);
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "melhor_envio",
        success: true,
        action: "refreshed",
        expires_at: expiresAt.toISOString(),
      });

      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      results.push({
        tenant_id: integration.tenant_id,
        tenant_name: tenantName,
        provider: "melhor_envio",
        success: false,
        error: msg,
      });
    }
  }

  return results;
}

// ======================== MAIN HANDLER ========================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[refresh-tokens] Starting proactive token renewal...");

    // Build tenant name map
    const { data: tenants } = await supabase.from("tenants").select("id, name");
    const tenantMap = new Map((tenants || []).map((t: any) => [t.id, t.name]));

    // Run both refreshes in parallel
    const [blingResults, meResults] = await Promise.all([
      refreshBlingTokens(supabase, tenantMap),
      refreshMelhorEnvioTokens(supabase, tenantMap),
    ]);

    const allResults = [...blingResults, ...meResults];
    const successCount = allResults.filter(r => r.success).length;
    const errorCount = allResults.filter(r => !r.success).length;
    const refreshedCount = allResults.filter(r => r.action === "refreshed").length;
    const skippedCount = allResults.filter(r => r.action === "skipped").length;
    const deactivatedCount = allResults.filter(r => r.action === "deactivated").length;

    const summary = {
      message: "Renovação proativa de tokens concluída",
      processed: allResults.length,
      refreshed: refreshedCount,
      skipped: skippedCount,
      deactivated: deactivatedCount,
      success: successCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
      results: allResults,
    };

    console.log(`[refresh-tokens] Done: ${refreshedCount} refreshed, ${skippedCount} skipped, ${errorCount} errors, ${deactivatedCount} deactivated`);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[refresh-tokens] General error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido", timestamp: new Date().toISOString() }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
