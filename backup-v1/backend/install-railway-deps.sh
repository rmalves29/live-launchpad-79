#!/bin/bash

# Script para instalar dependências necessárias para o servidor Railway

echo "📦 Instalando dependências para Railway..."

cd "$(dirname "$0")"

# Instalar dependências necessárias
npm install --save \
  socks-proxy-agent@latest \
  @whiskeysockets/baileys@latest \
  @hapi/boom@latest \
  node-fetch@^3.3.2 \
  qrcode@latest \
  fs-extra@latest \
  pino@latest \
  express@latest \
  cors@latest \
  dotenv@latest

echo "✅ Dependências instaladas com sucesso!"
echo ""
echo "Pacotes instalados:"
echo "  - socks-proxy-agent (para proxy)"
echo "  - @whiskeysockets/baileys (WhatsApp)"
echo "  - @hapi/boom (tratamento de erros)"
echo "  - node-fetch (requisições HTTP)"
echo "  - qrcode (geração de QR)"
echo "  - fs-extra (manipulação de arquivos)"
echo "  - pino (logs estruturados)"
echo ""
echo "🚀 Pronto para rodar no Railway!"
