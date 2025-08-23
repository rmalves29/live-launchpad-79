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
    const { to_postal_code } = await req.json();
    
    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ error: 'CEP de destino é obrigatório' }), 
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

    console.log('ME_ENV:', ME_ENV);
    console.log('ME_ACCESS_TOKEN exists:', !!ME_ACCESS_TOKEN);
    console.log('ME_ACCESS_TOKEN first 20 chars:', ME_ACCESS_TOKEN ? ME_ACCESS_TOKEN.substring(0, 20) : 'null');
    console.log('ME_FROM_CEP:', ME_FROM_CEP);

    if (!ME_ACCESS_TOKEN) {
      console.error('MELHOR_ENVIO_ACCESS_TOKEN not found in environment');
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

    // Payload para cotação
    const payload = {
      from: {
        postal_code: ME_FROM_CEP
      },
      to: {
        postal_code: to_postal_code.replace(/\D/g, '')
      },
      package: {
        height: 2,
        width: 16,
        length: 20,
        weight: 0.3
      }
    };

    console.log('Calling Melhor Envio API:', `${baseUrl}/api/v2/me/shipment/calculate`, payload);

    const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${ME_ACCESS_TOKEN}`,
        'User-Agent': 'ManiaDeMulher (contato@maniadomulher.com.br)'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Melhor Envio API error:', response.status, errorData);
      
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao calcular frete',
          details: errorData 
        }), 
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    console.log('Melhor Envio API response:', data);

    // Formatar resposta para o frontend
    const formattedOptions = data.map((option: any) => ({
      service_id: option.id,
      service_name: option.name,
      company: option.company.name,
      price: option.price,
      delivery_time: option.delivery_time,
      custom_price: option.custom_price || option.price,
      custom_delivery_time: option.custom_delivery_time || option.delivery_time
    }));

    return new Response(
      JSON.stringify({ shipping_options: formattedOptions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in melhor-envio-shipping function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});