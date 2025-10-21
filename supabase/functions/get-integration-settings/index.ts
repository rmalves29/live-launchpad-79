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

    // Get current integration settings from Supabase secrets
    const settings = {
      melhor_envio: {
        client_id: Deno.env.get('MELHOR_ENVIO_CLIENT_ID') || '',
        client_secret: Deno.env.get('MELHOR_ENVIO_CLIENT_SECRET') || '',
        access_token: Deno.env.get('MELHOR_ENVIO_ACCESS_TOKEN') || '',
        from_cep: Deno.env.get('MELHOR_ENVIO_FROM_CEP') || '31575060',
        env: Deno.env.get('MELHOR_ENVIO_ENV') || 'sandbox'
      },
      mercado_pago: {
        access_token: Deno.env.get('MP_ACCESS_TOKEN') || '',
        client_id: Deno.env.get('MP_CLIENT_ID') || '',
        client_secret: Deno.env.get('MP_CLIENT_SECRET') || '',
        public_key: Deno.env.get('MP_PUBLIC_KEY') || ''
      }
    }

    return new Response(JSON.stringify(settings), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error getting integration settings:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})