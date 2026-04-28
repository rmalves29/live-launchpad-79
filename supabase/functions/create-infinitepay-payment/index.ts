// Edge Function: create-infinitepay-payment
// Gera link de checkout do InfinitePay para um (ou vários) pedido(s).
// Atualiza endereço/frete dos pedidos antes de gerar o link, igual create-payment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePixDiscount } from "../_shared/pix-discount.ts";

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
  const appBaseUrl = Deno.env.get("PUBLIC_APP_URL") || requestOrigin || "https://app.orderzaps.com";

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
          `[create-infinitepay-payment] PIX discount override: incoming=${incoming.toFixed(2)} → server=${resolved.value.toFixed(2)} (source=${resolved.source})`,
        );
      }
      body.pix_discount = resolved.value;
    }

    const pixDiscountValue = toNumber(body.pix_discount, 0);
    const couponDiscountValue = toNumber(body.coupon_discount, 0);
    const shippingValue = toNumber(body.shippingCost, 0);

    for (const orderId of orderIds) {
      const { data: existingOrder } = await sb
        .from("orders")
        .select("id, observation, cart_id")
        .eq("id", orderId)
        .single();
      if (!existingOrder) continue;

      const cleaned = (existingOrder.observation ?? "")
        .toString()
        .replace(/\n?\[FRETE\][^\n]*/g, "")
        .replace(/\n?\[PIX_DISCOUNT\][^\n]*/g, "")
        .replace(/\n?\[COUPON_DISCOUNT\][^\n]*/g, "")
        .replace(/\n?\[MERGE\][^\n]*/g, "")
        .trim();

      const pixNote = pixDiscountValue > 0 ? `[PIX_DISCOUNT] R$ ${pixDiscountValue.toFixed(2)}` : "";
      const couponNote = couponDiscountValue > 0
        ? `[COUPON_DISCOUNT] R$ ${couponDiscountValue.toFixed(2)}${body.coupon_code ? ` (${body.coupon_code})` : ""}`
        : "";
      const mergeNote = body.merge_observation ? `[MERGE] ${body.merge_observation}` : "";
      const nextObs = [cleaned, freightNote, pixNote, couponNote, mergeNote].filter(Boolean).join("\n");

      let productsTotal = 0;
      if (existingOrder.cart_id) {
        const { data: cartItems } = await sb
          .from("cart_items")
          .select("unit_price, qty")
          .eq("cart_id", existingOrder.cart_id);
        if (cartItems?.length) {
          productsTotal = cartItems.reduce((sum, it) => sum + Number(it.unit_price) * Number(it.qty), 0);
        }
      }
      if (productsTotal === 0) {
        productsTotal = body.cartItems.reduce((s, it) => s + it.unit_price * it.qty, 0);
      }
      const newTotal = Math.max(0, productsTotal - pixDiscountValue - couponDiscountValue) + shippingValue;
      const shippingServiceId = body.shippingData?.service_id ? Number(body.shippingData.service_id) : null;

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
          total_amount: newTotal,
          shipping_service_id: shippingServiceId,
        })
        .eq("id", orderId);
    }

    // 4) Montar itens para o InfinitePay (valores em CENTAVOS)
    // Distribuir desconto PIX + cupom proporcionalmente entre os produtos
    const productItems = body.cartItems
      .filter((it) => Number(it.unit_price) > 0)
      .map((it) => ({
        description: it.product_name || it.product_code || "Produto",
        quantity: it.qty,
        price: Math.round(Number(it.unit_price) * 100), // centavos
      }));

    const totalDiscountCents = Math.round((pixDiscountValue + couponDiscountValue) * 100);
    if (totalDiscountCents > 0 && productItems.length > 0) {
      const productsTotalCents = productItems.reduce((s, it) => s + it.price * it.quantity, 0);
      if (productsTotalCents > 0) {
        let remaining = totalDiscountCents;
        for (let i = 0; i < productItems.length; i++) {
          const item = productItems[i];
          const itemTotal = item.price * item.quantity;
          const isLast = i === productItems.length - 1;
          const itemDiscount = isLast
            ? remaining
            : Math.round((itemTotal / productsTotalCents) * totalDiscountCents);
          const perUnit = Math.floor(itemDiscount / item.quantity);
          item.price = Math.max(1, item.price - perUnit);
          remaining -= perUnit * item.quantity;
        }
      }
    }

    // Adicionar frete como item
    if (shippingValue > 0) {
      productItems.push({
        description: "Frete",
        quantity: 1,
        price: Math.round(shippingValue * 100),
      });
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
