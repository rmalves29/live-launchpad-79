// asaas-webhook · recebe os avisos do Asaas sobre a assinatura do site (verify_jwt = false)
//
// Segurança (em camadas):
//   1. header "asaas-access-token" tem de ser igual ao secret ASAAS_WEBHOOK_TOKEN (sem o secret a função recusa tudo);
//   2. cada pagamento é CONFIRMADO na API do Asaas (GET /payments/{id}) com a nossa chave: só vale o que o Asaas
//      devolve, nunca o corpo recebido.
//
// Fluxo:
//   PAYMENT_CONFIRMED / PAYMENT_RECEIVED
//     - 1º pagamento (link de pagamento de assinatura do site): acha o cadastro por payment.paymentLink,
//       provisiona a conta (tenant + usuário + perfil, papel e plano fixos no servidor), manda o link de criar
//       senha por e-mail e WhatsApp, avisa o Rafael e dispara Subscribe/Purchase pela CAPI.
//     - pagamentos seguintes (mensalidade): acha o cadastro por payment.subscription e estende
//       tenants.subscription_ends_at em 1 mês.
//   PAYMENT_CREDIT_CARD_CAPTURE_REFUSED → cadastro "failed" (antes da conta) ou aviso ao Rafael (depois).
//   SUBSCRIPTION_DELETED / SUBSCRIPTION_INACTIVATED → aviso ao Rafael (o acesso vence naturalmente no fim do período pago).
// Idempotente: reserva do provisionamento por update condicional + asaas_last_payment_id.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { notifyCartzyAdmins } from "../_shared/admin-push-notify.ts";
import { PLANO_CLIENTE, provisionarTenant } from "../_shared/provision-tenant.ts";
import { enviarGa4, enviarMeta } from "../_shared/conversions.ts";
import { asaas, iguais } from "../_shared/asaas.ts";

const APP_URL = (Deno.env.get("APP_URL") || "https://app.cartzy.com.br").replace(/\/$/, "");
const SITE_URL = (Deno.env.get("SITE_URL") || "https://cartzy.com.br").replace(/\/$/, "");

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function enviarWhatsSite(sb: any, phone: string, text: string): Promise<boolean> {
  const { data } = await sb.from("agenda_config").select("chave, valor").in("chave", ["attendflow_url", "attendflow_secret"]);
  const cfg = Object.fromEntries((data || []).map((r: any) => [r.chave, r.valor]));
  if (!cfg.attendflow_url) return false;
  try {
    const r = await fetch(cfg.attendflow_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-agenda-secret": cfg.attendflow_secret || "" },
      body: JSON.stringify({ phone, text }),
      signal: AbortSignal.timeout(15000),
    });
    return r.ok;
  } catch (e) {
    console.error("[asaas-webhook] whatsapp", String(e));
    return false;
  }
}

async function avisarRafael(sb: any, msg: string) {
  const { error } = await sb.rpc("agenda_whats_rafael", { msg });
  if (error) console.error("[asaas-webhook] aviso rafael", error.message);
}

