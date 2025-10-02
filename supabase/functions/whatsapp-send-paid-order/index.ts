import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { order_id, tenant_id } = await req.json()
    console.log('📦 Processando pedido pago:', { order_id, tenant_id })

    if (!order_id || !tenant_id) {
      throw new Error('order_id e tenant_id são obrigatórios')
    }

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Buscar dados do pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (orderError) throw orderError
    if (!order) throw new Error('Pedido não encontrado')

    console.log('📋 Pedido encontrado:', order.unique_order_id)

    // Buscar integração WhatsApp ativa
    const { data: integration } = await supabase
      .from('integration_whatsapp')
      .select('api_url')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle()

    // Usar servidor local se não houver integração configurada
    const nodeServerUrl = integration?.api_url || 'http://localhost:3333'
    console.log('🌐 Servidor WhatsApp:', nodeServerUrl)

    // Enviar via servidor Node.js - ele vai buscar template e processar tudo
    console.log('📤 Enviando para:', order.customer_phone)
    console.log('📋 Order ID:', order_id)
    
    const whatsappResponse = await fetch(`${nodeServerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: order.customer_phone,
        order_id: order_id
      })
    })

    const whatsappResult = await whatsappResponse.json()
    console.log('📤 Resposta WhatsApp:', whatsappResult)

    if (!whatsappResponse.ok) {
      throw new Error(`Erro ao enviar WhatsApp: ${whatsappResult.error || 'Erro desconhecido'}`)
    }

    console.log('✅ Mensagem enviada com sucesso via Node.js')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Mensagem enviada com sucesso',
        order_id: order.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('❌ Erro:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})