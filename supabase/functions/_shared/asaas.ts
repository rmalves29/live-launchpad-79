// Cliente mínimo da API v3 do Asaas. Chave só no servidor: ASAAS_API_KEY (secret da edge function).
// Sandbox: ASAAS_ENV=sandbox (https://api-sandbox.asaas.com/v3). Padrão: produção.
// Dados de cartão NUNCA passam por aqui: o cliente paga na página hospedada do Asaas (link de pagamento).

// deno-lint-ignore-file no-explicit-any

const BASE = () =>
  (Deno.env.get("ASAAS_ENV") || "").toLowerCase() === "sandbox"
    ? "https://api-sandbox.asaas.com/v3"
    : "https://api.asaas.com/v3";

export class AsaasError extends Error {
  constructor(public status: number, msg: string, public detalhes?: unknown) {
    super(msg);
  }
}

export async function asaas<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new AsaasError(500, "ASAAS_API_KEY não configurada");
  const r = await fetch(`${BASE()}${path}`, {
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
