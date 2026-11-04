// Contratação direta (self-service) pela landing de indicação.
// Público: create, status, slots, book_onboarding. Interno (service role): welcome.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { formatBrt, isValidSlot, listSlots, normalizeAgenda } from "../_shared/affiliate-agenda.ts";
import { createMeetEvent, googleConfigured } from "../_shared/google-calendar.ts";
import { availableSlots, isSlotFree } from "../_shared/agenda-availability.ts";
import { slugFromName, upsertTenantAdmin } from "../_shared/tenant-onboarding.ts";
import {
  isValidDocument, isValidEmail, looksLikeBot, normInstagram, onlyDigits, parsePlan, PLAN_LABELS, planFlags, planPrice, planPrices,
  newCompanyAlert, onboardingAlert, type SignupPlan, welcomeSelfSignup, whatsappKey,
} from "./rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ORDERZAP_TENANT_ID = "d5671cfb-9c42-4c44-8f94-0a19a39473d8";
const SITE = "https://app.cartzy.com.br";
const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const s = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RATE_MAX = 5; // cadastros por IP por hora

let DRY = false; // testes: sem WhatsApp real, sem evento real, sem link real

async function sendWhatsApp(phone: string | null, message: string): Promise<string | null> {
  const digits = onlyDigits(phone);
  if (digits.length < 10) return "telefone inválido";
  if (DRY) { console.log("[self-signup] DRY whatsapp", digits.slice(-4)); return null; }
  const { data, error } = await sb.functions.invoke("zapi-send-message", { body: { tenant_id: ORDERZAP_TENANT_ID, phone: digits, message } });
  if (error) return error.message;
  if (data?.error) return String(data.error);
  if (data?.sent === false || data?.success === false) return "envio recusado";
  return null;
}

async function rateLimited(ip: string): Promise<boolean> {
  const hour = new Date(); hour.setMinutes(0, 0, 0);
  const key = `self_signup:${ip}`;
  const { data } = await sb.from("rate_limit_hits").select("hits, window_start").eq("key", key).maybeSingle();
  if (data && new Date(data.window_start).getTime() === hour.getTime()) {
    if (data.hits >= RATE_MAX) return true;
    await sb.from("rate_limit_hits").update({ hits: data.hits + 1 }).eq("key", key);
  } else {
    await sb.from("rate_limit_hits").upsert({ key, window_start: hour.toISOString(), hits: 1 }, { onConflict: "key" });
  }
  return false;
}

async function settings() {
  const { data } = await sb.from("platform_affiliate_settings").select("*").eq("id", 1).maybeSingle();
  return data || {};
}

async function approvedByCode(codigo: unknown) {
  const c = s(codigo, 30).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return null;
  const { data } = await sb.from("platform_affiliates").select("id, nome, codigo").eq("codigo", c).eq("status", "aprovado").maybeSingle();
  return data;
}

async function emailInAuth(email: string): Promise<boolean> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("não foi possível verificar o e-mail");
    const users = data?.users ?? [];
    if (users.some((u: any) => (u.email ?? "").trim().toLowerCase() === email)) return true;
    if (users.length < 1000) return false;
  }
  return false;
}

async function freeSlug(base: string): Promise<string> {
  base = base || "loja";
  for (let i = 0; i < 30; i++) {
    const suf = i === 0 ? "" : String(i + 1);
    const cand = base.slice(0, 20 - suf.length) + suf;
    const { data } = await sb.from("tenants").select("id").eq("slug", cand).maybeSingle();
    if (!data) return cand;
  }
  return base.slice(0, 16) + Math.random().toString(36).slice(2, 6);
}

