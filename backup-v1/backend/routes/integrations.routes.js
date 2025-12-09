/**
 * Rotas de API para Integrações Multi-Tenant
 * Mercado Pago e Melhor Envio
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const mercadoPagoService = require('../services/mercado-pago.service');
const melhorEnvioService = require('../services/melhor-envio.service');

// Inicializar Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// =====================================================
// PAYMENT INTEGRATIONS (Mercado Pago)
// =====================================================

/**
 * GET /api/integrations/payment/:tenantId
 * Busca integração de pagamento do tenant
 */
router.get('/payment/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;

    const { data, error } = await supabase
      .from('tenant_payment_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'mercado_pago')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Integração não encontrada' });
    }

    // Ocultar credenciais sensíveis
    const safeData = {
      ...data,
      access_token: data.access_token ? '••••••••' : null,
      refresh_token: data.refresh_token ? '••••••••' : null,
    };

    res.json(safeData);
  } catch (error) {
    console.error('Erro ao buscar integração de pagamento:', error);
    res.status(500).json({ error: 'Erro ao buscar integração' });
  }
});

/**
 * POST /api/integrations/payment/:tenantId
 * Cria/Atualiza integração de pagamento
 */
router.post('/payment/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { access_token, public_key, is_sandbox, config } = req.body;

    // Buscar integração existente
    const { data: existing } = await supabase
      .from('tenant_payment_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'mercado_pago')
      .single();

    const payload = {
      tenant_id: tenantId,
      provider: 'mercado_pago',
      is_sandbox: is_sandbox ?? true,
      config: config || {},
    };

    // Atualizar apenas se fornecidos
    if (access_token && access_token !== '••••••••') {
      payload.access_token = access_token;
    }
    if (public_key && public_key !== '••••••••') {
      payload.public_key = public_key;
    }

    let result;
    if (existing) {
      // Atualizar
      const { data, error } = await supabase
        .from('tenant_payment_integrations')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Criar
      const { data, error } = await supabase
        .from('tenant_payment_integrations')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Ocultar credenciais
    const safeData = {
      ...result,
      access_token: result.access_token ? '••••••••' : null,
      refresh_token: result.refresh_token ? '••••••••' : null,
    };

    res.json(safeData);
  } catch (error) {
    console.error('Erro ao salvar integração de pagamento:', error);
    res.status(500).json({ error: 'Erro ao salvar integração' });
  }
});

/**
 * POST /api/integrations/payment/:tenantId/verify
 * Verifica credenciais do Mercado Pago
 */
router.post('/payment/:tenantId/verify', async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Buscar integração
    const { data: integration, error } = await supabase
      .from('tenant_payment_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'mercado_pago')
      .single();

    if (error || !integration) {
      return res.status(404).json({ 
        success: false, 
        message: 'Integração não encontrada' 
      });
    }

    if (!integration.access_token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Access token não configurado' 
      });
    }

    // Verificar credenciais
    const verifyResult = await mercadoPagoService.verifyCredentials(
      integration.access_token,
      integration.is_sandbox
    );

    if (verifyResult.success) {
      // Atualizar integração como ativa e verificada
      await supabase
        .from('tenant_payment_integrations')
        .update({
          is_active: true,
          last_verified_at: new Date().toISOString(),
          error_message: null
        })
        .eq('id', integration.id);
    } else {
      // Registrar erro
      await supabase
        .from('tenant_payment_integrations')
        .update({
          is_active: false,
          error_message: verifyResult.message
        })
        .eq('id', integration.id);
    }

    res.json(verifyResult);
  } catch (error) {
    console.error('Erro ao verificar integração:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao verificar integração' 
    });
  }
});

// =====================================================
// SHIPPING INTEGRATIONS (Melhor Envio)
// =====================================================

/**
 * GET /api/integrations/shipping/:tenantId
 * Busca integração de envio do tenant
 */
router.get('/shipping/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;

    const { data, error } = await supabase
      .from('tenant_shipping_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'melhor_envio')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ error: 'Integração não encontrada' });
    }

    // Ocultar credenciais sensíveis
    const safeData = {
      ...data,
      api_token: data.api_token ? '••••••••' : null,
      client_secret: data.client_secret ? '••••••••' : null,
    };

    res.json(safeData);
  } catch (error) {
    console.error('Erro ao buscar integração de envio:', error);
    res.status(500).json({ error: 'Erro ao buscar integração' });
  }
});

