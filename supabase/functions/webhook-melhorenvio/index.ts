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
        integration_me (
          webhook_secret,
          access_token
        )
      `)
      .eq('tenant_key', tenantKey)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant || !tenant.integration_me) {
      console.log(`Tenant ${tenantKey} not found or no Melhor Envio integration`);
      return new Response('Tenant not found or integration not configured', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Validate webhook secret
    const webhookSecret = req.headers.get('X-Webhook-Secret');
    if (webhookSecret !== tenant.integration_me.webhook_secret) {
      console.log('Invalid webhook secret');
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const payload = await req.json();
    console.log(`Melhor Envio webhook for tenant ${tenantKey}:`, payload);

    // Log webhook
    await supabase
      .from('webhook_logs')
      .insert({
        tenant_id: tenant.id,
        webhook_type: 'melhorenvio',
        status_code: 200,
        payload: payload,
        response: 'Processed successfully'
      });

    // Process tracking updates
    if (payload.resource === 'tracking' && payload.topic === 'tracking') {
      const trackingCode = payload.id;
      const status = payload.status;
      
      if (trackingCode) {
        // Update frete_envios table
        await supabase
          .from('frete_envios')
          .update({
            status: status,
            raw_response: payload,
            updated_at: new Date().toISOString()
          })
          .eq('tenant_id', tenant.id)
          .eq('tracking_code', trackingCode);

        console.log(`Updated tracking ${trackingCode} status to ${status} for tenant ${tenantKey}`);
        
        // Log the tracking update
        await supabase
          .from('webhook_logs')
          .insert({
            tenant_id: tenant.id,
            webhook_type: 'melhorenvio_tracking',
            status_code: 200,
            payload: { tracking_code: trackingCode, status: status },
            response: `Tracking updated to ${status}`
          });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Melhor Envio webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})