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

    let finalIntegration = integration

    // Se não encontrou integração do tenant, buscar integração global
    if (!integration) {
      console.log('🌐 Buscando integração global...')
      const { data: globalIntegration, error: globalError } = await supabase
        .from('shipping_integrations')
        .select('*')
        .eq('provider', 'melhor_envio')
        .eq('is_active', true)
        .is('tenant_id', null)
        .maybeSingle()

      if (globalIntegration) {
        finalIntegration = globalIntegration
        console.log('✅ Usando integração global do Melhor Envio')
      }
    }

    if (integrationError && !finalIntegration) {
      console.error('Erro ao buscar integração:', integrationError)
      return new Response(JSON.stringify({ 
        error: 'Erro ao buscar configurações de frete',
        shipping_options: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!finalIntegration) {
      console.log('⚠️ Nenhuma integração Melhor Envio encontrada (tenant ou global)')
      return new Response(JSON.stringify({ 
        error: 'Integração Melhor Envio não configurada',
        shipping_options: []
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ Integração encontrada:', {
      id: finalIntegration.id,
      sandbox: finalIntegration.sandbox,
      from_cep: finalIntegration.from_cep,
      has_token: !!finalIntegration.access_token,
      token_length: finalIntegration.access_token?.length || 0,
      is_global: !finalIntegration.tenant_id
    })

    // Configurar ambiente (sandbox ou produção)
    const isSandbox = finalIntegration.sandbox || finalIntegration.environment === 'sandbox'
    const baseUrl = isSandbox 
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br'

    console.log('🏗️ Configurações da API:', {
      isSandbox,
      baseUrl,
      environment: finalIntegration.environment || 'não definido'
    })

    // CEP de origem padrão ou da integração
    const fromCep = finalIntegration.from_cep || Deno.env.get('MELHOR_ENVIO_FROM_CEP') || '31575060'

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
    console.log('Headers:', { Authorization: `Bearer ${finalIntegration.access_token?.substring(0, 10)}...` })
    console.log('Body:', JSON.stringify(shippingData, null, 2))
    
    const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${finalIntegration.access_token}`
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
      
      // Se token expirado, tentar renovar token via refresh_token ou usar configurações globais
      if (response.status === 401) {
        console.log('🔄 Token expirado/inválido, tentando renovar...')
        
        let newToken = null
        
        // Tentar renovar token se temos refresh_token
        if (finalIntegration.refresh_token) {
          console.log('🔄 Tentando renovar token com refresh_token...')
          try {
            const refreshResponse = await fetch(`${baseUrl}/oauth/token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                grant_type: 'refresh_token',
                refresh_token: finalIntegration.refresh_token,
                client_id: finalIntegration.client_id,
                client_secret: finalIntegration.client_secret
              })
            })

            if (refreshResponse.ok) {
              const tokenData = await refreshResponse.json()
              newToken = tokenData.access_token
              
              // Atualizar token no banco
              await supabase
                .from('shipping_integrations')
                .update({
                  access_token: newToken,
                  refresh_token: tokenData.refresh_token || finalIntegration.refresh_token,
                  expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
                })
                .eq('id', finalIntegration.id)
              
              console.log('✅ Token renovado com sucesso')
            } else {
              const errorText = await refreshResponse.text()
              console.error('❌ Erro ao renovar token:', refreshResponse.status, errorText)
            }
          } catch (refreshError) {
            console.error('❌ Erro na renovação do token:', refreshError)
          }
        }
        
        // Se não conseguiu renovar, tentar token global
        if (!newToken) {
          const globalToken = Deno.env.get('MELHOR_ENVIO_ACCESS_TOKEN')
          if (globalToken) {
            console.log('🌐 Usando token global...')
            newToken = globalToken
          } else {
            console.error('❌ Nenhum token disponível (renovação falhou e sem token global)')
          }
        }
        
        // Tentar novamente com o novo token
        if (newToken) {
          const retryResponse = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${newToken}`
            },
            body: JSON.stringify(shippingData)
          })

          const retryResponseText = await retryResponse.text()
          console.log('🔄 Resposta com token renovado/global:', retryResponse.status, retryResponseText.substring(0, 500))

          if (retryResponse.ok) {
            const retryData = JSON.parse(retryResponseText)
            return new Response(JSON.stringify({
              success: true,
              shipping_options: retryData || []
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          } else {
            console.error('❌ Falha mesmo com token renovado/global:', retryResponse.status, retryResponseText)
          }
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