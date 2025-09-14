import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, order_id, customer_phone } = await req.json();
    
    console.log('Bling integration action:', action);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Bling credentials from environment
    const blingClientId = Deno.env.get('BLING_CLIENT_ID');
    const blingClientSecret = Deno.env.get('BLING_CLIENT_SECRET');

    if (!blingClientId || !blingClientSecret) {
      return new Response(
        JSON.stringify({ error: 'Credenciais do Bling não configuradas' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (action === 'create_order') {
      if (!order_id || !customer_phone) {
        return new Response(
          JSON.stringify({ error: 'order_id e customer_phone são obrigatórios' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', order_id)
        .single();

      if (orderError || !orderData) {
        return new Response(
          JSON.stringify({ error: 'Pedido não encontrado' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Get customer details
      const phoneDigits = customer_phone.replace(/\D/g, '');
      let { data: customerData } = await supabase
        .from('customers')
        .select('*')
        .or(`phone.eq.${customer_phone},phone.eq.${phoneDigits},phone.ilike.%${phoneDigits}%`)
        .limit(1)
        .maybeSingle();

      // Get cart items
      const { data: cartItems } = await supabase
        .from('cart_items')
        .select(`
          *,
          products (
            name,
            code,
            price
          )
        `)
        .eq('cart_id', orderData.cart_id || 0);

      // Prepare Bling order payload
      const blingOrder = {
        numero: orderData.id.toString(),
        data: new Date(orderData.created_at).toISOString().split('T')[0],
        cliente: {
          nome: customerData?.name || "Cliente",
          email: customerData?.email || `${customer_phone}@checkout.com`,
          telefone: customer_phone,
          endereco: {
            logradouro: customerData?.street || "Rua não informada",
            numero: customerData?.number || "S/N",
            complemento: customerData?.complement || "",
            bairro: customerData?.city || "Centro",
            cidade: customerData?.city || "São Paulo",
            uf: customerData?.state || "SP",
            cep: customerData?.cep || "00000000"
          }
        },
        itens: (cartItems || []).map((item: any) => ({
          codigo: item.products?.code || `ITEM-${item.id}`,
          descricao: item.products?.name || "Produto",
          quantidade: item.qty,
          valor: item.unit_price
        })),
        valorTotal: orderData.total_amount,
        observacoes: orderData.observation || `Pedido via sistema - Evento: ${orderData.event_type}`,
        categoria: orderData.event_type || "VENDA"
      };

      console.log('Sending order to Bling:', JSON.stringify(blingOrder, null, 2));

      // Send order to Bling API
      const blingResponse = await fetch('https://bling.com.br/Api/v2/pedido/json/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apikey: blingClientId,
          xml: JSON.stringify(blingOrder)
        })
      });

      if (!blingResponse.ok) {
        const errorData = await blingResponse.text();
        console.error('Bling API error:', blingResponse.status, errorData);
        return new Response(
          JSON.stringify({ 
            error: 'Erro na API do Bling',
            details: errorData 
          }),
          { status: blingResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const blingData = await blingResponse.json();
      console.log('Bling response:', JSON.stringify(blingData, null, 2));

      // Log the integration
      await supabase
        .from('webhook_logs')
        .insert({
          webhook_type: 'bling_order_created',
          status_code: 200,
          payload: {
            order_id: orderData.id,
            bling_response: blingData,
            sent_at: new Date().toISOString()
          },
          response: JSON.stringify(blingData)
        });

      return new Response(
        JSON.stringify({ 
          success: true,
          bling_order_id: blingData.retorno?.pedidos?.[0]?.pedido?.numero || 'N/A',
          message: 'Pedido enviado para o Bling com sucesso'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não suportada' }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in Bling integration:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno',
        details: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});