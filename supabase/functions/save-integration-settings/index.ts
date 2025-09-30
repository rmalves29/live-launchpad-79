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
    const { melhor_envio, mercado_pago, tenant_id } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('Saving integration settings for tenant:', tenant_id)

    // Save Melhor Envio settings to integration_me (tenant-specific)
    if (melhor_envio && tenant_id) {
      const meData = {
        tenant_id,
        client_id: melhor_envio.client_id || null,
        client_secret: melhor_envio.client_secret || null,
        access_token: melhor_envio.access_token || null,
        from_cep: melhor_envio.from_cep || '31575060',
        environment: melhor_envio.env || 'production',
        is_active: true,
        updated_at: new Date().toISOString()
      }

      // Check if record exists
      const { data: existing } = await supabase
        .from('integration_me')
        .select('id')
        .eq('tenant_id', tenant_id)
        .maybeSingle()

      let error
      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('integration_me')
          .update(meData)
          .eq('tenant_id', tenant_id)
        error = updateError
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('integration_me')
          .insert({
            ...meData,
            created_at: new Date().toISOString()
          })
        error = insertError
      }

      if (error) {
        console.error('Error saving Melhor Envio settings:', error)
        return new Response(JSON.stringify({ error: 'Failed to save ME settings' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('Melhor Envio settings saved successfully')

      // Also save to app_settings for global settings
      const { error: appError } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          melhor_envio_from_cep: melhor_envio.from_cep,
          melhor_envio_env: melhor_envio.env
        }, { onConflict: 'id' })

      if (appError) {
        console.error('Error updating app_settings:', appError)
      }
    }

    // Save Mercado Pago settings to integration_mp (tenant-specific)
    if (mercado_pago && tenant_id) {
      const mpData = {
        tenant_id,
        client_id: mercado_pago.client_id || null,
        client_secret: mercado_pago.client_secret || null,
        access_token: mercado_pago.access_token || null,
        public_key: mercado_pago.public_key || null,
        webhook_secret: mercado_pago.webhook_secret || 'webhook_secret_123',
        environment: mercado_pago.environment || 'production',
        is_active: true,
        updated_at: new Date().toISOString()
      }

      // Check if record exists
      const { data: existing } = await supabase
        .from('integration_mp')
        .select('id')
        .eq('tenant_id', tenant_id)
        .maybeSingle()

      let error
      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('integration_mp')
          .update(mpData)
          .eq('tenant_id', tenant_id)
        error = updateError
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('integration_mp')
          .insert({
            ...mpData,
            created_at: new Date().toISOString()
          })
        error = insertError
      }

      if (error) {
        console.error('Error saving Mercado Pago settings:', error)
        return new Response(JSON.stringify({ error: 'Failed to save MP settings' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      console.log('Mercado Pago settings saved successfully')
    }

    return new Response(JSON.stringify({
      success: true, 
      message: 'Configurações recebidas. Para salvar credenciais sensíveis, use o painel de segredos do Supabase.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error saving integration settings:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})