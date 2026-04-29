import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  antiBlockDelayLive, 
  logAntiBlockDelay, 
  addMessageVariation,
  getThrottleDelay,
  checkTenantRateLimit,
  simulateTyping
} from "../_shared/anti-block-delay.ts";

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
  source_instance_id?: string;
  source_connected_phone?: string;
}

// Validate that request comes from internal source (database trigger)
function validateInternalRequest(req: Request): boolean {
  // Check for service role key in authorization header (used by http_post from triggers)
  const authHeader = req.headers.get("authorization");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  // If called with service role key, it's from a database trigger
  if (authHeader && supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50))) {
    return true;
  }
  
  // Also accept calls from the same Supabase project (internal calls)
  const origin = req.headers.get("origin") || req.headers.get("referer") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  if (supabaseUrl && origin.includes(new URL(supabaseUrl).hostname)) {
    return true;
  }
  
  // For now, allow all calls but log a warning - this function is called by database triggers
  // which use http_post and don't have a way to add custom auth headers
  console.log("[zapi-send-item-added] Warning: Request without internal validation markers");
  return true;
}

function hasServiceRoleAuthorization(req: Request): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return Boolean(supabaseServiceKey && authHeader.includes(supabaseServiceKey.substring(0, 50)));
}

function normalizeDigits(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

function phoneMatches(a?: string | null, b?: string | null): boolean {
  const buildVariants = (value?: string | null) => {
    const digits = normalizeDigits(value);
    const variants = new Set<string>();
    if (!digits) return variants;
    variants.add(digits);
    if (digits.startsWith('55') && digits.length > 11) {
      variants.add(digits.slice(2));
    } else if (digits.length <= 11) {
      variants.add(`55${digits}`);
    }
    return variants;
  };

  const aVariants = buildVariants(a);
  const bVariants = buildVariants(b);
  return [...aVariants].some((variant) => bVariants.has(variant));
}

async function getZAPICredentials(supabase: any, tenantId: string, sourceInstanceId?: string, sourceConnectedPhone?: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
     .select("zapi_instance_id, zapi_token, zapi_client_token, connected_phone, is_active, provider, send_item_added_msg, confirmation_timeout_minutes, template_solicitacao, template_com_link")
    .eq("tenant_id", tenantId)
    .eq("provider", "zapi")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !integration || !integration.zapi_instance_id || !integration.zapi_token) {
    return null;
  }

  // Check if this message type is enabled
  if (integration.send_item_added_msg === false) {
    return { disabled: true };
  }

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
      console.warn(`[zapi-send-item-added] ⚠️ Using webhook source instance ${sourceInstanceId} because connectedPhone matches tenant ${tenantId}; tenant configured instance is ${integration.zapi_instance_id}`);
      selectedIntegration = {
        ...integration,
        zapi_instance_id: sourceIntegration.zapi_instance_id,
        zapi_token: sourceIntegration.zapi_token,
        zapi_client_token: sourceIntegration.zapi_client_token,
      };
    } else {
      console.warn(`[zapi-send-item-added] Ignoring source instance override for tenant ${tenantId}; phone match=${sourcePhoneMatchesTenant}, source found=${!!sourceIntegration}`);
    }
  }

  return {
    instanceId: selectedIntegration.zapi_instance_id,
    token: selectedIntegration.zapi_token,
    clientToken: selectedIntegration.zapi_client_token || '',
     disabled: false,
     confirmationTimeoutMinutes: integration.confirmation_timeout_minutes || 30,
     // Templates da própria tenant (mantemos o que ela já configurou)
     templateSolicitacao: integration.template_solicitacao || null,
     templateComLink: integration.template_com_link || null,
  };
}

// Template padrão A - Solicitação (sem link)
function getDefaultTemplateSolicitacao(): string {
  return `🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

Posso te enviar o link para finalizar o pedido por aqui?

Responda *SIM* para receber o link. ✨`;
}

