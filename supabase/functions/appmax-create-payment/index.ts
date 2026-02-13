import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// App Max API v1 URL
const APPMAX_API_URL = "https://api.appmax.com.br/v1";

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

type CustomerData = {
  name: string;
  phone: string;
  cpf?: string;
  email?: string;
};

type ShippingData = {
  service_id: string;
  service_name: string;
  company_name: string;
  price: number;
  delivery_time: string;
} | null;

type PaymentMethod = "pix" | "credit-card" | "boleto";

type CreatePaymentRequest = {
  tenant_id: string;
  order_id: number;
  order_ids?: number[];
  cartItems: CartItem[];
  customerData: CustomerData;
  addressData: AddressData;
  shippingCost: number;
  shippingData: ShippingData;
  total: string;
  coupon_discount?: number;
  coupon_code?: string | null;
  merge_observation?: string | null;
  payment_method?: PaymentMethod;
  payment_data?: Record<string, unknown>;
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
        cpf: cd.cpf ? String(cd.cpf).replace(/\D/g, "").slice(0, 11) : undefined,
        email: cd.email ? String(cd.email).trim().slice(0, 255) : undefined,
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
      merge_observation: body.merge_observation ? String(body.merge_observation).slice(0, 255) : null,
      payment_method: body.payment_method || "pix",
      payment_data: body.payment_data || {},
    },
  };
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  const first_name = parts[0] || "";
  const last_name = parts.slice(1).join(" ") || first_name;
  return { first_name, last_name };
}

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "127.0.0.1";
}

