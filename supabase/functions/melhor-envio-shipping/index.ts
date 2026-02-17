import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Attempt to refresh the Melhor Envio access_token using the stored refresh_token.
 * Returns the new access_token on success, or null on failure.
 */
async function refreshMelhorEnvioToken(
  supabase: any,
  integration: any
): Promise<string | null> {
  const globalClientId = Deno.env.get("ME_CLIENT_ID") || Deno.env.get("MELHOR_ENVIO_CLIENT_ID");
  const globalClientSecret = Deno.env.get("ME_CLIENT_SECRET") || Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET");

  const clientId = integration.client_id || globalClientId;
  const clientSecret = integration.client_secret || globalClientSecret;

  if (!clientId || !clientSecret || !integration.refresh_token) {
    console.error("[melhor-envio-shipping] Missing credentials for token refresh");
    return null;
  }

  const baseUrl = integration.sandbox
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";

  try {
    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "OrderZaps/1.0",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[melhor-envio-shipping] Token refresh failed:", errText);

      // If refresh_token itself is invalid, deactivate and log
      if (res.status === 401 || errText.includes("invalid_grant")) {
        await supabase
          .from("shipping_integrations")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", integration.id);

        await supabase.from("audit_logs").insert({
          tenant_id: integration.tenant_id,
          entity: "integration",
          entity_id: "melhor_envio",
          action: "token_refresh_failed",
          meta: { error: "Refresh token expirado", requires_manual_reauth: true },
        });
      }
      return null;
    }

    const tokenData = await res.json();
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 2592000) * 1000);

    await supabase
      .from("shipping_integrations")
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt.toISOString(),
        token_type: tokenData.token_type || "Bearer",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    console.log("[melhor-envio-shipping] Token refreshed successfully");
    return tokenData.access_token;
  } catch (e) {
    console.error("[melhor-envio-shipping] Error refreshing token:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, to_postal_code, products } = await req.json();
    
    console.log("[melhor-envio-shipping] Request received:", { tenant_id, to_postal_code, products_count: products?.length });

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar integração de frete do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "melhor_envio")
      .eq("is_active", true)
      .single();

    console.log("[melhor-envio-shipping] Integration found:", !!integration, integrationError?.message);

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Configuração de frete não encontrada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ success: false, error: "Token do Melhor Envio não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.from_cep) {
      return new Response(
        JSON.stringify({ success: false, error: "CEP de origem não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if token is expiring soon (5 min buffer) and refresh proactively
    let accessToken = integration.access_token;
    if (integration.expires_at) {
      const expiresAt = new Date(integration.expires_at).getTime();
      const bufferMs = 5 * 60 * 1000;
      if (expiresAt - Date.now() < bufferMs) {
        console.log("[melhor-envio-shipping] Token expiring soon, refreshing proactively...");
        const newToken = await refreshMelhorEnvioToken(supabase, integration);
        if (newToken) {
          accessToken = newToken;
        }
      }
    }

    // Preparar produtos para cálculo
    const productsList = (products || []).map((p: any) => ({
      id: String(p.id || Math.random()),
      width: p.width || 16,
      height: p.height || 2,
      length: p.length || 20,
      weight: p.weight || 0.3,
      insurance_value: Number(p.insurance_value) || 1,
      quantity: Number(p.quantity) || 1
    }));

    if (productsList.length === 0) {
      productsList.push({
        id: "default",
        width: 16, height: 2, length: 20, weight: 0.3,
        insurance_value: 50, quantity: 1
      });
    }

    const totalInsuranceValue = productsList.reduce((sum: number, p: any) => 
      sum + (p.insurance_value * p.quantity), 0
    );

    const baseUrl = integration.sandbox 
      ? "https://sandbox.melhorenvio.com.br/api/v2" 
      : "https://melhorenvio.com.br/api/v2";

    const requestBody = {
      from: { postal_code: integration.from_cep.replace(/[^0-9]/g, '') },
      to: { postal_code: to_postal_code.replace(/[^0-9]/g, '') },
      products: productsList,
      options: { insurance_value: totalInsuranceValue, receipt: false, own_hand: false }
    };

    console.log("[melhor-envio-shipping] API request:", JSON.stringify(requestBody, null, 2));

    // Make the API call with auto-retry on 401
    let response = await fetch(`${baseUrl}/me/shipment/calculate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "OrderZaps/1.0"
      },
      body: JSON.stringify(requestBody)
    });

    // If 401 Unauthorized, try refreshing the token and retry once
    if (response.status === 401) {
      console.log("[melhor-envio-shipping] Got 401, attempting token refresh and retry...");
      await response.text(); // consume body
      const newToken = await refreshMelhorEnvioToken(supabase, integration);
      if (newToken) {
        accessToken = newToken;
        response = await fetch(`${baseUrl}/me/shipment/calculate`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "OrderZaps/1.0"
          },
          body: JSON.stringify(requestBody)
        });
      }
    }

    const responseText = await response.text();
    console.log("[melhor-envio-shipping] API response status:", response.status);
    console.log("[melhor-envio-shipping] API response:", responseText.substring(0, 500));

    if (!response.ok) {
      console.error("[melhor-envio-shipping] API error:", responseText);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao calcular frete com Melhor Envio", details: responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shippingData = JSON.parse(responseText);

    const validOptions = (Array.isArray(shippingData) ? shippingData : [])
      .filter((option: any) => !option.error && option.price)
      .map((option: any) => ({
        id: option.id,
        service_id: option.id,
        name: option.name,
        service_name: option.name,
        company: option.company,
        price: option.price,
        custom_price: option.custom_price || option.price,
        delivery_time: option.delivery_time ? `${option.delivery_time} dias úteis` : 'Consulte',
        custom_delivery_time: option.custom_delivery_time || option.delivery_time
      }));

    console.log("[melhor-envio-shipping] Valid options found:", validOptions.length);

    return new Response(
      JSON.stringify({ success: true, shipping_options: validOptions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[melhor-envio-shipping] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
