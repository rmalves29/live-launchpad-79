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
  order_id?: number;
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

async function getZAPICredentials(supabase: any, tenantId: string) {
  const { data: integration, error } = await supabase
    .from("integration_whatsapp")
     .select("zapi_instance_id, zapi_token, zapi_client_token, is_active, provider, send_item_added_msg, confirmation_timeout_minutes, consent_protection_enabled, template_solicitacao, template_com_link")
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

  return {
    instanceId: integration.zapi_instance_id,
    token: integration.zapi_token,
    clientToken: integration.zapi_client_token || '',
     disabled: false,
     confirmationTimeoutMinutes: integration.confirmation_timeout_minutes || 30,
     // Campos de proteção por consentimento
     consentProtectionEnabled: integration.consent_protection_enabled || false,
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

// Verifica se o cliente tem consentimento ativo (< 3 dias)
async function checkCustomerConsent(supabase: any, tenantId: string, phone: string): Promise<{ hasConsent: boolean; customerId?: number }> {
  // Normaliza telefone para busca
  let normalizedPhone = phone.replace(/\D/g, '');
  if (normalizedPhone.startsWith('55') && normalizedPhone.length > 11) {
    normalizedPhone = normalizedPhone.substring(2);
  }

  // Busca cliente
  const { data: customer } = await supabase
    .from("customers")
    .select("id, consentimento_ativo, data_permissao")
    .eq("tenant_id", tenantId)
    .eq("phone", normalizedPhone)
    .maybeSingle();

  if (!customer) {
    console.log(`[zapi-send-item-added] Cliente não encontrado para ${normalizedPhone}`);
    return { hasConsent: false };
  }

  // Verifica se tem consentimento ativo e se está dentro de 3 dias
  if (!customer.consentimento_ativo || !customer.data_permissao) {
    console.log(`[zapi-send-item-added] Cliente ${customer.id} sem consentimento ativo`);
    return { hasConsent: false, customerId: customer.id };
  }

  const dataPermissao = new Date(customer.data_permissao);
  const agora = new Date();
  const diffMs = agora.getTime() - dataPermissao.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > 3) {
    console.log(`[zapi-send-item-added] Consentimento expirado para cliente ${customer.id} (${diffDays.toFixed(1)} dias)`);
    return { hasConsent: false, customerId: customer.id };
  }

  console.log(`[zapi-send-item-added] ✅ Consentimento válido para cliente ${customer.id} (${diffDays.toFixed(1)} dias atrás)`);
  return { hasConsent: true, customerId: customer.id };
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

function formatMessage(template: string, data: ItemAddedRequest): string {
  const unitPrice = data.unit_price.toFixed(2);
  const total = (data.quantity * data.unit_price).toFixed(2);
  
  // Gera quantidade aleatória entre 2 e 4 para variação anti-bloqueio
  const randomQty = Math.floor(Math.random() * 3) + 2; // 2, 3 ou 4
  
  return template
    .replace(/\{\{produto\}\}/g, `${data.product_name} (${data.product_code})`)
    .replace(/\{\{quantidade\}\}/g, String(data.quantity))
    .replace(/\{\{qtd_aleatoria\}\}/g, String(randomQty))
    .replace(/\{\{valor\}\}/g, unitPrice)
    .replace(/\{\{preco\}\}/g, unitPrice)
    .replace(/\{\{total\}\}/g, total)
    .replace(/\{\{subtotal\}\}/g, total)
    .replace(/\{\{codigo\}\}/g, data.product_code);
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
   
   // Format phone for URL (remove country code for cleaner URL)
   const phoneForUrl = phone.replace(/^55/, '');
   
   return `${baseUrl}/t/${slug}/checkout?phone=${phoneForUrl}`;
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

    const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price, order_id } = body;

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

    const credentials = await getZAPICredentials(supabase, tenant_id);
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

    const formattedPhone = formatPhoneNumber(customer_phone);
    const { instanceId, token, clientToken, consentProtectionEnabled, templateSolicitacao, templateComLink } = credentials;
    const sendUrl = `${ZAPI_BASE_URL}/instances/${instanceId}/token/${token}/send-text`;
    
    let message: string;
    let templateType: 'A' | 'B' | 'legacy' = 'legacy';
    let skipPendingConfirmation = false;

    // ============================================================
    // LÓGICA DE PROTEÇÃO POR CONSENTIMENTO
    // ============================================================
    if (consentProtectionEnabled) {
      console.log(`[zapi-send-item-added] 🛡️ Modo de Proteção por Consentimento ATIVADO`);
      
      // Verificar consentimento do cliente
      const { hasConsent, customerId } = await checkCustomerConsent(supabase, tenant_id, formattedPhone);
      
      if (hasConsent) {
        // Template B - Com link (cliente tem consentimento válido < 3 dias)
        console.log(`[zapi-send-item-added] ✅ Usando Template B (com link) para cliente ${customerId}`);
        templateType = 'B';
        
        const checkoutUrl = await getCheckoutUrl(supabase, tenant_id, formattedPhone);
        const template = templateComLink || getDefaultTemplateComLink();
        const baseMessage = formatMessage(template, body)
          .replace(/\{\{link_checkout\}\}/g, checkoutUrl)
          .replace(/\{\{checkout_url\}\}/g, checkoutUrl);
        message = addMessageVariation(baseMessage);
        
        // Com Template B, não precisamos criar pending_message_confirmations
        skipPendingConfirmation = true;
        
      } else {
        // Template A - Solicitar permissão (cliente novo ou expirado)
        // IMPORTANTE: Se já existe uma solicitação pendente para este telefone,
        // NÃO enviar nova mensagem (evita spam quando cliente não respondeu SIM)
        const now = new Date().toISOString();
        const { data: existingPending } = await supabase
          .from("pending_message_confirmations")
          .select("id, created_at, expires_at")
          .eq("tenant_id", tenant_id)
          .eq("customer_phone", formattedPhone)
          .eq("status", "pending")
          .eq("confirmation_type", "item_added")
          .maybeSingle();

        if (existingPending) {
          const isExpired = existingPending.expires_at && existingPending.expires_at < now;
          
          if (isExpired) {
            // Confirmação expirada: limpar e enviar nova solicitação
            console.log(`[zapi-send-item-added] ⏰ Confirmação expirada (${existingPending.id}) para ${formattedPhone}. Limpando e reenviando.`);
            await supabase
              .from("pending_message_confirmations")
              .update({ status: "expired" })
              .eq("id", existingPending.id);
            // Continua o fluxo para enviar nova mensagem (não retorna aqui)
          } else {
            // Cliente ainda não respondeu SIM mas prazo não expirou:
            // Pedido já foi criado normalmente pelo sistema. Apenas NÃO enviamos mensagem.
            // NÃO bloqueamos o pedido - apenas silenciamos o WhatsApp.
            console.log(`[zapi-send-item-added] 🔇 Consentimento pendente para ${formattedPhone}. Pedido criado, mensagem silenciada (cliente ainda não respondeu SIM).`);

            // Atualiza metadados com o produto mais recente
            await supabase
              .from("pending_message_confirmations")
              .update({
                metadata: { 
                  product_name, 
                  product_code, 
                  unit_price, 
                  quantity,
                  consent_protection_enabled: true
                }
              })
              .eq("id", existingPending.id);

            // Registra no log de mensagens como silenciado (para rastreabilidade)
            await supabase.from('whatsapp_messages').insert({
              tenant_id,
              phone: formattedPhone,
              message: `[SILENCIADO - aguardando consentimento] ${product_name} (${product_code})`,
              type: 'item_added',
              product_name: product_name.substring(0, 100),
              sent_at: new Date().toISOString(),
              order_id: order_id || null,
              delivery_status: 'SKIPPED'
            });

            return new Response(
              JSON.stringify({ 
                sent: false, 
                skipped: true, 
                order_created: true,
                reason: "Mensagem silenciada - cliente ainda não respondeu SIM ao consentimento. Pedido foi registrado normalmente.",
                existing_confirmation_id: existingPending.id
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        console.log(`[zapi-send-item-added] 📝 Usando Template A (solicitação) para cliente ${customerId || 'novo'}`);
        templateType = 'A';
        
        const template = templateSolicitacao || getDefaultTemplateSolicitacao();
        const baseMessage = formatMessage(template, body);
        message = addMessageVariation(baseMessage);
        
        // Com proteção ativada, ao receber "SIM" apenas atualiza DB (não envia link)
        // Por isso ainda criamos pending confirmation, mas com flag especial
      }
    } else {
      // ============================================================
      // MODO LEGADO (sem proteção por consentimento)
      // ============================================================
      console.log(`[zapi-send-item-added] 📨 Modo legado (proteção desativada)`);
      const template = await getTemplate(supabase, tenant_id);
      const baseMessage = formatMessage(template, body);
      message = addMessageVariation(baseMessage);
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
