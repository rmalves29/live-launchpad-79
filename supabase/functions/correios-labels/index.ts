// supabase/functions/correios-labels/index.ts
// Edge Function: correios-labels
// Reescrita do zero com fluxo correto de geração de rótulo:
// 1. POST /prepostagem/v1/prepostagens/rotulo/assincrono/pdf -> idRecibo
// 2. Polling em GET /prepostagem/v1/prepostagens/rotulo/assincrono/{idRecibo}
// 3. Retorna PDF base64 ou pending: true
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CORREIOS_BASE = "https://api.correios.com.br";
const LOG_PREFIX = "[correios-labels]";

// ----- Cache de token em memória (válido enquanto a function estiver quente) -----
interface CorreiosCartaoData {
  contrato?: string | null;
  numero?: string | null;
  dr?: number | null;
}

interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
  cartaoData: CorreiosCartaoData;
}
const tokenCache = new Map<string, TokenCache>();

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function sanitizeDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "");
}

function sanitizeUF(uf: string | null | undefined): string {
  return (uf || "").trim().toUpperCase().slice(0, 2);
}

function sanitizePhone(phone: string | null | undefined): string {
  const digits = sanitizeDigits(phone);
  // Mantém DDD + número, remove código do país se vier com 55
  if (digits.length === 13 && digits.startsWith("55")) return digits.slice(2);
  if (digits.length === 12 && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

function sanitizeCNPJ(cnpj: string | null | undefined): string {
  return sanitizeDigits(cnpj);
}

function sanitizeCEP(cep: string | null | undefined): string {
  return sanitizeDigits(cep).slice(0, 8);
}

// Normaliza o JSON do remetente salvo em webhook_secret.
// Aceita tanto o formato achatado (logradouro/numero/bairro no nível raiz)
// quanto o formato aninhado (dentro de .endereco). Retorna sempre o formato
// que a API CWS dos Correios espera, garantindo telefone e endereço completos.
function normalizeRemetente(raw: any, fallbackCep: string): any {
  if (!raw) return null;
  const src = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!src || typeof src !== "object") return null;

  const end = src.endereco && typeof src.endereco === "object" ? src.endereco : {};

  const documento = sanitizeCNPJ(src.documento || src.cnpj || src.cpf || end.documento);
  const telefoneRaw = src.telefone || src.telefoneCelular || src.celular || end.telefone || "";
  const telefone = sanitizePhone(telefoneRaw);

  const logradouro = String(src.logradouro || end.logradouro || src.rua || end.rua || "").trim();
  const numero = String(src.numero || end.numero || "S/N").trim() || "S/N";
  const complemento = String(src.complemento || end.complemento || "").trim();
  const bairro = String(src.bairro || end.bairro || "").trim();
  const cidade = String(src.cidade || end.cidade || src.municipio || end.municipio || "").trim();
  const uf = sanitizeUF(src.uf || end.uf || src.estado || end.estado);
  const cep = sanitizeCEP(src.cep || end.cep || fallbackCep);

  const ddd = telefone.length >= 10 ? telefone.slice(0, 2) : "";
  const numeroTelefone = telefone.length >= 10 ? telefone.slice(2) : telefone;

  return {
    nome: String(src.nome || src.name || "").slice(0, 50),
    dddTelefone: ddd,
    telefone: numeroTelefone,
    dddCelular: ddd,
    celular: numeroTelefone,
    email: src.email || undefined,
    cpfCnpj: documento,
    endereco: {
      cep,
      logradouro: logradouro.slice(0, 50),
      numero: numero.slice(0, 6),
      complemento: complemento.slice(0, 30),
      bairro: bairro.slice(0, 30),
      cidade: cidade.slice(0, 50),
      uf,
    },
  };
}

// Declaração de conteúdo obrigatória para alguns serviços (ex: Mini Envios).
// Distribui o valor total do pedido em um único item genérico.
function buildDeclaracaoConteudo(totalAmount: number | null | undefined, observacao?: string): any[] {
  const valor = Number(totalAmount) > 0 ? Number(totalAmount) : 50;
  return [
    {
      conteudo: (observacao && observacao.trim()) ? observacao.trim().slice(0, 60) : "Acessórios femininos",
      quantidade: 1,
      valor: Number(valor.toFixed(2)),
    },
  ];
}

// ----- Autenticação com cache -----
async function getCorreiosToken(
  clientId: string,
  clientSecret: string,
  cartaoPostagem: string,
): Promise<{ token: string; cartaoData: CorreiosCartaoData }> {
  const cacheKey = `${clientId}:${cartaoPostagem}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    log("Token em cache reutilizado");
    return { token: cached.token, cartaoData: cached.cartaoData };
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const url = `${CORREIOS_BASE}/token/v1/autentica/cartaopostagem`;

  log("Autenticando | POST /token/v1/autentica/cartaopostagem");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ numero: cartaoPostagem }),
  });

  const text = await resp.text();
  log(`Auth status: ${resp.status} | body: ${text.slice(0, 500)}`);

  if (!resp.ok) {
    throw new Error(`Falha na autenticação Correios (${resp.status}): ${text}`);
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Resposta de autenticação inválida: ${text.slice(0, 200)}`);
  }

  const token = json.token as string | undefined;
  if (!token) {
    throw new Error(`Token não retornado pela API. Body: ${text.slice(0, 200)}`);
  }

  const cartaoToken = json.cartaoPostagem || {};
  const cartaoData: CorreiosCartaoData = {
    contrato: cartaoToken.contrato || null,
    numero: cartaoToken.numero || cartaoPostagem || null,
    dr: typeof cartaoToken.dr === "number" ? cartaoToken.dr : Number(cartaoToken.dr || 0) || null,
  };

  // Expira em ~24h, mas guardamos por 23h para segurança
  const expiresAt = Date.now() + 23 * 60 * 60 * 1000;
  tokenCache.set(cacheKey, { token, expiresAt, cartaoData });
  return { token, cartaoData };
}

