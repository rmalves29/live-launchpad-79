@echo off
echo ================================================
echo  WhatsApp Server - MANIA DE MULHER
echo ================================================
echo.

set COMPANY_NAME=Mania de Mulher
set TENANT_ID=08f2b1b9-3988-489e-8186-c60f0c0b0622
set PORT=3333
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4

echo 🏢 Empresa: %COMPANY_NAME%
echo 🔌 Porta: %PORT%
echo 🆔 Tenant: %TENANT_ID%
echo.
echo 🚀 Iniciando servidor...
echo 🌐 Acesse: http://localhost:%PORT%
echo.

node server-whatsapp-individual.js

pause
