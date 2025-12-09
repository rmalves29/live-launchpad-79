@echo off
echo ========================================
echo   FORCAR NOVO QR CODE
echo ========================================
echo.

echo [1/3] Parando Node.js...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM chrome.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Removendo todas as sessoes...
if exist ".wwebjs_auth" (
    echo Removendo .wwebjs_auth...
    rmdir /s /q .wwebjs_auth
)

if exist ".wwebjs_cache" (
    echo Removendo .wwebjs_cache...
    rmdir /s /q .wwebjs_cache
)

if exist "node_modules\.cache" (
    echo Removendo cache...
    rmdir /s /q node_modules\.cache
)

echo.
echo [3/3] Iniciando servidor com navegador visivel...
echo.
echo ========================================
echo   AGUARDE O QR CODE APARECER
echo ========================================
echo.

set SHOW_BROWSER=true
node server1.js

pause
