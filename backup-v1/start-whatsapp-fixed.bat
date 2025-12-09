@echo off
REM Script para iniciar o servidor WhatsApp corrigido no Windows
REM Resolve automaticamente o erro 405 de bloqueio de IP

echo.
echo ================================================
echo  Servidor WhatsApp Multi-Tenant (Versao Corrigida)
echo ================================================
echo.

cd /d "%~dp0\backend"

REM Verificar se o Node.js está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Node.js nao encontrado. Por favor, instale o Node.js primeiro.
    pause
    exit /b 1
)

REM Verificar se as dependências estão instaladas
if not exist "node_modules\" (
    echo Instalando dependencias...
    call npm install
    echo.
)

REM Verificar se o PM2 está instalado
where pm2 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo PM2 detectado. Usando PM2 para gerenciamento...
    echo.
    
    REM Parar processos anteriores
    pm2 delete whatsapp-api 2>nul
    
    REM Iniciar com PM2
    pm2 start server-whatsapp-fixed.js --name whatsapp-api
    
    echo.
    echo Servidor iniciado com PM2!
    echo.
    echo Comandos uteis:
    echo    pm2 logs whatsapp-api        - Ver logs em tempo real
    echo    pm2 status                   - Ver status do servidor
    echo    pm2 restart whatsapp-api     - Reiniciar servidor
    echo    pm2 stop whatsapp-api        - Parar servidor
    echo.
    
    REM Mostrar logs
    pm2 logs whatsapp-api --lines 20
) else (
    echo PM2 nao encontrado. Rodando diretamente...
    echo (Recomendamos instalar PM2: npm install -g pm2)
    echo.
    
    REM Rodar diretamente
    node server-whatsapp-fixed.js
)

pause
