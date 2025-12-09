#!/bin/bash

echo "========================================"
echo "  INSTALADOR DO SERVIDOR WHATSAPP"
echo "========================================"
echo ""

# Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "[ERRO] Node.js não encontrado!"
    echo ""
    echo "Por favor, instale o Node.js primeiro:"
    echo "https://nodejs.org/"
    echo ""
    exit 1
fi

echo "[OK] Node.js encontrado!"
node --version
echo ""

# Verificar se package.json existe
if [ ! -f "package.json" ]; then
    echo "[INFO] Copiando package.json..."
    cp package-server.json package.json
fi

# Instalar dependências
echo "[INFO] Instalando dependências..."
echo "Isso pode demorar alguns minutos..."
echo ""
npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "[ERRO] Falha ao instalar dependências!"
    exit 1
fi

echo ""
echo "========================================"
echo "  INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "========================================"
echo ""

# Verificar se .env existe
if [ ! -f ".env" ]; then
    echo "[AVISO] Arquivo .env não encontrado!"
    echo ""
    echo "Criando .env de exemplo..."
    cp .env.exemplo .env
    echo ""
    echo "IMPORTANTE: Edite o arquivo .env e preencha suas credenciais!"
    echo "  - SUPABASE_SERVICE_KEY"
    echo ""
    echo "Use: nano .env ou vim .env"
    echo ""
fi

echo ""
echo "Próximos passos:"
echo "1. Configure o arquivo .env com suas credenciais"
echo "2. Execute: ./start-v3.sh"
echo "3. No site, vá em WhatsApp e conecte"
echo ""
