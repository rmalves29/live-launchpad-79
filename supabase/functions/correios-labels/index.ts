// supabase/functions/correios-labels/index.ts
// Edge Function: correios-labels
// Reescrita do zero com fluxo correto de geração de rótulo:
// 1. POST /prepostagem/v1/prepostagens/rotulo/assincrono/pdf -> idRecibo
// 2. Polling em GET /prepostagem/v1/prepostagens/rotulo/assincrono/{idRecibo}
// 3. Retorna PDF base64 ou pending: true
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CORREIOS_BASE = "https://api.correios.com.br";
const LOG_PREFIX = "[correios-labels]";

// ----- Cache de token em memória (válido enquanto a function estiver quente) -----
interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
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

// ----- Autenticação com cache -----
async function getCorreiosToken(
  clientId: string,
  clientSecret: string,
  cartaoPostagem: string,
): Promise<string> {
  const cacheKey = `${clientId}:${cartaoPostagem}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    log("Token em cache reutilizado");
    return cached.token;
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

  // Expira em ~24h, mas guardamos por 23h para segurança
  const expiresAt = Date.now() + 23 * 60 * 60 * 1000;
  tokenCache.set(cacheKey, { token, expiresAt });
  return token;
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
  supabase: ReturnType<typeof createClient>,
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

  if (!data.client_id || !data.client_secret || !data.refresh_token) {
    throw new Error("Credenciais incompletas (client_id, client_secret e cartão de postagem são obrigatórios)");
  }

  return {
    client_id: data.client_id,
    client_secret: data.client_secret,
    cartao_postagem: data.refresh_token,
    contrato: data.scope || null,
    from_cep: data.from_cep || "",
    webhook_secret: (data as any).webhook_secret || null,
    integration_id: data.id,
  };
}

// ----- ACTION: save_sender -----
async function actionSaveSender(
  supabase: ReturnType<typeof createClient>,
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
}

async function actionDownloadLabel(
  creds: CorreiosCredentials,
  prePostagemId: string,
): Promise<DownloadLabelResult> {
  const token = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem);

  // Etapa 1 — Solicitar geração assíncrona
  // A API CWS dos Correios exige body completo com formato/tipo de rótulo.
  // Tentamos múltiplos formatos conhecidos da documentação.
  const asyncUrl = `${CORREIOS_BASE}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`;

  const bodyVariants: Array<{ label: string; body: Record<string, unknown> }> = [
    {
      label: "v1-idsPrePostagem-objetos",
      body: {
        idsPrePostagem: [
          {
            id: String(prePostagemId),
            tipoRotulo: "P", // P = Padrão (etiqueta), I = Introdutória
          },
        ],
        numeroCartaoPostagem: creds.cartao_postagem,
        idFormatoRotulo: "ET", // ET = Etiqueta
      },
    },
    {
      label: "v2-listaIdPrePostagem",
      body: {
        listaIdPrePostagem: [String(prePostagemId)],
        numeroCartaoPostagem: creds.cartao_postagem,
        idFormatoRotulo: "ET",
        tipoRotulo: "P",
      },
    },
    {
      label: "v3-idPrePostagem-cartaoPostagem",
      body: {
        idPrePostagem: [String(prePostagemId)],
        cartaoPostagem: creds.cartao_postagem,
        tipoRotulo: "P",
        formatoRotulo: "ET",
      },
    },
  ];

  let asyncResp: Response | null = null;
  let asyncText = "";
  let lastStatus = 0;

  for (const variant of bodyVariants) {
    log(`Etapa 1 | tentando variante: ${variant.label} | body: ${JSON.stringify(variant.body)}`);
    const r = await fetch(asyncUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(variant.body),
    });
    const t = await r.text();
    lastStatus = r.status;
    log(`Etapa 1 | variante ${variant.label} | status: ${r.status} | body: ${t}`);
    if (r.ok) {
      asyncResp = r;
      asyncText = t;
      break;
    }
    asyncText = t; // guarda o último erro para mensagem final
  }

  if (!asyncResp) {
    return {
      success: false,
      pending: false,
      error: `Falha ao solicitar rótulo assíncrono (${lastStatus}): ${asyncText}`,
    };
  }

  let asyncJson: any = null;
  try {
    asyncJson = JSON.parse(asyncText);
  } catch {
    throw new Error(`Resposta inválida da Etapa 1 (não-JSON): ${asyncText.slice(0, 300)}`);
  }

  // Possíveis nomes do recibo
  const idRecibo: string | undefined =
    asyncJson?.idRecibo ||
    asyncJson?.recibo ||
    asyncJson?.id ||
    asyncJson?.protocolo ||
    asyncJson?.numeroProtocolo;

  if (!idRecibo) {
    throw new Error(
      `idRecibo não retornado pela Etapa 1. Body completo: ${asyncText}`,
    );
  }

  log(`idRecibo obtido: ${idRecibo}`);

  // Etapa 2 — Polling até 10x com 5s de intervalo
  const pollUrl = `${CORREIOS_BASE}/prepostagem/v1/prepostagens/rotulo/assincrono/${idRecibo}`;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const pollResp = await fetch(pollUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf, application/json",
      },
    });

    const contentType = pollResp.headers.get("content-type") || "";

    // Se vier PDF binário direto
    if (contentType.includes("application/pdf")) {
      const buf = await pollResp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      log(
        `Polling ${attempt}/10 | status: ${pollResp.status} | content-type: ${contentType} | PDF recebido (${bytes.length} bytes)`,
      );
      return { success: true, labelPdfBase64: base64, idRecibo };
    }

    // Caso contrário, ler como texto e tentar parsear JSON
    const bodyText = await pollResp.text();
    log(
      `Polling ${attempt}/10 | status: ${pollResp.status} | content-type: ${contentType} | body: ${bodyText}`,
    );

    if (contentType.includes("application/json")) {
      try {
        const j = JSON.parse(bodyText);
        log(`Polling ${attempt}/10 | JSON keys: ${Object.keys(j || {}).join(", ")}`);

        // Procurar campo com base64 do PDF
        const candidate =
          j?.arquivo || j?.pdf || j?.conteudo || j?.rotulo || j?.base64 || j?.data;

        if (typeof candidate === "string" && candidate.length > 100) {
          // Já é base64 ou data URL
          const base64 = candidate.startsWith("data:")
            ? candidate.split(",")[1] || candidate
            : candidate;
          return { success: true, labelPdfBase64: base64, idRecibo };
        }

        // Se vier URL, baixa e converte
        const urlField = j?.url || j?.link || j?.urlArquivo;
        if (typeof urlField === "string" && urlField.startsWith("http")) {
          log(`Baixando PDF via URL retornada: ${urlField}`);
          const fileResp = await fetch(urlField);
          if (fileResp.ok) {
            const buf = await fileResp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = "";
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            const base64 = btoa(binary);
            return { success: true, labelPdfBase64: base64, idRecibo };
          }
        }
      } catch (e) {
        log(`Polling ${attempt}/10 | erro ao parsear JSON: ${(e as Error).message}`);
      }
    }

    // Aguarda 5s antes da próxima tentativa (exceto na última)
    if (attempt < 10) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Após 10 tentativas, ainda em processamento
  return {
    success: false,
    pending: true,
    idRecibo,
    error: "Rótulo em processamento. Tente novamente em 1 minuto.",
  };
}

// ----- ACTION: create_prepostagem -----
async function actionCreatePrepostagem(
  supabase: ReturnType<typeof createClient>,
  creds: CorreiosCredentials,
  payload: any,
) {
  const token = await getCorreiosToken(creds.client_id, creds.client_secret, creds.cartao_postagem);

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
    const dl = await actionDownloadLabel(creds, String(idPrePostagem));
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
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const result = await actionDownloadLabel(creds, String(prePostagemId));
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
