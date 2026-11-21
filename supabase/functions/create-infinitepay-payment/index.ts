// Edge Function: create-infinitepay-payment
// Gera link de checkout do InfinitePay para um (ou vários) pedido(s).
// Atualiza endereço/frete dos pedidos antes de gerar o link, igual create-payment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePixDiscount } from "../_shared/pix-discount.ts";
import { carregarPedidosParaCobranca, calcularDescontoDoServidor, repartirCobranca, itensDaCobranca } from "../_shared/cobranca-pedidos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CartItem = {
  product_name: string;
  product_code: string;
  qty: number;
  unit_price: number;
};

type AddressData = {
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ShippingData = {
  service_id: string;
  service_name: string;
  company_name: string;
  price: number;
  delivery_time: string;
} | null;

type Body = {
  tenant_id: string;
  tenant_slug?: string;
  order_id: number;
  order_ids?: number[];
  cartItems: CartItem[];
  customerData: { name: string; phone: string; cpf?: string; email?: string };
  addressData: AddressData;
  shippingCost: number;
  shippingData: ShippingData;
  total: string;
  coupon_discount?: number;
  coupon_code?: string | null;
  merge_observation?: string | null;
  payment_method?: string | null;
  pix_discount?: number;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function toNumber(n: unknown, fallback = 0) {
  const v = typeof n === "string" ? Number(n) : typeof n === "number" ? n : NaN;
  return Number.isFinite(v) ? v : fallback;
}

function buildFreightNote(shipping: ShippingData, shippingCost: number) {
  if (!shipping || !shipping.service_name) return "[FRETE] Retirada";
  const price = toNumber(shipping.price, shippingCost);
  const prazo = shipping.delivery_time ? ` | Prazo: ${shipping.delivery_time}` : "";
  return `[FRETE] ${shipping.company_name || "Transportadora"} - ${shipping.service_name} | R$ ${price.toFixed(2)}${prazo}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestOrigin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "";
  const appBaseUrl = (Deno.env.get("PUBLIC_APP_URL") || requestOrigin || "https://app.cartzy.com.br").trim().replace(/\/+$/, "");

  try {
    const body = (await req.json()) as Body;

    if (!body?.tenant_id || !isUuid(body.tenant_id)) {
      return new Response(JSON.stringify({ error: "tenant_id inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(body.cartItems) || body.cartItems.length === 0) {
      return new Response(JSON.stringify({ error: "cartItems obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // 1) Buscar integração InfinitePay
    const { data: integration } = await sb
      .from("integration_infinitepay")
      .select("handle, environment, is_active, pix_discount_percent")
      .eq("tenant_id", body.tenant_id)
      .maybeSingle();

    if (!integration?.is_active || !integration?.handle) {
      return new Response(
        JSON.stringify({ error: "Integração InfinitePay não está ativa ou handle não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sanitiza o handle: remove @, $, espaços e qualquer sufixo após "/" (links fixos)
    const handle = String(integration.handle)
      .trim()
      .replace(/^[@$]+/, "")
      .split("/")[0]
      .trim();

    // 2) Persistir cliente (best-effort)
    await sb.from("customers").upsert(
      {
        tenant_id: body.tenant_id,
        phone: body.customerData.phone,
        name: body.customerData.name,
        cpf: body.customerData.cpf ?? null,
        email: body.customerData.email ?? null,
        cep: body.addressData.cep,
        street: body.addressData.street,
        number: body.addressData.number,
        complement: body.addressData.complement ?? null,
        neighborhood: body.addressData.neighborhood,
        city: body.addressData.city,
        state: body.addressData.state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,phone" },
    );

    // 3) Persistir endereço + frete + descontos no(s) pedido(s)
    const orderIds = (body.order_ids?.length ? body.order_ids : [body.order_id]).filter(Boolean);
    const freightNote = buildFreightNote(body.shippingData, body.shippingCost);

    // === BLINDAGEM SERVIDOR: recalcular desconto PIX (fonte de verdade) ===
    let pixDiscountPercent = 0;
    {
      const productsSubtotalForDiscount = body.cartItems.reduce(
        (s, it) => s + Number(it.unit_price) * Number(it.qty),
        0,
      );
      const resolved = await resolvePixDiscount(
        sb,
        body.tenant_id,
        body.payment_method,
        productsSubtotalForDiscount,
      );
      const incoming = toNumber(body.pix_discount, 0);
      if (Math.abs(incoming - resolved.value) > 0.01) {
        console.log(
          `[create-infinitepay-payment] PIX discount override: incoming=${incoming.toFixed(2)} → server=${resolved.value.toFixed(2)} (source=${resolved.source}, percent=${resolved.percent})`,
        );
      }
      body.pix_discount = resolved.value;
      pixDiscountPercent = resolved.percent;
    }

    // Fase 1 (21/11/2026): a mesma conta da create-payment, feita aqui no servidor com dados do banco
    // (_shared/cobranca-pedidos.ts). Esta função também é chamada direto pela internet, então o desconto enviado
    // no corpo da chamada é ignorado — antes dava para pagar menos mandando qualquer valor.
    const shippingValue = toNumber(body.shippingCost, 0);
    const orderCtxs = await carregarPedidosParaCobranca(sb, orderIds);
    const fallbackPayloadSubtotal = body.cartItems.reduce((s, it) => s + it.unit_price * it.qty, 0);
    const desconto = await calcularDescontoDoServidor(sb, { tenantId: body.tenant_id, pedidos: orderCtxs, codigoEnviado: body.coupon_code });
    const enviado = toNumber(body.coupon_discount, 0);
    if (Math.abs(enviado - desconto.valor) > 0.01) {
      console.log(`[create-infinitepay-payment] desconto enviado=${enviado.toFixed(2)} ignorado; servidor=${desconto.valor.toFixed(2)} (${desconto.origem}, código=${desconto.codigo ?? "-"})`);
    }
    const parcelas = repartirCobranca({
      pedidos: orderCtxs, desconto: desconto.valor, elegiveis: desconto.elegiveis,
      pixPercent: pixDiscountPercent, frete: shippingValue, subtotalReserva: fallbackPayloadSubtotal,
    });

    for (let i = 0; i < orderCtxs.length; i++) {
      const ctx = orderCtxs[i];
      const parcela = parcelas[i];
      const cleaned = (ctx.observation ?? "")
        .toString()
        .replace(/\n?\[FRETE\][^\n]*/g, "")
        .replace(/\n?\[PIX_DISCOUNT\][^\n]*/g, "")
        .replace(/\n?\[COUPON_DISCOUNT\][^\n]*/g, "")
        .replace(/\n?\[MERGE\][^\n]*/g, "")
        .trim();

      const isFirst = i === 0;
      const freightNoteForThisOrder = isFirst ? freightNote : "";
      const pixNote = parcela.pix > 0 ? `[PIX_DISCOUNT] R$ ${parcela.pix.toFixed(2)}` : "";
      const couponNote = parcela.cupom > 0
        ? `[COUPON_DISCOUNT] R$ ${parcela.cupom.toFixed(2)}${desconto.codigo ? ` (${desconto.codigo})` : ""}`
        : "";
      const mergeNote = body.merge_observation ? `[MERGE] ${body.merge_observation}` : "";
      const nextObs = [cleaned, freightNoteForThisOrder, pixNote, couponNote, mergeNote].filter(Boolean).join("\n");
      const shippingServiceId = body.shippingData?.service_id ? Number(body.shippingData.service_id) : null;
      const shippingProvider = typeof body.shippingData?.provider === "string" && body.shippingData.provider ? body.shippingData.provider : null;

      console.log(`[create-infinitepay-payment] Order ${ctx.id} (${isFirst ? "FIRST" : "merged"}): products=${parcela.produtos.toFixed(2)}, pixShare=${parcela.pix.toFixed(2)} (percent=${pixDiscountPercent}), couponShare=${parcela.cupom.toFixed(2)}, freight=${parcela.frete.toFixed(2)}, total=${parcela.total.toFixed(2)}`);

      await sb
        .from("orders")
        .update({
          customer_name: body.customerData.name,
          customer_cep: body.addressData.cep,
          customer_street: body.addressData.street,
          customer_number: body.addressData.number,
          customer_complement: body.addressData.complement ?? null,
          customer_neighborhood: body.addressData.neighborhood ?? null,
          customer_city: body.addressData.city,
          customer_state: body.addressData.state,
          observation: nextObs,
          total_amount: parcela.total,
          coupon_discount: parcela.cupom,
          coupon_code: parcela.cupom > 0 ? desconto.codigo : null,
          shipping_service_id: shippingServiceId,
          shipping_provider: shippingProvider,
        })
        .eq("id", ctx.id);
    }

    // 4) Itens para o InfinitePay (CENTAVOS): desconto repartido pelo servidor, soma exata = total dos pedidos.
    // InfinitePay limita a descrição do item a 128 caracteres — truncamos com segurança
    const truncateDesc = (s: string) => {
      const clean = (s || "").toString().trim();
      if (clean.length <= 128) return clean;
      return clean.slice(0, 125).trimEnd() + "...";
    };
    const cobranca = itensDaCobranca(orderCtxs, parcelas, body.cartItems);
    const productItems = cobranca.produtos.map((l) => ({ description: truncateDesc(l.nome), quantity: l.qtd, price: l.centavos }));
    if (cobranca.freteCentavos > 0) {
      productItems.push({ description: "Frete", quantity: 1, price: cobranca.freteCentavos });
    }

    // 5) Gerar order_nsu único (defesa contra spoofing — handle é público)
    const orderNsu = `ozp-${body.tenant_id.slice(0, 8)}-${orderIds.join("-")}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const tenantParam = body.tenant_slug ? `&tenant=${body.tenant_slug}` : "";
    const redirectUrl = `${appBaseUrl}/pagamento/retorno?status=success&provider=infinitepay${tenantParam}&order_nsu=${orderNsu}`;
    const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook?tenant_id=${body.tenant_id}&order_nsu=${orderNsu}`;

    // 6) Chamar API do InfinitePay
    // IMPORTANTE: NÃO enviar e-mail "fake" (@checkout.local) — a InfinitePay valida
    // o domínio na hora de criar a transação e bloqueia o pagamento ("Algo deu errado").
    // Se o cliente não tem e-mail real, omitimos o campo (a API aceita).
    // CPF deve ser enviado em `customer.cpf` quando disponível (obrigatório p/ Pix).
    const customerPayload: Record<string, unknown> = {
      name: body.customerData.name,
      phone_number: body.customerData.phone,
    };
    const customerEmail = (body.customerData.email || "").trim();
    const isRealEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) &&
      !customerEmail.endsWith("@checkout.local");
    if (isRealEmail) {
      customerPayload.email = customerEmail;
    }
    const customerCpf = (body.customerData.cpf || "").replace(/\D/g, "");
    if (customerCpf.length === 11) {
      customerPayload.cpf = customerCpf;
      customerPayload.tax_id = customerCpf;
    }

    const infBody: Record<string, unknown> = {
      handle,
      order_nsu: orderNsu,
      redirect_url: redirectUrl,
      webhook_url: webhookUrl,
      items: productItems,
      customer: customerPayload,
    };

    if (body.addressData?.cep) {
      infBody.address = {
        zip_code: body.addressData.cep.replace(/\D/g, ""),
        street: body.addressData.street,
        number: body.addressData.number,
        complement: body.addressData.complement || "",
        district: body.addressData.neighborhood,
        city: body.addressData.city,
        state: body.addressData.state,
      };
    }

    console.log(
      "[create-infinitepay-payment] Creating link for handle:",
      handle,
      "order_nsu:",
      orderNsu,
      "email_sent:",
      isRealEmail ? "yes" : "no",
      "cpf_sent:",
      customerCpf.length === 11 ? "yes" : "no",
      "items_count:",
      productItems.length,
      "total_cents:",
      productItems.reduce((s, it) => s + it.price * it.quantity, 0),
    );

    const infRes = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(infBody),
    });

    const contentType = infRes.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await infRes.text();
      console.error("[create-infinitepay-payment] Resposta não-JSON:", text.slice(0, 300));
      return new Response(
        JSON.stringify({
          error: "InfinitePay retornou resposta inválida. Verifique se o handle (InfiniteTag) está correto.",
          details: `Status ${infRes.status}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const infJson = await infRes.json();
    const checkoutUrlFromApi: string | undefined = infJson?.url || infJson?.link;
    if (!infRes.ok || !checkoutUrlFromApi) {
      console.error("[create-infinitepay-payment] Erro InfinitePay:", infJson);
      return new Response(
        JSON.stringify({
          error: infJson?.message || infJson?.error || "Erro ao criar link de pagamento no InfinitePay. Verifique sua InfiniteTag.",
          details: infJson,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // IMPORTANTE: não adicionar query params ao link retornado pela InfinitePay.
    // O parâmetro `lenc` é assinado pela própria InfinitePay; parâmetros extras
    // como `payment_method=pix` podem invalidar/bloquear o checkout.
    const checkoutUrl: string = checkoutUrlFromApi;

    // 7) Salvar payment_link e order_nsu (no campo payment_link com sufixo)
    await sb
      .from("orders")
      .update({ payment_link: `${checkoutUrl}#nsu=${orderNsu}` })
      .in("id", orderIds);


    return new Response(
      JSON.stringify({
        init_point: checkoutUrl,
        provider: "infinitepay",
        order_nsu: orderNsu,
        slug: infJson.slug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[create-infinitepay-payment] Erro inesperado:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
