import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendItemAddedRequest {
  tenant_id: string;
  customer_phone: string;
  product_name: string;
  product_code: string;
  quantity: number;
  unit_price: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const whatsappApiUrl = Deno.env.get('WHATSAPP_MULTITENANT_URL') || 'http://localhost:3333';
    
    console.log('🔧 WhatsApp API URL configurada:', whatsappApiUrl);
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SendItemAddedRequest = await req.json();
    const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price } = body;

    console.log('📱 Recebido pedido ITEM_ADDED:', { tenant_id, customer_phone, product_name, product_code, quantity, unit_price });

    // Buscar template ITEM_ADDED do tenant
    const { data: template, error: templateError } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenant_id)
      .eq('type', 'ITEM_ADDED')
      .single();

    if (templateError || !template) {
      console.error('❌ Template ITEM_ADDED não encontrado:', templateError);
      return new Response(
        JSON.stringify({ error: 'Template não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Substituir variáveis no template
    const valorTotal = (quantity * unit_price).toFixed(2);
    let mensagem = template.content
      .replace(/\{\{produto\}\}/g, `${product_name} (${product_code})`)
      .replace(/\{\{quantidade\}\}/g, quantity.toString())
      .replace(/\{\{valor\}\}/g, valorTotal);

    // Normalizar telefone (remover caracteres especiais, garantir formato correto)
    const phoneClean = customer_phone.replace(/\D/g, '');
    const phoneFinal = phoneClean.startsWith('55') ? phoneClean : `55${phoneClean}`;

    console.log(`📤 Enviando para ${phoneFinal}:`, mensagem);

    // Enviar via API do servidor Node.js WhatsApp (endpoint /send)
    const whatsappPayload = {
      phone: phoneFinal,
      message: mensagem
    };

    const whatsappResponse = await fetch(`${whatsappApiUrl}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': tenant_id
      },
      body: JSON.stringify(whatsappPayload),
    });

    if (!whatsappResponse.ok) {
      const errorText = await whatsappResponse.text();
      console.error('❌ Erro ao enviar WhatsApp:', errorText);
      throw new Error(`WhatsApp API error: ${errorText}`);
    }

    const whatsappResult = await whatsappResponse.json();
    console.log('✅ WhatsApp enviado:', whatsappResult);

    // Registrar mensagem no banco
    await supabase.from('whatsapp_messages').insert({
      tenant_id,
      phone: phoneFinal,
      message: mensagem,
      type: 'item_added',
      sent_at: new Date().toISOString(),
      processed: true
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Mensagem enviada com sucesso',
        whatsappResult 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