/** 1º pagamento: cria a conta e entrega o acesso. */
async function primeiroPagamento(sb: any, pend: any, pay: any) {
  const agora = new Date();
  const ids: any = { asaas_last_payment_id: pay.id };
  if (pay.subscription) ids.asaas_subscription_id = pay.subscription;
  if (pay.customer) ids.asaas_customer_id = pay.customer;
  await sb.from("assinaturas_pendentes").update(ids).eq("id", pend.id);

  // reserva o provisionamento (um webhook por vez; retoma se travou há mais de 2 min)
  const { data: reservado } = await sb
    .from("assinaturas_pendentes")
    .update({ status: "provisioning", paid_at: pend.paid_at || agora.toISOString() })
    .eq("id", pend.id)
    .in("status", ["pending", "checkout", "processing", "failed", "paid"])
    .select("*")
    .maybeSingle();
  let p = reservado;
  if (!p) {
    const { data: atual } = await sb.from("assinaturas_pendentes").select("*").eq("id", pend.id).single();
    if (atual.status === "provisioned") return { idempotent: true };
    const travado = atual.status === "provisioning" && Date.parse(atual.updated_at) < Date.now() - 120000;
    if (!travado) return { em_andamento: true, status: atual.status };
    p = atual;
  }

  const r = await provisionarTenant(sb, { id: p.id, nome: p.nome, email: p.email, loja_nome: p.loja_nome, tenant_id: p.tenant_id, user_id: p.user_id });
  if (!r.ok) {
    await sb.from("assinaturas_pendentes").update({ status: "needs_review", falha_motivo: `${r.motivo}: ${r.detalhe}`.slice(0, 300) }).eq("id", p.id);
    const texto =
      r.motivo === "email_existente"
        ? `⚠️ *Assinatura paga pelo site precisa de você*\n${p.nome} (${p.loja_nome}) pagou, mas o e-mail ${p.email} já tem conta no Cartzy. Nenhuma conta foi alterada. Fale com ela: ${p.whatsapp}`
        : `⚠️ *Assinatura paga pelo site: erro ao criar a conta*\n${p.nome} (${p.loja_nome}) · ${p.email} · ${p.whatsapp}\nMotivo: ${r.detalhe}`;
    await avisarRafael(sb, texto);
    notifyCartzyAdmins({ title: "⚠️ Assinatura do site para revisar", body: `${p.loja_nome}: ${r.motivo}`, url: "/empresas", tag: `site-review-${p.id}` }).catch(() => undefined);
    return { needs_review: true };
  }
  await sb.from("assinaturas_pendentes").update({ status: "provisioned", provisioned_at: agora.toISOString() }).eq("id", p.id);

  let linkOk = false;
  if (!p.link_senha_enviado_em) {
    const { error: linkErr } = await sb.auth.resetPasswordForEmail(p.email, { redirectTo: `${APP_URL}/reset-password` });
    if (linkErr) console.error("[asaas-webhook] link senha", linkErr.message);
    linkOk = !linkErr;
    const primeiro = String(p.nome).split(" ")[0];
    await enviarWhatsSite(
      sb,
      p.whatsapp,
      [
        `Oi, ${primeiro}! Seu pagamento foi confirmado e a sua conta do Cartzy está pronta.`,
        "",
        `Mandamos no seu e-mail (${p.email}) o link para criar a sua senha. Depois é só entrar em ${APP_URL}/auth com esse e-mail.`,
        "Se o e-mail não chegar em alguns minutos, olhe a caixa de spam ou responda esta mensagem.",
        "",
        "Agora a gente te chama para marcar a implantação. Você vende. O Cartzy organiza.",
      ].join("\n"),
    );
    await sb.from("assinaturas_pendentes").update({ link_senha_enviado_em: agora.toISOString() }).eq("id", p.id);
  }

  await avisarRafael(
    sb,
    `💸 *Nova assinatura pelo site*\n${p.nome} · ${p.loja_nome}\nWhatsApp: ${p.whatsapp}\nE-mail: ${p.email}\nImplantação: ${Number(p.implantacao_valor) > 0 ? "R$ " + p.implantacao_valor + " (cobrar por fora)" : "grátis (promoção)"}\nLink de senha: ${linkOk ? "enviado por e-mail" : "FALHOU, reenviar"}\n👉 Marcar a implantação.`,
  );
  notifyCartzyAdmins({ title: "💸 Nova assinatura pelo site", body: `${p.loja_nome} assinou o Cartzy.`, url: "/empresas", tag: `site-sub-${p.id}` }).catch(() => undefined);

  const attr = p.attribution || {};
  const usuario = { phone: p.whatsapp, email: p.email, firstName: p.nome, externalId: p.id, fbp: attr.fbp, fbc: attr.fbc };
  const custom = { value: Number(p.plano_preco), currency: "BRL", origem: "site" };
  await Promise.all([
    enviarMeta({ nome: "Subscribe", eventId: `sub_${p.id}`, sourceUrl: `${SITE_URL}/obrigado-assinatura`, usuario, customData: custom }),
    enviarMeta({ nome: "Purchase", eventId: `pur_${p.id}`, sourceUrl: `${SITE_URL}/obrigado-assinatura`, usuario, customData: custom }),
    enviarGa4({
      clientId: attr.ga_client_id,
      userId: p.id,
      nome: "purchase",
      params: { transaction_id: p.id, value: Number(p.plano_preco), currency: "BRL", items: [{ item_id: "cartzy_mensal", price: Number(p.plano_preco) }] },
    }),
  ]);
  return { provisioned: true, tenant_id: r.tenant_id };
}

