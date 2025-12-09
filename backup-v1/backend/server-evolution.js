// Servidor WhatsApp Multi-Tenant usando Evolution API
// Muito mais estável que Baileys direto

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import evolutionService from './services/evolution-whatsapp.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.json());
app.use(cors({ origin: '*', credentials: true }));

// Logger
const log = {
  info: (msg, data = '') => console.log(`\x1b[36m[INFO]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  success: (msg, data = '') => console.log(`\x1b[32m[✓]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  warn: (msg, data = '') => console.log(`\x1b[33m[⚠]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
  error: (msg, data = '') => console.log(`\x1b[31m[✗]\x1b[0m ${new Date().toISOString()} - ${msg}`, data || ''),
};

// ========== ENDPOINTS ==========

// Status geral
app.get('/', async (req, res) => {
  const healthy = await evolutionService.healthCheck();
  const instances = await evolutionService.listInstances();
  
  res.json({
    server: 'WhatsApp Multi-Tenant Evolution API',
    version: '2.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    evolutionApiStatus: healthy ? 'online' : 'offline',
    evolutionApiUrl: process.env.EVOLUTION_API_URL,
    totalInstances: instances.length,
    instances: instances.map(inst => ({
      name: inst.instance.instanceName,
      state: inst.instance.state
    }))
  });
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
    
    if (qr) {
      res.json({ 
        tenantId,
        qr: qr.base64,
        code: qr.code
      });
    } else {
      // Se não tem QR, pode estar conectado ou gerando
      const state = await evolutionService.getConnectionState(tenantId);
      
      if (state.state === 'open') {
        res.json({
          tenantId,
          connected: true,
          message: 'WhatsApp já está conectado'
        });
      } else {
        res.status(404).json({ 
          error: 'QR Code não disponível',
          message: 'Aguarde alguns segundos e tente novamente',
          tenantId,
          state: state.state
        });
      }
    }
  } catch (error) {
    log.error(`Erro ao obter QR ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Gerar novo QR Code (forçar reconexão)
app.post('/generate-qr/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    // Verificar se instância existe
    const exists = await evolutionService.instanceExists(tenantId);
    
    if (exists) {
      // Fazer logout primeiro
      await evolutionService.logout(tenantId);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Criar/reconectar instância
    await evolutionService.ensureInstance(tenantId);
    
    res.json({ 
      message: 'Gerando novo QR Code',
      tenantId,
      checkAt: `/qr/${tenantId}`,
      waitSeconds: 5
    });
  } catch (error) {
    log.error(`Erro ao gerar QR ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensagem
app.post('/send', async (req, res) => {
  try {
    const { tenantId, number, message, mediaUrl, caption } = req.body;
    
    if (!tenantId || !number || (!message && !mediaUrl)) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: tenantId, number, message ou mediaUrl' 
      });
    }

    // Verificar se está conectado
    const state = await evolutionService.getConnectionState(tenantId);
    if (state.state !== 'open') {
      return res.status(400).json({ 
        error: 'WhatsApp não está conectado',
        state: state.state
      });
    }

    let result;
    if (mediaUrl) {
      result = await evolutionService.sendMedia(tenantId, number, mediaUrl, caption || message);
    } else {
      result = await evolutionService.sendText(tenantId, number, message);
    }
    
    res.json({ 
      success: true,
      tenantId,
      result
    });
  } catch (error) {
    log.error(`Erro ao enviar mensagem:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Broadcast (enviar para múltiplos números)
app.post('/broadcast', async (req, res) => {
  try {
    const { tenantId, numbers, message } = req.body;
    
    if (!tenantId || !numbers || !Array.isArray(numbers) || !message) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: tenantId, numbers (array), message' 
      });
    }

    // Verificar se está conectado
    const state = await evolutionService.getConnectionState(tenantId);
    if (state.state !== 'open') {
      return res.status(400).json({ 
        error: 'WhatsApp não está conectado',
        state: state.state
      });
    }

    const results = [];
    
    for (const number of numbers) {
      try {
        const result = await evolutionService.sendText(tenantId, number, message);
        results.push({ number, success: true, result });
        
        // Delay entre mensagens para evitar bloqueio
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        results.push({ number, success: false, error: error.message });
      }
    }
    
    res.json({ 
      tenantId,
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    log.error(`Erro no broadcast:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Restart instância
app.post('/restart/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    await evolutionService.restartInstance(tenantId);
    
    res.json({ 
      message: 'Instância reiniciada',
      tenantId
    });
  } catch (error) {
    log.error(`Erro ao reiniciar ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Reset completo (logout + delete)
app.post('/reset/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const exists = await evolutionService.instanceExists(tenantId);
    
    if (exists) {
      await evolutionService.logout(tenantId);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await evolutionService.deleteInstance(tenantId);
    }
    
    res.json({ 
      message: 'Reset completo realizado',
      tenantId
    });
  } catch (error) {
    log.error(`Erro ao resetar ${req.params.tenantId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Listar todas instâncias
app.get('/instances', async (req, res) => {
  try {
    const instances = await evolutionService.listInstances();
    
    res.json({ 
      total: instances.length,
      instances: instances.map(inst => ({
        name: inst.instance.instanceName,
        state: inst.instance.state,
        profilePictureUrl: inst.instance.profilePictureUrl,
        profileName: inst.instance.profileName,
        owner: inst.instance.owner
      }))
    });
  } catch (error) {
    log.error(`Erro ao listar instâncias:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// ========== INICIAR SERVIDOR ==========

app.listen(PORT, '0.0.0.0', async () => {
  log.success(`🚀 Servidor Evolution API rodando na porta ${PORT}`);
  log.info(`Evolution API URL: ${process.env.EVOLUTION_API_URL || 'http://localhost:8080'}`);
  
  // Testar conexão com Evolution API
  const healthy = await evolutionService.healthCheck();
  if (healthy) {
    log.success(`✅ Evolution API está respondendo`);
  } else {
    log.error(`❌ Evolution API não está respondendo!`);
    log.warn(`Verifique se Evolution API está rodando em: ${process.env.EVOLUTION_API_URL}`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log.warn('SIGTERM recebido, fechando servidor...');
  process.exit(0);
});

export default app;
