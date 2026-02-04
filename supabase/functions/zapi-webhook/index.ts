import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { antiBlockDelay, logAntiBlockDelay } from "../_shared/anti-block-delay.ts";

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

    // Check for duplicate message BEFORE processing
    if (isDuplicateMessage(messageId, senderPhone, messageText)) {
      console.log(`[zapi-webhook] ⏭️ Skipping duplicate message from ${senderPhone}`);
      return new Response(JSON.stringify({ 
        success: true, 
        skipped: 'duplicate_message',
        messageId: messageId || 'no_id'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[zapi-webhook] Message: "${messageText}", From: ${senderPhone}, Group: ${groupName}, IsGroup: ${isGroup}, MessageId: ${messageId || 'N/A'}`);

    // CRITICAL: Only process messages from WhatsApp GROUPS - ignore direct/private messages
    // This prevents creating orders from direct messages to the business number
    if (!isGroup) {
      console.log('[zapi-webhook] ⏭️ Ignoring message from direct/private chat - only group messages create orders');
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
            const outOfStockMessage = `😔 *Produto Esgotado*\n\nO produto *${product.name}* (código *${product.code}*) acabou no momento.💚`;
            
            // Format phone for Z-API (needs 55 prefix)
            const phoneForZapi = normalizedPhone.startsWith('55') ? normalizedPhone : `55${normalizedPhone}`;
            
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

    // Log the webhook processing
    await supabase.from('whatsapp_messages').insert({
      tenant_id: tenantId,
      phone: normalizedPhone,
      message: `[WEBHOOK] Processado: ${messageText}`,
      type: 'incoming',
      whatsapp_group_name: groupName || null,
      received_at: new Date().toISOString(),
    });

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
  // Calculate total from cart items
  const { data: order } = await supabase
    .from('orders')
    .select('cart_id')
    .eq('id', orderId)
    .single();

  if (!order?.cart_id) return;

  const { data: items } = await supabase
    .from('cart_items')
    .select('qty, unit_price')
    .eq('cart_id', order.cart_id);

  const total = items?.reduce((sum: number, item: any) => sum + (item.qty * item.unit_price), 0) || 0;

  await supabase
    .from('orders')
    .update({ total_amount: total })
    .eq('id', orderId);

  console.log(`[zapi-webhook] Updated order ${orderId} total to ${total}`);
}
