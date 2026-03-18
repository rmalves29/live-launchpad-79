import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BAGY_API = "https://api.dooca.store";

async function bagyFetch(
  path: string,
  token: string,
  options: RequestInit = {}
) {
  const res = await fetch(`${BAGY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Bagy API ${res.status}: ${JSON.stringify(data)}`
    );
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, action, order_id } = await req.json();

    if (!tenant_id || !action) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id e action são obrigatórios" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar integração
    const { data: integration, error: intError } = await supabase
      .from("integration_bagy")
      .select("*")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Bagy não encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token de acesso não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = integration.access_token;

    // ===================== TEST CONNECTION =====================
    if (action === "test_connection") {
      try {
        const data = await bagyFetch("/products?limit=1", token);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Conexão com a Bagy estabelecida com sucesso!",
            products_count: data?.data?.length ?? 0,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        return new Response(
          JSON.stringify({ success: false, error: `Falha na conexão: ${e.message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===================== EXPORT ORDER =====================
    if (action === "export_order") {
      if (!order_id) {
        return new Response(
          JSON.stringify({ success: false, error: "order_id é obrigatório para export_order" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar pedido
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order_id)
        .eq("tenant_id", tenant_id)
        .single();

      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ success: false, error: "Pedido não encontrado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (order.bagy_order_id) {
        return new Response(
          JSON.stringify({ success: false, error: `Pedido já exportado (Bagy ID: ${order.bagy_order_id})` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Buscar itens do carrinho
      let items: any[] = [];
      if (order.cart_id) {
        const { data: cartItems } = await supabase
          .from("cart_items")
          .select("*, products(code, name, price)")
          .eq("cart_id", order.cart_id);
        items = cartItems || [];
      }

      if (items.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Pedido sem itens para exportar" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Montar itens para a Bagy
      const bagyItems = items.map((item: any) => ({
        name: item.product_name || item.products?.name || "Produto",
        reference: item.product_code || item.products?.code || "",
        quantity: item.qty || 1,
        price: item.unit_price || 0,
      }));

      // Montar pedido para a Bagy
      const bagyOrder: any = {
        customer: {
          name: order.customer_name || "Cliente",
          phone: order.customer_phone || "",
        },
        items: bagyItems,
        total: order.total_amount || 0,
        status: order.is_paid ? "paid" : "pending",
      };

      // Adicionar endereço se disponível
      if (order.customer_cep) {
        bagyOrder.shipping_address = {
          zip_code: order.customer_cep,
          street: order.customer_street || "",
          number: order.customer_number || "S/N",
          complement: order.customer_complement || "",
          neighborhood: order.customer_neighborhood || "",
          city: order.customer_city || "",
          state: order.customer_state || "",
        };
      }

      console.log("[bagy-sync] Exportando pedido:", JSON.stringify(bagyOrder, null, 2));

      try {
        const bagyResponse = await bagyFetch("/orders", token, {
          method: "POST",
          body: JSON.stringify(bagyOrder),
        });

        const bagyOrderId = bagyResponse?.data?.id || bagyResponse?.id;

        // Salvar bagy_order_id
        if (bagyOrderId) {
          await supabase
            .from("orders")
            .update({ bagy_order_id: bagyOrderId })
            .eq("id", order_id);
        }

        // Abater estoque se habilitado
        if (integration.sync_stock && items.length > 0) {
          await syncStockForItems(items, token);
        }

        // Atualizar last_sync_at
        await supabase
          .from("integration_bagy")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("tenant_id", tenant_id);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Pedido exportado com sucesso para a Bagy!",
            bagy_order_id: bagyOrderId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        console.error("[bagy-sync] Erro ao exportar pedido:", e.message);
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao criar pedido na Bagy: ${e.message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===================== SYNC STOCK =====================
    if (action === "sync_stock") {
      try {
        // Buscar todos os produtos do tenant
        const { data: products } = await supabase
          .from("products")
          .select("id, code, name, stock")
          .eq("tenant_id", tenant_id)
          .not("code", "is", null);

        if (!products || products.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: "Nenhum produto com código encontrado" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Buscar produtos na Bagy para mapear por SKU/reference
        let bagyProducts: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 20) {
          const res = await bagyFetch(`/products?limit=50&page=${page}`, token);
          const pageData = res?.data || [];
          bagyProducts = bagyProducts.concat(pageData);
          hasMore = pageData.length === 50;
          page++;
        }

        // Criar mapa de SKU -> variation_id na Bagy
        const bagySkuMap = new Map<string, { variation_id: number; current_balance: number }>();
        for (const bp of bagyProducts) {
          if (bp.variations) {
            for (const v of bp.variations) {
              if (v.reference) {
                bagySkuMap.set(v.reference, {
                  variation_id: v.id,
                  current_balance: v.balance || 0,
                });
              }
            }
          }
          if (bp.reference) {
            bagySkuMap.set(bp.reference, {
              variation_id: bp.variations?.[0]?.id || bp.id,
              current_balance: bp.variations?.[0]?.balance || 0,
            });
          }
        }

        // Montar payload de estoque
        const stockUpdates: { variation_id: number; balance: number }[] = [];
        let matched = 0;
        let unmatched = 0;

        for (const product of products) {
          const bagy = bagySkuMap.get(product.code);
          if (bagy) {
            stockUpdates.push({
              variation_id: bagy.variation_id,
              balance: product.stock ?? 0,
            });
            matched++;
          } else {
            unmatched++;
          }
        }

        if (stockUpdates.length === 0) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Nenhum produto mapeado por SKU. ${unmatched} produto(s) sem correspondência na Bagy.`,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Enviar em lotes de 150
        const batchSize = 150;
        for (let i = 0; i < stockUpdates.length; i += batchSize) {
          const batch = stockUpdates.slice(i, i + batchSize);
          await bagyFetch("/stocks", token, {
            method: "PUT",
            body: JSON.stringify(batch),
          });
        }

        // Atualizar last_sync_at
        await supabase
          .from("integration_bagy")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("tenant_id", tenant_id);

        return new Response(
          JSON.stringify({
            success: true,
            message: `Estoque sincronizado! ${matched} produto(s) atualizado(s), ${unmatched} sem correspondência.`,
            matched,
            unmatched,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        console.error("[bagy-sync] Erro ao sincronizar estoque:", e.message);
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao sincronizar estoque: ${e.message}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[bagy-sync] Erro geral:", e.message);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Função auxiliar para abater estoque após exportar pedido
async function syncStockForItems(items: any[], token: string) {
  try {
    // Buscar todos os produtos na Bagy
    const res = await bagyFetch("/products?limit=250", token);
    const bagyProducts = res?.data || [];

    const bagySkuMap = new Map<string, { variation_id: number; current_balance: number }>();
    for (const bp of bagyProducts) {
      if (bp.variations) {
        for (const v of bp.variations) {
          if (v.reference) {
            bagySkuMap.set(v.reference, {
              variation_id: v.id,
              current_balance: v.balance || 0,
            });
          }
        }
      }
      if (bp.reference) {
        bagySkuMap.set(bp.reference, {
          variation_id: bp.variations?.[0]?.id || bp.id,
          current_balance: bp.variations?.[0]?.balance || 0,
        });
      }
    }

    const stockUpdates: { variation_id: number; balance: number }[] = [];
    for (const item of items) {
      const sku = item.product_code || item.products?.code;
      if (!sku) continue;
      const bagy = bagySkuMap.get(sku);
      if (bagy) {
        const newBalance = Math.max(0, bagy.current_balance - (item.qty || 1));
        stockUpdates.push({ variation_id: bagy.variation_id, balance: newBalance });
      }
    }

    if (stockUpdates.length > 0) {
      await bagyFetch("/stocks", token, {
        method: "PUT",
        body: JSON.stringify(stockUpdates),
      });
      console.log(`[bagy-sync] Estoque abatido para ${stockUpdates.length} item(ns)`);
    }
  } catch (e: any) {
    console.error("[bagy-sync] Erro ao abater estoque:", e.message);
  }
}
