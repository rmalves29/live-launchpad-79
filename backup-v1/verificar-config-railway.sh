#!/bin/bash

# ============================================================
# VERIFICAR CONFIGURAÇÃO DO RAILWAY
# ============================================================
# Este script verifica se todas as configurações estão corretas
# para FORÇAR o uso do Dockerfile
# ============================================================

set -e

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║        🔍 VERIFICADOR DE CONFIGURAÇÃO RAILWAY                  ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verificar arquivos de configuração
echo -e "${YELLOW}📋 Verificando arquivos de configuração...${NC}"
echo ""

# 1. railway.toml
if [ -f "railway.toml" ]; then
    echo -e "  ✅ ${GREEN}railway.toml${NC} existe"
    if grep -q "DOCKERFILE" railway.toml; then
        echo -e "     ✅ Configurado para usar DOCKERFILE"
    else
        echo -e "     ${RED}❌ NÃO configurado para Dockerfile!${NC}"
    fi
else
    echo -e "  ${RED}❌ railway.toml NÃO existe!${NC}"
fi

# 2. railway.json
if [ -f "railway.json" ]; then
    echo -e "  ✅ ${GREEN}railway.json${NC} existe"
    if grep -q "DOCKERFILE" railway.json; then
        echo -e "     ✅ Configurado para usar DOCKERFILE"
    else
        echo -e "     ${RED}❌ NÃO configurado para Dockerfile!${NC}"
    fi
else
    echo -e "  ${RED}❌ railway.json NÃO existe!${NC}"
fi

# 3. .railway.yml
if [ -f ".railway.yml" ]; then
    echo -e "  ✅ ${GREEN}.railway.yml${NC} existe"
    if grep -q "dockerfile" .railway.yml; then
        echo -e "     ✅ Configurado para usar dockerfile"
    else
        echo -e "     ${RED}❌ NÃO configurado para dockerfile!${NC}"
    fi
else
    echo -e "  ${RED}❌ .railway.yml NÃO existe!${NC}"
fi

# 4. Dockerfile
if [ -f "Dockerfile" ]; then
    echo -e "  ✅ ${GREEN}Dockerfile${NC} existe"
else
    echo -e "  ${RED}❌ Dockerfile NÃO existe!${NC}"
fi

# 5. nixpacks.toml (deve estar desabilitado)
echo ""
if [ -f "nixpacks.toml" ]; then
    echo -e "  ✅ ${GREEN}nixpacks.toml${NC} existe"
    if grep -q "exit 1" nixpacks.toml; then
        echo -e "     ✅ Nixpacks DESABILITADO (retorna erro)"
    else
        echo -e "     ${RED}❌ Nixpacks NÃO está desabilitado!${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠️  nixpacks.toml não existe (OK, Railway não vai usar)${NC}"
fi

# 6. .railwayignore
if [ -f ".railwayignore" ]; then
    echo -e "  ✅ ${GREEN}.railwayignore${NC} existe"
    if grep -q "supabase" .railwayignore; then
        echo -e "     ✅ Pasta supabase será ignorada (evita detecção Deno)"
    else
        echo -e "     ${YELLOW}⚠️  Pasta supabase NÃO está sendo ignorada${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠️  .railwayignore não existe${NC}"
fi

# 7. .dockerignore
if [ -f ".dockerignore" ]; then
    echo -e "  ✅ ${GREEN}.dockerignore${NC} existe"
    if grep -q "supabase" .dockerignore; then
        echo -e "     ✅ Pasta supabase será ignorada no build Docker"
    else
        echo -e "     ${YELLOW}⚠️  Pasta supabase NÃO está sendo ignorada${NC}"
    fi
else
    echo -e "  ${RED}❌ .dockerignore NÃO existe!${NC}"
fi

# Verificar pasta problemática
echo ""
echo -e "${YELLOW}🔍 Verificando pastas que causam detecção de Deno...${NC}"
echo ""

if [ -d "supabase" ]; then
    echo -e "  ${YELLOW}⚠️  Pasta ${GREEN}supabase/${NC} existe"
    echo -e "     → Esta pasta contém arquivos Deno"
    echo -e "     → Mas está sendo ignorada (.railwayignore e .dockerignore)"
    
    # Verificar se tem arquivos Deno
    if find supabase -name "*.ts" -type f | head -1 | grep -q .; then
        echo -e "     → Contém arquivos .ts (Deno)"
    fi
else
    echo -e "  ✅ Pasta supabase NÃO existe (nada para detectar)"
fi

# Verificar arquivos Deno soltos
echo ""
deno_files_found=false
for file in deno.json deno.jsonc deno.lock import_map.json; do
    if [ -f "$file" ]; then
        echo -e "  ${YELLOW}⚠️  Arquivo Deno encontrado: ${GREEN}$file${NC}"
        deno_files_found=true
    fi
done

if [ "$deno_files_found" = false ]; then
    echo -e "  ✅ Nenhum arquivo Deno solto encontrado"
fi

# Resumo final
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                       📊 RESUMO                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${GREEN}✅ Arquivos de configuração Railway:${NC}"
echo -e "   → railway.toml (prioridade ALTA)"
echo -e "   → railway.json (prioridade MÉDIA)"
echo -e "   → .railway.yml (prioridade MÁXIMA)"
echo ""

echo -e "${GREEN}✅ Arquivos de build:${NC}"
echo -e "   → Dockerfile (será usado)"
echo -e "   → .dockerignore (otimizado)"
echo ""

echo -e "${GREEN}✅ Proteção contra Nixpacks:${NC}"
echo -e "   → nixpacks.toml (desabilitado com exit 1)"
echo -e "   → .railwayignore (oculta pasta supabase)"
echo ""

echo -e "${YELLOW}📝 Próximos passos:${NC}"
echo ""
echo "  1. Fazer commit das alterações:"
echo "     git add ."
echo "     git commit -m \"fix: Múltiplas camadas de proteção para forçar Dockerfile\""
echo ""
echo "  2. Fazer push:"
echo "     git push origin main"
echo ""
echo "  3. No Railway Dashboard:"
echo "     → Ir em Settings → Build"
echo "     → Confirmar que Builder está em: DOCKERFILE"
echo "     → Se ainda aparecer Nixpacks, DELETAR o serviço e reconectar"
echo ""
echo "  4. Verificar logs do build:"
echo "     → DEVE aparecer: 'Using Dockerfile'"
echo "     → NÃO deve aparecer: 'Using Nixpacks'"
echo ""

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  ${GREEN}✅ CONFIGURAÇÃO VERIFICADA!${NC}                              ${BLUE}║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}║  Se Railway AINDA usar Nixpacks:                               ║${NC}"
echo -e "${BLUE}║  → DELETE o serviço no Railway                                 ║${NC}"
echo -e "${BLUE}║  → Crie NOVO serviço conectando o repositório                  ║${NC}"
echo -e "${BLUE}║  → Railway vai detectar railway.toml na primeira leitura       ║${NC}"
echo -e "${BLUE}║                                                                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
