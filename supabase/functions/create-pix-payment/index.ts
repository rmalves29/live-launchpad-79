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
    const { cart_id } = await req.json();

    if (!cart_id) {
      throw new Error("cart_id é obrigatório");
    }

    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");

    if (!MP_ACCESS_TOKEN) {
      throw new Error("Token de acesso do Mercado Pago não configurado");
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get cart items and calculate total
    const { data: cartItems, error: cartError } = await supabase
      .from('cart_items')
      .select(`
        *,
        products (name, code, price)
      `)
      .eq('cart_id', cart_id);

    if (cartError) {
      throw new Error(`Erro ao buscar itens do carrinho: ${cartError.message}`);
    }

    if (!cartItems || cartItems.length === 0) {
      throw new Error("Carrinho vazio ou não encontrado");
    }

    // Calculate total
    const total = cartItems.reduce((sum, item) => {
      return sum + (Number(item.unit_price) * Number(item.qty));
    }, 0);

    // Get cart data for customer info
    const { data: cart, error: cartDataError } = await supabase
      .from('carts')
      .select('*')
      .eq('id', cart_id)
      .single();

    if (cartDataError) {
      throw new Error(`Erro ao buscar dados do carrinho: ${cartDataError.message}`);
    }

    // Get customer data
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', cart.customer_phone)
      .maybeSingle();

    const amount = Number(total.toFixed(2));

    const paymentBody = {
      transaction_amount: amount,
      payment_method_id: 'pix',
      description: `Pedido carrinho ${cart_id}`,
      external_reference: String(cart_id),
      payer: {
        email: customer?.name ? `${customer.name.toLowerCase().replace(/\s+/g, '')}@checkout.com` : 'cliente@exemplo.com',
        first_name: customer?.name || 'Cliente',
        identification: { 
          type: 'CPF', 
          number: customer?.cpf || '00000000000' 
        }
      }
    };

    console.log("Creating PIX payment:", JSON.stringify(paymentBody, null, 2));

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(paymentBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("MP API Error:", errorText);
      throw new Error(`Erro na API do Mercado Pago: ${response.status}`);
    }

    const payment = await response.json();
    console.log("MP PIX Payment Response:", payment);

    const transactionData = payment.point_of_interaction?.transaction_data || {};
    
    // Save order to database
    const orderData = {
      cart_id: cart_id,
      customer_phone: cart.customer_phone,
      event_date: cart.event_date,
      event_type: cart.event_type,
      total_amount: amount,
      payment_link: null, // PIX doesn't have a link
      is_paid: false
    };

    const { error: orderError } = await supabase
      .from('orders')
      .insert(orderData);

    if (orderError) {
      console.error("Error saving order:", orderError);
    }

    return new Response(JSON.stringify({
      id: payment.id,
      status: payment.status,
      qr_code: transactionData.qr_code,
      qr_code_base64: transactionData.qr_code_base64
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error creating PIX payment:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});