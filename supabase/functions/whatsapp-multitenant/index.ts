import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, tenantId, ...params } = await req.json()

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Tenant ID é obrigatório' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // URL do servidor WhatsApp por tenant (DB) -> fallback para secret global -> localhost
    let whatsappUrl = Deno.env.get('WHATSAPP_MULTITENANT_URL') || 'http://localhost:3333'
    if (supabaseAdmin) {
      const { data: integration, error } = await supabaseAdmin
        .from('integration_whatsapp')
        .select('api_url, is_active')
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!error && integration && integration.is_active && integration.api_url) {
        whatsappUrl = integration.api_url
      }
    }

    let response: Response

    switch (action) {
      case 'send': {
        const { phone, message } = params as any
        if (!phone || !message) {
          return new Response(
            JSON.stringify({ error: 'Telefone e mensagem são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        response = await fetch(`${whatsappUrl}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
          body: JSON.stringify({ phone, message })
        })
        break
      }

      case 'broadcast': {
        const { phones, message: broadcastMessage } = params as any
        if (!phones || !Array.isArray(phones) || !broadcastMessage) {
          return new Response(
            JSON.stringify({ error: 'Lista de telefones e mensagem são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        response = await fetch(`${whatsappUrl}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
          body: JSON.stringify({ phones, message: broadcastMessage })
        })
        break
      }

      case 'status': {
        response = await fetch(`${whatsappUrl}/status/${tenantId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })
        break
      }

      case 'restart': {
        response = await fetch(`${whatsappUrl}/restart/${tenantId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        break
      }

      case 'add-label': {
        const { phone: labelPhone, label } = params as any
        if (!labelPhone || !label) {
          return new Response(
            JSON.stringify({ error: 'Telefone e etiqueta são obrigatórios' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        response = await fetch(`${whatsappUrl}/add-label`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': tenantId },
          body: JSON.stringify({ phone: labelPhone, label })
        })
        break
      }

      default:
        return new Response(
          JSON.stringify({ error: `Ação não suportada: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    const responseData = await response.json().catch(() => ({}))

    console.log(`WhatsApp Multi-Tenant ${action} para tenant ${tenantId}:`, responseData)

    return new Response(
      JSON.stringify({ success: response.ok, data: responseData, tenantId, action }),
      { status: response.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in WhatsApp Multi-Tenant function:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})