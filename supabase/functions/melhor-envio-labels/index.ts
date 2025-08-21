import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { order } = await req.json();
    
    if (!order) {
      return new Response(
        JSON.stringify({ error: 'Dados do pedido são obrigatórios' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Configurações do Melhor Envio
    const ME_ENV = Deno.env.get('MELHOR_ENVIO_ENV') || 'sandbox';
    const ME_ACCESS_TOKEN = Deno.env.get('MELHOR_ENVIO_ACCESS_TOKEN');
    const ME_FROM_CEP = Deno.env.get('MELHOR_ENVIO_FROM_CEP') || '31575060';

    if (!ME_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Token de acesso do Melhor Envio não configurado' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const baseUrl = ME_ENV === 'production' 
      ? 'https://www.melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${ME_ACCESS_TOKEN}`,
      'User-Agent': 'ManiaDeMulher (contato@maniadomulher.com.br)'
    };

    // 1. Adicionar ao carrinho
    const cartPayload = {
      service: order.service_id,
      from: {
        name: "Mania de Mulher",
        postal_code: ME_FROM_CEP,
        address: "Rua Principal",
        number: "123",
        city: "Belo Horizonte",
        state_id: 13, // MG
        country_id: 76, // Brasil
        phone: "(31) 99999-9999"
      },
      to: {
        name: order.customer_name,
        postal_code: order.customer_cep.replace(/\D/g, ''),
        address: order.customer_street,
        number: order.customer_number,
        city: order.customer_city,
        state_id: getStateId(order.customer_state),
        country_id: 76,
        phone: order.customer_phone
      },
      package: {
        height: 2,
        width: 16,
        length: 20,
        weight: 0.3
      },
      options: {
        receipt: false,
        own_hand: false
      }
    };

    console.log('Adding to cart:', cartPayload);

    let cartResponse = await fetch(`${baseUrl}/api/v2/me/cart`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cartPayload)
    });

    if (!cartResponse.ok) {
      const errorData = await cartResponse.text();
      console.error('Cart error:', cartResponse.status, errorData);
      throw new Error(`Erro ao adicionar ao carrinho: ${errorData}`);
    }

    const cartData = await cartResponse.json();
    console.log('Cart response:', cartData);

    // 2. Fazer checkout
    const checkoutResponse = await fetch(`${baseUrl}/api/v2/me/shipment/checkout`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orders: [cartData.id] })
    });

    if (!checkoutResponse.ok) {
      const errorData = await checkoutResponse.text();
      console.error('Checkout error:', checkoutResponse.status, errorData);
      throw new Error(`Erro no checkout: ${errorData}`);
    }

    const checkoutData = await checkoutResponse.json();
    console.log('Checkout response:', checkoutData);

    // 3. Gerar etiqueta
    const generateResponse = await fetch(`${baseUrl}/api/v2/me/shipment/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orders: [checkoutData.purchase.id] })
    });

    if (!generateResponse.ok) {
      const errorData = await generateResponse.text();
      console.error('Generate error:', generateResponse.status, errorData);
      throw new Error(`Erro ao gerar etiqueta: ${errorData}`);
    }

    const generateData = await generateResponse.json();
    console.log('Generate response:', generateData);

    // 4. Imprimir etiqueta
    const printResponse = await fetch(`${baseUrl}/api/v2/me/shipment/print`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orders: [checkoutData.purchase.id] })
    });

    if (!printResponse.ok) {
      const errorData = await printResponse.text();
      console.error('Print error:', printResponse.status, errorData);
      throw new Error(`Erro ao imprimir etiqueta: ${errorData}`);
    }

    const printData = await printResponse.json();
    console.log('Print response:', printData);

    return new Response(
      JSON.stringify({ 
        success: true,
        order_id: checkoutData.purchase.id,
        tracking_code: generateData.tracking || 'Aguardando',
        print_url: printData.url,
        protocol: checkoutData.purchase.protocol
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in melhor-envio-labels function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Mapear estados para IDs do Melhor Envio
function getStateId(state: string): number {
  const stateMap: Record<string, number> = {
    'AC': 23, 'AL': 17, 'AP': 16, 'AM': 23, 'BA': 5, 'CE': 3, 'DF': 25,
    'ES': 32, 'GO': 29, 'MA': 10, 'MT': 28, 'MS': 10, 'MG': 13, 'PA': 15,
    'PB': 21, 'PR': 18, 'PE': 8, 'PI': 22, 'RJ': 19, 'RN': 20, 'RS': 11,
    'RO': 24, 'RR': 14, 'SC': 26, 'SP': 9, 'SE': 30, 'TO': 31
  };
  return stateMap[state.toUpperCase()] || 13; // Default: MG
}