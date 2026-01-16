import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Clean old entries from cache periodically
function cleanMessageCache() {
  const now = Date.now();
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_CACHE_TTL_MS) {
      processedMessages.delete(key);
    }
  }
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

    // Recognize product codes strictly in the format: C + 1-4 digits (e.g., C100)
    // IMPORTANT: We intentionally do NOT accept plain numbers like "100" to avoid false positives.
    const productCodes: string[] = [];

    const codeWithCRegex = /\b[Cc](\d{1,4})\b/g;
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
      
      // Try to find product by exact code first
      let product = null;
      let productError = null;
      
      // Try exact match
      const { data: exactProduct, error: exactError } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('code', codeUpper)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (exactProduct) {
        product = exactProduct;
      } else {
        // Try with C prefix if not found and code doesn't start with C
        if (!codeUpper.startsWith('C')) {
          const { data: cPrefixProduct } = await supabase
            .from('products')
            .select('*')
            .eq('tenant_id', tenantId)
            .ilike('code', 'C' + codeUpper)
            .eq('is_active', true)
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
            .ilike('code', withoutC)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          
          if (noPrefixProduct) {
            product = noPrefixProduct;
          }
        }
      }

      if (!product) {
        console.log(`[zapi-webhook] Product not found: ${codeUpper}`);
        results.push({ code: codeUpper, success: false, error: 'product_not_found' });
        continue;
      }

      console.log(`[zapi-webhook] Found product: ${product.name} (${product.code}) - R$ ${product.price}`);

      // Find or create customer
      let customer = await findOrCreateCustomer(supabase, tenantId, normalizedPhone, payload.senderName || '');

      // Determine event type based on product sale_type
      // BAZAR or AMBOS products → BAZAR event type (automatic orders are always BAZAR)
      // LIVE products → LIVE event type
      const eventType = product.sale_type === 'LIVE' ? 'LIVE' : 'BAZAR';

      // Find or create cart for this customer
      const cart = await findOrCreateCart(supabase, tenantId, normalizedPhone, groupName, eventType);

      // Find or create order for this cart
      const order = await findOrCreateOrder(supabase, tenantId, normalizedPhone, cart.id, groupName, eventType);

      // Check if product already in cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('cart_id', cart.id)
        .eq('product_id', product.id)
        .maybeSingle();

      let cartItem;
      if (existingItem) {
        // Update existing item - also refresh product snapshot
        const { data: updatedItem, error: updateError } = await supabase
          .from('cart_items')
          .update({
            qty: existingItem.qty + 1,
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
        console.log(`[zapi-webhook] Updated existing cart item: ${cartItem.id}, new qty: ${cartItem.qty}`);
      } else {
        // Add new item to cart with product snapshot
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
          console.log(`[zapi-webhook] Error adding cart item:`, cartItemError);
          results.push({ code, success: false, error: 'cart_item_error' });
          continue;
        }
        cartItem = newItem;
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
  const today = new Date().toISOString().split('T')[0];
  
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

  // Try to find an open cart for this customer with same event type
  const { data: existingCart, error: openCartError } = await supabase
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openCartError) {
    console.log(`[zapi-webhook] ❌ Error finding open cart: ${openCartError.message}`);
  }

  if (existingCart) {
    console.log(`[zapi-webhook] ✅ Found existing OPEN cart: ${existingCart.id} (${eventType})`);
    return existingCart;
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
  const today = new Date().toISOString().split('T')[0];

  console.log(`[zapi-webhook] 🔍 findOrCreateOrder - tenant: ${tenantId}, phone: ${phone}, cartId: ${cartId}, eventType: ${eventType}, date: ${today}`);

  // First, check ALL orders for this customer to debug
  const { data: allOrders, error: allOrdersError } = await supabase
    .from('orders')
    .select('id, is_paid, event_type, event_date, cart_id, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('created_at', { ascending: false })
    .limit(10);

  if (allOrdersError) {
    console.log(`[zapi-webhook] ❌ Error fetching all orders: ${allOrdersError.message}`);
  } else {
    console.log(`[zapi-webhook] 📋 Found ${allOrders?.length || 0} total orders for this phone:`);
    for (const o of allOrders || []) {
      console.log(`[zapi-webhook]   - Order ID: ${o.id}, Paid: ${o.is_paid}, Type: ${o.event_type}, Date: ${o.event_date}, CartID: ${o.cart_id}, Created: ${o.created_at}`);
    }
  }

  // Try to find existing unpaid order for today with same event type
  const { data: existingOrder, error: findError } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('event_date', today)
    .eq('is_paid', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.log(`[zapi-webhook] ❌ Error finding unpaid order: ${findError.message}`);
  }

  if (existingOrder) {
    console.log(`[zapi-webhook] ✅ Found existing unpaid order: ${existingOrder.id} (${eventType}), cart_id: ${existingOrder.cart_id}`);
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
    console.log(`[zapi-webhook] ℹ️ No existing unpaid order found - Will create a NEW order`);
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
