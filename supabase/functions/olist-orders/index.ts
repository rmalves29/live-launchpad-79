// Olist ERP (API v3): envia pedidos pagos do Cartzy para a Olist, emite a nota fiscal e traz o rastreio de volta.
// Ações:
//   settings        lê as chaves de envio da empresa (usuário da empresa ou super admin).
//   save_settings   grava as chaves (send_orders, auto_send, issue_invoice, invoice_model, sync_tracking, order_situacao).
//   send_order      envia UM pedido (order_id). Reenvio só se ainda não tiver olist_order_id.
//   send_pending    envia os pedidos pagos pendentes da empresa (até 15 por chamada).
//   invoice         gera e emite a nota de UM pedido já enviado.
//   sync_tracking   confere o rastreio dos pedidos enviados da empresa.
//   auto_sweep      (só service role / agendamento) faz o envio automático, a nota e o rastreio de todas as empresas que ligaram.
// Segurança: nada vai à Olist se send_orders estiver desligado; o automático ainda exige auto_send. Pedido nunca é enviado duas vezes:
// reserva (processing) antes de enviar e confere na Olist pelo número do pedido do e-commerce.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import { erpCanConfirmPostage } from "../_shared/postage-confirmation.ts";
import { olistRequest, olistErrorMessage } from "../_shared/olist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const norm = (v: unknown) => String(v ?? "").trim();
const digits = (v: unknown) => norm(v).replace(/\D/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 5;
const SETTINGS_COLS = "is_active, status, deposit_id, send_orders, auto_send, order_situacao, issue_invoice, invoice_model, sync_tracking, send_from";

function validEmail(v: unknown): string {
  const e = norm(v).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : "";
}
function uf(v: unknown): string {
  const s = norm(v).toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : "";
}
function money(s: string): number {
  const t = s.replace(/[^\d.,]/g, "");
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}
// o frete do pedido vem na observação: "[FRETE] Nome | R$ 12,50"
function parseFreight(obs: string): { nome: string; valor: number } {
  const m = obs.match(/\[FRETE\]\s*([^|]+?)\s*\|\s*R\$\s*([\d.,]+)/i);
  if (m) return { nome: m[1].trim(), valor: money(m[2]) };
  return { nome: "", valor: 0 };
}
const errText = (r: { status: number; data: any }, what: string) => {
  const det = Array.isArray(r.data?.detalhes) ? r.data.detalhes.map((d: any) => d?.mensagem || d?.campo).filter(Boolean).join("; ") : "";
  const msg = olistErrorMessage(r.status, r.data, what);
  return (det ? `${msg} (${det})` : msg).slice(0, 400);
};

async function loadSettings(supabase: any, tenantId: string) {
  const { data } = await supabase.from("integration_olist").select(SETTINGS_COLS).eq("tenant_id", tenantId).maybeSingle();
  return data as any;
}

// ---- contato (cliente) na Olist: acha pelo CPF/CNPJ, senão cria ----
async function ensureContact(supabase: any, tenantId: string, order: any, customer: any): Promise<{ id?: number; error?: string }> {
  if (customer?.olist_contact_id) return { id: Number(customer.olist_contact_id) };
  const doc = digits(customer?.cpf);
  const validDoc = doc.length === 11 || doc.length === 14 ? doc : "";
  if (validDoc) {
    const f = await olistRequest(supabase, tenantId, "GET", `/contatos?cpfCnpj=${validDoc}&limit=1`);
    const found = f.ok ? (f.data?.itens || [])[0] : null;
    if (found?.id) {
      if (customer?.id) await supabase.from("customers").update({ olist_contact_id: found.id }).eq("id", customer.id);
      return { id: Number(found.id) };
    }
  }
  const phone = digits(order.customer_phone || customer?.phone);
  const body: any = {
    nome: norm(order.customer_name || customer?.name) || "Cliente",
    situacao: "A",
    tipoPessoa: validDoc.length === 14 ? "J" : "F",
    ...(validDoc ? { cpfCnpj: validDoc } : {}),
    ...(phone ? { celular: phone, telefone: phone } : {}),
    ...(validEmail(customer?.email) ? { email: validEmail(customer?.email) } : {}),
    endereco: {
      endereco: norm(order.customer_street || customer?.street),
      numero: norm(order.customer_number || customer?.number) || "S/N",
      complemento: norm(order.customer_complement || customer?.complement),
      bairro: norm(order.customer_neighborhood || customer?.neighborhood),
      municipio: norm(order.customer_city || customer?.city),
      cep: digits(order.customer_cep || customer?.cep),
      uf: uf(order.customer_state || customer?.state),
    },
  };
  const c = await olistRequest(supabase, tenantId, "POST", "/contatos", body);
  if (!c.ok || !c.data?.id) return { error: errText(c, "o cadastro do cliente") };
  if (customer?.id) await supabase.from("customers").update({ olist_contact_id: c.data.id }).eq("id", customer.id);
  return { id: Number(c.data.id) };
}

// ---- id do produto na Olist: vínculo salvo, senão procura pelo código ERP ----
async function resolveProductId(supabase: any, tenantId: string, item: any): Promise<number> {
  const linked = num(item.products?.olist_product_id);
  if (linked) return linked;
  const code = norm(item.products?.sku_erp || item.products?.code || item.product_code);
  if (!code) return 0;
  const r = await olistRequest(supabase, tenantId, "GET", `/produtos?codigo=${encodeURIComponent(code)}&limit=1`);
  const id = num((r.data?.itens || [])[0]?.id);
  if (id && item.product_id) await supabase.from("products").update({ olist_product_id: id }).eq("id", item.product_id).eq("tenant_id", tenantId);
  return id;
}

async function markError(supabase: any, tenantId: string, orderId: number, message: string, attempts: number) {
  await supabase.from("orders").update({
    olist_sync_status: "error",
    olist_sync_error: message.slice(0, 500),
    olist_attempts: attempts,
    olist_last_attempt_at: new Date().toISOString(),
  }).eq("id", orderId).eq("tenant_id", tenantId);
}

type SendResult = { ok: boolean; skipped?: boolean; reason?: string; olist_order_id?: number; error?: string };

async function sendOrder(supabase: any, tenantId: string, orderId: number, cfg: any): Promise<SendResult> {
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (!order) return { ok: false, error: "Pedido não encontrado" };
  if (order.olist_order_id) return { ok: true, skipped: true, reason: "ja_enviado", olist_order_id: Number(order.olist_order_id) };
  if (!order.is_paid) return { ok: false, skipped: true, reason: "nao_pago", error: "O pedido ainda não está pago" };
  if (order.is_cancelled) return { ok: false, skipped: true, reason: "cancelado", error: "O pedido está cancelado" };

  // reserva: só um envio por vez por pedido
  const { data: lock } = await supabase.from("orders")
    .update({ olist_sync_status: "processing", olist_last_attempt_at: new Date().toISOString() })
    .eq("id", orderId).eq("tenant_id", tenantId).is("olist_order_id", null)
    .or(`olist_sync_status.is.null,olist_sync_status.eq.error,olist_sync_status.eq.skipped,and(olist_sync_status.eq.processing,olist_last_attempt_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()})`)
    .select("id");
  if (!lock?.length) return { ok: true, skipped: true, reason: "em_processamento" };
  const attempts = num(order.olist_attempts) + 1;

  try {
    // itens do pedido
    let items: any[] = [];
    if (order.cart_id) {
      const { data } = await supabase.from("cart_items")
        .select("*, products:product_id(code, sku_erp, name, olist_product_id)").eq("cart_id", order.cart_id);
      items = data || [];
    }
    if (!items.length) {
      await supabase.from("orders").update({ olist_sync_status: "skipped", olist_sync_error: "Pedido sem itens", olist_attempts: attempts }).eq("id", orderId);
      return { ok: false, skipped: true, reason: "sem_itens", error: "Pedido sem itens" };
    }

    // já existe na Olist? (evita duplicar se uma tentativa anterior caiu depois de criar)
    const ecom = String(order.unique_order_id || order.id);
    const dup = await olistRequest(supabase, tenantId, "GET", `/pedidos?numeroPedidoEcommerce=${encodeURIComponent(ecom)}&limit=1`);
    const existing = dup.ok ? (dup.data?.itens || [])[0] : null;
    if (existing?.id) {
      await supabase.from("orders").update({
        olist_order_id: existing.id, olist_order_number: norm(existing.numeroPedido), olist_sync_status: "synced", olist_sync_error: null, olist_attempts: attempts,
      }).eq("id", orderId);
      return { ok: true, olist_order_id: Number(existing.id), reason: "ja_existia_na_olist" };
    }

    // produtos
    const itens: any[] = [];
    const semVinculo: string[] = [];
    for (const it of items) {
      const pid = await resolveProductId(supabase, tenantId, it);
      if (!pid) { semVinculo.push(norm(it.products?.sku_erp || it.products?.code || it.product_code || it.product_name)); continue; }
      itens.push({ produto: { id: pid, tipo: "P" }, quantidade: num(it.qty) || 1, valorUnitario: num(it.unit_price) });
    }
    if (semVinculo.length) {
      const msg = `Produto(s) sem vínculo com a Olist: ${semVinculo.join(", ")}. Importe ou vincule pelo código ERP.`;
      await markError(supabase, tenantId, orderId, msg, attempts);
      return { ok: false, error: msg };
    }

    // cliente
    const phone = digits(order.customer_phone);
    let customer: any = null;
    if (phone) {
      const { data } = await supabase.from("customers").select("*").eq("tenant_id", tenantId)
        .or(`phone.eq.${phone},phone.like.%${phone.slice(-9)}%`).limit(1).maybeSingle();
      customer = data;
    }
    const contact = await ensureContact(supabase, tenantId, order, customer);
    if (!contact.id) { await markError(supabase, tenantId, orderId, contact.error || "Não foi possível cadastrar o cliente na Olist", attempts); return { ok: false, error: contact.error }; }

    const frete = parseFreight(norm(order.observation));
    const desconto = num(order.coupon_discount);
    const payload: any = {
      idContato: contact.id,
      data: new Date(order.paid_at || order.created_at || Date.now()).toISOString().slice(0, 10),
      situacao: [0, 3, 4, 1, 7].includes(num(cfg.order_situacao)) ? num(cfg.order_situacao) : 3,
      itens,
      valorFrete: frete.valor,
      ...(desconto > 0 ? { valorDesconto: desconto } : {}),
      observacoes: `Pedido Cartzy #${order.id}${order.event_type ? ` (${order.event_type})` : ""}`,
      ecommerce: { numeroPedidoEcommerce: ecom },
      ...(cfg.deposit_id ? { deposito: { id: Number(cfg.deposit_id) } } : {}),
      enderecoEntrega: {
        endereco: norm(order.customer_street || customer?.street),
        enderecoNro: norm(order.customer_number || customer?.number) || "S/N",
        complemento: norm(order.customer_complement || customer?.complement),
        bairro: norm(order.customer_neighborhood || customer?.neighborhood),
        municipio: norm(order.customer_city || customer?.city),
        cep: digits(order.customer_cep || customer?.cep),
        uf: uf(order.customer_state || customer?.state),
        fone: phone,
        nomeDestinatario: norm(order.customer_name || customer?.name),
      },
    };
    const r = await olistRequest(supabase, tenantId, "POST", "/pedidos", payload);
    if (!r.ok || !r.data?.id) {
      const msg = errText(r, "o envio do pedido");
      await markError(supabase, tenantId, orderId, msg, attempts);
      return { ok: false, error: msg };
    }
    await supabase.from("orders").update({
      olist_order_id: r.data.id, olist_order_number: norm(r.data.numeroPedido), olist_sync_status: "synced", olist_sync_error: null,
      olist_attempts: attempts, olist_last_attempt_at: new Date().toISOString(),
    }).eq("id", orderId);
    return { ok: true, olist_order_id: Number(r.data.id) };
  } catch (e) {
    const msg = (e as Error).message || "Erro inesperado";
    await markError(supabase, tenantId, orderId, msg, attempts);
    return { ok: false, error: msg };
  }
}

// ---- nota fiscal: gera a partir do pedido e emite ----
async function issueInvoice(supabase: any, tenantId: string, orderId: number, cfg: any): Promise<{ ok: boolean; invoice_id?: number; status?: string; error?: string }> {
  const { data: order } = await supabase.from("orders").select("id, olist_order_id, olist_invoice_id, olist_invoice_status").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  if (!order?.olist_order_id) return { ok: false, error: "O pedido ainda não foi enviado à Olist" };
  if (order.olist_invoice_status === "issued") return { ok: true, invoice_id: Number(order.olist_invoice_id), status: "issued" };
  let invoiceId = num(order.olist_invoice_id);
  if (!invoiceId) {
    const model = num(cfg.invoice_model) === 65 ? 65 : 55;
    const g = await olistRequest(supabase, tenantId, "POST", `/pedidos/${order.olist_order_id}/gerar-nota-fiscal`, { modelo: model });
    if (!g.ok || !g.data?.id) {
      const msg = errText(g, "a geração da nota fiscal");
      await supabase.from("orders").update({ olist_invoice_status: "error", olist_invoice_error: msg }).eq("id", orderId);
      return { ok: false, error: msg };
    }
    invoiceId = Number(g.data.id);
    await supabase.from("orders").update({ olist_invoice_id: invoiceId, olist_invoice_status: "generated", olist_invoice_error: null }).eq("id", orderId);
  }
  const e = await olistRequest(supabase, tenantId, "POST", `/notas/${invoiceId}/emitir`, { enviarEmail: false });
  if (!e.ok) {
    const msg = errText(e, "a emissão da nota fiscal");
    await supabase.from("orders").update({ olist_invoice_status: "error", olist_invoice_error: msg }).eq("id", orderId);
    return { ok: false, invoice_id: invoiceId, error: msg };
  }
  await supabase.from("orders").update({ olist_invoice_status: "issued", olist_invoice_error: null }).eq("id", orderId);
  return { ok: true, invoice_id: invoiceId, status: "issued" };
}

// ---- rastreio de volta ----
async function syncTrackingFor(supabase: any, tenantId: string, limit = 30): Promise<{ checked: number; updated: number }> {
  const { data: orders } = await supabase.from("orders")
    .select("id, olist_order_id, melhor_envio_tracking_code")
    .eq("tenant_id", tenantId).not("olist_order_id", "is", null).is("melhor_envio_tracking_code", null)
    .or("is_cancelled.is.null,is_cancelled.eq.false").order("id", { ascending: true }).limit(limit);
  let updated = 0;
  const confirmsPostage = await erpCanConfirmPostage(supabase, tenantId);
  for (const o of orders || []) {
    const r = await olistRequest(supabase, tenantId, "GET", `/pedidos/${o.olist_order_id}`);
    await sleep(250);
    if (!r.ok) continue;
    const code = norm(r.data?.transportador?.codigoRastreamento);
    if (!code) continue;
    const situacao = num(r.data?.situacao);
    // 5 Enviada e 6 Entregue: a Olist confirma a postagem (só vale quando não há transportadora com API própria)
    const posted = confirmsPostage && (situacao === 5 || situacao === 6);
    const { error } = await supabase.from("orders").update({ melhor_envio_tracking_code: code, ...(posted ? { tracking_posted: true } : {}) }).eq("id", o.id);
    if (!error) updated++;
  }
  return { checked: orders?.length || 0, updated };
}

async function pendingOrderIds(supabase: any, tenantId: string, cfg: any, limit: number): Promise<number[]> {
  let q = supabase.from("orders").select("id")
    .eq("tenant_id", tenantId).eq("is_paid", true).is("olist_order_id", null)
    .or("is_cancelled.is.null,is_cancelled.eq.false")
    .or(`olist_sync_status.is.null,olist_sync_status.eq.error,and(olist_sync_status.eq.processing,olist_last_attempt_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()})`)
    .lt("olist_attempts", MAX_ATTEMPTS)
    .order("paid_at", { ascending: true, nullsFirst: false }).limit(limit);
  if (cfg.send_from) q = q.gte("paid_at", cfg.send_from);
  const { data } = await q;
  return (data || []).map((o: any) => Number(o.id));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = norm(body.action);

    // ---------- varredura automática (só service role) ----------
    if (action === "auto_sweep") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
      if (!token || token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ success: false, error: "Nao autorizado" }, 403);
      const started = Date.now();
      const { data: tenants } = await supabase.from("integration_olist")
        .select("tenant_id").eq("is_active", true).eq("send_orders", true).or("auto_send.eq.true,sync_tracking.eq.true,issue_invoice.eq.true").limit(50);
      const out: any[] = [];
      for (const t of tenants || []) {
        if (Date.now() - started > 100_000) break;
        const cfg = await loadSettings(supabase, t.tenant_id);
        if (!cfg?.is_active || !cfg.send_orders) continue;
        const r: any = { tenant_id: t.tenant_id, sent: 0, failed: 0, invoices: 0, tracking: 0 };
        if (cfg.auto_send) {
          for (const id of await pendingOrderIds(supabase, t.tenant_id, cfg, 10)) {
            if (Date.now() - started > 100_000) break;
            const s = await sendOrder(supabase, t.tenant_id, id, cfg);
            if (s.ok && !s.skipped) r.sent++; else if (!s.ok && !s.skipped) r.failed++;
            await sleep(400);
          }
        }
        if (cfg.issue_invoice) {
          const { data: need } = await supabase.from("orders").select("id").eq("tenant_id", t.tenant_id)
            .not("olist_order_id", "is", null).or("olist_invoice_status.is.null,olist_invoice_status.eq.generated").limit(5);
          for (const o of need || []) {
            const i = await issueInvoice(supabase, t.tenant_id, o.id, cfg);
            if (i.ok) r.invoices++;
            await sleep(400);
          }
        }
        if (cfg.sync_tracking) r.tracking = (await syncTrackingFor(supabase, t.tenant_id, 20)).updated;
        out.push(r);
      }
      console.log("[olist-orders] auto_sweep", JSON.stringify(out));
      return json({ success: true, tenants: out });
    }

    const tenantId = norm(body.tenant_id);
    if (!tenantId) return json({ success: false, error: "tenant_id é obrigatório" }, 400);
    const guard = await authorizeTenantCaller(req, supabase, tenantId);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

    const cfg = await loadSettings(supabase, tenantId);
    if (!cfg?.is_active) return json({ success: false, error: "A Olist não está conectada para esta empresa. Autorize em Integrações > Olist ERP." });

    if (action === "settings") return json({ success: true, settings: cfg });

    if (action === "save_settings") {
      const s = body.settings || {};
      const patch: any = {};
      for (const k of ["send_orders", "auto_send", "issue_invoice", "sync_tracking"]) if (typeof s[k] === "boolean") patch[k] = s[k];
      if (s.invoice_model !== undefined) patch.invoice_model = num(s.invoice_model) === 65 ? 65 : 55;
      if (s.order_situacao !== undefined) patch.order_situacao = [0, 3, 4, 1, 7].includes(num(s.order_situacao)) ? num(s.order_situacao) : 3;
      // ao ligar o envio automático pela primeira vez, só pedidos pagos daqui para frente (não sobe o histórico sem querer)
      if (patch.auto_send === true && !cfg.auto_send && !cfg.send_from) patch.send_from = new Date().toISOString();
      if (body.send_history === true) patch.send_from = null;
      if (patch.send_orders === false) patch.auto_send = false;
      if (patch.auto_send === true && !(patch.send_orders ?? cfg.send_orders)) patch.send_orders = true;
      const { error } = await supabase.from("integration_olist").update(patch).eq("tenant_id", tenantId);
      if (error) return json({ success: false, error: "Não foi possível salvar" });
      return json({ success: true, settings: await loadSettings(supabase, tenantId) });
    }

    if (action === "status") {
      const base = () => supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      const [pend, sent, err] = await Promise.all([
        base().eq("is_paid", true).is("olist_order_id", null).or("is_cancelled.is.null,is_cancelled.eq.false"),
        base().not("olist_order_id", "is", null),
        base().eq("olist_sync_status", "error"),
      ]);
      const { data: errors } = await supabase.from("orders").select("id, olist_sync_error").eq("tenant_id", tenantId)
        .eq("olist_sync_status", "error").order("olist_last_attempt_at", { ascending: false }).limit(5);
      return json({ success: true, pending: pend.count || 0, sent: sent.count || 0, errors_count: err.count || 0, errors: errors || [] });
    }

    if (!cfg.send_orders) return json({ success: false, error: "O envio de pedidos à Olist está desligado. Ligue em Integrações > Olist ERP > Pedidos." });

    if (action === "send_order") {
      const id = num(body.order_id);
      if (!id) return json({ success: false, error: "order_id é obrigatório" }, 400);
      const r = await sendOrder(supabase, tenantId, id, cfg);
      let invoice: any = null;
      if (r.ok && !r.skipped && cfg.issue_invoice) invoice = await issueInvoice(supabase, tenantId, id, cfg);
      return json({ success: r.ok, ...r, invoice });
    }

    if (action === "send_pending") {
      const ids = await pendingOrderIds(supabase, tenantId, { ...cfg, send_from: body.include_history ? null : cfg.send_from }, 15);
      let sent = 0, failed = 0; const errors: string[] = [];
      for (const id of ids) {
        const r = await sendOrder(supabase, tenantId, id, cfg);
        if (r.ok && !r.skipped) { sent++; if (cfg.issue_invoice) await issueInvoice(supabase, tenantId, id, cfg); }
        else if (!r.ok && !r.skipped) { failed++; if (r.error) errors.push(`#${id}: ${r.error}`); }
        await sleep(400);
      }
      return json({ success: true, found: ids.length, sent, failed, errors: errors.slice(0, 5) });
    }

    if (action === "invoice") {
      const id = num(body.order_id);
      if (!id) return json({ success: false, error: "order_id é obrigatório" }, 400);
      const r = await issueInvoice(supabase, tenantId, id, cfg);
      return json({ success: r.ok, ...r });
    }

    if (action === "sync_tracking") {
      const r = await syncTrackingFor(supabase, tenantId, 40);
      return json({ success: true, ...r });
    }

    return json({ success: false, error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[olist-orders]", (e as Error).message);
    return json({ success: false, error: "Erro interno" }, 500);
  }
});
