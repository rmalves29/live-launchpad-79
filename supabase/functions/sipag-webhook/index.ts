// Webhook do Sipag para confirmação de pagamento
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant_id');
    if (!tenantId) {
      return new Response(JSON.stringify({ success: false, error: 'tenant_id obrigatório na query string' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json().catch(() => ({}));
    console.log('[sipag-webhook] payload:', JSON.stringify(payload).slice(0, 500));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Validar webhook secret se configurado
    const { data: integration } = await supabase
      .from('integration_sipag')
      .select('webhook_secret')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const headerSecret = req.headers.get('x-webhook-secret') || req.headers.get('x-sipag-signature');
    if (integration?.webhook_secret && headerSecret !== integration.webhook_secret) {
      console.warn('[sipag-webhook] Webhook secret inválido');
      return new Response(JSON.stringify({ success: false, error: 'Assinatura inválida' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Estrutura esperada: { pix: [{ txid, valor, horario, ... }] } ou { evento, txid, status }
    const pixArray = payload.pix || (payload.txid ? [payload] : []);

    for (const item of pixArray) {
      const txid: string = item.txid;
      if (!txid) continue;

      // ORD{order_id}{timestamp}
      const match = txid.match(/^ORD(\d+)/);
      if (!match) {
        console.warn('[sipag-webhook] txid sem padrão ORD:', txid);
        continue;
      }
      const orderId = parseInt(match[1], 10);

      const status = (item.status || 'PAID').toUpperCase();
      if (status === 'PAID' || status === 'CONCLUIDA' || status === 'COMPLETED') {
        const { error } = await supabase
          .from('orders')
          .update({
            is_paid: true,
            payment_method: 'pix',
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .eq('tenant_id', tenantId)
          .eq('is_paid', false);
        if (error) console.error('[sipag-webhook] erro ao marcar pago:', error);
        else console.log(`[sipag-webhook] Pedido #${orderId} marcado como pago`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[sipag-webhook]', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
