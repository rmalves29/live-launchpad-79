// Olist ERP (API v3): endereços, renovação de token e leitura do token válido.
// Regras da Olist: access token vale 4 h e refresh token vale 1 dia. Cada renovação devolve um refresh token novo,
// que PRECISA ser gravado na hora (o antigo deixa de valer). Por isso a renovação é travada por empresa:
// duas renovações ao mesmo tempo gastariam o mesmo refresh token e a segunda seria recusada.
// deno-lint-ignore-file no-explicit-any

export const OLIST_AUTH_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth";
export const OLIST_TOKEN_URL = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";
export const OLIST_API_URL = "https://api.tiny.com.br/public-api/v3";

const HOUR = 3600_000;
const MIN = 60_000;
export const REFRESH_EVERY_MS = 2 * HOUR;     // renova a cada 2 h (o access token dura 4 h)
const LOCK_MS = 5 * MIN;                      // trava velha (função que caiu no meio) é ignorada depois disso
const ALERT_AFTER_MS = 12 * HOUR;             // falhando há 12 h seguidas: pede reautorização no painel
const BACKOFF_MIN = [15, 30, 60];             // espera entre tentativas quando a Olist falha

export type RefreshOutcome = { ok: boolean; action: "refreshed" | "busy" | "reauth" | "retry" | "no_token"; error?: string };

function now() { return new Date(); }

async function audit(supabase: any, tenantId: string, error: string) {
  try {
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      entity: "integration",
      entity_id: "olist",
      action: "token_refresh_failed",
      meta: { provider: "olist", error, requires_manual_reauth: true, timestamp: now().toISOString() },
    });
  } catch (e) {
    console.error("[olist] falha ao gravar auditoria:", (e as Error).message);
  }
}

/** Renova o token de UMA empresa. Segura contra chamadas simultâneas (trava no banco). */
export async function refreshOlistToken(supabase: any, tenantId: string): Promise<RefreshOutcome> {
  const lockLimit = new Date(Date.now() - LOCK_MS).toISOString();
  // reserva a empresa: só uma renovação por vez
  const { data: claimed } = await supabase
    .from("integration_olist")
    .update({ refreshing_at: now().toISOString() })
    .eq("tenant_id", tenantId)
    .or(`refreshing_at.is.null,refreshing_at.lt.${lockLimit}`)
    .select("id, tenant_id, client_id, client_secret, refresh_token, refresh_failures, first_failure_at, status")
    .maybeSingle();
  if (!claimed) return { ok: false, action: "busy", error: "Já existe uma renovação em andamento" };
  if (!claimed.refresh_token || !claimed.client_id || !claimed.client_secret) {
    await supabase.from("integration_olist").update({ refreshing_at: null }).eq("id", claimed.id);
    return { ok: false, action: "no_token", error: "Sem credenciais ou sem autorização" };
  }

  let resp: Response | null = null;
  let text = "";
  let netError = "";
  try {
    resp = await fetch(OLIST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: claimed.client_id,
        client_secret: claimed.client_secret,
        refresh_token: claimed.refresh_token,
      }),
    });
    text = await resp.text();
  } catch (e) {
    netError = (e as Error).message || "Falha de rede";
  }

  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  // sucesso: grava os DOIS tokens antes de qualquer outra coisa
  if (resp?.ok && data?.access_token) {
    const expiresAt = new Date(Date.now() + (Number(data.expires_in) || 14400) * 1000);
    const { error } = await supabase
      .from("integration_olist")
      .update({
        access_token: data.access_token,
        refresh_token: data.refresh_token || claimed.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        status: "ativa",
        is_active: true,
        last_refresh_at: now().toISOString(),
        next_refresh_at: new Date(Date.now() + REFRESH_EVERY_MS).toISOString(),
        refresh_failures: 0,
        first_failure_at: null,
        last_error: null,
        refreshing_at: null,
      })
      .eq("id", claimed.id);
    if (error) {
      // o token novo existe na Olist mas não foi salvo: não repetir às cegas
      console.error(`[olist] ERRO ao salvar token novo (${tenantId}):`, error.message);
      return { ok: false, action: "retry", error: "Token renovado mas não foi possível salvar" };
    }
    return { ok: true, action: "refreshed" };
  }

  const failures = (claimed.refresh_failures || 0) + 1;
  const firstFailure = claimed.first_failure_at ? new Date(claimed.first_failure_at) : now();
  const detail = netError || `HTTP ${resp?.status}: ${(data?.error_description || data?.error || text || "sem detalhe").toString().slice(0, 200)}`;

  // refresh token morto: a Olist disse explicitamente invalid_grant (não adivinhamos por texto solto)
  if (resp && data?.error === "invalid_grant") {
    await supabase
      .from("integration_olist")
      .update({ status: "reautorizar", is_active: false, refresh_failures: failures, first_failure_at: firstFailure.toISOString(), last_error: detail, refreshing_at: null })
      .eq("id", claimed.id);
    await audit(supabase, tenantId, "Refresh token recusado (invalid_grant): reautorização necessária");
    return { ok: false, action: "reauth", error: detail };
  }

  // falha passageira (rede, 5xx, limite): tenta de novo mais tarde; após 12 h seguidas avisa no painel
  const backoff = BACKOFF_MIN[Math.min(failures - 1, BACKOFF_MIN.length - 1)];
  const alerta = Date.now() - firstFailure.getTime() >= ALERT_AFTER_MS;
  await supabase
    .from("integration_olist")
    .update({
      status: alerta ? "reautorizar" : "erro",
      refresh_failures: failures,
      first_failure_at: firstFailure.toISOString(),
      last_error: detail,
      next_refresh_at: new Date(Date.now() + backoff * MIN).toISOString(),
      refreshing_at: null,
    })
    .eq("id", claimed.id);
  // grava a auditoria só na virada para "reautorizar", não a cada tentativa
  if (alerta && claimed.status !== "reautorizar") await audit(supabase, tenantId, `Renovação falhando há 12 h: ${detail}`);
  return { ok: false, action: "retry", error: detail };
}

