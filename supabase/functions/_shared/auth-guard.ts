// Valida quem esta chamando uma edge function publica (verify_jwt = false) que age sobre um tenant_id vindo do corpo.
// Libera: (a) chamadas internas com a service role key; (b) usuario logado do mesmo tenant ou super admin.
// Todo o resto recebe 401/403. Nunca confie so no tenant_id do corpo.
// deno-lint-ignore-file no-explicit-any

export type GuardResult = { ok: true; mode: "service" | "user"; userId?: string } | { ok: false; status: number; error: string };

export async function authorizeTenantCaller(req: Request, supabase: any, tenantId: string): Promise<GuardResult> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Nao autenticado" };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return { ok: true, mode: "service" };

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
