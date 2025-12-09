@echo off
echo ========================================
echo   INSTALACAO DO SERVIDOR WHATSAPP
echo ========================================
echo.

echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado!
    echo Por favor, instale Node.js de https://nodejs.org/
    pause
    exit /b 1
)
echo ✓ Node.js encontrado
echo.

echo [2/4] Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: npm nao encontrado!
    pause
    exit /b 1
)
echo ✓ npm encontrado
echo.

echo [3/4] Instalando dependencias...
echo Isso pode levar alguns minutos...
npm install whatsapp-web.js@1.23.0 express@4.18.2 cors@2.8.5 qrcode-terminal@0.12.0 node-fetch@2.7.0
if errorlevel 1 (
    echo.
    echo ERRO: Falha ao instalar dependencias!
    echo Tente executar manualmente:
    echo   npm install whatsapp-web.js express cors qrcode-terminal node-fetch@2
    pause
    exit /b 1
)
echo ✓ Dependencias instaladas com sucesso!
echo.

echo [4/4] Iniciando servidor...
echo.
echo ========================================
echo   SERVIDOR WHATSAPP INICIANDO
echo ========================================
echo.
echo Aguarde o QR Code aparecer e escaneie com o WhatsApp!
echo.
echo Para parar o servidor: Ctrl+C
echo.

node server1.js

pause
