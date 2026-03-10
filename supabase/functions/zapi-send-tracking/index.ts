import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  antiBlockDelayLive, 
  logAntiBlockDelay, 
  addMessageVariation,
  simulateTyping
} from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id, tenant_id, tracking_code, shipped_at } = await req.json();
    
    console.log("📦 [TRACKING] Iniciando envio de rastreio:", { order_id, tenant_id, tracking_code });

    if (!order_id || !tenant_id || !tracking_code) {
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetros obrigatórios: order_id, tenant_id, tracking_code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_phone, customer_name, total_amount, unique_order_id")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      console.error("❌ [TRACKING] Pedido não encontrado:", orderError);
      return new Response(
        JSON.stringify({ success: false, error: "Pedido não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar integração Z-API do tenant
    const { data: integration, error: integrationError } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapi")
      .eq("is_active", true)
      .maybeSingle();

    if (integrationError || !integration) {
      console.error("❌ [TRACKING] Integração Z-API não encontrada:", integrationError);
      return new Response(
        JSON.stringify({ success: false, error: "Integração Z-API não configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar template de rastreio (ou usar padrão)
    const { data: template } = await supabase
      .from("whatsapp_templates")
      .select("content")
      .eq("tenant_id", tenant_id)
      .eq("type", "TRACKING")
      .maybeSingle();

    // Template padrão se não existir
    const defaultTemplate = `📦 *Pedido Enviado!*

Olá{{customer_name}}! 🎉

Seu pedido *#{{order_id}}* foi enviado!

🚚 *Código de Rastreio:* {{tracking_code}}
📅 *Data de Envio:* {{shipped_at}}

🔗 *Rastreie seu pedido:*
https://www.melhorrastreio.com.br/rastreio/{{tracking_code}}

⏳ _O rastreio pode demorar até 2 dias úteis para aparecer no sistema._

Obrigado pela preferência! 💚`;

    let messageContent = template?.content || defaultTemplate;

    // Formatar data de envio
    const shippedDate = shipped_at 
      ? new Date(shipped_at).toLocaleDateString('pt-BR') 
      : new Date().toLocaleDateString('pt-BR');

    // Substituir variáveis
    const customerName = order.customer_name ? `, ${order.customer_name}` : '';
    messageContent = messageContent
      .replace(/\{\{customer_name\}\}/g, customerName)
      .replace(/\{\{order_id\}\}/g, order.unique_order_id || String(order.id))
      .replace(/\{\{tracking_code\}\}/g, tracking_code)
      .replace(/\{\{shipped_at\}\}/g, shippedDate);

    // Normalizar telefone
    let phone = order.customer_phone.replace(/\D/g, "");
    if (!phone.startsWith("55")) {
      phone = "55" + phone;
    }

    console.log("📱 [TRACKING] Enviando mensagem para:", phone);

    // Simulate typing indicator (3-5 seconds)
    console.log("⌨️ [TRACKING] Simulating typing...");
    await simulateTyping(
      integration.zapi_instance_id,
      integration.zapi_token,
      integration.zapi_client_token,
      phone
    );

    // Apply anti-block delay
    const delayMs = await antiBlockDelayLive();
    logAntiBlockDelay('zapi-send-tracking', delayMs);

    // Add message variation
    messageContent = addMessageVariation(messageContent);

    // Enviar mensagem via Z-API
    const zapiUrl = `https://api.z-api.io/instances/${integration.zapi_instance_id}/token/${integration.zapi_token}/send-text`;
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (integration.zapi_client_token) {
      headers["Client-Token"] = integration.zapi_client_token;
    }

    const zapiResponse = await fetch(zapiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        phone,
        message: messageContent,
      }),
    });

    const zapiResult = await zapiResponse.json();
    console.log("📡 [TRACKING] Resposta Z-API:", zapiResult);

    if (!zapiResponse.ok) {
      console.error("❌ [TRACKING] Erro Z-API:", zapiResult);

      // Log de falha
      await supabase.from("whatsapp_messages").insert({
        tenant_id,
        phone: order.customer_phone,
        message: `❌ FALHA ao enviar rastreio ${tracking_code} - Erro: ${JSON.stringify(zapiResult).substring(0, 300)}`,
        type: "system_log",
        order_id: order.id,
        created_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: false, error: "Erro ao enviar mensagem", details: zapiResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log de sucesso
    await supabase.from("whatsapp_messages").insert({
      tenant_id,
      phone: order.customer_phone,
      message: messageContent,
      type: "outgoing",
      order_id: order.id,
      sent_at: new Date().toISOString(),
      zapi_message_id: zapiResult.messageId || null,
    });

    console.log("✅ [TRACKING] Mensagem de rastreio enviada com sucesso!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Mensagem de rastreio enviada",
        messageId: zapiResult.messageId 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [TRACKING] Erro crítico:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
