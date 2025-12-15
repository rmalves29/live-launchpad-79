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

    console.log(`[zapi-webhook] Message: "${messageText}", From: ${senderPhone}, Group: ${groupName}, IsGroup: ${isGroup}`);

    // Recognize product codes (format: C followed by numbers, like C300, C111, etc.)
    const productCodeRegex = /\b[Cc](\d{1,4})\b/g;
    const matches = messageText.match(productCodeRegex);

    if (!matches || matches.length === 0) {
      console.log('[zapi-webhook] No product codes found in message');
      return new Response(JSON.stringify({ success: true, skipped: 'no_product_codes' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[zapi-webhook] Found product codes: ${matches.join(', ')}`);

    // Normalize phone number (remove country code if present)
    const normalizedPhone = normalizePhone(senderPhone);
    
    if (!normalizedPhone) {
      console.log('[zapi-webhook] Invalid phone number');
      return new Response(JSON.stringify({ success: false, error: 'invalid_phone' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find tenant by group (we need to identify which tenant this message belongs to)
    // First, try to find tenant by customer_whatsapp_groups
    let tenantId: string | null = null;
    
    if (groupName) {
      const { data: groupData } = await supabase
        .from('customer_whatsapp_groups')
        .select('tenant_id')
        .eq('whatsapp_group_name', groupName)
        .limit(1)
        .single();
      
      if (groupData) {
        tenantId = groupData.tenant_id;
        console.log(`[zapi-webhook] Found tenant by group name: ${tenantId}`);
      }
    }

    // If not found by group, try to find by customer phone
    if (!tenantId) {
      const { data: customerData } = await supabase
        .from('customers')
        .select('tenant_id')
        .eq('phone', normalizedPhone)
        .limit(1)
        .single();
      
      if (customerData) {
        tenantId = customerData.tenant_id;
        console.log(`[zapi-webhook] Found tenant by customer phone: ${tenantId}`);
      }
    }

    // If still not found, try to find active tenant with WhatsApp integration
    if (!tenantId) {
      const { data: integrationData } = await supabase
        .from('integration_whatsapp')
        .select('tenant_id')
        .eq('provider', 'zapi')
        .eq('is_active', true)
        .limit(1)
        .single();
      
      if (integrationData) {
        tenantId = integrationData.tenant_id;
        console.log(`[zapi-webhook] Using first active Z-API tenant: ${tenantId}`);
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
    for (const codeMatch of matches) {
      const code = codeMatch.toUpperCase();
      
      // Find product by code
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('code', code)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (productError || !product) {
        console.log(`[zapi-webhook] Product not found: ${code}`);
        results.push({ code, success: false, error: 'product_not_found' });
        continue;
      }

      console.log(`[zapi-webhook] Found product: ${product.name} (${code}) - R$ ${product.price}`);

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
  
  // Ensure we have at least 10 digits (DDD + number)
  if (clean.length < 10) return '';
  
  // Apply regional ninth digit rule
  const ddd = parseInt(clean.substring(0, 2));
  let number = clean.substring(2);
  
  // DDDs 11-30: should have 9 digits (add 9 if missing)
  // DDDs 31+: should have 8 digits (remove 9 if present)
  if (ddd >= 11 && ddd <= 30) {
    if (number.length === 8) {
      number = '9' + number;
    }
  } else if (ddd >= 31) {
    if (number.length === 9 && number.startsWith('9')) {
      number = number.substring(1);
    }
  }
  
  return clean.substring(0, 2) + number;
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
  // Try to find an open cart for this customer with same event type
  const { data: existingCart } = await supabase
    .from('carts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .eq('event_type', eventType)
    .eq('status', 'OPEN')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existingCart) {
    console.log(`[zapi-webhook] Found existing cart: ${existingCart.id} (${eventType})`);
    return existingCart;
  }

  // Create new cart with correct event type
  const today = new Date().toISOString().split('T')[0];
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
    console.log('[zapi-webhook] Error creating cart:', error);
    throw error;
  }

  console.log(`[zapi-webhook] Created new cart: ${newCart.id} (${eventType})`);
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

  // Try to find existing unpaid order for today with same event type
  const { data: existingOrder } = await supabase
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

  if (existingOrder) {
    console.log(`[zapi-webhook] Found existing order: ${existingOrder.id} (${eventType})`);
    // Update cart_id if needed
    if (existingOrder.cart_id !== cartId) {
      await supabase
        .from('orders')
        .update({ cart_id: cartId })
        .eq('id', existingOrder.id);
    }
    return existingOrder;
  }

  // Create new order with correct event type
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
    console.log('[zapi-webhook] Error creating order:', error);
    throw error;
  }

  console.log(`[zapi-webhook] Created new order: ${newOrder.id} (${eventType})`);
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
