import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, tenant_id } = await req.json();

    console.log(`[whatsapp-proxy] Action: ${action}, Tenant: ${tenant_id}`);

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get WhatsApp integration config for this tenant
    const { data: integration, error: integrationError } = await supabase
      .from("integration_whatsapp")
      .select("api_url, is_active")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError) {
      console.error("[whatsapp-proxy] Error fetching integration:", integrationError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar configuração de integração" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration || !integration.api_url) {
      console.log("[whatsapp-proxy] No integration URL configured for tenant:", tenant_id);
      return new Response(
        JSON.stringify({ 
          error: "URL do servidor WhatsApp não configurada",
          message: "Configure a URL do servidor nas configurações de integração"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serverUrl = integration.api_url.replace(/\/$/, ""); // Remove trailing slash
    console.log(`[whatsapp-proxy] Server URL: ${serverUrl}`);

    let endpoint = "";
    let method = "GET";
    let body: any = null;

    // Map actions to backend routes
    // Backend v5.0-stable uses: /start/:id, /status/:id, /disconnect/:id
    // Backend v2.0 uses: /api/whatsapp/start, /api/whatsapp/status/:id, etc.
    // Detecting based on response - trying v5.0 routes first
    switch (action) {
      case "qr":
      case "connect":
        endpoint = `/start/${tenant_id}`;
        method = "POST";
        break;
      case "status":
        endpoint = `/status/${tenant_id}`;
        method = "GET";
        break;
      case "disconnect":
        endpoint = `/disconnect/${tenant_id}`;
        method = "POST";
        break;
      case "reset":
        endpoint = `/reset/${tenant_id}`;
        method = "POST";
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const targetUrl = `${serverUrl}${endpoint}`;
    console.log(`[whatsapp-proxy] Calling: ${method} ${targetUrl}`);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    // Add body for POST requests
    if (method === "POST" && body) {
      fetchOptions.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
    } catch (fetchError) {
      console.error("[whatsapp-proxy] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ 
          error: "Não foi possível conectar ao servidor WhatsApp",
          message: `Erro de conexão: ${fetchError.message}`,
          serverUrl: serverUrl
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "";

    console.log(`[whatsapp-proxy] Response status: ${response.status}`);
    console.log(`[whatsapp-proxy] Content-Type: ${contentType}`);

    // Check if response is HTML (error page)
    if (contentType.includes("text/html")) {
      const htmlText = await response.text();
      console.error("[whatsapp-proxy] Received HTML response (likely error page)");
      console.log("[whatsapp-proxy] HTML preview:", htmlText.substring(0, 200));
      
      return new Response(
        JSON.stringify({ 
          error: "Servidor retornou página HTML em vez de JSON. Verifique se a URL do servidor está correta.",
          htmlPreview: htmlText.substring(0, 500)
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to parse JSON
    let data;
    try {
      const text = await response.text();
      console.log("[whatsapp-proxy] Response text:", text.substring(0, 500));
      data = JSON.parse(text);
    } catch (e) {
      console.error("[whatsapp-proxy] Failed to parse JSON");
      return new Response(
        JSON.stringify({ 
          error: "Resposta inválida do servidor WhatsApp",
          status: response.status
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If 404, the route doesn't exist on the backend
    if (response.status === 404) {
      console.error("[whatsapp-proxy] Route not found on backend");
      return new Response(
        JSON.stringify({ 
          error: "Rota não encontrada no servidor WhatsApp",
          message: "Verifique se o backend está atualizado e as rotas estão corretas.",
          targetUrl: targetUrl,
          backendResponse: data
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("[whatsapp-proxy] Error:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    
    return new Response(
      JSON.stringify({ 
        error: `Erro ao conectar com servidor WhatsApp: ${errorMessage}`,
        message: "Verifique se o servidor está online e acessível"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});