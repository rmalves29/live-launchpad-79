#!/bin/bash

echo "🚀 Iniciando WhatsApp Server v2"
echo "================================"

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado"
    exit 1
fi

# Instalar dependências
echo "📦 Verificando dependências..."
npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

# Criar diretório auth
if [ ! -d ".wwebjs_auth_v2" ]; then
    echo "📁 Criando diretório de sessões..."
    mkdir -p .wwebjs_auth_v2
fi

echo ""
echo "✅ Iniciando servidor..."
echo ""

# Executar server1.js que configura env e chama server-whatsapp-individual-no-env.js
node server1.js
