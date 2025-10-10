@echo off
echo =========================================
echo    LIMPEZA DE LOCKFILES DO WHATSAPP
echo =========================================
echo.

echo Removendo lockfiles antigos...
for /r ".wwebjs_auth" %%f in (*lockfile* *.lock) do (
    echo Removendo: %%f
    del /f /q "%%f" 2>nul
)

echo.
echo ✅ Limpeza concluída!
echo.
echo Agora você pode executar: node server1.js
echo.
pause
