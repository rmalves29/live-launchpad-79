// Identificação de chamadas internas a funções públicas (verify_jwt = false) que só o próprio sistema deveria usar.
// Quem chama pode ser:
//   service_role  — outra edge function do sistema (Authorization: Bearer <service role key>)
//   internal_key  — gatilho do banco (header x-cartzy-internal-key, conferido por public.internal_key_check)
//   sem_chave     — qualquer outra coisa (internet)
// MODO OBSERVAÇÃO: enquanto `enforce` for false, tudo é aceito e só registrado em internal_call_audit.
// deno-lint-ignore-file no-explicit-any

export type InternalCaller = "service_role" | "internal_key" | "sem_chave";

export async function classifyInternalCaller(req: Request, supabase: any, keyName: string, serviceKey: string | undefined): Promise<InternalCaller> {
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && auth && auth === serviceKey) return "service_role";
  const key = (req.headers.get("x-cartzy-internal-key") || "").trim();
  if (key) {
    try {
      const { data } = await supabase.rpc("internal_key_check", { p_name: keyName, p_key: key });
      if (data === true) return "internal_key";
    } catch { /* conta como sem chave */ }
  }
  return "sem_chave";
}

export function isEnforced(envValue: string | undefined | null): boolean {
  return String(envValue || "").trim().toLowerCase() === "true";
}

// Decide e registra. Devolve true se a chamada pode seguir.
export async function checkInternalCall(
  req: Request, supabase: any, opts: { fn: string; keyName: string; serviceKey: string | undefined; enforce: boolean },
): Promise<{ allowed: boolean; caller: InternalCaller }> {
  const caller = await classifyInternalCaller(req, supabase, opts.keyName, opts.serviceKey);
  const allowed = caller !== "sem_chave" || !opts.enforce;
  try {
    await supabase.from("internal_call_audit").insert({
      fn: opts.fn, caller, allowed, user_agent: (req.headers.get("user-agent") || "").slice(0, 120),
    });
  } catch { /* registro é melhor esforço: nunca derruba o envio */ }
  return { allowed, caller };
}

// ---------------------------------------------------------------------------------------------------------------
// Observação ampla (etapa 4.4): registra QUEM chama uma função pública, sem bloquear nada e sem chamada de rede extra.
// Só lê os cabeçalhos (o token NÃO é validado aqui — é só para o registro). Serve para decidir, depois da
// Black Friday, qual trava cada função pode receber sem quebrar quem a usa.
//   service_role · chave_interna (header presente, não conferido) · usuario (JWT de login) · chave_publica (anon)
//   · nenhuma
export function describeCaller(req: Request, serviceKey?: string): { caller: string; userId: string | null } {
  const raw = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && raw && raw === serviceKey) return { caller: "service_role", userId: null };
  if ((req.headers.get("x-cartzy-internal-key") || "").trim()) return { caller: "chave_interna", userId: null };
  if (raw.split(".").length === 3) {
    try {
      const b64 = raw.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)));
      if (payload?.role === "service_role") return { caller: "service_role", userId: null };
      if (payload?.role === "authenticated") return { caller: "usuario", userId: typeof payload.sub === "string" ? payload.sub : null };
      if (payload?.role === "anon") return { caller: "chave_publica", userId: null };
    } catch { /* token ilegível */ }
  }
  if (req.headers.get("apikey")) return { caller: "chave_publica", userId: null };
  return { caller: "nenhuma", userId: null };
}

let auditClient: any = null;
export function observeCaller(req: Request, fn: string): void {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const { caller, userId } = describeCaller(req, key);
    const row = {
      fn, caller, allowed: true, user_id: userId,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 120),
      origin: (req.headers.get("origin") || req.headers.get("referer") || "").slice(0, 120) || null,
    };
    const send = async () => {
      if (!auditClient) {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        auditClient = createClient(url, key);
      }
      await auditClient.from("internal_call_audit").insert(row);
    };
    const p = send().catch(() => { /* registro é melhor esforço */ });
    (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  } catch { /* nunca derruba a função */ }
}
