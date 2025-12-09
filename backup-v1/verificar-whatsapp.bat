@echo off
echo ========================================
echo   DIAGNOSTICO WHATSAPP COMPLETO
echo ========================================
echo.

echo [1/5] Verificando se servidor esta rodando...
curl -s http://localhost:3333/health >nul 2>&1
if errorlevel 1 (
    echo X ERRO: Servidor NAO esta rodando!
    echo.
    echo Para iniciar: start-baileys.bat
    echo.
    pause
    exit /b 1
) else (
    echo OK - Servidor esta rodando
)
echo.

echo [2/5] Verificando status do WhatsApp...
curl -s "http://localhost:3333/status/08f2b1b9-3988-489e-8186-c60f0c0b0622"
echo.
echo.

echo [3/5] Testando envio de mensagem...
curl -X POST "http://localhost:3333/send" ^
  -H "Content-Type: application/json" ^
  -H "x-tenant-id: 08f2b1b9-3988-489e-8186-c60f0c0b0622" ^
  -d "{\"phone\":\"31999999999\",\"message\":\"Teste automatico\"}"
echo.
echo.

echo [4/5] Listando grupos disponiveis...
curl -s "http://localhost:3333/list-all-groups?tenant_id=08f2b1b9-3988-489e-8186-c60f0c0b0622"
echo.
echo.

echo [5/5] Verificando porta 3333...
netstat -an | findstr ":3333" >nul 2>&1
if errorlevel 1 (
    echo X AVISO: Porta 3333 nao esta em uso
) else (
    echo OK - Porta 3333 esta em uso
)
echo.

echo ========================================
echo   DIAGNOSTICO CONCLUIDO
echo ========================================
echo.
echo Se status = "online": WhatsApp esta pronto!
echo Se status = "qr_ready": Escaneie QR em http://localhost:3333/qr/08f2b1b9-3988-489e-8186-c60f0c0b0622
echo Se status = outros: Veja TROUBLESHOOTING_WHATSAPP.md
echo.
pause
