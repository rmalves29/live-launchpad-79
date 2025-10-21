/**
 * Servidor WhatsApp SIMPLIFICADO - 1 Tenant por vez
 * Use este para testar se o problema é com multi-tenant
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🚀 WhatsApp Server SIMPLES - 1 Tenant');
console.log('=====================================\n');

// Configurações
const TENANT_ID = '08f2b1b9-3988-489e-8186-c60f0c0b0622'; // MANIA DE MULHER
const AUTH_DIR = '.wwebjs_auth_simple';

console.log(`📋 Tenant ID: ${TENANT_ID}`);
console.log(`📂 Auth Dir: ${AUTH_DIR}\n`);

console.log('🔧 Criando cliente WhatsApp...');

const client = new Client({
  authStrategy: new LocalAuth({ 
    clientId: 'simple_test',
    dataPath: AUTH_DIR
  }),
  puppeteer: {
    headless: false, // BROWSER VISÍVEL para debug!
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  }
});

console.log('✅ Cliente criado!\n');

client.on('qr', (qr) => {
  console.log('\n' + '='.repeat(70));
  console.log('📱 QR CODE GERADO! ESCANEIE ABAIXO:');
  console.log('='.repeat(70) + '\n');
  qrcode.generate(qr, { small: true });
  console.log('\n' + '='.repeat(70));
  console.log('✅ Use o WhatsApp no celular para escanear');
  console.log('='.repeat(70) + '\n');
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Carregando: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
  console.log('\n🔐 AUTENTICADO COM SUCESSO!\n');
});

client.on('ready', () => {
  console.log('\n' + '='.repeat(70));
  console.log('✅✅✅ WHATSAPP CONECTADO! ✅✅✅');
  console.log('='.repeat(70));
  console.log('\n✨ Tudo funcionando! Agora você pode usar o servidor completo.\n');
  console.log('💡 Pressione CTRL+C para encerrar\n');
});

client.on('auth_failure', (msg) => {
  console.error('\n❌ FALHA NA AUTENTICAÇÃO:');
  console.error(msg);
  console.error('\n💡 Tente remover a pasta:', AUTH_DIR);
  console.error('   E execute novamente\n');
});

client.on('disconnected', (reason) => {
  console.log('\n🔌 Desconectado:', reason, '\n');
});

console.log('🔄 Inicializando WhatsApp Web...');
console.log('⏰ Aguarde o navegador abrir (pode levar 30-60 segundos)...');
console.log('🌐 Uma janela do Chrome vai abrir automaticamente\n');

client.initialize()
  .then(() => {
    console.log('✅ Inicialização completa');
  })
  .catch((error) => {
    console.error('\n❌ ERRO NA INICIALIZAÇÃO:\n');
    console.error('Tipo:', error.name);
    console.error('Mensagem:', error.message);
    console.error('\nStack Trace:');
    console.error(error.stack);
    console.error('\n💡 POSSÍVEIS SOLUÇÕES:');
    console.error('1. Execute: reinstalar-puppeteer.bat');
    console.error('2. Feche todos os processos Chrome no Gerenciador de Tarefas');
    console.error('3. Adicione exceção no Antivírus');
    console.error('4. Rode como Administrador\n');
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando...');
  try {
    await client.destroy();
    console.log('✅ Desconectado');
  } catch (error) {
    console.error('⚠️ Erro ao desconectar:', error.message);
  }
  process.exit(0);
});
