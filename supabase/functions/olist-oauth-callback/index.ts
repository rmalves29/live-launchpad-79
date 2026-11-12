// Olist ERP (API v3): volta do login. Troca o código por tokens e grava. Público (a Olist redireciona o navegador para cá).
// O "state" é um código de uso único guardado no banco (10 min): sem ele válido, nada é gravado.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { OLIST_TOKEN_URL, REFRESH_EVERY_MS } from "../_shared/olist.ts";

function baseUrl() {
  let b = Deno.env.get("PUBLIC_BASE_URL") || "https://hxtbsieodbtzgcvvkeqx.lovableproject.com";
  if (!b.startsWith("http://") && !b.startsWith("https://")) b = `https://${b}`;
  return b;
}
function back(result: "success" | "error", reason?: string) {
  const u = new URL("/integracoes", baseUrl());
  u.searchParams.set("olist", result);
  if (reason) u.searchParams.set("reason", reason.slice(0, 160));
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const err = url.searchParams.get("error");

    if (err) return back("error", url.searchParams.get("error_description") || err);
    if (!code || !state || state.length < 32) return back("error", "Retorno inválido da Olist. Clique em Autorizar de novo.");

    // consome o state (uso único): só quem tem o código gerado pelo nosso botão passa
    const { data: row } = await supabase
      .from("integration_olist")
      .update({ oauth_state: null, oauth_state_expires_at: null })
      .eq("oauth_state", state)
      .gt("oauth_state_expires_at", new Date().toISOString())
      .select("id, tenant_id, client_id, client_secret")
      .maybeSingle();
    if (!row?.client_id || !row.client_secret) return back("error", "Link de autorização expirado. Clique em Autorizar de novo.");

    const resp = await fetch(OLIST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: row.client_id,
        client_secret: row.client_secret,
        redirect_uri: `${supabaseUrl}/functions/v1/olist-oauth-callback`,
        code,
      }),
    });
    const raw = await resp.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { data = null; }
    if (!resp.ok || !data?.access_token || !data?.refresh_token) {
      console.error(`[olist-oauth-callback] troca de código falhou (${resp.status}):`, raw.slice(0, 200));
      return back("error", data?.error_description || data?.error || "A Olist recusou o código de autorização");
    }

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("integration_olist")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_expires_at: new Date(Date.now() + (Number(data.expires_in) || 14400) * 1000).toISOString(),
        status: "ativa",
        is_active: true,
        authorized_at: nowIso,
        last_refresh_at: nowIso,
        next_refresh_at: new Date(Date.now() + REFRESH_EVERY_MS).toISOString(),
        refresh_failures: 0,
        first_failure_at: null,
        last_error: null,
        refreshing_at: null,
      })
      .eq("id", row.id);
    if (error) return back("error", "Erro ao salvar a autorização");
    return back("success");
  } catch (e) {
    console.error("[olist-oauth-callback]", (e as Error).message);
    return back("error", "Erro interno");
  }
});
