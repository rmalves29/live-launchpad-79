import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

interface RefreshResult {
  tenant_id: string;
  tenant_name: string;
  success: boolean;
  error?: string;
  expires_at?: string;
  days_until_expiry?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("[bling-refresh-tokens] Iniciando renovação proativa de tokens...");

    // Buscar todas as integrações Bling ativas com refresh_token
    const { data: integrations, error: fetchError } = await supabase
      .from("integration_bling")
      .select(`
        id,
        tenant_id,
        client_id,
        client_secret,
        refresh_token,
        token_expires_at,
        is_active
      `)
      .eq("is_active", true)
      .not("refresh_token", "is", null);

    if (fetchError) {
      console.error("[bling-refresh-tokens] Erro ao buscar integrações:", fetchError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar integrações", details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!integrations || integrations.length === 0) {
      console.log("[bling-refresh-tokens] Nenhuma integração ativa encontrada");
      return new Response(
        JSON.stringify({ 
          message: "Nenhuma integração Bling ativa encontrada",
          processed: 0,
          results: []
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[bling-refresh-tokens] Encontradas ${integrations.length} integrações ativas`);

    // Buscar nomes dos tenants para log
    const tenantIds = integrations.map(i => i.tenant_id);
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name")
      .in("id", tenantIds);

    const tenantMap = new Map(tenants?.map(t => [t.id, t.name]) || []);

    const results: RefreshResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const integration of integrations) {
      const tenantName = tenantMap.get(integration.tenant_id) || "Desconhecido";
      
      try {
        // Verificar se tem credenciais válidas
        if (!integration.client_id || !integration.client_secret) {
          console.warn(`[bling-refresh-tokens] Tenant ${tenantName}: credenciais incompletas`);
          results.push({
            tenant_id: integration.tenant_id,
            tenant_name: tenantName,
            success: false,
            error: "Credenciais incompletas (client_id ou client_secret)"
          });
          errorCount++;
          continue;
        }

        console.log(`[bling-refresh-tokens] Renovando token para: ${tenantName}`);

        // Fazer requisição para renovar o token
        const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);
        
        const tokenResponse = await fetch(BLING_TOKEN_URL, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: integration.refresh_token,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error(`[bling-refresh-tokens] Erro para ${tenantName}:`, errorText);
          
          // Se o refresh token expirou (30 dias sem uso), marcar como inativo
          if (errorText.includes("invalid_grant") || errorText.includes("expired")) {
            await supabase
              .from("integration_bling")
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq("id", integration.id);
              
            results.push({
              tenant_id: integration.tenant_id,
              tenant_name: tenantName,
              success: false,
              error: "Refresh token expirado - reautorização necessária"
            });
          } else {
            results.push({
              tenant_id: integration.tenant_id,
              tenant_name: tenantName,
              success: false,
              error: `Erro da API Bling: ${errorText.substring(0, 200)}`
            });
          }
          errorCount++;
          continue;
        }

        const tokenData = await tokenResponse.json();

        // Calcular data de expiração (access_token = 6h, refresh_token = 30 dias)
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokenData.expires_in || 21600));

        // Calcular dias até expiração do refresh_token (30 dias a partir de agora)
        const refreshExpiresAt = new Date();
        refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 30);

        // Atualizar tokens no banco
        const { error: updateError } = await supabase
          .from("integration_bling")
          .update({
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id);

        if (updateError) {
          console.error(`[bling-refresh-tokens] Erro ao salvar tokens para ${tenantName}:`, updateError);
          results.push({
            tenant_id: integration.tenant_id,
            tenant_name: tenantName,
            success: false,
            error: `Erro ao salvar: ${updateError.message}`
          });
          errorCount++;
          continue;
        }

        console.log(`[bling-refresh-tokens] ✓ Token renovado para: ${tenantName}`);
        results.push({
          tenant_id: integration.tenant_id,
          tenant_name: tenantName,
          success: true,
          expires_at: expiresAt.toISOString(),
          days_until_expiry: 30 // Refresh token renovado, válido por mais 30 dias
        });
        successCount++;

        // Rate limiting - aguardar 500ms entre requisições
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`[bling-refresh-tokens] Exceção para ${tenantName}:`, err);
        results.push({
          tenant_id: integration.tenant_id,
          tenant_name: tenantName,
          success: false,
          error: err instanceof Error ? err.message : "Erro desconhecido"
        });
        errorCount++;
      }
    }

    const summary = {
      message: "Renovação proativa de tokens concluída",
      processed: integrations.length,
      success: successCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
      results
    };

    console.log(`[bling-refresh-tokens] Concluído: ${successCount} sucesso, ${errorCount} erros`);

    return new Response(
      JSON.stringify(summary),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[bling-refresh-tokens] Erro geral:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Erro desconhecido",
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
