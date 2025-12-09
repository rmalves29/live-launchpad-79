#!/bin/bash

# Script de Teste Local - Simula Ambiente Railway
# Execute antes de fazer deploy para garantir que tudo funciona

set -e

echo "🧪 Teste Local - Ambiente Railway"
echo "=================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Verificar se está na pasta correta
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Execute este script da pasta raiz do projeto!${NC}"
    exit 1
fi

echo -e "${BLUE}[1/7]${NC} Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js encontrado: $(node --version)${NC}"
echo ""

echo -e "${BLUE}[2/7]${NC} Verificando arquivo .env..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠ Arquivo .env não encontrado!${NC}"
    echo "Criando .env de exemplo..."
    cat > .env << 'EOF'
# Copie de .railway-env.example e preencha os valores
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua_service_key
PORT=3333

# Proxy (opcional para teste local)
# PROXY_HOST=proxy.webshare.io
# PROXY_PORT=80
# PROXY_USER=seu_usuario
# PROXY_PASSWORD=sua_senha

# Proteção
WHATSAPP_MAX_RETRIES=2
WHATSAPP_RETRY_DELAY=300000
WHATSAPP_TIMEOUT=120000
WHATSAPP_COOLDOWN_ON_405=1800000
EOF
    echo -e "${YELLOW}⚠ Configure o .env antes de prosseguir!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Arquivo .env encontrado${NC}"
echo ""

echo -e "${BLUE}[3/7]${NC} Instalando dependências..."
cd backend
if [ ! -d "node_modules" ]; then
    echo "Primeira instalação..."
    npm install
fi

echo "Instalando dependências Railway..."
npm install --save \
  socks-proxy-agent \
  @whiskeysockets/baileys \
  @hapi/boom \
  node-fetch \
  qrcode \
  fs-extra \
  pino \
  express \
  cors \
  dotenv 2>&1 | grep -v "npm WARN" || true

cd ..
echo -e "${GREEN}✓ Dependências instaladas${NC}"
echo ""

echo -e "${BLUE}[4/7]${NC} Verificando servidor Railway..."
if [ ! -f "backend/server-whatsapp-railway.js" ]; then
    echo -e "${RED}❌ Arquivo backend/server-whatsapp-railway.js não encontrado!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Servidor Railway encontrado${NC}"
echo ""

echo -e "${BLUE}[5/7]${NC} Verificando variáveis de ambiente..."
source .env

# Verificar variáveis obrigatórias
MISSING_VARS=0

if [ -z "$VITE_SUPABASE_URL" ]; then
    echo -e "${RED}❌ VITE_SUPABASE_URL não configurada${NC}"
    MISSING_VARS=1
fi

if [ -z "$SUPABASE_SERVICE_KEY" ] && [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ SUPABASE_SERVICE_KEY ou VITE_SUPABASE_ANON_KEY não configurada${NC}"
    MISSING_VARS=1
fi

if [ $MISSING_VARS -eq 1 ]; then
    echo -e "${RED}Configure as variáveis obrigatórias no .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Variáveis obrigatórias configuradas${NC}"

# Verificar proxy
if [ -n "$PROXY_HOST" ]; then
    echo -e "${GREEN}✓ Proxy configurado: $PROXY_HOST:$PROXY_PORT${NC}"
else
    echo -e "${YELLOW}⚠ Proxy NÃO configurado (pode ter erro 405)${NC}"
fi
echo ""

echo -e "${BLUE}[6/7]${NC} Testando conexão Supabase..."
SUPABASE_TEST=$(curl -s -o /dev/null -w "%{http_code}" "${VITE_SUPABASE_URL}/rest/v1/" \
  -H "apikey: ${SUPABASE_SERVICE_KEY:-$VITE_SUPABASE_ANON_KEY}" || echo "000")

if [ "$SUPABASE_TEST" == "200" ]; then
    echo -e "${GREEN}✓ Supabase conectado com sucesso!${NC}"
elif [ "$SUPABASE_TEST" == "000" ]; then
    echo -e "${RED}❌ Erro ao conectar no Supabase (timeout)${NC}"
    exit 1
else
    echo -e "${YELLOW}⚠ Resposta Supabase: $SUPABASE_TEST${NC}"
fi
echo ""

echo -e "${BLUE}[7/7]${NC} Iniciando servidor em modo teste..."
echo ""
echo -e "${GREEN}=================================="
echo "  Servidor Railway - Modo Teste"
echo "==================================${NC}"
echo ""
echo "📡 URL: http://localhost:3333"
echo "🔍 Endpoints:"
echo "  • GET  http://localhost:3333/"
echo "  • GET  http://localhost:3333/qr/:tenantId"
echo "  • POST http://localhost:3333/generate-qr/:tenantId"
echo ""
echo -e "${YELLOW}Para testar, em outro terminal execute:${NC}"
echo "  curl http://localhost:3333/"
echo ""
echo -e "${YELLOW}Para parar: Ctrl+C${NC}"
echo ""
echo "=================================="
echo ""

# Iniciar servidor
cd backend
node server-whatsapp-railway.js
