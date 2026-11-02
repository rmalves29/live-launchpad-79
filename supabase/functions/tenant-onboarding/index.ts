// Pré-cadastro de empresas com aprovação por WhatsApp (instância OrderZap).
// Ações de tela exigem super_admin; "whatsapp_reply" é interna (service role, chamada pelo zapi-webhook).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  approvalMessage, isValidSuffix, moduleAccess, onboardingPassword, parseApprovalReply,
  randomShortCode, samePhone, slugFromName, upsertTenantAdmin, welcomeMessage,
} from "../_shared/tenant-onboarding.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const sb = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function sendWhatsApp(phone: string, message: string): Promise<string | null> {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return "telefone inválido";
  const { data, error } = await sb.functions.invoke("zapi-send-message", {
    body: { tenant_id: ORDERZAP_TENANT_ID, phone: digits, message },
  });
  if (error) {
    try { const b = await (error as any).context?.json?.(); if (b?.error) return String(b.error); } catch { /* */ }
    return error.message;
  }
  if (data?.error) return String(data.error);
  if (data?.sent === false || data?.success === false) return "envio recusado pelo WhatsApp";
  return null;
}

async function approverPhone(): Promise<string> {
  const { data } = await sb.from("app_settings").select("onboarding_approver_phone").limit(1).maybeSingle();
  return String(data?.onboarding_approver_phone || "").replace(/\D/g, "");
}

async function expireOld() {
  await sb.from("tenant_onboarding_requests").update({ status: "expirado" })
    .eq("status", "pendente").lt("expires_at", new Date().toISOString());
}

async function sendApproval(row: any): Promise<string | null> {
  const phone = await approverPhone();
  if (!phone) return "configure o número aprovador";
  const err = await sendWhatsApp(phone, approvalMessage(row, onboardingPassword(row.slug, row.password_suffix)));
  if (!err) await sb.from("tenant_onboarding_requests").update({ approval_sent_at: new Date().toISOString() }).eq("id", row.id);
  return err;
}

async function freeSlug(base: string): Promise<string> {
  base = base || "loja";
  for (let i = 0; i < 30; i++) {
    const suf = i === 0 ? "" : String(i + 1);
    const cand = base.slice(0, 20 - suf.length) + suf;
    const { data: t } = await sb.from("tenants").select("id").eq("slug", cand).maybeSingle();
    if (t) continue;
    const { data: r } = await sb.from("tenant_onboarding_requests").select("id").eq("slug", cand).in("status", ["pendente", "processando"]).maybeSingle();
    if (!r) return cand;
  }
  return base.slice(0, 16) + Math.random().toString(36).slice(2, 6);
}

/** Aprova (idempotente: trava com status='pendente' → 'processando'). Devolve texto para o aprovador. */
async function approve(id: string): Promise<{ ok: boolean; text: string; status: string }> {
  await expireOld();
  const { data: row } = await sb.from("tenant_onboarding_requests")
    .update({ status: "processando" }).eq("id", id).eq("status", "pendente")
    .gt("expires_at", new Date().toISOString()).select("*").maybeSingle();
  if (!row) {
    const { data: cur } = await sb.from("tenant_onboarding_requests").select("status, company_name").eq("id", id).maybeSingle();
    return { ok: false, status: cur?.status || "inexistente", text: `Cadastro já está ${cur?.status || "indisponível"}.` };
  }
  const password = onboardingPassword(row.slug, row.password_suffix);
  const fail = async (msg: string) => {
    await sb.from("tenant_onboarding_requests").update({ status: "erro", error_message: msg }).eq("id", id);
    return { ok: false, status: "erro", text: `❌ Erro ao criar ${row.company_name}: ${msg}` };
  };

  const access = moduleAccess(row.sells_live, row.sells_bazar);
  const end = new Date(Date.now() + Number(row.trial_days || 33) * 864e5).toISOString();
  let tenantId: string | null = null;
  for (let t = 0; t < 3 && !tenantId; t++) {
    const slug = t === 0 ? row.slug : await freeSlug(row.slug);
    const { data, error } = await sb.from("tenants").insert({
      name: row.company_name, slug, email: row.company_email || row.admin_email, logo_url: row.logo_url || null,
      plan_type: row.plan, is_active: true, is_blocked: false, subscription_ends_at: end, trial_ends_at: null,
      whatsapp_provider: row.whatsapp_provider, ...access.flags,
    }).select("id").single();
    if (error) { if (error.code === "23505") continue; return await fail(`empresa: ${error.message}`); }
    tenantId = data.id;
  }
  if (!tenantId) return await fail("endereço (slug) indisponível");

  await sb.from("tenant_credentials").insert({ tenant_id: tenantId, email: row.admin_email, password_hash: "", is_active: true });
  const admin = await upsertTenantAdmin(sb, {
    tenant_id: tenantId, email: row.admin_email, password,
    role: row.access_type === "super_admin" ? "super_admin" : "tenant_admin", access_scope: access.access_scope,
  });
  if (!admin.ok) {
    await sb.from("tenant_credentials").delete().eq("tenant_id", tenantId);
    await sb.from("tenants").delete().eq("id", tenantId);
    return await fail(admin.error);
  }

  await sb.from("tenant_onboarding_requests").update({
    status: "aprovado", approved_at: new Date().toISOString(), tenant_id: tenantId, error_message: null,
  }).eq("id", id);

  const sendErr = row.contact_phone ? await sendWhatsApp(row.contact_phone, welcomeMessage(row, password)) : "cliente sem telefone";
  if (sendErr) {
    await sb.from("tenant_onboarding_requests").update({ error_message: `boas-vindas: ${sendErr}` }).eq("id", id);
    return { ok: true, status: "aprovado", text: `⚠️ ${row.company_name} criada, mas a mensagem para a cliente falhou: ${sendErr}` };
  }
  await sb.from("tenant_onboarding_requests").update({ welcome_sent_at: new Date().toISOString() }).eq("id", id);
  return { ok: true, status: "aprovado", text: `✅ ${row.company_name} criada e boas-vindas enviadas.` };
}

