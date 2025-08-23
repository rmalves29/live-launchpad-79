import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cartItems, customerData, addressData, shippingCost, total } = await req.json();

    console.log('Creating payment with data:', { cartItems, customerData, addressData, shippingCost, total });

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
      console.error('MP_ACCESS_TOKEN not found');
      return new Response(
        JSON.stringify({ error: 'Mercado Pago não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create items for MercadoPago
    const items = cartItems.map((item: any) => ({
      title: item.product_name || `${item.product_code} Produto`,
      quantity: item.qty,
      unit_price: parseFloat(item.unit_price),
      currency_id: 'BRL'
    }));

    // Add shipping as item if cost > 0
    if (shippingCost > 0) {
      items.push({
        title: 'Frete',
        quantity: 1,
        unit_price: parseFloat(shippingCost),
        currency_id: 'BRL'
      });
    }

    const preference = {
      items: items,
      payer: {
        name: customerData.name,
        email: `${customerData.phone}@checkout.com`,
        phone: {
          area_code: customerData.phone?.substring(2, 4) || '',
          number: customerData.phone?.substring(4) || ''
        },
        address: {
          zip_code: addressData.cep?.replace(/\D/g, '') || '',
          street_name: addressData.street || '',
          street_number: addressData.number || ''
        }
      },
      back_urls: {
        success: `${Deno.env.get('PUBLIC_BASE_URL') || 'https://live-launchpad-79.lovable.app'}/mp/return?status=success`,
        failure: `${Deno.env.get('PUBLIC_BASE_URL') || 'https://live-launchpad-79.lovable.app'}/mp/return?status=failure`,
        pending: `${Deno.env.get('PUBLIC_BASE_URL') || 'https://live-launchpad-79.lovable.app'}/mp/return?status=pending`
      },
      auto_return: 'approved',
      binary_mode: true,
      statement_descriptor: 'MANIA DEMULHER'
    };

    console.log('Creating MP preference:', JSON.stringify(preference, null, 2));

    // Create preference in MercadoPago
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preference)
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.text();
      console.error('MercadoPago API error:', mpResponse.status, errorData);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar preferência no MercadoPago', details: errorData }),
        { status: mpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mpData = await mpResponse.json();
    console.log('MP Response:', mpData);

    // Save order in database
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_phone: customerData.phone,
          event_type: 'BAZAR',
          event_date: new Date().toISOString().split('T')[0],
          total_amount: parseFloat(total),
          payment_link: mpData.init_point,
          is_paid: false
        })
        .select()
        .single();

      if (orderError) {
        console.error('Error saving order:', orderError);
      } else {
        console.log('Order saved successfully:', orderData);
      }
    } catch (error) {
      console.error('Error saving order:', error);
    }

    return new Response(
      JSON.stringify({ 
        init_point: mpData.init_point,
        sandbox_init_point: mpData.sandbox_init_point,
        preference_id: mpData.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in create-payment function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});