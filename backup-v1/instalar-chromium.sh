#!/bin/bash
echo "===================================="
echo "  Instalacao do Chromium/Chrome"
echo "===================================="
echo ""

echo "[1/2] Instalando dependencias..."
npm install

echo ""
echo "[2/2] Forçando download do Chromium..."
npm run install-chrome

echo ""
echo "===================================="
echo "  Instalacao concluida!"
echo "===================================="
echo ""
echo "Agora voce pode iniciar o servidor com:"
echo "  ./start-server.sh"
echo ""
