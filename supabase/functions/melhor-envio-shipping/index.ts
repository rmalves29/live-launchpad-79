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
        JSON.stringify({ 
          success: false, 
          error: "Configuração de frete não encontrada" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Token do Melhor Envio não configurado" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.from_cep) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "CEP de origem não configurado" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Se não houver produtos, usar um produto padrão
    if (productsList.length === 0) {
      productsList.push({
        id: "default",
        width: 16,
        height: 2,
        length: 20,
        weight: 0.3,
        insurance_value: 50,
        quantity: 1
      });
    }

    // Calcular valor total para seguro
    const totalInsuranceValue = productsList.reduce((sum: number, p: any) => 
      sum + (p.insurance_value * p.quantity), 0
    );

    const baseUrl = integration.sandbox 
      ? "https://sandbox.melhorenvio.com.br/api/v2" 
      : "https://melhorenvio.com.br/api/v2";

    const requestBody = {
      from: {
        postal_code: integration.from_cep.replace(/[^0-9]/g, '')
      },
      to: {
        postal_code: to_postal_code.replace(/[^0-9]/g, '')
      },
      products: productsList,
      options: {
        insurance_value: totalInsuranceValue,
        receipt: false,
        own_hand: false
      }
    };

    console.log("[melhor-envio-shipping] API request:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${baseUrl}/me/shipment/calculate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${integration.access_token}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "OrderZaps/1.0"
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log("[melhor-envio-shipping] API response status:", response.status);
    console.log("[melhor-envio-shipping] API response:", responseText.substring(0, 500));

    if (!response.ok) {
      console.error("[melhor-envio-shipping] API error:", responseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Erro ao calcular frete com Melhor Envio",
          details: responseText
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shippingData = JSON.parse(responseText);

    // Filtrar opções válidas (sem erros)
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
      JSON.stringify({ 
        success: true, 
        shipping_options: validOptions 
      }),
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
