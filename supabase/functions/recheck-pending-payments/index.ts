import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  const results: any[] = [];

  try {
    // Fetch all unpaid orders with payment links from today
    const { data: orders } = await sb
      .from("orders")
      .select("id, tenant_id, payment_link, total_amount")
      .eq("is_paid", false)
      .eq("is_cancelled", false)
      .not("payment_link", "is", null)
      .gte("created_at", "2026-02-12")
      .order("id");

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ message: "No pending orders found", results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[recheck] Found ${orders.length} pending orders to check`);

    // Group by tenant for API key lookup
    const tenantIds = [...new Set(orders.map((o: any) => o.tenant_id))];

    // Fetch all Pagar.me integrations
    const { data: pagarmeIntegrations } = await sb
      .from("integration_pagarme")
      .select("tenant_id, api_key, is_active")
      .in("tenant_id", tenantIds);

    // Fetch all MP integrations
    const { data: mpIntegrations } = await sb
      .from("integration_mp")
      .select("tenant_id, access_token, is_active")
      .in("tenant_id", tenantIds);

    // Fetch all Appmax integrations
    const { data: appmaxIntegrations } = await sb
      .from("integration_appmax")
      .select("tenant_id, access_token, is_active, environment")
      .in("tenant_id", tenantIds);

    const pagarmeKeys: Record<string, string> = {};
    for (const p of pagarmeIntegrations || []) {
      if (p.is_active && p.api_key) pagarmeKeys[p.tenant_id] = p.api_key;
    }

    const mpTokens: Record<string, string> = {};
    for (const m of mpIntegrations || []) {
      if (m.is_active && m.access_token) mpTokens[m.tenant_id] = m.access_token;
    }

    const appmaxTokens: Record<string, { token: string; env: string }> = {};
    for (const a of appmaxIntegrations || []) {
      if (a.is_active && a.access_token) appmaxTokens[a.tenant_id] = { token: a.access_token, env: a.environment || "production" };
    }

    for (const order of orders) {
      const link = order.payment_link || "";
      const isPagarme = link.includes("pagar.me");
      const isMp = link.includes("mercadopago");
      const isAppmax = link.includes("appmax") || link.includes("sandboxappmax");

      try {
        if (isPagarme) {
          const apiKey = pagarmeKeys[order.tenant_id];
          if (!apiKey) {
            results.push({ order_id: order.id, status: "skip", reason: "no_pagarme_key" });
            continue;
          }

          // Extract checkout ID from link: https://api.pagar.me/checkout/v1/orders/chk_XXXX
          const checkoutId = link.split("/").pop();
          if (!checkoutId) {
            results.push({ order_id: order.id, status: "skip", reason: "no_checkout_id" });
            continue;
          }

          // Query Pagar.me API for this checkout's orders
          const res = await fetch(`https://api.pagar.me/core/v5/orders?code=${checkoutId}`, {
            headers: {
              "Authorization": "Basic " + btoa(apiKey + ":"),
              "Content-Type": "application/json",
            },
          });

          if (!res.ok) {
            // Try alternative: search by metadata
            const res2 = await fetch(`https://api.pagar.me/core/v5/orders?metadata[external_reference]=tenant:${order.tenant_id};orders:${order.id}`, {
              headers: {
                "Authorization": "Basic " + btoa(apiKey + ":"),
                "Content-Type": "application/json",
              },
            });
            
            if (!res2.ok) {
              const errText = await res2.text();
              console.log(`[recheck] Pagar.me API error for order ${order.id}: ${res2.status} ${errText}`);
              results.push({ order_id: order.id, status: "api_error", code: res2.status });
              continue;
            }

            const data2 = await res2.json();
            const paidOrder = data2.data?.find((o: any) => o.status === "paid");
            if (paidOrder) {
              await markPaid(sb, order.id);
              results.push({ order_id: order.id, status: "marked_paid", source: "pagarme_metadata" });
            } else {
              results.push({ order_id: order.id, status: "not_paid", source: "pagarme_metadata" });
            }
            continue;
          }

          const data = await res.json();
          const paidOrder = data.data?.find((o: any) => o.status === "paid");
          
          if (paidOrder) {
            await markPaid(sb, order.id);
            results.push({ order_id: order.id, status: "marked_paid", source: "pagarme" });
          } else {
            // Also try listing orders with our external_reference
            const res3 = await fetch(`https://api.pagar.me/core/v5/orders?metadata[external_reference]=tenant:${order.tenant_id};orders:${order.id}`, {
              headers: {
                "Authorization": "Basic " + btoa(apiKey + ":"),
                "Content-Type": "application/json",
              },
            });

            if (res3.ok) {
              const data3 = await res3.json();
              const paidOrder3 = data3.data?.find((o: any) => o.status === "paid");
              if (paidOrder3) {
                await markPaid(sb, order.id);
                results.push({ order_id: order.id, status: "marked_paid", source: "pagarme_ref" });
                continue;
              }
            }
            
            results.push({ order_id: order.id, status: "not_paid", source: "pagarme" });
          }

        } else if (isMp) {
          const mpToken = mpTokens[order.tenant_id] || Deno.env.get("MP_ACCESS_TOKEN");
          if (!mpToken) {
            results.push({ order_id: order.id, status: "skip", reason: "no_mp_token" });
            continue;
          }

          // Extract preference_id from link
          const prefMatch = link.match(/pref_id=([^&]+)/);
          if (!prefMatch) {
            results.push({ order_id: order.id, status: "skip", reason: "no_pref_id" });
            continue;
          }

          const prefId = prefMatch[1];

          // Search payments by external_reference
          const searchRes = await fetch(
            `https://api.mercadopago.com/v1/payments/search?external_reference=tenant:${order.tenant_id};orders:${order.id}&status=approved`,
            {
              headers: { Authorization: `Bearer ${mpToken}` },
            }
          );

          if (!searchRes.ok) {
            const errText = await searchRes.text();
            console.log(`[recheck] MP API error for order ${order.id}: ${searchRes.status} ${errText}`);
            results.push({ order_id: order.id, status: "api_error", code: searchRes.status });
            continue;
          }

          const searchData = await searchRes.json();
          
          if (searchData.results && searchData.results.length > 0) {
            await markPaid(sb, order.id);
            results.push({ order_id: order.id, status: "marked_paid", source: "mp" });
          } else {
            results.push({ order_id: order.id, status: "not_paid", source: "mp" });
          }

        } else if (isAppmax) {
          const appmaxData = appmaxTokens[order.tenant_id];
          if (!appmaxData) {
            results.push({ order_id: order.id, status: "skip", reason: "no_appmax_token" });
            continue;
          }

          // Extract appmax order ID from checkout URL (e.g. .../checkout/12345)
          const appmaxOrderMatch = link.match(/checkout\/(\d+)/);
          if (!appmaxOrderMatch) {
            results.push({ order_id: order.id, status: "skip", reason: "no_appmax_order_id" });
            continue;
          }

          const appmaxOrderId = appmaxOrderMatch[1];
          const isSandbox = appmaxData.env === "sandbox";
          const baseUrl = isSandbox 
            ? "https://homolog.sandboxappmax.com.br/api/v3" 
            : "https://appmax.com.br/api/v3";

          try {
            const res = await fetch(`${baseUrl}/order/${appmaxOrderId}?access-token=${appmaxData.token}`, {
              headers: { "Accept": "application/json" },
            });

            if (!res.ok) {
              results.push({ order_id: order.id, status: "api_error", code: res.status, source: "appmax" });
              continue;
            }

            const data = await res.json();
            const orderStatus = data?.data?.status || data?.status || "";
            
            if (orderStatus === "approved" || orderStatus === "paid" || orderStatus === "captured") {
              await markPaid(sb, order.id);
              results.push({ order_id: order.id, status: "marked_paid", source: "appmax" });
            } else {
              results.push({ order_id: order.id, status: "not_paid", source: "appmax", appmax_status: orderStatus });
            }
          } catch (appmaxErr) {
            results.push({ order_id: order.id, status: "error", source: "appmax", message: String(appmaxErr) });
          }

        } else {
          results.push({ order_id: order.id, status: "skip", reason: "unknown_gateway" });
        }
      } catch (e) {
        console.error(`[recheck] Error checking order ${order.id}:`, e);
        results.push({ order_id: order.id, status: "error", message: String(e) });
      }
    }

    return new Response(JSON.stringify({ total: orders.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[recheck] Fatal error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function markPaid(sb: any, orderId: number) {
  console.log(`[recheck] Marking order ${orderId} as paid`);
  const { error } = await sb
    .from("orders")
    .update({ is_paid: true })
    .eq("id", orderId);

  if (error) {
    console.error(`[recheck] Error marking order ${orderId}:`, error);
    throw error;
  }

  await sb.from("webhook_logs").insert({
    webhook_type: "recheck_payment_fix",
    status_code: 200,
    payload: { order_id: orderId, fixed_at: new Date().toISOString() },
  });
}
