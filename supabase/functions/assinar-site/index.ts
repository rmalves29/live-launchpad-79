// assinar-site · edge function PÚBLICA do fluxo de assinatura do site (verify_jwt = false)
//
// Regra do Rafael: o site pede os dados de acesso; o PAGAMENTO acontece no ambiente do Asaas
// (checkout hospedado); o acesso só é criado depois que o webhook confirma o pagamento.
// Nenhum dado de pagamento passa pelo site ou por esta função.
//
// Ações (POST JSON { action, ... }):
//   iniciar → valida os dados de acesso, grava o cadastro PENDENTE e cria um Link de Pagamento RECORRENTE do
//             Asaas (mensal R$ 499, só cartão, sem fim). A cliente digita o cartão na página do Asaas.
//             Devolve a URL do checkout para o navegador redirecionar.
//   status  → andamento pelo token (página de obrigado e retomada).
//
// API usada: POST /v3/paymentLinks (chargeType RECURRENT, subscriptionCycle MONTHLY, billingType CREDIT_CARD).
// Não precisa de plano pré-criado. Segurança: preço, plano, papel e implantação são decididos aqui.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, enforceRateLimit, rateLimitOk } from "../_shared/rate-limit.ts";
import { attribution, normalizePhone, texto } from "../_shared/agenda-core.ts";
import { enviarMeta, sha256 } from "../_shared/conversions.ts";
import { asaas, asaasConfig, AsaasError } from "../_shared/asaas.ts";

// ── Oferta: constantes do servidor ──
const PRECO_MENSAL = 499;
const IMPLANTACAO_CHEIA = 600;
const promoLigada = () => (Deno.env.get("PROMO_IMPLANTACAO") || "on").toLowerCase() === "on";

const SITE_URL = (Deno.env.get("SITE_URL") || "https://cartzy.com.br").replace(/\/$/, "");
const ORIGENS = (Deno.env.get("ALLOWED_ORIGINS") || "https://cartzy.com.br,https://www.cartzy.com.br").split(",").map((s) => s.trim()).filter(Boolean);
const TOKEN_RE = /^[a-f0-9]{64}$/;

class Erro extends Error {
  constructor(public status: number, public code: string, msg: string) {
    super(msg);
  }
}

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGENS.includes(origin) ? origin : ORIGENS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function novoToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ── documento ── */
function cpfValido(c: string) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function cnpjValido(c: string) {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((a, p, i) => a + Number(c[i]) * p, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}
function documento(v: unknown): { doc: string; tipo: "CPF" | "CNPJ" } | null {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && cpfValido(d)) return { doc: d, tipo: "CPF" };
  if (d.length === 14 && cnpjValido(d)) return { doc: d, tipo: "CNPJ" };
  return null;
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

async function carregar(sb: SupabaseClient, token: unknown) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) throw new Erro(400, "token", "Cadastro não encontrado. Comece de novo.");
  const { data } = await sb.from("assinaturas_pendentes").select("*").eq("token", token).maybeSingle();
  if (!data) throw new Erro(404, "token", "Cadastro não encontrado. Comece de novo.");
  return data;
}

/**
 * Cria o checkout hospedado do Asaas: link de pagamento RECORRENTE, mensal, só cartão (R$ 499, sem fim).
 * A cliente preenche os dados do cartão na página do Asaas; nada de pagamento passa pelo site.
 * O vínculo com o cadastro pendente é o id do link (payment.paymentLink no webhook) e o externalReference.
 * Implantação: o link não cobra implantação (hoje é grátis na promoção; se ligar a cobrança, ela é feita por fora).
 */
