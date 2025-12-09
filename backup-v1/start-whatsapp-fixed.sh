#!/bin/bash

# Script para iniciar o servidor WhatsApp corrigido
# Resolve automaticamente o erro 405 de bloqueio de IP

echo "🚀 Iniciando Servidor WhatsApp Multi-Tenant (Versão Corrigida)"
echo "============================================================"
echo ""

# Ir para o diretório backend
cd "$(dirname "$0")/backend" || exit 1

# Verificar se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Por favor, instale o Node.js primeiro."
    exit 1
fi

# Verificar se as dependências estão instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
    echo ""
fi

# Verificar se o PM2 está instalado
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 detectado. Usando PM2 para gerenciamento..."
    echo ""
    
    # Parar processos anteriores
    pm2 delete whatsapp-api 2>/dev/null || true
    
    # Iniciar com PM2
    pm2 start server-whatsapp-fixed.js --name whatsapp-api
    
    echo ""
    echo "✅ Servidor iniciado com PM2!"
    echo ""
    echo "📊 Comandos úteis:"
    echo "   pm2 logs whatsapp-api        - Ver logs em tempo real"
    echo "   pm2 status                   - Ver status do servidor"
    echo "   pm2 restart whatsapp-api     - Reiniciar servidor"
    echo "   pm2 stop whatsapp-api        - Parar servidor"
    echo ""
    
    # Mostrar logs
    pm2 logs whatsapp-api --lines 20
else
    echo "⚠️  PM2 não encontrado. Rodando diretamente..."
    echo "   (Recomendamos instalar PM2: npm install -g pm2)"
    echo ""
    
    # Rodar diretamente
    node server-whatsapp-fixed.js
fi