// Template padrão B - Com link (para quem já tem consentimento)
function getDefaultTemplateComLink(): string {
  return `🛒 *Item adicionado ao pedido*

✅ {{produto}}
Qtd: *{{quantidade}}*
Valor: *R$ {{valor}}*

👉 Finalize seu pedido: {{link_checkout}}

Qualquer dúvida, estou à disposição! ✨`;
}

async function getTemplate(supabase: any, tenantId: string) {
  const { data: template } = await supabase
    .from("whatsapp_templates")
    .select("content")
    .eq("tenant_id", tenantId)
    .eq("type", "ITEM_ADDED")
    .maybeSingle();

  if (template?.content) {
    return template.content;
  }

  // Template padrão SEM link de checkout - pede confirmação
  return getDefaultTemplateSolicitacao();
}

type ConsentDecision =
  | { action: 'send_request'; reason: string; previousId?: string }
  | { action: 'send_with_link'; stateId: string }
  | { action: 'silence'; reason: string; stateId: string };

// Constrói lista de telefones equivalentes (com/sem 55, com/sem 9) para
// procurar/persistir o estado de consentimento de forma resiliente.
function buildConsentPhoneVariants(phone: string): string[] {
  const variants = new Set<string>();
  let p = (phone || '').replace(/\D/g, '');
  if (!p) return [];

  let baseWithoutCountry = p;
  if (p.startsWith('55') && p.length >= 12) {
    baseWithoutCountry = p.slice(2);
  }
  const baseWithCountry = baseWithoutCountry.startsWith('55') ? baseWithoutCountry : '55' + baseWithoutCountry;

  variants.add(baseWithoutCountry);
  variants.add(baseWithCountry);

  if (baseWithoutCountry.length === 11 && baseWithoutCountry[2] === '9') {
    const without9 = baseWithoutCountry.slice(0, 2) + baseWithoutCountry.slice(3);
    variants.add(without9);
    variants.add('55' + without9);
  } else if (baseWithoutCountry.length === 10) {
    const with9 = baseWithoutCountry.slice(0, 2) + '9' + baseWithoutCountry.slice(2);
    variants.add(with9);
    variants.add('55' + with9);
  }

  return Array.from(variants);
}

// Forma canônica para gravação: 55 + DDD + número (com 9 quando móvel)
function canonicalConsentPhone(phone: string): string {
  const variants = buildConsentPhoneVariants(phone);
  // Prioriza variante "55 + 11 dígitos" (com 9), depois "55 + 10", depois qualquer com 55
  const with55_11 = variants.find(v => v.startsWith('55') && v.length === 13);
  if (with55_11) return with55_11;
  const with55_10 = variants.find(v => v.startsWith('55') && v.length === 12);
  if (with55_10) return with55_10;
  return variants.find(v => v.startsWith('55')) || variants[0];
}

// Avalia o estado da máquina de consentimento para decidir o que fazer
// com a próxima notificação de "item adicionado".
async function evaluateConsent(
  supabase: any,
  tenantId: string,
  phone: string
): Promise<ConsentDecision> {
  const variants = buildConsentPhoneVariants(phone);
  const { data: rows } = await supabase
    .from('whatsapp_consent_state')
    .select('id, status, request_expires_at, consent_expires_at, consent_granted_at')
    .eq('tenant_id', tenantId)
    .in('customer_phone', variants)
    .order('updated_at', { ascending: false })
    .limit(1);

  const state = rows && rows[0];
  const now = new Date();

  if (!state) {
    return { action: 'send_request', reason: 'no_state' };
  }

  const reqExp = state.request_expires_at ? new Date(state.request_expires_at) : null;
  const consExp = state.consent_expires_at ? new Date(state.consent_expires_at) : null;

  if (state.status === 'active') {
    if (consExp && consExp > now) {
      return { action: 'send_with_link', stateId: state.id };
    }
    return { action: 'send_request', reason: 'consent_expired', previousId: state.id };
  }

  if (state.status === 'awaiting') {
    if (reqExp && reqExp > now) {
      return { action: 'silence', reason: 'awaiting_response', stateId: state.id };
    }
    return { action: 'send_request', reason: 'awaiting_window_passed', previousId: state.id };
  }

  if (state.status === 'silenced') {
    if (reqExp && reqExp > now) {
      return { action: 'silence', reason: 'silenced_window', stateId: state.id };
    }
    return { action: 'send_request', reason: 'silenced_window_passed', previousId: state.id };
  }

  if (state.status === 'declined') {
    if (reqExp && reqExp > now) {
      return { action: 'silence', reason: 'declined_window', stateId: state.id };
    }
    return { action: 'send_request', reason: 'declined_window_passed', previousId: state.id };
  }

  return { action: 'send_request', reason: 'unknown_status', previousId: state.id };
}