/** Access token pronto para usar nas chamadas à API (renova na hora se faltar menos de 10 min). Para as próximas fases. */
export async function getOlistAccessToken(supabase: any, tenantId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from("integration_olist")
    .select("access_token, token_expires_at, is_active")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!row?.is_active || !row.access_token) return null;
  const left = row.token_expires_at ? new Date(row.token_expires_at).getTime() - Date.now() : 0;
  if (left > 10 * MIN) return row.access_token;
  await refreshOlistToken(supabase, tenantId);
  const { data: again } = await supabase.from("integration_olist").select("access_token, is_active").eq("tenant_id", tenantId).maybeSingle();
  return again?.is_active ? again.access_token : null;
}

const sleepMs = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Chamada à API da Olist em nome de uma empresa. Usa o token da empresa (renova se faltar pouco), refaz UMA vez se a Olist
 * responder 401 (token trocado) e espera/repete se ela limitar o ritmo (429). Nunca lança erro: devolve { ok, status, data }.
 * Em 403 a Olist devolve corpo vazio: quem chama deve explicar que é falta de permissão do usuário no ERP.
 */
export async function olistRequest(
  supabase: any,
  tenantId: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  tries = 3,
): Promise<{ ok: boolean; status: number; data: any }> {
  let token = await getOlistAccessToken(supabase, tenantId);
  if (!token) return { ok: false, status: 401, data: { error: "Olist não conectada ou token indisponível" } };
  let refreshed = false;
  for (let attempt = 1; attempt <= tries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${OLIST_API_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (attempt < tries) { await sleepMs(1500 * attempt); continue; }
      return { ok: false, status: 0, data: { error: (e as Error).message || "Falha de rede" } };
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      await refreshOlistToken(supabase, tenantId);
      const novo = await getOlistAccessToken(supabase, tenantId);
      if (!novo) return { ok: false, status: 401, data: { error: "Token da Olist recusado" } };
      token = novo;
      continue;
    }
    if (res.status === 429 && attempt < tries) {
      await sleepMs(2500 * attempt); // a Olist limita por minuto: espera e tenta de novo
      continue;
    }
    const texto = await res.text();
    let data: any = null;
    try { data = texto ? JSON.parse(texto) : null; } catch { data = { raw: texto.slice(0, 200) }; }
    return { ok: res.ok, status: res.status, data };
  }
  return { ok: false, status: 429, data: { error: "A Olist limitou o ritmo de requisições. Tente de novo em 1 minuto." } };
}

/** Texto que explica ao usuário por que a Olist recusou. 403 vem sem corpo. */
export function olistErrorMessage(status: number, data: any, o: string): string {
  if (status === 403) return `A Olist negou acesso a ${o} (403). O usuário que autorizou precisa ter permissão nesse módulo do ERP (e o plano da conta precisa incluí-lo). Autorize de novo depois de ajustar.`;
  if (status === 401) return "A Olist recusou o acesso. Autorize de novo em Integrações > Olist ERP.";
  if (status === 429) return "A Olist limitou o ritmo de requisições. Aguarde 1 minuto e tente de novo.";
  const d = data?.error?.description || data?.error?.message || data?.mensagem || data?.message || data?.error;
  return `Erro ${status} ao consultar ${o} na Olist${d ? `: ${String(d).slice(0, 200)}` : ""}.`;
}
