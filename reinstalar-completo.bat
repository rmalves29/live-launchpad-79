@echo off
echo ================================================
echo  REINSTALACAO COMPLETA - WhatsApp Server
echo ================================================
echo.

echo [1/6] Parando processos Node.js...
taskkill /F /IM node.exe 2>nul
timeout /t 2 >nul

echo [2/6] Deletando sessoes antigas...
if exist .wwebjs_auth_clean (
    rmdir /s /q .wwebjs_auth_clean
    echo    ✓ Sessoes deletadas
)

echo [3/6] Limpando cache...
if exist node_modules\.cache (
    rmdir /s /q node_modules\.cache
    echo    ✓ Cache limpo
)

echo [4/6] Limpando NPM cache...
call npm cache clean --force
echo    ✓ NPM cache limpo

echo [5/6] Desinstalando pacotes antigos...
call npm uninstall whatsapp-web.js puppeteer qrcode-terminal
echo    ✓ Pacotes desinstalados

echo [6/6] Instalando versoes estaveis...
call npm install whatsapp-web.js@1.23.0
call npm install puppeteer@21.0.0
call npm install qrcode-terminal@latest
echo    ✓ Pacotes instalados

echo.
echo ================================================
echo  ✅ REINSTALACAO COMPLETA!
echo ================================================
echo.
echo Proximos passos:
echo 1. Feche este terminal
echo 2. Execute: start-clean.bat
echo 3. Aguarde o QR Code aparecer
echo.

pause
