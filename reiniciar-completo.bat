@echo off
echo ========================================
echo   REINICIAR COMPLETO - LIMPAR TUDO
echo ========================================
echo.

echo [1/5] Parando todos os processos...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM chromedriver.exe >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/5] Removendo sessoes antigas...
if exist ".wwebjs_auth" (
    echo Removendo .wwebjs_auth...
    rmdir /s /q .wwebjs_auth
)

if exist ".wwebjs_cache" (
    echo Removendo .wwebjs_cache...
    rmdir /s /q .wwebjs_cache
)

echo [3/5] Removendo cache do Puppeteer...
if exist "node_modules\.cache" (
    echo Removendo node_modules\.cache...
    rmdir /s /q node_modules\.cache
)

if exist "%LOCALAPPDATA%\Puppeteer" (
    echo Removendo cache do Puppeteer...
    rmdir /s /q "%LOCALAPPDATA%\Puppeteer"
)

echo [4/5] Aguardando sistema liberar recursos...
timeout /t 3 /nobreak >nul

echo.
echo [5/5] Iniciando servidor com navegador visivel...
echo.
echo ========================================
echo   AGUARDE O QR CODE APARECER
echo   Pode levar ate 60 segundos!
echo ========================================
echo.

set SHOW_BROWSER=true
node server1.js

pause
