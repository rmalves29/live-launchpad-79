// Cancelamento automático de pedidos não pagos após o prazo configurado por empresa.
// Executado via pg_cron (a cada 10 minutos) ou manualmente pelo painel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const onlyTenantId: string | undefined = body?.tenant_id;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let tenantQuery = supabase
      .from('tenants')
      .select('id, name, auto_cancel_unpaid_enabled, auto_cancel_unpaid_hours, auto_cancel_unpaid_minutes, auto_cancel_live_minutes')
      .eq('auto_cancel_unpaid_enabled', true);

    if (onlyTenantId) tenantQuery = tenantQuery.eq('id', onlyTenantId);

    const { data: tenants, error: tenantsError } = await tenantQuery;
    if (tenantsError) {
      console.error('[orders-auto-cancel] erro ao carregar empresas:', tenantsError);
      return json({ success: false, error: tenantsError.message });
    }

    const results: Array<{ tenant_id: string; tenant: string; cancelled: number; orders: number[] }> = [];

    for (const t of tenants || []) {
      const rawMinutes = Number((t as any).auto_cancel_unpaid_minutes);
      const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0
        ? rawMinutes
        : (Number((t as any).auto_cancel_unpaid_hours) || 24) * 60;
      // Prazo específico para pedidos de live do Instagram (opcional). Vazio = usa o prazo geral.
      const rawLive = Number((t as any).auto_cancel_live_minutes);
      const liveMinutes = Number.isFinite(rawLive) && rawLive > 0 ? rawLive : null;
      const smallest = liveMinutes ? Math.min(minutes, liveMinutes) : minutes;
      const cutoff = new Date(Date.now() - smallest * 60_000).toISOString();
      const labelFor = (m: number) => (m % 60 === 0 ? `${m / 60}h` : `${m} min`);

      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, cart_id, tenant_id, tenant_order_number, total_amount, customer_phone, event_type, created_at')
        .eq('tenant_id', t.id)
        .eq('is_paid', false)
        .or('is_cancelled.is.null,is_cancelled.eq.false')
        .lt('created_at', cutoff)
        .limit(200);

      if (ordersError) {
        console.error(`[orders-auto-cancel] erro ao buscar pedidos do tenant ${t.id}:`, ordersError);
        continue;
      }

      const cancelledIds: number[] = [];

      for (const order of orders || []) {
        const effectiveMinutes = liveMinutes && (order as any).event_type === 'INSTAGRAM_LIVE' ? liveMinutes : minutes;
        if (Date.now() - new Date((order as any).created_at).getTime() < effectiveMinutes * 60_000) continue;
        const deadlineLabel = labelFor(effectiveMinutes);

        // Devolve o estoque de forma atômica e idempotente (marca stock_restored; nunca devolve duas vezes
        // nem em pedido pago). Se já foi restaurado por outra via, não faz nada.
        const { error: restoreErr } = await supabase.rpc('restore_order_stock', { p_order_id: order.id });
        if (restoreErr) {
          console.error(`[orders-auto-cancel] falha ao devolver estoque do pedido ${order.id}:`, restoreErr);
          continue;
        }

        const { error: updErr } = await supabase
          .from('orders')
          .update({
            is_cancelled: true,
            cancellation_reason: `Cancelamento automático: prazo de ${deadlineLabel} para pagamento expirado`,
          })
          .eq('id', order.id)
          .eq('is_paid', false);

        if (updErr) {
          console.error(`[orders-auto-cancel] falha ao cancelar pedido ${order.id}:`, updErr);
          continue;
        }

        cancelledIds.push(order.id);

        await supabase.from('audit_logs').insert({
          entity: 'order',
          entity_id: String(order.id),
          action: 'cancelled',
          tenant_id: order.tenant_id,
          meta: {
            order_number: order.tenant_order_number || order.id,
            source: 'auto_cancel_unpaid',
            deadline_minutes: effectiveMinutes,
            total_amount: order.total_amount,
            customer_phone: order.customer_phone,
          },
        });
      }

      results.push({
        tenant_id: t.id,
        tenant: (t as any).name,
        cancelled: cancelledIds.length,
        orders: cancelledIds,
      });
    }

    const total = results.reduce((acc, r) => acc + r.cancelled, 0);
    console.log(`[orders-auto-cancel] total cancelado: ${total}`);

    return json({ success: true, total_cancelled: total, results });
  } catch (e) {
    console.error('[orders-auto-cancel] erro inesperado:', e);
    return json({ success: false, error: (e as Error).message });
  }
});
