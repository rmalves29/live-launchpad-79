import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone, label } = await req.json()

    if (!phone || !label) {
      return new Response(
        JSON.stringify({ error: 'Phone and label are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get WhatsApp server URL from environment or use default
    const whatsappUrl = Deno.env.get('WHATSAPP_API_URL') || 'http://localhost:3333'

    // Call WhatsApp server to add label
    const response = await fetch(`${whatsappUrl}/add-label`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: phone,
        label: label
      })
    })

    const responseData = await response.json()

    console.log(`WhatsApp add label response for ${phone}:`, responseData)

    return new Response(
      JSON.stringify({ 
        success: response.ok,
        data: responseData,
        phone: phone,
        label: label
      }),
      { 
        status: response.ok ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error adding WhatsApp label:', error)
    
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : 'Erro desconhecido') || 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})