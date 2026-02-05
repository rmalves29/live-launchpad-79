import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { simulateTyping } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface SendMessageRequest {
  tenant_id: string;
  phone: string;
  message: string;
  mediaUrl?: string;
  caption?: string;
  messageType?: 'text' | 'image' | 'document';
}

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[zapi-send-message] Error fetching credentials:", error);
    return { error: "Erro ao buscar credenciais Z-API" };
  }

  if (!integration) {
    return { error: "Integração Z-API não configurada para este tenant" };
  }

  if (!integration.zapi_instance_id || !integration.zapi_token) {
    return { error: "Credenciais Z-API incompletas (Instance ID ou Token faltando)" };
  }

  return {
    instanceId: integration.zapi_instance_id,
    token: integration.zapi_token,
    clientToken: integration.zapi_client_token || ''
  };
}

function formatPhoneNumber(phone: string): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // Add Brazil country code if not present
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

async function sendTextMessage(baseUrl: string, token: string, clientToken: string, phone: string, message: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (clientToken) headers['Client-Token'] = clientToken;
  
  const response = await fetch(`${baseUrl}/send-text`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, message })
  });
  
  return response;
}

async function sendImageMessage(baseUrl: string, token: string, clientToken: string, phone: string, imageUrl: string, caption: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (clientToken) headers['Client-Token'] = clientToken;
  
  const response = await fetch(`${baseUrl}/send-image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, image: imageUrl, caption })
  });
  
  return response;
}

async function sendDocumentMessage(baseUrl: string, token: string, clientToken: string, phone: string, documentUrl: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (clientToken) headers['Client-Token'] = clientToken;
  
  const response = await fetch(`${baseUrl}/send-document`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, document: documentUrl })
  });
  
  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    const body: SendMessageRequest = await req.json();
    const { tenant_id, phone, message, mediaUrl, caption, messageType = 'text' } = body;

    console.log(`[${timestamp}] [zapi-send-message] Sending ${messageType} to ${phone} for tenant ${tenant_id}`);

    if (!tenant_id || !phone || !message) {
      return new Response(
        JSON.stringify({ error: "tenant_id, phone e message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Z-API credentials
    const credentials = await getZAPICredentials(supabase, tenant_id);
    if ('error' in credentials) {
      console.error(`[zapi-send-message] Credentials error: ${credentials.error}`);
      return new Response(
        JSON.stringify({ error: credentials.error, sent: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instanceId, token, clientToken } = credentials;
    const baseUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}`;
    const formattedPhone = formatPhoneNumber(phone);

    console.log(`[zapi-send-message] Formatted phone: ${formattedPhone}`);

    // Simulate typing indicator (3-5 seconds)
    console.log(`[zapi-send-message] Simulating typing for ${formattedPhone}...`);
    await simulateTyping(instanceId, token, clientToken, formattedPhone);

    let response;
    
    try {
      switch (messageType) {
        case 'image':
          if (!mediaUrl) {
            return new Response(
              JSON.stringify({ error: "mediaUrl é obrigatório para envio de imagem" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          response = await sendImageMessage(baseUrl, token, clientToken, formattedPhone, mediaUrl, caption || '');
          break;
          
        case 'document':
          if (!mediaUrl) {
            return new Response(
              JSON.stringify({ error: "mediaUrl é obrigatório para envio de documento" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          response = await sendDocumentMessage(baseUrl, token, clientToken, formattedPhone, mediaUrl);
          break;
          
        case 'text':
        default:
          response = await sendTextMessage(baseUrl, token, clientToken, formattedPhone, message);
          break;
      }
    } catch (fetchError: any) {
      console.error(`[zapi-send-message] Fetch error: ${fetchError.message}`);
      return new Response(
        JSON.stringify({ 
          error: "Erro ao conectar com Z-API", 
          message: fetchError.message,
          sent: false 
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responseText = await response.text();
    console.log(`[zapi-send-message] Response status: ${response.status}, body: ${responseText.substring(0, 200)}`);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    const isSuccess = response.status >= 200 && response.status < 300;

    // Log the message in database
    try {
      await supabase.from('whatsapp_messages').insert({
        tenant_id,
        phone: formattedPhone,
        message: message.substring(0, 500),
        type: 'outgoing',
        sent_at: new Date().toISOString()
      });
    } catch (logError) {
      console.error('[zapi-send-message] Error logging message:', logError);
    }

    return new Response(
      JSON.stringify({
        sent: isSuccess,
        status: response.status,
        phone: formattedPhone,
        messageId: responseData.messageId || responseData.zapiMessageId || null,
        response: responseData
      }),
      { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: any) {
    console.error(`[${timestamp}] [zapi-send-message] Error:`, error.message);
    
    return new Response(
      JSON.stringify({ 
        error: `Erro interno: ${error.message}`,
        sent: false
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
