import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  antiBlockDelayLive,
  logAntiBlockDelay,
  addMessageVariation,
  getThrottleDelay,
  checkTenantRateLimit,
  simulateTyping,
} from "../_shared/anti-block-delay.ts";
import {
  sendText as evoSendText,
  sendButton as evoSendButton,
  sendPresenceAvailable,
  sendPresenceComposing,
  calcTypingDuration,
} from "../_shared/evolution-api.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const ZAPI_BASE_URL = "https://api.z-api.io";

interface ItemAddedRequest {
  tenant_id: string;
  customer_phone: string;
  product_name: string;
  product_code: string;
  quantity: number;
  unit_price: number;
  original_price?: number;
  order_id?: number;
  cart_id?: number;
  source_instance_id?: string;
  source_connected_phone?: string;
}

function validateInternalRequest(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (authHeader && supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50))) return true;
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && origin.includes(new URL(supabaseUrl).hostname)) return true;
  console.log("[zapi-send-item-added] Warning: Request without internal validation markers");
  return true;
}

function hasServiceRoleAuthorization(req: Request): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return Boolean(supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50)));
}

function normalizeDigits(value?: string | null): string {
  return (value || "").replace(/\D/g, "");
}

function normalizeBrazilianPhoneForSending(value?: string | null): string {
  let digits = normalizeDigits(value).replace(/^0+/, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    digits = digits.slice(2);
  } else if (digits.length > 11) {
    return "";
  }
  if (digits.length < 10 || digits.length > 11) return "";
  const ddd = Number(digits.slice(0, 2));
  if (Number.isNaN(ddd) || ddd < 11 || ddd > 99) return "";
  return "55" + digits;
}

function phoneMatches(a?: string | null, b?: string | null): boolean {
  const buildVariants = (value?: string | null) => {
    const digits = normalizeDigits(value);
    const variants = new Set<string>();
    if (!digits) return variants;
    variants.add(digits);
    if (digits.startsWith("55") && digits.length > 11) {
      variants.add(digits.slice(2));
    } else if (digits.length <= 11) {
      variants.add("55" + digits);
    }
    return variants;
  };
  const aVariants = buildVariants(a);
  const bVariants = buildVariants(b);
  return [...aVariants].some((variant) => bVariants.has(variant));
}

async function getCredentials(supabase: any, tenantId: string, sourceInstanceId?: string, sourceConnectedPhone?: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
    .select("zapi_instance_id, zapi_token, zapi_client_token, uazapi_url, uazapi_token, connected_phone, is_active, provider, send_item_added_msg, confirmation_timeout_minutes, template_solicitacao, template_com_link, template_item_added, item_added_button_enabled, item_added_button_label, item_added_button_url")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration) return null;
  if (integration.send_item_added_msg === false) return { disabled: true };

  const provider = integration.provider || "zapi";
  const commonFields = {
    disabled: false,
    confirmationTimeoutMinutes: integration.confirmation_timeout_minutes || 30,
    templateSolicitacao: integration.template_solicitacao || null,
    templateComLink: integration.template_com_link || null,
    templateItemAdded: integration.template_item_added || null,
    buttonEnabled: integration.item_added_button_enabled !== false,
    buttonLabel: (integration.item_added_button_label || "Pagar Agora").toString().slice(0, 20),
    buttonUrl: integration.item_added_button_url || null,
  };

  if (provider === "uazapi") {
    if (!((integration.uazapi_url && integration.uazapi_token) ? (integration.uazapi_url + "|" + integration.uazapi_token) : null)) return null;
    return { provider: "uazapi" as const, instanceName: ((integration.uazapi_url && integration.uazapi_token) ? (integration.uazapi_url + "|" + integration.uazapi_token) : null), ...commonFields };
  }

  if (!integration.zapi_instance_id || !integration.zapi_token) return null;

  let selectedIntegration = integration;
  if (sourceInstanceId && sourceInstanceId !== integration.zapi_instance_id) {
    const { data: sourceIntegration, error: sourceError } = await supabase
      .from("integration_whatsapp")
      .select("zapi_instance_id, zapi_token, zapi_client_token, connected_phone, is_active, provider")
      .eq("provider", "zapi")
      .eq("is_active", true)
      .eq("zapi_instance_id", sourceInstanceId)
      .maybeSingle();

    const sourcePhoneMatchesTenant = phoneMatches(sourceConnectedPhone, integration.connected_phone);
    if (!sourceError && sourceIntegration?.zapi_instance_id && sourceIntegration?.zapi_token && sourcePhoneMatchesTenant) {
      selectedIntegration = { ...integration, zapi_instance_id: sourceIntegration.zapi_instance_id, zapi_token: sourceIntegration.zapi_token, zapi_client_token: sourceIntegration.zapi_client_token };
    }
  }

  return {
    provider: "zapi" as const,
    instanceId: selectedIntegration.zapi_instance_id,
    token: selectedIntegration.zapi_token,
    clientToken: selectedIntegration.zapi_client_token || "",
    ...commonFields,
  };
}

