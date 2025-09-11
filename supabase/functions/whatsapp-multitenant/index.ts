import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
      const phone = payload.from;
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
        number: phone,
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