import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

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
  // remove zeros à esquerda (ex.: "031..." -> "31...")
  clean = clean.replace(/^0+/, "");
  if (clean.startsWith("55") && clean.length > 11) clean = clean.slice(2);
  return clean;
}

type LookupType = "phone" | "instagram" | "tiktok";

function cleanHandle(value: unknown) {
  return String(value ?? "").trim().replace(/^@+/, "").replace(/\s+/g, "");
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function maskPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••••••${digits.slice(-4)}` : "•••••••";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const tenant_slug = typeof body?.tenant_slug === "string" ? body.tenant_slug.trim() : "";
    const lookupType: LookupType = body?.lookup_type === "instagram" || body?.lookup_type === "tiktok"
      ? body.lookup_type
      : "phone";
    const handle = cleanHandle(body?.handle);
    let normalizedPhone = normalizePhone(body?.customer_phone);

    if (!tenant_slug || tenant_slug.length > 100) {
      return jsonResp({ success: false, orders: [], error: "tenant_slug é obrigatório" });
    }
    if (lookupType === "phone" && normalizedPhone.length < 8) {
      return jsonResp({ success: false, orders: [], error: "tenant_slug e customer_phone são obrigatórios" });
    }
    if (lookupType !== "phone" && (!handle || handle.length > 60 || !/^[A-Za-z0-9._]+$/.test(handle))) {
      return jsonResp({ success: false, orders: [], error: "Informe um @ válido" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rlBlocked = await enforceRateLimit(req, supabase, "public-checkout-orders", 120, 60);
    if (rlBlocked) return rlBlocked;

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenant_slug)
      .eq("is_active", true)
      .maybeSingle();

    if (tenantError) throw tenantError;
    if (!tenant) return jsonResp({ success: true, orders: [] });

    // Busca pelo @: acha a cliente cadastrada e usa o telefone dela.
    // O telefone e os dados cadastrais nunca voltam para quem digitou o @.
    if (lookupType !== "phone") {
      const { data: matches, error: customerError } = await supabase
        .from("customers")
        .select("phone")
        .eq("tenant_id", tenant.id)
        .ilike(lookupType, escapeLike(handle))
        .limit(5);
      if (customerError) throw customerError;

      const phones = Array.from(new Set(
        (matches || []).map((c: any) => normalizePhone(c.phone)).filter((p: string) => p.length >= 8),
      ));
      if (phones.length === 0) {
        return jsonResp({ success: true, orders: [], handle_found: false });
      }
      if (phones.length > 1) {
        return jsonResp({
          success: false,
          orders: [],
          error: "Encontramos mais de um cadastro com esse @. Busque pelo telefone.",
        });
      }
      normalizedPhone = phones[0];
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, tenant_id, customer_phone, customer_name, event_type, event_date, total_amount, is_paid, is_cancelled, order_status, payment_method, payment_link, cart_id, coupon_code, coupon_discount, gift_name, created_at, melhor_envio_tracking_code, tracking_posted")
      .eq("tenant_id", tenant.id)
      .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.55${normalizedPhone},customer_phone.eq.0${normalizedPhone},customer_phone.eq.55${normalizedPhone},customer_phone.like.%${normalizedPhone}`);

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
      // Só expõe o código de rastreio para a cliente quando a postagem foi confirmada
      melhor_envio_tracking_code: order.tracking_posted ? order.melhor_envio_tracking_code : null,
      tracking_posted: undefined,
      ...(lookupType !== "phone" ? { customer_phone: maskPhone(order.customer_phone) } : {}),
      items: order.cart_id ? (itemsByCartId.get(order.cart_id) || []) : [],
    }));

    return jsonResp({
      success: true,
      orders: ordersWithItems,
      ...(lookupType !== "phone" ? { handle_found: true } : {}),
    });
  } catch (error) {
    console.error("[public-checkout-orders]", error);
    return jsonResp({ success: false, orders: [], error: "Erro ao buscar pedidos do checkout" });
  }
});