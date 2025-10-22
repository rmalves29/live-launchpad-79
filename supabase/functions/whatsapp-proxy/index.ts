import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Ler os parâmetros do body da requisição
    const { action, tenantId, serverUrl } = await req.json();

    console.log('📥 Received params:', { action, tenantId, serverUrl });

    if (!tenantId || !serverUrl) {
      console.error('❌ Missing required params');
      return new Response(
        JSON.stringify({ error: 'Missing tenantId or serverUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let targetUrl = '';
    
    if (action === 'qr') {
      targetUrl = `${serverUrl}/qr/${tenantId}`;
    } else if (action === 'status') {
      targetUrl = `${serverUrl}/status/${tenantId}`;
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Use "qr" or "status"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔄 Proxying request to:', targetUrl);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Supabase-Edge-Function',
      },
    });

    console.log('📡 Response status:', response.status);
    
    const contentType = response.headers.get('content-type') || '';
    console.log('📄 Content-Type:', contentType);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Server responded with ${response.status}`,
          status: response.status
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Se for HTML (página do QR), tentar extrair o QR code
    if (contentType.includes('text/html')) {
      const html = await response.text();
      console.log('📄 HTML response (first 500 chars):', html.substring(0, 500));
      
      // Tentar extrair o QR code da imagem
      const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/);
      const statusMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
      
      if (imgMatch && imgMatch[1]) {
        return new Response(
          JSON.stringify({
            qrCode: imgMatch[1],
            message: statusMatch ? statusMatch[1] : 'Escaneie o QR Code',
            source: 'html'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            error: 'QR Code not found in HTML',
            html: html.substring(0, 1000)
          }),
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // Se for JSON, retornar direto
    if (contentType.includes('application/json')) {
      const data = await response.json();
      console.log('📊 JSON response:', data);
      
      return new Response(
        JSON.stringify(data),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Se for outro tipo de conteúdo
    const text = await response.text();
    return new Response(
      JSON.stringify({
        contentType,
        data: text.substring(0, 1000)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('❌ Proxy error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
