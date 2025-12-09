import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeForStorage, normalizeForWhatsApp } from '../_utils/phone.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendPaidOrderRequest {
  tenant_id: string;
  order_id: number;
  customer_phone: string;
  total?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const whatsappApiUrl = Deno.env.get('WHATSAPP_MULTITENANT_URL') || 'https://backend-production-2599.up.railway.app';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SendPaidOrderRequest = await req.json();
    const { tenant_id, order_id, customer_phone, total } = body;

    console.log('🔔 EDGE: whatsapp-send-paid-order payload:', JSON.stringify(body));

    // Buscar template PAID_ORDER do tenant
    const { data: template, error: templateError } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenant_id)
      .eq('type', 'PAID_ORDER')
      .maybeSingle();

    if (templateError) {
      console.error('Erro ao buscar template PAID_ORDER:', templateError);
    }

    let message = template?.content || `🎉 Pagamento confirmado - Pedido #{{order_id}}\n\nRecebemos seu pagamento. Valor: R$ {{total}}\nObrigado!`;
    message = message.replace(/{{order_id}}/g, String(order_id)).replace(/{{total}}/g, (typeof total !== 'undefined' ? Number(total).toFixed(2) : '0.00'));

    // Normalizar telefones
    const phoneForStorage = normalizeForStorage(customer_phone);
    const phoneForWhatsApp = normalizeForWhatsApp(customer_phone);

    console.log('📞 phoneForStorage:', phoneForStorage);
    console.log('📞 phoneForWhatsApp:', phoneForWhatsApp);

    // Enviar via servidor Node.js
    const whatsappPayload = {
      phone: phoneForWhatsApp,
      message
    };

    console.log('🌐 Chamando WhatsApp API:', whatsappApiUrl + '/send');

    const response = await fetch(`${whatsappApiUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenant_id
      },
      body: JSON.stringify(whatsappPayload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Erro na API de WhatsApp:', response.status, text);
      return new Response(JSON.stringify({ success: false, error: text }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resJson = await response.json();

    // Registrar no banco
    const { error: insertError } = await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: phoneForStorage,
      message,
      type: 'paid_order',
      sent_at: new Date().toISOString(),
      processed: true,
      order_id
    });

    if (insertError) console.error('Erro ao salvar whatsapp_messages:', insertError);

    // Marcar pedido como payment_confirmation_sent = true
    const { error: updateError } = await supabase
      .from('orders')
      .update({ payment_confirmation_sent: true })
      .eq('id', order_id);

    if (updateError) console.error('Erro ao atualizar payment_confirmation_sent:', updateError);

    return new Response(JSON.stringify({ success: true, whatsappResult: resJson }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Erro em whatsapp-send-paid-order:', error);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
