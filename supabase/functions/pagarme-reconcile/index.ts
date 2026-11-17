// Conferência com a Pagar.me: lista as assinaturas dos LINKS recorrentes compartilhados, acha as cobranças pagas
// e (modo "apply") credita 31 dias a cada empresa que pagou e ainda não foi creditada.
// Serve de rede de segurança do webhook (roda todo dia) e para auditar "quem pagou na Pagar.me e foi creditado?".
// Idempotente: platform_pagarme_credits guarda cada cobrança creditada, então rodar de novo não soma dias duas vezes.
//
// Acesso: chave de serviço (cron) ou usuário super_admin.
// Body: { mode?: "scan" | "apply" (padrão scan = só mostra), since_days?: number (padrão 60), debug?: boolean }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const API = "https://api.pagar.me/core/v5";
const KEY_BY_NAME: Record<string, string> = {
  "sistema live": "live",
  "sistema de grupos vip": "grupos_vip",
  "pacote completo": "completo",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  let allowed = !!token && token === serviceKey;
  const cronSecret = req.headers.get("x-pagarme-cron-secret");
  if (!allowed && cronSecret) {
    const { data: ok } = await admin.rpc("pagarme_cron_authorized", { p_secret: cronSecret });
    allowed = ok === true;
  }
  if (!allowed && token) {
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user) {
      const { data: profile } = await admin.from("profiles").select("role").eq("id", u.user.id).single();
      allowed = profile?.role === "super_admin";
    }
  }
  if (!allowed) return json({ success: false, error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("PAGARME_ORDERZAP_API_KEY");
  if (!apiKey) return json({ success: false, error: "PAGARME_ORDERZAP_API_KEY não configurada" });

  let input: any = {};
  try { input = await req.json(); } catch { /* corpo vazio = scan */ }
  const apply = input?.mode === "apply";
  const sinceDays = Math.min(Math.max(Number(input?.since_days) || 60, 1), 400);
  const since = Date.now() - sinceDays * 864e5;

  const get = async (path: string) => {
    const r = await fetch(`${API}${path}`, { headers: { Authorization: "Basic " + btoa(`${apiKey}:`), "User-Agent": "cartzy/1.0" } });
    const text = await r.text();
    let body: any; try { body = JSON.parse(text); } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
  };

  try {
    // Planos dos links compartilhados (id do plano na Pagar.me -> chave do plano por módulo)
    const { data: links } = await admin.from("pagarme_recurring_links").select("name, pagarme_plan_id");
    const planKey = new Map<string, string>();
    for (const l of links ?? []) {
      const k = KEY_BY_NAME[String(l.name || "").trim().toLowerCase()];
      if (k && l.pagarme_plan_id) planKey.set(l.pagarme_plan_id, k);
    }

    // Assinaturas feitas pelo link (as de cartão criadas dentro do Cartzy já têm tenant e são tratadas pelo webhook)
    const { data: own } = await admin.from("subscription_recurrences").select("pagarme_subscription_id");
    const ownSubs = new Set((own ?? []).map((r: any) => r.pagarme_subscription_id));

    const subs: any[] = [];
    for (let page = 1; page <= 40; page++) {
      const r = await get(`/subscriptions?page=${page}&size=100`);
      if (!r.ok) return json({ success: false, error: "Pagar.me recusou a listagem de assinaturas", status: r.status, body: r.body });
      const rows: any[] = Array.isArray(r.body?.data) ? r.body.data : [];
      for (const s of rows) {
        const pid = s?.plan?.id || s?.plan_id;
        if (pid && planKey.has(pid) && !ownSubs.has(s.id)) subs.push({ ...s, _plan_key: planKey.get(pid) });
      }
      if (rows.length < 100) break;
    }

    const results: any[] = [];
    const waiting: any[] = [];
    let debugSample: any = null;

    for (const s of subs) {
      const inv = await get(`/invoices?subscription_id=${encodeURIComponent(s.id)}&size=50`);
      const invoices: any[] = inv.ok && Array.isArray(inv.body?.data) ? inv.body.data : [];
      if (input?.debug && !debugSample) debugSample = { subscription_keys: Object.keys(s), invoice_keys: invoices[0] ? Object.keys(invoices[0]) : null, invoice_status: inv.status };
      const cust = s.customer || {};
      const mp = cust?.phones?.mobile_phone || cust?.phones?.home_phone || null;
      const phone = mp ? `${mp.country_code || ""}${mp.area_code || ""}${mp.number || ""}` : null;
      let paidCount = 0;

      for (const iv of invoices) {
        const ch = iv?.charge || null;
        const paid = iv?.status === "paid" || ch?.status === "paid";
        if (!paid) continue;
        const chargeId: string | undefined = ch?.id;
        if (!chargeId) continue;
        const paidAt = ch?.paid_at || iv?.paid_at || iv?.billing_at || iv?.created_at || null;
        if (paidAt && new Date(paidAt).getTime() < since) continue;
        paidCount++;
        const amount = Number(ch?.paid_amount ?? ch?.amount ?? iv?.amount ?? 0) / 100;

        const { data: done } = await admin.from("platform_pagarme_credits").select("payment_ref, ends_after, source").eq("payment_ref", chargeId).maybeSingle();
        const { data: tn } = await admin.rpc("platform_pagarme_resolve", {
          _customer_id: cust?.id || null, _subscription_id: s.id, _email: cust?.email || null, _phone: phone, _document: cust?.document || null,
        });
        const t = Array.isArray(tn) ? tn[0] : tn;
        let tenantName: string | null = null;
        if (t?.o_tenant_id) {
          const { data: tt } = await admin.from("tenants").select("name, subscription_ends_at").eq("id", t.o_tenant_id).maybeSingle();
          tenantName = tt?.name ?? null;
        }

        const row: any = {
          subscription_id: s.id, plan: s._plan_key, charge_id: chargeId, paid_at: paidAt, amount,
          customer: cust?.name || null, email: cust?.email || null, document: cust?.document || null,
          tenant_id: t?.o_tenant_id || null, tenant_name: tenantName, matched_by: t?.o_matched_by || null,
          already_credited: !!done, credited_until: done?.ends_after || null,
        };
        // charge_ids (opcional): no modo apply, credita só estas cobranças
        const onlyThese: string[] | null = Array.isArray(input?.charge_ids) ? input.charge_ids : null;
        if (apply && !done && (!onlyThese || onlyThese.includes(chargeId))) {
          const { data: out, error } = await admin.rpc("platform_pagarme_payment", {
            _payment_ref: chargeId, _amount: amount, _paid_at: paidAt, _customer_id: cust?.id || null, _subscription_id: s.id,
            _email: cust?.email || null, _phone: phone, _document: cust?.document || null, _name: cust?.name || null, _plan_key: s._plan_key,
          });
          row.applied = error ? { error: error.message } : out;
        }
        results.push(row);
      }
      if (!paidCount) {
        waiting.push({
          subscription_id: s.id, plan: s._plan_key, status: s.status, customer: cust?.name || null, email: cust?.email || null,
          invoices: invoices.map((i) => i?.status).join(",") || "(nenhuma)", created_at: s.created_at,
        });
      }
    }

    const summary = {
      subscriptions_from_links: subs.length,
      paid_charges: results.length,
      already_credited: results.filter((r) => r.already_credited).length,
      to_credit: results.filter((r) => !r.already_credited && r.tenant_id).length,
      without_company: results.filter((r) => !r.tenant_id).length,
      newly_credited: results.filter((r) => r.applied?.credit?.credited === true).length,
    };
    if (apply) {
      await admin.from("webhook_logs").insert({ webhook_type: "pagarme_reconcile", status_code: 200, payload: summary } as any);
    }
    return json({ success: true, mode: apply ? "apply" : "scan", since_days: sinceDays, summary, paid: results, waiting_payment: waiting, debug: debugSample });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
});
