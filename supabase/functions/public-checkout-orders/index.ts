import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(phone: string) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("55") && clean.length > 11) clean = clean.slice(2);
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tenant_slug, customer_phone } = await req.json();
    const normalizedPhone = normalizePhone(customer_phone);

    if (!tenant_slug || normalizedPhone.length < 8) {
      return jsonResp({ success: false, orders: [], error: "tenant_slug e customer_phone são obrigatórios" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenant_slug)
      .eq("is_active", true)
      .maybeSingle();

    if (tenantError) throw tenantError;
    if (!tenant) return jsonResp({ success: true, orders: [] });

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, tenant_id, customer_phone, customer_name, event_type, event_date, total_amount, is_paid, is_cancelled, payment_link, cart_id, coupon_code, coupon_discount, gift_name, created_at")
      .eq("tenant_id", tenant.id)
      .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.55${normalizedPhone}`);

    if (ordersError) throw ordersError;

    const cartIds = (orders || []).map((order: any) => order.cart_id).filter(Boolean);
    const { data: cartItems, error: itemsError } = cartIds.length > 0
      ? await supabase
        .from("cart_items")
        .select("id, cart_id, qty, unit_price, product_id, product_name, product_code, product_image_url")
        .eq("tenant_id", tenant.id)
        .in("cart_id", cartIds)
      : { data: [], error: null } as any;

    if (itemsError) throw itemsError;

    const productIds = Array.from(new Set((cartItems || []).map((item: any) => item.product_id).filter(Boolean)));
    const { data: products, error: productsError } = productIds.length > 0
      ? await supabase
        .from("products")
        .select("id, name, code, image_url, color, size, category_id")
        .eq("tenant_id", tenant.id)
        .in("id", productIds)
      : { data: [], error: null } as any;

    if (productsError) throw productsError;

    const productsById = new Map((products || []).map((product: any) => [product.id, product]));
    const itemsByCartId = new Map<number, any[]>();

    for (const item of cartItems || []) {
      const product = productsById.get(item.product_id);
      const normalizedItem = {
        id: item.id,
        product_name: product?.name || item.product_name || `Produto ID ${item.product_id}`,
        product_code: product?.code || item.product_code || "",
        qty: item.qty,
        unit_price: Number(item.unit_price),
        image_url: product?.image_url || item.product_image_url,
        color: product?.color,
        size: product?.size,
        category_id: product?.category_id || null,
      };
      const list = itemsByCartId.get(item.cart_id) || [];
      list.push(normalizedItem);
      itemsByCartId.set(item.cart_id, list);
    }

    const ordersWithItems = (orders || []).map((order: any) => ({
      ...order,
      items: order.cart_id ? (itemsByCartId.get(order.cart_id) || []) : [],
    }));

    return jsonResp({ success: true, orders: ordersWithItems });
  } catch (error) {
    console.error("[public-checkout-orders]", error);
    return jsonResp({ success: false, orders: [], error: "Erro ao buscar pedidos do checkout" });
  }
});