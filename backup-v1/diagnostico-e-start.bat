@echo off
echo ========================================
echo   DIAGNOSTICO E INICIO DO SERVIDOR
echo ========================================
echo.

echo [1/7] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao encontrado!
    echo Instale em: https://nodejs.org/
    pause
    exit /b 1
)
node --version
echo.

echo [2/7] Parando processos anteriores...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul
echo [OK] Processos parados
echo.

echo [3/7] Limpando sessoes antigas...
if exist ".wwebjs_auth" (
    rmdir /s /q .wwebjs_auth 2>nul
    echo [OK] Sessoes removidas
)
if exist ".wwebjs_cache" (
    rmdir /s /q .wwebjs_cache 2>nul
)
if exist "node_modules\.cache" (
    rmdir /s /q node_modules\.cache 2>nul
)
echo.

echo [4/7] Verificando dependencias principais...
echo Verificando whatsapp-web.js...
node -e "try { require('whatsapp-web.js'); console.log('[OK] whatsapp-web.js'); } catch(e) { console.log('[FALTANDO] whatsapp-web.js'); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Instalando whatsapp-web.js...
    call npm install whatsapp-web.js@latest --no-save
)

echo Verificando express...
node -e "try { require('express'); console.log('[OK] express'); } catch(e) { console.log('[FALTANDO] express'); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Instalando express...
    call npm install express@latest --no-save
)

echo Verificando qrcode-terminal...
node -e "try { require('qrcode-terminal'); console.log('[OK] qrcode-terminal'); } catch(e) { console.log('[FALTANDO] qrcode-terminal'); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Instalando qrcode-terminal...
    call npm install qrcode-terminal@latest --no-save
)

echo Verificando qrcode...
node -e "try { require('qrcode'); console.log('[OK] qrcode'); } catch(e) { console.log('[FALTANDO] qrcode'); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Instalando qrcode...
    call npm install qrcode@latest --no-save
)

echo Verificando cors...
node -e "try { require('cors'); console.log('[OK] cors'); } catch(e) { console.log('[FALTANDO] cors'); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Instalando cors...
    call npm install cors@latest --no-save
)

echo Verificando node-fetch...
node -e "try { require('node-fetch'); console.log('[OK] node-fetch'); } catch(e) { console.log('[FALTANDO] node-fetch'); process.exit(1); }"
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Instalando node-fetch...
    call npm install node-fetch@2.7.0 --no-save
)
echo.

echo [5/7] Verificando Chrome...
set CHROME_FOUND=0
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome encontrado
    set CHROME_FOUND=1
)
if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo [OK] Chrome encontrado
    set CHROME_FOUND=1
)
if %CHROME_FOUND% EQU 0 (
    echo [AVISO] Chrome nao encontrado! O Puppeteer usara Chromium
)
echo.

echo [6/7] Verificando arquivo server1.js...
if not exist "server1.js" (
    echo [ERRO] Arquivo server1.js nao encontrado!
    pause
    exit /b 1
)
echo [OK] server1.js encontrado
echo.

echo [7/7] Configurando variaveis de ambiente...
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA
set PORT=3333
set SHOW_BROWSER=true
echo [OK] Variaveis configuradas
echo.

echo ========================================
echo   INICIANDO SERVIDOR WHATSAPP
echo ========================================
echo.
echo [INFO] Porta: %PORT%
echo [INFO] Navegador: Visivel (Chrome)
echo [INFO] QR Code: Aparecera no terminal e no navegador
echo.
echo [IMPORTANTE] Aguarde ate 60 segundos
echo [IMPORTANTE] Para parar: Ctrl+C
echo.
echo ========================================
echo.

node server1.js

pause
