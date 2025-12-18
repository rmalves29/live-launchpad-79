import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🔄 [SYNC-TRACKING] Iniciando sincronização automática de rastreios...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar todos os pedidos com shipment_id mas sem tracking_code
    const { data: ordersWithoutTracking, error: ordersError } = await supabase
      .from("orders")
      .select("id, tenant_id, melhor_envio_shipment_id, customer_phone, customer_name")
      .not("melhor_envio_shipment_id", "is", null)
      .or("melhor_envio_tracking_code.is.null,melhor_envio_tracking_code.eq.")
      .eq("is_paid", true);

    if (ordersError) {
      console.error("❌ [SYNC-TRACKING] Erro ao buscar pedidos:", ordersError);
      throw ordersError;
    }

    console.log(`📦 [SYNC-TRACKING] Encontrados ${ordersWithoutTracking?.length || 0} pedidos para verificar`);

    if (!ordersWithoutTracking || ordersWithoutTracking.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum pedido para sincronizar", synced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Agrupar pedidos por tenant para buscar integração
    const tenantOrders = new Map<string, typeof ordersWithoutTracking>();
    for (const order of ordersWithoutTracking) {
      const existing = tenantOrders.get(order.tenant_id) || [];
      existing.push(order);
      tenantOrders.set(order.tenant_id, existing);
    }

    let syncedCount = 0;
    let messagesCount = 0;

    for (const [tenantId, orders] of tenantOrders) {
      // Buscar integração Melhor Envio do tenant
      const { data: shippingIntegration } = await supabase
        .from("shipping_integrations")
        .select("access_token, sandbox")
        .eq("tenant_id", tenantId)
        .eq("provider", "melhor_envio")
        .eq("is_active", true)
        .maybeSingle();

      if (!shippingIntegration) {
        console.log(`⚠️ [SYNC-TRACKING] Tenant ${tenantId} não tem integração Melhor Envio ativa`);
        continue;
      }

      // Buscar integração Z-API do tenant
      const { data: zapiIntegration } = await supabase
        .from("integration_whatsapp")
        .select("zapi_instance_id, zapi_token, zapi_client_token")
        .eq("tenant_id", tenantId)
        .eq("provider", "zapi")
        .eq("is_active", true)
        .maybeSingle();

      const baseUrl = shippingIntegration.sandbox
        ? "https://sandbox.melhorenvio.com.br/api/v2"
        : "https://www.melhorenvio.com.br/api/v2";

      // Verificar cada pedido
      for (const order of orders) {
        try {
          console.log(`🔍 [SYNC-TRACKING] Verificando pedido ${order.id} - Shipment: ${order.melhor_envio_shipment_id}`);

          const response = await fetch(`${baseUrl}/me/shipment/tracking`, {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
              "Authorization": `Bearer ${shippingIntegration.access_token}`,
              "User-Agent": "VendaLive/1.0"
            },
            body: JSON.stringify({ orders: [order.melhor_envio_shipment_id] })
          });

          if (!response.ok) {
            console.error(`❌ [SYNC-TRACKING] Erro ao consultar Melhor Envio para pedido ${order.id}`);
            continue;
          }

          const data = await response.json();
          const shipmentData = data[order.melhor_envio_shipment_id];

          if (shipmentData?.tracking) {
            console.log(`✅ [SYNC-TRACKING] Tracking encontrado para pedido ${order.id}: ${shipmentData.tracking}`);

            // Atualizar tracking no pedido
            await supabase
              .from("orders")
              .update({ melhor_envio_tracking_code: shipmentData.tracking })
              .eq("id", order.id);

            syncedCount++;

            // Enviar WhatsApp se tiver integração Z-API
            if (zapiIntegration) {
              try {
                // Buscar template de rastreio
                const { data: template } = await supabase
                  .from("whatsapp_templates")
                  .select("content")
                  .eq("tenant_id", tenantId)
                  .eq("type", "TRACKING")
                  .maybeSingle();

                const defaultTemplate = `📦 *Pedido Enviado!*

Olá{{customer_name}}! 🎉

Seu pedido *#{{order_id}}* foi enviado!

🚚 *Código de Rastreio:* {{tracking_code}}

🔗 *Rastreie seu pedido:*
https://www.melhorrastreio.com.br/rastreio/{{tracking_code}}

⏳ _O rastreio pode demorar até 2 dias úteis para aparecer no sistema._

Obrigado pela preferência! 💚`;

                let messageContent = template?.content || defaultTemplate;

                const customerName = order.customer_name ? `, ${order.customer_name}` : '';
                messageContent = messageContent
                  .replace(/\{\{customer_name\}\}/g, customerName)
                  .replace(/\{\{order_id\}\}/g, String(order.id))
                  .replace(/\{\{tracking_code\}\}/g, shipmentData.tracking)
                  .replace(/\{\{shipped_at\}\}/g, new Date().toLocaleDateString('pt-BR'));

                // Normalizar telefone
                let phone = order.customer_phone.replace(/\D/g, "");
                if (!phone.startsWith("55")) {
                  phone = "55" + phone;
                }

                // Enviar via Z-API
                const zapiUrl = `https://api.z-api.io/instances/${zapiIntegration.zapi_instance_id}/token/${zapiIntegration.zapi_token}/send-text`;
                
                const headers: Record<string, string> = {
                  "Content-Type": "application/json",
                };
                
                if (zapiIntegration.zapi_client_token) {
                  headers["Client-Token"] = zapiIntegration.zapi_client_token;
                }

                const zapiResponse = await fetch(zapiUrl, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ phone, message: messageContent }),
                });

                if (zapiResponse.ok) {
                  const zapiResult = await zapiResponse.json();
                  console.log(`📱 [SYNC-TRACKING] WhatsApp enviado para pedido ${order.id}`);

                  // Registrar mensagem
                  await supabase.from("whatsapp_messages").insert({
                    tenant_id: tenantId,
                    phone: order.customer_phone,
                    message: messageContent,
                    type: "outgoing",
                    order_id: order.id,
                    sent_at: new Date().toISOString(),
                    zapi_message_id: zapiResult.messageId || null,
                  });

                  messagesCount++;
                }
              } catch (whatsappError) {
                console.error(`❌ [SYNC-TRACKING] Erro ao enviar WhatsApp para pedido ${order.id}:`, whatsappError);
              }
            }
          } else {
            console.log(`⏳ [SYNC-TRACKING] Pedido ${order.id} ainda sem tracking (status: ${shipmentData?.status || 'unknown'})`);
          }
        } catch (orderError) {
          console.error(`❌ [SYNC-TRACKING] Erro ao processar pedido ${order.id}:`, orderError);
        }
      }
    }

    console.log(`✅ [SYNC-TRACKING] Sincronização concluída: ${syncedCount} rastreios atualizados, ${messagesCount} mensagens enviadas`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sincronização concluída`,
        synced: syncedCount,
        messagesSent: messagesCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("❌ [SYNC-TRACKING] Erro crítico:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
