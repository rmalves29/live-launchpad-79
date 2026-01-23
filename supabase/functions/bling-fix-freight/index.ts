import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BLING_API_URL = 'https://api.bling.com.br/Api/v3';

type BlingOrderPayload = Record<string, any>;

// Função para converter valor monetário brasileiro para número
// Suporta formatos: "30,41" | "30.41" | "1.234,56" | "1234.56"
function parseMonetaryValue(value: string): number {
  if (!value) return 0;
  const cleaned = value.trim();
  
  // Se tem vírgula como decimal (formato BR: "30,41" ou "1.234,56")
  if (cleaned.includes(',')) {
    // Remove pontos de milhar e troca vírgula por ponto
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  
  // Formato com ponto como decimal ("30.41")
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount === 1) {
    const parts = cleaned.split('.');
    // Se tem 2 casas decimais após o ponto, é decimal
    if (parts[1] && parts[1].length <= 2) {
      return parseFloat(cleaned) || 0;
    }
    // Senão, pode ser milhar (ex: "1.234" = 1234)
    return parseFloat(cleaned.replace('.', '')) || 0;
  }
  
  // Múltiplos pontos = formato milhar (ex: "1.234.567")
  return parseFloat(cleaned.replace(/\./g, '')) || 0;
}

// Extrair valor do frete da observação
function extractFreightValue(observation: string): number {
  if (!observation) return 0;
  
  // Tentar extrair valor do frete
  const freteMatch = observation.match(/(?:frete|envio|transporte)[^R$]*R\$\s*([\d.,]+)/i);
  if (freteMatch) {
    return parseMonetaryValue(freteMatch[1]);
  }
  
  // Fallback: buscar qualquer padrão "R$ XX,XX" relacionado a frete
  const valorMatch = observation.match(/R\$\s*([\d.,]+)/);
  if (valorMatch && observation.toLowerCase().includes('frete')) {
    return parseMonetaryValue(valorMatch[1]);
  }
  
  return 0;
}

// Refresh token do Bling
async function refreshBlingToken(supabase: any, integration: any): Promise<string | null> {
  if (!integration.refresh_token || !integration.client_id || !integration.client_secret) {
    return null;
  }

  const credentials = btoa(`${integration.client_id}:${integration.client_secret}`);
  const response = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
    }),
  });

  if (!response.ok) {
    console.error('[bling-fix-freight] Failed to refresh token:', await response.text());
    return null;
  }

  const tokenData = await response.json();
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabase
    .from('integration_bling')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  return tokenData.access_token;
}

// Obter token válido
async function getValidAccessToken(supabase: any, integration: any): Promise<string | null> {
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    if (expiresAt > new Date()) {
      return integration.access_token;
    }
  }
  return await refreshBlingToken(supabase, integration);
}

