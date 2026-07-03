// CONSENT V2 — regra de consentimento baseada em resposta do cliente.
//
// Fluxo (quando integration_whatsapp.consent_protection_enabled = true):
//   1. Sistema envia mensagem de item adicionado -> estado waiting_reply (20min).
//   2. Cliente responde qualquer coisa em até 20min -> estado active (3 dias fixos).
//   3. Cliente não responde -> bloqueio implícito de 1h após o fim da janela
//      (waiting_reply expirado vira blocked). Nesse período só passam
//      Paid_Order e MSG em Massa (esses senders não chamam checkConsent).
//   4. Resposta durante o bloqueio também ativa o consentimento.
//   5. active expira sozinho em 3 dias (job pg_cron `consent_v2_expire` limpa).
//
// Estados na tabela whatsapp_consent_state (expires_at = fim da fase atual):
//   waiting_reply -> blocked -> (expira, some da tabela) | active

export const WAITING_REPLY_MINUTES = 20;
export const BLOCKED_MINUTES = 60;
export const CONSENT_DAYS = 3;

export type ConsentCheck =
  | { allow: true; state: "none" | "active" | "expired" }
  | { allow: false; reason: "waiting_reply" | "blocked" };

export function buildConsentPhoneVariants(phone: string): string[] {
  const variants = new Set<string>();
  const p = (phone || "").replace(/\D/g, "");
  if (!p) return [];
  let baseWithoutCountry = p;
  if (p.startsWith("55") && p.length >= 12) baseWithoutCountry = p.slice(2);
  const baseWithCountry = baseWithoutCountry.startsWith("55") ? baseWithoutCountry : "55" + baseWithoutCountry;
  variants.add(baseWithoutCountry);
  variants.add(baseWithCountry);
  if (baseWithoutCountry.length === 11 && baseWithoutCountry[2] === "9") {
    const without9 = baseWithoutCountry.slice(0, 2) + baseWithoutCountry.slice(3);
    variants.add(without9);
    variants.add("55" + without9);
  } else if (baseWithoutCountry.length === 10) {
    const with9 = baseWithoutCountry.slice(0, 2) + "9" + baseWithoutCountry.slice(2);
    variants.add(with9);
    variants.add("55" + with9);
  }
  return Array.from(variants);
}

export function canonicalConsentPhone(phone: string): string {
  const variants = buildConsentPhoneVariants(phone);
  const with55_11 = variants.find((v) => v.startsWith("55") && v.length === 13);
  if (with55_11) return with55_11;
  const with55_10 = variants.find((v) => v.startsWith("55") && v.length === 12);
  if (with55_10) return with55_10;
  return variants.find((v) => v.startsWith("55")) || variants[0] || "";
}

async function fetchState(supabase: any, tenantId: string, phone: string) {
  const variants = buildConsentPhoneVariants(phone);
  if (variants.length === 0) return null;
  const { data: rows } = await supabase
    .from("whatsapp_consent_state")
    .select("id, status, expires_at")
    .eq("tenant_id", tenantId)
    .in("customer_phone", variants)
    .order("updated_at", { ascending: false })
    .limit(1);
  return (rows && rows[0]) || null;
}

export async function isConsentProtectionEnabled(supabase: any, tenantId: string): Promise<boolean> {
  const { data } = await supabase
    .from("integration_whatsapp")
    .select("consent_protection_enabled")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  return data?.consent_protection_enabled === true;
}

