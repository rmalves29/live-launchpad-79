// supabase/functions/correios-labels/index.ts
// Edge Function: correios-labels
// Reescrita do zero com fluxo correto de geração de rótulo:
// 1. POST /prepostagem/v1/prepostagens/rotulo/assincrono/pdf -> idRecibo
// 2. Polling em GET /prepostagem/v1/prepostagens/rotulo/assincrono/{idRecibo}
// 3. Retorna PDF base64 ou pending: true
import { createClient } from "npm:@supabase/supabase-js@2";
import { desenharDeclaracao, faltaNaDeclaracao, type Declaracao } from "./declaracao.ts";
import { authorizeTenantCaller, guardResponse } from "../_shared/auth-guard.ts";
import {
  ajustarDimensoes,
  codigoNaoExisteNoCartao,
  codigosParaTentar,
  mensagemErroCorreios,
  parseCodigosServico,
  situacaoRastreio,
  montarCorpoPrePostagem,
  servicoDoPedido,
  type CodigosServico,
  type PessoaPostagem,
} from "../_shared/correios-prepostagem.ts";

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
  log("normalizeRemetente input", { rawType: typeof raw, raw });
  const src = typeof raw === "string"
    ? (() => {
      try {
        return JSON.parse(raw);
      } catch (error) {
        log("normalizeRemetente parse error", {
          rawType: typeof raw,
          raw,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })()
    : raw;
  if (!src || typeof src !== "object") return null;

  const end = src.endereco && typeof src.endereco === "object" ? src.endereco : {};

  const documento = sanitizeCNPJ(src.documento || src.cnpj || src.cpf || end.documento);
  const telefoneRaw = src.telefone || src.telefoneCelular || src.celular || end.telefone || "";
  log("normalizeRemetente telefoneRaw", { telefoneRaw });
  const telefone = sanitizePhone(telefoneRaw);
  log("normalizeRemetente telefone sanitizado", { telefone });

  const logradouro = String(src.logradouro || end.logradouro || src.rua || end.rua || "").trim();
  const numero = String(src.numero || end.numero || "S/N").trim() || "S/N";
  const complemento = String(src.complemento || end.complemento || "").trim();
  const bairro = String(src.bairro || end.bairro || "").trim();
  const cidade = String(src.cidade || end.cidade || src.municipio || end.municipio || "").trim();
  const uf = sanitizeUF(src.uf || end.uf || src.estado || end.estado);
  const cep = sanitizeCEP(src.cep || end.cep || fallbackCep);

  const ddd = telefone.length >= 10 ? telefone.slice(0, 2) : "";
  const numeroTelefone = telefone.length >= 10 ? telefone.slice(2) : telefone;
  log("normalizeRemetente telefone split", { ddd, numeroTelefone, documento });

  return {
    nome: String(src.nome || src.name || "").slice(0, 50),
    ddd,
    telefone: numeroTelefone,
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
function buildDeclaracaoConteudo(totalAmount: number | null | undefined, _observacao?: string): any[] {
  const valor = Number(totalAmount) > 0 ? Number(totalAmount) : 50;
  // IMPORTANTE: Sempre usar descrição segura para evitar PPN-330 (Objetos proibidos).
  // Usar SEM acento para evitar rejeição por encoding.
  return [
    {
      conteudo: "Acessorios",
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
  contrato?: string | null,
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
  const autenticar = (corpo: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(corpo),
    });
  let resp = await autenticar({ numero: cartaoPostagem });
  let text = await resp.text();
  log(`Auth status: ${resp.status} | body: ${text.slice(0, 500)}`);
  // Alguns cartões só autenticam informando o contrato junto (é o que o Troca Fácil faz)
  if (!resp.ok && contrato) {
    log("Auth recusada só com o cartão: tentando com o contrato");
    resp = await autenticar({ numero: cartaoPostagem, contrato });
    text = await resp.text();
    log(`Auth (com contrato) status: ${resp.status} | body: ${text.slice(0, 500)}`);
  }

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
  tenant_id: string;
  client_id: string;
  client_secret: string;
  cartao_postagem: string;
  contrato: string | null;
  from_cep: string;
  webhook_secret: string | null; // armazena JSON do remetente (sender)
  integration_id: string;
  // códigos de PAC / SEDEX / Mini Envios no contrato desta empresa (vazio = códigos padrão do sistema)
  codigos_servico: CodigosServico;
}

async function getCredentials(
  supabase: any,
  tenantId: string,
): Promise<CorreiosCredentials> {
  const { data, error } = await supabase
    .from("shipping_integrations")
    .select("id, client_id, client_secret, refresh_token, scope, from_cep, webhook_secret, service_codes")
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
    tenant_id: tenantId,
    client_id: clientId,
    client_secret: clientSecret,
    cartao_postagem: cartaoPostagem,
    contrato: record.scope ? String(record.scope) : null,
    from_cep: record.from_cep ? String(record.from_cep) : "",
    webhook_secret: record.webhook_secret ? String(record.webhook_secret) : null,
    integration_id: String(record.id || ""),
    codigos_servico: parseCodigosServico(record.service_codes),
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
// Regra: IDs nativos dos Correios começam com "PR" (ex: "PRLSl03xKx..."). Qualquer
// outra coisa (UUID v4 com hífens, etc.) é considerado estrangeiro e exige recriação.
function isLikelyForeignId(id: string): boolean {
  if (!id) return true;
  // IDs nativos dos Correios SEMPRE começam com "PR" — nunca tratar como estrangeiro
  if (/^PR/i.test(id)) return false;
  // UUID v4 padrão: 8-4-4-4-12 com hífens
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return true;
  // Qualquer string com múltiplos hífens (não é o padrão dos Correios)
  if ((id.match(/-/g) || []).length >= 2) return true;
  return false;
}

// IDs nativos dos Correios SEMPRE começam com "PR" — nunca devem ser recriados,
// apenas consultados/utilizados como já existem na API.
function isCorreiosNativeId(id: string): boolean {
  return !!id && /^PR/i.test(id);
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
// Tempo máximo que uma chamada espera pela etiqueta. A requisição do navegador cai
// em 150 s (limite da Supabase), então paramos bem antes e devolvemos "pending"
// com o idRecibo: o navegador chama de novo e continua esperando O MESMO recibo,
// em vez de pedir uma etiqueta nova (o que recomeçava a fila nos Correios).
const LABEL_WAIT_BUDGET_MS = 100_000;
// Nenhuma chamada aos Correios pode ficar pendurada: sem limite, uma resposta que não chega faz a função inteira estourar os 150 s.
const CORREIOS_FETCH_TIMEOUT_MS = 20_000;
function fetchComLimite(url: string, init: RequestInit = {}, ms = CORREIOS_FETCH_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}
const POLL_INTERVAL_MS = 5_000;

async function tryDownloadAsyncLabel(idRecibo: string, token: string, deadline = Date.now() + 50_000, intervalMs = POLL_INTERVAL_MS) {
  const url = `${CORREIOS_BASE}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`;
  const maxAttempts = Math.max(1, Math.ceil((deadline - Date.now()) / intervalMs));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp: Response;
    let contentType = "";
    let bodyText = "";
    try {
      resp = await fetchComLimite(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json, application/pdf",
        },
      });
      contentType = resp.headers.get("content-type") || "";

      // Caso a API entregue PDF binário direto
      if (resp.ok && contentType.includes("application/pdf")) {
        const base64 = await pdfResponseToBase64(resp);
        log(`[recibo ${idRecibo}] PDF binário recebido na tentativa ${attempt}`);
        return { ok: true as const, base64, url, status: resp.status, contentType, bodyText: "" };
      }

      bodyText = await resp.text();
    } catch (e) {
      // Os Correios não responderam a tempo: tenta de novo (ou devolve "pendente" quando acabar o tempo)
      log(`[recibo ${idRecibo}] poll ${attempt}/${maxAttempts} sem resposta: ${(e as Error).message}`);
      if (attempt < maxAttempts && Date.now() + intervalMs < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      break;
    }
    log(
      `[recibo ${idRecibo}] poll ${attempt}/${maxAttempts} | http: ${resp.status} | content-type: ${contentType} | body: ${bodyText.slice(0, 400)}`,
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
        log(`[recibo ${idRecibo}] PDF base64 extraído do JSON na tentativa ${attempt}`);
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
    if (/PPN-295|PPN-297|rótulo não foi gerado|rotulo nao foi gerado|Geração do rótulo não realizada|nova solicitação|nova solicitacao/i.test(message)) {
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
      if (attempt < maxAttempts && Date.now() + intervalMs < deadline) {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
      break;
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

    // 404, PPN-291 ("ainda não foi gerado") ou resposta sem PDF -> aguarda e tenta de novo
    if (attempt < maxAttempts && Date.now() + intervalMs < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs));
    } else {
      break;
    }
  }

  return {
    ok: false as const,
    retryable: true,
    url,
    status: 408,
    contentType: "",
    bodyText: `Recibo ${idRecibo}: os Correios ainda estão gerando a etiqueta`,
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

  const resp = await fetchComLimite(url, {
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
  // `statusAtual` é o texto do status (PRE_POSTADO...); `status` pode vir como código numérico (ex.: 405) e não serve para decidir.
  const status: string | null =
    json?.statusAtual ||
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

// Monta o remetente: dados salvos na integração (save_sender) ou, se não houver, os dados da empresa.
async function remetenteDaEmpresa(supabase: any, creds: CorreiosCredentials): Promise<PessoaPostagem> {
  const salvo = normalizeRemetente(creds.webhook_secret, creds.from_cep);
  if (salvo && salvo.endereco?.logradouro) {
    return {
      nome: salvo.nome,
      cpfCnpj: salvo.cpfCnpj,
      email: salvo.email,
      telefone: `${salvo.ddd || ""}${salvo.telefone || ""}`,
      logradouro: salvo.endereco.logradouro,
      numero: salvo.endereco.numero,
      complemento: salvo.endereco.complemento,
      bairro: salvo.endereco.bairro,
      cidade: salvo.endereco.cidade,
      uf: salvo.endereco.uf,
      cep: salvo.endereco.cep,
    };
  }
  const { data: t, error } = await supabase
    .from("tenants")
    .select("name, email, phone, company_name, company_document, company_email, company_phone, company_address, company_number, company_complement, company_district, company_city, company_state, company_cep")
    .eq("id", creds.tenant_id)
    .maybeSingle();
  if (error || !t) throw new Error("Não foi possível ler os dados da empresa para o remetente.");
  return {
    nome: t.company_name || t.name,
    cpfCnpj: t.company_document,
    email: t.company_email || t.email,
    telefone: t.company_phone || t.phone,
    logradouro: t.company_address,
    numero: t.company_number,
    complemento: t.company_complement,
    bairro: t.company_district,
    cidade: t.company_city,
    uf: t.company_state,
    // o CEP de origem da integração vale quando a empresa não tem CEP próprio
    cep: t.company_cep || creds.from_cep,
  };
}

// Cria a pré-postagem nos Correios e devolve o id e o código do objeto. Se os Correios recusarem a descrição
// como objeto proibido (PPN-330), tenta uma vez com uma descrição genérica.
async function enviarPrePostagem(token: string, corpo: any): Promise<{ id: string; codigoObjeto: string | null }> {
  const url = `${CORREIOS_BASE}/prepostagem/v1/prepostagens`;
  const enviar = async (b: any) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(b),
    });
    return { resp: r, texto: await r.text() };
  };
  log(`📦 pré-postagem | payload: ${JSON.stringify(corpo)}`);
  let { resp, texto } = await enviar(corpo);
  if (!resp.ok && /PPN-330/.test(texto)) {
    log("PPN-330: repetindo com descrição genérica");
    corpo = { ...corpo, itensDeclaracaoConteudo: [{ ...corpo.itensDeclaracaoConteudo[0], conteudo: "Acessorios" }] };
    ({ resp, texto } = await enviar(corpo));
  }
  log(`📦 pré-postagem | status: ${resp.status} | body: ${texto.slice(0, 800)}`);
  if (!resp.ok) throw new Error(mensagemErroCorreios(resp.status, texto));
  let json: any;
  try { json = JSON.parse(texto); } catch { throw new Error(`Resposta inválida dos Correios: ${texto.slice(0, 300)}`); }
  const id = json.id || json.idPrePostagem || json.numero;
  if (!id) throw new Error(`Os Correios não devolveram o id da pré-postagem. Resposta: ${texto.slice(0, 300)}`);
  return { id: String(id), codigoObjeto: json.codigoObjeto || json.numeroEtiqueta || null };
}

// Cria a pré-postagem de um pedido usando os dados do próprio pedido (endereço, produtos, serviço escolhido no
// checkout), no formato validado no Troca Fácil, e grava o id e o rastreio no pedido.
async function recreatePrepostagemFromOrder(
  supabase: any,
  creds: CorreiosCredentials,
  orderId: number | string,
): Promise<{ idPrePostagem: string; codigoObjeto: string | null }> {
  log(`🔄 Criando pré-postagem para o pedido ${orderId}`);

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, customer_name, customer_phone, customer_cep, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, observation, total_amount, cart_id, shipping_service_id")
    .eq("id", orderId)
    .eq("tenant_id", creds.tenant_id)
    .maybeSingle();
  if (error) throw new Error(`Erro ao buscar pedido ${orderId}: ${error.message}`);
  if (!order) throw new Error(`Pedido ${orderId} não encontrado`);

  const [itensRes, cliRes, cfgRes, caixaRes] = await Promise.all([
    order.cart_id
      ? supabase.from("cart_items").select("product_name, product_code, qty, unit_price").eq("cart_id", order.cart_id)
      : Promise.resolve({ data: [] }),
    order.customer_phone
      ? supabase.from("customers").select("cpf, email").eq("tenant_id", creds.tenant_id).eq("phone", order.customer_phone).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("app_settings").select("default_weight_kg, default_width_cm, default_height_cm, default_length_cm").limit(1).maybeSingle(),
    supabase.from("tenants").select("shipping_box_length_cm, shipping_box_width_cm, shipping_box_height_cm").eq("id", creds.tenant_id).maybeSingle(),
  ]);

  const itens: any[] = itensRes.data || [];
  const qtd = itens.reduce((s: number, i: any) => s + (Number(i.qty) || 1), 0) || 1;
  const valor = itens.reduce((s: number, i: any) => s + (Number(i.unit_price) || 0) * (Number(i.qty) || 1), 0) || Number(order.total_amount) || 1;
  const descricao = itens.map((i: any) => i.product_name || i.product_code).filter(Boolean).join(", ") || "Semijoia";
  const cfg: any = cfgRes.data || {};
  const caixa: any = caixaRes.data || {};
  const pesoKg = Number(cfg.default_weight_kg) > 0 ? Number(cfg.default_weight_kg) : 0.05;

  // Logística reversa (modelo Troca Fácil): se a empresa cadastrou o código do serviço de reversa, toda remessa sai com ele
  const codigoReversa = creds.codigos_servico.Reversa || "";
  const servicoBase = codigoReversa || servicoDoPedido(order.observation, order.shipping_service_id, creds.codigos_servico);
  if (!servicoBase) {
    // Pedido sem frete próprio costuma ser compra juntada com outro da mesma cliente: aponta o pedido principal
    let dica = "";
    if (order.customer_phone) {
      const { data: outro } = await supabase
        .from("orders")
        .select("id, shipping_service_id")
        .eq("tenant_id", creds.tenant_id)
        .eq("customer_phone", order.customer_phone)
        .eq("is_paid", true)
        .neq("id", orderId)
        .not("shipping_service_id", "is", null)
        .gte("created_at", new Date(Date.now() - 10 * 86400_000).toISOString())
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (outro?.id) dica = ` Esta cliente tem outro pedido recente com frete (#${outro.id}): se este foi juntado a ele, envie na mesma remessa do #${outro.id}.`;
    }
    throw new Error(`Este pedido não tem o serviço dos Correios escolhido (PAC, SEDEX ou Mini Envios), então não dá para criar a remessa sem arriscar postar no serviço errado.${dica}`);
  }
  const dadosBase = {
    remetente: await remetenteDaEmpresa(supabase, creds),
    destinatario: {
      nome: order.customer_name || "Cliente",
      cpfCnpj: cliRes.data?.cpf,
      email: cliRes.data?.email,
      telefone: order.customer_phone,
      logradouro: order.customer_street || "",
      numero: order.customer_number,
      complemento: order.customer_complement,
      bairro: order.customer_neighborhood || "",
      cidade: order.customer_city || "",
      uf: order.customer_state || "",
      cep: order.customer_cep || "",
    },
    codigoServico: servicoBase,
    logisticaReversa: !!codigoReversa,
    pesoGramas: Math.max(1, qtd * pesoKg * 1000),
    // caixa padrão da empresa (Correios > Configuração) para PAC/SEDEX; sem ela, as medidas padrão do sistema. O Mini Envios usa a caixa 16 x 11 x 3.
    dimensoesCm: (codigoReversa ? (d: any) => d : (d: any) => ajustarDimensoes(servicoBase, d, creds.codigos_servico))({
      altura: Number(caixa.shipping_box_height_cm) || Number(cfg.default_height_cm) || 6,
      largura: Number(caixa.shipping_box_width_cm) || Number(cfg.default_width_cm) || 13,
      comprimento: Number(caixa.shipping_box_length_cm) || Number(cfg.default_length_cm) || 16,
    }),
    descricaoConteudo: descricao,
    valorDeclarado: valor,
  };

  const { token } = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem, creds.contrato);
  // Alguns cartões não têm o código novo do serviço: tenta o código equivalente do MESMO serviço
  let criada: { id: string; codigoObjeto: string | null } | null = null;
  let ultimoErro: Error | null = null;
  for (const codigo of codigosParaTentar(servicoBase, creds.codigos_servico)) {
    try {
      criada = await enviarPrePostagem(token, montarCorpoPrePostagem({ ...dadosBase, codigoServico: codigo }));
      break;
    } catch (e) {
      ultimoErro = e as Error;
      if (!codigoNaoExisteNoCartao(ultimoErro.message)) throw ultimoErro;
      log(`Código ${codigo} não existe no cartão; tentando o equivalente`);
    }
  }
  if (!criada) throw ultimoErro || new Error("Não foi possível criar a pré-postagem.");

  // A pré-postagem apenas reserva o código; não confirma que o objeto foi enviado.
  const updateData: Record<string, unknown> = { melhor_envio_shipment_id: criada.id };
  if (criada.codigoObjeto) {
    updateData.melhor_envio_tracking_code = criada.codigoObjeto;
    updateData.tracking_posted = false;
  }
  const { error: upErr } = await supabase.from("orders").update(updateData).eq("id", orderId).eq("tenant_id", creds.tenant_id);
  if (upErr) log(`⚠️ Erro ao salvar a pré-postagem no pedido ${orderId}: ${upErr.message}`);

  return { idPrePostagem: criada.id, codigoObjeto: criada.codigoObjeto };
}

async function actionDownloadLabel(
  creds: CorreiosCredentials,
  prePostagemId: string,
  supabase?: any,
  orderId?: number | string,
  existingRecibo?: string,
): Promise<DownloadLabelResult> {
  const deadline = Date.now() + LABEL_WAIT_BUDGET_MS;
  const { token, cartaoData } = await getCorreiosToken(
    creds.client_id,
    creds.client_secret,
    creds.cartao_postagem,
    creds.contrato,
  );

  // Continuação: os Correios já receberam o pedido da etiqueta nesta remessa;
  // só esperamos o mesmo recibo (pedir outro recomeçaria a fila).
  if (existingRecibo) {
    log(`⏳ Continuando a espera do recibo ${existingRecibo} (pré-postagem ${prePostagemId})`);
    const cont = await tryDownloadAsyncLabel(existingRecibo, token, deadline);
    if (cont.ok) {
      return { success: true, labelPdfBase64: cont.base64, idRecibo: existingRecibo, idPrePostagem: prePostagemId };
    }
    if (!cont.regenerate && cont.retryable) {
      return { success: false, pending: true, idRecibo: existingRecibo, idPrePostagem: prePostagemId };
    }
    if (!cont.regenerate) {
      return { success: false, idRecibo: existingRecibo, error: `Os Correios recusaram a etiqueta: ${cont.bodyText}` };
    }
    log(`Recibo ${existingRecibo} expirou nos Correios (PPN-295); pedindo uma etiqueta nova`);
  }

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
  const isNative = isCorreiosNativeId(effectiveId);
  // Para ID nativo (PR...) a API de GET da pré-postagem responde 405 e só gasta tempo: o próprio pedido de rótulo diz se não pode emitir.
  const statusCheck = isNative
    ? { ok: true, status: "PRE_POSTADO" as string | null, rawJson: null as any, httpStatus: 200, bodyText: "" }
    : await fetchPrePostagemStatus(token, effectiveId);

  // REGRA: IDs nativos dos Correios (PR...) NUNCA são recriados.
  // Apenas IDs estrangeiros (UUID) podem disparar recreatePrepostagemFromOrder.
  const needsRecreate =
    !recreated &&
    !isNative &&
    (statusCheck.httpStatus === 404 || !isPrePostadoStatus(statusCheck.status));

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
  } else if (
    !isPrePostadoStatus(statusCheck.status) &&
    !(isNative && /^\d+$/.test(String(statusCheck.status ?? "").trim()))
  ) {
    // (status só numérico em ID nativo: não dá para decidir pelo código; segue e deixa os Correios responderem na emissão)
    const currentStatus = statusCheck.status || "DESCONHECIDO";
    const baseMsg = `Pré-postagem ${effectiveId} está com status "${currentStatus}" — rótulo só pode ser emitido quando status == "PRE_POSTADO".`;
    const errMsg = isNative
      ? `${baseMsg} Como o ID já é nativo dos Correios, não será recriado automaticamente. Verifique a pré-postagem no painel dos Correios.`
      : `${baseMsg} ${!supabase || !orderId ? "Forneça order_id para recriar automaticamente." : ""}`;
    log(`❌ ${errMsg}`);
    return {
      success: false,
      error: errMsg,
      details: {
        prePostagemId: effectiveId,
        currentStatus,
        httpStatus: statusCheck.httpStatus,
        rawResponse: statusCheck.rawJson || statusCheck.bodyText,
        isNativeCorreiosId: isNative,
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
      // pedido mínimo, o mesmo que funciona em produção no Troca Fácil
      label: "troca-facil",
      body: { idsPrePostagem: [String(effectiveId)], tipoRotulo: "P" },
    },
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

      const response = await fetchComLimite(asyncUrl, {
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

      // Espera o recibo até o fim do tempo desta chamada.
      const asyncDownload = await tryDownloadAsyncLabel(idRecibo, token, deadline);
      log(
        `Resultado download | url: ${asyncDownload.url} | status: ${asyncDownload.status} | content-type: ${asyncDownload.contentType} | ${asyncDownload.ok ? "PDF recebido" : `body: ${asyncDownload.bodyText}`}`,
      );

      if (asyncDownload.ok) {
        return { success: true, labelPdfBase64: asyncDownload.base64, idRecibo, idPrePostagem: effectiveId, recreated };
      }

      lastError = asyncDownload.bodyText || responseText;

      if (asyncDownload.regenerate && generationAttempt < 3 && Date.now() + 20_000 < deadline) {
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

      if (asyncDownload.retryable) {
        // Os Correios só estão demorando: NÃO pedir outra etiqueta. O navegador
        // chama de novo com este idRecibo e continua a espera.
        log(`Recibo ${idRecibo} ainda em processamento; devolvendo "pending" para o navegador continuar`);
        return { success: false, pending: true, idRecibo, idPrePostagem: effectiveId, recreated };
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
  const { token } = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem, creds.contrato);

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

  let remetente: any = payload.remetente
    ? normalizeRemetente(payload.remetente, creds.from_cep)
    : normalizeRemetente(creds.webhook_secret, creds.from_cep);
  if (!remetente) throw new Error("Remetente não configurado. Salve os dados via action save_sender primeiro.");

  if (!remetente.telefone) {
    throw new Error("Telefone do remetente não configurado.");
  }
  if (!remetente.endereco.logradouro) {
    throw new Error("Logradouro do remetente não configurado (RTL-032).");
  }

  const declaracaoConteudo = payload.itensDeclaracaoConteudo
    || buildDeclaracaoConteudo(payload.valorDeclarado || payload.total_amount, payload.observacao);

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
    itensDeclaracaoConteudo: declaracaoConteudo,
    rfidObjeto: "",
  };

  const url = `${CORREIOS_BASE}/prepostagem/v1/prepostagens`;
  log(`Criando pré-postagem | POST /prepostagem/v1/prepostagens | dest CEP: ${destinatario.endereco.cep}`);
  log(`📦 payload completo: ${JSON.stringify(body)}`);

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
    if (codigoObjeto) {
      updateData.melhor_envio_tracking_code = String(codigoObjeto);
      // A pré-postagem apenas reserva o código; não confirma que o objeto foi enviado.
      updateData.tracking_posted = false;
    }

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

// ----- Criação automática da remessa quando o pedido é pago -----
// Roda a cada minuto (pg_cron). Só age em empresas que ligaram "Criar remessa ao pagar" (shipping_integrations.service_codes.AutoRemessa)
// e só em pedidos pagos, não cancelados, com frete dos Correios escolhido e SEM remessa. Cada pedido é "reservado" na tabela
// correios_auto_remessa_log antes de ser processado, então duas execuções ao mesmo tempo nunca criam duas remessas para o mesmo pedido.
// A remessa NÃO marca o pedido como enviado nem avisa o cliente: isso só acontece quando os Correios confirmam a postagem.
async function autoSweep(supabase: any) {
  const inicio = Date.now();
  const { data: integs } = await supabase.from("shipping_integrations").select("tenant_id, service_codes").eq("provider", "correios").eq("is_active", true);
  const tenants: string[] = (integs || [])
    .filter((i: any) => i.service_codes && (i.service_codes.AutoRemessa === true || i.service_codes.AutoRemessa === "true"))
    .map((i: any) => i.tenant_id);
  if (!tenants.length) return { success: true, empresas: 0, criadas: 0 };

  const desde = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: pedidos } = await supabase
    .from("orders")
    .select("id, tenant_id, payment_method")
    .in("tenant_id", tenants)
    .eq("is_paid", true)
    .or("is_cancelled.is.null,is_cancelled.eq.false")
    .is("melhor_envio_shipment_id", null)
    .not("shipping_service_id", "is", null)
    .gte("created_at", desde)
    .order("id", { ascending: true })
    .limit(60);
  const candidatos: any[] = (pedidos || []).filter((p: any) => p.payment_method !== "pay_on_pickup");
  if (!candidatos.length) return { success: true, empresas: tenants.length, criadas: 0 };

  const { data: logs } = await supabase.from("correios_auto_remessa_log").select("order_id, status, attempts, last_attempt_at").in("order_id", candidatos.map((p) => p.id));
  const logDe = new Map<number, any>((logs || []).map((l: any) => [Number(l.order_id), l]));
  const credsPorEmpresa = new Map<string, CorreiosCredentials | null>();
  let criadas = 0, falhas = 0, ignoradas = 0;

  for (const p of candidatos) {
    if (Date.now() - inicio > 80_000 || criadas + falhas >= 8) break; // o resto fica para a próxima rodada (1 min)
    const l = logDe.get(Number(p.id));
    const agora = Date.now();
    const parado = l && agora - new Date(l.last_attempt_at).getTime() > 10 * 60_000;
    let reservado = false;
    if (!l) {
      const { data: ins } = await supabase.from("correios_auto_remessa_log").upsert({ order_id: p.id, tenant_id: p.tenant_id, status: "processando", attempts: 0 }, { onConflict: "order_id", ignoreDuplicates: true }).select("order_id");
      reservado = (ins?.length ?? 0) > 0;
    } else if ((l.status === "erro" && Number(l.attempts) < 3 && parado) || (l.status === "processando" && parado)) {
      const { data: upd } = await supabase.from("correios_auto_remessa_log").update({ status: "processando", last_attempt_at: new Date().toISOString() })
        .eq("order_id", p.id).eq("attempts", l.attempts).eq("status", l.status).select("order_id");
      reservado = (upd?.length ?? 0) > 0;
    }
    if (!reservado) { ignoradas++; continue; }

    try {
      if (!credsPorEmpresa.has(p.tenant_id)) credsPorEmpresa.set(p.tenant_id, await getCredentials(supabase, p.tenant_id).catch(() => null));
      const creds = credsPorEmpresa.get(p.tenant_id);
      if (!creds) throw new Error("Credenciais dos Correios incompletas para esta empresa.");
      const criada = await recreatePrepostagemFromOrder(supabase, creds, p.id);
      await supabase.from("correios_auto_remessa_log").update({ status: "criada", error: null, last_attempt_at: new Date().toISOString() }).eq("order_id", p.id);
      log(`auto_sweep: remessa ${criada.idPrePostagem} criada para o pedido ${p.id}`);
      criadas++;
    } catch (e) {
      const msg = String((e as Error).message || e).slice(0, 300);
      await supabase.from("correios_auto_remessa_log").update({ status: "erro", error: msg, attempts: Number(l?.attempts ?? 0) + 1, last_attempt_at: new Date().toISOString() }).eq("order_id", p.id);
      log(`auto_sweep: pedido ${p.id} falhou: ${msg}`);
      falhas++;
    }
  }
  return { success: true, empresas: tenants.length, criadas, falhas, ignoradas };
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

    // Chamada do agendamento (pg_cron): não tem empresa nem usuário; só age onde a empresa ligou a criação automática
    if (action === "auto_sweep") {
      const r = await autoSweep(supabase);
      return new Response(JSON.stringify(r), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log(`action: ${action} | tenant: ${tenant_id}`);

    // Só usuário logado da própria empresa (ou super admin) pode criar, imprimir ou cancelar etiqueta
    const guard = await authorizeTenantCaller(req, supabase, tenant_id);
    if (!guard.ok) return guardResponse(guard, corsHeaders);

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

    // ----- Ações usadas pela tela de Etiquetas (por pedido) -----
    const respostaJson = (obj: unknown) =>
      new Response(JSON.stringify(obj), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const orderIdBody = body.order_id ?? body.orderId;

    if (action === "create_shipment") {
      if (!orderIdBody) return respostaJson({ success: false, error: "order_id é obrigatório" });
      try {
        const { data: ja } = await supabase
          .from("orders")
          .select("melhor_envio_shipment_id, melhor_envio_tracking_code")
          .eq("id", orderIdBody)
          .eq("tenant_id", tenant_id)
          .maybeSingle();
        // Pedido que já tem pré-postagem dos Correios não gasta outra etiqueta
        if (ja?.melhor_envio_shipment_id && isCorreiosNativeId(String(ja.melhor_envio_shipment_id))) {
          return respostaJson({ success: true, already: true, shipment_id: ja.melhor_envio_shipment_id, tracking_code: ja.melhor_envio_tracking_code || null });
        }
        const criada = await recreatePrepostagemFromOrder(supabase, creds, orderIdBody);
        return respostaJson({ success: true, shipment_id: criada.idPrePostagem, tracking_code: criada.codigoObjeto });
      } catch (e) {
        log(`ERRO create_shipment: ${(e as Error).message}`);
        return respostaJson({ success: false, error: (e as Error).message });
      }
    }

    if (action === "get_label") {
      if (!orderIdBody) return respostaJson({ success: false, error: "order_id é obrigatório" });
      try {
        const { data: ped } = await supabase
          .from("orders")
          .select("melhor_envio_shipment_id")
          .eq("id", orderIdBody)
          .eq("tenant_id", tenant_id)
          .maybeSingle();
        if (!ped?.melhor_envio_shipment_id) return respostaJson({ success: false, error: "Este pedido ainda não tem remessa nos Correios. Crie a remessa primeiro." });
        const reciboAnterior = typeof body.id_recibo === "string" && body.id_recibo.trim() ? body.id_recibo.trim() : undefined;
        const r = await actionDownloadLabel(creds, String(ped.melhor_envio_shipment_id), supabase, orderIdBody, reciboAnterior);
        if (r.success && r.labelPdfBase64) return respostaJson({ success: true, labelPdfBase64: r.labelPdfBase64 });
        if (r.pending) {
          return respostaJson({ success: false, pending: true, id_recibo: r.idRecibo, error: "Os Correios ainda estão gerando a etiqueta." });
        }
        return respostaJson({ success: false, error: r.error || "Não foi possível gerar a etiqueta." });
      } catch (e) {
        log(`ERRO get_label: ${(e as Error).message}`);
        return respostaJson({ success: false, error: (e as Error).message });
      }
    }

    if (action === "get_labels_batch") {
      // Várias etiquetas num PDF só. Os Correios travam quando várias pré-postagens vão no mesmo pedido de rótulo (PPN-291 sem fim),
      // então pedimos UMA por pré-postagem, em paralelo, e juntamos os PDFs aqui.
      try {
        const ids: number[] = Array.isArray(body.order_ids) ? body.order_ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n)) : [];
        if (!ids.length) return respostaJson({ success: false, error: "Selecione pelo menos um pedido." });
        if (ids.length > 30) return respostaJson({ success: false, error: "No máximo 30 etiquetas por PDF." });
        const { data: peds } = await supabase
          .from("orders")
          .select("id, melhor_envio_shipment_id, customer_name, customer_phone, customer_cep, customer_street, customer_number, customer_complement, customer_neighborhood, customer_city, customer_state, cart_id")
          .eq("tenant_id", tenant_id)
          .in("id", ids);
        // na ordem em que os pedidos foram selecionados
        const pedPorId = new Map((peds || []).map((p: any) => [Number(p.id), p]));
        const pedidosComRemessa = ids.map((id) => pedPorId.get(id)).filter((p: any) => p && isCorreiosNativeId(String(p.melhor_envio_shipment_id || "")));
        const prIds: string[] = pedidosComRemessa.map((p: any) => String(p.melhor_envio_shipment_id));
        if (!prIds.length) return respostaJson({ success: false, error: "Nenhum dos pedidos tem remessa dos Correios criada." });

        // Declaração de conteúdo de cada pedido: montada ANTES das etiquetas, para nunca sair
        // etiqueta sem declaração (nem declaração sem etiqueta). Cada pedido vira "etiqueta + declaração".
        const comDeclaracao = body.com_declaracao !== false;
        const declaracoes = new Map<string, Declaracao>();
        if (comDeclaracao) {
          const cartIds = pedidosComRemessa.map((p: any) => p.cart_id).filter((x: any) => x != null);
          const fones = [...new Set(pedidosComRemessa.map((p: any) => p.customer_phone).filter(Boolean))];
          const [{ data: itens }, { data: clientes }, { data: emp }, { data: ajustes }] = await Promise.all([
            cartIds.length ? supabase.from("cart_items").select("cart_id, product_name, qty, unit_price").in("cart_id", cartIds) : Promise.resolve({ data: [] }),
            fones.length ? supabase.from("customers").select("phone, cpf").eq("tenant_id", tenant_id).in("phone", fones) : Promise.resolve({ data: [] }),
            supabase.from("tenants").select("name, company_name, company_document, company_address, company_number, company_complement, company_district, company_city, company_state, company_cep").eq("id", tenant_id).maybeSingle(),
            supabase.from("app_settings").select("default_weight_kg").limit(1).maybeSingle(),
          ]);
          const itensPorCarrinho = new Map<number, any[]>();
          for (const it of (itens || []) as any[]) itensPorCarrinho.set(it.cart_id, [...(itensPorCarrinho.get(it.cart_id) || []), it]);
          const cpfPorFone = new Map<string, string>();
          for (const c of (clientes || []) as any[]) if (c.cpf) cpfPorFone.set(c.phone, c.cpf);
          const pesoUnit = Number((ajustes as any)?.default_weight_kg) > 0 ? Number((ajustes as any).default_weight_kg) : 0.01;
          const e: any = emp || {};
          const faltas: string[] = [];
          for (const p of pedidosComRemessa as any[]) {
            const its = p.cart_id != null ? itensPorCarrinho.get(p.cart_id) || [] : [];
            const qtd = its.reduce((s: number, i: any) => s + (Number(i.qty) || 1), 0);
            const d: Declaracao = {
              pedidoId: p.id,
              pesoKg: Math.max(0.01, qtd * pesoUnit),
              remetente: {
                nome: e.company_name || e.name || "", documento: e.company_document, rua: e.company_address || "", numero: e.company_number,
                complemento: e.company_complement, bairro: e.company_district, cidade: e.company_city || "", uf: e.company_state || "", cep: e.company_cep || "",
              },
              destinatario: {
                nome: p.customer_name || "Cliente", documento: cpfPorFone.get(p.customer_phone) || null, rua: p.customer_street || "", numero: p.customer_number,
                complemento: p.customer_complement, bairro: p.customer_neighborhood, cidade: p.customer_city || "", uf: p.customer_state || "", cep: p.customer_cep || "",
              },
              itens: its.map((i: any) => ({ descricao: i.product_name || "Produto", quantidade: Number(i.qty) || 1, valorUnit: Number(i.unit_price) || 0 })),
            };
            const falta = faltaNaDeclaracao(d);
            if (falta.length) faltas.push(`Pedido #${p.id}: falta ${falta.join(", ")}`);
            declaracoes.set(String(p.melhor_envio_shipment_id), d);
          }
          if (faltas.length) {
            return respostaJson({ success: false, error: `Não dá para gerar a declaração de conteúdo, então nenhuma etiqueta foi impressa. ${faltas.slice(0, 3).join(" · ")}${faltas.length > 3 ? ` (e mais ${faltas.length - 3})` : ""}` });
          }
        }
        const deadline = Date.now() + LABEL_WAIT_BUDGET_MS;
        // A4 = layout padrão dos Correios; Zebra = etiqueta térmica 100 x 150 mm
        const formato = body.formato === "zebra" ? "zebra" : null;
        const recibosAnt: Record<string, string> = body.recibos && typeof body.recibos === "object" ? body.recibos : {};
        const recibos: Record<string, string> = { ...recibosAnt };

        // Os pedidos de etiqueta feitos daqui (servidor de funções) ficam presos nos Correios
        // ("ainda não foi gerado" e depois PPN-295), enquanto os mesmos pedidos feitos pelo banco
        // saem em 1–2 s. Por isso a conversa com os Correios para gerar/baixar o rótulo é feita
        // pela função do banco correios_rotulo, uma etiqueta por vez.
        const pdfs: Record<string, string> = {};
        // Etiquetas que o navegador já recebeu em rodadas anteriores: não pede de novo aos Correios.
        const pdfsAnt = body.pdfs && typeof body.pdfs === "object" ? body.pdfs as Record<string, unknown> : {};
        for (const pr of prIds) {
          const d = pdfsAnt[pr];
          if (typeof d === "string" && d.length > 100 && d.length < 3_000_000) pdfs[pr] = d;
        }
        const jaTinha = new Set(Object.keys(pdfs));
        // Remessas que os Correios já informaram como postadas (não imprimem mais o rótulo).
        const postados = new Set<string>(Array.isArray(body.postados) ? body.postados.map(String).filter((x: string) => prIds.includes(x)) : []);
        for (const pr of postados) delete pdfs[pr];
        const erros: Array<{ pr: string; erro: string }> = [];
        type Rot = { status: "ok" | "pendente" | "falha" | "erro" | "postado"; recibo?: string; dados?: string; mensagem?: string; rpcErro?: boolean };
        const rotulo = async (pr: string, recibo?: string): Promise<Rot> => {
          const { data, error } = await supabase.rpc("correios_rotulo", {
            _tenant_id: tenant_id,
            _pre_postagem: pr,
            _layout: formato,
            _recibo: recibo ?? null,
          });
          if (error) {
            log(`[${pr}] erro ao chamar correios_rotulo: ${error.message}`);
            return { status: "pendente", recibo, mensagem: error.message, rpcErro: true };
          }
          const r = data as Rot;
          if (r?.status !== "ok") log(`[${pr}] correios_rotulo: ${r?.status} ${r?.mensagem || ""}`);
          return r;
        };
        const tempoAcabando = () => Date.now() > deadline - 10_000;

        // 1) Recibos já pedidos em rodadas anteriores: confere cada um.
        for (const pr of prIds) {
          const rec = recibos[pr];
          if (!rec || pdfs[pr] || postados.has(pr)) continue;
          if (tempoAcabando()) break;
          const r = await rotulo(pr, rec);
          if (r.status === "ok" && r.dados) pdfs[pr] = r.dados;
          else if (r.status === "postado") { postados.add(pr); delete recibos[pr]; }
          else if (r.status === "falha") delete recibos[pr];
          else if (r.status === "erro") { erros.push({ pr, erro: r.mensagem || "erro" }); delete recibos[pr]; }
        }

        // 2) Etiquetas que faltam: uma de cada vez.
        // Uma chamada que falhou no caminho (ex.: Correios lentos) não encerra a rodada: tenta de novo e segue para a próxima.
        let falhasSeguidas = 0;
        for (const pr of prIds) {
          if (pdfs[pr] || postados.has(pr) || erros.some((e) => e.pr === pr)) continue;
          if (tempoAcabando() || falhasSeguidas >= 4) break;
          let r = await rotulo(pr, recibos[pr]);
          let tentativas = 1;
          while (r.status === "pendente" && !tempoAcabando() && tentativas < 8) {
            if (r.recibo) recibos[pr] = r.recibo;
            await new Promise((ok) => setTimeout(ok, 1_500));
            r = await rotulo(pr, recibos[pr]);
            tentativas++;
          }
          if (r.status === "ok" && r.dados) { pdfs[pr] = r.dados; falhasSeguidas = 0; continue; }
          if (r.status === "postado") { postados.add(pr); delete recibos[pr]; falhasSeguidas = 0; continue; }
          if (r.status === "erro") { erros.push({ pr, erro: r.mensagem || "erro" }); delete recibos[pr]; continue; }
          if (r.status === "falha") delete recibos[pr];
          else if (r.recibo) recibos[pr] = r.recibo;
          falhasSeguidas++;
        }

        const prontas = Object.keys(pdfs).length;
        const pedidoDoPr = new Map(pedidosComRemessa.map((p: any) => [String(p.melhor_envio_shipment_id), Number(p.id)]));
        const pedidosPostados = [...postados].map((pr) => pedidoDoPr.get(pr)).filter((x): x is number => x != null);
        log(`get_labels_batch | ${prIds.length} etiquetas | prontas: ${prontas} | já postadas: ${postados.size} | pendentes: ${prIds.length - prontas - erros.length - postados.size} | erros: ${erros.length}`);
        if (erros.length) {
          const quais = erros.slice(0, 3).map((e) => `#${pedidoDoPr.get(e.pr) ?? e.pr}`).join(", ");
          return respostaJson({ success: false, error: `Os Correios recusaram ${erros.length} etiqueta(s) (pedido ${quais}): ${erros[0].erro}` });
        }
        if (postados.size === prIds.length) {
          // nada para imprimir: o navegador avisa quais pedidos já foram postados
          return respostaJson({ success: true, labelPdfBase64: null, total: 0, pedidos_postados: pedidosPostados });
        }
        if (prontas + postados.size < prIds.length) {
          const novos: Record<string, string> = {};
          for (const [pr, d] of Object.entries(pdfs)) if (!jaTinha.has(pr)) novos[pr] = d;
          return respostaJson({ success: false, pending: true, recibos, prontas, total: prIds.length, pdfs: novos, postados: [...postados] });
        }

        const { PDFDocument } = await import("npm:pdf-lib@1.17.1");
        const saida = await PDFDocument.create();
        for (const pr of prIds) {
          if (!pdfs[pr]) continue; // já postada: sem etiqueta
          const origem = await PDFDocument.load(Uint8Array.from(atob(pdfs[pr]), (c) => c.charCodeAt(0)));
          const paginas = await saida.copyPages(origem, origem.getPageIndices());
          paginas.forEach((pg: any) => saida.addPage(pg));
          // logo depois da etiqueta, a declaração de conteúdo do MESMO pedido
          const decl = declaracoes.get(pr);
          if (decl) await desenharDeclaracao(saida, decl, formato === "zebra");
        }
        const bytes: Uint8Array = await saida.save();
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return respostaJson({ success: true, labelPdfBase64: btoa(bin), total: prontas, com_declaracao: declaracoes.size, pedidos_postados: pedidosPostados });
      } catch (e) {
        log(`ERRO get_labels_batch: ${(e as Error).message}`);
        return respostaJson({ success: false, error: (e as Error).message });
      }
    }

    if (action === "cancel_shipment") {
      if (!orderIdBody) return respostaJson({ success: false, error: "order_id é obrigatório" });
      try {
        const { data: ped } = await supabase
          .from("orders")
          .select("melhor_envio_shipment_id")
          .eq("id", orderIdBody)
          .eq("tenant_id", tenant_id)
          .maybeSingle();
        const idPrePost = ped?.melhor_envio_shipment_id ? String(ped.melhor_envio_shipment_id) : "";
        if (!idPrePost) return respostaJson({ success: false, error: "Este pedido não tem remessa para cancelar." });
        if (isCorreiosNativeId(idPrePost)) {
          const { token } = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem, creds.contrato);
          const r = await fetch(`${CORREIOS_BASE}/prepostagem/v1/prepostagens/${encodeURIComponent(idPrePost)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          });
          const t = await r.text();
          log(`cancel_shipment | status: ${r.status} | body: ${t.slice(0, 500)}`);
          // objeto já postado não pode ser cancelado (PPN-288)
          if (!r.ok && r.status !== 404) throw new Error(mensagemErroCorreios(r.status, t));
        }
        await supabase
          .from("orders")
          .update({ melhor_envio_shipment_id: null, melhor_envio_tracking_code: null, tracking_posted: false })
          .eq("id", orderIdBody)
          .eq("tenant_id", tenant_id);
        return respostaJson({ success: true });
      } catch (e) {
        log(`ERRO cancel_shipment: ${(e as Error).message}`);
        return respostaJson({ success: false, error: (e as Error).message });
      }
    }

    if (action === "get_tracking") {
      // Consulta o rastreio oficial; quando o objeto já foi postado, marca tracking_posted = true (o gatilho do banco dispara o WhatsApp).
      if (!orderIdBody) return respostaJson({ success: false, error: "order_id é obrigatório" });
      try {
        const { data: ped } = await supabase
          .from("orders")
          .select("melhor_envio_tracking_code, tracking_posted")
          .eq("id", orderIdBody)
          .eq("tenant_id", tenant_id)
          .maybeSingle();
        const codigo = String(ped?.melhor_envio_tracking_code || "").trim();
        if (!codigo) return respostaJson({ success: true, posted: false, reason: "sem_rastreio" });
        if (ped?.tracking_posted) return respostaJson({ success: true, posted: true, already: true });
        const { token } = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem, creds.contrato);
        const r = await fetch(`${CORREIOS_BASE}/srorastro/v1/objetos?resultado=U&codigosObjetos=${encodeURIComponent(codigo)}`, {
          // SRO-018: o rastreio exige idioma válido (pt-BR/en/es-ES); sem o cabeçalho, o ambiente da função manda um valor que os Correios recusam
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Accept-Language": "pt-BR" },
        });
        const t = await r.text();
        log(`get_tracking ${codigo} | HTTP ${r.status} | ${t.slice(0, 400)}`);
        if (!r.ok) return respostaJson({ success: false, error: mensagemErroCorreios(r.status, t) });
        let eventos: any[] = [];
        try { eventos = JSON.parse(t)?.objetos?.[0]?.eventos || []; } catch { /* sem eventos */ }
        const situacao = situacaoRastreio(eventos);
        if (situacao === "postado") {
          await supabase.from("orders").update({ tracking_posted: true }).eq("id", orderIdBody).eq("tenant_id", tenant_id);
        }
        return respostaJson({ success: true, posted: situacao === "postado", situacao });
      } catch (e) {
        log(`ERRO get_tracking: ${(e as Error).message}`);
        return respostaJson({ success: false, error: (e as Error).message });
      }
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
