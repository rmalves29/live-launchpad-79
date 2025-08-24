import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');

    if (!supabaseUrl || !supabaseKey || !mpAccessToken) {
      console.error('Missing environment variables');
      return new Response('Server configuration error', { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body, null, 2));

    // Mercado Pago webhook structure
    const { action, data, type } = body;

    // Only process payment notifications
    if (type !== 'payment') {
      console.log('Ignoring non-payment notification');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      console.error('No payment ID in webhook');
      return new Response('Invalid webhook data', { status: 400, headers: corsHeaders });
    }

    // Get payment details from Mercado Pago API
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpResponse.ok) {
      console.error('Failed to fetch payment from MP:', mpResponse.status);
      return new Response('Failed to fetch payment details', { status: 400, headers: corsHeaders });
    }

    const payment = await mpResponse.json();
    console.log('Payment details:', JSON.stringify(payment, null, 2));

    // Only process approved payments
    if (payment.status !== 'approved') {
      console.log(`Payment ${paymentId} status is ${payment.status}, not processing`);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Find order by preference ID
    const preferenceId = payment.additional_info?.external_reference || payment.external_reference;
    if (!preferenceId) {
      console.error('No preference ID found in payment');
      return new Response('No preference ID', { status: 400, headers: corsHeaders });
    }

    // Find order by preference ID in payment link
    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .ilike("payment_link", `%${preferenceId}%`)
      .eq("is_paid", false);

    if (fetchError) {
      console.error('Error fetching order:', fetchError);
      return new Response('Database error', { status: 500, headers: corsHeaders });
    }

    if (!orders || orders.length === 0) {
      console.log(`No unpaid order found for preference ${preferenceId}`);
      return new Response('Order not found', { status: 404, headers: corsHeaders });
    }

    const order = orders[0];
    
    // Update order status to paid
    const { error: updateError } = await supabase
      .from("orders")
      .update({ 
        is_paid: true,
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id);

    if (updateError) {
      console.error('Error updating order:', updateError);
      return new Response('Failed to update order', { status: 500, headers: corsHeaders });
    }

    console.log(`Order ${order.id} marked as paid via webhook`);

    return new Response('Payment processed successfully', { 
      status: 200, 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal server error', { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});