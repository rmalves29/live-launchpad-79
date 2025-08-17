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

    if (!MP_ACCESS_TOKEN) {
      throw new Error("Token de acesso do Mercado Pago não configurado");
    }

    // Convert freight to safe number - handles "19,90" -> 19.90
    const freightCost = (() => {
      const raw = shippingCost;
      if (typeof raw === 'string') {
        // handles "19,90" -> 19.90
        return Number(raw.replace('.', '').replace(',', '.')) || 0;
      }
      return Number(raw || 0);
    })();

    // Create properly sanitized items for Mercado Pago
    const items = cartItems.map((item: any) => ({
      title: String(`${item.code || ''} ${item.name || 'Produto'}`).slice(0, 60) || 'Item',
      quantity: Math.max(1, Number(item.qty || 1)),
      unit_price: Number(item.unit_price),
      currency_id: "BRL"
    })).filter((i: any) => i.quantity >= 1 && i.unit_price > 0);

    if (items.length === 0) {
      throw new Error("Preferência inválida: carrinho sem itens válidos.");
    }

    const appBase = Deno.env.get("PUBLIC_APP_URL") || "https://live-launchpad-79.lovable.app";
    const apiBase = Deno.env.get("PUBLIC_API_URL");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "mmsecret";

    const preference = {
      external_reference: String(cartId ?? `order_${Date.now()}`),
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
        cost: freightCost,
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
        : undefined
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

    // For APP_USR tokens (production), always use init_point
    const paymentLink = mpResponse.init_point;
    if (!paymentLink) {
      throw new Error("Mercado Pago não retornou init_point.");
    }
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