import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BulkLabelRequest {
  phones: string[]
  label: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phones, label }: BulkLabelRequest = await req.json()

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'phones array is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!label) {
      return new Response(
        JSON.stringify({ success: false, error: 'label is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Lista de APIs WhatsApp para tentar
    const whatsappApis = [
      'http://localhost:3333',
      'http://localhost:3000',
      'http://127.0.0.1:3333',
      'http://127.0.0.1:3000'
    ]

    let successCount = 0
    let errorCount = 0
    const results = []

    // Tentar adicionar label para cada telefone
    for (const phone of phones) {
      let phoneSuccess = false
      
      for (const apiUrl of whatsappApis) {
        try {
          console.log(`Tentando adicionar label "${label}" para ${phone} via ${apiUrl}`)
          
          const response = await fetch(`${apiUrl}/add-label`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone: phone,
              label: label
            })
          })

          if (response.ok) {
            const result = await response.json()
            console.log(`Label "${label}" adicionada com sucesso para ${phone}`)
            results.push({ phone, success: true, api: apiUrl })
            phoneSuccess = true
            successCount++
            break
          } else if (response.status === 404) {
            console.log(`API ${apiUrl} não encontrada, tentando próxima...`)
            continue
          } else {
            const errorText = await response.text()
            console.log(`Falha na API ${apiUrl} para ${phone}: ${response.status} - ${errorText}`)
          }
        } catch (error) {
          console.log(`Erro ao conectar com ${apiUrl} para ${phone}: ${error.message}`)
          continue
        }
      }

      if (!phoneSuccess) {
        console.log(`Falha ao adicionar label para ${phone} em todas as APIs`)
        results.push({ phone, success: false, error: 'All APIs failed' })
        errorCount++
      }
    }

    const overallSuccess = successCount > 0

    return new Response(
      JSON.stringify({ 
        success: overallSuccess,
        successCount,
        errorCount,
        total: phones.length,
        results,
        message: overallSuccess 
          ? `Labels adicionadas: ${successCount}/${phones.length}`
          : 'Nenhuma label foi adicionada. Verifique se o servidor WhatsApp está executando.'
      }),
      { 
        status: overallSuccess ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in whatsapp-add-label-bulk function:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})