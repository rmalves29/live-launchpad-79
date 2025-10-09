#!/bin/bash

echo "🚀 Iniciando Servidor WhatsApp"
echo "================================"

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale o Node.js primeiro."
    exit 1
fi

# Instalar dependências se necessário
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install whatsapp-web.js express cors qrcode-terminal node-fetch
fi

# Criar diretório para sessões
if [ ! -d ".wwebjs_auth_tenants" ]; then
    echo "📁 Criando diretório para sessões..."
    mkdir -p .wwebjs_auth_tenants
fi

# Verificar variáveis de ambiente
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "⚠️  SUPABASE_SERVICE_KEY não configurada"
    echo "   Configure com: export SUPABASE_SERVICE_KEY=sua_chave_aqui"
fi

# Definir porta
if [ -z "$PORT" ]; then
    export PORT=3333
fi

echo "🌐 Servidor rodará na porta: $PORT"
echo "📊 Status: http://localhost:$PORT/status"
echo ""

# Iniciar servidor
echo "🚀 Iniciando servidor..."
node server-whatsapp-simple.js
