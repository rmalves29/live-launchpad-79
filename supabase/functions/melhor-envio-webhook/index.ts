import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Responder 200 para o "teste" do ME (pode ser GET)
  if (req.method === "GET") {
    return new Response("ok", { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }

  if (req.method === "POST") {
    try {
      const payload = await req.json().catch(() => ({}));

      // opcional: ler tenant_id da query
      const url = new URL(req.url);
      const tenantId = url.searchParams.get("tenant_id") ?? null;

      console.log('ME Webhook received:', JSON.stringify(payload, null, 2));

      // log no banco
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        await supabase.from("webhook_logs").insert({
          webhook_type: "melhor_envio",
          payload,
          tenant_id: tenantId,
          status_code: 200,
          response: 'Processed successfully',
          created_at: new Date().toISOString()
        });

        // Process tracking updates if needed
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
          }
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
      }

      return new Response("ok", { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      return new Response("ok", { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    }
  }

  // Qualquer outro método: ainda responda 200 para não quebrar o teste
  return new Response("ok", { 
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
  });
});