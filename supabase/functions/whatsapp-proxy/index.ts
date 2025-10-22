import { corsHeaders } from '../_shared/cors.ts';

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
    console.log('📄 HTML sample:', html.substring(0, 500));

    // Check if WhatsApp is already connected
    if (html.includes('✅ Conectado') || (html.includes('Status: online') && html.includes('Conectado'))) {
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

    // Try to extract QR code
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    console.log('🔍 Image match:', imgMatch ? 'Found' : 'Not found');

    if (imgMatch && imgMatch[1]) {
      const qrCode = imgMatch[1];
      console.log('✅ QR Code found, length:', qrCode.length);
      console.log('📸 QR Code preview:', qrCode.substring(0, 100));
      
      return new Response(
        JSON.stringify({
          success: true,
          qrCode,
          message: 'QR Code gerado com sucesso'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for status without QR code
    const statusMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    console.log('🔍 Status match:', statusMatch ? statusMatch[1] : 'Not found');

    if (statusMatch) {
      return new Response(
        JSON.stringify({
          success: true,
          status: statusMatch[1],
          message: 'Aguardando QR Code...'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No QR code or recognizable status found
    console.error('❌ No QR Code found in HTML');
    console.error('🔍 HTML structure:', html.substring(0, 1000));
    
    return new Response(
      JSON.stringify({
        error: 'Could not extract QR Code from response',
        htmlPreview: html.substring(0, 200)
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
