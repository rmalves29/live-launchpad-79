// Limite de requisicoes por IP para funcoes publicas (verify_jwt = false).
// Usa public.rate_limit_hit (contador no Postgres, so o service role executa).
// Falha aberta: se o banco nao responder, a requisicao passa (nunca derruba checkout/live por causa do limitador).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

// deno-lint-ignore no-explicit-any
export async function rateLimitOk(supabase: any, key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

/** Retorna uma Response 429 quando o IP passou do limite; senao null. */
// deno-lint-ignore no-explicit-any
export async function enforceRateLimit(
  req: Request,
  supabase: any,
  name: string,
  max = 120,
  windowSeconds = 60,
): Promise<Response | null> {
  const ok = await rateLimitOk(supabase, `${name}:${clientIp(req)}`, max, windowSeconds);
  if (ok) return null;
  return new Response(JSON.stringify({ error: "Muitas requisições. Tente novamente em instantes." }), {
    status: 429,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(windowSeconds) },
  });
}