function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, "");
  if (digits.length === 8) return `${digits.slice(0, 5)}${digits.slice(5)}`;
  return digits;
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 2)}${digits.slice(2)}`;
  return digits;
}

// ─── Appmax API helper ──────────────────────────────────────────
async function appmaxFetch(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${APPMAX_API_URL}${path}`;
  console.log(`[appmax] POST ${url}`);

  const headers: Record<string, string> = {
    "accept": "application/json",
    "content-type": "application/json",
    "Authorization": `Bearer ${accessToken}`,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  let data: any;

  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    const text = await res.text();
    console.error(`[appmax] Non-JSON response (${res.status}):`, text.slice(0, 500));
    data = { error: `Resposta inesperada da API (${res.status})`, raw: text.slice(0, 300) };
  }

  console.log(`[appmax] Response ${res.status}:`, JSON.stringify(data).slice(0, 500));
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
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

    // ─── 1) Buscar integração App Max do tenant ─────────────────
    const { data: appmaxIntegration, error: integrationError } = await sb
      .from("integration_appmax")
      .select("*")
      .eq("tenant_id", payload.tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError || !appmaxIntegration) {
      console.log("[appmax] No active integration for tenant:", payload.tenant_id);
      return new Response(JSON.stringify({ error: "Integração App Max não configurada ou inativa" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = appmaxIntegration.access_token;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Access token do App Max não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[appmax] Environment: ${appmaxIntegration.environment}`);

    // ─── 2) Persistir endereço no cliente local ─────────────────
    await sb
      .from("customers")
      .upsert(
        {
          tenant_id: payload.tenant_id,
          phone: payload.customerData.phone,
          name: payload.customerData.name,
          cpf: payload.customerData.cpf ?? null,
          email: payload.customerData.email ?? null,
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

    // ─── 3) Atualizar pedido(s) locais com endereço e frete ─────
    const freightNote = buildFreightNote(payload.shippingData, payload.shippingCost);
    const orderIds = (payload.order_ids && payload.order_ids.length > 0 ? payload.order_ids : [payload.order_id]).filter(Boolean);

    for (const orderId of orderIds) {
      const { data: existingOrder } = await sb
        .from("orders")
        .select("id, observation, total_amount, cart_id")
        .eq("id", orderId)
        .single();

      if (existingOrder) {
        let obs = (existingOrder.observation ?? "").toString();
        const cleaned = obs.replace(/\n?\[FRETE\][^\n]*/g, "").trim();

        let mergeNote = "";
        if (payload.merge_observation) {
          mergeNote = `[MERGE] ${payload.merge_observation}`;
        }

        const parts = [cleaned, freightNote, mergeNote].filter(Boolean);
        const nextObs = parts.join("\n");

        let productsTotal = 0;
        if (existingOrder.cart_id) {
          const { data: cartItems } = await sb
            .from("cart_items")
            .select("unit_price, qty")
            .eq("cart_id", existingOrder.cart_id);

          if (cartItems && cartItems.length > 0) {
            productsTotal = cartItems.reduce((sum: number, item: any) => sum + (Number(item.unit_price) * Number(item.qty)), 0);
          }
        }

        if (productsTotal === 0) {
          productsTotal = payload.cartItems.reduce((sum, it) => sum + (it.unit_price * it.qty), 0);
        }

        const shippingValue = toNumber(payload.shippingCost, 0);
        const newTotal = productsTotal + shippingValue;
        const shippingServiceId = payload.shippingData?.service_id ? Number(payload.shippingData.service_id) : null;

        await sb
          .from("orders")
          .update({
            customer_name: payload.customerData.name,
            customer_cep: payload.addressData.cep,
            customer_street: payload.addressData.street,
            customer_number: payload.addressData.number,
            customer_complement: payload.addressData.complement ?? null,
            customer_neighborhood: payload.addressData.neighborhood ?? null,
            customer_city: payload.addressData.city,
            customer_state: payload.addressData.state,
            observation: nextObs,
            total_amount: newTotal,
            shipping_service_id: shippingServiceId,
          })
          .eq("id", orderId);
      }
    }

    // ─── 4) APPMAX STEP 1: Criar/Atualizar Cliente ─────────────
    const { first_name, last_name } = splitName(payload.customerData.name);
    const clientIp = getClientIp(req);

    const customerBody: Record<string, unknown> = {
      first_name,
      last_name,
      email: payload.customerData.email || `${payload.customerData.phone}@checkout.local`,
      phone: formatPhone(payload.customerData.phone),
      ip: clientIp,
      document_number: payload.customerData.cpf || "",
      address: {
        postcode: formatCep(payload.addressData.cep),
        street: payload.addressData.street,
        number: payload.addressData.number,
        complement: payload.addressData.complement || "",
        district: payload.addressData.neighborhood,
        city: payload.addressData.city,
        state: payload.addressData.state,
      },
    };

    console.log("[appmax] Step 1: Creating/updating customer...");
    const customerResult = await appmaxFetch("/customer", accessToken, customerBody);

    if (!customerResult.ok || !customerResult.data?.data?.id) {
      console.error("[appmax] Customer creation failed:", customerResult.data);
      return new Response(JSON.stringify({
        error: "Erro ao criar cliente no App Max. Verifique se o token está correto.",
        details: customerResult.data,
      }), {
        status: customerResult.status >= 400 ? customerResult.status : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appmaxCustomerId = customerResult.data.data.id;
    console.log("[appmax] Customer ID:", appmaxCustomerId);

    // Salvar customer_id na integração para referência futura
    await sb
      .from("integration_appmax")
      .update({ appmax_customer_id: appmaxCustomerId, updated_at: new Date().toISOString() })
      .eq("id", appmaxIntegration.id);

    // ─── 5) APPMAX STEP 2: Criar Pedido ─────────────────────────
    const productsTotal = payload.cartItems.reduce((sum, it) => sum + (it.unit_price * it.qty), 0);
    const totalWithShipping = productsTotal + payload.shippingCost;
    const discount = toNumber(payload.coupon_discount, 0);

    const orderBody: Record<string, unknown> = {
      customer_id: appmaxCustomerId,
      products: payload.cartItems.map(item => ({
        sku: item.product_code || `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.product_name,
        qty: item.qty,
        unit_value: item.unit_price,
      })),
      shipping_value: payload.shippingCost,
      freight_type: payload.shippingData?.service_name || "Retirada",
    };

    // Se tiver desconto, incluir
    if (discount > 0) {
      orderBody.discount = discount;
    }

    console.log("[appmax] Step 2: Creating order...");
    const orderResult = await appmaxFetch("/order", accessToken, orderBody);

    if (!orderResult.ok || !orderResult.data?.data?.id) {
      console.error("[appmax] Order creation failed:", orderResult.data);
      return new Response(JSON.stringify({
        error: "Erro ao criar pedido no App Max",
        details: orderResult.data,
      }), {
        status: orderResult.status >= 400 ? orderResult.status : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appmaxOrderId = orderResult.data.data.id;
    console.log("[appmax] Order ID:", appmaxOrderId);

    // ─── 6) APPMAX STEP 3: Processar Pagamento ─────────────────
    const paymentMethod: PaymentMethod = payload.payment_method || "pix";
    let paymentEndpoint: string;
    const paymentBody: Record<string, unknown> = {
      order_id: appmaxOrderId,
    };

    switch (paymentMethod) {
      case "credit-card":
        paymentEndpoint = "/payments/credit-card";
        paymentBody.customer_id = appmaxCustomerId;
        paymentBody.payment_data = payload.payment_data || {};
        break;

      case "boleto":
        paymentEndpoint = "/payments/boleto";
        paymentBody.payment_data = payload.payment_data || {};
        break;

      case "pix":
      default:
        paymentEndpoint = "/payments/pix";
        paymentBody.payment_data = payload.payment_data || {};
        break;
    }

    console.log(`[appmax] Step 3: Creating payment via ${paymentMethod}...`);
    const paymentResult = await appmaxFetch(paymentEndpoint, accessToken, paymentBody);

    if (!paymentResult.ok) {
      console.error("[appmax] Payment creation failed:", paymentResult.data);

      // Mesmo com falha no pagamento, salvamos os IDs do Appmax nos pedidos locais
      for (const orderId of orderIds) {
        await sb
          .from("orders")
          .update({
            observation: `[APPMAX] customer_id: ${appmaxCustomerId}, order_id: ${appmaxOrderId} | Pagamento pendente (${paymentMethod})`,
          })
          .eq("id", orderId);
      }

      return new Response(JSON.stringify({
        error: `Erro ao processar pagamento via ${paymentMethod} no App Max`,
        details: paymentResult.data,
        appmax_order_id: appmaxOrderId,
        appmax_customer_id: appmaxCustomerId,
      }), {
        status: paymentResult.status >= 400 ? paymentResult.status : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentData = paymentResult.data?.data || paymentResult.data;
    console.log("[appmax] Payment created successfully:", JSON.stringify(paymentData).slice(0, 300));

    // ─── 7) Salvar dados nos pedidos locais ──────────────────────
    // Extrair link de pagamento (PIX QR code, boleto URL, etc.)
    const paymentLink = paymentData?.pix_qrcode
      || paymentData?.pix_url
      || paymentData?.boleto_url
      || paymentData?.payment_url
      || paymentData?.checkout_url
      || null;

    const appmaxNote = [
      `[APPMAX] customer_id: ${appmaxCustomerId}`,
      `order_id: ${appmaxOrderId}`,
      `payment: ${paymentMethod}`,
      paymentData?.status ? `status: ${paymentData.status}` : "",
    ].filter(Boolean).join(" | ");

    for (const orderId of orderIds) {
      const updateData: Record<string, unknown> = {};

      if (paymentLink) {
        updateData.payment_link = paymentLink;
      }

      // Append appmax note to observation
      const { data: currentOrder } = await sb
        .from("orders")
        .select("observation")
        .eq("id", orderId)
        .single();

      const currentObs = (currentOrder?.observation ?? "").toString();
      const cleanedObs = currentObs.replace(/\n?\[APPMAX\][^\n]*/g, "").trim();
      updateData.observation = [cleanedObs, appmaxNote].filter(Boolean).join("\n");

      await sb.from("orders").update(updateData).eq("id", orderId);
    }

    // ─── 8) Resposta final ──────────────────────────────────────
    const response: Record<string, unknown> = {
      provider: "appmax",
      payment_method: paymentMethod,
      appmax_customer_id: appmaxCustomerId,
      appmax_order_id: appmaxOrderId,
      payment: paymentData,
    };

    // Incluir init_point para compatibilidade com o frontend
    if (paymentLink) {
      response.init_point = paymentLink;
    }

    // Para PIX, incluir dados específicos
    if (paymentMethod === "pix") {
      response.pix_qrcode = paymentData?.pix_qrcode || null;
      response.pix_code = paymentData?.pix_code || paymentData?.pix_emv || null;
      response.pix_expiration = paymentData?.pix_expiration || null;
    }

    // Para boleto, incluir URL
    if (paymentMethod === "boleto") {
      response.boleto_url = paymentData?.boleto_url || paymentData?.url || null;
      response.boleto_barcode = paymentData?.boleto_barcode || paymentData?.barcode || null;
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[appmax] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