function formatBRL(value: number): string {
  return "R$ " + value.toFixed(2).replace(".", ",");
}

const RANDOM_GREETINGS = [
  "Olá, tudo bem?",
  "Oi, tudo bem?",
  "Oi! Como você está?",
  "Olá! Como você está?",
  "Oi! Tudo certo por aí?",
  "Olá! Tudo certo?",
  "Oi! Espero que esteja bem.",
  "Olá! Espero que esteja tudo bem.",
  "Oi! Passando rapidinho...",
  "Olá! Passando para te avisar uma novidade.",
  "Oi! Tenho uma informação que pode te interessar.",
];

function pickRandomGreeting(): string {
  return RANDOM_GREETINGS[Math.floor(Math.random() * RANDOM_GREETINGS.length)];
}

function prependGreeting(message: string): string {
  return pickRandomGreeting() + "\n\n" + message;
}

async function loadOrderContext(
  supabase: any,
  tenantId: string,
  orderId?: number | null,
  cartId?: number | null,
  currentItem?: Pick<ItemAddedRequest, "product_name" | "product_code" | "quantity" | "unit_price">,
): Promise<{ itensPedido: string; totalPedido: string; numeroPedido: string }> {
  if (!orderId && !cartId && !currentItem) return { itensPedido: "", totalPedido: "", numeroPedido: "" };

  let order: { id: number; cart_id: number | null } | null = null;
  if (orderId) {
    const { data } = await supabase.from("orders").select("id, cart_id").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
    order = data;
  }

  const resolvedCartId = cartId || order?.cart_id || null;
  if (!order && resolvedCartId) {
    const { data } = await supabase.from("orders").select("id, cart_id").eq("cart_id", resolvedCartId).eq("tenant_id", tenantId).order("id", { ascending: false }).limit(1).maybeSingle();
    order = data;
  }

  const finalCartId = resolvedCartId || order?.cart_id || null;
  let itensPedido = "";
  let totalPedido = "";

  if (finalCartId) {
    const { data: items } = await supabase.from("cart_items").select("qty, unit_price, product_name, product_code, products:product_id(name, code)").eq("cart_id", finalCartId);
    const visibleItems = Array.isArray(items) ? items : [];
    const merged = new Map<string, { name: string; code: string; qty: number; price: number }>();
    for (const it of visibleItems) {
      const name = it.product_name || it.products?.name || "Produto";
      const code = it.product_code || it.products?.code || "";
      const key = code || name;
      merged.set(key, { name, code, qty: Number(it.qty) || 0, price: Number(it.unit_price) || 0 });
    }
    if (currentItem) {
      const code = currentItem.product_code || "";
      const name = currentItem.product_name || "Produto";
      const key = code || name;
      if (!merged.has(key)) merged.set(key, { name, code, qty: Number(currentItem.quantity) || 0, price: Number(currentItem.unit_price) || 0 });
    }
    if (merged.size > 0) {
      let total = 0;
      const lines: string[] = [];
      for (const it of merged.values()) {
        total += it.qty * it.price;
        const codeStr = it.code ? " (" + it.code + ")" : "";
        lines.push("* " + it.name + codeStr + " -- " + it.qty + "x " + formatBRL(it.price));
      }
      itensPedido = lines.join("\n");
      totalPedido = formatBRL(total);
    }
  } else if (currentItem) {
    const codeStr = currentItem.product_code ? " (" + currentItem.product_code + ")" : "";
    itensPedido = "* " + currentItem.product_name + codeStr + " -- " + currentItem.quantity + "x " + formatBRL(Number(currentItem.unit_price) || 0);
    totalPedido = formatBRL((Number(currentItem.quantity) || 0) * (Number(currentItem.unit_price) || 0));
  }

  return { itensPedido, totalPedido, numeroPedido: String(order?.id || orderId || "") };
}

