@echo off
echo ================================================
echo   WhatsApp Server - MANIA DE MULHER
echo ================================================
echo.
echo Iniciando servidor ESTAVEL...
echo Porta: 3334
echo URL: http://localhost:3334
echo.
echo Recursos:
echo   * Fila de mensagens
echo   * Auto-retry (3x)
echo   * Protecao rate limiting
echo   * Reconexao automatica
echo.
node server-whatsapp-mania-mulher.js
pause
