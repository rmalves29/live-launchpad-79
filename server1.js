// Configuração das variáveis de ambiente
process.env.SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
process.env.PORT = process.env.PORT || '3333';

// Verificar se a chave do Supabase foi fornecida
if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY não configurada!');
    console.log('💡 Configure com: $env:SUPABASE_SERVICE_KEY="sua_chave_aqui"');
    process.exit(1);
}

// Importar e executar o servidor
console.log('🚀 Iniciando servidor WhatsApp...');
console.log(`📊 Status: http://localhost:${process.env.PORT}/status`);

// Importar o servidor correto (sem .js duplicado)
require('./server-whatsapp-individual-no-env');