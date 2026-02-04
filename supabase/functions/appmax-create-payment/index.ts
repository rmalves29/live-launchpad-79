import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// App Max API URLs
const APPMAX_SANDBOX_URL = "https://homolog.sandboxappmax.com.br/api/v3";
const APPMAX_PRODUCTION_URL = "https://appmax.com.br/api/v3";

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
    },
  };
}

// Formatar telefone para o padrão App Max: (XX) XXXXX-XXXX
function formatPhoneForAppmax(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Formatar CEP: XXXXX-XXX
function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return cep;
}

// Separar nome em firstname e lastname
function splitName(fullName: string): { firstname: string; lastname: string } {
  const parts = fullName.trim().split(/\s+/);
  const firstname = parts[0] || "";
  const lastname = parts.slice(1).join(" ") || firstname;
  return { firstname, lastname };
}

// Função para pegar IP do cliente (fallback para local)
function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "127.0.0.1";
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

    // 1) Buscar integração App Max do tenant
    const { data: appmaxIntegration, error: integrationError } = await sb
      .from("integration_appmax")
      .select("*")
      .eq("tenant_id", payload.tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError || !appmaxIntegration) {
      console.log("[appmax-create-payment] No active integration found for tenant:", payload.tenant_id);
      return new Response(JSON.stringify({ error: "Integração App Max não configurada ou inativa" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = appmaxIntegration.access_token;
    const isSandbox = appmaxIntegration.environment === "sandbox";
    const baseUrl = isSandbox ? APPMAX_SANDBOX_URL : APPMAX_PRODUCTION_URL;

    console.log(`[appmax-create-payment] Using ${isSandbox ? "SANDBOX" : "PRODUCTION"} environment`);

    // 2) Persistir endereço no cliente
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

    // 3) Atualizar pedido(s) com endereço e frete
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
            productsTotal = cartItems.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.qty)), 0);
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

    // 4) Criar cliente no App Max
    const { firstname, lastname } = splitName(payload.customerData.name);
    const clientIp = getClientIp(req);

    const customerBody = {
      "access-token": accessToken,
      firstname,
      lastname,
      email: payload.customerData.email || `${payload.customerData.phone}@checkout.local`,
      telephone: formatPhoneForAppmax(payload.customerData.phone),
      postcode: formatCep(payload.addressData.cep),
      address_street: payload.addressData.street,
      address_street_number: payload.addressData.number,
      address_street_complement: payload.addressData.complement || "",
      address_street_district: payload.addressData.neighborhood,
      address_city: payload.addressData.city,
      address_state: payload.addressData.state,
      ip: clientIp,
      custom_txt: `Pedido(s): ${orderIds.join(", ")}`,
      products: payload.cartItems.map(item => ({
        product_sku: item.product_code || `SKU-${Date.now()}`,
        product_qty: item.qty,
      })),
    };

    console.log("[appmax-create-payment] Creating customer...");
    const customerRes = await fetch(`${baseUrl}/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerBody),
    });

    const customerJson = await customerRes.json();
    
    if (!customerRes.ok || !customerJson.data?.id) {
      console.error("[appmax-create-payment] Customer creation failed:", customerJson);
      return new Response(JSON.stringify({ 
        error: "Erro ao criar cliente no App Max", 
        details: customerJson 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appmaxCustomerId = customerJson.data.id;
    console.log("[appmax-create-payment] Customer created:", appmaxCustomerId);

    // 5) Criar pedido no App Max
    const productsTotal = payload.cartItems.reduce((sum, it) => sum + (it.unit_price * it.qty), 0);
    const totalWithShipping = productsTotal + payload.shippingCost;

    const orderBody = {
      "access-token": accessToken,
      total: totalWithShipping,
      products: payload.cartItems.map(item => ({
        sku: item.product_code || `SKU-${Date.now()}`,
        name: item.product_name,
        qty: item.qty,
        price: item.unit_price,
      })),
      shipping: payload.shippingCost,
      customer_id: appmaxCustomerId,
      discount: payload.coupon_discount || 0,
      freight_type: payload.shippingData?.service_name || "Retirada",
    };

    console.log("[appmax-create-payment] Creating order...");
    const orderRes = await fetch(`${baseUrl}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderBody),
    });

    const orderJson = await orderRes.json();
    
    if (!orderRes.ok || !orderJson.data?.id) {
      console.error("[appmax-create-payment] Order creation failed:", orderJson);
      return new Response(JSON.stringify({ 
        error: "Erro ao criar pedido no App Max", 
        details: orderJson 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appmaxOrderId = orderJson.data.id;
    console.log("[appmax-create-payment] Order created:", appmaxOrderId);

    // 6) Salvar IDs do App Max nos pedidos locais
    for (const orderId of orderIds) {
      await sb
        .from("orders")
        .update({
          observation: sb.sql`observation || '\n[APPMAX] customer_id: ${appmaxCustomerId}, order_id: ${appmaxOrderId}'`,
        })
        .eq("id", orderId);
    }

    // 7) Retornar URL de pagamento do App Max
    // O App Max usa um checkout próprio - retornamos os dados para o frontend processar
    const checkoutData = {
      appmax_customer_id: appmaxCustomerId,
      appmax_order_id: appmaxOrderId,
      total: totalWithShipping,
      environment: isSandbox ? "sandbox" : "production",
      base_url: baseUrl,
    };

    // Construir URL do checkout App Max (o cliente pode ter um link específico)
    const checkoutUrl = isSandbox 
      ? `https://homolog.sandboxappmax.com.br/checkout/${appmaxOrderId}`
      : `https://appmax.com.br/checkout/${appmaxOrderId}`;

    // Salvar link de pagamento nos pedidos
    await sb
      .from("orders")
      .update({ payment_link: checkoutUrl })
      .in("id", orderIds);

    return new Response(
      JSON.stringify({ 
        init_point: checkoutUrl, 
        provider: "appmax",
        appmax_data: checkoutData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error: any) {
    console.error("[appmax-create-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
