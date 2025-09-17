import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract tenant key from URL
    const url = new URL(req.url);
    const tenantKey = url.searchParams.get('tenant_key');
    
    console.log('ME Webhook for tenant:', tenantKey);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tenant and integration
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        *,
        integration_me (*)
      `)
      .eq('tenant_key', tenantKey)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant || !tenant.integration_me?.[0]) {
      console.error('Tenant or ME integration not found:', tenantError);
      return new Response('Tenant not found', { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    const integration = tenant.integration_me[0];
    
    // Validate webhook secret
    const webhookSecret = req.headers.get('x-webhook-secret');
    if (!webhookSecret || webhookSecret !== integration.webhook_secret) {
      console.error('Invalid webhook secret');
      return new Response('Unauthorized', { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    // Parse webhook payload
    const payload = await req.json();
    console.log('ME Webhook payload:', JSON.stringify(payload, null, 2));

    // Log webhook to database
    await supabase.from('webhook_logs').insert({
      tenant_id: tenant.id,
      webhook_type: 'melhor_envio',
      status_code: 200,
      payload: payload,
      response: 'Processed successfully',
      created_at: new Date().toISOString()
    });

    // Process tracking updates
    if (payload.resource === 'tracking' && payload.topic === 'tracking') {
      const trackingData = payload.data;
      
      if (trackingData?.order_id && trackingData?.status) {
        // Update frete_envios with tracking info
        const { error: updateError } = await supabase
          .from('frete_envios')
          .update({
            status: trackingData.status,
            tracking_code: trackingData.tracking_code || null,
            raw_response: { 
              ...trackingData,
              webhook_received_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('shipment_id', trackingData.order_id);

        if (updateError) {
          console.error('Error updating tracking:', updateError);
        } else {
          console.log('Tracking updated for order:', trackingData.order_id);
        }

        // Log tracking update
        await supabase.from('webhook_logs').insert({
          tenant_id: tenant.id,
          webhook_type: 'melhor_envio_tracking',
          status_code: 200,
          payload: trackingData,
          response: `Tracking updated: ${trackingData.status}`,
          created_at: new Date().toISOString()
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Webhook processed successfully' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in ME webhook:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});