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
    console.log('🔍 [PROXY] Received request:', { 
      tenant_id: actualTenantId, 
      action, 
      method: req.method,
      url: req.url 
    });

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
    
    console.log('🔗 [PROXY] API URL:', apiUrl);
    
    // Handle different actions
    if (action === 'reset') {
      // Reset sessão
      console.log('🔄 Resetting WhatsApp session');
      const resetResponse = await fetch(`${apiUrl}/reset/${actualTenantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const resetData = await resetResponse.json();
      console.log('✅ Reset response:', resetData);

      return new Response(
        JSON.stringify(resetData),
        { 
          status: resetResponse.ok ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    if (action === 'connect') {
      // Iniciar sessão
      console.log('🔄 [PROXY-CONNECT] Iniciando conexão WhatsApp');
      console.log('📍 [PROXY-CONNECT] API URL:', apiUrl);
      console.log('📍 [PROXY-CONNECT] Tenant ID:', actualTenantId);
      console.log('📍 [PROXY-CONNECT] Full URL:', `${apiUrl}/connect`);
      
      try {
        const connectResponse = await fetch(`${apiUrl}/connect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': actualTenantId,
          },
        });
        
        console.log('📡 [PROXY-CONNECT] Response status:', connectResponse.status);
        console.log('📡 [PROXY-CONNECT] Response ok:', connectResponse.ok);
        console.log('📡 [PROXY-CONNECT] Response headers:', JSON.stringify(Object.fromEntries(connectResponse.headers.entries())));
        
        const responseText = await connectResponse.text();
        console.log('📡 [PROXY-CONNECT] Response body (raw):', responseText);
        
        let connectData;
        try {
          connectData = JSON.parse(responseText);
        } catch (e) {
          console.error('❌ [PROXY-CONNECT] Erro ao parsear JSON:', e);
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'Resposta inválida do servidor WhatsApp',
              raw: responseText.substring(0, 500)
            }),
            { status: 502, headers: corsHeaders }
          );
        }
        
        console.log('✅ [PROXY-CONNECT] Connect response data:', connectData);

        if (connectData.ok) {
          return new Response(
            JSON.stringify({
              ok: true,
              tenantId: actualTenantId,
              status: connectData.status || 'initializing',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify(connectData),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (fetchError) {
        console.error('❌ [PROXY-CONNECT] Erro na requisição:', fetchError);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'Erro ao conectar com servidor WhatsApp',
            details: fetchError.message
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
