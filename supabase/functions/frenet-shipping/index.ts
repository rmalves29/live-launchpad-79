import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, to_postal_code, products } = await req.json();
    console.log("[frenet-shipping] Request:", { tenant_id, to_postal_code, products_count: products?.length });

    if (!tenant_id) {
      return json({ success: false, error: "tenant_id é obrigatório" }, 400);
    }
    if (!to_postal_code) {
      return json({ success: false, error: "CEP de destino é obrigatório" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "frenet")
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError || !integration) {
      return json({ success: false, error: "Configuração Frenet não encontrada" }, 200);
    }
    if (!integration.access_token) {
      return json({ success: false, error: "Token Frenet não configurado" }, 200);
    }
    if (!integration.from_cep) {
      return json({ success: false, error: "CEP de origem não configurado" }, 200);
    }

    // Consolidação de itens
    const productsList = Array.isArray(products) ? products : [];
    let totalValue = 0;
    const items = productsList.length
      ? productsList.map((p: any, idx: number) => {
          const qty = Number(p.quantity) || 1;
          const price = Number(p.insurance_value ?? p.price ?? 50);
          totalValue += price * qty;
          return {
            Height: Number(p.height) || 2,
            Length: Number(p.length) || 20,
            Width: Number(p.width) || 16,
            Weight: Number(p.weight) || 0.3,
            Quantity: qty,
            SKU: p.sku || `item-${idx}`,
            Category: p.category || "Geral",
          };
        })
      : [{ Height: 2, Length: 20, Width: 16, Weight: 0.3, Quantity: 1, SKU: "default" }];
    if (totalValue < 1) totalValue = 50;

    const payload = {
      SellerCEP: (integration.from_cep || "").replace(/\D/g, ""),
      RecipientCEP: (to_postal_code || "").replace(/\D/g, ""),
      ShipmentInvoiceValue: totalValue,
      ShippingItemArray: items,
      RecipientCountry: "BR",
    };

    console.log("[frenet-shipping] Payload:", JSON.stringify(payload));

    const resp = await fetch("https://api.frenet.com.br/shipping/quote", {
      method: "POST",
      headers: {
        token: integration.access_token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    console.log("[frenet-shipping] Status:", resp.status, "Body:", text.substring(0, 500));

    if (!resp.ok) {
      return json({ success: false, error: "Erro ao calcular frete Frenet", details: text }, 200);
    }

    const data = JSON.parse(text);
    const services = data.ShippingSevicesArray || data.ShippingServicesArray || [];

    // Filtro enabled_services
    let enabledServices: Record<string, boolean> | null = null;
    try {
      const raw = integration.enabled_services;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (typeof parsed === "object" && !Array.isArray(parsed)) enabledServices = parsed;
      }
    } catch {}

    const validOptions = services
      .filter((s: any) => {
        if (s.Error === true || s.Error === "true") return false;
        if (!s.ShippingPrice) return false;
        if (enabledServices && Object.keys(enabledServices).length > 0) {
          const key = s.ServiceCode || s.ServiceDescription;
          if (enabledServices[key] === false) return false;
        }
        return true;
      })
      .map((s: any) => {
        const price = Number(String(s.ShippingPrice).replace(",", "."));
        const days = Number(s.DeliveryTime) || 0;
        const name = `${s.Carrier || "Frenet"} - ${s.ServiceDescription || s.ServiceCode}`;
        return {
          id: `frenet_${s.ServiceCode}`,
          service_id: s.ServiceCode,
          name,
          service_name: s.ServiceDescription || s.ServiceCode,
          company: { name: s.Carrier || "Frenet", picture: "" },
          price,
          custom_price: price,
          delivery_time: days ? `${days} dias úteis` : "Consulte",
          custom_delivery_time: days,
          provider: "frenet",
        };
      });

    console.log("[frenet-shipping] Valid options:", validOptions.length);

    return json({ success: true, shipping_options: validOptions, provider: "frenet" }, 200);
  } catch (error: any) {
    console.error("[frenet-shipping] Error:", error);
    return json({ success: false, error: error.message }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
