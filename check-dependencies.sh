#!/bin/bash

echo "🔍 Verificando Dependências do WhatsApp Server"
echo "=============================================="
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    echo "✅ Node.js: $(node --version)"
else
    echo "❌ Node.js não encontrado"
fi

# Check npm
if command -v npm &> /dev/null; then
    echo "✅ npm: $(npm --version)"
else
    echo "❌ npm não encontrado"
fi

# Check Chrome/Chromium dependencies (Linux)
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo ""
    echo "🔍 Verificando dependências do Chromium (Linux)..."
    
    missing_deps=()
    
    # Lista de dependências comuns do Chromium
    deps=(
        "libgbm1"
        "libasound2"
        "libatk1.0-0"
        "libatk-bridge2.0-0"
        "libcups2"
        "libdrm2"
        "libxkbcommon0"
        "libxcomposite1"
        "libxdamage1"
        "libxfixes3"
        "libxrandr2"
        "libpango-1.0-0"
        "libcairo2"
        "libnss3"
    )
    
    for dep in "${deps[@]}"; do
        if dpkg -l | grep -q "$dep"; then
            echo "  ✅ $dep"
        else
            echo "  ❌ $dep (FALTANDO)"
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo ""
        echo "⚠️  ATENÇÃO: Dependências faltando detectadas!"
        echo "   Execute o comando abaixo para instalar:"
        echo ""
        echo "   sudo apt-get update && sudo apt-get install -y ${missing_deps[*]}"
        echo ""
    fi
fi

# Check node_modules
if [ -d "node_modules" ]; then
    echo ""
    echo "✅ node_modules existe"
    
    if [ -d "node_modules/whatsapp-web.js" ]; then
        echo "✅ whatsapp-web.js instalado"
    else
        echo "❌ whatsapp-web.js não encontrado"
    fi
    
    if [ -d "node_modules/puppeteer" ]; then
        echo "✅ puppeteer instalado"
    else
        echo "⚠️  puppeteer não encontrado (whatsapp-web.js usa sua própria versão)"
    fi
else
    echo ""
    echo "❌ node_modules não existe"
    echo "   Execute: npm install"
fi

# Check auth directory
if [ -d ".wwebjs_auth_v2" ]; then
    echo ""
    echo "✅ Diretório de autenticação existe"
    echo "   Conteúdo:"
    ls -la .wwebjs_auth_v2/ | head -10
else
    echo ""
    echo "⚠️  Diretório de autenticação não existe"
    echo "   Será criado automaticamente no primeiro uso"
fi

echo ""
echo "=============================================="
echo "✅ Verificação concluída"
echo ""
