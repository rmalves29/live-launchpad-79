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
        JSON.stringify({ success: false, error: 'tenant_id é obrigatório' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ success: false, error: 'Integração Olist não configurada ou sem token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.sync_orders) {
      return new Response(
        JSON.stringify({ success: false, error: 'Módulo de pedidos desativado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[olist-export-orders] Iniciando exportação para tenant: ${tenant_id}`);

    // Buscar pedidos não cancelados que ainda não foram exportados para o Olist
    // Pedidos já exportados terão "[OLIST-EXPORT]" na observação
    const { data: orders, error: ordError } = await supabase
      .from('orders')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_cancelled', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (ordError) {
      console.error('[olist-export-orders] Erro ao buscar pedidos:', ordError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar pedidos do banco' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filtrar pedidos que já foram exportados
    const pendingOrders = (orders || []).filter(o =>
      !o.observation?.includes('[OLIST-EXPORT]')
    );

    if (pendingOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, exported: 0, errors: 0, total: 0, message: 'Nenhum pedido pendente para exportar' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[olist-export-orders] ${pendingOrders.length} pedidos para exportar`);

    // Primeiro, precisamos criar/buscar um contato genérico no Olist para associar os pedidos
    // A API v3 exige idContato; vamos criar contatos por cliente

    let exported = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Cache de contatos já criados (phone -> olist_id)
    const contactCache: Record<string, number> = {};

    for (const order of pendingOrders) {
      try {
        const phone = order.customer_phone?.replace(/\D/g, '') || '';
        const customerName = order.customer_name || `Cliente ${phone}`;

        // Criar/buscar contato no Olist
        let contactId = contactCache[phone];

        if (!contactId) {
          // Tentar criar contato
          const contactPayload = {
            nome: customerName,
            tipoPessoa: 'F', // Pessoa Física
            celular: phone,
            situacao: 'A',
          };

          // Adicionar endereço se disponível
          if (order.customer_cep) {
            (contactPayload as any).endereco = {
              endereco: order.customer_street || '',
              numero: order.customer_number || 'S/N',
              complemento: order.customer_complement || '',
              bairro: order.customer_neighborhood || '',
              municipio: order.customer_city || '',
              cep: order.customer_cep?.replace(/\D/g, '') || '',
              uf: order.customer_state || '',
            };
          }

          console.log(`[olist-export-orders] Criando contato para: ${customerName} (${phone})`);

          const contactResponse = await fetch(`${OLIST_API_URL}/contatos`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(contactPayload),
          });

          const contactText = await contactResponse.text();

          if (contactResponse.ok) {
            try {
              const contactData = JSON.parse(contactText);
              contactId = contactData.id;
              contactCache[phone] = contactId;
              console.log(`[olist-export-orders] Contato criado: ID ${contactId}`);
            } catch {
              console.error('[olist-export-orders] Erro ao parsear resposta do contato:', contactText);
            }
          } else {
            console.error(`[olist-export-orders] Erro ao criar contato (${contactResponse.status}):`, contactText);
            // Tentar extrair ID se contato já existe
            try {
              const errData = JSON.parse(contactText);
              if (errData.id) {
                contactId = errData.id;
                contactCache[phone] = contactId;
              }
            } catch { /* ignore */ }
          }

          await delay(2000);
        }

        if (!contactId) {
          console.error(`[olist-export-orders] Não foi possível criar contato para pedido #${order.id}`);
          errors++;
          errorDetails.push(`Pedido #${order.id}: Falha ao criar contato`);
          continue;
        }

        // Buscar itens do pedido (cart_items)
        let itensOlist: any[] = [];
        if (order.cart_id) {
          const { data: cartItems } = await supabase
            .from('cart_items')
            .select('*')
            .eq('cart_id', order.cart_id);

          if (cartItems && cartItems.length > 0) {
            // Para cada item, precisamos do ID do produto no Olist
            // Como pode não existir, usamos descricao como fallback
            itensOlist = cartItems.map(item => ({
              produto: {
                // Sem ID no Olist, usar descrição
                tipo: 'S',
              },
              descricao: item.product_name || 'Produto',
              quantidade: item.qty || 1,
              valorUnitario: item.unit_price || 0,
            }));
          }
        }

        // Se não tem itens do carrinho, criar item genérico
        if (itensOlist.length === 0) {
          itensOlist = [{
            produto: { tipo: 'P' },
            descricao: `Pedido #${order.id}`,
            quantidade: 1,
            valorUnitario: order.total_amount || 0,
          }];
        }

        // Montar pedido Olist
        const olistOrder: Record<string, any> = {
          idContato: contactId,
          data: order.event_date || new Date().toISOString().split('T')[0],
          situacao: order.is_paid ? 3 : 8, // 3 = Aprovado, 8 = Em aberto
          observacoes: `[OrderZap] Pedido #${order.id}`,
          observacoesInternas: `Exportado do OrderZap em ${new Date().toISOString()}`,
          itens: itensOlist,
        };

        // Adicionar frete se existir na observação
        if (order.observation) {
          const freteMatch = order.observation.match(/\[FRETE\].*R\$\s*([\d]+[.,][\d]{2})/);
          if (freteMatch) {
            olistOrder.valorFrete = parseFloat(freteMatch[1].replace(',', '.'));
          }
        }

        // Endereço de entrega
        if (order.customer_cep) {
          olistOrder.enderecoEntrega = {
            endereco: order.customer_street || '',
            enderecoNro: order.customer_number || 'S/N',
            complemento: order.customer_complement || '',
            bairro: order.customer_neighborhood || '',
            municipio: order.customer_city || '',
            cep: order.customer_cep?.replace(/\D/g, '') || '',
            uf: order.customer_state || '',
            fone: phone,
            nomeDestinatario: customerName,
            tipoPessoa: 'F',
          };
        }

        console.log(`[olist-export-orders] Exportando pedido #${order.id}`);

        const orderResponse = await fetch(`${OLIST_API_URL}/pedidos`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(olistOrder),
        });

        const orderText = await orderResponse.text();

        if (!orderResponse.ok) {
          console.error(`[olist-export-orders] Erro HTTP ${orderResponse.status} para pedido #${order.id}:`, orderText);

          if (orderResponse.status === 401) {
            return new Response(
              JSON.stringify({ success: false, error: 'Token expirado. Renove e tente novamente.', exported, errors }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          errors++;
          errorDetails.push(`Pedido #${order.id}: ${orderText.substring(0, 100)}`);
        } else {
          let orderData;
          try {
            orderData = JSON.parse(orderText);
          } catch {
            orderData = {};
          }

          console.log(`[olist-export-orders] Pedido #${order.id} exportado. Olist ID: ${orderData.id || 'N/A'}`);

          // Marcar pedido como exportado
          const newObs = [order.observation || '', `[OLIST-EXPORT] ID: ${orderData.id || 'N/A'} | Nº: ${orderData.numeroPedido || 'N/A'}`]
            .filter(Boolean).join('\n');

          await supabase
            .from('orders')
            .update({ observation: newObs })
            .eq('id', order.id);

          exported++;
        }

        await delay(2000); // Rate limit
      } catch (e) {
        console.error(`[olist-export-orders] Erro ao exportar pedido #${order.id}:`, e);
        errors++;
        errorDetails.push(`Pedido #${order.id}: ${e.message}`);
      }
    }

    // Atualizar last_sync_at
    await supabase
      .from('integration_olist')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id);

    console.log(`[olist-export-orders] Exportação finalizada: ${exported} exportados, ${errors} erros`);

    return new Response(
      JSON.stringify({
        success: true,
        exported,
        errors,
        total: pendingOrders.length,
        errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[olist-export-orders] Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