// ----- Buscar credenciais do tenant -----
interface CorreiosCredentials {
  client_id: string;
  client_secret: string;
  cartao_postagem: string;
  contrato: string | null;
  from_cep: string;
  webhook_secret: string | null; // armazena JSON do remetente (sender)
  integration_id: string;
}

async function getCredentials(
  supabase: any,
  tenantId: string,
): Promise<CorreiosCredentials> {
  const { data, error } = await supabase
    .from("shipping_integrations")
    .select("id, client_id, client_secret, refresh_token, scope, from_cep, webhook_secret")
    .eq("tenant_id", tenantId)
    .eq("provider", "correios")
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar integração: ${error.message}`);
  if (!data) throw new Error("Integração Correios não configurada para este tenant");

  const record = data as Record<string, unknown>;
  const clientId = String(record.client_id || "");
  const clientSecret = String(record.client_secret || "");
  const cartaoPostagem = String(record.refresh_token || "");

  if (!clientId || !clientSecret || !cartaoPostagem) {
    throw new Error("Credenciais incompletas (client_id, client_secret e cartão de postagem são obrigatórios)");
  }

  return {
    client_id: clientId,
    client_secret: clientSecret,
    cartao_postagem: cartaoPostagem,
    contrato: record.scope ? String(record.scope) : null,
    from_cep: record.from_cep ? String(record.from_cep) : "",
    webhook_secret: record.webhook_secret ? String(record.webhook_secret) : null,
    integration_id: String(record.id || ""),
  };
}

// ----- ACTION: save_sender -----
async function actionSaveSender(
  supabase: any,
  tenantId: string,
  sender: Record<string, unknown>,
) {
  log("Salvando dados do remetente (sender)");
  const { error } = await supabase
    .from("shipping_integrations")
    .update({ webhook_secret: JSON.stringify(sender) })
    .eq("tenant_id", tenantId)
    .eq("provider", "correios");

  if (error) throw new Error(`Erro ao salvar remetente: ${error.message}`);
  return { success: true };
}

// ----- ACTION: download_label (fluxo novo) -----
interface DownloadLabelResult {
  success: boolean;
  labelPdfBase64?: string | null;
  pending?: boolean;
  error?: string;
  idRecibo?: string;
  idPrePostagem?: string;
  recreated?: boolean;
  details?: Record<string, unknown>;
}

// Detecta se um ID é provavelmente um UUID de outro provedor (ex: Melhor Envio)
// e portanto NÃO é um id válido de pré-postagem dos Correios.
// Pré-postagens dos Correios costumam ser strings sem hífens, hex/numéricas (ex: "84d744bde9004a1a..." ou "PRLSl03xKx...").
function isLikelyForeignId(id: string): boolean {
  if (!id) return true;
  // UUID v4 padrão: 8-4-4-4-12 com hífens
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return true;
  // Qualquer string com múltiplos hífens (não é o padrão dos Correios)
  if ((id.match(/-/g) || []).length >= 2) return true;
  return false;
}

async function pdfResponseToBase64(resp: Response): Promise<string> {
  const buf = await resp.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function tryDownloadPdfFromUrl(url: string, token: string) {
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf, application/json",
    },
  });

  const contentType = resp.headers.get("content-type") || "";
  if (resp.ok && contentType.includes("application/pdf")) {
    const base64 = await pdfResponseToBase64(resp);
    return { ok: true as const, base64, status: resp.status, contentType, bodyText: "" };
  }

  const bodyText = await resp.text();
  return { ok: false as const, status: resp.status, contentType, bodyText };
}

// Fluxo CORRETO da API CWS dos Correios para etiquetas assíncronas:
// 1) POST /rotulo/assincrono/pdf                           -> retorna idRecibo
// 2) GET  /rotulo/download/assincrono/{idRecibo}           -> polling: 202 = ainda processando | 200 com JSON {dados: <pdf base64>} = pronto
async function tryDownloadAsyncLabel(idRecibo: string, token: string) {
  const url = `${CORREIOS_BASE}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`;

  for (let attempt = 1; attempt <= 10; attempt++) {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, application/pdf",
      },
    });

    const contentType = resp.headers.get("content-type") || "";

    // Caso a API entregue PDF binário direto
    if (resp.ok && contentType.includes("application/pdf")) {
      const base64 = await pdfResponseToBase64(resp);
      log(`[recibo ${idRecibo}] PDF binário recebido na tentativa ${attempt}/10`);
      return { ok: true as const, base64, url, status: resp.status, contentType, bodyText: "" };
    }

    const bodyText = await resp.text();
    log(
      `[recibo ${idRecibo}] poll ${attempt}/10 | http: ${resp.status} | content-type: ${contentType} | body: ${bodyText.slice(0, 400)}`,
    );

    let json: any = null;
    if (contentType.includes("application/json") || contentType.includes("application/problem+json")) {
      try { json = JSON.parse(bodyText); } catch { json = null; }
    }

    // Resposta pronta com PDF em base64 dentro do JSON
    if (resp.ok && json) {
      const candidate =
        json?.dados ||
        json?.arquivo ||
        json?.pdf ||
        json?.conteudo ||
        json?.rotulo ||
        json?.base64 ||
        json?.data;

      if (typeof candidate === "string" && candidate.length > 100) {
        const base64 = candidate.startsWith("data:") ? candidate.split(",")[1] || candidate : candidate;
        log(`[recibo ${idRecibo}] PDF base64 extraído do JSON na tentativa ${attempt}/10`);
        return { ok: true as const, base64, url, status: resp.status, contentType, bodyText: "" };
      }

      const fileUrl = json?.url || json?.link || json?.urlArquivo || json?.urlDownload;
      if (typeof fileUrl === "string" && fileUrl.startsWith("http")) {
        const fileResp = await tryDownloadPdfFromUrl(fileUrl, token);
        if (fileResp.ok) {
          log(`[recibo ${idRecibo}] PDF baixado via URL externa: ${fileUrl}`);
          return { ok: true as const, base64: fileResp.base64, url: fileUrl, status: resp.status, contentType, bodyText: "" };
        }
      }
    }

    // Detecta erro PPN-295 (rótulo não foi gerado) -> sinaliza regenerate
    const message = String(
      json?.mensagem || json?.message || json?.descricao || json?.detail || json?.title || json?.msgs?.[0] || "",
    );
    if (/PPN-295|rótulo não foi gerado|rotulo nao foi gerado|nova solicitação|nova solicitacao/i.test(message)) {
      return {
        ok: false as const,
        retryable: false,
        regenerate: true,
        url,
        status: resp.status,
        contentType,
        bodyText: message,
      };
    }

    // 202 / 204 = ainda processando -> aguarda 5s e tenta de novo
    if (resp.status === 202 || resp.status === 204) {
      if (attempt < 10) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      return {
        ok: false as const,
        retryable: true,
        url,
        status: resp.status,
        contentType,
        bodyText: `Timeout: recibo ${idRecibo} ainda processando após 10 tentativas (50s)`,
      };
    }

    // Erro terminal (4xx ≠ 404, 5xx) com mensagem
    if (resp.status >= 400 && resp.status !== 404 && message) {
      return {
        ok: false as const,
        retryable: false,
        url,
        status: resp.status,
        contentType,
        bodyText: message,
      };
    }

    // 404 ou resposta sem PDF/dados claros -> aguarda e tenta de novo
    if (attempt < 10) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  return {
    ok: false as const,
    retryable: true,
    url,
    status: 408,
    contentType: "",
    bodyText: `Timeout: recibo ${idRecibo} não retornou PDF após 10 tentativas (50s)`,
  };
}

// Consulta o status atual da pré-postagem antes de gerar rótulo.
// Conforme manual oficial Correios, o rótulo só é emitido se status == "PRE_POSTADO" (ou variações).
// Retorna { ok, status, rawJson, httpStatus, errorMessage }.
async function fetchPrePostagemStatus(
  token: string,
  prePostagemId: string,
): Promise<{
  ok: boolean;
  status: string | null;
  rawJson: any;
  httpStatus: number;
  bodyText: string;
}> {
  const url = `${CORREIOS_BASE}/prepostagem/v1/prepostagens/${encodeURIComponent(prePostagemId)}`;
  log(`📋 Consultando status da pré-postagem | GET ${url}`);

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const text = await resp.text();
  log(`📋 Status pré-postagem ${prePostagemId} | HTTP ${resp.status} | body completo: ${text}`);

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: null, rawJson: null, httpStatus: resp.status, bodyText: text };
  }

  // Tenta múltiplos nomes de campo (a API varia)
  const status: string | null =
    json?.status ||
    json?.situacao ||
    json?.statusPrePostagem ||
    json?.situacaoPrePostagem ||
    json?.statusObjeto ||
    null;

  log(`📋 Status extraído: "${status}"`);

  return { ok: resp.ok, status, rawJson: json, httpStatus: resp.status, bodyText: text };
}

// Status aceitos para emissão do rótulo (variações conhecidas da API Correios)
const VALID_PRE_POSTADO_STATUS = new Set([
  "PRE_POSTADO",
  "PREPOSTADO",
  "PRE-POSTADO",
  "PRÉ-POSTADO",
  "PRÉ_POSTADO",
  "PRÉPOSTADO",
]);

function isPrePostadoStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toString().trim().toUpperCase();
  return VALID_PRE_POSTADO_STATUS.has(normalized) || normalized.includes("POSTADO");
}

// Busca dados do pedido e cria nova pré-postagem nos Correios.
// Usado quando o melhor_envio_shipment_id armazenado é um UUID (ex: ID do Melhor Envio antigo)
// ou quando a consulta retorna 404 (pré-postagem não existe no sistema dos Correios).
async function recreatePrepostagemFromOrder(
  supabase: any,
  creds: CorreiosCredentials,
  orderId: number | string,
): Promise<{ idPrePostagem: string; codigoObjeto: string | null }> {
  log(`🔄 Recriando pré-postagem para pedido ${orderId}`);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, customer_name, customer_phone, customer_cep, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, observation, total_amount, shipping_service_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar pedido ${orderId}: ${error.message}`);
  if (!order) throw new Error(`Pedido ${orderId} não encontrado`);

  // Validação mínima de endereço
  if (!order.customer_cep || !order.customer_city || !order.customer_state) {
    throw new Error(`Pedido ${orderId} não possui endereço completo (CEP/cidade/UF)`);
  }

  // Detecta serviço a partir da observação (mesma lógica do front)
  const obsUpper = String(order.observation || "").toUpperCase();
  let codigoServico = "03220"; // PAC contrato padrão
  if (obsUpper.includes("SEDEX 12") || obsUpper.includes("SEDEX12")) codigoServico = "03140";
  else if (obsUpper.includes("SEDEX")) codigoServico = "03298";
  else if (obsUpper.includes("MINI")) codigoServico = "04227";

  const payload = {
    order_id: order.id,
    codigoServico,
    destinatario: {
      nome: order.customer_name || "Cliente",
      telefone: order.customer_phone,
      endereco: {
        cep: order.customer_cep,
        logradouro: order.customer_street || "",
        numero: order.customer_number || "S/N",
        complemento: order.customer_complement || "",
        bairro: order.customer_neighborhood || "",
        cidade: order.customer_city,
        uf: order.customer_state,
      },
    },
  };

  const { token } = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem);

  // Reaproveita a lógica de criação (sanitização + POST + update do pedido)
  const dest = payload.destinatario;
  const destEnd = dest.endereco;
  const destinatario = {
    nome: dest.nome.slice(0, 50),
    telefone: sanitizePhone(dest.telefone),
    endereco: {
      cep: sanitizeCEP(destEnd.cep),
      logradouro: destEnd.logradouro.slice(0, 50),
      numero: String(destEnd.numero).slice(0, 6),
      complemento: destEnd.complemento.slice(0, 30),
      bairro: destEnd.bairro.slice(0, 30),
      cidade: destEnd.cidade.slice(0, 50),
      uf: sanitizeUF(destEnd.uf),
    },
  };

  let remetente: any = null;
  if (creds.webhook_secret) {
    try { remetente = JSON.parse(creds.webhook_secret); } catch { /* ignore */ }
  }
  if (!remetente) throw new Error("Remetente não configurado nos Correios. Configure em Integrações → Correios.");

  const remEnd = remetente.endereco || {};
  remetente = {
    ...remetente,
    documento: sanitizeCNPJ(remetente.documento || remetente.cpf || remetente.cnpj),
    telefone: sanitizePhone(remetente.telefone),
    endereco: {
      ...remEnd,
      cep: sanitizeCEP(remEnd.cep || creds.from_cep),
      uf: sanitizeUF(remEnd.uf),
    },
  };

  const createBody = {
    remetente,
    destinatario,
    codigoServico,
    cartaoPostagem: creds.cartao_postagem,
    pesoInformado: "300",
    codigoFormatoObjetoInformado: "2",
    alturaInformada: "2",
    larguraInformada: "11",
    comprimentoInformado: "16",
    diametroInformado: "0",
    servicosAdicionais: [],
    observacao: "",
  };

  const createUrl = `${CORREIOS_BASE}/prepostagem/v1/prepostagens`;
  const resp = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(createBody),
  });

  const text = await resp.text();
  log(`🔄 recreate prepostagem | status: ${resp.status} | body: ${text.slice(0, 800)}`);

  if (!resp.ok) {
    throw new Error(`Falha ao recriar pré-postagem nos Correios (${resp.status}): ${text.slice(0, 500)}`);
  }

  let json: any;
  try { json = JSON.parse(text); } catch {
    throw new Error(`Resposta inválida ao recriar pré-postagem: ${text.slice(0, 300)}`);
  }

  const idPrePostagem = json.id || json.idPrePostagem || json.numero;
  const codigoObjeto = json.codigoObjeto || json.numeroEtiqueta || null;
  if (!idPrePostagem) throw new Error(`idPrePostagem não retornado ao recriar. Body: ${text.slice(0, 300)}`);

  // Salva o NOVO id no pedido
  const updateData: Record<string, unknown> = { melhor_envio_shipment_id: String(idPrePostagem) };
  if (codigoObjeto) updateData.melhor_envio_tracking_code = String(codigoObjeto);
  const { error: upErr } = await supabase.from("orders").update(updateData).eq("id", orderId);
  if (upErr) log(`⚠️ Erro ao salvar novo idPrePostagem no pedido ${orderId}: ${upErr.message}`);
  else log(`✅ Pedido ${orderId} atualizado com novo idPrePostagem: ${idPrePostagem}`);

  return { idPrePostagem: String(idPrePostagem), codigoObjeto };
}

