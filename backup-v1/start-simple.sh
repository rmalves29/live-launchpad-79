#!/bin/bash

echo "🚀 Iniciando WhatsApp Server Simplificado"
echo "=========================================="

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale: https://nodejs.org/"
    exit 1
fi

echo "📦 Instalando dependências..."
npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

# Criar diretório de autenticação
if [ ! -d ".wwebjs_auth" ]; then
    echo "📁 Criando diretório de sessões..."
    mkdir -p .wwebjs_auth
fi

# Exportar variável de ambiente
export SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA"

# Porta padrão
if [ -z "$PORT" ]; then
    export PORT=3333
fi

echo ""
echo "✅ Configuração:"
echo "   - Porta: $PORT"
echo "   - Supabase: https://hxtbsieodbtzgcvvkeqx.supabase.co"
echo ""
echo "📊 Endpoints:"
echo "   - Status: http://localhost:$PORT/status"
echo "   - Health: http://localhost:$PORT/health"
echo ""

# Iniciar servidor
echo "🚀 Iniciando servidor..."
echo ""
node server-whatsapp-simple.js
