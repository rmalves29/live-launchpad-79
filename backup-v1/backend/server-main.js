/**
 * Servidor Principal Multi-Tenant
 * Integra WhatsApp (Evolution API) + Integrações (Mercado Pago, Melhor Envio)
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

// Para importar módulos CommonJS em ES modules
const require = createRequire(import.meta.url);

// Para resolver __dirname em ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar serviço WhatsApp
import evolutionService from './services/evolution-whatsapp.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());
app.use(cors({ origin: '*', credentials: true }));

// Servir arquivos estáticos do frontend (após build)
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Logger
const log = {
  info: (msg, data = '') => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  success: (msg, data = '') => console.log(`\x1b[32m[✓]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  warn: (msg, data = '') => console.log(`\x1b[33m[⚠]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  error: (msg, data = '') => console.log(`\x1b[31m[✗]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
};

// ========== ROTAS DE INTEGRAÇÕES (Mercado Pago e Melhor Envio) ==========
try {
  const integrationsRoutes = require('./routes/integrations.routes.js');
  app.use('/api/integrations', integrationsRoutes);
  log.success('✅ Rotas de integração carregadas');
} catch (error) {
  log.error('Erro ao carregar rotas de integração:', error.message);
}

// ========== ENDPOINTS WHATSAPP ==========

// Status geral
app.get('/', async (req, res) => {
  try {
    const healthy = await evolutionService.healthCheck();
    const instances = await evolutionService.listInstances();
    
    res.json({
      server: 'OrderZap Multi-Tenant Server',
      version: '3.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      whatsapp: {
        evolutionApiStatus: healthy ? 'online' : 'offline',
        evolutionApiUrl: process.env.EVOLUTION_API_URL,
        totalInstances: instances.length,
        instances: instances.map(inst => ({
          name: inst.instance.instanceName,
          state: inst.instance.state
        }))
      },
      integrations: {
        mercadoPago: 'available',
        melhorEnvio: 'available'
      }
    });
  } catch (error) {
    log.error('Erro no endpoint raiz:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  const healthy = await evolutionService.healthCheck();
  res.status(healthy ? 200 : 503).json({ 
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString()
  });
});

// Status de um tenant
app.get('/status/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const exists = await evolutionService.instanceExists(tenantId);
    if (!exists) {
      return res.json({
        tenantId,
        exists: false,
        connected: false,
        hasQR: false
      });
    }

    const state = await evolutionService.getConnectionState(tenantId);
    const qr = await evolutionService.getQRCode(tenantId);
    
    res.json({
      tenantId,
      exists: true,
      connected: state.state === 'open',
      connecting: state.state === 'connecting',
      hasQR: !!qr,
      state: state.state
    });
  } catch (error) {
    log.error(`Erro ao obter status ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Obter QR Code
app.get('/qr/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // Garantir que instância existe
    await evolutionService.ensureInstance(tenantId);
    
    // Aguardar um pouco para QR ser gerado
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Obter QR Code
    const qr = await evolutionService.getQRCode(tenantId);
    
    if (!qr) {
      return res.status(404).json({ error: 'QR Code não encontrado. Aguarde alguns segundos.' });
    }

    res.json({
      tenantId,
      qrCode: qr,
      message: 'Escaneie o QR Code com WhatsApp'
    });
  } catch (error) {
    log.error(`Erro ao obter QR Code ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Gerar novo QR Code
app.post('/generate-qr/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    log.info(`📱 Gerando QR Code para tenant: ${tenantId}`);
    
    // Garantir que instância existe (cria se necessário)
    await evolutionService.ensureInstance(tenantId);
    
    // Aguardar QR ser gerado
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const qr = await evolutionService.getQRCode(tenantId);
    
    if (!qr) {
      return res.status(503).json({ 
        error: 'QR Code ainda não foi gerado. Tente novamente em alguns segundos.',
        tenantId
      });
    }

    log.success(`✓ QR Code gerado para ${tenantId}`);
    
    res.json({
      tenantId,
      qrCode: qr,
      message: 'QR Code gerado com sucesso'
    });
  } catch (error) {
    log.error(`Erro ao gerar QR Code ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Desconectar tenant
app.post('/disconnect/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    log.info(`Desconectando tenant: ${tenantId}`);
    
    await evolutionService.logoutInstance(tenantId);
    
    log.success(`✓ Tenant desconectado: ${tenantId}`);
    
    res.json({
      tenantId,
      message: 'Desconectado com sucesso'
    });
  } catch (error) {
    log.error(`Erro ao desconectar ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensagem
app.post('/send', async (req, res) => {
  try {
    const { tenantId, to, message } = req.body;
    
    if (!tenantId || !to || !message) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: tenantId, to, message' 
      });
    }

    log.info(`📨 Enviando mensagem de ${tenantId} para ${to}`);
    
    const result = await evolutionService.sendTextMessage(tenantId, to, message);
    
    if (!result.success) {
      throw new Error(result.error || 'Erro ao enviar mensagem');
    }

    log.success(`✓ Mensagem enviada de ${tenantId} para ${to}`);
    
    res.json({
      success: true,
      message: 'Mensagem enviada',
      data: result.data
    });
  } catch (error) {
    log.error(`Erro ao enviar mensagem:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Listar todas as instâncias
app.get('/instances', async (req, res) => {
  try {
    const instances = await evolutionService.listInstances();
    
    res.json({
      total: instances.length,
      instances: instances.map(inst => ({
        name: inst.instance.instanceName,
        state: inst.instance.state,
        owner: inst.instance.owner,
        profileName: inst.instance.profileName,
        profilePictureUrl: inst.instance.profilePictureUrl
      }))
    });
  } catch (error) {
    log.error('Erro ao listar instâncias:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========== INICIALIZAÇÃO ==========

app.listen(PORT, '0.0.0.0', async () => {
  log.success(`\n${'='.repeat(60)}`);
  log.success(`🚀 OrderZap Multi-Tenant Server RODANDO!`);
  log.success(`${'='.repeat(60)}`);
  log.info(`📍 Porta: ${PORT}`);
  log.info(`🌐 URL: http://localhost:${PORT}`);
  log.info(`📅 Data: ${new Date().toLocaleString('pt-BR')}`);
  log.success(`${'='.repeat(60)}\n`);

  // Verificar Evolution API
  const healthy = await evolutionService.healthCheck();
  if (healthy) {
    log.success(`✅ Evolution API está respondendo: ${process.env.EVOLUTION_API_URL}`);
  } else {
    log.error(`❌ Evolution API não está respondendo: ${process.env.EVOLUTION_API_URL}`);
    log.warn(`⚠️  Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no ambiente`);
  }

  log.info('\n📋 Endpoints disponíveis:');
  log.info('   GET  /                      - Status do servidor');
  log.info('   GET  /health                - Health check');
  log.info('   GET  /qr/:tenantId          - Obter QR Code');
  log.info('   POST /generate-qr/:tenantId - Gerar novo QR Code');
  log.info('   GET  /status/:tenantId      - Status da conexão');
  log.info('   POST /send                  - Enviar mensagem');
  log.info('   POST /disconnect/:tenantId  - Desconectar');
  log.info('   GET  /instances             - Listar instâncias');
  log.info('\n📦 Integrações:');
  log.info('   GET  /api/integrations/payment/:tenantId  - Integração Mercado Pago');
  log.info('   POST /api/integrations/payment/:tenantId  - Salvar Mercado Pago');
  log.info('   GET  /api/integrations/shipping/:tenantId - Integração Melhor Envio');
  log.info('   POST /api/integrations/shipping/:tenantId - Salvar Melhor Envio');
  log.info('');
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (error) => {
  log.error('❌ Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  log.error('❌ Uncaught Exception:', error);
});

// Servir index.html para todas as rotas não API (SPA fallback)
app.get('*', (req, res) => {
  // Não servir index.html para rotas API
  if (req.path.startsWith('/api/') || req.path.startsWith('/health') || req.path.startsWith('/status') || req.path.startsWith('/qr') || req.path.startsWith('/send') || req.path.startsWith('/disconnect') || req.path.startsWith('/instances') || req.path.startsWith('/generate-qr')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  
  res.sendFile(path.join(distPath, 'index.html'));
});
