import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cartItems, customerData, addressData, shippingCost, total, cartId } = await req.json();

    // Validate required data
    if (!cartItems || !customerData || !total) {
      throw new Error("Dados obrigatórios não fornecidos");
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
    const MP_PUBLIC_KEY = Deno.env.get("MP_PUBLIC_KEY");

    if (!MP_ACCESS_TOKEN) {
      throw new Error("Token de acesso do Mercado Pago não configurado");
    }

    // Create preference for Mercado Pago
    const itemsRaw = cartItems.map((item: any) => ({
      title: String(item.name || 'Item').slice(0, 60) || 'Item',
      quantity: Math.max(1, Number(item.qty || 1)),
      unit_price: Number(item.unit_price),
      currency_id: "BRL"
    }));

    // Filter out invalid items (quantity < 1 or unit_price <= 0)
    const items = itemsRaw.filter((i: any) => i.quantity >= 1 && i.unit_price > 0);

    if (!items.length) {
      throw new Error("Preferência inválida: carrinho sem itens válidos.");
    }

    const appHost = Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("PUBLIC_BASE_URL") || req.headers.get("host");
    const appBase = appHost?.startsWith("http") ? appHost : `https://${appHost}`;
    const apiBase = Deno.env.get("PUBLIC_API_URL");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "mmsecret";

    const preference = {
      binary_mode: true,
      items,
      payer: {
        name: customerData.name,
        email: customerData.email || `${customerData.phone}@checkout.com`,
        phone: {
          number: customerData.phone
        },
        address: addressData ? {
          zip_code: addressData.cep,
          street_name: addressData.street,
          street_number: addressData.number
        } : undefined
      },
      shipments: {
        cost: Math.max(0, Number(shippingCost) || 0),
        mode: "not_specified"
      },
      back_urls: {
        success: `${appBase}/mp/return?status=success`,
        failure: `${appBase}/mp/return?status=failure`,
        pending: `${appBase}/mp/return?status=pending`
      },
      auto_return: "approved",
      statement_descriptor: "MANIA DEMULHER",
      notification_url: apiBase && apiBase.startsWith("http")
        ? `${apiBase.replace(/\/$/, '')}/webhooks/mp?whk=${webhookSecret}`
        : undefined,
      external_reference: String(cartId ?? `order_${Date.now()}`)
    };

    console.log("Creating MP preference:", JSON.stringify(preference, null, 2));

    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(preference)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MP API Error:", errorText);
      throw new Error(`Erro na API do Mercado Pago: ${response.status}`);
    }

    const mpResponse = await response.json();
    console.log("MP Response:", mpResponse);

    // Choose correct link based on access token environment
    const isSandbox = (MP_ACCESS_TOKEN || "").startsWith("TEST-");
    const paymentLink = isSandbox
      ? (mpResponse.sandbox_init_point || mpResponse.init_point)
      : (mpResponse.init_point || mpResponse.sandbox_init_point);
    // Save order to database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const orderData = {
      cart_id: cartId ?? null,
      customer_phone: customerData.phone,
      event_date: new Date().toISOString().split('T')[0],
      event_type: 'BAZAR',
      total_amount: total,
      payment_link: paymentLink,
      is_paid: false
    };

    const { error: orderError } = await supabase
      .from('orders')
      .insert(orderData);

    if (orderError) {
      console.error("Error saving order:", orderError);
    }

    return new Response(JSON.stringify({ 
      payment_url: paymentLink,
      preference_id: mpResponse.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error creating payment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});