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
    const tenantKey = url.pathname.split('/').pop();
    
    if (!tenantKey) {
      throw new Error('Tenant key is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get tenant and integration config
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        id,
        integration_mp (
          webhook_secret,
          access_token
        )
      `)
      .eq('tenant_key', tenantKey)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant || !tenant.integration_mp) {
      console.log(`Tenant ${tenantKey} not found or no MP integration`);
      return new Response('Tenant not found or integration not configured', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Validate webhook secret
    const webhookSecret = req.headers.get('X-Webhook-Secret');
    if (webhookSecret !== tenant.integration_mp.webhook_secret) {
      console.log('Invalid webhook secret');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    console.log(`MercadoPago webhook for tenant ${tenantKey}:`, payload);

    // Log webhook
    await supabase
      .from('webhook_logs')
      .insert({
        tenant_id: tenant.id,
        webhook_type: 'mercadopago',
        status_code: 200,
        payload: payload,
        response: 'Processed successfully'
      });

    // Process payment notification
    if (payload.type === 'payment' && payload.action === 'payment.updated') {
      const paymentId = payload.data?.id;
      
      if (paymentId) {
        // Here you would typically:
        // 1. Fetch payment details from MercadoPago API
        // 2. Update order status in your database
        // 3. Send notifications via WhatsApp
        
        console.log(`Processing payment ${paymentId} for tenant ${tenantKey}`);
        
        // For now, just log it
        await supabase
          .from('webhook_logs')
          .insert({
            tenant_id: tenant.id,
            webhook_type: 'mercadopago_payment',
            status_code: 200,
            payload: { payment_id: paymentId },
            response: `Payment ${paymentId} processed`
          });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('MercadoPago webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})