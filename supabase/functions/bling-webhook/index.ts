import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bling-signature',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with retry for Bling rate limits (429)
 */
async function blingFetchWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3
): Promise<{ response: Response; text: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (res.status !== 429 || attempt === maxAttempts) {
      return { response: res, text };
    }
    const waitMs = Math.round(700 * Math.pow(2, attempt - 1));
    console.log(`[bling-webhook] Rate limited (429). Retry ${attempt}/${maxAttempts} in ${waitMs}ms`);
    await delay(waitMs);
  }
  throw new Error('Unreachable');
}

/**
 * Refresh Bling token if needed
 */
async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const now = new Date();
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      console.log('[bling-webhook] Token expired or expiring, refreshing...');
      if (!integration.refresh_token || !integration.client_id || !integration.client_secret) return null;
      try {
        const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);
        const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: integration.refresh_token,
          }),
        });
        if (!response.ok) return null;
        const tokenData = await response.json();
        await supabase.from('integration_bling').update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('tenant_id', integration.tenant_id);
        return tokenData.access_token;
      } catch (e) {
        console.error('[bling-webhook] Token refresh error:', e);
        return null;
      }
    }
  }
  return integration.access_token;
}

/**
 * Fetch full order details from Bling and extract tracking info
 */
async function fetchBlingOrderTracking(
  blingOrderId: number,
  accessToken: string
): Promise<{ trackingCode: string | null; carrier: string | null }> {
  try {
    const { response, text } = await blingFetchWithRetry(
      `${BLING_API_URL}/pedidos/vendas/${blingOrderId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.log(`[bling-webhook] Could not fetch Bling order ${blingOrderId}: ${response.status}`);
      return { trackingCode: null, carrier: null };
    }

    const blingOrder = JSON.parse(text);
    const transporte = blingOrder?.data?.transporte;
    const volumes = transporte?.volumes || [];

    // Extract tracking code from volumes
    let trackingCode: string | null = null;
    for (const volume of volumes) {
      if (volume?.codigoRastreamento) {
        trackingCode = volume.codigoRastreamento;
        break;
      }
    }

    // Extract carrier name
    const carrier = transporte?.transportador || transporte?.nomeTransportador || null;

    return { trackingCode, carrier };
  } catch (e) {
    console.error(`[bling-webhook] Error fetching order ${blingOrderId} details:`, e);
    return { trackingCode: null, carrier: null };
  }
}

/**
 * Trigger WhatsApp tracking notification
 */
async function sendTrackingWhatsApp(
  orderId: number,
  tenantId: string,
  trackingCode: string
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const res = await fetch(`${supabaseUrl}/functions/v1/zapi-send-tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        order_id: orderId,
        tenant_id: tenantId,
        tracking_code: trackingCode,
        shipped_at: new Date().toISOString(),
      }),
    });

    if (res.ok) {
      console.log(`[bling-webhook] ✅ WhatsApp tracking sent for order ${orderId}`);
    } else {
      const errText = await res.text();
      console.error(`[bling-webhook] ❌ WhatsApp tracking failed for order ${orderId}: ${errText}`);
    }
  } catch (e) {
    console.error(`[bling-webhook] ❌ WhatsApp tracking error for order ${orderId}:`, e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    
    console.log('[bling-webhook] Received webhook:', JSON.stringify(body, null, 2));

    // Log webhook for debug
    await supabase.from('webhook_logs').insert({
      webhook_type: 'bling',
      status_code: 200,
      payload: body,
    });

    // Bling v3 webhook format: { evento, data: { id, ... } }
    // Legacy format: { retorno: { pedidos: [...] } }
    const event = body?.retorno || body?.data || body;
    const eventType = body?.evento || body?.event || 'unknown';

    console.log(`[bling-webhook] Event type: ${eventType}`);

    // Process order events
    if (
      eventType === 'pedido.atualizado' || 
      eventType === 'pedido.criado' || 
      eventType === 'order.updated' ||
      eventType === 'order.created' ||
      body?.retorno?.pedidos
    ) {
      const pedidos = body?.retorno?.pedidos || [event];
      
      for (const pedido of pedidos) {
        const blingOrderId = pedido?.pedido?.id || pedido?.id;
        const numeroLoja = pedido?.pedido?.numeroLoja || pedido?.numeroLoja;
        const situacao = pedido?.pedido?.situacao || pedido?.situacao;
        
        // Also check for tracking info directly in webhook payload
        const webhookTrackingCode = 
          pedido?.codigoRastreio || 
          pedido?.pedido?.codigoRastreio || 
          pedido?.transporte?.codigoRastreamento ||
          pedido?.pedido?.transporte?.codigoRastreamento ||
          null;
        const webhookCarrier = 
          pedido?.transportadora || 
          pedido?.pedido?.transportadora ||
          pedido?.transporte?.transportador ||
          null;

        if (!blingOrderId) {
          console.log('[bling-webhook] No order ID found in event');
          continue;
        }

        console.log(`[bling-webhook] Processing order: blingId=${blingOrderId}, numeroLoja=${numeroLoja}, situacao=${situacao?.id || situacao}, webhookTracking=${webhookTrackingCode}, carrier=${webhookCarrier}`);

        // Find local order by bling_order_id or numeroLoja
        let localOrder = null;
        
        const { data: orderByBlingId } = await supabase
          .from('orders')
          .select('*')
          .eq('bling_order_id', blingOrderId)
          .maybeSingle();
        
        if (orderByBlingId) {
          localOrder = orderByBlingId;
        } else if (numeroLoja) {
          // Try by numeroLoja - handle OZ- prefix
          const cleanNumero = String(numeroLoja).replace(/^OZ-/i, '');
          const { data: orderByNumero } = await supabase
            .from('orders')
            .select('*')
            .eq('id', parseInt(cleanNumero))
            .maybeSingle();
          
          if (orderByNumero) {
            localOrder = orderByNumero;
            if (!orderByNumero.bling_order_id) {
              await supabase
                .from('orders')
                .update({ bling_order_id: blingOrderId })
                .eq('id', orderByNumero.id);
            }
          }
        }

        if (!localOrder) {
          console.log(`[bling-webhook] Order not found locally: blingId=${blingOrderId}, numeroLoja=${numeroLoja}`);
          continue;
        }

        // Map Bling status to local updates
        // Bling: 0=Em aberto, 6=Em andamento, 9=Atendido, 12=Cancelado
        const situacaoId = typeof situacao === 'object' ? situacao?.id : situacao;
        
        let updates: Record<string, any> = {};
        let shouldFetchTracking = false;
        
        switch (situacaoId) {
          case 9: // Atendido (completed/shipped)
            shouldFetchTracking = true;
            console.log(`[bling-webhook] Order ${localOrder.id} marked as Atendido - will fetch tracking`);
            break;
          case 12: // Cancelado
            updates.is_cancelled = true;
            console.log(`[bling-webhook] Order ${localOrder.id} cancelled in Bling`);
            break;
          default:
            console.log(`[bling-webhook] Order ${localOrder.id} status: ${situacaoId}`);
            // Still check for tracking on any status change
            if (webhookTrackingCode) {
              shouldFetchTracking = true;
            }
        }

        // Try to get tracking code: first from webhook payload, then from Bling API
        let trackingCode = webhookTrackingCode;
        let carrier = webhookCarrier;

        if (shouldFetchTracking || situacaoId === 9) {
          // If no tracking in payload, fetch from Bling API
          if (!trackingCode) {
            // Get Bling integration for this tenant to get access token
            const { data: blingIntegration } = await supabase
              .from('integration_bling')
              .select('*')
              .eq('tenant_id', localOrder.tenant_id)
              .eq('is_active', true)
              .maybeSingle();

            if (blingIntegration) {
              const accessToken = await getValidAccessToken(supabase, blingIntegration);
              if (accessToken) {
                const blingData = await fetchBlingOrderTracking(blingOrderId, accessToken);
                trackingCode = blingData.trackingCode;
                carrier = carrier || blingData.carrier;
              }
            } else {
              console.log(`[bling-webhook] No active Bling integration for tenant ${localOrder.tenant_id}`);
            }
          }

          // Update tracking code if found and different from existing
          if (trackingCode && trackingCode !== localOrder.melhor_envio_tracking_code) {
            updates.melhor_envio_tracking_code = trackingCode;
            console.log(`[bling-webhook] ✅ Tracking code captured for order ${localOrder.id}: ${trackingCode} (carrier: ${carrier || 'unknown'})`);
          } else if (trackingCode) {
            console.log(`[bling-webhook] Order ${localOrder.id} already has tracking: ${trackingCode}`);
          } else {
            console.log(`[bling-webhook] No tracking code found for order ${localOrder.id} (will be synced later)`);
          }
        }

        // Apply updates
        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', localOrder.id);
          
          if (updateError) {
            console.error(`[bling-webhook] Error updating order ${localOrder.id}:`, updateError);
          } else {
            console.log(`[bling-webhook] Updated order ${localOrder.id}:`, updates);

            // Send WhatsApp tracking notification if new tracking code was added
            if (
              updates.melhor_envio_tracking_code && 
              !localOrder.melhor_envio_tracking_code
            ) {
              await sendTrackingWhatsApp(
                localOrder.id,
                localOrder.tenant_id,
                updates.melhor_envio_tracking_code
              );
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bling-webhook] Error:', error);
    
    await supabase.from('webhook_logs').insert({
      webhook_type: 'bling',
      status_code: 500,
      error_message: error.message,
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
