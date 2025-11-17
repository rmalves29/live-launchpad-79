/**
 * Wrapper de inicialização robusto para o servidor WhatsApp
 * - Trata configuração de diretórios
 * - Implementa graceful shutdown
 * - Previne crashes por falta de recursos
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configurar diretório de dados com fallback
function setupDataDirectory() {
  const preferredDir = '/data/.baileys_auth';
  const fallbackDir = path.join(process.cwd(), '.baileys_auth');
  
  let authDir;
  
  // Tentar usar /data primeiro (Railway volume)
  try {
    fs.mkdirSync(preferredDir, { recursive: true, mode: 0o755 });
    fs.accessSync(preferredDir, fs.constants.W_OK);
    authDir = preferredDir;
    console.log('✅ Usando diretório de dados:', preferredDir);
  } catch (err) {
    // Se falhar, usar diretório local
    console.warn('⚠️  Não foi possível usar /data, usando diretório local');
    try {
      fs.mkdirSync(fallbackDir, { recursive: true, mode: 0o755 });
      authDir = fallbackDir;
      console.log('✅ Usando diretório de dados:', fallbackDir);
    } catch (fallbackErr) {
      console.error('❌ Erro ao criar diretório de dados:', fallbackErr);
      process.exit(1);
    }
  }
  
  return authDir;
}

// Configurar variáveis de ambiente
const authDir = setupDataDirectory();
process.env.AUTH_DIR = authDir;

// Iniciar servidor com tratamento de erros
const server = spawn('node', ['server-multitenant-clean.js'], {
  stdio: 'inherit',
  env: process.env
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️  Recebido sinal ${signal}, encerrando graciosamente...`);
  server.kill('SIGTERM');
  
  setTimeout(() => {
    console.log('⏰ Timeout: forçando encerramento');
    server.kill('SIGKILL');
    process.exit(1);
  }, 30000); // 30 segundos para limpar recursos
};

// Capturar sinais de término
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Tratar saída do servidor
server.on('exit', (code, signal) => {
  if (signal) {
    console.log(`⚠️  Servidor encerrado por sinal: ${signal}`);
    process.exit(1);
  } else if (code !== 0) {
    console.error(`❌ Servidor encerrou com código: ${code}`);
    process.exit(code);
  } else {
    console.log('✅ Servidor encerrado normalmente');
    process.exit(0);
  }
});

// Tratar erros
server.on('error', (err) => {
  console.error('❌ Erro ao iniciar servidor:', err);
  process.exit(1);
});

console.log('🚀 Wrapper de inicialização ativo');
