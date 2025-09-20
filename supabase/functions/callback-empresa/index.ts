import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || ""; // tenant_id
    const service = url.searchParams.get("service") || "melhorenvio";
    const action  = url.searchParams.get("action") || "oauth";
    const oauthError = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (service !== "melhorenvio" || action !== "oauth")
      throw new Error("rota inválida para este callback");

    // Se há erro no OAuth, redirecionar com o erro
    if (oauthError) {
      console.error("❌ Erro no OAuth:", oauthError, errorDescription);
      return Response.redirect(
        `https://hxtbsieodbtzgcvvkeqx.lovableproject.com/config?tab=integracoes&melhorenvio=config_error&reason=${encodeURIComponent(
          `OAuth Error: ${oauthError} - ${errorDescription || ''}`
        )}`,
        302
      );
    }

    if (!code)  throw new Error("code ausente");
    if (!state) throw new Error("state (tenant_id) ausente");

    const tenant_id = state;

    // PRODUÇÃO FIXO
    const client_id = Deno.env.get("ME_CLIENT_ID") ?? "";
    const client_secret = Deno.env.get("ME_CLIENT_SECRET") ?? "";
    if (!client_id || !client_secret) throw new Error("ME_CLIENT_ID/ME_CLIENT_SECRET ausentes");

    const base = "https://melhorenvio.com.br";

    // MESMA redirect_uri do /authorize E cadastrada no app
    const redirect_uri =
      "https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa?service=melhorenvio&action=oauth";

    // Troca do code por token (form-urlencoded)
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id,
      client_secret,
      redirect_uri,
      code,
    });

    const tokenRes = await fetch(`${base}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body.toString(),
    });

    const raw = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("Token exchange failed", tokenRes.status, raw);
      return Response.redirect(
        `https://hxtbsieodbtzgcvvkeqx.lovableproject.com/config?tab=integracoes&melhorenvio=config_error&reason=${encodeURIComponent(
          `Token exchange failed: ${tokenRes.status} - ${raw}`
        )}`,
        302
      );
    }

    const token = JSON.parse(raw);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const expires_at = token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from("shipping_integrations")
      .upsert(
        {
          tenant_id,
          provider: "melhor_envio",
          client_id,
          client_secret,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_type: token.token_type || "Bearer",
          scope: token.scope || "",
          expires_at,
          sandbox: false,            // PRODUÇÃO
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,provider" }
      );

    if (error) {
      console.error("DB upsert failed", error);
      return Response.redirect(
        `https://hxtbsieodbtzgcvvkeqx.lovableproject.com/config?tab=integracoes&melhorenvio=config_error&reason=${encodeURIComponent(
          "DB upsert failed: " + error.message
        )}`,
        302
      );
    }

    // sucesso
    return Response.redirect(
      `https://hxtbsieodbtzgcvvkeqx.lovableproject.com/config?tab=integracoes&melhorenvio=ok`,
      302
    );

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
