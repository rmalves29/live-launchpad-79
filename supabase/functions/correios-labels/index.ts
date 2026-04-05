import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    console.log("[correios-labels] Using cached token for tenant:", tenantId);
    return cached.token;
  }

  const { clientId, clientSecret, cartaoPostagem } = credentials;
  if (!clientId || !clientSecret) throw new Error("Credenciais dos Correios não configuradas (client_id/client_secret).");
  if (!cartaoPostagem) throw new Error("Cartão de Postagem não configurado (refresh_token).");

  console.log("[correios-labels] Authenticating with Correios API. clientId:", clientId, "cartao:", cartaoPostagem);

  const authUrl = "https://api.correios.com.br/token/v1/autentica/cartaopostagem";
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  const authResponse = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${basicAuth}` },
    body: JSON.stringify({ numero: cartaoPostagem }),
  });

  const responseText = await authResponse.text();
  console.log("[correios-labels] Auth response status:", authResponse.status, "body length:", responseText.length);

  if (!authResponse.ok) {
    let errorMessage = `Falha na autenticação Correios (${authResponse.status})`;
    try {
      const d = JSON.parse(responseText);
      errorMessage = d.msgs?.[0]?.texto || d.message || errorMessage;
      console.error("[correios-labels] Auth error details:", JSON.stringify(d));
    } catch {
      console.error("[correios-labels] Auth error raw:", responseText.substring(0, 500));
    }
    throw new Error(errorMessage);
  }

  const tokenData = JSON.parse(responseText);
  if (!tokenData.token) throw new Error("Token não retornado pela API dos Correios");

  const expiresAt = tokenData.expiraEm ? new Date(tokenData.expiraEm) : new Date(Date.now() + 55 * 60 * 1000);
  tokenCacheMap.set(tenantId, { token: tokenData.token, expiresAt });
  console.log("[correios-labels] Token obtained successfully, expires:", expiresAt.toISOString());
  return tokenData.token;
}

const SERVICE_CODES: Record<string, string> = {
  PAC: "03298",
  SEDEX: "03220",
  "Mini Envios": "04227",
};

/**
 * Correios PPN expects recipient phone as 0 + DDD + number (12 digits)
 * Example: 011999253224. If unavailable, send 000000000000.
 */
function sanitizePhoneForCorreios(phone: string | null | undefined): string {
  if (!phone) return "000000000000";

  let clean = phone.replace(/\D/g, "");

  if (clean.startsWith("55") && clean.length >= 12) {
    clean = clean.slice(2);
  }

  if (clean.startsWith("0") && clean.length >= 11) {
    clean = clean.slice(1);
  }

  if (clean.length > 11) {
    clean = clean.slice(-11);
  }

  if (clean.length === 10 || clean.length === 11) {
    return `0${clean}`;
  }

  return "000000000000";
}

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

function buildPrePostagemPayload(
  cartaoPostagem: string,
  sender: SenderInfo,
  order: any,
  serviceCode: string,
  phoneMode: "full" | "zeros" | "omit" = "full",
) {
  const senderPhone = sanitizePhoneForCorreios(sender.telefone);
  const recipientPhone = sanitizePhoneForCorreios(order.customer_phone);

  const remetente: Record<string, unknown> = {
    nome: sender.nome,
    logradouro: sender.logradouro,
    numero: sender.numero,
    complemento: sender.complemento || "",
    bairro: sender.bairro,
    cep: sender.cep.replace(/\D/g, ""),
    cidade: sender.cidade,
    uf: (sender.uf || "").toUpperCase(),
  };

  const destinatario: Record<string, unknown> = {
    nome: order.customer_name || "Destinatário",
    logradouro: order.customer_street || "",
    numero: order.customer_number || "S/N",
    complemento: order.customer_complement || "",
    bairro: order.customer_neighborhood || "",
    cep: (order.customer_cep || "").replace(/\D/g, ""),
    cidade: order.customer_city || "",
    uf: (order.customer_state || "").toUpperCase(),
  };

  if (phoneMode === "full") {
    remetente.celular = senderPhone;
    destinatario.celular = recipientPhone;
  } else if (phoneMode === "zeros") {
    remetente.celular = "000000000000";
    destinatario.celular = "000000000000";
  }
  // phoneMode === "omit" → no celular field at all

  return {
    idCorreios: cartaoPostagem,
    remetente,
    destinatario,
    codigoServico: serviceCode,
    pesoInformado: Math.max(300, Math.round((order.weight || 0.3) * 1000)),
    objetoPostal: {
      tipo: "2",
      peso: Math.max(300, Math.round((order.weight || 0.3) * 1000)),
      comprimento: 20,
      largura: 16,
      altura: 10,
      diametro: 0,
    },
    servicos_adicionais: [],
  };
}

async function sendPrePostagemRequest(token: string, payload: Record<string, unknown>) {
  const response = await fetch("https://api.correios.com.br/prepostagem/v1/prepostagens", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  return { response, responseText };
}

function getCorreiosErrorMessage(responseText: string, status: number): string {
  let errorMsg = `Erro na pré-postagem (${status})`;
  try {
    const d = JSON.parse(responseText);
    errorMsg = d.msgs?.[0]?.texto || d.msgs?.[0] || d.msg || d.message || d.erros?.[0]?.mensagem || errorMsg;
  } catch {
    // mantém mensagem padrão
  }
  return errorMsg;
}

function isPhoneRelatedCorreiosError(responseText: string): boolean {
  const normalized = responseText.toLowerCase();
  return normalized.includes("celular") || normalized.includes("telefone");
}

async function createPrePostagem(
  token: string,
  cartaoPostagem: string,
  sender: SenderInfo,
  order: any,
  serviceCode: string,
): Promise<{ idPrePostagem: string; codigoObjeto: string }> {
  let payload = buildPrePostagemPayload(cartaoPostagem, sender, order, serviceCode, true);

  console.log("[correios-labels] Creating pre-postagem for order:", order.id, "service:", serviceCode);
  console.log("[correios-labels] Payload:", JSON.stringify(payload));

  let { response, responseText } = await sendPrePostagemRequest(token, payload);
  console.log("[correios-labels] Pre-postagem response status:", response.status, "body:", responseText.substring(0, 1000));

  if (!response.ok && isPhoneRelatedCorreiosError(responseText)) {
    payload = buildPrePostagemPayload(cartaoPostagem, sender, order, serviceCode, false);
    console.warn("[correios-labels] Retrying pre-postagem without phone numbers for order:", order.id);
    console.log("[correios-labels] Retry payload:", JSON.stringify(payload));

    ({ response, responseText } = await sendPrePostagemRequest(token, payload));
    console.log("[correios-labels] Retry pre-postagem response status:", response.status, "body:", responseText.substring(0, 1000));
  }

  if (!response.ok) {
    throw new Error(getCorreiosErrorMessage(responseText, response.status));
  }

  const data = JSON.parse(responseText);
  const idPrePostagem = data.id || data.idPrePostagem;
  const codigoObjeto = data.codigoObjeto || data.objetoPostal?.codigoObjeto;

  if (!idPrePostagem || !codigoObjeto) {
    console.error("[correios-labels] Missing ID/tracking in response:", JSON.stringify(data));
    throw new Error("Resposta da API não contém ID ou código de rastreio");
  }

  return { idPrePostagem, codigoObjeto };
}

async function fetchLabelPdf(token: string, idPrePostagem: string): Promise<string> {
  console.log("[correios-labels] Fetching label PDF for:", idPrePostagem);
  const response = await fetch(
    `https://api.correios.com.br/prepostagem/v1/prepostagens/${idPrePostagem}/rotulo`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/pdf",
      },
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("[correios-labels] Label PDF error:", response.status, errText.substring(0, 500));
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
    console.log("[correios-labels] Action:", action, "Tenant:", tenant_id);

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

    if (intError) {
      console.error("[correios-labels] DB error fetching integration:", intError.message);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar integração: " + intError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!integration) {
      console.error("[correios-labels] No active correios integration found for tenant:", tenant_id);
      return new Response(
        JSON.stringify({ success: false, error: "Integração Correios não configurada ou inativa" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[correios-labels] Integration found:", integration.id, "client_id:", integration.client_id);

    // Handle save_sender FIRST (before authentication)
    if (action === "save_sender") {
      const { sender } = body;
      console.log("[correios-labels] Saving sender data:", JSON.stringify(sender));
      const { error: updateError } = await supabase
        .from("shipping_integrations")
        .update({ webhook_secret: JSON.stringify(sender) })
        .eq("id", integration.id);

      if (updateError) {
        console.error("[correios-labels] Save sender error:", updateError.message);
        throw updateError;
      }

      console.log("[correios-labels] Sender saved successfully for integration:", integration.id);
      return new Response(
        JSON.stringify({ success: true }),
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

    console.log("[correios-labels] Sender info loaded:", JSON.stringify({ nome: senderInfo.nome, cidade: senderInfo.cidade, uf: senderInfo.uf }));

    if (!senderInfo.nome || !senderInfo.logradouro || !senderInfo.cidade || !senderInfo.uf) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("name")
        .eq("id", tenant_id)
        .maybeSingle();
      if (!senderInfo.nome && tenant?.name) senderInfo.nome = tenant.name;
      if (!senderInfo.logradouro) {
        console.error("[correios-labels] Sender address incomplete");
        return new Response(
          JSON.stringify({ success: false, error: "Configure o endereço do remetente antes de gerar etiquetas" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const token = await getCorreiosToken(credentials, tenant_id);

    if (action === "create_prepostagem") {
      const { order_ids, service_overrides } = body;
      console.log("[correios-labels] Creating pre-postagens for orders:", order_ids);

      if (!order_ids || order_ids.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhum pedido selecionado" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .in("id", order_ids)
        .eq("tenant_id", tenant_id);

      if (ordersError || !orders || orders.length === 0) {
        console.error("[correios-labels] Orders fetch error:", ordersError?.message);
        return new Response(
          JSON.stringify({ success: false, error: "Pedidos não encontrados" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      console.log("[correios-labels] Found", orders.length, "orders to process");

      const results: PrePostagemResult[] = [];

      for (const order of orders) {
        try {
          const serviceKey = service_overrides?.[String(order.id)] || "PAC";
          const serviceCode = SERVICE_CODES[serviceKey] || SERVICE_CODES.PAC;

          if (!order.customer_cep || !order.customer_street) {
            results.push({
              orderId: order.id,
              success: false,
              error: "Endereço de destino incompleto (CEP ou rua ausente)",
            });
            continue;
          }

          const { idPrePostagem, codigoObjeto } = await createPrePostagem(
            token, credentials.cartaoPostagem, senderInfo, order, serviceCode,
          );

          let labelPdfBase64: string | undefined;
          try {
            labelPdfBase64 = await fetchLabelPdf(token, idPrePostagem);
          } catch (pdfErr) {
            console.error("[correios-labels] PDF fetch failed for order", order.id, pdfErr);
          }

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

          console.log("[correios-labels] ✅ Success for order", order.id, "tracking:", codigoObjeto);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[correios-labels] ❌ Error for order", order.id, errMsg);
          results.push({ orderId: order.id, success: false, error: errMsg });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log("[correios-labels] Completed:", successCount, "/", results.length, "successful");

      return new Response(
        JSON.stringify({
          success: successCount > 0,
          results,
          summary: `${successCount}/${results.length} etiquetas geradas com sucesso`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[correios-labels] ❌ Top-level error:", errMsg);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
