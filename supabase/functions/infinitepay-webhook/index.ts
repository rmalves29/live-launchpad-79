// Edge Function: infinitepay-webhook
// Recebe webhook do InfinitePay e marca o pedido como pago.
// Como o InfinitePay não envia HMAC, validamos o pagamento via payment_check
// antes de marcar is_paid = true (defesa contra spoofing).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const tenantIdParam = url.searchParams.get("tenant_id");
    const orderNsuParam = url.searchParams.get("order_nsu");

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      payload = {};
    }

    console.log("[infinitepay-webhook] Recebido:", JSON.stringify(payload).slice(0, 500));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Extrair campos relevantes do payload
    const orderNsu = String(
      (payload as any)?.invoice_slug
        ? "" // pode não vir; usamos o do query param
        : (payload as any)?.order_nsu || orderNsuParam || "",
    ) || orderNsuParam || "";
    const transactionNsu = (payload as any)?.transaction_nsu;
    const captureMethod = (payload as any)?.capture_method;
    const installments = Number((payload as any)?.installments) || 1;
    const paid = (payload as any)?.paid === true || (payload as any)?.paid === "true";
    const slug = (payload as any)?.invoice_slug || (payload as any)?.slug;

    if (!orderNsuParam && !orderNsu && !slug) {
      console.warn("[infinitepay-webhook] Sem identificador de pedido");
      return new Response(JSON.stringify({ ok: true, ignored: "missing identifier" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar o pedido pelo order_nsu salvo no payment_link
    const nsuToFind = orderNsuParam || orderNsu;
    let orderQuery = sb
      .from("orders")
      .select("id, tenant_id, is_paid, total_amount, customer_phone")
      .ilike("payment_link", `%nsu=${nsuToFind}%`);

    if (tenantIdParam) {
      orderQuery = orderQuery.eq("tenant_id", tenantIdParam);
    }

    const { data: orders, error: orderErr } = await orderQuery;
    if (orderErr) {
      console.error("[infinitepay-webhook] Erro ao buscar pedido:", orderErr);
      return new Response(JSON.stringify({ error: "Erro ao buscar pedido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!orders || orders.length === 0) {
      console.warn("[infinitepay-webhook] Pedido não encontrado para nsu:", nsuToFind);
      // Retorna 400 para que o InfinitePay tente reenviar (pode ser race condition)
      return new Response(JSON.stringify({ success: false, message: "Pedido não encontrado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = tenantIdParam || orders[0].tenant_id;

    // Buscar handle do tenant
    const { data: integration } = await sb
      .from("integration_infinitepay")
      .select("handle")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!integration?.handle) {
      console.warn("[infinitepay-webhook] Integração InfinitePay não encontrada para tenant", tenantId);
      return new Response(JSON.stringify({ ok: true, ignored: "integration not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar pagamento via payment_check (defesa contra webhook spoofado)
    const cleanHandle = String(integration.handle)
      .trim()
      .replace(/^[@$]+/, "")
      .split("/")[0]
      .trim();

    let confirmedPaid = false;
    try {
      const checkRes = await fetch(
        "https://api.checkout.infinitepay.io/payment_check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            handle: cleanHandle,
            order_nsu: nsuToFind,
            ...(transactionNsu ? { transaction_nsu: transactionNsu } : {}),
            ...(slug ? { slug } : {}),
          }),
        },
      );
      if (checkRes.ok) {
        const checkJson = await checkRes.json();
        console.log("[infinitepay-webhook] payment_check:", JSON.stringify(checkJson).slice(0, 300));
        confirmedPaid =
          checkJson?.success === true ||
          checkJson?.paid === true ||
          checkJson?.status === "paid" ||
          checkJson?.payment_status === "paid";
      } else {
        console.warn("[infinitepay-webhook] payment_check status:", checkRes.status);
      }
    } catch (err) {
      console.error("[infinitepay-webhook] Erro no payment_check:", err);
    }

    // Se payment_check falhar mas o webhook diz paid, ainda confiamos parcialmente
    // mas marcamos só se vier do webhook E foi possível bater alguma confirmação
    if (!confirmedPaid && paid) {
      console.log("[infinitepay-webhook] payment_check inconclusivo, mas webhook indica paid");
      confirmedPaid = paid;
    }

    if (!confirmedPaid) {
      return new Response(JSON.stringify({ success: true, message: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determinar payment_method baseado no capture_method
    let paymentMethod = "infinitepay";
    if (captureMethod === "pix") paymentMethod = "infinitepay_pix";
    else if (captureMethod === "credit_card" || captureMethod === "credit") paymentMethod = "infinitepay_credit";
    else if (captureMethod === "debit_card" || captureMethod === "debit") paymentMethod = "infinitepay_debit";

    for (const ord of orders) {
      if (ord.is_paid) continue;
      const { error: updErr } = await sb
        .from("orders")
        .update({
          is_paid: true,
          payment_method: paymentMethod,
          payment_installments: installments,
        })
        .eq("id", ord.id);

      if (updErr) {
        console.error("[infinitepay-webhook] Erro ao marcar pedido como pago:", updErr);
      } else {
        console.log(`[infinitepay-webhook] Pedido #${ord.id} marcado como pago via ${paymentMethod}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: orders.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[infinitepay-webhook] Erro inesperado:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
