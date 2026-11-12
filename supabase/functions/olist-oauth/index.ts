// Olist ERP (API v3): credenciais, login (OAuth 2), status, renovação manual e desconexão.
// Todas as ações exigem usuário da empresa (ou super admin). Segredos nunca voltam para o navegador.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { OLIST_AUTH_URL, refreshOlistToken } from "../_shared/olist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function publicStatus(row: any) {
  if (!row) return { status: "sem_credenciais", has_credentials: false };
  return {
    status: row.status,
    is_active: row.is_active,
    has_credentials: !!(row.client_id && row.client_secret),
    client_id: row.client_id || "",
    secret_saved: !!row.client_secret,
    authorized: !!row.refresh_token,
    authorized_at: row.authorized_at,
    token_expires_at: row.token_expires_at,
    last_refresh_at: row.last_refresh_at,
    next_refresh_at: row.next_refresh_at,
    refresh_failures: row.refresh_failures,
    last_error: row.last_error,
    needs_reauth: row.status === "reautorizar",
  };
}

const COLS = "id, tenant_id, client_id, client_secret, refresh_token, status, is_active, authorized_at, token_expires_at, last_refresh_at, next_refresh_at, refresh_failures, last_error";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = text(body.action, 30);
    const tenantId = text(body.tenant_id, 60);
    if (!tenantId) return json({ error: "tenant_id é obrigatório" }, 400);

    const guard = await authorizeTenantCaller(req, supabase, tenantId);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

    const { data: row } = await supabase.from("integration_olist").select(COLS).eq("tenant_id", tenantId).maybeSingle();

    if (action === "status") return json({ success: true, ...publicStatus(row) });

    // Guarda o client_id e o client_secret (o secret em branco mantém o que já está salvo)
    if (action === "save_credentials") {
      const clientId = text(body.client_id, 200);
      const secret = text(body.client_secret, 300);
      if (!clientId) return json({ success: false, error: "Informe o Client ID" });
      if (!row && !secret) return json({ success: false, error: "Informe o Client Secret" });
      const changed = !row || row.client_id !== clientId || (!!secret && secret !== row.client_secret);
      const patch: Record<string, unknown> = { client_id: clientId };
      if (secret) patch.client_secret = secret;
      if (changed) {
        // credenciais novas: o login antigo não vale mais
        Object.assign(patch, { access_token: null, refresh_token: null, token_expires_at: null, is_active: false, status: "aguardando_autorizacao", last_error: null, refresh_failures: 0, first_failure_at: null, next_refresh_at: null, authorized_at: null, oauth_state: null, oauth_state_expires_at: null });
      }
      const { data: saved, error } = row
        ? await supabase.from("integration_olist").update(patch).eq("tenant_id", tenantId).select(COLS).maybeSingle()
        : await supabase.from("integration_olist").insert({ tenant_id: tenantId, ...patch }).select(COLS).maybeSingle();
      if (error) return json({ success: false, error: "Não foi possível salvar as credenciais" });
      return json({ success: true, ...publicStatus(saved) });
    }

    // Gera o link de login na Olist. O state é um código de uso único (10 min) guardado no banco.
    if (action === "authorize") {
      if (!row?.client_id || !row.client_secret) return json({ success: false, error: "Salve o Client ID e o Client Secret primeiro" });
      const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await supabase.from("integration_olist")
        .update({ oauth_state: state, oauth_state_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
        .eq("tenant_id", tenantId);
      const params = new URLSearchParams({
        client_id: row.client_id,
        redirect_uri: `${supabaseUrl}/functions/v1/olist-oauth-callback`,
        scope: "openid",
        response_type: "code",
        state,
      });
      return json({ success: true, authorization_url: `${OLIST_AUTH_URL}?${params.toString()}` });
    }

    if (action === "refresh_now") {
      if (!row?.refresh_token) return json({ success: false, error: "A conta ainda não foi autorizada" });
      const r = await refreshOlistToken(supabase, tenantId);
      const { data: after } = await supabase.from("integration_olist").select(COLS).eq("tenant_id", tenantId).maybeSingle();
      return json({ success: r.ok, action: r.action, error: r.ok ? undefined : r.error, ...publicStatus(after) });
    }

    if (action === "disconnect") {
      if (!row) return json({ success: true, ...publicStatus(null) });
      const { data: after } = await supabase.from("integration_olist")
        .update({ access_token: null, refresh_token: null, token_expires_at: null, is_active: false, status: "aguardando_autorizacao", last_error: null, refresh_failures: 0, first_failure_at: null, next_refresh_at: null, authorized_at: null, oauth_state: null, oauth_state_expires_at: null })
        .eq("tenant_id", tenantId).select(COLS).maybeSingle();
      return json({ success: true, ...publicStatus(after) });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[olist-oauth]", (e as Error).message);
    return json({ success: false, error: "Erro interno" }, 500);
  }
});
