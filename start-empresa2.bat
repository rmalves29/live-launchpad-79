@echo off
echo ================================================
echo  WhatsApp Server - EMPRESA 2
echo ================================================
echo.

set COMPANY_NAME=Empresa 2
set TENANT_ID=seu-tenant-uuid-empresa-2-aqui
set PORT=3334
set SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dGJzaWVvZGJ0emdjdnZrZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyMTkzMDMsImV4cCI6MjA3MDc5NTMwM30.iUYXhv6t2amvUSFsQQZm_jU-ofWD5BGNkj1X0XgCpn4

echo 🏢 Empresa: %COMPANY_NAME%
echo 🔌 Porta: %PORT%
echo 🆔 Tenant: %TENANT_ID%
echo.
echo ⚠️  IMPORTANTE: Configure o TENANT_ID correto neste arquivo!
echo.
echo 🚀 Iniciando servidor...
echo 🌐 Acesse: http://localhost:%PORT%
echo.

node server-whatsapp-individual.js

pause
