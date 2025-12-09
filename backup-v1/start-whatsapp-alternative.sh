#!/bin/bash

# Script de Inicialização do Servidor WhatsApp Multi-Tenant
# Sem necessidade de PM2

echo "🚀 Iniciando Servidor WhatsApp Multi-Tenant..."
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar se estamos no diretório correto
if [ ! -f "backend/server-whatsapp-alternative.js" ]; then
    echo -e "${RED}❌ Erro: Execute este script da pasta raiz do projeto (/home/user/webapp)${NC}"
    exit 1
fi

# 2. Navegar para backend
cd backend

# 3. Verificar se Node.js está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado. Instale com:${NC}"
    echo "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "sudo apt-get install -y nodejs"
    exit 1
fi

echo -e "${GREEN}✓ Node.js encontrado: $(node --version)${NC}"

# 4. Verificar se os módulos estão instalados
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠ Instalando dependências...${NC}"
    npm install
fi

# 5. Limpar sessões antigas
echo -e "${YELLOW}🧹 Limpando sessões antigas...${NC}"
rm -rf baileys_auth*
echo -e "${GREEN}✓ Sessões limpas${NC}"

# 6. Verificar se a porta 3333 está em uso
if lsof -Pi :3333 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}⚠ Porta 3333 em uso. Matando processo...${NC}"
    pkill -f "node server-whatsapp"
    sleep 2
fi

# 7. Mostrar informações
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Servidor WhatsApp Multi-Tenant${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "📡 Porta: 3333"
echo "📁 Auth Dir: baileys_auth_alt"
echo "🌐 IP Público: $(curl -s ifconfig.me)"
echo ""
echo -e "${YELLOW}📋 Endpoints disponíveis:${NC}"
echo "  • GET  http://localhost:3333/"
echo "  • GET  http://localhost:3333/qr/:tenantId"
echo "  • POST http://localhost:3333/generate-qr/:tenantId"
echo "  • POST http://localhost:3333/reset/:tenantId"
echo ""
echo -e "${YELLOW}Para testar o QR Code em outro terminal:${NC}"
echo "  curl http://localhost:3333/qr/SEU_TENANT_ID"
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 8. Iniciar servidor
echo -e "${GREEN}🚀 Iniciando servidor...${NC}"
echo ""
node server-whatsapp-alternative.js
