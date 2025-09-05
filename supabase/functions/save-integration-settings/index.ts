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
    const { melhor_envio, mercado_pago } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Note: In a real implementation, these would be saved as Supabase secrets
    // For now, we'll acknowledge the settings were received
    console.log('Saving integration settings:', {
      melhor_envio: {
        ...melhor_envio,
        client_secret: melhor_envio.client_secret ? '[HIDDEN]' : '',
        access_token: melhor_envio.access_token ? '[HIDDEN]' : ''
      },
      mercado_pago: {
        ...mercado_pago,
        access_token: mercado_pago.access_token ? '[HIDDEN]' : '',
        client_secret: mercado_pago.client_secret ? '[HIDDEN]' : ''
      }
    })

    // In a production environment, you would:
    // 1. Use Supabase CLI to update secrets
    // 2. Or integrate with a proper secret management system
    // 3. Or store encrypted values in a secure table

    // For this demo, we'll save some non-sensitive settings to the database
    if (melhor_envio.from_cep || melhor_envio.env) {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          melhor_envio_from_cep: melhor_envio.from_cep,
          melhor_envio_env: melhor_envio.env
        }, { onConflict: 'id' })

      if (error) {
        console.error('Error updating app_settings:', error)
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Configurações recebidas. Para salvar credenciais sensíveis, use o painel de segredos do Supabase.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error saving integration settings:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})