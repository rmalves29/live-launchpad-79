import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Normaliza número para armazenamento no banco (sem DDI)
 * Entrada: 5531992904210 ou 31992904210 ou 31 99290-4210
 * Saída: 31992904210 (DDD + número com/sem 9º dígito baseado no DDD)
 */
function normalizeForStorage(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Remove DDI 55 se presente
  let phoneWithoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  // Validação: deve ter entre 10 e 11 dígitos após remoção do DDI
  if (phoneWithoutDDI.length < 10 || phoneWithoutDDI.length > 11) {
    console.warn(`Número de telefone inválido (${phoneWithoutDDI.length} dígitos): ${phone} -> ${phoneWithoutDDI}`);
    return phone; // Retorna original se inválido para depuração
  }
  
  // Validar se DDD é válido (11-99)
  const ddd = parseInt(phoneWithoutDDI.substring(0, 2));
  if (ddd < 11 || ddd > 99) {
    console.warn(`DDD inválido: ${ddd} no número ${phone}`);
    return phone; // Retorna original se DDD inválido
  }
  
  const restOfNumber = phoneWithoutDDI.substring(2);
  
  // Normalização do 9º dígito baseado no DDD
  if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
    // DDD < 31: adiciona 9 se não tiver e tiver 8 dígitos
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + '9' + phoneWithoutDDI.substring(2);
  } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
    // DDD >= 31: remove 9 se tiver e tiver 9 dígitos
    phoneWithoutDDI = phoneWithoutDDI.substring(0, 2) + phoneWithoutDDI.substring(3);
  }
  
  return phoneWithoutDDI;
}

/**
 * Normaliza número para envio de mensagens (com DDI)
 * Entrada: 31992904210 ou 5531992904210
 * Saída: 5531992904210 (DDI 55 + DDD + número com/sem 9º dígito baseado no DDD)
 */
