@echo off
echo ========================================
echo    WhatsApp Server - Windows
echo ========================================
echo.

:: Verificar Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Instale em: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js: 
node --version
echo.

:: Instalar dependencias
echo [INFO] Instalando/verificando dependencias...
call npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0
echo.

:: Criar diretorio de autenticacao
if not exist ".wwebjs_auth_v2" (
    echo [INFO] Criando diretorio de sessoes...
    mkdir .wwebjs_auth_v2
)

:: Configurar variaveis de ambiente
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA
set PORT=3333

echo ========================================
echo [INFO] Configuracao:
echo    - Porta: %PORT%
echo    - Supabase: OK
echo.
echo [INFO] Endpoints:
echo    - Status: http://localhost:%PORT%/status
echo    - Health: http://localhost:%PORT%/health
echo ========================================
echo.

echo [INFO] Iniciando servidor...
echo [DICA] O QR Code vai aparecer aqui no terminal!
echo [DICA] Se travar, pressione CTRL+C e tente:
echo        node server-debug-visual.js
echo.

node server1.js

pause
