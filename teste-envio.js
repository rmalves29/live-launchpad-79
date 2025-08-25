// teste-envio.js
// Script para testar o envio de mensagens via API

const http = require('http');

const SERVIDOR = 'http://localhost:3000';
const TELEFONE_TESTE = '5531999999999'; // Substitua pelo seu número

async function testarStatus() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${SERVIDOR}/status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          console.log('📊 Status:', status);
          resolve(status);
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => reject(new Error('Timeout')));
  });
}

async function testarEnvio(telefone, mensagem) {
  return new Promise((resolve, reject) => {
    const dados = JSON.stringify({
      to: telefone,
      message: mensagem
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/send-message',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': dados.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const resultado = JSON.parse(data);
          console.log('📤 Resultado do envio:', resultado);
          resolve(resultado);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => reject(new Error('Timeout no envio')));
    req.write(dados);
    req.end();
  });
}

async function main() {
  console.log('🚀 Testando servidor WhatsApp...\n');
  
  try {
    // Testar status
    console.log('1️⃣ Verificando status do servidor...');
    const status = await testarStatus();
    
    if (status.state !== 'ready') {
      console.log('❌ Servidor não está pronto. Estado:', status.state);
      console.log('💡 Certifique-se de:');
      console.log('   - O servidor está rodando (node server-whatsapp-minimo.js)');
      console.log('   - O QR Code foi escaneado');
      console.log('   - O WhatsApp está conectado');
      return;
    }
    
    console.log('✅ Servidor pronto! Número:', status.number);
    console.log('');
    
    // Testar envio
    console.log('2️⃣ Testando envio de mensagem...');
    console.log(`📱 Enviando para: ${TELEFONE_TESTE}`);
    
    const mensagemTeste = `🤖 Teste automático do sistema\n\nData: ${new Date().toLocaleString()}\nServidor: Funcionando ✅`;
    
    const resultado = await testarEnvio(TELEFONE_TESTE, mensagemTeste);
    
    if (resultado.success) {
      console.log('✅ Mensagem enviada com sucesso!');
      console.log('📨 ID da mensagem:', resultado.id);
    } else {
      console.log('❌ Erro no envio:', resultado.error);
    }
    
  } catch (error) {
    console.error('💥 Erro durante o teste:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Servidor não está rodando!');
      console.log('💡 Execute: node server-whatsapp-minimo.js');
    }
  }
  
  console.log('\n🏁 Teste finalizado.');
}

// Verificar se foi passado um número como argumento
if (process.argv[2]) {
  const TELEFONE_TESTE = process.argv[2];
  console.log(`📱 Usando número fornecido: ${TELEFONE_TESTE}`);
} else {
  console.log(`📱 Usando número padrão: ${TELEFONE_TESTE}`);
  console.log('💡 Para usar outro número: node teste-envio.js 5531999999999');
}

main();