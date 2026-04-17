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

// Default service codes - can vary per contract
const DEFAULT_SERVICE_CODES: Record<string, string> = {
  PAC: "03298",
  SEDEX: "03220",
  "Mini Envios": "04227",
};

// Alternative service codes used by some contracts
const ALT_SERVICE_CODES: Record<string, string> = {
  PAC: "04669",
  SEDEX: "04162",
  "Mini Envios": "04227",
};

/**
 * Sanitize phone to digits only, max 11 digits (DDD + number).
 * Returns clean string or null if invalid.
 */
function sanitizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let clean = phone.replace(/\D/g, "");
  // Remove country code 55
  if (clean.startsWith("55") && clean.length >= 12) clean = clean.slice(2);
  // Remove leading 0
  if (clean.startsWith("0") && clean.length >= 11) clean = clean.slice(1);
  if (clean.length >= 10 && clean.length <= 11) return clean;
  return null;
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

interface PrePostagemLookup {
  idPrePostagem: string;
  codigoObjeto?: string;
  status?: string;
}

const TRACKING_POLL_ATTEMPTS = 2;
const TRACKING_POLL_INTERVAL_MS = 800;

// Retry configuration for label PDF download
const PDF_RETRY_ATTEMPTS = 3;
const PDF_RETRY_DELAYS_MS = [1500, 3000, 5000]; // wait before each attempt

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPrePostagemLookup(data: any, fallbackId = ""): PrePostagemLookup {
  const idPrePostagem =
    data?.id ??
    data?.idPrePostagem ??
    data?.prePostagem?.id ??
    data?.prepostagem?.id ??
    fallbackId;

  const codigoObjeto =
    data?.codigoObjeto ??
    data?.objetoPostal?.codigoObjeto ??
    data?.prePostagem?.codigoObjeto ??
    data?.prePostagem?.objetoPostal?.codigoObjeto ??
    data?.prepostagem?.codigoObjeto ??
    data?.prepostagem?.objetoPostal?.codigoObjeto;

  const rawStatus =
    data?.statusAtual?.descricao ??
    data?.status?.descricao ??
    data?.situacao?.descricao ??
    data?.statusAtualDescricao ??
    data?.statusDescricao ??
    data?.statusAtual ??
    data?.status ??
    data?.situacao;

  return {
    idPrePostagem,
    codigoObjeto,
    status: rawStatus != null ? String(rawStatus) : undefined,
  };
}

function buildPendingPrePostagemMessage(prePostagem: PrePostagemLookup): string {
  const statusText = prePostagem.status ? ` (status: ${prePostagem.status})` : "";
  return `Pré-postagem ${prePostagem.idPrePostagem} criada nos Correios${statusText}, mas nem o código de rastreio nem o PDF ficaram disponíveis. Tente baixar a etiqueta novamente em alguns segundos.`;
}