async function cancel(id: string) {
  const { data } = await sb.from("tenant_onboarding_requests").update({ status: "cancelado" })
    .eq("id", id).eq("status", "pendente").select("short_code").maybeSingle();
  return data;
}

async function handleReply(body: any) {
  const parsed = parseApprovalReply(body?.text);
  if (!parsed) return json({ handled: false });
  const approver = await approverPhone();
  if (!approver || !samePhone(body?.phone, approver)) return json({ handled: false });
  const { data: integ } = await sb.from("integration_whatsapp").select("zapi_instance_id").eq("tenant_id", ORDERZAP_TENANT_ID).maybeSingle();
  if (!isOrderZapInstance(body?.instance_id, integ?.zapi_instance_id, ORDERZAP_TENANT_ID)) return json({ handled: false });
  await expireOld();
  const { data: row } = await sb.from("tenant_onboarding_requests").select("id, short_code")
    .eq("short_code", parsed.code).eq("status", "pendente").maybeSingle();
  if (!row) return json({ handled: false });

  let reply: string;
  if (parsed.action === "cancel") {
    const c = await cancel(row.id);
    reply = c ? `Cadastro ${row.short_code} cancelado.` : `Cadastro ${row.short_code} já não está pendente.`;
  } else {
    reply = (await approve(row.id)).text;
  }
  await sendWhatsApp(approver, reply);
  return json({ handled: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "whatsapp_reply") {
      if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) return json({ error: "Unauthorized" }, 401);
      return await handleReply(body);
    }

    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: prof } = await sb.from("profiles").select("role").eq("id", u.user.id).single();
    if (prof?.role !== "super_admin") return json({ error: "Forbidden: super_admin role required" }, 403);

    if (action === "create") {
      const s = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
      const company_name = s(body.company_name, 120);
      const admin_email = s(body.admin_email, 200).toLowerCase();
      const suffix = String(body.password_suffix || "");
      if (!company_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin_email)) return json({ error: "Nome da empresa e e-mail do admin são obrigatórios" }, 400);
      if (!isValidSuffix(suffix)) return json({ error: "Final da senha inválido" }, 400);
      const slug = await freeSlug(slugFromName(company_name));
      let row: any = null;
      for (let i = 0; i < 10 && !row; i++) {
        const { data, error } = await sb.from("tenant_onboarding_requests").insert({
          short_code: randomShortCode(), company_name, slug, admin_email,
          company_email: s(body.company_email, 200) || admin_email,
          contact_name: s(body.contact_name, 120) || null, contact_phone: s(body.contact_phone, 30).replace(/\D/g, "") || null,
          sells_live: !!body.sells_live, sells_bazar: !!body.sells_bazar,
          cnpj: s(body.cnpj, 30) || null, address: s(body.address, 400) || null, notes: s(body.notes, 2000) || null,
          logo_url: s(body.logo_url, 500) || null, password_suffix: suffix, created_by: u.user.id,
        }).select("*").single();
        if (error) { if (error.code === "23505") continue; return json({ error: error.message }, 400); }
        row = data;
      }
      if (!row) return json({ error: "Não foi possível gerar código único" }, 500);
      const sendError = await sendApproval(row);
      return json({ success: true, id: row.id, short_code: row.short_code, slug: row.slug, password: onboardingPassword(row.slug, suffix), send_error: sendError });
    }

    const id = String(body?.id || "");
    if (!id) return json({ error: "id obrigatório" }, 400);
    if (action === "resend") {
      await expireOld();
      const { data: row } = await sb.from("tenant_onboarding_requests").select("*").eq("id", id).eq("status", "pendente").maybeSingle();
      if (!row) return json({ error: "Pré-cadastro não está pendente" }, 400);
      const err = await sendApproval(row);
      return json(err ? { error: err } : { success: true });
    }
    if (action === "cancel") {
      const c = await cancel(id);
      return json(c ? { success: true } : { error: "Pré-cadastro não está pendente" });
    }
    if (action === "approve") {
      const r = await approve(id);
      return json(r.ok ? { success: true, message: r.text } : { error: r.text });
    }
    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[tenant-onboarding]", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
