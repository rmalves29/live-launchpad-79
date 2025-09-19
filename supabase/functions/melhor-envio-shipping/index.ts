import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { to_postal_code, tenant_id, products } = await req.json()

    console.log('🚚 Calculando frete Melhor Envio:', {
      to_postal_code,
      tenant_id,
      products: products?.length || 0
    })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar integração do Melhor Envio para este tenant
    const { data: integration, error: integrationError } = await supabase
      .from('shipping_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'melhor_envio')
      .eq('is_active', true)
      .maybeSingle()

    console.log('🔍 Integração encontrada:', {
      integration: integration ? 'sim' : 'não',
      error: integrationError ? integrationError.message : 'nenhum',
      tenant_id: tenant_id
    })

    if (integrationError) {
      console.error('Erro ao buscar integração:', integrationError)
      return new Response(JSON.stringify({ 
        error: 'Erro ao buscar configurações de frete',
        shipping_options: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!integration) {
      console.log('⚠️ Integração Melhor Envio não encontrada para tenant:', tenant_id)
      return new Response(JSON.stringify({ 
        error: 'Integração Melhor Envio não configurada',
        shipping_options: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ Integração encontrada:', {
      id: integration.id,
      sandbox: integration.sandbox,
      from_cep: integration.from_cep,
      has_token: !!integration.access_token,
      token_length: integration.access_token?.length || 0
    })

    // Configurar ambiente (sandbox ou produção)
    const isSandbox = integration.sandbox || integration.environment === 'sandbox'
    const baseUrl = isSandbox 
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br'

    console.log('🏗️ Configurações da API:', {
      isSandbox,
      baseUrl,
      environment: integration.environment || 'não definido'
    })

    // CEP de origem padrão ou da integração
    const fromCep = integration.from_cep || Deno.env.get('MELHOR_ENVIO_FROM_CEP') || '31575060'

    // Preparar dados dos produtos
    const packages = products?.map((product: any, index: number) => ({
      height: product.height || 2,
      width: product.width || 16,  
      length: product.length || 20,
      weight: product.weight || 0.3,
      insurance_value: product.insurance_value || 10,
      quantity: product.quantity || 1
    })) || [{
      height: 2,
      width: 16,
      length: 20,  
      weight: 0.3,
      insurance_value: 10,
      quantity: 1
    }]

    // Dados para cálculo de frete
    const shippingData = {
      from: {
        postal_code: fromCep.replace(/[^0-9]/g, '')
      },
      to: {
        postal_code: to_postal_code.replace(/[^0-9]/g, '')
      },
      products: packages
    }

    console.log('📦 Dados para cálculo de frete:', {
      baseUrl,
      fromCep,
      toCep: to_postal_code,
      packages: packages.length
    })

    // Fazer requisição para API do Melhor Envio
    console.log('🚀 Fazendo requisição para API do Melhor Envio...')
    console.log('URL:', `${baseUrl}/api/v2/me/shipment/calculate`)
    console.log('Headers:', { Authorization: `Bearer ${integration.access_token?.substring(0, 10)}...` })
    console.log('Body:', JSON.stringify(shippingData, null, 2))
    
    const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`
      },
      body: JSON.stringify(shippingData)
    })

    const responseText = await response.text()
    console.log('📡 Resposta Melhor Envio (status:', response.status, '):', responseText.substring(0, 1000))

    if (!response.ok) {
      console.error('❌ Erro na API Melhor Envio:', response.status, responseText)
      
      let errorMessage = `Erro ${response.status} na API do Melhor Envio`
      
      try {
        const errorData = JSON.parse(responseText)
        if (errorData.message) {
          errorMessage = errorData.message
        }
        console.error('💥 Detalhes do erro:', errorData)
      } catch (e) {
        console.error('💥 Resposta não é JSON válido:', responseText)
      }
      
      // Se token expirado, tentar usar configurações globais
      if (response.status === 401) {
        console.log('🔄 Token expirado/inválido, tentando token global...')
        
        const globalToken = Deno.env.get('MELHOR_ENVIO_ACCESS_TOKEN')
        if (globalToken) {
          console.log('🌐 Usando token global...')
          const globalResponse = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${globalToken}`
            },
            body: JSON.stringify(shippingData)
          })

          const globalResponseText = await globalResponse.text()
          console.log('🌐 Resposta com token global:', globalResponse.status, globalResponseText.substring(0, 500))

          if (globalResponse.ok) {
            const globalData = JSON.parse(globalResponseText)
            return new Response(JSON.stringify({
              success: true,
              shipping_options: globalData || []
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          } else {
            console.error('❌ Token global também falhou:', globalResponse.status, globalResponseText)
          }
        } else {
          console.error('❌ Nenhum token global disponível')
        }
      }

      return new Response(JSON.stringify({ 
        error: errorMessage,
        details: responseText,
        shipping_options: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = JSON.parse(responseText)
    
    console.log('✅ Opções de frete calculadas:', data?.length || 0)

    return new Response(JSON.stringify({
      success: true,
      shipping_options: data || []
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro no cálculo de frete:', error)
    
    return new Response(JSON.stringify({ 
      error: 'Erro interno no cálculo de frete',
      shipping_options: []
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})