import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OLIST_API_URL = 'https://api.tiny.com.br/public-api/v3';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { tenant_id } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar integração
    const { data: integration, error: intError } = await supabase
      .from('integration_olist')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (intError || !integration?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Integração Olist não configurada ou sem token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.sync_orders) {
      return new Response(
        JSON.stringify({ error: 'Sincronização de pedidos desativada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[olist-sync-orders] Iniciando sync para tenant: ${tenant_id}`);

    // Buscar pedidos do Olist
    const ordersResponse = await fetch(`${OLIST_API_URL}/pedidos?limit=100`, {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!ordersResponse.ok) {
      const errorText = await ordersResponse.text();
      console.error('[olist-sync-orders] Erro ao buscar pedidos:', ordersResponse.status, errorText);

      // Se 401, token expirado
      if (ordersResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Token expirado. Renove o token e tente novamente.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro ao buscar pedidos: ${ordersResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ordersData = await ordersResponse.json();
    const orders = ordersData.itens || [];

    console.log(`[olist-sync-orders] ${orders.length} pedidos encontrados`);

    let synced = 0;
    let errors = 0;

    for (const order of orders) {
      try {
        // Buscar detalhes do pedido
        await delay(2000); // Rate limit: ~30 req/min
        const detailResponse = await fetch(`${OLIST_API_URL}/pedidos/${order.id}`, {
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Accept': 'application/json',
          },
        });

        if (!detailResponse.ok) {
          console.error(`[olist-sync-orders] Erro ao buscar detalhes pedido ${order.id}:`, detailResponse.status);
          errors++;
          continue;
        }

        const detail = await detailResponse.json();

        // Mapear para nosso formato
        const customerPhone = detail.cliente?.celular || detail.cliente?.telefone || '';
        const customerName = detail.cliente?.nome || '';

        if (!customerPhone) {
          console.log(`[olist-sync-orders] Pedido ${order.id} sem telefone, pulando`);
          continue;
        }

        // Verificar se já existe
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('tenant_id', tenant_id)
          .eq('observation', `[OLIST] ID: ${order.id}`)
          .maybeSingle();

        if (existing) {
          console.log(`[olist-sync-orders] Pedido ${order.id} já sincronizado`);
          continue;
        }

        // Calcular total
        const totalAmount = detail.itens?.reduce((sum: number, item: any) => {
          return sum + (item.quantidade || 1) * (item.valor || 0);
        }, 0) || 0;

        // Inserir pedido
        const { error: insertError } = await supabase
          .from('orders')
          .insert({
            tenant_id,
            customer_phone: customerPhone.replace(/\D/g, ''),
            customer_name: customerName,
            customer_cep: detail.cliente?.endereco?.cep || null,
            customer_street: detail.cliente?.endereco?.endereco || null,
            customer_number: detail.cliente?.endereco?.numero || null,
            customer_complement: detail.cliente?.endereco?.complemento || null,
            customer_neighborhood: detail.cliente?.endereco?.bairro || null,
            customer_city: detail.cliente?.endereco?.cidade || null,
            customer_state: detail.cliente?.endereco?.uf || null,
            event_date: new Date().toISOString().split('T')[0],
            event_type: 'olist',
            total_amount: totalAmount,
            is_paid: order.situacao === 3, // 3 = Aprovado no Olist
            observation: `[OLIST] ID: ${order.id} | Nº: ${order.numeroPedido || ''}`,
          });

        if (insertError) {
          console.error(`[olist-sync-orders] Erro ao inserir pedido ${order.id}:`, insertError);
          errors++;
        } else {
          synced++;
        }
      } catch (e) {
        console.error(`[olist-sync-orders] Erro ao processar pedido ${order.id}:`, e);
        errors++;
      }
    }

    // Atualizar last_sync_at
    await supabase
      .from('integration_olist')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id);

    console.log(`[olist-sync-orders] Sync finalizado: ${synced} sincronizados, ${errors} erros`);

    return new Response(
      JSON.stringify({ success: true, synced, errors, total: orders.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[olist-sync-orders] Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
