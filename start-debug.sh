#!/bin/bash

echo "🐛 WhatsApp Server - Modo DEBUG"
echo "================================"
echo ""

# Exportar variáveis de debug do Puppeteer
export DEBUG="puppeteer:*"
export PUPPETEER_PRODUCT="chrome"

# Variáveis do servidor
export SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA"
export PORT=3333

echo "⚠️  Modo DEBUG ativado - Logs detalhados do Puppeteer"
echo ""

# Verificar dependências primeiro
if [ -f "check-dependencies.sh" ]; then
    chmod +x check-dependencies.sh
    ./check-dependencies.sh
    echo ""
    read -p "Pressione ENTER para continuar ou CTRL+C para sair..."
    echo ""
fi

# Instalar dependências
echo "📦 Instalando/Verificando dependências..."
npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

echo ""
echo "🚀 Iniciando servidor em modo DEBUG..."
echo "   Aguarde o QR Code aparecer no terminal"
echo "   (Pode levar 20-40 segundos na primeira vez)"
echo ""

node server1.js 2>&1 | tee whatsapp-debug.log
