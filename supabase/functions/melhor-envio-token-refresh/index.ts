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

    console.log('🔄 Tentando renovar token Melhor Envio para tenant:', tenant_id)

    // Buscar integração
    const { data: integration, error: integrationError } = await supabase
      .from('shipping_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'melhor_envio')
      .single()

    if (integrationError || !integration) {
      console.error('❌ Integração não encontrada:', integrationError)
      return new Response(JSON.stringify({ error: 'Integração não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!integration.refresh_token) {
      console.error('❌ Refresh token não disponível')
      return new Response(JSON.stringify({ error: 'Refresh token não disponível' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Determinar URL baseada no ambiente
    const baseUrl = integration.sandbox 
      ? 'https://sandbox.melhorenvio.com.br'
      : 'https://melhorenvio.com.br'

    // Tentar renovar o token
    const refreshResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
        client_id: integration.client_id,
        client_secret: integration.client_secret
      })
    })

    const refreshResponseText = await refreshResponse.text()
    console.log('📡 Resposta renovação token:', refreshResponse.status, refreshResponseText.substring(0, 500))

    if (!refreshResponse.ok) {
      console.error('❌ Erro ao renovar token:', refreshResponse.status, refreshResponseText)
      return new Response(JSON.stringify({ 
        error: 'Falha ao renovar token',
        details: refreshResponseText 
      }), {
        status: refreshResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const tokenData = JSON.parse(refreshResponseText)

    // Calcular data de expiração
    const expiresAt = tokenData.expires_in 
      ? new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      : null

    // Atualizar integração no banco
    const { error: updateError } = await supabase
      .from('shipping_integrations')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || integration.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration.id)

    if (updateError) {
      console.error('❌ Erro ao atualizar token no banco:', updateError)
      return new Response(JSON.stringify({ error: 'Erro ao salvar token renovado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('✅ Token renovado com sucesso')

    return new Response(JSON.stringify({
      success: true,
      message: 'Token renovado com sucesso',
      expires_at: expiresAt
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Erro na renovação do token:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})