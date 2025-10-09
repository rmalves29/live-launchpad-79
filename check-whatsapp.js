/**
 * ========================================
 * TESTE RÁPIDO - WhatsApp Connection
 * ========================================
 * 
 * Script para testar a conexão WhatsApp isoladamente
 * Use para diagnosticar problemas antes de rodar o servidor completo
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('🧪 TESTE DE CONEXÃO WHATSAPP');
console.log('='.repeat(70) + '\n');

// Configuração
const AUTH_DIR = path.join(__dirname, '.wwebjs_test');
const TIMEOUT = 90000; // 90 segundos

// Limpar diretório de teste se existir
if (fs.existsSync(AUTH_DIR)) {
  console.log('🧹 Limpando sessão de teste antiga...');
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

console.log('📂 Diretório de teste:', AUTH_DIR);
console.log('⏰ Timeout configurado:', TIMEOUT / 1000, 'segundos\n');

// Detectar sistema operacional
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';

console.log('💻 Sistema operacional:', process.platform);
console.log('📦 Node.js versão:', process.version);
console.log('\n' + '='.repeat(70) + '\n');

// Configurar cliente com flags otimizadas
const puppeteerConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-web-security',
    '--disable-features=IsolateOrigins',
    '--disable-site-isolation-trials'
  ],
  timeout: TIMEOUT
};

// Adicionar flags específicas para Linux
if (isLinux) {
  puppeteerConfig.args.push('--single-process');
  console.log('🐧 Linux detectado - flags adicionais ativadas\n');
}

console.log('⚙️ Configuração Puppeteer:');
console.log(JSON.stringify(puppeteerConfig, null, 2));
console.log('\n' + '='.repeat(70) + '\n');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'test_client',
    dataPath: AUTH_DIR
  }),
  puppeteer: puppeteerConfig,
  qrMaxRetries: 5
});

let startTime = Date.now();
let qrGenerated = false;
let authenticated = false;
let connected = false;

// Event: QR Code
client.on('qr', (qr) => {
  qrGenerated = true;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log('✅ QR CODE GERADO em ' + elapsed + 's\n');
  console.log('='.repeat(70));
  console.log('📱 Escaneie este QR Code com seu WhatsApp:');
  console.log('='.repeat(70) + '\n');
  
  try {
    const qrcode = require('qrcode-terminal');
    qrcode.generate(qr, { small: true });
  } catch (error) {
    console.error('❌ Erro ao gerar QR visual:', error.message);
    console.log('\n📋 QR Code string:\n' + qr + '\n');
  }
  
  console.log('\n='.repeat(70));
  console.log('⏰ Tempo restante:', Math.round((TIMEOUT - (Date.now() - startTime)) / 1000), 'segundos');
  console.log('='.repeat(70) + '\n');
});

// Event: Loading
client.on('loading_screen', (percent) => {
  process.stdout.write(`\r⏳ Carregando: ${percent}%`);
});

// Event: Authenticated
client.on('authenticated', () => {
  authenticated = true;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n✅ AUTENTICADO em ' + elapsed + 's\n');
});

// Event: Ready
client.on('ready', () => {
  connected = true;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n' + '='.repeat(70));
  console.log('🎉 SUCESSO! WhatsApp conectado em ' + elapsed + 's');
  console.log('='.repeat(70) + '\n');
  
  console.log('📊 RESUMO DO TESTE:');
  console.log('  ✅ QR Code gerado');
  console.log('  ✅ Autenticado');
  console.log('  ✅ Conectado');
  console.log('  ⏱️  Tempo total:', elapsed + 's\n');
  
  console.log('🎯 CONCLUSÃO:');
  console.log('  Sua configuração está funcionando perfeitamente!');
  console.log('  Você pode rodar o servidor completo agora.\n');
  
  console.log('='.repeat(70) + '\n');
  
  // Desconectar e limpar
  setTimeout(async () => {
    console.log('🧹 Limpando sessão de teste...');
    await client.destroy();
    
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    }
    
    console.log('✅ Teste concluído!\n');
    process.exit(0);
  }, 3000);
});

// Event: Auth Failure
client.on('auth_failure', (msg) => {
  console.error('\n❌ FALHA NA AUTENTICAÇÃO');
  console.error('📋 Mensagem:', msg);
  console.error('\n🔧 SOLUÇÕES:');
  console.error('  1. Execute: npm uninstall whatsapp-web.js puppeteer');
  console.error('  2. Execute: npm install whatsapp-web.js@latest');
  console.error('  3. Delete a pasta: ' + AUTH_DIR);
  console.error('  4. Tente novamente\n');
  process.exit(1);
});

// Event: Disconnected
client.on('disconnected', (reason) => {
  console.warn('\n⚠️ DESCONECTADO:', reason);
  
  if (!connected) {
    console.error('\n❌ Não conseguiu estabelecer conexão inicial');
    console.error('\n🔧 DIAGNÓSTICO:');
    console.error('  QR Code gerado:', qrGenerated ? '✅' : '❌');
    console.error('  Autenticado:', authenticated ? '✅' : '❌');
    console.error('  Conectado:', connected ? '✅' : '❌');
    console.error('\n💡 PRÓXIMOS PASSOS:');
    
    if (!qrGenerated) {
      console.error('\n  ❌ QR Code não foi gerado - Problema com Puppeteer');
      console.error('\n  SOLUÇÕES:');
      console.error('  1. Verifique se o Chrome/Chromium está sendo baixado:');
      console.error('     npm install puppeteer --force');
      console.error('\n  2. Ou use o Chrome do sistema:');
      console.error('     npm install puppeteer-core');
      console.error('     (e configure executablePath no código)');
      console.error('\n  3. Teste conectividade:');
      console.error('     ping web.whatsapp.com');
      console.error('     curl https://web.whatsapp.com');
      console.error('\n  4. Desative antivírus/firewall temporariamente');
    } else if (!authenticated) {
      console.error('\n  ⏰ QR Code expirou - Tente novamente');
      console.error('  💡 Dica: Mantenha o WhatsApp aberto e pronto para escanear');
    }
    
    console.error('\n');
    process.exit(1);
  }
});

// Timeout manual
setTimeout(() => {
  if (!connected) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    console.error('\n' + '='.repeat(70));
    console.error('⏰ TIMEOUT após ' + elapsed + 's');
    console.error('='.repeat(70) + '\n');
    
    console.error('📊 ESTADO ATUAL:');
    console.error('  QR Code gerado:', qrGenerated ? '✅' : '❌');
    console.error('  Autenticado:', authenticated ? '✅' : '❌');
    console.error('  Conectado:', connected ? '✅' : '❌');
    console.error('\n🔧 DIAGNÓSTICO:\n');
    
    if (!qrGenerated) {
      console.error('  ❌ PUPPETEER TRAVADO\n');
      console.error('  Possíveis causas:');
      console.error('  • Chromium não foi baixado corretamente');
      console.error('  • Firewall/antivírus bloqueando');
      console.error('  • Falta de dependências no sistema (Linux)\n');
      console.error('  Soluções:');
      console.error('  1. Execute: node -e "const p = require(\'puppeteer\'); console.log(p.executablePath())"');
      console.error('  2. Se der erro, reinstale: npm install puppeteer@latest --force');
      console.error('  3. Linux: instale dependências:');
      console.error('     sudo apt-get install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget');
    } else if (qrGenerated && !authenticated) {
      console.error('  ⏰ QR CODE EXPIROU\n');
      console.error('  O QR Code foi gerado mas não foi escaneado a tempo.');
      console.error('  Solução: Execute novamente e escaneie mais rápido.');
    } else if (authenticated && !connected) {
      console.error('  🔄 AUTENTICADO MAS NÃO CONECTOU\n');
      console.error('  Possíveis causas:');
      console.error('  • Problema de rede/proxy');
      console.error('  • WhatsApp Web fora do ar');
      console.error('  • Sessão corrompida\n');
      console.error('  Soluções:');
      console.error('  1. Teste conectividade: curl https://web.whatsapp.com');
      console.error('  2. Delete a pasta: ' + AUTH_DIR);
      console.error('  3. Desative proxy/VPN');
    }
    
    console.error('\n');
    process.exit(1);
  }
}, TIMEOUT + 5000);

// Iniciar teste
console.log('🚀 Iniciando teste de conexão...\n');
console.log('📡 Conectando ao WhatsApp Web...');
console.log('⏰ Aguarde até ' + (TIMEOUT / 1000) + ' segundos\n');

client.initialize().catch(error => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  
  console.error('\n' + '='.repeat(70));
  console.error('❌ ERRO FATAL após ' + elapsed + 's');
  console.error('='.repeat(70) + '\n');
  console.error('📋 Erro:', error.message);
  console.error('📋 Stack:', error.stack);
  
  console.error('\n🔧 ANÁLISE DO ERRO:\n');
  
  if (error.message.includes('Chromium') || error.message.includes('revision')) {
    console.error('  ❌ CHROMIUM NÃO ENCONTRADO\n');
    console.error('  Soluções:');
    console.error('  1. Instalar Chromium: npm install puppeteer@latest --force');
    console.error('  2. Ou usar Chrome do sistema:');
    console.error('     npm install puppeteer-core');
    console.error('     (configure executablePath)');
  } else if (error.message.includes('Protocol error') || error.message.includes('Target closed')) {
    console.error('  ❌ ERRO DE PROTOCOLO\n');
    console.error('  Chrome/Chromium corrompido ou incompatível.');
    console.error('  Solução:');
    console.error('  1. npm uninstall puppeteer whatsapp-web.js');
    console.error('  2. npm cache clean --force');
    console.error('  3. npm install whatsapp-web.js@latest');
  } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
    console.error('  ⏰ TIMEOUT\n');
    console.error('  A conexão demorou demais.');
    console.error('  Possíveis causas:');
    console.error('  • Rede lenta/instável');
    console.error('  • Firewall bloqueando');
    console.error('  • Proxy/VPN interferindo');
    console.error('\n  Soluções:');
    console.error('  1. Teste conectividade: curl https://web.whatsapp.com');
    console.error('  2. Desative firewall temporariamente');
    console.error('  3. Desconecte VPN');
  } else {
    console.error('  ❓ ERRO DESCONHECIDO\n');
    console.error('  Tente as soluções gerais:');
    console.error('  1. Reinstalar dependências');
    console.error('  2. Limpar cache: npm cache clean --force');
    console.error('  3. Verificar versão do Node.js (recomendado: v16+)');
    console.error('  4. Executar como Administrador (Windows)');
  }
  
  console.error('\n📞 Se nada funcionar, consulte:');
  console.error('  • DIAGNOSTICO_PUPPETEER.md');
  console.error('  • TROUBLESHOOTING.md\n');
  
  process.exit(1);
});
