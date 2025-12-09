@echo off
echo ========================================
echo   LIMPEZA DE SESSOES BAILEYS
echo ========================================
echo.

echo [1/3] Parando processos Node.js...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo Nenhum processo Node.js rodando
) else (
    echo OK - Processos Node.js parados
)
echo.

echo [2/3] Removendo sessoes antigas...
if exist ".wwebjs_auth" (
    rmdir /s /q .wwebjs_auth
    echo OK - Sessoes whatsapp-web.js removidas
)

if exist ".wwebjs_cache" (
    rmdir /s /q .wwebjs_cache
    echo OK - Cache whatsapp-web.js removido
)

if exist ".baileys_auth" (
    rmdir /s /q .baileys_auth
    echo OK - Sessoes Baileys removidas
)
echo.

echo [3/3] Recriando diretorios...
mkdir .baileys_auth >nul 2>&1
echo OK - Diretorio Baileys criado
echo.

echo ========================================
echo   LIMPEZA CONCLUIDA!
echo ========================================
echo.
echo Agora execute: start-baileys.bat
echo.
pause