/** Mensalidade seguinte: estende o acesso em 1 mês. */
async function renovacao(sb: any, pend: any, pay: any) {
  if (!pend.tenant_id) return { ignorado: "sem tenant ainda" };
  const { data: reserva } = await sb
    .from("assinaturas_pendentes")
    .update({ asaas_last_payment_id: pay.id })
    .eq("id", pend.id)
    .neq("asaas_last_payment_id", pay.id)
    .select("id")
    .maybeSingle();
  if (!reserva) return { idempotent: true };
  const { data: tenant } = await sb.from("tenants").select("subscription_ends_at").eq("id", pend.tenant_id).maybeSingle();
  const agora = new Date();
  const base = tenant?.subscription_ends_at && new Date(tenant.subscription_ends_at) > agora ? new Date(tenant.subscription_ends_at) : agora;
  const fim = new Date(base);
  fim.setMonth(fim.getMonth() + 1);
  await sb.from("tenants").update({ subscription_ends_at: fim.toISOString(), plan_type: PLANO_CLIENTE, is_blocked: false }).eq("id", pend.tenant_id);
  return { renovado_ate: fim.toISOString() };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const esperado = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  if (!esperado) return json({ error: "webhook não configurado" }, 500);
  const recebido = req.headers.get("asaas-access-token") || "";
  if (!iguais(recebido, esperado)) return json({ error: "unauthorized" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const log = (tipo: string, status: number, payload: unknown, erro?: string) =>
    sb.from("webhook_logs").insert({ webhook_type: `asaas:${tipo}`, status_code: status, payload, error_message: erro || null } as any);

  let ev: any;
  try {
    ev = JSON.parse(await req.text());
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const tipo: string = ev?.event || "";

  try {
    if (tipo === "PAYMENT_CONFIRMED" || tipo === "PAYMENT_RECEIVED") {
      const id = ev?.payment?.id;
      if (!id) return json({ ok: true, ignored: "sem id" });
      const pay = await asaas("GET", `/payments/${encodeURIComponent(id)}`); // dado autêntico
      if (pay.id !== id || !["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(pay.status)) {
        await log(`${tipo}:status_${pay.status}`, 200, { id });
        return json({ ok: true, ignored: `status ${pay.status}` });
      }
      // 1º pagamento: vem do link do site
      let pend: any = null;
      if (pay.paymentLink) {
        const { data } = await sb.from("assinaturas_pendentes").select("*").eq("asaas_payment_link_id", pay.paymentLink).maybeSingle();
        pend = data;
      }
      // mensalidades: pela assinatura
      if (!pend && pay.subscription) {
        const { data } = await sb.from("assinaturas_pendentes").select("*").eq("asaas_subscription_id", pay.subscription).maybeSingle();
        pend = data;
      }
      if (!pend) {
        await log(`${tipo}:sem_cadastro`, 200, { id, paymentLink: pay.paymentLink, subscription: pay.subscription }, "cadastro não encontrado");
        return json({ ok: true, ignored: "sem cadastro" });
      }
      if (pend.asaas_last_payment_id === pay.id) return json({ ok: true, idempotent: true });
      const jaTemConta = ["provisioned", "provisioning"].includes(pend.status) && pend.tenant_id;
      const out = jaTemConta ? await renovacao(sb, pend, pay) : await primeiroPagamento(sb, pend, pay);
      await log(tipo, 200, { id, ...out });
      return json({ ok: true, ...out });
    }

    if (tipo === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED" || tipo === "PAYMENT_REFUSED") {
      const id = ev?.payment?.id;
      const pay = id ? await asaas("GET", `/payments/${encodeURIComponent(id)}`) : null;
      if (pay?.paymentLink) {
        await sb
          .from("assinaturas_pendentes")
          .update({ status: "failed", falha_motivo: "cartão recusado" })
          .eq("asaas_payment_link_id", pay.paymentLink)
          .in("status", ["pending", "checkout", "processing", "failed"]);
      } else if (pay?.subscription) {
        const { data: p } = await sb.from("assinaturas_pendentes").select("nome, loja_nome, whatsapp").eq("asaas_subscription_id", pay.subscription).maybeSingle();
        if (p) await avisarRafael(sb, `⚠️ *Mensalidade recusada*\n${p.nome} · ${p.loja_nome} · ${p.whatsapp}\nO cartão foi recusado na renovação. O Asaas tenta de novo; se não passar, fale com ela.`);
      }
      await log(tipo, 200, { id });
      return json({ ok: true });
    }

    if (tipo === "SUBSCRIPTION_DELETED" || tipo === "SUBSCRIPTION_INACTIVATED") {
      const sid = ev?.subscription?.id;
      if (sid) {
        const { data: p } = await sb.from("assinaturas_pendentes").select("nome, loja_nome, whatsapp").eq("asaas_subscription_id", sid).maybeSingle();
        if (p) await avisarRafael(sb, `ℹ️ *Assinatura cancelada no Asaas*\n${p.nome} · ${p.loja_nome} · ${p.whatsapp}\nO acesso vale até o fim do período já pago.`);
      }
      await log(tipo, 200, { sid });
      return json({ ok: true });
    }

    return json({ ok: true, ignored: tipo });
  } catch (e) {
    console.error("[asaas-webhook]", String(e));
    await log(`erro:${tipo}`, 500, { tipo }, String(e));
    return json({ ok: false }, 500); // 500 faz o Asaas tentar de novo
  }
});
