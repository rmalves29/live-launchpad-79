#!/bin/bash

echo "🚀 Iniciando Sistema Multi-Tenant"
echo "=================================="

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale o Node.js primeiro."
    exit 1
fi

# Verificar se as dependências estão instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install whatsapp-web.js express cors qrcode-terminal node-fetch express-fileupload
fi

# Criar diretório para sessões se não existir
if [ ! -d ".wwebjs_auth_tenants" ]; then
    echo "📁 Criando diretório para sessões multi-tenant..."
    mkdir -p .wwebjs_auth_tenants
fi

# Verificar variáveis de ambiente
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "⚠️  Aviso: SUPABASE_SERVICE_KEY não configurada"
    echo "   Configure com: export SUPABASE_SERVICE_KEY=sua_chave_aqui"
fi

# Definir porta padrão se não configurada
if [ -z "$PORT" ]; then
    export PORT=3333
fi

echo "🌐 Servidor rodará na porta: $PORT"
echo "📊 Status: http://localhost:$PORT/status"
echo ""
echo "🔧 Configurações:"
echo "   - Supabase URL: https://hxtbsieodbtzgcvvkeqx.supabase.co"
echo "   - Service Key: ${SUPABASE_SERVICE_KEY:0:20}..."
echo ""

# Iniciar servidor
echo "🚀 Iniciando servidor multi-tenant..."
node server-whatsapp-multitenant.js