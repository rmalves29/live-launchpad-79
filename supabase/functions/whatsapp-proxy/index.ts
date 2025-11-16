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
    
    // Handle different actions
    if (action === 'connect' || action === 'reset') {
      // Iniciar/resetar sessão
      console.log('🔄 Connecting/Resetting WhatsApp session');
      const connectResponse = await fetch(`${apiUrl}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': actualTenantId,
        },
      });

      const connectData = await connectResponse.json();
      console.log('✅ Connect response:', connectData);

      if (connectData.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Conexão iniciada com sucesso',
            status: connectData.status
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: connectData.error || 'Erro ao iniciar conexão'
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // Construir URL correta baseado no endpoint do backend
    // Status: /status/:tenantId
    // QR: /qr com header x-tenant-id
    let fullUrl: string;
    let headers: Record<string, string>;
    
    if (action === 'status') {
      fullUrl = `${apiUrl}/status/${actualTenantId}`;
      headers = {
        'Accept': 'application/json',
      };
    } else {
      // Para QR, usar /qr com header x-tenant-id
      fullUrl = `${apiUrl}/qr`;
      headers = {
        'Accept': 'application/json',
        'x-tenant-id': actualTenantId,
      };
    }
    
    console.log('📡 Forwarding to WhatsApp server:', fullUrl);
    console.log('📡 Headers:', JSON.stringify(headers));

    // Make request to WhatsApp server
    const whatsappResponse = await fetch(fullUrl, {
      method: 'GET',
      headers,
    });

    console.log('📡 Response status:', whatsappResponse.status);
    console.log('📄 Content-Type:', whatsappResponse.headers.get('content-type'));

    // Se não há conteúdo (204), significa que o QR ainda não está pronto
    if (whatsappResponse.status === 204) {
      console.log('⏳ QR Code not ready yet (204)');
      return new Response(
        JSON.stringify({
          success: true,
          connected: false,
          status: 'initializing',
          message: 'Aguardando inicialização do WhatsApp...'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentType = whatsappResponse.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const jsonData = await whatsappResponse.json();
      console.log('✅ JSON response:', jsonData);
      
      // Processar resposta do backend
      if (jsonData.ok && jsonData.qr) {
        // QR Code disponível
        return new Response(
          JSON.stringify({
            success: true,
            connected: false,
            status: 'qr_ready',
            qrCode: jsonData.qrDataURL || jsonData.qr,
            message: 'QR Code gerado com sucesso. Escaneie com seu WhatsApp.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (jsonData.ok && jsonData.status === 'online') {
        // Já conectado
        return new Response(
          JSON.stringify({
            success: true,
            connected: true,
            status: 'connected',
            message: 'WhatsApp está conectado'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else if (jsonData.error) {
        // Erro
        return new Response(
          JSON.stringify({
            success: false,
            connected: false,
            status: 'error',
            error: jsonData.error,
            message: jsonData.error
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Retornar resposta original se não for nenhum dos casos acima
      return new Response(JSON.stringify(jsonData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // If not JSON, return error
    const text = await whatsappResponse.text();
    console.error('❌ Unexpected response format');
    console.error('📄 Response preview:', text.substring(0, 500));
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unexpected response format from WhatsApp server',
        status: 'error',
        message: 'Não foi possível obter resposta do servidor WhatsApp. Verifique se o servidor está funcionando corretamente.'
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