function normalizeForSending(phone: string): string {
  if (!phone) return phone;
  
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Adiciona DDI 55 se não tiver
  let normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  
  if (normalizedPhone.length >= 4) {
    const ddd = parseInt(normalizedPhone.substring(2, 4));
    const restOfNumber = normalizedPhone.substring(4);
    
    // Normalização do 9º dígito baseado no DDD
    if (ddd < 31 && !restOfNumber.startsWith('9') && restOfNumber.length === 8) {
      // DDD < 31: adiciona 9 se não tiver e tiver 8 dígitos
      normalizedPhone = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
    } else if (ddd >= 31 && restOfNumber.startsWith('9') && restOfNumber.length === 9) {
      // DDD >= 31: remove 9 se tiver e tiver 9 dígitos
      normalizedPhone = normalizedPhone.substring(0, 4) + normalizedPhone.substring(5);
    }
  }
  
  return normalizedPhone;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const tenantSlug = pathParts[pathParts.length - 1]; // tenant slug from URL
    
    if (!tenantSlug) {
      throw new Error('Tenant slug is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get tenant by slug
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('slug', tenantSlug)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant) {
      console.log(`Tenant ${tenantSlug} not found or inactive`);
      return new Response('Tenant not found', { status: 404, headers: corsHeaders });
    }

    const payload = await req.json();
    console.log(`WhatsApp message for tenant ${tenantSlug}:`, payload);

    // Log webhook
    await supabase
      .from('webhook_logs')
      .insert({
        tenant_id: tenant.id,
        webhook_type: 'whatsapp_incoming',
        status_code: 200,
        payload: payload,
        response: 'Processed successfully'
      });

    // Process incoming message for product detection
    if (payload.from && payload.body) {
      const phone = normalizeForStorage(payload.from);
      console.log(`Normalized phone: ${payload.from} -> ${phone}`);
      const message = payload.body;
      
      // Store message in whatsapp_messages table
      await supabase
        .from('whatsapp_messages')
        .insert({
          tenant_id: tenant.id,
          phone: phone,
          message: message,
          type: 'received',
          received_at: new Date().toISOString()
        });

      // Process product codes with enhanced detection
      {
        const text = String(message || '').trim().toUpperCase();
        const match = text.match(/^(?:[CPA]\s*)?(\d{1,6})$/);
        if (match) {
          const numeric = match[1];
          const candidates = [`C${numeric}`, `P${numeric}`, `A${numeric}`, numeric];

          const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('tenant_id', tenant.id)
            .in('code', candidates)
            .eq('is_active', true)
            .maybeSingle();

          if (product) {
            // Find or create customer
            let { data: customer } = await supabase
              .from('customers')
              .select('*')
              .eq('tenant_id', tenant.id)
              .eq('phone', phone)
              .maybeSingle();

            if (!customer) {
              const { data: newCustomer } = await supabase
                .from('customers')
                .insert({
                  tenant_id: tenant.id,
                  phone: phone,
                  name: phone // Temporary name, can be updated later
                })
                .select()
                .single();
              customer = newCustomer;
            }

            // Find or create open cart for today
            const today = new Date().toISOString().split('T')[0];
            let { data: cart } = await supabase
              .from('carts')
              .select('*')
              .eq('tenant_id', tenant.id)
              .eq('customer_phone', phone)
              .eq('event_date', today)
              .eq('status', 'OPEN')
              .maybeSingle();

            if (!cart) {
              const { data: newCart } = await supabase
                .from('carts')
                .insert({
                  tenant_id: tenant.id,
                  customer_phone: phone,
                  event_date: today,
                  event_type: 'whatsapp',
                  status: 'OPEN'
                })
                .select()
                .single();
              cart = newCart;
            }

            // Add item to cart
            if (cart) {
              await supabase
                .from('cart_items')
                .insert({
                  tenant_id: tenant.id,
                  cart_id: cart.id,
                  product_id: product.id,
                  qty: 1,
                  unit_price: product.price
                });

              console.log(`Added product ${product.code} to cart for ${phone} in tenant ${tenantSlug}`);

              // Send automatic message using template
              await sendProductAddedMessage(supabase, tenant.id, phone, product);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('WhatsApp multitenant webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})

async function sendProductAddedMessage(supabase: any, tenantId: string, phone: string, product: any) {
  try {
    // Get WhatsApp integration for this tenant
    const { data: integration } = await supabase
      .from('integration_whatsapp')
      .select('api_url, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (!integration?.api_url) {
      console.log('No WhatsApp integration configured for tenant');
      return;
    }

    // Get template for item added
    const { data: template } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenantId)
      .eq('type', 'ITEM_ADDED')
      .maybeSingle();

    let messageText;
    if (template) {
      // Replace template variables
      messageText = template.content
        .replace(/{{produto}}/g, product.name || 'Produto')
        .replace(/{{quantidade}}/g, '1')
        .replace(/{{preco}}/g, `R$ ${Number(product.price || 0).toFixed(2).replace('.', ',')}`)
        .replace(/{{total}}/g, `R$ ${Number(product.price || 0).toFixed(2).replace('.', ',')}`)
        .replace(/{{codigo}}/g, product.code || '')
        .replace(/{{customer_name}}/g, 'Cliente');
    } else {
      // Fallback message
      const productCode = product.code ? ` (${product.code})` : '';
      const price = `R$ ${Number(product.price || 0).toFixed(2).replace('.', ',')}`;
      messageText = `🛒 *Item adicionado ao pedido*\n\n✅ ${product.name}${productCode}\nQtd: *1*\nPreço: *${price}*`;
    }

    // Send message via WhatsApp server
    const whatsappUrl = integration.api_url.endsWith('/') 
      ? integration.api_url + 'send' 
      : integration.api_url + '/send';

    const response = await fetch(whatsappUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: normalizeForSending(phone),
        message: messageText
      })
    });

    if (response.ok) {
      console.log(`Sent confirmation message to ${phone} for product ${product.code}`);
    } else {
      console.error(`Failed to send message: ${response.status}`);
    }
  } catch (error) {
    console.error('Error sending confirmation message:', error);
  }
}