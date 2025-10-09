@echo off
echo ========================================
echo  VERIFICACAO WHATSAPP - Mania de Mulher
echo ========================================
echo.

set TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
set PORT=3333
set URL=http://localhost:%PORT%

echo 🔍 Verificando configuracoes...
echo.
echo 🆔 Tenant ID: %TENANT_ID%
echo 🔌 Porta: %PORT%
echo 🌐 URL: %URL%
echo.

echo ========================================
echo  PASSO 1: Verificar se Node.js esta instalado
echo ========================================
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js NAO encontrado!
    echo.
    echo 📥 SOLUCAO: Instale o Node.js v18+ de https://nodejs.org
    pause
    exit /b 1
)

node --version
echo ✅ Node.js instalado
echo.

echo ========================================
echo  PASSO 2: Verificar se o servidor esta rodando
echo ========================================
curl -s %URL%/status >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Servidor WhatsApp NAO esta rodando em %URL%
    echo.
    echo 🚀 SOLUCAO: Execute start-empresa1.bat em outra janela
    echo.
    pause
    exit /b 1
)

echo ✅ Servidor esta rodando!
echo.

echo ========================================
echo  PASSO 3: Testar conexao
echo ========================================
curl -s %URL%/status
echo.
echo.

echo ========================================
echo  ✅ TUDO OK!
echo ========================================
echo.
echo 📝 PROXIMOS PASSOS:
echo 1. Acesse: http://localhost:%PORT% para ver o QR Code
echo 2. Escaneie o QR Code com seu WhatsApp
echo 3. Aguarde a mensagem "WhatsApp CONECTADO e PRONTO"
echo 4. Teste no sistema web
echo.

pause