function getDefaultTemplateSolicitacao(): string {
  return "Item adicionado ao pedido\n\n{{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nPosso te enviar o link para finalizar o pedido por aqui?\n\nResponda *SIM* para receber o link.";
}

function getDefaultTemplateComLink(): string {
  return "Item adicionado ao pedido\n\n{{produto}}\nQtd: *{{quantidade}}*\nValor: *R$ {{valor}}*\n\nFinalize seu pedido: {{link_checkout}}\n\nQualquer duvida, estou a disposicao!";
}

async function getTemplate(supabase: any, tenantId: string) {
  const { data: template } = await supabase.from("whatsapp_templates").select("content").eq("tenant_id", tenantId).eq("type", "ITEM_ADDED").maybeSingle();
  if (template?.content) return template.content;
  return getDefaultTemplateSolicitacao();
}

type ConsentDecision =
  | { action: "send_request"; reason: string; previousId?: string }
  | { action: "send_with_link"; stateId: string }
  | { action: "silence"; reason: string; stateId: string };

function buildConsentPhoneVariants(phone: string): string[] {
  const variants = new Set<string>();
  let p = (phone || "").replace(/\D/g, "");
  if (!p) return [];
  let baseWithoutCountry = p;
  if (p.startsWith("55") && p.length >= 12) baseWithoutCountry = p.slice(2);
  const baseWithCountry = baseWithoutCountry.startsWith("55") ? baseWithoutCountry : "55" + baseWithoutCountry;
  variants.add(baseWithoutCountry);
  variants.add(baseWithCountry);
  if (baseWithoutCountry.length === 11 && baseWithoutCountry[2] === "9") {
    const without9 = baseWithoutCountry.slice(0, 2) + baseWithoutCountry.slice(3);
    variants.add(without9);
    variants.add("55" + without9);
  } else if (baseWithoutCountry.length === 10) {
    const with9 = baseWithoutCountry.slice(0, 2) + "9" + baseWithoutCountry.slice(2);
    variants.add(with9);
    variants.add("55" + with9);
  }
  return Array.from(variants);
}

function canonicalConsentPhone(phone: string): string {
  const variants = buildConsentPhoneVariants(phone);
  const with55_11 = variants.find((v) => v.startsWith("55") && v.length === 13);
  if (with55_11) return with55_11;
  const with55_10 = variants.find((v) => v.startsWith("55") && v.length === 12);
  if (with55_10) return with55_10;
  return variants.find((v) => v.startsWith("55")) || variants[0];
}