function buildPrePostagemPayload(
  cartaoPostagem: string,
  idCorreios: string,
  sender: SenderInfo,
  order: any,
  serviceCode: string,
  includePhone: boolean = true,
  cnpjRemetente: string = "",
) {
  const senderPhone = includePhone ? sanitizePhone(sender.telefone) : null;
  const recipientPhone = includePhone ? sanitizePhone(order.customer_phone) : null;

  const remetente: Record<string, unknown> = {
    nome: (sender.nome || "").substring(0, 50),
    endereco: {
      cep: sender.cep.replace(/\D/g, ""),
      logradouro: (sender.logradouro || "").substring(0, 50),
      numero: (sender.numero || "S/N").substring(0, 6),
      complemento: (sender.complemento || "").substring(0, 30),
      bairro: (sender.bairro || "").substring(0, 30),
      cidade: (sender.cidade || "").toUpperCase().substring(0, 30),
      uf: (sender.uf || "").toUpperCase().substring(0, 2),
    },
  };
  // Add CNPJ/CPF if available (stored in scope field)
  if (cnpjRemetente) {
    const cleanCnpj = cnpjRemetente.replace(/\D/g, "");
    if (cleanCnpj.length >= 11 && cleanCnpj.length <= 14) {
      remetente.cpfCnpj = cleanCnpj;
    }
  }
  if (senderPhone) {
    remetente.dddCelular = senderPhone.substring(0, 2);
    remetente.celular = senderPhone.substring(2, 11);
  }

  // Determinar região do destinatário baseada na UF
  const destUf = (order.customer_state || "").toUpperCase().substring(0, 2);
  const UF_TO_REGIAO: Record<string, string> = {
    AC: "N", AM: "N", AP: "N", PA: "N", RO: "N", RR: "N", TO: "N",
    AL: "NE", BA: "NE", CE: "NE", MA: "NE", PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE",
    DF: "CO", GO: "CO", MT: "CO", MS: "CO",
    ES: "SE", MG: "SE", RJ: "SE", SP: "SE",
    PR: "SU", RS: "SU", SC: "SU",
  };

  const destinatario: Record<string, unknown> = {
    nome: (order.customer_name || "Destinatário").substring(0, 50),
    endereco: {
      cep: (order.customer_cep || "").replace(/\D/g, ""),
      logradouro: (order.customer_street || "").substring(0, 50),
      numero: (order.customer_number || "S/N").substring(0, 6),
      complemento: (order.customer_complement || "").substring(0, 30),
      bairro: (order.customer_neighborhood || "").substring(0, 30),
      cidade: (order.customer_city || "").toUpperCase().substring(0, 30),
      uf: destUf,
      regiao: UF_TO_REGIAO[destUf] || "",
    },
  };
  if (recipientPhone) {
    destinatario.dddCelular = recipientPhone.substring(0, 2);
    destinatario.celular = recipientPhone.substring(2, 11);
  }

  const valorDeclarado = Math.max(1, order.total_amount || 1);

  const payload: Record<string, unknown> = {
    idCorreios: idCorreios,
    numeroCartaoPostagem: cartaoPostagem,
    remetente,
    destinatario,
    codigoServico: serviceCode,
    pesoInformado: String(Math.max(300, Math.round((order.weight || 0.3) * 1000))),
    codigoFormatoObjetoInformado: "2",
    alturaInformada: "10",
    larguraInformada: "16",
    comprimentoInformado: "20",
    modalidadePagamento: "1",
    cienteObjetoNaoProibido: "1",
    itensDeclaracaoConteudo: [
      {
        conteudo: "Mercadoria",
        quantidade: "1",
        valor: valorDeclarado.toFixed(2),
      },
    ],
  };

  return payload;
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
    // Filter out "null" strings and find first real message
    const msgs = (d.msgs || []).filter((m: unknown) => m && m !== "null");
    const causa = d.causa ? d.causa.replace("ApiNegocioRuntimeException: ", "").trim() : "";
    errorMsg = msgs[0]?.texto || msgs[0] || causa || d.msg || d.message || d.erros?.[0]?.mensagem || `Erro desconhecido (${status}): ${responseText.substring(0, 200)}`;
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
  idCorreios: string,
  sender: SenderInfo,
  order: any,
  serviceCode: string,
  cnpjRemetente: string = "",
): Promise<PrePostagemLookup> {
  let payload = buildPrePostagemPayload(cartaoPostagem, idCorreios, sender, order, serviceCode, true, cnpjRemetente);

  console.log("[correios-labels] Creating pre-postagem for order:", order.id, "service:", serviceCode);
  console.log("[correios-labels] Payload:", JSON.stringify(payload));

  let { response, responseText } = await sendPrePostagemRequest(token, payload);
  console.log("[correios-labels] Pre-postagem response status:", response.status, "body:", responseText.substring(0, 1000));

  // Retry: without phone
  if (!response.ok && isPhoneRelatedCorreiosError(responseText)) {
    payload = buildPrePostagemPayload(cartaoPostagem, idCorreios, sender, order, serviceCode, false, cnpjRemetente);
    console.warn("[correios-labels] Retrying without phone for order:", order.id);
    ({ response, responseText } = await sendPrePostagemRequest(token, payload));
    console.log("[correios-labels] Retry (no phone) status:", response.status, "body:", responseText.substring(0, 1000));
  }

  if (!response.ok) {
    throw new Error(getCorreiosErrorMessage(responseText, response.status));
  }

  const data = JSON.parse(responseText);
  const lookup = extractPrePostagemLookup(data);

  if (!lookup.idPrePostagem) {
    console.error("[correios-labels] Missing pre-postagem ID in response:", JSON.stringify(data));
    throw new Error("Resposta da API não contém o ID da pré-postagem");
  }

  console.log(
    `[correios-labels] Pré-postagem criada | id: ${lookup.idPrePostagem} | statusAtual: ${lookup.status ?? 'desconhecido'} | codigoObjeto: ${lookup.codigoObjeto ?? 'ausente'}`,
  );

  if (!lookup.codigoObjeto) {
    console.warn(
      "[correios-labels] Pre-postagem criada sem código de rastreio imediato:",
      JSON.stringify({ orderId: order.id, idPrePostagem: lookup.idPrePostagem, status: lookup.status }),
    );
  }

  return lookup;
}

