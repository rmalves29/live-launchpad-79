@echo off
echo ========================================
echo   LIMPANDO CACHE DO WHATSAPP WEB
echo ========================================
echo.

echo [1/3] Parando processos Node.js...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Removendo cache do WhatsApp...
if exist ".wwebjs_auth" (
    echo Removendo .wwebjs_auth...
    rmdir /s /q .wwebjs_auth
)

if exist ".wwebjs_cache" (
    echo Removendo .wwebjs_cache...
    rmdir /s /q .wwebjs_cache
)

if exist "node_modules\.cache" (
    echo Removendo cache do node_modules...
    rmdir /s /q node_modules\.cache
)

echo.
echo [3/3] Reinstalando whatsapp-web.js...
call npm uninstall whatsapp-web.js
call npm install whatsapp-web.js@1.23.0 --force

echo.
echo ========================================
echo   CACHE LIMPO COM SUCESSO!
echo ========================================
echo.
echo Agora execute: node server1.js
echo.
pause