// deno-lint-ignore no-explicit-any
async function criarCheckout(sb: SupabaseClient, p: any): Promise<{ id: string; url: string }> {
  const cfg = await asaasConfig(sb);
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const link = await asaas(cfg, "POST", "/paymentLinks", {
    name: `Cartzy · ${String(p.loja_nome).slice(0, 40)}`,
    description: "Assinatura mensal do Cartzy",
    billingType: "CREDIT_CARD",
    chargeType: "RECURRENT",
    subscriptionCycle: "MONTHLY",
    value: PRECO_MENSAL,
    endDate: amanha,
    notificationEnabled: false,
    externalReference: p.id,
    callback: { successUrl: `${SITE_URL}/obrigado-assinatura?t=${p.token}`, autoRedirect: true },
  });
  if (!link?.url) throw new AsaasError(502, "Asaas não devolveu a URL do checkout", link);
  return { id: link.id, url: link.url };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  if (origin && !ORIGENS.includes(origin)) return json({ error: "Origem não permitida" }, 403);
  if (Number(req.headers.get("content-length") || 0) > 16_000) return json({ error: "Requisição grande demais" }, 413);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const lim = await enforceRateLimit(req, sb, "assinar-site", 60, 60);
  if (lim) return new Response(lim.body, { status: 429, headers });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const ip = clientIp(req);
  const ua = texto(req.headers.get("user-agent"), 300);

  try {
    switch (body?.action) {
      case "iniciar": {
        if (!(await rateLimitOk(sb, `assinar-iniciar:${ip}`, 6, 600))) throw new Erro(429, "limite", "Muitas tentativas. Espere uns minutos.");
        if (texto(body.website, 50)) return json({ token: novoToken(), event_id: `ic_${crypto.randomUUID()}`, checkout_url: `${SITE_URL}/` }); // honeypot
        const nome = texto(body.nome, 80);
        const email = texto(body.email, 254).toLowerCase();
        const whatsapp = normalizePhone(body.whatsapp);
        const loja = texto(body.loja_nome, 60);
        const doc = documento(body.documento);
        if (nome.length < 3) throw new Erro(400, "nome", "Informe seu nome completo.");
        if (!EMAIL_RE.test(email)) throw new Erro(400, "email", "Confira o e-mail: é por ele que você vai entrar no Cartzy.");
        if (!whatsapp) throw new Erro(400, "whatsapp", "Confira o WhatsApp com DDD.");
        if (loja.length < 2) throw new Erro(400, "loja", "Informe o nome da loja.");
        if (!doc) throw new Erro(400, "documento", "CPF ou CNPJ inválido.");
        if (body.aceite !== true) throw new Erro(400, "aceite", "Para continuar, aceite os Termos de Uso e a Política de Privacidade.");

        const token = novoToken();
        const attr = attribution(body.attribution);
        const { data: p, error } = await sb
          .from("assinaturas_pendentes")
          .insert({
            token,
            status: "pending",
            nome,
            email,
            whatsapp,
            loja_nome: loja,
            documento: doc.doc,
            documento_tipo: doc.tipo,
            aceite_termos_em: new Date().toISOString(),
            plano_preco: PRECO_MENSAL,
            implantacao_valor: promoLigada() ? 0 : IMPLANTACAO_CHEIA,
            attribution: attr,
            ip_hash: await sha256(`${Deno.env.get("IP_HASH_SALT") || "cartzy"}:${ip}`),
            user_agent: ua || null,
          })
          .select("*")
          .single();
        if (error) {
          console.error("[assinar-site] insert", error.message);
          throw new Erro(500, "db", "Não conseguimos salvar agora. Tente de novo.");
        }

        let checkout;
        try {
          checkout = await criarCheckout(sb, p);
        } catch (e) {
          const msg = e instanceof AsaasError ? e.message : String(e);
          console.error("[assinar-site] checkout", msg, e instanceof AsaasError ? JSON.stringify(e.detalhes).slice(0, 500) : "");
          await sb.from("assinaturas_pendentes").update({ falha_motivo: `checkout: ${msg}`.slice(0, 300) }).eq("id", p.id);
          throw new Erro(502, "checkout", "Não conseguimos abrir o pagamento agora. Tente de novo em instantes ou fale com a gente no WhatsApp.");
        }
        await sb
          .from("assinaturas_pendentes")
          .update({ status: "checkout", event_id: p.id, asaas_payment_link_id: checkout.id, checkout_url: checkout.url })
          .eq("id", p.id);

        const eventId = `ic_${p.id}`;
        await enviarMeta({
          nome: "InitiateCheckout",
          eventId,
          sourceUrl: `${SITE_URL}/assinar`,
          usuario: { phone: whatsapp, email, firstName: nome, externalId: p.id, ip, userAgent: ua, fbp: attr.fbp, fbc: attr.fbc },
          customData: { value: PRECO_MENSAL, currency: "BRL", content_name: "cartzy_mensal" },
        });
        return json({ token, event_id: eventId, checkout_url: checkout.url });
      }

      case "status": {
        const p = await carregar(sb, body.token);
        const expirado = ["pending", "checkout"].includes(p.status) && new Date(p.expires_at) < new Date();
        return json({
          status: expirado ? "expired" : p.status,
          primeiro_nome: String(p.nome).split(" ")[0],
          email: p.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2"),
          implantacao_valor: Number(p.implantacao_valor),
          preco: Number(p.plano_preco),
          // só devolve o link enquanto ainda faz sentido pagar
          checkout_url: ["checkout", "failed"].includes(p.status) && !expirado ? p.checkout_url : null,
        });
      }

      default:
        return json({ error: "Ação inválida" }, 400);
    }
  } catch (e) {
    if (e instanceof Erro) return json({ error: e.message, code: e.code }, e.status);
    console.error("[assinar-site]", String(e));
    return json({ error: "Algo deu errado. Tente de novo em instantes.", code: "erro" }, 500);
  }
});
