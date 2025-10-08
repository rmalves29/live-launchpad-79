// Servidor WhatsApp Simples - Login e Envio de Mensagens
// Execute: node whatsapp-simples.js

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.use(express.json());

let clienteWhatsApp = null;
let statusConexao = 'desconectado';

console.log('\n🚀 Iniciando Servidor WhatsApp Simples...\n');

// Criar cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'whatsapp-simples'
  }),
  puppeteer: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

// Evento: QR Code gerado
client.on('qr', (qr) => {
  console.log('\n' + '='.repeat(60));
  console.log('📱 ESCANEIE O QR CODE ABAIXO NO SEU WHATSAPP');
  console.log('='.repeat(60) + '\n');
  qrcode.generate(qr, { small: true });
  console.log('\n' + '='.repeat(60));
  console.log('✅ Abra o WhatsApp no celular > Aparelhos conectados > Conectar');
  console.log('='.repeat(60) + '\n');
  statusConexao = 'aguardando_scan';
});

// Evento: Cliente pronto
client.on('ready', () => {
  console.log('\n✅ WhatsApp conectado com sucesso!\n');
  console.log('📡 Servidor rodando em: http://localhost:3000');
  console.log('📊 Status: http://localhost:3000/status');
  console.log('📤 Enviar mensagem: POST http://localhost:3000/enviar\n');
  statusConexao = 'conectado';
  clienteWhatsApp = client;
});

// Evento: Autenticação
client.on('authenticated', () => {
  console.log('🔐 Autenticado com sucesso!');
  statusConexao = 'autenticado';
});

// Evento: Falha na autenticação
client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
  statusConexao = 'erro_autenticacao';
});

// Evento: Desconectado
client.on('disconnected', (reason) => {
  console.log('⚠️ WhatsApp desconectado:', reason);
  statusConexao = 'desconectado';
  clienteWhatsApp = null;
});

// Evento: Mensagem recebida
client.on('message', async (msg) => {
  console.log(`📩 Mensagem recebida de ${msg.from}: ${msg.body}`);
});

// Inicializar cliente
client.initialize();

// ====== ROTAS DA API ======

// Status do servidor
app.get('/status', (req, res) => {
  res.json({
    status: statusConexao,
    conectado: statusConexao === 'conectado',
    timestamp: new Date().toISOString()
  });
});

// Enviar mensagem
app.post('/enviar', async (req, res) => {
  try {
    const { telefone, mensagem } = req.body;

    // Validar dados
    if (!telefone || !mensagem) {
      return res.status(400).json({
        success: false,
        error: 'telefone e mensagem são obrigatórios'
      });
    }

    // Verificar se está conectado
    if (!clienteWhatsApp || statusConexao !== 'conectado') {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não está conectado',
        status: statusConexao
      });
    }

    // Normalizar número
    let numeroWhatsApp = telefone.replace(/\D/g, '');
    
    // Adicionar DDI Brasil se necessário
    if (!numeroWhatsApp.startsWith('55')) {
      numeroWhatsApp = '55' + numeroWhatsApp;
    }

    // Adicionar 9º dígito se necessário (celulares)
    if (numeroWhatsApp.length === 12) {
      const ddd = numeroWhatsApp.substring(2, 4);
      const numero = numeroWhatsApp.substring(4);
      if (!numero.startsWith('9')) {
        numeroWhatsApp = '55' + ddd + '9' + numero;
      }
    }

    // Adicionar sufixo do WhatsApp
    numeroWhatsApp = numeroWhatsApp + '@c.us';

    console.log(`📤 Enviando mensagem para ${numeroWhatsApp}...`);

    // Enviar mensagem
    await clienteWhatsApp.sendMessage(numeroWhatsApp, mensagem);

    console.log(`✅ Mensagem enviada com sucesso para ${telefone}`);

    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      telefone: telefone,
      numeroWhatsApp: numeroWhatsApp
    });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enviar para múltiplos números
app.post('/enviar-massa', async (req, res) => {
  try {
    const { telefones, mensagem } = req.body;

    if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'telefones deve ser um array com pelo menos um número'
      });
    }

    if (!mensagem) {
      return res.status(400).json({
        success: false,
        error: 'mensagem é obrigatória'
      });
    }

    if (!clienteWhatsApp || statusConexao !== 'conectado') {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp não está conectado',
        status: statusConexao
      });
    }

    const resultados = [];
    
    for (const telefone of telefones) {
      try {
        let numeroWhatsApp = telefone.replace(/\D/g, '');
        
        if (!numeroWhatsApp.startsWith('55')) {
          numeroWhatsApp = '55' + numeroWhatsApp;
        }

        if (numeroWhatsApp.length === 12) {
          const ddd = numeroWhatsApp.substring(2, 4);
          const numero = numeroWhatsApp.substring(4);
          if (!numero.startsWith('9')) {
            numeroWhatsApp = '55' + ddd + '9' + numero;
          }
        }

        numeroWhatsApp = numeroWhatsApp + '@c.us';

        await clienteWhatsApp.sendMessage(numeroWhatsApp, mensagem);
        
        resultados.push({
          telefone,
          status: 'enviado'
        });

        console.log(`✅ Enviado para ${telefone}`);

        // Delay entre mensagens para evitar bloqueio
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`❌ Erro ao enviar para ${telefone}:`, error.message);
        resultados.push({
          telefone,
          status: 'erro',
          erro: error.message
        });
      }
    }

    res.json({
      success: true,
      total: telefones.length,
      enviados: resultados.filter(r => r.status === 'enviado').length,
      erros: resultados.filter(r => r.status === 'erro').length,
      resultados
    });

  } catch (error) {
    console.error('❌ Erro ao enviar mensagens em massa:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'online',
    whatsapp: statusConexao 
  });
});

// Iniciar servidor Express
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n✅ Servidor iniciado na porta ${PORT}`);
  console.log('\n📋 COMO USAR:\n');
  console.log('1. Aguarde o QR Code aparecer');
  console.log('2. Escaneie com WhatsApp do celular');
  console.log('3. Use as rotas abaixo para enviar mensagens:\n');
  console.log('   📊 Status: GET http://localhost:3000/status');
  console.log('   📤 Enviar: POST http://localhost:3000/enviar');
  console.log('   📤 Enviar Massa: POST http://localhost:3000/enviar-massa\n');
  console.log('Exemplo enviar uma mensagem:');
  console.log(`
curl -X POST http://localhost:3000/enviar \\
  -H "Content-Type: application/json" \\
  -d '{"telefone": "11999999999", "mensagem": "Olá!"}'
  `);
  console.log('\nExemplo enviar para vários:');
  console.log(`
curl -X POST http://localhost:3000/enviar-massa \\
  -H "Content-Type: application/json" \\
  -d '{"telefones": ["11999999999", "11888888888"], "mensagem": "Olá a todos!"}'
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Encerrando servidor...');
  if (clienteWhatsApp) {
    await clienteWhatsApp.destroy();
  }
  process.exit(0);
});
