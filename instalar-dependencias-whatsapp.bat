@echo off
echo ================================================
echo  Instalando Dependencias WhatsApp Server
echo ================================================
echo.

echo 📦 Instalando dependencias necessarias...
call npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

echo.
echo ✅ Instalacao completa!
echo.
echo Agora execute: node server1.js
echo.
pause
