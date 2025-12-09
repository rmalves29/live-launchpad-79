@echo off
echo ========================================
echo    Limpar Sessoes WhatsApp
echo ========================================
echo.

echo [INFO] Removendo sessoes antigas...

if exist ".wwebjs_auth_v2" (
    rmdir /s /q .wwebjs_auth_v2
    echo [OK] Sessoes removidas: .wwebjs_auth_v2
) else (
    echo [INFO] Nenhuma sessao encontrada
)

if exist ".wwebjs_auth_debug" (
    rmdir /s /q .wwebjs_auth_debug
    echo [OK] Sessoes de debug removidas
)

echo.
echo [OK] Limpeza concluida!
echo [INFO] Execute: start-windows.bat
echo.

pause
