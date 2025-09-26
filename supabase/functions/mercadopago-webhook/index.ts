import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-key',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract tenant key from URL path or header (multitenant support)
    const url = new URL(req.url);
    let tenantKey = url.pathname.split('/').pop();
    
    // If tenantKey is the function name, try to get it from query params or headers
    if (tenantKey === 'mercadopago-webhook' || !tenantKey) {
      tenantKey = url.searchParams.get('tenant_key') || req.headers.get('x-tenant-key') || undefined;
    }
    
    if (!tenantKey) {
      console.log('No tenant key found in URL path, query params, or headers');
      return new Response('Tenant key required', { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables');
      return new Response('Server configuration error', { status: 500, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Log webhook received
    console.log(`Webhook received. URL: ${url.toString()}`);
    console.log(`Extracted tenant key: ${tenantKey}`);

    // Get tenant and MP integration config
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('tenant_key', tenantKey)
      .eq('is_active', true)
      .single();

    if (tenantError) {
      console.error('Error fetching tenant:', tenantError);
      return new Response('Database error', { status: 500, headers: corsHeaders });
    }

    if (!tenant) {
      console.log(`Tenant with key ${tenantKey} not found`);
      return new Response('Tenant not found', { status: 404, headers: corsHeaders });
    }

    // Use global MP access token (tenant-specific tokens can be added later if needed)
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
      console.error('No MP access token available');
      return new Response('MP not configured', { status: 500, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body, null, 2));

    // Log webhook for debugging
    await supabase
      .from('webhook_logs')
      .insert({
        tenant_id: tenant.id,
        webhook_type: 'mercadopago_webhook',
        status_code: 200,
        payload: body,
        response: 'Webhook received'
      });

    // Mercado Pago webhook structure
    const { action, data, type, resource, topic } = body;

    // Accept both new (type) and old (topic) formats
    const isPayment = type === 'payment' || topic === 'payment';
    if (!isPayment) {
      console.log('Ignoring non-payment notification');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Determine payment id from data.id or resource (may be a URL or numeric string)
    let paymentId = data?.id as string | number | undefined;
    if (!paymentId && typeof resource === 'string') {
      const parts = resource.split('/');
      paymentId = parts[parts.length - 1];
    }
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

    // Prefer resolving order by external_reference (we set it to the order id)
    const externalRef = payment.external_reference || payment.additional_info?.external_reference;

    let order: any | null = null;
    if (externalRef && !Number.isNaN(Number(externalRef))) {
      console.log(`Looking for order with ID: ${externalRef} for tenant: ${tenant.id}`);
      const { data: o, error: byIdError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', Number(externalRef))
        .eq('tenant_id', tenant.id)
        .eq('is_paid', false);
      
      if (byIdError) {
        console.error('Error fetching order by id:', byIdError);
        return new Response('Database error', { status: 500, headers: corsHeaders });
      }
      
      if (o && o.length > 0) {
        order = o[0];
        console.log(`Found order: ${order.id} for tenant: ${order.tenant_id}`);
      } else {
        console.log(`No unpaid order found with ID: ${externalRef} for tenant: ${tenant.id}`);
      }
    }

    // Fallback: try to match by preference id contained in the payment link if available
    if (!order) {
      const preferenceIdFromLink = payment?.point_of_interaction?.transaction_data?.qr_code?.match(/(\d{3,}-[\w-]+)/)?.[1] || null;
      const preferenceId = preferenceIdFromLink; // best-effort
      
      if (preferenceId) {
        console.log(`Looking for order with preference ID: ${preferenceId} for tenant: ${tenant.id}`);
        const { data: orders, error: fetchError } = await supabase
          .from('orders')
          .select('*')
          .ilike('payment_link', `%${preferenceId}%`)
          .eq('tenant_id', tenant.id)
          .eq('is_paid', false);
          
        if (fetchError) {
          console.error('Error fetching order by preference link:', fetchError);
          return new Response('Database error', { status: 500, headers: corsHeaders });
        }
        
        if (orders && orders.length > 0) {
          order = orders[0];
          console.log(`Found order by preference: ${order.id} for tenant: ${order.tenant_id}`);
        } else {
          console.log(`No unpaid order found with preference ID: ${preferenceId} for tenant: ${tenant.id}`);
        }
      }
      
      if (!preferenceId && !externalRef) {
        console.error('No external_reference or preference id found to locate order');
        return new Response('Unable to locate order', { status: 400, headers: corsHeaders });
      }
    }

    if (!order) {
      console.log('No unpaid order found for this payment');
      return new Response('Order not found', { status: 404, headers: corsHeaders });
    }
    
    // Update order status to paid
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        is_paid: true
      })
      .eq('id', order.id);

    if (updateError) {
      console.error('Error updating order:', updateError);
      return new Response('Failed to update order', { status: 500, headers: corsHeaders });
    }

    console.log(`Order ${order.id} marked as paid via webhook`);

    // Log successful payment processing
    await supabase
      .from('webhook_logs')
      .insert({
        tenant_id: tenant.id,
        webhook_type: 'mercadopago_payment_success',
        status_code: 200,
        payload: { payment_id: paymentId, order_id: order.id },
        response: `Order ${order.id} marked as paid`
      });

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