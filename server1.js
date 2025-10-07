// Configuração das variáveis de ambiente
process.env.SUPABASE_URL = 'https://hxtbsieodbtzgcvvkeqx.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA';
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

// Importar o servidor v2.0 atualizado
require('./server-whatsapp-v2');