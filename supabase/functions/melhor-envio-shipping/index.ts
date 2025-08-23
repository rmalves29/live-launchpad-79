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
    const { to_postal_code, weight, height, width, length, insurance_value } = await req.json();
    
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

    // Get configuration from database
    const { data: configData, error: configError } = await supabase
      .from('frete_config')
      .select('*')
      .limit(1)
      .single();

    if (configError || !configData) {
      console.error('Frete config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'Configuração de frete não encontrada' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Using config - API Base URL:', configData.api_base_url);
    console.log('Using config - CEP Origin:', configData.cep_origem);
    console.log('Access token exists:', !!configData.access_token);

    if (!configData.access_token) {
      console.error('MELHOR_ENVIO_ACCESS_TOKEN not found in config');
      return new Response(
        JSON.stringify({ error: 'Token de acesso do Melhor Envio não configurado' }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const baseUrl = configData.api_base_url;

    // Payload para cotação
    const payload = {
      from: {
        postal_code: configData.cep_origem
      },
      to: {
        postal_code: to_postal_code.replace(/\D/g, '')
      },
      package: {
        height: height || 2,
        width: width || 16,
        length: length || 20,
        weight: weight || 0.3
      }
    };

    // Add insurance value if provided
    if (insurance_value) {
      payload.options = {
        insurance_value: insurance_value
      };
    }

    console.log('Calling Melhor Envio API:', `${baseUrl}/v2/me/shipment/calculate`, payload);

    const response = await fetch(`${baseUrl}/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${configData.access_token}`,
        'User-Agent': 'FreteApp (contato@empresa.com)'
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

    // Filtrar apenas os serviços específicos: SEDEX, PAC e JeT Standard
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