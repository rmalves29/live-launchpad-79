// Valida quem esta chamando uma edge function publica (verify_jwt = false) que age sobre um tenant_id vindo do corpo.
// Libera: (a) chamadas internas com a service role key (Authorization ou x-internal-key) ou com INTERNAL_FUNCTIONS_KEY (x-internal-key); (b) usuario logado do mesmo tenant ou super admin.
// Todo o resto recebe 401/403. Nunca confie so no tenant_id do corpo.
// deno-lint-ignore-file no-explicit-any

// Comparacao em tempo constante para segredos.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type GuardResult = { ok: true; mode: "service" | "user"; userId?: string } | { ok: false; status: number; error: string };

export async function authorizeTenantCaller(req: Request, supabase: any, tenantId: string): Promise<GuardResult> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const internalKey = Deno.env.get("INTERNAL_FUNCTIONS_KEY");

  // (a2) chamadas do proprio banco (pg_net/cron) ou de outra funcao via cabecalho x-internal-key
  const headerKey = (req.headers.get("x-internal-key") || "").trim();
  if (headerKey && ((serviceKey && safeEqual(headerKey, serviceKey)) || (internalKey && safeEqual(headerKey, internalKey)))) {
    return { ok: true, mode: "service" };
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Nao autenticado" };

  if (serviceKey && safeEqual(token, serviceKey)) return { ok: true, mode: "service" };

  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { ok: false, status: 401, error: "Nao autenticado" };

  const { data: profile } = await supabase.from("profiles").select("tenant_id, role").eq("id", user.id).maybeSingle();
  if (profile?.role === "super_admin" || (profile?.tenant_id && profile.tenant_id === tenantId)) {
    return { ok: true, mode: "user", userId: user.id };
  }

  const { data: membership } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (membership) return { ok: true, mode: "user", userId: user.id };

  return { ok: false, status: 403, error: "Nao autorizado" };
}

export function guardResponse(r: Extract<GuardResult, { ok: false }>, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: r.error }), {
    status: r.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
