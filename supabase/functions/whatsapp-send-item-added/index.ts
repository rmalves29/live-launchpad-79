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
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SendItemAddedRequest = await req.json();
    const { tenant_id, customer_phone, product_name, product_code, quantity, unit_price } = body;

    console.log('📱 Sending ITEM_ADDED WhatsApp for tenant:', tenant_id);

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

    // Enviar via API do servidor Node.js WhatsApp
    const whatsappPayload = {
      data: JSON.stringify({
        numeros: [phoneFinal],
        mensagens: [mensagem],
        interval: 1000,
        batchSize: 1,
        batchDelay: 1000
      })
    };

    const whatsappResponse = await fetch(`${whatsappApiUrl}/api/send-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
