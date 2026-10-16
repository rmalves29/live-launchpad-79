// Cliente mínimo da API v3 do Asaas. A chave fica só no servidor (integration_asaas ou secret ASAAS_API_KEY).
// Dados de cartão NUNCA passam por aqui: o cliente paga na página hospedada do Asaas (link de pagamento).

// deno-lint-ignore-file no-explicit-any

/** Tenant Cartzy: dono da conta Asaas que cobra a assinatura do site. */
export const CARTZY_TENANT_ID = "b82a01c9-dbab-4f4d-b412-bb29fca58ffd";

export interface AsaasConfig {
  apiKey: string | null;
  webhookToken: string | null;
  sandbox: boolean;
}

/** Credenciais: tela Integrações → Asaas (tabela integration_asaas); se vazia, usa os secrets ASAAS_*. */
export async function asaasConfig(sb: any): Promise<AsaasConfig> {
  const { data } = await sb.from("integration_asaas").select("api_key, webhook_token, environment, is_active").eq("tenant_id", CARTZY_TENANT_ID).maybeSingle();
  if (data?.is_active && data.api_key) {
    return { apiKey: data.api_key, webhookToken: data.webhook_token || Deno.env.get("ASAAS_WEBHOOK_TOKEN") || null, sandbox: data.environment === "sandbox" };
  }
  return {
    apiKey: Deno.env.get("ASAAS_API_KEY") || null,
    webhookToken: Deno.env.get("ASAAS_WEBHOOK_TOKEN") || null,
    sandbox: (Deno.env.get("ASAAS_ENV") || "").toLowerCase() === "sandbox",
  };
}

export class AsaasError extends Error {
  constructor(public status: number, msg: string, public detalhes?: unknown) {
    super(msg);
  }
}

export async function asaas<T = any>(cfg: AsaasConfig, method: string, path: string, body?: unknown): Promise<T> {
  const key = cfg.apiKey;
  if (!key) throw new AsaasError(500, "Chave do Asaas não configurada");
  const base = cfg.sandbox ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { access_token: key, "Content-Type": "application/json", "User-Agent": "cartzy-site" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.errors?.[0]?.description || `Asaas ${r.status}`;
    throw new AsaasError(r.status, msg, j);
  }
  return j as T;
}

/** Comparação em tempo constante de dois textos. */
export function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
