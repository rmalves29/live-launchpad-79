@echo off
echo ====================================
echo   WhatsApp Multi-Tenant Server
echo ====================================
echo.

REM Configurar variável de ambiente
set SUPABASE_SERVICE_ROLE_KEY=COLE_SUA_SERVICE_ROLE_KEY_AQUI

REM Iniciar servidor
echo Iniciando servidor na porta 3333...
node server1.js

pause