async function actionDownloadLabel(
  creds: CorreiosCredentials,
  prePostagemId: string,
  supabase?: any,
  orderId?: number | string,
): Promise<DownloadLabelResult> {
  const { token, cartaoData } = await getCorreiosToken(
    creds.client_id,
    creds.client_secret,
    creds.cartao_postagem,
  );

  let effectiveId = prePostagemId;
  let recreated = false;

  // ETAPA 0a: Se o ID for um UUID/estrangeiro, recria imediatamente
  if (isLikelyForeignId(prePostagemId)) {
    log(`⚠️ ID "${prePostagemId}" parece ser de outro provedor (UUID/Melhor Envio) — não é uma pré-postagem dos Correios`);
    if (!supabase || !orderId) {
      return {
        success: false,
        error: `O ID "${prePostagemId}" não é uma pré-postagem dos Correios (parece ID do Melhor Envio). Não foi possível recriar automaticamente sem order_id.`,
        details: { prePostagemId, reason: "foreign_id_no_order_context" },
      };
    }
    try {
      const created = await recreatePrepostagemFromOrder(supabase, creds, orderId);
      effectiveId = created.idPrePostagem;
      recreated = true;
      log(`✅ Pré-postagem recriada com sucesso: ${effectiveId}`);
    } catch (e) {
      const msg = (e as Error).message;
      return {
        success: false,
        error: `Não foi possível criar a pré-postagem nos Correios: ${msg}`,
        details: { prePostagemId, recreateError: msg },
      };
    }
  }

  // ETAPA 0b: Consulta status antes de qualquer tentativa de geração
  const statusCheck = await fetchPrePostagemStatus(token, effectiveId);

  // Se 404 ou status inválido E temos contexto do pedido → tenta recriar
  const needsRecreate = !recreated && (statusCheck.httpStatus === 404 || !isPrePostadoStatus(statusCheck.status));
  if (needsRecreate && supabase && orderId) {
    log(`⚠️ Pré-postagem ${effectiveId} inválida (HTTP ${statusCheck.httpStatus}, status "${statusCheck.status}") — recriando para pedido ${orderId}`);
    try {
      const created = await recreatePrepostagemFromOrder(supabase, creds, orderId);
      effectiveId = created.idPrePostagem;
      recreated = true;
      log(`✅ Pré-postagem recriada: ${effectiveId}`);
    } catch (e) {
      const msg = (e as Error).message;
      return {
        success: false,
        error: `Pré-postagem original inválida e falha ao recriar nos Correios: ${msg}`,
        details: { originalId: prePostagemId, originalHttpStatus: statusCheck.httpStatus, originalStatus: statusCheck.status, recreateError: msg },
      };
    }
  } else if (!isPrePostadoStatus(statusCheck.status)) {
    const currentStatus = statusCheck.status || "DESCONHECIDO";
    const errMsg = `Pré-postagem ${effectiveId} está com status "${currentStatus}" — rótulo só pode ser emitido quando status == "PRE_POSTADO". ${!supabase || !orderId ? "Forneça order_id para recriar automaticamente." : ""}`;
    log(`❌ ${errMsg}`);
    return {
      success: false,
      error: errMsg,
      details: {
        prePostagemId: effectiveId,
        currentStatus,
        httpStatus: statusCheck.httpStatus,
        rawResponse: statusCheck.rawJson || statusCheck.bodyText,
      },
    };
  }
  log(`✅ Pré-postagem ${effectiveId} pronta para emissão de rótulo`);

  const cartaoNumero = cartaoData.numero || creds.cartao_postagem;

  // Payload oficial conforme manual Correios API v2.4 (abril/2025)
  // Campos OBRIGATÓRIOS: idsPrePostagem (plural), numeroCartaoPostagem,
  // tipoRotulo (P=padrão | R=reduzido), formatoRotulo (ET=Etiqueta | EV=Envelope),
  // imprimeRemetente (S | N), layoutImpressao (PADRAO | LINEAR_100_150 | etc.)
  const asyncUrl = `${CORREIOS_BASE}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`;
  const bodyVariants: Array<{ label: string; body: Record<string, unknown> }> = [
    {
      label: "oficial-padrao",
      body: {
        idsPrePostagem: [String(effectiveId)],
        numeroCartaoPostagem: cartaoNumero,
        tipoRotulo: "P",
        formatoRotulo: "ET",
        imprimeRemetente: "S",
        layoutImpressao: "PADRAO",
      },
    },
    {
      label: "oficial-com-contrato",
      body: {
        idsPrePostagem: [String(effectiveId)],
        numeroCartaoPostagem: cartaoNumero,
        contrato: cartaoData.contrato,
        tipoRotulo: "P",
        formatoRotulo: "ET",
        imprimeRemetente: "S",
        layoutImpressao: "PADRAO",
      },
    },
    {
      label: "fallback-reduzido",
      body: {
        idsPrePostagem: [String(effectiveId)],
        numeroCartaoPostagem: cartaoNumero,
        tipoRotulo: "R",
        formatoRotulo: "ET",
        imprimeRemetente: "S",
        layoutImpressao: "PADRAO",
      },
    },
  ];

  let asyncText = "";
  let lastStatus = 0;

  let lastError = "";

  for (let index = 0; index < bodyVariants.length; index++) {
    const variant = bodyVariants[index];
    for (let generationAttempt = 1; generationAttempt <= 3; generationAttempt++) {
      log(
        `Variação ${index + 1} | tentativa de geração ${generationAttempt}/3 | body: ${JSON.stringify(variant.body)}`,
      );

      const response = await fetch(asyncUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(variant.body),
      });

      const responseText = await response.text();
      lastStatus = response.status;
      asyncText = responseText;

      log(
        `Variação ${index + 1} | tentativa ${generationAttempt}/3 | status: ${response.status} | resposta: ${responseText}`,
      );

      if (!response.ok) {
        lastError = responseText;
        continue;
      }

      let asyncJson: any = null;
      try {
        asyncJson = JSON.parse(responseText);
      } catch {
        throw new Error(`Resposta inválida da Etapa 1 (não-JSON): ${responseText.slice(0, 300)}`);
      }

      const idRecibo: string | undefined =
        asyncJson?.idRecibo ||
        asyncJson?.recibo ||
        asyncJson?.id ||
        asyncJson?.protocolo ||
        asyncJson?.numeroProtocolo;

      if (!idRecibo) {
        throw new Error(`idRecibo não retornado pela Etapa 1. Body completo: ${responseText}`);
      }

      log(`idRecibo obtido: ${idRecibo}`);

      // tryDownloadAsyncLabel já faz polling interno (até 10x com 5s) na etapa 2
      // e baixa o arquivo na etapa 3, então basta uma chamada por geração.
      const asyncDownload = await tryDownloadAsyncLabel(idRecibo, token);
      log(
        `Resultado download | url: ${asyncDownload.url} | status: ${asyncDownload.status} | content-type: ${asyncDownload.contentType} | ${asyncDownload.ok ? "PDF recebido" : `body: ${asyncDownload.bodyText}`}`,
      );

      if (asyncDownload.ok) {
        return { success: true, labelPdfBase64: asyncDownload.base64, idRecibo, idPrePostagem: effectiveId, recreated };
      }

      lastError = asyncDownload.bodyText || responseText;

      if (asyncDownload.regenerate && generationAttempt < 3) {
        log(`Correios retornou PPN-295 para o recibo ${idRecibo}; refazendo solicitação do rótulo`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      if (asyncDownload.regenerate) {
        return {
          success: false,
          pending: false,
          idRecibo,
          error: `A API dos Correios retornou PPN-295 (rótulo não gerado) em todas as 3 tentativas. Última resposta: ${lastError}`,
        };
      }

      if (asyncDownload.retryable && generationAttempt < 3) {
        log(`Timeout no polling do recibo ${idRecibo}; refazendo solicitação`);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      return {
        success: false,
        pending: false,
        idRecibo,
        error:
          `A API dos Correios gerou o recibo ${idRecibo}, mas retornou falha na geração da etiqueta. Resposta final: ${lastError || responseText}`,
      };
    }
  }

  return {
    success: false,
    pending: false,
    error: `Falha ao solicitar rótulo assíncrono (${lastStatus}): ${lastError || asyncText}`,
  };
}

// ----- ACTION: create_prepostagem -----
async function actionCreatePrepostagem(
  supabase: any,
  creds: CorreiosCredentials,
  payload: any,
) {
  const { token } = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem);

  // Sanitização de dados (mantém o que já funciona)
  const dest = payload.destinatario || {};
  const destEnd = dest.endereco || {};
  const destinatario = {
    nome: (dest.nome || "").slice(0, 50),
    documento: sanitizeCNPJ(dest.documento || dest.cpf || dest.cnpj),
    telefone: sanitizePhone(dest.telefone),
    email: dest.email || undefined,
    endereco: {
      cep: sanitizeCEP(destEnd.cep),
      logradouro: (destEnd.logradouro || "").slice(0, 50),
      numero: (destEnd.numero || "S/N").toString().slice(0, 6),
      complemento: (destEnd.complemento || "").slice(0, 30),
      bairro: (destEnd.bairro || "").slice(0, 30),
      cidade: (destEnd.cidade || "").slice(0, 50),
      uf: sanitizeUF(destEnd.uf),
    },
  };

  let remetente: any = payload.remetente;
  if (!remetente && creds.webhook_secret) {
    try {
      remetente = JSON.parse(creds.webhook_secret);
    } catch {
      log("webhook_secret não contém JSON válido de sender");
    }
  }
  if (!remetente) throw new Error("Remetente não configurado. Salve os dados via action save_sender primeiro.");

  // Sanitiza remetente também
  const remEnd = remetente.endereco || {};
  remetente = {
    ...remetente,
    documento: sanitizeCNPJ(remetente.documento || remetente.cpf || remetente.cnpj),
    telefone: sanitizePhone(remetente.telefone),
    endereco: {
      ...remEnd,
      cep: sanitizeCEP(remEnd.cep || creds.from_cep),
      uf: sanitizeUF(remEnd.uf),
    },
  };

  const body = {
    remetente,
    destinatario,
    codigoServico: payload.codigoServico,
    cartaoPostagem: creds.cartao_postagem,
    pesoInformado: payload.pesoInformado || payload.peso || "300",
    codigoFormatoObjetoInformado: payload.codigoFormatoObjetoInformado || "2",
    alturaInformada: payload.alturaInformada || "2",
    larguraInformada: payload.larguraInformada || "11",
    comprimentoInformado: payload.comprimentoInformado || "16",
    diametroInformado: payload.diametroInformado || "0",
    servicosAdicionais: payload.servicosAdicionais || [],
    observacao: payload.observacao || "",
  };

  const url = `${CORREIOS_BASE}/prepostagem/v1/prepostagens`;
  log(`Criando pré-postagem | POST /prepostagem/v1/prepostagens | dest CEP: ${destinatario.endereco.cep}`);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  log(`create_prepostagem status: ${resp.status} | body: ${text.slice(0, 1000)}`);

  if (!resp.ok) {
    throw new Error(`Falha ao criar pré-postagem (${resp.status}): ${text}`);
  }

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Resposta de pré-postagem inválida: ${text.slice(0, 300)}`);
  }

  const idPrePostagem = json.id || json.idPrePostagem || json.numero;
  const codigoObjeto = json.codigoObjeto || json.numeroEtiqueta || null;

  if (!idPrePostagem) {
    throw new Error(`idPrePostagem não retornado. Body: ${text}`);
  }

  // Salvar idPrePostagem no pedido (se vier order_id)
  if (payload.order_id) {
    const updateData: Record<string, unknown> = {
      melhor_envio_shipment_id: String(idPrePostagem),
    };
    if (codigoObjeto) updateData.melhor_envio_tracking_code = String(codigoObjeto);

    const { error: upErr } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", payload.order_id);
    if (upErr) log(`Erro ao salvar idPrePostagem no pedido: ${upErr.message}`);
  }

  // Tentar baixar o rótulo imediatamente — se falhar, retorna pending
  let labelPdfBase64: string | null = null;
  let pending = false;
  let labelError: string | undefined;
  try {
    const dl = await actionDownloadLabel(creds, String(idPrePostagem), supabase, payload.order_id);
    if (dl.success && dl.labelPdfBase64) {
      labelPdfBase64 = dl.labelPdfBase64;
    } else {
      pending = true;
      labelError = dl.error;
    }
  } catch (e) {
    pending = true;
    labelError = (e as Error).message;
    log(`Download do rótulo falhou após criação: ${labelError}`);
  }

  return {
    success: true,
    idPrePostagem,
    codigoObjeto,
    labelPdfBase64,
    pending,
    error: pending ? labelError : undefined,
  };
}

// ----- Handler principal -----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const body = await req.json();
    const { action, tenant_id } = body;

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log(`action: ${action} | tenant: ${tenant_id}`);

    if (action === "save_sender") {
      const result = await actionSaveSender(supabase, tenant_id, body.sender || {});
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const creds = await getCredentials(supabase, tenant_id);

    if (action === "create_prepostagem") {
      const result = await actionCreatePrepostagem(supabase, creds, body);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "download_label") {
      const prePostagemId = body.prePostagem_id || body.idPrePostagem;
      if (!prePostagemId) {
        return new Response(
          JSON.stringify({ success: false, error: "prePostagem_id é obrigatório" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        const orderIdParam = body.order_id ?? body.orderId;
        const result = await actionDownloadLabel(creds, String(prePostagemId), supabase, orderIdParam);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        const msg = (e as Error).message || "Erro ao baixar etiqueta";
        log(`ERRO download_label: ${msg}`);
        return new Response(
          JSON.stringify({ success: false, pending: false, error: msg }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: `Ação desconhecida: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = (err as Error).message || "Erro desconhecido";
    log(`ERRO: ${message}`);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
