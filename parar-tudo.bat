@echo off
echo ========================================
echo    Parar TODOS os Processos Node
echo ========================================
echo.

echo [INFO] Encerrando todos os processos Node.js...
taskkill /F /IM node.exe 2>nul

if %ERRORLEVEL% EQU 0 (
    echo [OK] Processos Node encerrados
) else (
    echo [INFO] Nenhum processo Node encontrado
)

echo.
echo [INFO] Aguardando 2 segundos...
timeout /t 2 /nobreak >nul

echo.
echo [INFO] Limpando sessoes travadas...

if exist ".wwebjs_auth_v2" (
    rmdir /s /q .wwebjs_auth_v2 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Sessao .wwebjs_auth_v2 removida
    ) else (
        echo [AVISO] Nao foi possivel remover .wwebjs_auth_v2
    )
)

if exist ".wwebjs_auth_simple" (
    rmdir /s /q .wwebjs_auth_simple 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Sessao .wwebjs_auth_simple removida
    ) else (
        echo [AVISO] Nao foi possivel remover .wwebjs_auth_simple
    )
)

if exist ".wwebjs_auth_debug" (
    rmdir /s /q .wwebjs_auth_debug 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Sessao .wwebjs_auth_debug removida
    ) else (
        echo [AVISO] Nao foi possivel remover .wwebjs_auth_debug
    )
)

echo.
echo [OK] Limpeza concluida!
echo.
echo [INFO] Agora voce pode iniciar o servidor:
echo        start-windows.bat
echo.

pause
