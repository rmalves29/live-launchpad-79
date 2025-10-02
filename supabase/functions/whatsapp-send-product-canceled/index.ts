import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('🚀 Edge function whatsapp-send-product-canceled iniciada')
  console.log('Method:', req.method)
  console.log('Headers:', Object.fromEntries(req.headers.entries()))
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('📦 Body recebido:', JSON.stringify(body))
    
    const { cart_item_id, product_id, tenant_id, customer_phone } = body
    console.log('🗑️ Processando produto cancelado:', { cart_item_id, product_id, tenant_id, customer_phone })

    if (!product_id || !tenant_id || !customer_phone) {
      throw new Error('product_id, tenant_id e customer_phone são obrigatórios')
    }

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Buscar dados do produto
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (productError) throw productError
    if (!product) throw new Error('Produto não encontrado')

    console.log('📦 Produto encontrado:', product.name)

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

    // Buscar template PRODUCT_CANCELED
    const { data: templates } = await supabase
      .from('whatsapp_templates')
      .select('content')
      .eq('tenant_id', tenant_id)
      .eq('type', 'PRODUCT_CANCELED')
      .maybeSingle()

    const template = templates?.content || `❌ *Produto Cancelado*\n\nO produto "{{produto}}" foi cancelado do seu pedido.\n\nQualquer dúvida, entre em contato conosco.`

    // Substituir variáveis do template
    const message = template
      .replace(/\{\{produto\}\}/g, product.name)
      .replace(/\{\{codigo\}\}/g, product.code || '')
      .replace(/\{\{quantidade\}\}/g, '1')

    console.log('📤 Enviando para:', customer_phone)
    console.log('💬 Mensagem:', message)
    
    // Enviar via servidor Node.js
    const whatsappResponse = await fetch(`${nodeServerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: customer_phone,
        message: message
      })
    })

    const whatsappResult = await whatsappResponse.json()
    console.log('📤 Resposta WhatsApp:', whatsappResult)

    if (!whatsappResponse.ok) {
      throw new Error(`Erro ao enviar WhatsApp: ${whatsappResult.error || 'Erro desconhecido'}`)
    }

    console.log('✅ Mensagem de produto cancelado enviada com sucesso')

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Mensagem enviada com sucesso',
        product_name: product.name
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
