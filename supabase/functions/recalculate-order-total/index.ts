import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar o pedido
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, cart_id, observation, total_amount")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ error: "Pedido não encontrado", details: orderError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar itens do carrinho
    let productsTotal = 0;
    if (order.cart_id) {
      const { data: items, error: itemsError } = await supabase
        .from("cart_items")
        .select("qty, unit_price")
        .eq("cart_id", order.cart_id);

      if (itemsError) {
        console.error("Erro ao buscar itens:", itemsError);
      } else if (items) {
        productsTotal = items.reduce((sum, item) => sum + (item.qty * item.unit_price), 0);
      }
    }

    // Extrair frete da observation
    let freightValue = 0;
    if (order.observation) {
      const match = order.observation.match(/R\$\s*([\d]+[.,][\d]{2})/i);
      if (match) {
        freightValue = parseFloat(match[1].replace(",", ".")) || 0;
      }
    }

    const newTotal = productsTotal + freightValue;

    console.log(`[recalculate-order-total] Pedido #${order_id}:`);
    console.log(`  - Total anterior: ${order.total_amount}`);
    console.log(`  - Produtos: ${productsTotal}`);
    console.log(`  - Frete: ${freightValue}`);
    console.log(`  - Novo total: ${newTotal}`);

    // Atualizar o total
    const { error: updateError } = await supabase
      .from("orders")
      .update({ total_amount: newTotal })
      .eq("id", order_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Erro ao atualizar", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        order_id,
        previous_total: order.total_amount,
        products_total: productsTotal,
        freight: freightValue,
        new_total: newTotal,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
