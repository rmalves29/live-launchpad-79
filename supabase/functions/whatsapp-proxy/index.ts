import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuração de timeouts
const FETCH_TIMEOUT_MS = 25000; // 25 segundos

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const { action, tenant_id } = await req.json();

    console.log(`[${timestamp}] [whatsapp-proxy] Action: ${action}, Tenant: ${tenant_id}`);

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

    // Map actions to Baileys backend routes v1.0
    switch (action) {
      case "qr":
      case "connect":
      case "start":
        endpoint = `/start/${tenant_id}`;
        method = "POST";
        break;
      case "status":
        endpoint = `/status/${tenant_id}`;
        method = "GET";
        break;
      case "get_qr":
        endpoint = `/qr/${tenant_id}`;
        method = "GET";
        break;
      case "disconnect":
      case "stop":
        endpoint = `/stop/${tenant_id}`;
        method = "POST";
        break;
      case "reset":
        // Reset = stop + start
        endpoint = `/stop/${tenant_id}`;
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

    // Criar AbortController para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    fetchOptions.signal = controller.signal;

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // Verificar se foi timeout
      if (fetchError.name === 'AbortError') {
        console.error("[whatsapp-proxy] Request timeout após", FETCH_TIMEOUT_MS, "ms");
        return new Response(
          JSON.stringify({ 
            error: "Timeout: Servidor demorou muito para responder",
            message: "Tente novamente em alguns segundos. O servidor pode estar ocupado.",
            status: "timeout"
          }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      console.error("[whatsapp-proxy] Fetch error:", fetchError.message);
      return new Response(
        JSON.stringify({ 
          error: "Não foi possível conectar ao servidor WhatsApp",
          message: `Erro de conexão: ${fetchError.message}`,
          serverUrl: serverUrl,
          status: "connection_error"
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    console.log(`[whatsapp-proxy] Response status: ${response.status}`);

    // Check if response is HTML (error page)
    if (contentType.includes("text/html")) {
      const htmlText = await response.text();
      console.error("[whatsapp-proxy] Received HTML response (likely error page)");
      
      return new Response(
        JSON.stringify({ 
          error: "Servidor retornou página HTML em vez de JSON",
          message: "Verifique se a URL do servidor está correta e o backend está rodando.",
          status: "invalid_response"
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to parse JSON
    let data;
    try {
      const text = await response.text();
      console.log("[whatsapp-proxy] Response body:", text.substring(0, 300));
      data = JSON.parse(text);
    } catch (e) {
      console.error("[whatsapp-proxy] Failed to parse JSON");
      return new Response(
        JSON.stringify({ 
          error: "Resposta inválida do servidor WhatsApp",
          status: "parse_error",
          httpStatus: response.status
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tratar códigos de status específicos
    
    // 429 - Rate limit / Cooldown
    if (response.status === 429) {
      console.log("[whatsapp-proxy] Cooldown ativo para tenant:", tenant_id);
      return new Response(
        JSON.stringify({
          ...data,
          status: "cooldown",
          message: data.message || "Aguarde antes de tentar novamente"
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 404 - Rota não encontrada (backend desatualizado)
    if (response.status === 404) {
      console.error("[whatsapp-proxy] Route not found - backend may be outdated");
      return new Response(
        JSON.stringify({ 
          error: "Rota não encontrada no servidor WhatsApp",
          message: "O backend precisa ser atualizado para v5.1. Faça redeploy no Railway.",
          status: "backend_outdated",
          targetUrl: targetUrl,
          backendResponse: data
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sucesso ou outros status
    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("[whatsapp-proxy] Error:", error.message);
    
    return new Response(
      JSON.stringify({ 
        error: `Erro interno: ${error.message}`,
        message: "Verifique os logs para mais detalhes",
        status: "internal_error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
