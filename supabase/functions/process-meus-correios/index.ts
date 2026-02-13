import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MEUSCORREIOS_API_URL = "https://meuscorreios.app/rest/apimccriprepos";

// Default service codes dictionary (contract codes)
const DEFAULT_SERVICE_CODES: Record<string, string> = {
  PAC: "03298",
  SEDEX: "03220",
  "MINI ENVIOS": "04227",
  "SEDEX 12": "03140",
  "SEDEX HOJE": "03204",
  "PAC GRANDE": "03328",
};

/**
 * Parse service codes from integration webhook_secret field (JSON string)
 * Format: {"PAC":"03298","SEDEX":"03220",...}
 */
function getServiceCodes(integration: any): Record<string, string> {
  const raw = integration.webhook_secret;
  if (!raw) return { ...DEFAULT_SERVICE_CODES };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && !Array.isArray(parsed)) {
      // Merge with defaults so new codes are always available
      return { ...DEFAULT_SERVICE_CODES, ...parsed };
    }
  } catch {
    // Not JSON, ignore
  }
  return { ...DEFAULT_SERVICE_CODES };
}

/**
 * Resolve service code for an order based on observation text and per-order override
 */
function resolveService(
  serviceCodes: Record<string, string>,
  observation: string | null,
  overrideServiceCode?: string
): { code: string; name: string } {
  // If a specific service code was passed (manual override), use it directly
  if (overrideServiceCode) {
    // Find the name for this code
    const entry = Object.entries(serviceCodes).find(([_, c]) => c === overrideServiceCode);
    return {
      code: overrideServiceCode,
      name: entry ? entry[0] : `Código ${overrideServiceCode}`,
    };
  }

  // Auto-detect from observation
  if (observation) {
    const obs = observation.toUpperCase();
    if (obs.includes("SEDEX HOJE")) return { code: serviceCodes["SEDEX HOJE"] || "03204", name: "SEDEX HOJE" };
    if (obs.includes("SEDEX 12") || obs.includes("SEDEX12")) return { code: serviceCodes["SEDEX 12"] || "03140", name: "SEDEX 12" };
    if (obs.includes("PAC GRANDE")) return { code: serviceCodes["PAC GRANDE"] || "03328", name: "PAC GRANDE" };
    if (obs.includes("SEDEX")) return { code: serviceCodes["SEDEX"] || "03220", name: "SEDEX" };
    if (obs.includes("MINI")) return { code: serviceCodes["MINI ENVIOS"] || "04227", name: "MINI ENVIOS" };
  }

  // Default: PAC
  return { code: serviceCodes["PAC"] || "03298", name: "PAC" };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, order_ids, service_overrides } = body;
    // service_overrides: optional Record<number, string> mapping order_id -> service_code

    console.log("📦 [MeusCorreios] Request:", { tenant_id, order_count: order_ids?.length, has_overrides: !!service_overrides });

    if (!tenant_id || !order_ids?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id e order_ids são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch integration
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

    const tokenMeusCorreios = integration.token_type || "";
    const cartaoPostagem = integration.refresh_token || "";
    const codigoRemetente = integration.scope || "1";

    if (!tokenMeusCorreios) {
      return new Response(
        JSON.stringify({ success: false, error: "Token MeusCorreios não configurado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!cartaoPostagem) {
      return new Response(
        JSON.stringify({ success: false, error: "Cartão de Postagem não configurado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load service codes dictionary from integration
    const serviceCodes = getServiceCodes(integration);
    console.log("📦 [MeusCorreios] Service codes dictionary:", JSON.stringify(serviceCodes));

    // 2. Fetch tenant data
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("company_name, company_document, company_email, company_phone, company_address, company_number, company_complement, company_district, company_city, company_state, company_cep")
      .eq("id", tenant_id)
      .maybeSingle();

    if (!tenant || !tenant.company_cep) {
      const missing: string[] = [];
      if (!tenant) missing.push("empresa não encontrada");
      else {
        if (!tenant.company_cep) missing.push("CEP");
        if (!tenant.company_name) missing.push("Nome da empresa");
      }
      return new Response(
        JSON.stringify({ success: false, error: `Dados da empresa incompletos: ${missing.join(", ")}. Configure em Configurações > Empresa.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch orders
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

    // 4. WhatsApp integration
    const { data: whatsappIntegration } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token")
      .eq("tenant_id", tenant_id)
      .eq("provider", "zapi")
      .eq("is_active", true)
      .maybeSingle();

    const results: any[] = [];

    // 5. Process each order
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];

      if (order.melhor_envio_tracking_code) {
        results.push({ order_id: order.id, status: "skipped", message: "Já possui rastreio: " + order.melhor_envio_tracking_code });
        continue;
      }

      if (!order.customer_cep || !order.customer_name || !order.customer_street || !order.customer_city || !order.customer_state) {
        results.push({ order_id: order.id, status: "error", message: "Dados de endereço incompletos" });
        continue;
      }

      // Resolve service: check for manual override, then auto-detect from observation
      const overrideCode = service_overrides?.[String(order.id)] || null;
      const { code: servico, name: servicoNome } = resolveService(serviceCodes, order.observation, overrideCode);

      const payload = {
        parmIn: {
          Token: tokenMeusCorreios,
          dstxrmtcod: codigoRemetente,
          dstxcar: cartaoPostagem,
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
          objetos: [{
            dstxItem: 1,
            dstxsrv: servico,
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

      console.log(`📦 [MeusCorreios] Order #${order.id}: ${servicoNome} (${servico})`);

      try {
        const response = await fetch(MEUSCORREIOS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        const responseText = await response.text();
        console.log(`📦 [MeusCorreios] Response ${response.status} for #${order.id}:`, responseText.substring(0, 500));

        if (!response.ok) {
          results.push({ order_id: order.id, status: "error", message: `HTTP ${response.status}`, error_type: "http" });
          continue;
        }

        let data: any;
        try { data = JSON.parse(responseText); } catch {
          results.push({ order_id: order.id, status: "error", message: "Resposta não é JSON válido", error_type: "parse" });
          continue;
        }

        // Parse response - supports parmOut and SDTWSCriPrePosOut
        const sdtOut = data.parmOut || data.ParmOut || data.SDTWSCriPrePosOut || data.sdtwscripreposout || data;

        // Check general error
        const erroGeral = sdtOut.Erro || sdtOut.erro || data.Erro || data.erro;
        if (erroGeral && String(erroGeral).trim() !== "" && String(erroGeral).trim() !== "0") {
          results.push({ order_id: order.id, status: "error", message: `Erro API: ${erroGeral}`, error_type: "api" });
          continue;
        }

        // Check prepos
        const prepos = sdtOut.prepos || sdtOut.PrePos || data.prepos || data.PrePos || [];
        const preposList = Array.isArray(prepos) ? prepos : [prepos];
        const firstResult = preposList[0];

        if (!firstResult) {
          results.push({ order_id: order.id, status: "error", message: "Resposta sem dados de pré-postagem", error_type: "empty" });
          continue;
        }

        // Check item-level error
        const erroItem = firstResult.ErroItem || firstResult.erroItem || firstResult.Erro || firstResult.erro;
        if (erroItem && String(erroItem).trim() !== "" && String(erroItem).trim() !== "0") {
          const isServiceError = String(erroItem).includes("Definição Serviço") || String(erroItem).includes("Definicao Servico");

          results.push({
            order_id: order.id,
            status: "error",
            error_type: isServiceError ? "invalid_service" : "item",
            failed_service_code: servico,
            failed_service_name: servicoNome,
            message: isServiceError
              ? `Código "${servico}" (${servicoNome}) não é válido para seu cartão de postagem. Use o seletor de serviço para escolher outro código.`
              : `Erro: ${erroItem}`,
          });
          continue;
        }

        // Extract tracking
        const trackingCode = firstResult.etqSRO || firstResult.EtqSRO || firstResult.dstxetq || firstResult.Dstxetq || firstResult.codigoAwb || "";
        const labelPdf = firstResult.etqPDF || firstResult.EtqPDF || "";
        const lote = firstResult.dstxlot || firstResult.Dstxlot || firstResult.codectcod || "";

        if (!trackingCode) {
          results.push({ order_id: order.id, status: "error", message: "Rastreio não retornado", error_type: "no_tracking" });
          continue;
        }

        console.log(`✅ [MeusCorreios] #${order.id} → ${trackingCode}`);

        await supabase.from("orders").update({
          melhor_envio_tracking_code: trackingCode,
          tracking_updated_at: new Date().toISOString(),
        }).eq("id", order.id).eq("tenant_id", tenant_id);

        const resultEntry: any = {
          order_id: order.id,
          status: "success",
          tracking_code: trackingCode,
          lote,
          service_name: servicoNome,
          service_code: servico,
          label_pdf: !!labelPdf,
          label_base64: labelPdf || null,
        };

        // WhatsApp notification
        if (whatsappIntegration?.zapi_instance_id && whatsappIntegration?.zapi_token) {
          try {
            const trackingUrl = `https://rastreamento.correios.com.br/app/index.php?objeto=${trackingCode}`;
            const customerName = order.customer_name ? `, ${order.customer_name}` : "";
            const message = `📦 *Pedido Enviado!*\n\nOlá${customerName}! 🎉\n\nSeu pedido *#${order.unique_order_id || order.id}* foi enviado!\n\n🚚 *Código de Rastreio:* ${trackingCode}\n\n🔗 *Rastreie:*\n${trackingUrl}\n\nObrigado pela preferência! 💚`;

            let phone = order.customer_phone.replace(/\D/g, "");
            if (!phone.startsWith("55")) phone = "55" + phone;

            const zapiUrl = `https://api.z-api.io/instances/${whatsappIntegration.zapi_instance_id}/token/${whatsappIntegration.zapi_token}/send-text`;
            const zapiHeaders: Record<string, string> = { "Content-Type": "application/json" };
            if (whatsappIntegration.zapi_client_token) zapiHeaders["Client-Token"] = whatsappIntegration.zapi_client_token;

            await fetch(zapiUrl, { method: "POST", headers: zapiHeaders, body: JSON.stringify({ phone, message }), signal: AbortSignal.timeout(10000) });
            resultEntry.whatsapp_sent = true;
          } catch (e: any) {
            resultEntry.whatsapp_sent = false;
            resultEntry.whatsapp_error = e.message;
          }
        }

        results.push(resultEntry);
      } catch (apiErr: any) {
        results.push({ order_id: order.id, status: "error", message: `Erro: ${apiErr.message}`, error_type: "network" });
      }

      if (i < orders.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    const successCount = results.filter(r => r.status === "success").length;
    const errorCount = results.filter(r => r.status === "error").length;
    const skippedCount = results.filter(r => r.status === "skipped").length;

    console.log(`📊 [MeusCorreios] Done: ${successCount}✅ ${errorCount}❌ ${skippedCount}⏭️`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: { total: orders.length, success: successCount, errors: errorCount, skipped: skippedCount },
        results,
        available_services: serviceCodes,
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
