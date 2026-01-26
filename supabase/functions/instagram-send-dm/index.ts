/**
 * Instagram Send DM
 * 
 * Edge function para enviar mensagens diretas no Instagram
 * Similar ao zapi-send-item-added, mas para Instagram
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SendDMRequest {
  tenant_id: string;
  recipient_id: string;
  message: string;
  template?: 'item_added' | 'order_paid' | 'tracking';
  data?: Record<string, any>;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body: SendDMRequest = await req.json();
    const { tenant_id, recipient_id, message, template, data } = body;

    if (!tenant_id || !recipient_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id and recipient_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar integração do tenant
    const { data: integration, error: intError } = await supabase
      .from('integration_instagram')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Instagram integration not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!integration.page_access_token) {
      return new Response(
        JSON.stringify({ error: 'Page access token not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar mensagem baseada no template (se fornecido)
    let finalMessage = message;

    if (template && data) {
      switch (template) {
        case 'item_added':
          finalMessage = `🛒 *Item adicionado ao pedido*\n\n` +
            `✅ ${data.product_name}\n` +
            `📦 Código: ${data.product_code}\n` +
            `Qtd: *${data.quantity}*\n` +
            `💰 Valor: *R$ ${data.unit_price?.toFixed(2)}*\n\n` +
            `Digite *FINALIZAR* para concluir seu pedido.`;
          break;

        case 'order_paid':
          finalMessage = `🎉 *Pagamento Confirmado!*\n\n` +
            `✅ Pedido #${data.order_id}\n` +
            `💰 Valor: *R$ ${data.total?.toFixed(2)}*\n\n` +
            `Seu pedido está sendo preparado! 💚`;
          break;

        case 'tracking':
          finalMessage = `📦 *Código de Rastreio*\n\n` +
            `Seu pedido foi enviado!\n` +
            `🔍 Código: *${data.tracking_code}*\n\n` +
            `Acompanhe em: ${data.tracking_url || 'www.linkcorreios.com.br'}`;
          break;
      }
    }

    // Enviar DM via Instagram Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipient_id },
          message: { text: finalMessage },
          access_token: integration.page_access_token,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('[Instagram Send DM] API Error:', result);
      return new Response(
        JSON.stringify({ error: 'Failed to send DM', details: result }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Instagram Send DM] Success:', result);

    return new Response(
      JSON.stringify({ success: true, message_id: result.message_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Instagram Send DM] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
