// Edge Function: backfill-payment-methods
// Percorre pedidos pagos (is_paid=true) sem payment_method preenchido
// e tenta recuperar a forma de pagamento + parcelas via API do
// Mercado Pago e Pagar.me, atualizando os registros.
//
// Uso (POST):
//   { "tenant_id": "uuid-opcional", "limit": 200, "dry_run": false }
//
// Se tenant_id for omitido, processa todos os tenants.
// dry_run=true apenas reporta o que seria atualizado, sem gravar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ResolvedPayment = {
  method: string;
  installments: number;
  source: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const tenantFilter: string | null = body.tenant_id || null;
  const limit: number = Math.min(Number(body.limit) || 200, 1000);
  const dryRun: boolean = !!body.dry_run;

  console.log(`[backfill-payment-methods] start tenant=${tenantFilter || "ALL"} limit=${limit} dry_run=${dryRun}`);

  // 1. Buscar pedidos elegíveis
  let q = sb
    .from("orders")
    .select("id, tenant_id, payment_link, observation, total_amount, created_at")
    .eq("is_paid", true)
    .is("payment_method", null)
    .order("id", { ascending: false })
    .limit(limit);
  if (tenantFilter) q = q.eq("tenant_id", tenantFilter);

  const { data: orders, error: ordersErr } = await q;
  if (ordersErr) {
    return new Response(JSON.stringify({ error: ordersErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!orders || orders.length === 0) {
    return new Response(JSON.stringify({ status: "ok", processed: 0, message: "Nenhum pedido elegível" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Cache de tokens por tenant
  const mpTokenCache = new Map<string, string | null>();
  const pagarmeKeyCache = new Map<string, string | null>();

  async function getMpToken(tenantId: string): Promise<string | null> {
    if (mpTokenCache.has(tenantId)) return mpTokenCache.get(tenantId)!;
    const { data } = await sb
      .from("integration_mp")
      .select("access_token, is_active")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const token = data?.access_token || Deno.env.get("MP_ACCESS_TOKEN") || null;
    mpTokenCache.set(tenantId, token);
    return token;
  }

  async function getPagarmeKey(tenantId: string): Promise<string | null> {
    if (pagarmeKeyCache.has(tenantId)) return pagarmeKeyCache.get(tenantId)!;
    const { data } = await sb
      .from("integration_pagarme")
      .select("api_key, is_active")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const key = data?.api_key || null;
    pagarmeKeyCache.set(tenantId, key);
    return key;
  }

  const results: any[] = [];
  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const order of orders) {
    try {
      const isPagarme = (order.payment_link || "").includes("pagar.me") ||
                        (order.payment_link || "").includes("pagarme");
      const isMp = (order.payment_link || "").includes("mercadopago") ||
                   (order.payment_link || "").includes("mpago") ||
                   (order.payment_link || "").includes("mercadolibre");

      let resolved: ResolvedPayment | null = null;

      // Tentar Pagar.me primeiro se o link for de Pagar.me
      if (isPagarme && order.tenant_id) {
        const key = await getPagarmeKey(order.tenant_id);
        if (key) resolved = await resolveFromPagarme(order, key);
      }

      // Caso contrário (ou se Pagar.me falhou), tentar MP
      if (!resolved && order.tenant_id) {
        const token = await getMpToken(order.tenant_id);
        if (token) resolved = await resolveFromMP(order, token);
      }

      // Última tentativa: Pagar.me se ainda não tentou
      if (!resolved && !isPagarme && order.tenant_id) {
        const key = await getPagarmeKey(order.tenant_id);
        if (key) resolved = await resolveFromPagarme(order, key);
      }

      if (resolved) {
        if (!dryRun) {
          const { error: updErr } = await sb
            .from("orders")
            .update({
              payment_method: resolved.method,
              payment_installments: resolved.installments,
            })
            .eq("id", order.id);
          if (updErr) {
            errors++;
            results.push({ order_id: order.id, status: "error", error: updErr.message });
            continue;
          }
        }
        updated++;
        results.push({
          order_id: order.id,
          status: dryRun ? "would_update" : "updated",
          method: resolved.method,
          installments: resolved.installments,
          source: resolved.source,
        });
      } else {
        notFound++;
        results.push({ order_id: order.id, status: "not_found" });
      }
    } catch (e) {
      errors++;
      results.push({ order_id: order.id, status: "exception", error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`[backfill-payment-methods] done updated=${updated} not_found=${notFound} errors=${errors}`);

  return new Response(
    JSON.stringify({
      status: "ok",
      total_processed: orders.length,
      updated,
      not_found: notFound,
      errors,
      dry_run: dryRun,
      details: results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// ============================================================
// Mercado Pago resolver
// ============================================================
async function resolveFromMP(order: any, accessToken: string): Promise<ResolvedPayment | null> {
  const externalRef = `tenant:${order.tenant_id};orders:${order.id}`;

  // Buscar pagamentos por external_reference
  try {
    const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalRef)}&sort=date_created&criteria=desc&limit=20`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const json = await r.json();
    const payments = json?.results || [];

    // Pegar o primeiro pagamento aprovado
    const approved = payments.find((p: any) => p.status === "approved");
    const target = approved || payments[0];
    if (!target) return null;

    return {
      method: normalizeMpMethod(target),
      installments: Number(target.installments) || 1,
      source: "mp_search",
    };
  } catch (e) {
    console.error(`[backfill] MP error for order ${order.id}:`, e);
    return null;
  }
}

function normalizeMpMethod(payment: any): string {
  const type = String(payment.payment_type_id || "").toLowerCase();
  const method = String(payment.payment_method_id || "").toLowerCase();
  if (type === "ticket" || method === "bolbradesco") return "boleto";
  if (type === "bank_transfer" && method === "pix") return "pix";
  if (method === "pix") return "pix";
  return type || method || "other";
}

// ============================================================
// Pagar.me resolver
// ============================================================
async function resolveFromPagarme(order: any, apiKey: string): Promise<ResolvedPayment | null> {
  // Extrair order_id do Pagar.me a partir do payment_link
  // Ex: https://api.pagar.me/checkout/v1/orders/or_xxxxx
  const link = order.payment_link || "";
  const orderIdMatch = link.match(/(or_[A-Za-z0-9]+)/);
  const checkoutMatch = link.match(/(ch_[A-Za-z0-9]+|chec_[A-Za-z0-9]+)/);

  const auth = "Basic " + btoa(`${apiKey}:`);

  // Se temos order_id direto, buscar o pedido
  if (orderIdMatch) {
    try {
      const r = await fetch(`https://api.pagar.me/core/v5/orders/${orderIdMatch[1]}`, {
        headers: { Authorization: auth },
      });
      if (r.ok) {
        const j = await r.json();
        const charge = j?.charges?.[0];
        if (charge && charge.status === "paid") {
          return {
            method: normalizePagarmeMethod(charge),
            installments: Number(charge?.last_transaction?.installments) || 1,
            source: "pagarme_order",
          };
        }
      }
    } catch (e) {
      console.error(`[backfill] Pagar.me order error for order ${order.id}:`, e);
    }
  }

  // Tentativa por external_reference (code) via search de orders
  try {
    const code = `tenant:${order.tenant_id};orders:${order.id}`;
    const r = await fetch(`https://api.pagar.me/core/v5/orders?code=${encodeURIComponent(code)}&size=10`, {
      headers: { Authorization: auth },
    });
    if (r.ok) {
      const j = await r.json();
      const ord = (j?.data || []).find((o: any) => o.charges?.some((c: any) => c.status === "paid"));
      const charge = ord?.charges?.find((c: any) => c.status === "paid");
      if (charge) {
        return {
          method: normalizePagarmeMethod(charge),
          installments: Number(charge?.last_transaction?.installments) || 1,
          source: "pagarme_search",
        };
      }
    }
  } catch (e) {
    console.error(`[backfill] Pagar.me search error for order ${order.id}:`, e);
  }

  return null;
}

function normalizePagarmeMethod(charge: any): string {
  const t = String(
    charge?.last_transaction?.transaction_type ||
      charge?.payment_method ||
      "",
  ).toLowerCase();
  if (t === "voucher") return "other";
  return t || "other";
}
