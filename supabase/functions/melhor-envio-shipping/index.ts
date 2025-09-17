import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to_postal_code, products, tenant_id } = await req.json();
    
    if (!to_postal_code) {
      return new Response(
        JSON.stringify({ error: 'CEP de destino é obrigatório' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get shipping configuration from frete_config table
    const { data: shippingConfig, error: configError } = await supabase
      .from('frete_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (configError || !shippingConfig) {
      console.error('Shipping config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'Configuração de envio não encontrada' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Using shipping config:', shippingConfig);

    if (!shippingConfig.access_token) {
      console.error('MELHOR_ENVIO_ACCESS_TOKEN not found in config');
      return new Response(
        JSON.stringify({ error: 'Token de acesso do Melhor Envio não configurado' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Use correct API URLs based on environment
    const isProduction = !shippingConfig.api_base_url || shippingConfig.api_base_url.includes('melhorenvio.com.br/api');
    const baseUrl = isProduction 
      ? 'https://api.melhorenvio.com'
      : 'https://sandbox.melhorenvio.com.br/api';

    // Payload para cotação
    const payload = {
      from: {
        postal_code: shippingConfig.cep_origem
      },
      to: {
        postal_code: to_postal_code.replace(/\D/g, '')
      },
      products: products || [
        {
          id: "1",
          width: 16,
          height: 2,
          length: 20,
          weight: 0.3,
          insurance_value: 50,
          quantity: 1
        }
      ]
    };

    console.log('Calling Melhor Envio API:', `${baseUrl}/v2/me/shipment/calculate`, payload);

    const response = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${shippingConfig.access_token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'OrderZaps (contato@orderzaps.com)'
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

    const allowedServices = [
      { id: 1, name: 'PAC', company: 'Correios' },
      { id: 2, name: 'SEDEX', company: 'Correios' },
      { id: 33, name: 'Standard', company: 'JeT' }
    ];

    const formattedOptions = data
      .filter((option: any) => {
        // Filtrar apenas serviços permitidos
        const isAllowed = allowedServices.some(allowed => 
          allowed.id === option.id && 
          option.company?.name === allowed.company
        );
        
        // Verificar se não tem erro, tem preço e preço > 0
        const hasValidPrice = !option.error && option.price && parseFloat(option.price) > 0;
        
        return isAllowed && hasValidPrice;
      })
      .map((option: any) => ({
        service_id: option.id,
        service_name: option.name,
        company: option.company.name,
        price: parseFloat(option.price) || 0,
        delivery_time: option.delivery_time || 0,
        custom_price: parseFloat(option.custom_price || option.price) || 0,
        custom_delivery_time: option.custom_delivery_time || option.delivery_time || 0
      }));

    // Adicionar opção de retirada na fábrica
    formattedOptions.unshift({
      service_id: 'retirada-fabrica',
      service_name: 'Retirar na Fábrica',
      company: 'Retirada',
      price: 0,
      delivery_time: 3,
      custom_price: 0,
      custom_delivery_time: 3
    });

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