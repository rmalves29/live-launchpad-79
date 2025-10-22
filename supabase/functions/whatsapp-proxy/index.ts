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
      console.log('📄 HTML length:', html.length);
      console.log('📄 HTML sample:', html.substring(0, 1000));
      
      // Tentar extrair o QR code da imagem (suporta vários formatos)
      const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*>/) || 
                       html.match(/src="([^"]*data:image[^"]+)"/);
      
      const statusMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) ||
                         html.match(/<div[^>]*class="status"[^>]*>([^<]+)<\/div>/);
      
      console.log('🔍 Image match:', imgMatch ? 'Found' : 'Not found');
      console.log('🔍 Status match:', statusMatch ? statusMatch[1] : 'Not found');
      
      if (imgMatch && imgMatch[1]) {
        const qrCode = imgMatch[1];
        console.log('✅ QR Code extracted, length:', qrCode.length);
        console.log('🎯 QR Code preview:', qrCode.substring(0, 100));
        
        return new Response(
          JSON.stringify({
            qrCode: qrCode,
            message: statusMatch ? statusMatch[1] : 'Escaneie o QR Code',
            source: 'html'
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } else {
        console.error('❌ No QR Code found in HTML');
        console.error('🔍 HTML structure:', html.substring(0, 2000));
        
        return new Response(
          JSON.stringify({
            error: 'QR Code not found in HTML',
            message: 'O servidor retornou HTML mas não foi possível extrair o QR Code',
            htmlPreview: html.substring(0, 1500)
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
