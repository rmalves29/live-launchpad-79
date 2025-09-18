import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-me-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Função para validar assinatura HMAC-SHA256 do Melhor Envio
async function validateSignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const hmac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(hmac)));
    
    return computedSignature === signature;
  } catch (error) {
    console.error('Error validating signature:', error);
    return false;
  }
}

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
      const body = await req.text();
      const payload = JSON.parse(body);

      // Ler tenant_id da query e headers
      const url = new URL(req.url);
      const tenantId = url.searchParams.get("tenant_id") ?? null;
      const signature = req.headers.get("x-me-signature");

      console.log('ME Webhook received:', JSON.stringify(payload, null, 2));
      console.log('Headers:', Object.fromEntries(req.headers.entries()));

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Validar assinatura HMAC se fornecida
      let signatureValid = true;
      if (signature && tenantId) {
        try {
          // Buscar o client_secret do aplicativo para validar a assinatura
          const { data: integration } = await supabase
            .from('integration_me')
            .select('client_secret')
            .eq('tenant_id', tenantId)
            .single();

          if (integration?.client_secret) {
            signatureValid = await validateSignature(body, signature, integration.client_secret);
            console.log('Signature validation:', signatureValid ? 'VALID' : 'INVALID');
          } else {
            console.log('No client_secret found for signature validation');
          }
        } catch (sigError) {
          console.error('Signature validation error:', sigError);
          signatureValid = false;
        }
      }

      // Log no banco
      await supabase.from("webhook_logs").insert({
        webhook_type: "melhor_envio",
        payload,
        tenant_id: tenantId,
        status_code: 200,
        response: signatureValid ? 'Processed successfully' : 'Invalid signature',
        created_at: new Date().toISOString()
      });

      // Processar eventos do Melhor Envio apenas se a assinatura for válida
      if (signatureValid && payload.event && payload.data) {
        const eventType = payload.event;
        const eventData = payload.data;

        console.log(`Processing ME event: ${eventType}`);

        // Mapear eventos específicos do Melhor Envio para status internos
        const statusMapping: Record<string, string> = {
          'order.created': 'created',
          'order.pending': 'pending',
          'order.released': 'paid',
          'order.generated': 'generated',
          'order.received': 'received',
          'order.posted': 'posted',
          'order.delivered': 'delivered',
          'order.cancelled': 'cancelled',
          'order.undelivered': 'undelivered',
          'order.paused': 'paused',
          'order.suspended': 'suspended'
        };

        const internalStatus = statusMapping[eventType] || eventType;

        // Atualizar frete_envios com base no protocol/id do ME
        if (eventData.id || eventData.protocol) {
          const updateData = {
            status: internalStatus,
            raw_response: { 
              ...eventData,
              webhook_event: eventType,
              webhook_received_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          };

          // Adicionar campos específicos baseados no evento
          if (eventData.tracking) {
            updateData['tracking_code'] = eventData.tracking;
          }
          if (eventData.tracking_url) {
            updateData['tracking_url'] = eventData.tracking_url;
          }

          const { error: updateError } = await supabase
            .from('frete_envios')
            .update(updateData)
            .or(`shipment_id.eq.${eventData.id},me_protocol.eq.${eventData.protocol}`);

          if (updateError) {
            console.error('Error updating shipping:', updateError);
          } else {
            console.log(`Shipping updated for ${eventType}:`, eventData.id || eventData.protocol);
          }
        }
      }

      return new Response("ok", { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      
      // Sempre retornar 200 para evitar retentativas desnecessárias
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