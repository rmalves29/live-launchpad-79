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
    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ valid: false, error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar integração do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "melhor_envio")
      .single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Integração não encontrada",
          needs_oauth: true,
          oauth_url: "https://melhorenvio.com.br"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.access_token) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Token não configurado",
          needs_oauth: true,
          oauth_url: "https://melhorenvio.com.br"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Testar o token chamando a API do Melhor Envio
    const baseUrl = integration.sandbox 
      ? "https://sandbox.melhorenvio.com.br/api/v2" 
      : "https://melhorenvio.com.br/api/v2";

    const meResponse = await fetch(`${baseUrl}/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${integration.access_token}`,
        "Accept": "application/json",
        "User-Agent": "OrderZaps/1.0"
      }
    });

    if (!meResponse.ok) {
      const errorText = await meResponse.text();
      console.error("Melhor Envio API error:", errorText);
      
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Token inválido ou expirado",
          needs_oauth: true,
          oauth_url: "https://melhorenvio.com.br"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userData = await meResponse.json();

    return new Response(
      JSON.stringify({ 
        valid: true,
        user_info: {
          name: userData.firstname + " " + (userData.lastname || ""),
          email: userData.email,
          company: userData.company?.name || "Pessoa Física"
        },
        integration_info: {
          sandbox: integration.sandbox,
          from_cep: integration.from_cep
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error testing Melhor Envio token:", error);
    return new Response(
      JSON.stringify({ valid: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
