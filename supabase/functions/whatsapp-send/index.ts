import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const withoutDDI = cleaned.startsWith('55') ? cleaned.substring(2) : cleaned;
  const ddd = parseInt(withoutDDI.substring(0, 2));
  
  let normalized = withoutDDI;
  
  if (ddd <= 30) {
    if (normalized.length === 10) {
      normalized = normalized.substring(0, 2) + '9' + normalized.substring(2);
    }
  } else {
    if (normalized.length === 11 && normalized[2] === '9') {
      normalized = normalized.substring(0, 2) + normalized.substring(3);
    }
  }
  
  return '55' + normalized;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { tenant_id, phone, message } = await req.json()

    if (!tenant_id || !phone || !message) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: tenant_id, phone, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Buscar integração WhatsApp
    const { data: integration } = await supabase
      .from('integration_whatsapp')
      .select('api_url')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!integration?.api_url) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp não configurado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Enviar mensagem
    const normalizedPhone = normalizePhone(phone)
    const whatsappUrl = `${integration.api_url}/send`

    const response = await fetch(whatsappUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenant_id,
        phone: normalizedPhone,
        message
      })
    })

    if (!response.ok) {
      throw new Error('Falha ao enviar mensagem')
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
