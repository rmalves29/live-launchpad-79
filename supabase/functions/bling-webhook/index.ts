import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bling-signature',
};

const BLING_API_URL = 'https://www.bling.com.br/Api/v3';

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

    // Log do webhook para debug
    await supabase.from('webhook_logs').insert({
      webhook_type: 'bling',
      status_code: 200,
      payload: body,
    });

    // Bling envia eventos em diferentes formatos dependendo do callback
    // Formato típico: { retorno: { pedidos: [...] } } ou { data: { ... } }
    const event = body?.retorno || body?.data || body;
    const eventType = body?.evento || body?.event || 'unknown';

    console.log(`[bling-webhook] Event type: ${eventType}`);

    // Processar diferentes tipos de eventos
    if (eventType === 'pedido.atualizado' || eventType === 'pedido.criado' || body?.retorno?.pedidos) {
      const pedidos = body?.retorno?.pedidos || [event];
      
      for (const pedido of pedidos) {
        const blingOrderId = pedido?.pedido?.id || pedido?.id;
        const numeroLoja = pedido?.pedido?.numeroLoja || pedido?.numeroLoja;
        const situacao = pedido?.pedido?.situacao || pedido?.situacao;
        
        if (!blingOrderId) {
          console.log('[bling-webhook] No order ID found in event');
          continue;
        }

        console.log(`[bling-webhook] Processing order: blingId=${blingOrderId}, numeroLoja=${numeroLoja}, situacao=${situacao?.id || situacao}`);

        // Tentar encontrar o pedido local pelo bling_order_id ou pelo numeroLoja (que é nosso order.id)
        let localOrder = null;
        
        // Primeiro, tenta pelo bling_order_id
        const { data: orderByBlingId } = await supabase
          .from('orders')
          .select('*')
          .eq('bling_order_id', blingOrderId)
          .maybeSingle();
        
        if (orderByBlingId) {
          localOrder = orderByBlingId;
        } else if (numeroLoja) {
          // Tenta pelo numeroLoja (nosso ID)
          const { data: orderByNumero } = await supabase
            .from('orders')
            .select('*')
            .eq('id', parseInt(numeroLoja))
            .maybeSingle();
          
          if (orderByNumero) {
            localOrder = orderByNumero;
            // Atualiza o bling_order_id se ainda não tiver
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

        // Mapear situação do Bling para status local
        // Bling: 0=Em aberto, 6=Em andamento, 9=Atendido, 12=Cancelado
        const situacaoId = typeof situacao === 'object' ? situacao?.id : situacao;
        
        let updates: Record<string, any> = {};
        
        switch (situacaoId) {
          case 9: // Atendido (entregue/concluído)
            // Pode marcar como enviado/concluído
            console.log(`[bling-webhook] Order ${localOrder.id} marked as completed in Bling`);
            break;
          case 12: // Cancelado
            updates.is_cancelled = true;
            console.log(`[bling-webhook] Order ${localOrder.id} cancelled in Bling`);
            break;
          default:
            console.log(`[bling-webhook] Order ${localOrder.id} status: ${situacaoId}`);
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('orders')
            .update(updates)
            .eq('id', localOrder.id);
          
          if (updateError) {
            console.error(`[bling-webhook] Error updating order ${localOrder.id}:`, updateError);
          } else {
            console.log(`[bling-webhook] Updated order ${localOrder.id}:`, updates);
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
    
    // Log do erro
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