async function evaluateConsent(supabase: any, tenantId: string, phone: string): Promise<ConsentDecision> {
  const variants = buildConsentPhoneVariants(phone);
  const { data: rows } = await supabase.from("whatsapp_consent_state").select("id, status, request_expires_at, consent_expires_at, consent_granted_at").eq("tenant_id", tenantId).in("customer_phone", variants).order("updated_at", { ascending: false }).limit(1);
  const state = rows && rows[0];
  const now = new Date();
  if (!state) return { action: "send_request", reason: "no_state" };
  const reqExp = state.request_expires_at ? new Date(state.request_expires_at) : null;
  const consExp = state.consent_expires_at ? new Date(state.consent_expires_at) : null;
  if (state.status === "active") {
    if (consExp && consExp > now) return { action: "send_with_link", stateId: state.id };
    return { action: "send_request", reason: "consent_expired", previousId: state.id };
  }
  if (state.status === "awaiting") {
    if (reqExp && reqExp > now) return { action: "silence", reason: "awaiting_response", stateId: state.id };
    return { action: "send_request", reason: "awaiting_window_passed", previousId: state.id };
  }
  if (state.status === "silenced") {
    if (reqExp && reqExp > now) return { action: "silence", reason: "silenced_window", stateId: state.id };
    return { action: "send_request", reason: "silenced_window_passed", previousId: state.id };
  }
  if (state.status === "declined") {
    if (reqExp && reqExp > now) return { action: "silence", reason: "declined_window", stateId: state.id };
    return { action: "send_request", reason: "declined_window_passed", previousId: state.id };
  }
  return { action: "send_request", reason: "unknown_status", previousId: state.id };
}

async function markRequestSent(supabase: any, tenantId: string, phone: string) {
  const canonical = canonicalConsentPhone(phone);
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000);
  await supabase.from("whatsapp_consent_state").upsert({ tenant_id: tenantId, customer_phone: canonical, status: "awaiting", request_sent_at: now.toISOString(), request_expires_at: expires.toISOString(), last_message_at: now.toISOString() }, { onConflict: "tenant_id,customer_phone" });
}

async function markActiveMessageSent(supabase: any, tenantId: string, stateId: string) {
  await supabase.from("whatsapp_consent_state").update({ last_message_at: new Date().toISOString() }).eq("id", stateId);
}

async function markSilenced(supabase: any, stateId: string) {
  await supabase.from("whatsapp_consent_state").update({ status: "silenced", last_message_at: new Date().toISOString() }).eq("id", stateId);
}

function buildPhoneCandidates(phone: string): string[] {
  let cleaned = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (cleaned.startsWith("55") && cleaned.length > 11) cleaned = cleaned.slice(2);
  const candidates = new Set<string>();
  if (cleaned.length === 10) {
    const withNinthDigit = cleaned.slice(0, 2) + "9" + cleaned.slice(2);
    candidates.add("55" + withNinthDigit);
    candidates.add("55" + cleaned);
  } else if (cleaned.length === 11 && cleaned[2] === "9") {
    candidates.add("55" + cleaned);
    candidates.add("55" + cleaned.slice(0, 2) + cleaned.slice(3));
  } else {
    candidates.add(cleaned.startsWith("55") ? cleaned : "55" + cleaned);
  }
  return Array.from(candidates);
}

async function resolveWhatsAppPhone(baseUrl: string, clientToken: string, phone: string): Promise<string> {
  const candidates = buildPhoneCandidates(phone);
  const headers: Record<string, string> = {};
  if (clientToken) headers["Client-Token"] = clientToken;
  for (const candidate of candidates) {
    try {
      const response = await fetch(baseUrl + "/phone-exists/" + candidate, { headers });
      const text = await response.text();
      if (!response.ok) continue;
      const data = JSON.parse(text);
      const canonicalPhone = (data?.phone || "").replace(/\D/g, "");
      if (data?.exists === true) {
        const isBRMobileCandidate = candidate.length === 13 && candidate.startsWith("55") && candidate[4] === "9";
        const canonicalStripsTheNine = isBRMobileCandidate && canonicalPhone.length === 12 && canonicalPhone[4] !== "9";
        if (canonicalStripsTheNine) return candidate;
        return canonicalPhone || candidate;
      }
    } catch (error: any) {
      console.warn("[zapi-send-item-added] phone-exists error for " + candidate + ": " + error?.message);
    }
  }
  return candidates[0];
}

