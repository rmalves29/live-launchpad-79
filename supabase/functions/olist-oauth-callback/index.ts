import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Olist ERP (Tiny) OAuth2 Token URL
const OLIST_TOKEN_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

const getPublicBaseUrl = () => {
  let baseUrl = Deno.env.get("PUBLIC_BASE_URL") || "https://hxtbsieodbtzgcvvkeqx.lovableproject.com";
  if (baseUrl && !baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`;
  }
  return baseUrl;
};

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicBaseUrl = getPublicBaseUrl();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    console.log("[olist-oauth-callback] Recebido callback OAuth");

    if (error) {
      console.error("[olist-oauth-callback] Erro na autorização:", error, errorDescription);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", errorDescription || error);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    if (!code || !state) {
      console.error("[olist-oauth-callback] Code ou state faltando");
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", "Parâmetros inválidos");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Decodificar state
    let stateData;
    try {
      let decodedState: string;
      if (state.startsWith('{') || state.startsWith('%7B')) {
        decodedState = decodeURIComponent(state);
      } else {
        try {
          decodedState = atob(state);
        } catch {
          decodedState = decodeURIComponent(state);
        }
      }
      stateData = JSON.parse(decodedState);
    } catch (e) {
      console.error("[olist-oauth-callback] Erro ao decodificar state:", e);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", "State inválido");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const { tenant_id } = stateData;

    if (!tenant_id) {
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", "Tenant não identificado");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    console.log(`[olist-oauth-callback] Processando para tenant: ${tenant_id}`);

    // Buscar credenciais do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("integration_olist")
      .select("client_id, client_secret")
      .eq("tenant_id", tenant_id)
      .single();

    if (integrationError || !integration?.client_id || !integration?.client_secret) {
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", "Integração não encontrada ou credenciais incompletas");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Trocar code por tokens
    const callbackUrl = `${supabaseUrl}/functions/v1/olist-oauth-callback`;

    console.log("[olist-oauth-callback] Trocando code por tokens...");

    const tokenResponse = await fetch(OLIST_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: integration.client_id,
        client_secret: integration.client_secret,
        redirect_uri: callbackUrl,
        code: code,
      }),
    });

    const tokenText = await tokenResponse.text();
    console.log(`[olist-oauth-callback] Token response status: ${tokenResponse.status}`);

    if (!tokenResponse.ok) {
      console.error("[olist-oauth-callback] Erro ao obter tokens:", tokenText);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", `Falha ao obter tokens: ${tokenText.substring(0, 100)}`);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    let tokenData;
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", "Resposta inválida do Olist");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Token expira em 4 horas (14400s)
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 14400));

    const { error: updateError } = await supabase
      .from("integration_olist")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        is_active: true,
        sync_orders: true,
        sync_products: true,
        sync_stock: false,
        sync_invoices: true,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenant_id);

    if (updateError) {
      console.error("[olist-oauth-callback] Erro ao salvar tokens:", updateError);
      const redirectUrl = new URL("/integracoes", publicBaseUrl);
      redirectUrl.searchParams.set("olist", "error");
      redirectUrl.searchParams.set("reason", "Erro ao salvar tokens no banco de dados");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    console.log(`[olist-oauth-callback] Autorização completa para tenant: ${tenant_id}`);

    const redirectUrl = new URL("/integracoes", publicBaseUrl);
    redirectUrl.searchParams.set("olist", "success");
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (error) {
    console.error("[olist-oauth-callback] Erro geral:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const publicBaseUrl = getPublicBaseUrl();
    const redirectUrl = new URL("/integracoes", publicBaseUrl);
    redirectUrl.searchParams.set("olist", "error");
    redirectUrl.searchParams.set("reason", `Erro interno: ${msg}`);
    return Response.redirect(redirectUrl.toString(), 302);
  }
});
