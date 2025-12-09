@echo off
echo ========================================
echo    Limpar Sessao WhatsApp (Manual)
echo ========================================
echo.

set /p ADMIN_KEY="Digite sua ADMIN_KEY: "

if "%ADMIN_KEY%"=="" (
    echo [ERRO] ADMIN_KEY nao fornecida
    pause
    exit /b 1
)

echo.
echo [INFO] Enviando requisicao de limpeza...
echo.

curl -X POST http://localhost:3333/admin/wipe-session -H "X-Admin-Key: %ADMIN_KEY%"

echo.
echo.
echo [INFO] Requisicao concluida!
echo [INFO] Reinicie o servidor para reconectar
echo.

pause
