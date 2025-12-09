@echo off
echo ========================================
echo   DIAGNOSTICO DE INSTALACAO
echo ========================================
echo.

echo [1/6] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERRO: Node.js NAO encontrado!
    echo    Instale: https://nodejs.org/
    pause
    exit /b 1
) else (
    echo ✅ Node.js:
    node --version
)
echo.

echo [2/6] Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERRO: npm NAO encontrado!
    pause
    exit /b 1
) else (
    echo ✅ npm:
    npm --version
)
echo.

echo [3/6] Verificando pasta node_modules...
if exist "node_modules" (
    echo ✅ Pasta node_modules existe
    echo.
    echo [3.1/6] Verificando whatsapp-web.js...
    if exist "node_modules\whatsapp-web.js" (
        echo ✅ whatsapp-web.js instalado
    ) else (
        echo ❌ whatsapp-web.js NAO instalado
        echo.
        echo INSTALANDO AGORA...
        call npm install whatsapp-web.js@1.23.0
    )
    
    echo.
    echo [3.2/6] Verificando puppeteer...
    if exist "node_modules\puppeteer" (
        echo ✅ puppeteer instalado
    ) else (
        echo ⚠️ puppeteer NAO instalado (sera instalado com whatsapp-web.js)
    )
) else (
    echo ❌ Pasta node_modules NAO existe
    echo.
    echo CRIANDO E INSTALANDO...
    call npm install whatsapp-web.js@1.23.0 express@4.18.2 cors@2.8.5 qrcode-terminal@0.12.0 node-fetch@2.7.0
)
echo.

echo [4/6] Verificando Chrome...
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo ✅ Chrome encontrado: C:\Program Files\Google\Chrome\Application\chrome.exe
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo ✅ Chrome encontrado: C:\Program Files ^(x86^)\Google\Chrome\Application\chrome.exe
) else (
    echo ⚠️ Chrome NAO encontrado - sera usado Chromium do Puppeteer
)
echo.

echo [5/6] Testando importacao do Client...
node -e "const {Client} = require('whatsapp-web.js'); console.log('✅ Client importado:', typeof Client);" 2>nul
if errorlevel 1 (
    echo ❌ ERRO: Nao foi possivel importar Client
    echo    As dependencias ainda nao estao instaladas corretamente
    echo.
    echo TENTANDO REINSTALAR...
    rmdir /s /q node_modules 2>nul
    del package-lock.json 2>nul
    call npm install whatsapp-web.js@1.23.0 express@4.18.2 cors@2.8.5 qrcode-terminal@0.12.0 node-fetch@2.7.0
) else (
    echo ✅ Client importado com sucesso!
)
echo.

echo [6/6] Resultado Final...
echo.
if exist "node_modules\whatsapp-web.js" (
    echo ========================================
    echo   ✅ PRONTO PARA INICIAR!
    echo ========================================
    echo.
    echo Execute: node server1.js
    echo OU: start-windows.bat
    echo.
) else (
    echo ========================================
    echo   ❌ INSTALACAO INCOMPLETA
    echo ========================================
    echo.
    echo Por favor, execute manualmente:
    echo   npm install whatsapp-web.js@1.23.0
    echo.
)

pause
