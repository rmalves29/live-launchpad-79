@echo off
echo ================================================
echo  WhatsApp Server - MODO DEBUG
echo ================================================
echo.

REM Definir variáveis de ambiente
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTIxOTMwMywiZXhwIjoyMDcwNzk1MzAzfQ.LJLhwm4I_k_iR4NSpF1aLGx3H0AFnz8V6T_HEtqcnFA
set PORT=3333

REM Ativar modo debug completo
set DEBUG=whatsapp-web.js:*,puppeteer:*

echo ⚠️ MODO DEBUG ATIVADO
echo 📊 Logs detalhados serão exibidos
echo.
echo Iniciando servidor WhatsApp...
echo.

node server-multitenant-clean.js

pause
