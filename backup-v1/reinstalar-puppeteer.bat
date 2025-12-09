@echo off
echo ========================================
echo    Reinstalar Puppeteer/Chromium
echo ========================================
echo.

echo [INFO] Removendo node_modules...
if exist "node_modules" (
    rmdir /s /q node_modules
    echo [OK] node_modules removido
)

echo.
echo [INFO] Removendo package-lock.json...
if exist "package-lock.json" (
    del package-lock.json
    echo [OK] package-lock.json removido
)

echo.
echo [INFO] Instalando dependencias limpas...
call npm install whatsapp-web.js@1.23.0 express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

echo.
echo [INFO] Baixando Chromium...
cd node_modules\puppeteer
call node install.js
cd ..\..

echo.
echo [OK] Instalacao concluida!
echo [INFO] Agora execute: start-windows.bat
echo.

pause