// Atualizar pedido no Bling
async function updateBlingOrderFreight(
  accessToken: string,
  blingOrderId: number,
  newFreightValue: number
): Promise<{ success: boolean; error?: string }> {
  console.log(`[bling-fix-freight] Atualizando pedido ${blingOrderId} com frete ${newFreightValue}`);

  // IMPORTANTE: o Bling v3 costuma rejeitar PUT parcial (validação exige contato/itens/data etc.).
  // Então: buscar o pedido atual e reenviar o payload completo com o frete ajustado.
  const getResponse = await fetch(`${BLING_API_URL}/pedidos/vendas/${blingOrderId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const getText = await getResponse.text();
  if (!getResponse.ok) {
    console.log(`[bling-fix-freight] Falha ao buscar pedido no Bling: ${getResponse.status} - ${getText}`);
    return { success: false, error: `${getResponse.status} - ${getText}` };
  }

  let current: BlingOrderPayload | null = null;
  try {
    const parsed = JSON.parse(getText);
    current = (parsed?.data ?? parsed) as BlingOrderPayload;
  } catch {
    return { success: false, error: `Falha ao parsear resposta do GET: ${getText?.slice?.(0, 200) ?? 'N/A'}` };
  }

  if (!current || typeof current !== 'object') {
    return { success: false, error: 'Resposta do Bling inválida (pedido vazio)' };
  }

  const payload: BlingOrderPayload = { ...current };
  
  // Atualizar o frete no transporte
  const oldFrete = payload.transporte?.frete ?? 0;
  payload.transporte = {
    ...(payload.transporte ?? {}),
    frete: newFreightValue,
  };
  
  // Calcular a diferença do frete para ajustar o total
  const freteDiff = newFreightValue - oldFrete;
  
  // Recalcular o total da venda
  const oldTotal = payload.total ?? payload.totalVenda ?? 0;
  const newTotal = oldTotal + freteDiff;
  payload.total = newTotal;
  payload.totalVenda = newTotal;
  
  // IMPORTANTE: Recalcular as parcelas para que o somatório bata com o novo total
  // Se há parcelas, ajustar a primeira (ou única) para absorver a diferença do frete
  if (payload.parcelas && Array.isArray(payload.parcelas) && payload.parcelas.length > 0) {
    // Calcular soma atual das parcelas
    const somaParcelas = payload.parcelas.reduce((sum: number, p: any) => sum + (p.valor ?? 0), 0);
    
    // Se a soma é diferente do novo total, ajustar a primeira parcela
    if (Math.abs(somaParcelas - newTotal) > 0.01) {
      const diffParcela = newTotal - somaParcelas;
      payload.parcelas[0].valor = (payload.parcelas[0].valor ?? 0) + diffParcela;
      
      // Garantir que o valor não fique negativo
      if (payload.parcelas[0].valor < 0) {
        payload.parcelas[0].valor = 0;
      }
    }
  }

  const putResponse = await fetch(`${BLING_API_URL}/pedidos/vendas/${blingOrderId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const putText = await putResponse.text();
  console.log(`[bling-fix-freight] Resposta Bling: ${putResponse.status} - ${putText}`);

  if (!putResponse.ok) {
    return { success: false, error: `${putResponse.status} - ${putText}` };
  }

  return { success: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { tenant_id, dry_run = true } = await req.json();

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'tenant_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar integração do Bling
    const { data: integration, error: integrationError } = await supabase
      .from('integration_bling')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      return new Response(
        JSON.stringify({ success: false, error: 'Integração Bling não encontrada ou inativa' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Obter token válido
    const accessToken = await getValidAccessToken(supabase, integration);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível obter token válido do Bling' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar pedidos com bling_order_id e observação contendo frete
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, bling_order_id, observation')
      .eq('tenant_id', tenant_id)
      .not('bling_order_id', 'is', null)
      .not('observation', 'is', null);

    if (ordersError) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao buscar pedidos: ${ordersError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];
    let correctedCount = 0;
    let errorCount = 0;

    for (const order of orders || []) {
      if (!order.observation || !order.bling_order_id) continue;

      const freteCorreto = extractFreightValue(order.observation);
      if (freteCorreto === 0) continue;

      const orderResult = {
        order_id: order.id,
        bling_order_id: order.bling_order_id,
        observation: order.observation,
        frete_correto: freteCorreto,
        status: 'pending',
        error: null as string | null,
      };

      if (!dry_run) {
        // Aguardar 500ms entre requisições para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const updateResult = await updateBlingOrderFreight(
          accessToken,
          order.bling_order_id,
          freteCorreto
        );

        if (updateResult.success) {
          orderResult.status = 'success';
          correctedCount++;
        } else {
          orderResult.status = 'error';
          orderResult.error = updateResult.error || 'Erro desconhecido';
          errorCount++;
        }
      } else {
        orderResult.status = 'dry_run';
      }

      results.push(orderResult);
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run,
        total_orders: results.length,
        corrected: correctedCount,
        errors: errorCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[bling-fix-freight] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
