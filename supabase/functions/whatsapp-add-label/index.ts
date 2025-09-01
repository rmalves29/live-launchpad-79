import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AddLabelRequest {
  phone: string;
  label: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, label }: AddLabelRequest = await req.json();
    
    if (!phone || !label) {
      return new Response(
        JSON.stringify({ error: 'Phone and label are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Attempting to add label "${label}" to WhatsApp contact: ${phone}`);

    // Lista de APIs do WhatsApp para tentar adicionar a etiqueta
    const whatsappApis = [
      'http://localhost:8080/add-label',
      'http://localhost:3001/add-label'
    ];

    let success = false;
    let lastError = '';

    // Tentar adicionar etiqueta via diferentes APIs
    for (const apiUrl of whatsappApis) {
      try {
        console.log(`Trying WhatsApp API: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            phone: phone,
            label: label
          })
        });

        if (response.ok) {
          const result = await response.text();
          console.log(`Successfully added label via ${apiUrl}: ${result}`);
          success = true;
          break;
        } else if (response.status === 404) {
          console.log(`API not available: ${apiUrl}`);
          continue;
        } else {
          const errorText = await response.text();
          lastError = errorText;
          console.log(`Failed to add label via ${apiUrl}: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        console.log(`Error calling ${apiUrl}:`, error.message);
        lastError = error.message;
        continue;
      }
    }

    if (success) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Label "${label}" added to WhatsApp contact ${phone}` 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      console.warn(`Failed to add label "${label}" to ${phone} via all APIs. Last error: ${lastError}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Could not add label via WhatsApp APIs. Last error: ${lastError}`,
          fallback: 'Label functionality requires WhatsApp API server to be running'
        }),
        { 
          status: 202, // Accepted but not processed
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('Error in whatsapp-add-label function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});