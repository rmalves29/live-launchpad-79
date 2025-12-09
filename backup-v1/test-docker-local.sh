#!/bin/bash

# ============================================================
# SCRIPT PARA TESTAR DOCKERFILE LOCALMENTE
# ============================================================
# Use este script para validar o build antes de fazer deploy
# ============================================================

set -e

echo "🐳 Testando Dockerfile localmente..."
echo ""

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Nome da imagem
IMAGE_NAME="orderzap-test"
CONTAINER_NAME="orderzap-test-container"

# Limpar containers/imagens antigas
echo -e "${BLUE}📦 Limpando containers e imagens antigas...${NC}"
docker rm -f $CONTAINER_NAME 2>/dev/null || true
docker rmi -f $IMAGE_NAME 2>/dev/null || true

# Build da imagem
echo ""
echo -e "${BLUE}🔨 Buildando imagem Docker...${NC}"
echo ""

if docker build -t $IMAGE_NAME . ; then
    echo ""
    echo -e "${GREEN}✅ Build concluído com sucesso!${NC}"
else
    echo ""
    echo -e "${RED}❌ Erro no build!${NC}"
    exit 1
fi

# Verificar tamanho da imagem
echo ""
echo -e "${BLUE}📊 Tamanho da imagem:${NC}"
docker images $IMAGE_NAME --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"

# Rodar container
echo ""
echo -e "${BLUE}🚀 Iniciando container...${NC}"
echo ""

docker run -d \
  --name $CONTAINER_NAME \
  -p 3333:3333 \
  -e PORT=3333 \
  -e NODE_ENV=production \
  -e VITE_SUPABASE_URL=https://example.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=exemplo_key \
  $IMAGE_NAME

# Aguardar inicialização
echo ""
echo -e "${YELLOW}⏳ Aguardando servidor iniciar (15 segundos)...${NC}"
sleep 15

# Verificar logs
echo ""
echo -e "${BLUE}📋 Logs do container:${NC}"
docker logs $CONTAINER_NAME

# Testar health check
echo ""
echo -e "${BLUE}🏥 Testando health check...${NC}"
echo ""

if curl -f http://localhost:3333/health ; then
    echo ""
    echo -e "${GREEN}✅ Health check passou!${NC}"
else
    echo ""
    echo -e "${RED}❌ Health check falhou!${NC}"
    echo ""
    echo -e "${YELLOW}Logs completos:${NC}"
    docker logs $CONTAINER_NAME
    exit 1
fi

# Testar endpoint raiz
echo ""
echo -e "${BLUE}🌐 Testando endpoint raiz...${NC}"
echo ""
curl http://localhost:3333/ | jq '.' || curl http://localhost:3333/

# Resumo
echo ""
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                ║${NC}"
echo -e "${GREEN}║  ✅ TESTE CONCLUÍDO COM SUCESSO!               ║${NC}"
echo -e "${GREEN}║                                                ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📝 Próximos passos:${NC}"
echo ""
echo "  1. Testar mais endpoints:"
echo "     curl http://localhost:3333/"
echo "     curl http://localhost:3333/health"
echo ""
echo "  2. Ver logs em tempo real:"
echo "     docker logs -f $CONTAINER_NAME"
echo ""
echo "  3. Acessar no navegador:"
echo "     http://localhost:3333"
echo ""
echo "  4. Parar container:"
echo "     docker stop $CONTAINER_NAME"
echo ""
echo "  5. Fazer deploy no Railway:"
echo "     git add ."
echo "     git commit -m \"fix: Configurar Railway para usar Dockerfile\""
echo "     git push origin main"
echo ""
echo -e "${YELLOW}⚠️  Container ainda está rodando!${NC}"
echo -e "   Para parar: ${BLUE}docker stop $CONTAINER_NAME${NC}"
echo ""
