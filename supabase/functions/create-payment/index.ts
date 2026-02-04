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
    cpf?: string;
    email?: string;
  };
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

    // 2) Persistir endereço + frete no(s) pedido(s)
    const freightNote = buildFreightNote(payload.shippingData, payload.shippingCost);
    const orderIds = (payload.order_ids && payload.order_ids.length > 0 ? payload.order_ids : [payload.order_id]).filter(Boolean);

    // Atualizar cada pedido individualmente com os dados de endereço, frete e total atualizado
    for (const orderId of orderIds) {
      // Buscar pedido atual com os itens do carrinho para recalcular corretamente
      const { data: existingOrder } = await sb
        .from("orders")
        .select("id, observation, total_amount, cart_id")
        .eq("id", orderId)
        .single();

      if (existingOrder) {
        // Montar observação com frete e merge (se aplicável)
        let obs = (existingOrder.observation ?? "").toString();
        const cleaned = obs.replace(/\n?\[FRETE\][^\n]*/g, "").trim();
        
        // Adicionar observação de merge se existir
        let mergeNote = "";
        if (payload.merge_observation) {
          mergeNote = `[MERGE] ${payload.merge_observation}`;
        }
        
        const parts = [cleaned, freightNote, mergeNote].filter(Boolean);
        const nextObs = parts.join("\n");

        // CORREÇÃO: Calcular total a partir dos PRODUTOS (cart_items) + frete
        // Isso evita somar o frete múltiplas vezes se o cliente tentar pagar novamente
        let productsTotal = 0;
        
        if (existingOrder.cart_id) {
          // Buscar subtotal real dos itens do carrinho
          const { data: cartItems } = await sb
            .from("cart_items")
            .select("unit_price, qty")
            .eq("cart_id", existingOrder.cart_id);
          
          if (cartItems && cartItems.length > 0) {
            productsTotal = cartItems.reduce((sum, item) => sum + (Number(item.unit_price) * Number(item.qty)), 0);
          }
        }
        
        // Se não conseguiu calcular do carrinho, usa o que foi enviado no payload
        if (productsTotal === 0) {
          productsTotal = payload.cartItems.reduce((sum, it) => sum + (it.unit_price * it.qty), 0);
        }
        
        const shippingValue = toNumber(payload.shippingCost, 0);
        const newTotal = productsTotal + shippingValue;

        console.log(`[create-payment] Order ${orderId}: products=${productsTotal.toFixed(2)}, shipping=${shippingValue.toFixed(2)}, new total=${newTotal.toFixed(2)}`);

        // Extrair service_id do shippingData se disponível
        const shippingServiceId = payload.shippingData?.service_id ? Number(payload.shippingData.service_id) : null;

        const { error: updateError } = await sb
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
            shipping_service_id: shippingServiceId, // Salva a transportadora selecionada
          })
          .eq("id", orderId);

        if (updateError) {
          console.log(`[create-payment] Error updating order ${orderId}:`, updateError);
        } else {
          console.log(`[create-payment] Order ${orderId} updated - products: ${productsTotal.toFixed(2)}, shipping: ${shippingValue.toFixed(2)}, total: ${newTotal.toFixed(2)}`);
        }
      }
    }

    // 3) Determinar qual integração de pagamento usar
    // Verificar primeiro App Max, depois Pagar.me, depois Mercado Pago
    const { data: appmaxIntegration } = await sb
      .from("integration_appmax")
      .select("access_token, environment, is_active")
      .eq("tenant_id", payload.tenant_id)
      .maybeSingle();

    const { data: mpIntegration } = await sb
      .from("integration_mp")
      .select("access_token, environment, is_active")
      .eq("tenant_id", payload.tenant_id)
      .maybeSingle();

    const { data: pagarmeIntegration } = await sb
      .from("integration_pagarme")
      .select("api_key, public_key, environment, is_active")
      .eq("tenant_id", payload.tenant_id)
      .maybeSingle();

    // Determinar qual provedor usar (ordem: App Max > Pagar.me > Mercado Pago)
    const useAppmax = appmaxIntegration?.is_active && appmaxIntegration?.access_token;
    const usePagarme = !useAppmax && pagarmeIntegration?.is_active && pagarmeIntegration?.api_key;
    const useMercadoPago = !useAppmax && !usePagarme && mpIntegration?.is_active && mpIntegration?.access_token;
    const fallbackMpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");

    if (!useAppmax && !usePagarme && !useMercadoPago && !fallbackMpAccessToken) {
      return new Response(JSON.stringify({ error: "Nenhuma integração de pagamento configurada para este tenant" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reutilizar orderIds já declarado na linha 185
    const externalReference = `tenant:${payload.tenant_id};orders:${orderIds.join(",")}`;

    // ==== APP MAX ====
    if (useAppmax) {
      console.log("[create-payment] Using App Max for tenant:", payload.tenant_id);
      
      const APPMAX_SANDBOX_URL = "https://homolog.sandboxappmax.com.br/api/v3";
      const APPMAX_PRODUCTION_URL = "https://appmax.com.br/api/v3";
      const isSandbox = appmaxIntegration.environment === "sandbox";
      const baseUrl = isSandbox ? APPMAX_SANDBOX_URL : APPMAX_PRODUCTION_URL;
      const accessToken = appmaxIntegration.access_token;

      // Função para formatar telefone para App Max
      const formatPhoneForAppmax = (phone: string): string => {
        const digits = phone.replace(/\D/g, "");
        if (digits.length === 11) {
          return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        }
        if (digits.length === 10) {
          return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        }
        return phone;
      };

      // Função para formatar CEP
      const formatCep = (cep: string): string => {
        const digits = cep.replace(/\D/g, "");
        if (digits.length === 8) {
          return `${digits.slice(0, 5)}-${digits.slice(5)}`;
        }
        return cep;
      };

      // Separar nome
      const nameParts = payload.customerData.name.trim().split(/\s+/);
      const firstname = nameParts[0] || "";
      const lastname = nameParts.slice(1).join(" ") || firstname;

      // Criar cliente no App Max
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
        ip: "127.0.0.1",
        custom_txt: `Pedido(s): ${orderIds.join(", ")}`,
        products: payload.cartItems.map(item => ({
          product_sku: item.product_code || `SKU-${Date.now()}`,
          product_qty: item.qty,
        })),
      };

      console.log("[create-payment] Creating App Max customer...");
      const customerRes = await fetch(`${baseUrl}/customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerBody),
      });

      const customerJson = await customerRes.json();
      
      if (!customerRes.ok || !customerJson.data?.id) {
        console.error("[create-payment] App Max customer creation failed:", customerJson);
        return new Response(JSON.stringify({ 
          error: "Erro ao criar cliente no App Max", 
          details: customerJson 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const appmaxCustomerId = customerJson.data.id;
      console.log("[create-payment] App Max customer created:", appmaxCustomerId);

      // Criar pedido no App Max
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

      console.log("[create-payment] Creating App Max order...");
      const orderRes = await fetch(`${baseUrl}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderBody),
      });

      const orderJson = await orderRes.json();
      
      if (!orderRes.ok || !orderJson.data?.id) {
        console.error("[create-payment] App Max order creation failed:", orderJson);
        return new Response(JSON.stringify({ 
          error: "Erro ao criar pedido no App Max", 
          details: orderJson 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const appmaxOrderId = orderJson.data.id;
      console.log("[create-payment] App Max order created:", appmaxOrderId);

      // Construir URL do checkout App Max
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
          appmax_customer_id: appmaxCustomerId,
          appmax_order_id: appmaxOrderId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ==== PAGAR.ME ====
    if (usePagarme) {
      console.log("[create-payment] Using Pagar.me for tenant:", payload.tenant_id);
      
      const items = payload.cartItems.map((it) => ({
        description: it.product_name || it.product_code || "Produto",
        quantity: it.qty,
        amount: Math.round(Number(it.unit_price) * 100), // Pagar.me usa centavos
      }));

      // Adicionar frete como item
      if (payload.shippingCost && payload.shippingCost > 0) {
        items.push({
          description: "Frete",
          quantity: 1,
          amount: Math.round(Number(payload.shippingCost) * 100),
        });
      }

      const totalAmount = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);

      const now = new Date();
      const boletoDueAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

      const pagarmeBody = {
        items,
        customer: {
          // Obrigatório no Core v5
          type: "individual",
          name: payload.customerData.name,
          email: payload.customerData.email || `${payload.customerData.phone}@checkout.local`,
          document: payload.customerData.cpf || "00000000000",
          phones: {
            mobile_phone: {
              country_code: "55",
              area_code: payload.customerData.phone.slice(0, 2),
              number: payload.customerData.phone.slice(2),
            },
          },
        },
        shipping: {
          address: {
            country: "BR",
            state: payload.addressData.state,
            city: payload.addressData.city,
            neighborhood: payload.addressData.neighborhood,
            street: payload.addressData.street,
            street_number: payload.addressData.number,
            complement: payload.addressData.complement || "",
            zip_code: payload.addressData.cep.replace(/\D/g, ""),
          },
          amount: Math.round(Number(payload.shippingCost) * 100),
          description: "Envio padrão",
        },
        payments: [
          {
            payment_method: "checkout",
            checkout: {
              expires_in: 7200, // 2 horas
              billing_address_editable: false,
              customer_editable: false,
              accepted_payment_methods: ["credit_card", "boleto", "pix"],
              success_url: `${Deno.env.get("PUBLIC_APP_URL") || "https://app.orderzaps.com"}/mp/return?status=success`,

              // Pagar.me exige estes objetos quando boleto/pix estão em accepted_payment_methods
              boleto: {
                due_at: boletoDueAt,
                instructions: "Pague até o vencimento para evitar cancelamento automático.",
              },
              pix: {
                expires_in: 3600,
                additional_information: [
                  { name: "Pedido(s)", value: orderIds.join(",") },
                ],
              },
            },
            amount: totalAmount,
          },
        ],
        metadata: {
          external_reference: externalReference,
        },
      };

      const baseUrl = pagarmeIntegration.environment === 'sandbox' 
        ? "https://api.pagar.me/core/v5" 
        : "https://api.pagar.me/core/v5";

      const pagarmeRes = await fetch(`${baseUrl}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(pagarmeIntegration.api_key + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pagarmeBody),
      });

      const pagarmeJson = await pagarmeRes.json();
      
      if (!pagarmeRes.ok) {
        console.log("[create-payment] Pagar.me error", pagarmeJson);
        const rawMsg = (pagarmeJson?.message || pagarmeJson?.error || "").toString();
        const friendly = rawMsg.includes("Authorization has been denied")
          ? "Credenciais do Pagar.me inválidas (API Key sem permissão). Atualize a chave e tente novamente."
          : "Erro ao criar pagamento Pagar.me";

        return new Response(JSON.stringify({ error: friendly, details: pagarmeJson }), {
          status: pagarmeRes.status || 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Pegar URL do checkout
      const checkoutUrl = pagarmeJson?.checkouts?.[0]?.payment_url || pagarmeJson?.checkouts?.[0]?.url;
      
      if (checkoutUrl) {
        await sb
          .from("orders")
          .update({ payment_link: checkoutUrl })
          .in("id", orderIds);
      }

      return new Response(
        JSON.stringify({ init_point: checkoutUrl, provider: "pagarme" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ==== MERCADO PAGO ====
    console.log("[create-payment] Using Mercado Pago for tenant:", payload.tenant_id);
    
    const effectiveMpAccessToken = mpIntegration?.access_token || fallbackMpAccessToken;

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

    // Webhook URL for payment notifications (inclui tenant_id para resolver token correto)
    const webhookUrl = `${supabaseUrl}/functions/v1/mp-webhook?tenant_id=${payload.tenant_id}`;

    const preferenceBody = {
      items,
      external_reference: externalReference,
      payer: {
        name: payload.customerData.name,
        phone: {
          number: payload.customerData.phone,
        },
      },
      notification_url: webhookUrl,
      back_urls: {
        success: `${Deno.env.get("PUBLIC_APP_URL") || "https://app.orderzaps.com"}/mp/return?status=success`,
        failure: `${Deno.env.get("PUBLIC_APP_URL") || "https://app.orderzaps.com"}/mp/return?status=failure`,
        pending: `${Deno.env.get("PUBLIC_APP_URL") || "https://app.orderzaps.com"}/mp/return?status=pending`,
      },
      auto_return: "approved",
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${effectiveMpAccessToken}`,
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
      JSON.stringify({ init_point: initPoint, sandbox_init_point: sandboxInitPoint, provider: "mercado_pago" }),
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
