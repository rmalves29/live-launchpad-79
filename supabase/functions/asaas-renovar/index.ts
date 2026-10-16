// asaas-renovar · botão "Renovar agora" da tela de assinatura vencida (cliente com assinatura Asaas)
//
// Exige login (JWT). A empresa vem do perfil do usuário, nunca do corpo da requisição.
//   action "info"    → { asaas: boolean } diz se esta empresa assina pelo Asaas.
//   action "renovar" → devolve a URL do Asaas para pagar:
//       1. assinatura ainda ativa no Asaas e com cobrança vencida/pendente → link (invoiceUrl) dessa cobrança;
//       2. senão (assinatura cancelada/inativa) → cria um novo link de pagamento recorrente mensal (R$ da assinatura).
// A liberação do acesso é automática: o asaas-webhook recebe o pagamento e soma 30 dias.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { asaas, asaasConfig, AsaasError } from "../_shared/asaas.ts";

const APP_URL = (Deno.env.get("APP_URL") || "https://app.cartzy.com.br").replace(/\/$/, "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "não autenticado" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "usuário inválido" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: profile } = await sb.from("profiles").select("tenant_id").eq("id", u.user.id).maybeSingle();
  if (!profile?.tenant_id) return json({ error: "sem empresa" }, 403);

  const { data: pend } = await sb
    .from("assinaturas_pendentes")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .not("asaas_payment_link_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let body: any = {};
  try { body = await req.json(); } catch { /* vazio */ }

  if (body?.action === "info") return json({ asaas: !!pend });
  if (!pend) return json({ error: "esta empresa não assina pelo Asaas", code: "sem_asaas" }, 404);

  try {
    const cfg = await asaasConfig(sb);

    // 1. assinatura ativa com cobrança em aberto → paga essa cobrança
    if (pend.asaas_subscription_id) {
      const sub = await asaas(cfg, "GET", `/subscriptions/${encodeURIComponent(pend.asaas_subscription_id)}`).catch(() => null);
      if (sub && sub.status === "ACTIVE" && !sub.deleted) {
        const list = await asaas(cfg, "GET", `/subscriptions/${encodeURIComponent(pend.asaas_subscription_id)}/payments?limit=20`).catch(() => null);
        const abertas = (list?.data || []).filter((p: any) => ["OVERDUE", "PENDING"].includes(p.status) && p.invoiceUrl);
        abertas.sort((a: any, b: any) => String(a.dueDate).localeCompare(String(b.dueDate)));
        if (abertas[0]) return json({ url: abertas[0].invoiceUrl, tipo: "cobranca_em_aberto" });
      }
    }

    // 2. assinatura encerrada → novo link recorrente para a mesma empresa
    const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const link = await asaas(cfg, "POST", "/paymentLinks", {
      name: `Cartzy · ${String(pend.loja_nome).slice(0, 40)}`,
      description: "Assinatura mensal do Cartzy (renovação)",
      billingType: "CREDIT_CARD",
      chargeType: "RECURRENT",
      subscriptionCycle: "MONTHLY",
      value: Number(pend.plano_preco) || 499,
      endDate: amanha,
      notificationEnabled: false,
      externalReference: pend.id,
      callback: { successUrl: `${APP_URL}/`, autoRedirect: true },
    });
    if (!link?.url) throw new AsaasError(502, "Asaas não devolveu o link", link);
    // o webhook acha o cadastro (e a empresa) por este link no próximo pagamento
    await sb.from("assinaturas_pendentes").update({ asaas_payment_link_id: link.id }).eq("id", pend.id);
    return json({ url: link.url, tipo: "novo_link" });
  } catch (e) {
    console.error("[asaas-renovar]", String(e));
    return json({ error: "Não conseguimos abrir o pagamento agora. Tente de novo em instantes ou fale com a gente no WhatsApp." }, 502);
  }
});
