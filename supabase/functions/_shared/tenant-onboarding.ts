// Regras puras do pré-cadastro de empresas + vínculo do login admin (compartilhado com create-tenant-admin).
// deno-lint-ignore-file no-explicit-any

export const SUFFIX_CHARS = ["*", "+", "@", "#", "$", "%"] as const;
export const OK_EXPIRY_MS = 48 * 3600 * 1000;

export function randomSuffix(rand: (n: number) => number = secureInt): string {
  return SUFFIX_CHARS[rand(SUFFIX_CHARS.length)] + SUFFIX_CHARS[rand(SUFFIX_CHARS.length)];
}

export function randomShortCode(rand: (n: number) => number = secureInt): string {
  return String(rand(10000)).padStart(4, "0");
}

function secureInt(n: number): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % n;
}

export function isValidSuffix(s: string): boolean {
  return s.length === 2 && [...s].every((c) => (SUFFIX_CHARS as readonly string[]).includes(c));
}

/** Senha = slug + 2 caracteres especiais. Nunca persistida inteira. */
export function onboardingPassword(slug: string, suffix: string): string {
  return `${slug}${suffix}`;
}

/** Mesmo slug da tela Empresas: minúsculo, sem acento, [a-z0-9], máx. 20. */
export function slugFromName(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").substring(0, 20);
}

export type ApprovalReply = { action: "approve" | "cancel"; code: string };

export function parseApprovalReply(text: string): ApprovalReply | null {
  const m = String(text || "").trim().match(/^(ok|n[aã]o)\s+(\d{4})$/i);
  if (!m) return null;
  return { action: m[1].toLowerCase() === "ok" ? "approve" : "cancel", code: m[2] };
}

/** Chave de comparação: sem DDI 55, sem nono dígito (DDD + 8 últimos). */
export function phoneKey(phone: string): string {
  let d = String(phone || "").split("@")[0].replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

export function samePhone(a: string, b: string): boolean {
  const ka = phoneKey(a), kb = phoneKey(b);
  return ka.length >= 10 && ka === kb;
}

/**
 * Instância autorizada a responder aprovação. Mensagens uazapi chegam ao zapi-webhook
 * com instanceId = `uazapi:{tenantId}`; o id Z-API legado ainda pode estar preenchido.
 * Recusa instance_id ausente ou de qualquer outra instância.
 */
export function isOrderZapInstance(
  instanceId: unknown,
  zapiInstanceId: unknown,
  orderZapTenantId: string,
): boolean {
  const id = String(instanceId ?? "").trim();
  if (!id) return false;
  if (id === `uazapi:${orderZapTenantId}`) return true;
  const zapi = String(zapiInstanceId ?? "").trim();
  return zapi.length > 0 && id === zapi;
}

/** Acessos: live → Live/Loja Live; bazar → Fluxo de Envio; os dois → os dois (mesmo mapa de plan-modules). */
export function moduleAccess(sellsLive: boolean, sellsBazar: boolean) {
  const live = sellsLive || !sellsBazar; // nenhum marcado = acesso Live padrão do cadastro atual
  return {
    flags: { enable_live: live, enable_loja_live: live, enable_sendflow: sellsBazar },
    access_scope: !live && sellsBazar ? "fluxo_envio" : null,
  };
}

const yn = (b: boolean) => (b ? "Sim" : "Não");

export function approvalMessage(r: any, password: string): string {
  return `📋 *Novo cadastro para aprovar* (código ${r.short_code})
Empresa: ${r.company_name}
Login: ${r.admin_email}
Senha: ${password}
Responsável: ${r.contact_name || "-"} — ${r.contact_phone || "-"}
Live: ${yn(r.sells_live)} | Bazar: ${yn(r.sells_bazar)}
Plano: ${r.plan} | Dias: ${r.trial_days}

Responda *OK ${r.short_code}* para criar e enviar as boas-vindas, ou *NÃO ${r.short_code}* para cancelar.`;
}

export function welcomeMessage(r: any, password: string): string {
  return `Olá, ${r.contact_name || ""}! 👋 Seja bem-vinda ao Cartzy!

A conta da *${r.company_name}* já está criada.

🌐 Site: https://app.cartzy.com.br
👤 Login: ${r.admin_email}
🔑 Senha: ${password}

Vamos agendar nossa reunião de integração para configurar pagamento, frete e ERP. Qual o melhor dia e horário para você?`;
}

export type AdminResult = { ok: true; user_id: string } | { ok: false; status: number; error: string };

/**
 * Cria ou reaproveita o login admin e vincula ao tenant. Nunca troca a senha de login
 * que já pertence a outra empresa existente. Usado por create-tenant-admin e pelo pré-cadastro.
 */
export async function upsertTenantAdmin(
  sb: any,
  p: { tenant_id: string; email: string; password: string; role: "tenant_admin" | "super_admin"; access_scope?: string | null },
): Promise<AdminResult> {
  const normEmail = String(p.email).trim().toLowerCase();
  let existingUser: { id: string } | undefined;
  for (let page = 1; page <= 20; page++) {
    const { data: pageData, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) { console.error("Erro ao listar usuários:", listErr); break; }
    const users = pageData?.users ?? [];
    existingUser = users.find((u: any) => (u.email ?? "").trim().toLowerCase() === normEmail);
    if (existingUser || users.length < 1000) break;
  }

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    const { data: existingProfile } = await sb.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    const otherTenantId = existingProfile?.tenant_id;
    if (otherTenantId && otherTenantId !== p.tenant_id) {
      const { data: otherTenant } = await sb.from("tenants").select("id").eq("id", otherTenantId).maybeSingle();
      if (otherTenant) return { ok: false, status: 409, error: `O e-mail ${p.email} já é login de outra empresa` };
    }
    const { error: updErr } = await sb.auth.admin.updateUserById(userId, { password: p.password, email_confirm: true });
    if (updErr) return { ok: false, status: 400, error: `Erro ao atualizar senha: ${updErr.message}` };
  } else {
    const { data: newUser, error: createError } = await sb.auth.admin.createUser({ email: p.email, password: p.password, email_confirm: true });
    if (createError) return { ok: false, status: 400, error: `Erro ao criar usuário: ${createError.message}` };
    userId = newUser.user.id;
  }

  const profileRow: Record<string, unknown> = { id: userId, email: p.email, tenant_id: p.tenant_id, role: p.role, updated_at: new Date().toISOString() };
  if (p.access_scope !== undefined) profileRow.access_scope = p.access_scope;
  const { error: profileError } = await sb.from("profiles").upsert(profileRow, { onConflict: "id" });
  if (profileError) return { ok: false, status: 400, error: `Erro ao atualizar profile: ${profileError.message}` };

  const { error: tenantError } = await sb.from("tenants")
    .update({ admin_email: p.email, admin_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", p.tenant_id);
  if (tenantError) console.error("Erro ao atualizar tenant:", tenantError);

  return { ok: true, user_id: userId };
}
