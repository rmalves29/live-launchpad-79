@echo off
echo ================================================
echo  WhatsApp Server - Inicio Rapido
echo ================================================
echo.

echo 📦 Instalando dependencias...
call npm install whatsapp-web.js@latest express@latest cors@latest qrcode-terminal@latest node-fetch@2.7.0

echo.
echo 🚀 Iniciando servidor...
echo.

node server1.js

pause
