@echo off
echo 🚀 Iniciando Servidor WhatsApp
echo ================================

REM Verificar Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js não encontrado. Instale o Node.js primeiro.
    pause
    exit /b 1
)

REM Instalar dependências se necessário
if not exist "node_modules" (
    echo 📦 Instalando dependências...
    call npm install whatsapp-web.js express cors qrcode-terminal node-fetch
)

REM Criar diretório para sessões
if not exist ".wwebjs_auth_tenants" (
    echo 📁 Criando diretório para sessões...
    mkdir .wwebjs_auth_tenants
)

REM Definir porta
if "%PORT%"=="" set PORT=3333

echo 🌐 Servidor rodará na porta: %PORT%
echo 📊 Status: http://localhost:%PORT%/status
echo.

REM Iniciar servidor
echo 🚀 Iniciando servidor...
node server-whatsapp-simple.js

pause