// Persiste o estado após enviar uma SOLICITAÇÃO (status='awaiting', expira em 1h).
async function markRequestSent(supabase: any, tenantId: string, phone: string) {
  const canonical = canonicalConsentPhone(phone);
  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000); // +1h

  const { error } = await supabase
    .from('whatsapp_consent_state')
    .upsert(
      {
        tenant_id: tenantId,
        customer_phone: canonical,
        status: 'awaiting',
        request_sent_at: now.toISOString(),
        request_expires_at: expires.toISOString(),
        last_message_at: now.toISOString(),
      },
      { onConflict: 'tenant_id,customer_phone' }
    );
  if (error) {
    console.error('[zapi-send-item-added] markRequestSent error:', error);
  }
}

// Persiste o estado após enviar uma mensagem COM LINK (mantém active).
async function markActiveMessageSent(supabase: any, tenantId: string, stateId: string) {
  const now = new Date();
  await supabase
    .from('whatsapp_consent_state')
    .update({ last_message_at: now.toISOString() })
    .eq('id', stateId);
}

// Atualiza estado para "silenced" quando o cliente está em janela de espera
// e adicionou outro item (mensagem não foi enviada).
async function markSilenced(supabase: any, stateId: string) {
  await supabase
    .from('whatsapp_consent_state')
    .update({
      status: 'silenced',
      last_message_at: new Date().toISOString(),
    })
    .eq('id', stateId);
}

function buildPhoneCandidates(phone: string): string[] {
  let cleaned = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (cleaned.startsWith('55') && cleaned.length > 11) {
    cleaned = cleaned.slice(2);
  }

  const candidates = new Set<string>();

  if (cleaned.length === 10) {
    const withNinthDigit = `${cleaned.slice(0, 2)}9${cleaned.slice(2)}`;
    candidates.add(`55${withNinthDigit}`);
    candidates.add(`55${cleaned}`);
  } else if (cleaned.length === 11 && cleaned[2] === '9') {
    candidates.add(`55${cleaned}`);
    candidates.add(`55${cleaned.slice(0, 2)}${cleaned.slice(3)}`);
  } else {
    candidates.add(cleaned.startsWith('55') ? cleaned : `55${cleaned}`);
  }

  return Array.from(candidates);
}

