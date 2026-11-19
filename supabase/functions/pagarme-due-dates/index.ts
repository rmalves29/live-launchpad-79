// Vencimento da Cartzy = próxima cobrança da assinatura na Pagar.me (+1 dia de tolerância para o pagamento confirmar).
// Lê as assinaturas ligadas às empresas (platform_pagarme_customer_map e subscription_recurrences), busca na Pagar.me
// a data da próxima cobrança e grava em tenants.subscription_ends_at.
//
// Chamadas: agendador diário (x-olist-cron-secret) / service role (o webhook da Pagar.me chama depois de cada pagamento).
// { dry_run: true } só devolve o que mudaria. { tenant_id } restringe a uma empresa.
// Assinatura cancelada ou sem próxima cobrança: não mexe (o acesso vai até a data atual).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TOLERANCIA_DIAS = 1;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  let ok = bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!ok) {
    const s = req.headers.get("x-olist-cron-secret") || "";
    if (/^[a-f0-9]{64}$/.test(s)) {
      const { data } = await supabase.rpc("olist_cron_authorized", { p_secret: s });
      ok = data === true;
    }
  }
  if (!ok) return json({ error: "Nao autorizado" }, 403);

  const body = await req.json().catch(() => ({}));
  const dry = body.dry_run === true;
  const apiKey = Deno.env.get("PAGARME_ORDERZAP_API_KEY");
  if (!apiKey) return json({ error: "sem PAGARME_ORDERZAP_API_KEY" }, 500);

  // assinaturas por empresa
  let q1 = supabase.from("platform_pagarme_customer_map").select("tenant_id, pagarme_subscription_id").not("pagarme_subscription_id", "is", null);
  let q2 = supabase.from("subscription_recurrences").select("tenant_id, pagarme_subscription_id").not("pagarme_subscription_id", "is", null);
  if (body.tenant_id) { q1 = q1.eq("tenant_id", body.tenant_id); q2 = q2.eq("tenant_id", body.tenant_id); }
  const subsByTenant = new Map<string, Set<string>>();
  for (const r of [...((await q1).data || []), ...((await q2).data || [])]) {
    if (!subsByTenant.has(r.tenant_id)) subsByTenant.set(r.tenant_id, new Set());
    subsByTenant.get(r.tenant_id)!.add(String(r.pagarme_subscription_id));
  }

  const out: any[] = [];
  for (const [tenantId, subs] of subsByTenant) {
    const { data: t } = await supabase.from("tenants").select("name, subscription_ends_at").eq("id", tenantId).maybeSingle();
    let best: Date | null = null;
    const detalhes: any[] = [];
    for (const sid of subs) {
      const r = await fetch(`https://api.pagar.me/core/v5/subscriptions/${sid}`, { headers: { Authorization: "Basic " + btoa(`${apiKey}:`) } });
      const s = r.ok ? await r.json().catch(() => null) : null;
      const next = s?.next_billing_at ? new Date(s.next_billing_at) : null;
      detalhes.push({ assinatura: sid, status: s?.status ?? `erro ${r.status}`, proxima_cobranca: s?.next_billing_at ?? null });
      if (s?.status === "active" && next && !isNaN(next.getTime()) && (!best || next > best)) best = next;
    }
    const atual = t?.subscription_ends_at ? new Date(t.subscription_ends_at) : null;
    if (!best) { out.push({ empresa: t?.name, tenantId, atual: atual?.toISOString() ?? null, novo: null, motivo: "sem assinatura ativa na Pagar.me", detalhes }); continue; }
    const novo = new Date(best.getTime() + TOLERANCIA_DIAS * 864e5);
    const muda = !atual || Math.abs(novo.getTime() - atual.getTime()) > 60 * 60 * 1000;
    if (muda && !dry) {
      await supabase.from("tenants").update({ subscription_ends_at: novo.toISOString() }).eq("id", tenantId);
      await supabase.from("webhook_logs").insert({ webhook_type: "pagarme_due_date:alinhado", status_code: 200, tenant_id: tenantId, payload: { de: atual?.toISOString() ?? null, para: novo.toISOString(), detalhes } } as any);
    }
    out.push({ empresa: t?.name, tenantId, atual: atual?.toISOString() ?? null, novo: novo.toISOString(), muda, detalhes });
  }
  console.log("[pagarme-due-dates]", dry ? "dry_run" : "aplicado", JSON.stringify(out).slice(0, 3000));
  return json({ ok: true, dry_run: dry, result: out });
});
