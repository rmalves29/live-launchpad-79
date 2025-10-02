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

    // Buscar template PAID_ORDER
    const { data: template } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenant_id)
      .eq('type', 'PAID_ORDER')
      .maybeSingle()

    // Montar mensagem
    let message = template?.content || 
      `🎉 *Pagamento Confirmado - Pedido #${order.id}*\n\n` +
      `✅ Recebemos seu pagamento!\n` +
      `💰 Valor: *R$ ${order.total_amount.toFixed(2).replace('.', ',')}*\n\n` +
      `Seu pedido está sendo preparado para envio.\n\n` +
      `Obrigado pela preferência! 💚`

    // Substituir variáveis
    message = message
      .replace(/\{\{order_id\}\}/g, order.id.toString())
      .replace(/\{\{total\}\}/g, order.total_amount.toFixed(2).replace('.', ','))
      .replace(/\{\{customer_name\}\}/g, order.customer_name || 'Cliente')

    console.log('💬 Mensagem montada:', message.substring(0, 100) + '...')

    // Buscar integração WhatsApp ativa
    const { data: integration, error: integrationError } = await supabase
      .from('integration_whatsapp')
      .select('api_url')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError) {
      console.error('❌ Erro ao buscar integração:', integrationError)
      throw integrationError
    }

    if (!integration?.api_url) {
      console.log('⚠️ WhatsApp não configurado para este tenant')
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'WhatsApp não configurado' 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('🌐 Enviando para:', integration.api_url)

    // Enviar mensagem via servidor WhatsApp
    const whatsappResponse = await fetch(`${integration.api_url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: order.customer_phone,
        message: message
      })
    })

    const whatsappResult = await whatsappResponse.json()
    console.log('📤 Resposta WhatsApp:', whatsappResult)

    if (!whatsappResponse.ok) {
      throw new Error(`Erro ao enviar WhatsApp: ${whatsappResult.error || 'Erro desconhecido'}`)
    }

    // Salvar no log de mensagens
    await supabase
      .from('whatsapp_messages')
      .insert({
        tenant_id: tenant_id,
        phone: order.customer_phone,
        message: message,
        type: 'outgoing',
        order_id: order.id,
        sent_at: new Date().toISOString()
      })

    console.log('✅ Mensagem enviada e registrada com sucesso')

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