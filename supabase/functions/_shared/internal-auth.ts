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
