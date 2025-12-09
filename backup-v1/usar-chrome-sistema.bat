@echo off
echo ================================================
echo  Configurar WhatsApp com Chrome do Sistema
echo ================================================
echo.

echo [1/3] Desinstalando puppeteer...
call npm uninstall puppeteer

echo.
echo [2/3] Instalando puppeteer-core...
call npm install puppeteer-core@latest

echo.
echo [3/3] Instalando demais dependencias...
call npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

echo.
echo ================================================
echo  ✅ Configuracao concluida!
echo ================================================
echo.
echo Chrome configurado em:
echo C:\Program Files\Google\Chrome\Application\chrome.exe
echo.
echo Agora execute: start-clean.bat
echo.

pause