async function fetchPrePostagemDetails(token: string, idPrePostagem: string): Promise<PrePostagemLookup> {
  console.log("[correios-labels] Fetching pre-postagem details for:", idPrePostagem);

  const response = await fetch(
    `https://api.correios.com.br/prepostagem/v1/prepostagens/${idPrePostagem}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    },
  );

  const responseText = await response.text();
  console.log("[correios-labels] Pre-postagem details status:", response.status, "body:", responseText.substring(0, 1000));

  if (!response.ok) {
    throw new Error(getCorreiosErrorMessage(responseText, response.status));
  }

  const data = JSON.parse(responseText);
  const lookup = extractPrePostagemLookup(data, idPrePostagem);

  if (!lookup.idPrePostagem) {
    throw new Error("Resposta da consulta da pré-postagem não contém ID");
  }

  return lookup;
}

async function waitForTrackingCode(
  token: string,
  prePostagem: PrePostagemLookup,
  orderId: number,
): Promise<PrePostagemLookup> {
  if (prePostagem.codigoObjeto) {
    return prePostagem;
  }

  let lastLookup = prePostagem;

  for (let attempt = 1; attempt <= TRACKING_POLL_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleep(TRACKING_POLL_INTERVAL_MS);
    }

    try {
      const currentLookup = await fetchPrePostagemDetails(token, prePostagem.idPrePostagem);
      lastLookup = { ...lastLookup, ...currentLookup };

      console.log(
        "[correios-labels] Tracking poll attempt:",
        JSON.stringify({
          orderId,
          attempt,
          idPrePostagem: lastLookup.idPrePostagem,
          codigoObjeto: lastLookup.codigoObjeto,
          status: lastLookup.status,
        }),
      );

      if (lastLookup.codigoObjeto) {
        return lastLookup;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn("[correios-labels] Tracking poll failed:", JSON.stringify({ orderId, attempt, errMsg }));
    }
  }

  return lastLookup;
}

async function fetchLabelPdf(token: string, idPrePostagem: string): Promise<{ status: number; pdfBase64?: string; errorText?: string }> {
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
    return { status: response.status, errorText: errText.substring(0, 500) };
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { status: response.status, pdfBase64: btoa(binary) };
}

async function fetchLabelPdfWithRetry(token: string, idPrePostagem: string): Promise<{ pdfBase64?: string; bytes?: number; lastStatus?: number; lastError?: string }> {
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= PDF_RETRY_ATTEMPTS; attempt++) {
    const delayMs = PDF_RETRY_DELAYS_MS[attempt - 1] ?? 3000;
    console.log(
      `[correios-labels] Tentativa ${attempt}/${PDF_RETRY_ATTEMPTS} de download do rótulo | idPrePostagem: ${idPrePostagem} | aguardando ${(delayMs / 1000).toFixed(1)}s...`,
    );
    await sleep(delayMs);

    try {
      const result = await fetchLabelPdf(token, idPrePostagem);
      lastStatus = result.status;

      if (result.pdfBase64) {
        // Approximate raw byte size from base64 length
        const bytes = Math.floor((result.pdfBase64.length * 3) / 4);
        console.log(
          `[correios-labels] Rótulo baixado com sucesso | idPrePostagem: ${idPrePostagem} | tamanho: ${bytes} bytes`,
        );
        return { pdfBase64: result.pdfBase64, bytes, lastStatus };
      }

      if (result.status === 404) {
        console.warn(
          `[correios-labels] Rótulo ainda não disponível (404) | tentativa ${attempt}/${PDF_RETRY_ATTEMPTS} | idPrePostagem: ${idPrePostagem}`,
        );
        lastError = result.errorText;
        continue;
      }

      // Non-404 error: log and stop retrying
      console.error(
        `[correios-labels] Erro ao baixar rótulo (status ${result.status}) | idPrePostagem: ${idPrePostagem} | corpo: ${result.errorText ?? ''}`,
      );
      lastError = result.errorText;
      break;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[correios-labels] Erro inesperado | etapa: download_rotulo (tentativa ${attempt}/${PDF_RETRY_ATTEMPTS}) | mensagem: ${errMsg} | detalhes: ${JSON.stringify(error, Object.getOwnPropertyNames(error || {}))}`,
      );
      lastError = errMsg;
    }
  }

  console.warn(
    `[correios-labels] Rótulo não disponível após ${PDF_RETRY_ATTEMPTS} tentativas | idPrePostagem: ${idPrePostagem} | retornando pendente`,
  );
  return { lastStatus, lastError };
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
    const cnpjRemetente = integration.scope || "";

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

      // Parse custom service codes from MeusCorreiosServiceCodes (stored in a separate field or integration config)
      const parsedServiceCodes: Record<string, string> = {};

      const results: PrePostagemResult[] = [];

      for (const order of orders) {
        try {
          const serviceKey = service_overrides?.[String(order.id)] || "PAC";
          const serviceCode = parsedServiceCodes[serviceKey] || DEFAULT_SERVICE_CODES[serviceKey] || DEFAULT_SERVICE_CODES.PAC;

          if (!order.customer_cep || !order.customer_street) {
            results.push({
              orderId: order.id,
              success: false,
              error: "Endereço de destino incompleto (CEP ou rua ausente)",
            });
            continue;
          }

          // idCorreios na API PPN dos Correios é o CNPJ (sem máscara) da empresa contratante,
          // NÃO o nome de usuário do portal. Fallback para client_id apenas se CNPJ não estiver configurado.
          const idCorreios = (cnpjRemetente || "").replace(/\D/g, "") || credentials.clientId;
          const createdPrePostagem = await createPrePostagem(
            token, credentials.cartaoPostagem, idCorreios, senderInfo, order, serviceCode, cnpjRemetente,
          );
          const resolvedPrePostagem = await waitForTrackingCode(token, createdPrePostagem, order.id);
          const { idPrePostagem, codigoObjeto } = resolvedPrePostagem;

          let labelPdfBase64: string | undefined;
          try {
            labelPdfBase64 = await fetchLabelPdf(token, idPrePostagem);
          } catch (pdfErr) {
            console.error("[correios-labels] PDF fetch failed for order", order.id, pdfErr);
          }

          if (!codigoObjeto && !labelPdfBase64) {
            throw new Error(buildPendingPrePostagemMessage(resolvedPrePostagem));
          }

          const orderUpdate: Record<string, string> = {
            melhor_envio_shipment_id: idPrePostagem,
          };

          if (codigoObjeto) {
            orderUpdate.melhor_envio_tracking_code = codigoObjeto;
          } else {
            console.warn(
              "[correios-labels] Label PDF available before tracking code:",
              JSON.stringify({ orderId: order.id, idPrePostagem }),
            );
          }

          const { error: updateOrderError } = await supabase
            .from("orders")
            .update(orderUpdate)
            .eq("id", order.id)
            .eq("tenant_id", tenant_id);

          if (updateOrderError) {
            console.error("[correios-labels] Order update failed:", updateOrderError.message);
          }

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