function formatMessage(template: string, data: ItemAddedRequest, extras?: { itensPedido?: string; totalPedido?: string; numeroPedido?: string }): string {
  const unitPrice = data.unit_price.toFixed(2);
  const total = (data.quantity * data.unit_price).toFixed(2);
  const originalPrice = data.original_price ? data.original_price.toFixed(2) : "";
  const promoPrice = data.original_price && data.original_price > data.unit_price ? data.unit_price.toFixed(2) : "";
  const itensPedido = extras?.itensPedido || "";
  const totalPedido = extras?.totalPedido || "";
  const numeroPedido = extras?.numeroPedido || "";
  const v = (name: string) => new RegExp("\\{\\{\\s*" + name + "\\s*\\}\\}|\\{\\s*" + name + "\\s*\\}", "g");
  let result = template
    .replace(v("produto"), data.product_name + " (" + data.product_code + ")")
    .replace(v("quantidade"), String(data.quantity))
    .replace(v("valor"), unitPrice)
    .replace(v("preco"), unitPrice)
    .replace(v("total"), total)
    .replace(v("subtotal"), total)
    .replace(v("codigo"), data.product_code)
    .replace(v("valor_original"), originalPrice)
    .replace(v("valor_promo"), promoPrice)
    .replace(v("itens_pedido"), itensPedido)
    .replace(v("total_pedido"), totalPedido)
    .replace(v("numero_pedido"), numeroPedido);
  const hasVar = (line: string, name: string) => new RegExp("\\{\\{\\s*" + name + "\\s*\\}\\}|\\{\\s*" + name + "\\s*\\}").test(line);
  result = result
    .split("\n")
    .filter((line) => {
      if (!originalPrice && hasVar(line, "valor_original")) return false;
      if (!promoPrice && hasVar(line, "valor_promo")) return false;
      if (!numeroPedido && hasVar(line, "numero_pedido")) return false;
      if (!itensPedido && hasVar(line, "itens_pedido")) return false;
      if (!totalPedido && hasVar(line, "total_pedido")) return false;
      return true;
    })
    .join("\n");
  return result;
}

async function getCheckoutUrl(supabase: any, tenantId: string, phone: string): Promise<string> {
  const { data: tenant } = await supabase.from("tenants").select("slug").eq("id", tenantId).maybeSingle();
  const { data: settings } = await supabase.from("app_settings").select("public_base_url").limit(1).maybeSingle();
  const baseUrl = settings?.public_base_url || "https://live-launchpad-79.lovable.app";
  const slug = tenant?.slug || tenantId;
  return baseUrl + "/t/" + slug + "/checkout";
}

