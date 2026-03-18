import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const tokenCacheMap: Map<string, { token: string; expiresAt: Date }> = new Map();

interface CorreiosCredentials {
  clientId: string;
  clientSecret: string;
  cartaoPostagem: string;
}

async function getCorreiosToken(credentials: CorreiosCredentials, tenantId: string): Promise<string> {
  const cached = tokenCacheMap.get(tenantId);
  if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return cached.token;
  }

  const { clientId, clientSecret, cartaoPostagem } = credentials;
  if (!clientId || !clientSecret) throw new Error("Credenciais dos Correios não configuradas.");
  if (!cartaoPostagem) throw new Error("Cartão de Postagem não configurado.");

  const authUrl = "https://api.correios.com.br/token/v1/autentica/cartaopostagem";
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const authResponse = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${basicAuth}` },
    body: JSON.stringify({ numero: cartaoPostagem }),
  });

  const responseText = await authResponse.text();
  if (!authResponse.ok) {
    let errorMessage = `Falha na autenticação Correios (${authResponse.status})`;
    try { const d = JSON.parse(responseText); errorMessage = d.msgs?.[0]?.texto || d.message || errorMessage; } catch {}
    throw new Error(errorMessage);
  }

  const tokenData = JSON.parse(responseText);
  if (!tokenData.token) throw new Error("Token não retornado pela API dos Correios");

  const expiresAt = tokenData.expiraEm ? new Date(tokenData.expiraEm) : new Date(Date.now() + 55 * 60 * 1000);
  tokenCacheMap.set(tenantId, { token: tokenData.token, expiresAt });
  return tokenData.token;
}

// Service code mapping for contract services
const SERVICE_CODES: Record<string, string> = {
  PAC: "03298",
  SEDEX: "03220",
  "Mini Envios": "04227",
};

interface SenderInfo {
  nome: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  cidade: string;
  uf: string;
  telefone: string;
}

interface PrePostagemResult {
  orderId: number;
  success: boolean;
  trackingCode?: string;
  prePostagemId?: string;
  labelPdfBase64?: string;
  error?: string;
}

async function createPrePostagem(
  token: string,
  cartaoPostagem: string,
  sender: SenderInfo,
  order: any,
  serviceCode: string,
): Promise<{ idPrePostagem: string; codigoObjeto: string }> {
  const payload = {
    idCorreios: cartaoPostagem,
    remetente: {
      nome: sender.nome,
      logradouro: sender.logradouro,
      numero: sender.numero,
      complemento: sender.complemento || "",
      bairro: sender.bairro,
      cep: sender.cep.replace(/\D/g, ""),
      cidade: sender.cidade,
      uf: sender.uf,
      celular: sender.telefone?.replace(/\D/g, "") || "",
    },
    destinatario: {
      nome: order.customer_name || "Destinatário",
      logradouro: order.customer_street || "",
      numero: order.customer_number || "S/N",
      complemento: order.customer_complement || "",
      bairro: order.customer_neighborhood || "",
      cep: (order.customer_cep || "").replace(/\D/g, ""),
      cidade: order.customer_city || "",
      uf: order.customer_state || "",
      celular: order.customer_phone?.replace(/\D/g, "") || "",
    },
    codigoServico: serviceCode,
    pesoInformado: Math.max(300, Math.round((order.weight || 0.3) * 1000)), // grams, minimum 300g
    objetoPostal: {
      tipo: "2", // package
      peso: Math.max(300, Math.round((order.weight || 0.3) * 1000)),
      comprimento: 20,
      largura: 16,
      altura: 10,
      diametro: 0,
    },
    servicos_adicionais: [],
  };

  console.log("[correios-labels] Creating pre-postagem for order:", order.id, "service:", serviceCode);

  const response = await fetch("https://api.correios.com.br/prepostagem/v2/prepostagens", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  console.log("[correios-labels] Pre-postagem response status:", response.status);

  if (!response.ok) {
    let errorMsg = `Erro na pré-postagem (${response.status})`;
    try {
      const d = JSON.parse(responseText);
      errorMsg = d.msgs?.[0]?.texto || d.message || d.erros?.[0]?.mensagem || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const data = JSON.parse(responseText);
  const idPrePostagem = data.id || data.idPrePostagem;
  const codigoObjeto = data.codigoObjeto || data.objetoPostal?.codigoObjeto;

  if (!idPrePostagem || !codigoObjeto) {
    throw new Error("Resposta da API não contém ID ou código de rastreio");
  }

  return { idPrePostagem, codigoObjeto };
}

async function fetchLabelPdf(token: string, idPrePostagem: string): Promise<string> {
  const response = await fetch(
    `https://api.correios.com.br/prepostagem/v2/prepostagens/${idPrePostagem}/etiqueta`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/pdf",
      },
    },
  );

  if (!response.ok) {
    console.error("[correios-labels] Label PDF error:", response.status);
    throw new Error(`Erro ao gerar etiqueta PDF (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, tenant_id } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch integration credentials
    const { data: integration, error: intError } = await supabase
      .from("shipping_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("provider", "correios")
      .eq("is_active", true)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração Correios não configurada ou inativa" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const credentials: CorreiosCredentials = {
      clientId: integration.client_id || "",
      clientSecret: integration.client_secret || "",
      cartaoPostagem: integration.refresh_token || "",
    };

    // Parse sender info from webhook_secret (JSON)
    let senderInfo: SenderInfo = {
      nome: "", logradouro: "", numero: "", complemento: "",
      bairro: "", cep: integration.from_cep || "", cidade: "", uf: "", telefone: "",
    };
    try {
      const parsed = JSON.parse(integration.webhook_secret || "{}");
      senderInfo = { ...senderInfo, ...parsed, cep: integration.from_cep || parsed.cep || "" };
    } catch {}

    if (!senderInfo.nome || !senderInfo.logradouro || !senderInfo.cidade || !senderInfo.uf) {
      // Try to get from tenant
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", tenant_id)
        .maybeSingle();
      if (!senderInfo.nome && tenant?.name) senderInfo.nome = tenant.name;
      if (!senderInfo.logradouro) {
        return new Response(
          JSON.stringify({ success: false, error: "Configure o endereço do remetente antes de gerar etiquetas" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const token = await getCorreiosToken(credentials, tenant_id);

    if (action === "create_prepostagem") {
      const { order_ids, service_overrides } = body;
      if (!order_ids || order_ids.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhum pedido selecionado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Fetch orders
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .in("id", order_ids)
        .eq("tenant_id", tenant_id);

      if (ordersError || !orders || orders.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Pedidos não encontrados" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const results: PrePostagemResult[] = [];

      for (const order of orders) {
        try {
          // Determine service code
          const serviceKey = service_overrides?.[String(order.id)] || "PAC";
          const serviceCode = SERVICE_CODES[serviceKey] || SERVICE_CODES.PAC;

          // Validate destination address
          if (!order.customer_cep || !order.customer_street) {
            results.push({
              orderId: order.id,
              success: false,
              error: "Endereço de destino incompleto (CEP ou rua ausente)",
            });
            continue;
          }

          // Create pre-postagem
          const { idPrePostagem, codigoObjeto } = await createPrePostagem(
            token, credentials.cartaoPostagem, senderInfo, order, serviceCode,
          );

          // Try to get label PDF
          let labelPdfBase64: string | undefined;
          try {
            labelPdfBase64 = await fetchLabelPdf(token, idPrePostagem);
          } catch (pdfErr) {
            console.error("[correios-labels] PDF fetch failed for order", order.id, pdfErr);
          }

          // Update order with tracking code
          await supabase
            .from("orders")
            .update({ melhor_envio_tracking_code: codigoObjeto })
            .eq("id", order.id);

          results.push({
            orderId: order.id,
            success: true,
            trackingCode: codigoObjeto,
            prePostagemId: idPrePostagem,
            labelPdfBase64,
          });

          console.log("[correios-labels] Success for order", order.id, "tracking:", codigoObjeto);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[correios-labels] Error for order", order.id, errMsg);
          results.push({ orderId: order.id, success: false, error: errMsg });
        }
      }

      const successCount = results.filter((r) => r.success).length;

      return new Response(
        JSON.stringify({
          success: successCount > 0,
          results,
          summary: `${successCount}/${results.length} etiquetas geradas com sucesso`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "save_sender") {
      const { sender } = body;
      // Save sender info as JSON in webhook_secret field
      const { error: updateError } = await supabase
        .from("shipping_integrations")
        .update({ webhook_secret: JSON.stringify(sender) })
        .eq("id", integration.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[correios-labels] Error:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