/**
 * POST /api/integrations/shipping/:tenantId
 * Cria/Atualiza integração de envio
 */
router.post('/shipping/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { api_token, client_id, client_secret, is_sandbox, sender_config, config } = req.body;

    // Buscar integração existente
    const { data: existing } = await supabase
      .from('tenant_shipping_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'melhor_envio')
      .single();

    const payload = {
      tenant_id: tenantId,
      provider: 'melhor_envio',
      is_sandbox: is_sandbox ?? true,
      sender_config: sender_config || {},
      config: config || {},
    };

    // Atualizar apenas se fornecidos
    if (api_token && api_token !== '••••••••') {
      payload.api_token = api_token;
    }
    if (client_id && client_id !== '••••••••') {
      payload.client_id = client_id;
    }
    if (client_secret && client_secret !== '••••••••') {
      payload.client_secret = client_secret;
    }

    let result;
    if (existing) {
      // Atualizar
      const { data, error } = await supabase
        .from('tenant_shipping_integrations')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Criar
      const { data, error } = await supabase
        .from('tenant_shipping_integrations')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Ocultar credenciais
    const safeData = {
      ...result,
      api_token: result.api_token ? '••••••••' : null,
      client_secret: result.client_secret ? '••••••••' : null,
    };

    res.json(safeData);
  } catch (error) {
    console.error('Erro ao salvar integração de envio:', error);
    res.status(500).json({ error: 'Erro ao salvar integração' });
  }
});

/**
 * POST /api/integrations/shipping/:tenantId/verify
 * Verifica credenciais do Melhor Envio
 */
router.post('/shipping/:tenantId/verify', async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Buscar integração
    const { data: integration, error } = await supabase
      .from('tenant_shipping_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'melhor_envio')
      .single();

    if (error || !integration) {
      return res.status(404).json({ 
        success: false, 
        message: 'Integração não encontrada' 
      });
    }

    if (!integration.api_token) {
      return res.status(400).json({ 
        success: false, 
        message: 'API token não configurado' 
      });
    }

    // Verificar credenciais
    const verifyResult = await melhorEnvioService.verifyCredentials(
      integration.api_token,
      integration.is_sandbox
    );

    if (verifyResult.success) {
      // Buscar saldo
      const balanceResult = await melhorEnvioService.getBalance(
        integration.api_token,
        integration.is_sandbox
      );

      const balance_cents = balanceResult.success 
        ? Math.round(balanceResult.data.balance * 100)
        : 0;

      // Atualizar integração como ativa e verificada
      await supabase
        .from('tenant_shipping_integrations')
        .update({
          is_active: true,
          last_verified_at: new Date().toISOString(),
          balance_cents: balance_cents,
          error_message: null
        })
        .eq('id', integration.id);
      
      verifyResult.data = {
        ...verifyResult.data,
        balance: balance_cents / 100
      };
    } else {
      // Registrar erro
      await supabase
        .from('tenant_shipping_integrations')
        .update({
          is_active: false,
          error_message: verifyResult.message
        })
        .eq('id', integration.id);
    }

    res.json(verifyResult);
  } catch (error) {
    console.error('Erro ao verificar integração:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao verificar integração' 
    });
  }
});

// =====================================================
// SHIPPING OPERATIONS
// =====================================================

/**
 * POST /api/integrations/shipping/:tenantId/calculate
 * Calcula frete
 */
router.post('/shipping/:tenantId/calculate', async (req, res) => {
  try {
    const { tenantId } = req.params;

    // Buscar integração
    const { data: integration } = await supabase
      .from('tenant_shipping_integrations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'melhor_envio')
      .eq('is_active', true)
      .single();

    if (!integration) {
      return res.status(404).json({ 
        success: false, 
        message: 'Integração não encontrada ou inativa' 
      });
    }

    const result = await melhorEnvioService.calculateShipping(
      integration.api_token,
      req.body,
      integration.is_sandbox
    );

    res.json(result);
  } catch (error) {
    console.error('Erro ao calcular frete:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao calcular frete' 
    });
  }
});

module.exports = router;