function validateRequest(body: any): body is ItemAddedRequest {
  if (!body || typeof body !== "object") return false;
  if (!body.tenant_id || typeof body.tenant_id !== "string") return false;
  if (!body.customer_phone || typeof body.customer_phone !== "string") return false;
  if (!body.product_name || typeof body.product_name !== "string") return false;
  if (body.product_name.length > 2000) return false;
  if (!normalizeBrazilianPhoneForSending(body.customer_phone)) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const timestamp = new Date().toISOString();

  try {
    if (!validateInternalRequest(req)) {
      return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    if (!validateRequest(body)) {
      return new Response(JSON.stringify({ error: "Dados invalidos ou incompletos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const processInBackground = async () => {
      const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price, original_price, order_id, cart_id } = body;
      const source_instance_id = hasServiceRoleAuthorization(req) ? body.source_instance_id : undefined;
      const source_connected_phone = hasServiceRoleAuthorization(req) ? body.source_connected_phone : undefined;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: tenant, error: tenantError } = await supabase.from("tenants").select("id").eq("id", tenant_id).maybeSingle();
      if (tenantError || !tenant) return;

      const credentials = await getCredentials(supabase, tenant_id, source_instance_id, source_connected_phone);
      if (!credentials) return;
      if (credentials.disabled) return;

      if (!checkTenantRateLimit(tenant_id)) return;

      const provider = credentials.provider;
      let formattedPhone: string;

      if (provider === "zapi") {
        const baseUrl = ZAPI_BASE_URL + "/instances/" + (credentials as any).instanceId + "/token/" + (credentials as any).token;
        formattedPhone = await resolveWhatsAppPhone(baseUrl, (credentials as any).clientToken, customer_phone);
      } else {
        formattedPhone = normalizeBrazilianPhoneForSending(customer_phone);
        if (!formattedPhone) {
          console.error("[zapi-send-item-added] Telefone inválido para uazapi:", customer_phone);
          await supabase.from("whatsapp_messages").insert({ tenant_id, phone: normalizeDigits(customer_phone), message: "[FALHA - telefone inválido] " + product_name + " (" + product_code + ")", type: "item_added", product_name: product_name.substring(0, 100), sent_at: new Date().toISOString(), order_id: order_id || null, delivery_status: "FAILED" });
          return;
        }
      }

      const orderCtx = await loadOrderContext(supabase, tenant_id, order_id, cart_id, { product_name, product_code, quantity, unit_price });

      let message: string;
      let templateType: "A" | "B" = "A";
      let consentDecisionAfterSend: "request_sent" | "active_sent" | null = null;
      let activeStateId: string | null = null;
      let useButton = false;
      let resolvedButtonUrl: string | null = null;

      const { data: consentCfg } = await supabase.from("integration_whatsapp").select("consent_protection_enabled").eq("tenant_id", tenant_id).maybeSingle();
      const consentEnabled = consentCfg?.consent_protection_enabled === true;

      // Template único: sempre usa o template salvo em "Item Adicionado"
      // (mesma mensagem, mesmo link/botão de pagamento) — tanto no modo padrão
      // quanto no Modo de Proteção por Consentimento (solicitação ou ativo).
      const checkoutUrl = await getCheckoutUrl(supabase, tenant_id, formattedPhone);
      const templateFromTable = await getTemplate(supabase, tenant_id);
      const template = templateFromTable
        || (credentials as any).templateItemAdded
        || (credentials as any).templateComLink
        || getDefaultTemplateComLink();
      const baseMessage = formatMessage(template, body, orderCtx)
        .replace(/\{\{\s*link_checkout\s*\}\}|\{\s*link_checkout\s*\}/g, checkoutUrl)
        .replace(/\{\{\s*checkout_url\s*\}\}|\{\s*checkout_url\s*\}/g, checkoutUrl);
      message = prependGreeting(addMessageVariation(baseMessage, false));
      if ((credentials as any).buttonEnabled) {
        useButton = true;
        resolvedButtonUrl = ((credentials as any).buttonUrl && (credentials as any).buttonUrl.trim())
          ? (credentials as any).buttonUrl.trim()
          : checkoutUrl;
      }

      if (!consentEnabled) {
        templateType = "B";
      } else {
        const decision = await evaluateConsent(supabase, tenant_id, formattedPhone);

        if (decision.action === "silence") {
          await markSilenced(supabase, decision.stateId);
          await supabase.from("whatsapp_messages").insert({
            tenant_id,
            phone: formattedPhone,
            message: "[SILENCIADO - " + decision.reason + "] " + product_name + " (" + product_code + ")",
            type: "item_added",
            product_name: product_name.substring(0, 100),
            sent_at: new Date().toISOString(),
            order_id: order_id || null,
            delivery_status: "SKIPPED",
          });
          return;
        }

        if (decision.action === "send_request") {
          templateType = "A";
          consentDecisionAfterSend = "request_sent";
        } else {
          templateType = "B";
          activeStateId = decision.stateId;
          consentDecisionAfterSend = "active_sent";
        }
      }


      const throttleDelay = await getThrottleDelay(formattedPhone);
      if (throttleDelay > 0) console.log("[zapi-send-item-added] Throttle delay: " + (throttleDelay / 1000).toFixed(1) + "s");

      let sendOk = false;
      let zapiMessageId: string | null = null;

      if (provider === "uazapi") {
        const instanceName = (credentials as any).instanceName;
        await sendPresenceAvailable(instanceName, formattedPhone);
        await sendPresenceComposing(instanceName, formattedPhone, calcTypingDuration(message.length));

        const shouldUseButton = useButton && resolvedButtonUrl;
        let result = shouldUseButton
          ? await evoSendButton(instanceName, formattedPhone, message, (credentials as any).buttonLabel || "Pagar Agora", resolvedButtonUrl!)
          : await evoSendText(instanceName, formattedPhone, message);
        if (shouldUseButton && !result.success) {
          console.warn("[zapi-send-item-added] uazapi sendButton falhou; tentando fallback texto+link:", result.error);
          const fallbackMessage = message.includes(resolvedButtonUrl!) ? message : `${message}\n\n🔗 ${resolvedButtonUrl}`;
          result = await evoSendText(instanceName, formattedPhone, fallbackMessage);
        }
        sendOk = result.success;
        zapiMessageId = result.messageId || null;
        if (!sendOk) {
          console.error(`[zapi-send-item-added] uazapi ${shouldUseButton ? "sendButton" : "sendText"} falhou:`, result.error);
        } else {
          console.log(`[zapi-send-item-added] uazapi ${shouldUseButton ? "sendButton" : "sendText"} OK | phone:`, formattedPhone, "| msgId:", zapiMessageId);
        }
      } else {


        const { instanceId, token, clientToken } = credentials as any;
        const baseUrl = ZAPI_BASE_URL + "/instances/" + instanceId + "/token/" + token;

        await simulateTyping(instanceId, token, clientToken, formattedPhone);
        const delayMs = await antiBlockDelayLive();
        logAntiBlockDelay("zapi-send-item-added", delayMs);

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (clientToken) headers["Client-Token"] = clientToken;

        const shouldUseButton = useButton && resolvedButtonUrl;
        const targetUrl = shouldUseButton ? baseUrl + "/send-button-actions" : baseUrl + "/send-text";
        const requestBody: Record<string, unknown> = shouldUseButton
          ? { phone: formattedPhone, message, buttonActions: [{ id: "1", type: "URL", url: resolvedButtonUrl, label: (credentials as any).buttonLabel || "Pagar Agora" }] }
          : { phone: formattedPhone, message };

        const response = await fetch(targetUrl, { method: "POST", headers, body: JSON.stringify(requestBody) });
        const responseText = await response.text();
        sendOk = response.ok;
        try {
          const responseJson = JSON.parse(responseText);
          zapiMessageId = responseJson.messageId || responseJson.id || null;
        } catch (e) {}
      }

      if (sendOk && consentDecisionAfterSend === "request_sent") {
        await markRequestSent(supabase, tenant_id, formattedPhone);
      } else if (sendOk && consentDecisionAfterSend === "active_sent" && activeStateId) {
        await markActiveMessageSent(supabase, tenant_id, activeStateId);
      }

      await supabase.from("whatsapp_messages").insert({ tenant_id, phone: formattedPhone, message: message.substring(0, 500), type: "item_added", product_name: product_name.substring(0, 100), sent_at: new Date().toISOString(), order_id: order_id || null, zapi_message_id: zapiMessageId, delivery_status: sendOk ? "SENT" : "FAILED" });

      if (order_id && sendOk) {
        await supabase.from("orders").update({ item_added_message_sent: true }).eq("id", order_id);
      }
    };

    const edgeRuntime = (globalThis as any).EdgeRuntime;
    const bgTask = processInBackground().catch((err: any) => {
      console.error("[zapi-send-item-added] Background task error:", err?.message || err);
    });
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(bgTask);

    return new Response(JSON.stringify({ accepted: true, background: true }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[zapi-send-item-added] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message, sent: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
