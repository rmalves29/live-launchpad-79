import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { tenant_id } = await req.json()

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: 'tenant_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('🔍 Testando token Melhor Envio para tenant:', tenant_id)

    // Buscar integração
    const { data: integration, error: integrationError } = await supabase
      .from('shipping_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'melhor_envio')
      .single()

    if (integrationError || !integration) {
      console.error('❌ Integração não encontrada:', integrationError)
      return new Response(JSON.stringify({ 
        valid: false, 
        error: 'Integração não encontrada',
        needs_setup: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determinar URL baseada no ambiente
    const baseUrl = integration.sandbox 
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br'

    console.log('🧪 Testando token na API:', baseUrl)

    // Testar token fazendo uma requisição simples para /me
    const testResponse = await fetch(`${baseUrl}/api/v2/me`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${integration.access_token}`
      }
    })

    const testResponseText = await testResponse.text()
    console.log('📡 Resposta do teste:', testResponse.status, testResponseText.substring(0, 200))

    if (testResponse.ok) {
      // Token é válido
      console.log('✅ Token válido')
      
      try {
        const userData = JSON.parse(testResponseText)
        return new Response(JSON.stringify({
          valid: true,
          user_info: {
            name: userData.firstname + ' ' + userData.lastname,
            email: userData.email,
            company: userData.company?.name || 'N/A'
          },
          integration_info: {
            sandbox: integration.sandbox,
            from_cep: integration.from_cep
          }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (e) {
        console.log('⚠️ Token válido mas resposta não é JSON válido')
        return new Response(JSON.stringify({
          valid: true,
          message: 'Token válido'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      // Se token inválido/expirado e temos refresh_token, tentar renovar automaticamente
      if ((testResponse.status === 401 || testResponse.status === 403) && integration.refresh_token) {
        console.log('🔄 Token expirado, tentando renovar automaticamente...')
        
        try {
          // Chamar função de refresh
          const refreshResponse = await supabase.functions.invoke('melhor-envio-token-refresh', {
            body: { tenant_id }
          });
          
          if (refreshResponse.data && !refreshResponse.error) {
            console.log('✅ Token renovado automaticamente, testando novamente...')
            
            // Buscar o token atualizado
            const { data: updatedIntegration } = await supabase
              .from('shipping_integrations')
              .select('access_token')
              .eq('tenant_id', tenant_id)
              .eq('provider', 'melhor_envio')
              .single()
            
            if (updatedIntegration) {
              // Testar novamente com o novo token
              const retestResponse = await fetch(`${baseUrl}/api/v2/me`, {
                method: 'GET',
                headers: {
                  'Accept': 'application/json',
                  'Authorization': `Bearer ${updatedIntegration.access_token}`
                }
              })
              
              if (retestResponse.ok) {
                const userData = await retestResponse.json()
                console.log('✅ Token renovado e válido')
                
                return new Response(JSON.stringify({
                  valid: true,
                  user_info: {
                    name: userData.firstname + ' ' + userData.lastname,
                    email: userData.email,
                    company: userData.company?.name || 'N/A'
                  },
                  integration_info: {
                    sandbox: integration.sandbox,
                    from_cep: integration.from_cep
                  }
                }), {
                  status: 200,
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
              }
            }
          }
        } catch (refreshError) {
          console.error('❌ Erro ao renovar token automaticamente:', refreshError)
        }
      }
      
      // Token inválido ou expirado
      console.error('❌ Token inválido:', testResponse.status, testResponseText)
      
      let errorDetails = 'Token expirado ou inválido'
      try {
        const errorData = JSON.parse(testResponseText)
        errorDetails = errorData.message || errorDetails
      } catch (e) {
        // Ignorar erro de parsing
      }

      // Usar apenas scopes básicos e válidos
      const validScopes = [
        'cart-read', 'cart-write',
        'companies-read', 'companies-write', 
        'coupons-read', 'coupons-write',
        'notifications-read',
        'orders-read',
        'products-read', 'products-write',
        'purchases-read',
        'shipping-calculate', 'shipping-cancel', 'shipping-checkout', 
        'shipping-companies', 'shipping-generate', 'shipping-preview', 
        'shipping-print', 'shipping-share', 'shipping-tracking',
        'users-read', 'users-write'
      ].join(',');

      return new Response(JSON.stringify({ 
        valid: false,
        error: errorDetails,
        needs_oauth: true,
        oauth_url: `${baseUrl}/oauth/authorize?client_id=${integration.client_id}&redirect_uri=${encodeURIComponent('https://hxtbsieodbtzgcvvkeqx.supabase.co/functions/v1/callback-empresa?service=melhorenvio&action=oauth')}&response_type=code&state=${tenant_id}&scope=${validScopes}`
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

  } catch (error) {
    console.error('❌ Erro no teste do token:', error)
    return new Response(JSON.stringify({ 
      valid: false,
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})