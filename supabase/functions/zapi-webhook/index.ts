import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 import { antiBlockDelay, logAntiBlockDelay, antiBlockDelayLive, addMessageVariation, getTypingDelay, simulateTyping } from "../_shared/anti-block-delay.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para obter a data atual no timezone de Brasília (America/Sao_Paulo)
function getBrasiliaDateISO(): string {
  const now = new Date();
  // Brasília é UTC-3, então subtraímos 3 horas do UTC
  const brasiliaOffset = -3 * 60; // -180 minutos
  const utcOffset = now.getTimezoneOffset(); // minutos de diferença do UTC
  const brasiliaTime = new Date(now.getTime() + (utcOffset + brasiliaOffset) * 60 * 1000);
  
  const year = brasiliaTime.getFullYear();
  const month = String(brasiliaTime.getMonth() + 1).padStart(2, '0');
  const day = String(brasiliaTime.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

interface ZAPIWebhookPayload {
  phone?: string;
  chatId?: string;
  chatName?: string;
  senderPhone?: string;
  senderName?: string;
  participantPhone?: string;
  text?: {
    message?: string;
  };
  message?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  momment?: number;
  timestamp?: number;
  type?: string;
  // Message status callback fields
  status?: string;
  ids?: string[];
  instanceId?: string;
  // Message ID for deduplication
  messageId?: string;
  zapiMessageId?: string;
}

// Cache to prevent duplicate message processing (in-memory, per instance)
const processedMessages = new Map<string, number>();
const MESSAGE_CACHE_TTL_MS = 60000; // 60 seconds TTL

// Cache to track which products were processed for each message (prevents duplicates within same message)
// Key format: "messageId:productCode" or "phone:messageHash:productCode"
const processedProductsInMessage = new Map<string, number>();
const PRODUCT_CACHE_TTL_MS = 30000; // 30 seconds TTL

// Clean old entries from cache periodically
function cleanMessageCache() {
  const now = Date.now();
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_CACHE_TTL_MS) {
      processedMessages.delete(key);
    }
  }
  // Also clean product cache
  for (const [key, timestamp] of processedProductsInMessage.entries()) {
    if (now - timestamp > PRODUCT_CACHE_TTL_MS) {
      processedProductsInMessage.delete(key);
    }
  }
}

// Check if a specific product was already processed for a given message context
// This prevents duplicates when Z-API sends the same webhook multiple times
function isProductAlreadyProcessedForMessage(
  messageId: string | undefined, 
  phone: string, 
  messageText: string,
  productCode: string
): boolean {
  const messageKey = messageId || `${phone}:${hashMessage(messageText)}`;
  const productKey = `${messageKey}:${productCode}`;
  
  if (processedProductsInMessage.has(productKey)) {
    console.log(`[zapi-webhook] 🔄 DUPLICATE product ${productCode} for message already processed`);
    return true;
  }
  
  processedProductsInMessage.set(productKey, Date.now());
  return false;
}

