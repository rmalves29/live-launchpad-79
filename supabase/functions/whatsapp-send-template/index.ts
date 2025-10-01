import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Normaliza número para envio (com DDI 55)
 * Nova regra: DDD ≤ 30 adiciona 9º dígito, DDD ≥ 31 remove 9º dígito
 */
function normalizeForSending(phone: string): string {
  if (!phone) return phone;
  
  const cleanPhone = phone.replace(/\D/g, '');
  const withoutDDI = cleanPhone.startsWith('55') ? cleanPhone.substring(2) : cleanPhone;
  
  let normalized = withoutDDI;
  const ddd = parseInt(withoutDDI.substring(0, 2));
  
  if (ddd <= 30) {
    // DDDs ≤ 30: adicionar 9º dígito se tiver 10 dígitos
    if (normalized.length === 10) {
      normalized = normalized.substring(0, 2) + '9' + normalized.substring(2);
      console.log(`✅ 9º dígito adicionado para envio (DDD ≤ 30): ${phone} -> ${normalized}`);
    }
  } else {
    // DDDs ≥ 31: remover 9º dígito se tiver 11 dígitos
    if (normalized.length === 11 && normalized[2] === '9') {
      normalized = normalized.substring(0, 2) + normalized.substring(3);
      console.log(`✅ 9º dígito removido para envio (DDD ≥ 31): ${phone} -> ${normalized}`);
    }
  }
  
  return '55' + normalized;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { tenant_id, phone, message } = await req.json()

    if (!tenant_id || !phone || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tenant_id, phone, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar integração WhatsApp do tenant
    console.log('Looking for WhatsApp integration for tenant:', tenant_id)
    
    const { data: integration, error: integrationError } = await supabase
      .from('integration_whatsapp')
      .select('api_url, is_active')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle()

    if (integrationError) {
      console.error('Error fetching WhatsApp integration:', integrationError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch WhatsApp integration', details: integrationError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Integration result:', integration)

    if (!integration?.api_url) {
      console.log('No active WhatsApp integration found for tenant:', tenant_id)
      return new Response(
        JSON.stringify({ 
          error: 'WhatsApp integration not configured', 
          tenant_id,
          message: 'Configure a integração do WhatsApp em Integrações > WhatsApp'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normalizar telefone e enviar mensagem
    const normalizedPhone = normalizeForSending(phone)
    const whatsappUrl = integration.api_url.endsWith('/') 
      ? integration.api_url + 'send' 
      : integration.api_url + '/send'

    console.log(`Sending message to ${normalizedPhone} via ${whatsappUrl}`)

    const response = await fetch(whatsappUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: normalizedPhone,
        message: message
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`WhatsApp server error: ${response.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ error: 'Failed to send message', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log('Message sent successfully:', result)

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in whatsapp-send-template:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
