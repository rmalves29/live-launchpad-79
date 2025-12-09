const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppIntegration {
  api_url: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, action, tenantId } = await req.json();
    const actualTenantId = tenant_id || tenantId;
    console.log('🔍 Proxy request:', { tenant_id: actualTenantId, action });

    if (!actualTenantId) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get WhatsApp API URL from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/integration_whatsapp?tenant_id=eq.${actualTenantId}&select=api_url`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    const integrations = await response.json() as WhatsAppIntegration[];
    
    if (!integrations || integrations.length === 0) {
      console.error('❌ No WhatsApp integration found for tenant:', actualTenantId);
      return new Response(
        JSON.stringify({ error: 'WhatsApp integration not configured' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const apiUrl = integrations[0].api_url;
    
    // Construir URL correta: /qr/:tenant_id ou /status/:tenant_id
    const endpoint = action === 'status' ? 'status' : 'qr';
    const fullUrl = `${apiUrl}/${endpoint}/${actualTenantId}`;
    
    console.log('📡 Forwarding to WhatsApp server:', fullUrl);

    // Make request to WhatsApp server with tenant_id in URL
    const whatsappResponse = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/json',
      },
    });

    console.log('📡 Response status:', whatsappResponse.status);
    console.log('📄 Content-Type:', whatsappResponse.headers.get('content-type'));

    const contentType = whatsappResponse.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const jsonData = await whatsappResponse.json();
      console.log('✅ JSON response:', jsonData);
      return new Response(JSON.stringify(jsonData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // If HTML, extract QR code or status
    const html = await whatsappResponse.text();
    console.log('📄 HTML length:', html.length);
    console.log('📄 HTML first 1000 chars:', html.substring(0, 1000));

    // Check if WhatsApp is already connected
    if (html.includes('✅ Conectado') || html.includes('Status: online')) {
      console.log('✅ WhatsApp is already connected');
      return new Response(
        JSON.stringify({
          success: true,
          connected: true,
          status: 'connected',
          message: 'WhatsApp está conectado'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to extract QR code - buscar por data:image
    if (html.includes('data:image')) {
      const imgMatch = html.match(/src=["']([^"']*data:image[^"']*)["']/i);
      console.log('🔍 QR Code data:image match:', imgMatch ? 'Found' : 'Not found');

      if (imgMatch && imgMatch[1]) {
        const qrCode = imgMatch[1];
        console.log('✅ QR Code found! Length:', qrCode.length);
        console.log('📸 QR Code preview:', qrCode.substring(0, 100));
        
        return new Response(
          JSON.stringify({
            success: true,
            connected: false,
            qrCode,
            message: 'QR Code gerado com sucesso'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Se não encontrou data:image, tentar qualquer src de img
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    console.log('🔍 Generic image match:', imgMatch ? 'Found' : 'Not found');

    if (imgMatch && imgMatch[1]) {
      const qrCode = imgMatch[1];
      console.log('✅ QR Code found (generic)! Length:', qrCode.length);
      
      return new Response(
        JSON.stringify({
          success: true,
          connected: false,
          qrCode,
          message: 'QR Code gerado com sucesso'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No QR code found - return HTML for debugging
    console.error('❌ No QR Code found in HTML');
    console.error('🔍 Full HTML:', html);
    
    return new Response(
      JSON.stringify({
        error: 'Could not extract QR Code from response',
        htmlPreview: html.substring(0, 500),
        connected: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('❌ Proxy error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to proxy request to WhatsApp server'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