async function resolveWhatsAppPhone(baseUrl: string, clientToken: string, phone: string): Promise<string> {
  const candidates = buildPhoneCandidates(phone);
  const headers: Record<string, string> = {};
  if (clientToken) headers['Client-Token'] = clientToken;

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${baseUrl}/phone-exists/${candidate}`, { headers });
      const text = await response.text();
      if (!response.ok) {
        console.warn(`[zapi-send-item-added] phone-exists failed for ${candidate}: ${response.status} ${text.substring(0, 120)}`);
        continue;
      }

      const data = JSON.parse(text);
      const canonicalPhone = (data?.phone || '').replace(/\D/g, '');
      console.log(`[zapi-send-item-added] phone-exists ${candidate}: exists=${data?.exists} canonical=${canonicalPhone || 'n/a'}`);

      if (data?.exists === true) {
        return canonicalPhone || candidate;
      }
    } catch (error: any) {
      console.warn(`[zapi-send-item-added] phone-exists error for ${candidate}: ${error?.message || error}`);
    }
  }

  return candidates[0];
}

function formatMessage(template: string, data: ItemAddedRequest): string {
  const unitPrice = data.unit_price.toFixed(2);
  const total = (data.quantity * data.unit_price).toFixed(2);
  const originalPrice = data.original_price ? data.original_price.toFixed(2) : '';
  const promoPrice = (data.original_price && data.original_price > data.unit_price) ? data.unit_price.toFixed(2) : '';
  
  // Gera quantidade aleatória entre 2 e 4 para variação anti-bloqueio
  const randomQty = Math.floor(Math.random() * 3) + 2; // 2, 3 ou 4
  
  let result = template
    .replace(/\{\{produto\}\}/g, `${data.product_name} (${data.product_code})`)
    .replace(/\{\{quantidade\}\}/g, String(data.quantity))
    .replace(/\{\{qtd_aleatoria\}\}/g, String(randomQty))
    .replace(/\{\{valor\}\}/g, unitPrice)
    .replace(/\{\{preco\}\}/g, unitPrice)
    .replace(/\{\{total\}\}/g, total)
    .replace(/\{\{subtotal\}\}/g, total)
    .replace(/\{\{codigo\}\}/g, data.product_code)
    .replace(/\{\{valor_original\}\}/g, originalPrice)
    .replace(/\{\{valor_promo\}\}/g, promoPrice);

  // Remove linhas que contenham variáveis vazias (sem valor promocional)
  if (!originalPrice || !promoPrice) {
    result = result
      .split('\n')
      .filter(line => {
        if (!originalPrice && line.includes('{{valor_original}}')) return false;
        if (!promoPrice && line.includes('{{valor_promo}}')) return false;
        return true;
      })
      .join('\n');
  }

  return result;
}

// Build checkout URL for tenant
 async function getCheckoutUrl(supabase: any, tenantId: string, phone: string): Promise<string> {
   // Get tenant slug
   const { data: tenant } = await supabase
     .from("tenants")
     .select("slug")
     .eq("id", tenantId)
     .maybeSingle();
   
   // Get public base URL
   const { data: settings } = await supabase
     .from("app_settings")
     .select("public_base_url")
     .limit(1)
     .maybeSingle();
   
   const baseUrl = settings?.public_base_url || "https://live-launchpad-79.lovable.app";
   const slug = tenant?.slug || tenantId;
   
   return `${baseUrl}/t/${slug}/checkout`;
 }
 
// Input validation
function validateRequest(body: any): body is ItemAddedRequest {
  if (!body || typeof body !== 'object') return false;
  if (!body.tenant_id || typeof body.tenant_id !== 'string') return false;
  if (!body.customer_phone || typeof body.customer_phone !== 'string') return false;
  if (!body.product_name || typeof body.product_name !== 'string') return false;
  if (body.product_name.length > 200) return false;
  if (body.customer_phone.replace(/\D/g, '').length < 10) return false;
  if (body.customer_phone.replace(/\D/g, '').length > 15) return false;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const timestamp = new Date().toISOString();

  try {
    // Validate internal request
    if (!validateInternalRequest(req)) {
      console.log(`[${timestamp}] [zapi-send-item-added] Unauthorized external request`);
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    
    // Validate input
    if (!validateRequest(body)) {
      return new Response(
        JSON.stringify({ error: "Dados inválidos ou incompletos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price, original_price, order_id } = body;
    const source_instance_id = hasServiceRoleAuthorization(req) ? body.source_instance_id : undefined;
    const source_connected_phone = hasServiceRoleAuthorization(req) ? body.source_connected_phone : undefined;

    console.log(`[${timestamp}] [zapi-send-item-added] Processing for tenant ${tenant_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify tenant exists
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {
      console.log(`[${timestamp}] [zapi-send-item-added] Tenant not found: ${tenant_id}`);
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado", sent: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await getZAPICredentials(supabase, tenant_id, source_instance_id, source_connected_phone);
    if (!credentials) {
      console.log("[zapi-send-item-added] Z-API not configured for this tenant");
      return new Response(
        JSON.stringify({ error: "Z-API não configurado", sent: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if message type is disabled
    if (credentials.disabled) {
      console.log("[zapi-send-item-added] Message type disabled for this tenant");
      return new Response(
        JSON.stringify({ sent: false, disabled: true, message: "Envio de mensagem 'Item Adicionado' desativado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limit before processing
    if (!checkTenantRateLimit(tenant_id)) {
      console.log("[zapi-send-item-added] Rate limited - too many messages");
      return new Response(
        JSON.stringify({ sent: false, rateLimited: true, message: "Limite de mensagens por minuto excedido" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instanceId, token, clientToken, templateSolicitacao, templateComLink } = credentials;
    const baseUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}`;
    const formattedPhone = await resolveWhatsAppPhone(baseUrl, clientToken, customer_phone);
    const sendUrl = `${baseUrl}/send-text`;

    let message: string;
    let templateType: 'A' | 'B' = 'A';
    let skipPendingConfirmation = false;
    let consentDecisionAfterSend: 'request_sent' | 'active_sent' | null = null;
    let activeStateId: string | null = null;

    // ============================================================
    // MÁQUINA DE ESTADOS GLOBAL DE CONSENTIMENTO (todos os tenants)
    // ============================================================
    const decision = await evaluateConsent(supabase, tenant_id, formattedPhone);
    console.log(`[zapi-send-item-added] 🧭 Consent decision for ${formattedPhone}: ${decision.action} (${('reason' in decision) ? decision.reason : ''})`);

    if (decision.action === 'silence') {
      // Cliente está dentro da janela de espera (1h). Pedido foi criado normalmente
      // pelo trigger; aqui apenas silenciamos a mensagem.
      await markSilenced(supabase, decision.stateId);

      await supabase.from('whatsapp_messages').insert({
        tenant_id,
        phone: formattedPhone,
        message: `[SILENCIADO - ${decision.reason}] ${product_name} (${product_code})`,
        type: 'item_added',
        product_name: product_name.substring(0, 100),
        sent_at: new Date().toISOString(),
        order_id: order_id || null,
        delivery_status: 'SKIPPED',
      });

      return new Response(
        JSON.stringify({
          sent: false,
          skipped: true,
          order_created: true,
          reason: `Mensagem silenciada (${decision.reason}). Pedido foi registrado normalmente.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (decision.action === 'send_request') {
      // 1ª mensagem (ou janela passou): envia SOLICITAÇÃO única
      templateType = 'A';
      const template = templateSolicitacao || getDefaultTemplateSolicitacao();
      const baseMessage = formatMessage(template, body);
      message = addMessageVariation(baseMessage);
      consentDecisionAfterSend = 'request_sent';
      // Com solicitação, NÃO criamos pending_message_confirmations:
      // a fonte de verdade do estado é whatsapp_consent_state.
      skipPendingConfirmation = true;
    } else {
      // send_with_link: cliente com consentimento ativo (< 3 dias) — envia COM LINK
      templateType = 'B';
      activeStateId = decision.stateId;
      const checkoutUrl = await getCheckoutUrl(supabase, tenant_id, formattedPhone);
      const template = templateComLink || getDefaultTemplateComLink();
      const baseMessage = formatMessage(template, body)
        .replace(/\{\{link_checkout\}\}/g, checkoutUrl)
        .replace(/\{\{checkout_url\}\}/g, checkoutUrl);
      message = addMessageVariation(baseMessage);
      consentDecisionAfterSend = 'active_sent';
      skipPendingConfirmation = true;
    }

    // Check for throttling (multiple messages to same phone)
    const throttleDelay = await getThrottleDelay(formattedPhone);
    if (throttleDelay > 0) {
      console.log(`[zapi-send-item-added] 🛡️ Throttle delay for ${formattedPhone}: ${(throttleDelay / 1000).toFixed(1)}s`);
    }

    // Simulate typing before sending (3-5 seconds)
    console.log(`[zapi-send-item-added] ⌨️ Starting typing simulation for ${formattedPhone}...`);
    await simulateTyping(instanceId, token, clientToken, formattedPhone);

    // Apply extended anti-block delay (8-20 seconds for automatic messages)
    const delayMs = await antiBlockDelayLive();
    logAntiBlockDelay('zapi-send-item-added', delayMs);

    console.log(`[zapi-send-item-added] Sending to ${formattedPhone} (template: ${templateType})`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (clientToken) {
      headers['Client-Token'] = clientToken;
    }

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone: formattedPhone, message })
    });

    const responseText = await response.text();
    console.log(`[zapi-send-item-added] Response: ${response.status} - ${responseText.substring(0, 200)}`);

    // Parse response to get message ID
    let zapiMessageId = null;
    try {
      const responseJson = JSON.parse(responseText);
      zapiMessageId = responseJson.messageId || responseJson.id || null;
      console.log(`[zapi-send-item-added] Z-API Message ID: ${zapiMessageId}`);
    } catch (e) {
      console.log(`[zapi-send-item-added] Could not parse Z-API response for message ID`);
    }

     // Create pending confirmation record (apenas se não for Template B ou se for modo legado)
     if (response.ok && !skipPendingConfirmation) {
       const checkoutUrl = await getCheckoutUrl(supabase, tenant_id, formattedPhone);
       const timeoutMinutes = credentials.confirmationTimeoutMinutes || 30;
       const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
       
       console.log(`[zapi-send-item-added] Creating pending confirmation for ${formattedPhone}, expires in ${timeoutMinutes} min`);
       
       // Check if there's already a pending confirmation for this phone
       const { data: existingConfirmation } = await supabase
         .from("pending_message_confirmations")
         .select("id")
         .eq("tenant_id", tenant_id)
         .eq("customer_phone", formattedPhone)
         .eq("status", "pending")
         .maybeSingle();
       
       if (existingConfirmation) {
         // Update existing confirmation with new expiry
         await supabase
           .from("pending_message_confirmations")
           .update({
             expires_at: expiresAt.toISOString(),
             checkout_url: checkoutUrl,
             order_id: order_id || null,
             metadata: { 
               product_name, 
               product_code, 
               unit_price, 
               quantity,
               consent_protection_enabled: consentProtectionEnabled // Flag para webhook saber como tratar
             }
           })
           .eq("id", existingConfirmation.id);
         console.log(`[zapi-send-item-added] Updated existing pending confirmation ${existingConfirmation.id}`);
       } else {
         // Create new pending confirmation
         const { data: newConfirmation, error: confError } = await supabase
           .from("pending_message_confirmations")
           .insert({
             tenant_id,
             customer_phone: formattedPhone,
             order_id: order_id || null,
             confirmation_type: 'item_added',
             status: 'pending',
             expires_at: expiresAt.toISOString(),
             checkout_url: checkoutUrl,
             metadata: { 
               product_name, 
               product_code, 
               unit_price, 
               quantity,
               consent_protection_enabled: consentProtectionEnabled // Flag para webhook saber como tratar
             }
           })
           .select()
           .single();
         
         if (confError) {
           console.error(`[zapi-send-item-added] Error creating pending confirmation:`, confError);
         } else {
           console.log(`[zapi-send-item-added] Created pending confirmation ${newConfirmation.id}`);
         }
       }
     }
 
    // Insert message record with Z-API message ID for tracking
    await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: formattedPhone,
      message: message.substring(0, 500),
      type: 'item_added',
      product_name: product_name.substring(0, 100),
      sent_at: new Date().toISOString(),
      order_id: order_id || null,
      zapi_message_id: zapiMessageId,
      delivery_status: response.ok ? 'SENT' : 'FAILED'
    });

    // Update order item_added_message_sent flag
    if (order_id && response.ok) {
      await supabase
        .from('orders')
        .update({ item_added_message_sent: true })
        .eq('id', order_id);
    }

    return new Response(
       JSON.stringify({ 
         sent: response.ok, 
         status: response.status, 
         messageId: zapiMessageId,
         templateType,
         waitingConfirmation: !skipPendingConfirmation && response.ok
       }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[zapi-send-item-added] Error:`, error.message);
    return new Response(
      JSON.stringify({ error: error.message, sent: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
