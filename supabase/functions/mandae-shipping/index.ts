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
    
    console.log("[mandae-shipping] Request received:", { tenant_id, to_postal_code, products_count: products?.length });

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

    // Buscar integração Mandae do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "mandae")
      .eq("is_active", true)
      .single();

    console.log("[mandae-shipping] Integration found:", !!integration, integrationError?.message);

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Configuração Mandae não encontrada" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Token Mandae não configurado" 
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

    // Calcular dimensões e peso total
    let totalWeight = 0;
    let totalValue = 0;
    let maxHeight = 0;
    let maxWidth = 0;
    let maxLength = 0;

    const productsList = products || [];
    
    if (productsList.length === 0) {
      // Produto padrão para cálculo
      totalWeight = 0.3;
      totalValue = 50;
      maxHeight = 2;
      maxWidth = 16;
      maxLength = 20;
    } else {
      productsList.forEach((p: any) => {
        const qty = Number(p.quantity) || 1;
        totalWeight += (p.weight || 0.3) * qty;
        totalValue += (p.insurance_value || 50) * qty;
        maxHeight = Math.max(maxHeight, p.height || 2);
        maxWidth = Math.max(maxWidth, p.width || 16);
        maxLength = Math.max(maxLength, p.length || 20);
      });
    }

    // Garantir peso mínimo de 300g
    totalWeight = Math.max(totalWeight, 0.3);

    const cleanCep = to_postal_code.replace(/[^0-9]/g, '');
    
    // Mandae API - Calcular frete
    const baseUrl = integration.sandbox 
      ? "https://sandbox.api.mandae.com.br/v2" 
      : "https://api.mandae.com.br/v2";

    const requestBody = {
      postalCode: cleanCep,
      declaredValue: totalValue,
      weight: totalWeight,
      height: maxHeight,
      width: maxWidth,
      length: maxLength
    };

    console.log("[mandae-shipping] API request:", JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${baseUrl}/postalcodes/${cleanCep}/rates`, {
      method: "POST",
      headers: {
        "Authorization": integration.access_token,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log("[mandae-shipping] API response status:", response.status);
    console.log("[mandae-shipping] API response:", responseText.substring(0, 500));

    if (!response.ok) {
      console.error("[mandae-shipping] API error:", responseText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Erro ao calcular frete com Mandae",
          details: responseText
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shippingData = JSON.parse(responseText);

    // Mapear resposta do Mandae para formato padrão
    // Mandae retorna array de shippingServices
    const services = shippingData.shippingServices || shippingData || [];
    
    const validOptions = (Array.isArray(services) ? services : [])
      .filter((option: any) => option.price || option.value)
      .map((option: any) => ({
        id: `mandae_${option.id || option.name?.toLowerCase().replace(/\s/g, '_')}`,
        service_id: option.id || option.name,
        name: option.name || option.description || 'Mandae',
        service_name: option.name || option.description || 'Mandae',
        company: { name: 'Mandae', picture: '' },
        price: option.price || option.value,
        custom_price: option.price || option.value,
        delivery_time: option.days ? `${option.days} dias úteis` : (option.deliveryTime || 'Consulte'),
        custom_delivery_time: option.days || option.deliveryTime,
        provider: 'mandae'
      }));

    console.log("[mandae-shipping] Valid options found:", validOptions.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        shipping_options: validOptions,
        provider: 'mandae'
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[mandae-shipping] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
