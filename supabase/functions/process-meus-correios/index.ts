import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEUSCORREIOS_API_URL = "https://meuscorreios.app/rest/apimccriprepos";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, order_ids } = await req.json();

    console.log("📦 [MeusCorreios] Request:", { tenant_id, order_count: order_ids?.length });

    if (!tenant_id || !order_ids?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id e order_ids são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Buscar integração Correios do tenant
    const { data: integration, error: intError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "meuscorreios")
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Correios não configurada ou inativa" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Token MeusCorreios stored in token_type field
    const tokenMeusCorreios = integration.token_type || "";
    // Cartão de postagem stored in refresh_token field
    const cartaoPostagem = integration.refresh_token || "";
    // Código do remetente stored in scope or default "1"
    const codigoRemetente = integration.scope || "1";

    if (!tokenMeusCorreios) {
      return new Response(
        JSON.stringify({ success: false, error: "Token MeusCorreios não configurado. Acesse Configurações > Tokens no MeusCorreios para gerar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!cartaoPostagem) {
      return new Response(
        JSON.stringify({ success: false, error: "Cartão de Postagem não configurado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar dados da empresa (remetente)
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("company_name, company_document, company_email, company_phone, company_address, company_number, company_complement, company_district, company_city, company_state, company_cep")
      .eq("id", tenant_id)
      .maybeSingle();

    console.log("📦 [MeusCorreios] Tenant data:", { name: tenant?.company_name, cep: tenant?.company_cep, city: tenant?.company_city, error: tenantError?.message });

    if (!tenant || !tenant.company_cep) {
      const missing: string[] = [];
      if (!tenant) missing.push("empresa não encontrada");
      else {
        if (!tenant.company_cep) missing.push("CEP");
        if (!tenant.company_name) missing.push("Nome da empresa");
        if (!tenant.company_address) missing.push("Endereço");
        if (!tenant.company_city) missing.push("Cidade");
        if (!tenant.company_state) missing.push("Estado");
      }
      return new Response(
        JSON.stringify({ success: false, error: `Dados da empresa incompletos: ${missing.join(", ")}. Configure em Configurações > Empresa.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Buscar pedidos selecionados
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, customer_name, customer_phone, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, customer_cep, total_amount, unique_order_id, melhor_envio_tracking_code, observation")
      .in("id", order_ids)
      .eq("tenant_id", tenant_id);

    if (ordersError || !orders?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhum pedido encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Buscar integração WhatsApp para notificação
    const { data: whatsappIntegration } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapi")
      .eq("is_active", true)
      .maybeSingle();

    const results: any[] = [];

    // 5. Processar cada pedido com delay de 500ms
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];

      // Skip if already has tracking code
      if (order.melhor_envio_tracking_code) {
        results.push({
          order_id: order.id,
          status: "skipped",
          message: "Já possui código de rastreio: " + order.melhor_envio_tracking_code,
        });
        continue;
      }

      // Validate required destination fields
      if (!order.customer_cep || !order.customer_name || !order.customer_street || !order.customer_city || !order.customer_state) {
        results.push({
          order_id: order.id,
          status: "error",
          message: "Dados de endereço incompletos (CEP, nome, rua, cidade ou UF faltando)",
        });
        continue;
      }

      // Determine service code from observation
      // MeusCorreios API requires service codes, not names
      let servico = "03298"; // PAC default
      let servicoNome = "PAC";
      if (order.observation) {
        const obs = order.observation.toUpperCase();
        if (obs.includes("SEDEX")) {
          servico = "03220";
          servicoNome = "SEDEX";
        } else if (obs.includes("MINI")) {
          servico = "04227";
          servicoNome = "MINI ENVIOS";
        }
      }

      // Build MeusCorreios payload
      // Try multiple service code formats since API docs are not public
      const payload = {
        parmIn: {
          Token: tokenMeusCorreios,
          dstxrmtcod: codigoRemetente,
          dstxcar: cartaoPostagem,
          dstxsrv: servico,
          dstnom: order.customer_name.substring(0, 55),
          dstnom2: "",
          dstend: (order.customer_street || "").substring(0, 55),
          dstendnum: (order.customer_number || "S/N").substring(0, 6),
          dstcpl: (order.customer_complement || "").substring(0, 55),
          dstbai: (order.customer_neighborhood || "").substring(0, 25),
          dstcid: (order.customer_city || "").substring(0, 40),
          dstest: (order.customer_state || "").substring(0, 2).toUpperCase(),
          dstxcep: (order.customer_cep || "").replace(/\D/g, ""),
          dstxemail: "",
          dstxcel: (order.customer_phone || "").replace(/\D/g, "").substring(0, 12),
          dstxnfi: String(order.unique_order_id || order.id).substring(0, 15),
          impetq: "PDF",
          servicos: [{ servico, codigo: servico }],
          objetos: [{
            dstxItem: 1,
            dstxsrv: servico,
            servico: servico,
            dstxobs: `Pedido #${order.unique_order_id || order.id}`,
            dstxpes: 500,
            dstxvo1: 10,
            dstxvo2: 16,
            dstxvo3: 20,
            dstxvd: order.total_amount || 0,
            dstxcob: 0,
          }],
        },
      };

      console.log(`📦 [MeusCorreios] Processing order #${order.id} with service: ${servicoNome} (code: ${servico})`);
      console.log(`📦 [MeusCorreios] Full payload:`, JSON.stringify(payload));

      try {
        const response = await fetch(MEUSCORREIOS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        const data = await response.json();
        console.log(`📦 [MeusCorreios] Response for order #${order.id}:`, JSON.stringify(data).substring(0, 500));

        // Check for general errors
        if (data.Erro) {
          results.push({
            order_id: order.id,
            status: "error",
            message: data.Erro,
          });
          continue;
        }

        // Check prepos results
        const prepos = data.prepos || data.PrePos || [];
        const firstResult = Array.isArray(prepos) ? prepos[0] : prepos;

        if (!firstResult) {
          results.push({
            order_id: order.id,
            status: "error",
            message: "Resposta inesperada da API MeusCorreios",
          });
          continue;
        }

        // Check item-level errors
        if (firstResult.ErroItem || firstResult.erroItem) {
          results.push({
            order_id: order.id,
            status: "error",
            message: firstResult.ErroItem || firstResult.erroItem,
          });
          continue;
        }

        // Extract tracking code (etiqueta)
        const trackingCode = firstResult.dstxetq || firstResult.Dstxetq || firstResult.codigoAwb || "";
        const labelPdf = firstResult.etqPDF || firstResult.EtqPDF || "";
        const lote = firstResult.dstxlot || firstResult.Dstxlot || "";

        if (!trackingCode) {
          results.push({
            order_id: order.id,
            status: "error",
            message: "Código de rastreio não retornado pela API",
          });
          continue;
        }

        console.log(`✅ [MeusCorreios] Order #${order.id} → tracking: ${trackingCode}, lote: ${lote}`);

        // Save tracking code to orders table
        await supabase
          .from("orders")
          .update({
            melhor_envio_tracking_code: trackingCode,
            tracking_updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)
          .eq("tenant_id", tenant_id);

        results.push({
          order_id: order.id,
          status: "success",
          tracking_code: trackingCode,
          lote,
          label_pdf: labelPdf ? true : false,
          label_base64: labelPdf || null,
        });

        // 6. Send WhatsApp notification if Z-API is configured
        if (whatsappIntegration?.zapi_instance_id && whatsappIntegration?.zapi_token) {
          try {
            const customerName = order.customer_name ? `, ${order.customer_name}` : "";
            const trackingUrl = `https://rastreamento.correios.com.br/app/index.php?objeto=${trackingCode}`;
            
            const message = `📦 *Pedido Enviado!*\n\nOlá${customerName}! 🎉\n\nSeu pedido *#${order.unique_order_id || order.id}* foi enviado!\n\n🚚 *Código de Rastreio:* ${trackingCode}\n\n🔗 *Rastreie seu pedido:*\n${trackingUrl}\n\n⏳ _O rastreio pode demorar até 2 dias úteis para aparecer no sistema._\n\nObrigado pela preferência! 💚`;

            let phone = order.customer_phone.replace(/\D/g, "");
            if (!phone.startsWith("55")) phone = "55" + phone;

            const zapiUrl = `https://api.z-api.io/instances/${whatsappIntegration.zapi_instance_id}/token/${whatsappIntegration.zapi_token}/send-text`;
            const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
            if (whatsappIntegration.zapi_client_token) {
              zapiHeaders["Client-Token"] = whatsappIntegration.zapi_client_token;
            }

            const zapiRes = await fetch(zapiUrl, {
              method: "POST",
              headers: zapiHeaders,
              body: JSON.stringify({ phone, message }),
              signal: AbortSignal.timeout(10000),
            });

            const zapiData = await zapiRes.json();
            console.log(`📱 [MeusCorreios] WhatsApp sent for order #${order.id}:`, zapiData.messageId || "no id");

            results[results.length - 1].whatsapp_sent = true;
          } catch (whatsappErr: any) {
            console.error(`⚠️ [MeusCorreios] WhatsApp failed for order #${order.id}:`, whatsappErr.message);
            results[results.length - 1].whatsapp_sent = false;
            results[results.length - 1].whatsapp_error = whatsappErr.message;
          }
        }

      } catch (apiErr: any) {
        console.error(`❌ [MeusCorreios] API error for order #${order.id}:`, apiErr.message);
        results.push({
          order_id: order.id,
          status: "error",
          message: `Erro na API: ${apiErr.message}`,
        });
      }

      // Delay 500ms between orders
      if (i < orders.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;
    const skippedCount = results.filter(r => r.status === "skipped").length;

    console.log(`📊 [MeusCorreios] Done: ${successCount} success, ${errorCount} errors, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: { total: orders.length, success: successCount, errors: errorCount, skipped: skippedCount },
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ [MeusCorreios] Critical error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
