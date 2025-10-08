#!/bin/bash

echo "🚀 Iniciando WhatsApp Server v3 - Multi-Tenant"
echo "=============================================="

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instale: https://nodejs.org/"
    exit 1
fi

echo "📦 Verificando dependências..."

# Instalar dependências usando o package.json específico
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "📦 Instalando dependências do servidor WhatsApp..."
    npm install --prefix . --package-lock-only=false
    
    # Instalar dependências individuais se o package.json não funcionar
    npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0
fi

# Criar diretório de autenticação
if [ ! -d ".wwebjs_auth_v3" ]; then
    echo "📁 Criando diretório de sessões..."
    mkdir -p .wwebjs_auth_v3
fi

# Verificar variáveis de ambiente
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "⚠️  ATENÇÃO: SUPABASE_SERVICE_KEY não configurada!"
    echo ""
    echo "Configure assim:"
    echo "  export SUPABASE_SERVICE_KEY=sua_chave_aqui"
    echo ""
    read -p "Digite sua SUPABASE_SERVICE_KEY agora (ou Enter para sair): " key
    
    if [ -z "$key" ]; then
        echo "❌ Abortado. Configure a variável de ambiente primeiro."
        exit 1
    fi
    
    export SUPABASE_SERVICE_KEY=$key
fi

# Porta padrão
if [ -z "$PORT" ]; then
    export PORT=3333
fi

echo ""
echo "✅ Configuração:"
echo "   - Porta: $PORT"
echo "   - Supabase URL: https://hxtbsieodbtzgcvvkeqx.supabase.co"
echo "   - Service Key: ${SUPABASE_SERVICE_KEY:0:20}..."
echo ""
echo "📊 Endpoints:"
echo "   - Status geral: http://localhost:$PORT/status"
echo "   - Health check: http://localhost:$PORT/health"
echo ""

# Iniciar servidor
echo "🚀 Iniciando servidor..."
echo ""
node server-whatsapp-v3.js
