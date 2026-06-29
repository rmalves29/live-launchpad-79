// Expira reservas vencidas: cancela pedido, devolve estoque, libera próximo da fila.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const now = new Date().toISOString();
  const { data: expired } = await supabase
    .from('product_waitlist')
    .select('id, tenant_id, product_id, qty, order_id, customer_phone, customer_name')
    .eq('status', 'notified')
    .lt('reserved_until', now)
    .limit(50);

  let processed = 0;
  for (const w of expired || []) {
    // Verifica se o pedido foi pago
    if (w.order_id) {
      const { data: order } = await supabase.from('orders')
        .select('id, is_paid, is_cancelled').eq('id', w.order_id).maybeSingle();
      if (order?.is_paid) {
        await supabase.from('product_waitlist')
          .update({ status: 'converted' }).eq('id', w.id);
        processed++;
        continue;
      }
      if (order && !order.is_cancelled) {
        // Cancela o pedido (devolve estoque)
        await supabase.from('orders').update({
          is_cancelled: true,
          cancellation_reason: 'Reserva da fila de espera expirada',
        }).eq('id', w.order_id);

        // Restaura estoque manualmente (caso não exista trigger automático)
        const { data: prod } = await supabase.from('products').select('stock').eq('id', w.product_id).single();
        if (prod) {
          await supabase.from('products').update({ stock: (prod.stock || 0) + w.qty }).eq('id', w.product_id);
        }
      }
    }

    await supabase.from('product_waitlist')
      .update({ status: 'expired' }).eq('id', w.id);
    processed++;
  }

  return new Response(JSON.stringify({ success: true, processed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
