#!/bin/bash

# 🚀 Script de Deploy - Edge Function WhatsApp Proxy v5.0
# Autor: Sistema Automatizado
# Data: 2025-12-10

set -e  # Exit on error

echo "======================================"
echo "🚀 Deploy Edge Function v5.0"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

PROJECT_REF="hxtbsieodbtzgcvvkeqx"
FUNCTION_NAME="whatsapp-proxy"

# Check if Supabase CLI is installed
echo -e "${BLUE}🔍 Verificando Supabase CLI...${NC}"
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}⚠️  Supabase CLI não encontrado. Instalando...${NC}"
    npm install -g supabase
else
    echo -e "${GREEN}✅ Supabase CLI encontrado${NC}"
fi

echo ""

# Check if logged in
echo -e "${BLUE}🔐 Verificando autenticação...${NC}"
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠️  Não autenticado. Execute: supabase login${NC}"
    echo -e "${YELLOW}   Depois execute este script novamente.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Autenticado no Supabase${NC}"
fi

echo ""

# Link project if needed
echo -e "${BLUE}🔗 Verificando link com projeto...${NC}"
if [ ! -f ".supabase/config.toml" ]; then
    echo -e "${YELLOW}⚠️  Projeto não linkado. Linkando...${NC}"
    supabase link --project-ref $PROJECT_REF
else
    echo -e "${GREEN}✅ Projeto já linkado${NC}"
fi

echo ""

# Deploy function
echo -e "${BLUE}📦 Deployando Edge Function: ${FUNCTION_NAME}...${NC}"
echo ""
npx supabase functions deploy $FUNCTION_NAME --project-ref $PROJECT_REF

echo ""
echo -e "${GREEN}✅ Deploy concluído com sucesso!${NC}"
echo ""

# Show function URL
FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}"
echo -e "${GREEN}📍 URL da função:${NC}"
echo -e "   ${FUNCTION_URL}"
echo ""

# Test function
echo -e "${BLUE}🧪 Deseja testar a função? (s/n)${NC}"
read -r TEST_FUNCTION

if [ "$TEST_FUNCTION" = "s" ] || [ "$TEST_FUNCTION" = "S" ]; then
    echo ""
    echo -e "${BLUE}🔍 Testando função...${NC}"
    
    # Test with status action
    TENANT_ID="08f2b1b9-3988-489e-8186-c60f0c0b0622"
    
    echo -e "${YELLOW}Enviando requisição de teste (status)...${NC}"
    curl -X POST "$FUNCTION_URL" \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"status\",\"tenant_id\":\"$TENANT_ID\"}" \
      2>/dev/null | jq . || echo ""
    
    echo ""
fi

# View logs
echo ""
echo -e "${BLUE}📋 Deseja ver os logs? (s/n)${NC}"
read -r VIEW_LOGS

if [ "$VIEW_LOGS" = "s" ] || [ "$VIEW_LOGS" = "S" ]; then
    echo ""
    echo -e "${BLUE}📋 Visualizando logs...${NC}"
    echo -e "${YELLOW}(Pressione Ctrl+C para sair)${NC}"
    echo ""
    npx supabase functions logs $FUNCTION_NAME --project-ref $PROJECT_REF
fi

echo ""
echo -e "${GREEN}======================================"
echo "✅ Processo concluído!"
echo "======================================${NC}"
echo ""
echo -e "📚 Documentação completa em: ${BLUE}DEPLOY_EDGE_FUNCTION.md${NC}"
echo ""
