import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const { action, tenant_id, message, phone, mediaUrl, caption } = await req.json();

    console.log(`[${timestamp}] [zapi-proxy] Action: ${action}, Tenant: ${tenant_id}`);

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

    // Get Z-API integration config for this tenant
    const { data: integration, error: integrationError } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError) {
      console.error("[zapi-proxy] Error fetching integration:", integrationError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar configuração de integração" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration) {
      return new Response(
        JSON.stringify({ 
          error: "Integração WhatsApp não configurada",
          message: "Configure as credenciais Z-API nas configurações"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (integration.provider !== 'zapi') {
      return new Response(
        JSON.stringify({ 
          error: "Provedor incorreto",
          message: "Esta integração não está configurada para Z-API"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integration.zapi_instance_id || !integration.zapi_token) {
      return new Response(
        JSON.stringify({ 
          error: "Credenciais Z-API não configuradas",
          message: "Configure Instance ID e Token nas configurações"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const instanceId = integration.zapi_instance_id;
    const token = integration.zapi_token;
    const clientToken = integration.zapi_client_token;
    const baseUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}`;

    let endpoint = "";
    let method = "GET";
    let body: any = null;

    switch (action) {
      case "status":
        endpoint = "/status";
        method = "GET";
        break;

      case "qr-code":
      case "get_qr":
        endpoint = "/qr-code/image";
        method = "GET";
        break;

      case "disconnect":
      case "stop":
        endpoint = "/disconnect";
        method = "GET";
        break;

      case "restart":
        endpoint = "/restart";
        method = "GET";
        break;

      case "send-text":
        endpoint = "/send-text";
        method = "POST";
        body = {
          phone: phone,
          message: message
        };
        break;

      case "send-image":
        endpoint = "/send-image";
        method = "POST";
        body = {
          phone: phone,
          image: mediaUrl,
          caption: caption || ""
        };
        break;

      case "send-document":
        endpoint = "/send-document";
        method = "POST";
        body = {
          phone: phone,
          document: mediaUrl
        };
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const targetUrl = `${baseUrl}${endpoint}`;
    console.log(`[zapi-proxy] Calling: ${method} ${targetUrl}`);

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    
    // Add Client-Token header if configured
    if (clientToken) {
      headers["Client-Token"] = clientToken;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && method === "POST") {
      fetchOptions.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    fetchOptions.signal = controller.signal;

    let response;
    try {
      response = await fetch(targetUrl, fetchOptions);
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            error: "Timeout: Z-API demorou muito para responder",
            status: "timeout"
          }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Não foi possível conectar à Z-API",
          message: fetchError.message,
          status: "connection_error"
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = response.headers.get("content-type") || "";
    console.log(`[zapi-proxy] Response status: ${response.status}`);

    // Handle QR code response
    if (action === "qr-code" || action === "get_qr") {
      // If response is binary image
      if (contentType.includes("image")) {
        const imageBuffer = await response.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
        const mimeType = contentType.split(";")[0];
        
        return new Response(
          JSON.stringify({ 
            qrCode: `data:${mimeType};base64,${base64}`,
            status: "qr_ready",
            hasQR: true
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // If response is JSON (Z-API sometimes returns base64 in JSON)
      try {
        const text = await response.text();
        console.log("[zapi-proxy] QR Response body:", text.substring(0, 500));
        const data = JSON.parse(text);
        
        // Z-API returns { value: "data:image/png;base64,..." }
        if (data.value && data.value.startsWith("data:image")) {
          return new Response(
            JSON.stringify({ 
              qrCode: data.value,
              status: "qr_ready",
              hasQR: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        // Connected or other status
        if (data.connected) {
          return new Response(
            JSON.stringify({ 
              status: "connected",
              message: "WhatsApp já está conectado",
              connected: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            error: "QR Code não disponível",
            message: data.error || "Tente novamente em alguns segundos",
            raw: data
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ 
            error: "Resposta inválida da Z-API",
            status: "parse_error"
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Parse JSON response for other actions

    // Map Z-API status to our format
    if (action === "status") {
      const isConnected = data.connected === true || data.smartphoneConnected === true;
      
      // Update connected phone in database if available
      if (isConnected && data.phoneConnected) {
        await supabase
          .from("integration_whatsapp")
          .update({ 
            connected_phone: data.phoneConnected,
            last_status_check: new Date().toISOString()
          })
          .eq("tenant_id", tenant_id);
      }

      return new Response(
        JSON.stringify({
          connected: isConnected,
          status: isConnected ? "connected" : "disconnected",
          message: isConnected ? "WhatsApp conectado via Z-API" : "WhatsApp desconectado",
          user: data.phoneConnected ? { phone: data.phoneConnected } : null,
          raw: data
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error("[zapi-proxy] Error:", error.message);
    
    return new Response(
      JSON.stringify({ 
        error: `Erro interno: ${error.message}`,
        status: "internal_error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
