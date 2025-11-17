const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppIntegration {
  api_url: string;
}

// Helper para fazer fetch com timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout após ${timeoutMs}ms`);
    }
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, action, tenantId } = await req.json();
    const actualTenantId = tenant_id || tenantId;
    
    console.log('🔍 [PROXY] Request:', { 
      tenant_id: actualTenantId, 
      action 
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

    // Buscar configuração do WhatsApp
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetchWithTimeout(
      `${supabaseUrl}/rest/v1/integration_whatsapp?tenant_id=eq.${actualTenantId}&select=api_url`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      },
      10000 // 10 segundos timeout
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
    
    // ========== RESET ==========
    if (action === 'reset') {
      console.log('🔄 [PROXY-RESET] Resetando sessão');
      
      try {
        const resetResponse = await fetchWithTimeout(
          `${apiUrl}/reset/${actualTenantId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          30000 // 30 segundos para reset
        );

        const resetData = await resetResponse.json();
        console.log('✅ [PROXY-RESET] Success:', resetData);

        return new Response(
          JSON.stringify(resetData),
          { 
            status: resetResponse.ok ? 200 : 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (error: any) {
        console.error('❌ [PROXY-RESET] Error:', error.message);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: error.message || 'Erro ao resetar sessão' 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // ========== CONNECT ==========
    if (action === 'connect') {
      console.log('🔄 [PROXY-CONNECT] Iniciando conexão');
      
      try {
        const connectResponse = await fetchWithTimeout(
          `${apiUrl}/connect`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-tenant-id': actualTenantId,
            },
          },
          45000 // 45 segundos para connect
        );
        
        console.log('📡 [PROXY-CONNECT] Response status:', connectResponse.status);
        
        const responseText = await connectResponse.text();
        let connectData;
        
        try {
          connectData = JSON.parse(responseText);
        } catch (e) {
          console.error('❌ [PROXY-CONNECT] JSON parse error');
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: 'Resposta inválida do servidor WhatsApp',
              rawResponse: responseText.substring(0, 200)
            }),
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        
        console.log('✅ [PROXY-CONNECT] Data:', connectData);

        return new Response(
          JSON.stringify(connectData),
          { 
            status: connectResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } catch (error: any) {
        console.error('❌ [PROXY-CONNECT] Error:', error.message);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: error.message || 'Erro ao conectar WhatsApp',
            type: 'connection_error'
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    // ========== QR / STATUS ==========
    // Para QR e status, fazer GET simples
    console.log('📡 [PROXY-QR/STATUS] Forwarding GET request');
    
    try {
      let targetUrl: string;
      
      if (action === 'qr') {
        targetUrl = `${apiUrl}/qr`;
      } else if (action === 'status') {
        targetUrl = `${apiUrl}/status/${actualTenantId}`;
      } else {
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
      
      const dataResponse = await fetchWithTimeout(
        targetUrl,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'x-tenant-id': actualTenantId,
          },
        },
        20000 // 20 segundos timeout
      );
      
      console.log('📡 Response status:', dataResponse.status);
      
      // Se for 204 (No Content) para QR, retornar vazio
      if (dataResponse.status === 204) {
        console.log('⏳ QR ainda não disponível');
        return new Response(null, {
          status: 204,
          headers: corsHeaders
        });
      }
      
      // Para outros status, tentar parsear JSON
      const contentType = dataResponse.headers.get('content-type');
      console.log('📄 Content-Type:', contentType);
      
      if (contentType?.includes('application/json')) {
        const jsonData = await dataResponse.json();
        console.log('✅ JSON data received');
        
        return new Response(
          JSON.stringify(jsonData),
          { 
            status: dataResponse.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } else {
        // Resposta não-JSON
        const textData = await dataResponse.text();
        console.log('⚠️  Non-JSON response:', textData.substring(0, 100));
        
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: 'Resposta não-JSON do servidor',
            response: textData.substring(0, 200)
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    } catch (error: any) {
      console.error('❌ [PROXY-QR/STATUS] Error:', error.message);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: error.message || 'Erro ao buscar dados',
          type: 'fetch_error'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
  } catch (error: any) {
    console.error('❌ [PROXY] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message || 'Erro interno do proxy',
        type: 'unexpected_error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
