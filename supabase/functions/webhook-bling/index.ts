import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, X-Bling-Signature-256',
};

// Função para validar a assinatura HMAC do Bling
async function validateBlingSignature(payload: string, signature: string, clientSecret: string): Promise<boolean> {
  try {
    // Remover o prefixo "sha256=" da assinatura
    const providedSignature = signature.replace('sha256=', '');
    
    // Gerar HMAC SHA-256 do payload com o client secret
    const encoder = new TextEncoder();
    const keyData = encoder.encode(clientSecret);
    const messageData = encoder.encode(payload);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature256 = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedSignature = Array.from(new Uint8Array(signature256))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return expectedSignature === providedSignature;
  } catch (error) {
    console.error('Erro ao validar assinatura:', error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Ler o payload como texto para validação da assinatura
    const payload = await req.text();
    console.log('🔔 Webhook Bling recebido:', payload);

    // Obter assinatura do cabeçalho
    const blingSignature = req.headers.get('X-Bling-Signature-256');
    if (!blingSignature) {
      console.log('❌ Assinatura Bling não encontrada');
      return new Response(
        JSON.stringify({ error: 'X-Bling-Signature-256 header missing' }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse do payload JSON
    let webhookData;
    try {
      webhookData = JSON.parse(payload);
    } catch (error) {
      console.log('❌ Payload JSON inválido:', error);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }), 
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { eventId, date, version, event, companyId, data } = webhookData;

    // Buscar configuração do Bling para validar assinatura
    const { data: blingConfig, error: configError } = await supabase
      .from('bling_integrations')
      .select('client_secret, tenant_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (configError || !blingConfig) {
      console.log('❌ Configuração Bling não encontrada para companyId:', companyId);
      
      // Log o webhook recebido mesmo sem configuração
      await supabase.from('webhook_logs').insert({
        webhook_type: 'bling_webhook_config_not_found',
        status_code: 404,
        payload: { companyId, event, eventId },
        response: 'Configuração Bling não encontrada',
        error_message: `CompanyId ${companyId} não encontrado nas configurações`
      });

      return new Response(
        JSON.stringify({ error: 'Bling configuration not found' }), 
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validar assinatura HMAC
    const isValidSignature = await validateBlingSignature(payload, blingSignature, blingConfig.client_secret);
    
    if (!isValidSignature) {
      console.log('❌ Assinatura Bling inválida');
      
      await supabase.from('webhook_logs').insert({
        tenant_id: blingConfig.tenant_id,
        webhook_type: 'bling_webhook_invalid_signature',
        status_code: 401,
        payload: { companyId, event, eventId, signature: blingSignature },
        response: 'Assinatura inválida',
        error_message: 'X-Bling-Signature-256 inválida'
      });

      return new Response(
        JSON.stringify({ error: 'Invalid signature' }), 
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Webhook Bling autenticado com sucesso');

    // Log do webhook recebido
    await supabase.from('webhook_logs').insert({
      tenant_id: blingConfig.tenant_id,
      webhook_type: 'bling_webhook_received',
      status_code: 200,
      payload: { eventId, date, version, event, companyId, data },
      response: 'Webhook processado com sucesso'
    });

    // Processar eventos específicos
    try {
      if (event?.startsWith('order.')) {
        await processOrderEvent(supabase, blingConfig.tenant_id, event, data, eventId);
      } else if (event?.startsWith('product.')) {
        await processProductEvent(supabase, blingConfig.tenant_id, event, data, eventId);
      } else if (event?.startsWith('stock.')) {
        await processStockEvent(supabase, blingConfig.tenant_id, event, data, eventId);
      } else if (event?.startsWith('invoice.') || event?.startsWith('consumer_invoice.')) {
        await processInvoiceEvent(supabase, blingConfig.tenant_id, event, data, eventId);
      }

      // Resposta de sucesso para o Bling (importante: deve ser 2xx em até 5 segundos)
      return new Response(
        JSON.stringify({ 
          success: true, 
          eventId, 
          message: 'Webhook processado com sucesso' 
        }), 
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );

    } catch (processingError) {
      console.error('❌ Erro ao processar webhook:', processingError);
      
      await supabase.from('webhook_logs').insert({
        tenant_id: blingConfig.tenant_id,
        webhook_type: 'bling_webhook_processing_error',
        status_code: 500,
        payload: { eventId, event, data },
        response: `Erro no processamento: ${processingError.message}`,
        error_message: processingError.message
      });

      // Ainda retornamos 200 para evitar retentativas desnecessárias
      return new Response(
        JSON.stringify({ 
          success: false, 
          eventId, 
          error: 'Processing error logged' 
        }), 
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('❌ Erro geral no webhook:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

// Processar eventos de pedidos
async function processOrderEvent(supabase: any, tenantId: string, event: string, data: any, eventId: string) {
  console.log(`📦 Processando evento de pedido: ${event}`, data);

  const action = event.split('.')[1]; // created, updated, deleted
  const blingOrderId = data.id;

  if (action === 'created' || action === 'updated') {
    // Tentar encontrar pedido correspondente no sistema
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, unique_order_id, bling_order_id')
      .eq('tenant_id', tenantId)
      .or(`bling_order_id.eq.${blingOrderId},unique_order_id.ilike.%${data.numero || data.numeroLoja || ''}%`)
      .single();

    if (existingOrder) {
      // Atualizar pedido existente com dados do Bling
      await supabase
        .from('orders')
        .update({
          bling_order_id: blingOrderId,
          bling_sync_status: 'synchronized',
          bling_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingOrder.id);

      console.log(`✅ Pedido ${existingOrder.id} sincronizado com Bling #${blingOrderId}`);
    }

    // Log do evento
    await supabase.from('webhook_logs').insert({
      tenant_id: tenantId,
      webhook_type: `bling_order_${action}`,
      status_code: 200,
      payload: { eventId, blingOrderId, orderData: data },
      response: existingOrder ? `Pedido ${existingOrder.id} atualizado` : 'Pedido não encontrado no sistema'
    });

  } else if (action === 'deleted') {
    console.log(`🗑️ Pedido ${blingOrderId} foi deletado no Bling`);
    
    await supabase.from('webhook_logs').insert({
      tenant_id: tenantId,
      webhook_type: 'bling_order_deleted',
      status_code: 200,
      payload: { eventId, blingOrderId },
      response: 'Pedido deletado no Bling'
    });
  }
}

// Processar eventos de produtos
async function processProductEvent(supabase: any, tenantId: string, event: string, data: any, eventId: string) {
  console.log(`🛍️ Processando evento de produto: ${event}`, data);

  const action = event.split('.')[1];
  const blingProductId = data.id;

  await supabase.from('webhook_logs').insert({
    tenant_id: tenantId,
    webhook_type: `bling_product_${action}`,
    status_code: 200,
    payload: { eventId, blingProductId, productData: data },
    response: `Evento de produto ${action} processado`
  });
}

// Processar eventos de estoque
async function processStockEvent(supabase: any, tenantId: string, event: string, data: any, eventId: string) {
  console.log(`📊 Processando evento de estoque: ${event}`, data);

  const action = event.split('.')[1];
  const productId = data.produto?.id;

  await supabase.from('webhook_logs').insert({
    tenant_id: tenantId,
    webhook_type: `bling_stock_${action}`,
    status_code: 200,
    payload: { eventId, productId, stockData: data },
    response: `Evento de estoque ${action} processado`
  });
}

// Processar eventos de nota fiscal
async function processInvoiceEvent(supabase: any, tenantId: string, event: string, data: any, eventId: string) {
  console.log(`📋 Processando evento de nota fiscal: ${event}`, data);

  const action = event.split('.')[1];
  const invoiceId = data.id;

  await supabase.from('webhook_logs').insert({
    tenant_id: tenantId,
    webhook_type: `bling_invoice_${action}`,
    status_code: 200,
    payload: { eventId, invoiceId, invoiceData: data },
    response: `Evento de nota fiscal ${action} processado`
  });
}