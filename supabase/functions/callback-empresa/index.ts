import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    const service = url.searchParams.get("service");
    if (service !== "melhorenvio") throw new Error("service inválido");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || ""; // seu tenant_id vem aqui
    if (!code) throw new Error("code ausente");

    console.log('🔍 DEBUG - Callback recebido:', {
      url: req.url,
      code: code ? `${code.substring(0, 10)}...` : 'não fornecido',
      state,
      service,
      allParams: Object.fromEntries(url.searchParams.entries())
    });

    // PRODUÇÃO
    const clientId = Deno.env.get("ME_CLIENT_ID_PROD")!;       // 20128
    const clientSecret = Deno.env.get("ME_CLIENT_SECRET_PROD")!; // cole o secret EXATO
    const tokenUrl = "https://melhorenvio.com.br/oauth/token";
    const redirectUri = "https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa?service=melhorenvio";

    // form-url-encoded + Basic Auth
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri, // sem encode manual; o URLSearchParams já codifica
    });
    const basic = btoa(`${clientId}:${clientSecret}`);

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basic}`,
        "Accept": "application/json",
      },
      body,
    });

    const raw = await tokenRes.text();
    if (!tokenRes.ok) {
      console.error("Token exchange failed", tokenRes.status, raw);
      throw new Error(`Token exchange failed: ${tokenRes.status} - ${raw}`);
    }

    const tok = JSON.parse(raw);

    // salve na sua tabela de integrações
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("shipping_integrations").upsert({
      tenant_id: state || "08f2b1b9-3988-489e-8186-c60f0c0b0622",
      provider: "melhor_envio",
      client_id: clientId,
      client_secret: clientSecret,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      token_type: tok.token_type || "Bearer",
      scope: tok.scope || null,
      expires_at: tok.expires_in
        ? new Date(Date.now() + tok.expires_in * 1000).toISOString()
        : null,
      sandbox: false,
      is_active: true,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("DB upsert failed", error);
      throw new Error("DB upsert failed: " + error.message);
    }

    // redirecione de volta ao painel
    const ok = "https://hxtbsieodbtzgcvvkeqx.lovableproject.com/config?tab=integracoes&melhorenvio=connected";
    return new Response(null, { status: 302, headers: { Location: ok, ...cors } });

  } catch (e) {
    console.error("❌ Erro na function:", e);
    const back = `https://hxtbsieodbtzgcvvkeqx.lovableproject.com/config?tab=integracoes&melhorenvio=config_error&reason=${encodeURIComponent(e.message)}`;
    return new Response(null, { status: 302, headers: { Location: back, ...cors } });
  }
});
