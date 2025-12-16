import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type CreatePaymentRequest = {
  tenant_id: string;
  order_id: number;
  order_ids?: number[];
  cartItems: CartItem[];
  customerData: {
    name: string;
    phone: string;
  };
  addressData: AddressData;
  shippingCost: number;
  shippingData: ShippingData;
  total: string;
  coupon_discount?: number;
  coupon_code?: string | null;
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

function validate(body: any): { ok: true; data: CreatePaymentRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body inválido" };
  if (!body.tenant_id || typeof body.tenant_id !== "string" || !isUuid(body.tenant_id)) {
    return { ok: false, error: "tenant_id inválido" };
  }
  const orderId = typeof body.order_id === "string" ? Number(body.order_id) : body.order_id;
  if (!Number.isFinite(orderId)) return { ok: false, error: "order_id inválido" };

  if (!Array.isArray(body.cartItems) || body.cartItems.length === 0) {
    return { ok: false, error: "cartItems obrigatório" };
  }

  const cd = body.customerData;
  if (!cd || typeof cd !== "object" || typeof cd.name !== "string" || cd.name.trim().length < 2) {
    return { ok: false, error: "customerData.name inválido" };
  }
  if (typeof cd.phone !== "string" || cd.phone.replace(/\D/g, "").length < 10) {
    return { ok: false, error: "customerData.phone inválido" };
  }

  const ad = body.addressData;
  if (!ad || typeof ad !== "object") return { ok: false, error: "addressData inválido" };
  const required = ["cep", "street", "number", "neighborhood", "city", "state"] as const;
  for (const k of required) {
    if (typeof ad[k] !== "string" || ad[k].trim().length === 0) {
      return { ok: false, error: `addressData.${k} obrigatório` };
    }
  }

  return {
    ok: true,
    data: {
      tenant_id: body.tenant_id,
      order_id: orderId,
      order_ids: Array.isArray(body.order_ids) ? body.order_ids.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x)) : undefined,
      cartItems: body.cartItems.map((it: any) => ({
        product_name: String(it.product_name ?? "").slice(0, 200),
        product_code: String(it.product_code ?? "").slice(0, 50),
        qty: Math.max(1, Math.floor(toNumber(it.qty, 1))),
        unit_price: Math.max(0, toNumber(it.unit_price, 0)),
      })),
      customerData: {
        name: cd.name.trim().slice(0, 150),
        phone: cd.phone.replace(/\D/g, "").slice(0, 20),
      },
      addressData: {
        cep: String(ad.cep).trim().slice(0, 20),
        street: String(ad.street).trim().slice(0, 255),
        number: String(ad.number).trim().slice(0, 30),
        complement: ad.complement ? String(ad.complement).trim().slice(0, 255) : undefined,
        neighborhood: String(ad.neighborhood).trim().slice(0, 255),
        city: String(ad.city).trim().slice(0, 255),
        state: String(ad.state).trim().slice(0, 50),
      },
      shippingCost: toNumber(body.shippingCost, 0),
      shippingData: body.shippingData ?? null,
      total: String(body.total ?? "0").slice(0, 50),
      coupon_discount: toNumber(body.coupon_discount, 0),
      coupon_code: body.coupon_code ? String(body.coupon_code).slice(0, 50) : null,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const parsed = validate(await req.json());
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: parsed.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, serviceKey);

    // 1) Persistir endereço no cliente (service role)
    await sb
      .from("customers")
      .upsert(
        {
          tenant_id: payload.tenant_id,
          phone: payload.customerData.phone,
          name: payload.customerData.name,
          cep: payload.addressData.cep,
          street: payload.addressData.street,
          number: payload.addressData.number,
          complement: payload.addressData.complement ?? null,
          neighborhood: payload.addressData.neighborhood,
          city: payload.addressData.city,
          state: payload.addressData.state,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,phone" },
      );

    // 2) Persistir endereço + frete no(s) pedido(s)
    const freightNote = buildFreightNote(payload.shippingData, payload.shippingCost);
    const orderIds = (payload.order_ids && payload.order_ids.length > 0 ? payload.order_ids : [payload.order_id]).filter(Boolean);

    // Buscar observações atuais para não sobrescrever
    const { data: existingOrders } = await sb
      .from("orders")
      .select("id, observation")
      .in("id", orderIds);

    const updates = (existingOrders || []).map((o: any) => {
      const obs = (o.observation ?? "").toString();
      const cleaned = obs.replace(/\n?\[FRETE\][^\n]*/g, "").trim();
      const nextObs = cleaned ? `${cleaned}\n${freightNote}` : freightNote;
      return {
        id: o.id,
        customer_name: payload.customerData.name,
        customer_cep: payload.addressData.cep,
        customer_street: payload.addressData.street,
        customer_number: payload.addressData.number,
        customer_complement: payload.addressData.complement ?? null,
        customer_city: payload.addressData.city,
        customer_state: payload.addressData.state,
        observation: nextObs,
      };
    });

    if (updates.length > 0) {
      await sb.from("orders").upsert(updates, { onConflict: "id" });
    }

    // 3) Criar preferência no Mercado Pago
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: "MP_ACCESS_TOKEN não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = payload.cartItems.map((it) => ({
      title: it.product_name || it.product_code || "Produto",
      quantity: it.qty,
      unit_price: Number(it.unit_price),
      currency_id: "BRL",
    }));

    // Se houver frete, adiciona como item separado
    if (payload.shippingCost && payload.shippingCost > 0) {
      items.push({
        title: "Frete",
        quantity: 1,
        unit_price: Number(payload.shippingCost),
        currency_id: "BRL",
      });
    }

    const preferenceBody = {
      items,
      external_reference: `tenant:${payload.tenant_id};orders:${orderIds.join(",")}`,
      payer: {
        name: payload.customerData.name,
        phone: {
          number: payload.customerData.phone,
        },
      },
      // Deixa callbacks configurados no MP dashboard (webhooks) e usa payment_link no pedido
      notification_url: undefined,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });

    const mpJson = await mpRes.json();
    if (!mpRes.ok) {
      console.log("[create-payment] MP error", mpJson);
      return new Response(JSON.stringify({ error: "Erro ao criar pagamento", details: mpJson }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const initPoint = mpJson?.init_point;
    const sandboxInitPoint = mpJson?.sandbox_init_point;

    // 4) Salvar link de pagamento no(s) pedido(s)
    const paymentLink = initPoint || sandboxInitPoint || null;
    if (paymentLink) {
      await sb
        .from("orders")
        .update({ payment_link: paymentLink })
        .in("id", orderIds);
    }

    return new Response(
      JSON.stringify({ init_point: initPoint, sandbox_init_point: sandboxInitPoint }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.log("[create-payment] Unexpected error", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
