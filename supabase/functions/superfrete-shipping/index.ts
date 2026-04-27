import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeia service_id da SuperFrete para nome amigável (igual ao shown in checkout)
const SERVICE_NAMES: Record<number, string> = {
  1: "PAC",
  2: "SEDEX",
  3: "Jadlog .Package",
  17: "Mini Envios",
};

function parseSuperFreteError(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText);
    const errors = parsed?.errors;
    if (errors && typeof errors === "object") {
      const messages = Object.values(errors).flat().filter(Boolean) as string[];
      if (messages.some((message) => String(message).toLowerCase().includes("postcode") || String(message).toLowerCase().includes("cep"))) {
        return "CEP de destino inválido ou sem cobertura pela SuperFrete";
      }
      if (messages.length > 0) return messages.join(" ");
    }
    if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    // ignore parse errors and use fallback below
  }

  return "Erro ao calcular frete com SuperFrete";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, to_postal_code, products } = await req.json();
    console.log("[superfrete-shipping] Request:", { tenant_id, to_postal_code, products_count: products?.length });

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de destino é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "superfrete")
      .eq("is_active", true)
      .single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração SuperFrete não encontrada" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token SuperFrete não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!integration.from_cep) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = integration.sandbox
      ? "https://sandbox.superfrete.com/api/v0"
      : "https://api.superfrete.com/api/v0";

    // Construir array de produtos para a SuperFrete (cada item com peso/dimensões)
    const productsList = products && products.length > 0 ? products : [{
      quantity: 1,
      weight: 0.3,
      height: 2,
      width: 16,
      length: 20,
      insurance_value: 50,
    }];

    const sfProducts = productsList.map((p: any) => ({
      quantity: Number(p.quantity) || 1,
      weight: Math.max(Number(p.weight) || 0.3, 0.01),
      height: Math.max(Number(p.height) || 2, 2),
      width: Math.max(Number(p.width) || 11, 11),
      length: Math.max(Number(p.length) || 16, 16),
    }));

    // Soma do valor declarado para seguro
    const totalValue = productsList.reduce(
      (sum: number, p: any) => sum + (Number(p.insurance_value) || 50) * (Number(p.quantity) || 1),
      0
    );

    // Filtrar serviços ativos
    let enabledServices: Record<string, boolean> | null = null;
    try {
      const raw = integration.enabled_services;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (typeof parsed === "object" && !Array.isArray(parsed)) enabledServices = parsed;
      }
    } catch {}

    // Define quais service_ids enviar ao SuperFrete
    const allServiceIds = [1, 2, 17, 3]; // PAC, SEDEX, Mini Envios, .Package
    const filteredIds = allServiceIds.filter((id) => {
      if (!enabledServices) return true;
      const name = SERVICE_NAMES[id];
      return enabledServices[name] !== false;
    });
    const servicesParam = filteredIds.join(",");

    const fromCep = integration.from_cep.replace(/\D/g, "");
    const toCep = to_postal_code.replace(/\D/g, "");

    const shouldUseInsurance = totalValue >= 25.63;

    const requestBody = {
      from: { postal_code: fromCep },
      to: { postal_code: toCep },
      services: servicesParam,
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: shouldUseInsurance ? totalValue : 0,
        use_insurance_value: shouldUseInsurance,
      },
      products: sfProducts,
    };

    console.log("[superfrete-shipping] API request:", JSON.stringify(requestBody));

    const response = await fetch(`${baseUrl}/calculator`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.access_token}`,
        "User-Agent": "OrderZap (suporte@orderzaps.com)",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[superfrete-shipping] API status:", response.status);
    console.log("[superfrete-shipping] API response:", responseText.substring(0, 800));

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: parseSuperFreteError(responseText),
          details: responseText,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = JSON.parse(responseText);
    const services = Array.isArray(data) ? data : [];

    const validOptions = services
      .filter((s: any) => !s.error && (s.price !== undefined && s.price !== null))
      .filter((s: any) => {
        if (!enabledServices) return true;
        const name = SERVICE_NAMES[s.id] || s.name;
        return enabledServices[name] !== false;
      })
      .map((s: any) => {
        const friendlyName = SERVICE_NAMES[s.id] || s.name || "SuperFrete";
        return {
          id: `superfrete_${s.id}`,
          service_id: s.id,
          name: friendlyName,
          service_name: friendlyName,
          company: { name: "SuperFrete", picture: "" },
          price: s.price,
          custom_price: s.price,
          delivery_time: s.delivery_time ? `${s.delivery_time} dias úteis` : "Consulte",
          custom_delivery_time: s.delivery_time,
          provider: "superfrete",
        };
      });

    console.log("[superfrete-shipping] Valid options:", validOptions.length);

    return new Response(
      JSON.stringify({
        success: true,
        shipping_options: validOptions,
        provider: "superfrete",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[superfrete-shipping] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