async function pagarme(path: string, body: unknown, apiKey: string) {
  const r = await fetch(`https://api.pagar.me/core/v5${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${apiKey}:`)}`, "Content-Type": "application/json", "User-Agent": "cartzy/1.0" },
    body: JSON.stringify(body),
  });
  const raw = await r.text();
  let parsed: any; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return { ok: r.ok, status: r.status, body: parsed };
}

/** Link recorrente por empresa (mesmo modelo dos links atuais); sem sucesso usa o link fixo das configurações. */
async function paymentLink(t: { id: string; name: string; email: string; document: string; phone: string; contato: string; plano: SignupPlan }, cfg: any) {
  const fallback = cfg.fallback_payment_url || null;
  const apiKey = Deno.env.get("PAGARME_ORDERZAP_API_KEY");
  if (DRY || !apiKey) return { url: fallback, per_company: false, error: DRY ? null : "sem chave Pagar.me" };
  const price = planPrice(t.plano, cfg);
  try {
    // Um plano Pagar.me por valor (avulso R$ 299, combo R$ 499...), guardado em signup_pagarme_plan_ids
    const cache: Record<string, string> = (cfg.signup_pagarme_plan_ids && typeof cfg.signup_pagarme_plan_ids === "object") ? { ...cfg.signup_pagarme_plan_ids } : {};
    const key = price.toFixed(2);
    let planId: string | null = cache[key]
      || (cfg.signup_pagarme_plan_id && Number(cfg.signup_pagarme_plan_price) === price ? cfg.signup_pagarme_plan_id : null);
    if (!planId) {
      const name = `Cartzy ${t.plano === "completo" ? "combo" : "mensal"} R$ ${price.toFixed(2)}`;
      const p = await pagarme("/plans", {
        name, currency: "BRL", interval: "month", interval_count: 1, billing_type: "prepaid", payment_methods: ["credit_card"],
        installments: [1], items: [{ name, quantity: 1, pricing_scheme: { scheme_type: "unit", price: Math.round(price * 100) } }],
      }, apiKey);
      if (!p.ok || !p.body?.id) throw new Error(`plano: ${p.status} ${JSON.stringify(p.body).slice(0, 200)}`);
      planId = p.body.id as string;
      cache[key] = planId;
      await sb.from("platform_affiliate_settings").update({ signup_pagarme_plan_ids: cache }).eq("id", 1);
    }
    const base = {
      type: "subscription", name: `Cartzy ${PLAN_LABELS[t.plano]} · ${t.name}`.slice(0, 64), is_building: false, order_code: t.id,
      payment_settings: { accepted_payment_methods: ["credit_card"], credit_card_settings: { operation_type: "auth_and_capture" } },
      cart_settings: { recurrences: [{ plan_id: planId, start_in: 1 }] },
    };
    const mp = t.phone.slice(2);
    const customer = {
      name: t.contato, email: t.email, document: t.document, type: t.document.length === 14 ? "company" : "individual",
      phones: { mobile_phone: { country_code: "55", area_code: mp.slice(0, 2), number: mp.slice(2) } },
    };
    let l = await pagarme("/paymentlinks", { ...base, customer_settings: { customer } }, apiKey);
    if (!l.ok) {
      console.warn("[self-signup] link com cliente recusado:", l.status, JSON.stringify(l.body).slice(0, 300));
      l = await pagarme("/paymentlinks", base, apiKey);
    }
    if (!l.ok || typeof l.body?.url !== "string") throw new Error(`link: ${l.status} ${JSON.stringify(l.body).slice(0, 200)}`);
    return { url: l.body.url as string, per_company: true, error: null };
  } catch (e) {
    console.error("[self-signup] link por empresa falhou:", (e as Error).message);
    return { url: fallback, per_company: false, error: (e as Error).message };
  }
}

async function tenantByToken(token: unknown) {
  const t = s(token, 40);
  if (!UUID.test(t)) return null;
  const { data } = await sb.from("tenants")
    .select("id, name, signup_status, signup_payment_url, onboarding_meeting_at, billing_phone, admin_email")
    .eq("signup_token", t).maybeSingle();
  return data;
}

async function bookedSlots() {
  const { data } = await sb.from("platform_affiliate_leads").select("meeting_at")
    .or("status.eq.reuniao_agendada,meeting_type.eq.onboarding").gte("meeting_at", new Date().toISOString());
  return (data || []).map((r: any) => r.meeting_at as string);
}

async function approverPhone(): Promise<string> {
  const { data } = await sb.from("app_settings").select("onboarding_approver_phone").limit(1).maybeSingle();
  return onlyDigits(data?.onboarding_approver_phone);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = s(body?.action, 30);
    const isService = req.headers.get("Authorization") === `Bearer ${serviceKey}`;
    DRY = body?.dry_run === true && isService;

    if (action === "welcome") {
      if (!isService) return json({ error: "Unauthorized" }, 401);
      const { data: t } = await sb.from("tenants").select("id, name, admin_email, billing_phone, signup_token, onboarding_meeting_at, signup_plan, company_document, affiliate_id").eq("id", s(body.tenant_id, 40)).maybeSingle();
      if (!t?.signup_token) return json({ success: false, error: "não é contratação direta" });
      const { data: lead } = await sb.from("platform_affiliate_leads").select("nome, instagram").eq("tenant_id", t.id).order("created_at").limit(1).maybeSingle();
      const err = await sendWhatsApp(t.billing_phone, welcomeSelfSignup(lead?.nome || "", t.name, t.admin_email, `${SITE}/contratacao/obrigado?t=${t.signup_token}`));
      if (err) console.warn("[self-signup] boas-vindas:", err);
      // Aviso para o Rafael: nova empresa paga no sistema
      const approver = await approverPhone();
      if (approver) {
        const plano = parsePlan(t.signup_plan);
        let afiliada = "-";
        if (t.affiliate_id) {
          const { data: af } = await sb.from("platform_affiliates").select("nome, codigo").eq("id", t.affiliate_id).maybeSingle();
          if (af) afiliada = `${af.nome} (${af.codigo})`;
        }
        const aErr = await sendWhatsApp(approver, newCompanyAlert({
          empresa: t.name, responsavel: lead?.nome || "-", whatsapp: t.billing_phone || "-", email: t.admin_email || "-",
          documento: t.company_document || "-", instagram: lead?.instagram || "", plano: PLAN_LABELS[plano],
          valor: planPrice(plano, await settings()), afiliada,
          onboarding: t.onboarding_meeting_at ? formatBrt(t.onboarding_meeting_at) : null,
        }));
        if (aErr) console.warn("[self-signup] aviso nova empresa:", aErr);
      }
      return json({ success: !err, error: err });
    }

    if (action === "config") {
      const prices = planPrices(await settings());
      return json({ success: true, price: prices.live, prices, labels: PLAN_LABELS });
    }

    if (action === "slots") {
      const a = normalizeAgenda((await settings()).agenda);
      return json({ success: true, slots: await availableSlots(a, await bookedSlots()) });
    }

    if (action === "status") {
      await sb.rpc("platform_signup_expire");
      const t = await tenantByToken(body.token);
      if (!t) return json({ success: false, error: "Cadastro não encontrado" });
      return json({ success: true, status: t.signup_status, empresa: t.name, payment_url: t.signup_payment_url, meeting_at: t.onboarding_meeting_at });
    }

    if (action === "book_onboarding") {
      const t = await tenantByToken(body.token);
      if (!t) return json({ success: false, error: "Cadastro não encontrado" });
      if (t.signup_status !== "pago") return json({ success: false, error: "Pagamento ainda não confirmado" });
      if (t.onboarding_meeting_at) return json({ success: true, meeting_at: t.onboarding_meeting_at, already: true });
      const a = normalizeAgenda((await settings()).agenda);
      const at = s(body.meeting_at, 40);
      if (!(await isSlotFree(a, at, await bookedSlots()))) return json({ success: false, error: "Horário indisponível. Escolha outro." });
      const slotIso = new Date(at).toISOString();
      let { data: lead } = await sb.from("platform_affiliate_leads").select("*").eq("tenant_id", t.id).order("created_at").limit(1).maybeSingle();
      if (!lead) {
        const ins = await sb.from("platform_affiliate_leads").insert({ nome: t.name, empresa: t.name, whatsapp: t.billing_phone, whatsapp_key: t.billing_phone, origem: "self_signup", status: "fechado", tenant_id: t.id }).select("*").single();
        lead = ins.data;
      }
      const { data: upd, error } = await sb.from("platform_affiliate_leads")
        .update({ meeting_at: slotIso, meeting_type: "onboarding", alert_sent_at: null, link_sent_at: null, google_event_id: null, meeting_link: null })
        .eq("id", lead.id).select("*").single();
      if (error) return json({ success: false, error: error.code === "23505" ? "Esse horário acabou de ser reservado. Escolha outro." : "Não foi possível agendar agora" });
      await sb.from("tenants").update({ onboarding_meeting_at: slotIso }).eq("id", t.id);
      let link: string | null = null;
      if (!DRY) {
        if (!googleConfigured()) {
          await sb.from("platform_affiliate_leads").update({ google_error: "Google Agenda não conectado" }).eq("id", upd.id);
        } else {
          try {
            const ev = await createMeetEvent({ summary: `Onboarding Cartzy · ${t.name}`, description: `Empresa: ${t.name}\nLogin: ${t.admin_email}\nWhatsApp: ${t.billing_phone || "-"}`, start: slotIso, minutes: a.duracao });
            link = ev.link;
            await sb.from("platform_affiliate_leads").update({ google_event_id: ev.id, meeting_link: ev.link, google_error: null }).eq("id", upd.id);
          } catch (e) {
            await sb.from("platform_affiliate_leads").update({ google_error: (e as Error).message.slice(0, 300) }).eq("id", upd.id);
          }
        }
      }
      const approver = await approverPhone();
      if (approver) await sendWhatsApp(approver, onboardingAlert({ empresa: t.name, quando: formatBrt(slotIso), whatsapp: t.billing_phone || "-", email: t.admin_email || "-", link }));
      await sendWhatsApp(t.billing_phone, `✅ Sua reunião de onboarding com a Cartzy está marcada para ${formatBrt(slotIso)} (horário de Brasília), 30 minutos.` +
        (link ? `\n\nLink da reunião: ${link}` : `\n\nVocê vai receber o link aqui no horário marcado.`));
      return json({ success: true, meeting_at: slotIso });
    }

    if (action === "create") {
      if (looksLikeBot(body.website, body.started_at)) return json({ success: false, error: "Não foi possível enviar. Revise os dados e tente de novo." });
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "desconhecido";
      if (!DRY && await rateLimited(ip)) return json({ success: false, error: "Muitas tentativas. Tente de novo em 1 hora." });

      const empresa = s(body.empresa, 120), contato = s(body.nome, 120), cidade = s(body.cidade, 80), uf = s(body.uf, 2).toUpperCase();
      const documento = onlyDigits(body.documento), email = s(body.email, 200).toLowerCase(), senha = String(body.senha ?? "");
      const wa = whatsappKey(body.whatsapp), instagram = normInstagram(body.instagram);
      const plano = parsePlan(body.plano);
      if (!empresa || !contato) return json({ success: false, error: "Informe o nome da empresa e do responsável" });
      if (!isValidDocument(documento)) return json({ success: false, error: "CNPJ ou CPF inválido" });
      if (!wa) return json({ success: false, error: "WhatsApp inválido. Use DDD + número." });
      if (!isValidEmail(email)) return json({ success: false, error: "E-mail inválido" });
      if (senha.length < 8 || senha.length > 72) return json({ success: false, error: "A senha precisa ter de 8 a 72 caracteres" });
      if (body.terms !== true) return json({ success: false, error: "Aceite os termos para continuar" });

      await sb.rpc("platform_signup_expire");
      const { data: dupMap } = await sb.from("platform_pagarme_customer_map").select("id").or(`document.eq.${documento},email.eq.${email},phone_key.eq.${wa}`).limit(1);
      const { data: dupTenant } = await sb.rpc("platform_match_tenant_by_payer", { _email: email, _phone: wa, _document: documento });
      if ((dupMap?.length ?? 0) > 0 || (dupTenant?.length ?? 0) > 0) return json({ success: false, error: "Já existe uma empresa com esse CNPJ/CPF, e-mail ou WhatsApp. Faça login ou fale com a gente." });
      if (await emailInAuth(email)) return json({ success: false, error: "Esse e-mail já tem cadastro. Faça login." });

      const aff = await approvedByCode(body.ref);
      const notas = `Contratação direta · ${PLAN_LABELS[plano]} · ${cidade || "-"}/${uf || "-"} · ${documento.length === 14 ? "CNPJ" : "CPF"} ${documento}`;
      const { data: reg, error: rErr } = await sb.rpc("platform_lead_register", {
        _affiliate_id: aff?.id ?? null, _nome: contato, _empresa: empresa, _whatsapp: wa, _instagram: instagram,
        _vende_live: null, _origem: "self_signup", _notas: notas,
      });
      if (rErr || !reg?.ok) return json({ success: false, error: reg?.error || "Não foi possível cadastrar agora" });
      const affiliateId: string | null = reg.affiliate_id ?? null; // primeiro que indicou (60 dias) prevalece

      const flags = planFlags(plano);
      const token = crypto.randomUUID();
      let tenantId: string | null = null;
      for (let i = 0; i < 3 && !tenantId; i++) {
        const slug = await freeSlug(slugFromName(empresa));
        const { data, error } = await sb.from("tenants").insert({
          name: empresa, slug, email, is_active: false, is_blocked: false, plan_type: "trial", subscription_ends_at: null, trial_ends_at: null,
          whatsapp_provider: "zapi", enable_live: flags.enable_live, enable_loja_live: flags.enable_loja_live, enable_sendflow: flags.enable_sendflow,
          billing_phone: wa, billing_email: email, company_document: documento,
          signup_status: "aguardando_pagamento", signup_token: token, signup_plan: plano, signup_created_at: new Date().toISOString(),
        }).select("id").single();
        if (error) { if (error.code === "23505") continue; console.error("[self-signup] tenant:", error.message); return json({ success: false, error: "Não foi possível criar a empresa agora" }); }
        tenantId = data.id;
      }
      if (!tenantId) return json({ success: false, error: "Não foi possível criar a empresa agora" });

      await sb.from("tenant_credentials").insert({ tenant_id: tenantId, email, password_hash: "", is_active: true });
      const admin = await upsertTenantAdmin(sb, { tenant_id: tenantId, email, password: senha, role: "tenant_admin", access_scope: flags.access_scope });
      if (!admin.ok) {
        await sb.from("tenant_credentials").delete().eq("tenant_id", tenantId);
        await sb.from("tenants").delete().eq("id", tenantId);
        return json({ success: false, error: admin.status === 409 ? "Esse e-mail já tem cadastro. Faça login." : "Não foi possível criar seu acesso agora" });
      }

      if (affiliateId) {
        const { error } = await sb.rpc("platform_affiliate_attach_tenant", { _tenant_id: tenantId, _affiliate_id: affiliateId, _phone: wa, _instagram: instagram || null });
        if (error) console.error("[self-signup] vincular afiliada:", error.message);
      }
      await sb.from("platform_affiliate_leads").update({ tenant_id: tenantId, status: "aguardando_pagamento", status_updated_at: new Date().toISOString() }).eq("id", reg.lead_id);
      await sb.from("platform_pagarme_customer_map").insert({ tenant_id: tenantId, document: documento, email, phone_key: wa, matched_by: "contratacao" });

      const cfg = await settings();
      const link = await paymentLink({ id: tenantId, name: empresa, email, document: documento, phone: wa, contato, plano }, cfg);
      await sb.from("tenants").update({ signup_payment_url: link.url }).eq("id", tenantId);
      return json({ success: true, token, payment_url: link.url, plano, price: planPrice(plano, cfg), per_company: link.per_company, tenant_id: DRY ? tenantId : undefined, lead_id: DRY ? reg.lead_id : undefined, affiliate_id: DRY ? affiliateId : undefined });
    }

    return json({ success: false, error: "Ação inválida" });
  } catch (e) {
    console.error("[self-signup] erro:", e);
    return json({ success: false, error: "Erro inesperado. Tente de novo." });
  }
});
