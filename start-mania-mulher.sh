#!/bin/bash
# Script para iniciar servidor Mania de Mulher - VERSÃO ESTÁVEL

echo "========================================"
echo "  WhatsApp Server - MANIA DE MULHER"
echo "========================================"
echo ""
echo "🚀 Iniciando servidor estável..."
echo "📌 Porta: 3334"
echo "🌐 URL: http://localhost:3334"
echo ""
echo "✨ Recursos:"
echo "  • Fila de mensagens"
echo "  • Auto-retry (3x)"
echo "  • Proteção rate limiting"
echo "  • Reconexão automática"
echo ""

# Iniciar servidor
node server-whatsapp-mania-mulher.js
