/**
 * WhatsApp Server - Modo Debug Visual (Browser Visível)
 * Use este arquivo para ver o que está acontecendo no navegador
 */

// Configuração de ambiente
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';
process.env.PORT = '3333';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

console.log('🐛 WhatsApp Server - Modo Debug Visual');
console.log('======================================');
console.log('');
console.log('⚠️  O navegador Chrome/Chromium irá abrir');
console.log('   Você poderá ver o que está acontecendo');
console.log('');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'debug_test',
    dataPath: '.wwebjs_auth_debug'
  }),
  puppeteer: {
    headless: false, // ← Browser visível!
    devtools: true,  // ← DevTools aberto
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  }
});

client.on('qr', (qr) => {
  console.log('\n' + '='.repeat(70));
  console.log('📱 QR CODE GERADO!');
  console.log('='.repeat(70));
  console.log('');
  qrcode.generate(qr, { small: true });
  console.log('');
  console.log('='.repeat(70));
  console.log('✅ Escaneie o QR code acima com seu WhatsApp');
  console.log('='.repeat(70));
  console.log('');
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Carregando: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
  console.log('✅ Autenticado com sucesso!');
});

client.on('ready', () => {
  console.log('\n✅✅✅ WhatsApp Web CONECTADO! ✅✅✅\n');
  console.log('Cliente pronto para uso');
  console.log('Pressione CTRL+C para encerrar');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação:', msg);
});

client.on('disconnected', (reason) => {
  console.log('🔌 Desconectado:', reason);
});

console.log('🔄 Inicializando WhatsApp Web...');
console.log('⏰ Aguarde o navegador abrir (pode levar 20-30 segundos)...');
console.log('');

client.initialize()
  .then(() => {
    console.log('✅ Inicialização concluída');
  })
  .catch((error) => {
    console.error('❌ ERRO na inicialização:');
    console.error('   Tipo:', error.name);
    console.error('   Mensagem:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Encerrando...');
  try {
    await client.destroy();
    console.log('✅ Desconectado com sucesso');
  } catch (error) {
    console.error('⚠️  Erro ao desconectar:', error.message);
  }
  process.exit(0);
});
