import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de transportadoras para service_id do Melhor Envio
const CARRIER_SERVICE_MAP: Record<string, number> = {
  'pac': 1,
  'sedex': 2,
  'jadlog': 3,
  '.package': 3,
  'jadlog .package': 3,
  'jadlog - .package': 3,
  'jadlog - .package centralizado': 3,
  '.com': 4,
  'jadlog .com': 4,
  'jadlog - .com': 4,
  'mini envios': 17,
};

// Detectar transportadora do observation
function extractCarrierFromObservation(observation: string | null): { carrier: string; serviceId: number | null } {
  if (!observation) return { carrier: 'desconhecido', serviceId: null };
  
  const obs = observation.toLowerCase();
  
  // Detectar Jadlog
  if (obs.includes('jadlog')) {
    if (obs.includes('.com')) {
      return { carrier: 'Jadlog .Com', serviceId: 4 };
    }
    return { carrier: 'Jadlog .Package', serviceId: 3 };
  }
  
  // Detectar Correios
  if (obs.includes('sedex')) {
    return { carrier: 'SEDEX', serviceId: 2 };
  }
  if (obs.includes('pac') && !obs.includes('.package')) {
    return { carrier: 'PAC', serviceId: 1 };
  }
  
  // Frete fixo/customizado - usar Jadlog como padrão
  if (obs.includes('frete fixo') || obs.includes('frete customizado')) {
    return { carrier: 'Frete Fixo → Jadlog', serviceId: 3 };
  }
  
  // Retirada - não precisa de remessa
  if (obs.includes('retirada')) {
    return { carrier: 'Retirada', serviceId: null };
  }
  
  // Frete grátis - verificar se tem outra transportadora
  if (obs.includes('frete grátis') || obs.includes('frete gratis')) {
    return { carrier: 'Frete Grátis', serviceId: null };
  }
  
  return { carrier: 'desconhecido', serviceId: null };
}

// Verificar se precisa correção (não é Correios e tem remessa criada)
function needsCorrection(observation: string | null): boolean {
  if (!observation) return false;
  const obs = observation.toLowerCase();
  
  // NÃO corrigir se for Correios (PAC/SEDEX)
  if (obs.includes('sedex') || (obs.includes('pac') && !obs.includes('.package'))) {
    return false;
  }
  
  // NÃO corrigir se for retirada (não precisa de remessa)
  if (obs.includes('retirada')) {
    return false; // Poderia marcar para limpar, mas vamos ignorar por ora
  }
  
  // Corrigir se for Jadlog ou Frete Fixo
  if (obs.includes('jadlog') || obs.includes('frete fixo') || obs.includes('frete customizado')) {
    return true;
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, tenantId, dryRun = true } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'tenantId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar integração do Melhor Envio
    const { data: integration } = await sb
      .from('shipping_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'melhor_envio')
      .eq('is_active', true)
      .single();

    if (!integration) {
      return new Response(
        JSON.stringify({ error: 'Melhor Envio integration not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar pedidos com remessa criada mas sem tracking (ainda não comprados)
    const { data: orders, error: ordersError } = await sb
      .from('orders')
      .select('id, customer_name, observation, melhor_envio_shipment_id, melhor_envio_tracking_code')
      .eq('tenant_id', tenantId)
      .not('melhor_envio_shipment_id', 'is', null)
      .is('melhor_envio_tracking_code', null)
      .order('id', { ascending: false });

    if (ordersError) {
      throw new Error(`Error fetching orders: ${ordersError.message}`);
    }

    const results: any[] = [];
    let corrected = 0;
    let skipped = 0;
    let errors = 0;

    for (const order of orders || []) {
      const { carrier, serviceId } = extractCarrierFromObservation(order.observation);
      const shouldCorrect = needsCorrection(order.observation);

      if (!shouldCorrect) {
        skipped++;
        results.push({
          orderId: order.id,
          customer: order.customer_name,
          observation: order.observation?.substring(0, 80),
          carrier,
          action: 'SKIP',
          reason: 'Correios ou não precisa de correção'
        });
        continue;
      }

      if (!serviceId) {
        skipped++;
        results.push({
          orderId: order.id,
          customer: order.customer_name,
          observation: order.observation?.substring(0, 80),
          carrier,
          action: 'SKIP',
          reason: 'Service ID não determinado'
        });
        continue;
      }

      if (dryRun) {
        results.push({
          orderId: order.id,
          customer: order.customer_name,
          observation: order.observation?.substring(0, 80),
          carrier,
          targetServiceId: serviceId,
          action: 'WOULD_FIX',
          currentShipmentId: order.melhor_envio_shipment_id
        });
        corrected++;
        continue;
      }

      // === EXECUÇÃO REAL ===
      try {
        // 1. Cancelar remessa antiga no Melhor Envio
        const cancelUrl = `https://melhorenvio.com.br/api/v2/me/shipment/cancel`;
        const cancelResponse = await fetch(cancelUrl, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${integration.access_token}`,
            'User-Agent': 'Bazar da Roeh (contato@bazardaroeh.com.br)'
          },
          body: JSON.stringify({
            orders: [order.melhor_envio_shipment_id]
          })
        });

        const cancelData = await cancelResponse.json();
        console.log(`[fix-shipments] Order ${order.id}: Cancel response:`, cancelData);

        // 2. Limpar campos no banco
        await sb
          .from('orders')
          .update({
            melhor_envio_shipment_id: null,
            melhor_envio_tracking_code: null,
            shipping_service_id: serviceId
          })
          .eq('id', order.id);

        // 3. Chamar a função melhor-envio-labels para criar nova remessa
        const labelsUrl = `${supabaseUrl}/functions/v1/melhor-envio-labels`;
        const createResponse = await fetch(labelsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`
          },
          body: JSON.stringify({
            action: 'create_shipment',
            orderId: order.id,
            tenantId: tenantId,
            overrideServiceId: serviceId
          })
        });

        const createData = await createResponse.json();
        console.log(`[fix-shipments] Order ${order.id}: Create response:`, createData);

        if (createData.error) {
          throw new Error(createData.error);
        }

        corrected++;
        results.push({
          orderId: order.id,
          customer: order.customer_name,
          carrier,
          targetServiceId: serviceId,
          action: 'FIXED',
          newShipmentId: createData.shipmentId
        });

        // Delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err: any) {
        errors++;
        results.push({
          orderId: order.id,
          customer: order.customer_name,
          carrier,
          action: 'ERROR',
          error: err.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun,
        summary: {
          total: orders?.length || 0,
          corrected,
          skipped,
          errors
        },
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[fix-shipments] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