// Decide se uma mensagem (não isenta) pode ser enviada agora.
// NÃO usar para Paid_Order nem MSG em Massa — esses sempre enviam.
export async function checkConsent(supabase: any, tenantId: string, phone: string): Promise<ConsentCheck> {
  if (!(await isConsentProtectionEnabled(supabase, tenantId))) return { allow: true, state: "none" };

  const state = await fetchState(supabase, tenantId, phone);
  if (!state) return { allow: true, state: "none" };

  const now = new Date();
  const expiresAt = state.expires_at ? new Date(state.expires_at) : null;

  if (state.status === "active") {
    if (expiresAt && expiresAt > now) return { allow: true, state: "active" };
    return { allow: true, state: "expired" }; // cron ainda não limpou
  }

  if (state.status === "waiting_reply") {
    if (expiresAt && expiresAt > now) return { allow: false, reason: "waiting_reply" };
    // Janela de resposta venceu -> transiciona para blocked (1h a partir do fim da janela)
    const blockedUntil = new Date((expiresAt || now).getTime() + BLOCKED_MINUTES * 60 * 1000);
    if (blockedUntil > now) {
      await supabase
        .from("whatsapp_consent_state")
        .update({ status: "blocked", expires_at: blockedUntil.toISOString(), updated_at: now.toISOString() })
        .eq("id", state.id);
      return { allow: false, reason: "blocked" };
    }
    return { allow: true, state: "expired" };
  }

  if (state.status === "blocked") {
    if (expiresAt && expiresAt > now) return { allow: false, reason: "blocked" };
    return { allow: true, state: "expired" };
  }

  // Status desconhecido (resíduo do modelo antigo) -> não bloqueia
  return { allow: true, state: "expired" };
}

// Chamar após enviar com sucesso uma mensagem de item adicionado
// (apenas quando o cliente NÃO está com consentimento ativo).
export async function markWaitingReply(supabase: any, tenantId: string, phone: string): Promise<void> {
  const canonical = canonicalConsentPhone(phone);
  if (!canonical) return;
  const now = new Date();
  const expires = new Date(now.getTime() + WAITING_REPLY_MINUTES * 60 * 1000);
  const existing = await fetchState(supabase, tenantId, phone);
  const fields = {
    status: "waiting_reply",
    expires_at: expires.toISOString(),
    request_sent_at: now.toISOString(),
    last_message_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (existing) {
    await supabase.from("whatsapp_consent_state").update(fields).eq("id", existing.id);
  } else {
    await supabase.from("whatsapp_consent_state").upsert(
      { tenant_id: tenantId, customer_phone: canonical, ...fields },
      { onConflict: "tenant_id,customer_phone" },
    );
  }
}

// Chamar quando o cliente envia QUALQUER mensagem privada.
// Ativa o consentimento (3 dias fixos) se estiver em waiting_reply ou blocked.
// Retorna true se ativou.
export async function activateConsentOnReply(supabase: any, tenantId: string, phone: string): Promise<boolean> {
  const state = await fetchState(supabase, tenantId, phone);
  if (!state) return false;
  if (state.status !== "waiting_reply" && state.status !== "blocked") return false;

  const now = new Date();
  const expiresAt = state.expires_at ? new Date(state.expires_at) : null;
  // Janela válida para ativar: waiting_reply (até +1h de bloqueio implícito) ou blocked vigente
  const activationDeadline = state.status === "waiting_reply"
    ? new Date((expiresAt || now).getTime() + BLOCKED_MINUTES * 60 * 1000)
    : expiresAt;
  if (activationDeadline && activationDeadline < now) return false;

  const consentExpires = new Date(now.getTime() + CONSENT_DAYS * 24 * 60 * 60 * 1000);
  await supabase
    .from("whatsapp_consent_state")
    .update({
      status: "active",
      expires_at: consentExpires.toISOString(),
      consent_granted_at: now.toISOString(),
      consent_expires_at: consentExpires.toISOString(),
      last_message_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", state.id);
  return true;
}

// Registra mensagem suprimida pelo consentimento no whatsapp_messages (delivery_status SKIPPED).
export async function logSkipped(
  supabase: any,
  tenantId: string,
  phone: string,
  type: string,
  reason: string,
  detail: string,
): Promise<void> {
  await supabase.from("whatsapp_messages").insert({
    tenant_id: tenantId,
    phone: (phone || "").replace(/\D/g, ""),
    message: `[SKIPPED consentimento: ${reason}] ${detail}`.substring(0, 500),
    type,
    sent_at: new Date().toISOString(),
    delivery_status: "SKIPPED",
  });
}
