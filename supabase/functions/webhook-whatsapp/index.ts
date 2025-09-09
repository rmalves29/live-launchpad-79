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
    const webhookType = pathParts[pathParts.length - 2]; // 'incoming' or 'delivery'
    const tenantKey = pathParts[pathParts.length - 1];
    
    if (!tenantKey || !webhookType) {
      throw new Error('Tenant key and webhook type are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get tenant and integration config
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        id,
        integration_wpp (
          webhook_secret,
          instance_name,
          business_phone
        )
      `)
      .eq('tenant_key', tenantKey)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant || !tenant.integration_wpp) {
      console.log(`Tenant ${tenantKey} not found or no WhatsApp integration`);
      return new Response('Tenant not found or integration not configured', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Validate webhook secret
    const webhookSecret = req.headers.get('X-Webhook-Secret');
    if (webhookSecret !== tenant.integration_wpp.webhook_secret) {
      console.log('Invalid webhook secret');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    console.log(`WhatsApp ${webhookType} webhook for tenant ${tenantKey}:`, payload);

    // Log webhook
    await supabase
      .from('webhook_logs')
      .insert({
        tenant_id: tenant.id,
        webhook_type: `whatsapp_${webhookType}`,
        status_code: 200,
        payload: payload,
        response: 'Processed successfully'
      });

    // Process incoming message
    if (webhookType === 'incoming' && payload.from && payload.body) {
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

      // Process commands (like product codes)
      if (message.match(/^[A-Z]\d+$/)) { // Pattern like C123, P456
        const productCode = message.trim().toUpperCase();
        
        // Find product by code in this tenant
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('code', productCode)
          .eq('is_active', true)
          .single();

        if (product) {
          // Find or create customer
          let { data: customer } = await supabase
            .from('customers')
            .select('*')
            .eq('tenant_id', tenant.id)
            .eq('phone', phone)
            .single();

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
            .single();

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

            console.log(`Added product ${productCode} to cart for ${phone} in tenant ${tenantKey}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('WhatsApp webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})