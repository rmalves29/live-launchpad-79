// Provisionamento de conta depois do pagamento: MESMO padrão da tela Empresas (super admin),
// live-launchpad-79/src/pages/empresas/Index.tsx (handleSave, ~linhas 300-445) + create-tenant-admin:
//   1. insert em tenants (name, email, logo_url, plan_type, is_active, is_blocked, subscription_ends_at,
//      trial_ends_at, slug gerado do nome: minúsculo, sem acento, [a-z0-9], máx. 20)
//   2. auth.admin.createUser({ email_confirm: true }) + upsert em profiles { id, email, tenant_id, role }
//   3. update em tenants { admin_email, admin_user_id }
//
// Diferenças de propósito (segurança):
//   - Roda com service role a partir do webhook; NÃO chama create-tenant-admin (que exige JWT de
//     super_admin) e NÃO afrouxa a autorização dele.
//   - Papel e plano são CONSTANTES deste arquivo. Nunca vêm do corpo de requisição nenhuma.
//   - NÃO grava em tenant_credentials (a tela Empresas guarda a senha em texto puro ali). A conta nasce
//     com senha aleatória forte, que ninguém conhece; a cliente define a dela pelo link de recuperação.
//   - Se o e-mail já existe no Auth, NÃO mexe no profile existente (o upsert do create-tenant-admin
//     moveria esse usuário para o tenant novo). Devolve "email_existente" para revisão manual.
//   - Retomável: cada etapa grava o progresso em assinaturas_pendentes (tenant_id, user_id), então
//     um webhook repetido continua de onde parou e nunca cria duas contas.

// deno-lint-ignore-file no-explicit-any

/** Regra do Rafael (13/10/2026): fixo no servidor. Equivale a "Empresa (tenant_admin)" + "Basic (33 dias)" da tela Empresas. */
export const ROLE_CLIENTE = "tenant_admin" as const;
export const PLANO_CLIENTE = "basic" as const;
export const DIAS_INICIAIS = 33;

export function slugBase(nome: string): string {
  const s = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 20);
  return s || "loja";
}

function senhaAleatoria(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "x") + "A9!";
}

async function slugLivre(sb: any, nome: string): Promise<string> {
  const base = slugBase(nome);
  for (let i = 0; i < 30; i++) {
    const suf = i === 0 ? "" : String(i + 1);
    const cand = base.slice(0, 20 - suf.length) + suf;
    const { data } = await sb.from("tenants").select("id").eq("slug", cand).maybeSingle();
    if (!data) return cand;
  }
  const r = Math.random().toString(36).slice(2, 6);
  return base.slice(0, 16) + r;
}

export interface Pendente {
  id: string;
  nome: string;
  email: string;
  loja_nome: string;
  tenant_id: string | null;
  user_id: string | null;
}

export type ResultadoProvisionamento =
  | { ok: true; tenant_id: string; user_id: string; criado_agora: boolean }
  | { ok: false; motivo: "email_existente" | "erro"; detalhe: string; tenant_id?: string };

export async function provisionarTenant(sb: any, p: Pendente): Promise<ResultadoProvisionamento> {
  let tenantId = p.tenant_id;
  let userId = p.user_id;
  let criado = false;

  // Ordem: usuário primeiro. Se o e-mail já existir, paramos ANTES de criar tenant (nada fica órfão).
  // (A tela Empresas cria o tenant antes; o resultado final é o mesmo.)

  // 1. auth user (senha aleatória que ninguém conhece; ela define a dela pelo link)
  if (!userId) {
    const { data: existente } = await sb.from("profiles").select("id").eq("email", p.email).maybeSingle();
    if (existente) return { ok: false, motivo: "email_existente", detalhe: "Já existe um usuário com este e-mail." };
    const { data: novo, error } = await sb.auth.admin.createUser({
      email: p.email,
      password: senhaAleatoria(),
      email_confirm: true,
      user_metadata: { name: p.nome, origem: "site_assinatura" },
    });
    if (error || !novo?.user) {
      const jaExiste = /already|registered|exists/i.test(error?.message || "");
      return { ok: false, motivo: jaExiste ? "email_existente" : "erro", detalhe: `auth: ${error?.message}` };
    }
    userId = novo.user.id;
    await sb.from("assinaturas_pendentes").update({ user_id: userId }).eq("id", p.id);
  }

  // 2. tenant (mesmos campos da tela Empresas, plano Basic 33 dias)
  if (!tenantId) {
    const fim = new Date(Date.now() + DIAS_INICIAIS * 864e5);
    for (let tentativa = 0; tentativa < 3 && !tenantId; tentativa++) {
      const slug = await slugLivre(sb, p.loja_nome);
      const { data, error } = await sb
        .from("tenants")
        .insert({
          name: p.loja_nome,
          email: p.email,
          logo_url: null,
          plan_type: PLANO_CLIENTE,
          is_active: true,
          is_blocked: false,
          subscription_ends_at: fim.toISOString(),
          trial_ends_at: null,
          slug,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue; // slug pego por outra criação ao mesmo tempo: tenta o próximo
        return { ok: false, motivo: "erro", detalhe: `tenant: ${error.message}` };
      }
      tenantId = data.id;
      criado = true;
      await sb.from("assinaturas_pendentes").update({ tenant_id: tenantId }).eq("id", p.id);
    }
    if (!tenantId) return { ok: false, motivo: "erro", detalhe: "tenant: slug indisponível" };
  }

  // 3. profile (papel fixo) + admin do tenant
  const { error: perr } = await sb
    .from("profiles")
    .upsert({ id: userId, email: p.email, tenant_id: tenantId, role: ROLE_CLIENTE, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (perr) return { ok: false, motivo: "erro", detalhe: `profile: ${perr.message}`, tenant_id: tenantId };

  const { error: terr } = await sb
    .from("tenants")
    .update({ admin_email: p.email, admin_user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", tenantId);
  if (terr) console.error("[provision] update tenant admin", terr.message);

  return { ok: true, tenant_id: tenantId!, user_id: userId!, criado_agora: criado };
}