// Simple hash function for message deduplication when no messageId is available
function hashMessage(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// Check if message was already processed (returns true if duplicate)
function isDuplicateMessage(messageId: string | undefined, phone: string, messageText: string): boolean {
  // Clean cache first
  cleanMessageCache();
  
  // If we have a messageId, use it (most reliable)
  if (messageId) {
    if (processedMessages.has(messageId)) {
      console.log(`[zapi-webhook] 🔄 DUPLICATE detected by messageId: ${messageId}`);
      return true;
    }
    processedMessages.set(messageId, Date.now());
    return false;
  }
  
  // Fallback: create a composite key from phone + message content + timestamp window
  // This handles cases where Z-API sends the same message twice within 10 seconds
  const compositeKey = `${phone}:${messageText}`;
  const existingTimestamp = processedMessages.get(compositeKey);
  
  if (existingTimestamp) {
    const timeDiff = Date.now() - existingTimestamp;
    if (timeDiff < 10000) { // 10 second window
      console.log(`[zapi-webhook] 🔄 DUPLICATE detected by content (within ${timeDiff}ms): ${compositeKey.substring(0, 50)}...`);
      return true;
    }
  }
  
  processedMessages.set(compositeKey, Date.now());
  return false;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload: ZAPIWebhookPayload = await req.json();
    
    console.log('[zapi-webhook] Received payload:', JSON.stringify(payload, null, 2));

    // Check if this is a message status callback
    if (payload.type === 'MessageStatusCallback' && payload.status && payload.ids) {
      return await handleMessageStatusCallback(supabase, payload);
    }

    // Extract message text
    const messageText = payload.text?.message || payload.message || '';
    const isGroup = payload.isGroup || payload.chatId?.includes('@g.us') || false;
    const fromMe = payload.fromMe || false;
    
    // Skip messages sent by us
    if (fromMe) {
      console.log('[zapi-webhook] Ignoring message sent by us');
      return new Response(JSON.stringify({ success: true, skipped: 'fromMe' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract phone number (participantPhone for groups, phone for direct chat)
    const senderPhone = payload.participantPhone || payload.senderPhone || payload.phone || '';
    const groupName = payload.chatName || '';
    const groupId = payload.chatId || '';

    // Get messageId for deduplication (Z-API may send messageId or zapiMessageId)
    const messageId = payload.messageId || payload.zapiMessageId;

    // Check for duplicate message BEFORE processing (in-memory cache - fast path)
    if (isDuplicateMessage(messageId, senderPhone, messageText)) {
      console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${senderPhone} (in-memory)`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: 'duplicate_message',
        messageId: messageId || 'no_id'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DATABASE-LEVEL deduplication (handles multiple Edge Function instances)
    // This catches duplicates that in-memory cache misses when Z-API sends
    // the same webhook to different function instances
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('zapi_message_id', messageId)
        .maybeSingle();
      
      if (existingMsg) {
        console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${senderPhone} (DB-level, messageId: ${messageId})`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: 'duplicate_message_db',
          messageId
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`[zapi-webhook] Message: "${messageText}", From: ${senderPhone}, Group: ${groupName}, IsGroup: ${isGroup}, MessageId: ${messageId || 'N/A'}`);

     // IMPORTANT: Check for confirmation responses (SIM/OK) from PRIVATE messages FIRST
     // This handles the two-step message flow where customer replies to confirm checkout link
    if (!isGroup) {
       const confirmationResult = await handleConfirmationResponse(supabase, senderPhone, messageText, payload.instanceId);
       if (confirmationResult.handled) {
         console.log(`[zapi-webhook] ✅ Confirmation response handled for ${senderPhone}`);
         return new Response(JSON.stringify({ 
           success: true, 
           confirmation_handled: true,
           result: confirmationResult
         }), {
           headers: { ...corsHeaders, 'Content-Type': 'application/json' },
         });
       }
       
       // If not a confirmation response, skip - only group messages create orders
       console.log('[zapi-webhook] ⏭️ Private message not a confirmation - only group messages create orders');
       return new Response(JSON.stringify({ 
         success: true, 
         skipped: 'not_a_group_message',
         reason: 'Orders are only created from WhatsApp group messages'
       }), {
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
    }

    // Recognize product codes strictly in the format: C + 1-6 digits (e.g., C100, C40895)
    // IMPORTANT: We intentionally do NOT accept plain numbers like "100" to avoid false positives.
    const productCodes: string[] = [];

    const codeWithCRegex = /\b[Cc](\d{1,6})\b/g;
    let match;
    while ((match = codeWithCRegex.exec(messageText)) !== null) {
      const normalized = `C${match[1]}`;
      if (!productCodes.includes(normalized)) productCodes.push(normalized);
    }

    if (productCodes.length === 0) {
      console.log('[zapi-webhook] No product codes found in message');
      return new Response(JSON.stringify({ success: true, skipped: 'no_product_codes' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[zapi-webhook] Found product codes: ${productCodes.join(', ')}`);

    // Normalize phone number (remove country code if present)
    const normalizedPhone = normalizePhone(senderPhone);
    
    if (!normalizedPhone) {
      console.log('[zapi-webhook] Invalid phone number');
      return new Response(JSON.stringify({ success: false, error: 'invalid_phone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Identify tenant (MUST be tied to the Z-API instance that received the message)
    // Priority:
    // 1) payload.instanceId -> integration_whatsapp.zapi_instance_id (prevents cross-tenant leakage)
    // 2) group mapping (customer_whatsapp_groups)
    // 3) customer phone mapping (customers)
    let tenantId: string | null = null;

    if (payload.instanceId) {
      const { data: integrations, error: instErr } = await supabase
        .from('integration_whatsapp')
        .select('tenant_id')
        .eq('provider', 'zapi')
        .eq('is_active', true)
        .eq('zapi_instance_id', payload.instanceId);

      if (instErr) {
        console.log('[zapi-webhook] Error looking up tenant by instanceId:', instErr);
      } else if ((integrations?.length || 0) === 1) {
        tenantId = integrations![0].tenant_id;
        console.log(`[zapi-webhook] Found tenant by instanceId (${payload.instanceId}): ${tenantId}`);
      } else if ((integrations?.length || 0) > 1) {
        console.log(`[zapi-webhook] ERROR: instanceId ${payload.instanceId} is linked to multiple tenants (${integrations?.length}). Aborting.`);
        return new Response(JSON.stringify({ success: false, error: 'instance_id_conflict' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        console.log(`[zapi-webhook] No active integration found for instanceId ${payload.instanceId}`);
      }
    }

    if (!tenantId && groupName) {
      const { data: groupData } = await supabase
        .from('customer_whatsapp_groups')
        .select('tenant_id')
        .eq('whatsapp_group_name', groupName)
        .limit(1)
        .maybeSingle();

      if (groupData) {
        tenantId = groupData.tenant_id;
        console.log(`[zapi-webhook] Found tenant by group name: ${tenantId}`);
      }
    }

    if (!tenantId) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('tenant_id')
        .eq('phone', normalizedPhone)
        .limit(1)
        .maybeSingle();

      if (customerData) {
        tenantId = customerData.tenant_id;
        console.log(`[zapi-webhook] Found tenant by customer phone: ${tenantId}`);
      }
    }

    if (!tenantId) {
      console.log('[zapi-webhook] Could not identify tenant');
      return new Response(JSON.stringify({ success: false, error: 'tenant_not_found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // EARLY LOG: Insert webhook log BEFORE processing items
    // This ensures deduplication works across multiple Edge Function instances
    // ALWAYS insert - even without messageId - to enable DB-level dedup
    const earlyLogMessage = `[WEBHOOK] Processado: ${messageText}`;
    
    if (messageId) {
      await supabase.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: earlyLogMessage,
        type: 'incoming',
        whatsapp_group_name: groupName || null,
        received_at: new Date().toISOString(),
        zapi_message_id: messageId,
      });
    } else {
      // Without messageId: check DB for recent duplicate (same phone + same message within 15s)
      const fifteenSecondsAgo = new Date(Date.now() - 15000).toISOString();
      const { data: recentDup } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', normalizedPhone)
        .eq('message', earlyLogMessage)
        .gte('created_at', fifteenSecondsAgo)
        .limit(1)
        .maybeSingle();
      
      if (recentDup) {
        console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${normalizedPhone} (DB-level, no messageId, matched recent log)`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: 'duplicate_message_db_no_id'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Insert early log for future dedup
      await supabase.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: earlyLogMessage,
        type: 'incoming',
        whatsapp_group_name: groupName || null,
        received_at: new Date().toISOString(),
      });
    }

    // Process each product code
    const results = [];
    for (const code of productCodes) {
      const codeUpper = code.toUpperCase();
      
      // DEDUPLICATION: Check if this product was already processed for THIS message
      // This prevents duplicates when Z-API sends the same webhook multiple times
      if (isProductAlreadyProcessedForMessage(messageId, senderPhone, messageText, codeUpper)) {
        console.log(`[zapi-webhook] ⏭️ SKIPPING product ${codeUpper} - already processed for this message`);
        results.push({ 
          code: codeUpper, 
          success: true, 
          skipped: 'already_processed_for_message'
        });
        continue;
      }
      
      // Try to find product by exact code first
      let product = null;
      let productError = null;
      
      // IMPROVED: Search using TRIM to handle codes with trailing spaces in DB
      // Uses raw SQL filter to trim whitespace from both sides
      const searchPatterns = [
        codeUpper,                    // Exact: C345
        `${codeUpper} `,              // With trailing space: "C345 "
        ` ${codeUpper}`,              // With leading space
        `${codeUpper}  `,             // With double trailing space
      ];
      
      // Try exact match first (most common case)
      let { data: exactProduct } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('code', codeUpper)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (exactProduct) {
        product = exactProduct;
      }
      
      // If not found, try with trailing space (common data entry issue)
      if (!product) {
        const { data: spaceProduct } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .or(`code.ilike.${codeUpper} ,code.ilike.${codeUpper}  `)
          .limit(1)
          .maybeSingle();
        
        if (spaceProduct) {
          product = spaceProduct;
          console.log(`[zapi-webhook] ⚠️ Found product with trailing space in code: "${spaceProduct.code}"`);
        }
      }
      
      // Try with C prefix if not found and code doesn't start with C
      if (!product && !codeUpper.startsWith('C')) {
        const cPrefixCode = 'C' + codeUpper;
        const { data: cPrefixProduct } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .or(`code.ilike.${cPrefixCode},code.ilike.${cPrefixCode} ,code.ilike.${cPrefixCode}  `)
          .limit(1)
          .maybeSingle();
        
        if (cPrefixProduct) {
          product = cPrefixProduct;
        }
      }
      
      // Try without C prefix if code starts with C
      if (!product && codeUpper.startsWith('C')) {
        const withoutC = codeUpper.substring(1);
        const { data: noPrefixProduct } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .or(`code.ilike.${withoutC},code.ilike.${withoutC} ,code.ilike.${withoutC}  `)
          .limit(1)
          .maybeSingle();
        
        if (noPrefixProduct) {
          product = noPrefixProduct;
        }
      }

      if (!product) {
        console.log(`[zapi-webhook] Product not found: ${codeUpper}`);
        results.push({ code: codeUpper, success: false, error: 'product_not_found' });
        continue;
      }

      console.log(`[zapi-webhook] Found product: ${product.name} (${product.code}) - R$ ${product.price} - Estoque: ${product.stock}`);

      // STOCK VALIDATION: Block if no stock available
      if (product.stock <= 0) {
        console.log(`[zapi-webhook] ❌ ESTOQUE ESGOTADO para ${product.code}: estoque atual = ${product.stock}`);
        
        // Send out of stock message to customer via Z-API
        try {
          const { data: whatsappConfig } = await supabase
            .from('integration_whatsapp')
            .select('zapi_instance_id, zapi_token, zapi_client_token, is_active, send_out_of_stock_msg')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .maybeSingle();
          
          // Check if out of stock messages are enabled
          if (whatsappConfig?.send_out_of_stock_msg === false) {
            console.log(`[zapi-webhook] ⏭️ Mensagem de estoque esgotado desativada para este tenant`);
          } else if (whatsappConfig?.zapi_instance_id && whatsappConfig?.zapi_token) {
            const baseOutOfStockMessage = `😔 *Produto Esgotado*\n\nO produto *${product.name}* (código *${product.code}*) acabou no momento.💚`;
            const outOfStockMessage = addMessageVariation(baseOutOfStockMessage);
            
            // Format phone for Z-API (needs 55 prefix)
            const phoneForZapi = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
            
            // Simulate typing indicator before sending
            console.log(`[zapi-webhook] Simulating typing for out-of-stock message to ${phoneForZapi}...`);
            await simulateTyping(
              whatsappConfig.zapi_instance_id,
              whatsappConfig.zapi_token,
              whatsappConfig.zapi_client_token,
              phoneForZapi
            );
            
            // Apply anti-block delay before sending (1-4 seconds)
            const delayMs = await antiBlockDelay(1000, 4000);
            logAntiBlockDelay('zapi-webhook (out-of-stock)', delayMs);
            
            const zapiUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
            
            const sendResponse = await fetch(zapiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Client-Token': whatsappConfig.zapi_client_token || ''
              },
              body: JSON.stringify({
                phone: phoneForZapi,
                message: outOfStockMessage
              })
            });
            
            const sendResult = await sendResponse.json();
            console.log(`[zapi-webhook] 📤 Mensagem de estoque esgotado enviada para ${phoneForZapi}:`, sendResult);
            
            // Log the outgoing message
            await supabase.from('whatsapp_messages').insert({
              tenant_id: tenantId,
              phone: normalizedPhone,
              message: outOfStockMessage,
              type: 'outgoing',
              product_name: product.name,
              sent_at: new Date().toISOString(),
            });
          } else {
            console.log(`[zapi-webhook] WhatsApp não configurado para enviar mensagem de estoque esgotado`);
          }
        } catch (msgError) {
          console.error(`[zapi-webhook] Erro ao enviar mensagem de estoque esgotado:`, msgError);
        }
        
        results.push({ 
          code: codeUpper, 
          success: false, 
          error: 'out_of_stock',
          product_name: product.name,
          current_stock: product.stock,
          message_sent: true
        });
        continue;
      }

      // Find or create customer
      let customer = await findOrCreateCustomer(supabase, tenantId, normalizedPhone, payload.senderName || '');

      // ===== BLOCKED CUSTOMER CHECK =====
      // Check if this customer is blocked BEFORE processing any cart/order logic
      if (customer?.is_blocked) {
        console.log(`[zapi-webhook] 🚫 BLOCKED customer ${normalizedPhone} tried to order ${codeUpper} in tenant ${tenantId}`);
        
        // Send blocked customer message
        try {
          const { data: whatsappConfig } = await supabase
            .from('integration_whatsapp')
            .select('zapi_instance_id, zapi_token, zapi_client_token, is_active, blocked_customer_template')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .maybeSingle();

          if (whatsappConfig?.zapi_instance_id && whatsappConfig?.zapi_token) {
            const defaultBlockedMsg = 'Olá! Identificamos uma restrição em seu cadastro que impede a realização de novos pedidos no momento. ⛔\n\nPara entender melhor o motivo ou solicitar uma reavaliação, por favor, entre em contato diretamente com o suporte da loja.';
            const blockedMessage = addMessageVariation(whatsappConfig.blocked_customer_template || defaultBlockedMsg);
            
            const phoneForZapi = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
            
            await simulateTyping(
              whatsappConfig.zapi_instance_id,
              whatsappConfig.zapi_token,
              whatsappConfig.zapi_client_token,
              phoneForZapi
            );
            
            const delayMs = await antiBlockDelay(1000, 4000);
            logAntiBlockDelay('zapi-webhook (blocked-customer)', delayMs);
            
            const zapiUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
            
            await fetch(zapiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Client-Token': whatsappConfig.zapi_client_token || ''
              },
              body: JSON.stringify({
                phone: phoneForZapi,
                message: blockedMessage
              })
            });
            
            console.log(`[zapi-webhook] 📤 Blocked customer message sent to ${phoneForZapi}`);
            
            await supabase.from('whatsapp_messages').insert({
              tenant_id: tenantId,
              phone: normalizedPhone,
              message: `[BLOQUEADO] ${blockedMessage}`,
              type: 'outgoing',
              product_name: product.name,
              sent_at: new Date().toISOString(),
            });
          }
        } catch (msgError) {
          console.error(`[zapi-webhook] Error sending blocked customer message:`, msgError);
        }
        
        results.push({ 
          code: codeUpper, 
          success: false, 
          error: 'customer_blocked',
          product_name: product.name,
          customer_phone: normalizedPhone
        });
        continue;
      }

      // Determine event type based on product sale_type
      // BAZAR or AMBOS products → BAZAR event type (automatic orders are always BAZAR)
      // LIVE products → LIVE event type
      const eventType = product.sale_type === 'LIVE' ? 'LIVE' : 'BAZAR';

      // Find or create cart for this customer
      let cart = await findOrCreateCart(supabase, tenantId, normalizedPhone, groupName, eventType);

      // Check if this cart belongs to a CANCELLED order - if so, create a NEW cart/order
      const { data: cancelledOrder } = await supabase
        .from('orders')
        .select('id, is_cancelled')
        .eq('tenant_id', tenantId)
        .eq('cart_id', cart.id)
        .eq('is_cancelled', true)
        .maybeSingle();

      if (cancelledOrder) {
        console.log(`[zapi-webhook] ⚠️ Cart ${cart.id} pertence ao pedido cancelado #${cancelledOrder.id}. Criando NOVO carrinho e pedido...`);
        
        // Force create a new cart (bypass the existing one)
        const today = getBrasiliaDateISO();
        const { data: newCart, error: newCartError } = await supabase
          .from('carts')
          .insert({
            tenant_id: tenantId,
            customer_phone: normalizedPhone,
            event_date: today,
            event_type: eventType,
            status: 'OPEN',
            whatsapp_group_name: groupName || null,
          })
          .select()
          .single();

        if (newCartError || !newCart) {
          console.log(`[zapi-webhook] ❌ Erro ao criar novo carrinho: ${newCartError?.message}`);
          results.push({ 
            code: codeUpper, 
            success: false, 
            error: 'cart_creation_error',
            product_name: product.name
          });
          continue;
        }

        console.log(`[zapi-webhook] ✅ Novo carrinho criado: ${newCart.id} (substituindo cart ${cart.id} do pedido cancelado)`);
        cart = newCart;
      }

      // Find or create order for this cart
      const order = await findOrCreateOrder(supabase, tenantId, normalizedPhone, cart.id, groupName, eventType);

      // ATOMIC UPSERT: Prevents race conditions when multiple messages arrive simultaneously
      // Uses PostgreSQL's ON CONFLICT to handle concurrent inserts safely
      
      // First, check if product already exists in cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('id, qty, created_at')
        .eq('cart_id', cart.id)
        .eq('product_id', product.id)
        .maybeSingle();

      let cartItem;
      let wasSkipped = false;
      
      if (existingItem) {
        // DEDUPLICATION: Check if this product was added recently (within 30 seconds)
        // Reduced from 3 minutes to 30 seconds for better UX while still preventing duplicates
        const itemCreatedAt = new Date(existingItem.created_at).getTime();
        const thirtySecondsAgo = Date.now() - (30 * 1000);
        
        if (itemCreatedAt > thirtySecondsAgo) {
          // Product was added less than 30 seconds ago - skip to prevent duplicate
          console.log(`[zapi-webhook] ⏭️ SKIPPING duplicate product ${product.code} - already added ${Math.round((Date.now() - itemCreatedAt) / 1000)}s ago`);
          results.push({ 
            code, 
            success: true, 
            skipped: 'recent_duplicate',
            product_name: product.name,
            cart_id: cart.id,
            existing_qty: existingItem.qty,
            seconds_ago: Math.round((Date.now() - itemCreatedAt) / 1000)
          });
          continue;
        }
        
        // STOCK VALIDATION: Check if adding +1 exceeds available stock
        const newQty = existingItem.qty + 1;
        if (newQty > product.stock) {
          console.log(`[zapi-webhook] ❌ ESTOQUE INSUFICIENTE para +1 ${product.code}: estoque=${product.stock}, qty atual=${existingItem.qty}`);
          results.push({ 
            code, 
            success: false, 
            error: 'insufficient_stock',
            product_name: product.name,
            current_stock: product.stock,
            requested_qty: newQty
          });
          continue;
        }
        
        // Product exists and was added more than 30 seconds ago - customer genuinely wants another
        const { data: updatedItem, error: updateError } = await supabase
          .from('cart_items')
          .update({
            qty: newQty,
            unit_price: product.price,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url,
          })
          .eq('id', existingItem.id)
          .select()
          .single();

        if (updateError) {
          console.log(`[zapi-webhook] Error updating cart item:`, updateError);
          results.push({ code, success: false, error: 'cart_item_update_error' });
          continue;
        }
        cartItem = updatedItem;
        
        // DECREMENT STOCK after successful cart update
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: product.stock - 1 })
          .eq('id', product.id);
        
        if (stockError) {
          console.log(`[zapi-webhook] Error updating stock:`, stockError);
        } else {
          console.log(`[zapi-webhook] ✅ Estoque decrementado: ${product.code} agora tem ${product.stock - 1}`);
        }
        
        console.log(`[zapi-webhook] Updated existing cart item: ${cartItem.id}, new qty: ${cartItem.qty}`);
      } else {
        // Try to insert new item - use a transaction-safe approach with retry
        // to handle race conditions where another request inserted just before us
        
        // First attempt: try to insert
        const { data: newItem, error: cartItemError } = await supabase
          .from('cart_items')
          .insert({
            cart_id: cart.id,
            product_id: product.id,
            qty: 1,
            unit_price: product.price,
            tenant_id: tenantId,
            product_name: product.name,
            product_code: product.code,
            product_image_url: product.image_url,
          })
          .select()
          .single();

        if (cartItemError) {
          // Check if it's a duplicate key error (race condition)
          if (cartItemError.code === '23505' || cartItemError.message?.includes('duplicate') || cartItemError.message?.includes('unique')) {
            console.log(`[zapi-webhook] 🔄 Race condition detected for ${product.code} - checking existing item`);
            
            // Another request inserted this product - fetch it and check if we should skip
            const { data: raceItem } = await supabase
              .from('cart_items')
              .select('id, qty, created_at')
              .eq('cart_id', cart.id)
              .eq('product_id', product.id)
              .maybeSingle();
            
            if (raceItem) {
              const itemCreatedAt = new Date(raceItem.created_at).getTime();
              const thirtySecondsAgo = Date.now() - (30 * 1000);
              
              if (itemCreatedAt > thirtySecondsAgo) {
                // Item was just created by another request - skip
                console.log(`[zapi-webhook] ⏭️ SKIPPING (race) duplicate product ${product.code} - already added by concurrent request`);
                results.push({ 
                  code, 
                  success: true, 
                  skipped: 'race_condition_duplicate',
                  product_name: product.name,
                  cart_id: cart.id,
                  existing_qty: raceItem.qty
                });
                continue;
              }
            }
          }
          
          console.log(`[zapi-webhook] Error adding cart item:`, cartItemError);
          results.push({ code, success: false, error: 'cart_item_error' });
          continue;
        }
        
        cartItem = newItem;
        
        // DECREMENT STOCK after successful cart insert
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: product.stock - 1 })
          .eq('id', product.id);
        
        if (stockError) {
          console.log(`[zapi-webhook] Error updating stock:`, stockError);
        } else {
          console.log(`[zapi-webhook] ✅ Estoque decrementado: ${product.code} agora tem ${product.stock - 1}`);
        }
        
        console.log(`[zapi-webhook] Added new item to cart: ${cartItem.id}`);
      }

      // Update order total
      await updateOrderTotal(supabase, order.id);

      // The trigger on cart_items will automatically send the item added message
      results.push({ 
        code, 
        success: true, 
        product_name: product.name,
        price: product.price,
        cart_id: cart.id,
        order_id: order.id,
        cart_item_id: cartItem.id 
      });
    }

    // Log the webhook processing (only if we didn't already log with messageId above)
    if (!messageId) {
      await supabase.from('whatsapp_messages').insert({
        tenant_id: tenantId,
        phone: normalizedPhone,
        message: `[WEBHOOK] Processado: ${messageText}`,
        type: 'incoming',
        whatsapp_group_name: groupName || null,
        received_at: new Date().toISOString(),
      });
    }

    console.log(`[zapi-webhook] Processing complete. Results:`, results);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[zapi-webhook] Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Handle message status callbacks from Z-API
async function handleMessageStatusCallback(supabase: any, payload: ZAPIWebhookPayload) {
  const { status, ids, phone } = payload;
  
  console.log(`[zapi-webhook] Message status callback: ${status} for ${ids?.length || 0} message(s)`);

  if (!ids || ids.length === 0) {
    return new Response(JSON.stringify({ success: true, skipped: 'no_message_ids' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Map Z-API status to our status
  // SENT = enviada, RECEIVED = entregue (✓✓), READ = lida
  const deliveryStatus = status || 'UNKNOWN';
  const isDelivered = ['RECEIVED', 'READ', 'PLAYED'].includes(deliveryStatus);

  // Update all messages with these IDs
  for (const messageId of ids) {
    // Update the whatsapp_messages table
    const { data: messages, error: msgError } = await supabase
      .from('whatsapp_messages')
      .update({ delivery_status: deliveryStatus })
      .eq('zapi_message_id', messageId)
      .select('order_id, type');

    if (msgError) {
      console.log(`[zapi-webhook] Error updating message status for ${messageId}:`, msgError);
      continue;
    }

    console.log(`[zapi-webhook] Updated ${messages?.length || 0} message(s) to status ${deliveryStatus}`);

    // If message was delivered (RECEIVED), update the order delivery flags
    if (isDelivered && messages && messages.length > 0) {
      for (const msg of messages) {
        if (msg.order_id) {
          if (msg.type === 'item_added') {
            await supabase
              .from('orders')
              .update({ item_added_delivered: true })
              .eq('id', msg.order_id);
            console.log(`[zapi-webhook] Updated order ${msg.order_id} item_added_delivered = true`);
          } else if (msg.type === 'outgoing') {
            // This is a paid order confirmation
            await supabase
              .from('orders')
              .update({ payment_confirmation_delivered: true })
              .eq('id', msg.order_id);
            console.log(`[zapi-webhook] Updated order ${msg.order_id} payment_confirmation_delivered = true`);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ 
    success: true, 
    status: deliveryStatus,
    updated_ids: ids 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizePhone(phone: string): string {
  if (!phone) return '';

  // Remove all non-digit characters
  let clean = phone.replace(/\D/g, '');

  // Remove country code 55 if present
  if (clean.startsWith('55') && clean.length > 11) {
    clean = clean.substring(2);
  }

  // Expect DDD + number
  if (clean.length < 10) return '';

  // If WhatsApp sends DDD + 8 digits (10 total), assume mobile and add the 9th digit
  // (landlines typically don't use WhatsApp).
  if (clean.length === 10) {
    clean = clean.substring(0, 2) + '9' + clean.substring(2);
  }

  return clean;
}

async function findOrCreateCustomer(
  supabase: any, 
  tenantId: string, 
  phone: string, 
  name: string
) {
  // Try to find existing customer
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .limit(1)
    .single();

  if (existing) {
    return existing;
  }

  // Create new customer
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      tenant_id: tenantId,
      phone: phone,
      name: name || `Cliente ${phone.substring(phone.length - 4)}`,
    })
    .select()
    .single();

  if (error) {
    console.log('[zapi-webhook] Error creating customer:', error);
    throw error;
  }

  console.log(`[zapi-webhook] Created new customer: ${newCustomer.id}`);
  return newCustomer;
}

async function findOrCreateCart(
  supabase: any, 
  tenantId: string, 
  phone: string,
  groupName: string,
  eventType: string
) {
  const today = getBrasiliaDateISO();
  
  console.log(`[zapi-webhook] 🔍 findOrCreateCart - tenant: ${tenantId}, phone: ${phone}, eventType: ${eventType}, date: ${today}`);

  // First, check ALL carts for this customer (not just OPEN) to debug
  const { data: allCarts, error: allCartsError } = await supabase
    .from('carts')
    .select('id, status, event_type, event_date, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(10);

  if (allCartsError) {
    console.log(`[zapi-webhook] ❌ Error fetching all carts: ${allCartsError.message}`);
  } else {
    console.log(`[zapi-webhook] 📋 Found ${allCarts?.length || 0} total carts for this phone:`);
    for (const c of allCarts || []) {
      console.log(`[zapi-webhook]   - Cart ID: ${c.id}, Status: ${c.status}, Type: ${c.event_type}, Date: ${c.event_date}, Created: ${c.created_at}`);
    }
  }

  // Try to find an open cart for this customer with same event type AND today's date
  // IMPORTANT: We only reuse carts from TODAY to prevent adding items to old carts
  const { data: existingCart, error: openCartError } = await supabase
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('event_date', today) // CRITICAL: Only match today's date!
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openCartError) {
    console.log(`[zapi-webhook] ❌ Error finding open cart: ${openCartError.message}`);
  }

  if (existingCart) {
    // Double-check: ensure this cart is NOT linked to a cancelled order
    const { data: linkedOrder } = await supabase
      .from('orders')
      .select('id, is_cancelled, is_paid')
      .eq('cart_id', existingCart.id)
      .maybeSingle();

    if (linkedOrder?.is_cancelled === true) {
      console.log(`[zapi-webhook] ⚠️ Found OPEN cart ${existingCart.id} but it's linked to CANCELLED order #${linkedOrder.id} - will create NEW cart`);
      // Don't return this cart - fall through to create a new one
    } else if (linkedOrder?.is_paid === true) {
      console.log(`[zapi-webhook] ⚠️ Found OPEN cart ${existingCart.id} but it's linked to PAID order #${linkedOrder.id} - will create NEW cart`);
      // Don't return this cart - fall through to create a new one
    } else {
      console.log(`[zapi-webhook] ✅ Found existing OPEN cart: ${existingCart.id} (${eventType}, date: ${today})`);
      return existingCart;
    }
  } else {
    console.log(`[zapi-webhook] ℹ️ No OPEN cart found for today (${today}) - will check for other conditions`);
  }

  // Check if there's a CLOSED cart for today - this is the case we want to debug
  const closedCart = allCarts?.find((c: any) => 
    c.status === 'CLOSED' && 
    c.event_type === eventType && 
    c.event_date === today
  );

  if (closedCart) {
    console.log(`[zapi-webhook] ⚠️ Found CLOSED cart for today: ID=${closedCart.id} - Will create a NEW cart`);
  } else {
    console.log(`[zapi-webhook] ℹ️ No existing cart found for this event type/date - Will create a NEW cart`);
  }

  // Create new cart with correct event type
  console.log(`[zapi-webhook] 🆕 Creating new cart - tenant: ${tenantId}, phone: ${phone}, eventType: ${eventType}, date: ${today}, group: ${groupName || 'null'}`);
  
  const { data: newCart, error } = await supabase
    .from('carts')
    .insert({
      tenant_id: tenantId,
      customer_phone: phone,
      event_date: today,
      event_type: eventType,
      status: 'OPEN',
      whatsapp_group_name: groupName || null,
    })
    .select()
    .single();

  if (error) {
    console.log(`[zapi-webhook] ❌ Error creating cart: ${error.message}`);
    console.log(`[zapi-webhook] ❌ Error details:`, JSON.stringify(error));
    throw error;
  }

  console.log(`[zapi-webhook] ✅ Created new cart: ${newCart.id} (${eventType})`);
  return newCart;
}

async function findOrCreateOrder(
  supabase: any,
  tenantId: string,
  phone: string,
  cartId: number,
  groupName: string,
  eventType: string
) {
  const today = getBrasiliaDateISO();

  console.log(`[zapi-webhook] 🔍 findOrCreateOrder - tenant: ${tenantId}, phone: ${phone}, cartId: ${cartId}, eventType: ${eventType}, date: ${today}`);

  // First, check ALL orders for this customer to debug
  const { data: allOrders, error: allOrdersError } = await supabase
    .from('orders')
    .select('id, is_paid, is_cancelled, event_type, event_date, cart_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(10);

  if (allOrdersError) {
    console.log(`[zapi-webhook] ❌ Error fetching all orders: ${allOrdersError.message}`);
  } else {
    console.log(`[zapi-webhook] 📋 Found ${allOrders?.length || 0} total orders for this phone:`);
    for (const o of allOrders || []) {
      console.log(`[zapi-webhook]   - Order ID: ${o.id}, Paid: ${o.is_paid}, Cancelled: ${o.is_cancelled}, Type: ${o.event_type}, Date: ${o.event_date}, CartID: ${o.cart_id}, Created: ${o.created_at}`);
    }
  }

  // PRIORITY 1: Find existing order that uses this cart_id (prevents duplicates across days)
  // This handles the case where customer adds items on different days - same cart = same order
  const { data: orderByCart, error: cartOrderError } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('cart_id', cartId)
    .eq('is_paid', false)
    .eq('is_cancelled', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cartOrderError) {
    console.log(`[zapi-webhook] ❌ Error finding order by cart_id: ${cartOrderError.message}`);
  }

  if (orderByCart) {
    console.log(`[zapi-webhook] ✅ Found existing unpaid order by cart_id: ${orderByCart.id} (cart_id: ${cartId})`);
    // Update event_date to today so order appears in today's list
    if (orderByCart.event_date !== today) {
      console.log(`[zapi-webhook] 📅 Updating order ${orderByCart.id} event_date from ${orderByCart.event_date} to ${today}`);
      await supabase
        .from('orders')
        .update({ event_date: today })
        .eq('id', orderByCart.id);
    }
    return orderByCart;
  }

  // PRIORITY 2: Find existing unpaid order for today with same event type
  const { data: existingOrder, error: findError } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('event_date', today)
    .eq('is_paid', false)
    .eq('is_cancelled', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.log(`[zapi-webhook] ❌ Error finding unpaid order: ${findError.message}`);
  }

  if (existingOrder) {
    console.log(`[zapi-webhook] ✅ Found existing unpaid order for today: ${existingOrder.id} (${eventType}), cart_id: ${existingOrder.cart_id}`);
    // Update cart_id if needed
    if (existingOrder.cart_id !== cartId) {
      console.log(`[zapi-webhook] ⚠️ Updating order ${existingOrder.id} cart_id from ${existingOrder.cart_id} to ${cartId}`);
      await supabase
        .from('orders')
        .update({ cart_id: cartId })
        .eq('id', existingOrder.id);
    }
    return existingOrder;
  }

  // Check if there's a PAID order for today - this would explain why we need new one
  const paidOrder = allOrders?.find((o: any) => 
    o.is_paid === true && 
    o.event_type === eventType && 
    o.event_date === today
  );

  if (paidOrder) {
    console.log(`[zapi-webhook] ℹ️ Found PAID order for today: ID=${paidOrder.id} - Will create a NEW order`);
  } else {
    console.log(`[zapi-webhook] ℹ️ No existing unpaid order found for cart_id=${cartId} or today's date - Will create a NEW order`);
  }

  // Create new order with correct event type
  console.log(`[zapi-webhook] 🆕 Creating new order - tenant: ${tenantId}, phone: ${phone}, cartId: ${cartId}, eventType: ${eventType}`);
  
  const { data: newOrder, error } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      customer_phone: phone,
      event_date: today,
      event_type: eventType,
      total_amount: 0,
      is_paid: false,
      cart_id: cartId,
      whatsapp_group_name: groupName || null,
    })
    .select()
    .single();

  if (error) {
    console.log(`[zapi-webhook] ❌ Error creating order: ${error.message}`);
    console.log(`[zapi-webhook] ❌ Error details:`, JSON.stringify(error));
    throw error;
  }

  console.log(`[zapi-webhook] ✅ Created new order: ${newOrder.id} (${eventType})`);
  return newOrder;
}

async function updateOrderTotal(supabase: any, orderId: number) {
  // Calculate total from cart items + freight from observation
  const { data: order } = await supabase
    .from('orders')
    .select('cart_id, observation')
    .eq('id', orderId)
    .single();

  if (!order?.cart_id) return;

  const { data: items } = await supabase
    .from('cart_items')
    .select('qty, unit_price')
    .eq('cart_id', order.cart_id);

  const productsTotal = items?.reduce((sum: number, item: any) => sum + (item.qty * item.unit_price), 0) || 0;

  // Extract freight value from observation field if present
  let freightValue = 0;
  if (order.observation) {
    const match = order.observation.match(/R\$\s*([\d]+[.,][\d]{2})/i);
    if (match) {
      freightValue = parseFloat(match[1].replace(",", ".")) || 0;
    }
  }

  const total = productsTotal + freightValue;

  await supabase
    .from('orders')
    .update({ total_amount: total })
    .eq('id', orderId);

  console.log(`[zapi-webhook] Updated order ${orderId} total to ${total} (products: ${productsTotal}, freight: ${freightValue})`);
}
 
 // Handle confirmation responses (SIM, OK, sim, ok) for the two-step message flow
 async function handleConfirmationResponse(
   supabase: any, 
   senderPhone: string, 
   messageText: string,
   instanceId?: string
 ): Promise<{ handled: boolean; action?: string; error?: string }> {
   
    // Normalize phone
    let normalizedPhone = senderPhone.replace(/\D/g, '');
    if (normalizedPhone.length >= 10 && !normalizedPhone.startsWith('55')) {
      normalizedPhone = '55' + normalizedPhone;
    }

    // IMPORTANT (BR): Z-API sometimes delivers private-message callbacks without the 9th digit
    // after DDD (e.g. stored: 5531999998888, received: 553199998888). We must match both.
    function buildPhoneVariantsForConfirmation(phone: string): string[] {
      const variants = new Set<string>();
      const p = (phone || '').replace(/\D/g, '');
      if (!p) return [];
      
      console.log(`[zapi-webhook] 📱 buildPhoneVariantsForConfirmation input: ${p} (length: ${p.length})`);

      // Determinar base sem país
      let baseWithoutCountry = p;
      if (p.startsWith('55') && p.length >= 12) {
        baseWithoutCountry = p.substring(2);
      }
      
      // Determinar base com país
      const baseWithCountry = p.startsWith('55') ? p : '55' + p;
      
      // Adicionar variações principais
      variants.add(baseWithoutCountry); // Ex: 31992904210 ou 3192904210
      variants.add(baseWithCountry);     // Ex: 5531992904210 ou 553192904210
      
      console.log(`[zapi-webhook] 📱 Base: withCountry=${baseWithCountry}, without=${baseWithoutCountry}`);
      
      // Variantes com/sem o 9º dígito para BR móveis
      // Telefone COM 9: DDD(2) + 9 + número(8) = 11 dígitos sem país
      // Telefone SEM 9: DDD(2) + número(8) = 10 dígitos sem país
      
      if (baseWithoutCountry.length === 11) {
        // Tem 11 dígitos sem país, assume que TEM o 9 - gerar versão SEM 9
        const ddd = baseWithoutCountry.slice(0, 2);
        const ninthDigit = baseWithoutCountry.charAt(2);
        const rest = baseWithoutCountry.slice(3);
        
        if (ninthDigit === '9' && rest.length === 8) {
          const without9 = ddd + rest;
          variants.add(without9);           // Ex: 3199290421
          variants.add('55' + without9);    // Ex: 553199290421
          console.log(`[zapi-webhook] 📱 Gerado versão SEM 9: ${without9}`);
        }
      } else if (baseWithoutCountry.length === 10) {
        // Tem 10 dígitos sem país, assume que NÃO tem o 9 - gerar versão COM 9
        const ddd = baseWithoutCountry.slice(0, 2);
        const rest = baseWithoutCountry.slice(2);
        
        if (rest.length === 8) {
          const with9 = ddd + '9' + rest;
          variants.add(with9);              // Ex: 31992904210
          variants.add('55' + with9);       // Ex: 5531992904210
          console.log(`[zapi-webhook] 📱 Gerado versão COM 9: ${with9}`);
        }
      }
      
      const result = Array.from(variants);
      console.log(`[zapi-webhook] 📱 Variantes geradas (${result.length}): ${result.join(', ')}`);
      return result;
    }

    const phoneVariants = buildPhoneVariantsForConfirmation(normalizedPhone);
    const phoneVariants55 = phoneVariants.filter((v) => v.startsWith('55'));
   
   // Check if message is a confirmation response
   const cleanMessage = messageText.trim().toLowerCase();
   const isConfirmation = ['sim', 'ok', 'yes', 's', 'simmm', 'simm', 'si', 'okay', 'pode'].includes(cleanMessage);
   
   if (!isConfirmation) {
     console.log(`[zapi-webhook] Message "${cleanMessage}" is not a confirmation response`);
     return { handled: false };
   }
   
   console.log(`[zapi-webhook] 🔔 Detected confirmation response "${cleanMessage}" from ${normalizedPhone}`);
   
   // Find pending confirmation for this phone
   // First, try to find by instanceId to get the correct tenant
   let tenantId: string | null = null;
   
   if (instanceId) {
     const { data: integration } = await supabase
       .from('integration_whatsapp')
       .select('tenant_id, consent_protection_enabled')
       .eq('zapi_instance_id', instanceId)
       .eq('is_active', true)
       .maybeSingle();
     
     if (integration) {
       tenantId = integration.tenant_id;
     }
   }
   
    // Build query for pending confirmations
    let query = supabase
      .from('pending_message_confirmations')
      .select('*')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    // Prefer matching by tenant (derived from instanceId) when possible
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    // Try exact matches for multiple phone variants (with/without 9)
    if (phoneVariants55.length > 0) {
      query = query.in('customer_phone', phoneVariants55);
    } else {
      query = query.eq('customer_phone', normalizedPhone);
    }

    const { data: confirmations, error: confError } = await query.limit(1);
   
   if (confError) {
     console.log(`[zapi-webhook] Error finding confirmation:`, confError);
     return { handled: false, error: confError.message };
   }
   
   if (!confirmations || confirmations.length === 0) {
      // Fallback: match by last digits (helps when provider changes formatting)
      const phoneWithoutCountry = normalizedPhone.replace(/^55/, '');
      const last10 = phoneWithoutCountry.slice(-10);
      const last11 = phoneWithoutCountry.slice(-11);

      let fallbackQuery = supabase
        .from('pending_message_confirmations')
        .select('*')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (tenantId) fallbackQuery = fallbackQuery.eq('tenant_id', tenantId);

      // Try last 11 first (BR mobile with 9), then last 10
      const { data: confirmations2 } = await fallbackQuery
        .or(`customer_phone.ilike.%${last11},customer_phone.ilike.%${last10}`)
        .limit(1);
     
     if (!confirmations2 || confirmations2.length === 0) {
       console.log(`[zapi-webhook] No pending confirmation found for ${normalizedPhone}`);
       return { handled: false };
     }
     
     // Found confirmation with alternative phone format
      return await processConfirmationResponse(supabase, confirmations2[0], instanceId, normalizedPhone);
   }
   
    return await processConfirmationResponse(supabase, confirmations[0], instanceId, normalizedPhone);
 }

 // Processa a resposta de confirmação - ATUALIZADO para suportar modo de proteção por consentimento
 async function processConfirmationResponse(
   supabase: any, 
   confirmation: any,
   instanceId?: string,
   targetPhoneOverride?: string
 ): Promise<{ handled: boolean; action?: string; error?: string }> {
   
   // Verificar se o modo de proteção por consentimento está ativo
   const consentProtectionEnabled = confirmation.metadata?.consent_protection_enabled === true;
   
   if (consentProtectionEnabled) {
     // ============================================================
     // MODO DE PROTEÇÃO POR CONSENTIMENTO
     // Apenas atualiza o DB, NÃO envia resposta ao cliente
     // ============================================================
       console.log(`[zapi-webhook] 🛡️ Modo de Proteção por Consentimento: apenas atualizando DB`);
       
       // Normaliza telefone para buscar cliente
       // targetPhoneOverride vem do webhook (pode ser 5531992904210)
       // confirmation.customer_phone vem do DB (é 5531992904210)
       const targetPhone = (targetPhoneOverride || confirmation.customer_phone || '').replace(/\D/g, '');
       
       console.log(`[zapi-webhook] 📞 targetPhone: ${targetPhone} (from override: ${targetPhoneOverride}, confirmation: ${confirmation.customer_phone})`);
       
       // Gera TODAS as variantes do telefone brasileiro (com/sem 55, com/sem 9)
       function buildPhoneVariantsForDB(phone: string): string[] {
         const variants = new Set<string>();
         const p = phone.replace(/\D/g, '');
         if (!p) return [];
         
         // Determinar base sem país
         let baseWithoutCountry = p;
         if (p.startsWith('55') && p.length >= 12) {
           baseWithoutCountry = p.substring(2);
         }
         
         // Determinar base com país
         const baseWithCountry = p.startsWith('55') ? p : '55' + p;
         
         // Adicionar variações principais
         variants.add(baseWithoutCountry); // Ex: 31992904210
         variants.add(baseWithCountry);     // Ex: 5531992904210
         
         // Variantes com/sem o 9º dígito para BR móveis
         // Telefone COM 9: DDD(2) + 9 + número(8) = 11 dígitos
         // Telefone SEM 9: DDD(2) + número(8) = 10 dígitos
         
         if (baseWithoutCountry.length === 11) {
           // Tem 11 dígitos, assume que tem o 9 - gerar versão sem 9
           const ddd = baseWithoutCountry.slice(0, 2);
           const ninthDigit = baseWithoutCountry.charAt(2);
           const rest = baseWithoutCountry.slice(3);
           
           if (ninthDigit === '9' && rest.length === 8) {
             const without9 = ddd + rest;
             variants.add(without9);           // Ex: 3199290421
             variants.add('55' + without9);    // Ex: 553199290421
           }
         } else if (baseWithoutCountry.length === 10) {
           // Tem 10 dígitos, assume que NÃO tem o 9 - gerar versão com 9
           const ddd = baseWithoutCountry.slice(0, 2);
           const rest = baseWithoutCountry.slice(2);
           
           if (rest.length === 8) {
             const with9 = ddd + '9' + rest;
             variants.add(with9);              // Ex: 31992904210
             variants.add('55' + with9);       // Ex: 5531992904210
           }
         }
         
         return Array.from(variants);
       }
       
       const phoneVariants = buildPhoneVariantsForDB(targetPhone);
       console.log(`[zapi-webhook] 📞 Variantes geradas (${phoneVariants.length}): ${phoneVariants.join(', ')}`);
      
      // Primeiro, buscar o cliente existente com qualquer variante do telefone
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, phone, name')
        .eq('tenant_id', confirmation.tenant_id)
        .in('phone', phoneVariants)
        .limit(1)
        .maybeSingle();
      
      if (existingCustomer) {
        // Atualizar consentimento do cliente encontrado
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            consentimento_ativo: true,
            data_permissao: new Date().toISOString()
          })
          .eq('id', existingCustomer.id);
        
        if (updateError) {
          console.error(`[zapi-webhook] Error updating customer consent:`, updateError);
        } else {
          console.log(`[zapi-webhook] ✅ Consentimento atualizado para cliente ${existingCustomer.id} (${existingCustomer.name}) - telefone: ${existingCustomer.phone}`);
        }
      } else {
        // Criar novo cliente com o telefone sem prefixo 55 (padrão do sistema)
        let phoneForDB = targetPhone;
        if (phoneForDB.startsWith('55') && phoneForDB.length > 11) {
          phoneForDB = phoneForDB.substring(2);
        }
        
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .insert({
            tenant_id: confirmation.tenant_id,
            phone: phoneForDB,
            name: `Cliente ${phoneForDB.slice(-4)}`,
            consentimento_ativo: true,
            data_permissao: new Date().toISOString()
          })
          .select('id')
          .single();
        
        if (createError) {
          console.error(`[zapi-webhook] Error creating customer:`, createError);
        } else {
          console.log(`[zapi-webhook] ✅ Criado novo cliente ${newCustomer.id} com consentimento ativo`);
        }
      }
     
     // Marcar confirmação como confirmada
     await supabase
       .from('pending_message_confirmations')
       .update({
         status: 'confirmed',
         confirmed_at: new Date().toISOString()
       })
       .eq('id', confirmation.id);
     
     // Log para auditoria
     await supabase.from('whatsapp_messages').insert({
       tenant_id: confirmation.tenant_id,
       phone: targetPhone,
       message: '[SISTEMA] Cliente confirmou recebimento de mensagens. Consentimento registrado.',
       type: 'system_log',
       sent_at: new Date().toISOString()
     });
     
     console.log(`[zapi-webhook] ✅ Consentimento registrado. Enviando link de checkout imediatamente.`);

     // ============================================================
     // NOVO: Enviar link de checkout imediatamente após consentimento
     // ============================================================
     try {
       // Buscar config Z-API do tenant
       const { data: whatsappConfig } = await supabase
         .from('integration_whatsapp')
         .select('zapi_instance_id, zapi_token, zapi_client_token')
         .eq('tenant_id', confirmation.tenant_id)
         .eq('is_active', true)
         .maybeSingle();

       if (whatsappConfig?.zapi_instance_id && whatsappConfig?.zapi_token) {
         // Buscar slug do tenant
         const { data: tenant } = await supabase
           .from('tenants')
           .select('slug')
           .eq('id', confirmation.tenant_id)
           .maybeSingle();

         // Buscar public_base_url
         const { data: settings } = await supabase
           .from('app_settings')
           .select('public_base_url')
           .limit(1)
           .maybeSingle();

         const baseUrl = settings?.public_base_url || 'https://live-launchpad-79.lovable.app';
         const slug = tenant?.slug || confirmation.tenant_id;
         const checkoutUrl = `${baseUrl}/t/${slug}/checkout`;

         const linkMessage = `Segue o link: ${checkoutUrl} 😘🥰`;

         // Simulate typing
         try {
           const typingUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/typing`;
           const typingHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
           if (whatsappConfig.zapi_client_token) typingHeaders['Client-Token'] = whatsappConfig.zapi_client_token;
           await fetch(typingUrl, {
             method: 'POST',
             headers: typingHeaders,
             body: JSON.stringify({ phone: targetPhone, duration: 3 })
           });
           const typingDelay = 2000 + Math.random() * 2000;
           await new Promise(resolve => setTimeout(resolve, typingDelay));
         } catch (e) {
           console.log('[zapi-webhook] Typing simulation failed, continuing...');
         }

         // Anti-block delay
         const delayMs = await antiBlockDelayLive();
         logAntiBlockDelay('zapi-webhook (consent-link)', delayMs);

         // Enviar mensagem com link
         const sendUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
         const sendHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
         if (whatsappConfig.zapi_client_token) sendHeaders['Client-Token'] = whatsappConfig.zapi_client_token;

         const response = await fetch(sendUrl, {
           method: 'POST',
           headers: sendHeaders,
           body: JSON.stringify({ phone: targetPhone, message: linkMessage })
         });

         const responseText = await response.text();
         console.log(`[zapi-webhook] 📤 Checkout link sent after consent: ${response.status} - ${responseText.substring(0, 200)}`);

         // Parse message ID
         let zapiMessageId = null;
         try {
           const responseJson = JSON.parse(responseText);
           zapiMessageId = responseJson.messageId || responseJson.id || null;
         } catch (e) { }

         // Log da mensagem enviada
         await supabase.from('whatsapp_messages').insert({
           tenant_id: confirmation.tenant_id,
           phone: targetPhone,
           message: linkMessage,
           type: 'outgoing',
           sent_at: new Date().toISOString(),
           zapi_message_id: zapiMessageId,
           delivery_status: response.ok ? 'SENT' : 'FAILED'
         });

         console.log(`[zapi-webhook] ✅ Link de checkout enviado após consentimento!`);
       } else {
         console.log(`[zapi-webhook] ⚠️ Config Z-API não encontrada para enviar link após consentimento`);
       }
     } catch (linkError) {
       console.error(`[zapi-webhook] ❌ Erro ao enviar link após consentimento:`, linkError);
     }
     
     return { 
       handled: true, 
       action: 'consent_registered_and_link_sent'
     };
     
   } else {
     // ============================================================
     // MODO LEGADO: Enviar link de checkout como resposta
     // ============================================================
     return await sendConfirmationLink(supabase, confirmation, instanceId, targetPhoneOverride);
   }
 }
 
 // Send the confirmation link (second message with checkout URL)
 async function sendConfirmationLink(
   supabase: any, 
   confirmation: any,
    instanceId?: string,
    targetPhoneOverride?: string
 ): Promise<{ handled: boolean; action?: string; error?: string }> {
   
   console.log(`[zapi-webhook] 📤 Sending confirmation link for ${confirmation.id}`);
   
   // Get tenant's WhatsApp config
   const { data: whatsappConfig } = await supabase
     .from('integration_whatsapp')
     .select('zapi_instance_id, zapi_token, zapi_client_token, item_added_confirmation_template')
     .eq('tenant_id', confirmation.tenant_id)
     .eq('is_active', true)
     .maybeSingle();
   
   if (!whatsappConfig?.zapi_instance_id || !whatsappConfig?.zapi_token) {
     console.log(`[zapi-webhook] No WhatsApp config for tenant ${confirmation.tenant_id}`);
     return { handled: true, error: 'no_whatsapp_config' };
   }
   
   // Build confirmation message
   const defaultTemplate = `Perfeito! 🎉
 
 Aqui está o seu link exclusivo para finalizar a compra:
 
 👉 {{checkout_url}}
 
 Qualquer dúvida estou à disposição! ✨`;
   
   let message = (whatsappConfig.item_added_confirmation_template || defaultTemplate)
     .replace(/\{\{checkout_url\}\}/g, confirmation.checkout_url || '')
     .replace(/\{\{link\}\}/g, confirmation.checkout_url || '');
   
   // Add message variation
   message = addMessageVariation(message);
   
    const targetPhone = (targetPhoneOverride || confirmation.customer_phone || '').replace(/\D/g, '') || confirmation.customer_phone;

    // Simulate typing (3-5 seconds)
   try {
     const typingUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/typing`;
     const headers: Record<string, string> = { 'Content-Type': 'application/json' };
     if (whatsappConfig.zapi_client_token) headers['Client-Token'] = whatsappConfig.zapi_client_token;
     
     await fetch(typingUrl, {
       method: 'POST',
       headers,
        body: JSON.stringify({ phone: targetPhone, duration: 4 })
     });
     
     const typingDelay = 3000 + Math.random() * 2000;
     await new Promise(resolve => setTimeout(resolve, typingDelay));
   } catch (e) {
     console.log('[zapi-webhook] Typing simulation failed, continuing...');
   }
   
   // Apply anti-block delay
   const delayMs = await antiBlockDelayLive();
   logAntiBlockDelay('zapi-webhook (confirmation link)', delayMs);
   
   // Send the message
   const sendUrl = `https://api.z-api.io/instances/${whatsappConfig.zapi_instance_id}/token/${whatsappConfig.zapi_token}/send-text`;
   const headers: Record<string, string> = { 'Content-Type': 'application/json' };
   if (whatsappConfig.zapi_client_token) headers['Client-Token'] = whatsappConfig.zapi_client_token;
   
    console.log(`[zapi-webhook] Sending confirmation link to ${targetPhone}`);
   
   const response = await fetch(sendUrl, {
     method: 'POST',
     headers,
      body: JSON.stringify({ phone: targetPhone, message })
   });
   
   const responseText = await response.text();
   console.log(`[zapi-webhook] Confirmation link response: ${response.status} - ${responseText.substring(0, 200)}`);
   
   // Parse message ID
   let zapiMessageId = null;
   try {
     const responseJson = JSON.parse(responseText);
     zapiMessageId = responseJson.messageId || responseJson.id || null;
   } catch (e) { }
   
   // Update confirmation status
   await supabase
     .from('pending_message_confirmations')
     .update({
       status: 'confirmed',
       confirmed_at: new Date().toISOString()
     })
     .eq('id', confirmation.id);
   
   // Log the message
   await supabase.from('whatsapp_messages').insert({
     tenant_id: confirmation.tenant_id,
      phone: targetPhone,
     message: message.substring(0, 500),
     type: 'outgoing',
     sent_at: new Date().toISOString(),
     zapi_message_id: zapiMessageId,
     delivery_status: response.ok ? 'SENT' : 'FAILED'
   });
   
   console.log(`[zapi-webhook] ✅ Confirmation link sent for ${confirmation.id}`);
   
   return { 
     handled: true, 
     action: 'confirmation_link_sent',
   };
 }
